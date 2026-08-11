import React from "react";
import { InvoiceBillDetails, InvoiceShopSettings } from "../../../utils/invoiceFormats";
import { formatAmount } from "../../../utils/priceUtils";

interface ThermalInvoiceProps {
  billDetails: InvoiceBillDetails;
  shopSettings?: InvoiceShopSettings | null;
}

/**
 * The "Estimated Bill" thermal-receipt layout - the primary/default POS bill
 * format. Shows the Total Qty / Total MRP / "You Saved" banner and a real
 * Subtotal / Discount / Delivery Charge breakdown that Simple/GST formats
 * don't. Shared by AdminPOSOrders.tsx, AdminOrderDeliveryDetail.tsx, and the
 * Bill Settings preview so all three stay pixel-identical.
 */
export const ThermalInvoice: React.FC<ThermalInvoiceProps> = ({ billDetails, shopSettings }) => {
  const { cart, total, subtotal, discountAmount, deliveryCharge, salesPersonName, isPartialPayment, amountPaid } = billDetails;

  let totalQty = 0;
  let totalMrp = 0;
  cart.forEach((item) => {
    const mrp = item.compareAtPrice && item.compareAtPrice > item.price ? item.compareAtPrice : item.price;
    totalQty += item.qty;
    totalMrp += mrp * item.qty;
  });
  const savings = totalMrp - total;
  const savingsPercent = totalMrp > 0 ? ((savings / totalMrp) * 100).toFixed(0) : "0";

  return (
    <div className="thermal-invoice-container text-black font-medium" style={{ fontFamily: "'Times New Roman', serif" }}>
      {/* Header */}
      <div className="text-left">
        <h1 className="text-3xl font-black uppercase">{shopSettings?.shopName || "GEETA"}</h1>
        <p className="text-base leading-tight whitespace-pre-wrap font-bold">{shopSettings?.address || ""}</p>
        <p className="text-base font-black">{shopSettings?.phone || ""}</p>
      </div>

      <div className="thermal-invoice-line-thick"></div>

      {/* Invoice Metadata */}
      <div className="space-y-1 text-base">
        <div className="flex justify-between">
          <span className="font-bold">Invoice Number:</span>
          <span className="font-bold">{billDetails.invoiceNum}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Invoice Date:</span>
          <span className="font-bold">{billDetails.date} {billDetails.time}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Payment Status:</span>
          <span className="font-bold">{billDetails.paymentMethod || "Cash"}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Customer Name:</span>
          <span className="font-bold">{billDetails.customerName || "Walk-in Customer"}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Mobile:</span>
          <span className="font-bold">{billDetails.customerPhone || "-"}</span>
        </div>
      </div>

      <div className="thermal-invoice-line-thick"></div>

      <div className="text-center font-black text-base mb-1">Estimated Bill</div>

      {/* Items Table Headers */}
      <div className="grid grid-cols-12 gap-1 font-black text-base border-b-2 border-black pb-1">
        <div className="col-span-5">Item-name</div>
        <div className="col-span-2 text-center">Qty</div>
        <div className="col-span-2 text-right">MRP</div>
        <div className="col-span-1 text-right">Sp</div>
        <div className="col-span-2 text-right">Total</div>
      </div>

      {/* Items List */}
      <div className="py-2 space-y-2">
        {cart.map((item, idx) => {
          const mrp = item.compareAtPrice || item.price;
          const lineTotal = item.price * item.qty;
          return (
            <div key={idx} className="grid grid-cols-12 gap-1 text-[15px] leading-tight font-bold">
              <div className="col-span-5 font-bold">({idx + 1}) {item.productName}</div>
              <div className="col-span-2 text-center">{item.qty}</div>
              <div className="col-span-2 text-right">{mrp > 0 ? formatAmount(mrp) : "-"}</div>
              <div className="col-span-1 text-right">{formatAmount(item.price)}</div>
              <div className="col-span-2 text-right font-black">{formatAmount(lineTotal)}</div>
              {item.warrantyType && item.warrantyType !== 'None' && (
                <div className="col-span-12 text-[10px] md:text-sm text-gray-600 pl-4">
                  {item.warrantyType}: {item.warrantyDuration}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="thermal-invoice-line-thick"></div>

      {/* Summary Stats */}
      <div className="text-base">
        <div className="flex justify-between mb-1">
          <span className="font-bold">Total Qty.: {totalQty}</span>
          <span className="font-black">Total MRP: Rs {formatAmount(totalMrp)}</span>
        </div>
        {savings > 0 && (
          <div className="flex justify-between bg-gray-200 px-1 py-2 my-2 border-2 border-black" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
            <span className="font-black text-[18px] uppercase tracking-tighter">YOU SAVED {savingsPercent}%</span>
            <span className="font-black text-[18px]">{formatAmount(savings)}</span>
          </div>
        )}
      </div>

      <div className="thermal-invoice-line-thick"></div>

      {/* Charges Breakdown */}
      {subtotal !== undefined && (
        <div className="text-sm space-y-0.5 py-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatAmount(subtotal)}</span></div>
          {!!discountAmount && (
            <div className="flex justify-between"><span>Discount</span><span>- {formatAmount(discountAmount)}</span></div>
          )}
          {!!deliveryCharge && (
            <div className="flex justify-between"><span>Delivery Charge</span><span>+ {formatAmount(deliveryCharge)}</span></div>
          )}
          {salesPersonName && (
            <div className="flex justify-between"><span>Salesman</span><span>{salesPersonName}</span></div>
          )}
        </div>
      )}

      {/* Grand Total */}
      <div className="flex justify-between font-black text-xl py-1 border-y border-black mt-1">
        <span>Total bill amount:</span>
        <span>{formatAmount(total)}</span>
      </div>

      {isPartialPayment && (
        <div className="flex justify-between font-bold text-sm py-1">
          <span>Paid {formatAmount(amountPaid || 0)} &middot; Due</span>
          <span>{formatAmount(Math.max(0, total - (amountPaid || 0)))}</span>
        </div>
      )}

      {/* Footer / Notes */}
      <div className="text-center mt-6 space-y-2">
        <p className="text-sm font-bold">।। आपका विश्वास हमारी ताकत ।।</p>
        {shopSettings?.notes?.enabled && shopSettings?.notes?.text && (
          <p className="text-[10px] md:text-sm whitespace-pre-wrap">{shopSettings.notes.text}</p>
        )}
        {shopSettings?.qrCode && (
          <div className="mt-4 flex justify-center">
            <img src={shopSettings.qrCode} alt="QR" className="w-24 h-24 object-contain" style={{ WebkitPrintColorAdjust: "exact" }} loading="lazy" decoding="async" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ThermalInvoice;
