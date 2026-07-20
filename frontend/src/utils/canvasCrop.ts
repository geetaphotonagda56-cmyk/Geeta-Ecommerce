import type { Area } from "react-easy-crop";

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });

/**
 * Crops an image to the given pixel area and returns a File ready for upload.
 * Mirrors the canonical react-easy-crop cropping recipe.
 *
 * In "contain" mode (whole image visible, letterboxed), react-easy-crop can
 * report a crop area that extends outside the source image's natural bounds
 * to represent the empty gap - drawImage silently skips that out-of-bounds
 * portion, so we pre-fill the canvas with backgroundColor first so gaps come
 * out as a solid color instead of black/transparent.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  cropAreaPixels: Area,
  fileName: string,
  mimeType: string = "image/jpeg",
  backgroundColor: string = "#FFFFFF"
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = cropAreaPixels.width;
  canvas.height = cropAreaPixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    image,
    cropAreaPixels.x,
    cropAreaPixels.y,
    cropAreaPixels.width,
    cropAreaPixels.height,
    0,
    0,
    cropAreaPixels.width,
    cropAreaPixels.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(new File([blob], fileName, { type: mimeType }));
      },
      mimeType,
      0.92
    );
  });
}
