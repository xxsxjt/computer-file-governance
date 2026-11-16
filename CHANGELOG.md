# Changelog

All notable changes to the public framework are recorded here. Local inventories, session content, transaction evidence, credentials, and machine paths are never recorded here.

## 0.4.0

- Added maturity criteria, naming/classification criteria, authority/freshness/lifecycle rules, stable schema identifiers, and a stepwise implementation contract.
- Added a bounded transaction executor with dry-run, backup, per-file SHA-256 verification, rollback, and conservative partial-failure recovery.
- Added a rebuildable secondary index with freshness checks, stale fallback, a synthetic benchmark, review-only duplicate clusters, and dry-run classification suggestions.
- Added incremental snapshot refresh with tombstones and reversible pointer switching, a normal-user guide, error catalog, result summaries, and third-party coexistence examples.
- Kept `HANDOFF.md`, `private/`, `tests/`, local inventories, manifests, logs, sessions, and credentials outside the npm publish allowlist and Git.

## 0.3.0

- Added metadata inventory search, dry-run plans, bounded transactions, hash verification, and rollback.

## 0.2.0

- Established the single-source Skill, platform profiles, Downloads scenario, schemas, and the public/private framework boundary.
