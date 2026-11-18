# Agent 产物生命周期与落点

本合同解决一个常见问题：Agent 能找到文件，却把临时文件、过程结果、最终交付物、证据和回滚副本混在仓库根目录或任意临时目录。这里定义逻辑类别和落点规则；宿主可以映射到自己的物理路径，但不能改变类别语义。

## 1. 产物类别

| artifact_kind | 用途 | 默认落点 | 生命周期与保留 |
| --- | --- | --- | --- |
| temporary | 一次任务的草稿、探测输出、短期脚本和可丢弃中间数据 | 当前任务的 scratch/temp 槽位，或带任务 ID 的系统临时目录 | 有创建者、用途和到期时间；任务结束后复核，不因过期自动删除 |
| intermediate | 尚未交付的过程文件、拆分结果、渲染中间物 | 当前任务的 working/intermediate 槽位 | 可继续修改或重建；不能冒充最终交付物 |
| deliverable | 用户或下游系统要接收的最终文件、包、报告或发布候选 | 项目登记的 deliverables 槽位 | 需要版本、责任方和验证证据；不得被缓存清理覆盖 |
| evidence | 测试结果、摘要、验证报告、脱敏日志和状态快照 | 当前任务的 evidence 槽位或宿主私有证据区 | 与任务/产物关联；真实路径和敏感内容按受限边界保留 |
| rollback | 变更前副本、恢复材料和 rollback manifest | 宿主私有 rollback 槽位 | 在保留期或用户清理授权前不得当作缓存删除 |
| cache | 可由已声明输入、工具和版本重建的加速数据 | 项目或宿主 cache 槽位 | 可清理但不自动清理；不得作为唯一来源或权威交付物 |
| private_index | 本机搜索索引、清单摘要、路径映射和 freshness 状态 | 宿主私有 index 槽位 | 通常 restricted；不得进入公开 Git；可从授权输入重建 |
| manifest | 任务范围、计划、实际结果、跳过项和回滚关系 | 宿主私有 manifest 槽位 | transaction manifest 属于证据/回滚记录，不是公开项目文件 |

artifact_kind 说明“这份东西在任务中的物理/交付角色”，不能替代 owner、role、privacy、lifecycle 和 confidence。一个 deliverable 仍可能是 generated；一个 manifest 通常是 restricted；一个 cache 也可能包含 secret，不能仅凭类别降低隐私等级。

## 2. 默认落点模型

宿主应为每个项目或任务登记以下逻辑槽位：

- task/<task-id>/temporary：短期草稿和探测输出；
- task/<task-id>/working：正在处理的中间产物；
- task/<task-id>/deliverables：最终交付物和明确版本；
- task/<task-id>/evidence：验证证据和脱敏报告；
- private/rollback/<task-id>：回滚副本与恢复材料；
- private/index：本地索引、manifest 摘要和路径映射；
- cache：可重建缓存，不作为 canonical；
- secret store 或 vault：只存凭据本体，工作区只保留 opaque reference。

这些名称是逻辑角色，不要求所有宿主采用相同的物理目录。应用管理目录、系统目录、版本控制目录和用户已经登记的项目布局优先由其 owner 解释，不能为了套用模板而移动。

## 3. Agent 写入规则

1. 开始任务前先选择已登记的项目/任务工作区；没有工作区时先创建计划和落点，不直接写仓库根目录。
2. 临时文件必须带 task-id 或 operation-id，能说明创建者和用途；可复用或可交付的结果必须从 temporary 晋级到 intermediate、deliverable 或 evidence。
3. 最终交付物只进入 deliverables；测试报告、哈希、截图、状态摘要只进入 evidence，不混进 deliverables。
4. 任何文件变更在写入前准备 rollback；rollback 副本和真实 transaction manifest 不进入公开 Git。
5. cache 必须有可重建输入和清理条件；没有这些证据的文件进入 hold，不标为 cache。
6. private_index 和 manifest 只保存最少必要元数据；路径、个人数据、日志和凭据按宿主 privacy 边界保护。
7. Agent 交接必须报告工作区、产物类别、当前状态、证据位置、未决 hold 和下一步；不能只说“已完成”。

## 4. 关系与命名

产物应尽量记录 task_ref、workspace_ref、source_refs、artifact_kind、lifecycle、created_at、retention 条件以及 derived_from、verifies、restores 或 published_as 关系。关系引用使用稳定的本地引用或 opaque ID，不把密钥、Cookie 或认证头拼进文件名、manifest 或索引。

推荐名称顺序为 purpose、artifact-kind、task-id、version-or-sequence、date；日期使用 UTC ISO 8601。避免 final、final2、misc、tmp-only 等不能表达责任或生命周期的名称。

## 5. 完成与清理

任务只有在交付物位置、验证证据、回滚/保留决定和未决项都可追踪时才可标记完成。temporary、intermediate、evidence、rollback、cache 和 private_index 的清理分别按其保留条件处理；“看起来旧”“哈希相同”或“任务结束”都不是自动删除授权。
