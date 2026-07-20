import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

// Validate configuration
if (
  !process.env.AWS_ACCESS_KEY_ID ||
  !process.env.AWS_SECRET_ACCESS_KEY ||
  !process.env.AWS_REGION ||
  !process.env.AWS_S3_BUCKET_NAME
) {
  console.warn("AWS S3 credentials not found in environment variables");
}

export default s3Client;

export const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME as string;
export const AWS_REGION = process.env.AWS_REGION as string;

// Folder structure constants (mirrors CLOUDINARY_FOLDERS - same conventions)
export const S3_FOLDERS = {
  PRODUCTS: "Geeta Stores/products",
  PRODUCT_GALLERY: "Geeta Stores/products/gallery",
  CATEGORIES: "Geeta Stores/categories",
  SUBCATEGORIES: "Geeta Stores/subcategories",
  COUPONS: "Geeta Stores/coupons",
  SELLERS: "Geeta Stores/sellers",
  SELLER_PROFILE: "Geeta Stores/sellers/profile",
  SELLER_DOCUMENTS: "Geeta Stores/sellers/documents",
  DELIVERY: "Geeta Stores/delivery",
  DELIVERY_DOCUMENTS: "Geeta Stores/delivery/documents",
  STORES: "Geeta Stores/stores",
  USERS: "Geeta Stores/users",
} as const;
