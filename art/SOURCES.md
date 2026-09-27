# Art sources

Every third-party asset under `art/src/` is listed here. All of them are **CC0 1.0** (public domain, no attribution required). We still credit Kenney in the app's About text.

`art/src/` is gitignored because it holds about 19 MB of source files. To recreate it exactly, run `bash art/fetch-sources.sh`. Only the optimised outputs in `public/models/` are committed.

Downloaded 2026-09-27. kenney.nl and poly.pizza weren't reachable from the build environment, so the packs come from public GitHub copies of Kenney's **unmodified release folders**. Each copy includes Kenney's own `License.txt`, which states CC0 and the pack version. The source commits are pinned in `fetch-sources.sh`.

| Folder | Pack (version) | Author | Licence | Files | Official page | Copy used |
|---|---|---|---|---|---|---|
| `kenney-city-kit-commercial/` | City Kit (Commercial) 2.1 | Kenney | CC0 (`License.txt`) | 41 GLB + `Textures/colormap.png` | https://kenney.nl/assets/city-kit-commercial | github.com/Canni-DEV/city @ 00f24e7 |
| `kenney-city-kit-suburban/` | City Kit (Suburban) 2.0 | Kenney | CC0 | 40 GLB + colormap | https://kenney.nl/assets/city-kit-suburban | same |
| `kenney-city-kit-industrial/` | City Kit (Industrial) 2.0 | Kenney | CC0 | 37 GLB + colormap | https://kenney.nl/assets/city-kit-industrial | same |
| `kenney-city-kit-roads/` | City Kit (Roads) | Kenney | CC0 | 95 GLB + colormap (street lights, signs, poles, barriers) | https://kenney.nl/assets/city-kit-roads | same |
| `kenney-car-kit/` | Car Kit | Kenney | CC0 | 50 GLB + colormap (firetruck, ambulance, police, taxi, van …) | https://kenney.nl/assets/car-kit | same |
| `kenney-nature-kit/` | Nature Kit | Kenney | CC0 | 134 GLB, flat-colour materials, no texture (6 palms, trees, bushes, rocks) | https://kenney.nl/assets/nature-kit | same |
| `kenney-boats/` | boat-large, boat-small, ship-light | Kenney (per `*.info.json`) | CC0 (Kenney releases all assets as CC0) | 3 glTF (embedded buffers) | https://kenney.nl/assets | github.com/pmndrs/market-assets @ c9cfa02 |

Checks done on 2026-09-27:
- All 397 GLB headers are valid.
- The city and car packs reference `Textures/colormap.png`, which is 512² and different in each pack.
- The nature kit uses flat-colour materials.
- The boats embed their buffers.

Notes for the pipeline (`docs/visual-direction.md` §6):
- Each pack has its own colormap. `art:compose` packs them into one atlas so the whole city shares one material:
  - 1024 × 1536, 512² slots: commercial, suburban, industrial, car, roads;
  - slot 6 holds flat-colour swatches for the nature kit, the boats and our hero buildings;
  - UVs are remapped accordingly.
- Don't use real logos, emblems or insignia on any model.

Our own assets, created in this repo and not third-party: the hero landmarks (`art/blender/`), the palette swatches and the thumbnails.
