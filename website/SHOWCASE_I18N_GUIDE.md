# Showcase 开发指南

## 快速开始

Showcase 页面采用 **JSON 配置 + 构建时自动生成** 的方式管理。你只需要编辑 JSON 文件，脚本会自动生成所有语言的页面。

### 开发环境

```bash
# 终端 1：启动 dev server
npm run dev

# 终端 2：启动 watch 模式（修改 JSON 后自动刷新页面）
npm run watch-showcase
```

启动后访问 `http://localhost:3000/{lang}/showcase/{id}/` 查看效果。

---

## 添加新的 Showcase

### 第 1 步：在 `showcase-i18n/zh.json` 中添加配置

在 JSON 文件中添加一个新条目，key 就是页面的 URL slug：

```json
{
  "my-new-showcase": {
    "title": "案例标题",
    "description": "一句话描述",
    "category": "编程开发",
    "features": ["Agent 模式", "GitHub"],
    "thumbnail": "https://img.alicdn.com/imgextra/xxx.png",
    "videoUrl": "https://cloud.video.taobao.com/vod/xxx.mp4",
    "model": "qwen3.5-plus",
    "author": "Qwen Code Team",
    "date": "2025-07-01",
    "overview": "概述文本，描述这个案例解决什么问题。",
    "steps": [
      {
        "title": "第一步标题",
        "blocks": [
          { "type": "text", "value": "操作说明文本。" },
          { "type": "code", "lang": "bash", "value": "qwen-code --version" }
        ]
      },
      {
        "title": "第二步标题",
        "blocks": [
          { "type": "text", "value": "更多操作说明。" },
          { "type": "image", "src": "https://img.alicdn.com/xxx.png", "alt": "截图" }
        ]
      }
    ],
    "callouts": [
      { "type": "info", "content": "页面底部的提示信息。" }
    ]
  }
}
```

### 第 2 步：添加其他语言的翻译（可选）

在 `en.json`、`ja.json` 等文件中添加同一个 ID 的翻译版本。**没有翻译的语言会自动回退到中文**。

### 第 3 步：生成页面

如果你已经启动了 `npm run watch-showcase`，保存 JSON 后页面会自动更新。

否则手动运行：

```bash
node scripts/generate-showcase-mdx.js
```

---

## 字段参考

### 基础字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | ✅ | 案例标题 |
| `description` | ✅ | 一句话描述 |
| `category` | ✅ | 分类（见下方可选值） |
| `features` | ✅ | 功能标签数组 |
| `thumbnail` | ✅ | 封面图 URL |
| `videoUrl` | ❌ | 视频 URL（省略时页面展示封面图） |
| `model` | ❌ | 使用的模型，默认 `qwen3.5-plus` |
| `author` | ❌ | 作者名称，默认 `Qwen Code Team` |
| `date` | ❌ | 发布日期（`YYYY-MM-DD`），用于排序（最新在前） |
| `overview` | ✅ | 概述文本，支持 Markdown |
| `steps` | ✅ | 操作步骤数组 |
| `callouts` | ❌ | 页面底部的提示信息数组 |
| `relatedLinks` | ❌ | 相关推荐链接数组 |

### category 可选值

`入门指南` · `编程开发` · `设计创作` · `日常任务` · `办公提效`

### features 常用值

`Agent 模式` · `Plan 模式` · `GitHub` · `Skills` · `MCP` · `Web Search` · `Cowork` · `LSP` · `Headless` · `API` · `chat` · `insight` · `Remotion` · `安装` · `设置` · `多语言` · `终端操作` · `文件操作` · `文件引用` · `图片识别` · `图片生成` · `导出对话` · `体验优化`

### Steps 的 blocks 格式

每个 step 包含 `title`（标题）和 `blocks`（内容块数组）。blocks 支持 4 种类型：

| 类型 | 字段 | 说明 | 需要翻译 |
|------|------|------|----------|
| `text` | `value` | 文本段落，支持 Markdown | ✅ |
| `code` | `lang`, `value` | 代码块 | ❌ |
| `image` | `src`, `alt` | 图片 | ❌ |
| `callout` | `calloutType`, `value` | 提示框（`info` / `warning` / `tip`） | ✅ |

示例：

```json
{
  "title": "获取 API Key",
  "blocks": [
    { "type": "text", "value": "访问百炼平台，找到 API Key 管理页面。" },
    { "type": "image", "src": "https://img.alicdn.com/xxx.png", "alt": "API Key 页面" },
    { "type": "callout", "calloutType": "warning", "value": "请妥善保管你的 API Key。" },
    { "type": "code", "lang": "bash", "value": "export API_KEY=your-key-here" }
  ]
}
```

### 自动生成的内容（不需要配置）

