import { RouterContext } from "koa-router";
import geojsonvt from 'geojson-vt';
import { generateOverpassTurboQueryUrl } from "./utils.js";
// Can't find types for vt-pbf
// @ts-ignore
import vtpbf from 'vt-pbf';

export function sendProtobuf(ctx: RouterContext, protobuf: any): void {
  ctx.status = 200;
  ctx.body = protobuf;
  ctx.set('Content-Type', 'application/octet-stream');
}

export async function fetchOverpassXMLAndValidate({ zoom, x, y, ctx }:
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

/** Returns true if a given param string is a valid number.
 * If not, set Koa status & error before returning false */
export function validateNumberParam({ param, paramName, ctx }: { param: string, paramName: string, ctx: RouterContext }): boolean {
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

export function generateTileIndex(geojson: any, ctx: RouterContext): vtpbf.GeoJSONVT | null {
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