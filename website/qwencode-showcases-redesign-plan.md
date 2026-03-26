---
aliases:
tags:
  - 工作/运营
  - ai/tools
status:
  - 🟡 Ongoing
URL: https://qwenlm.github.io/qwen-code-docs/zh/showcase/
type:
  - worknotes
  - tasks
project: "[[qwencode产品运营]]"
achieved: false
created: 2026-03-24 15:34
updated: 2026-03-25 18:09
---

> [!note]- 页面效果
> 
> ![[20260325.png]]
## 一、核心洞察

### 问卷发现

| 维度 | 数据 |
|------|------|
| 调研样本 | 75 份有效问卷 |
| AI 使用阶段 | 84% 已深度融入工作 |
| 最想要的内容 | 87% 期待「真实项目落地案例」 |

**用户原声：**

> " 分享个不是 demo 的，用 AI 编码如何在老项目里面去落地，真正上线的。"
> " 希望能学到马上能用的干货。" —— 47 人提及

### Claude 对标发现的问题

| 维度   | Claude          | Qwen Code | 问题           |
| ---- | --------------- | --------- | ------------ |
| 详情页  | 独立页面，含操作步骤 + 复制命令 | 视频弹窗      | 用户看完不知道怎么操作  |
| 用户故事 | 有用户原声、公司背书      | 无         | 缺少信任信号       |
| 案例数量 | 85 个             | 48 个       | 数量足够，问题在呈现方式 |

**结论**：案例数量充足，但缺少详情页和用户故事，导致用户「看完不会用」。

---

## 二、优化方向与结构设计

### 优化方向

| 问题    | 方案                 | 优先级 |
| ----- | ------------------ | --- |
| 无详情页  | 增加独立详情页，含操作步骤、复制命令 | P0  |
| 无用户故事 | 补充真实用户反馈 & 添加不同作者  | P0  |
| 无教程引导 | 新增教程模块，层级难度上手      | P1  |
| 筛选单一  | 增加按角色、功能筛选         | P1  |

### 页面结构（4 层）

```
Hero：整体 Qwen Code 效果和 demo 演示
  ↓
真实案例：筛选 + 卡片网格 + CTA
  ↓
学习路径：入门10分钟 / 进阶1小时 / 高级实战
  ↓
安全合规：数据安全 / 代码分享 / 内网使用 / 合规检查
```

### 详情页结构

```
标题 + 元信息（角色/模型/功能/难度/时长）
演示视频
案例描述 + 操作步骤 + 复制命令
用户故事（新增）
相关案例 + 相关教程
CTA
```

---

## 三、案例对比与优先级

### Qwen Code 已有案例

| 类型 | 数量 | 分类 |
|------|------|------|
| 场景实战 | 16 个 | Quick Start(2) / 日常使用 (5) / 编程场景 (5) / 进阶技巧 (4) |
| 功能演示 | 32 个 | 入门指南 (13) / 核心功能 (15) / Skills(3) / SDK(1) |
| **总计** | **48 个** | - |

### 案例优先级

**P0 核心案例（4 个）**：对标 Claude 热门，需制作详情页

| 案例 | 分类 | 功能 | Claude 对标 |
|------|------|------|------------|
| 批量处理文件，整理桌面 | 日常任务 | Cowork | ✓ 完全对应 |
| 10 分钟搭建个人网站 | 编程开发 | Agent 模式 | ✓ 可对标 |
| 分析日记生成年度总结 | 数据分析 | Skills | 差异化优势 |
| 数据可视化仪表盘 | 数据分析 | Agent 模式 | ✓ 可对标 |

**P1 差异化案例（5 个）**：展示 Qwen 特色

| 案例 | 分类 | 功能 | 说明 |
|------|------|------|------|
| 网页截图 1:1 复刻 | 编程开发 | Agent 模式 | Claude 无同类 |
| Obsidian 白板笔记 | 内容写作 | Skills | 知识管理场景 |
| 文献综述与知识图谱 | 数据分析 | Skills | 对标 Claude |
| 项目状态报告生成 | 日常任务 | Agent 模式 | 实用性强 |
| 用户反馈分析 | 数据分析 | Skills | 对标 Claude |

