---
title: 'Plan Mode Shell Routing and Exact One-Off Approval'
date: '2026-07-17'
status: 'implemented'
---

# Plan 模式 Shell 路由与精确一次性审批

## 问题

Plan 模式历史上把确认形态当作工具是否只读的代理信号。这对 `run_shell_command` 和 `monitor` 是不够的：这两个工具都可以表示只读的、会修改状态的、或解析器无法识别的 shell 程序，而权限规则、hook、ACP 宿主、stream-json、TUI、teammate 和后台 bridge 都可以通过不同的路径解析同一个审批。

安全边界必须在不把 `unknown` 变成规避 Plan 模式手段的前提下，区分已知写入和未知命令。一次审批还必须保持绑定到产生该提示的确切模型请求；之后的模式变更、权限策略变更、宿主改写、编辑器修改或竞争性响应都不得复用它。

本设计依赖在 #7053 中合并的三态 shell 分类器。

## 目标

- 对 Core 和 ACP 中模型发起的 Shell 与 Monitor 调用应用同一路由策略。
- 只有被分类为 `read-only` 的命令无需新的 Plan 专属提示即可执行。
- 在确认 hook 或宿主能够批准之前，阻止被分类为 `write` 的命令。
- 仅通过一次精确的一次性确认来允许 `unknown`，同时保持 Plan 模式处于激活状态。
- 在每条 Plan 专属路由之上保留显式的 PermissionManager deny。
- 把警告和实际允许的选项完整地传递到 TUI、ACP、stream-json、dual-output、teammate、subagent 和后台 bridge。
- 保持非 Shell 的 Plan 行为和显式的 plan-exit 语义不变。

## 非目标

- 修改 Plan 闸门生命周期，或在已运行的 ACP 轮次中注入新的提醒。
- 管理用户输入的 `!command` shell 输入。
- 添加确认类型、设置、缓存、feature flag 或持久化的一次性能力。
- 修改 DataWorks 专用的查询工具。
- 让 speculation 提供交互式审批界面。

## 威胁模型

受保护的资产是 Plan 模式激活期间用户的文件系统、进程、网络可见状态、仓库状态和审批模式边界。不可信输入包括模型工具参数、解析器无法证明安全的 shell 语法、hook 返回的 `updatedInput`、ACP 选项 ID、stream-json 宿主改写、IDE 编辑回调、teammate/后台响应，以及并发附加的宿主发来的重复响应。

相关的攻击包括：

- 利用 allow 规则或类 YOLO 的 bridge 绕过 Plan 模式；
- 用包装器伪装已知写入，使其到达更弱的路径；
- 批准一条命令却执行一个被修改的请求或校验后的调用；
- 在旧提示仍可见时退出 Plan 模式并重新进入；
- 在提示显示之后、审批被消费之前添加 deny 规则；
- 伪造一个未提供的持久化或修改选项；
- 通过 TUI、远程输入、IDE 或后台 bridge 批准两次；
- 用兄弟调用的持久化审批自动批准 Plan Shell 调用。

## 路由策略

PermissionManager L3/L4 评估对硬 deny 保持权威。在该决定和 Plan 要求的 teammate 闸门之后，Plan Shell 路由对校验后的命令进行分类。

| 分类          | PM deny | PM allow             | PM ask/default       | 无审批宿主                                       |
| ------------- | ------- | -------------------- | -------------------- | ------------------------------------------------ |
| `read-only`   | 拒绝    | 执行                 | 精确一次性提示       | 当普通 PM 提示无法显示时拒绝                     |
| `write`       | 拒绝    | Plan 阻止            | Plan 阻止            | Plan 阻止                                        |
| `unknown`     | 拒绝    | 精确一次性提示       | 精确一次性提示       | Plan 安全拒绝                                    |

Monitor 分类使用 `normalizeMonitorCommand(command).safetyCommand`；Shell 分类使用校验后调用的原始命令字符串。Speculation 仅在三态结果恰为 `read-only` 时执行；`write`、`unknown`、解析器失败和空输入都停在 speculation 边界。

## 精确调用能力

分类创建一个不可变快照，包含：

- 原始工具请求参数；
- 校验后的调用参数；
- 当前审批模式修订版本；
- PermissionManager 检查上下文，包括生效的 Shell/Monitor 工作目录；
- 用于显示的原始 Shell 或 Monitor 命令。

Core 和 ACP 在分类之前克隆 Plan Shell/Monitor 调用，使宿主可见的原始输入无法保留对可执行参数的别名。当模型省略 `directory` 时，该克隆还绑定到当前会话工作目录。原始请求保持不变，而执行不再跟随审批被消费之后的 daemon/ACP 目录迁移或请求对象变异。

调度器在分类之后、显示确认之前、消费确认之前验证该快照。验证要求：

