import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getCategories, Category } from '../../../services/api/customerProductService';

/**
 * "Shop by Category" — a horizontally scrolling row of root categories.
 * Tapping a card opens that category; "View all" opens the full list.
 */
export default function ShopByCategory() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCategories(false)
      .then((response) => {
        if (cancelled || !response.success || !Array.isArray(response.data)) return;
        setCategories(response.data.filter((c) => !c.parentId));
      })
      .catch((error) => console.error('Failed to fetch categories:', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && categories.length === 0) return null;

  return (
    <section className="bg-[var(--hp-bg)]">
      <div className="px-4 md:px-6 lg:px-8 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl leading-tight font-bold text-[var(--hp-text)]">Shop by Category</h2>
          <p className="mt-0.5 text-xs text-[var(--hp-text-muted)]">Categories</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/categories')}
          className="flex flex-shrink-0 items-center gap-0.5 pb-0.5 text-sm font-semibold text-[var(--hp-accent)]"
        >
          View all
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide px-4 md:px-6 lg:px-8 pb-1 scroll-smooth">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`cat-skel-${i}`}
                className="flex-shrink-0 w-[68px] h-[104px] rounded-xl bg-[var(--hp-card-tint)] animate-pulse"
              />
            ))
          : categories.map((category) => {
              const id = category._id || category.id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(`/category/${id}`)}
                  className="flex-shrink-0 w-[68px] flex flex-col items-center rounded-xl bg-[var(--hp-card-tint)] px-1.5 pt-2 pb-2 active:scale-95 transition-transform"
                >
                  <span className="w-[52px] h-[52px] flex items-center justify-center overflow-hidden rounded-lg">
                    {category.image ? (
                      <img
                        src={category.image}
                        alt={category.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="text-lg font-bold text-[var(--hp-text-subtle)]">
                        {category.name.charAt(0)}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 text-[10px] leading-[1.25] font-semibold text-center text-[var(--hp-text)] line-clamp-2">
                    {category.name}
                  </span>
                </button>
              );
            })}
      </div>
    </section>
  );
}
