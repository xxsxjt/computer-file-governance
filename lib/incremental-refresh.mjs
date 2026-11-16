import { createHash } from "node:crypto";

function rowKey(row) {
  return String(row.item_ref ?? row.record_id ?? row.relativePath ?? "");
}

function normalizeSnapshot(input) {
  const list = Array.isArray(input) ? input : input?.records;
  if (!Array.isArray(list)) throw new TypeError("snapshot must be an array or { records: [...] }");
  const map = new Map();
  for (const [index, row] of list.entries()) {
    if (!row || typeof row !== "object") continue;
    const key = rowKey(row);
    if (!key) throw new Error("snapshot row " + index + " has no item_ref/record_id/relativePath");
    if (map.has(key)) throw new Error("duplicate snapshot key: " + key);
    map.set(key, row);
  }
  return map;
}

function fingerprintOf(row) {
  const fp = row?.content_fingerprint;
  if (fp && typeof fp.algorithm === "string" && typeof fp.digest === "string") {
    return fp.algorithm + ":" + fp.digest;
  }
  return createHash("sha256").update(JSON.stringify(row ?? null)).digest("hex");
}

export function diffSnapshots(previousInput, currentInput, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const previous = normalizeSnapshot(previousInput);
  const current = normalizeSnapshot(currentInput);
  const added = [];
  const changed = [];
  const removed = [];
  const unchanged = [];
  const skipped = [];

  for (const [key, row] of current) {
    if (!previous.has(key)) {
      added.push(row);
      continue;
    }
    const before = previous.get(key);
    if (fingerprintOf(before) === fingerprintOf(row)) unchanged.push(row);
    else changed.push({ before, after: row });
  }
  for (const [key, row] of previous) {
    if (!current.has(key)) {
      removed.push({
        item_ref: row.item_ref ?? row.record_id ?? key,
        tombstone: true,
        retired_at: now,
        previous_fingerprint: fingerprintOf(row),
      });
    }
  }
  return {
    generatedAtUtc: now,
    summary: { previous: previous.size, current: current.size, added: added.length, changed: changed.length, removed: removed.length, unchanged: unchanged.length, skipped: skipped.length },
    added,
    changed,
    removed,
    unchanged,
    skipped,
    limits: [
      "A snapshot is a point-in-time view, not a live filesystem.",
      "Removal candidates are tombstones for review; no file is deleted.",
      "No index pointer is switched unless commitSnapshotPointer succeeds.",
    ],
  };
}

export function applyDiffToIndex(previousInput, diff) {
  const index = normalizeSnapshot(previousInput);
  for (const row of diff.added) index.set(rowKey(row), row);
  for (const entry of diff.changed) index.set(rowKey(entry.after), entry.after);
  for (const tombstone of diff.removed) {
    index.set(rowKey(tombstone), { ...tombstone, record_id: tombstone.item_ref, item_ref: tombstone.item_ref, lifecycle: "retired" });
  }
  return [...index.values()];
}

export async function commitSnapshotPointer({ readPointer, writePointer, candidate, expectedCurrent = null }) {
  const current = await readPointer("current.json");
  if (expectedCurrent !== null && current !== expectedCurrent) {
    return { ok: false, status: "conflict", current, candidate, reason: "pointer_changed" };
  }
  const tempName = current + ".tmp-" + process.pid;
  await writePointer(tempName, candidate);
  await writePointer("current.json", candidate);
  return { ok: true, status: "committed", from: current, to: candidate, tempName };
}

export async function rollbackSnapshotPointer({ readPointer, writePointer, committed }) {
  const current = await readPointer("current.json");
  if (current !== committed.to) {
    return { ok: false, status: "conflict", current, expected: committed.to, reason: "pointer_moved_after_commit" };
  }
  await writePointer("current.json", committed.from);
  return { ok: true, status: "rolled_back", from: committed.to, to: committed.from };
}
