import { Request, Response } from "express";
import mongoose from "mongoose";
import axios from "axios";
import { asyncHandler } from "../../../utils/asyncHandler";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Delivery from "../../../models/Delivery";
import DeliveryAssignment from "../../../models/DeliveryAssignment";
import Return from "../../../models/Return";
import { notifySellersOfOrderUpdate } from "../../../services/sellerNotificationService";
import Product from "../../../models/Product";
import Customer from "../../../models/Customer";
import { Server as SocketIOServer } from "socket.io";
import StockLedger from "../../../models/StockLedger";
import OrderHistory from "../../../models/OrderHistory";
import CreditTransaction from "../../../models/CreditTransaction";
import Notification from "../../../models/Notification";
import {
  decrementVariantStock,
  getVariantStock,
  incrementVariantStock,
} from "../../product/variantStockService";
import {
  findVariantById,
  resolveLedgerSku,
  resolveOrderItemVariantId,
  variantsFromProductDoc,
} from "../../product/variantHelpers";
import {
  buildPhonePeMerchantTransactionId,
  initiatePhonePePayment,
  isPhonePeConfigured,
} from "../../../services/phonepeService";
import { completePosOnlinePayment } from "../../pos/completePosOnlinePayment";
import { sendPushNotification } from "../../../services/firebaseAdmin";
import { computeCharges, resolveSalesPerson, resolvePaymentStatus } from "./orderChargesUtils";

/**
 * Shared $addFields stage for order-item profit/MRP computation used by
 * getOnlineOrders/getPOSOrders. Mirrors the purchasePrice variant-matching
 * logic in adminInventoryController.getSalesSummaryReport so profit figures
 * stay consistent across reports.
 */
const buildItemProfitAddFields = () => ({
  "items.purchasePrice": {
    $let: {
      vars: { product: { $arrayElemAt: ["$productInfo", 0] } },
      in: {
        $let: {
          vars: {
            matchedVariant: {
              $first: {
                $filter: {
                  input: { $ifNull: ["$$product.variations", []] },
                  as: "v",
                  cond: { $eq: ["$$v._id", "$items.variantId"] },
                },
              },
            },
          },
          in: {
            $ifNull: [
              "$$matchedVariant.purchasePrice",
              {
                $ifNull: [
                  { $arrayElemAt: ["$$product.variations.purchasePrice", 0] },
                  { $ifNull: ["$$product.purchasePrice", 0] },
                ],
              },
            ],
          },
        },
      },
    },
  },
  "items.mrp": {
    $ifNull: [{ $arrayElemAt: ["$productInfo.compareAtPrice", 0] }, "$items.unitPrice"],
  },
});

/**
 * Get all orders with filters
 */
export const getAllOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      seller,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const query: any = {};

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) query.orderDate.$lte = new Date(dateTo as string);
    }
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search as string, $options: "i" } },
        { customerName: { $regex: search as string, $options: "i" } },
        { customerEmail: { $regex: search as string, $options: "i" } },
        { customerPhone: { $regex: search as string, $options: "i" } },
      ];
    }

    // If seller filter, need to check order items
    if (seller) {
      const orderItems = await OrderItem.find({ seller }).distinct("order");
      query._id = { $in: orderItems };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customer", "name email phone")
        .populate("deliveryBoy", "name mobile")
        .populate("items")
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Get online orders only (excluding POS) with filters for reports
 */
export const getOnlineOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      paymentMethod,
      dateFrom,
      dateTo,
      search,
      deliveryBoyId,
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const skip = (pageNum - 1) * limitNum;

    const matchStage: any = {
      $and: [
        { adminNotes: { $not: { $regex: "pos", $options: "i" } } },
        { "deliveryAddress.address": { $ne: "POS Order" } }
      ]
    };

    if (status && status !== "All Status") matchStage.status = status;
    if (paymentStatus) matchStage.paymentStatus = paymentStatus;
    if (paymentMethod) matchStage.paymentMethod = paymentMethod;

    if (dateFrom || dateTo) {
      matchStage.orderDate = {};
      if (dateFrom) matchStage.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) matchStage.orderDate.$lte = new Date(dateTo as string);
    }

    if (deliveryBoyId && mongoose.Types.ObjectId.isValid(deliveryBoyId as string)) {
      matchStage.deliveryBoy = new mongoose.Types.ObjectId(deliveryBoyId as string);
    }

    if (search) {
      const searchRegex = { $regex: search as string, $options: "i" };
      matchStage.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerEmail: searchRegex },
        { customerPhone: searchRegex },
        { paymentMethod: searchRegex },
        { paymentStatus: searchRegex }
      ];
    }

    const pipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order",
          as: "items"
        }
      },
      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $addFields: buildItemProfitAddFields() },
      {
        $group: {
          _id: "$_id",
          orderNumber: { $first: "$orderNumber" },
          orderDate: { $first: "$orderDate" },
          customer: { $first: "$customer" },
          customerName: { $first: "$customerName" },
          customerEmail: { $first: "$customerEmail" },
          customerPhone: { $first: "$customerPhone" },
          deliveryAddress: { $first: "$deliveryAddress" },
          total: { $first: "$total" },
          paymentMethod: { $first: "$paymentMethod" },
          paymentStatus: { $first: "$paymentStatus" },
          status: { $first: "$status" },
          deliveryBoy: { $first: "$deliveryBoy" },
          deliveryBoyStatus: { $first: "$deliveryBoyStatus" },
          adminNotes: { $first: "$adminNotes" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          totalMRP: { $sum: { $multiply: [{ $ifNull: ["$items.mrp", 0] }, { $ifNull: ["$items.quantity", 0] }] } },
          totalSP: { $sum: { $multiply: [{ $ifNull: ["$items.unitPrice", 0] }, { $ifNull: ["$items.quantity", 0] }] } },
          totalPurchase: { $sum: { $multiply: [{ $ifNull: ["$items.purchasePrice", 0] }, { $ifNull: ["$items.quantity", 0] }] } },
        }
      },
      { $addFields: { profit: { $subtract: ["$totalSP", "$totalPurchase"] } } },
      { $sort: { orderDate: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }],
        }
      }
    ];

    const results = await Order.aggregate(pipeline);
    const orders = results[0]?.data || [];
    const total = results[0]?.totalCount?.[0]?.count || 0;

    return res.status(200).json({
      success: true,
      message: "Online orders fetched successfully",
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);

/**
 * Get POS orders only with filters for reports
 */
export const getPOSOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      status,
      paymentMethod,
      dateFrom,
      dateTo,
      search,
      deliveryBoyId,
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const skip = (pageNum - 1) * limitNum;

    const matchStage: any = {
      $and: [
        {
          $or: [
            { adminNotes: { $regex: "pos", $options: "i" } },
            { "deliveryAddress.address": "POS Order" }
          ]
        },
        {
          adminNotes: { $not: { $regex: "POS Order - Seller:", $options: "i" } }
        }
      ]
    };

    if (status) matchStage.status = status;
    if (paymentMethod && paymentMethod !== "All Methods") matchStage.paymentMethod = paymentMethod;

    if (dateFrom || dateTo) {
      matchStage.orderDate = {};
      if (dateFrom) matchStage.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) matchStage.orderDate.$lte = new Date(dateTo as string);
    }

    if (deliveryBoyId && mongoose.Types.ObjectId.isValid(deliveryBoyId as string)) {
      matchStage.deliveryBoy = new mongoose.Types.ObjectId(deliveryBoyId as string);
    }

    if (search) {
      const searchRegex = { $regex: search as string, $options: "i" };
      matchStage.$and.push({
        $or: [
          { orderNumber: searchRegex },
          { customerName: searchRegex },
          { customerEmail: searchRegex },
          { customerPhone: searchRegex },
          { paymentMethod: searchRegex }
        ]
      });
    }

    // Sort + paginate on the bare Order collection first (backed by the
    // orderDate index) so the aggregation only has to hold `limitNum` docs
    // in memory. The old pipeline sorted *after* joining every matched
    // order to its items and grouping back down - with $sort sitting behind
    // a $facet, Mongo couldn't apply its top-k sort optimization and had to
    // sort the entire matched set in memory, which blew past the 32MB limit
    // on datasets with many POS orders (and Atlas M0 doesn't support
    // allowDiskUse to fall back to an external sort).
    const pipeline: any[] = [
      { $match: matchStage },
      {
        $facet: {
          data: [
            { $sort: { orderDate: -1 } },
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: "orderitems",
                localField: "_id",
                foreignField: "order",
                as: "items"
              }
            },
            { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "products",
                localField: "items.product",
                foreignField: "_id",
                as: "productInfo"
              }
            },
            { $addFields: buildItemProfitAddFields() },
            {
              $group: {
                _id: "$_id",
                orderNumber: { $first: "$orderNumber" },
                orderDate: { $first: "$orderDate" },
                customer: { $first: "$customer" },
                customerName: { $first: "$customerName" },
                customerEmail: { $first: "$customerEmail" },
                customerPhone: { $first: "$customerPhone" },
                deliveryAddress: { $first: "$deliveryAddress" },
                total: { $first: "$total" },
                paymentMethod: { $first: "$paymentMethod" },
                paymentStatus: { $first: "$paymentStatus" },
                status: { $first: "$status" },
                deliveryBoy: { $first: "$deliveryBoy" },
                deliveryBoyStatus: { $first: "$deliveryBoyStatus" },
                adminNotes: { $first: "$adminNotes" },
                createdAt: { $first: "$createdAt" },
                updatedAt: { $first: "$updatedAt" },
                totalMRP: { $sum: { $multiply: [{ $ifNull: ["$items.mrp", 0] }, { $ifNull: ["$items.quantity", 0] }] } },
                totalSP: { $sum: { $multiply: [{ $ifNull: ["$items.unitPrice", 0] }, { $ifNull: ["$items.quantity", 0] }] } },
                totalPurchase: { $sum: { $multiply: [{ $ifNull: ["$items.purchasePrice", 0] }, { $ifNull: ["$items.quantity", 0] }] } },
              }
            },
            { $addFields: { profit: { $subtract: ["$totalSP", "$totalPurchase"] } } },
            { $sort: { orderDate: -1 } },
          ],
          totalCount: [{ $count: "count" }],
        }
      }
    ];

    const results = await Order.aggregate(pipeline);
    const orders = results[0]?.data || [];
    const total = results[0]?.totalCount?.[0]?.count || 0;

    return res.status(200).json({
      success: true,
      message: "POS orders fetched successfully",
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);

/**
 * Get order by ID
 */
export const getOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate({
        path: "items",
        populate: [
          {
            path: "product",
            select: "productName mainImage price compareAtPrice wholesalePrice purchasePrice variations",
          },
          {
            path: "seller",
            select: "sellerName storeName",
          },
        ],
      })
      .populate("cancelledBy", "firstName lastName");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Attach per-item MRP/purchasePrice/profit and a bill-level summary so
    // the admin bill-detail view can show margins without a second query.
    const orderObj: any = order.toObject();
    let billTotalMRP = 0;
    let billTotalPurchase = 0;
    let billTotalSP = 0;

    orderObj.items = (orderObj.items || []).map((item: any) => {
      const product = item.product;
      const variations = product?.variations || [];
      const matchedVariant = variations.find(
        (v: any) => String(v._id) === String(item.variantId)
      );
      const purchasePrice =
        matchedVariant?.purchasePrice ??
        variations[0]?.purchasePrice ??
        product?.purchasePrice ??
        0;
      const mrp =
        item.mrp ||
        matchedVariant?.compareAtPrice ||
        product?.compareAtPrice ||
        item.unitPrice ||
        0;
      const quantity = item.quantity || 0;
      const lineSP = (item.unitPrice || 0) * quantity;
      const linePurchase = purchasePrice * quantity;
      const lineMRP = mrp * quantity;
      const lineProfit = lineSP - linePurchase;

      if (!item.isFreeGift) {
        billTotalMRP += lineMRP;
        billTotalPurchase += linePurchase;
        billTotalSP += lineSP;
      }

      return { ...item, purchasePrice, mrp, lineProfit };
    });

    orderObj.billSummary = {
      totalMRP: billTotalMRP,
      totalPurchase: billTotalPurchase,
      totalSP: billTotalSP,
      profit: billTotalSP - billTotalPurchase,
    };

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: orderObj,
    });
  }
);