- 一个活跃的、未中止的请求；
- 具有相同修订版本的 Plan 模式，因此 Plan → 其他模式 → Plan 会使提示失效；
- 请求参数与校验后调用参数的深度相等；
- 当调用依赖会话的环境目录时，相同的生效工作目录；
- 一次不返回 `deny` 的成功当前 PermissionManager 评估。

之后的 `allow`、`ask` 或 `default` 变更不会重新路由已选定的提示。PermissionManager 异常会 fail closed（失败即拒绝）。一旦最终验证成功，该能力即被消费；之后的模式或规则变更不会撤销已消费的调用。

只接受 `ProceedOnce` 和 `Cancel`。`updatedInput` 仅在与快照的请求深度相等时被接受。`newContent` 永不被接受。成功的审批向工具传递空载荷，因此回答、权限规则或仅宿主元数据都无法变成持久授权。非法结果变为 `Cancel` 并附带过期审批消息。

Core 确认闭包在其第一个 `await` 之前同步认领响应。因此竞争的 TUI、远程输入、teammate、IDE 或后台响应无法两次消费该能力。Plan Shell 编辑确认从不进入 IDE 自动 diff 路径，兄弟持久化审批会跳过标记为 `hideAlwaysAllow` 的确认。

## 确认呈现

每个 Plan Shell 提示都隐藏持久化审批。Unknown 确认额外添加：

> Plan mode could not determine whether this shell command is read-only. Approval applies only to this exact invocation once; it may modify system state, and Plan mode will remain active.

Unknown 编辑确认还隐藏修改动作，并把原始命令作为第二条警告添加，同时保留 diff。TUI 把编辑警告渲染在 diff 之上，并预留其换行后的高度，使选项在小终端上保持可见。ACP 在 diff 或 plan 内容之前发送警告。Stream-json 和 dual-output 把警告包含在其现有的 `permission_suggestions` 字段中。

ACP 和嵌套 subagent bridge 会对照实际发送给宿主的选项验证返回的选项 ID。Plan-exit 保留其现有的四个特殊选项，因为这些选项是实际发送过的。缺失、伪造、隐藏或格式错误的选项会 fail closed（失败即拒绝）。

Teammate 事件携带可选的无回调确认详情。Stream-json 使用它们承载警告，而 teammate 的 Core 调度器仍然是最终的精确调用验证器。无头模式 YOLO 会取消标记为 `hideAlwaysAllow` 的非 Plan 确认，因为不存在交互式警告界面。后台审批绝不把未提供的持久化结果转换为 `ProceedOnce`；非 Plan 持久化结果被取消，而 Plan 确认只保留其实际的 `ProceedAlways` 选项。

## 失败消息

已知写入、不可用的 unknown 审批界面和过期审批使用实现计划中的固定消息。这些消息刻意声明 Plan 模式保持激活，并禁止通过包装器或混淆重试已知写入。

## 已拒绝的备选方案

- **把 unknown 当作 write。** 更简单，但当解析器无法建模一个本来合法的命令时，会阻止必要的调查。
- **PM allow 之后把 unknown 当作 read-only。** allow 规则不是只读行为的证明，并且会抹掉 Plan 边界。
- **在 unknown 审批后持久化一条 allow 规则。** 分类器结果和精确请求是瞬时的；持久化会授权一个更宽泛的未来命令。
- **复用 IDE diff 接受。** IDE 回调可以修改内容并与警告界面竞争，因此无法安全地消费精确 shell 能力。
- **只验证原始请求参数。** 工具构建器会规范化并验证输入；原始形式和可执行形式都必须保持绑定。
- **只在提示创建时验证。** 模式和权限状态可能在提示可见期间发生变化。
- **添加专用的确认类型或 feature flag。** 现有的确认形态和警告字段已经足够，并使变更更小。

## 验证

单元测试覆盖策略分类、快照、中止、修订版本与参数变更、PermissionManager deny/error、警告装饰、载荷清洗、Core 路由、重复响应所有权、兄弟自动批准、换行的 sed 编辑行为、Monitor 一致性、speculation、ACP 选项与警告、SubAgentTracker、teammate stream-json、后台规范化、dual-output、TUI 布局和提示措辞。

手工验证使用一个包含示例文件的一次性 Git 工作空间，覆盖以下用例：

1. 在 Plan 模式下，验证 `git status` 可以运行，`touch changed.txt` 被阻止，以及未知命令（如 `python -c 'print(1)'`）只提供一次性审批和取消，并在下一次调用时再次提示。
2. 在一个窄小的紧凑确认中运行包装编辑，验证原始命令、警告、diff 上下文、问题和可用选项保持可见，同时修改和持久化审批保持不可用。
3. 在审批挂起时更改 Plan 模式修订版本或工作目录，返回已变更或未提供的审批载荷，并发送重复或迟到的响应；验证每条路径都在不执行的情况下取消。
4. 通过 Monitor、ACP、stream-json、嵌套 teammate 和后台执行重复 read-only、write 和 unknown 用例；验证每个界面都使用相同的分类和 fail closed 行为。
