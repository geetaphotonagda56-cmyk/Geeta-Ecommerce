/**
 * Follow-up to migrateProductVariantModel.ts: that script's $unset of legacy
 * root-level fields (price/stock/sku/etc.) silently did not persist on most
 * documents, leaving stale values that will cause getLegacyRootStock() to
 * report wrong (frozen, too-high) stock once variations[].stock is decremented
 * by real sales. This removes those now-redundant fields via the native
 * driver, only on products that already have a populated variations array.
 *
 * Usage:
 *   npx tsx src/scripts/cleanupLegacyProductFields.ts [--dry-run]
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "../models/Product";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

const LEGACY_FIELDS = [
  "price",
  "discPrice",
  "compareAtPrice",
  "wholesalePrice",
  "purchasePrice",
  "stock",
  "mainImage",
  "galleryImages",
  "sku",
  "barcode",
  "rackNumber",
  "variationType",
  "unitPricing",
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`[cleanup] Connected (dryRun=${DRY_RUN})`);

  const existsOr = LEGACY_FIELDS.map((f) => ({ [f]: { $exists: true } }));
  const filter = {
    "variations.0": { $exists: true },
    $or: existsOr,
  };

  const count = await Product.countDocuments(filter as any);
  console.log(`[cleanup] ${count} migrated products still carry at least one stale legacy field`);

  if (!DRY_RUN && count > 0) {
    const unsetDoc = Object.fromEntries(LEGACY_FIELDS.map((f) => [f, ""]));
    const result = await Product.collection.updateMany(filter as any, {
      $unset: unsetDoc,
    });
    console.log(`[cleanup] Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  }

  const remaining = await Product.countDocuments(filter as any);
  console.log(`[cleanup] ${remaining} migrated products still carry a stale legacy field after run`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
