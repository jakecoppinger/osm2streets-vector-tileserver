import Router, { RouterContext } from 'koa-router';
import { JsStreetNetwork } from "osm2streets-js-node/osm2streets_js.js";
// Can't find types for vt-pbf
// @ts-ignore
import vtpbf from 'vt-pbf';
import { BasicCache } from '../cache.js';
import { createStreetNetwork, networkToVectorTileBuffer } from '../geospatial-utils.js';
import { GeoJSONVT, TileCoordinate } from '../interfaces.js';
import { fetchOverpassXML, generateTileIndex, sendProtobuf, validateNumberParam } from '../router-utils.js';
import { calculateTileCoordsForZoom } from '../utils.js';

const cache = new BasicCache<Buffer>();

// WIP
const tileIndexZoom = 16;
/** Only has values for zoom `tileIndexZoom` */
const tileIndexCache = new BasicCache<JsStreetNetwork>();

/**
 * If network already exists grab the network from cache.
 * If not, generate it and store in cache, then return it.
 */
async function fetchOrGenerateNetwork(cache: BasicCache<JsStreetNetwork>, zoomedOutTileCoordinate: TileCoordinate): Promise<JsStreetNetwork> {
  const maybeCacheHit = cache.accessCache(zoomedOutTileCoordinate);
  if (maybeCacheHit !== null) {
    console.log(`network cache hit for ${JSON.stringify(zoomedOutTileCoordinate)}!`);
    return maybeCacheHit;
  }
  console.log(`network cache miss for ${JSON.stringify(zoomedOutTileCoordinate)}!`);

  console.log("Generating street network...");
  const network = await createStreetNetwork(zoomedOutTileCoordinate);
  cache.setCache(zoomedOutTileCoordinate, network);


  const shouldBeCacheHit = cache.accessCache(zoomedOutTileCoordinate);
  if (shouldBeCacheHit === null) {
    throw Error('Accessing network from cache after storing it failed');
  }
  return shouldBeCacheHit;
}

async function fetchTile(ctx: RouterContext) {
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


  // Zoom out to a fixed zoom value, and calculate x & y values for that
  const zoomedOutTileCoordinate = calculateTileCoordsForZoom({ zoom, x, y }, tileIndexZoom);
  if (zoomedOutTileCoordinate === null) {
    console.error(`Can't zoom out to ${tileIndexZoom} from ${JSON.stringify({ zoom, x, y })}`);
    ctx.body = `Can't zoom out to ${tileIndexZoom} from ${JSON.stringify({ zoom, x, y })}`;
    ctx.status = 501;
    return;
  }
  // Get the network for that fixed zoom value (ie: get the Overpass XML and call the osm2streets bindings)
  const network = await fetchOrGenerateNetwork(tileIndexCache, zoomedOutTileCoordinate);

  console.log(`network before calculating vector tiles: ${network}`);
  const buf = networkToVectorTileBuffer(network, { zoom, x, y });
  sendProtobuf(ctx, buf);
  cache.setCache({ zoom, x, y }, buf);
}

export default class UserController {
  public static async getUsers(ctx: RouterContext) {
    try {
      await fetchTile(ctx);
    } catch (e) {
      console.log(e);
      ctx.status = 500;
      ctx.body = e;
      return;
    }
  }
}
