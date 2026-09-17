// Report what "Shop by Store" actually contains in the database.
//
// For every Shop document it prints:
//   - the explicit `products[]` assignment (the primary path getStoreProducts uses)
//   - how many of those products still exist / are active / have an enabled seller
//   - the fallback path: products carrying isShopByStoreOnly + shopId === shop._id
//
// Usage:
//   node scripts/inspect-shop-by-store.mjs
//   MONGODB_URI="mongodb+srv://..." node scripts/inspect-shop-by-store.mjs
//
// Reads backend/.env when MONGODB_URI is not already in the environment.

import mongoose from "mongoose";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPath = resolve(__dirname, "../.env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*MONGODB_URI\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

const uri = loadUri();
if (!uri) {
  console.error("MONGODB_URI not found (no env var, no backend/.env). Pass it inline:");
  console.error('  MONGODB_URI="mongodb+srv://..." node scripts/inspect-shop-by-store.mjs');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}\n`);

const shops = await db.collection("shops").find({}).sort({ order: 1, name: 1 }).toArray();
const products = db.collection("products");
const sellers = db.collection("sellers");

const enabledSellerIds = (await sellers.find({ isEnabled: true }).project({ _id: 1 }).toArray()).map(s => s._id);

console.log(`Shops: ${shops.length}`);
console.log(`Products total: ${await products.countDocuments({})}`);
console.log(`Products flagged isShopByStoreOnly: ${await products.countDocuments({ isShopByStoreOnly: true })}`);
console.log(`Products with a shopId set: ${await products.countDocuments({ shopId: { $ne: null, $exists: true } })}\n`);

for (const shop of shops) {
  const ids = (shop.products || []).filter(Boolean);
  const existing = ids.length ? await products.countDocuments({ _id: { $in: ids } }) : 0;
  const active = ids.length ? await products.countDocuments({ _id: { $in: ids }, isActive: true }) : 0;
  const visible = ids.length
    ? await products.countDocuments({ _id: { $in: ids }, isActive: true, seller: { $in: enabledSellerIds } })
    : 0;

  const byShopId = await products.countDocuments({ shopId: shop._id });
  const byShopIdOnly = await products.countDocuments({ shopId: shop._id, isShopByStoreOnly: true });

  console.log(`- ${shop.name}  [storeId: ${shop.storeId}]  active=${shop.isActive !== false}`);
  console.log(`    products[] assigned : ${ids.length}  (exist ${existing}, isActive ${active}, visible-to-customer ${visible})`);
  console.log(`    shopId back-refs    : ${byShopId}  (of which isShopByStoreOnly ${byShopIdOnly})`);
  if (ids.length === 0 && byShopId === 0) console.log(`    => EMPTY: this store shows nothing on the storefront`);
}

const orphans = await products.countDocuments({
  isShopByStoreOnly: true,
  $or: [{ shopId: null }, { shopId: { $exists: false } }],
});
console.log(`\nShop-by-store-only products with no shopId (hidden everywhere): ${orphans}`);

await mongoose.disconnect();