/**
 * Update order status
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, adminNotes, reason } = req.body;

    const validStatuses = [
      "Received",
      "Pending",
      "Processed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Rejected",
      "Returned",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Once an order has reached a terminal state, it cannot be silently
    // moved to a different status from here (e.g. rejecting an order that
    // has already been delivered/cancelled).
    const TERMINAL_STATUSES = ["Delivered", "Cancelled", "Rejected", "Returned"];
    if (
      TERMINAL_STATUSES.includes(existingOrder.status) &&
      existingOrder.status !== status
    ) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be updated because it is already ${existingOrder.status}`,
      });
    }

    const isRejectingOrCancelling = status === "Rejected" || status === "Cancelled";
    if (isRejectingOrCancelling && !reason) {
      return res.status(400).json({
        success: false,
        message: `A reason is required to ${status === "Rejected" ? "reject" : "cancel"} an order`,
      });
    }

    const updateData: any = { status };
    if (adminNotes) updateData.adminNotes = adminNotes;

    if (status === "Delivered") {
      updateData.deliveredAt = new Date();
      updateData.deliveryWorkflowStage = "Delivered";
    }

    if (isRejectingOrCancelling) {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = req.user?.userId;
      updateData.cancellationReason = reason;
      updateData.deliveryWorkflowStage = "Cancelled";

      // Restore stock for every item on the order - it was decremented at
      // checkout and would otherwise be permanently locked out of inventory.
      const orderItems = await OrderItem.find({ order: existingOrder._id });
      for (const item of orderItems) {
        if (!item.product) continue;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        const productId = String(item.product);
        const product = await Product.findById(productId).lean();
        if (!product) continue;

        const variantId = resolveOrderItemVariantId(product, {
          variantId: (item as any).variantId,
          sku: item.sku,
          variation: item.variation,
          productName: item.productName,
          unitPrice: item.unitPrice,
        });
        if (!variantId) {
          console.warn(`Order ${status.toLowerCase()} restock skip: no variant for product ${productId}`);
          continue;
        }

        const prevStock = await getVariantStock(productId, variantId);
        const restored = await incrementVariantStock(productId, variantId, qty);
        if (restored) {
          await StockLedger.create({
            product: item.product,
            variationId: variantId,
            sku: resolveLedgerSku(item.sku),
            quantity: qty,
            type: "IN",
            source: status === "Rejected" ? "ORDER_REJECTED" : "ORDER_CANCELLED",
            referenceId: existingOrder._id,
            previousStock: prevStock,
            newStock: prevStock + qty,
            admin: req.user?.userId,
          });
        }
      }
    }

    const order = await Order.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .populate("items");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Trigger notification if status is "Processed" (Confirmed) or if paymentStatus changed to "Paid"
    if (status === "Processed" || order.paymentStatus === "Paid") {
      const io: SocketIOServer = req.app.get("io");
      if (io) {
        notifySellersOfOrderUpdate(io, order, "STATUS_UPDATE");
      }
    }

    // Notify the customer directly on the two events they actually care
    // about - their order being accepted, or rejected/cancelled - since
    // this endpoint previously left them with no signal beyond manually
    // refreshing their order page.
    let paidOrderNeedsManualRefund = false;
    let customerTitle: string | undefined;
    let customerBody: string | undefined;
    if (isRejectingOrCancelling) {
      paidOrderNeedsManualRefund = order.paymentStatus === "Paid";
      customerTitle = status === "Rejected" ? "Order rejected" : "Order cancelled";
      customerBody = `Your order #${order.orderNumber} was ${status.toLowerCase()}: ${reason}`;
    } else if (status === "Processed") {
      customerTitle = "Order accepted";
      customerBody = `Your order #${order.orderNumber} has been accepted and is being prepared.`;
    }

    if (customerTitle && customerBody) {
      try {
        const customerDoc = await Customer.findById(order.customer)
          .select("fcmToken fcmTokenMobile")
          .lean();
        const tokens = [
          (customerDoc as any)?.fcmTokenMobile,
          (customerDoc as any)?.fcmToken,
        ].filter(Boolean) as string[];

        if (tokens.length) {
          await sendPushNotification(tokens, {
            title: customerTitle,
            body: customerBody,
            data: { orderId: String(order._id), type: "OrderStatus" },
          });
        }

        await Notification.create({
          recipientType: "Customer",
          recipientId: order.customer,
          type: "Order",
          title: customerTitle,
          message: customerBody,
          link: `/orders/${order._id}`,
          priority: "High",
        });
      } catch (err) {
        console.error(`Failed to notify customer of order status "${status}":`, err);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
      ...(paidOrderNeedsManualRefund
        ? { warning: "This order was paid online - process a manual refund for the customer." }
        : {}),
    });
  }
);

/**
 * Update order items (Edit Order)
 */
