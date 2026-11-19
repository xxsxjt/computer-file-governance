import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { assessIndexFreshness, buildSecondaryIndex, normalizePathForQuery, querySecondaryIndex } from "../lib/secondary-index.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const now = new Date("2026-11-16T00:00:00.000Z");

function makeFixture() {
  const rows = [
    { recordType: "entry", rootId: "docs", relativePath: "alpha/report.md", kind: "file", bytes: 12, mtimeUtc: "2026-11-01T00:00:00.000Z" },
    { recordType: "entry", rootId: "docs", relativePath: "alpha/notes.txt", kind: "file", bytes: 8, mtimeUtc: "2026-11-02T00:00:00.000Z" },
    { recordType: "entry", rootId: "media", relativePath: "alpha/clip.mp4", kind: "file", bytes: 99, mtimeUtc: "2026-11-03T00:00:00.000Z" },
    { recordType: "entry", rootId: "docs", relativePath: "alpha/Reports/Final.md", kind: "file", bytes: 13, mtimeUtc: "2026-11-04T00:00:00.000Z" },
    { recordType: "tombstone", rootId: "docs", oldRelativePath: "archive/Report-2024.md", kind: "file", lifecycle: "retired", tombstoneReason: "migrated" },
    { recordType: "hold", rootId: "docs", relativePath: "alpha/held-report.md", kind: "file", lifecycle: "hold", holdReason: "boundary_hold" },
  ];
  const manifestText = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const manifestBytes = gzipSync(manifestText);
  const summary = {
    generatedAtUtc: "2026-11-15T23:00:00.000Z",
    manifestPath: "synthetic.jsonl.gz",
    manifestBytes: manifestBytes.length,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    querySemantics: "normalized_path_substring_v1",
    validatedAtUtc: "2026-11-15T23:30:00.000Z",
    freshness: { status: "current", checkedAt: "2026-11-15T23:31:00.000Z", maxAgeMs: 604800000, reasons: [] },
    roots: [
      { id: "docs", path: "/fixture/docs" },
      { id: "media", path: "/fixture/media" },
    ],
  };
  return { rows, manifestBytes, summary };
}

test("secondary index searches without linear manifest scan and detects staleness", async () => {
  const fixture = makeFixture();
  const dir = await mkdtemp(path.join(tmpdir(), "cfg-secondary-"));
  try {
    const manifestPath = path.join(dir, "synthetic.jsonl.gz");
    const summaryPath = path.join(dir, "summary.json");
    const indexPath = path.join(dir, "index.json");
    await writeFile(manifestPath, fixture.manifestBytes);
    await writeFile(summaryPath, JSON.stringify(fixture.summary));

    const index = await buildSecondaryIndex({
      manifestPath,
      summary: { ...fixture.summary, manifestPath },
      now,
    });
    assert.equal(index.entryCount, 6);
    assert.equal(assessIndexFreshness(index, { ...fixture.summary, manifestPath }, now).status, "fresh");

    const direct = querySecondaryIndex(index, "alpha", { limit: 10 });
    assert.equal(direct.hits.length, 5);
    const scoped = querySecondaryIndex(index, "alpha", { root: "docs", kind: "file", limit: 10 });
    assert.equal(scoped.hits.length, 4);

    assert.equal(normalizePathForQuery("Alpha\\Reports\\Ｆｉｎａｌ.md"), "alpha/reports/final.md");
    assert.equal(querySecondaryIndex(index, "port", { limit: 20 }).hits.length, 4);
    assert.equal(querySecondaryIndex(index, "REPORT", { limit: 20 }).hits.length, 4);
    assert.equal(querySecondaryIndex(index, "kind", { limit: 20 }).hits.length, 0);
    assert.equal(querySecondaryIndex(index, "", { limit: 20 }).reason, "empty_query");
    const oldPath = querySecondaryIndex(index, "report-2024", { limit: 20 });
    assert.equal(oldPath.hits.length, 1);
    assert.equal(oldPath.hits[0].matchPath, "old_path");
    assert.equal(oldPath.hits[0].explanation, "tombstone,old_path");

    await writeFile(indexPath, JSON.stringify(index));
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(repoRoot, "bin", "cfg-find.mjs"),
      "alpha",
      "--summary", summaryPath,
      "--index", indexPath,
      "--json",
    ]);
    const output = JSON.parse(stdout);
    assert.equal(output.mode, "secondary");
    assert.equal(output.freshness, "fresh");
    assert.equal(output.hits.length, 5);

    const changedManifest = Buffer.concat([fixture.manifestBytes, Buffer.from("extra\n")]);
    await writeFile(manifestPath, changedManifest);
    const changedSummary = {
      ...fixture.summary,
      manifestPath,
      manifestBytes: changedManifest.length,
      manifestSha256: createHash("sha256").update(changedManifest).digest("hex"),
    };
    const stale = assessIndexFreshness(index, changedSummary, now);
    assert.equal(stale.status, "stale");
    assert.ok(stale.reasons.includes("digest_mismatch"));

    const saved = await readFile(indexPath, "utf8");
    assert.ok(saved.includes("cfg-secondary-index"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("secondary index reads plain JSONL according to the declared format", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cfg-secondary-jsonl-"));
  try {
    const manifestPath = path.join(dir, "synthetic.jsonl");
    const rows = [
      { recordType: "entry", rootId: "docs", relativePath: "alpha/report.md", kind: "file" },
      { recordType: "entry", rootId: "docs", relativePath: "alpha/notes.txt", kind: "file" },
    ];
    const text = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    await writeFile(manifestPath, text, "utf8");
    const index = await buildSecondaryIndex({
      manifestPath,
      summary: {
        manifestPath,
        manifestFormat: "jsonl",
        manifestBytes: Buffer.byteLength(text),
        manifestSha256: createHash("sha256").update(text).digest("hex"),
        generatedAtUtc: "2026-11-15T23:00:00.000Z",
        querySemantics: "normalized_path_substring_v1",
        freshness: { status: "current" },
      },
      now,
    });
    assert.equal(index.sourceFormat, "jsonl");
    assert.equal(index.entryCount, 2);
    assert.equal(querySecondaryIndex(index, "report", { limit: 20 }).hits.length, 1);
    const withoutSummary = await buildSecondaryIndex({ manifestPath, now });
    assert.equal(withoutSummary.sourceSha256, createHash("sha256").update(text).digest("hex"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
