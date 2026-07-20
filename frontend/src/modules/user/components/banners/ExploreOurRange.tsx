import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rangeCardService, RangeCard } from '../../../../services/rangeCardService';

// Admin-managed Customer App Theme tokens, matching the pattern used by
// DealOfTheDay.tsx so this section follows the brand color picked in the
// Customer App Theme settings instead of being hardcoded.
const BRAND = {
  primary: 'var(--customer-primary)',
  tint: 'var(--customer-primary-alpha-10)',
  border: 'var(--customer-primary-alpha-30)',
};

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
    <div className="px-4 md:px-6 lg:px-8 pt-6 md:pt-8 pb-6 md:pb-8">
      {/* Heading */}
      <div className="text-center mb-7 md:mb-9">
        <h3 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight">
          Explore Our Range
        </h3>
        <div
          className="h-1 w-24 md:w-28 mx-auto mt-2.5 rounded-full"
          style={{ backgroundColor: BRAND.primary }}
        />
        <p className="text-sm md:text-base text-gray-500 font-medium mt-3">
          Shop smart across every price point
        </p>
      </div>

      {/* 3x3 Grid */}
      <div className="grid grid-cols-3 gap-4 md:gap-7">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => handleCardClick(card)}
            className="flex flex-col items-center gap-3 text-left group"
          >
            <div className="w-full aspect-square overflow-hidden flex items-center justify-center p-3 transition-transform group-hover:scale-[1.03]">
              <img
                src={card.imageUrl}
                alt={card.label}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <span className="text-sm md:text-base font-semibold text-gray-800 text-center w-full leading-snug">
              {card.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
