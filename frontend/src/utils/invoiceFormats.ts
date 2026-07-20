export type InvoiceFormat = "simple" | "gst";

export interface InvoiceCartLine {
  productName: string;
  qty: number;
  price: number; // Selling price (SP)
  compareAtPrice?: number; // MRP
  hsnCode?: string;
  gst?: number; // GST percent, e.g. 5
}

export interface InvoiceBillDetails {
  invoiceNum: string;
  date: string;
  time: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  cart: InvoiceCartLine[];
  total: number;
}

export interface InvoiceShopSettings {
  shopName?: string;
  address?: string;
  phone?: string;
  gst?: { text?: string; enabled?: boolean };
  fssai?: { text?: string; enabled?: boolean };
  notes?: { text?: string; enabled?: boolean };
  terms?: { text?: string; enabled?: boolean };
  qrCode?: string;
}

export const formatAmount = (amount: number): string => {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Splits a line's GST-inclusive selling price into taxable value + CGST/SGST,
 * grouped by GST rate so multiple rates can be summarized separately.
 */
export const buildGstSummary = (
  cart: InvoiceCartLine[]
): { rate: number; taxable: number; cgst: number; sgst: number }[] => {
  const groups: Record<number, { taxable: number; cgst: number; sgst: number }> = {};

  cart.forEach((item) => {
    const rate = item.gst ?? 0;
    const gross = item.price * item.qty;
    const taxable = rate > 0 ? gross / (1 + rate / 100) : gross;
    const tax = gross - taxable;

    if (!groups[rate]) groups[rate] = { taxable: 0, cgst: 0, sgst: 0 };
    groups[rate].taxable += taxable;
    groups[rate].cgst += tax / 2;
    groups[rate].sgst += tax / 2;
  });

  return Object.entries(groups).map(([rateStr, data]) => ({
    rate: Number(rateStr),
    ...data,
  }));
};
