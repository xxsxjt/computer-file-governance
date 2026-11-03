import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { scanTextForPublicBoundaryLeaks } from "../lib/governance-validator.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

test("Git tracked files exclude local handoffs, inventories, and machine-specific paths", async () => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: repoRoot },
  );
  const trackedFiles = [...new Set(stdout.split(/\r?\n/).filter(Boolean))];

  assert.ok(trackedFiles.length > 0, "expected tracked framework files");

  for (const relPath of trackedFiles) {
    assert.notEqual(relPath, "HANDOFF.md", "HANDOFF.md must remain local/untracked");
    assert.doesNotMatch(relPath, /^private\//, "private/ directory must never be tracked");
    assert.doesNotMatch(relPath, /\.local\.(md|json)$/, "*.local.* files must never be tracked");
    assert.doesNotMatch(relPath, /^local-(inventory|manifests)/, "local manifests/inventories must never be tracked");

    const content = await readFile(path.join(repoRoot, relPath), "utf8");
    const leaks = scanTextForPublicBoundaryLeaks(content);
    assert.deepEqual(
      leaks,
      [],
      `Tracked file ${relPath} contains machine-specific or unpublished draft markers: ${JSON.stringify(leaks)}`,
    );
  }
});

test("package.json defines an explicit framework-only publish allowlist", async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.ok(Array.isArray(pkg.files), "package.json must declare a files allowlist");
  assert.ok(!pkg.files.includes("HANDOFF.md"));
  assert.ok(!pkg.files.includes("private/"));
  assert.ok(!pkg.files.includes("tests/"));
});

test("scanTextForPublicBoundaryLeaks detects machine paths and draft markers", () => {
  const syntheticWinPath = ["C:", "Work", "AGENTS.md"].join("\\");
  const syntheticPosixHome = ["", "Users", "alice", "secret.txt"].join("/");
  const sample = `${syntheticWinPath}\n${syntheticPosixHome}\n${"状态：" + "本地方案草案；未发布"}`;
  const findings = scanTextForPublicBoundaryLeaks(sample);
  assert.deepEqual(
    findings.map((f) => f.rule),
    ["windows_drive_path", "posix_user_home", "unpublished_local_draft_marker"],
  );
});
