import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CategoryTileSection from "./components/CategoryTileSection";
import ProductCard from "./components/ProductCard";
import ShareButton from "../../components/ShareButton";
import { getHomeSection } from "../../services/api/customerHomeService";
import { useLocation } from "../../hooks/useLocation";

const BRAND_GRADIENT =
  "linear-gradient(135deg, var(--customer-primary) 0%, var(--customer-primary-light) 100%)";

export default function HomeSectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { location } = useLocation();
  const [title, setTitle] = useState("");
  const [displayType, setDisplayType] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;

    const fetchSection = async () => {
      if (currentPage === 1) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const response = await getHomeSection(slug, {
          page: currentPage,
          limit,
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        if (response.success && response.data) {
          setTitle(response.data.title);
          setDisplayType(response.data.displayType);
          setItems((prev) =>
            currentPage === 1 ? response.data.items : [...prev, ...response.data.items]
          );
          setHasMore(response.pagination?.hasMore ?? false);
        } else if (currentPage === 1) {
          setItems([]);
        }
      } catch (err) {
        console.error("Error fetching home section:", err);
        if (currentPage === 1) {
          setError("Failed to load this section. Please try again later.");
          setItems([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };

    fetchSection();
  }, [slug, currentPage, location?.latitude, location?.longitude]);

  // Infinite scroll for product sections only — category/subcategory
  // sections return their full (bounded) list on page 1.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || displayType !== "products") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayType, hasMore, loading, loadingMore]);

  const isProducts = displayType === "products";

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      <div className="sticky top-0 z-40 bg-white border-b border-neutral-200">
        <div className="px-4 md:px-6 lg:px-8 py-3 md:py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-neutral-700 hover:bg-neutral-100 rounded-full transition-colors"
            aria-label="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18L9 12L15 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex flex-col">
            <h1 className="text-base md:text-xl font-bold text-neutral-900 leading-tight">
              {title || "..."}
            </h1>
          </div>
          <ShareButton
            iconOnly
            title={title ? `${title} on Geeta Stores` : undefined}
            text={title ? `Check out ${title} on Geeta Stores` : undefined}
            imageUrl={`${window.location.origin}/assets/geetastoreslogo.png`}
            className="ml-auto w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-neutral-700 hover:bg-neutral-100 rounded-full transition-colors flex-shrink-0"
          />
        </div>
      </div>

      <div
        className="px-4 md:px-6 lg:px-8 py-6 md:py-10 text-white"
        style={{ background: BRAND_GRADIENT }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black mb-2 tracking-tighter">
            {(title || "").toUpperCase()}
          </h2>
        </div>
      </div>

      <div className="py-6 md:py-10 max-w-7xl mx-auto">
        {loading ? (
          <div className="px-4 md:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-white rounded-2xl animate-pulse border border-neutral-100 shadow-sm"
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-neutral-500 bg-white p-6 rounded-2xl shadow-sm inline-block border border-neutral-100">
              {error}
            </p>
          </div>
        ) : items.length > 0 ? (
          isProducts ? (
            <div className="px-4 md:px-6 lg:px-8">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
                {items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    showBadge={true}
                    categoryStyle={true}
                    showStockInfo={false}
                  />
                ))}
              </div>
              {hasMore && <div ref={sentinelRef} className="h-1 w-full" />}
              {loadingMore && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6 mt-3 md:mt-6">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={`more-${i}`}
                      className="aspect-[3/4] bg-white rounded-2xl animate-pulse border border-neutral-100 shadow-sm"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <CategoryTileSection title="" tiles={items} columns={4} />
          )
        ) : (
          <div className="text-center py-20">
            <p className="text-neutral-500 font-medium">Nothing to show here yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
