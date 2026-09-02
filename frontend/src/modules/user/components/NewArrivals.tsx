import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "../../../hooks/useLocation";
import { getProducts } from "../../../services/api/customerProductService";
import SectionHeader from "./SectionHeader";
import ViewAllButton from "./ViewAllButton";
import ProductCard from "./ProductCard";

/** Shows products the admin/seller has flagged as "New Arrival" (isNewArrival
 * on Product), toggled per-product from the product edit form. Hidden when
 * no products are flagged so it never leaves a dead section on the page. */
export default function NewArrivals() {
  const navigate = useNavigate();
  const { location } = useLocation();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProducts({
      isNewArrival: true,
      limit: 12,
      latitude: location?.latitude,
      longitude: location?.longitude,
    })
      .then((res: any) => {
        if (cancelled) return;
        if (res.success && Array.isArray(res.data)) {
          setProducts(res.data);
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
  }, [location?.latitude, location?.longitude]);

  if (!loading && products.length === 0) return null;

  return (
    <div className="mt-2 md:mt-4">
      <SectionHeader
        title="New Arrivals"
        action={<ViewAllButton onClick={() => navigate("/products?isNewArrival=true")} />}
      />
      <div className="px-4 md:px-6 lg:px-8">
        {loading ? (
          <div className="flex gap-2 overflow-x-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`new-skel-${i}`} className="flex-shrink-0 w-[140px] rounded-xl border border-neutral-200 bg-white p-2 animate-pulse">
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
