# 普通用户操作入口

本页把底层命令折叠成三个问题：文件在哪、变更是否安全、误动了怎么撤回。所有路径都来自用户指定的本地清单；框架不内置机器路径，也不要求普通用户直接理解 schema。

## 查询

PowerShell 示例：

```powershell
node bin/cfg-find.mjs <keyword> --summary <local-summary.json> [--index <local-index.json>] [--json]
```

输出包含命中路径、root、kind、bytes、mtime（缺失时明确为空）以及查询模式与索引新鲜度。旧索引会自动降级为线性查询，并标出 `staleReasons`。

## 预览与分类建议

这些命令都是只读输出。`cfg-suggest` 永远返回 `DRY_RUN_SUGGESTION_ONLY`，`cfg-duplicates` 永远返回 `REVIEW_ONLY`；它们不会移动、覆盖或删除文件。

```powershell
node bin/cfg-suggest.mjs <candidates.json> --json
node bin/cfg-duplicates.mjs <index-records.json> --json
```

## 撤销

有界事务执行后，保留输出的 `manifestPath`：

```powershell
node bin/cfg-tidy.mjs rollback <manifestPath>
```

如果状态是 `outcome_unknown`，先按输出提示核对真实文件系统，再决定是否回滚；不要仅凭退出码判断成功。

## 错误码

| 码 | 含义 | 下一步 |
| --- | --- | --- |
| `CFG_E_AUTH_SCOPE` | 授权范围不足 | 停止并补充明确范围 |
| `CFG_E_PATH_CONTAINMENT` | 路径越界 | 换授权根内路径重新计划 |
| `CFG_E_LINK_OR_MOUNT` | 链接/挂载边界 | 保持 hold，单独确认 |
| `CFG_E_TARGET_CONFLICT` | 目标已存在 | 不覆盖；换目标或确认 |
| `CFG_E_STALE_INDEX` | 索引过时 | 重建索引，不把旧索引当实时 |
| `CFG_E_PARTIAL_UNKNOWN` | 部分结果未知 | 核对真实后置状态，再按 manifest 回滚 |
| `CFG_E_SCHEMA_ONLY` | 仅结构校验通过 | 看运行时预检和真实证据 |
| `CFG_E_REVIEW_ONLY` | 仅建议/候选 | 责任人确认后再单独授权 |

开发者可通过 `lib/user-report.mjs` 的 `describeError(code)` 与 `summarizeResult(result)` 把低层结果转换成人类可读摘要；本地路径展示可用 `humanizePathForReport()` 限制长度。
