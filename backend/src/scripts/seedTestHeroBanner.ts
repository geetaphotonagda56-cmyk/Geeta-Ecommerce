import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Banner } from "../models/Banner";

// Explicitly load .env from backend root
dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/Geeta Stores";

// Marker so the test banner can be found and removed later without touching real ones
const TEST_MARKER = "TEST_HERO_BANNER";

// Landscape 16:9 test image (matches the HOME_MAIN_SLIDER aspect ratio on the home hero)
const TEST_IMAGE_URL = "https://picsum.photos/id/1080/1600/900";

async function seedTestHeroBanner() {
  const remove = process.argv.includes("--remove");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    if (remove) {
      const result = await Banner.deleteMany({ resourceName: TEST_MARKER });
      console.log(`Removed ${result.deletedCount} test hero banner(s)`);
      return;
    }

    const existing = await Banner.findOne({ resourceName: TEST_MARKER });
    if (existing) {
      console.log(`Test hero banner already exists: ${existing._id}`);
      return;
    }

    const banner = await Banner.create({
      position: "Main Banner",
      resourceType: "None",
      resourceName: TEST_MARKER,
      imageUrl: TEST_IMAGE_URL,
      imageVariants: {
        w320: "https://picsum.photos/id/1080/320/180",
        w640: "https://picsum.photos/id/1080/640/360",
        w1024: "https://picsum.photos/id/1080/1024/576",
        w1600: TEST_IMAGE_URL,
        original: TEST_IMAGE_URL,
      },
      isActive: true,
    });

    console.log(`Created test hero banner: ${banner._id}`);
  } catch (error) {
    console.error("Failed to seed test hero banner:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedTestHeroBanner();
