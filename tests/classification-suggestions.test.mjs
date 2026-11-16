import assert from "node:assert/strict";
import test from "node:test";
import { suggestClassification } from "../lib/classification-suggestions.mjs";

test("classification suggestions are dry-run only and flag low-confidence unknowns", () => {
  const result = suggestClassification({ name: "mystery", parentHints: ["misc"], versionControlled: false });
  assert.equal(result.action, "DRY_RUN_SUGGESTION_ONLY");
  assert.equal(result.appliesMutation, false);
  assert.equal(result.suggested.role, "unknown");
  assert.equal(result.suggested.privacy, "unknown");
  assert.equal(result.suggested.lifecycle, "unknown");
  assert.equal(result.preserve.unknown, true);
});

test("secret-like names force hold without mutating an existing record", () => {
  const result = suggestClassification({ name: "api-token.txt", directoryContext: "config", existingRecord: { lifecycle: "active" } });
  assert.equal(result.suggested.privacy, "secret");
  assert.equal(result.suggested.lifecycle, "hold");
  assert.equal(result.preserve.hold, true);
  assert.equal(result.preserve.existingLifecycle, "active");
  assert.equal(result.appliesMutation, false);
});

test("context contributes evidence but cannot override an explicit hold", () => {
  const result = suggestClassification({ name: "spec.md", parentHints: ["docs"], existingRecord: { lifecycle: "hold" } });
  assert.equal(result.suggested.role, "reference");
  assert.equal(result.suggested.lifecycle, "hold");
  assert.ok(result.evidence.includes("directory_context"));
});