export const updateOrderItems = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { items: newItemsData, returns: returnsData } = req.body; // items: Array of { productId, variationId?, quantity, unitPrice?, mrp?, productName?, productImage? }
    // returns: Array of { orderItemId, quantity } - how many units of an existing
    // line item are being returned as part of this edit (walk-in bill returns).
    const returnEntries: Array<{ orderItemId?: string; quantity: number }> = Array.isArray(returnsData)
      ? returnsData
          .map((r: any) => ({
            orderItemId: typeof r?.orderItemId === "string" ? r.orderItemId : undefined,
            quantity: Number(r?.quantity) || 0,
          }))
          .filter((r: any) => r.orderItemId && r.quantity > 0)
      : [];
    const returnQtyByOrderItemId = new Map<string, number>();
    for (const r of returnEntries) {
      const key = r.orderItemId as string;
      returnQtyByOrderItemId.set(key, (returnQtyByOrderItemId.get(key) || 0) + r.quantity);
    }

    if (!newItemsData || !Array.isArray(newItemsData) || newItemsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items are required and must be an array",
      });
    }

    const order = await Order.findById(id).populate("items");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Do not allow editing if already cancelled or returned, but ALLOW Delivered
    // We explicitly allow Delivered to fix mistakes on completed bills.
    const restrictedStatuses = ["Cancelled", "Returned"];
    if (restrictedStatuses.includes(order.status)) {
       return res.status(400).json({
           success: false,
           message: `Cannot edit order when status is ${order.status}`
       });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const userId = req.user?.userId;
      const userType = req.user?.userType;

      // Permission Check for Sellers
      if (userType === 'Seller') {
        const isTheirPOSOrder = order.adminNotes?.includes(`POS Order - Seller: ${userId}`);
        // Check if seller owns any items in the order (for online orders if we ever allow editing them)
        const sellerItems = await OrderItem.find({ order: order._id, seller: userId });
        
        if (!isTheirPOSOrder && (!sellerItems || sellerItems.length === 0)) {
           return res.status(403).json({
               success: false,
               message: "Access denied. You can only edit your own POS orders."
           });
        }
      }

      const stockModifierField = userType === 'Admin' ? 'admin' : 'seller';

      // 1. Restore stock for existing items
      const existingItems = await OrderItem.find({ order: order._id }).session(session);

      // Snapshot for bill history (captured before anything is mutated) and
      // a lookup so returned quantity can be carried forward onto whichever
      // new item replaces a kept portion of the same product/variant.
      const itemsBeforeSnapshot = existingItems.map((item) => ({
        product: item.product,
        productName: item.productName,
        sku: item.sku,
        variation: item.variation,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || 0,
      }));
      const totalsBefore = {
        subtotal: Number(order.subtotal) || 0,
        tax: Number(order.tax) || 0,
        total: Number(order.total) || 0,
      };
      const returnedQtyByProductVariant = new Map<string, number>();
      // Old items whose (non-returned) quantity would otherwise be blindly
      // restored to stock. Matched against the new item list below so a
      // product/variant that's still on the bill at the same quantity never
      // gets a restore+deduct pair written to the ledger - only a genuine
      // net change (quantity delta, removal, or swap) produces an entry.
      const pendingRestoreByKey = new Map<
        string,
        { productId: string; variantId: string; sku?: string; qty: number }
      >();
      const historyReturnLines: Array<{
        product?: mongoose.Types.ObjectId;
        productName: string;
        sku?: string;
        variation?: string;
        quantity: number;
        restocked: boolean;
      }> = [];

      for (const item of existingItems) {
        if (!item.product) continue;

        const productId = String(item.product);
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        const product = await Product.findById(productId).lean().session(session);
        if (!product) continue;

        const variantId = resolveOrderItemVariantId(product, {
          variantId: (item as any).variantId,
          sku: item.sku,
          variation: item.variation,
          productName: item.productName,
          unitPrice: item.unitPrice,
        });

        if (!variantId) {
          console.warn(`Order edit restore skip: no variant for product ${productId}`);
          continue;
        }

        // How much of this line's quantity is being returned in this edit
        // (as opposed to simply corrected/removed for other reasons).
        const returnQtyForItem = Math.min(
          returnQtyByOrderItemId.get(String(item._id)) || 0,
          qty
        );
        const plainRestoreQty = qty - returnQtyForItem;

        if (returnQtyForItem > 0) {
          const prevStock = await getVariantStock(productId, variantId);
          const restored = await incrementVariantStock(productId, variantId, returnQtyForItem, {
            session,
          });
          if (restored) {
            await StockLedger.create(
              [
                {
                  product: productId,
                  variationId: variantId,
                  sku: resolveLedgerSku(item.sku),
                  quantity: returnQtyForItem,
                  type: "IN",
                  source: "RETURN",
                  referenceId: order._id,
                  previousStock: prevStock,
                  newStock: prevStock + returnQtyForItem,
                  [stockModifierField]: userId,
                },
              ],
              { session }
            );
          } else {
            console.warn(`Return restock failed for product ${productId} variant ${variantId} on order ${order._id}`);
          }
          historyReturnLines.push({
            product: item.product as any,
            productName: item.productName,
            sku: item.sku,
            variation: item.variation,
            quantity: returnQtyForItem,
            restocked: restored,
          });
          const carryKey = `${productId}:${variantId}`;
          returnedQtyByProductVariant.set(
            carryKey,
            (returnedQtyByProductVariant.get(carryKey) || 0) +
              (Number((item as any).returnedQuantity) || 0) +
              returnQtyForItem
          );
        }

        if (plainRestoreQty > 0) {
          const key = `${productId}:${variantId}`;
          const pending = pendingRestoreByKey.get(key);
          if (pending) {
            pending.qty += plainRestoreQty;
          } else {
            pendingRestoreByKey.set(key, {
              productId,
              variantId,
              sku: item.sku,
              qty: plainRestoreQty,
            });
          }
        }
      }

      // 2. Delete old OrderItems
      await OrderItem.deleteMany({ order: order._id }).session(session);

      // 3. Create new OrderItems and deduct stock
      let newSubtotal = 0;
      let newTaxTotal = 0;
      const newItemIds = [];

      for (let itemIndex = 0; itemIndex < newItemsData.length; itemIndex++) {
        const itemData = newItemsData[itemIndex];
        const quantity = Number(itemData.quantity) || 0; // Force number
        const normalizedProductId = typeof itemData.productId === "string" ? itemData.productId.trim() : "";
        const normalizedVariationId = typeof itemData.variationId === "string" ? itemData.variationId.trim() : "";
        const normalizedSku = typeof itemData.sku === "string" ? itemData.sku.trim() : "";
        const snapshotProductName = typeof itemData.productName === "string" ? itemData.productName.trim() : "";
        const fallbackNameFromPayload =
          typeof itemData.name === "string"
            ? itemData.name.trim()
            : typeof itemData.title === "string"
              ? itemData.title.trim()
              : "";
        const snapshotProductImage = typeof itemData.productImage === "string" ? itemData.productImage.trim() : "";

        let product = null;

        if (normalizedProductId && mongoose.Types.ObjectId.isValid(normalizedProductId)) {
          product = await Product.findById(normalizedProductId).populate("seller").session(session);
        }

        if (!product && normalizedSku) {
          product = await Product.findOne({
            $or: [
              { sku: normalizedSku },
              { "variations.sku": normalizedSku }
            ]
          }).populate("seller").session(session);
        }

        if (!product) {
          const fallbackProductName =
            snapshotProductName ||
            fallbackNameFromPayload ||
            normalizedSku ||
            `Custom Item ${itemIndex + 1}`;

          const customUnitPrice = Number(itemData.unitPrice) || 0;
          const customMrp = Number(itemData.mrp) || 0;
          const customVariationLabel =
            typeof itemData.variation === "string"
              ? itemData.variation.trim()
              : !mongoose.Types.ObjectId.isValid(normalizedVariationId)
                ? normalizedVariationId
                : "";
          const customTotal = customUnitPrice * quantity;
          newSubtotal += customTotal;

          // GST is treated as inclusive in the unit price (consistent with retail invoice flow)
          const customGstRate = itemData.gst !== undefined && itemData.gst !== null && itemData.gst !== ""
            ? Number(itemData.gst)
            : 5;
          const safeCustomGstRate = Number.isFinite(customGstRate) && customGstRate >= 0 ? customGstRate : 5;
          const customGstAmount = safeCustomGstRate > 0
            ? Number(((customTotal * safeCustomGstRate) / (100 + safeCustomGstRate)).toFixed(2))
            : 0;
          newTaxTotal += customGstAmount;

          const detachedOrderItem = new OrderItem({
            order: order._id,
            productName: fallbackProductName,
            productImage: snapshotProductImage,
            sku: normalizedSku,
            mrp: customMrp,
            unitPrice: customUnitPrice,
            quantity,
            total: customTotal,
            hsnCode: typeof itemData.hsnCode === "string" ? itemData.hsnCode.trim() : "",
            gst: safeCustomGstRate,
            gstAmount: customGstAmount,
            variation: customVariationLabel,
            status: "Pending",
            warrantyType: itemData.warrantyType || "None",
            warrantyDuration: itemData.warrantyDuration || ""
          });

          await detachedOrderItem.save({ session });
          newItemIds.push(detachedOrderItem._id);
          continue;
        }

        let unitPrice = Number(itemData.unitPrice) || (product as any).price || 0;
        let mrp = Number(itemData.mrp) || Number((product as any).compareAtPrice) || 0;
        let variationName = "";
        let sku = normalizedSku || (product as any).sku || "NO-SKU";
        let resolvedVariantId: string | undefined;

        const variants = variantsFromProductDoc(product);
        resolvedVariantId = resolveOrderItemVariantId(product, {
          variationId: normalizedVariationId,
          sku: normalizedSku,
          variation:
            typeof itemData.variation === "string" ? itemData.variation : undefined,
          productName: snapshotProductName || product.productName,
          unitPrice: Number(itemData.unitPrice),
        });

        const foundVariation = resolvedVariantId
          ? findVariantById(variants, resolvedVariantId)
          : undefined;

        if (foundVariation) {
          unitPrice =
            Number(itemData.unitPrice) ||
            // Fall back to the variant's actual selling price, never its
            // promotional/offer price - discPrice is the customer-app
            // storefront discount, not what POS should charge in-store
            // when the client-sent unitPrice is missing for some reason.
            Number(foundVariation.price) ||
            unitPrice;
          mrp =
            Number(itemData.mrp) ||
            Number(foundVariation.compareAtPrice) ||
            Number((product as any).compareAtPrice) ||
            mrp;
          variationName = `${foundVariation.name || foundVariation.variationType || "Variant"}: ${foundVariation.value}`;
          sku = foundVariation.sku || sku;
        }

        const total = unitPrice * quantity;
        newSubtotal += total;

        if (resolvedVariantId && quantity > 0) {
          // Net against any old line for this same product/variant that's
          // pending restoration - the portion that's simply carried forward
          // unchanged needs no stock movement or ledger entry at all.
          const key = `${String(product._id)}:${resolvedVariantId}`;
          const pending = pendingRestoreByKey.get(key);
          let qtyToDeduct = quantity;
          if (pending && pending.qty > 0) {
            const matched = Math.min(pending.qty, qtyToDeduct);
            pending.qty -= matched;
            qtyToDeduct -= matched;
          }

          if (qtyToDeduct > 0) {
            const prevStock = await getVariantStock(String(product._id), resolvedVariantId);
            const decremented = await decrementVariantStock(
              String(product._id),
              resolvedVariantId,
              qtyToDeduct,
              { session }
            );

            if (decremented) {
              await StockLedger.create(
                [
                  {
                    product: product._id,
                    variationId: resolvedVariantId,
                    sku: resolveLedgerSku(sku, foundVariation?.sku, normalizedSku),
                    quantity: qtyToDeduct,
                    type: "OUT",
                    source: "ORDER_EDIT_DEDUCT",
                    referenceId: order._id,
                    previousStock: prevStock,
                    newStock: Math.max(0, prevStock - qtyToDeduct),
                    [stockModifierField]: userId,
                  },
                ],
                { session }
              );
            }
          }
        }

        // Resolve GST rate: explicit payload value > product default > 5%
        const payloadGstProvided =
          itemData.gst !== undefined && itemData.gst !== null && itemData.gst !== "";
        const productGstRate =
          (product as any).gst !== undefined && (product as any).gst !== null
            ? Number((product as any).gst)
            : NaN;
        const resolvedGstRate = payloadGstProvided
          ? Number(itemData.gst)
          : Number.isFinite(productGstRate)
            ? productGstRate
            : 5;
        const safeGstRate = Number.isFinite(resolvedGstRate) && resolvedGstRate >= 0 ? resolvedGstRate : 5;

        // GST is inclusive in the unit price (B2C retail behaviour)
        const lineGstAmount = safeGstRate > 0
          ? Number(((total * safeGstRate) / (100 + safeGstRate)).toFixed(2))
          : 0;
        newTaxTotal += lineGstAmount;

        const resolvedHsnCode =
          typeof itemData.hsnCode === "string" && itemData.hsnCode.trim()
            ? itemData.hsnCode.trim()
            : (product as any).hsnCode || "";

        const carryKey = resolvedVariantId ? `${String(product._id)}:${resolvedVariantId}` : "";
        const carriedReturnedQuantity = carryKey ? returnedQtyByProductVariant.get(carryKey) || 0 : 0;

        const newOrderItem = new OrderItem({
          order: order._id,
          product: product._id,
          seller: (product.seller as any)?._id || product.seller,
          productName: snapshotProductName || product.productName,
          productImage: snapshotProductImage || (product as any).mainImage,
          sku: sku,
          mrp: mrp,
          unitPrice: unitPrice,
          quantity: quantity,
          total: total,
          hsnCode: resolvedHsnCode,
          gst: safeGstRate,
          gstAmount: lineGstAmount,
          variation: variationName,
          status: "Pending",
          warrantyType: itemData.warrantyType || product.warrantyType || "None",
          warrantyDuration: itemData.warrantyDuration || product.warrantyDuration || "",
          returnedQuantity: carriedReturnedQuantity,
          ...(resolvedVariantId ? { variantId: resolvedVariantId } : {}),
        });

        await newOrderItem.save({ session });
        newItemIds.push(newOrderItem._id);
      }

      // Any pending restore quantity left unmatched is a genuine reduction
      // (quantity lowered, item removed, or swapped for a different
      // product/variant) - restore stock and log it for that item only.
      for (const pending of pendingRestoreByKey.values()) {
        if (pending.qty <= 0) continue;

        const prevStock = await getVariantStock(pending.productId, pending.variantId);
        const restored = await incrementVariantStock(pending.productId, pending.variantId, pending.qty, {
          session,
        });

        if (restored) {
          await StockLedger.create(
            [
              {
                product: pending.productId,
                variationId: pending.variantId,
                sku: resolveLedgerSku(pending.sku),
                quantity: pending.qty,
                type: "IN",
                source: "ORDER_EDIT_RESTORE",
                referenceId: order._id,
                previousStock: prevStock,
                newStock: prevStock + pending.qty,
                [stockModifierField]: userId,
              },
            ],
            { session }
          );
        }
      }

      // 4. Update Order
      const {
        customerId,
        customerName: newCustomerName,
        customerPhone: newCustomerPhone,
        customerEmail: newCustomerEmail,
        paymentMethod: newPaymentMethod,
        discountType,
        discountValue,
        deliveryCharge,
        salesPersonId,
        salesPersonName,
        salesPersonPhone,
        isPartialPayment,
        amountPaid: amountPaidInput,
      } = req.body;

      // Handle Credit Adjustment for Old State
      if (order.paymentMethod === 'Credit' && order.customer) {
        const oldCustomer = await Customer.findById(order.customer).session(session);
        if (oldCustomer) {
          oldCustomer.creditBalance = Math.max(0, (oldCustomer.creditBalance || 0) - (order.total || 0));
          await oldCustomer.save({ session });
          // Delete old transaction
          await CreditTransaction.deleteMany({ referenceId: order._id.toString(), type: 'Order' }).session(session);
        }
      }

      // Update Order Fields
      if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
        const newCustomer = await Customer.findById(customerId).session(session);
        if (newCustomer) {
          order.customer = newCustomer._id;
          order.customerName = newCustomer.name;
          order.customerEmail = newCustomer.email;
          order.customerPhone = newCustomer.phone;
        }
      } else if (newCustomerName) {
        order.customerName = newCustomerName;
        if (newCustomerPhone) order.customerPhone = newCustomerPhone;
        if (newCustomerEmail) order.customerEmail = newCustomerEmail;
      }

      if (newPaymentMethod) {
        order.paymentMethod = newPaymentMethod;
      }

      // Apply any updated discount/delivery-charge/sales-person fields sent
      // from the "More Options" popup, falling back to the order's existing
      // values when the edit didn't touch them. Uses the same helpers as
      // order creation so edit can never drift from create again.
      const { shipping, discount, total: newTotal } = computeCharges(newSubtotal, {
        discountType: discountType !== undefined ? discountType : order.discountType,
        discountValue: discountValue !== undefined ? discountValue : order.discountValue,
        deliveryCharge: deliveryCharge !== undefined ? deliveryCharge : order.shipping,
      });

      if (discountType) {
        order.discountType = discountType;
        order.discountValue = Number(discountValue) || 0;
      }
      const salesPerson = resolveSalesPerson({ salesPersonId, salesPersonName, salesPersonPhone });
      if (salesPerson) {
        order.salesPerson = salesPerson;
      }

      order.items = newItemIds as any;
      order.subtotal = newSubtotal;
      // Recompute tax from line-level GST (inclusive in unit price).
      // Subtotal already includes tax for GST-inclusive pricing, so we don't add it again to total.
      order.tax = Number(newTaxTotal.toFixed(2));
      order.shipping = shipping;
      order.discount = discount;
      order.total = newTotal;

      // Recalculate payment status against the new total so a partial
      // payment doesn't silently go stale (e.g. paid < new total, or the
      // reverse) after items/charges change.
      const paymentResult = resolvePaymentStatus({
        paymentMethod: order.paymentMethod,
        total: order.total,
        isPartialPayment: isPartialPayment !== undefined ? isPartialPayment : order.isPartialPayment,
        amountPaid: amountPaidInput,
        existingAmountPaid: order.amountPaid,
      });
      order.isPartialPayment = paymentResult.isPartialPayment;
      order.amountPaid = paymentResult.amountPaid;
      order.paymentStatus = paymentResult.paymentStatus;

      // Update the bill's return status. A return in this edit that left no
      // items on the bill means everything has now been returned; otherwise
      // any return (this edit or a prior one) makes it a partial return.
      if (historyReturnLines.length > 0) {
        order.returnStatus = newItemIds.length === 0 ? "Full" : "Partial";
      }

      await order.save({ session });

      // Handle Credit Adjustment for New State
      if (order.paymentMethod === 'Credit' && order.customer) {
        const finalCustomer = await Customer.findById(order.customer).session(session);
        if (finalCustomer) {
          finalCustomer.creditBalance = (finalCustomer.creditBalance || 0) + order.total;
          await finalCustomer.save({ session });

          await CreditTransaction.create([{
            customer: finalCustomer._id,
            type: 'Order',
            amount: order.total,
            balanceAfter: finalCustomer.creditBalance,
            description: `POS Order #${order.orderNumber} (Updated)`,
            referenceId: order._id.toString(),
            date: new Date(),
            createdBy: userId
          }], { session });
        }
      }

      await session.commitTransaction();
      session.endSession();

      const updatedOrder = await Order.findById(id).populate({
        path: "items",
        populate: [
          { path: "product", select: "productName mainImage price compareAtPrice wholesalePrice variations" },
          { path: "seller", select: "sellerName storeName" }
        ]
      });

      // Bill history is an audit trail, not part of the edit's correctness -
      // log it best-effort after the transaction so a logging hiccup never
      // blocks the actual edit from succeeding.
      try {
        const itemsAfterSnapshot = ((updatedOrder?.items as any[]) || []).map((item: any) => ({
          product: item.product?._id || item.product,
          productName: item.productName,
          sku: item.sku,
          variation: item.variation,
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          total: Number(item.total) || 0,
        }));

        await OrderHistory.create({
          order: order._id,
          ...(userType === "Admin" ? { editedByAdmin: userId } : { editedBySeller: userId }),
          itemsBefore: itemsBeforeSnapshot,
          itemsAfter: itemsAfterSnapshot,
          returns: historyReturnLines,
          totalsBefore,
          totalsAfter: {
            subtotal: Number(updatedOrder?.subtotal) || 0,
            tax: Number(updatedOrder?.tax) || 0,
            total: Number(updatedOrder?.total) || 0,
          },
        });
      } catch (historyError) {
        console.error("Failed to write order history:", historyError);
      }

      return res.status(200).json({
        success: true,
        message: "Order items updated successfully",
        data: updatedOrder,
      });

    } catch (error: any) {
      await session.abortTransaction();
      session.endSession();
      console.error("UpdateOrderItems Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update order items",
      });
    }
  }
);

