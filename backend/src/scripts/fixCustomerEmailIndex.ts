import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

// The live `email_1_sellerId_1` index was created before the schema added a
// partialFilterExpression (only index docs where email is a real string), so
// it's been enforcing uniqueness even for customers with no email - meaning
// only ONE customer in the whole system could ever have a null email before
// every subsequent email-less signup started colliding with it.
// This rebuilds the index to match the current Customer.ts schema exactly.
async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db!.collection("customers");

  const before = await col.indexes();
  const emailIndex = before.find((i) => i.name === "email_1_sellerId_1");
  console.log("Current email_1_sellerId_1 definition:", JSON.stringify(emailIndex, null, 2));

  if (emailIndex) {
    await col.dropIndex("email_1_sellerId_1");
    console.log("Dropped stale email_1_sellerId_1 index");
  }

  await col.createIndex(
    { email: 1, sellerId: 1 },
    { unique: true, partialFilterExpression: { email: { $type: "string" } } }
  );
  console.log("Recreated email_1_sellerId_1 with partial filter");

  console.log("Final indexes:", JSON.stringify(await col.indexes(), null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
