import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "art/out");
const MODELS_DIR = path.join(ROOT, "public/models");

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const files = ["stations.glb", "city.glb", "props.glb", "roads.glb", "cars.glb"];

console.log("Optimizing GLB files with meshopt...");

for (const file of files) {
  const inPath = path.join(OUT_DIR, file);
  const outPath = path.join(MODELS_DIR, file);

  if (!fs.existsSync(inPath)) {
    console.error(`Input file not found: ${inPath}. Run 'npm run art:compose' first.`);
    process.exit(1);
  }

  // Optimize command: keep texture uncompressed (lossless PNG atlas), compress geometry with meshopt, keep named meshes
  const cmd = `npx gltf-transform optimize "${inPath}" "${outPath}" --compress meshopt --texture-compress false --join-named false --join false --palette false`;
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });

  const stat = fs.statSync(outPath);
  console.log(`Optimized ${file}: ${(stat.size / 1024).toFixed(1)} KB`);
}

console.log("All models successfully optimized into public/models/");
