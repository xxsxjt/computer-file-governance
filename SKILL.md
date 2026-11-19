---
name: computer-file-governance
description: Apply when establishing or using a whole-machine file governance, shared-information, and unified-index framework: finding files through an authorized index, classifying ownership and lifecycle, keeping Agent workspaces and artifacts in defined locations, reviewing or planning bounded changes, or calling authorized services through a vault-backed adapter without exposing plaintext credentials. It governs the whole machine at the rules and index level, not as an unconditional background auto-organizer.
license: AGPL-3.0-only
compatibility: Works with Agent Skills-compatible systems; platform-specific operations require a matching profile and an authorized filesystem or remote-management tool.
metadata:
  version: "0.4.0"
---

# Computer File Governance

Use this Skill as the Agent entry point to a broader whole-machine governance framework. The primary objective is to make files, workspaces, artifacts, and shareable metadata on one computer follow one set of rules and one searchable index, so people and multiple Agents can find and hand off the same information. The framework also defines workspace/artifact boundaries and optional vault-backed non-plaintext service calls. Moving or deleting items is only a bounded action, never the definition of success. Read [the architecture boundary](docs/architecture.md) and [the artifact lifecycle](docs/artifact-lifecycle.md) before treating any executor as a required path.

## First-use setup

When the user first provides this Skill's path or repository URL to this Agent, treat that user-designated repository as the sole canonical source. Read its full `SKILL.md` and linked references, then register only a stable pointer in a verified shared auto-loaded instruction entry if this Agent actually reads it; otherwise use this Agent's own auto-loaded global instructions. Do not copy/vendor the Skill or its references into an Agent-private skills/plugins/prompts directory. If a native loader requires such a directory, use only a verified pointer/stub or supported link to the canonical source; if it cannot load that source, explain the limitation rather than creating a duplicate. This onboarding applies only to the current Agent; do not configure other Agents unless the user separately asks. Follow [the persistent Agent onboarding procedure](docs/agent-onboarding.md) and verify the next reload/new-session path.

## Required workflow for governed file work

1. **Set scope.** Identify the exact authorized machine, roots, owner, purpose, privacy boundary, and allowed operation types. Do not infer authority from a path merely existing. For Windows, resolve the current account and Known Folder targets. For a server, confirm the host identity and remote authorization before accessing it.
2. **Inventory proportionally.** Start with bounded metadata such as name, kind, size, timestamps, owner, and link/mount status. Do not read file bodies, recurse through links, or scan outside the declared roots unless that is necessary and authorized. Record inventory limits and unknowns.

For a Downloads root, any inventory or search of the whole root—including a shallow direct-child listing—is restricted to the locally designated privacy-steward Agent operating on a model channel explicitly trusted by the machine's private policy, and only when the current task authorizes the whole-root scope. Recursive inventory must still have explicit bounds. Other Agents and non-trusted channels must not enumerate, search, glob, or recursively scan the root; they may inspect or operate only within an exact file path or concrete child-folder subtree supplied by the task, without enumerating or searching the root, parent, siblings, or undisclosed paths. Supplying the Downloads root alone does not authorize them to inventory it. A path alone does not authorize reading or sending file contents; any separately authorized content handling must still follow the data's privacy classification and current task scope.
3. **Classify on separate axes.** For each item or directory, track its owner, purpose/role, privacy, lifecycle, confidence, and evidence. Do not collapse “old”, “duplicate”, “large”, “temporary”, and “unneeded” into one judgment. Use `UNRESOLVED_HOLD` when purpose or ownership is uncertain.
4. **Map canonical locations.** Define one authoritative reference for each governed role, while retaining legitimate replicas, backups, versioned outputs, and application-managed state where required. Apply [the naming and classification criteria](docs/naming-and-classification.md) and [the authority, freshness, and lifecycle rules](docs/index-freshness-and-authority.md). Keep machine-specific indexes and path maps local and appropriately restricted; never publish them.
5. **Plan before changing.** Produce a dry-run plan listing source and destination references, operation, expected bytes, collision checks, verification method, rollback, and any approval required. Do not overwrite an existing target. Do not silently change application, VM, service, or system-managed paths.
6. **Execute in bounded transactions.** Use the host's approved file-management interface. Preserve source data until destination verification succeeds. For cross-device moves, copy and verify first, then treat source removal as a separate authorized step. Permanent deletion is opt-in and requires an explicit scope and recovery assessment.
7. **Verify and reconcile.** Confirm the actual post-state, content hash when appropriate, metadata needed by the owner, application references, and index update. Record partial or unknown outcomes honestly; do not report success based only on a command's exit code.
8. **Report and retain evidence.** Summarize what changed, what stayed on hold, verification results, canonical references, and rollback location. Store transaction manifests beside the private machine/project records, not in this public repository.

