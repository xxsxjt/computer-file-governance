import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const gitignoreExample = new URL("../adapters/examples/workspace-host/gitignore.example", import.meta.url);

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
}

test("synthetic host separates temporary, evidence, deliverables, and private manifest/index from Git", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cfg-workspace-host-"));
  try {
    await writeFile(path.join(root, ".gitignore"), await readFile(gitignoreExample, "utf8"));
    const files = [
      "project/source/seed.txt",
      "task/T-001/temporary/draft.txt",
      "task/T-001/working/intermediate.txt",
      "task/T-001/deliverables/result.txt",
      "task/T-001/evidence/verification.txt",
      "private/rollback/T-001/backup.txt",
      "private/index/index.json",
      "private/manifests/task.json",
      "cache/rebuildable.bin",
    ];
    for (const relative of files) {
      const absolute = path.join(root, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, "synthetic example only\n");
    }

    const source = path.join(root, "project", "source");
    const evidence = path.join(root, "task", "T-001", "evidence");
    const temporaryFile = path.join(root, "task", "T-001", "temporary", "draft.txt");
    const deliverableFile = path.join(root, "task", "T-001", "deliverables", "result.txt");
    assert.equal(isWithin(source, evidence), false, "evidence must be outside the source tree");
    assert.notEqual(path.dirname(temporaryFile), path.dirname(deliverableFile), "temporary files must not share the deliverable slot");

    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
    const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean).sort();
    assert.deepEqual(tracked, [".gitignore", "project/source/seed.txt", "task/T-001/deliverables/result.txt"]);
    assert.equal(tracked.some((entry) => entry.includes("/temporary/") || entry.includes("/working/") || entry.includes("/evidence/")), false);
    assert.equal(tracked.some((entry) => entry.startsWith("private/") || entry.startsWith("cache/")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
