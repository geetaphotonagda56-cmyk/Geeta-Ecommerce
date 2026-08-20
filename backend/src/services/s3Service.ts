import { PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import s3Client, { S3_BUCKET_NAME, AWS_REGION, S3_FOLDERS, CLOUDFRONT_DOMAIN } from "../config/s3";
import { processImageBuffer } from "./imageProcessingService";
import { ImageVariants } from "../types/imageVariants";
import { fetchUrlSafely } from "../utils/ssrfSafeUrlFetch";

export interface UploadResult {
  url: string;
  publicId: string;
  secureUrl: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

export interface UploadOptions {
  folder?: string;
  resourceType?: "image" | "raw" | "video" | "auto";
  transformation?: any[];
  overwrite?: boolean;
  invalidate?: boolean;
  originalFilename?: string;
}

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

function extractExtension(originalFilename?: string): string {
  if (!originalFilename) return "";
  const match = /\.[a-zA-Z0-9]+$/.exec(originalFilename);
  return match ? match[0].toLowerCase() : "";
}

function buildKey(folder: string, originalFilename?: string): string {
  const ext = extractExtension(originalFilename);
  return `${folder}/${randomUUID()}${ext}`;
}

function buildAssetUrl(key: string): string {
  // Folder names contain spaces (e.g. "Geeta Stores/products"); percent-encode
  // for the URL only — the raw key sent to S3 in PutObjectCommand stays
  // unencoded.
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (CLOUDFRONT_DOMAIN) {
    return `https://${CLOUDFRONT_DOMAIN}/${encodedKey}`;
  }
  // Fails open to direct S3 when CloudFront isn't configured yet.
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${encodedKey}`;
}

// Kept as an alias so no other call site needs to change.
const buildPublicUrl = buildAssetUrl;

function contentTypeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  };
  return map[ext] || DEFAULT_CONTENT_TYPE;
}

async function putBuffer(
  buffer: Buffer,
  folder: string,
  options: UploadOptions
): Promise<UploadResult> {
  const ext = extractExtension(options.originalFilename);
  const key = buildKey(folder, options.originalFilename);

  console.log(`Starting S3 upload to key: ${key}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentTypeFromExtension(ext),
    })
  );

  console.log(`S3 upload successful: ${key}`);

  const url = buildPublicUrl(key);

  return {
    url,
    publicId: key,
    secureUrl: url,
    format: ext ? ext.replace(".", "") : undefined,
    bytes: buffer.length,
  };
}

/**
 * Upload a single image to S3 (path-based, for seed scripts)
 */
