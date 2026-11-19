# 只读与可逆适配示例

本目录只给通用适配器示例，不包含真实机器路径、凭据、文件清单或第三方工具输出。所有示例遵循同一原则：第三方工具只读输出，不覆盖本地规范源；任何写操作只由有界事务执行器产生，并保留 manifest 与回滚路径。

## 与搜索工具共存

1. 用 `cfg-find` 从用户指定的本地元数据清单查询候选，输出 JSON 到受限本地区。
2. 把候选的绝对路径列表交给搜索工具做只读内容检索；不得把搜索工具的排序、命中分数或标签写回为权威分类。
3. 需要变更时，重新生成只含明确 source/destination 的计划，经 `cfg-tidy plan` 与 `cfg-tidy apply` 执行。

PowerShell 示例：

```powershell
node bin/cfg-find.mjs <keyword> --summary <local-summary.json> --json
node bin/cfg-tidy.mjs plan <local-plan.json> --out <local-dry-run.json>
```

## 与同步工具共存

1. 同步工具的状态文件视为应用托管数据；默认 hold，不把它与治理索引混写。
2. 只读取同步工具暴露的元数据状态作为分类证据之一；未知状态保持 unknown。
3. 不在同步期间移动被同步的根或子目录；先由所有者确认暂停/排除范围，再生成可逆计划。

## 与版本控制共存

1. 把版本控制工作树状态当作分类证据：已跟踪、未跟踪、忽略、冲突分别记录，不直接等同 owner/role。
2. 公开仓库只提交框架、schema、通用文档与合成夹具；本地清单、manifest、日志、会话与凭据保持 ignored。
3. 批量改名或移动前，先确认工作树干净或变更已单独授权；执行后用同一版本控制状态核对真实后置状态。

## Agent 工作区与产物边界

workspace-host/ 提供一个不含真实数据的 .gitignore 样例；测试会在一次性 Git 工作区中验证临时/过程文件、证据、manifest 与私有索引的隔离。交接记录字段见 schemas/task-handoff.schema.json。

## 边界检查

- 第三方工具输出不是权威来源；它只能作为 evidence 的一条。
- 示例不复制凭据、不扩大当前任务授权、不把第三方索引当实时文件系统。
- 只有 `cfg-tidy apply` 会产生变更；`cfg-suggest`、`cfg-duplicates`、`cfg-find` 与 `cfg-tidy plan` 都只读。
