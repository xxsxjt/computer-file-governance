# 合成工作区宿主示例

本目录只保存 gitignore.example 忽略规则模板，不含真实文件、路径清单、manifest、索引或凭据。测试会把模板复制成一次性 Git 工作区的 .gitignore，并动态生成合成文件。

示例逻辑布局：

- project/source：受版本控制的规范源；
- task/<task-id>/temporary 与 working：短期和过程产物，不进入交付物槽位；
- task/<task-id>/deliverables：独立的交付物槽位；是否纳入版本控制由宿主决定；
- task/<task-id>/evidence：验证证据，与 project/source 分离；
- private/rollback、private/index、private/manifests：本机回滚副本、索引和真实 manifest；
- cache：可由已声明输入重建的数据。

gitignore.example 只证明示例宿主有对应忽略模式；测试使用一次性 Git 仓库验证临时/过程文件、证据、回滚副本、缓存、index 和 manifest 未进入跟踪集。它不证明真实主机已配置，也不验证文件系统权限或路径边界。