export async function uploadImage(
  filePath: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    const buffer = await readFile(filePath);
    const folder = options.folder || S3_FOLDERS.PRODUCTS;
    const originalFilename = options.originalFilename || filePath;
    return await putBuffer(buffer, folder, { ...options, originalFilename });
  } catch (error: any) {
    console.error("S3 upload error:", error);
    throw new Error(`S3 upload failed: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Upload multiple images to S3 (path-based, for seed scripts)
 */
export async function uploadMultipleImages(
  filePaths: string[],
  options: UploadOptions = {}
): Promise<UploadResult[]> {
  try {
    const uploadPromises = filePaths.map((filePath) => uploadImage(filePath, options));
    return await Promise.all(uploadPromises);
  } catch (error) {
    throw new Error(`Failed to upload multiple images: ${error}`);
  }
}

/**
 * Upload a document (PDF, image, etc.) to S3 (path-based, for seed scripts)
 */
export async function uploadDocument(
  filePath: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    const buffer = await readFile(filePath);
    const folder = options.folder || S3_FOLDERS.SELLER_DOCUMENTS;
    const originalFilename = options.originalFilename || filePath;
    return await putBuffer(buffer, folder, { ...options, originalFilename });
  } catch (error: any) {
    console.error("S3 document upload error:", error);
    throw new Error(`S3 document upload failed: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Upload image from buffer (for multer)
 */
export async function uploadImageFromBuffer(
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    return await putBuffer(buffer, options.folder || S3_FOLDERS.PRODUCTS, options);
  } catch (error: any) {
    console.error("S3 buffer upload error:", error);
    throw new Error(`S3 upload failed: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Upload document from buffer (for multer)
 */
export async function uploadDocumentFromBuffer(
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    return await putBuffer(buffer, options.folder || S3_FOLDERS.SELLER_DOCUMENTS, options);
  } catch (error: any) {
    console.error("S3 document buffer upload error:", error);
    throw new Error(`S3 document upload failed: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Upload video from buffer (for multer)
 */
export async function uploadVideoFromBuffer(
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    return await putBuffer(buffer, options.folder || S3_FOLDERS.PRODUCTS, options);
  } catch (error: any) {
    console.error("S3 video buffer upload error:", error);
    throw new Error(`S3 video upload failed: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Delete an object from S3 by key (publicId)
 */
export async function deleteImage(publicId: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: publicId,
      })
    );
  } catch (error: any) {
    throw new Error(`Failed to delete image: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Delete multiple objects from S3
 */
export async function deleteMultipleImages(publicIds: string[]): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET_NAME,
        Delete: { Objects: publicIds.map((Key) => ({ Key })) },
      })
    );
  } catch (error) {
    throw new Error(`Failed to delete multiple images: ${error}`);
  }
}

/**
 * Upload an image buffer as a set of responsive WebP variants plus the
 * existing single-file upload (unchanged, for backward compatibility with
 * every caller that only reads `result.url`/`result.secureUrl`).
 *
 * Never throws on processing failure: if sharp can't process the buffer,
 * `variants` comes back null and `result` is the plain, unprocessed
 * upload — identical to calling uploadImageFromBuffer directly.
 */
export async function uploadImageVariantsFromBuffer(
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<{ result: UploadResult; variants: ImageVariants | null }> {
  const folder = options.folder || S3_FOLDERS.PRODUCTS;
  const ext = extractExtension(options.originalFilename);
  const processed = await processImageBuffer(buffer, ext);

  // Always upload the primary file so `result` is populated exactly like
  // today, regardless of whether variant generation succeeded.
  const result = await putBuffer(buffer, folder, options);

  if (!processed) {
    return { result, variants: null };
  }

  const baseKey = result.publicId.replace(/\.[a-zA-Z0-9]+$/, "");
  const variants: ImageVariants = {};

  for (const { width, buffer: variantBuffer } of processed.widths) {
    const key = `${baseKey}-${width}w.webp`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: variantBuffer,
        ContentType: "image/webp",
      })
    );
    const url = buildAssetUrl(key);
    if (width <= 320) variants.w320 = url;
    else if (width <= 640) variants.w640 = url;
    else if (width <= 1024) variants.w1024 = url;
    else variants.w1600 = url;
  }

  const originalKey = `${baseKey}-original.${processed.original.ext}`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: originalKey,
      Body: processed.original.buffer,
      ContentType: contentTypeFromExtension(`.${processed.original.ext}`),
    })
  );
  variants.original = buildAssetUrl(originalKey);

  return { result, variants };
}

/**
 * Same variant-generation pipeline as uploadImageVariantsFromBuffer, but
 * for an image that already exists in S3 (used by the backfill script).
 * Returns null variants on any processing failure, same contract as the
 * live upload path.
 */
export async function backfillVariantsForKey(
  key: string
): Promise<ImageVariants | null> {
  const obj = await s3Client.send(
    new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key })
  );
  const chunks: Buffer[] = [];
  for await (const chunk of obj.Body as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  const ext = extractExtension(key);
  const processed = await processImageBuffer(buffer, ext);
  if (!processed) return null;

  const baseKey = key.replace(/\.[a-zA-Z0-9]+$/, "");
  const variants: ImageVariants = {};
  for (const { width, buffer: variantBuffer } of processed.widths) {
    const variantKey = `${baseKey}-${width}w.webp`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: variantKey,
        Body: variantBuffer,
        ContentType: "image/webp",
      })
    );
    const url = buildAssetUrl(variantKey);
    if (width <= 320) variants.w320 = url;
    else if (width <= 640) variants.w640 = url;
    else if (width <= 1024) variants.w1024 = url;
    else variants.w1600 = url;
  }
  const originalKey = `${baseKey}-original.${processed.original.ext}`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: originalKey,
      Body: processed.original.buffer,
      ContentType: contentTypeFromExtension(`.${processed.original.ext}`),
    })
  );
  variants.original = buildAssetUrl(originalKey);
  return variants;
}

/** Extract the S3 key from a URL this service previously generated. */
export function keyFromAssetUrl(url: string): string | null {
  const match = /amazonaws\.com\/(.+)$|(?:^https:\/\/[^/]+\/)(.+)$/.exec(url);
  const encoded = match?.[1] ?? match?.[2];
  if (!encoded) return null;
  return encoded.split("/").map(decodeURIComponent).join("/");
}

/**
 * Downloads an external URL server-side (SSRF-hardened) and runs it
 * through the exact same variant-generation pipeline a real upload uses.
 * Throws if the URL fails validation/download; callers should catch and
 * return a client error, since — unlike a real file upload — there's no
 * buffer to fall back to if the fetch itself fails.
 */
export async function uploadImageVariantsFromUrl(
  url: string,
  options: UploadOptions = {}
): Promise<{ result: UploadResult; variants: ImageVariants | null }> {
  const { buffer } = await fetchUrlSafely(url);
  return uploadImageVariantsFromBuffer(buffer, options);
}
