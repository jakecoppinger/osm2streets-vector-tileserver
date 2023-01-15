import geojsonvt from 'geojson-vt';
export interface TileCoordinate {
  zoom: number;
  x: number;
  y: number;
}

/** Not yet exported from the types */
export type GeoJSONVT = ReturnType<typeof geojsonvt>

export type AllFeatureTypes = 'geometry' | 'lanePolygons' | 'laneMarkings' | 'intersectionMarkings';

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

export interface BasicCache<T> {
  accessCache(coord: TileCoordinate): T | null;
  setCache(coord: TileCoordinate, val: T): void;
  maybeLogHitsMisses(): void;
}
