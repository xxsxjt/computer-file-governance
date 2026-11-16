#!/usr/bin/env node
import { createGunzip } from "node:zlib";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { assessIndexFreshness, buildSecondaryIndex, loadSecondaryIndex, querySecondaryIndex } from "../lib/secondary-index.mjs";

const DEFAULT_SUMMARY = process.env.CFG_INVENTORY_SUMMARY ?? null;

function usage(code = 2) {
  process.stderr.write("Usage: cfg-find <query> [--root <id>] [--kind file|directory|reparse] [--limit <n>] [--summary <path>] [--index <path>] [--build-index <path>] [--max-age-ms <n>] [--json]\n");
  process.exit(code);
}

const args = process.argv.slice(2);
const query = args.shift();
if (!query || query.startsWith("--")) usage();
const opts = { root: null, kind: null, limit: 40, summary: DEFAULT_SUMMARY, index: null, buildIndex: null, maxAgeMs: 7 * 24 * 60 * 60 * 1000, json: false };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--root") opts.root = args[++i];
  else if (a === "--kind") opts.kind = args[++i];
  else if (a === "--limit") opts.limit = Number(args[++i]);
  else if (a === "--summary") opts.summary = args[++i];
  else if (a === "--index") opts.index = args[++i];
  else if (a === "--build-index") opts.buildIndex = args[++i];
  else if (a === "--max-age-ms") opts.maxAgeMs = Number(args[++i]);
  else if (a === "--json") opts.json = true;
  else usage();
}
if (!Number.isInteger(opts.limit) || opts.limit < 1) usage();
if (!Number.isFinite(opts.maxAgeMs) || opts.maxAgeMs < 0) usage();
if (!opts.summary) {
  process.stderr.write("ERROR: pass --summary <path> or set CFG_INVENTORY_SUMMARY to the local inventory summary\n");
  process.exit(2);
}

const summary = JSON.parse(readFileSync(opts.summary, "utf8"));
if (!path.isAbsolute(summary.manifestPath)) {
  summary.manifestPath = path.resolve(path.dirname(path.resolve(opts.summary)), summary.manifestPath);
}
const roots = new Map(summary.roots.map((r) => [r.id, r.path]));
const needle = query.toLowerCase();
let secondary = null;
let freshness = null;
if (opts.index) {
  try {
    secondary = loadSecondaryIndex(readFileSync(opts.index, "utf8"));
    freshness = assessIndexFreshness(secondary, summary);
  } catch {
    secondary = null;
    freshness = { status: "stale", reasons: ["index_unreadable"] };
  }
}
if (opts.buildIndex && (!secondary || freshness.status !== "fresh")) {
  secondary = await buildSecondaryIndex({
    manifestPath: summary.manifestPath,
    summary,
    maxAgeMs: opts.maxAgeMs,
  });
  freshness = { status: "fresh", reasons: [] };
  const { writeFile, rename, mkdir } = await import("node:fs/promises");
  const target = path.resolve(opts.buildIndex);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = target + ".tmp-" + process.pid;
  await writeFile(temp, JSON.stringify(secondary) + "\n", "utf8");
  await rename(temp, target);
}
if (secondary && freshness?.status === "fresh") {
  const result = querySecondaryIndex(secondary, needle, {
    root: opts.root,
    kind: opts.kind,
    limit: opts.limit,
  });
  const hits = result.hits.map((row) => ({
    rootId: row.rootId,
    relativePath: row.relativePath,
    kind: row.kind,
    bytes: row.bytes,
    mtimeUtc: row.mtimeUtc,
    path: roots.has(row.rootId) ? path.join(roots.get(row.rootId), row.relativePath) : null,
  }));
  const output = {
    query,
    summary: opts.summary,
    index: opts.index ?? opts.buildIndex,
    mode: "secondary",
    freshness: freshness.status,
    staleReasons: [],
    fallbackReason: result.reason,
    scanned: secondary.scannedLines ?? secondary.entryCount ?? 0,
    truncated: hits.length >= opts.limit,
    hits,
  };
  if (opts.json) process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  else {
    process.stdout.write("query=" + query + " mode=secondary freshness=fresh scanned=" + output.scanned + " hits=" + hits.length + (output.truncated ? " (limit reached)" : "") + "\n");
    for (const h of hits) {
      const size = h.bytes === null || h.bytes === undefined ? "" : " " + h.bytes + "b";
      process.stdout.write(h.kind.padEnd(9) + " " + h.rootId.padEnd(28) + size + "  " + (h.path ?? h.relativePath) + "\n");
    }
  }
  process.exit(0);
}
const rl = createInterface({ input: createReadStream(summary.manifestPath).pipe(createGunzip()), crlfDelay: Infinity });
const hits = [];
let scanned = 0;
for await (const line of rl) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (row.recordType !== "entry") continue;
  scanned += 1;
  if (opts.root && row.rootId !== opts.root) continue;
  if (opts.kind && row.kind !== opts.kind) continue;
  if (!String(row.relativePath).toLowerCase().includes(needle)) continue;
  const rootPath = roots.get(row.rootId);
  hits.push({ rootId: row.rootId, relativePath: row.relativePath, kind: row.kind, bytes: row.bytes, mtimeUtc: row.mtimeUtc, path: rootPath ? path.join(rootPath, row.relativePath) : null });
  if (hits.length >= opts.limit) break;
}
const result = {
  query,
  summary: opts.summary,
  mode: "linear",
  freshness: freshness?.status ?? "unavailable",
  staleReasons: freshness?.reasons ?? [],
  fallbackReason: secondary ? "secondary_index_unavailable" : null,
  scanned,
  truncated: hits.length >= opts.limit,
  hits,
};
if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
else {
  process.stdout.write("query=" + query + " scanned=" + scanned + " hits=" + hits.length + (result.truncated ? " (limit reached)" : "") + "\n");
  for (const h of hits) {
    const size = h.bytes === null || h.bytes === undefined ? "" : " " + h.bytes + "b";
    process.stdout.write(h.kind.padEnd(9) + " " + h.rootId.padEnd(28) + size + "  " + (h.path ?? h.relativePath) + "\n");
  }
}
