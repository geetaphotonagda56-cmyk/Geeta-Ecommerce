import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Explicitly load .env from backend root
dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/Geeta Stores";

const NEW_DELIVERY_TIME = "24 hours";

// Matches the old "17 MINS" / "14 MINS" frontend fallbacks, and any bare-number
// or minutes-based values that were saved from them (e.g. "17", "14", "17 min").
const STALE_DELIVERY_TIME_PATTERNS = [
    /^\s*17\s*(mins?|minutes?)?\s*$/i,
    /^\s*14\s*(mins?|minutes?)?\s*$/i,
];

function isStaleDeliveryTime(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    const text = String(value).trim();
    if (!text) return true;
    return STALE_DELIVERY_TIME_PATTERNS.some((pattern) => pattern.test(text));
}

async function fixDeliveryTimeDefaults() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        if (!db) {
            console.error("Database connection not established");
            process.exit(1);
        }

        const coll = db.collection("products");
        const products = await coll.find({}).toArray();

        let fixed = 0;

        for (const product of products) {
            if (isStaleDeliveryTime(product.deliveryTime)) {
                console.log(
                    `  Updating ${product._id} (${product.name || "unnamed"}): "${product.deliveryTime}" -> "${NEW_DELIVERY_TIME}"`
                );
                await coll.updateOne(
                    { _id: product._id },
                    { $set: { deliveryTime: NEW_DELIVERY_TIME } }
                );
                fixed++;
            }
        }

        console.log(`\n✅ Migration completed! Updated ${fixed} of ${products.length} products.`);
        process.exit(0);
    } catch (error: any) {
        console.error("❌ Migration failed:", error.message);
        process.exit(1);
    }
}

fixDeliveryTimeDefaults();
