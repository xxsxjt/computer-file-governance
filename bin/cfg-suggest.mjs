import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { suggestClassification } from "../lib/classification-suggestions.mjs";

function usage(code = 2) {
  process.stderr.write("Usage: cfg-suggest <candidates.json> [--out <local.json>] [--json]\n");
  process.exit(code);
}

const args = process.argv.slice(2);
const input = args.shift();
if (!input || input.startsWith("--")) usage();
const opts = { out: null, json: false };
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--out") opts.out = args[++i];
  else if (arg === "--json") opts.json = true;
  else usage();
}

try {
  const source = JSON.parse(await readFile(path.resolve(input), "utf8"));
  const candidates = Array.isArray(source) ? source : source.candidates;
  if (!Array.isArray(candidates)) throw new Error("input must be an array or { candidates: [...] }");
  const result = {
    generatedAtUtc: new Date().toISOString(),
    action: "DRY_RUN_SUGGESTION_ONLY",
    appliesMutation: false,
    suggestions: candidates.map((candidate) => suggestClassification(candidate)),
  };
  const rendered = JSON.stringify(result, null, 2) + "\n";
  if (opts.out) await writeFile(path.resolve(opts.out), rendered, "utf8");
  if (opts.json) process.stdout.write(rendered);
  else {
    process.stdout.write("candidates=" + candidates.length + " action=DRY_RUN_SUGGESTION_ONLY appliesMutation=false\n");
    for (const [index, suggestion] of result.suggestions.entries()) {
      process.stdout.write(index + ": " + suggestion.suggested.role + "/" + suggestion.suggested.privacy + "/" + suggestion.suggested.lifecycle + " confidence=" + suggestion.suggested.confidence + "\n");
    }
  }
} catch (error) {
  process.stderr.write("ERROR: " + error.message + "\n");
  process.exitCode = 1;
}
