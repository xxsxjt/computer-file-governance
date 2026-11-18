# Agent Adapters

本目录描述四类宿主适配器的边界，而不是声称本仓库已经部署了所有适配器：

1. **规范接入 adapter**：让 Agent 读取唯一规范入口和关联规则。
2. **索引 adapter**：提供经授权的 metadata manifest、freshness、查询和旧路径/tombstone 语义。
3. **工作区/产物 adapter**：为 temporary、intermediate、deliverable、evidence、rollback、cache、private_index 和 manifest 提供逻辑落点与交接状态。
4. **vault-backed adapter**：按非明文凭据合同使用 opaque credential reference；实际保险库和解析器可以由宿主提供。

文件移动、归档或删除属于第五种可选的变更执行 adapter，不是所有治理任务的前置条件。

核心规则只有一份：用户指定的统一规范仓库中的根目录 `SKILL.md`。Agent 私有配置/skills 目录不是规范源，只能保存直达该文件的短指针或已验证的 link，不应复制完整 Skill 或引用文档。

## 一次登记，后续自动加载

当用户首次把路径或 URL 发给当前 Agent，按 [Agent onboarding 说明](../docs/agent-onboarding.md) 完整读取唯一规范源，并把这个源路径登记到该 Agent 实际会自动读取的共享入口；没有经过验证的共享入口时，只登记到当前 Agent 自己的全局入口。当前任务只接入当前 Agent，不顺带配置其他 Agent。后续更新统一源即可，指针保持不变，无需逐个同步副本。不要只依赖会话记忆，也不要假定任意环境变量会自动生效。

如果 Agent 原生 loader 要求私有 skills 目录，仅允许轻量指针或经验证支持的链接；平台不支持时报告限制，不复制正文。

这一步只固化规则引用，不新增 provider gate、ACL、shell hook、后台服务或其他技术隔离。指针未写入并验证前，不能承诺后续会话自动读取。

## 不向模型提供商暴露明文凭据

详见 [非明文凭据使用规范](../docs/credential-use.md)。任一已获用户授权的 Agent 都可以通过本机已配置的 vault-backed adapter 使用凭据；本规范不按模型提供商名称增加拒绝或信任门。Adapter 在本机解析并使用凭据，不能把凭据值返回给 Agent 或写入模型可见内容。

这只隐藏凭据值，不隐藏普通工具调用和返回内容：模型提供商仍能看到 Agent 请求的仓库、文件或操作结果。也不以防范恶意本机 Agent 为目标。若 Agent 尚未配置本机 adapter，文档本身不会生成工具能力；不要因此要求用户把 Token 粘贴给模型。

## Agent 接入方式

- 支持 Agent Skills 的 Agent：优先由其实际读取的共享全局指令直接引用唯一规范源中的 `SKILL.md`；没有共享入口时写入当前 Agent 自己的全局指令。任务触发时从同一仓库读取关联文档，不把整个仓库安装成 Agent 私有副本。
- 仅支持项目/用户指令文件的 Agent：在当前 Agent 的官方自动加载入口加入一条指向唯一源的绝对路径。
- 原生 loader 必须从私有 skills 目录发现入口时：仅使用可读的短 pointer/stub 或经官方验证的 link；必须验证其实际加载结果。无法引用统一源时，报告限制，不创建第二份正文。
- 工具/插件 adapter 可以提供只读盘点、dry-run、确认和事务记录能力，但它们不是规范事实源，也不得把工具能力误称为已经通过文档接入。

默认只接入当前 Agent。其他 Agent 的启动链是独立范围，只有用户另行要求时才检查或修改。

各 Agent 的入口、配置键和 link 支持会随版本变化。发布具体接入步骤前，先核对相应 Agent 的官方文档与当前稳定版；不要把某个 Agent 私有 API 描述成跨 Agent 标准。

## 索引与工作区适配器接口建议

索引 adapter 至少应能表达：

- 授权根、排除项、覆盖边界、快照 ID、生成时间、采集器/操作者、跳过项、错误和 freshness；
- 只读 metadata manifest 或对已有清单的受控消费；链接/挂载/重解析点进入 hold，不默认跟随；
- 查询语义、旧路径/tombstone、stale 原因和索引重建/原子切换状态；
- 第三方搜索/同步/版本控制输出只作 evidence，不自动升级为权威。

工作区/产物 adapter 至少应能表达：

- task/workspace 引用以及 temporary、intermediate、deliverable、evidence、rollback、cache、private_index、manifest 的逻辑槽位；
- source/derived/verifies/restores/published_as 关系、版本、生命周期、保留条件和 unresolved hold；
- 任务交接时可发现的落点、状态、验证证据和下一步；日志和错误信息脱敏。

## 变更执行 adapter 接口建议

只有在任务明确需要文件变更时，变更执行 adapter 至少应能表达：

- 授权根目录与排除项；直属或有界递归的元数据预览；链接/挂载识别。
- 候选变更 dry-run、目标冲突拒绝、明确的用户确认；无 UI 时 fail closed。
- 批次 ID、跨进程互斥、来源/目标记录、结果校验、回滚或 `OUTCOME_UNKNOWN`。
- 私有本地索引与 manifest 的持久化路径；日志和错误信息脱敏。
- 宿主隐私与状态映射：当宿主采用 `PUBLIC` / `PRIVATE_RESTRICTED` 二元隐私边界时，遵循 [治理模型](../docs/governance-model.md) 中的保守映射规则。

本仓库在 [`lib/governance-validator.mjs`](../lib/governance-validator.mjs) 与 [`bin/cfg-validate.mjs`](../bin/cfg-validate.mjs) 中提供了零副作用的参考校验实现，涵盖索引/事务 Schema 校验、授权根目录包含检查、`lstat` 符号链接/重解析点检测、目标冲突失败关闭预检以及 SHA-256/SHA-512 指纹核对。

[`bin/cfg-find.mjs`](../bin/cfg-find.mjs) 提供本地元数据清单检索；[`lib/governance-executor.mjs`](../lib/governance-executor.mjs) 与 [`bin/cfg-tidy.mjs`](../bin/cfg-tidy.mjs) 提供可选的 `plan` / `apply` / `rollback` 三态事务参考执行器。执行器仍要求调用方给出授权根目录与本机证据目录，且只在 `apply` 时产生变更；索引查询、工作区落点和产物交接不以 `apply` 为完成条件。

公开 adapter 实现不得包含真实机器路径、用户身份、远程主机、授权令牌或实际文件清单。

只读与可逆的搜索/同步/版本控制共存示例见 [adapters/examples/README.md](examples/README.md)。第三方工具输出只作为 evidence，不覆盖统一规范源；任何变更都必须由任务授权的变更 adapter 产生并保留 manifest，不能把 `cfg-tidy apply` 当作唯一执行路径。
