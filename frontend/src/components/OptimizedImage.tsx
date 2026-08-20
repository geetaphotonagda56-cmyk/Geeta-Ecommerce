import { forwardRef } from 'react';

export interface ImageVariants {
  w320?: string;
  w640?: string;
  w1024?: string;
  w1600?: string;
  original?: string;
}

interface OptimizedImageProps {
  src: string;
  variants?: ImageVariants | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  [key: string]: any;
}

function buildSrcSet(variants: ImageVariants): string {
  const parts: string[] = [];
  if (variants.w320) parts.push(`${variants.w320} 320w`);
  if (variants.w640) parts.push(`${variants.w640} 640w`);
  if (variants.w1024) parts.push(`${variants.w1024} 1024w`);
  if (variants.w1600) parts.push(`${variants.w1600} 1600w`);
  return parts.join(", ");
}

/**
 * Renders a responsive <img>: srcset/sizes from `variants` when present,
 * a plain src otherwise. Native `loading="lazy"` unless `priority` is set
 * (above-the-fold images — first banner slide, hero). No IntersectionObserver
 * — native lazy-loading is broadly supported and simpler.
 */
const OptimizedImage = forwardRef<HTMLImageElement, OptimizedImageProps>(
  function OptimizedImage(
    {
      src,
      variants,
      alt,
      className = "",
      sizes = "100vw",
      priority = false,
      onError,
      ...props
    },
    ref
  ) {
    const hasVariants = !!(
      variants &&
      (variants.w320 || variants.w640 || variants.w1024 || variants.w1600)
    );
    const fallbackSrc = variants?.w1024 || variants?.w640 || src;

    return (
      <img
        ref={ref}
        src={fallbackSrc}
        srcSet={hasVariants ? buildSrcSet(variants!) : undefined}
        sizes={hasVariants ? sizes : undefined}
        alt={alt}
        className={className}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={onError}
        {...props}
      />
    );
  }
);

export default OptimizedImage;
