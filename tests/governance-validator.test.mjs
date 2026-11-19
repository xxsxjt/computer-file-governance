import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  checkPathContainment,
  computeFileFingerprint,
  mapPrivacyToHostBinary,
  preflightItemPaths,
  validateInventorySummary,
} from "../lib/governance-validator.mjs";

const execFileAsync = promisify(execFile);

test("checkPathContainment enforces root boundaries on POSIX and Windows semantics", () => {
  const posixInside = checkPathContainment("/srv/governed/docs/a.txt", ["/srv/governed"], path.posix);
  assert.equal(posixInside.contained, true);

  const posixSiblingEscape = checkPathContainment("/srv/governed-other/a.txt", ["/srv/governed"], path.posix);
  assert.equal(posixSiblingEscape.contained, false);
  assert.equal(posixSiblingEscape.reason, "outside_authorized_roots");

  const winCaseInsensitive = checkPathContainment(
    ["X:", "GovernedRoot", "Sub", "file.txt"].join("\\"),
    [["x:", "governedroot"].join("/")],
    path.win32,
  );
  assert.equal(winCaseInsensitive.contained, true);

  const encodedEscape = checkPathContainment("/srv/governed/%2e%2e/etc", ["/srv/governed"], path.posix);
  assert.equal(encodedEscape.contained, false);
  assert.equal(encodedEscape.reason, "unsafe_path_encoding");
});

test("mapPrivacyToHostBinary maps 5-level governance privacy conservatively to binary host boundary", () => {
  assert.equal(mapPrivacyToHostBinary("public"), "PUBLIC");
  assert.equal(mapPrivacyToHostBinary("internal"), "PRIVATE_RESTRICTED");
  assert.equal(mapPrivacyToHostBinary("restricted"), "PRIVATE_RESTRICTED");
  assert.equal(mapPrivacyToHostBinary("secret"), "PRIVATE_RESTRICTED");
  assert.equal(mapPrivacyToHostBinary("unknown"), "PRIVATE_RESTRICTED");
  assert.throws(() => mapPrivacyToHostBinary("invalid"), RangeError);
});

