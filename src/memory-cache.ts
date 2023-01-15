import { BasicCache, BasicCacheConfig, TileCoordinate } from "./interfaces.js";


/**
 * Quick and dirty in memory cache. Should really be an improved solution with cache invalidation etc.
 */
export class MemoryCache<T> implements BasicCache<T> {
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
  async setup() {

  }
  /**
   * Returns value if it exists, if not returns null.
  */
  accessCache({ zoom, x, y }: TileCoordinate): Promise<T | null> {
    if (this.cache[zoom] && this.cache[zoom][x] && this.cache[zoom][x][y]) {
      this.hits += 1;
      this.maybeLogHitsMisses();
      return Promise.resolve(this.cache[zoom][x][y]);
    }
    this.misses += 1;
    this.maybeLogHitsMisses();
    return Promise.resolve(null);
  }

  setCache({ zoom, x, y }: TileCoordinate, val: T): Promise<void> {
    if (this.cache[zoom] == undefined) {
      this.cache[zoom] = {};
    }
    if (this.cache[zoom][x] === undefined) {
      this.cache[zoom][x] = {};
    }
    this.cache[zoom][x][y] = val;
    return Promise.resolve();
  }
  maybeLogHitsMisses() {
    if (this.logHitsMisses) {
      console.log(`${this.cacheName ? this.cacheName : 'cache'}: ${this.hits} hits, ${this.misses} misses. Success ratio ${this.hits / (this.hits + this.misses)}.`);
    }
  }
}
