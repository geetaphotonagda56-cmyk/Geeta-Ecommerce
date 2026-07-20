import mongoose, { Document, Schema } from 'mongoose';

export interface IRangeCard extends Document {
  imageUrl: string;
  label: string; // e.g. "UNDER ₹49", "ABOVE ₹1000"
  minPrice?: number;
  maxPrice?: number;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rangeCardSchema = new Schema<IRangeCard>(
  {
    imageUrl: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    minPrice: {
      type: Number,
      required: false,
      min: 0,
    },
    maxPrice: {
      type: Number,
      required: false,
      min: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const RangeCard = mongoose.model<IRangeCard>('RangeCard', rangeCardSchema);