以下内容由脚本自动处理，你不需要手动编写：

- 章节标题（`## 概述`、`## 操作步骤`）— 根据语言自动翻译
- `ShowcaseDetailMeta` 组件 — 从 category / features / model / author 自动生成
- 视频/图片展示 — 从 videoUrl / thumbnail 自动生成
- CTA 按钮 — 自动添加在页面底部
- import 语句 — 自动添加

---

## 翻译指南

### 需要翻译的字段

- `title` — 标题
- `description` — 描述
- `category` — 分类名称
- `overview` — 概述文本
- `steps[].title` — 步骤标题
- `steps[].blocks[]` 中 `type: "text"` 和 `type: "callout"` 的 `value`
- `callouts[].content` — 提示信息

### 不需要翻译的字段

`thumbnail` · `videoUrl` · `model` · `features` · `steps[].blocks[]` 中 `type: "code"` 和 `type: "image"` 的内容

### 各语言分类名称对照

| 中文 | 英文 | 日文 | 德文 | 法文 | 俄文 | 葡萄牙语 |
|------|------|------|------|------|------|----------|
| 入门指南 | Getting Started | 入門ガイド | Erste Schritte | Guide de démarrage | Руководство по началу работы | Guia de Início |
| 编程开发 | Programming | プログラミング | Programmierung | Programmation | Программирование | Programação |
| 日常任务 | Daily Tasks | 日常タスク | Tägliche Aufgaben | Tâches quotidiennes | Ежедневные задачи | Tarefas Diárias |
| 办公提效 | Daily Tasks | 日常タスク | Tägliche Aufgaben | Tâches quotidiennes | Ежедневные задачи | Tarefas Diárias |
| 设计创作 | Creator Tools | クリエイターツール | Kreativ-Tools | Outils créatifs | Инструменты для творчества | Ferramentas de Criação |

---

## 项目结构

```
showcase-i18n/
├── zh.json              ← 中文（基准，所有 showcase 必须在这里定义）
├── en.json              ← 英文翻译
├── de.json              ← 德文翻译
├── fr.json              ← 法文翻译
├── ja.json              ← 日文翻译
├── pt-BR.json           ← 葡萄牙语翻译
└── ru.json              ← 俄语翻译

scripts/
├── generate-showcase-mdx.js     ← JSON → MDX 生成（构建时自动运行）
├── generate-showcase-data.js    ← 生成索引页数据（构建时自动运行）
├── watch-showcase.js            ← Watch 模式（开发时使用）
├── extract-showcase-data.js     ← MDX → JSON 提取（迁移工具）
└── restructure-steps-to-blocks.js ← content → blocks 迁移（一次性工具）

content/{lang}/showcase/
└── *.mdx                ← 自动生成的页面文件（不要手动编辑）
```

### 构建流程

```
npm run dev / build
  │
  ├── 1. generate-showcase-mdx    →  从 JSON 生成各语言 MDX 文件
  ├── 2. generate-showcase         →  从 MDX 提取索引页数据
  └── 3. next dev / next build     →  Next.js 编译
```

---

## 可用的 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（自动生成 MDX） |
| `npm run build` | 生产构建（自动生成 MDX） |
| `npm run watch-showcase` | Watch 模式，JSON 变化自动重新生成 MDX |
| `npm run generate-showcase-mdx` | 手动生成所有语言的 MDX 文件 |
| `npm run generate-showcase` | 手动生成索引页数据 |

---

## 相关组件

| 组件 | 文件 | 功能 |
|------|------|------|
| `ShowcaseDetailMeta` | `src/components/showcase-detail-meta.tsx` | 详情页元信息 |
| `ShowcaseDetailCta` | `src/components/showcase-detail-meta.tsx` | 详情页 CTA 按钮（7 种语言） |
| `VideoShowcaseIndex` | `src/components/video-showcase-index.tsx` | 索引页 |
| `VideoShowcaseDetail` | `src/components/video-showcase-detail.tsx` | 视频详情页 |
| `ShowcaseCards` | `src/components/showcase-cards.tsx` | 卡片列表 |

所有组件通过 `useLocale()` hook 自动检测当前语言，动态生成对应的链接和文案。

---

## 注意事项

1. **zh.json 是基准** — 所有新 showcase 必须先在 `zh.json` 中定义
2. **不要手动编辑 MDX** — `content/{lang}/showcase/*.mdx` 由脚本生成，手动修改会被覆盖
3. **index.mdx 不受管理** — 各语言的 `showcase/index.mdx` 需要手动维护
4. **JSON 中的换行** — 使用 `\n` 表示换行，`\"` 表示双引号
5. **videoUrl 可选** — 没有视频的 showcase 省略此字段即可
