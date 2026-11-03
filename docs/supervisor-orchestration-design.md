# 主管层与文件治理分层设计（草案）

状态：本地方案草案；未发布，未作为稳定协议。
日期：2026-10-12

## 目的

项目目标扩展为：除了提供跨 Agent 文件/目录治理规范，也支持 Pi 作为主管统筹任务、Agent、审批与结果。文件治理是主管可调用的领域能力之一，不等于所有工作都变成文件搬运。

本草案的架构前提是优先复用 Orca 已有运行时，而不是在本项目重写 worker 调度、终端、任务消息和进程生命周期。

## 三层职责

| 层 | 负责内容 | 事实源/边界 |
| --- | --- | --- |
| Pi 主管 | 接收用户目标；拆分任务；确认授权、scope、隐私和验收；选择任务流程；检查 worker 结果并向用户汇总 | 用户原始目标与明确限制优先；Pi 负责决策，不能把不确定意图转交给 worker 自行决定 |
| Orca 运行时 | 工作区/worktree、Run/Task/Dispatch、worker 终端、消息/问答、等待、状态与终端生命周期 | Orca ID 与任务/派发/liveness 状态以 Orca 回执和 execution host 为准；项目不得另造冲突的 scheduler 或伪造完成状态 |
| 治理领域与 adapter | 文件分类、权限/隐私策略、canonical reference、本地索引、事务计划、文件 postcondition 与回滚证据 | 通用政策/schema 在本项目；真实路径映射、库存和 transaction manifest 留在受限本地；实际文件结果由目标主机 adapter 验证 |

Orca 的 `worker_done` 只证明 Agent 报告了任务结果，不证明文件状态、应用引用或回滚条件已经通过。文件任务须另由治理 adapter 验证并记录 manifest。

## Authority crosswalk

| 对象 | 权威来源 | 禁止的替代推断 |
| --- | --- | --- |
| 用户目标、优先级、授权范围 | 用户指令；Pi 维护脱敏的决策/计划 | 从文件名、Agent prompt 或旧任务猜用户授权 |
| Run/Task/Dispatch ID、依赖、消息和交付 | Orca orchestration API/CLI | 再建一套重复任务 ID/状态机，或从终端是否有输出猜已完成 |
| worker Agent 身份与运行态 | Orca worker-start effective receipt、worker-list/show 与 execution host | 从请求参数推断启动成功；从 terminal title 猜 Agent 或模型 |
| 当前模型/provider | 实际运行时可观察状态 | 从 `--model` 请求值或技能文档猜测 |
| 文件角色/owner/privacy/lifecycle/canonical ref | 受限本地文件索引；公开仓库只定义通用模型 | 将真实目录清单、用户名、主机映射或私人 manifest 放进公开 Task/仓库 |
| 文件操作授权、结果和回滚 | 当前授权 + 主机 adapter 的真实 post-state + 私有事务 manifest | 以 worker 完成回执代替文件校验，或把 schema 合法当作路径安全 |

## 最小任务 envelope（讨论稿，不是稳定 Schema）

Orca Task spec 应自包含，并至少表达：

- `objective`：可验证的任务目标。
- `scope`：允许触及的项目/文件/服务边界；真实本地路径应使用受限 opaque reference，不出现在公共资料中。
- `allowed_operations`：允许的操作类型及明确禁止项。
- `execution_mode`：`read_only`、`plan_only` 或 `mutation`。
- `privacy_class`：需要处理的最高数据敏感级别及可用模型/Agent边界。
- `dependencies`：只记录真实先后依赖；Orca Task DAG 负责执行依赖。
- `approval_gate`：在哪些不可逆、外部影响或超范围动作前必须暂停。
- `acceptance_checks`：可观察的验收证据。
- `rollback_requirement`：回滚物、负责人、失败/结果未知时的处理方法。
- `evidence_outputs`：结果、Orca Task/Dispatch 引用和（若适用）本地 manifest 的最小关联。