test("preflightItemPaths and computeFileFingerprint validate containment, conflicts, links, and hashes", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfg-preflight-"));
  try {
    const authorizedDir = path.join(tempRoot, "authorized");
    const outsideDir = path.join(tempRoot, "outside");
    await mkdir(authorizedDir);
    await mkdir(outsideDir);

    const srcFile = path.join(authorizedDir, "source.txt");
    const existingDest = path.join(authorizedDir, "existing.txt");
    const freshDest = path.join(authorizedDir, "fresh.txt");
    await writeFile(srcFile, "governance-test-payload", "utf8");
    await writeFile(existingDest, "already-here", "utf8");

    const ready = await preflightItemPaths({
      sourcePath: srcFile,
      destinationPath: freshDest,
      authorizedRoots: [authorizedDir],
    });
    assert.equal(ready.ok, true);
    assert.equal(ready.status, "ready");
    assert.equal(ready.sourceBytes, 23);

    const conflict = await preflightItemPaths({
      sourcePath: srcFile,
      destinationPath: existingDest,
      authorizedRoots: [authorizedDir],
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.status, "hold");
    assert.equal(conflict.reason, "destination_exists_conflict");

    const outside = await preflightItemPaths({
      sourcePath: srcFile,
      destinationPath: path.join(outsideDir, "escape.txt"),
      authorizedRoots: [authorizedDir],
    });
    assert.equal(outside.ok, false);
    assert.equal(outside.status, "rejected");
    assert.equal(outside.reason, "destination_outside_authorized_roots");

    const linkedDir = path.join(authorizedDir, "linked-dir");
    const symlinkType = process.platform === "win32" ? "junction" : "dir";
    await symlink(outsideDir, linkedDir, symlinkType);

    const linkTraversal = await preflightItemPaths({
      sourcePath: srcFile,
      destinationPath: path.join(linkedDir, "via-link.txt"),
      authorizedRoots: [authorizedDir],
    });
    assert.equal(linkTraversal.ok, false);
    assert.equal(linkTraversal.status, "hold");
    assert.equal(linkTraversal.reason, "destination_traverses_link");

    const fp = await computeFileFingerprint(srcFile, "sha256");
    assert.equal(fp.bytes, 23);
    assert.match(fp.digest, /^[a-f0-9]{64}$/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("cfg-validate CLI validates synthetic fixtures and exits non-zero on invalid records", async () => {
  const cliPath = path.resolve(new URL("../bin/cfg-validate.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const validFile = path.resolve(new URL("./fixtures/transaction-manifest-planned.valid.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const invalidFile = path.resolve(new URL("./fixtures/transaction-manifest-parent-traversal.invalid.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const credentialFile = path.resolve(new URL("./fixtures/vault-adapter-request.valid.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

  const { stdout } = await execFileAsync(process.execPath, [cliPath, validFile]);
  assert.match(stdout, /PASS \(transaction\)/);

  const credentialResult = await execFileAsync(process.execPath, [cliPath, credentialFile]);
  assert.match(credentialResult.stdout, /PASS \(credential\)/);

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, invalidFile]),
    (error) => error.code === 1 && /FAIL \(transaction\)/.test(error.stderr),
  );
});

test("validateInventorySummary enforces root, coverage, and freshness semantics", () => {
  const summary = {
    schemaVersion: 1,
    snapshotId: "snapshot:S-002",
    generatedAtUtc: "2026-11-18T19:00:00Z",
    validatedAtUtc: "2026-11-18T19:05:00Z",
    manifestPath: "fixture:manifest-002.jsonl.gz",
    manifestBytes: 128,
    manifestSha256: "b".repeat(64),
    manifestEntryCount: 2,
    manifestFormat: "gzip_jsonl",
    querySemantics: "normalized_path_substring_v1",
    collector: {
      id: "collector:synthetic",
      version: "1.0.0",
      operatorRef: "operator:test",
      sourceKind: "host_collector",
      authorityStatus: "unverified_host",
    },
    scope: {
      authorizationRef: "authorization:task-002",
      authorizedRootIds: ["docs"],
      allowedOperations: ["read_metadata"],
      coverage: {
        mode: "explicit_entries",
        maxEntries: 2,
        maxDepth: 2,
        followReparsePoints: false,
        followMounts: false,
        boundaryPolicy: "hold_without_traversal",
        includedKinds: ["file"],
        includedCount: 2,
        skippedCount: 0,
      },
    },
    roots: [{ id: "docs", path: "fixture:root-docs" }],
    skipped: [],
    freshness: { status: "current", checkedAt: "2026-11-18T19:06:00Z", maxAgeMs: 604800000, reasons: [] },
  };
  assert.equal(validateInventorySummary(summary).valid, true);

  const unknownRoot = structuredClone(summary);
  unknownRoot.scope.authorizedRootIds = ["missing"];
  assert.equal(validateInventorySummary(unknownRoot).valid, false);

  const duplicateRoot = structuredClone(summary);
  duplicateRoot.roots.push({ id: "docs", path: "fixture:other" });
  assert.equal(validateInventorySummary(duplicateRoot).valid, false);

  const staleCount = structuredClone(summary);
  staleCount.scope.coverage.skippedCount = 1;
  assert.equal(validateInventorySummary(staleCount).valid, false);

  const badTime = structuredClone(summary);
  badTime.validatedAtUtc = "2026-11-18T18:00:00Z";
  assert.equal(validateInventorySummary(badTime).valid, false);

  const badRefreshTime = structuredClone(summary);
  badRefreshTime.freshness.refreshByUtc = "2026-11-18T19:00:00Z";
  assert.equal(validateInventorySummary(badRefreshTime).valid, false);
});
