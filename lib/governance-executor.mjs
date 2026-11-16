import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { preflightItemPaths } from "./governance-validator.mjs";

const ROOT_OP = new Set(["copy", "move", "rename", "archive"]);

async function digest(filePath) {
  const s = await stat(filePath);
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
      applied.push({ index, source: src, destination: dst, operation: op, backupPath });
    } catch (error) {
      rec.result = "failed";
      manifest.status = "outcome_unknown";
      manifest.verification.status = "failed";
      manifest.verification.checked_at = new Date().toISOString();
      manifest.verification.checks.push("item_" + index + "_error=" + error.message);
      manifest.rollback = { available: true, instructions: "Restore from transaction backups in " + backupDir };
      const p = path.join(evidenceDir, txId + ".manifest.json");
      await writeFile(p, JSON.stringify(manifest, null, 2), "utf8");
      return { ok: false, status: "outcome_unknown", transaction_id: txId, manifest, applied, verification: { ran: true, passed: false }, error: error.message };
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

