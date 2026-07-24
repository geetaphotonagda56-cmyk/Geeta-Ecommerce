// Why does saving any variation fail with "Barcode is already in use by
// another product: PEN STAND 30"? Read-only diagnostic - finds which
// product(s) currently share a barcode with "PEN STAND 30".

import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "../.env"), "utf8");
const MONGODB_URI = envText
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith("MONGODB_URI="))
  .replace(/^MONGODB_URI=/, "")
  .trim();

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;
const Product = db.collection("products");

const penStands = await Product.find({ productName: /pen stand 30/i }).toArray();
console.log(`Found ${penStands.length} product(s) named like "PEN STAND 30"`);

for (const p of penStands) {
  const ownBarcodes = Array.isArray(p.barcode) ? p.barcode : p.barcode ? [p.barcode] : [];
  const variationBarcodes = (p.variations || []).flatMap((v) =>
    Array.isArray(v.barcode) ? v.barcode : v.barcode ? [v.barcode] : []
  );
  const allBarcodes = [...new Set([...ownBarcodes, ...variationBarcodes])].filter(Boolean);

  console.log("\n--------------------------------------------------");
  console.log(`Product: ${p.productName}  (_id: ${p._id})`);
  console.log(`  publish: ${p.publish}`);
  console.log(`  own barcode field:`, ownBarcodes);
  console.log(`  variation barcodes:`, variationBarcodes);

  if (allBarcodes.length === 0) {
    console.log("  (no barcodes on this doc)");
    continue;
  }

  const conflicts = await Product.find({
    _id: { $ne: p._id },
    $or: [
      { barcode: { $in: allBarcodes } },
      { "variations.barcode": { $in: allBarcodes } },
    ],
  }).toArray();

  if (conflicts.length === 0) {
    console.log("  No other product shares these barcodes.");
  } else {
    console.log(`  CONFLICTS with ${conflicts.length} other product(s):`);
    for (const c of conflicts) {
      const cOwn = Array.isArray(c.barcode) ? c.barcode : c.barcode ? [c.barcode] : [];
      const cVar = (c.variations || []).flatMap((v) =>
        Array.isArray(v.barcode) ? v.barcode : v.barcode ? [v.barcode] : []
      );
      const shared = allBarcodes.filter((bc) => cOwn.includes(bc) || cVar.includes(bc));
      console.log(`    - ${c.productName} (_id: ${c._id}, publish: ${c.publish}) shares: ${shared.join(", ")}`);
    }
  }
}

await mongoose.disconnect();
