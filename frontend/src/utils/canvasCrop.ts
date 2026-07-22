import type { Area } from "react-easy-crop";

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });

const getRadianAngle = (degrees: number): number => (degrees * Math.PI) / 180;

// Bounding box of `width`x`height` after rotating by `rotation` degrees -
// needed so the rotated image isn't clipped before we crop it.
const rotatedBoundingBox = (width: number, height: number, rotation: number) => {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
};

/**
 * Crops an image to the given pixel area and returns a File ready for upload.
 * Mirrors the canonical react-easy-crop cropping recipe (including its
 * rotation handling: draw the source image rotated onto a bounding-box-sized
 * canvas first, then crop out of that).
 *
 * In "contain" mode (whole image visible, letterboxed), react-easy-crop can
 * report a crop area that extends outside the rotated image's bounds to
 * represent the empty gap - drawImage silently skips that out-of-bounds
 * portion, so we pre-fill both canvases with backgroundColor first so gaps
 * come out as a solid color instead of black/transparent.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  cropAreaPixels: Area,
  fileName: string,
  mimeType: string = "image/jpeg",
  backgroundColor: string = "#FFFFFF",
  rotation: number = 0
): Promise<File> {
  const image = await createImage(imageSrc);

  const { width: bBoxWidth, height: bBoxHeight } = rotatedBoundingBox(image.width, image.height, rotation);
  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = bBoxWidth;
  rotatedCanvas.height = bBoxHeight;
  const rotatedCtx = rotatedCanvas.getContext("2d");
  if (!rotatedCtx) throw new Error("Could not get canvas context");

  rotatedCtx.fillStyle = backgroundColor;
  rotatedCtx.fillRect(0, 0, bBoxWidth, bBoxHeight);
  rotatedCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
  rotatedCtx.rotate(getRadianAngle(rotation));
  rotatedCtx.translate(-image.width / 2, -image.height / 2);
  rotatedCtx.drawImage(image, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = cropAreaPixels.width;
  canvas.height = cropAreaPixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    rotatedCanvas,
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
