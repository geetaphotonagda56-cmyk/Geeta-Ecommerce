import { useState, useEffect } from 'react';
import { bannerService } from '../../../../services/bannerService';
import { Banner, BannerPosition } from '../../../../types/banner';
import { getBannerAspectClass } from './bannerDisplayUtils';

interface Props {
  position: BannerPosition;
  className?: string;
  /** @deprecated Use aspect-ratio fitting instead of fixed heights */
  heightClass?: string;
  roundedClass?: string;
  imageFit?: 'contain' | 'cover';
}

export default function BannerSlider({
  position,
  className = '',
  roundedClass = 'rounded-2xl',
  imageFit = 'contain',
}: Props) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const activeBanners = await bannerService.getActiveBannersForPosition(position);
        setBanners(Array.isArray(activeBanners) ? activeBanners : []);
      } catch (error) {
        console.error('Failed to load banners', error);
        setBanners([]);
      }
    };
    fetchBanners();
  }, [position]);

  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (banners.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [banners.length, isPaused, currentIndex]);

  if (banners.length === 0) return null;

  const aspectClass = getBannerAspectClass(position);
  const currentBanner = banners[currentIndex];
  const showTextOverlay = Boolean(
    (typeof currentBanner?.title === 'string' && currentBanner.title) ||
      (typeof currentBanner?.subtitle === 'string' && currentBanner.subtitle)
  );

  return (
    <div
      className={`w-full relative group ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className={`w-full relative overflow-hidden ${roundedClass} ${aspectClass}`}
      >
        {banners.map((banner, index) => (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
          >
            <img
              src={banner.image || banner.imageUrl}
              alt={banner.title || 'Banner'}
              className={`w-full h-full ${imageFit === 'cover' ? 'object-cover' : 'object-contain'} object-center`}
              loading={index === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
            {showTextOverlay && index === currentIndex && (
              <div className="absolute inset-0 flex flex-col justify-center px-6 md:px-12 text-white pointer-events-none">
                {typeof banner.title === 'string' && banner.title && (
                  <h2
                    className="text-xl md:text-4xl font-bold mb-1 md:mb-2"
                    style={{ textShadow: '0 1px 6px rgba(0,0,0,0.45)' }}
                  >
                    {banner.title}
                  </h2>
                )}
                {typeof banner.subtitle === 'string' && banner.subtitle && (
                  <p
                    className="text-sm md:text-lg"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
                  >
                    {banner.subtitle}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {banners.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to banner ${idx + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? 'bg-white w-6' : 'bg-white/60 hover:bg-white/80 w-2'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
