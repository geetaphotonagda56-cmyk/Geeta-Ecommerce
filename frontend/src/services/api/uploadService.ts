import api from "./config";

export interface ImageVariants {
  w320?: string;
  w640?: string;
  w1024?: string;
  w1600?: string;
  original?: string;
}

export interface UploadResult {
  url: string;
  publicId: string;
  secureUrl: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  variants?: ImageVariants | null;
}

export interface UploadResponse {
  success: boolean;
  data: UploadResult | UploadResult[];
  message?: string;
}

/**
 * Upload a single image to Cloudinary via backend
 */
export async function uploadImage(
  file: File,
  folder?: string
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("image", file);
  if (folder) {
    formData.append("folder", folder);
  }

  const response = await api.post<UploadResponse>("/upload/image", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  if (response.data.success && response.data.data) {
    return Array.isArray(response.data.data)
      ? response.data.data[0]
      : response.data.data;
  }

  throw new Error(response.data.message || "Failed to upload image");
}

/**
 * Downloads an external image URL server-side and runs it through the same
 * compression pipeline a real upload uses. Used for search-picked images.
 */
export async function uploadImageFromUrl(
  url: string,
  folder?: string
): Promise<UploadResult> {
  const response = await api.post<UploadResponse>("/upload/image-from-url", {
    url,
    folder,
  });

  if (response.data.success && response.data.data) {
    return Array.isArray(response.data.data)
      ? response.data.data[0]
      : response.data.data;
  }

  throw new Error(response.data.message || "Failed to process image URL");
}

/**
 * Fetches an external image URL through the backend's SSRF-checked proxy and
 * returns it as a File, so a search-picked image can go through the same
 * client-side crop step a local upload does before it's actually saved.
 */
export async function fetchImageAsFile(
  url: string,
  filename: string
): Promise<File> {
  const response = await api.get("/upload/proxy-image", {
    params: { url },
    responseType: "blob",
  });
  const blob: Blob = response.data;
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

/**
 * Upload multiple images to Cloudinary via backend
 */
export async function uploadImages(
  files: File[],
  folder?: string
): Promise<UploadResult[]> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("images", file);
  });
  if (folder) {
    formData.append("folder", folder);
  }

  const response = await api.post<UploadResponse>("/upload/images", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  if (response.data.success && response.data.data) {
    return Array.isArray(response.data.data)
      ? response.data.data
      : [response.data.data];
  }

  throw new Error(response.data.message || "Failed to upload images");
}

/**
 * Upload a document (image or PDF) to Cloudinary via backend
 */
export async function uploadDocument(
  file: File,
  folder?: string
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("document", file);
  if (folder) {
    formData.append("folder", folder);
  }

  const response = await api.post<UploadResponse>(
    "/upload/document",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  if (response.data.success && response.data.data) {
    return Array.isArray(response.data.data)
      ? response.data.data[0]
      : response.data.data;
  }

  throw new Error(response.data.message || "Failed to upload document");
}

/**
 * Upload multiple documents to Cloudinary via backend
 */
export async function uploadDocuments(
  files: File[],
  folder?: string
): Promise<UploadResult[]> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("documents", file);
  });
  if (folder) {
    formData.append("folder", folder);
  }

  const response = await api.post<UploadResponse>(
    "/upload/documents",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  if (response.data.success && response.data.data) {
    return Array.isArray(response.data.data)
      ? response.data.data
      : [response.data.data];
  }

  throw new Error(response.data.message || "Failed to upload documents");
}

/**
 * Delete an image from Cloudinary by public_id
 */
export async function deleteImage(publicId: string): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `/upload/${publicId}`
  );

  if (!response.data.success) {
    throw new Error(response.data.message || "Failed to delete image");
  }
}
