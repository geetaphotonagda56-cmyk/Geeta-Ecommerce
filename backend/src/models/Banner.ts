import mongoose, { Document, Schema } from 'mongoose';
import { ImageVariants } from '../types/imageVariants';

export interface IBanner extends Document {
  position: 'Main Banner' | 'Popup Banner' | 'Main Section Banner' | 'Deal of the Day' | 'Flash Deals' | 'Footer Banner';
  resourceType: 'Category' | 'Product' | 'None';
  resourceId?: string; // ID of the category or product
  resourceName?: string; // Store name for easier display, optional
  imageUrl: string;
  imageVariants?: ImageVariants;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<IBanner>(
  {
    position: {
      type: String,
      required: true,
      enum: ['Main Banner', 'Popup Banner', 'Main Section Banner', 'Deal of the Day', 'Flash Deals', 'Footer Banner'],
    },
    resourceType: {
      type: String,
      required: true,
      enum: ['Category', 'Product', 'None'],
      default: 'None',
    },
    resourceId: {
      type: String,
      required: false,
    },
    resourceName: {
      type: String,
      required: false,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    imageVariants: {
      w320: { type: String },
      w640: { type: String },
      w1024: { type: String },
      w1600: { type: String },
      original: { type: String },
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

export const Banner = mongoose.model<IBanner>('Banner', bannerSchema);
