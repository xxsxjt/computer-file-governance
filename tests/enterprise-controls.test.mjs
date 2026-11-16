import assert from "node:assert/strict";
import test from "node:test";
import { appendAuditEvent, buildSloStatus, canPerform, evaluateRetention, exportComplianceEvidence, verifyAuditChain } from "../lib/enterprise-controls.mjs";

test("RBAC roles map explicitly and deny by default", () => {
  assert.equal(canPerform("owner", "transaction:apply"), true);
  assert.equal(canPerform("reviewer", "transaction:apply"), false);
  assert.equal(canPerform("operator", "evidence:export"), false);
  assert.equal(canPerform("owner", "unknown:action"), false);
});

test("audit chain detects event and link tampering", () => {
  let chain = [];
  chain = appendAuditEvent(chain, { actorRef: "reviewer-a", action: "plan:create", targetRef: "opaque-1", outcome: "planned", timestampUtc: "2026-11-16T00:00:00.000Z" });
  chain = appendAuditEvent(chain, { actorRef: "operator-a", action: "transaction:apply", targetRef: "opaque-2", outcome: "verified", timestampUtc: "2026-11-16T00:01:00.000Z" });
  assert.equal(verifyAuditChain(chain).ok, true);
  const tampered = structuredClone(chain);
  tampered[0].outcome = "verified";
  assert.equal(verifyAuditChain(tampered).ok, false);
  const brokenLink = structuredClone(chain);
  brokenLink[1].previousHash = "0".repeat(64);
  assert.equal(verifyAuditChain(brokenLink).reason, "previous_hash_mismatch");
});

test("retention respects legal hold and SLO summarizes synthetic observations", () => {
  assert.equal(evaluateRetention({ legal_hold: true, updated_at: "2020-01-01T00:00:00.000Z" }, { maxAgeDays: 1 }, "2026-11-16T00:00:00.000Z").action, "HOLD");
  assert.equal(evaluateRetention({ updated_at: "2026-11-01T00:00:00.000Z" }, { maxAgeDays: 30 }, "2026-11-16T00:00:00.000Z").action, "KEEP");
  assert.equal(evaluateRetention({ updated_at: "2026-09-01T00:00:00.000Z" }, { maxAgeDays: 30 }, "2026-11-16T00:00:00.000Z").action, "REVIEW");
  const slo = buildSloStatus([
    { durationMs: 10, status: "verified" },
    { durationMs: 20, status: "outcome_unknown" },
    ...Array.from({ length: 18 }, () => ({ durationMs: 30, status: "verified" })),
  ]);
  assert.equal(slo.met, true);
  const evidence = exportComplianceEvidence({ chain: [], retention: { action: "KEEP" }, slo });
  assert.equal(evidence.auditChain.ok, true);
  assert.equal(evidence.limits.length, 2);
});
