# 主管编排与文件治理任务契约

## 目的

在多 Agent 或编排运行时环境中，文件治理作为主管 Agent 可调用的领域能力运行。本文定义主管层、编排运行时与文件治理适配器之间的职责边界与任务信封（Task Envelope）契约，避免在文件治理仓库内重复实现通用任务调度器、终端管理或进程生命周期状态机。

## 三层职责

| 层 | 负责内容 | 事实源与边界 |
| --- | --- | --- |
| 主管 Agent 层（Supervisor） | 接收用户目标；拆分任务；确认授权、scope、隐私等级和验收条件；处理审批门禁；复核领域证据并向用户汇总 | 用户明确指令与宿主安全策略优先；主管层负责消解授权歧义，不得把未确认的范围转交给执行 worker 自行决定 |
| 编排运行时层（Orchestration Runtime） | 工作区/worktree、Run/Task/Dispatch DAG、worker 会话/终端生命周期、消息投递与状态回执 | 任务/派发 ID 与存活状态以编排运行时回执和执行主机为准；治理层不另造平行调度器 |
| 文件治理领域与适配器层（Governance & Adapter） | 文件分类、权限/隐私映射、canonical reference、本地索引、dry-run 预检、事务清单、真实后置状态核验与回滚证据 | 通用规范、Schema 与只读校验器在本仓库；真实路径映射、目录清单和 transaction manifest 留在宿主受限本地位置 |

编排运行时的 `worker_done` 回执只证明 worker 报告了执行结束，不证明文件后置状态、应用引用或回滚条件已满足。所有文件治理任务必须经领域适配器校验后置状态与 manifest 后才可结项。

## Authority crosswalk

| 对象 | 权威来源 | 禁止的替代推断 |
| --- | --- | --- |
| 用户目标、优先级、授权范围 | 当前任务的用户指令与宿主授权记录 | 从路径存在、文件名、worker 提示词或历史任务推断授权 |
| Run/Task/Dispatch ID、依赖、消息和交付 | 编排运行时 API/CLI 回执 | 另建重复任务状态机，或仅凭终端输出推断任务已完成 |
| worker 身份与运行态 | 运行时启动回执、状态查询与执行主机 | 从请求参数推断启动成功，或从窗口标题猜测 Agent/模型 |
| 当前模型/provider | 实际运行时可观察状态 | 从 `--model` 请求值或技能文档猜测 |
| 文件角色/owner/privacy/lifecycle/canonical ref | 宿主受限本地索引；公开仓库只定义通用模型 | 将真实目录清单、账户名、主机映射或私人 manifest 放进公开仓库 |
| 文件操作授权、结果和回滚 | 当前授权 + 主机适配器实测后置状态 + 本地私有事务 manifest | 以 worker 完成回执代替文件校验，或把 Schema 合法当作路径安全 |

## 文件治理任务信封（Task Envelope）

派发给执行 worker 的文件治理任务说明应自包含，并至少声明以下字段：

- `objective`：可验证的任务目标。
- `scope`：允许触及的根目录或精确子路径边界；严禁 worker 枚举父目录、相邻目录或未授权根。公开资料中仅使用合成或 opaque 引用。
- `allowed_operations`：允许的操作类型（如 `inventory`、`copy`、`move`）及明确禁止项。
- `execution_mode`：`read_only`、`plan_only` 或 `mutation`。
- `privacy_class`：涉及数据的最高敏感级别及对应的可信模型/Agent 渠道要求（例如 Downloads 整根枚举必须由宿主指定的隐私主管 Agent 在可信渠道执行）。
- `dependencies`：真实先后依赖，由编排运行时 DAG 负责调度。
- `approval_gate`：在哪些不可逆、外部影响或超范围动作前必须暂停。
- `acceptance_checks`：可观察的验收证据（含 Schema 校验、路径包含检查、SHA-256 指纹与引用核对）。
- `rollback_requirement`：回滚物位置、负责人，以及遇到失败或 `OUTCOME_UNKNOWN` 时的恢复步骤。
- `evidence_outputs`：运行回执与本地私有 transaction manifest 的关联引用。

## 协同闭环流程

1. **Intake**：明确目标、授权根目录、隐私级别、允许操作与验收标准；存在真实授权或边界歧义时停在 decision gate。
2. **Planning**：生成自包含的 Task Envelope，先要求只读盘点或 dry-run 计划，取最小有效批次。
3. **Placement & Proof**：通过宿主编排器派发给符合宿主策略的 worker，核验启动回执、有效 Agent 身份与工作目录边界。
4. **Pre-execution & Execution**：执行前由只读校验器（如 `lib/governance-validator.mjs`）核验根目录包含、重解析点/挂载边界、目标无冲突及 Schema 契约；在有界批次内执行。
5. **Domain Acceptance & Settlement**：核对真实文件系统状态、SHA-256 指纹与更新后的本地索引，区分「worker 任务回执完成」「领域校验通过」与「用户目标整体闭环」。
