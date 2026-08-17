/**
 * Simple in-memory cache for API responses
 * Helps prevent duplicate requests and speeds up repeated calls
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

const STORAGE_KEY = 'api-cache-v1';
// Only these key prefixes are persisted. Anything user-specific or
// write-sensitive stays in memory only.
const PERSIST_PREFIXES = ['home-content-', 'header-categories'];
// sessionStorage quota is ~5MB; refuse to persist anything pathological.
const MAX_PERSISTED_BYTES = 2 * 1024 * 1024;

class APICache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes default
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor() {
    this.restore();
  }

  private shouldPersist(key: string): boolean {
    return PERSIST_PREFIXES.some((p) => key.startsWith(p));
  }

  private restore(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const entries: [string, CacheEntry<any>][] = JSON.parse(raw);
      const now = Date.now();
      for (const [key, entry] of entries) {
        // Keep expired entries too: getOrFetch serves them stale while it
        // revalidates, which is what makes a refresh feel instant.
        if (entry && typeof entry.expiresAt === 'number' && now < entry.expiresAt + 60 * 60 * 1000) {
          this.cache.set(key, entry);
        }
      }
    } catch {
      // Corrupt payload — start clean rather than break the app.
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    try {
      const entries = [...this.cache.entries()].filter(([k]) => this.shouldPersist(k));
      if (!entries.length) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload = JSON.stringify(entries);
      if (payload.length > MAX_PERSISTED_BYTES) return;
      sessionStorage.setItem(STORAGE_KEY, payload);
    } catch {
      // Quota exceeded or storage disabled — caching stays in-memory only.
    }
  }

  /**
   * Get cached data or fetch if not cached/expired
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    // Check if there's a pending request for this key
    const pendingRequest = this.pendingRequests.get(key);
    if (pendingRequest) {
      return pendingRequest;
    }

    // Check cache
    const cached = this.cache.get(key);
    const fresh = cached && Date.now() < cached.expiresAt;
    if (fresh) {
      return cached!.data as T;
    }

    // Fetch new data
    const requestPromise = fetchFn().then((data) => {
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl,
      });
      this.pendingRequests.delete(key);
      this.persist();
      return data;
    }).catch((error) => {
      this.pendingRequests.delete(key);
      throw error;
    });

    this.pendingRequests.set(key, requestPromise);

    // Deliberately NOT stale-while-revalidate here: a caller that `await`s
    // getOrFetch expects the promise to resolve with real data. Handing back
    // a stale value early means the network response — even though it
    // completes and updates the cache — never reaches whatever called this,
    // which looks like "the request finished but the UI didn't update".
    // Instant-paint-from-cache is handled separately by getStale/getSync,
    // used synchronously for initial render (see Home.tsx) — this function
    // only ever resolves with fresh (or freshly-confirmed) data.
    return requestPromise;
  }

  /**
   * Invalidate cache for a specific key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    this.persist();
  }

  /**
   * Invalidate cache matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
    this.persist();
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
    this.persist();
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Check if data is cached and not expired (synchronous)
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    return cached !== undefined && Date.now() < cached.expiresAt;
  }

  /**
   * Get cached data synchronously (returns null if not cached or expired)
   */
  getSync<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }
    return null;
  }

  /**
   * Get cached data synchronously, including expired entries.
   *
   * Pair this with getOrFetch's stale-while-revalidate path: the caller
   * renders the stale value immediately and the background refetch replaces
   * it. Only use where showing slightly-old data beats showing a spinner.
   */
  getStale<T>(key: string): T | null {
    const cached = this.cache.get(key);
    return cached ? (cached.data as T) : null;
  }
}

// Singleton instance
export const apiCache = new APICache();

// Clean expired entries every minute
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.cleanExpired();
  }, 60 * 1000);
}

