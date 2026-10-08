import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemas = [
  ["index-record.schema.json", ["record_id", "item_ref", "item_kind", "owner", "role", "privacy", "lifecycle", "confidence", "updated_at"]],
  ["transaction-manifest.schema.json", ["transaction_id", "created_at", "status", "operation", "approval", "items", "verification", "rollback"]],
];

for (const [file, required] of schemas) {
  test(`${file} parses and exposes the required contract fields`, async () => {
    const schema = JSON.parse(await readFile(new URL(`../schemas/${file}`, import.meta.url), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.deepEqual(schema.required, required);
    for (const field of required) assert.ok(schema.properties[field], `missing property: ${field}`);
  });
}
