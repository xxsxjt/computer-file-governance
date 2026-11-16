import assert from "node:assert/strict";
import test from "node:test";
import { applyDiffToIndex, commitSnapshotPointer, diffSnapshots, rollbackSnapshotPointer } from "../lib/incremental-refresh.mjs";

const row = (ref, digest, lifecycle = "active") => ({
  record_id: ref,
  item_ref: ref,
  item_kind: "file",
  owner: "project",
  role: "source",
  privacy: "internal",
  lifecycle,
  confidence: "high",
  content_fingerprint: { algorithm: "sha256", digest },
  updated_at: "2026-11-01T00:00:00.000Z",
});

test("snapshot diff produces add/change/tombstone and applies without deleting files", () => {
  const previous = [row("a", "a".repeat(64)), row("b", "b".repeat(64))];
  const current = [row("a", "c".repeat(64)), row("c", "d".repeat(64))];
  const diff = diffSnapshots(previous, current, { now: "2026-11-16T00:00:00.000Z" });
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.changed, 1);
  assert.equal(diff.summary.removed, 1);
  assert.equal(diff.removed[0].tombstone, true);
  assert.equal(diff.removed[0].retired_at, "2026-11-16T00:00:00.000Z");
  const merged = applyDiffToIndex(previous, diff);
  const found = merged.find((r) => r.item_ref === "b");
  assert.equal(found.lifecycle, "retired");
  assert.equal(found.tombstone, true);
});

test("pointer commit detects conflict and can roll back an uncontested switch", async () => {
  const pointers = new Map([["current.json", "v1.json"], ["v1.json", "v1-data"], ["v2.json", "v2-data"]]);
  const readPointer = async (name) => pointers.get(name) ?? null;
  const writePointer = async (name, value) => { pointers.set(name, value); };
  const conflict = await commitSnapshotPointer({ readPointer, writePointer, candidate: "v2.json", expectedCurrent: "stale.json" });
  assert.equal(conflict.status, "conflict");
  const committed = await commitSnapshotPointer({ readPointer, writePointer, candidate: "v2.json", expectedCurrent: "v1.json" });
  assert.equal(committed.status, "committed");
  assert.equal(pointers.get("current.json"), "v2.json");
  const rolled = await rollbackSnapshotPointer({ readPointer, writePointer, committed });
  assert.equal(rolled.ok, true);
  assert.equal(pointers.get("current.json"), "v1.json");
});
