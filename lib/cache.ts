// lib/cache.ts
interface CacheEntry {
  data: any;
  timestamp: number;
}

class SearchCache {
  private cache: Map<string, CacheEntry>;
  private ttl: number;
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(ttl: number = 3 * 60 * 1000, maxSize: number = 100) { // 3 minutes TTL
    this.cache = new Map();
    this.ttl = ttl;
    this.maxSize = maxSize;
    this.cleanupInterval = null;
    
    // Only start cleanup interval in Node.js environment (not edge runtime)
    if (typeof process !== 'undefined' && process.env.VERCEL_ENV !== 'edge') {
      this.startCleanupInterval();
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every 3 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 3 * 60 * 1000);
    
    // Prevent interval from keeping process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    
    // Limit cache size using LRU approach
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Export singleton instance
export const searchCache = new SearchCache();