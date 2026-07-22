import { Request } from "express";
import Order from "../../models/Order";
import OrderItem from "../../models/OrderItem";
import Product from "../../models/Product";
import StockLedger from "../../models/StockLedger";
import {
  getPhonePePaymentStatus,
  isPhonePeConfigured,
} from "../../services/phonepeService";
import {
  decrementVariantStock,
  getVariantStock,
} from "../product/variantStockService";
import {
  findVariantById,
  resolveLedgerSku,
  resolveOrderItemVariantId,
  variantsFromProductDoc,
} from "../product/variantHelpers";

/**
 * Verify PhonePe payment (when configured) and mark POS online order complete + deduct stock.
 */
export async function completePosOnlinePayment(
  req: Request,
  orderId: string,
  paymentRef?: string
): Promise<{ success: boolean; message: string }> {
  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found" };
  }

  if (order.paymentStatus === "Paid") {
    return { success: true, message: "Order already paid" };
  }

  const merchantTransactionId =
    paymentRef || order.paymentId || undefined;

  if (merchantTransactionId && isPhonePeConfigured()) {
    const status = await getPhonePePaymentStatus(merchantTransactionId);
    if (!status.success) {
      return {
        success: false,
        message: `Payment not completed (${status.state || "UNKNOWN"})`,
      };
    }
    order.paymentId = status.transactionId || merchantTransactionId;
  }

  const isSellerPos = String(order.adminNotes || "").includes(
    "POS Order - Seller:"
  );
  const sellerId = isSellerPos
    ? String(order.adminNotes || "")
        .match(/POS Order - Seller:\s*([a-f\d]{24})/i)?.[1]
    : undefined;

  order.paymentStatus = "Paid";
  order.status = "Delivered";
  order.deliveryBoyStatus = "Delivered";
  order.deliveredAt = new Date();
  order.adminNotes =
    (order.adminNotes || "") +
    `\nPayment Verified (ID: ${order.paymentId || paymentRef || "N/A"})`;

  await order.save();

  const orderItems = await OrderItem.find({ order: order._id });
  for (const item of orderItems) {
    if (!item.product) continue;

    const soldQty = Number(item.quantity) || 0;
    if (soldQty <= 0) continue;

    try {
      const productId = String(item.product);
      const product = await Product.findById(productId).lean();
      if (!product) continue;

      // Prefer the variant resolved at order-creation time; fall back to
      // re-resolving (SKU / name / price / single-variant) for older orders
      // placed before variantId was stored on the OrderItem.
      const variantId = (item as any).variantId
        ? String((item as any).variantId)
        : resolveOrderItemVariantId(product, {
            sku: item.sku,
            productName: item.productName,
            unitPrice: item.unitPrice,
          });

      if (!variantId) {
        console.warn(`POS online stock skip: could not resolve variant for product ${productId}`);
        continue;
      }

      const variants = variantsFromProductDoc(product);
      const variant = findVariantById(variants, variantId);
      const prevStock = await getVariantStock(productId, variantId);
      const decremented = await decrementVariantStock(productId, variantId, soldQty);
      if (!decremented) {
        console.warn(`POS online stock decrement failed for ${productId}/${variantId}`);
        continue;
      }

      const newStock = Math.max(0, prevStock - soldQty);

      await StockLedger.create({
        product: productId,
        variationId: variantId,
        sku: resolveLedgerSku(variant?.sku, item.sku),
        quantity: soldQty,
        type: "OUT",
        source: "POS",
        referenceId: order._id,
        previousStock: prevStock,
        newStock,
        ...(sellerId ? { seller: sellerId } : { admin: req.user?.userId }),
      });

      const io = req.app.get("io");
      if (io) {
        io.emit("stock-update", { productId, newStock });
      }
    } catch (err) {
      console.error("POS online stock update error", err);
    }
  }

  await OrderItem.updateMany({ order: order._id }, { status: "Delivered" });

  return { success: true, message: "Payment verified and order completed" };
}
