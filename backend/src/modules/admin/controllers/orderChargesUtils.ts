import mongoose from "mongoose";

export interface ChargesInput {
  discountType?: "%" | "₹";
  discountValue?: number | string;
  deliveryCharge?: number | string;
}

export interface ComputedCharges {
  shipping: number;
  discount: number;
  total: number;
}

// Single source of truth for turning the "Discount and Charges" popup's raw
// inputs into shipping/discount/total. Used by order create, POS-online
// create, and order edit so the three paths can never drift from each other.
export function computeCharges(subtotal: number, input: ChargesInput): ComputedCharges {
  const shipping = Number(input.deliveryCharge) > 0 ? Number(input.deliveryCharge) : 0;
  const discount =
    input.discountType === "%"
      ? (subtotal * (Number(input.discountValue) || 0)) / 100
      : Number(input.discountValue) > 0
        ? Number(input.discountValue)
        : 0;
  const total = Math.max(0, subtotal + shipping - discount);
  return { shipping, discount, total };
}

export interface SalesPersonInput {
  salesPersonId?: string;
  salesPersonName?: string;
  salesPersonPhone?: string;
}

export function resolveSalesPerson(input: SalesPersonInput) {
  if (!input.salesPersonName) return undefined;
  return {
    id:
      input.salesPersonId && mongoose.Types.ObjectId.isValid(input.salesPersonId)
        ? input.salesPersonId
        : undefined,
    name: input.salesPersonName,
    phone: input.salesPersonPhone || undefined,
  };
}

export interface PartialPaymentInput {
  paymentMethod: string;
  total: number;
  isPartialPayment?: boolean;
  amountPaid?: number | string;
  // Falls back to this when the caller didn't send a new amountPaid (edit
  // flow re-using the order's previously collected amount).
  existingAmountPaid?: number;
}

export interface PartialPaymentResult {
  isPartialPayment: boolean;
  amountPaid: number;
  paymentStatus: "Paid" | "Partial" | "Pending";
}

// Single source of truth for how a payment method + partial-payment inputs
// translate into isPartialPayment/amountPaid/paymentStatus. Partial payment
// is only meaningful for Cash - Credit/Online are already their own
// "not fully settled in hand" concepts.
export function resolvePaymentStatus(input: PartialPaymentInput): PartialPaymentResult {
  if (input.paymentMethod === "Credit") {
    return { isPartialPayment: false, amountPaid: input.total, paymentStatus: "Pending" };
  }

  if (input.paymentMethod === "Cash" && input.isPartialPayment) {
    const requested =
      input.amountPaid !== undefined ? Number(input.amountPaid) || 0 : Number(input.existingAmountPaid) || 0;
    const paid = Math.min(requested, input.total);
    return {
      isPartialPayment: true,
      amountPaid: paid,
      paymentStatus: paid >= input.total ? "Paid" : "Partial",
    };
  }

  return { isPartialPayment: false, amountPaid: input.total, paymentStatus: "Paid" };
}
