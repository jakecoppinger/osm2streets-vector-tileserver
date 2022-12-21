#!/bin/bash
set -e # exit on failure
set -x # print commands as they are run

# Assuming osm2streets is cloned adjacent to this repo
pushd ../osm2streets/

wasm-pack build --dev --target nodejs ./osm2streets-js
popd

# Or however you copy it back to this repo!
rm -rf ./src/osm2streets-js/
mkdir -p ./src/osm2streets-js
cp -r ../osm2streets/osm2streets-js/pkg/ ./src/osm2streets-js/

echo "Done compiling osm2streets and copying to this repo!"