#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  validateIndexRecord,
  validateTransactionManifest,
} from "../lib/governance-validator.mjs";

const args = process.argv.slice(2);
let kind = "auto";
const files = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--kind" && i + 1 < args.length) {
    kind = args[i + 1];
    i += 1;
  } else {
    files.push(arg);
  }
}

if (files.length === 0 || !["auto", "index", "transaction"].includes(kind)) {
  process.stderr.write("Usage: cfg-validate [--kind auto|index|transaction] <file.json...>\n");
  process.exit(2);
}

let hasError = false;
for (const target of files) {
  const resolved = path.resolve(target);
  const payload = JSON.parse(await readFile(resolved, "utf8"));
  const effectiveKind =
    kind !== "auto"
      ? kind
      : Object.hasOwn(payload, "transaction_id")
        ? "transaction"
        : "index";
  const result =
    effectiveKind === "transaction"
      ? validateTransactionManifest(payload)
      : validateIndexRecord(payload);
  if (!result.valid) {
    hasError = true;
    process.stderr.write(`FAIL (${effectiveKind}): ${target}\n${JSON.stringify(result.errors, null, 2)}\n`);
  } else {
    process.stdout.write(`PASS (${effectiveKind}): ${target}\n`);
  }
}

process.exit(hasError ? 1 : 0);
