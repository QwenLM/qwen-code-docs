# Showcase i18n 国际化方案指南

## 方案概述

Showcase 页面采用 **JSON 驱动 + 构建时生成** 的 i18n 方案：

- **单一数据源**：每种语言的翻译内容存储在 `showcase-i18n/{lang}.json` 中
- **构建时生成**：通过脚本从 JSON 自动生成各语言的 MDX 文件到 `content/{lang}/showcase/`
- **zh 为基准**：`zh.json` 是所有 showcase 的基准，其他语言缺失的 showcase 会自动回退到中文

### 架构图

```
showcase-i18n/
├── zh.json          ← 中文（基准，所有 showcase 必须在这里有定义）
├── en.json          ← 英文翻译
├── de.json          ← 德文翻译
├── fr.json          ← 法文翻译
├── ja.json          ← 日文翻译
├── pt-BR.json       ← 葡萄牙语翻译
└── ru.json          ← 俄语翻译

    ↓ 构建时运行 generate-showcase-mdx.js

content/
├── zh/showcase/*.mdx    ← 生成的中文 MDX
├── en/showcase/*.mdx    ← 生成的英文 MDX
├── de/showcase/*.mdx    ← 生成的德文 MDX
├── fr/showcase/*.mdx    ← 生成的法文 MDX
├── ja/showcase/*.mdx    ← 生成的日文 MDX
├── pt-BR/showcase/*.mdx ← 生成的葡萄牙语 MDX
└── ru/showcase/*.mdx    ← 生成的俄语 MDX
```

### 构建流程

`npm run build` 或 `npm run dev` 时会自动执行：

```
generate-showcase-data.js  →  生成 src/generated/showcase-data.json（索引页数据）
generate-showcase-mdx.js   →  从 JSON 生成各语言 MDX 文件（详情页）
next build                 →  Next.js 构建
```

---

## 如何添加新的 Showcase

### 步骤 1：编辑 `showcase-i18n/zh.json`

在 `zh.json` 中添加一个新的 key-value 对。key 是 showcase 的 ID（也是 URL slug），value 包含结构化字段。

```json
{
  "my-new-showcase": {
    "title": "我的新案例标题",
    "description": "一句话描述这个案例的功能和价值",
    "category": "编程开发",
    "features": ["Agent 模式", "GitHub"],
    "thumbnail": "https://img.alicdn.com/imgextra/xxx.png",
    "videoUrl": "https://cloud.video.taobao.com/vod/xxx.mp4",
    "model": "qwen3.5-plus",
    "author": "Qwen Code Team",
    "date": "2025-06-01",
    "overview": "这里是案例的概述文本，支持 Markdown 格式。描述这个案例解决什么问题、有什么价值。",
    "steps": [
      {
        "title": "第一步标题",
        "blocks": [
          { "type": "text", "value": "描述第一步的操作，支持 Markdown 格式。" },
          { "type": "code", "lang": "bash", "value": "qwen-code --version" },
          { "type": "text", "value": "执行完成后你会看到版本号输出。" }
        ]
      },
      {
        "title": "第二步标题",
        "blocks": [
          { "type": "text", "value": "描述第二步的操作。" },
          { "type": "image", "src": "https://img.alicdn.com/imgextra/xxx.png", "alt": "操作截图" },
          { "type": "callout", "calloutType": "info", "value": "这是一条提示信息。" }
        ]
      }
    ],
    "callouts": [
      {
        "type": "info",
        "content": "提示信息文本"
      }
    ]
  }
}
```

#### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | ✅ | 案例标题 |
| `description` | ✅ | 一句话描述 |
| `category` | ✅ | 分类，可选值：`入门指南`、`编程开发`、`设计创作`、`日常任务`、`办公提效` |
| `features` | ✅ | 功能标签数组，常用值：`Agent 模式`、`Plan 模式`、`GitHub`、`Skills`、`MCP`、`Web Search`、`Cowork`、`LSP`、`Headless`、`API`、`chat`、`insight`、`Remotion`、`安装`、`设置`、`多语言`、`终端操作`、`文件操作`、`文件引用`、`图片识别`、`图片生成`、`导出对话`、`体验优化` |
| `thumbnail` | ✅ | 封面图 URL |
| `videoUrl` | ❌ | 视频 URL（没有视频时省略，页面会自动用 thumbnail 展示静态图片） |
| `model` | ❌ | 使用的模型，默认 `qwen3.5-plus` |
| `author` | ❌ | 作者名称，默认 `Qwen Code Team` |
| `date` | ❌ | 发布日期（`YYYY-MM-DD` 格式），用于排序（最新在前） |
| `overview` | ✅ | 概述文本，支持 Markdown 格式 |
| `steps` | ✅ | 操作步骤数组，每个元素包含 `title`（步骤标题）和 `blocks`（内容块数组，见下方说明） |
| `callouts` | ❌ | 提示信息数组，每个元素包含 `type`（`info`/`warning`/`tip`）和 `content`（提示文本） |
| `relatedLinks` | ❌ | 相关推荐数组，每个元素包含 `title` 和 `href` |

#### 以下内容由脚本自动生成，不需要手动配置

- **章节标题**（`## 概述`、`## 操作步骤` 等）：根据语言自动使用对应翻译
- **ShowcaseDetailMeta 组件**：从 `category`、`features`、`model` 字段自动生成
- **视频/图片展示**：从 `videoUrl` 和 `thumbnail` 自动生成
- **ShowcaseDetailCta 按钮**：自动添加在页面底部
- **import 语句**：自动添加

#### Steps 的 blocks 格式

每个 step 的 `blocks` 是一个数组，每个元素是一个内容块，支持 4 种类型：

| Block 类型 | 字段 | 说明 |
|-----------|------|------|
| `text` | `value` | 纯文本/Markdown 段落 |
| `code` | `lang`, `value` | 代码块，`lang` 为语言标识（如 `bash`、`json`），`value` 为代码内容 |
| `image` | `src`, `alt` | 图片，`src` 为图片 URL，`alt` 为替代文本 |
| `callout` | `calloutType`, `value` | 提示信息，`calloutType` 为 `info`/`warning`/`tip`，`value` 为提示文本 |

示例：

```json
{
  "title": "获取 API Key",
  "blocks": [
    { "type": "text", "value": "访问阿里云百炼平台，找到 API Key 管理页面。" },
    { "type": "image", "src": "https://img.alicdn.com/imgextra/xxx.png", "alt": "API Key 页面" },
    { "type": "callout", "calloutType": "warning", "value": "请妥善保管你的 API Key，不要泄露给他人。" },
    { "type": "code", "lang": "bash", "value": "export API_KEY=your-key-here" }
  ]
}
```

> **优点**：配置者不需要记 Markdown 语法，代码块不需要写 ` ``` ` 标记，图片不需要写 `<img>` 标签。翻译时只需翻译 `text` 和 `callout` 类型的 blocks，`code` 和 `image` 跳过。

### 步骤 2：添加其他语言的翻译

在 `en.json`、`ja.json` 等文件中添加同一个 ID 的翻译版本。

**需要翻译的字段**：
- `title` — 标题
- `description` — 描述
- `category` — 分类名称（如 `Programming`、`プログラミング`）
- `overview` — 概述文本
- `steps[].title` — 步骤标题
- `steps[].content` — 步骤内容（文本部分翻译，代码块保持原样）
- `callouts[].content` — 提示信息文本

**不需要翻译的字段**：
- `thumbnail` — 图片 URL（各语言共用）
- `videoUrl` — 视频 URL（各语言共用）
- `model` — 模型名称
- `features` — 功能标签（保持原样）

#### 各语言的章节标题对照

| 中文 | 英文 | 日文 | 德文 | 法文 | 俄文 | 葡萄牙语 |
|------|------|------|------|------|------|----------|
| 概述 | Overview | 概要 | Übersicht | Vue d'ensemble | Обзор | Visão geral |
| 操作步骤 | Steps | 操作手順 | Schritte | Étapes | Шаги | Passos |
| 相关推荐 | Related | 関連コンテンツ | Verwandte Empfehlungen | Recommandations connexes | Связанные рекомендации | Recomendações relacionadas |

#### 各语言的分类名称对照

| 中文 | 英文 | 日文 | 德文 | 法文 | 俄文 | 葡萄牙语 |
|------|------|------|------|------|------|----------|
| 入门指南 | Getting Started | 入門ガイド | Erste Schritte | Guide de démarrage | Руководство по началу работы | Guia de Início |
| 编程开发 | Programming | プログラミング | Programmierung | Programmation | Программирование | Programação |
| 日常任务 | Daily Tasks | 日常タスク | Tägliche Aufgaben | Tâches quotidiennes | Ежедневные задачи | Tarefas Diárias |
| 办公提效 | Daily Tasks | 日常タスク | Tägliche Aufgaben | Tâches quotidiennes | Ежедневные задачи | Tarefas Diárias |
| 设计创作 | Creator Tools | クリエイターツール | Kreativ-Tools | Outils créatifs | Инструменты для творчества | Ferramentas de Criação |

> **提示**：如果某个语言暂时没有翻译，可以不添加。生成脚本会自动回退到中文内容。

### 步骤 3：生成 MDX 文件

运行生成脚本：

```bash
cd website
node scripts/generate-showcase-mdx.js
```

脚本会自动：
1. 读取 `zh.json` 获取所有 showcase ID
2. 对每种语言，从对应的 `{lang}.json` 读取翻译（缺失则回退到 zh）
3. 生成 `content/{lang}/showcase/{id}.mdx` 文件

### 步骤 4：验证

启动 dev server 验证：

```bash
npm run dev
```

访问 `http://localhost:3000/{lang}/showcase/{id}/` 确认各语言页面正常。

