import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import test from "node:test";

const schemaRoot = new URL("../schemas/", import.meta.url);
const fixtureRoot = new URL("./fixtures/", import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const schemas = {
  index: await readJson(new URL("index-record.schema.json", schemaRoot)),
  transaction: await readJson(new URL("transaction-manifest.schema.json", schemaRoot)),
};
const validators = {
  index: ajv.compile(schemas.index),
  transaction: ajv.compile(schemas.transaction),
};

const validFixtures = [
  ["index", "index-record-file.valid.json"],
  ["index", "index-record-link-hold.valid.json"],
  ["index", "index-record-mount-hold.valid.json"],
  ["transaction", "transaction-manifest-planned.valid.json"],
  ["transaction", "transaction-manifest-target-conflict-held.valid.json"],
  ["transaction", "transaction-manifest-failed.valid.json"],
  ["transaction", "transaction-manifest-rolled-back.valid.json"],
  ["transaction", "transaction-manifest-outcome-unknown.valid.json"],
];

const invalidFixtures = [
  ["index", "index-record-parent-traversal.invalid.json"],
  ["transaction", "transaction-manifest-parent-traversal.invalid.json"],
];

test("Draft 2020-12 governance schemas compile with date-time format validation", () => {
  assert.equal(schemas.index.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schemas.transaction.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(typeof validators.index, "function");
  assert.equal(typeof validators.transaction, "function");
});

for (const [kind, file] of validFixtures) {
  test(`${file} satisfies its schema`, async () => {
    const fixture = await readJson(new URL(file, fixtureRoot));
    assert.equal(validators[kind](fixture), true, JSON.stringify(validators[kind].errors));
  });
}

for (const [kind, file] of invalidFixtures) {
  test(`${file} rejects a literal parent-directory segment`, async () => {
    const fixture = await readJson(new URL(file, fixtureRoot));
    assert.equal(validators[kind](fixture), false);
  });
}

test("schemas reject malformed dates, invalid digests, and unknown fields", async () => {
  const indexFixture = await readJson(new URL("index-record-file.valid.json", fixtureRoot));
  const transactionFixture = await readJson(new URL("transaction-manifest-planned.valid.json", fixtureRoot));

  const badIndexDate = structuredClone(indexFixture);
  badIndexDate.updated_at = "not-a-date";
  assert.equal(validators.index(badIndexDate), false);

  const badIndexDigest = structuredClone(indexFixture);
  badIndexDigest.content_fingerprint.digest = "not-a-digest";
  assert.equal(validators.index(badIndexDigest), false);

  const shortSha256 = structuredClone(indexFixture);
  shortSha256.content_fingerprint.digest = "a".repeat(63);
  assert.equal(validators.index(shortSha256), false);

  const longSha256 = structuredClone(indexFixture);
  longSha256.content_fingerprint.digest = "a".repeat(128);
  assert.equal(validators.index(longSha256), false);

  const validSha512 = structuredClone(indexFixture);
  validSha512.content_fingerprint = { algorithm: "sha512", digest: "a".repeat(128) };
  assert.equal(validators.index(validSha512), true);

  const shortSha512 = structuredClone(indexFixture);
  shortSha512.content_fingerprint = { algorithm: "sha512", digest: "a".repeat(64) };
  assert.equal(validators.index(shortSha512), false);

  const extraIndexField = { ...indexFixture, machine_secret: "synthetic-only" };
  assert.equal(validators.index(extraIndexField), false);

  const badTransactionDate = structuredClone(transactionFixture);
  badTransactionDate.created_at = "not-a-date";
  assert.equal(validators.transaction(badTransactionDate), false);

  const badTransactionDigest = structuredClone(transactionFixture);
  badTransactionDigest.items[0].source_sha256 = "short";
  assert.equal(validators.transaction(badTransactionDigest), false);

  const extraTransactionField = { ...transactionFixture, unreviewed: true };
  assert.equal(validators.transaction(extraTransactionField), false);
});

test("boundary and conflict fixtures record non-execution rather than claiming runtime enforcement", async () => {
  const link = await readJson(new URL("index-record-link-hold.valid.json", fixtureRoot));
  const mount = await readJson(new URL("index-record-mount-hold.valid.json", fixtureRoot));
  const conflict = await readJson(new URL("transaction-manifest-target-conflict-held.valid.json", fixtureRoot));

  assert.equal(link.item_kind, "link");
  assert.equal(link.lifecycle, "hold");
  assert.equal(mount.item_kind, "mount");
  assert.equal(mount.lifecycle, "hold");
  assert.equal(conflict.status, "planned");
  assert.ok(conflict.items.every((item) => item.result === "held" || item.result === "pending"));
});
