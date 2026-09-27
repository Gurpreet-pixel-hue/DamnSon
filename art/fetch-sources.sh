#!/usr/bin/env bash
# Recreates art/src/ from pinned public GitHub copies of Kenney's CC0 packs (see art/SOURCES.md).
# art/src/ is gitignored: run this once on a fresh clone before `npm run art:compose`.
set -euo pipefail
cd "$(dirname "$0")"

CITY_REPO=https://github.com/Canni-DEV/city
CITY_REV=00f24e74b604957daa17ccf513f43f687d75c516
MARKET_REPO=https://github.com/pmndrs/market-assets
MARKET_REV=c9cfa0236a012093edd5affe200808752375bd90

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone -q --filter=blob:none --no-checkout "$CITY_REPO" "$TMP/city"
git -C "$TMP/city" checkout -q "$CITY_REV" -- \
  "assets/kenney_city-kit-commercial_2.1/License.txt" "assets/kenney_city-kit-commercial_2.1/Models/GLB format" \
  "assets/kenney_city-kit-suburban_20/License.txt" "assets/kenney_city-kit-suburban_20/Models/GLB format" \
  "assets/kenney_city-kit-industrial_2.0/License.txt" "assets/kenney_city-kit-industrial_2.0/Models/GLB format" \
  "assets/kenney_city-kit-roads/License.txt" "assets/kenney_city-kit-roads/Models/GLB format" \
  "assets/kenney_car-kit/License.txt" "assets/kenney_car-kit/Models/GLB format" \
  "assets/kenney_nature-kit/License.txt" "assets/kenney_nature-kit/Models/GLTF format"

git clone -q --filter=blob:none --no-checkout "$MARKET_REPO" "$TMP/market"
git -C "$TMP/market" checkout -q "$MARKET_REV" -- \
  files/models/boat-large files/models/boat-small files/models/ship-light

K="$TMP/city/assets"
mkdir -p src
copy_pack() { # <source pack dir> <models subfolder> <target name>
  rm -rf "src/$3"
  cp -R "$K/$1/Models/$2" "src/$3"
  cp "$K/$1/License.txt" "src/$3/"
}
copy_pack kenney_city-kit-commercial_2.1 "GLB format" kenney-city-kit-commercial
copy_pack kenney_city-kit-suburban_20 "GLB format" kenney-city-kit-suburban
copy_pack kenney_city-kit-industrial_2.0 "GLB format" kenney-city-kit-industrial
copy_pack kenney_city-kit-roads "GLB format" kenney-city-kit-roads
copy_pack kenney_car-kit "GLB format" kenney-car-kit
copy_pack kenney_nature-kit "GLTF format" kenney-nature-kit

rm -rf src/kenney-boats && mkdir -p src/kenney-boats
for m in boat-large boat-small ship-light; do
  cp "$TMP/market/files/models/$m/model.gltf" "src/kenney-boats/$m.gltf"
  cp "$TMP/market/files/models/$m/info.json" "src/kenney-boats/$m.info.json"
done

printf '*\n!.gitignore\n' > src/.gitignore
echo "art/src ready: $(find src -type f | wc -l | tr -d ' ') files"
