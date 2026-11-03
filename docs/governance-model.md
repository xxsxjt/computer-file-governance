# 治理模型

## 目的

治理对象是文件系统中的数据及其用途、责任和生命周期，不是目录外观本身。分类需解释“是什么、谁负责、为何保留、处于什么状态、何时可以变更”，并让授权 Agent 能据此定位权威项和恢复证据。

## 分类轴

每个索引记录分别描述以下属性；不能用一个目录名替代全部属性。

| 轴 | 建议值 | 含义 |
| --- | --- | --- |
| owner | personal, system, application, project, team, external, unknown | 谁对内容或运行状态负责 |
| role | source, active_work, reference, generated, application_state, cache, archive, inbox, temporary, backup, unknown | 文件在工作流中的作用 |
| privacy | public, internal, restricted, secret, unknown | 可读取、共享和发布的边界；secret 只存受控引用，不存明文 |
| lifecycle | active, working, reference, archive, rebuildable, hold, retired, unknown | 是否仍在用以及恢复条件 |
| confidence | high, medium, low | 分类结论的可信度 |

分类须附有限、可审计的证据来源，例如目录上下文、版本控制状态、格式/元数据或用户说明。文件名、大小、修改时间和哈希都只能作为证据之一，不能单独证明用途或可删除性。

## 目录与索引

- 物理路径随操作系统和机器变化；以逻辑角色及受限的路径映射表描述规范位置。
- 每个治理范围指定本地索引的唯一事实源和负责人；公开 Git 仓库仅存通用规则与 schema。
- 索引中的 canonical reference 指向权威工作位置；允许经说明的副本、备份、镜像和归档，不要求把所有字节强行集中到一个目录。
- 路径映射、个人目录清单、服务器拓扑及真实 manifest 属于机器本地数据，应按 privacy 分类保存。
- 应用托管目录、数据库、包管理器内容、容器卷和系统目录要识别其 owner 与生命周期，不能只凭路径名自行移动。

## 状态模型与词典映射

本规范区分两个正交维度的状态，避免将资产长期演进阶段与单次变更事务混淆：

1. **治理对象推进阶段（Lifecycle & Onboarding Phases）**：用于跟踪目录、项目或资产从发现到纳管的过程：
   `DISCOVERED → CLASSIFIED → PREFLIGHTED → STAGED → VERIFIED → INDEXED → ACTIVE | ARCHIVED`
   当用途、所有权或边界未明确时保持 `UNRESOLVED_HOLD`。宿主工作区可在此基础上细化状态词（例如将 `ACTIVE` 细分为 `ACTIVE_CANONICAL`、`KEEP_IN_PLACE`、`ROLLBACK_RETAINED`），只须在宿主标准中保持明确映射。
2. **变更事务执行状态（Transaction Manifest Status）**：用于记录单次有界变更批次的执行与核验结果，对应 `schemas/transaction-manifest.schema.json`：
   - 顶层 `status`：`planned`、`staged`、`applied`、`verified`、`rolled_back`、`outcome_unknown`、`failed`。
   - 条目 `items[].result`：`pending`、`applied`、`verified`、`held`、`rolled_back`、`failed`、`unknown`。
   当操作已发起但真实结果尚未确认时，必须标记为 `OUTCOME_UNKNOWN`（Schema 中对应 `"outcome_unknown"`），先核对文件系统真实后置状态，再决定恢复或重试；不得盲目重复可能有副作用的命令。

事务至少关联稳定 ID、操作者/批准范围、时间、操作类型、源/目标本地引用、碰撞检查、预期及实际结果、校验方法、状态和回滚说明。涉及内容完整性时记录算法与摘要；摘要不代替权限与语义检查。

## 宿主二元隐私边界映射

本模型的 `privacy` 轴采用 5 级细粒度分类（`public`、`internal`、`restricted`、`secret`、`unknown`）。当宿主环境采用二元隐私边界（仅区分 `PUBLIC` 与 `PRIVATE_RESTRICTED`）时，适配器须按以下保守规则映射：

| 通用治理 `privacy` | 宿主二元分类 | 处理与存放要求 |
| --- | --- | --- |
| `public` | `PUBLIC` | 仅限已脱敏、不含机器真实路径/账户/清单/凭据的通用规范、schema、合成示例与公开代码 |
| `internal` | `PRIVATE_RESTRICTED`（或宿主受控内部区） | 本机路径映射、运行日志、回滚证据、工程内部状态；不得推入公开仓库 |
| `restricted` | `PRIVATE_RESTRICTED` | 个人数据、完整目录清单、会话历史、真实 transaction manifest；按当次任务授权访问 |
| `secret` | `PRIVATE_RESTRICTED`（凭据保险库） | 仅存受控 opaque 引用，由本机 vault-backed adapter 解析，明文绝不进入模型上下文或日志 |
| `unknown` | `PRIVATE_RESTRICTED` + `UNRESOLVED_HOLD` | 未完成分类前默认按受限边界保护，不读取正文、不外发 |

## 执行原则

1. 先只读了解范围；按风险逐步扩展深度，默认不读取正文、不跟随符号链接/重解析点、不跨越挂载边界。
2. 计划必须先检查目标是否存在、是否属应用管理、目标权限/空间、跨设备语义、保留策略及可恢复性。
3. 不覆盖目标。复制到新目标后先验证，再更新引用；跨设备搬迁保留原件，直到源清理获得单独授权。
4. 变更使用有界批次，执行前保留足以恢复的状态或原件；失败时停止并报告，不继续扩大影响。
5. 验证文件状态、必要元数据、相关应用引用和索引；验证失败时标记事务状态并按预案恢复。
6. 永久删除默认禁用。仅在明确授权、确认所有者与保留要求、确认可恢复方案后才纳入计划。

## Schema 与执行边界

JSON Schema 校验记录结构、枚举、格式、摘要长度、跨字段状态不变量（如搬迁/复制操作必填 `destination_ref`、`verified` 状态必须具备 `passed` 校验结果），并拒绝引用中显式的 `..` 路径段、URL 编码的 `%2e%2e`、控制字符与纯空白字符串。但它不能证明引用解析后位于授权根目录，也不能解析 symlink/junction/reparse point、识别挂载边界或确认目标不存在。执行适配器（可参考本仓库 `lib/governance-validator.mjs`）必须使用目标主机的路径语义做规范化和根目录包含检查，按策略检查链接/挂载及目标冲突，并在执行前失败关闭。通过 Schema 校验不等于获得操作授权，也不等于文件操作或回滚已成功。

合成夹具覆盖 link/mount 保持 hold、目标冲突时不执行、失败、回滚和结果未知等记录形态；它们只测试数据契约，不触碰真实文件系统。

## 发布边界

公开内容可包含通用流程、脱敏示例、schema 和适配说明。真实路径、用户名、IP/主机名、账户、资产清单、运行日志、凭据和私有 manifest 不得进入 issue、commit、测试夹具或发布包。
