import { useEffect, useState } from 'react';
import { Product } from '../types/domain';
import { getStoreProducts } from '../services/api/customerHomeService';
import { getProducts } from '../services/api/customerProductService';
import { useLocation } from './useLocation';

/**
 * Products for the hand-built store pages (/store/toy, /store/pet, ...).
 *
 * Those routes are static, so React Router ranks them above /store/:slug and
 * they never reach StorePage — which means they never consulted the Shop by
 * Store configuration at all. They only ever queried a category, and
 * `getProducts` deliberately excludes shop-by-store-only products, so anything
 * an admin curated for these stores was unreachable in the customer app.
 *
 * Prefer the curated store products; fall back to the original category query
 * when no shop is configured under this slug (or the shop is empty), so each
 * page keeps behaving exactly as before until an admin sets one up.
 */
export function useCuratedStoreProducts(
  storeSlug: string,
  fallbackCategory: string
) {
  const { location } = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const latitude = location?.latitude;
  const longitude = location?.longitude;

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        let curated: Product[] | null = null;

        try {
          const response = await getStoreProducts(
            storeSlug,
            latitude,
            longitude,
            1,
            100
          );
          if (response?.success && response.data?.length > 0) {
            curated = response.data as Product[];
          }
        } catch (error) {
          // A missing store is not an error for these pages — fall through.
          console.error(
            `Failed to fetch curated products for store "${storeSlug}":`,
            error
          );
        }

        if (cancelled) return;

        if (!curated) {
          const response = await getProducts({ category: fallbackCategory });
          curated = (response.data || []) as unknown as Product[];
        }

        if (!cancelled) setProducts(curated);
      } catch (error) {
        console.error(`Failed to fetch ${fallbackCategory} products:`, error);
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, [storeSlug, fallbackCategory, latitude, longitude]);

  return { products, loading };
}
