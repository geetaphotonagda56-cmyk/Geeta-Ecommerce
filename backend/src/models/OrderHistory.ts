import mongoose, { Document, Schema } from "mongoose";

// One snapshot line item, used for both the before/after item lists.
interface IOrderHistoryLineItem {
  product?: mongoose.Types.ObjectId;
  productName: string;
  sku?: string;
  variation?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// A single returned line captured for this edit, kept even after the
// underlying OrderItem is deleted so it stays visible in bill history.
interface IOrderHistoryReturnLine {
  product?: mongoose.Types.ObjectId;
  productName: string;
  sku?: string;
  variation?: string;
  quantity: number;
  restocked: boolean;
}

export interface IOrderHistory extends Document {
  order: mongoose.Types.ObjectId;
  editedByAdmin?: mongoose.Types.ObjectId;
  editedBySeller?: mongoose.Types.ObjectId;
  editedByName?: string;
  itemsBefore: IOrderHistoryLineItem[];
  itemsAfter: IOrderHistoryLineItem[];
  returns: IOrderHistoryReturnLine[];
  totalsBefore: { subtotal: number; tax: number; total: number };
  totalsAfter: { subtotal: number; tax: number; total: number };
  createdAt: Date;
}

const LineItemSchema = new Schema<IOrderHistoryLineItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, trim: true, required: true },
    sku: { type: String, trim: true },
    variation: { type: String, trim: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const ReturnLineSchema = new Schema<IOrderHistoryReturnLine>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, trim: true, required: true },
    sku: { type: String, trim: true },
    variation: { type: String, trim: true },
    quantity: { type: Number, required: true },
    restocked: { type: Boolean, default: true },
  },
  { _id: false }
);

const OrderHistorySchema = new Schema<IOrderHistory>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order is required"],
    },
    editedByAdmin: { type: Schema.Types.ObjectId, ref: "Admin" },
    editedBySeller: { type: Schema.Types.ObjectId, ref: "Seller" },
    editedByName: { type: String, trim: true },
    itemsBefore: { type: [LineItemSchema], default: [] },
    itemsAfter: { type: [LineItemSchema], default: [] },
    returns: { type: [ReturnLineSchema], default: [] },
    totalsBefore: {
      subtotal: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    totalsAfter: {
      subtotal: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

OrderHistorySchema.index({ order: 1, createdAt: -1 });

const OrderHistory =
  mongoose.models.OrderHistory ||
  mongoose.model<IOrderHistory>("OrderHistory", OrderHistorySchema);

export default OrderHistory;
