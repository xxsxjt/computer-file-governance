import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const readText = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));

async function collectMarkdown(relativeDir) {
  const entries = await readdir(path.join(repoRoot, relativeDir), { withFileTypes: true });
  const files = [];
  const excluded = new Set([".git", "node_modules", "private", "coverage"]);
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const relativePath = relativeDir === "." ? entry.name : relativeDir + "/" + entry.name;
    if (entry.isDirectory()) files.push(...await collectMarkdown(relativePath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(relativePath);
  }
  return files;
}

test("package, lockfile, and skill metadata versions agree", async () => {
  const pkg = await readJson("package.json");
  const lock = await readJson("package-lock.json");
  const skill = await readText("SKILL.md");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.ok(skill.includes('version: "' + pkg.version + '"'), "SKILL metadata version must equal package.json version");
});

test("schemas publish stable and distinct contract ids", async () => {
  const index = await readJson("schemas/index-record.schema.json");
  const transaction = await readJson("schemas/transaction-manifest.schema.json");
  assert.match(index.$id, /^https:\/\//);
  assert.match(transaction.$id, /^https:\/\//);
  assert.notEqual(index.$id, transaction.$id);
  assert.match(index.$id, /index-record-v1\.json$/);
  assert.match(transaction.$id, /transaction-manifest-v1\.json$/);
});

test("maturity criteria define product boundary, users, metrics, and gates", async () => {
  const criteria = await readText("docs/maturity-criteria.md");
  const plan = await readText("docs/implementation-plan.md");
  const architecture = await readText("docs/architecture.md");
  const artifacts = await readText("docs/artifact-lifecycle.md");
  const credentialUse = await readText("docs/credential-use.md");
  const readme = await readText("README.md");
  const requiredCriteria = ["产品定义", "非目标", "普通用户", "专业用户", "开发者", "企业", "多 Agent", "可验收指标", "M0", "M1", "M2", "M3"];
  for (const phrase of requiredCriteria) assert.ok(criteria.includes(phrase), "missing criteria phrase: " + phrase);
  assert.match(criteria, /p95/);
  assert.match(criteria, /outcome_unknown/);
  for (const prefix of ["P0-", "P1-", "P2-", "P3-"]) assert.ok(plan.includes(prefix), "missing plan prefix: " + prefix);
  assert.ok(plan.includes("一步一验收"));
  for (const phrase of ["四层架构", "规范合同", "宿主适配器", "不是全机自动整理器"]) {
    assert.ok(architecture.includes(phrase) || readme.includes(phrase), "missing positioning phrase: " + phrase);
  }
  for (const phrase of ["temporary", "intermediate", "deliverable", "evidence", "rollback", "private_index"]) {
    assert.ok(artifacts.includes(phrase), "missing artifact kind: " + phrase);
  }
  for (const phrase of ["opaque credential reference", "allowlist", "部署未验证"]) {
    assert.ok(credentialUse.includes(phrase), "missing credential boundary: " + phrase);
  }
  assert.ok(readme.includes("不只是一个 Agent Skill"));
});

test("public relative Markdown links resolve inside the repository", async () => {
  const linkPattern = /\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/g;
  const markdownFiles = await collectMarkdown(".");
  let checked = 0;
  for (const relativeFile of markdownFiles) {
    const content = await readText(relativeFile);
    for (const match of content.matchAll(linkPattern)) {
      const target = match[1];
      if (target.startsWith("http://") || target.startsWith("https://")) continue;
      const resolved = path.resolve(path.dirname(path.join(repoRoot, relativeFile)), decodeURIComponent(target));
      const relative = path.relative(repoRoot, resolved);
      assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "link escapes repository: " + relativeFile + " -> " + target);
      await stat(resolved);
      checked += 1;
    }
  }
  assert.ok(checked > 10, "expected a substantive document link graph");
});
