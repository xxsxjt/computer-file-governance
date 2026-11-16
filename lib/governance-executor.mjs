import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { preflightItemPaths } from "./governance-validator.mjs";

const ROOT_OP = new Set(["copy", "move", "rename", "archive"]);

async function digest(filePath) {
  const s = await lstat(filePath);
  if (!s.isFile()) throw new Error("digest requires a regular file");
  const h = createHash("sha256");
  await new Promise((resolve, reject) => {
    const rs = createReadStream(filePath);
    rs.on("data", (c) => h.update(c));
    rs.on("end", resolve);
    rs.on("error", reject);
  });
  return { sha256: h.digest("hex"), bytes: s.size };
}

async function validateBackup(record) {
  const info = await digest(record.backupPath);
  if (info.sha256 !== record.sourceSha256 || info.bytes !== record.expectedBytes) {
    throw new Error("backup_digest_mismatch");
  }
}

async function verifyNoMutation(record) {
  const sourceState = await lstat(record.source).catch(() => null);
  if (!sourceState || !sourceState.isFile()) throw new Error("source_not_regular_file");
  const sourceInfo = await digest(record.source);
  if (sourceInfo.sha256 !== record.sourceSha256 || sourceInfo.bytes !== record.expectedBytes) {
    throw new Error("source_changed");
  }
  const destinationState = await lstat(record.destination).catch(() => null);
  if (destinationState) throw new Error("destination_exists_without_backup");
}

async function restoreItemFromBackup(record) {
  await validateBackup(record);
  const sourceState = await lstat(record.source).catch(() => null);
  const destinationState = await lstat(record.destination).catch(() => null);
  if (sourceState) {
    const sourceInfo = await digest(record.source);
    if (sourceInfo.sha256 !== record.sourceSha256 || sourceInfo.bytes !== record.expectedBytes) {
      throw new Error("source_changed_refuse_overwrite");
    }
    if (destinationState) {
      const destinationInfo = await digest(record.destination);
      if (destinationInfo.sha256 !== record.sourceSha256 || destinationInfo.bytes !== record.expectedBytes) {
        throw new Error("destination_changed_refuse_remove");
      }
      await rm(record.destination, { force: true });
      return "removed_destination_source_already_present";
    }
    return "already_restored";
  }
  if (destinationState) {
    const destinationInfo = await digest(record.destination);
    if (destinationInfo.sha256 !== record.sourceSha256 || destinationInfo.bytes !== record.expectedBytes) {
      throw new Error("destination_changed_refuse_restore");
    }
  }
  await mkdir(path.dirname(record.source), { recursive: true });
  await copyFile(record.backupPath, record.source);
  const restoredInfo = await digest(record.source);
  if (restoredInfo.sha256 !== record.sourceSha256 || restoredInfo.bytes !== record.expectedBytes) {
    throw new Error("restore_verification_failed");
  }
  if (destinationState) await rm(record.destination, { force: true });
  return destinationState ? "restored_source_and_removed_destination" : "restored_source";
}

async function bestEffortRecoverTransaction(manifest, evidenceDir, txId, upToIndex) {
  const backupDir = path.join(evidenceDir, "backups", txId);
  const restored = [];
  const held = [];
  const unknown = [];
  const actions = {};
  const noBackup = [];
  for (let index = upToIndex; index >= 0; index -= 1) {
    const rec = manifest.items[index];
    if (!rec?.source_ref || !rec.destination_ref || !rec.source_sha256 || typeof rec.expected_bytes !== "number") {
      unknown.push({ index, reason: "incomplete_manifest_item" });
      continue;
    }
    const backupPath = path.join(backupDir, index + "-original");
    const record = {
      source: rec.source_ref,
      destination: rec.destination_ref,
      sourceSha256: rec.source_sha256,
      expectedBytes: rec.expected_bytes,
      backupPath,
    };
    const backupState = await lstat(backupPath).catch(() => null);
    if (backupState) {
      try {
        actions[index] = await restoreItemFromBackup(record);
        restored.push(index);
      } catch (error) {
        unknown.push({ index, reason: error.message });
      }
    } else {
      noBackup.push({ index, record });
    }
  }
  for (const { index, record } of noBackup) {
    try {
      await verifyNoMutation(record);
      actions[index] = "no_backup_no_mutation_observed";
      held.push(index);
    } catch (error) {
      unknown.push({ index, reason: "no_backup_" + error.message });
    }
  }
  return { backupDir, restored, held, unknown, actions };
}

