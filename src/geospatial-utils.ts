import { JsStreetNetwork } from "osm2streets-js-node";
import { TileCoordinate } from "./interfaces.js";
import { fetchOverpassXML } from "./router-utils.js";

/**
 * Fetch XML from overpass turbo and create the JS street network object[
*/
export async function createStreetNetwork({ zoom, x, y }: TileCoordinate): Promise<JsStreetNetwork> {
  const osmXML = await fetchOverpassXML({ zoom, x, y });

  console.log("Generating road network...");
  const boundaryGeojson = "";


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
  return network;
}
