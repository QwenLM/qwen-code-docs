# Auto 分类器不可用回退

## 问题

Auto Mode 目前把每一次分类器基础设施故障都转换为执行拒绝。因此网络错误、超时、无效的结构化响应、快速模型不可用或上下文溢出，都会在标准确认流程来得及询问用户怎么办之前，就让待处理的工具调用失败。

这种行为混淆了两种不同的结果：

- 分类器策略阻断是一个安全裁决，应继续拒绝该操作。
- 分类器不可用结果意味着没有产生任何裁决，应让用户手动做决定。

现有的连续不可用回退只在两次分类器调用失败之后才打开确认。最初的失败仍会终止其工具调用，而且 prompt 没有解释基础设施问题，也没有提供直接的恢复路径。

## 目标

- 把第一次分类器不可用结果路由到标准手动确认流程。
- 在确认中说明 Auto Mode 无法对该操作分类。
- 提供一个明确选项：一次性批准当前操作并把会话切换到 Default Mode。
- 保持 CLI 和 ACP 权限行为一致。
- 保留策略阻断、显式拒绝规则、确定性破坏性命令守卫和用户取消行为。

## 非目标

- 把 Default Mode 持久化到用户或工作区设置。
- 未经用户选择就自动切换模式。
- 修改策略分类器的允许/阻断规则。
- 让没有审批界面的非交互或后台会话也能呈现 prompt。

## 提议的行为

当分类器返回 `unavailable: true` 时，权限层仍会记录不可用事件，但会返回一个手动回退结果而不是阻断结果。待处理的调用将继续走现有的 PermissionRequest 和确认路径。

生成的确认将携带 Auto Mode 回退元数据，并抑制持久性的“always allow”选择。确认会显示分类器不可用，并在失败持续时推荐 Default Mode。其选项包括：

- Allow once。
- Switch to Default Mode and allow once。
- Reject。

切换选项有意与明确的一次性批准合并。只有模式标签会让已待处理操作的处置变得含糊。

| 分类器结果 | 当前行为 | 新行为 |
| ----------------- | ----------------------- | ----------------------- |
| Allow             | 自动执行   | 不变               |
| Policy block      | 以策略原因拒绝 | 不变               |
| Unavailable       | 拒绝工具调用      | 请求手动审批 |

## 核心权限流程

`applyAutoModeDecision` 将记录不可用计数器，并返回专用于分类器不可用的回退原因。由于结果不再是 blocked，PermissionDenied hook 不会因基础设施故障触发；取而代之的是正常的 PermissionRequest hook 会在 prompt 之前运行。

不可用计数器仍然有用。批准回退会重置连续计数器，拒绝则保留它们。如果重复失败达到现有阈值，后续符合分类器条件的调用可以绕过已知损坏的分类器，直接进入手动确认。

确认详情将新增可选的 Auto Mode 回退元数据，在 edit、execute、info、MCP 及其他确认形状间共享。一个新的批准结果将表示“继续一次并切换到 Default”。CLI 调度器将切换运行时会话模式，并在调用工具专属的确认回调或记录工具决定之前，把该结果归一化为普通的 `ProceedOnce`。

`Config.setApprovalMode` 已经提供了所需的会话转换：它恢复进入 Auto Mode 时被临时剥离的规则、重置拒绝计数器并递增审批模式修订号。不修改任何设置文件。

## CLI 呈现

TUI 确认组件将在操作详情之前渲染回退提示，并在 Reject 之前添加切换选项。完整和紧凑两种确认布局都会暴露该选项。高度核算必须为新增的警告和选项预留空间，以便小终端继续显示可操作的选项。

## ACP 呈现

ACP 权限请求将把回退提示作为文本内容包含进来，并暴露相同的切换并一次性允许选项。选中时，会话将把工具审批归一化为 `ProceedOnce`，把运行时模式切换到 Default，并发布现有的当前模式更新通知。

只能选择 Allow 或 Reject 的 ACP 客户端继续使用现有协议行为。

## 失败边界

- 用户取消分类器请求仍是一次中止，不会变成审批 prompt。
- 显式权限拒绝和确定性破坏性命令阻断仍是错误。
- 没有权限传输的非交互调用和无法弹出 prompt 的后台代理，仍通过现有的手动确认回退处理来拒绝。
- 分类器 Stage 2 中策略评审失败被视为不可用，因此会询问用户；已完成的 Stage 2 策略阻断保持拒绝。

## 受影响的文件

- `packages/core/src/permissions/autoMode.ts` 及测试：不可用到回退的映射、元数据和 hook 门控。
- `packages/core/src/tools/tools.ts`：回退确认元数据和切换批准结果。
- `packages/core/src/core/coreToolScheduler.ts` 及测试：装饰确认、跟踪回退解析、切换模式并归一化审批。
- `packages/core/src/telemetry/tool-call-decision.ts` 及测试：对新出现的审批形状结果进行分类。
- `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` 及测试：提示和选项渲染。
- `packages/cli/src/acp-integration/session/permissionUtils.ts` 及测试：ACP 内容和选项映射。
- `packages/cli/src/acp-integration/session/Session.ts` 及测试：ACP 回退、模式转换和通知。
- `docs/users/features/auto-mode.md`：记录即时手动回退和 Default Mode 恢复选项。

## 待决问题

无。该切换仅限会话内，且明确地一次性批准待处理操作。
