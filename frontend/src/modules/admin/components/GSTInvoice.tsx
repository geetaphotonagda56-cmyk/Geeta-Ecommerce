import React from "react";
import { InvoiceBillDetails, InvoiceShopSettings, formatAmount } from "../../../utils/invoiceFormats";

interface GSTInvoiceProps {
  billDetails: InvoiceBillDetails;
  shopSettings?: InvoiceShopSettings | null;
}

const cellStyle: React.CSSProperties = {
  border: "1px solid #000",
  padding: "6px 8px",
  fontSize: 11,
  verticalAlign: "top",
};

export const GSTInvoice: React.FC<GSTInvoiceProps> = ({ billDetails, shopSettings }) => {
  const { cart, total } = billDetails;

  const lines = cart.map((item) => {
    const gross = item.price * item.qty;
    const discount = 0;
    const netBeforeTax = gross - discount;
    const rate = item.gst ?? 0;
    const taxable = rate > 0 ? netBeforeTax / (1 + rate / 100) : netBeforeTax;
    const taxAmount = netBeforeTax - taxable;
    return { ...item, gross, discount, taxable, rate, taxAmount, lineTotal: netBeforeTax };
  });

  const totalDiscount = lines.reduce((s, l) => s + l.discount, 0);
  const totalTaxable = lines.reduce((s, l) => s + l.taxable, 0);
  const totalTax = lines.reduce((s, l) => s + l.taxAmount, 0);

  return (
    <div
      className="w-full mx-auto bg-white text-black"
      style={{ maxWidth: 780, fontFamily: "Arial, sans-serif", padding: 20, fontSize: 12 }}
    >
      {/* Top row: Bill To  |  Tax Invoice */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>BILL TO:</div>
          <div style={{ fontWeight: 700 }}>{billDetails.customerName || "Walk-in Customer"}</div>
          <div>{shopSettings?.address || "-"}</div>
          <div>Place of Supply : {shopSettings?.gst?.text ? shopSettings.gst.text.slice(0, 2) : "-"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Tax Invoice</div>
          <div style={{ fontSize: 11, color: "#333" }}>Original For Recipient</div>
        </div>
      </div>

      {/* Second row: Ship To | PO number + logo + invoice meta */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700 }}>SHIP TO:</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {(billDetails.customerName || "WALK-IN CUSTOMER").toUpperCase()}
          </div>
          <div>{shopSettings?.address || "-"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div>Purchase Order Number</div>
            <div style={{ fontWeight: 700 }}>{billDetails.invoiceNum}</div>
          </div>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "var(--primary-color, #ec4899)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 10,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            {shopSettings?.shopName ? shopSettings.shopName.slice(0, 8) : "STORE"}
          </div>
          <div style={{ textAlign: "right" }}>
            <div>Invoice Date</div>
            <div style={{ fontWeight: 700 }}>{billDetails.date} {billDetails.time}</div>
            <div style={{ marginTop: 4 }}>Order Date</div>
            <div style={{ fontWeight: 700 }}>{billDetails.date} {billDetails.time}</div>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right", fontSize: 11 }}>
        <div>Invoice Number</div>
        <div style={{ fontWeight: 700 }}>{billDetails.invoiceNum}</div>
      </div>

      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
        <thead>
          <tr>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>SN.</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Description</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>HSN</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Qty.</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Gross Amount</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Discount</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Taxable Value</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Taxes</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((item, idx) => (
            <tr key={idx}>
              <td style={cellStyle}>{idx + 1}</td>
              <td style={cellStyle}>{item.productName}</td>
              <td style={cellStyle}>{item.hsnCode || "-"}</td>
              <td style={cellStyle}>{item.qty}</td>
              <td style={cellStyle}>Rs.{formatAmount(item.gross)}</td>
              <td style={cellStyle}>Rs.{formatAmount(item.discount)}</td>
              <td style={cellStyle}>Rs.{formatAmount(item.taxable)}</td>
              <td style={cellStyle}>
                {item.rate > 0 ? `IGST @${item.rate.toFixed(1)}% :Rs.${formatAmount(item.taxAmount)}` : "-"}
              </td>
              <td style={cellStyle}>Rs.{formatAmount(item.lineTotal)}</td>
            </tr>
          ))}
          <tr>
            <td style={cellStyle}></td>
            <td style={cellStyle}></td>
            <td style={cellStyle}></td>
            <td style={cellStyle}></td>
            <td style={cellStyle}></td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>Rs.{formatAmount(totalDiscount)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>Rs.{formatAmount(totalTaxable)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>Rs.{formatAmount(totalTax)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>Rs.{formatAmount(total)}</td>
          </tr>
        </tbody>
      </table>

      {(shopSettings?.notes?.enabled && shopSettings?.notes?.text) && (
        <p style={{ marginTop: 12, fontSize: 11, whiteSpace: "pre-wrap" }}>{shopSettings.notes.text}</p>
      )}
      {(shopSettings?.terms?.enabled && shopSettings?.terms?.text) && (
        <p style={{ marginTop: 6, fontSize: 11, whiteSpace: "pre-wrap" }}>{shopSettings.terms.text}</p>
      )}

      {shopSettings?.qrCode && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <img src={shopSettings.qrCode} alt="QR" style={{ width: 96, height: 96, objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
};

export default GSTInvoice;