/**
 * Get the edit/return history for a bill (Order), newest first.
 */
export const getOrderHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await Order.findById(id).select("_id");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const history = await OrderHistory.find({ order: id })
      .sort({ createdAt: -1 })
      .populate("editedByAdmin", "name email")
      .populate("editedBySeller", "sellerName storeName");

    return res.status(200).json({
      success: true,
      data: history,
    });
  }
);

/**
 * Assign delivery boy to order
 */
export const assignDeliveryBoy = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Delivery boy ID is required",
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    try {
      await performDeliveryAssignment(order, deliveryBoyId, req.user?.userId);
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Failed to assign delivery boy",
      });
    }

    const updatedOrder = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate("items");

    return res.status(200).json({
      success: true,
      message: "Delivery boy assigned successfully",
      data: updatedOrder,
    });
  }
);

/**
 * Get orders by status
 */
export const getOrdersByStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { status } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const validStatuses = [
      "Received",
      "Pending",
      "Processed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Rejected",
      "Returned",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.find({ status })
        .populate("customer", "name email phone")
        .populate("deliveryBoy", "name mobile")
        .populate("items")
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments({ status }),
    ]);

    return res.status(200).json({
      success: true,
      message: `Orders with status ${status} fetched successfully`,
      data: orders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

const WORKFLOW_STAGES = [
  "New",
  "Confirmed",
  "Shipment Ready",
  "In Transit",
  "Delivered",
  "Cancelled",
] as const;

/**
 * Admin "Order Delivery" workflow - list orders grouped by
 * deliveryWorkflowStage for the tabbed card view. Card projection is
 * deliberately profit-free (no purchasePrice/lineProfit/billSummary) -
 * see getOrderWorkflowDetail for the admin-only profit view.
 */
// Same channel heuristic used by getOnlineOrders/getPOSOrders - a walk-in
// (POS) bill has "pos" in adminNotes or the POS placeholder delivery address.
const ONLINE_CHANNEL_MATCH = {
  $and: [
    { adminNotes: { $not: { $regex: "pos", $options: "i" } } },
    { "deliveryAddress.address": { $ne: "POS Order" } },
  ],
};
const WALK_IN_CHANNEL_MATCH = {
  $or: [
    { adminNotes: { $regex: "pos", $options: "i" } },
    { "deliveryAddress.address": "POS Order" },
  ],
};

export const getOrdersByWorkflowStage = asyncHandler(
  async (req: Request, res: Response) => {
    const { stage = "All", channel = "Online", page = 1, limit = 20, search } = req.query;

    if (stage !== "All" && !WORKFLOW_STAGES.includes(stage as any)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Must be one of: All, ${WORKFLOW_STAGES.join(", ")}`,
      });
    }
    if (channel !== "Online" && channel !== "WalkIn") {
      return res.status(400).json({
        success: false,
        message: "Invalid channel. Must be one of: Online, WalkIn",
      });
    }

    const andConditions: any[] = [
      channel === "WalkIn" ? WALK_IN_CHANNEL_MATCH : ONLINE_CHANNEL_MATCH,
    ];
    if (stage !== "All") {
      andConditions.push({ deliveryWorkflowStage: stage });
    }
    if (search) {
      const searchRegex = new RegExp(String(search), "i");
      andConditions.push({
        $or: [
          { orderNumber: searchRegex },
          { customerName: searchRegex },
          { customerPhone: searchRegex },
        ],
      });
    }
    const filter: any = { $and: andConditions };

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const channelFilter = channel === "WalkIn" ? WALK_IN_CHANNEL_MATCH : ONLINE_CHANNEL_MATCH;

    const [orders, total, counts] = await Promise.all([
      Order.find(filter)
        .select(
          "orderNumber orderDate customerName customerPhone total paymentMethod paymentStatus amountPaid isPartialPayment deliveryWorkflowStage deliveryBoy deliverySlot items adminNotes"
        )
        .populate("deliveryBoy", "name mobile")
        .populate({
          path: "items",
          select: "productName productImage quantity",
        })
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: channelFilter },
        { $group: { _id: "$deliveryWorkflowStage", count: { $sum: 1 } } },
      ]),
    ]);

    const stageCounts: Record<string, number> = { All: 0 };
    for (const stageName of WORKFLOW_STAGES) stageCounts[stageName] = 0;
    for (const c of counts) {
      stageCounts[c._id] = c.count;
      stageCounts.All += c.count;
    }

    // orderChannel is derived, not stored - lets the frontend gate the
    // Confirm/Dispatch/Cancel actions off without re-deriving the heuristic.
    const ordersWithChannel = orders.map((order) => {
      const obj: any = order.toObject();
      obj.orderChannel = channel === "WalkIn" ? "WalkIn" : "Online";
      delete obj.adminNotes;
      return obj;
    });

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: ordersWithChannel,
      counts: stageCounts,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Admin-only order detail for the Order Delivery workflow page. Includes
 * per-item/order profit (billSummary) - do NOT reuse this handler's shape
 * from customer/delivery-facing controllers.
 */
export const getOrderWorkflowDetail = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate({
        path: "items",
        populate: [
          {
            path: "product",
            select: "productName mainImage price compareAtPrice wholesalePrice purchasePrice variations hsnCode gst",
          },
          {
            path: "seller",
            select: "sellerName storeName",
          },
        ],
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const orderObj: any = order.toObject();
    orderObj.orderChannel =
      /pos/i.test(order.adminNotes || "") || order.deliveryAddress?.address === "POS Order"
        ? "WalkIn"
        : "Online";
    let billTotalMRP = 0;
    let billTotalPurchase = 0;
    let billTotalSP = 0;

    orderObj.items = (orderObj.items || []).map((item: any) => {
      const product = item.product;
      const variations = product?.variations || [];
      const matchedVariant = variations.find(
        (v: any) => String(v._id) === String(item.variantId)
      );
      const purchasePrice =
        matchedVariant?.purchasePrice ??
        variations[0]?.purchasePrice ??
        product?.purchasePrice ??
        0;
      const mrp =
        item.mrp ||
        matchedVariant?.compareAtPrice ||
        product?.compareAtPrice ||
        item.unitPrice ||
        0;
      const quantity = item.quantity || 0;
      const lineSP = (item.unitPrice || 0) * quantity;
      const linePurchase = purchasePrice * quantity;
      const lineMRP = mrp * quantity;
      const lineProfit = lineSP - linePurchase;

      if (!item.isFreeGift) {
        billTotalMRP += lineMRP;
        billTotalPurchase += linePurchase;
        billTotalSP += lineSP;
      }

      return {
        ...item,
        purchasePrice,
        mrp,
        lineProfit,
        hsnCode: item.hsnCode || product?.hsnCode,
        gst: item.gst ?? product?.gst,
      };
    });

    orderObj.billSummary = {
      totalMRP: billTotalMRP,
      totalPurchase: billTotalPurchase,
      totalSP: billTotalSP,
      profit: billTotalSP - billTotalPurchase,
    };

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: orderObj,
    });
  }
);

/**
 * Confirm a "New" order: attach the chosen delivery time slot and move it
 * to the "Confirmed" tab.
 */
export const confirmOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { deliverySlot } = req.body;

    if (!deliverySlot || !deliverySlot.type) {
      return res.status(400).json({
        success: false,
        message: "deliverySlot with a type is required",
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.deliveryWorkflowStage !== "New") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be confirmed from stage ${order.deliveryWorkflowStage}`,
      });
    }

    order.deliveryWorkflowStage = "Confirmed";
    order.confirmedAt = new Date();
    order.deliverySlot = deliverySlot;
    order.status = "Processed";
    await order.save();

    const io: SocketIOServer = req.app.get("io");
    if (io) {
      notifySellersOfOrderUpdate(io, order, "STATUS_UPDATE");
    }

    const updatedOrder = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .populate("items");

    return res.status(200).json({
      success: true,
      message: "Order confirmed successfully",
      data: updatedOrder,
    });
  }
);

