# Enterprise Control Mapping

This document maps enterprise expectations to framework-level contracts. It does not claim operating-system ACL enforcement, identity-provider integration, or remote deployment capability.

## RBAC mapping

lib/enterprise-controls.mjs provides an explicit action-to-role map with deny by default.

- owner: inventory/suggest/plan/apply/rollback/index publish/evidence export.
- steward: inventory/suggest/plan/index publish.
- reviewer: inventory/suggest/evidence export.
- operator: inventory/suggest/plan/apply/rollback.

Host adapters must map these logical roles to real identities. A document or schema alone does not grant authority.

## Audit chain

Audit entries are hash-chained. verifyAuditChain checks both each event digest and the previous-link digest, detecting tampering after the fact. The chain stores opaque target references only; it must not contain paths, secrets, or personal identifiers.

## Retention and legal hold

evaluateRetention returns HOLD for legal_hold or lifecycle hold, REVIEW when no valid retention window exists or the window is exceeded, and KEEP only within the configured window. It never deletes anything. Permanent deletion remains outside this framework unless separately authorized.

## SLO and observability

buildSloStatus summarizes authorized synthetic observations with p95 latency and unknown-result rate. Telemetry does not leave the host and must not carry local paths or sensitive values.

## Compliance evidence export

exportComplianceEvidence packages chain verification, retention decision, and SLO status with explicit limits. It is suitable as a local, redacted evidence skeleton, not as proof of physical access control or a signed compliance attestation.
