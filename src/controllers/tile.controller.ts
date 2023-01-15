import Router, { RouterContext } from 'koa-router';
import { JsStreetNetwork } from "osm2streets-js-node/osm2streets_js.js";
import { BasicCache } from '../cache.js';
import { createStreetNetwork, networkToVectorTileBuffer } from '../geospatial-utils.js';
import { TileCoordinate } from '../interfaces.js';
import { sendProtobuf, validateNumberParam } from '../router-utils.js';
import { calculateTileCoordsForZoom } from '../utils.js';

const tileCache = new BasicCache<Buffer>();

// WIP
const tileIndexZoom = 16;
/** Only has values for zoom `tileIndexZoom` */
const tileIndexCache = new BasicCache<JsStreetNetwork | 'generating'>();

let cacheHitCounter = 0;
let cacheMissCounter = 0
function logCacheHits() {
  console.log(`CACHE: ${cacheHitCounter} hits, ${cacheMissCounter} misses.`);
}


async function fetchOrGenerateNetworkMiss(cache: BasicCache<JsStreetNetwork | 'generating'>, zoomedOutTileCoordinate: TileCoordinate): Promise<JsStreetNetwork> {
  console.log(`MISS network cache for ${JSON.stringify(zoomedOutTileCoordinate)}!`);
  cacheMissCounter += 1;

  cache.setCache(zoomedOutTileCoordinate, 'generating');
  const network = await createStreetNetwork(zoomedOutTileCoordinate);
  cache.setCache(zoomedOutTileCoordinate, network);

  const shouldBeCacheHit = cache.accessCache(zoomedOutTileCoordinate);
  if (shouldBeCacheHit === null || shouldBeCacheHit === 'generating') {
    throw Error('Accessing network from cache after storing it failed');
  }
  logCacheHits();
  return shouldBeCacheHit;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * If network already exists grab the network from cache.
 * If not, generate it and store in cache, then return it.
 */
async function fetchOrGenerateNetwork(cache: BasicCache<JsStreetNetwork | 'generating'>, zoomedOutTileCoordinate: TileCoordinate): Promise<JsStreetNetwork> {
  let maybeCacheHit = cache.accessCache(zoomedOutTileCoordinate);
  const coordStr = JSON.stringify(zoomedOutTileCoordinate)
  if (maybeCacheHit !== null && maybeCacheHit !== 'generating') {
    console.log(`HIT network cache for ${coordStr}!`);
    cacheHitCounter += 1;
    logCacheHits();
    return maybeCacheHit;
  }

  if (maybeCacheHit === 'generating') {
    // Tile is being generated, wait (spinlock) on it).
    const maxWaitTimeMillis = 5000;
    const millisBetweenChecks = 1000;
    let totalWaited = 0;

    while (totalWaited < maxWaitTimeMillis) {
      await delay(millisBetweenChecks);
      totalWaited += millisBetweenChecks;
      maybeCacheHit = cache.accessCache(zoomedOutTileCoordinate);
      const foundInCache: boolean = maybeCacheHit !== null && maybeCacheHit !== 'generating'
      console.log(`Waited on ${coordStr} for ${millisBetweenChecks} (${totalWaited} total), ${foundInCache ? 'success' : 'failure'}`);
      if (maybeCacheHit !== null && maybeCacheHit !== 'generating') {
        return maybeCacheHit;
      }
    }
  }
  return fetchOrGenerateNetworkMiss(cache, zoomedOutTileCoordinate);
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

  const buf = networkToVectorTileBuffer(network, { zoom, x, y });
  sendProtobuf(ctx, buf);
  tileCache.setCache({ zoom, x, y }, buf);
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
