import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

// One-off migration: removes stale, unscoped unique indexes left over from an
// earlier version of the Customer schema. These pre-date the current
// {field, sellerId}-scoped (and partial, for email) indexes and cause false
// "duplicate" errors - e.g. email_1 is unique with no partial filter, so any
// second customer with no email collides with the first.
const LEGACY_INDEXES = ["phone_1", "refCode_1", "email_1"];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db!.collection("customers");

  const existing = new Set((await col.indexes()).map((i) => i.name));

  for (const name of LEGACY_INDEXES) {
    if (existing.has(name)) {
      await col.dropIndex(name);
      console.log(`Dropped legacy index: ${name}`);
    } else {
      console.log(`Index not present, skipping: ${name}`);
    }
  }

  console.log("Remaining indexes:", (await col.indexes()).map((i) => i.name));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
