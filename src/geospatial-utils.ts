import { JsStreetNetwork } from "osm2streets-js-node";
import { AllFeatureTypes, TileCoordinate } from "./interfaces.js";
import { fetchOverpassXML, generateTileIndex } from "./router-utils.js";
// Can't find types for vt-pbf
// @ts-ignore
import vtpbf from 'vt-pbf';

/**
 * Fetch XML from overpass turbo and create the JS street network object[
*/
export async function createStreetNetwork({ zoom, x, y }: TileCoordinate): Promise<JsStreetNetwork | null> {
  const osmXML = await fetchOverpassXML({ zoom, x, y });
  if(osmXML.includes('node id') === false) {
    console.log("No nodes found in overpass XML - must be middle of nowhere");
    return null;
  }

  const boundaryGeojson = "";

  const startTime = performance.now()

  const network = new JsStreetNetwork(osmXML, boundaryGeojson, {
    // Play with options in the sidebar at https://a-b-street.github.io/osm2streets/
    debug_each_step: true,
    dual_carriageway_experiment: false,
    cycletrack_snapping_experiment:
      false,
    // If true, roads without explicitly tagged sidewalks may be assigned sidewalks or shoulders.
    // If false, no inference will occur and separate sidewalks and crossings will be included.
    inferred_sidewalks: true,

    /* If true, use experimental osm2lanes for figuring out lanes per road. If false, use the
    classic algorithm. */
    osm2lanes: false,
  });
  const endTime = performance.now()
  console.log(`🚧 Generated street network, took ${Math.floor(endTime - startTime)} milliseconds`)
  // const debugOutput = network.toGeojsonPlain();
  return network;
}

export function networkToGeoJSON(requestedFeatures: AllFeatureTypes, streetNetwork: JsStreetNetwork): Object {
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

export function networkToVectorTileBuffer(network: JsStreetNetwork, { zoom, x, y }: TileCoordinate): Buffer {
  const featuresToQuery: AllFeatureTypes[] = ['geometry', 'lanePolygons', 'laneMarkings', 'intersectionMarkings']
  const geoJSONs = featuresToQuery.map(featureType => networkToGeoJSON(featureType, network));

  // console.log("Generating tileindex...");
  const tileIndexes = geoJSONs.map(generateTileIndex);

  // console.log("Generating tile for each layer...");
  const tiles = tileIndexes.map(tileIndex => tileIndex.getTile(zoom, x, y));

  const missingTile = tiles.findIndex(tile => tile === null) !== -1;
  if (missingTile) {
    console.log("Error: Coudn't get one of the tiles from geojsonvt");
  }

  // This is a Uint8Array
  const rawArray = vtpbf.fromGeojsonVt(
    {
      // See order in `featuresToQuery`. This probably needs a refactor
      geometry: tiles[0] ? tiles[0] : undefined,
      lanePolygons: tiles[1] ? tiles[1] : undefined,
      laneMarkings: tiles[2] ? tiles[2] : undefined,
      intersectionMarkings: tiles[3] ? tiles[3]: undefined
    });
  const buf = Buffer.from(rawArray);
  return buf;
}