export async function runTransaction(plan, options = {}) {
  const execute = Boolean(options.execute);
  const evidenceDir = plan.evidence_dir;
  if (typeof evidenceDir !== "string" || !path.isAbsolute(evidenceDir)) return { ok: false, status: "rejected", reason: "evidence_dir_must_be_absolute", applied: [], verification: { ran: false } };
  if (!Array.isArray(plan.items) || plan.items.length === 0) return { ok: false, status: "rejected", reason: "empty_items", applied: [], verification: { ran: false } };
  const roots = Array.isArray(plan.authorized_roots) ? plan.authorized_roots : [];
  const preflight = [];
  for (const [index, item] of plan.items.entries()) {
    if (!item.source || !item.destination) return { ok: false, status: "rejected", reason: "item_" + index + "_missing_refs", applied: [], verification: { ran: false } };
    const pre = await preflightItemPaths({
      sourcePath: item.source,
      destinationPath: ROOT_OP.has(item.operation ?? "move") ? item.destination : null,
      authorizedRoots: roots,
      allowExistingDestination: false,
    });
    preflight.push({ index, ...pre });
    if (!pre.ok) return { ok: false, status: pre.status, reason: "item_" + index + "_" + pre.reason, preflight, applied: [], verification: { ran: false } };
  }

  const txId = randomUUID();
  const now = new Date().toISOString();
  const manifest = {
    transaction_id: txId,
    created_at: now,
    status: "planned",
    operation: "move",
    approval: { scope: String(plan.scope ?? "current task"), method: "explicit_user_request", approved_at: now },
    items: [],
    verification: { status: "not_run", checked_at: now, checks: [] },
    rollback: { available: false, instructions: "dry-run only; no change applied" },
  };
  for (const [index, item] of plan.items.entries()) {
    const src = path.resolve(item.source);
    const dst = path.resolve(item.destination);
    const info = await digest(src);
    manifest.items.push({ source_ref: src, destination_ref: dst, expected_bytes: info.bytes, source_sha256: info.sha256, result: "pending", note: item.note ?? "" });
  }
  if (!execute) return { ok: true, status: "planned", transaction_id: txId, manifest, preflight, applied: [], verification: { ran: false } };

  await mkdir(evidenceDir, { recursive: true });
  const backupDir = path.join(evidenceDir, "backups", txId);
  await mkdir(backupDir, { recursive: true });
  const applied = [];
  for (const [index, item] of plan.items.entries()) {
    const rec = manifest.items[index];
    const src = rec.source_ref;
    const dst = rec.destination_ref;
    try {
      const op = item.operation ?? "move";
      await mkdir(path.dirname(dst), { recursive: true });
      const backupPath = path.join(backupDir, index + "-original");
      await copyFile(src, backupPath);
      if (op === "copy") await copyFile(src, dst);
      else await rename(src, dst);
      const check = await digest(dst);
      const sourceAfter = await lstat(src).catch(() => null);
      const ok = check.sha256 === rec.source_sha256 && check.bytes === rec.expected_bytes && (op === "copy" || sourceAfter === null);
      rec.result_sha256 = check.sha256;
      rec.result = ok ? "verified" : "failed";
      if (!ok) throw new Error("post-state hash or source state mismatch");
      applied.push({ index, source: src, destination: dst, operation: op, backupPath, sourceSha256: rec.source_sha256, expectedBytes: rec.expected_bytes });
    } catch (error) {
      rec.result = "unknown";
      manifest.status = "outcome_unknown";
      manifest.verification.status = "unknown";
      manifest.verification.checked_at = new Date().toISOString();
      manifest.verification.checks.push("item_" + index + "_error=" + error.message);
      const recovery = await bestEffortRecoverTransaction(manifest, evidenceDir, txId, index);
      for (const restoredIndex of recovery.restored) {
        const restoredRecord = manifest.items[restoredIndex];
        restoredRecord.result = "unknown";
        restoredRecord.note = "automatic recovery: " + recovery.actions[restoredIndex] + "; verify real post-state";
      }
      for (const heldIndex of recovery.held) manifest.items[heldIndex].result = "held";
      for (const restoredIndex of recovery.restored) {
        manifest.verification.checks.push("restore_" + restoredIndex + "_best_effort=" + recovery.actions[restoredIndex]);
      }
      for (const heldIndex of recovery.held) {
        manifest.verification.checks.push("restore_" + heldIndex + "_held=no_backup_no_mutation_observed");
      }
      for (const pending of recovery.unknown) {
        manifest.items[pending.index].result = "unknown";
        manifest.items[pending.index].note = "automatic recovery incomplete: " + pending.reason;
        manifest.verification.checks.push("restore_" + pending.index + "_unknown=" + pending.reason);
      }
      manifest.rollback = {
        available: true,
        instructions: "Outcome remains unknown. Review checks, verify the real filesystem state, and restore remaining items from backups in " + recovery.backupDir,
      };
      const p = path.join(evidenceDir, txId + ".manifest.json");
      await writeFile(p, JSON.stringify(manifest, null, 2), "utf8");
      return { ok: false, status: "outcome_unknown", transaction_id: txId, manifest, manifestPath: p, applied, verification: { ran: true, passed: false }, recovery, error: error.message };
    }
  }
  const manifestPath = path.join(evidenceDir, txId + ".manifest.json");
  manifest.status = "verified";
  manifest.verification = { status: "passed", checked_at: new Date().toISOString(), checks: applied.map((a) => "verified:" + a.destination) };
  manifest.rollback = { available: true, instructions: "Run rollback with this manifest; backups in " + backupDir, manifest_ref: manifestPath };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ok: true, status: "verified", transaction_id: txId, manifest, manifestPath, applied, verification: { ran: true, passed: true } };
}

