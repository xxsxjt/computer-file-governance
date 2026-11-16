# Security Policy

## Scope

This repository publishes framework documents, schemas, code, synthetic fixtures, and adapter guidance. It must not contain credentials, private keys, cookies, tokens, real directory inventories, session transcripts, machine-specific manifests, transaction evidence, or local logs.

## Reporting

Report suspected vulnerabilities or privacy-boundary defects through the repository owner's private channel. Do not include secrets or private data in a public issue. Include the affected file or command, expected boundary, observed behavior, and minimal synthetic reproduction.

## Supported expectations

- Schema validation is shape validation, not proof of authorization, path containment, link/mount safety, or successful execution.
- Runtime adapters must enforce authorized roots, link/mount boundaries, target conflicts, and real post-state verification.
- Any operation with `outcome_unknown` requires real filesystem inspection before retry, rollback, or success reporting.

## Response process

1. Triage the report and classify impact as framework contract, code path, documentation, or release boundary.
2. Reproduce with synthetic fixtures only.
3. Patch the canonical repository, add a regression test, and update the changelog.
4. If a release was affected, publish a patch version and document the upgrade action.
