/**
 * The Cloudinary cloud "dv1l9sb4p" used by old seed scripts has been
 * disabled, so any product variation still referencing res.cloudinary.com
 * in mainImage/image/galleryImages renders broken on the storefront. New
 * uploads go through S3 (see uploadRoutes.ts), so for each affected
 * variation:
 *   - dead entries are stripped out of galleryImages
 *   - if mainImage/image is dead but a working (S3) gallery image exists,
 *     it is promoted to mainImage/image
 *   - if mainImage/image is dead and no working alternative exists, the
 *     dead Cloudinary URL is cleared entirely (there's nothing to fall
 *     back to) and the product is reported so it can be re-uploaded later
 *
 * Usage:
 *   npx tsx src/scripts/fixCloudinaryProductImages.ts            (dry run, report only)
 *   npx tsx src/scripts/fixCloudinaryProductImages.ts --apply    (writes changes)
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "../models/Product";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const CLOUDINARY_RE = /res\.cloudinary\.com/;

function isDead(url: unknown): url is string {
  return typeof url === "string" && CLOUDINARY_RE.test(url);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`[fix-cloudinary] Connected (apply=${APPLY})`);

  const filter = {
    $or: [
      { "variations.mainImage": { $regex: CLOUDINARY_RE } },
      { "variations.image": { $regex: CLOUDINARY_RE } },
      { "variations.galleryImages": { $regex: CLOUDINARY_RE } },
    ],
  };

  const products = await Product.find(filter as any);
  console.log(`[fix-cloudinary] ${products.length} product(s) reference a dead Cloudinary URL`);

  let promotedVariants = 0;
  let cleanedGalleryVariants = 0;
  let clearedVariants = 0;
  let saveFailures = 0;
  const cleared: { productId: string; productName: string; variant: string }[] = [];
  const failed: { productId: string; productName: string; error: string }[] = [];

  for (const product of products) {
    let changed = false;

    for (const v of product.variations as any[]) {
      const gallery: string[] = Array.isArray(v.galleryImages) ? v.galleryImages : [];
      const workingGallery = gallery.filter((u) => !isDead(u));
      const deadGalleryCount = gallery.length - workingGallery.length;

      if (deadGalleryCount > 0) {
        v.galleryImages = workingGallery;
        changed = true;
        cleanedGalleryVariants++;
      }

      const mainDead = isDead(v.mainImage) || isDead(v.image);
      if (mainDead) {
        if (workingGallery.length > 0) {
          v.mainImage = workingGallery[0];
          v.image = workingGallery[0];
          changed = true;
          promotedVariants++;
        } else {
          v.mainImage = undefined;
          v.image = undefined;
          if (isDead(v.mainImageVariants?.original)) v.mainImageVariants = undefined;
          changed = true;
          clearedVariants++;
          cleared.push({
            productId: String(product._id),
            productName: product.productName,
            variant: v.value || v.variationType || "Default",
          });
        }
      }
    }

    if (changed && APPLY) {
      try {
        await product.save();
      } catch (err: any) {
        saveFailures++;
        failed.push({
          productId: String(product._id),
          productName: product.productName,
          error: err?.message || String(err),
        });
      }
    }
  }

  console.log(`[fix-cloudinary] Variants promoted (mainImage backfilled from gallery): ${promotedVariants}`);
  console.log(`[fix-cloudinary] Variants with dead gallery entries stripped: ${cleanedGalleryVariants}`);
  console.log(`[fix-cloudinary] Variants with mainImage/image cleared (no working alternative — needs manual re-upload): ${clearedVariants}`);
  if (cleared.length > 0) {
    console.log("[fix-cloudinary] Cleared (needs manual re-upload):");
    for (const c of cleared) {
      console.log(`  - ${c.productId}  "${c.productName}"  variant="${c.variant}"`);
    }
  }

  console.log(`[fix-cloudinary] Products that failed to save (pre-existing unrelated data issues, skipped): ${saveFailures}`);
  if (failed.length > 0) {
    console.log("[fix-cloudinary] Failed saves:");
    for (const f of failed) {
      console.log(`  - ${f.productId}  "${f.productName}"  error="${f.error}"`);
    }
  }

  if (!APPLY) {
    console.log("[fix-cloudinary] Dry run only — rerun with --apply to write changes.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
