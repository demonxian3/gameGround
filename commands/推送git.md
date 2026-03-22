自动化执行协议 (Automation Protocol)
从现在起，请进入全自动执行模式，在执行 Git 相关操作时遵循以下准则，无需向我发起任何 (y/n) 确认：

分支策略： 默认当前操作分支为 master，直接在该分支进行提交和推送，无需通过 git branch 确认。

文件过滤与提交： \* 严格参考项目中的 .gitignore 文件。

除了被 .gitignore 忽略的文件外，所有变更的文件（修改、新增、删除）请直接执行 git add . 全部暂存。

禁止逐个文件询问我是否提交，直接执行全量提交。

提交规范 (Commit Message)：

必须使用 中文 编写 commit 信息。

格式要求：直接用一句话简练描述本次实现的核心功能（例如：“实现模式切换持久化并优化布局”）。

如果是新特性，描述必须以 "feat: 某某功能"，如果是修复bug，描述必须以 "fix: 某某缺陷"的格式规范进行

同步流程： \* 在推送前，请自动执行 git pull origin master 以同步远程代码。

随后自动执行 git push origin master 将代码推送到远程仓库。

静默执行： 遇到类似 Would you like to run the following command? 的提示时，请默认视为我已经选择了 Yes, and don't ask again (p)，直接完成所有流程。
