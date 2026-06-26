# Markdown 渲染

Qwen Code 直接在 TUI 中渲染常见的 Markdown 结构，让模型答案更易于浏览，无需离开终端。渲染器的设计目标是让原始源码始终可访问，尤其是对于 Mermaid 图和 LaTeX 数学公式等可视化内容。

## Render 与 Raw 模式

默认情况下，Markdown 以 `render` 模式显示。支持的块会尽可能渲染为视觉预览：

- Mermaid fenced 代码块
- Markdown 表格
- 任务列表
- 引用块
- 内联和块级 LaTeX 数学
- 带语法高亮的 fenced 代码块

按下 `Alt/Option+M` 可在当前会话中切换模式。在 macOS 上，终端必须将 Option 键设置为 Meta 才能使用此快捷键；否则 Option+M 会被视为普通文本输入。

- `render`：为支持的 Markdown 显示丰富的终端预览。
- `raw`：对 Mermaid、表格和 LaTeX 等可视化块显示源码导向的 Markdown。

要默认以 raw 模式启动 Qwen Code，请设置 `ui.renderMode`：

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

可接受的值是 `"render"` 和 `"raw"`。该快捷键仅更改当前会话的视图，不会修改你的设置文件。

## Mermaid

Fenced 的 `mermaid` 代码块在 `render` 模式下会进行视觉渲染。TUI 使用分层策略：

1. 如果已启用并受支持，Qwen Code 会请求 Mermaid CLI（`mmdc`）将图表渲染为 PNG，并将其发送到终端图像协议。
2. 如果终端图像不可用但已安装 `chafa`，则相同的 PNG 可转换为 ANSI 块图形。
3. 否则，Qwen Code 会回退到终端线框或紧凑文本预览。
4. 如果某个 Mermaid 图表类型无法预览，Qwen Code 会显示原始的 fenced 源码，而不是将其隐藏在占位符后面。

Mermaid 图片渲染默认是禁用的，因为它需要外部渲染器和终端图像支持。启用方法如下：

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

可选环境变量：

| 变量                                             | 描述                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`            | 启用外部 Mermaid 图片渲染。                                                  |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`             | 在其他地方启用时，禁用 Mermaid 图片渲染。                                    |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`         | 强制使用 Kitty 协议输出。适用于诸如 Kitty 和 Ghostty 等终端。                |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`        | 请求 iTerm2 内联图片。交互式 TUI 渲染会回退到文本/ANSI。                     |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`           | 禁用终端图像协议，允许文本或 `chafa` 回退。                                  |
| `QWEN_CODE_MERMAID_MMD_CLI=/path/to/mmdc`        | 使用特定的 Mermaid CLI 可执行文件。                                          |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`                  | 允许 Qwen Code 在未安装 `mmdc` 时运行 `npx @mermaid-js/mermaid-cli`。        |
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1`      | 允许项目本地的渲染器二进制文件（位于 `node_modules/.bin`）。                  |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`            | 覆盖 PNG 渲染宽度。                                                          |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000`      | 覆盖外部渲染超时时间，上限为 60000 毫秒。                                    |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`        | 调整终端字体单元格几何形状的图片行适配。                                      |

首次图片渲染可能较慢，尤其是当 `npx` 需要解析或下载 Mermaid CLI 时。在流式输出期间，Qwen Code 会显示一个有界文本预览，并仅在模型响应完成后尝试图片渲染。

### 复制 Mermaid 源码

每个渲染后的 Mermaid 块都包含一个源码提示，例如：

```text
Mermaid flowchart (TD) · source: /copy mermaid 1
```

使用以下命令从最后一条 AI 回复中复制 Mermaid 源码：

| 命令                    | 行为                                     |
| ----------------------- | ---------------------------------------- |
| `/copy mermaid`         | 复制最后一个 Mermaid 块。                |
| `/copy mermaid 1`       | 复制第一个 Mermaid 块。                  |
| `/copy code mermaid`    | 复制最后一个 fenced 的 `mermaid` 代码块。 |
| `/copy code mermaid 1`  | 复制第一个 fenced 的 `mermaid` 代码块。   |

