import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedExports = {
  ".": "./lib/governance-validator.mjs",
  "./executor": "./lib/governance-executor.mjs",
  "./secondary-index": "./lib/secondary-index.mjs",
  "./duplicate-clusters": "./lib/duplicate-clusters.mjs",
  "./incremental-refresh": "./lib/incremental-refresh.mjs",
  "./classification-suggestions": "./lib/classification-suggestions.mjs",
  "./user-report": "./lib/user-report.mjs",
  "./schemas/*": "./schemas/*",
};

test("package exports resolve to framework modules without exposing private data", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.exports, expectedExports);
  for (const target of Object.values(expectedExports)) {
    assert.ok(!target.includes("private/") && !target.includes("local"), "export must stay framework-only: " + target);
  }
});

test("documented error codes are covered by the user report catalog", async () => {
  const guide = await readFile(new URL("../docs/user-guide.md", import.meta.url), "utf8");
  const report = await import("../lib/user-report.mjs");
  const tick = String.fromCharCode(96);
  const pattern = new RegExp(tick + "(CFG_E_[A-Z_]+)" + tick, "g");
  const codes = [...guide.matchAll(pattern)].map((match) => match[1]);
  assert.ok(codes.length >= 8);
  for (const code of codes) {
    const described = report.describeError(code);
    assert.equal(described.code, code);
    assert.notEqual(described.title, "未知错误");
  }
});
