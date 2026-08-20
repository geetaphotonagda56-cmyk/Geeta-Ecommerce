/**
 * URLs for a set of responsively-sized WebP renditions of one uploaded
 * image, plus a compressed fallback in the original format. Optional
 * fields: narrow source images skip widths larger than themselves (no
 * upscaling), and any field can be absent on documents that predate this
 * pipeline or where processing failed and the caller fell back to the
 * single original-URL field instead.
 */
export interface ImageVariants {
  w320?: string;
  w640?: string;
  w1024?: string;
  w1600?: string;
  original?: string;
}

export const IMAGE_VARIANT_WIDTHS = [320, 640, 1024, 1600] as const;
