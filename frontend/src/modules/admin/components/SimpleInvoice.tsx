import React from "react";
import { InvoiceBillDetails, InvoiceShopSettings, formatAmount } from "../../../utils/invoiceFormats";

interface SimpleInvoiceProps {
  billDetails: InvoiceBillDetails;
  shopSettings?: InvoiceShopSettings | null;
}

export const SimpleInvoice: React.FC<SimpleInvoiceProps> = ({ billDetails, shopSettings }) => {
  const { cart, total } = billDetails;

  return (
    <div className="w-full max-w-sm mx-auto p-4 text-black font-mono text-xs bg-white">
      {/* Header */}
      <div className="text-center mb-4 border-b-2 border-dashed border-neutral-400 pb-4">
        <div className="text-lg font-bold uppercase">{shopSettings?.shopName || "GEETA"}</div>
        <div className="text-xs mt-1 whitespace-pre-wrap">{shopSettings?.address || "-"}</div>
        <div className="text-xs">Ph: {shopSettings?.phone || "-"}</div>
        <div className="text-xs mt-2">Invoice #{billDetails.invoiceNum}</div>
        <div className="text-xs">{billDetails.date} {billDetails.time}</div>
      </div>

      {/* Items Table */}
      <div className="mb-4">
        <div className="grid grid-cols-12 gap-1 mb-2 pb-2 border-b border-neutral-400 font-bold">
          <div className="col-span-5">Item</div>
          <div className="col-span-2 text-center">Qty</div>
          <div className="col-span-2 text-right">MRP</div>
          <div className="col-span-1 text-right">SP</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
        {cart.map((item, index) => {
          const mrp = item.compareAtPrice || item.price;
          const lineTotal = item.price * item.qty;
          return (
            <div key={index} className="grid grid-cols-12 gap-1 mb-2 text-xs">
              <div className="col-span-5 truncate">({index + 1}) {item.productName}</div>
              <div className="col-span-2 text-center">{item.qty}</div>
              <div className="col-span-2 text-right">{mrp > 0 ? formatAmount(mrp) : "-"}</div>
              <div className="col-span-1 text-right">{formatAmount(item.price)}</div>
              <div className="col-span-2 text-right">{formatAmount(lineTotal)}</div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="border-t-2 border-dashed border-neutral-400 pt-3 space-y-2">
        <div className="flex justify-between font-bold text-sm">
          <span>Total:</span>
          <span>{formatAmount(total)}</span>
        </div>
      </div>

      {/* Payment & Footer */}
      <div className="mt-4 pt-4 border-t-2 border-dashed border-neutral-400 text-center space-y-2">
        <div className="text-xs">Payment: {billDetails.paymentMethod || "Cash"}</div>
        {billDetails.customerName && (
          <div className="text-xs">Customer: {billDetails.customerName}</div>
        )}
        {shopSettings?.notes?.enabled && shopSettings?.notes?.text && (
          <div className="text-xs mt-3 whitespace-pre-wrap">{shopSettings.notes.text}</div>
        )}
        {shopSettings?.terms?.enabled && shopSettings?.terms?.text && (
          <div className="text-xs mt-2 whitespace-pre-wrap">{shopSettings.terms.text}</div>
        )}
        <div className="text-xs mt-3">Thank you for your purchase!</div>
        {shopSettings?.qrCode && (
          <div className="mt-4 flex justify-center">
            <img src={shopSettings.qrCode} alt="QR" className="w-24 h-24 object-contain" />
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleInvoice;
