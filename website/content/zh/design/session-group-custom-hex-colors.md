# 命名会话分组的自定义十六进制颜色

## 问题

命名会话分组目前共享快速会话颜色标签使用的六值颜色枚举。daemon 会以
`invalid_group_color` 拒绝任何其他值，TypeScript SDK 暴露相同的封闭联合
类型，WebShell 编辑器只提供预设选择。用户无法将命名分组与现有项目调色板
对齐，也无法在视觉上区分更大的分组目录。

由 [#6744](https://github.com/QwenLM/qwen-code/issues/6744) 跟踪。

## 提议的变更

| 层             | 变更                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core           | 将预设会话标签颜色与命名分组显示颜色拆分。命名分组接受预设或六位 `#RRGGBB`；快速标签保持仅预设。在持久化之前将有效的 Hex 值归一化为小写。 |
| REST 与 ACP    | 保持快速标签校验仅预设，并将命名分组颜色传给 core 校验。                                                                                                                           |
| TypeScript SDK | 导出预设和 Hex 颜色类型。分组的输入/输出使用它们的联合类型；会话组织继续使用预设颜色。                                                                                    |
| WebShell       | 保留预设选项，并新增带原生取色器和 Hex 文本字段的 Custom 选项。使用内联背景色渲染自定义分组圆点。                                                            |

## 决策

- 只接受六位 `#RRGGBB`。三位、四位和八位形式会被拒绝，使每个持久化的值都有
  一种可预期的形态。
- 去除首尾空白，并在 core 中将 Hex 值规范化为小写。客户端可以更早归一化以
  获得即时反馈，但 core 仍然是权威的。
- 不扩展快速会话颜色标签。它们的六值目录保持紧凑的排序/过滤维度，并保持
  向后兼容。
- 保持 sidecar schema 版本为 1。存储的字段仍然是字符串，较旧的预设值仍然
  有效。
- 不识别 Hex 类别的现有客户端应安全失败。WebShell 通过内联
  `background-color` 渲染 Hex 分组圆点。

## 文件

- `packages/core/src/services/session-organization-service.ts`
- `packages/core/src/services/session-organization-service.test.ts`
- `packages/cli/src/serve/routes/session.ts`
- `packages/cli/src/serve/acp-http/dispatch.ts`
- `packages/cli/src/serve/server/session-list.ts`
- `packages/acp-bridge/src/bridgeTypes.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- `packages/sdk-typescript/src/daemon/index.ts`
- `packages/sdk-typescript/src/index.ts`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`
- `packages/web-shell/client/components/SessionOverviewPanel.tsx`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.test.tsx`
- `packages/web-shell/client/i18n.tsx`

## 范围之外

- 快速会话标签的自定义颜色。
- Alpha 通道、渐变、命名 CSS 颜色或短 Hex 形式。
- 更改分组 sidecar 格式或迁移现有值。

## 开放问题

无。现有的结构化错误和分组持久化路径可以扩展，无需协议版本升级。