/**
 * Shared delivery-assignment logic used by both the legacy assignDeliveryBoy
 * endpoint and the new dispatchOrder workflow endpoint.
 */
const performDeliveryAssignment = async (
  order: InstanceType<typeof Order>,
  deliveryBoyId: string,
  assignedBy?: string
) => {
  const deliveryBoy = await Delivery.findById(deliveryBoyId);
  if (!deliveryBoy) {
    throw Object.assign(new Error("Delivery boy not found"), { statusCode: 404 });
  }
  if (deliveryBoy.status !== "Active") {
    throw Object.assign(new Error("Delivery boy is not active"), { statusCode: 400 });
  }

  order.deliveryBoy = deliveryBoyId as any;
  order.deliveryBoyStatus = "Assigned";
  order.assignedAt = new Date();
  await order.save();

  await DeliveryAssignment.findOneAndUpdate(
    { order: order._id },
    {
      order: order._id,
      deliveryBoy: deliveryBoyId,
      assignedAt: new Date(),
      assignedBy,
      status: "Assigned",
    },
    { upsert: true, new: true }
  );

  return deliveryBoy;
};

/**
 * Dispatch a "Confirmed" order to a chosen delivery partner, move it to
 * "Shipment Ready", and notify the delivery boy in real time.
 */
export const dispatchOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { deliveryBoyId, deliveryCharge } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Delivery boy ID is required",
      });
    }

    if (deliveryCharge !== undefined && (typeof deliveryCharge !== "number" || deliveryCharge < 0)) {
      return res.status(400).json({
        success: false,
        message: "Delivery charge must be a non-negative number",
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.deliveryWorkflowStage !== "Confirmed") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be dispatched from stage ${order.deliveryWorkflowStage}`,
      });
    }

    try {
      await performDeliveryAssignment(order, deliveryBoyId, req.user?.userId);
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Failed to assign delivery boy",
      });
    }

    // The delivery charge is only known/finalized at dispatch time (e.g.
    // set by distance/instructions), so it's set here rather than at
    // checkout. Recompute the total the same way checkout does, so what
    // the customer sees and what COD collects stay consistent.
    const paidOrderTotalWillChange =
      deliveryCharge !== undefined &&
      deliveryCharge !== order.shipping &&
      order.paymentStatus === "Paid";

    const deliveryChargeChanged = deliveryCharge !== undefined && deliveryCharge !== order.shipping;
    if (deliveryChargeChanged) {
      order.shipping = deliveryCharge;
      order.total = Number(
        Math.max(
          0,
          (order.subtotal || 0) + (order.platformFee || 0) + deliveryCharge - (order.discount || 0)
        ).toFixed(2)
      );
    }

    order.deliveryWorkflowStage = "Shipment Ready";
    order.dispatchedAt = new Date();
    await order.save();

    // Tell the customer their delivery charge/total changed - they last saw
    // the default charge at checkout, and this was previously only
    // surfaced to admin via the `warning` field in this endpoint's own
    // response.
    if (deliveryChargeChanged) {
      try {
        const customerDoc = await Customer.findById(order.customer)
          .select("fcmToken fcmTokenMobile")
          .lean();
        const tokens = [
          (customerDoc as any)?.fcmTokenMobile,
          (customerDoc as any)?.fcmToken,
        ].filter(Boolean) as string[];

        const title = paidOrderTotalWillChange ? "Order total updated" : "Delivery charge updated";
        const body = paidOrderTotalWillChange
          ? `Your order #${order.orderNumber}'s delivery charge changed to ₹${deliveryCharge} after payment. New total: ₹${order.total}. Our team will reach out to reconcile the difference.`
          : `Your delivery charge for order #${order.orderNumber} was updated to ₹${deliveryCharge}. New order total: ₹${order.total}.`;

        if (tokens.length) {
          await sendPushNotification(tokens, {
            title,
            body,
            data: { orderId: String(order._id), type: "OrderStatus" },
          });
        }

        await Notification.create({
          recipientType: "Customer",
          recipientId: order.customer,
          type: "Order",
          title,
          message: body,
          link: `/orders/${order._id}`,
          priority: "High",
        });
      } catch (err) {
        console.error("Failed to notify customer of delivery charge change:", err);
      }
    }

    const io: SocketIOServer = req.app.get("io");
    if (io) {
      const assignmentPayload = {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        address: order.deliveryAddress,
        total: order.total,
        assignedAt: order.assignedAt,
      };
      io.to(`delivery-${deliveryBoyId}`).emit("new-assignment", assignmentPayload);

      await Notification.create({
        recipientType: "Delivery",
        recipientId: deliveryBoyId,
        type: "Order",
        title: "New order assigned",
        message: `Order ${order.orderNumber} has been assigned to you`,
        link: `/delivery/orders/${order._id}`,
        priority: "High",
      });
      io.to(`delivery-${deliveryBoyId}`).emit("new-notification", assignmentPayload);
    }

    const updatedOrder = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate("items");

    return res.status(200).json({
      success: true,
      message: "Order dispatched successfully",
      data: updatedOrder,
      ...(paidOrderTotalWillChange
        ? { warning: "This order was already paid online - the new total differs from what was collected. Reconcile the difference with the customer manually." }
        : {}),
    });
  }
);

/**
 * Get all return requests
 */
