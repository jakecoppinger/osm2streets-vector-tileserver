osm2streets vector tileserver
=============================

_This is a work in progress! Not yet integration tested with a frontend!_

This is a Typescript Koa webserver that takes vector tile requests
(eg `GET http://localhost:3000/tile/16/60293/39332`) and returns GeoJSON corresponding to the
`osm2streets` output for that tile.

It builds and then utilisis the NodeJS bindings for a wasm build of osm2streets, which itself is
written in Rust.


# Running it
## Overpass Turbo
You'll need to stand up your own Overpass Turbo instance - it makes one call for each tile, which
would be too much for the public one (https://overpass-turbo.eu/) unless you're making one call
at a time for debugging.

See https://hub.docker.com/r/wiktorn/overpass-api for instructions. It's one Docker run command!
Make sure to choose your region to not download a map of the entire planet :)

## osm2streets
### Requirements
- latest stable Rust
- [wasm-pack](https://github.com/rustwasm/wasm-pack)
  (`curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`)

### Clone osm2streets
- Clone osm2streets adjacent to this repo
`cd .. && git clone https://github.com/a-b-street/osm2streets`

# Running osm2streets vector tileserver
See package.json scripts.

```
nvm use
npm i
npm run build:osm2streets
npm run build
npm run start
```

# Resources

https://blog.cyclemap.link/2020-01-25-tilebuffer/
https://docs.mapbox.com/api/maps/vector-tiles/
https://github.com/a-b-street/osm2streets/issues/12

# License
GNU AGPLv3. See LICENSE

# Author
Say hello!
Jake Coppinger (jakecoppinger.com, jake@jakecoppinger.com)