## Index, workspace, and artifact workflow

When the task is lookup, handoff, or production rather than file relocation:

1. Select the registered project/task workspace and its logical temporary, working, deliverables, evidence, rollback, cache, and private-index slots. Do not write task output to the repository root or an arbitrary system temporary folder.
2. Query only an authorized local manifest or index. Treat its snapshot time, covered roots, skipped items, and freshness status as part of the result; stale indexes are not live filesystem truth.
3. Label each created file as temporary, intermediate, deliverable, evidence, rollback, cache, private_index, or manifest, then record its owner, role, privacy, lifecycle, and retention condition.
4. Keep intermediate files out of deliverables, keep evidence out of source trees, keep rollback material out of public Git, and keep private indexes/manifests in the host's restricted location.
5. On handoff, report workspace, artifact category, status, evidence reference, unresolved holds, and next step. Done requires the deliverable location and verification evidence to be findable.

File changes are a separate optional path. Use the bounded transaction workflow only when the current task authorizes a concrete change; indexing, workspace placement, and artifact reporting do not imply permission to move or delete files.

## Safety defaults

- Unknown owner, unclear purpose, active work, application-owned data, credentials, databases, VM images, and mounted/server-managed data remain untouched until their boundary is established.
- No overwrite, link-following, broad recursive scan, service stop/start, or permanent deletion by default. Follow current textual authorization and documented platform constraints; do not add a per-item or per-batch UI approval gate when it merely repeats explicit authorization.
- A user may delegate routine classification without approving each item. Still pause for ambiguous authority, privacy exposure, irreversible effects, external impact, or an operation that exceeds the stated scope.
- Keep secret values out of model context, public indexes, logs, examples, and manifests. Use opaque local references where possible.
- A user-authorized Agent may use a local vault-backed credential adapter regardless of model-provider channel. This is provider-side confidentiality, not an agent-trust gate: keep the credential out of provider-visible prompts, tool arguments/results, files, and logs; let the local adapter use it for the intended target request. Do not ask the Agent to resolve or print the credential.
- Tool requests and returned data remain visible to the model provider. Hide the credential value, not the fact or content of the operation; apply the relevant privacy classification to all other data.
- A vault-backed adapter is a host capability, not created by this document. It should accept only non-secret request parameters and an opaque credential reference, enforce a target and operation allowlist, redact credential material from results and logs, return stable non-secret error/status data, and leave rotation/revocation and audit ownership explicit. If no verified adapter is configured, report the capability as specified but not deployed.
- A schema-valid index or transaction manifest is data-shape validation, not proof of path containment, link/mount safety, collision-free targets, authorization, or successful rollback; runtime adapters must verify those against the actual filesystem.
- If the operating system or external service itself requires an authorization step that cannot be represented by the current text instruction, stop at that boundary; do not replace it with a lower-level method to bypass the platform requirement. Tool-generated duplicate confirmation dialogs are not an independent authorization rule.

## References

Read [the maturity criteria](docs/maturity-criteria.md), [the stepwise implementation plan](docs/implementation-plan.md), and [the governance model](docs/governance-model.md) first, then the relevant platform profile: [Windows](profiles/windows.md), [Linux server](profiles/linux-server.md), or [Downloads](scenarios/downloads.md). When using local credentials, follow [non-plaintext credential use](docs/credential-use.md). The [schemas](schemas/) describe portable record shapes, not a requirement to upload local records. Schema $id values are versioned; incompatible changes require a new identifier and a migration note.
