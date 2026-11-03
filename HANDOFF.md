# 交接文档 — computer-file-governance

最后更新：2026-11-02 ｜ 维护者：pi-workspace 分支

## 一句话

**文件治理的规范作业规程**。`C:/Users/xxsx/AGENTS.md` 指定它是 inventory / classification / relocation / cleanup 的 canonical procedure。

## 路径

```
D:\Users\du_ji\pi_workspace\computer-file-governance
```

Orca 项目 id：`github:xxsxjt/computer-file-governance`

## 结构

```
computer-file-governance/
├── SKILL.md          主规程（八步法）
├── README.md
├── docs/             governance-model.md 等
├── profiles/         windows.md 等平台画像
├── scenarios/        downloads.md 等场景
├── schemas/          index-record / transaction-manifest 的 JSON Schema
├── tests/            node --test：schema 契约、onboarding、Downloads 范围（16 项）
├── adapters/
├── node_modules/     已 gitignore，未入库
└── package.json
```

## 八步法（SKILL.md）

1. 设定范围
2. 有界元数据盘点
3. 分轴分类
4. 建立权威位置
5. 变更前出 dry-run
6. 有界事务执行
7. 验证并核对
8. 报告并留存证据

## 关键规则

- **`Do not infer authority from a path merely existing.`**
- **dry-run 必须列出**：源/目标引用、操作、预期字节、冲突检查、验证方法、回滚、所需批准
- **`Do not overwrite an existing target.`**
- **跨设备移动**：先复制并验证，源删除是**单独的授权步骤**
- **`do not report success based only on a command's exit code.`**
- **分类可委派，但以下必须停下来问**：权限不明、隐私暴露、不可逆、外部影响、超出范围
- **`schema-valid ≠ proof`**：manifest 通过 schema 校验只证明数据形状，不证明路径包含、链接安全、目标无冲突、授权或回滚可用

## 状态词

本仓库**没有定义完整状态机**。`SKILL.md` 与 `docs/governance-model.md` 只使用两个状态词：

- `UNRESOLVED_HOLD` —— 用途或所有权不确定时使用（SKILL.md 第 3 步）
- `OUTCOME_UNKNOWN` —— 结果无法确认时如实记录（governance-model.md）

迁移流程的状态机由使用方自己的标准定义，本仓库不另立一套。例如全机迁移状态见
`D:/AGENT/CORE/WORKSPACE-INDEX.md` 第 4 节
（`DISCOVERED → CLASSIFIED → PREFLIGHTED → STAGED → VERIFIED → INDEXED → ACTIVE_CANONICAL`，
另有 `ROLLBACK_RETAINED`、`KEEP_IN_PLACE`、`UNRESOLVED_HOLD`、`OUTCOME_UNKNOWN`）。

> 更正（2026-11-02）：此前本文件曾写「本仓库有 8 态状态机，与 CORE 十态不兼容」。
> 核实 `SKILL.md` 与 `governance-model.md` 全文，**均无该 8 态定义**；那条记录是误写。
> 两者不构成冲突，只是本仓库不定义状态机、由使用方标准决定。

## 当前状态

| 项 | 值 |
|---|---|
| HEAD | `8fc2ab8` Downloads 根目录访问分级、schema 收紧与执行边界澄清（2026-11-02）|
| 远程 | 与 `origin/main` 一致（已推送）|
| dirty | 0 项 |
| 测试 | `npm test` 16/16 通过 |
| 分支 | main |

**工作树与 git HEAD 已一致**：此前积压的 12 项改动已于 2026-11-02 提交并推送，
包括 Downloads 全根门禁、`schema-valid ≠ proof`、更严的指纹 schema、
`downloads-scope.test.mjs`、8 个 schema 合成夹具，以及 `docs/supervisor-orchestration-design.md`。
`C:/Users/xxsx/AGENTS.md` 指向的文件系统路径现在与发布版本同源。

## 已知问题

1. ~~工作树领先 git HEAD 8 个文件~~ —— **已解决（2026-11-02）**，全部提交并推送
2. ~~Downloads 全根门禁只在工作树里~~ —— **已解决**，已进入 git HEAD 与远程
3. ~~两套状态机不兼容~~ —— 核实后**该问题不存在**：本仓库未定义状态机，见上方「状态词」
4. ~~`node_modules` 已提交进仓库~~ —— 核实：`git ls-files` 中 0 个 node_modules 文件，`.gitignore` 已含 `node_modules/`，**此条记录有误**

## 2026-11-02 提交内容

| 文件 | 改动 |
|---|---|
| `SKILL.md` | Downloads 整根盘点限于本机隐私主管 Agent + 可信渠道 + 任务授权；其他 Agent 只能操作任务给定的精确路径；移除重复式逐项 UI 确认要求；补充「schema 校验不等于授权/执行成功」 |
| `scenarios/downloads.md` | 新增「访问范围与信任」小节 |
| `docs/governance-model.md` | 新增「Schema 与执行边界」 |
| `schemas/index-record.schema.json` | `item_ref`/`canonical_ref` 拒绝字面 `..` 段；digest 按算法校验长度 |
| `schemas/transaction-manifest.schema.json` | 同上收紧 |
| `tests/downloads-scope.test.mjs` | 新增：Downloads 根盘点限于可信主管 |
| `tests/fixtures/` | 8 个合成夹具（含 parent-traversal 反例） |
| `tests/schema-contracts.test.mjs` | 扩展：ajv 编译、格式校验、未知字段拒绝 |
| `docs/supervisor-orchestration-design.md` | 主管层与 Orca 运行时分层草案（**本地草案，未作为稳定协议发布**） |
| `package.json` | 新增 devDependencies：ajv ^8.20.0、ajv-formats ^3.0.1 |

## 迁移历史

2026-10-19 之前位置未变。本次整理只做了只读检查，**没有改动任何文件**。

## 开工前必读

1. 这是**规范文档**，改它会影响所有 agent 的行为
2. 改之前先确认工作树与 git HEAD 的差异是有意的还是未提交的意外
3. **不要把它复制到任何 agent 私有 skills 目录**（README 明确禁止）
