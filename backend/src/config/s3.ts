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

// --- CloudFront setup runbook (manual, one-time, in the AWS console) ---
// 1. S3 console -> the existing bucket -> Properties -> note the bucket's
//    region and name (already in AWS_S3_BUCKET_NAME / AWS_REGION).
// 2. CloudFront console -> Create Distribution.
//    - Origin domain: select the S3 bucket (use the S3 origin type, not
//      "website endpoint").
//    - Origin access: "Origin access control settings (recommended)" ->
//      create a new OAC. CloudFront will show a bucket policy snippet
//      after creation — copy it.
//    - Viewer protocol policy: Redirect HTTP to HTTPS.
//    - Cache policy: CachingOptimized (default) is fine — these image
//      keys are effectively immutable (each upload gets a fresh
//      randomUUID-based key), so aggressive caching is safe.
// 3. S3 console -> bucket -> Permissions -> Bucket policy -> paste the
//    policy CloudFront generated in step 2. This restricts direct S3
//    reads to CloudFront only (recommended, but optional — buildAssetUrl
//    falls back to direct S3 URLs, so this repo's code works either way).
// 4. Wait for the distribution status to become "Deployed" (~5-15 min).
// 5. Set CLOUDFRONT_DOMAIN in backend/.env to the distribution's domain
//    name (the *.cloudfront.net one, or a custom domain if configured).
// 6. Restart the backend. New uploads and any URL built via buildAssetUrl
//    will now route through CloudFront. Existing already-stored URLs
//    (built before this env var was set) still point at S3 directly and
//    keep working — nothing needs to change for them.
//
// Optional: when set, asset URLs are built through CloudFront instead of
// hitting S3 directly. Unset (or the CloudFront distribution not yet
// created) fails open to the existing direct-S3 URL — see buildAssetUrl
// in s3Service.ts.
export const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || "";

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
