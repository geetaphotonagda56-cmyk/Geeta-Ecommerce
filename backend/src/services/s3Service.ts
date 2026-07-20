import { PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import s3Client, { S3_BUCKET_NAME, AWS_REGION, S3_FOLDERS } from "../config/s3";

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

function buildPublicUrl(key: string): string {
  // Virtual-hosted-style S3 URL. Percent-encode for the URL only (folder
  // names contain spaces, e.g. "Geeta Stores/products") - the raw key sent
  // to S3 in PutObjectCommand/DeleteObjectCommand stays unencoded.
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${encodedKey}`;
}

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
