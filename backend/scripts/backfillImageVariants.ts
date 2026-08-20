/**
 * One-time migration: generate imageVariants for existing documents that
 * predate the responsive-image pipeline.
 *
 * Idempotent — skips any document that already has imageVariants, so it's
 * safe to stop (Ctrl+C) and re-run. Rate-limited by processing documents
 * strictly sequentially (one at a time, no parallel requests) with a fixed
 * delay between items, because this reads/writes the live production S3
 * bucket and Atlas cluster.
 *
 * Usage:
 *   node -r tsx/cjs backend/scripts/backfillImageVariants.ts --dry-run
 *   node -r tsx/cjs backend/scripts/backfillImageVariants.ts --collection=products
 *   node -r tsx/cjs backend/scripts/backfillImageVariants.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../src/models/Product";
import Category from "../src/models/Category";
import Shop from "../src/models/Shop";
import { Banner } from "../src/models/Banner";
import { backfillVariantsForKey, keyFromAssetUrl } from "../src/services/s3Service";

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const collectionFilter = args
  .find((a) => a.startsWith("--collection="))
  ?.split("=")[1];
const DELAY_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Summary {
  processed: number;
  skipped: number;
  failed: number;
}

async function backfillProducts(summary: Summary) {
  const products = await Product.find({
    "variations.mainImage": { $exists: true, $ne: "" },
  });

  for (const product of products) {
    let changed = false;
    for (const variant of product.variations as any[]) {
      if (variant.mainImageVariants || !variant.mainImage) {
        if (variant.mainImageVariants) summary.skipped++;
        continue;
      }
      const key = keyFromAssetUrl(variant.mainImage);
      if (!key) {
        console.warn(`[products] Could not parse S3 key from ${variant.mainImage}`);
        summary.failed++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`[dry-run][products] would backfill ${product._id} variant ${variant._id} (${key})`);
        summary.processed++;
        continue;
      }
      try {
        const variants = await backfillVariantsForKey(key);
        if (variants) {
          variant.mainImageVariants = variants;
          changed = true;
          summary.processed++;
        } else {
          summary.failed++;
        }
      } catch (err) {
        console.error(`[products] Failed for ${product._id}:`, err);
        summary.failed++;
      }
      await sleep(DELAY_MS);
    }
    if (changed) {
      product.markModified("variations");
      await product.save();
    }
  }
}

async function backfillSimpleCollection(
  name: string,
  model: any,
  imageField: string,
  variantsField: string,
  summary: Summary
) {
  const docs = await model.find({
    [imageField]: { $exists: true, $ne: "" },
    [variantsField]: { $exists: false },
  });

  for (const doc of docs) {
    const key = keyFromAssetUrl(doc[imageField]);
    if (!key) {
      console.warn(`[${name}] Could not parse S3 key from ${doc[imageField]}`);
      summary.failed++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`[dry-run][${name}] would backfill ${doc._id} (${key})`);
      summary.processed++;
      continue;
    }
    try {
      const variants = await backfillVariantsForKey(key);
      if (variants) {
        doc[variantsField] = variants;
        await doc.save();
        summary.processed++;
      } else {
        summary.failed++;
      }
    } catch (err) {
      console.error(`[${name}] Failed for ${doc._id}:`, err);
      summary.failed++;
    }
    await sleep(DELAY_MS);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log(`Connected. dry-run=${DRY_RUN} collection=${collectionFilter || "all"}`);

  const summary: Summary = { processed: 0, skipped: 0, failed: 0 };

  if (!collectionFilter || collectionFilter === "products") {
    await backfillProducts(summary);
  }
  if (!collectionFilter || collectionFilter === "categories") {
    await backfillSimpleCollection("categories", Category, "image", "imageVariants", summary);
  }
  if (!collectionFilter || collectionFilter === "shops") {
    await backfillSimpleCollection("shops", Shop, "image", "imageVariants", summary);
  }
  if (!collectionFilter || collectionFilter === "banners") {
    await backfillSimpleCollection("banners", Banner, "imageUrl", "imageVariants", summary);
  }

  console.log("\nSummary:", summary);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
