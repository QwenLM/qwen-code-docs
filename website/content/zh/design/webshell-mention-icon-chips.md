# Web Shell mention 图标 chip

## 问题

自定义 @ mention 菜单可以插入扩展、文件和 MCP 引用，但被选中的项在 composer 中会被渲染为纯文本。之前的 composer 实现会将这些引用渲染为图标 chip。当前的自定义 mention 架构还需要一种机制，允许宿主定义的 mention 项（如表格）使用相同的 chip 渲染。

## 设计

- 保持 @ mention 菜单负责选择和插入文本的职责。
- 允许 mention 项可选地提供一个 `composerTag` 来描述插入的引用。
- 继续为内置的文件、扩展和 MCP 提供者自动创建 composer tag，使现有的内置 mention 无需修改宿主代码即可恢复图标 chip。
- 在 `WebShell` 上添加 `composerTagIcons` prop，以便宿主可以通过 `composerTag.kind` 注册图标 URL。
- 在 composer 渲染时通过一个辅助函数解析图标，该函数优先检查自定义图标，若未找到则回退到内置图标。
- 仅将解析后的图标 URL 存储在内部的内联装饰数据中，并将其从公开的 composer tag 值中剥离。

## 范围

此更改涵盖了已接受的 @ mention 项和通过代码插入的内联 tag 的 composer tag 图标注册与渲染。它不会更改可见的 @ mention 选择器行，也不会在现有的 `atProviders` 接口之外添加新的提供者注册 API。

## 风险

- 自定义图标 URL 通过 CSS 遮罩应用，因此在写入 CSS 自定义属性之前必须对 URL 值进行转义。
- 如果 `composerTagIcons` 在编辑器中仍保留文本时发生变更，现有的内联装饰需要进行刷新。