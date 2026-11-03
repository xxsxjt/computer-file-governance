# 交接文档 — computer-file-governance

最后更新：2026-10-19 ｜ 维护者：pi-workspace 分支

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
├── schemas/          transaction-manifest.schema.json
├── adapters/
├── node_modules/
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

## 状态机

`DISCOVERED → CLASSIFIED → PREFLIGHTED → STAGED → VERIFIED → INDEXED → ACTIVE | ARCHIVED`
另有 `UNRESOLVED_HOLD`、`OUTCOME_UNKNOWN`

> ⚠️ 这与 `D:/AGENT/CORE/WORKSPACE-INDEX.md` 的**十态状态机不兼容**
> （INDEX 有 `COPY_VERIFIED_SOURCE_RETAINED`，没有 `ARCHIVED`）。
> 两套都自称权威，**进会话头时选哪套没有记录**。这是一个待解决的不一致。

## 当前状态

| 项 | 值 |
|---|---|
| HEAD | `b102e21` Clarify canonical Skill onboarding（2026-10-08）|
| dirty | **12 项** |
| 分支 | main |

**12 项未提交包含**：Downloads 全根门禁、`schema-valid ≠ proof`、更严的指纹 schema、`downloads-scope.test.mjs`、`agent-onboarding.test.mjs`，以及未跟踪的 `docs/supervisor-orchestration-design.md`。

**这意味着**：`C:/Users/xxsx/AGENTS.md` 的指针指向文件系统路径，所以**生效版本是工作树**；但"被审阅并发布的标准"是 git HEAD 的 0.2.0 版本。**两者不一致。**

## 已知问题

1. **工作树领先 git HEAD 8 个文件** —— 提交与否无记录
2. **Downloads 全根门禁只在工作树里**，git HEAD 里没有
3. **两套状态机不兼容**（见上）
4. **`node_modules` 已提交进仓库**（应检查是否该 gitignore）

## 迁移历史

2026-10-19 之前位置未变。本次整理只做了只读检查，**没有改动任何文件**。

## 开工前必读

1. 这是**规范文档**，改它会影响所有 agent 的行为
2. 改之前先确认工作树与 git HEAD 的差异是有意的还是未提交的意外
3. **不要把它复制到任何 agent 私有 skills 目录**（README 明确禁止）
