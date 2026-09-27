FE-1V · Civic Metro visual upgrade: "City diorama" (branch frontend)
Needs: FE-1.1 committed. PR #2 merged before anything is pushed.

Read first:
- AGENTS.md
- docs/visual-direction.md, which is normative for this task
- docs/frontend-spec.md: interaction, motion and layout sections
- PRD §11

Open docs/reference/civic-metro-target.jpg and study it. It is AI concept art: match its composition and UI language, not its photorealism.

Goal: the 3D scene and its overlays look like the reference, in a stylised low-poly form, at 60 fps. Same data (fromV2 today, fromJourney after FE-2), same interaction, same keyboard map, same reduced-motion rules. components/canvas keeps consuming only MetroVM.

Out of scope (docs/visual-direction.md §8 maps these to later milestones): summary bar, drawer contents, left navigation, 2D view, trip plan and map, search. Restyle the existing HUD pieces (search bar, 3D/2D and critical-path toggles, progress card) to the light tokens, but don't add new panels.

## Git: start of session (report verbatim)
1. git status is clean and you're on frontend. git fetch origin --prune. git pull --ff-only origin frontend.
2. gh pr view 2 --json state,mergedAt. If it's MERGED: git merge --no-edit origin/main (a normal merge; on a conflict, abort and report). If it's OPEN: work locally and don't push.
3. main now contains .gitkeep files in folders you fill. Delete the .gitkeep in every folder that has real files once your commit lands.

## Plan first (wait for my approval)
The plan must include:
- the asset list: pack, exact files, licence and URL for each, and which kit building stands in for each officeType in Stage 1;
- how the heroes will be modelled in Stage 2;
- the pipeline commands;
- the output of `/Applications/Blender.app/Contents/MacOS/Blender --version` (or "not installed") and `uv --version` (or "not installed");
- the files you'll create or change;
- a budget table filled with your estimates (visual-direction §7);
- risks;
- a time estimate per stage.

Ask me before installing any application (Blender, uv). Only install npm devDependencies with the exact versions below.

New devDependencies, exact versions (justification: asset optimisation and asset tests):
@gltf-transform/cli@4.5.0, @gltf-transform/core@4.5.0, @gltf-transform/extensions@4.5.0, meshoptimizer@1.2.0.
No runtime dependencies. three, drei, R3F and postprocessing are already enough: BatchedMesh, NeutralToneMapping, Outlines, useGLTF with meshopt.

## Stage 1 · Diorama with kit stand-ins (then stop for review)

A · Theme
- Tokens from visual-direction §2 go in app/globals.css and components/canvas/palette.ts. The palette test compares all tokens.
- Map the shadcn variables onto the tokens and remove the `dark` class.
- Restyle the search bar, toggles, progress card and the FE-1.1 label cards: white cards, radius 12, 1 px border, soft shadow.
- Check that the Sheet, Button, Badge and Toggle components are still readable.

B · Sources and pipeline skeleton
- The sources are already in the project folder. art/src/ holds six Kenney CC0 packs plus three boats (415 files). art/SOURCES.md, art/README.md and art/fetch-sources.sh are written too. Don't download other assets without asking me.
- art/src/ is gitignored through its own .gitignore. Commit art/SOURCES.md, art/README.md and art/fetch-sources.sh.
- Each pack has its own 512² colormap. In art/compose.mjs, build out/atlas.png at 1024×1536: five colormap slots plus a swatch slot for flat-colour materials (nature kit, boats, stand-in details). Remap UVs so every city, props and stations mesh uses one material. Assert that in the asset test.
- Stage 1 can skip Blender entirely. Compose the three GLBs with a gltf-transform script, art/compose.mjs, and optimise with `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 1024`. Add the npm scripts art:compose and art:optimize.
- Outputs: public/models/{stations,city,props}.glb.
- Stations in Stage 1: map each officeType to the closest kit building, plus a distinguishing kit prop where one exists (for example a tower for fire_services), scaled to fit footprint ≤ 2.6 × 2.6 and height ≤ 4.2. online_portal is a small glass pavilion with an emissive screen quad. The milestone keeps the procedural interchange ring.

C · City plan: components/canvas/city/planCity.ts, pure TypeScript, exactly as visual-direction §3 "City fill", with the tests listed there.

