import mongoose from "mongoose";
import Product from "../../models/Product";
import {
  findVariantById,
  variantsFromProductDoc,
} from "./variantHelpers";

type StockUpdateOptions = { session?: mongoose.ClientSession };

export async function decrementVariantStock(
  productId: string,
  variantId: string | undefined,
  quantity: number,
  options?: StockUpdateOptions
): Promise<boolean> {
  const product = await Product.findById(productId).session(options?.session ?? null);
  if (!product) return false;

  const variants = variantsFromProductDoc(product);
  if (!variants.length) return false;

  let targetId = variantId;
  if (!targetId && variants.length === 1) {
    targetId = String(variants[0]._id);
  }
  if (!targetId) return false;

  const targetObjectId = new mongoose.Types.ObjectId(targetId);

  // Unlike the online-checkout path, this runs after a sale/payment has
  // already happened (POS, order fulfillment), so it can't reject on
  // insufficient stock - it must clamp at 0 instead. Done as an aggregation
  // pipeline update so the clamp is evaluated atomically against the
  // document's current stock, avoiding a read-then-write race that could
  // still drive it negative under concurrent sales.
  const result = await Product.updateOne(
    { _id: productId, "variations._id": targetObjectId },
    [
      {
        $set: {
          variations: {
            $map: {
              input: "$variations",
              as: "v",
              in: {
                $cond: [
                  { $eq: ["$$v._id", targetObjectId] },
                  {
                    $mergeObjects: [
                      "$$v",
                      { stock: { $max: [0, { $subtract: [{ $ifNull: ["$$v.stock", 0] }, quantity] }] } },
                    ],
                  },
                  "$$v",
                ],
              },
            },
          },
        },
      },
    ],
    options?.session ? { session: options.session } : {}
  );
  return result.modifiedCount > 0;
}

export async function incrementVariantStock(
  productId: string,
  variantId: string | undefined,
  quantity: number,
  options?: StockUpdateOptions
): Promise<boolean> {
  const product = await Product.findById(productId).session(options?.session ?? null);
  if (!product) return false;

  const variants = variantsFromProductDoc(product);
  let targetId = variantId;
  if (!targetId && variants.length === 1) {
    targetId = String(variants[0]._id);
  }
  if (!targetId) return false;

  const result = await Product.updateOne(
    { _id: productId, "variations._id": new mongoose.Types.ObjectId(targetId) },
    { $inc: { "variations.$.stock": quantity } },
    options?.session ? { session: options.session } : {}
  );
  return result.modifiedCount > 0;
}

export async function getVariantStock(
  productId: string,
  variantId?: string
): Promise<number> {
  const product = await Product.findById(productId).lean();
  if (!product) return 0;
  const variants = variantsFromProductDoc(product);
  if (variantId) {
    const v = findVariantById(variants, variantId);
    return Number(v?.stock) || 0;
  }
  if (variants.length === 1) return Number(variants[0].stock) || 0;
  return variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
}
