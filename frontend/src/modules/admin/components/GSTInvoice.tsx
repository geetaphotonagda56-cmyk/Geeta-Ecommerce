import React from "react";
import { InvoiceBillDetails, InvoiceShopSettings, formatAmount, buildGstSummary } from "../../../utils/invoiceFormats";

interface GSTInvoiceProps {
  billDetails: InvoiceBillDetails;
  shopSettings?: InvoiceShopSettings | null;
}

const cellStyle: React.CSSProperties = {
  border: "1px solid #d9d9d9",
  padding: "7px 6px",
  fontSize: 12,
  verticalAlign: "top",
};

const rightCellStyle: React.CSSProperties = { ...cellStyle, textAlign: "right" };

export const GSTInvoice: React.FC<GSTInvoiceProps> = ({ billDetails, shopSettings }) => {
  const { cart, total } = billDetails;

  const rows = cart.map((item) => ({
    ...item,
    netAmt: item.price * item.qty,
    halfRate: (item.gst ?? 0) / 2,
  }));

  const gstSummary = buildGstSummary(cart);
  const grossAmount = gstSummary.reduce((s, g) => s + g.taxable, 0);
  const taxAmount = gstSummary.reduce((s, g) => s + g.cgst + g.sgst, 0);
  const roundOff = Number((total - (grossAmount + taxAmount)).toFixed(2));

  return (
    <div
      className="w-full mx-auto bg-white text-black"
      style={{ maxWidth: 780, fontFamily: "Arial, sans-serif", padding: 24 }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.5 }}>
          {(shopSettings?.shopName || "GEETA STORES").toUpperCase()}
        </div>
        <div style={{ fontSize: 14, marginTop: 4, whiteSpace: "pre-wrap" }}>{shopSettings?.address || "-"}</div>
        <div style={{ fontSize: 14 }}>Mobile: {shopSettings?.phone || "-"}</div>
        {shopSettings?.gst?.enabled && shopSettings?.gst?.text && (
          <div style={{ fontSize: 13, marginTop: 2 }}>GSTIN: {shopSettings.gst.text}</div>
        )}
      </div>

      {/* Customer Details / Invoice Info */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, border: "1px solid #d9d9d9", padding: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Customer Details</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, margin: "2px 0" }}>
            <span>Name</span>
            <strong>{billDetails.customerName || "Walk-in Customer"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, margin: "2px 0" }}>
            <span>Phone</span>
            <span>{billDetails.customerPhone || "-"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, margin: "2px 0" }}>
            <span>GSTIN</span>
            <span>-</span>
          </div>
        </div>
        <div style={{ flex: 1, border: "1px solid #d9d9d9", padding: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Tax Invoice</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, margin: "2px 0" }}>
            <span>Bill No</span>
            <span>{billDetails.invoiceNum}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, margin: "2px 0" }}>
            <span>Date</span>
            <span>{billDetails.date}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, margin: "2px 0" }}>
            <span>Payment</span>
            <span>{billDetails.paymentMethod || "Cash"}</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f6f6f6" }}>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>S No</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>Item Name</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "left" }}>HSN Code</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "right" }}>MRP</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "right" }}>Quantity</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "right" }}>Rate/P</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "right" }}>CGST %</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "right" }}>SGST %</th>
            <th style={{ ...cellStyle, fontWeight: 700, textAlign: "right" }}>Net Amt.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, idx) => (
            <tr key={idx}>
              <td style={cellStyle}>{idx + 1}</td>
              <td style={cellStyle}>{item.productName}</td>
              <td style={cellStyle}>{item.hsnCode || "-"}</td>
              <td style={rightCellStyle}>{formatAmount(item.compareAtPrice || item.price)}</td>
              <td style={rightCellStyle}>{item.qty.toFixed(2)}</td>
              <td style={rightCellStyle}>{formatAmount(item.price)}</td>
              <td style={rightCellStyle}>{item.halfRate.toFixed(2)}</td>
              <td style={rightCellStyle}>{item.halfRate.toFixed(2)}</td>
              <td style={rightCellStyle}>{formatAmount(item.netAmt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* GST Summary + Totals */}
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1, border: "1px solid #d9d9d9", padding: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>GST Summary</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...cellStyle, fontSize: 11 }}>Type of Tax</th>
                <th style={{ ...cellStyle, fontSize: 11 }}>%</th>
                <th style={{ ...cellStyle, fontSize: 11, textAlign: "right" }}>Taxable</th>
                <th style={{ ...cellStyle, fontSize: 11, textAlign: "right" }}>Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              {gstSummary.map((g) => (
                <React.Fragment key={g.rate}>
                  <tr>
                    <td style={{ ...cellStyle, fontSize: 11 }}>CGST</td>
                    <td style={{ ...cellStyle, fontSize: 11 }}>{(g.rate / 2).toFixed(1)}%</td>
                    <td style={{ ...cellStyle, fontSize: 11, textAlign: "right" }}>{formatAmount(g.taxable)}</td>
                    <td style={{ ...cellStyle, fontSize: 11, textAlign: "right" }}>{formatAmount(g.cgst)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...cellStyle, fontSize: 11 }}>SGST</td>
                    <td style={{ ...cellStyle, fontSize: 11 }}>{(g.rate / 2).toFixed(1)}%</td>
                    <td style={{ ...cellStyle, fontSize: 11, textAlign: "right" }}>{formatAmount(g.taxable)}</td>
                    <td style={{ ...cellStyle, fontSize: 11, textAlign: "right" }}>{formatAmount(g.sgst)}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ width: 260, border: "1px solid #d9d9d9", padding: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, margin: "4px 0" }}>
            <span>Gross Amt.</span>
            <strong>{formatAmount(grossAmount)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, margin: "4px 0" }}>
            <span>GST Amt.</span>
            <strong>{formatAmount(taxAmount)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, margin: "4px 0" }}>
            <span>Round Off</span>
            <strong>{formatAmount(roundOff)}</strong>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 17,
              fontWeight: 800,
              marginTop: 8,
              borderTop: "1px dashed #999",
              paddingTop: 6,
            }}
          >
            <span>Total Amount</span>
            <strong>{formatAmount(total)}</strong>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, marginTop: 12 }}>Amt in words: {formatAmount(total)} only</p>

      {(shopSettings?.notes?.enabled && shopSettings?.notes?.text) && (
        <p style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>{shopSettings.notes.text}</p>
      )}
      {(shopSettings?.terms?.enabled && shopSettings?.terms?.text) && (
        <p style={{ marginTop: 6, fontSize: 11, whiteSpace: "pre-wrap" }}>{shopSettings.terms.text}</p>
      )}

      <p style={{ marginTop: 28, textAlign: "right", fontWeight: 700, fontSize: 13 }}>Authorised Signature</p>

      {shopSettings?.qrCode && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <img src={shopSettings.qrCode} alt="QR" style={{ width: 96, height: 96, objectFit: "contain" }} loading="lazy" decoding="async" />
        </div>
      )}
    </div>
  );
};

export default GSTInvoice;
