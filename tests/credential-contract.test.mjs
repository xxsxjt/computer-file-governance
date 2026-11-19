import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDENTIAL_ERROR_CODES,
  credentialErrorCode,
  projectCredentialAuditEvent,
  scanCredentialBoundaryLeaks,
  validateVaultContract,
} from "../lib/credential-contract.mjs";
import { describeError } from "../lib/user-report.mjs";

function requestFixture() {
  return {
    contractType: "request",
    contractVersion: "vault-adapter-v1",
    requestId: "request:req-001",
    serviceRef: "service:github",
    targetRef: "target:repo-001",
    operationRef: "operation:repo-read",
    credentialRef: "credential:github-read",
    authorizationRef: "authorization:task-001",
    actorRef: "actor:agent-001",
    requestedAtUtc: "2026-11-18T20:00:00Z",
    parameters: {
      repositoryRef: "repo:synthetic-public",
      revision: "main",
    },
    policy: {
      timeoutMs: 5000,
      idempotent: true,
      sideEffectMode: "read_only",
      retry: {
        maxAttempts: 2,
        backoffMs: 100,
        retryableErrors: ["timeout", "rate_limited", "service_unavailable"],
      },
      auditRequired: true,
    },
  };
}

function responseFixture() {
  return {
    contractType: "response",
    contractVersion: "vault-adapter-v1",
    requestId: "request:req-001",
    operationRunId: "operation-run:run-001",
    status: "succeeded",
    sideEffectState: "not_applicable",
    resultPrivacy: "internal",
    result: { status: "ok", recordCount: 1 },
    redaction: { status: "not_needed", removedFieldCount: 0 },
    auditRef: "audit:a-001",
  };
}

function auditFixture() {
  return {
    contractType: "audit",
    contractVersion: "vault-adapter-v1",
    auditId: "audit:a-001",
    requestId: "request:req-001",
    operationRunId: "operation-run:run-001",
    timestampUtc: "2026-11-18T20:00:02Z",
    serviceRef: "service:github",
    targetRef: "target:repo-001",
    operationRef: "operation:repo-read",
    credentialRef: "credential:github-read",
    actorRef: "actor:agent-001",
    decision: "completed",
    outcome: "succeeded",
    sideEffectState: "not_applicable",
    resultPrivacy: "internal",
    redactionStatus: "not_needed",
    retryCount: 0,
  };
}

function lifecycleFixture() {
  return {
    contractType: "lifecycle",
    contractVersion: "vault-adapter-v1",
    lifecycleId: "lifecycle:github-read",
    serviceRef: "service:github",
    credentialRef: "credential:github-read",
    state: "active",
    owners: {
      vaultOwnerRef: "owner:vault",
      adapterOwnerRef: "owner:adapter",
      serviceOwnerRef: "owner:service",
    },
    allowedOperationRefs: ["operation:repo-read"],
    rotation: {
      referenceModel: "stable_alias",
      cachePolicy: "process_bound",
      lastRotatedAtUtc: "2026-11-01T00:00:00Z",
      nextReviewAtUtc: "2026-12-01T00:00:00Z",
      oldReferenceDisposition: "overlap_until_verified",
    },
    events: [
      {
        eventId: "event:initial-review",
        eventType: "permission_reviewed",
        atUtc: "2026-11-01T00:00:00Z",
        actorRef: "actor:admin",
        resultingState: "active",
        reasonRef: "reason:reviewed",
      },
    ],
  };
}

test("request, response, audit, and lifecycle contracts validate with synthetic data", () => {
  for (const contract of [requestFixture(), responseFixture(), auditFixture(), lifecycleFixture()]) {
    const result = validateVaultContract(contract);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  }
});

test("contract rejects plaintext-shaped fields and common credential material", () => {
  const request = requestFixture();
  request.parameters.token = "synthetic-never-secret";
  const result = validateVaultContract(request);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "secretBoundary"));

  const response = responseFixture();
  response.result = { nested: { authorization: "synthetic-never-secret" } };
  const responseResult = validateVaultContract(response);
  assert.equal(responseResult.valid, false);
  assert.ok(responseResult.errors.some((error) => error.keyword === "secretBoundary"));

  const findings = scanCredentialBoundaryLeaks({ nested: "Bearer synthetic-token-material" });
  assert.ok(findings.some((finding) => finding.params.rule === "bearer_material"));
  assert.ok(!JSON.stringify(findings).includes("synthetic-token-material"));
});

