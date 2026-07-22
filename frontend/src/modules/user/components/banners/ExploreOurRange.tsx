import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { rangeCardService, RangeCard } from '../../../../services/rangeCardService';

// Admin-managed Customer App Theme tokens, matching the pattern used by
// DealOfTheDay.tsx so this section follows the brand color picked in the
// Customer App Theme settings instead of being hardcoded.
const BRAND = {
  primary: 'var(--customer-primary)',
  secondary: 'var(--customer-secondary)',
  accent: 'var(--customer-accent)',
  tint: 'var(--customer-primary-alpha-10)',
  border: 'var(--customer-primary-alpha-30)',
};

const GRADIENT_TEXT = `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.accent}, ${BRAND.secondary}, ${BRAND.primary})`;

export default function ExploreOurRange() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<RangeCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    rangeCardService.getActiveRangeCards().then((data) => {
      if (!cancelled) {
        setCards(data);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || cards.length === 0) return null;

  // Builds a price-range slug like "under-200", "above-500", or
  // "range-100-500" - Search.tsx recognizes this format in the `q` param
  // and filters by price instead of running a text search.
  const buildSlug = (card: RangeCard) => {
    const { minPrice, maxPrice } = card;
    if (maxPrice !== undefined && !minPrice) return `under-${maxPrice}`;
    if (minPrice !== undefined && maxPrice === undefined) return `above-${minPrice}`;
    if (minPrice !== undefined && maxPrice !== undefined) return `range-${minPrice}-${maxPrice}`;
    return card.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  const handleCardClick = (card: RangeCard) => {
    const params = new URLSearchParams();
    params.set('q', buildSlug(card));
    params.set('minPrice', String(card.minPrice ?? 0));
    if (card.maxPrice !== undefined) params.set('maxPrice', String(card.maxPrice));
    navigate(`/search?${params.toString()}`);
  };

  return (
    <div className="px-4 md:px-6 lg:px-8 pt-4 md:pt-6 pb-6 md:pb-8">
      {/* Heading */}
      <div className="relative text-center mb-7 md:mb-9">
        {/* Ambient glow behind the title */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-20 md:w-80 md:h-28 blur-3xl opacity-25"
          style={{ background: `radial-gradient(circle, ${BRAND.primary}, transparent 70%)` }}
        />

        <div className="relative inline-flex items-center gap-2 md:gap-2.5">
          <motion.svg
            viewBox="0 0 24 24"
            className="w-5 h-5 md:w-7 md:h-7 flex-shrink-0"
            initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
            animate={{ opacity: 1, scale: [1, 1.15, 1], rotate: [0, 8, 0] }}
            transition={{
              opacity: { duration: 0.4 },
              scale: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <defs>
              <linearGradient id="explore-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: BRAND.primary }} />
                <stop offset="50%" style={{ stopColor: BRAND.accent }} />
                <stop offset="100%" style={{ stopColor: BRAND.secondary }} />
              </linearGradient>
            </defs>
            <path
              d="M12 0c.6 4.4 2 7.4 4.2 9.8C18.6 12 21.6 13.4 26 14c-4.4.6-7.4 2-9.8 4.2C13.8 20.6 12.4 23.6 12 28c-.6-4.4-2-7.4-4.2-9.8C5.4 16 2.4 14.6-2 14c4.4-.6 7.4-2 9.8-4.2C10 7.4 11.4 4.4 12 0Z"
              transform="scale(0.86) translate(0.7 -1)"
              fill="url(#explore-sparkle-grad)"
            />
          </motion.svg>

          <h3
            className="text-2xl md:text-4xl font-black tracking-tight animate-gradient-flow"
            style={{
              backgroundImage: GRADIENT_TEXT,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Explore Our Range
          </h3>
        </div>

        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          whileInView={{ scaleX: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
          className="h-1.5 w-24 md:w-28 mx-auto mt-1 rounded-full animate-gradient-flow"
          style={{ backgroundImage: GRADIENT_TEXT }}
        />

      </div>

      {/* 3x3 Grid */}
      <div className="grid grid-cols-3 gap-4 md:gap-7">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => handleCardClick(card)}
            className="flex flex-col items-center gap-3 text-left group"
          >
            <div className="relative w-full aspect-square overflow-hidden flex items-center justify-center p-3 transition-transform group-hover:scale-[1.03]">
              <img
                src={card.imageUrl}
                alt={card.label}
                className="w-full h-full object-contain"
                loading="lazy"
              />

              {/* Discount Badge - Top Right of Image */}
              <span
                className="absolute top-1.5 right-1.5 inline-flex items-center px-2 py-0.5 rounded-full bg-white text-[10px] md:text-xs font-bold whitespace-nowrap"
                style={{ color: '#FF4757', boxShadow: '0 2px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.8)' }}
              >
                50% OFF
              </span>
            </div>
            <div
              className="relative w-full px-2 py-1.5 md:px-2.5 md:py-2 rounded-lg overflow-hidden transition-transform duration-300 group-hover:-translate-y-0.5"
              style={{
                backgroundColor: '#FF4757',
                boxShadow: '0 4px 6px -1px rgba(255,71,87,0.35), 0 2px 4px -2px rgba(255,71,87,0.3), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.15)',
              }}
            >
              {/* Glossy top highlight for subtle 3D pop */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-lg"
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0) 100%)' }}
              />

              <span className="relative block text-sm md:text-base font-bold text-white break-words leading-tight w-full text-center drop-shadow-sm">
                {card.label}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
