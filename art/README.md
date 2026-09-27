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
