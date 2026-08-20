import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useLocation } from '../hooks/useLocation';
import { getWishlist, addToWishlist as apiAddToWishlist, removeFromWishlist as apiRemoveFromWishlist } from '../services/api/customerWishlistService';

interface WishlistContextType {
  wishlistIds: Set<string>;
  loading: boolean;
  isWishlisted: (productId?: string) => boolean;
  toggleWishlist: (productId: string, lat?: number, lng?: number) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

// Fetches the customer's wishlist once per (auth, location) change and shares
// membership state across every ProductCard/WishlistButton on the page,
// instead of each one independently re-fetching the full wishlist.
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { location } = useLocation();
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setWishlistIds(new Set());
      fetchedForRef.current = null;
      return;
    }

    const key = `${location?.latitude ?? ''},${location?.longitude ?? ''}`;
    if (fetchedForRef.current === key) return;
    fetchedForRef.current = key;

    let cancelled = false;
    setLoading(true);
    getWishlist({ latitude: location?.latitude, longitude: location?.longitude })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.products) {
          const ids = res.data.products.map((p: any) => String(p._id || p.id));
          setWishlistIds(new Set(ids));
        }
      })
      .catch(() => {
        if (!cancelled) setWishlistIds(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location?.latitude, location?.longitude]);

  const isWishlisted = useCallback(
    (productId?: string) => (productId ? wishlistIds.has(String(productId)) : false),
    [wishlistIds]
  );

  const toggleWishlist = useCallback(
    async (productId: string, lat?: number, lng?: number) => {
      const id = String(productId);
      const wasWishlisted = wishlistIds.has(id);

      setWishlistIds((prev) => {
        const next = new Set(prev);
        if (wasWishlisted) next.delete(id);
        else next.add(id);
        return next;
      });

      try {
        if (wasWishlisted) {
          await apiRemoveFromWishlist(id);
        } else {
          await apiAddToWishlist(id, lat, lng);
        }
      } catch (error) {
        // Revert on failure
        setWishlistIds((prev) => {
          const next = new Set(prev);
          if (wasWishlisted) next.add(id);
          else next.delete(id);
          return next;
        });
        throw error;
      }
    },
    [wishlistIds]
  );

  return (
    <WishlistContext.Provider value={{ wishlistIds, loading, isWishlisted, toggleWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlistContext() {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error('useWishlistContext must be used within a WishlistProvider');
  }
  return ctx;
}
