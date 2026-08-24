import { Router, Request, Response } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import {
  uploadSingleImage,
  uploadMultipleImages,
  uploadDocument,
  uploadMultipleDocuments,
  handleUploadError,
  uploadVideo,
} from "../middleware/upload";
import {
  uploadImageVariantsFromBuffer,
  uploadImageVariantsFromUrl,
  uploadDocumentFromBuffer,
  uploadVideoFromBuffer,
  deleteImage,
} from "../services/s3Service";
import { S3_FOLDERS } from "../config/s3";
import { asyncHandler } from "../utils/asyncHandler";
import { fetchUrlSafely } from "../utils/ssrfSafeUrlFetch";

const router = Router();

// All upload routes require authentication
// router.use(authenticate); // Commented out to allow public document upload for signup

/**
 * POST /api/v1/upload/image
 * Upload a single image
 */
router.post(
  "/image",
  authenticate,
  requireUserType("Admin", "Seller"),
  uploadSingleImage.single("image"),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    if (!(req as any).file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    const folder = (req.body.folder as string) || S3_FOLDERS.PRODUCTS;
    const { result, variants } = await uploadImageVariantsFromBuffer(
      (req as any).file.buffer,
      {
        folder,
        resourceType: "image",
        originalFilename: (req as any).file.originalname,
      }
    );

    return res.status(200).json({
      success: true,
      data: { ...result, variants },
    });
  })
);

/**
 * POST /api/v1/upload/images
 * Upload multiple images
 */
router.post(
  "/images",
  authenticate,
  requireUserType("Admin", "Seller"),
  uploadMultipleImages.array("images", 10), // Max 10 images
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    if (!(req as any).files || ((req as any).files as any[]).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No image files provided",
      });
    }

    const folder = (req.body.folder as string) || S3_FOLDERS.PRODUCTS;
    const files = (req as any).files as any[];

    const uploadPromises = files.map((file) =>
      uploadImageVariantsFromBuffer(file.buffer, {
        folder,
        resourceType: "image",
        originalFilename: file.originalname,
      })
    );

    const uploaded = await Promise.all(uploadPromises);
    const results = uploaded.map(({ result, variants }) => ({ ...result, variants }));

    return res.status(200).json({
      success: true,
      data: results,
    });
  })
);

/**
 * POST /api/v1/upload/image-from-url
 * Download an external image URL server-side and run it through the same
 * compression pipeline a real upload uses. Used for search-picked
 * (SerpApi/Google/Unsplash) images so they stop bypassing the pipeline.
 */
router.post(
  "/image-from-url",
  authenticate,
  requireUserType("Admin", "Seller"),
  asyncHandler(async (req: Request, res: Response) => {
    const { url, folder } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "url is required",
      });
    }

    try {
      const { result, variants } = await uploadImageVariantsFromUrl(url, {
        folder: folder || S3_FOLDERS.PRODUCTS,
        resourceType: "image",
      });

      return res.status(200).json({
        success: true,
        data: { ...result, variants },
      });
    } catch (error: any) {
      return res.status(422).json({
        success: false,
        message: error.message || "Failed to fetch and process the image URL",
      });
    }
  })
);

/**
 * GET /api/v1/upload/proxy-image
 * Streams back the raw bytes of an external image URL (SSRF-checked) without
 * persisting anything to S3 - lets the browser turn a search-picked image
 * into a same-origin File for the crop modal. The eventual crop is uploaded
 * for real afterwards via /image or /image-from-url.
 */
router.get(
  "/proxy-image",
  authenticate,
  requireUserType("Admin", "Seller"),
  asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "url is required",
      });
    }

    try {
      const { buffer, contentType } = await fetchUrlSafely(url);
      res.setHeader("Content-Type", contentType);
      return res.status(200).send(buffer);
    } catch (error: any) {
      return res.status(422).json({
        success: false,
        message: error.message || "Failed to fetch the image URL",
      });
    }
  })
);

/**
 * POST /api/v1/upload/document
 * Upload a document (image or PDF)
 */
router.post(
  "/document",
  // authenticate, // Removed to allow signup uploads
  uploadDocument.single("document"),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    if (!(req as any).file) {
      return res.status(400).json({
        success: false,
        message: "No document file provided",
      });
    }

    // Determine folder: Use provided folder OR fallback based on user type
    let folder: string = (req.body.folder as string) || S3_FOLDERS.SELLER_DOCUMENTS;
    const userType = (req as any).user?.userType;

    if (!req.body.folder && userType) {
        if (userType === "Delivery") {
            folder = S3_FOLDERS.DELIVERY_DOCUMENTS;
        } else if (userType === "Seller") {
            folder = S3_FOLDERS.SELLER_DOCUMENTS;
        }
    }

    // Check if it's an image or PDF
    const isImage = (req as any).file.mimetype.startsWith("image/");
    const resourceType = isImage ? "image" : "raw";

    const result = await uploadDocumentFromBuffer((req as any).file.buffer, {
      folder,
      resourceType,
      originalFilename: (req as any).file.originalname,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/v1/upload/documents
 * Upload multiple documents
 */
router.post(
  "/documents",
  authenticate,
  uploadMultipleDocuments.array("documents", 5), // Max 5 documents
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    if (!(req as any).files || ((req as any).files as any[]).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No document files provided",
      });
    }

    // Determine folder based on user type
    let folder: string = S3_FOLDERS.SELLER_DOCUMENTS;
    const userType = (req as any).user?.userType;

    if (userType === "Delivery") {
      folder = S3_FOLDERS.DELIVERY_DOCUMENTS;
    } else if (userType === "Seller") {
      folder = S3_FOLDERS.SELLER_DOCUMENTS;
    }

    const files = (req as any).files as any[];

    const uploadPromises = files.map((file) => {
      const isImage = file.mimetype.startsWith("image/");
      const resourceType = isImage ? "image" : "raw";
      return uploadDocumentFromBuffer(file.buffer, {
        folder,
        resourceType,
        originalFilename: file.originalname,
      });
    });

    const results = await Promise.all(uploadPromises);

    return res.status(200).json({
      success: true,
      data: results,
    });
  })
);

/**
 * POST /api/v1/upload/video
 * Upload a single video
 */
router.post(
  "/video",
  authenticate,
  requireUserType("Admin", "Seller"),
  uploadVideo.single("video"),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    if (!(req as any).file) {
      return res.status(400).json({
        success: false,
        message: "No video file provided",
      });
    }

    const folder = (req.body.folder as string) || S3_FOLDERS.PRODUCTS;
    const result = await uploadVideoFromBuffer((req as any).file.buffer, {
      folder,
      resourceType: "video",
      originalFilename: (req as any).file.originalname,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  })
);

/**
 * DELETE /api/v1/upload/:publicId
 * Delete an image from S3
 */
router.delete(
  "/:publicId",
  authenticate,
  requireUserType("Admin", "Seller"),
  asyncHandler(async (req: Request, res: Response) => {
    const { publicId } = req.params;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: "Public ID is required",
      });
    }

    await deleteImage(publicId);

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  })
);

export default router;
