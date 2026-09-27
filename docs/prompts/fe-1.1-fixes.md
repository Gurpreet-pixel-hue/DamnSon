FE-1.1 · Review fixes for FE-1 (branch frontend). A small task: no plan needed. Execute the steps in order, then report.
Read AGENTS.md first. PR #2 is still open, so commit locally and push only after I confirm it has been merged.

Why: FE-1 works (a clean install and verify passed: 14 files, 93 tests; my own render shows 17 scene draws and 46 frame calls). But the report hid three changes, and its git evidence didn't match GitHub. Fix these before the visual upgrade (FE-1V) builds on top.

1. Don't hide errors
   - Delete the global console.error override in components/canvas/SceneContainer.tsx.
   - Restore React Strict Mode: remove `reactStrictMode: false` from next.config.ts.
   - Both of these were hiding the React 19 "Attempted to synchronously unmount a root" error from drei <Html>. Step 2 removes its cause.

2. Replace drei <Html> labels with a DOM overlay (components/canvas/labels/)
   - LabelProjector.tsx lives inside the Canvas. It keeps one ref per label slot. In useFrame it recomputes screen positions only when the MetroVM, the canvas size, camera.matrixWorld or camera.projectionMatrix has changed. For the two matrices, compare their elements against cached Float32Array copies. It writes `style.transform = translate3d(x,y,0)` and `style.visibility` straight to the DOM nodes. No React state per frame, and no allocations in useFrame.
   - LabelLayer.tsx is a plain DOM layer outside the Canvas, in the same positioned container. It renders one <button> per visible label (aria-label "<title>, <state>"). Clicking it selects the station. Focus stays mirrored in useViewStore.focusedStepId.
   - Hide a label when its station is behind the camera or more than 40 px outside the viewport. This fixes the label stuck at the top-left after a camera flight.
   - Keep today's rule for which labels show (hovered, focused and next-up, max 6) and today's dark styling. FE-1V restyles it.
   - Pure selection logic goes in labels/selectLabels.ts with a unit test: priority order, the max-6 cap, and duplicates removed.

3. Font: in app/globals.css, `--font-sans: var(--font-sans);` refers to itself, so every page falls back to a serif font. Point it at `var(--font-geist-sans)`. Verify it in the browser: getComputedStyle(document.body).fontFamily starts with the Geist family.

4. Development-only code stays development-only
   - The DebugCollector in MetroScene mounts only when NODE_ENV is development and ?debug=1 is set. Otherwise leave gl.info.autoReset at its default.
   - Remove the `obj as any` and its eslint-disable. Detect drawables with `instanceof THREE.Mesh || instanceof THREE.Line` (InstancedMesh, BatchedMesh and LineSegments are subclasses of these).
   - `preserveDrawingBuffer: true` only in development with ?debug=1. It costs performance, so it never ships to production.
   - The ?nowebgl=1 hook (in SceneContainer and ExplorerShell) works only in development.
   - app/loadGraph.ts: when the stress fixture fails in development, console.error the zod issues or analyzeGraph codes instead of falling back silently.

5. ProgressTracker shows the hard-coded "0 of 0 steps done" and a "Placeholder" chip while the demo has 14 stations, and the card is clipped at the right edge. Show real numbers from the derived states instead: done / applicable non-optional steps. Remove the chip and keep the card inside the viewport. FE-3 replaces it with the summary bar.

6. Tests and gates: npm run verify must be green. Add the selectLabels test.

7. Browser check (dev server, DATA_SOURCE=fixtures, 1440×900):
   - default view, a selected station, and the stress graph with ?debug=1;
   - the console has no errors, with Strict Mode on and no override;
   - the computed font family.
   Save the screenshots in .next/claude-review/fe-1.1/ (gitignored) so I can open them from the repo folder.

8. Commit `fix(canvas): DOM label overlay, strict mode, dev-only hooks, font token (FE-1 review)`.

Report rules: all evidence verbatim.
- The FE-1 report's `gh pr list` output didn't match GitHub. PR #1 is `chore/prd-folder-structure` "chore: add PRD folder skeleton (§6.2)" by Pruthv-creates. At your fetch (16:12:46 UTC) it was still open; it merged at 16:13:33 UTC. There is no `backend` branch and no "BE-0" PR.
- Its implementation summary also described GSAP, Catmull-Rom splines, a hex grid and contact shadows. None of these are in the code.
- The deviations list left out reactStrictMode: false, the console.error override and preserveDrawingBuffer.
- From now on, paste command output exactly as printed, describe only what's in the diff, and list every change to config or global behaviour as a deviation.

Report: the verify tail with test counts per file, the screenshot paths, the console output, the computed font family, git log --oneline -6, and the deviations.
