import { createHash } from "node:crypto";

export const RBAC_ACTIONS = Object.freeze({
  "inventory:read": ["owner", "steward", "reviewer", "operator"],
  "suggest:read": ["owner", "steward", "reviewer", "operator"],
  "plan:create": ["owner", "steward", "operator"],
  "transaction:apply": ["owner", "operator"],
  "transaction:rollback": ["owner", "operator"],
  "index:publish": ["owner", "steward"],
  "evidence:export": ["owner", "reviewer"],
});

export function canPerform(role, action) {
  return Array.isArray(RBAC_ACTIONS[action]) && RBAC_ACTIONS[action].includes(role);
}

export function appendAuditEvent(chain, event) {
  const previous = chain.at(-1) ?? null;
  const entry = {
    sequence: previous ? previous.sequence + 1 : 1,
    timestampUtc: event.timestampUtc ?? new Date().toISOString(),
    actorRef: String(event.actorRef ?? "unknown"),
    action: String(event.action ?? "unknown"),
    targetRef: String(event.targetRef ?? "unknown"),
    outcome: String(event.outcome ?? "unknown"),
    previousHash: previous?.hash ?? null,
  };
  entry.hash = createHash("sha256")
    .update(JSON.stringify({ ...entry, hash: undefined }))
    .digest("hex");
  return [...chain, entry];
}

export function verifyAuditChain(chain) {
  if (!Array.isArray(chain)) return { ok: false, reason: "chain_not_array" };
  for (let index = 0; index < chain.length; index += 1) {
    const expectedPrevious = index === 0 ? null : chain[index - 1].hash;
    if (chain[index].previousHash !== expectedPrevious) return { ok: false, reason: "previous_hash_mismatch", index };
    const recomputed = createHash("sha256")
      .update(JSON.stringify({ ...chain[index], hash: undefined }))
      .digest("hex");
    if (recomputed !== chain[index].hash) return { ok: false, reason: "event_hash_mismatch", index };
  }
  return { ok: true, length: chain.length };
}

export function evaluateRetention(record, policy, now = new Date().toISOString()) {
  if (record?.legal_hold === true) return { action: "HOLD", reason: "legal_hold" };
  if (record?.lifecycle === "hold") return { action: "HOLD", reason: "lifecycle_hold" };
  const maxAgeDays = Number(policy?.maxAgeDays);
  if (!Number.isFinite(maxAgeDays)) return { action: "REVIEW", reason: "no_retention_window" };
  const updated = Date.parse(record?.updated_at ?? "");
  if (!Number.isFinite(updated)) return { action: "REVIEW", reason: "invalid_updated_at" };
  const ageDays = (Date.parse(now) - updated) / 86400000;
  return ageDays > maxAgeDays ? { action: "REVIEW", reason: "retention_window_exceeded", ageDays } : { action: "KEEP", reason: "within_retention_window", ageDays };
}

export function buildSloStatus(observations, targets = { p95Ms: 1000, unknownRate: 0.05 }) {
  const samples = Array.isArray(observations) ? observations : [];
  const durations = samples.map((o) => Number(o.durationMs)).filter(Number.isFinite).sort((a, b) => a - b);
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.ceil(0.95 * durations.length) - 1)] : null;
  const unknown = samples.filter((o) => o.status === "outcome_unknown" || o.status === "unknown").length;
  const unknownRate = samples.length ? unknown / samples.length : 0;
  return {
    observations: samples.length,
    p95Ms: p95,
    unknownRate,
    targets,
    met: p95 !== null && p95 <= targets.p95Ms && unknownRate <= targets.unknownRate,
    note: "Synthetic or authorized observations only; no telemetry leaves the host.",
  };
}

export function exportComplianceEvidence({ chain, retention, slo }) {
  return {
    generatedAtUtc: new Date().toISOString(),
    auditChain: verifyAuditChain(chain),
    chainLength: Array.isArray(chain) ? chain.length : 0,
    retention,
    slo,
    limits: [
      "No secret value or local path is included in this export.",
      "Audit verification proves hash continuity only, not physical access control.",
    ],
  };
}
