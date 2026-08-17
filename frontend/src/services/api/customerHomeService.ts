import api from "./config";
import { apiCache } from "../../utils/apiCache";

export interface HomeContentResponse {
  success: boolean;
  data: {
    bestsellers: any[];
    lowestPrices?: any[];
    categories: any[];
    shops: any[];
    promoBanners: any[];
    trending: any[];
    cookingIdeas: any[];
    promoCards?: any[];
    promoStrip?: any; // PromoStrip data from backend
    homeSections?: any[];
  };
}

// The request below deliberately does not send latitude/longitude (see the
// commented-out params in getHomeContent), so the response depends only on
// the header category. Including lat/lng here would mint a fresh key every
// time geolocation resolves and fire a second, byte-identical 2.4s request.
export const buildHomeContentCacheKey = (headerCategorySlug?: string) =>
  `home-content-${headerCategorySlug || 'all'}`;

export const getCachedHomeContent = (
  headerCategorySlug?: string
): HomeContentResponse | null => {
  // getStale, not getSync: a refresh after the TTL should still paint the
  // last known home content instantly while getOrFetch revalidates in the
  // background.
  return apiCache.getStale<HomeContentResponse>(
    buildHomeContentCacheKey(headerCategorySlug)
  );
};

/**
 * Get home page content with caching
 * @param headerCategorySlug - Optional header category slug to filter categories (e.g., 'winter', 'wedding')
 * @param useCache - Whether to use cache (default: true)
 * @param cacheTTL - Cache TTL in milliseconds (default: 5 minutes)
 */
export const getHomeContent = async (
  headerCategorySlug?: string,
  latitude?: number,
  longitude?: number,
  useCache: boolean = true,
  cacheTTL: number = 5 * 60 * 1000, // 5 minutes
  skipLoader: boolean = false
): Promise<HomeContentResponse> => {
  const cacheKey = buildHomeContentCacheKey(headerCategorySlug);

  const fetchFn = async () => {
    const params: any = headerCategorySlug ? { headerCategorySlug } : {};
    // if (latitude !== undefined && longitude !== undefined) {
    //   params.latitude = latitude;
    //   params.longitude = longitude;
    // }
    const response = await api.get<HomeContentResponse>("/customer/home", {
      params,
      skipLoader
    } as any);
    return response.data;
  };

  if (useCache) {
    return apiCache.getOrFetch(cacheKey, fetchFn, cacheTTL);
  }

  return fetchFn();
};

export const getLowestPricesProducts = async (
  latitude?: number,
  longitude?: number
): Promise<{ success: boolean; data: any[] }> => {
  const params: Record<string, number> = {};
  if (latitude !== undefined && longitude !== undefined) {
    params.latitude = latitude;
    params.longitude = longitude;
  }
  const response = await api.get("/customer/home/lowest-prices", { params });
  return response.data;
};

export const getAllBestsellers = async (): Promise<{ success: boolean; data: any[] }> => {
  const response = await api.get("/customer/home/bestsellers");
  return response.data;
};

/**
 * Get the full contents of an admin-created home section (e.g. "Office
 * Stationery") for its "View All" page. Product sections are paginated.
 */
export const getHomeSection = async (
  slug: string,
  params?: { page?: number; limit?: number; latitude?: number; longitude?: number }
): Promise<{
  success: boolean;
  data: { id: string; title: string; slug: string; displayType: string; columns: number; items: any[] };
  pagination?: { page: number; limit: number; hasMore: boolean };
}> => {
  const response = await api.get(`/customer/home/section/${slug}`, { params });
  return response.data;
};

/**
 * Get products for a specific "shop" (e.g. Spiritual Store)
 */
export const getStoreProducts = async (
  storeId: string,
  latitude?: number,
  longitude?: number,
  page?: number,
  limit?: number
): Promise<any> => {
  const params: any = { page, limit };
  if (latitude !== undefined && longitude !== undefined) {
    params.latitude = latitude;
    params.longitude = longitude;
  }
  const response = await api.get(`/customer/home/store/${storeId}`, { params });
  return response.data;
};