**P2 补充案例（6 个）**：YouTube 转博客、PDF 扫描、流程图生成、财务模型、Todo App、开源贡献

---

## 四、下一步行动

**本周 P0：**

- [ ] 制作 4 个 P0 案例详情页
- [ ] 设计详情页模板

**下周 P1：**

- [ ] 制作 5 个 P1 案例详情页
- [ ] 教程模块设计
- [ ] 多维度筛选 UI

---

## 补充信息：Qwen Code vs Claude 案例对比

### 表一：Claude 案例占比统计

#### 分类占比

| 分类 | 数量 | 占比 |
|------|------|------|
| Professional | 15 | 17.6% |
| Personal | 14 | 16.5% |
| Education | 13 | 15.3% |
| Nonprofits | 12 | 14.1% |
| Finance | 5 | 5.9% |
| Legal | 4 | 4.7% |
| Research | 4 | 4.7% |
| Sales | 4 | 4.7% |
| Marketing | 3 | 3.5% |
| Life Sciences | 2 | 2.4% |
| HR | 1 | 1.2% |
| Claude in Chrome | 6 | 7.1% |

#### 功能占比

| 功能 | 数量 | 占比 |
|------|------|------|
| Extended Thinking | 35 | 41.2% |
| Connectors | 22 | 25.9% |
| Web Search | 12 | 14.1% |
| Custom visuals | 11 | 12.9% |
| Cowork | 10 | 11.8% |
| Browser Use | 7 | 8.2% |
| Skills | 2 | 2.4% |

#### 模型占比

| 模型 | 数量 | 占比 |
|------|------|------|
| Sonnet 4.5 | 48 | 56.5% |
| Opus 4.5 | 20 | 23.5% |
| Sonnet 4.6 | 11 | 12.9% |
| Haiku 4.5 | 6 | 7.1% |

---

### 表二：Qwen Code vs Claude 案例交叉对比

| Qwen Code 案例     | Claude 对应案例       | 分类                | 功能标签                       | 优先级 | 对比说明              |
| ---------------- | ----------------- | ----------------- | -------------------------- | --- | ----------------- |
| 批量处理文件，整理桌面      | 整理桌面上的文件          | 日常任务/Personal     | Cowork                     | P0  | 完全对应，已有博客可复用      |
| 10 分钟搭建个人作品集网站   | 创建一个自定义网页         | 编程开发/Personal     | Agent 模式                   | P0  | 可对标，需重构为详情页       |
| 分析日记并生成年度总结      | -                 | 数据分析              | Skills                     | P0  | Claude 无同类，差异化优势  |
| 数据可视化仪表盘         | 可视化程序数据、构建交互式图表工具 | 数据分析              | Agent 模式/Custom visuals    | P0  | 需新增，展示可视化能力       |
| 网页截图 1:1 复刻      | -                 | 编程开发              | Agent 模式                   | P1  | Claude 无同类，差异化优势  |
| Obsidian 可视化白板笔记 | -                 | 内容写作              | Skills                     | P1  | Claude 无同类，知识管理场景 |
| 文献综述与知识图谱        | 绘制你的文献综述、规划你的文献综述 | 数据分析/Research     | Skills/Custom visuals      | P1  | 需新增，对标 Claude     |
| 项目状态报告生成         | 生成项目状态报告          | 日常任务/Professional | Agent 模式/Connectors        | P1  | 需新增，实用性强          |
| 用户反馈分析           | 分析用户反馈中的模式        | 数据分析/Professional | Skills/Connectors          | P1  | 需新增，对标 Claude     |
| YouTube 视频转博客文章  | -                 | 内容写作              | Skills                     | P2  | Claude 无同类        |
| PDF 扫描为可编辑文本     | -                 | 日常任务              | Skills                     | P2  | Claude 无同类        |
| 流程图自动生成          | 创建流程图             | 内容写作/Professional | Agent 模式/Extended Thinking | P2  | 需新增，对标 Claude     |
| 财务模型构建           | 构建财务模型            | 数据分析/Finance      | Agent 模式/Extended Thinking | P2  | 需新增，专业场景          |
| 快速制作网页 Todo App  | -                 | 编程开发              | Agent 模式                   | P2  | Claude 无同类，入门案例   |
| 参与开源项目贡献         | -                 | 编程开发              | Agent 模式                   | P2  | Claude 无同类，开发者进阶  |
| 品牌资产创建           | 创建品牌资产            | 内容写作/Professional | Agent 模式/Web Search        | P3  | 需新增，对标 Claude     |
| 销售提案演示           | 制作销售提案演示          | 内容写作/Sales        | Agent 模式/Extended Thinking | P3  | 需新增，对标 Claude     |
| 旅行规划助手           | 制定每日旅行行程          | 日常任务/Personal     | Agent 模式/Web Search        | P3  | 需新增，对标 Claude     |

