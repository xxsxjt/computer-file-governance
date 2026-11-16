import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGunzip, gzipSync } from "node:zlib";
import { buildSecondaryIndex, querySecondaryIndex } from "../lib/secondary-index.mjs";

function parseArgs(argv) {
  const opts = { rows: 20000, queries: 100, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--rows") opts.rows = Number(argv[++i]);
    else if (arg === "--queries") opts.queries = Number(argv[++i]);
    else if (arg === "--out") opts.out = argv[++i];
    else throw new Error("Usage: benchmark-secondary-index.mjs [--rows <n>] [--queries <n>] [--out <local.json>]");
  }
  if (!Number.isInteger(opts.rows) || opts.rows < 1) throw new Error("--rows must be a positive integer");
  if (!Number.isInteger(opts.queries) || opts.queries < 1) throw new Error("--queries must be a positive integer");
  return opts;
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
};

const elapsedMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;

async function linearQuery(manifestPath, needle) {
  const input = createReadStream(manifestPath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let hits = 0;
  for await (const line of lines) {
    if (line.toLowerCase().includes(needle)) hits += 1;
    if (hits >= 40) break;
  }
  return hits;
}

const opts = parseArgs(process.argv.slice(2));
const dir = await mkdtemp(path.join(tmpdir(), "cfg-bench-"));
try {
  const rows = [];
  for (let i = 0; i < opts.rows; i += 1) {
    rows.push(JSON.stringify({
      recordType: "entry",
      rootId: "fixture",
      relativePath: "synthetic/area-" + (i % 97) + "/item-" + String(i).padStart(6, "0") + ".txt",
      kind: "file",
      bytes: i,
      mtimeUtc: "2026-11-01T00:00:00.000Z",
    }));
  }
  const manifestBytes = gzipSync(rows.join("\n") + "\n");
  const manifestPath = path.join(dir, "synthetic.jsonl.gz");
  await writeFile(manifestPath, manifestBytes);
  const summary = {
    generatedAtUtc: "2026-11-15T00:00:00.000Z",
    manifestPath,
    manifestBytes: manifestBytes.length,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    roots: [{ id: "fixture", path: "/fixture" }],
  };

  let start = process.hrtime.bigint();
  const index = await buildSecondaryIndex({ manifestPath, summary });
  const buildMs = elapsedMs(start);

  const secondarySamples = [];
  const linearSamples = [];
  for (let i = 0; i < opts.queries; i += 1) {
    const needle = "item-" + String((i * 197) % opts.rows).padStart(6, "0");
    start = process.hrtime.bigint();
    querySecondaryIndex(index, needle, { limit: 40 });
    secondarySamples.push(elapsedMs(start));
    start = process.hrtime.bigint();
    await linearQuery(manifestPath, needle);
    linearSamples.push(elapsedMs(start));
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    rows: opts.rows,
    queries: opts.queries,
    buildMs,
    secondaryP50Ms: percentile(secondarySamples, 50),
    secondaryP95Ms: percentile(secondarySamples, 95),
    linearP50Ms: percentile(linearSamples, 50),
    linearP95Ms: percentile(linearSamples, 95),
    note: "Synthetic metadata only; no local inventory or file body was read.",
  };
  const text = JSON.stringify(report, null, 2) + "\n";
  if (opts.out) await writeFile(opts.out, text, "utf8");
  else process.stdout.write(text);
} finally {
  await rm(dir, { recursive: true, force: true });
}
