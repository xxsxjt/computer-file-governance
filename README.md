# Computer File Governance

跨 Agent 的全机文件治理规范。目标是让文件系统具备清楚、稳定、可检索的用途分类、责任边界、生命周期和变更证据；移动文件只是可能采用的一种手段。

本仓库以通用 Agent Skill 为核心，平台 profile 只描述差异，不假设所有电脑或服务器有相同盘符、目录结构或所有者。公开仓库保存规范、schema 和合成示例，不保存任何机器的真实路径、目录清单、日志、凭据或私人 manifest。

## 内容

- [SKILL.md](SKILL.md)：可移植的治理流程，供支持 Agent Skills 的 Agent 加载。
- [治理模型](docs/governance-model.md)：分类轴、索引约束、变更状态和证据要求。
- [Windows profile](profiles/windows.md)：本地 Windows 路径、Known Folder、重解析点和应用所有权注意事项。
- [Linux server profile](profiles/linux-server.md)：服务器只读盘点、目录角色、服务/挂载点及远程权限边界。
- [Downloads 场景](scenarios/downloads.md)：将下载目录作为收件箱治理，不做全量搬运。
- [Agent adapters](adapters/README.md)：将同一核心流程接入不同 Agent，不另造一套冲突规则。
- [JSON Schema](schemas/)：机器索引记录和变更事务记录格式。

## 使用

将 `SKILL.md` 与本仓库的 `docs/`、`profiles/`、`scenarios/` 一起放到 Agent 可读取的技能目录，并在执行相关任务时加载。若 Agent 不支持技能目录，可在其项目指令中引用 `SKILL.md` 和具体 profile；不要把机器专属路径或实际清单提交回本仓库。

开始治理前，先确定被授权的根目录、数据所有者、隐私边界和可接受的变更类型。初始盘点优先使用文件系统元数据；读取文件正文、跨设备复制、影响应用/服务、或永久删除都需要额外的明确依据。未知项进入 hold，不为提高“整理率”而强行归类。

## 当前阶段

0.1.0 建立跨 Agent 核心流程、Windows 与 Linux 服务器 profile、Downloads 场景及基础 schema。这里的服务器规则是治理指导，不是生产级远程执行器；具体访问与变更仍须由本机安全工具和任务授权控制。

## License

原始项目内容采用 [AGPL-3.0-only](LICENSE)。第三方内容如有引入，必须另行注明来源、适用许可证及 NOTICE 要求。
