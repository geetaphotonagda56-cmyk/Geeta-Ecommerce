import mongoose from "mongoose";
import { ImageVariants } from "../../types/imageVariants";

export type VariantStatus = "Available" | "Sold out" | "In stock";

export interface ProductVariant {
  _id?: mongoose.Types.ObjectId | string;
  variationType: string;
  value: string;
  name?: string;
  price: number;
  discPrice?: number;
  compareAtPrice?: number;
  wholesalePrice?: number;
  purchasePrice?: number;
  tieredPrices?: { minQty: number; price: number }[];
  stock: number;
  status?: VariantStatus;
  sku?: string;
  barcode?: string[];
  blockNumber?: string;
  rackNumber?: string;
  mainImage?: string;
  mainImageVariants?: ImageVariants;
  galleryImages?: string[];
  /** @deprecated use mainImage */
  image?: string;
}

export interface ProductListingComputed {
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  imageUrl: string | null;
  imageVariants?: ImageVariants | null;
  inStock: boolean;
}

export interface ProductWritePolicy {
  role: "admin" | "seller";
  sellerId?: string;
  defaultPublish: boolean;
  allowSellerAssignment: boolean;
  createInventoryRecord: boolean;
}
