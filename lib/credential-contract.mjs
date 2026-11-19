import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(
  await readFile(new URL("../schemas/vault-adapter-contract.schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const contractValidator = ajv.compile(schema);

export const CREDENTIAL_ERROR_CODES = Object.freeze({
  invalid_request: "CFG_E_CRED_INVALID_REQUEST",
  unsupported_version: "CFG_E_CRED_UNSUPPORTED_VERSION",
  credential_reference_missing: "CFG_E_CRED_REFERENCE_UNAVAILABLE",
  credential_unavailable: "CFG_E_CRED_REFERENCE_UNAVAILABLE",
  policy_denied: "CFG_E_CRED_POLICY_DENIED",
  target_not_allowed: "CFG_E_CRED_TARGET_DENIED",
  operation_not_allowed: "CFG_E_CRED_OPERATION_DENIED",
  host_identity_failed: "CFG_E_CRED_HOST_UNTRUSTED",
  authentication_denied: "CFG_E_CRED_AUTH_DENIED",
  authorization_denied: "CFG_E_CRED_AUTHZ_DENIED",
  timeout: "CFG_E_CRED_TIMEOUT",
  rate_limited: "CFG_E_CRED_RATE_LIMITED",
  service_unavailable: "CFG_E_CRED_SERVICE_UNAVAILABLE",
  unsafe_response: "CFG_E_CRED_UNSAFE_RESPONSE",
  audit_unavailable: "CFG_E_CRED_AUDIT_UNAVAILABLE",
  internal_error: "CFG_E_CRED_INTERNAL",
  outcome_unknown: "CFG_E_CRED_OUTCOME_UNKNOWN",
});

const SENSITIVE_KEY_RULES = [
  { id: "authorization_field", test: (key) => key === "authorization" || key === "auth_header" },
  { id: "credential_value_field", test: (key) => key === "credential_value" },
  { id: "secret_field", test: (key) => key === "secret" || key === "secret_value" || key.endsWith("_secret") },
  { id: "password_field", test: (key) => key === "password" || key === "passwd" },
  { id: "cookie_field", test: (key) => key === "cookie" || key === "set_cookie" },
  { id: "private_key_field", test: (key) => key === "private_key" },
  { id: "token_field", test: (key) => key === "token" || key === "access_token" || key === "refresh_token" || key === "id_token" },
  { id: "api_key_field", test: (key) => key === "api_key" || key === "client_key" },
  { id: "raw_transport_field", test: (key) => key === "headers" || key === "header" || key === "raw_request" || key === "raw_response" },
  { id: "endpoint_field", test: (key) => key === "endpoint" || key === "url" || key === "uri" },
  { id: "diagnostic_field", test: (key) => key === "stack" || key === "exception" || key === "debug" },
];

const SENSITIVE_VALUE_RULES = [
  { id: "private_key_material", regex: /-----BEGIN [^-]*PRIVATE KEY-----/i },
  { id: "authorization_header", regex: /\bAuthorization:\s+\S+/i },
  { id: "bearer_material", regex: /\bBearer\s+[A-Za-z0-9._~+\/=:-]{8,}/i },
  { id: "jwt_material", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { id: "github_token_material", regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: "openai_token_material", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: "cloud_access_key_material", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "credential_query_material", regex: /(?:password|passwd|secret|token|api[_-]?key)=\S+/i },
];

function normalizedKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.-]/g, "_")
    .toLowerCase();
}

function childPath(base, key) {
  const escaped = String(key).replace(/~/g, "~0").replace(/\//g, "~1");
  return base + "/" + escaped;
}

export function scanCredentialBoundaryLeaks(value) {
  const findings = [];
  const active = new WeakSet();

  function visit(current, instancePath) {
    if (typeof current === "string") {
      for (const rule of SENSITIVE_VALUE_RULES) {
        if (rule.regex.test(current)) {
          findings.push({
            instancePath,
            keyword: "secretBoundary",
            message: "value matches a credential-bearing material pattern",
            params: { rule: rule.id },
          });
        }
      }
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (active.has(current)) {
      findings.push({
        instancePath,
        keyword: "jsonValue",
        message: "cyclic values are not valid JSON contract data",
        params: { rule: "cyclic_value" },
      });
      return;
    }
    active.add(current);

    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, childPath(instancePath, index)));
      active.delete(current);
      return;
    }

    for (const [key, nested] of Object.entries(current)) {
      const keyPath = childPath(instancePath, key);
      const normalized = normalizedKey(key);
      for (const rule of SENSITIVE_KEY_RULES) {
        if (rule.test(normalized)) {
          findings.push({
            instancePath: keyPath,
            keyword: "secretBoundary",
            message: "credential-bearing fields are not allowed in this contract",
            params: { rule: rule.id },
          });
        }
      }
      visit(nested, keyPath);
    }
    active.delete(current);
  }

  visit(value, "");
  return findings;
}

