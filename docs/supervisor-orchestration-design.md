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

## 协作声明、租约与强制互斥

“status 里有一条记录”不等于文件已被系统锁住。协议和工具必须明确自己提供的保证，不得把协作提示包装成互斥能力。

| 类型 | 保证 | 必须如何表述 |
| --- | --- | --- |
| Advisory claim（协作声明） | 记录某个会话声称正在处理某个范围；不阻止其他进程写入，也不能仅凭记录证明持有者仍在线 | 称“协作声明/占用提示”；状态查询只报告登记事实和可验证的新鲜度 |
| Lease（有期限租约） | 在租约存储可原子比较更新时，记录 owner、resource/scope、generation、创建/心跳/过期时间；过期可进入接管流程 | 称“租约”；只有所有写入者在变更前都校验租约时，才提供协议层的写入保护 |
| Enforced mutex（强制互斥） | 由所有变更路径共同经过的原子门禁，对冲突范围实施互斥并在提交前再次校验 | 只有存储、比较/交换语义、所有写入路径和绕过防护都经过验证后，才可称“强制锁/互斥锁” |

### 最小租约记录与状态

租约实现至少记录：唯一 claim/lease ID、opaque owner/session ID、规范化 resource references、scope、created_at、heartbeat_at、expires_at、generation 和状态。不得记录密钥、cookie、会话正文或不必要的绝对本机路径。具体值留在宿主的私有运行态，不进入本仓库、公开夹具或广播。

状态至少区分 active、expired、released、stale、superseded、unknown。查询应分开报告：登记是否存在、租约是否未过期、心跳是否新鲜、owner 是否被外部验证、写入门禁是否实际启用。不能把其中一项推导成另一项。

### 并发与失败关闭要求

1. 获取租约时必须基于同一权威存储原子检查范围冲突并登记；JSON 文件上的普通读-改-写若无原子门禁，属于 advisory-only，可能丢失更新。
2. scope 必须在已授权根内规范化，并按宿主路径语义检测重叠；无法确定别名、大小写、链接或挂载边界时，拒绝自动合并冲突范围并进入 hold。
3. 心跳与过期时间不能证明进程在线；接管需检查 generation 并追加事件。释放必须比较 owner 与 claim/lease ID，避免一个会话删除别人的新登记。
4. 每次真实变更前再次校验状态；存储不可用、generation 不匹配、冲突或结果不确定时不得继续写入。仅有运行时“自觉遵守”的项目不应宣称 OS 级或跨主机强制互斥。
5. 测试至少覆盖并发争用、重叠/不重叠 scope、过期接管、旧 generation 释放、进程退出、心跳陈旧、时钟/存储异常、读改写丢失更新和绕过门禁的拒绝路径。

现有项目若只有本地登记文件和自觉遵守，应保持 advisory claim 命名；待原子租约和所有写入路径验证后，再分别升级其协议保证。此处定义的是通用合同，不代表任何宿主已经部署或启用强制锁。
