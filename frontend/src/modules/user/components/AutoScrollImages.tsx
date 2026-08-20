import { useEffect, useState } from "react";
import OptimizedImage, { ImageVariants } from "../../../components/OptimizedImage";

interface AutoScrollImagesProps {
  images: (string | undefined)[];
  alt: string;
  className?: string;
  intervalMs?: number;
  /** Only applies to the single-image case — it corresponds 1:1 to `images[0]`.
   *  The multi-image cycling case has no per-slot variants source. */
  variants?: ImageVariants | null;
}

// Crossfades through `images` automatically. Renders a single static image
// (no timer, no fade) when there's nothing to cycle through.
export default function AutoScrollImages({
  images,
  alt,
  className = "",
  intervalMs = 2200,
  variants,
}: AutoScrollImagesProps) {
  const validImages = images.filter((src): src is string => Boolean(src));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [validImages.join("|")]);

  useEffect(() => {
    if (validImages.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % validImages.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [validImages.length, intervalMs]);

  if (validImages.length === 0) return null;

  if (validImages.length === 1) {
    return (
      <OptimizedImage
        src={validImages[0]}
        variants={variants}
        alt={alt}
        className={`w-full h-full object-contain ${className}`}
        sizes="(max-width: 768px) 25vw, 12vw"
      />
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      {validImages.map((src, i) => (
        <img
          key={`${src}-${i}`}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === index ? 1 : 0 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0";
          }}
        />
      ))}
    </div>
  );
}
