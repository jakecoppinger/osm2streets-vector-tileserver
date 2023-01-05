import Router, { RouterContext } from 'koa-router';
import { JsStreetNetwork } from "osm2streets-js-node/osm2streets_js.js";
import geojsonvt from 'geojson-vt';
// Can't find types for vt-pbf
// @ts-ignore
import vtpbf from 'vt-pbf';

// from https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_(JavaScript/ActionScript,_etc.)
function tile2long(x: number, z: number): number {
  return (x / Math.pow(2, z) * 360.0 - 180.0);
}
function tile2lat(y: number, z: number): number {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

function generateOverpassTurboQueryUrl({ zoom, x, y }: { zoom: number, x: number, y: number }): string {
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

const cache: any = {}


function sendProtobuf(ctx: RouterContext, protobuf: any): void {
  ctx.status = 200;
  ctx.body = protobuf;
  ctx.set('Content-Type', 'application/octet-stream');
}

/** Returns true if a given param string is a valid number.
 * If not, set Koa status & error before returning false */
function validateNumberParam({ param, paramName, ctx }: { param: string, paramName: string, ctx: RouterContext }): boolean {
  const possibleNumber = parseInt(param);
  if (isNaN(possibleNumber)) {
    ctx.status = 500;
    const error = `Error: {${paramName}} param isn't a number, it is: ${param} (maybe a string?)`;
    ctx.body = error;
    console.error(error);
    return false
  }
  return true;
}

async function fetchOverpassXMLAndValidate({ zoom, x, y, ctx }:
  { zoom: number, x: number, y: number, ctx: RouterContext }): Promise<string | null> {
  const url = generateOverpassTurboQueryUrl({ zoom, x, y });
  // HIT http://localhost:3000/tile/16/60293/39332 TO TEST :)
  try {
    console.log("Fetching XML from overpass...");
    const resp = await fetch(url);
    const osmXML = await resp.text();
    console.log("Got OSM input.");
    if (osmXML === undefined) {
      ctx.status = 503;
      ctx.body = "Error: OSM XML is undefined";
      return null;
    }
    return osmXML;

  } catch (e) {
    ctx.status = 503;
    ctx.body = JSON.stringify(e, null, 2);
    console.error("ERROR: Failed to make request to overpass. Is the Docker container running?");
    return null;
  }
}

function generateTileIndex(geojson: any, ctx: RouterContext) {
  const tileIndex = geojsonvt(geojson, {
    maxZoom: 24,  // max zoom to preserve detail on; can't be higher than 24
    tolerance: 3, // simplification tolerance (higher means simpler)
    extent: 4096, // tile extent (both width and height)
    buffer: 64,   // tile buffer on each side
    debug: 0,     // logging level (0 to disable, 1 or 2)
    lineMetrics: false, // whether to enable line metrics tracking for LineString/MultiLineString features
    promoteId: null,    // name of a feature property to promote to feature.id. Cannot be used with `generateId`
    generateId: false,  // whether to generate feature ids. Cannot be used with `promoteId`
    indexMaxZoom: 5,       // max zoom in the initial tile index
    indexMaxPoints: 100000 // max number of points per tile in the index
  });
  if (tileIndex === null) {
    ctx.status = 500;
    ctx.body = "Error: unable to generate vector tile from geojson";
    return null;
  }
  return tileIndex
}

export default class UserController {
  public static async getUsers(ctx: RouterContext) {
    // For future: https://api.mapbox.com/v4/{tileset_id}/{zoom}/{x}/{y}.{format}

    // If any validation returns a false and returns error, return.
    if (
      !validateNumberParam({ param: ctx.params.zoom, paramName: 'z', ctx }) ||
      !validateNumberParam({ param: ctx.params.x, paramName: 'x', ctx }) ||
      !validateNumberParam({ param: ctx.params.y, paramName: 'y', ctx })
    ) {
      return;
    }
    const zoom = parseInt(ctx.params.zoom, 10);
    const x = parseInt(ctx.params.x, 10);
    const y = parseInt(ctx.params.y, 10);

    // TODO: Clean up and implement a proper cache.
    if (cache[zoom] && cache[zoom][x] && cache[zoom][x][y]) {
      sendProtobuf(ctx, cache[zoom][x][y]);
      return;
    }

    const osmXML = await fetchOverpassXMLAndValidate({ zoom, x, y, ctx });
    if (osmXML === null) {
      return;
    }

    console.log("Generating road network...");
    const boundaryGeojson = "";
    const network = new JsStreetNetwork(osmXML, boundaryGeojson, {
      // Play with options in the sidebar at https://a-b-street.github.io/osm2streets/ :)
      debug_each_step: false,
      dual_carriageway_experiment: false,
      cycletrack_snapping_experiment:
        false,
      inferred_sidewalks: false,
      // Enable osm2lanes experiment
      osm2lanes: false,
    });
    console.log("Generating geojson (currently you need to choose which features in code)...");
    const geometryFeatures = network.toGeojsonPlain();
    const lanePolygonFeatures = network.toLanePolygonsGeojson();
    const laneMarkingFeatures = network.toLaneMarkingsGeojson();

    // TODO: This needs improving, I don't know much about GeoJSON but it works!
    // const geojson: any = {
    //   type: "FeatureCollection",
    //   features: [...JSON.parse(lanePolygonsFeatures).features, ...JSON.parse(geometryFeatures).features, ...JSON.parse(laneMarkingsFeatures).features]
    // };
    const geometryGeoJSON = {
      type: "FeatureCollection",
      features: [...JSON.parse(geometryFeatures).features]
    };
    const lanePolygonGeoJSON = {
      type: "FeatureCollection",
      features: [...JSON.parse(lanePolygonFeatures).features]
    };

    const laneMarkingGeoJSON = {
      type: "FeatureCollection",
      features: [...JSON.parse(laneMarkingFeatures).features]
    };

    console.log("Generating tileindex...");

    const geometryTileIndex = await generateTileIndex(geometryGeoJSON, ctx);
    const lanePolygonTileIndex = await generateTileIndex(lanePolygonGeoJSON, ctx);
    const laneMarkingTileIndex = await generateTileIndex(laneMarkingGeoJSON, ctx);

    if (geometryTileIndex === null || lanePolygonTileIndex === null || laneMarkingTileIndex === null) {
      return;
    }

    console.log("Generating tile...");
    const geometryTile = geometryTileIndex.getTile(zoom, x, y);
    const lanePolygonTile = lanePolygonTileIndex.getTile(zoom, x, y);
    const laneMarkingTile = laneMarkingTileIndex.getTile(zoom, x, y);

    if (geometryTile === null || lanePolygonTile === null || laneMarkingTile === null) {
      ctx.status = 500;
      ctx.body = "Error: Coudn't get one of the tiles from geojsonvt";
      return;
    }

    // This is a Uint8Array
    const rawArray = vtpbf.fromGeojsonVt({ geometry: geometryTile, lanePolygons: lanePolygonTile, });
    const buf = Buffer.from(rawArray);

    sendProtobuf(ctx, buf);

    // TODO: Clean up and implement a proper cache.
    if (cache[zoom] == undefined) {
      cache[zoom] = {};
    }
    if (cache[zoom][x] === undefined) {
      cache[zoom][x] = {};
    }
    cache[zoom][x][y] = buf;
  }
}
