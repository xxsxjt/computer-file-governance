---
name: computer-file-governance
description: Apply when cataloging, classifying, standardizing, archiving, relocating, or reviewing files and directories on a computer or server. Establish purpose, ownership, privacy, lifecycle, canonical references, and recoverable change records; do not treat cleanup as the objective.
license: AGPL-3.0-only
compatibility: Works with Agent Skills-compatible systems; platform-specific operations require a matching profile and an authorized filesystem or remote-management tool.
metadata:
  version: "0.1.0"
---

# Computer File Governance

Use this skill to make file and directory management coherent across agents and machines. The objective is an understandable, searchable, ownership-aware file system. Moving or deleting items is optional and never a measure of success by itself.

## First-use setup

When the user first provides this Skill's path or repository URL, follow [the persistent Agent onboarding procedure](docs/agent-onboarding.md). Read the guide and relevant references, then register a durable pointer in the actual auto-loaded global Agent instructions so later sessions can load it without another user reminder. Verify the startup path rather than assuming a file or environment variable is automatically read. Do not add technical access gates or provider restrictions; this Skill is a behavior standard.

## Required workflow

1. **Set scope.** Identify the exact authorized machine, roots, owner, purpose, privacy boundary, and allowed operation types. Do not infer authority from a path merely existing. For Windows, resolve the current account and Known Folder targets. For a server, confirm the host identity and remote authorization before accessing it.
2. **Inventory proportionally.** Start with bounded metadata such as name, kind, size, timestamps, owner, and link/mount status. Do not read file bodies, recurse through links, or scan outside the declared roots unless that is necessary and authorized. Record inventory limits and unknowns.
3. **Classify on separate axes.** For each item or directory, track its owner, purpose/role, privacy, lifecycle, confidence, and evidence. Do not collapse “old”, “duplicate”, “large”, “temporary”, and “unneeded” into one judgment. Use `UNRESOLVED_HOLD` when purpose or ownership is uncertain.
4. **Map canonical locations.** Define one authoritative reference for each governed role, while retaining legitimate replicas, backups, versioned outputs, and application-managed state where required. Keep machine-specific indexes and path maps local and appropriately restricted; never publish them.
5. **Plan before changing.** Produce a dry-run plan listing source and destination references, operation, expected bytes, collision checks, verification method, rollback, and any approval required. Do not overwrite an existing target. Do not silently change application, VM, service, or system-managed paths.
6. **Execute in bounded transactions.** Use the host's approved file-management interface. Preserve source data until destination verification succeeds. For cross-device moves, copy and verify first, then treat source removal as a separate authorized step. Permanent deletion is opt-in and requires an explicit scope and recovery assessment.
7. **Verify and reconcile.** Confirm the actual post-state, content hash when appropriate, metadata needed by the owner, application references, and index update. Record partial or unknown outcomes honestly; do not report success based only on a command's exit code.
8. **Report and retain evidence.** Summarize what changed, what stayed on hold, verification results, canonical references, and rollback location. Store transaction manifests beside the private machine/project records, not in this public repository.

## Safety defaults

- Unknown owner, unclear purpose, active work, application-owned data, credentials, databases, VM images, and mounted/server-managed data remain untouched until their boundary is established.
- No overwrite, link-following, broad recursive scan, service stop/start, or permanent deletion by default. Follow the platform profile and the actual tool's confirmation requirements.
- A user may delegate routine classification without approving each item. Still pause for ambiguous authority, privacy exposure, irreversible effects, external impact, or an operation that exceeds the stated scope.
- Keep secret values out of model context, public indexes, logs, examples, and manifests. Use opaque local references where possible.
- A user-authorized Agent may use a local vault-backed credential adapter regardless of model-provider channel. This is provider-side confidentiality, not an agent-trust gate: keep the credential out of provider-visible prompts, tool arguments/results, files, and logs; let the local adapter use it for the intended target request. Do not ask the Agent to resolve or print the credential.
- Tool requests and returned data remain visible to the model provider. Hide the credential value, not the fact or content of the operation; apply the relevant privacy classification to all other data.
- If a supported UI/RPC confirmation is required by the operation tool and is unavailable, do not substitute an unconfirmed shell command.

## References

Read [the governance model](docs/governance-model.md) first, then the relevant platform profile: [Windows](profiles/windows.md), [Linux server](profiles/linux-server.md), or [Downloads](scenarios/downloads.md). When using local credentials, follow [non-plaintext credential use](docs/credential-use.md). The [schemas](schemas/) describe portable record shapes, not a requirement to upload local records.
