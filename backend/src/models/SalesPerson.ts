import mongoose, { Document, Schema } from "mongoose";

export interface ISalesPerson extends Document {
  name: string;
  phone: string;
  seller?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SalesPersonSchema = new Schema<ISalesPerson>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    // null for entries created from Admin POS; set for entries created from
    // a specific seller's POS, so seller rosters don't mix.
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

SalesPersonSchema.index({ seller: 1, phone: 1 });
SalesPersonSchema.index({ seller: 1, name: 1 });

const SalesPerson =
  mongoose.models.SalesPerson || mongoose.model<ISalesPerson>("SalesPerson", SalesPersonSchema);

export default SalesPerson;
