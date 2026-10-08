# Computer File Governance

跨 Agent 的全机文件治理规范。目标是让文件系统具备清楚、稳定、可检索的用途分类、责任边界、生命周期和变更证据；移动文件只是可能采用的一种手段。

本仓库以通用 Agent Skill 为核心，平台 profile 只描述差异，不假设所有电脑或服务器有相同盘符、目录结构或所有者。公开仓库保存规范、schema 和合成示例，不保存任何机器的真实路径、目录清单、日志、凭据或私人 manifest。

## 内容

- [SKILL.md](SKILL.md)：可移植的治理流程，供支持 Agent Skills 的 Agent 加载。
- [治理模型](docs/governance-model.md)：分类轴、索引约束、变更状态和证据要求。
- [非明文凭据使用](docs/credential-use.md)：通过本机 vault-backed adapter 使用凭据，不让 Token 进入模型提供商可见内容。
- [Agent onboarding](docs/agent-onboarding.md)：新 Agent 首次收到路径后，如何在当前 Agent 的自动加载入口登记指针，并保持唯一规范源。
- [Windows profile](profiles/windows.md)：本地 Windows 路径、Known Folder、重解析点和应用所有权注意事项。
- [Linux server profile](profiles/linux-server.md)：服务器只读盘点、目录角色、服务/挂载点及远程权限边界。
- [Downloads 场景](scenarios/downloads.md)：将下载目录作为收件箱治理，不做全量搬运。
- [Agent adapters](adapters/README.md)：将同一核心流程接入不同 Agent，不另造一套冲突规则。
- [JSON Schema](schemas/)：机器索引记录和变更事务记录格式。

## 使用

将本仓库保存在用户指定的统一规范目录中。Agent 通过自动加载的全局指令**直接引用该目录中的 `SKILL.md`**，并从同一仓库读取相对引用的规范。不要把整份 Skill/repository 复制到 Agent 私有 skills/plugins/prompts 目录；Agent 私有配置只登记稳定指针。更新只修改统一源，所有 Agent 随后从同一路径读取当前版本。

支持 Agent Skills 的 Agent 也应把此仓库作为统一源读取，而不是把内容安装成私有副本。若平台 loader 必须从原生目录发现 Skill，只能采用指向统一源的轻量指针或经验证支持的 link；若不支持外部引用，应说明限制并讨论可维护方案，不自行制造第二份事实源。

开始治理前，先确定被授权的根目录、数据所有者、隐私边界和可接受的变更类型。初始盘点优先使用文件系统元数据；读取文件正文、跨设备复制、影响应用/服务、或永久删除都需要额外的明确依据。未知项进入 hold，不为提高“整理率”而强行归类。

## 当前阶段

0.2.0 明确统一规范源与首次持久接入流程，并建立跨 Agent 核心流程、Windows 与 Linux 服务器 profile、Downloads 场景及基础 schema。这里的服务器规则是治理指导，不是生产级远程执行器；具体访问与变更仍须由本机安全工具和任务授权控制。

## License

原始项目内容采用 [AGPL-3.0-only](LICENSE)。第三方内容如有引入，必须另行注明来源、适用许可证及 NOTICE 要求。
