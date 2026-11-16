import assert from "node:assert/strict";
import test from "node:test";
import { buildDuplicateClusters } from "../lib/duplicate-clusters.mjs";

function record(ref, digest, overrides = {}) {
  return {
    record_id: ref,
    item_ref: ref,
    item_kind: "file",
    owner: "unknown",
    role: "unknown",
    privacy: "internal",
    lifecycle: "active",
    confidence: "medium",
    content_fingerprint: { algorithm: "sha256", digest },
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

test("duplicate clusters are review-only and prefer archive/backup canonical candidates", () => {
  const digest = "a".repeat(64);
  const result = buildDuplicateClusters([
    record("active", digest, { role: "active_work", lifecycle: "active" }),
    record("backup", digest, { role: "backup", lifecycle: "archive" }),
    record("held", digest, { role: "reference", lifecycle: "hold", privacy: "secret" }),
    record("no-fingerprint", undefined, {}),
  ]);
  assert.equal(result.summary.recordsSeen, 4);
  assert.equal(result.summary.recordsConsidered, 2);
  assert.equal(result.summary.skippedProtectedOrUnknown, 1);
  assert.equal(result.summary.skippedMissingFingerprint, 1);
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].suggestedCanonicalRef, "backup");
  assert.equal(result.clusters[0].actionPolicy, "REVIEW_ONLY");
  assert.equal(result.clusters[0].neverAutoDelete, true);
  assert.ok(result.clusters[0].members.every((m) => m.item_ref !== "held"));
});

test("fingerprint disagreement never creates a cluster", () => {
  const result = buildDuplicateClusters([
    record("one", "a".repeat(64)),
    record("two", "b".repeat(64)),
  ]);
  assert.equal(result.clusters.length, 0);
});
