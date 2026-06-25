# Markdown 渲染

Qwen Code 在 TUI 中直接渲染常见的 Markdown 结构，让模型回答更易于在终端内浏览。渲染器的设计原则是保持原始源码的可访问性，对于 Mermaid 图表和 LaTeX 数学公式等视觉块尤为如此。

## 渲染模式与原始模式

默认情况下，Markdown 以 `render` 模式显示。支持的块在可能的情况下渲染为可视化预览：

- Mermaid 围栏代码块
- Markdown 表格
- task lists
- blockquotes
- 行内和块级 LaTeX 数学公式
- 带语法高亮的围栏代码块

按 `Alt/Option+M` 可在当前会话的两种模式之间切换。在 macOS 上，终端必须将 Option 键作为 Meta 键发送才能使用此快捷键；否则 Option+M 会被识别为普通文本输入。

- `render`：为支持的 Markdown 显示丰富的终端预览。
- `raw`：为 Mermaid、表格、LaTeX 等视觉块显示面向源码的 Markdown。

若要默认以 raw 模式启动 Qwen Code，请设置 `ui.renderMode`：

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

可接受的值为 `"render"` 和 `"raw"`。该快捷键仅更改当前会话的视图，不会修改配置文件。

## Mermaid

围栏 `mermaid` 代码块在 `render` 模式下进行可视化渲染。TUI 采用分层策略：

1. 如果已启用且受支持，Qwen Code 会调用 Mermaid CLI（`mmdc`）将图表渲染为 PNG，并通过终端图像协议发送。
2. 如果终端不支持图像显示，但已安装 `chafa`，则可将同一 PNG 转换为 ANSI 块图形。
3. 否则，Qwen Code 回退到终端线框图或简洁文本预览。
4. 如果某种 Mermaid 图表类型无法预览，Qwen Code 会显示原始围栏源码，而不是用占位符隐藏它。

Mermaid 图像渲染默认禁用，因为它需要外部渲染器和终端图像支持。通过以下方式启用：

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

可选环境变量：

| 变量                                        | 说明                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`       | 启用外部 Mermaid 图像渲染。                                                         |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`        | 即使在其他地方已启用，也禁用 Mermaid 图像渲染。                                     |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`    | 强制输出 Kitty 协议。适用于 Kitty 和 Ghostty 等终端。                               |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`   | 请求 iTerm2 内联图像。交互式 TUI 渲染回退到文本/ANSI。                              |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`      | 禁用终端图像协议，允许文本或 `chafa` 回退。                                         |
| `QWEN_CODE_MERMAID_MMD_CLI=/path/to/mmdc`   | 使用指定的 Mermaid CLI 可执行文件。                                                 |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`             | 当未安装 `mmdc` 时，允许 Qwen Code 运行 `npx @mermaid-js/mermaid-cli`。             |
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1` | 允许使用 `node_modules/.bin` 下的项目本地渲染器二进制文件。                         |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`       | 覆盖 PNG 渲染宽度。                                                                 |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000` | 覆盖外部渲染超时时间，上限为 60000 ms。                                             |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`   | 调整图像行适配以匹配终端字体单元格几何形状。                                        |

首次图像渲染可能较慢，尤其是当 `npx` 需要解析或下载 Mermaid CLI 时。在流式传输过程中，Qwen Code 显示有界文本预览，仅在模型响应完成后才尝试图像渲染。

### Mermaid 源码复制

每个渲染后的 Mermaid 块都包含如下源码提示：

```text
Mermaid flowchart (TD) · source: /copy mermaid 1
```

使用以下命令从最后一条 AI 回复中复制 Mermaid 源码：

| 命令                   | 行为                                          |
| ---------------------- | --------------------------------------------- |
| `/copy mermaid`        | 复制最后一个 Mermaid 块。                     |
| `/copy mermaid 1`      | 复制第一个 Mermaid 块。                       |
| `/copy code mermaid`   | 复制最后一个围栏 `mermaid` 代码块。           |
| `/copy code mermaid 1` | 复制第一个围栏 `mermaid` 代码块。             |