export const getReturnRequests = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      seller,
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    // Status filter
    if (status && status !== "all") {
      query.status = status;
    }

    // Request Type filter (Return vs Replacement)
    const { requestType } = req.query;
    if (requestType && requestType !== "all") {
      query.requestType = requestType;
    }

    // Date filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo as string);
      }
    }

    // Search filter (complex because we need to search populated fields)
    // For now, simpler implementation - search by order ID or return reason or customer
    if (search) {
      // Find orders matching search first
      const orders = await Order.find({
        orderNumber: { $regex: search as string, $options: "i" },
      }).select("_id");
      const orderIds = orders.map((o) => o._id);

      query.$or = [
        { order: { $in: orderIds } },
        { reason: { $regex: search as string, $options: "i" } },
        { description: { $regex: search as string, $options: "i" } },
      ];
    }

    // Seller filter requires looking up order items
    if (seller && seller !== "all") {
      // Find order items for this seller
      const orderItems = await OrderItem.find({ seller }).select("_id");
      const orderItemIds = orderItems.map((oi) => oi._id);
      query.orderItem = { $in: orderItemIds };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const [requests, total] = await Promise.all([
      Return.find(query)
        .populate("order", "orderNumber")
        .populate("customer", "name email phone")
        .populate({
          path: "orderItem",
          populate: {
            path: "product",
            select: "productName mainImage",
          },
        })
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit as string)),
      Return.countDocuments(query),
    ]);

    // Transform logic to match frontend expectations if necessary
    // AdminReturnRequest.tsx expects: _id, orderItemId, userName, productName, variant, price, quantity, total, status, requestedAt
    // It seems flattened. Let's send structured data and let frontend handle it, or flatten it here.
    // The frontend uses "request.orderItemId", "request.userName", "request.productName" etc.
    // This implies a flattened structure.

    const transformedRequests = requests.map((req: any) => ({
      _id: req._id,
      orderId: req.order?._id,
      orderNumber: req.order?.orderNumber,
      orderItemId: req.orderItem?._id, // Frontend displays this
      userId: req.customer?._id,
      userName: req.customer?.name || "Unknown",
      // product info from orderItem
      productId: req.orderItem?.product?._id,
      productName: req.orderItem?.productName || "Unknown Product",
      variant: req.orderItem?.variation,
      price: req.orderItem?.unitPrice || 0,
      quantity: req.quantity,
      total: req.quantity * (req.orderItem?.unitPrice || 0),
      reason: req.reason,
      requestType: req.requestType,
      images: req.images,
      status: req.status,
      requestedAt: req.createdAt,
      processedAt: req.processedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Return requests fetched successfully",
      data: transformedRequests,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Get return request by ID
 */
export const getReturnRequestById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const returnRequest = await Return.findById(id)
      .populate("order")
      .populate("customer", "name email phone")
      .populate({
        path: "orderItem",
        populate: [
          { path: "product", select: "productName mainImage" },
          { path: "seller", select: "sellerName storeName" },
        ],
      })
      .populate("processedBy", "firstName lastName");

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Return request details fetched successfully",
      data: returnRequest,
    });
  }
);

/**
 * Process return request (Update)
 */
export const processReturnRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, rejectionReason, adminNotes } = req.body;

    const validStatuses = ["Approved", "Rejected", "Processing", "Completed"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const returnRequest = await Return.findById(id);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    const updateData: any = {
      processedBy: req.user?.userId,
      processedAt: new Date(),
    };

    if (status) updateData.status = status;

    // Handle rejection reason (frontend sends 'adminNotes' for rejection reason)
    if (status === "Rejected") {
      if (rejectionReason) updateData.rejectionReason = rejectionReason;
      else if (adminNotes) updateData.rejectionReason = adminNotes;
    }

    if (status === "Approved") {
      const { refundAmount, deliveryBoyId } = req.body;
      if (refundAmount) updateData.refundAmount = refundAmount;

      if (deliveryBoyId) {
        // Create or update delivery assignment
        await DeliveryAssignment.findOneAndUpdate(
          { returnRequest: id },
          {
            order: returnRequest.order,
            returnRequest: id,
            deliveryBoy: deliveryBoyId,
            assignedAt: new Date(),
            assignedBy: req.user?.userId,
            status: "Assigned",
            assignmentType: returnRequest.requestType === "Replacement" ? "Replacement" : "Return",
          },
          { upsert: true, new: true }
        );
      }
    }

    // Restock the returned item (e.g. an in-store walk-in return the admin closes out
    // directly, with no delivery pickup task). Mirrors the POS sale deduction so stock
    // isn't permanently understated. Guarded on the pre-update status so this can't
    // double-credit if the request was already completed via the delivery pickup flow.
    if (
      status === "Completed" &&
      returnRequest.status !== "Completed" &&
      returnRequest.requestType === "Return"
    ) {
      try {
        const orderItem = await OrderItem.findById(returnRequest.orderItem);
        if (orderItem?.product) {
          const productId = String(orderItem.product);
          const product = await Product.findById(productId);
          if (product) {
            const variantId = resolveOrderItemVariantId(product, {
              variantId: orderItem.variantId ? String(orderItem.variantId) : undefined,
              sku: orderItem.sku,
              variation: orderItem.variation,
              productName: orderItem.productName,
              unitPrice: orderItem.unitPrice,
            });

            if (variantId) {
              const prevStock = await getVariantStock(productId, variantId);
              const restored = await incrementVariantStock(productId, variantId, returnRequest.quantity);
              if (restored) {
                await StockLedger.create({
                  product: productId,
                  variationId: variantId,
                  sku: resolveLedgerSku(orderItem.sku),
                  quantity: returnRequest.quantity,
                  type: "IN",
                  source: "RETURN",
                  referenceId: returnRequest._id,
                  previousStock: prevStock,
                  newStock: prevStock + returnRequest.quantity,
                  admin: req.user?.userId,
                });
              }
            } else {
              console.warn(`Return restock skip: could not resolve variant for product ${productId}`);
            }
          }
        }
        await OrderItem.findByIdAndUpdate(returnRequest.orderItem, { status: "Returned" });
      } catch (err) {
        console.error("Failed to restock returned item:", err);
      }
    }

    const updatedReturn = await Return.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("order")
      .populate("orderItem")
      .populate("customer", "name email phone");

    return res.status(200).json({
      success: true,
      message: `Return request ${status ? status.toLowerCase() : "updated"
        } successfully`,
      data: updatedReturn,
    });
  }
);

/**
 * Export orders to CSV
 */