`/copy code 1` 会统计所有 fenced 代码块，而不仅仅是 Mermaid 块。当你想要渲染标题中显示的特定于 Mermaid 的序号时，请使用 `/copy mermaid N`。

## LaTeX 数学

Qwen Code 支持在终端中渲染基本的内联和块级 LaTeX：

```markdown
Inline math: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```

渲染器专注于常见符号和可读的终端输出。它不是完整的 TeX 引擎；对于矩阵、对齐方程以及大型嵌套表达式等复杂布局，可能会进行简化。

内联的 `$...$` 表达式有意限定为每行 1024 个字符，以防止格式错误或非常大的生成的 Markdown 阻塞终端渲染。更长的公式将以源码文本的形式保持可见，并仍可从 raw 模式或原始回复中复制。

### 复制 LaTeX 源码

使用以下命令从最后一条 AI 回复中复制 LaTeX 源码：

| 命令                    | 行为                                  |
| ----------------------- | ------------------------------------- |
| `/copy latex`           | 复制最后一个块级 LaTeX 表达式。       |
| `/copy latex 2`         | 复制第二个块级表达式。                |
| `/copy latex inline`    | 复制最后一个内联表达式。              |
| `/copy latex inline 2`  | 复制第二个内联表达式。                |
| `/copy inline-latex 2`  | 是 `/copy latex inline 2` 的别名。     |

内联 LaTeX 在渲染文本中不会显示每个表达式的复制提示，以免使正文变得杂乱。当你想要就地检查内联源码时，使用 `Alt/Option+M` 切换到 raw 模式；在 macOS 上这需要将 Option 键设置为 Meta 的终端输入。

## 通用代码复制

`/copy code` 命令从最后一条 AI Markdown 回复中读取 fenced 代码块：

| 命令                    | 行为                                  |
| ----------------------- | ------------------------------------- |
| `/copy code`            | 复制最后一个 fenced 代码块。          |
| `/copy code 2`          | 复制第二个 fenced 代码块。            |
| `/copy code typescript` | 复制最后一个 `typescript` 代码块。    |
| `/copy code mermaid 1`  | 复制第一个 `mermaid` 代码块。         |

## 选择更早的 AI 消息

默认情况下，`/copy` 针对最近的一条 AI 消息。在命令前添加一个正整数，可以从倒数第 N 条 AI 消息中复制——当最新回复信息量较低（例如 TODO 更新）而实质性输出在一两个回合之前时，这很方便。

| 命令                     | 行为                                                |
| ------------------------ | --------------------------------------------------- |
| `/copy 2`                | 完整复制倒数第二条 AI 消息。                        |
| `/copy 3`                | 完整复制倒数第三条 AI 消息。                        |
| `/copy 2 code python`    | 从倒数第二条消息中复制最后一个 `python` 代码块。    |
| `/copy 3 latex`          | 从倒数第三条消息中复制最后一个 LaTeX 块。            |

`/copy 1` 等同于 `/copy`。如果 `N` 超过了会话中 AI 消息的数量，`/copy` 会报告实际数量，而不是复制任何内容。没有前导整数时，子选择器如 `/copy code python 2` 保持其现有含义（最后一条消息中的第二个 `python` 块）。

## 当前限制

- Mermaid 图片渲染依赖于 Mermaid CLI 以及终端图像支持。
- 在 TUI 中禁用了异步 iTerm2 内联图片放置，因为该协议绑定于光标位置；请使用 Kitty/Ghostty 或 ANSI 回退来获得交互式图片预览。
- 线框 Mermaid 渲染是一个可读的终端预览，并非完整的 Mermaid 布局引擎。
- Raw 模式是全局应用于渲染的 Markdown 块的，并非逐个块的切换。
- LaTeX 渲染涵盖常见符号和表达式，而非完整的 TeX 布局。
- 源码复制命令默认针对最后一条 AI 回复，或以 `/copy N ...` 形式调用时针对倒数第 N 条。