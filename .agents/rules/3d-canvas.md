---
trigger: glob
globs: "components/canvas/**"
description: "Performance, interaction and fallback rules for the React Three Fiber scene."
---

# 3D canvas rules (R3F 9.8, drei 10.7, three 0.186)

- **Budget:** 60 fps on a MacBook Air-class laptop and ≤ 50 draw calls with 25 steps on screen. Measure with `gl.info.render.calls` via drei `<Stats />` / `<StatsGl />` in development only, and report the numbers.
- **Geometry:** procedural or low-poly. Define shared geometries and materials once and reuse them. Use `<Instances>` / `InstancedMesh` when a mesh repeats more than 3 times. Batch dependency curves into one geometry when there are more than 20.
- **Frame loop:** no allocations inside `useFrame` (no `new Vector3()` per frame; reuse module-level temporaries), and never call `setState` in `useFrame`. Animate by mutating refs.
- **Canvas:** `dpr={[1, 2]}`. Shadows only on key meshes. Dispose any geometry, material or texture you create imperatively; R3F disposes declarative ones.
- **Labels:** drei `<Html>` only for the focused/hovered step and small badges (≤ 30 on screen). Use `occlude` sparingly because it raycasts every frame.
- **Camera:** drei `<CameraControls>` with smooth `setLookAt` / `fitToBox`. Transitions are instant when `prefers-reduced-motion` is set.
- **Post-processing:** one `<EffectComposer>`. Bloom only on emissive materials (use `luminanceThreshold`). Turn effects off when drei `<PerformanceMonitor>` reports a decline.
- **Events:** use R3F pointer events with `e.stopPropagation()` and set the cursor on hover. Every click action must also be reachable from the 2D view and the keyboard.
- **Fallback:** if WebGL is unavailable or the context is lost, switch to the 2D view automatically and say why.
- **Layout:** positions come from `analyzeGraph()` layers (x = layer, z = index within the layer) or from a layout helper in `lib/graph`. They are never stored in graph data.
