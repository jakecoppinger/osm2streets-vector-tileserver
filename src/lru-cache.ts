import { caching, MemoryCache } from 'cache-manager';

import { BasicCache, BasicCacheConfig, TileCoordinate } from "./interfaces.js";

export class LRUCache<T> implements BasicCache<T> {
  cacheName?: string = undefined;
  cache?: MemoryCache;
  hits: number = 0;
  misses: number = 0;
  logHitsMisses: boolean = false;

  constructor({ logHitsMisses, cacheName }: BasicCacheConfig) {
    if (cacheName !== undefined) {
      this.cacheName = cacheName;
    }
    if (logHitsMisses === true) {
      this.logHitsMisses = true;
    }
  }
  async setup() {
    this.cache = await caching('memory', {
      max: 100000,
      // 24 hour cache
      ttl: 1000 * 60 * 60 * 24
    });
  }
  /**
   * Returns value if it exists, if not returns null.
  */
  async accessCache({ zoom, x, y }: TileCoordinate): Promise<T | null> {
    if (this.cache === undefined) {
      return null;
    }
    const cacheKey = `${zoom}-${x}-${y}`;
    const value = await this.cache.get<T>(cacheKey);
    if (value !== undefined) {
      this.hits += 1;
      this.maybeLogHitsMisses();
      return value;
    }
    this.misses += 1;
    this.maybeLogHitsMisses();
    return null;
  }

  async setCache({ zoom, x, y }: TileCoordinate, val: T): Promise<void> {
    if (this.cache === undefined) {
      return;
    }
    const cacheKey = `${zoom}-${x}-${y}`;
    await this.cache.set(cacheKey, val);
  }
  maybeLogHitsMisses() {
    if (this.logHitsMisses) {
      console.log(`${this.cacheName ? this.cacheName : 'cache'}: ${this.hits} hits, ${this.misses} misses. Success ratio ${this.hits / (this.hits + this.misses)}.`);
    }
  }
}