export async function rollbackTransaction(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.items)) throw new Error("invalid manifest");
  if (manifest.status === "outcome_unknown") {
    const recovery = await bestEffortRecoverTransaction(manifest, path.dirname(manifestPath), manifest.transaction_id, manifest.items.length - 1);
    if (recovery.unknown.length > 0) {
      throw new Error("outcome_unknown recovery incomplete: " + JSON.stringify(recovery.unknown));
    }
    for (const [key, action] of Object.entries(recovery.actions)) {
      const index = Number(key);
      manifest.items[index].result = action === "no_backup_no_mutation_observed" ? "held" : "unknown";
    }
    manifest.verification = {
      status: "partial",
      checked_at: new Date().toISOString(),
      checks: Object.entries(recovery.actions).map(([index, action]) => "recovery_" + index + "=" + action),
    };
    const recoveryPath = path.join(path.dirname(manifestPath), manifest.transaction_id + ".recovery.json");
    await writeFile(recoveryPath, JSON.stringify({ transaction_id: manifest.transaction_id, status: "outcome_unknown", recovery, manifest_ref: manifestPath }, null, 2), "utf8");
    return { ok: true, status: "outcome_unknown", recovery, recoveryPath, restored: [], manifestPath };
  }
  const backupDir = path.join(path.dirname(manifestPath), "backups", manifest.transaction_id);
  const restored = [];
  for (let index = 0; index < manifest.items.length; index += 1) {
    const rec = manifest.items[index];
    if (rec.result !== "verified") continue;
    const current = await digest(rec.destination_ref);
    if (current.sha256 !== rec.source_sha256) throw new Error("destination changed, refuse rollback: " + rec.destination_ref);
    const backupPath = path.join(backupDir, index + "-original");
    const backupInfo = await digest(backupPath);
    if (backupInfo.sha256 !== rec.source_sha256) throw new Error("backup mismatch: " + backupPath);
    await copyFile(backupPath, rec.source_ref);
    await rm(rec.destination_ref, { force: true });
    const after = await digest(rec.source_ref);
    if (after.sha256 !== rec.source_sha256) throw new Error("restore verification failed: " + rec.source_ref);
    restored.push({ source: rec.source_ref, destination: rec.destination_ref });
  }
  manifest.status = "rolled_back";
  manifest.items = manifest.items.map((r) => ({ ...r, result: r.result === "verified" ? "rolled_back" : r.result }));
  manifest.verification = { status: "passed", checked_at: new Date().toISOString(), checks: restored.map((r) => "restored:" + r.source) };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ok: true, status: "rolled_back", restored, manifestPath };
}
