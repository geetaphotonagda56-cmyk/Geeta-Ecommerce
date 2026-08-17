/**
 * Simple in-memory cache for backend API responses
 * Can be upgraded to Redis for production
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class Cache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes default

  // Requests that are currently computing a value, keyed the same as the
  // cache. Without this, N concurrent misses all run the producer — that's
  // how four simultaneous /customer/home requests took the API down.
  private inFlight: Map<string, Promise<any>> = new Map();

  /**
   * Return the cached value, or compute it exactly once for all concurrent
   * callers and cache the result.
   */
  async getOrSet<T>(
    key: string,
    producer: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== null) return hit;

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = producer()
      .then((value) => {
        this.set(key, value, ttl);
        this.inFlight.delete(key);
        return value;
      })
      .catch((err) => {
        // Never cache failures, and never leave a poisoned in-flight entry.
        this.inFlight.delete(key);
        throw err;
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Get cached data
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache data
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Delete cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
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
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Invalidate cache entries by key pattern
   */
  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance
export const cache = new Cache();

// Clean expired entries every 5 minutes
setInterval(() => {
  cache.cleanExpired();
}, 5 * 60 * 1000);
