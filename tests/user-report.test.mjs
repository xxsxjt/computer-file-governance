import assert from "node:assert/strict";
import test from "node:test";
import { describeError, humanizePathForReport, summarizeResult } from "../lib/user-report.mjs";

test("error codes map to readable cause and next step", () => {
  const error = describeError("CFG_E_STALE_INDEX");
  assert.equal(error.title, "索引已过时");
  assert.match(error.next, /重建索引/);
  assert.match(describeError("CFG_E_UNKNOWN_CODE").title, /未知错误/);
});

test("result summary stays readable and preserves unknown-state caution", () => {
  const summary = summarizeResult({ ok: false, status: "outcome_unknown", reason: "partial reason", applied: [{}, {}] });
  assert.equal(summary.status, "outcome_unknown");
  assert.match(summary.text, /applied=2/);
  assert.match(summary.text, /核对真实文件系统/);
  assert.ok(summary.lines.length >= 4);
});

test("path report truncation does not expose full long paths", () => {
  const value = "/fixture/" + "x".repeat(300);
  const shown = humanizePathForReport(value, { maxLength: 40 });
  assert.ok(shown.length <= 40);
  assert.ok(shown.endsWith("..."));
});
