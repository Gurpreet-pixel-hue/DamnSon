# art/

The source assets and build scripts for the Civic Metro city diorama. The spec is `docs/visual-direction.md`.

```
art/
  SOURCES.md          third-party assets: pack, version, licence, origin
  fetch-sources.sh    recreates art/src/ from pinned sources (run once per clone)
  src/                CC0 packs, gitignored (about 19 MB)
  blender/            headless Blender scripts for the hero landmarks (FE-1V stage 2)
  out/                raw exports (gitignored)
```

Committed outputs: `public/models/{stations,city,props}.glb` and `public/thumbs/*.webp`.

## Pipeline & Atlas Architecture
- **Atlas Layout (`art/out/atlas.png`)**: 1024×1536 texture map consisting of six 512² slots with 8 px edge-padded gutters to avoid mipmap/bilinear bleeding:
  - Slot 0: `city-kit-commercial`
  - Slot 1: `city-kit-suburban`
  - Slot 2: `city-kit-industrial`
  - Slot 3: `city-kit-roads`
  - Slot 4: `car-kit`
  - Slot 5: 64 swatches (8×8 grid of 64×64 px cells with 8 px inset margin) for flat-color primitives (nature kit trees/bushes, boats, stand-in accents).
- **Diorama Scene Architecture**:
  - `components/canvas/Board.tsx`: Extruded rounded diorama slab, sea basin along +z with dropped shore bank (0.15 height in slabSide color), animated coastal water shader.
  - `components/canvas/CityBatches.tsx`: Two `THREE.BatchedMesh` instances for city buildings and props with single shared atlas material (`generateMipmaps = false`, `LinearFilter`).
  - `components/canvas/Stations.tsx`: 13 archetype instanced meshes, plaza pads (r=1.6, h=0.04), plaza status rings, next-up beacons, and locked building multiply (0.9).
  - `components/canvas/Tracks.tsx`: 4 batched line groups elevated at y=0.25 above roads with glowing white pulse spheres.
  - `components/canvas/StageHeaders.tsx`: Derived layer headers along board back edge.
  - `components/canvas/Legend.tsx`: Status indicator legend with dynamic Critical Path marker.

Rebuild:
1. `bash art/fetch-sources.sh`. Skip it if `art/src/` already exists.
2. `npm run art:compose`: builds the atlas and composes the GLBs (FE-1V stage 1).
3. `npm run art:build`: Blender hero landmarks (FE-1V stage 2; needs Blender, `BLENDER_BIN`).
4. `npm run art:optimize`: gltf-transform with meshopt and WebP, into `public/models/`.

Suggested Stage 1 stand-ins for each officeType. Check them visually before choosing.

| officeType | Stand-in |
|---|---|
| `fire_services` | industrial building + `kenney-car-kit/firetruck.glb` parked in front |
| `police` | commercial building + `police.glb` |
| `health_department` | light commercial building + `ambulance.glb` |
| `utility_provider` | `kenney-city-kit-industrial/water-tower.glb` + `detail-tank.glb` |
| `pollution_control_board` | industrial building + `chimney-large.glb` |
| `municipal_hq` | the widest commercial building; replaced in stage 2 by the domed hero |
| `ward_office`, `revenue_office`, `labour_department`, `court_or_notary`, `other` | five visually distinct commercial or suburban buildings |
| `online_portal` | a small procedural glass pavilion with an emissive screen quad |
| milestone | the procedural interchange ring (unchanged) |
