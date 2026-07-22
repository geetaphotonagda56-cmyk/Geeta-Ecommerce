import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Product from "../../../models/Product";
import StockLedger from "../../../models/StockLedger";
import { incrementVariantStock, getVariantStock } from "../../product/variantStockService";
import {
  findVariantById,
  resolveLedgerSku,
  resolveOrderItemVariantId,
  variantsFromProductDoc,
} from "../../product/variantHelpers";

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

    // Restriction: Cannot delete orders with customer names
    if (order.customerName && order.customerName.trim() !== "" && order.customerName.toLowerCase() !== "walk-in customer") {
      return res.status(403).json({
        success: false,
        message: "Orders with registered customer names cannot be deleted to maintain data integrity."
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

// Marks an order's adminNotes once its stock has been put back, so a second
// restore click (the bill stays visible and clickable after "restore only")
// can't credit the same quantity twice.
const STOCK_RESTORED_MARKER = "[STOCK_RESTORED]";

async function restoreOrderItemsStock(order: any, adminId: string | undefined) {
  const orderItems = await OrderItem.find({ order: order._id });

  for (const item of orderItems) {
    if (!item.product) continue;

    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;

    try {
      const productId = String(item.product);
      const product = await Product.findById(productId).lean();
      if (!product) continue;

      const variantId = (item as any).variantId
        ? String((item as any).variantId)
        : resolveOrderItemVariantId(product, {
            sku: item.sku,
            productName: item.productName,
            unitPrice: item.unitPrice,
          });

      if (!variantId) {
        console.warn(`POS order restore: could not resolve variant for product ${productId}`);
        continue;
      }

      const variants = variantsFromProductDoc(product);
      const variant = findVariantById(variants, variantId);
      const prevStock = await getVariantStock(productId, variantId);
      const restored = await incrementVariantStock(productId, variantId, qty);
      if (!restored) {
        console.warn(`POS order restore: stock restore failed for ${productId}/${variantId}`);
        continue;
      }

      await StockLedger.create({
        product: productId,
        variationId: variantId,
        sku: resolveLedgerSku(variant?.sku, item.sku),
        quantity: qty,
        type: "IN",
        source: "POS_CANCEL",
        referenceId: order._id,
        previousStock: prevStock,
        newStock: prevStock + qty,
        admin: adminId,
      });
    } catch (err) {
      console.error("POS order restore: stock restore error", err);
    }
  }
}

function assertDeletableWalkInPOSOrder(order: any) {
  if (!order.adminNotes?.includes('POS')) {
    return { status: 400, message: "Only POS orders can be deleted" };
  }
  if (order.customerName && order.customerName.trim() !== "" && order.customerName.toLowerCase() !== "walk-in customer") {
    return { status: 403, message: "Orders with registered customer names cannot be deleted to maintain data integrity." };
  }
  return null;
}

/**
 * Restore stock for every item on a POS order, then delete the order.
 * For bills created by mistake - unlike deletePOSOrder, this puts the sold
 * quantity back into inventory before removing the record.
 */
export const restorePOSOrderStockAndDelete = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await Order.findById(id).populate('items');
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const rejection = assertDeletableWalkInPOSOrder(order);
    if (rejection) {
      return res.status(rejection.status).json({ success: false, message: rejection.message });
    }

    // If stock was already put back via "restore only", don't double-credit it - just delete.
    if (!order.adminNotes?.includes(STOCK_RESTORED_MARKER)) {
      await restoreOrderItemsStock(order, req.user?.userId);
    }

    await OrderItem.deleteMany({ order: order._id });
    await Order.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "POS Order deleted and stock restored successfully"
    });
  }
);

/**
 * Restore stock for every item on a POS order, but keep the order/bill record.
 * For bills created by mistake where the invoice should stay for reference,
 * but the sold quantity needs to go back into inventory.
 */
export const restorePOSOrderStockOnly = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await Order.findById(id).populate('items');
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const rejection = assertDeletableWalkInPOSOrder(order);
    if (rejection) {
      return res.status(rejection.status).json({ success: false, message: rejection.message });
    }

    if (order.adminNotes?.includes(STOCK_RESTORED_MARKER)) {
      return res.status(400).json({
        success: false,
        message: "Stock has already been restored for this order."
      });
    }

    await restoreOrderItemsStock(order, req.user?.userId);

    order.adminNotes = `${order.adminNotes || ""}\n${STOCK_RESTORED_MARKER}`;
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Stock restored - bill kept for reference"
    });
  }
);
