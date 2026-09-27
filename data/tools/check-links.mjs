// data/tools/check-links.mjs: checks every link in the seed data (DA-7, PRD §15).
// Collects sources[].url, applicationPortal.url and forms[].url from data/seed/**/*.json,
// requests each (HEAD, falling back to GET; 15 s timeout) and prints url · status · final URL.
// Exits 1 if any link fails. Run: node data/tools/check-links.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SEED_DIR = join(process.cwd(), "data", "seed");
const USER_AGENT = "CivicWeaveBot/1.0 (link check; https://github.com/Gurpreet-pixel-hue/DamnSon)";
const TIMEOUT_MS = 15_000;
const PAUSE_MS = 500; // polite pause between requests

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

/** Adds the link fields the contract defines (sources, applicationPortal, forms), wherever they appear. */
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
    collectLinks(value, file, links);
  }
}

function addLink(links, url, file) {
  if (!links.has(url)) links.set(url, new Set());
  links.get(url).add(file);
}

async function request(url, method) {
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
    const reason = err instanceof Error ? err.name === "TimeoutError" ? "timeout" : err.message : String(err);
    return { status: head ? `${head.status} / ${reason}` : reason, finalUrl: "-", ok: false };
  }
}

const links = new Map();
for (const file of jsonFiles(SEED_DIR)) {
  collectLinks(JSON.parse(readFileSync(file, "utf8")), relative(process.cwd(), file), links);
}

if (links.size === 0) {
  console.log("No links found under data/seed.");
  process.exit(0);
}

let failures = 0;
for (const [url, files] of links) {
  const result = await check(url);
  if (!result.ok) failures += 1;
  console.log(`${result.ok ? "ok  " : "FAIL"}  ${url} · ${result.status} · ${result.finalUrl}`);
  if (!result.ok) {
    if (result.status === 403) console.log("      403: the site may block automated requests; open the link in a browser to confirm");
    console.log(`      used in: ${[...files].join(", ")}`);
  }
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}

console.log(`\n${links.size} links checked, ${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);
