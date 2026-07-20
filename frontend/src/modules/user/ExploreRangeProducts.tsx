import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ProductCard from "./components/ProductCard";
import { getProducts } from "../../services/api/customerProductService";
import { useLocation } from "../../hooks/useLocation";
import ShareButton from "../../components/ShareButton";

const BRAND_GRADIENT =
  "linear-gradient(135deg, var(--customer-primary) 0%, var(--customer-primary-light) 100%)";

export default function ExploreRangeProducts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { location } = useLocation();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const label = searchParams.get("label") || "Products in this range";

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getProducts({
          minPrice: minPrice ? Number(minPrice) : undefined,
          maxPrice: maxPrice ? Number(maxPrice) : undefined,
          sort: "price_asc",
          limit: 40,
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        if (response.success && Array.isArray(response.data)) {
          setProducts(
            response.data.map((p: any) => ({
              ...p,
              id: p._id || p.id,
            }))
          );
        } else {
          setProducts([]);
        }
      } catch (err) {
        console.error("Error fetching range products:", err);
        setError("Failed to load products. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [minPrice, maxPrice, location?.latitude, location?.longitude]);

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
              {label}
            </h1>
            <p className="text-[10px] md:text-xs text-neutral-500 font-medium tracking-tight">
              Explore Our Range
            </p>
          </div>
          <ShareButton
            iconOnly
            title={`${label} on Geeta Stores`}
            text={`Check out ${label} on Geeta Stores`}
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
            {label.toUpperCase()}
          </h2>
          <p className="text-white/80 text-sm md:text-base font-medium">
            Shop products in this price range
          </p>
        </div>
      </div>

      <div className="px-4 md:px-6 lg:px-8 py-6 md:py-10 max-w-7xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] bg-white rounded-2xl animate-pulse border border-neutral-100 shadow-sm"
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-neutral-500 bg-white p-6 rounded-2xl shadow-sm inline-block border border-neutral-100">
              {error}
            </p>
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                showBadge={true}
                categoryStyle={true}
                showStockInfo={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-neutral-500 font-medium">No products found in this range.</p>
          </div>
        )}
      </div>
    </div>
  );
}
