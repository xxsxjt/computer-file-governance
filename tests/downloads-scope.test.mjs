import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("Downloads root inventory is limited to the trusted local steward and authorized tasks", async () => {
  const [skill, downloads] = await Promise.all([
    read("SKILL.md"),
    read("scenarios/downloads.md"),
  ]);

  assert.match(skill, /locally designated privacy-steward Agent/);
  assert.match(skill, /model channel explicitly trusted by the machine's private policy/);
  assert.match(skill, /current task authorizes the whole-root scope/);
  assert.match(skill, /Other Agents and non-trusted channels must not enumerate/);
  assert.match(skill, /exact file path or concrete child-folder subtree supplied by the task/);
  assert.match(skill, /Supplying the Downloads root alone does not authorize/);
  assert.match(skill, /does not authorize reading or sending file contents/);

  assert.match(downloads, /包括只列直属项的浅层预览/);
  assert.match(downloads, /本机明确指定的隐私主管 Agent/);
  assert.match(downloads, /本机私有信任策略明确标记为可信/);
  assert.match(downloads, /其他 Agent.*不得枚举/);
  assert.match(downloads, /具体文件路径或根目录下明确子文件夹范围/);
  assert.match(downloads, /只提供 Downloads 根路径本身，不授权/);
  assert.match(downloads, /不要求每批单独 UI\/RPC 确认/);
  assert.doesNotMatch(downloads, /移动需经当前工具要求的 UI\/RPC 确认/);
});
