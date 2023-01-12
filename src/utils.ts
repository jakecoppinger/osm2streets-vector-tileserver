// from https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_(JavaScript/ActionScript,_etc.)
export function tile2long(x: number, z: number): number {
  return (x / Math.pow(2, z) * 360.0 - 180.0);
}
export function tile2lat(y: number, z: number): number {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

export function generateOverpassTurboQueryUrl({ zoom, x, y }: { zoom: number, x: number, y: number }): string {
  // https://gis.stackexchange.com/questions/17278/calculate-lat-lon-bounds-for-individual-tile-generated-from-gdal2tiles
  // latitude is horizontal lines and specifies how north/south something is
  // longitude is vertical lines and specifies how east/west something is
  const NW_long = tile2long(x, zoom);
  const SW_long = tile2long(x, zoom);
  const SW_lat = tile2lat(y + 1, zoom); // nad
  const NE_long = tile2long(x + 1, zoom); // bad 
  const NE_lat = tile2lat(y, zoom);


  // southern-most latitude, western-most longitude, northern-most latitude, eastern-most longitude.
  const bbox = `${SW_lat},${SW_long},${NE_lat},${NE_long}`;
  const query = `(nwr(${bbox}); node(w)->.x; <;); out meta;`;
  const url = `http://localhost:12345/api/interpreter?data=${query}`;

  // Don't hit this API too hard please!
  // const url = `https://overpass-api.de/api/interpreter?data=${query}`;
  return url;
}


export function calculateXYForZoom({ zoom, x, y, targetZoom }: { zoom: number, x: number, y: number, targetZoom: number }): { x: number, y: number } | null {
  if (targetZoom === zoom) {
    return { x, y };
  }
  if (targetZoom < zoom) {
    // We can't zoom out
    return null;
  }
  let zoomIterator: number = zoom;
  let xIterator: number = x;
  let yIterator: number = x;
  while (zoomIterator > targetZoom) {
    xIterator /= 2;
    yIterator /= 2;
    zoomIterator -= 1;
  }
  return { x: xIterator, y: yIterator };
}
