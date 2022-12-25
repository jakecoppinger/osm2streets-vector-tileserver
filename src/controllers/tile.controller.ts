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
export default class UserController {
  public static async getUsers(ctx: RouterContext) {
    // For future: https://api.mapbox.com/v4/{tileset_id}/{zoom}/{x}/{y}.{format}
    const zoom = parseInt(ctx.params.zoom);
    const x = parseInt(ctx.params.x);
    const y = parseInt(ctx.params.y);

    if (cache[zoom] && cache[zoom][x] && cache[zoom][x][y]) {
      sendProtobuf(ctx, cache[zoom][x][y]);
      return;
    }

    const url = generateOverpassTurboQueryUrl({ zoom, x, y });
    // HIT http://localhost:3000/tile/16/60293/39332 TO TEST :)


    var osmXML;
    try {
      console.log("Fetching XML from overpass...");
      const resp = await fetch(url);
      osmXML = await resp.text();
      console.log("Got OSM input.");

    } catch (e) {
      ctx.status = 503;
      ctx.body = JSON.stringify(e, null, 2);
      return;
    }
    if (osmXML === undefined) {
      ctx.status = 503;
      ctx.body = "Error: OSM XML is undefined";
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
    console.log("Generating geojson...");
    const geometry = JSON.parse(network.toGeojsonPlain());
    // const lanePolygons = network.toLanePolygonsGeojson();
    // const laneMarkings = network.toLaneMarkingsGeojson();


    console.log("Generating tileindex...");
    const tileIndex = geojsonvt(geometry, {
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
      return;
    }


    console.log("Generating tile...");
    const tile = tileIndex.getTile(zoom, x, y);
    if (tile === null) {
      ctx.status = 500;
      ctx.body = "Error: Coudn't get tile from geojsonvt";
      return;
    }

    // This is a Uint8Array
    const rawArray = vtpbf.fromGeojsonVt({ 'geojsonLayer': tile });
    const buf = Buffer.from(rawArray);

    console.log(buf)

    sendProtobuf(ctx,buf);

    if (cache[zoom] == undefined) {
      cache[zoom] = {};
    }
    if (cache[zoom][x] === undefined) {
      cache[zoom][x] = {};
    }
    cache[zoom][x][y] = buf;
  }
}
