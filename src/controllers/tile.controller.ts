import Router, { RouterContext } from 'koa-router';
import { JsStreetNetwork } from "osm2streets-js-node/osm2streets_js.js";
// Can't find types for vt-pbf
// @ts-ignore
import vtpbf from 'vt-pbf';
import { BasicCache } from '../cache.js';
import { createStreetNetwork } from '../geospatial-utils.js';
import { GeoJSONVT, TileCoordinate } from '../interfaces.js';
import { fetchOverpassXML, generateTileIndex, sendProtobuf, validateNumberParam } from '../router-utils.js';
import { calculateXYForZoom } from '../utils.js';

const cache = new BasicCache<Buffer>();

// WIP
// const tileIndexZoom = 16;
// /** Only has values for zoom `tileIndexZoom` */
// const tileIndexCache = new BasicCache<GeoJSONVT>();

type AllFeatureTypes = 'geometry' | 'lanePolygons' | 'laneMarkings' | 'intersectionMarkings';

function networkToGeoJSON(requestedFeatures: AllFeatureTypes, streetNetwork: JsStreetNetwork): Object {
  let features: string;
  if (requestedFeatures === 'geometry') {
    features = streetNetwork.toGeojsonPlain();
  } else if (requestedFeatures === 'lanePolygons') {
    features = streetNetwork.toLanePolygonsGeojson();
  } else if (requestedFeatures === 'laneMarkings') {
    features = streetNetwork.toLaneMarkingsGeojson();
  } else if (requestedFeatures === 'intersectionMarkings') {
    features = streetNetwork.toIntersectionMarkingsGeojson();
  } else {
    throw ("input requestedFeatures to networkToTileIndex is wrong");
  }

  const geoJSON: Object = {
    type: "FeatureCollection",
    features: [...JSON.parse(features).features]
  };
  return geoJSON;
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

  // WIP
  // const zoomedOutXY = calculateXYForZoom({ zoom, x, y }, tileIndexZoom);
  // if (zoomedOutXY === null) {
  //   console.error(`Can't zoom out to ${tileIndexZoom} from ${JSON.stringify({ zoom, x, y })}`);
  // }

  const maybeCacheHit = cache.accessCache({ zoom, x, y });
  if (maybeCacheHit !== null) {
    sendProtobuf(ctx, maybeCacheHit);
    return;
  }
  console.log("Generating street network...");
  const network = await createStreetNetwork({ zoom, x, y });

  console.log("Generating geojson for each feature...");
  const featuresToQuery: AllFeatureTypes[] = ['geometry', 'lanePolygons', 'laneMarkings', 'intersectionMarkings']
  const geoJSONs = featuresToQuery.map(featureType => networkToGeoJSON(featureType, network));

  console.log("Generating tileindex...");
  const tileIndexes = geoJSONs.map(generateTileIndex);

  console.log("Generating tile for each layer...");
  const tiles = tileIndexes.map(tileIndex => tileIndex.getTile(zoom, x, y));

  const missingTile = tiles.findIndex(tile => tile === null) !== -1;
  if (missingTile) {
    ctx.status = 500;
    ctx.body = "Error: Coudn't get one of the tiles from geojsonvt";
    return;
  }

  // This is a Uint8Array
  const rawArray = vtpbf.fromGeojsonVt(
    {
      // See order in `featuresToQuery`
      geometry: tiles[0],
      lanePolygons: tiles[1],
      laneMarkings: tiles[2],
      intersectionMarkings: tiles[3]
    });
  const buf = Buffer.from(rawArray);

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
