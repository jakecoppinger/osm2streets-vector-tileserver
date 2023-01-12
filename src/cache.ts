import { TileCoordinate } from "./interfaces.js";

/**
 * Quick and dirty in memory cache. Should really be an improved solution with cache invalidation etc.
 */
export class BasicCache<T> {
  // "3D" key value dict
  cache: {
    [zoom: number]: {
      [x: number]: {
        [y: number]: T
      }
    }
  };

  constructor() {
    this.cache = {}
  }
  /**
   * Returns value if it exists, if not returns null.
  */
  accessCache({ zoom, x, y }: TileCoordinate): T | null {
    if (this.cache[zoom] && this.cache[zoom][x] && this.cache[zoom][x][y]) {
      return this.cache[zoom][x][y];
    }
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
  }
}
