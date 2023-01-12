import geojsonvt from 'geojson-vt';
export interface TileCoordinate {
  zoom: number;
  x: number;
  y: number;
}

/** Not yet exported from the types */
export type GeoJSONVT = ReturnType<typeof geojsonvt>

export type AllFeatureTypes = 'geometry' | 'lanePolygons' | 'laneMarkings' | 'intersectionMarkings';