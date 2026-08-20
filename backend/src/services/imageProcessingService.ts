import sharp, { FormatEnum } from "sharp";
import { IMAGE_VARIANT_WIDTHS } from "../types/imageVariants";

export interface ProcessedImageWidth {
  width: number;
  buffer: Buffer;
}

export interface ProcessedImage {
  /** WebP renditions, narrowest first. Never includes a width larger than
   *  the source image — sharp does not upscale here. */
  widths: ProcessedImageWidth[];
  /** A single compressed fallback in the original format, capped at 1600px
   *  wide, for the rare consumer that can't use WebP. */
  original: { buffer: Buffer; ext: string };
}

/**
 * Resize + re-encode an uploaded image buffer into a fixed set of WebP
 * widths plus one compressed original-format fallback.
 *
 * Never throws: any sharp failure (corrupt buffer, unsupported format,
 * decode error) is logged and this returns null so the caller can fall
 * back to uploading the original buffer unprocessed, exactly as before
 * this pipeline existed. Processing must never block an upload.
 */
export async function processImageBuffer(
  buffer: Buffer,
  originalExt: string
): Promise<ProcessedImage | null> {
  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    const sourceWidth = metadata.width ?? 0;
    if (!sourceWidth) return null;

    const widths: ProcessedImageWidth[] = [];
    for (const targetWidth of IMAGE_VARIANT_WIDTHS) {
      if (targetWidth > sourceWidth) continue; // never upscale
      const resized = await sharp(buffer, { failOn: "none" })
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      widths.push({ width: targetWidth, buffer: resized });
    }
    // If the source is narrower than even the smallest target, still emit
    // one WebP at its native width so there is at least one variant.
    if (widths.length === 0) {
      const native = await sharp(buffer, { failOn: "none" })
        .webp({ quality: 80 })
        .toBuffer();
      widths.push({ width: sourceWidth, buffer: native });
    }

    const originalFormat = (metadata.format as string) || originalExt.replace(".", "") || "jpeg";
    const originalBuffer = await sharp(buffer, { failOn: "none" })
      .resize({ width: 1600, withoutEnlargement: true })
      .toFormat(originalFormat as keyof FormatEnum)
      .toBuffer();

    return { widths, original: { buffer: originalBuffer, ext: originalFormat } };
  } catch (error) {
    console.error("Image processing failed, falling back to original:", error);
    return null;
  }
}