export const exportOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const { status, dateFrom, dateTo } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) query.orderDate.$lte = new Date(dateTo as string);
    }

    const orders = await Order.find(query)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .sort({ orderDate: -1 })
      .lean();

    // Convert to CSV format
    const csvHeaders = [
      "Order Number",
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Order Date",
      "Status",
      "Payment Status",
      "Total Amount",
      "Delivery Address",
      "Delivery Boy",
    ];

    const csvRows = orders.map((order) => [
      order.orderNumber,
      order.customerName,
      order.customerEmail,
      order.customerPhone,
      order.orderDate.toISOString(),
      order.status,
      order.paymentStatus,
      order.total.toString(),
      `${order.deliveryAddress.address}, ${order.deliveryAddress.city} - ${order.deliveryAddress.pincode}`,
      order.deliveryBoy ? (order.deliveryBoy as any).name : "Not Assigned",
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=orders_${Date.now()}.csv`
    );
    res.send(csvContent);
  }
);

/**
 * Create POS Order
 */
// ... (previous code)

/**
 * Create POS Order
 */
export const createPOSOrder = asyncHandler(
  async (req: Request, res: Response) => {
    try {
        const {
          items,
          paymentMethod,
          paymentStatus,
          // "Discount and Charges" popup extras - all optional, absent when
          // the cashier never opened that popup (the common case).
          discountType,
          discountValue,
          deliveryCharge,
          salesPersonId,
          salesPersonName,
          salesPersonPhone,
          isPartialPayment,
          amountPaid: amountPaidInput,
        } = req.body;
        let { customerId } = req.body;

        // Validate request
        if (!customerId || !items || !items.length || !paymentMethod) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields: customerId, items, paymentMethod",
          });
        }

        const adminId = req.user?.userId;
        if (!adminId) {
             console.warn("createPOSOrder: No admin user found in request (req.user)");
        }

        // Handle Walk-in Customer
        if (customerId === "walk-in-customer") {
          let walkIn = await Customer.findOne({ email: "walkin@pos.com" });
          if (!walkIn) {
            try {
              walkIn = await Customer.create({
                name: "Walk-in Customer",
                email: "walkin@pos.com",
                phone: "0000000000",
                status: "Active",
              });
            } catch (err) {
                 console.error("Error creating walk-in customer", err);
            }
          }
          if (walkIn) customerId = walkIn._id;
        }

        // Fetch customer
        const customer = await Customer.findById(customerId);
        if (!customer) {
          return res.status(404).json({
            success: false,
            message: "Customer not found",
          });
        }

        // 1. Create Order shell
        let order = await Order.create({
          customer: customer._id,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          deliveryAddress: {
            address: customer.address || "POS Order",
            city: customer.city || "POS",
            pincode: customer.pincode || "000000",
            state: customer.state || "POS"
          },
          items: [],
          subtotal: 0,
          tax: 0,
          shipping: 0,
          discount: 0,
          total: 0,
          paymentMethod,
          paymentStatus: paymentStatus || "Paid",
          status: "Delivered",
          deliveryBoyStatus: "Delivered",
          deliveredAt: new Date(),
          adminNotes: "Created via POS System"
        });

        // 2. Create Order Items
        let subtotal = 0;
        let taxTotal = 0;
        const orderItemsIds = [];

        for (const item of items) {
           let productData: any = {
               productName: item.name || "Custom Item",
               mainImage: "",
               sku: "",
               seller: null
           };
           let productId = null;
           let product: any = null;
           let resolvedVariant: ReturnType<typeof findVariantById> = undefined;

           if (mongoose.Types.ObjectId.isValid(item.productId)) {
               product = await Product.findById(item.productId).populate('seller');
               if (product) {
                   productId = product._id;
                   const variants = variantsFromProductDoc(product);
                   const resolvedVariantId = resolveOrderItemVariantId(product, {
                       variantId: item.variationId,
                       sku: item.sku,
                       productName: item.name,
                       unitPrice: item.price,
                   });
                   resolvedVariant = resolvedVariantId
                     ? findVariantById(variants, resolvedVariantId)
                     : undefined;
                   productData = {
                       productName: item.name || product.productName,
                       mainImage: resolvedVariant?.mainImage || (product as any).listing?.imageUrl || "",
                       sku: resolvedVariant?.sku || "",
                       seller: (product.seller as any)?._id || product.seller
                   };
               }
           }

           const total = Number(item.price) * Number(item.quantity);
           subtotal += total;

           // Resolve HSN/GST: prefer per-line payload (POS Edit Item modal), then product, then defaults.
           const payloadHsnCode =
             typeof item.hsnCode === "string" && item.hsnCode.trim()
               ? item.hsnCode.trim()
               : typeof item.hsn === "string" && item.hsn.trim()
                 ? item.hsn.trim()
                 : "";
           const resolvedHsnCode =
             payloadHsnCode ||
             (typeof (product as any)?.hsnCode === "string" ? String((product as any).hsnCode).trim() : "");

           const payloadGstRateRaw =
             item.gst !== undefined && item.gst !== null && item.gst !== ""
               ? Number(item.gst)
               : item.gstPercent !== undefined && item.gstPercent !== null && item.gstPercent !== ""
                 ? Number(item.gstPercent)
                 : NaN;
           const resolvedGstRate = Number.isFinite(payloadGstRateRaw)
             ? payloadGstRateRaw
             : Number.isFinite(Number((product as any)?.gst))
               ? Number((product as any).gst)
               : 5;
           const safeGstRate = resolvedGstRate >= 0 ? resolvedGstRate : 5;
           // GST is treated as inclusive in the POS price (B2C retail convention).
           const resolvedGstAmount = safeGstRate > 0
             ? Number(((total * safeGstRate) / (100 + safeGstRate)).toFixed(2))
             : 0;
           taxTotal += resolvedGstAmount;

            const orderItemPayload: any = {
              order: order._id,
              productName: productData.productName,
              productImage: productData.mainImage,
              sku: productData.sku,
              mrp: Number(item.mrp) || 0,
              unitPrice: item.price,
              quantity: item.quantity,
              total: total,
              hsnCode: resolvedHsnCode,
              gst: safeGstRate,
              gstAmount: resolvedGstAmount,
              warrantyType: item.warrantyType || (product as any)?.warrantyType || "None",
              warrantyDuration: item.warrantyDuration || (product as any)?.warrantyDuration || "",
              status: "Delivered"
           };

           if (productId) orderItemPayload.product = productId;
           if (productData.seller) orderItemPayload.seller = productData.seller;
           if (resolvedVariant) {
             orderItemPayload.variantId = resolvedVariant._id;
             orderItemPayload.variation = `${resolvedVariant.name || resolvedVariant.variationType || "Variant"}: ${resolvedVariant.value}`;
           }

           const orderItem = await OrderItem.create(orderItemPayload);
           orderItemsIds.push(orderItem._id);
        }

        // 3. Update Order with correct totals
        const { shipping, discount, total } = computeCharges(subtotal, {
          discountType,
          discountValue,
          deliveryCharge,
        });

        order.items = orderItemsIds;
        order.subtotal = subtotal;
        order.tax = Number(taxTotal.toFixed(2));
        order.shipping = shipping;
        order.discount = discount;
        if (discountType) {
          order.discountType = discountType;
          order.discountValue = Number(discountValue) || 0;
        }
        order.total = total;

        const salesPerson = resolveSalesPerson({ salesPersonId, salesPersonName, salesPersonPhone });
        if (salesPerson) {
          order.salesPerson = salesPerson;
        }

        const paymentResult = resolvePaymentStatus({
          paymentMethod,
          total,
          isPartialPayment,
          amountPaid: amountPaidInput,
        });
        order.isPartialPayment = paymentResult.isPartialPayment;
        order.amountPaid = paymentResult.amountPaid;
        order.paymentStatus = paymentResult.paymentStatus;

        await order.save();

        // --- CREDIT MANAGEMENT ---
        if (paymentMethod === 'Credit') {
            customer.creditBalance = (customer.creditBalance || 0) + total;
            await customer.save();

            await CreditTransaction.create({
                customer: customer._id,
                type: 'Order',
                amount: total,
                balanceAfter: customer.creditBalance,
                description: `POS Order #${order.orderNumber}`,
                referenceId: order._id.toString(),
                date: new Date(),
                createdBy: adminId
            });
        }

        // --- STOCK MANAGEMENT ---
        for (const item of items) {
           if (!mongoose.Types.ObjectId.isValid(item.productId)) continue;

           const productId = String(item.productId);
           const soldQty = Number(item.quantity) || 0;
           if (soldQty <= 0) continue;

           try {
               const product = await Product.findById(productId).lean();
               if (!product) continue;

               // Falls back through SKU / product name / unique price match when the cart
               // didn't carry a resolvable variationId - matters for multi-variant products,
               // since a single-variant product always resolves via its lone variant anyway.
               const variantId = resolveOrderItemVariantId(product, {
                   variantId: item.variationId,
                   sku: item.sku,
                   productName: item.name,
                   unitPrice: item.price,
               });
               if (!variantId) {
                   console.warn(`POS stock skip: could not resolve variant for product ${productId}`);
                   continue;
               }

               const variants = variantsFromProductDoc(product);
               const variant = findVariantById(variants, variantId)!;
               const prevStock = await getVariantStock(productId, variantId);
               const decremented = await decrementVariantStock(productId, variantId, soldQty);
               if (!decremented) {
                   console.warn(`POS stock decrement failed for ${productId}/${variantId}`);
                   continue;
               }

               await StockLedger.create({
                   product: productId,
                   variationId: variantId,
                   sku: resolveLedgerSku(variant.sku),
                   quantity: soldQty,
                   type: "OUT",
                   source: "POS",
                   referenceId: order._id,
                   previousStock: prevStock,
                   newStock: Math.max(0, prevStock - soldQty),
                   admin: adminId
               });
           } catch (err) {
               console.error("POS stock update error", err);
           }
        }

        return res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: order
        });

    } catch (error) {
        console.error("createPOSOrder CRASH:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error during POS Order creation",
            error: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
  }
);


/**
 * Initiate POS Online Order (Razorpay/Cashfree)
 */
export const initiatePOSOnlineOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      items,
      gateway,
      discountType,
      discountValue,
      deliveryCharge,
      salesPersonId,
      salesPersonName,
      salesPersonPhone,
    } = req.body;
    let { customerId } = req.body;

    if (!customerId || !items || !items.length || !gateway) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Handle Walk-in Customer
    if (customerId === "walk-in-customer") {
      let walkIn = await Customer.findOne({ email: "walkin@pos.com" });
      if (!walkIn) {
         try {
            walkIn = await Customer.create({
                name: "Walk-in Customer",
                email: "walkin@pos.com",
                phone: "0000000000",
                status: "Active",
            });
         } catch (err) {
            console.error("Error creating walk-in customer", err);
         }
      }
      if (walkIn) customerId = walkIn._id;
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    // Calculate Total
    let subtotal = 0;
    let taxTotal = 0;
    const orderItemsPayload = [];

    for (const item of items) {
       let productData: any = {
           productName: item.name || "Custom Item",
           mainImage: "",
           sku: "",
           seller: null
       };
       let productId = null;
       let product: any = null;
       let resolvedVariantId: string | undefined;

       if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
           product = await Product.findById(item.productId).populate('seller');
           if (product) {
               productId = product._id;
               resolvedVariantId = resolveOrderItemVariantId(product, {
                   variantId: item.variationId,
                   sku: item.sku,
                   productName: item.name,
                   unitPrice: item.price,
               });
               const variants = variantsFromProductDoc(product);
               const resolvedVariant = resolvedVariantId
                 ? findVariantById(variants, resolvedVariantId)
                 : undefined;
               productData = {
                   productName: product.productName,
                   mainImage: resolvedVariant?.mainImage || product.mainImage,
                   sku: resolvedVariant?.sku || "",
                   seller: product.seller ? ((product.seller as any)._id || product.seller) : null
               };
           }
       }

       const total = Number(item.price) * Number(item.quantity);
       subtotal += total;

       // Resolve HSN/GST: prefer per-line payload, then product, then defaults.
       const payloadHsnCode =
         typeof item.hsnCode === "string" && item.hsnCode.trim()
           ? item.hsnCode.trim()
           : typeof item.hsn === "string" && item.hsn.trim()
             ? item.hsn.trim()
             : "";
       const resolvedHsnCode =
         payloadHsnCode ||
         (typeof (product as any)?.hsnCode === "string" ? String((product as any).hsnCode).trim() : "");

       const payloadGstRateRaw =
         item.gst !== undefined && item.gst !== null && item.gst !== ""
           ? Number(item.gst)
           : item.gstPercent !== undefined && item.gstPercent !== null && item.gstPercent !== ""
             ? Number(item.gstPercent)
             : NaN;
       const resolvedGstRate = Number.isFinite(payloadGstRateRaw)
         ? payloadGstRateRaw
         : Number.isFinite(Number((product as any)?.gst))
           ? Number((product as any).gst)
           : 5;
       const safeGstRate = resolvedGstRate >= 0 ? resolvedGstRate : 5;
       const resolvedGstAmount = safeGstRate > 0
         ? Number(((total * safeGstRate) / (100 + safeGstRate)).toFixed(2))
         : 0;
       taxTotal += resolvedGstAmount;

        const payload: any = {
          productName: productData.productName,
          productImage: productData.mainImage,
          sku: productData.sku,
          mrp: Number(item.mrp) || 0,
          unitPrice: item.price,
          quantity: item.quantity,
          total: total,
          hsnCode: resolvedHsnCode,
          gst: safeGstRate,
          gstAmount: resolvedGstAmount,
          warrantyType: item.warrantyType || (product as any)?.warrantyType || "None",
          warrantyDuration: item.warrantyDuration || (product as any)?.warrantyDuration || "",
         status: "Pending" // Initial status
       };
       if (productId) payload.product = productId;
       if (resolvedVariantId) payload.variantId = resolvedVariantId;
       if (productData.seller) payload.seller = productData.seller;

       orderItemsPayload.push(payload);
    }

    // "Discount and Charges" popup extras - optional, absent when the
    // cashier never opened that popup.
    const { shipping, discount, total } = computeCharges(subtotal, {
      discountType,
      discountValue,
      deliveryCharge,
    });
    const salesPerson = resolveSalesPerson({ salesPersonId, salesPersonName, salesPersonPhone });

    // Create Pending Order
    const order = await Order.create({
      customer: customer._id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      deliveryAddress: {
        address: customer.address || "POS Order",
        city: customer.city || "POS",
        pincode: customer.pincode || "000000",
        state: customer.state || "POS"
      },
      items: [], // Will populate after creating items
      subtotal: subtotal,
      tax: Number(taxTotal.toFixed(2)),
      shipping,
      discount,
      ...(discountType ? { discountType, discountValue: Number(discountValue) || 0 } : {}),
      ...(salesPerson
        ? {
            salesPerson,
          }
        : {}),
      total,
      amountPaid: total,
      paymentMethod: gateway,
      paymentStatus: "Pending",
      status: "Pending",
      adminNotes: `POS Online Order via ${gateway}`
    });

    // Create Items
    const itemIds = [];
    for (const payload of orderItemsPayload) {
        payload.order = order._id;
        const item = await OrderItem.create(payload);
        itemIds.push(item._id);
    }
    order.items = itemIds;
    await order.save();

    // Initiate PhonePe payment
    const amountInPaise = Math.round(total * 100);
    const normalizedGateway = String(gateway || "").toLowerCase();
    const usePhonePe =
      normalizedGateway === "phonepe" ||
      normalizedGateway === "online" ||
      !normalizedGateway;

    if (!usePhonePe) {
      return res.status(400).json({ success: false, message: "Invalid Gateway. Use PhonePe or Online." });
    }

    if (!isPhonePeConfigured()) {
      return res.status(500).json({
        success: false,
        message: "PhonePe is not configured. Set PHONEPE_MERCHANT_ID and PHONEPE_SALT_KEY.",
      });
    }

    try {
      const merchantTransactionId = buildPhonePeMerchantTransactionId(
        "POS",
        order._id.toString()
      );
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(
        /\/$/,
        ""
      );
      const redirectUrl = `${frontendUrl}/admin/pos/success?order_id=${order._id}&merchantTransactionId=${merchantTransactionId}`;

      const phonePeResult = await initiatePhonePePayment({
        merchantTransactionId,
        merchantUserId: customer._id.toString(),
        amountPaise: amountInPaise,
        redirectUrl,
        mobileNumber: customer.phone || "9999999999",
      });

      order.paymentMethod = "PhonePe";
      order.paymentId = merchantTransactionId;
      order.adminNotes = "POS Online Order via PhonePe";
      await order.save();

      return res.status(200).json({
        success: true,
        data: {
          gateway: "PhonePe",
          orderId: order._id,
          merchantTransactionId,
          redirectUrl: phonePeResult.redirectUrl,
          amount: subtotal,
          customer: {
            name: customer.name,
            email: customer.email,
            contact: customer.phone,
          },
        },
      });
    } catch (error: any) {
      console.error("PhonePe Error:", error.response?.data || error.message || error);
      return res.status(500).json({
        success: false,
        message: error.message || "PhonePe gateway error",
      });
    }
  }
);

