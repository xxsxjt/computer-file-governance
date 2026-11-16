#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runTransaction, rollbackTransaction } from "../lib/governance-executor.mjs";

const args = process.argv.slice(2);
const mode = args.shift();
const outFlag = [];
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--out") outFlag.push(args[++i]);
  else positional.push(a);
}
if (!["plan", "apply", "rollback"].includes(mode)) {
  process.stderr.write("Usage: cfg-tidy plan <plan.json> [--out <result.json>]\n       cfg-tidy apply <plan.json> [--out <result.json>]\n       cfg-tidy rollback <manifest.json>\n");
  process.exit(2);
}
try {
  if (mode === "rollback") {
    const out = await rollbackTransaction(path.resolve(positional[0]));
    process.stdout.write(JSON.stringify({ mode, ...out }, null, 2) + "\n");
  } else {
    const plan = JSON.parse(await readFile(path.resolve(positional[0]), "utf8"));
    const out = await runTransaction(plan, { execute: mode === "apply" });
    const rendered = JSON.stringify({ mode, ...out }, null, 2) + "\n";
    if (outFlag.length) await writeFile(path.resolve(outFlag[0]), rendered, "utf8");
    process.stdout.write(rendered);
    if (!out.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write("ERROR: " + error.message + "\n");
  process.exitCode = 1;
}

