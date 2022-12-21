import { RouterContext } from 'koa-router';

import { JsStreetNetwork } from "../osm2streets-js/osm2streets_js.js";

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

export default class UserController {
  public static async getUsers(ctx: RouterContext) {
    // For future: https://api.mapbox.com/v4/{tileset_id}/{zoom}/{x}/{y}.{format}
    const zoom = parseInt(ctx.params.zoom);
    const x = parseInt(ctx.params.x);
    const y = parseInt(ctx.params.y);

    if (cache[zoom] && cache[zoom][x] && cache[zoom][x][y]) {
      ctx.status = 200;
      ctx.body = cache[zoom][x][y];
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
    const network = new JsStreetNetwork(osmXML, {
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
    const geometry = network.toGeojsonPlain();

    if(cache[zoom] == undefined) {
      cache[zoom] = {};
    }
    if(cache[zoom][x] === undefined) {
      cache[zoom][x] = {};
    }
    cache[zoom][x][y] = geometry;
    // const lanePolygons = network.toLanePolygonsGeojson();
    // const laneMarkings = network.toLaneMarkingsGeojson();

    // console.log(JSON.stringify(geometry, null,2));
    // console.log("OSM network is above.");
    ctx.status = 200;
    ctx.body = geometry;
  }
}