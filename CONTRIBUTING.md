# Contributing

## Canonical source

Edit files in this repository directly. Do not copy the Skill or its references into an Agent-private skills/plugins/prompts tree. Agent configuration should contain only a stable pointer to the canonical source.

## Privacy boundary

Do not commit real paths, usernames, hostnames, tokens, cookies, credentials, vault contents, local inventories, manifests, logs, session records, or transaction evidence. Use synthetic fixtures under `tests/fixtures/`. Files matching `*.local.*`, `HANDOFF.md`, `private/`, `local-inventory*/`, `local-manifests*/`, and `reports/private*/` are ignored and must remain untracked.

## Change workflow

1. State the exact contract or capability being changed.
2. Add or update a synthetic test that fails before the change and passes after it.
3. Use small, reviewable patches; do not overwrite whole files with shell redirects.
4. Run `npm test`, `npm pack --dry-run`, and `git status --short` before committing.
5. Update `CHANGELOG.md` for user-visible framework changes.

## Commit expectations

Keep commits focused. Stage files explicitly; never run `git add -A`. Never push, rewrite history, delete history, or change shared CORE indexes unless the user explicitly authorizes that exact action.
