#!/usr/bin/env node
import { createGunzip } from "node:zlib";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const DEFAULT_SUMMARY = process.env.CFG_INVENTORY_SUMMARY ?? null;

function usage(code = 2) {
  process.stderr.write("Usage: cfg-find <query> [--root <id>] [--kind file|directory|reparse] [--limit <n>] [--summary <path>] [--json]\n");
  process.exit(code);
}

const args = process.argv.slice(2);
const query = args.shift();
if (!query || query.startsWith("--")) usage();
const opts = { root: null, kind: null, limit: 40, summary: DEFAULT_SUMMARY, json: false };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--root") opts.root = args[++i];
  else if (a === "--kind") opts.kind = args[++i];
  else if (a === "--limit") opts.limit = Number(args[++i]);
  else if (a === "--summary") opts.summary = args[++i];
  else if (a === "--json") opts.json = true;
  else usage();
}
if (!Number.isInteger(opts.limit) || opts.limit < 1) usage();
if (!opts.summary) {
  process.stderr.write("ERROR: pass --summary <path> or set CFG_INVENTORY_SUMMARY to the local inventory summary\n");
  process.exit(2);
}

const summary = JSON.parse(readFileSync(opts.summary, "utf8"));
const roots = new Map(summary.roots.map((r) => [r.id, r.path]));
const needle = query.toLowerCase();
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
const result = { query, summary: opts.summary, scanned, truncated: hits.length >= opts.limit, hits };
if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
else {
  process.stdout.write("query=" + query + " scanned=" + scanned + " hits=" + hits.length + (result.truncated ? " (limit reached)" : "") + "\n");
  for (const h of hits) {
    const size = h.bytes === null || h.bytes === undefined ? "" : " " + h.bytes + "b";
    process.stdout.write(h.kind.padEnd(9) + " " + h.rootId.padEnd(28) + size + "  " + (h.path ?? h.relativePath) + "\n");
  }
}

