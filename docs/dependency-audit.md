# Dependency and Third-Party Source Audit

## Runtime

The reference implementation uses Node.js standard library modules only. No runtime npm dependency is required by the published CLI or library entrypoints.

## Development

- ajv 8.20.0: JSON Schema 2020-12 validation in tests/validator only.
- ajv-formats 3.0.1: date-time format support in tests/validator only.

Both packages are declared as devDependencies, pinned by package-lock.json, and are not present in the npm publish allowlist. Verify the lockfile and public boundary with npm test and npm pack --dry-run.

## Upgrade rule

Dependency upgrades must keep the public boundary green, avoid real machine data in fixtures, and add a regression test if validation behavior changes. Do not add a dependency that reads credentials, sends telemetry, or writes outside the caller-authorized roots.
