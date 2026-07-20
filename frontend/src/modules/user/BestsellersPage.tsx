import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CategoryTileSection from "./components/CategoryTileSection";
import { getAllBestsellers } from "../../services/api/customerHomeService";
import ShareButton from "../../components/ShareButton";

const BRAND_GRADIENT =
  "linear-gradient(135deg, var(--customer-primary) 0%, var(--customer-primary-light) 100%)";

export default function BestsellersPage() {
  const navigate = useNavigate();
  const [tiles, setTiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBestsellers = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getAllBestsellers();
        if (response.success && Array.isArray(response.data)) {
          setTiles(response.data);
        } else {
          setTiles([]);
        }
      } catch (err) {
        console.error("Error fetching bestsellers:", err);
        setError("Failed to load bestsellers. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchBestsellers();
  }, []);

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
              Bestsellers
            </h1>
            <p className="text-[10px] md:text-xs text-neutral-500 font-medium tracking-tight">
              Our most popular categories
            </p>
          </div>
          <ShareButton
            iconOnly
            title="Bestsellers on Geeta Stores"
            text="Check out the bestselling categories on Geeta Stores"
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
            BESTSELLERS
          </h2>
          <p className="text-white/80 text-sm md:text-base font-medium">
            Shop the categories customers love most
          </p>
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
        ) : tiles.length > 0 ? (
          <CategoryTileSection title="" tiles={tiles} columns={4} showProductCount />
        ) : (
          <div className="text-center py-20">
            <p className="text-neutral-500 font-medium">No bestsellers configured yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