/**
 * Verify POS Online Payment
 */
export const verifyPOSPayment = asyncHandler(
  async (req: Request, res: Response) => {
    const { orderId, paymentId, merchantTransactionId } = req.body;
    const paymentRef = merchantTransactionId || paymentId;

    const result = await completePosOnlinePayment(req, orderId, paymentRef);
    if (!result.success) {
      return res.status(result.message === "Order not found" ? 404 : 400).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  }
);

/**
 * Get POS Report (Summary + Recent Orders)
 */
export const getPOSReport = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    let start: Date, end: Date;

    // Default to Today if no filter provided
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);
      // Ensure end date includes the full day if it's just a date string (e.g. YYYY-MM-DD)
      // If end date is same as start date or just a day, set it to end of that day?
      // Usually user sends YYYY-MM-DD. We treat start as 00:00 and end as 23:59:59.999
      // Assuming frontend sends precise or we adjust here.
      // Let's assume frontend sends ISO strings or plain dates.
      // If we just get "2023-01-01", "new Date()" sets it to 00:00 UTC (or local).
      // Safest is to handle "End of Day" logic if frontend sends same date.
      // But typically easier to rely on frontend sending correct timestamps.
      // We will trust the input for now, but ensure validity.
    } else {
      start = today;
      end = tomorrow;
    }

    // Common POS Check
    const posFilter = {
      $and: [
        {
          $or: [
            { adminNotes: { $regex: "POS", $options: "i" } },
            { "deliveryAddress.address": "POS Order" }
          ]
        },
        {
          adminNotes: { $not: { $regex: "POS Order - Seller:", $options: "i" } }
        }
      ]
    };

    // 1. Summary Query: Always respects the determined range (Default Today, or Filtered Range)
    const summaryQuery: any = {
      orderDate: { $gte: start, $lt: end },
      ...posFilter
    };

    // 2. List Query:
    // If Filter is applied: respect the range.
    // If No Filter (Default Dashboard): Show Recent 50 (Any Date)
    let listQuery: any;
    let limit = 50;

    if (startDate && endDate) {
        listQuery = { ...summaryQuery };
        limit = 500; // Increase limit for filtered reports to see more data
    } else {
        // Default Dashboard: Recent 50 (ignoring date, just last 50 POS orders)
        listQuery = { ...posFilter };
    }

    const summary = await Order.aggregate([
      { $match: summaryQuery },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$total" },
          totalOrders: { $count: {} },
          cashSales: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "Cash"] }, "$total", 0] }
          },
          onlineSales: {
            $sum: { $cond: [{ $ne: ["$paymentMethod", "Cash"] }, "$total", 0] }
          },
          paidAmount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, "$total", 0] }
          },
          unpaidAmount: {
            $sum: { $cond: [{ $ne: ["$paymentStatus", "Paid"] }, "$total", 0] }
          }
        }
      }
    ]);

    const recentOrders = await Order.find(listQuery)
      .sort({ orderDate: -1 })
      .limit(limit)
      .populate("customer", "name phone");

    return res.status(200).json({
      success: true,
      data: {
        summary: summary[0] || {
          totalSales: 0,
          totalOrders: 0,
          cashSales: 0,
          onlineSales: 0,
          paidAmount: 0,
          unpaidAmount: 0
        },
        orders: recentOrders,
        period: { start, end }
      }
    });
  }
);

/**
 * Get POS Stock Ledger
 */
export const getPOSStockLedger = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 50, productId, sku, type, startDate, endDate } = req.query;
    const query: any = {};

    if (productId) query.product = productId;
    if (sku) query.sku = sku;
    if (type) query.type = type;

    if (startDate && endDate) {
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        query.createdAt = { $gte: start, $lte: end };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [ledger, total] = await Promise.all([
      StockLedger.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit as string))
        .populate("product", "productName mainImage sku"),
      StockLedger.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: ledger,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  }
);

/**
 * Process POS Exchange
 */
export const processPOSExchange = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      customerId,
      returnItems, // [{ productId, variationId, quantity, price }]
      newItems     // [{ productId, variationId, quantity, price }]
    } = req.body;

    if (!customerId || !returnItems || !newItems) {
       return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Process Returns
      for (const item of returnItems) {
        if (mongoose.Types.ObjectId.isValid(item.productId)) {
          const product = await Product.findById(item.productId).session(session);
          if (product) {
            const qty = Number(item.quantity);
            const prevStock = product.stock;

            if (item.variationId && product.variations) {
              const vIndex = product.variations.findIndex((v: any) => v._id?.toString() === item.variationId.toString());
              if (vIndex > -1) {
                const prevVarStock = product.variations[vIndex].stock || 0;
                product.variations[vIndex].stock = prevVarStock + qty;
                product.stock = prevStock + qty;
                await product.save({ session });

                await StockLedger.create([{
                  product: product._id,
                  variationId: item.variationId,
                  sku: product.variations[vIndex].sku || product.sku,
                  quantity: qty,
                  type: "IN",
                  source: "EXCHANGE",
                  previousStock: prevVarStock,
                  newStock: product.variations[vIndex].stock,
                  admin: req.user?.userId
                }], { session });
              }
            } else {
              product.stock = prevStock + qty;
              await product.save({ session });

              await StockLedger.create([{
                  product: product._id,
                  sku: product.sku || "N/A",
                  quantity: qty,
                  type: "IN",
                  source: "EXCHANGE",
                  previousStock: prevStock,
                  newStock: product.stock,
                  admin: req.user?.userId
              }], { session });
            }
          }
        }
      }

      // 2. Process Sales
      for (const item of newItems) {
        if (mongoose.Types.ObjectId.isValid(item.productId)) {
          const product = await Product.findById(item.productId).session(session);
          if (product) {
            const qty = Number(item.quantity);
            const prevStock = product.stock;

            if (item.variationId && product.variations) {
              const vIndex = product.variations.findIndex((v: any) => v._id?.toString() === item.variationId.toString());
              if (vIndex > -1) {
                const prevVarStock = product.variations[vIndex].stock || 0;
                product.variations[vIndex].stock = Math.max(0, prevVarStock - qty);
                product.stock = Math.max(0, prevStock - qty);
                await product.save({ session });

                await StockLedger.create([{
                  product: product._id,
                  variationId: item.variationId,
                  sku: product.variations[vIndex].sku || product.sku,
                  quantity: qty,
                  type: "OUT",
                  source: "EXCHANGE",
                  previousStock: prevVarStock,
                  newStock: product.variations[vIndex].stock,
                  admin: req.user?.userId
                }], { session });
              }
            } else {
              product.stock = Math.max(0, prevStock - qty);
              await product.save({ session });

              await StockLedger.create([{
                  product: product._id,
                  sku: product.sku || "N/A",
                  quantity: qty,
                  type: "OUT",
                  source: "EXCHANGE",
                  previousStock: prevStock,
                  newStock: product.stock,
                  admin: req.user?.userId
              }], { session });
            }
          }
        }
      }

      // 3. Create a consolidated "Exchange Order" for record keeping if needed
      // For now, assume this logic is enough as per requirement "One transaction"

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        message: "Exchange processed successfully and stock updated"
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Exchange Error:", error);
      return res.status(500).json({ success: false, message: "Error processing exchange" });
    }
  }
);

/**
 * Delete POS Order and Restore Stock
 */
export const deletePOSOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Find the order with populated items
    const order = await Order.findById(id).populate('items');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Check if it's a POS order (has adminNotes containing "POS")
    if (!order.adminNotes?.includes('POS')) {
      return res.status(400).json({
        success: false,
        message: "Only POS orders can be deleted"
      });
    }

    // Note: Stock is intentionally NOT restored when deleting a POS order

    // Delete order items
    await OrderItem.deleteMany({ order: order._id });

    // Delete the order
    await Order.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "POS Order deleted successfully"
    });
  }
);