function semanticErrors(contract) {
  const errors = scanCredentialBoundaryLeaks(contract);

  if (contract?.contractType === "request") {
    if (!contract.policy?.idempotent && contract.policy?.retry?.maxAttempts > 1 && !contract.policy?.idempotencyKey) {
      errors.push({
        instancePath: "/policy/idempotencyKey",
        keyword: "retrySafety",
        message: "non-idempotent operations with retries require an idempotencyKey",
        params: {},
      });
    }
  }

  if (contract?.contractType === "response") {
    if (contract.status === "succeeded" && contract.resultPrivacy === "none") {
      errors.push({
        instancePath: "/resultPrivacy",
        keyword: "resultPrivacy",
        message: "succeeded responses must classify the returned result",
        params: {},
      });
    }
    if (contract.status !== "succeeded" && contract.sideEffectState === "completed") {
      errors.push({
        instancePath: "/sideEffectState",
        keyword: "sideEffectState",
        message: "a non-success response cannot claim a completed side effect",
        params: {},
      });
    }
    if (contract.error?.class && contract.error.code !== credentialErrorCode(contract.error.class)) {
      errors.push({
        instancePath: "/error/code",
        keyword: "errorCodeMapping",
        message: "error.code must match the stable code for error.class",
        params: { errorClass: contract.error.class },
      });
    }
    const expectedErrorClasses = {
      timed_out: new Set(["timeout"]),
      rate_limited: new Set(["rate_limited"]),
      unavailable: new Set(["service_unavailable"]),
      unauthorized: new Set(["authentication_denied", "authorization_denied"]),
      redaction_failed: new Set(["unsafe_response"]),
      outcome_unknown: new Set(["outcome_unknown", "audit_unavailable", "internal_error"]),
    };
    const allowed = expectedErrorClasses[contract.status];
    if (allowed && contract.error?.class && !allowed.has(contract.error.class)) {
      errors.push({
        instancePath: "/error/class",
        keyword: "statusErrorMapping",
        message: "response status is incompatible with error.class",
        params: { status: contract.status, errorClass: contract.error.class },
      });
    }
    if (contract.status === "redaction_failed" && contract.redaction?.status !== "blocked") {
      errors.push({
        instancePath: "/redaction/status",
        keyword: "redactionState",
        message: "redaction_failed requires redaction.status=blocked",
        params: {},
      });
    }
  }

  if (contract?.contractType === "lifecycle") {
    const lastRotated = Date.parse(contract.rotation?.lastRotatedAtUtc);
    const nextReview = Date.parse(contract.rotation?.nextReviewAtUtc);
    if (Number.isFinite(lastRotated) && Number.isFinite(nextReview) && nextReview < lastRotated) {
      errors.push({
        instancePath: "/rotation/nextReviewAtUtc",
        keyword: "timeOrder",
        message: "nextReviewAtUtc must not precede lastRotatedAtUtc",
        params: {},
      });
    }
    const events = Array.isArray(contract.events) ? contract.events : [];
    let previous = -Infinity;
    for (const [index, event] of events.entries()) {
      const at = Date.parse(event?.atUtc);
      if (!Number.isFinite(at)) continue;
      if (at < previous) {
        errors.push({
          instancePath: "/events/" + index + "/atUtc",
          keyword: "eventOrder",
          message: "lifecycle events must be ordered by atUtc",
          params: {},
        });
      }
      previous = at;
    }
  }

  return errors;
}

export function validateVaultContract(contract) {
  const schemaValid = Boolean(contractValidator(contract));
  const schemaErrors = schemaValid ? [] : structuredClone(contractValidator.errors ?? []);
  if (!schemaValid) return { valid: false, errors: schemaErrors };
  const errors = semanticErrors(contract);
  return { valid: errors.length === 0, errors };
}

export function credentialErrorCode(errorClass) {
  return CREDENTIAL_ERROR_CODES[errorClass] ?? CREDENTIAL_ERROR_CODES.internal_error;
}

export function projectCredentialAuditEvent({ request, response, auditId, timestampUtc, actorRef, retryCount = 0 }) {
  if (!request || request.contractType !== "request") {
    throw new TypeError("projectCredentialAuditEvent requires a vault request contract");
  }
  if (!response || response.contractType !== "response") {
    throw new TypeError("projectCredentialAuditEvent requires a vault response contract");
  }
  const requestValidation = validateVaultContract(request);
  const responseValidation = validateVaultContract(response);
  if (!requestValidation.valid || !responseValidation.valid) {
    throw new TypeError("projectCredentialAuditEvent requires valid, redacted vault contracts");
  }

  const audit = {
    contractType: "audit",
    contractVersion: "vault-adapter-v1",
    auditId,
    requestId: request.requestId,
    operationRunId: response.operationRunId,
    timestampUtc,
    serviceRef: request.serviceRef,
    targetRef: request.targetRef,
    operationRef: request.operationRef,
    credentialRef: request.credentialRef,
    ...(actorRef ? { actorRef } : {}),
    decision:
      response.status === "succeeded"
        ? "completed"
        : response.status === "rejected"
          ? "rejected"
          : response.status === "outcome_unknown"
            ? "held"
            : "failed",
    outcome: response.status,
    sideEffectState: response.sideEffectState,
    resultPrivacy: response.resultPrivacy,
    ...(response.error?.class ? { errorClass: response.error.class } : {}),
    redactionStatus: response.redaction.status,
    retryCount,
  };

  return audit;
}
