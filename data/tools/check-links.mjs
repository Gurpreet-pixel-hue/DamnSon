// data/tools/check-links.mjs: checks every link in the seed data and the source registry (DA-7, PRD §15).
// Collects sources[].url, applicationPortal.url, forms[].url and authority.officialUrl from
// data/seed/**/*.json, plus every url in data/sources/registry.json. Requests each (HEAD, falling
// back to GET; 15 s timeout; at most 1 request per second per host, PRD §9.2) and prints
// url · status · final URL. A 403 on a URL that has a registry manualText capture is a warning
// (the host blocks scripts; the copilot uses the capture). Exits 1 if any other link fails.
// Run: node data/tools/check-links.mjs   (User-Agent from CRAWLER_USER_AGENT)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SEED_DIR = join(ROOT, "data", "seed");
const REGISTRY = join(ROOT, "data", "sources", "registry.json");
const DEFAULT_USER_AGENT = "CivicWeaveBot/1.0 (link check; https://github.com/Gurpreet-pixel-hue/DamnSon)";
const USER_AGENT = process.env.CRAWLER_USER_AGENT || DEFAULT_USER_AGENT;
const TIMEOUT_MS = 15_000;
const MIN_GAP_MS = 1_000; // at most 1 request per second per host (PRD §9.2)
const lastRequestAt = new Map();

function jsonFiles(dir) {
  let out = [];
  let entries = [];
  try {
    entries = readdirSync(dir).sort((a, b) => a.localeCompare(b));
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(jsonFiles(path));
    else if (name.endsWith(".json")) out.push(path);
  }
  return out;
}

function addLink(links, url, where) {
  if (!links.has(url)) links.set(url, new Set());
  links.get(url).add(where);
}

/** Adds the link fields the contract defines (sources, forms, applicationPortal, authority.officialUrl), wherever they appear. */
function collectLinks(node, file, links) {
  if (Array.isArray(node)) {
    for (const item of node) collectLinks(item, file, links);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if ((key === "sources" || key === "forms") && Array.isArray(value)) {
      for (const item of value) if (item && typeof item.url === "string") addLink(links, item.url, file);
    }
    if (key === "applicationPortal" && value && typeof value.url === "string") addLink(links, value.url, file);
    if (key === "authority" && value && typeof value.officialUrl === "string") addLink(links, value.officialUrl, file);
    collectLinks(value, file, links);
  }
}

/** Waits until at least MIN_GAP_MS has passed since the previous request to the same host. */
async function waitForHost(url) {
  const host = new URL(url).host;
  const wait = (lastRequestAt.get(host) ?? 0) + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt.set(host, Date.now());
}

async function request(url, method) {
  await waitForHost(url);
  const res = await fetch(url, {
    method,
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (method === "GET") await res.body?.cancel();
  return { status: res.status, finalUrl: res.url, ok: res.ok };
}

async function check(url) {
  let head;
  try {
    head = await request(url, "HEAD");
    if (head.ok) return head;
  } catch {
    // fall through to GET
  }
  try {
    return await request(url, "GET");
  } catch (err) {
    const reason = err instanceof Error ? (err.name === "TimeoutError" ? "timeout" : err.message) : String(err);
    return { status: head ? `${head.status} / ${reason}` : reason, finalUrl: "-", ok: false };
  }
}

const links = new Map();
for (const file of jsonFiles(SEED_DIR)) {
  collectLinks(JSON.parse(readFileSync(file, "utf8")), relative(ROOT, file), links);
}

const manualCaptures = new Set();
if (existsSync(REGISTRY)) {
  const where = relative(ROOT, REGISTRY);
  for (const entry of JSON.parse(readFileSync(REGISTRY, "utf8"))) {
    if (typeof entry.url !== "string") continue;
    addLink(links, entry.url, where);
    if (typeof entry.manualText === "string") manualCaptures.add(entry.url);
  }
}

if (links.size === 0) {
  console.log("No links found under data/seed or in data/sources/registry.json.");
  process.exit(0);
}

console.log(`User-Agent: ${USER_AGENT}${process.env.CRAWLER_USER_AGENT ? "" : " (default; set CRAWLER_USER_AGENT)"}\n`);

let failures = 0;
let warnings = 0;
for (const [url, files] of links) {
  const result = await check(url);
  const captured = result.status === 403 && manualCaptures.has(url);
  const label = result.ok ? "ok  " : captured ? "WARN" : "FAIL";
  if (captured) warnings += 1;
  else if (!result.ok) failures += 1;
  console.log(`${label}  ${url} · ${result.status} · ${result.finalUrl}`);
  if (captured) console.log("      403 to scripts; covered by a manualText capture in the registry");
  else if (!result.ok && result.status === 403) console.log("      403: the site may block automated requests; open the link in a browser to confirm");
  if (!result.ok) console.log(`      used in: ${[...files].join(", ")}`);
}

console.log(`\n${links.size} links checked, ${failures} failed, ${warnings} warnings.`);
process.exit(failures > 0 ? 1 : 0);
