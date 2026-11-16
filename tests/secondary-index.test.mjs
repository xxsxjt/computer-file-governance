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
import { assessIndexFreshness, buildSecondaryIndex, querySecondaryIndex } from "../lib/secondary-index.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const now = new Date("2026-11-16T00:00:00.000Z");

function makeFixture() {
  const rows = [
    { recordType: "entry", rootId: "docs", relativePath: "alpha/report.md", kind: "file", bytes: 12, mtimeUtc: "2026-11-01T00:00:00.000Z" },
    { recordType: "entry", rootId: "docs", relativePath: "alpha/notes.txt", kind: "file", bytes: 8, mtimeUtc: "2026-11-02T00:00:00.000Z" },
    { recordType: "entry", rootId: "media", relativePath: "alpha/clip.mp4", kind: "file", bytes: 99, mtimeUtc: "2026-11-03T00:00:00.000Z" },
  ];
  const manifestText = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const manifestBytes = gzipSync(manifestText);
  const summary = {
    generatedAtUtc: "2026-11-15T23:00:00.000Z",
    manifestPath: "synthetic.jsonl.gz",
    manifestBytes: manifestBytes.length,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
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
    assert.equal(index.entryCount, 3);
    assert.equal(assessIndexFreshness(index, { ...fixture.summary, manifestPath }, now).status, "fresh");

    const direct = querySecondaryIndex(index, "alpha", { limit: 10 });
    assert.equal(direct.hits.length, 3);
    const scoped = querySecondaryIndex(index, "alpha", { root: "docs", kind: "file", limit: 10 });
    assert.equal(scoped.hits.length, 2);

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
    assert.equal(output.hits.length, 3);

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
