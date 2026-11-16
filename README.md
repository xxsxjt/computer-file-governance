# Computer File Governance

跨 Agent 的全机文件治理规范。目标是让文件系统具备清楚、稳定、可检索的用途分类、责任边界、生命周期和变更证据；移动文件只是可能采用的一种手段。

本仓库以通用 Agent Skill 为核心，平台 profile 只描述差异，不假设所有电脑或服务器有相同盘符、目录结构或所有者。公开仓库保存规范、schema 和合成示例，不保存任何机器的真实路径、目录清单、日志、凭据或私人 manifest。

## 内容

- [SKILL.md](SKILL.md)：可移植的治理流程，供支持 Agent Skills 的 Agent 加载。
- [成熟度标准](docs/maturity-criteria.md)：产品定义、用户视角、可验收指标、M0-M3 门槛。
- [逐步执行清单](docs/implementation-plan.md)：P0-P3 每步的完成条件、验证、证据和回滚纪律。
- [命名与分类判据](docs/naming-and-classification.md)：目录/文件命名、五轴分类、证据门槛、冲突消解、hold 条件。
- [权威、新鲜度与生命周期](docs/index-freshness-and-authority.md)：canonical tie-break、索引重建、tombstone、retention、schema 迁移。
- [治理模型](docs/governance-model.md)：分类轴、索引约束、变更状态和证据要求。
- [非明文凭据使用](docs/credential-use.md)：通过本机 vault-backed adapter 使用凭据，不让 Token 进入模型提供商可见内容。
- [Agent onboarding](docs/agent-onboarding.md)：新 Agent 首次收到路径后，如何在当前 Agent 的自动加载入口登记指针，并保持唯一规范源。
- [主管编排与任务契约](docs/supervisor-orchestration-design.md)：主管层、编排运行时与文件治理适配器的三层职责与 Task Envelope。
- [Windows profile](profiles/windows.md)：本地 Windows 路径、Known Folder、重解析点和应用所有权注意事项。
- [Linux server profile](profiles/linux-server.md)：服务器只读盘点、目录角色、服务/挂载点及远程权限边界。
- [Downloads 场景](scenarios/downloads.md)：将下载目录作为收件箱治理，不做全量搬运。
- [Agent adapters](adapters/README.md)：将同一核心流程接入不同 Agent，不另造一套冲突规则。
- [JSON Schema](schemas/)：机器索引记录和变更事务记录格式。
- [只读校验与预检库](lib/governance-validator.mjs) 及 CLI（`bin/cfg-validate.mjs`）：Schema 契约校验、授权根目录包含检查、链接/冲突预检与公开树脱敏扫描。
- [清单检索器](bin/cfg-find.mjs)：在本地受限的 gzip JSONL 元数据清单里按文件名或路径片段检索，输出绝对路径；清单路径由 `--summary` 或 `CFG_INVENTORY_SUMMARY` 提供，不写死在框架中。
- [可重建二级索引](lib/secondary-index.mjs) 与 `bin/cfg-find.mjs --index/--build-index`：按授权清单的字节数和 SHA-256 判断新鲜度；命中索引时避免逐行扫描，旧索引自动降级为线性查询并标出 stale 原因。
- [重复簇分析](lib/duplicate-clusters.mjs) 与 CLI（`bin/cfg-duplicates.mjs`）：只消费已授权的索引记录，按算法/摘要聚合 REVIEW_ONLY 候选，默认排除 hold/retired/secret，不读取正文、不移动、不删除。
- [增量刷新](lib/incremental-refresh.mjs)：比较两批快照，生成新增、变更、删除 tombstone 与跳过项；索引指针在版本预期匹配时切换，可回退；快照始终标记为时点视图，不当实时文件系统。
- [分类建议](lib/classification-suggestions.mjs) 与 CLI（`bin/cfg-suggest.mjs`）：基于名称、目录上下文、已有记录和版本控制状态给出 role/privacy/lifecycle 建议与置信度；永远只输出 dry-run，unknown/hold 保留。
- [普通用户入口](docs/user-guide.md) 与 [结果摘要/错误码表](lib/user-report.mjs)：把查询、预览、撤销折叠成人类可读步骤；`outcome_unknown` 明确保留风险说明。
- [第三方适配示例](adapters/examples/README.md)：搜索、同步与版本控制工具只提供证据或只读结果；写操作仍由有界事务控制。
- [变更记录](CHANGELOG.md)、[安全政策](SECURITY.md) 与 [贡献规范](CONTRIBUTING.md)：发布变更、漏洞报告与公开边界的维护入口。
- [依赖与第三方来源审计](docs/dependency-audit.md)：运行时零 npm 依赖，开发依赖锁定且不在发布包内。
- [有界事务执行器](lib/governance-executor.mjs) 及 CLI（`bin/cfg-tidy.mjs`）：`plan` 生成 dry-run 与 Schema 合法 manifest，`apply` 先备份再移动并逐文件 SHA-256 校验，`rollback` 用备份恢复；部分失败时逆序 best-effort 恢复已应用项并保守标记 `outcome_unknown`；不覆盖目标、不跟随链接、不删除原件。
- [合成索引基准](scripts/benchmark-secondary-index.mjs)：`npm run bench:index -- --rows 2000 --queries 20`，只生成合成元数据，测量二级索引查询与线性查询的 p50/p95，不读取真实清单。

## 使用

将本仓库保存在用户指定的统一规范目录中。Agent 通过自动加载的全局指令**直接引用该目录中的 `SKILL.md`**，并从同一仓库读取相对引用的规范。不要把整份 Skill/repository 复制到 Agent 私有 skills/plugins/prompts 目录；Agent 私有配置只登记稳定指针。更新只修改统一源，所有 Agent 随后从同一路径读取当前版本。

支持 Agent Skills 的 Agent 也应把此仓库作为统一源读取，而不是把内容安装成私有副本。若平台 loader 必须从原生目录发现 Skill，只能采用指向统一源的轻量指针或经验证支持的 link；若不支持外部引用，应说明限制并讨论可维护方案，不自行制造第二份事实源。

开始治理前，先确定被授权的根目录、数据所有者、隐私边界和可接受的变更类型。初始盘点优先使用文件系统元数据；读取文件正文、跨设备复制、影响应用/服务、或永久删除都需要额外的明确依据。未知项进入 hold，不为提高“整理率”而强行归类。

## 当前阶段

0.2 明确统一规范源与首次持久接入流程，并建立跨 Agent 核心流程、Windows 与 Linux 服务器 profile、Downloads 场景及基础 schema。这里的服务器规则是治理指导，不是生产级远程执行器；具体访问与变更仍须由本机安全工具和任务授权控制。

0.3 起提供最小可用的执行闭环：清单检索、dry-run 计划、有界事务执行、哈希校验与回滚。元数据清单是某一时点的快照，扫描之后新建的文件不会出现在旧清单中；按当前任务授权重新生成本地清单后再检索，不要把旧清单当作实时文件系统。

0.4 补齐成熟度契约：产品定义、命名与分类判据、权威/新鲜度/生命周期、稳定 schema 标识、文档链接与版本一致性检查、逐步执行清单，以及部分失败自动止血。它仍不是「全盘自动整理器」；P1 之后的快速索引、增量刷新、重复簇、普通用户入口和企业控制按清单逐步验收。

## License

原始项目内容采用 [AGPL-3.0-only](LICENSE)。第三方内容如有引入，必须另行注明来源、适用许可证及 NOTICE 要求。