该 envelope 暂不新增公开 JSON Schema；仍需先确定主管层究竟是本仓库里的层，还是单独的集成 adapter。

## Pi-only 调度流程（已验证部分与建议流程）

1. Pi intake：明确任务目标、项目、隐私级别、允许操作与完成条件；信息不足时先做有界查证，并把真正的授权歧义记为 decision gate。
2. Pi planning：生成自包含 Task spec；尽量选择最小批次，不为并发而并发。
3. Orca placement：在合适 Run 中创建 Task/依赖；现有工作区用 `worker-start --worktree current --agent pi`，不要给现有工作区传仅适用于新 worktree 的 `--setup`。
4. Runtime proof：检查 worker-start receipt、effective agent、可观察的模型/provider、worker liveness；`input_accepted` 不自动等于 turn started，无法证明时标记未知而非谎报成功。
5. Coordination：使用 Orca check/ask/reply/worker messages；把每次 delivery 的所有消息处理完并决定 worker terminal 下一所有者后才 ack。
6. Review：核对 worker 的实际差异/证据；文件任务还要经过治理 adapter 做路径、权限、hash、引用和 manifest 验收。
7. Settlement：成功/失败/结果未知分开处理；按 Orca receipt 对 Pi worker 执行 retain/release，不手工关闭未证明已结束的终端。
8. User report：区分 Orca Task 完成、领域验收通过和用户目标整体完成。

### 当前执行限制

- 用户目前要求 Orca 任务只由 Pi 处理；Orca 中 `agent=pi` 被视作 Pi。不要派发 Codex、Claude 或其他 Agent。
- Orca 1.4.224 的一次本机 Pi-only、只读 canary 已验证 `worker-start --agent pi`、terminal-mode 执行、worker_done、terminal archive、worker-release 和 delivery ack 闭环；实际运行预览显示当前 Pi 模型/provider。该测试没有改项目文件。
- 尚未验证 Pi structured-session worker、远端/paired runtime、自动化 provider 对 Pi 的支持、多任务 DAG、工具中的真实文件 mutation、失败/重试及跨项目权限隔离。
- Canary worker 曾在 workspace root 列出相邻目录名称，未读取内容；后续 worker spec 必须要求先切换到精确目标仓库，禁止父目录及全 workspace 枚举。

## 推荐演进步骤

1. 先评审本草案和 authority crosswalk；维持当前 file-governance 规范与电脑整理主线，不触碰 Agent Cluster/Harness。
2. 添加仅使用合成输入的 envelope → Orca Task spec 映射测试；验证只读、plan-only、mutation approval、OUTCOME_UNKNOWN 与恢复语义，不触碰真实文件系统。
3. 设计一个薄 Pi↔Orca adapter 接口：调用 Orca 命令、保存 Orca authority IDs、解析回执；不在本项目实现 worker scheduler/liveness 数据库。
4. 通过端到端测试后，再做一个授权明确、无隐私的真实只读电脑整理任务，验证 intake→Task→Pi worker→回执→领域验收→报告闭环。
5. 只有以上闭环证明价值后，才决定是否公开主管层 API/schema、是否拆为独立 adapter 仓库，以及是否扩展到其他 Agent。当前 Pi-only 限制先保持有效。

## 未决问题

- 本仓库公开项目边界是否从“文件治理规范”扩展为“电脑治理主管框架”，还是由另一个薄项目调用本仓库的文件治理能力。
- Orca Run/Task 是否作为全部运行态任务的唯一事实源，是否还需要跨 Orca/跨机器的 Pi 私有总览索引。
- 用户说的“统筹所有 Agent”是将来允许 Pi 启动并监督其他 Agent，还是主管层只登记/汇总它们、实际执行仍限 Pi。当前执行按照明确的 Pi-only 要求。
- 版本化 task envelope 与 file index envelope 的版本号策略、共享存储/服务器分类扩展及与本地私有索引的关联方式。