`/copy code 1` 计数所有围栏代码块，而不仅限于 Mermaid 块。当你想要渲染标题中显示的 Mermaid 特定序号时，请使用 `/copy mermaid N`。

## LaTeX 数学公式

Qwen Code 支持在终端中进行基本的行内和块级 LaTeX 渲染：

```markdown
Inline math: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```

渲染器专注于常见符号和可读的终端输出。它不是完整的 TeX 引擎；矩阵、对齐方程和大型嵌套表达式等复杂布局可能会被简化。

行内 `$...$` 表达式每行刻意限制在 1024 个字符，以防止格式错误或超大生成 Markdown 导致终端渲染卡顿。超长公式仍以源文本形式可见，依然可以从 raw 模式或原始回复中复制。

### LaTeX 源码复制

使用以下命令从最后一条 AI 回复中复制 LaTeX 源码：

| 命令                   | 行为                                    |
| ---------------------- | --------------------------------------- |
| `/copy latex`          | 复制最后一个块级 LaTeX 表达式。         |
| `/copy latex 2`        | 复制第二个块级表达式。                  |
| `/copy latex inline`   | 复制最后一个行内表达式。                |
| `/copy latex inline 2` | 复制第二个行内表达式。                  |
| `/copy inline-latex 2` | `/copy latex inline 2` 的别名。         |

行内 LaTeX 在渲染文本中不显示逐表达式的复制提示，以避免正文显得嘈杂。如需就地查看行内源码，请使用 `Alt/Option+M` 切换到 raw 模式；在 macOS 上，这需要终端支持 Option 键作为 Meta 键输入。

## 通用代码复制

`/copy code` 命令从最后一条 AI Markdown 回复中读取围栏代码块：

| 命令                    | 行为                                     |
| ----------------------- | ---------------------------------------- |
| `/copy code`            | 复制最后一个围栏代码块。                 |
| `/copy code 2`          | 复制第二个围栏代码块。                   |
| `/copy code typescript` | 复制最后一个 `typescript` 代码块。       |
| `/copy code mermaid 1`  | 复制第一个 `mermaid` 代码块。            |

## 选择较早的 AI 消息

默认情况下，`/copy` 以最近的 AI 消息为目标。在命令前加上正整数可从倒数第 N 条 AI 消息中复制——当最新回复是低信息量的内容（例如 TODO 更新），而实质性输出在前一两轮时，这非常方便。

| 命令                  | 行为                                               |
| --------------------- | ------------------------------------------------------ |
| `/copy 2`             | 完整复制倒数第二条 AI 消息。                       |
| `/copy 3`             | 完整复制倒数第三条 AI 消息。                       |
| `/copy 2 code python` | 从倒数第二条消息中复制最后一个 `python` 代码块。   |
| `/copy 3 latex`       | 从倒数第三条消息中复制最后一个 LaTeX 块。          |

`/copy 1` 等同于 `/copy`。如果 N 超过会话中 AI 消息的总数，`/copy` 会报告实际数量而不复制任何内容。不带前导整数时，`/copy code python 2` 等子选择器保持其原有含义（最后一条消息中的第 2 个 `python` 块）。

## 当前限制

- Mermaid 图像渲染依赖于 Mermaid CLI 和终端图像支持。
- TUI 中禁用了异步 iTerm2 内联图像定位，因为该协议受光标位置限制；交互式图像预览请使用 Kitty/Ghostty 或 ANSI 回退。
- 线框 Mermaid 渲染是可读的终端预览，而非完整的 Mermaid 布局引擎。
- Raw 模式对所有渲染 Markdown 块全局生效，不支持逐块切换。
- LaTeX 渲染覆盖常见符号和表达式，不支持完整的 TeX 布局。
- 源码复制命令默认以最后一条 AI 回复为目标，或在以 `/copy N ...` 形式调用时以倒数第 N 条为目标。
