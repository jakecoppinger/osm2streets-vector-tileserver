import { RouterContext } from 'koa-router';
import { JsStreetNetwork } from "osm2streets-js-node/osm2streets_js.js";
import { MemoryCache } from '../memory-cache.js';
import { createStreetNetwork, networkToVectorTileBuffer } from '../geospatial-utils.js';
import { BasicCache, TileCoordinate } from '../interfaces.js';
import { sendProtobuf, validateNumberParam } from '../router-utils.js';
import { calculateTileCoordsForZoom, delay } from '../utils.js';
import { LRUCache } from '../lru-cache.js';

const tileCache = new LRUCache<Buffer>({logHitsMisses: true, cacheName:'tileCache'});
const tileIndexCache = new LRUCache<JsStreetNetwork | 'generating'>({logHitsMisses: true, cacheName:'network cache'});

// const tileCache = new MemoryCache<Buffer>({logHitsMisses: true, cacheName:'tileCache'});
// const tileIndexCache = new MemoryCache<JsStreetNetwork | 'generating'>({logHitsMisses: true, cacheName:'network cache'});

/** Only has values for zoom `tileIndexZoom` */
const tileIndexZoom = 16;


export async function setupCaches() {
  await tileCache.setup();
  await tileIndexCache.setup();
}

/*
Generate street network (which includes Overpass request) for a given tile coordinate).
This doesn't try to access a cache, but it will set the cache (when generating, and also when done).
*/
async function generateNetwork(cache: BasicCache<JsStreetNetwork | 'generating'>, zoomedOutTileCoordinate: TileCoordinate): Promise<JsStreetNetwork> {
  cache.setCache(zoomedOutTileCoordinate, 'generating');
  const network = await createStreetNetwork(zoomedOutTileCoordinate);
  cache.setCache(zoomedOutTileCoordinate, network);

  const shouldBeCacheHit = await cache.accessCache(zoomedOutTileCoordinate);
  if (shouldBeCacheHit === null || shouldBeCacheHit === 'generating') {
    throw Error('Accessing network from cache after storing it failed');
  }
  return shouldBeCacheHit;
}


/**
 * If network already exists grab the network from cache.
 * If network is being generated, spinlock for some time and if it doesn't appear, generate it.
 * If network isn't being generated and isnt' in cache, generate it and store in cache.
 */
async function fetchOrGenerateNetwork(cache: BasicCache<JsStreetNetwork | 'generating'>, zoomedOutTileCoordinate: TileCoordinate): Promise<JsStreetNetwork> {
  let maybeCacheHit = await cache.accessCache(zoomedOutTileCoordinate);
  const coordStr = JSON.stringify(zoomedOutTileCoordinate)
  if (maybeCacheHit !== null && maybeCacheHit !== 'generating') {
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
      maybeCacheHit = await cache.accessCache(zoomedOutTileCoordinate);
      const foundInCache: boolean = maybeCacheHit !== null && maybeCacheHit !== 'generating'
      console.log(`Waited on ${coordStr} for ${millisBetweenChecks} (${totalWaited} total), ${foundInCache ? 'success' : 'failure'}`);
      if (maybeCacheHit !== null && maybeCacheHit !== 'generating') {
        return maybeCacheHit;
      }
    }
  }
  return generateNetwork(cache, zoomedOutTileCoordinate);
}

/**
 * Takes a request and returns a vector tile.
*/
async function fetchVectorTile(ctx: RouterContext) {
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
  const tileCoord: TileCoordinate = {zoom,x,y};

  const maybeTileCacheHit = await tileCache.accessCache(tileCoord);
  if (maybeTileCacheHit !== null) {
    sendProtobuf(ctx, maybeTileCacheHit);
    return;
  }

  // Zoom out to a fixed zoom value, and calculate x & y values for that
  const zoomedOutTileCoordinate = calculateTileCoordsForZoom(tileCoord, tileIndexZoom);
  if (zoomedOutTileCoordinate === null) {
    console.log(`Can't zoom out to ${tileIndexZoom} from ${JSON.stringify(tileCoord)}`);
    ctx.body = `Can't zoom out to ${tileIndexZoom} from ${JSON.stringify(tileCoord)}`;
    ctx.status = 501;
    return;
  }
  // Get the network for that fixed zoom value (ie: get the Overpass XML and call the osm2streets bindings)
  const network = await fetchOrGenerateNetwork(tileIndexCache, zoomedOutTileCoordinate);

  const buf = networkToVectorTileBuffer(network, tileCoord);
  tileCache.setCache(tileCoord, buf);
  sendProtobuf(ctx, buf);
}

export default class TileController {
  public static async getUsers(ctx: RouterContext) {
    try {
      await fetchVectorTile(ctx);
    } catch (e) {
      console.log(e);
      ctx.status = 500;
      ctx.body = e;
      return;
    }
  }
}
