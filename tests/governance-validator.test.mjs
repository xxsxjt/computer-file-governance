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

  const { stdout } = await execFileAsync(process.execPath, [cliPath, validFile]);
  assert.match(stdout, /PASS \(transaction\)/);

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, invalidFile]),
    (error) => error.code === 1 && /FAIL \(transaction\)/.test(error.stderr),
  );
});
