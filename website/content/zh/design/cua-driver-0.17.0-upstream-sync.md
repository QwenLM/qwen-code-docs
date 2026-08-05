# CUA Driver 0.17.0 上游同步

## 目标

把内嵌（vendored）的 CUA Driver 源码从上游
`cua-driver-rs-v0.7.0` 移动到已发布的 `cua-driver-rs-v0.17.0` 标签，同时保留 Qwen 特有的运行时与分发契约。

发布标签，commit `10279552e2bbe479e367a082f78b1b98ee85a697`，是事实来源。本地的 `/Users/mochi/code/cua` checkout、旧设计笔记和生成的产物仅作为对比输入。

## 范围

上游导入限于 `trycua/cua:libs/cua-driver`，映射到
`packages/cua-driver`。上游 monorepo 的工作流、根脚本、文档和无关的库不会自动导入。对这些文件的任何新依赖要么做成包内本地的，要么显式映射到现有的 Qwen Code 设施。

Qwen 持有的发布工作流仍是 `.github/workflows/cd-cua-driver.yml`。它可以接受新驱动构建和发布契约所要求的最小改动，但必须继续发布 Qwen 持有的产物。

## 必需的 Qwen 差异项

除非以下所有项都保持有效，否则该同步是不完整的：

1. 安装的可执行文件、进程、应用包、bundle 标识符、路径、计划服务、文档和发布资产使用当前 Qwen 发布线所期望的 Qwen 持有身份。为升级兼容性，发布态主目录保持为 `~/.cua-driver`；隔离的本地构建主目录保持为 `~/.qwen-cua-driver-local`。
2. `CUA_DRIVER_RS_COORDINATE_SPACE=1` 继续在共享调用边界上提供可选启用的 0-1000 坐标契约。它必须覆盖每一个新的带坐标桌面和浏览器邻近工具，否则 fail closed（失败即拒绝）。
3. `MCP_MODEL_PAYLOAD_FILTER=1` 继续过滤 MCP 文本内容和结构化内容中模型可见的品牌信息，且不改变二进制媒体。
4. 来自 trycua/cua#2021、仍未合并的 Windows 空/空标题顶级窗口行为保持存在，并适配当前的窗口模型。
5. 来自 trycua/cua#2036 的 EAGAIN socket 写入补丁从本地补丁清单中退役，因为它已是 0.17.0 基线的一部分。

## 上游契约变化

导入包括 SDK 持有的运行时、Python 和 TypeScript UniFFI SDK、类型化浏览器自动化、运行时权限模式、按会话的捕获范围、快照绑定的元素令牌、封闭的 `ActionResult` 契约、`verify_state`、原生菜单调用、剪贴板工具、窗口取景和语义词标主题。

这些是架构级替换，而不是独立的叶子功能。Qwen 的坐标和载荷转换必须重新挂接到规范的 SDK/工具边界上，使 CLI、MCP、直接 SDK、私有 worker 和守护进程执行无法发生分歧。

## 导入策略

1. 从当前 `.vendored-from` 引用的 ref 到 `cua-driver-rs-v0.17.0` 运行仓库支持的上游差异脚本。
2. 清点每一个 reject、删除、新生成的文件、根相对路径、包身份、发布版本和外部构建依赖。
3. 通过保留上游架构并在其新的规范边界上重新表达每一个 Qwen 差异项，来解决上游/本地重叠。
4. 一并更新 `.vendored-from`、`.vendored-patches.md`、版本引用、Qwen 安装器和 Qwen 发布工作流。
5. 审计源码、测试、文档、生成的绑定、安装器、bundle 元数据、进程名、服务名和发布归档的身份一致性。

## 验证

验证是分层的，使一个绿色的窄单元测试无法掩盖损坏的分发或信任边界：

- Rust 格式化、包检查、core/contract/SDK 单元测试，以及生成的契约一致性。
- 聚焦的坐标归一化、载荷过滤、Windows 窗口枚举、安装器和版本测试。
- 在包内本地工具链可用时，进行 Python 和 TypeScript SDK 的生成/包检查。
- 针对可执行文件名、应用包布局、bundle 标识符、资产和烘焙版本的 Qwen 发布工作流静态检查。
- 对外层仓库运行 `npm run build && npm run typecheck`。
- 完整的 diff 和未跟踪文件审计，重复进行直到连续两次通过都是干净的。

签名/公证的发布生产和物理的 Windows/Linux/macOS GUI 认证不在本地验证范围内，必须保持为显式的发布门禁。