D · Scene
- Board slab, water shader, roads and kerbs from the sampled track curves.
- One BatchedMesh for the city and one for props.
- Stations as one InstancedMesh per archetype from stations.glb, with the procedural fallback if loading fails.
- Plaza rings (dashed for may_apply), next-up beacons, and locked buildings dimmed with setColorAt.
- Selected outline on one extra mesh.
- Four route batches, pulses restyled.
- Remove the online drop lines.
- Lighting, fog, NeutralToneMapping, EffectComposer(multisampling 4) with Bloom only, the PerformanceMonitor degradation order, and the camera settings, all per §5.

E · Overlays: label cards per §4 (all labels up to 16 stations, then priority plus collision culling), stage headers, legend.

F · Stage 1 check. Write components/canvas/assets.test.ts:
- use @gltf-transform/core NodeIO with the meshopt extension, where MeshoptDecoder comes from meshoptimizer;
- stations.glb has 13 named meshes, one per OfficeType plus "milestone", each within footprint ≤ 2.6 × 2.6 and height ≤ 4.2 (the milestone ≤ 0.3);
- triangle and size caps per visual-direction §7;
- every node in city.glb and props.glb has a name that planCity knows.

Then stop and send me:
- the verify tail;
- screenshots at 1440×900 of the default view, the stress graph with ?debug=1 and a selected station;
- one side-by-side image: the reference on the left, our default view on the right (compose it with sharp from the gltf-transform install; save in .next/claude-review/fe-1v/);
- the debug numbers: scene draws, frame calls, triangles (gl.info.render.triangles from the main pass, shown in the debug overlay) and fps;
- `du -ch public/models`.

Save all screenshots in .next/claude-review/fe-1v/ so I can open them from the repo folder.

## Stage 2 · Hero landmarks in Blender (only after my review of Stage 1)

- Set up Blender MCP for iteration: ahujasid/blender-mcp through uvx, in the workspace .agents/mcp_config.json with DISABLE_TELEMETRY=true. Add that file to .gitignore. Keep the Hyper3D, Hunyuan3D and Sketchfab integrations unused.
- Use MCP to explore and take viewport screenshots. The deliverable is the headless scripts:
  - art/blender/heroes.py: one function per officeType, following visual-direction §6;
  - art/blender/bake_ao.py: AO into COLOR_0;
  - art/blender/thumbnails.py: 512×384 WebP renders into public/thumbs/;
  - art/blender/build_all.py: runs all of the above and exports art/out/stations.glb.
  - npm run art:build runs `$BLENDER_BIN -b -P art/blender/build_all.py`. BLENDER_BIN defaults to the macOS app path.
- Heroes: kit style, the atlas swatch slot, ≤ 6k triangles each, sizes as in Stage 1. No logos, emblems, insignia or red crosses.
- Replace the stand-ins in stations.glb and re-run art:optimize and the asset test.
- If a hero isn't convincing after one iteration, keep its kit stand-in and list it as a follow-up. Don't hold up the task for it.

## Verify (final)
1. npm run verify green, with test counts per file.
2. Screenshots at 1440×900: default, stress with ?debug=1, selected station, reduced motion (DevTools emulation), and a keyboard walkthrough (describe what happened). Plus the side-by-side with the reference.
3. Stress numbers verbatim: scene draws (≤ 36), frame calls, triangles (≤ 350k), fps. Also the PerformanceMonitor state.
4. Network panel during load: every request goes to localhost. No CDN, no Draco decoder, no HDRI fetch. Paste the request list.
5. Console: no errors, only the THREE.Clock warning. Strict Mode stays on.
6. npm run build, then npm start: the empty state still renders, and the first 3D frame appears within 2.5 s on localhost (measure with performance.now() from navigation start to the first useFrame after the GLBs load; log it only in development).
7. `du -ch public/models public/thumbs` ≤ 6 MB.

Commits, small and citing the direction doc:
- feat(theme): light civic tokens (visual-direction §2)
- feat(art): CC0 sources and asset pipeline (§6)
- feat(canvas): city plan (§3)
- feat(canvas): diorama scene (§3, §5)
- feat(canvas): labels, stage headers, legend (§4)
- feat(art): hero landmarks (§6)

Push only once PR #2 is merged. At the end, open a PR frontend → main titled "FE-1V: City diorama visual direction". Its body contains the budget table with measured numbers, the side-by-side image path, art/SOURCES.md, deviations and follow-ups. Mention the new top-level art/ folder as a PRD §6.2 addition. Don't merge it.

Report: git start-of-session output, verify tail, all numbers verbatim, screenshot paths, deviations (every config or global-behaviour change counts), follow-ups.
