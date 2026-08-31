/**
 * Follow-up to fixCloudinaryProductImages.ts: dumps every product/variant
 * that currently has no working main image (either cleared by that script,
 * or still stuck on a dead Cloudinary URL because the save failed) to a CSV
 * for the re-upload backlog.
 *
 * Usage:
 *   npx tsx src/scripts/exportImagelessProducts.ts [outputPath]
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Product from "../models/Product";

dotenv.config();

const CLOUDINARY_RE = /res\.cloudinary\.com/;
const isDead = (url: unknown): url is string => typeof url === "string" && CLOUDINARY_RE.test(url);

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  const outputPath = path.resolve(process.argv[2] || "imageless-products.csv");

  await mongoose.connect(uri);
  console.log("[export-imageless] Connected");

  const filter = {
    $or: [
      { "variations.mainImage": { $in: [null, ""] } },
      { "variations.mainImage": { $exists: false } },
      { "variations.mainImage": { $regex: CLOUDINARY_RE } },
    ],
  };

  const products = await Product.find(filter as any);
  console.log(`[export-imageless] ${products.length} product(s) scanned`);

  const rows: string[] = [
    ["productId", "productName", "categoryId", "variantValue", "sku", "stock", "status"].join(","),
  ];

  for (const product of products as any[]) {
    for (const v of product.variations) {
      const hasMainImage = typeof v.mainImage === "string" && v.mainImage.trim() !== "";
      const deadCloudinary = isDead(v.mainImage) || isDead(v.image);
      const empty = !hasMainImage;

      if (!empty && !deadCloudinary) continue;

      const status = deadCloudinary ? "dead_cloudinary_link" : "no_image";
      rows.push(
        [
          String(product._id),
          csvEscape(product.productName || ""),
          csvEscape(product.category ? String(product.category) : ""),
          csvEscape(v.value || v.variationType || "Default"),
          csvEscape(v.sku || ""),
          String(v.stock ?? ""),
          status,
        ].join(",")
      );
    }
  }

  fs.writeFileSync(outputPath, rows.join("\n") + "\n", "utf8");
  console.log(`[export-imageless] Wrote ${rows.length - 1} row(s) to ${outputPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