test("contract rejects arbitrary URLs, raw headers, and unknown fields", () => {
  const request = requestFixture();
  request.parameters.endpoint = "https://example.invalid/service";
  assert.equal(validateVaultContract(request).valid, false);

  const response = responseFixture();
  response.result = { status: "ok", headers: { "x-test": "synthetic" } };
  assert.equal(validateVaultContract(response).valid, false);

  const audit = auditFixture();
  audit.rawResponse = "synthetic";
  assert.equal(validateVaultContract(audit).valid, false);
});

test("request policy requires an idempotency reference before retrying a non-idempotent operation", () => {
  const request = requestFixture();
  request.policy.idempotent = false;
  request.policy.sideEffectMode = "non_idempotent_write";
  const result = validateVaultContract(request);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "required" || error.keyword === "retrySafety"));

  request.policy.idempotencyKey = "idempotency:write-001";
  assert.equal(validateVaultContract(request).valid, true);
});

test("outcome-unknown response preserves conservative side-effect semantics", () => {
  const response = responseFixture();
  delete response.result;
  response.status = "outcome_unknown";
  response.sideEffectState = "possibly_completed";
  response.error = {
    class: "outcome_unknown",
    code: "CFG_E_CRED_OUTCOME_UNKNOWN",
    retryable: false,
    messageCode: "message:outcome-unknown",
  };
  assert.equal(validateVaultContract(response).valid, true);

  response.sideEffectState = "completed";
  assert.equal(validateVaultContract(response).valid, false);
});

test("response error class and stable code remain aligned", () => {
  const response = responseFixture();
  delete response.result;
  response.status = "timed_out";
  response.sideEffectState = "not_confirmed";
  response.error = {
    class: "timeout",
    code: "CFG_E_CRED_INTERNAL",
    retryable: true,
    messageCode: "message:timeout",
  };
  const result = validateVaultContract(response);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "errorCodeMapping"));

  response.error.code = "CFG_E_CRED_TIMEOUT";
  assert.equal(validateVaultContract(response).valid, true);
});

test("audit projection contains only minimum opaque references and outcome fields", () => {
  const audit = projectCredentialAuditEvent({
    request: requestFixture(),
    response: responseFixture(),
    auditId: "audit:a-001",
    timestampUtc: "2026-11-18T20:00:02Z",
    actorRef: "actor:agent-001",
  });
  assert.equal(validateVaultContract(audit).valid, true);
  assert.equal(Object.hasOwn(audit, "result"), false);
  assert.equal(Object.hasOwn(audit, "parameters"), false);
  assert.equal(Object.hasOwn(audit, "credentialValue"), false);
});

test("lifecycle rejects reversed review time and revoked operation allowlists", () => {
  const reversed = lifecycleFixture();
  reversed.rotation.nextReviewAtUtc = "2026-10-01T00:00:00Z";
  assert.equal(validateVaultContract(reversed).valid, false);

  const revoked = lifecycleFixture();
  revoked.state = "revoked";
  revoked.allowedOperationRefs = [];
  assert.equal(validateVaultContract(revoked).valid, true);

  revoked.allowedOperationRefs = ["operation:repo-read"];
  assert.equal(validateVaultContract(revoked).valid, false);
});

test("credential error classes map to stable user-facing codes", () => {
  assert.equal(credentialErrorCode("timeout"), "CFG_E_CRED_TIMEOUT");
  assert.equal(credentialErrorCode("not-a-real-class"), "CFG_E_CRED_INTERNAL");
  assert.ok(Object.keys(CREDENTIAL_ERROR_CODES).length >= 15);
  for (const code of new Set(Object.values(CREDENTIAL_ERROR_CODES))) {
    assert.notEqual(describeError(code).title, "未知错误");
  }
});
