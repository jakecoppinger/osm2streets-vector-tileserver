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

/** Only has values for zoom `tileIndexZoom` */
// const tileIndexCache = new BasicCache<GeoJSONVT>();


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
  //   console.error(`Can't zoom out to ${tileIndexZoom} from ${JSON.stringify({zoom,x,y})}`);
  // }

  const maybeCacheHit = cache.accessCache({ zoom, x, y });
  if (maybeCacheHit !== null) {
    sendProtobuf(ctx, maybeCacheHit);
    return;
  }
  const network = await createStreetNetwork({ zoom, x, y });

  console.log("Generating geojson...");
  const geometryFeatures = network.toGeojsonPlain();
  const lanePolygonFeatures = network.toLanePolygonsGeojson();
  const laneMarkingFeatures = network.toLaneMarkingsGeojson();
  const intersectionMarkingFeatures = network.toIntersectionMarkingsGeojson();

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
  const intersectionMarkingGeoJSON = {
    type: "FeatureCollection",
    features: [...JSON.parse(intersectionMarkingFeatures).features]
  };

  console.log("Generating tileindex...");

  const geometryTileIndex = await generateTileIndex(geometryGeoJSON, ctx);
  const lanePolygonTileIndex = await generateTileIndex(lanePolygonGeoJSON, ctx);
  const laneMarkingTileIndex = await generateTileIndex(laneMarkingGeoJSON, ctx);
  const intersectionMarkingTileIndex = await generateTileIndex(intersectionMarkingGeoJSON, ctx);

  if (geometryTileIndex === null || lanePolygonTileIndex === null ||
    laneMarkingTileIndex === null || intersectionMarkingTileIndex === null) {
    return;
  }

  console.log("Generating tile...");
  const geometryTile = geometryTileIndex.getTile(zoom, x, y);
  const lanePolygonTile = lanePolygonTileIndex.getTile(zoom, x, y);
  const laneMarkingTile = laneMarkingTileIndex.getTile(zoom, x, y);
  const intersectionMarkingTile = intersectionMarkingTileIndex.getTile(zoom, x, y);

  if (geometryTile === null || lanePolygonTile === null || laneMarkingTile === null ||
    intersectionMarkingTile === null) {
    ctx.status = 500;
    ctx.body = "Error: Coudn't get one of the tiles from geojsonvt";
    return;
  }

  // This is a Uint8Array
  const rawArray = vtpbf.fromGeojsonVt(
    {
      geometry: geometryTile,
      lanePolygons: lanePolygonTile,
      laneMarkings: laneMarkingTile,
      intersectionMarkings: intersectionMarkingTile
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
