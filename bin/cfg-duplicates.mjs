import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildDuplicateClusters } from "../lib/duplicate-clusters.mjs";

function usage(code = 2) {
  process.stderr.write("Usage: cfg-duplicates <index-records.json> [--include-unknown] [--out <local.json>] [--json]\n");
  process.exit(code);
}

const args = process.argv.slice(2);
const input = args.shift();
if (!input || input.startsWith("--")) usage();
const opts = { includeUnknown: false, out: null, json: false };
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--include-unknown") opts.includeUnknown = true;
  else if (arg === "--out") opts.out = args[++i];
  else if (arg === "--json") opts.json = true;
  else usage();
}

try {
  const source = JSON.parse(await readFile(path.resolve(input), "utf8"));
  const records = Array.isArray(source) ? source : source.records;
  if (!Array.isArray(records)) throw new Error("input must be an array of index records or { records: [...] }");
  const result = buildDuplicateClusters(records, { includeUnknown: opts.includeUnknown });
  const rendered = JSON.stringify(result, null, 2) + "\n";
  if (opts.out) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.resolve(opts.out), rendered, "utf8");
  }
  if (opts.json) process.stdout.write(rendered);
  else {
    process.stdout.write("records=" + result.summary.recordsSeen + " considered=" + result.summary.recordsConsidered + " clusters=" + result.summary.clusterCount + " action=REVIEW_ONLY\n");
    for (const cluster of result.clusters) {
      process.stdout.write(cluster.fingerprint + " count=" + cluster.count + " suggest=" + (cluster.suggestedCanonicalRef ?? "none") + "\n");
    }
  }
} catch (error) {
  process.stderr.write("ERROR: " + error.message + "\n");
  process.exitCode = 1;
}
