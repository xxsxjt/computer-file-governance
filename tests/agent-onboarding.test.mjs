import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("first-use onboarding is single-source and scoped to the current agent", async () => {
  const [skill, onboarding] = await Promise.all([
    read("SKILL.md"),
    read("docs/agent-onboarding.md"),
  ]);
  assert.match(skill, /sole canonical source/);
  assert.match(skill, /Do not copy\/vendor/);
  assert.match(onboarding, /限定当前任务范围/);
  assert.match(onboarding, /只登记指针/);
  assert.match(onboarding, /不要把 Skill 正文.*复制\/vendor/);
  assert.match(onboarding, /后续更新/);
  assert.match(onboarding, /不进行逐个复制同步/);
});

test("agent adapters do not prescribe private full-copy installation", async () => {
  const adapters = await read("adapters/README.md");
  assert.match(adapters, /唯一规范源/);
  assert.match(adapters, /不把整个仓库安装成 Agent 私有副本/);
  assert.match(adapters, /默认只接入当前 Agent/);
});