---

## 脚本说明

### `scripts/extract-showcase-data.js`

从 MDX 文件提取数据到 JSON。主要用于初始化或从其他分支导入翻译。

```bash
# 从当前 zh 目录提取
node scripts/extract-showcase-data.js

# 从 git 分支提取所有语言
node scripts/extract-showcase-data.js --from-git branch-name
```

### `scripts/generate-showcase-mdx.js`

从 JSON 生成 MDX 文件。构建时自动运行。

```bash
# 生成所有语言
node scripts/generate-showcase-mdx.js

# 只生成指定语言
node scripts/generate-showcase-mdx.js en ja
```

### `scripts/generate-showcase-data.js`

从 zh 的 MDX 文件生成索引页数据（`src/generated/showcase-data.json`）。构建时自动运行。

### `scripts/watch-showcase.js`

Watch 模式：监听 `showcase-i18n/*.json` 的变化，自动重新生成 MDX 文件。

```bash
# 在另一个终端窗口中运行
npm run watch-showcase
```

配合 `npm run dev` 使用，修改 JSON 后无需手动跑脚本，MDX 会自动更新，Next.js 热更新会立即生效。

**开发时推荐的工作流**：

```bash
# 终端 1：启动 dev server
npm run dev

# 终端 2：启动 watch 模式
npm run watch-showcase

# 然后修改 showcase-i18n/*.json，页面会自动更新
```

---

## 组件说明

所有 showcase 相关组件都已支持动态 locale 检测（通过 `useLocale()` hook）：

| 组件 | 文件 | 功能 |
|------|------|------|
| `ShowcaseDetailMeta` | `src/components/showcase-detail-meta.tsx` | 详情页元信息（分类/功能/模型/分享） |
| `ShowcaseDetailCta` | `src/components/showcase-detail-meta.tsx` | 详情页底部 CTA 按钮（多语言文案） |
| `VideoShowcaseIndex` | `src/components/video-showcase-index.tsx` | Showcase 索引页 |
| `VideoShowcaseDetail` | `src/components/video-showcase-detail.tsx` | 视频 Showcase 详情页 |
| `ShowcaseCards` | `src/components/showcase-cards.tsx` | Showcase 卡片列表 |

---

## 注意事项

1. **zh.json 是基准**：所有新 showcase 必须先在 `zh.json` 中定义，其他语言的 JSON 中多出的 ID 会被忽略
2. **不要手动编辑生成的 MDX**：`content/{lang}/showcase/*.mdx` 文件由脚本生成，手动修改会在下次构建时被覆盖
3. **index.mdx 不受管理**：各语言的 `showcase/index.mdx` 不由生成脚本管理，需要手动维护
4. **body 中的 JSON 转义**：在 JSON 中编写 body 时，注意换行用 `\n`，双引号用 `\"`
5. **videoUrl 可选**：没有视频的 showcase 可以省略 `videoUrl` 字段，frontmatter 中不会生成该行
