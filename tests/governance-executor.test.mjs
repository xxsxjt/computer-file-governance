import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runTransaction, rollbackTransaction } from "../lib/governance-executor.mjs";
import { validateTransactionManifest } from "../lib/governance-validator.mjs";

async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "cfg-tidy-"));
  const root = path.join(base, "root");
  await mkdir(root, { recursive: true });
  const src = path.join(root, "loose.txt");
  const dst = path.join(root, "organized", "loose.txt");
  const existing = path.join(root, "organized", "taken.txt");
  await writeFile(src, "tidied payload", "utf8");
  await mkdir(path.dirname(existing), { recursive: true });
  await writeFile(existing, "do not overwrite", "utf8");
  return { base, root, src, dst, existing, evidence: path.join(base, "evidence") };
}

test("plan mode performs zero mutations and emits a schema-valid planned manifest", async () => {
  const f = await fixture();
  try {
    const plan = { scope: "synthetic test", authorized_roots: [f.root], evidence_dir: f.evidence, items: [{ source: f.src, destination: f.dst, note: "synthetic" }] };
    const out = await runTransaction(plan, { execute: false });
    assert.equal(out.ok, true);
    assert.equal(out.status, "planned");
    assert.equal(out.applied.length, 0);
    assert.equal(validateTransactionManifest(out.manifest).valid, true);
    await assert.rejects(import("node:fs/promises").then(({ access }) => access(f.dst)), { code: "ENOENT" });
    assert.equal(await readFile(f.src, "utf8"), "tidied payload");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
});

test("existing destination is held before any mutation", async () => {
  const f = await fixture();
  try {
    const plan = { scope: "synthetic test", authorized_roots: [f.root], evidence_dir: f.evidence, items: [{ source: f.src, destination: f.existing }] };
    const out = await runTransaction(plan, { execute: true });
    assert.equal(out.ok, false);
    assert.equal(out.status, "hold");
    assert.match(out.reason, /destination_exists_conflict/);
    assert.equal(out.applied.length, 0);
    assert.equal(await readFile(f.existing, "utf8"), "do not overwrite");
    assert.equal(await readFile(f.src, "utf8"), "tidied payload");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
});

test("apply verifies hashes and rollback restores the exact source", async () => {
  const f = await fixture();
  try {
    const plan = { scope: "synthetic test", authorized_roots: [f.root], evidence_dir: f.evidence, items: [{ source: f.src, destination: f.dst }] };
    const out = await runTransaction(plan, { execute: true });
    assert.equal(out.ok, true, JSON.stringify(out.error ?? ""));
    assert.equal(out.status, "verified");
    assert.equal(validateTransactionManifest(out.manifest).valid, true);
    assert.equal(await readFile(out.manifestPath, "utf8").then(JSON.parse).then((m) => m.status), "verified");
    assert.equal(await readFile(f.dst, "utf8"), "tidied payload");
    await assert.rejects(import("node:fs/promises").then(({ access }) => access(f.src)), { code: "ENOENT" });

    const rb = await rollbackTransaction(out.manifestPath);
    assert.equal(rb.ok, true);
    assert.equal(rb.status, "rolled_back");
    assert.equal(await readFile(f.src, "utf8"), "tidied payload");
    await assert.rejects(import("node:fs/promises").then(({ access }) => access(f.dst)), { code: "ENOENT" });
    const final = JSON.parse(await readFile(out.manifestPath, "utf8"));
    assert.equal(final.status, "rolled_back");
    assert.equal(validateTransactionManifest(final).valid, true);
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
});

test("source outside authorized roots is rejected before execution", async () => {
  const f = await fixture();
  const outside = path.join(f.base, "outside.txt");
  await writeFile(outside, "outside", "utf8");
  try {
    const plan = { scope: "synthetic test", authorized_roots: [f.root], evidence_dir: f.evidence, items: [{ source: outside, destination: f.dst }] };
    const out = await runTransaction(plan, { execute: true });
    assert.equal(out.ok, false);
    assert.equal(out.status, "rejected");
    assert.match(out.reason, /outside_authorized_roots/);
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
});

