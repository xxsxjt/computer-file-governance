import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import test from "node:test";
import { validateTaskHandoff } from "../lib/governance-validator.mjs";

const schema = JSON.parse(await readFile(new URL("../schemas/task-handoff.schema.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("./fixtures/task-handoff-completed.valid.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

test("task handoff schema compiles as Draft 2020-12 with a versioned contract id", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.match(schema.$id, /task-handoff-v1\.json$/);
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  assert.deepEqual(validateTaskHandoff(fixture), { valid: true, errors: [] });
});

test("completed handoffs require a verified deliverable and verification evidence", () => {
  const noDeliverable = structuredClone(fixture);
  noDeliverable.artifacts = noDeliverable.artifacts.filter((item) => item.artifact_kind !== "deliverable");
  assert.equal(validate(noDeliverable), false);

  const noVerifiedEvidence = structuredClone(fixture);
  noVerifiedEvidence.artifacts.find((item) => item.artifact_kind === "evidence").state = "created";
  assert.equal(validate(noVerifiedEvidence), false);

  const blockedHold = structuredClone(fixture);
  blockedHold.unresolved_holds.push({
    hold_ref: "artifact:A-HOLD-001",
    reason_code: "privacy_unconfirmed",
    blocking: true,
    next_action: "confirm_privacy",
  });
  assert.equal(validate(blockedHold), false);

  const unrelatedEvidence = structuredClone(fixture);
  unrelatedEvidence.completion.evidence_ref = "artifact:A-INT-001";
  assert.equal(validate(unrelatedEvidence), true, "schema keeps reference resolution host-side; the handoff test below checks the explicit evidence relation");
  assert.equal(validateTaskHandoff(unrelatedEvidence).valid, false);

  const missingEvidenceRelation = structuredClone(fixture);
  delete missingEvidenceRelation.artifacts.find((item) => item.artifact_kind === "evidence").verifies;
  assert.equal(validate(missingEvidenceRelation), false);

  const missingRollbackDisposition = structuredClone(fixture);
  delete missingRollbackDisposition.completion.rollback_disposition;
  assert.equal(validate(missingRollbackDisposition), false);
});

test("artifact kinds map to their logical slots and conservative privacy classes", () => {
  const wrongSlot = structuredClone(fixture);
  wrongSlot.artifacts.find((item) => item.artifact_kind === "evidence").slot = "deliverables";
  assert.equal(validate(wrongSlot), false);

  const publicManifest = structuredClone(fixture);
  publicManifest.artifacts.find((item) => item.artifact_kind === "manifest").privacy = "public";
  assert.equal(validate(publicManifest), false);

  const tempWithoutReview = structuredClone(fixture);
  delete tempWithoutReview.artifacts.find((item) => item.artifact_kind === "temporary").retention.review_after;
  assert.equal(validate(tempWithoutReview), false);

  const nonRebuildableCache = structuredClone(fixture);
  nonRebuildableCache.artifacts.push({
    artifact_ref: "artifact:A-CACHE-001",
    artifact_kind: "cache",
    slot: "cache",
    owner: "project",
    privacy: "internal",
    lifecycle: "rebuildable",
    state: "created",
    created_by: "actor:agent",
    purpose: "Synthetic rebuildable cache",
    role: "cache",
    confidence: "high",
    created_at: "2026-11-18T19:50:00Z",
    retention: { condition: "rebuildable" },
    rebuild_from: ["source:S-001"],
  });
  assert.equal(validate(nonRebuildableCache), false);

  const validCache = structuredClone(nonRebuildableCache);
  Object.assign(validCache.artifacts.at(-1), {
    rebuild_method: "synthetic rebuild",
    rebuild_tool: "synthetic-tool",
    rebuild_tool_version: "1.0.0",
  });
  assert.equal(validate(validCache), true);
});

test("handoff references are opaque and unknown fields are rejected", () => {
  const rawPath = structuredClone(fixture);
  rawPath.workspace_ref = "workspace:" + ["C:", "Users", "person", "project"].join("/");
  assert.equal(validate(rawPath), false);

  const traversal = structuredClone(fixture);
  traversal.artifacts[1].source_refs = ["source:../outside"];
  assert.equal(validate(traversal), false);

  const secretField = structuredClone(fixture);
  secretField.credential_value = "synthetic-never-a-real-secret";
  assert.equal(validate(secretField), false);

  const duplicateRef = structuredClone(fixture);
  duplicateRef.artifacts[1].source_refs = ["source:S-001", "source:S-001"];
  assert.equal(validate(duplicateRef), false);

  const duplicateArtifactRef = structuredClone(fixture);
  const duplicateArtifact = structuredClone(duplicateArtifactRef.artifacts[0]);
  duplicateArtifact.purpose = "Synthetic duplicate reference with different metadata";
  duplicateArtifactRef.artifacts.push(duplicateArtifact);
  assert.equal(validate(duplicateArtifactRef), true);
  assert.equal(validateTaskHandoff(duplicateArtifactRef).valid, false);

  const plannedArtifact = structuredClone(fixture.artifacts[0]);
  plannedArtifact.state = "planned";
  delete plannedArtifact.created_at;
  plannedArtifact.planned_at = "2026-11-18T20:00:00Z";
  const inProgress = structuredClone(fixture);
  inProgress.status = "in_progress";
  inProgress.next_step = "continue";
  inProgress.artifacts = [plannedArtifact];
  delete inProgress.completion;
  assert.equal(validate(inProgress), true);
  assert.equal(validateTaskHandoff(inProgress).valid, true);

  const emptyPlan = {
    handoff_ref: "handoff:H-EMPTY",
    workspace_ref: "workspace:W-001",
    task_ref: "task:T-EMPTY",
    status: "planned",
    updated_at: "2026-11-18T20:00:00Z",
    next_step: "continue",
    artifacts: [],
    unresolved_holds: [],
  };
  assert.equal(validate(emptyPlan), true);
  assert.deepEqual(validateTaskHandoff(emptyPlan), { valid: true, errors: [] });
});
