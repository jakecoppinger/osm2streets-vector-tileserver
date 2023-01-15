import { TileCoordinate } from "./interfaces.js";

export interface BasicCacheConfig {
  /**
   * Should the cache log out the hits & misses data on each hit or miss on access
   */
  logHitsMisses?: boolean;
  /**
   * Name of the cache to include in hits/misses logs
   */
  cacheName?: string,
}

/**
 * Quick and dirty in memory cache. Should really be an improved solution with cache invalidation etc.
 */
export class BasicCache<T> {
  // "3D" key value dict
  cacheName?: string = undefined;
  cache: {
    [zoom: number]: {
      [x: number]: {
        [y: number]: T
      }
    }
  };
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
    this.cache = {}
  }
  /**
   * Returns value if it exists, if not returns null.
  */
  accessCache({ zoom, x, y }: TileCoordinate): T | null {
    if (this.cache[zoom] && this.cache[zoom][x] && this.cache[zoom][x][y]) {
      this.hits += 1;
      this.maybeLogHitsMisses();
      return this.cache[zoom][x][y];
    }
    this.misses += 1;
    this.maybeLogHitsMisses();
    return null;
  }

  setCache({ zoom, x, y }: TileCoordinate, val: T): void {
    if (this.cache[zoom] == undefined) {
      this.cache[zoom] = {};
    }
    if (this.cache[zoom][x] === undefined) {
      this.cache[zoom][x] = {};
    }
    this.cache[zoom][x][y] = val;
  }
  clearCache(): void {
    this.cache = {};
    this.hits = 0;
    this.misses = 0;
  }
  maybeLogHitsMisses() {
    if (this.logHitsMisses) {
      console.log(`${this.cacheName ? this.cacheName : 'cache'}: ${this.hits} hits, ${this.misses} misses. Success ratio ${this.hits / (this.hits + this.misses)}.`);
    }
  }
}
