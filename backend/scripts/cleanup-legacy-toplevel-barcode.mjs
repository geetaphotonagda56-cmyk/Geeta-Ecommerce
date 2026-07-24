// One-time cleanup: the Product schema used to have a top-level `barcode`
// field before the variant-model migration (see migrateProductVariantModel.ts)
// moved barcodes onto variations[].barcode. That migration never $unset the
// old field, so it still lingers on old documents - invisible to the app
// (not in the current IProduct schema) but still visible to raw Mongo
// queries, which is exactly what productWriteService's duplicate-barcode
// check used to query. That let a barcode freed up on one product (e.g. via
// bulk edit's "Attach Existing Product" deactivation) get permanently,
// falsely blocked forever, since nothing could ever clear the stray field.
// The duplicate-check code no longer looks at this field (see the
// accompanying code fix), but this clears the dead data too so it can't
// cause confusion elsewhere (e.g. barcode search).

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

const countBefore = await Product.countDocuments({ barcode: { $exists: true } });
console.log(`Products with a stray top-level "barcode" field: ${countBefore}`);

if (countBefore > 0) {
  const result = await Product.updateMany(
    { barcode: { $exists: true } },
    { $unset: { barcode: "" } }
  );
  console.log(`Cleared top-level barcode field from ${result.modifiedCount} product(s).`);
} else {
  console.log("Nothing to clean up.");
}

const countAfter = await Product.countDocuments({ barcode: { $exists: true } });
console.log(`Remaining products with the field: ${countAfter}`);

await mongoose.disconnect();