---

### 功能对应关系

| Claude 功能         | Qwen Code 对应    | 状态    |
| ----------------- | --------------- | ----- |
| Extended Thinking | 暂无              | ❌ 缺失  |
| Connectors        | MCP             | ✓ 对应  |
| Cowork            | Cowork          | ✓ 对应  |
| Custom visuals    | Agent 模式 + 代码生成 | ✓ 可实现 |
| Web Search        | MCP 工具          | ✓ 可实现 |
| Skills            | Skills          | ✓ 对应  |
| Browser Use       | 暂无              | ❌ 缺失  |
| Agent 模式          | Agent 模式        | ✓ 对应  |

# 往期视频

```mdx
import { VideoShowcase } from '@/components/video-showcase'

{/* ─── 第一层：Quick Start Hero 视频 ─── */}

export const heroVideo = {
  title: "Qwen Code 简介",
  description: "30 秒了解 Qwen Code 的核心能力：从安装到对话，再到完成你的第一个任务。你的 AI 编程伙伴，从想法到实现只需一句话。\n此视频用 Qwen Code+oss-styles Remotion 技能一键生成。",
  thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01J4G8Xc1Xm1ShJ4TSX_!!6000000002965-2-videocover-2880-1622.png",
  videoUrl: "https://cloud.video.taobao.com/vod/LfmsiJ8iFG-Rbfh6UTBCTtkWhLL6FsOeeVT10lCxNWI.mp4",
  category: "Quick Start",
  link:"https://github.com/QwenLM/qwen-code?tab=readme-ov-file#installation",
};

{/* ─── 第二层：功能演示 ─── */}

export const featureVideos = [
  // ── 入门指南：安装、配置、基础功能说明 ──
  {
    title: "脚本一键安装",
    description: "通过脚本命令快速安装 Qwen Code，几秒钟即可完成环境配置。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000002905/O1CN01wI6zQD1XKXhKNpQXZ_!!6000000002905-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/x4lFbaS9OgyXBNMytr2sR32ttE90q4pTkRD6EHSjQro.mp4",
    category: "Guide",
    command: "# Linux/macOS \ncurl -fsSL https://qwen-code.oss-cn-beijing.aliyuncs.com/install.sh | bash -s -- --install \n\n# Windows (PowerShell)\ncurl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat",
  },
  {
    title: "开始第一次对话",
    description: "安装完成后，发起你与 Qwen Code 的第一次 AI 对话。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000002613/O1CN019Vn4y71VAo2xDVswb_!!6000000002613-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/RBM4WS95LE5RkGA82JbBjTG1oVokxC-SJlMi8Jv4_fA.mp4",
    category: "Guide",
    command: "what is qwen code? Please give me a brief introduction about it.",
  },
  {
    title: "API 设置",
    description: "配置 API Key 和模型参数，自定义你的 AI 编程体验。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000006672/O1CN01q0ZOki1z9pg48tM4i_!!6000000006672-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/JNsallWn_HIKsRrl5vapZ0N0TYGFNzS_NuFpyHk4WJY.mp4",
    category: "Guide",
  },
  {
    title: "百炼 Coding Plan 模式",
    description: "配置使用百炼 Coding Plan，多模型选择，提升复杂任务的完成质量。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/O1CN01Sksw211SlxK91PdUg_!!6000000002288-2-videocover-1696-954.png",
    videoUrl: "https://cloud.video.taobao.com/vod/QrKbdt1ujUuWY7zc4Jg22cY_kg539ZRPJVHC1_blEnY.mp4",
    category: "Guide",
  },
  {
    title: "VS Code 集成界面",
    description: "Qwen Code 在 VS Code 中的完整界面展示，了解各功能区域的布局。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000003274/O1CN014Km30B1a3XqInHBJC_!!6000000003274-0-tbvideo.jpghttps://img.alicdn.com/imgextra/i4/6000000006672/O1CN01q0ZOki1z9pg48tM4i_!!6000000006672-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/IQbMf47caWPNeRPe2Z0DcCUJgip2IY5IzKRIG77yI5I.mp4",
    category: "Guide",
  },

  {
    title: "认证登录",
    description: "了解 Qwen Code 的认证流程，快速完成账号登录。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN011eGoRs1Pf8a4hXQ0K_!!6000000001867-2-tps-1700-952.png",
    category: "Guide",
    command: "/auth",
  },
  {
    title: "Headless 模式",
    description: "在无 GUI 环境下使用 Qwen Code，适用于远程服务器和 CI/CD 场景。",
    thumbnail: "https://gw.alicdn.com/imgextra/i3/O1CN01qbxpC21KcK4K7lzGt_!!6000000001184-1-tps-1280-720.gif",
    category: "Guide",
    command: "qwen --p 'what is qwen code?'",
  },
  {
    title: "@file 引用功能",
    description: "在对话中通过 @file 引用项目文件，让 AI 精准理解上下文。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN01Aaya6r1jMctBU7ajg_!!6000000004534-2-tps-1694-952.png",
    category: "Guide",
    command: "@file ./src/main.py",
  },
  {
    title: "语言切换",
    description: "在 Qwen Code 中切换 UI 和输出语言，支持多语言交互。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000005337/O1CN01dGymbF1pIOvPoDCpT_!!6000000005337-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/3shVUlMOckkpLxiic7uHHYVb8B1bdN5Pe0Up0HhOCuk.mp4",
    category: "Guide",
    command: "/language ui zh-CN",
  },
  {
    title: "Resume 会话恢复",
    description: "中断的对话可以随时恢复，不丢失任何上下文和进度。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000004411/O1CN01KJRiqA1iSIAmOCkIP_!!6000000004411-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/2oGLaR2xoX1-RcWElW2yS5QMKXe03ab_Kcd01_wTOr8.mp4",
    category: "Guide",
    command: "qwen --resume",
  },
  {
    title: "Ctrl+Y 快速重试",
    description: "对 AI 回答不满意时，使用 Ctrl(Cmd)+Y 一键重试获取更好的结果。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01YtZAzm1ShNMbf8YTt_!!6000000002278-2-tps-1694-956.png",
    category: "Guide",
  },
  {
    title: "复制字符优化",
    description: "优化的代码复制体验，精准选取和复制代码片段。",
    thumbnail: "https://gw.alicdn.com/imgextra/i3/O1CN01rFSm7o1hoRiIy0xrP_!!6000000004324-1-tps-1280-720.gif",
    category: "Guide",
  },
  {
    title: "Agents 配置文件",
    description: "通过 Agents MD 文件自定义 AI 行为，让 AI 适配你的项目规范。",
    thumbnail: "https://gw.alicdn.com/imgextra/i4/O1CN01qjVpRJ1twwS25UK0D_!!6000000005967-2-tps-1902-1144.png",
    category: "Guide",
  },

  // ── 核心功能：重点特性 ──
  {
    title: "终端输出捕获截图/动图",
    description: "产品演示必备！让 AI 执行功能测试并自动捕获终端输出信息。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000005887/O1CN01hBRUux1tMIlTGx2Ym_!!6000000005887-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/eaDeo1zyE3n6VG9QscGbOLWzzY1dGknK8YNbu3srV9w.mp4",
    category: "Features",
    command: "/skills terminal-capture",
  },
  {
    title: "Web Search",
    description: "让 Qwen Code 搜索网络内容，获取实时信息辅助编程。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000002711/O1CN01hgoJib1VtgrRAkjQc_!!6000000002711-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/FVVvz922HnDIY_STwpKaBGBb1u2JXOCdUCOL36A8WW4.mp4",
    category: "Features",
  },
  {
    title: "Plan 模式 + Web Search",
    description: "在 Plan 模式下结合 Web Search，先搜索再规划，提升任务准确性。",
    thumbnail: "https://gw.alicdn.com/imgextra/i3/O1CN016eKNFf1CtFmYQHGsd_!!6000000000138-2-tps-1694-952.png",
    category: "Features",
  },
  {
    title: "Insight 数据洞察",
    description: "查看个人 AI 使用报告，了解编程效率和协作数据。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000006496/O1CN01KNUXtG1xrDy75PPA5_!!6000000006496-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/a5X9O6PsdDdmXVqtHdjlzZ97mRNPrqroKO5cf4V71XM.mp4",
    category: "Features",
    link: "../blog/how-to-use-qwencode-insight",
    command: "/insight",
  },
  {
    title: "MCP 图片生成",
    description: "通过 MCP 接入图片生成服务，用自然语言驱动 AI 创作图像。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000008040/O1CN01S2cxYL29GNUmrvmzH_!!6000000008040-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/gQg8C_5f5MGoZE9YKCyKmHlWAgXZSTMbN8WSoN7crbc.mp4",
    category: "Features",
  },
  {
    title: "剪贴板图片粘贴",
    description: "直接粘贴剪贴板中的图片到对话，AI 即时理解图片内容。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN01OsEDov1z4nJto1CfQ_!!6000000006661-2-tps-1694-956.png",
    category: "Features",
  },
  {
    title: "图片识别",
    description: "Qwen Code 可以读取和理解图片内容，辅助视觉相关的编程任务。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000006844/O1CN011X8nmv20QbnWSqSfJ_!!6000000006844-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/1wsWdUwqhw7-x6Hx5W_qQEI58kPw_kVSPS23AIM4PqQ.mp4",
    category: "Features",
  },
  {
    title: "GitHub 命令集成",
    description: "在 Qwen Code 中直接执行 GitHub 操作，管理仓库和 PR。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/O1CN01bPIGqq27gp8F86nXp_!!6000000007827-2-videocover-1700-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/wWqieOtAazt1jJJdyZnxP0ZWYz4fuV6Ogb2wOvb8bBg.mp4",
    category: "Features",
  },
  {
    title: "LSP 智能感知",
    description: "集成 LSP 协议，提供精准的代码补全、跳转和诊断能力。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01kxCAnu1c0SPDCZsUt_!!6000000003538-2-tps-1694-948.png",
    category: "Features",
  },
  {
    title: "Agents 界面",
    description: "查看 Agents 面板，管理和切换不同的 AI Agent 配置。",
    thumbnail: "https://gw.alicdn.com/imgextra/i4/O1CN01qjVpRJ1twwS25UK0D_!!6000000005967-2-tps-1902-1144.png",
    category: "Features",
  },
  {
    title: "导出对话记录，支持多种格式",
    description: "导出对话记录，支持 Markdown、JSON 等格式。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000003561/O1CN01KmYvSF1cAzW7C9CHz_!!6000000003561-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/a4-IZVgzaAhKLdzRYhsG2dB-PPo8wG1gKlwq09gR01U.mp4",
    category: "Features",
    command: "/export html <session id>",
  },
  // ── Skills ──
  {
    title: "通过提示词安装 Skills",
    description: "在对话中直接告诉 Qwen Code 安装所需的 Skill，即装即用。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000003086/O1CN01quNtwC1YfRNyxdAsy_!!6000000003086-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/WYeH55IR7WQ8OXKqmQfjM1WyK7xZ4llKM3A_dtf19wI.mp4",
    category: "Skills",
    command: "Please first check if find-skills exists, if not, please use npx skills add https://github.com/vercel-labs/skills --skill find-skills to install this skill, then help me search for and install the skill <skill name>",
  },
  {
    title: "通过文件夹安装 Skills",
    description: "将 Skill 文件放入指定目录，Qwen Code 自动识别并加载。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000005414/O1CN01WFKT3D1prfQWynZFH_!!6000000005414-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/_3BD_A4_-nQRKqdyyHw9e8Nm1qtusA7gHKtoJlaJP28.mp4",
    category: "Skills",
  },
  {
    title: "Skills 面板",
    description: "通过 Skills 面板浏览、安装和管理已有的 Skill 扩展。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01xkzvoE1fomm8znzBG_!!6000000004054-2-tps-1694-952.png",
    category: "Skills",
    command: "/skills",
  },
  // ── SDK ──
  {
    title: "SDK 安装",
    description: "通过 SDK 快速集成 Qwen Code 到你的开发工具链中。",
    thumbnail: "https://gw.alicdn.com/imgextra/i3/O1CN014XBWSf1x1TDMSTumq_!!6000000006383-1-tps-1280-720.gif",
    category: "SDK",
  },
  {
    title: "Hooks 系统",
    description: "让 Qwen Code 在特定时刻自动执行你的脚本，比如提交代码前自动跑测试、生成代码后自动格式化。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000006240/O1CN01T5iv1Z1vxyZvXQGmi_!!6000000006240-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/2C7e0XiE1AtJSatVtoXTI3EVULxb9iPH1tOUV-4fSDw.mp4",
    category: "Features",
  },
  {
    title: "AI 主动提问",
    description: "AI 代理能在任务执行期间向你提出交互式问题，实时收集偏好、明确需求并就实施方案做出决策。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/O1CN014AyFhx1ohlFJ0qeax_!!6000000005257-2-videocover-1694-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/dYSFbvjLpgEgRpVr905lv1PI7fA5JhopPbLKb-7V6Gc.mp4",
    category: "Features",
  },
  {
    title: "扩展管理交互式 TUI",
    description: "像逛应用商店一样装扩展，浏览、安装、配置、卸载一键完成，支持键盘导航。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/O1CN01Nn0Htj1Y4LJ12cAHo_!!6000000003005-2-videocover-1694-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/TU1Mn4k3ATaeCcdc4KHT-9UZMtEIRVD7QbsYn_uvzPU.mp4",
    category: "Features",
  },
  {
    title: "MCP 管理 TUI 增强",
    description: "不用重启 Qwen Code，随时在可视化界面里启用、禁用或配置 MCP 工具，实时看到哪些工具可用。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/O1CN01TGCK1j29dHIfuG70n_!!6000000008090-2-videocover-1694-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/JT49NUzNkRV4G1H7-ETa0BxBB66ttxb9vk67aWEgQG0.mp4",
    category: "Features",
  },
];

{/* ─── 第三层：场景实战 ─── */}

export const scenarioVideos = [
  // Quick Start
  {
    title: "下载安装，快速安装启动",
    description: "一行命令安装，直接启动。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01DlD3YG1SSigum4nX2_!!6000000002246-2-tps-1696-956.png",
    videoUrl: "https://cloud.video.taobao.com/vod/okin3Lw4xAaK-6QXpG_xnH2ttE90q4pTkRD6EHSjQro.mp4",
    category: "Scenarios",
    difficulty: "quickstart",
  },
  {
    title: "快速体验：terminal 主题切换",
    description: "一句话更换 terminal 主题，可以用自然语言应用任何你想要的主题样式。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/O1CN01AsDV5C1aSHEa8IY3M_!!6000000003328-0-videocover-3163-1800.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/zxYwfE9B3STo2bLnbTBwePKBTtWPbqt6pS2BCZMJpTM.mp4",
    category: "Scenarios",
    difficulty: "quickstart",
  },
  // 日常使用
  {
    title: "自动获取生成周报",
    description: "定制技能，一行命令自动爬取本周更新，并按照设定的模板写作产品更新周报。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/O1CN01pGIjz425ghngaMvYX_!!6000000007556-2-videocover-1696-948.png",
    videoUrl: "https://cloud.video.taobao.com/vod/BrL3c4NkeIqLiT3MAAWUSp26QgM0hjN67ukuKQmgE4M.mp4",
    category: "Scenarios",
    difficulty: "office",
  },
  {
    title: "汇报展示：做 PPT",
    description: "根据产品演示的截图制作 PPT，也就是你当前看到的这个。你只需要提供截图，输入命令，然后等待，bling bling 就完成了。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/O1CN01ZlnCqO1HtmJhfhZSm_!!6000000000816-2-videocover-2546-1388.png",
    videoUrl: "https://cloud.video.taobao.com/vod/08IfFcYkp4OkyvbSDklR11rrL69fTNuc8Rkz_2ikqOg.mp4",
    category: "Scenarios",
    difficulty: "office",
  },
  // 编程场景
  {
    title: "读论文",
    description: "直接读取下载网络上的论文，比如这篇 attention is all you need，然后你可以直接跟 AI 对话学习，还可以让它生成更好理解的核心问题卡片样式，更直观阅读理解。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01616oQD1d9RnY1XuLt_!!6000000003693-2-videocover-1696-956.png",
    videoUrl: "https://cloud.video.taobao.com/vod/is3SsCe3w-U5Y0ZxL-z6reSbw8NBhnzCtQfjH26lLFE.mp4",
    category: "Scenarios",
    difficulty: "coding",
  },
  {
    title: "代码学习",
    description: "直接克隆仓库学习理解，让 Qwen Code 直接告诉你该如何给开源项目做贡献，一步步操作、全流程跟踪。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01sarW5120qFytaxHSU_!!6000000006900-2-videocover-1696-956.png",
    videoUrl: "https://cloud.video.taobao.com/vod/M44s6lya5s2ni7h3SR4AdAjDvOe1r6o8Ryq9X6MgmUA.mp4",
    category: "Scenarios",
    difficulty: "coding",
  },
  {
    title: "解决 issue",
    description: "根据上面的规划，你可以开始给开源项目解决 issue 了，这也可以使用 Qwen Code 解决，还可以模拟终端截图上传。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01NVsgsm28t1IKZxoN3_!!6000000007989-2-videocover-1700-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/HV0QgHEac8zu3tL7gJqqMZlZDtHaFeNNoJ412hgkKYI.mp4",
    category: "Scenarios",
    difficulty: "coding",
  },
  {
    title: "PR Review",
    description: "解决了 issue，自动提交了 pr，你还可以直接使用 Qwen Code 对 PR 进行测试 review，如果是你的项目，别人给你提交了 PR，也可以交给 Qwen Code 进行审查。大大提高项目迭代效率。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/O1CN01bPIGqq27gp8F86nXp_!!6000000007827-2-videocover-1700-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/Eu3Gyad-mLiz_FZqrXp76EZWYz4fuV6Ogb2wOvb8bBg.mp4",
    category: "Scenarios",
    difficulty: "coding",
  },
  // 进阶技巧
  {
    title: "给自己开源项目做个宣传视频",
    description: "给开源项目做了贡献或者有了自己的开源项目，还可以直接提供仓库地址给项目做个演示视频。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN01KKPAv51ZL7QcgguxA_!!6000000003177-2-tps-2880-1622.png",
    videoUrl: "https://cloud.video.taobao.com/vod/TwRRLlr4EHfv-8kvb0J-w7zj70zxoGY7wiaPewqm4l0.mp4",
    category: "Scenarios",
    difficulty: "advanced",
    command: "based on this skill：https://github.com/QwenLM/qwen-code-examples/blob/main/skills/oss-styles/SKILL.md, help me to generate a video for <your repository url>",
  },
  {
    title: "一句话制作个人简历",
    description: "你可以整合经历都写进简历，再让 Qwen Code 根据简历制作出你的展示页面，还可以直接打印导出为 PDF，方便投递。",
    thumbnail: "https://gw.alicdn.com/imgextra/i4/O1CN018tZPON1f8BwaGqauX_!!6000000003961-2-tps-2880-1622.png",
    videoUrl: "https://cloud.video.taobao.com/vod/XSaE8Uzz45gLXvG-PaKVdFTnQpUM2QJ3qRg3R0SPnrs.mp4",
    category: "Scenarios",
    difficulty: "advanced",
  },
  {
    title: "将 YouTube 视频转为博客文章",
    description: "学习如何使用 Qwen Code 和 SOP 技能将 YouTube 视频转换为博客文章。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000000040/O1CN0173NMvF1CAMxpe5nTJ_!!6000000000040-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/P9CitZbzQunRT0QIkeZcEbhN5bSLiR95LftYE_t5BpY.mp4",
    category: "Scenarios",
    difficulty: "office",
  },
  {
    title: "一句话复刻你喜欢的网站",
    description: "截图给 Qwen Code，告诉它你想复刻的网站，它会帮你分析页面结构并生成代码。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000004217/O1CN01N9wncm1h1RKqs79Cs_!!6000000004217-0-tbvideo.jpghttps://img.alicdn.com/imgextra/i1/6000000005112/O1CN01CDiWA71ndLoafEhqx_!!6000000005112-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/corQwW7xwjNzdBg3gRnrbMX-nzXh2z0N0pSIECERpPc.mp4",
    category: "Scenarios",
    difficulty: "coding",
    link: "../blog/qwencode-coding-plan-guide-build-website",
  },

    {
    title: "一句话写入文件",
    description: "告诉 Qwen Code 要写什么内容，它会直接帮你创建和写入文件，免去手动操作。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000003593/O1CN0139ueiV1cPeBczAQyA_!!6000000003593-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/ToffPMLiVnt3c_HDiisOPcfaWGYmYVsH3hIuj3YWBVg.mp4",
    category: "Scenarios",
    difficulty: "office",
  },
  {
    title: "整理桌面文件",
    description: "用一句话让 Qwen Code 帮你自动整理桌面文件，按类型归类到对应文件夹。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000007569/O1CN01biAMzk25mewsNAHie_!!6000000007569-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/yWnCuZwvlYmYhhq-NuQ9AwNpg5b_KUKZNV8AFJTBMzw.mp4",
    category: "Scenarios",
    difficulty: "office",
  },
  {
    title: "Remotion 视频创作（提示词方式）",
    description: "通过自然语言描述，使用 Remotion Skill 驱动代码生成视频内容。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000003932/O1CN01LtxRdA1euuSRJidi5_!!6000000003932-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/gIcfxkuLepTPXRLia5V-NCOFOwwJy-V2j2iXx6ifZms.mp4",
    category: "Scenarios",
    difficulty: "advanced",
    command: "npx skills add nicepkg/agent-skills@remotion-best-practices",
  },  
  {
    title: "Remotion 视频创作（网页方式）",
    description: "通过网页界面配合 Remotion Skill，可视化地创作和预览视频。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000005167/O1CN01agk2kT1o2XbAcYSLV_!!6000000005167-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/TGbVMvWkRJxgPeJFl04RCgZZDyxBvo-SxJdu57gyr9w.mp4",
    category: "Scenarios",
    difficulty: "advanced",
    command: "npx skills add nicepkg/agent-skills@remotion-best-practices",
  },
];

{/* ─── 功能分类 ─── */}

export const featureCategories = [
  { id: "Guide", label: "入门指南" },
  { id: "Features", label: "核心功能" },
  { id: "Skills", label: "Skills" },
  { id: "SDK", label: "SDK" },
];

{/* ─── 场景标签 ─── */}

export const difficultyLevels = [
  { id: "quickstart", label: "Quick Start", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  { id: "office", label: "日常使用", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  { id: "coding", label: "编程场景", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  { id: "advanced", label: "进阶技巧", color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400" },
];

{/* ─── 文案 ─── */}

export const texts = {
  pageTitle: "视频展示",
  pageSubtitle: "从快速上手到深度实战，通过视频演示探索 Qwen Code 的全部能力",
  heroSectionTitle: "Quick Start",
  heroSectionSubtitle: "30 秒了解 Qwen Code",
  heroCta: "立即安装",
  latestSectionTitle: "最新视频",
  latestSectionSubtitle: "最近更新的演示",
  featureSectionTitle: "功能演示",
  featureSectionSubtitle: "了解 Qwen Code 的核心能力",
  scenarioSectionTitle: "场景实战",
  scenarioSectionSubtitle: "找到你的使用场景",
  featureTabLabel: "核心功能",
  scenarioTabLabel: "场景实战",
  allFilter: "全部",
  allDifficulties: "全部场景",
  emptyState: "该分类下暂无视频，更多内容持续更新中",
  close: "关闭",
  unsupportedVideo: "您的浏览器不支持视频标签。",
  viewTutorial: "查看详细教程",
  moreComingSoon: "更多场景持续更新中，欢迎提交你的使用案例",
  submitCase: "在 GitHub 上提交你的 Showcase",
};

<VideoShowcase
  heroVideo={heroVideo}
  featureVideos={featureVideos}
  scenarioVideos={scenarioVideos}
  featureCategories={featureCategories}
  difficultyLevels={difficultyLevels}
  texts={texts}
/>
```