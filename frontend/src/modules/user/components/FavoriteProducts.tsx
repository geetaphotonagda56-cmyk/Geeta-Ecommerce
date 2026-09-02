import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useLocation } from "../../../hooks/useLocation";
import { getWishlist } from "../../../services/api/customerWishlistService";
import SectionHeader from "./SectionHeader";
import ViewAllButton from "./ViewAllButton";
import ProductCard from "./ProductCard";

/** Shows the logged-in customer's wishlisted products at the top of Home.
 * Hidden entirely for guests and for users with an empty wishlist so it
 * never leaves a dead section on the page. */
export default function FavoriteProducts() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { location } = useLocation();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setProducts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getWishlist({ latitude: location?.latitude, longitude: location?.longitude })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.products) {
          setProducts(res.data.products);
        }
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location?.latitude, location?.longitude]);

  if (!isAuthenticated) return null;
  if (!loading && products.length === 0) return null;

  return (
    <div className="mt-2 md:mt-4">
      <SectionHeader
        title="Your Favorites"
        action={<ViewAllButton onClick={() => navigate("/wishlist")} />}
      />
      <div className="px-4 md:px-6 lg:px-8">
        {loading ? (
          <div className="flex gap-2 overflow-x-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`fav-skel-${i}`} className="flex-shrink-0 w-[140px] rounded-xl border border-neutral-200 bg-white p-2 animate-pulse">
                <div className="aspect-square w-full rounded-lg bg-neutral-100" />
                <div className="mt-2 h-3 w-4/5 rounded bg-neutral-100" />
                <div className="mt-1.5 h-3 w-2/3 rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 md:gap-4 overflow-x-auto scrollbar-hide pb-1">
            {products.map((product: any) => (
              <div key={product.id || product._id} className="flex-shrink-0 w-[140px] md:w-[180px]">
                <ProductCard
                  product={product}
                  categoryStyle={true}
                  showBadge={true}
                  showPackBadge={false}
                  showStockInfo={true}
                  compact={true}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
