export interface VideoShowcaseItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl?: string;
  category: string;
  difficulty?: string;
  command?: string;
  link?: string;
  steps?: {
    title: string;
    description: string;
    command?: string;
  }[];
  hasDetailPage?: boolean; // 标记是否有独立的 MDX 详情页
  showcaseCategory?: string; // 分类标签：日常任务、编程开发、数据分析、入门指南、核心功能、Skills 扩展
  showcaseFeatures?: string[]; // 功能标签数组：Agent 模式、Cowork、Skills、Web Search、MCP、Plan 模式、GitHub 集成、图片识别、Remotion 等
}

// Hero Video - Quick Start
export const heroVideo: VideoShowcaseItem = {
  id: "qwen-code-intro",
  title: "Qwen Code 简介",
  description: "30 秒了解 Qwen Code 的核心能力：从安装到对话，再到完成你的第一个任务。你的 AI 编程伙伴，从想法到实现只需一句话。",
  thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01J4G8Xc1Xm1ShJ4TSX_!!6000000002965-2-videocover-2880-1622.png",
  videoUrl: "https://cloud.video.taobao.com/vod/LfmsiJ8iFG-Rbfh6UTBCTtkWhLL6FsOeeVT10lCxNWI.mp4",
  category: "Quick Start",
  link: "https://github.com/QwenLM/qwen-code?tab=readme-ov-file#installation",
  hasDetailPage: false,
    showcaseCategory: "入门指南",
    showcaseFeatures: ["Agent 模式"],
  steps: [
    {
      title: "安装 Qwen Code",
      description: "使用 npm 或脚本一键安装 Qwen Code。",
      command: "npm install -g @qwen-code/qwen-code",
    },
    {
      title: "启动应用",
      description: "在终端中输入命令启动 Qwen Code。",
      command: "qwen",
    },
    {
      title: "开始对话",
      description: "向 AI 提问，开始你的第一次对话。",
      command: "what is qwen code?",
    },
  ],
};

// Feature Videos - Guide Category
export const guideVideos: VideoShowcaseItem[] = [
  {
    id: "script-install",
    title: "脚本一键安装",
    description: "通过脚本命令快速安装 Qwen Code，几秒钟即可完成环境配置。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000002905/O1CN01wI6zQD1XKXhKNpQXZ_!!6000000002905-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/x4lFbaS9OgyXBNMytr2sR32ttE90q4pTkRD6EHSjQro.mp4",
    category: "Guide",
    hasDetailPage: true,
    showcaseCategory: "入门指南",
    showcaseFeatures: ["终端操作"],
    command: "# Linux/macOS\ncurl -fsSL https://qwen-code.oss-cn-beijing.aliyuncs.com/install.sh | bash -s -- --install\n\n# Windows (PowerShell)\ncurl -fsSL -o %TEMP%\\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\\install-qwen.bat",
    steps: [
      {
        title: "Linux/macOS 安装",
        description: "使用 curl 下载安装脚本并执行。",
        command: "curl -fsSL https://qwen-code.oss-cn-beijing.aliyuncs.com/install.sh | bash -s -- --install",
      },
      {
        title: "Windows 安装",
        description: "在 PowerShell 中下载并执行批处理脚本。",
        command: "curl -fsSL -o %TEMP%\\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\\install-qwen.bat",
      },
    ],
  },
  {
    id: "first-conversation",
    title: "开始第一次对话",
    description: "安装完成后，发起你与 Qwen Code 的第一次 AI 对话。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000002613/O1CN019Vn4y71VAo2xDVswb_!!6000000002613-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/RBM4WS95LE5RkGA82JbBjTG1oVokxC-SJlMi8Jv4_fA.mp4",
    category: "Guide",
    hasDetailPage: true,
    showcaseCategory: "入门指南",
    showcaseFeatures: ["Agent 模式"],
    command: "what is qwen code? Please give me a brief introduction about it.",
    steps: [
      {
        title: "启动 Qwen Code",
        description: "在终端中输入 qwen 命令启动应用。",
        command: "qwen",
      },
      {
        title: "发起对话",
        description: "输入你的问题，开始与 AI 交流。",
        command: "what is qwen code?",
      },
    ],
  },
  {
    id: "api-setup",
    title: "API 设置",
    description: "配置 API Key 和模型参数，自定义你的 AI 编程体验。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000006672/O1CN01q0ZOki1z9pg48tM4i_!!6000000006672-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/JNsallWn_HIKsRrl5vapZ0N0TYGFNzS_NuFpyHk4WJY.mp4",
    category: "Guide",
    hasDetailPage: false,
    showcaseCategory: "入门指南",
    showcaseFeatures: ["API 设置"],
    steps: [
      {
        title: "获取 API Key",
        description: "访问阿里云百炼平台创建 API Key。",
        command: "https://bailian.console.aliyun.com/",
      },
      {
        title: "配置环境变量",
        description: "将 API Key 设置为环境变量。",
        command: "export QWEN_API_KEY='your-api-key-here'",
      },
      {
        title: "选择模型",
        description: "根据需要选择合适的模型。",
        command: "/model qwen3.5-plus",
      },
    ],
  },
  {
    id: "bailian-coding-plan",
    title: "百炼 Coding Plan 模式",
    description: "配置使用百炼 Coding Plan，多模型选择，提升复杂任务的完成质量。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/O1CN01Sksw211SlxK91PdUg_!!6000000002288-2-videocover-1696-954.png",
    videoUrl: "https://cloud.video.taobao.com/vod/QrKbdt1ujUuWY7zc4Jg22cY_kg539ZRPJVHC1_blEnY.mp4",
    category: "Guide",
    steps: [
      {
        title: "进入设置",
        description: "在 Qwen Code 中打开设置面板。",
        command: "/settings",
      },
      {
        title: "选择 Coding Plan",
        description: "在模型选项中选择百炼 Coding Plan 模式。",
      },
      {
        title: "开始复杂任务",
        description: "现在可以处理更复杂的编程任务了。",
      },
    ],
  },
  {
    id: "vscode-integration",
    title: "VS Code 集成界面",
    description: "Qwen Code 在 VS Code 中的完整界面展示，了解各功能区域的布局。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000003274/O1CN014Km30B1a3XqInHBJC_!!6000000003274-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/IQbMf47caWPNeRPe2Z0DcCUJgip2IY5IzKRIG77yI5I.mp4",
    category: "Guide",
    steps: [
      {
        title: "安装 VS Code 扩展",
        description: "在 VS Code 扩展市场搜索并安装 Qwen Code 扩展。",
      },
      {
        title: "登录账号",
        description: "使用你的账号登录扩展。",
        command: "/auth",
      },
      {
        title: "开始使用",
        description: "在侧边栏找到 Qwen Code 面板，开始对话。",
      },
    ],
  },
  {
    id: "authentication",
    title: "认证登录",
    description: "了解 Qwen Code 的认证流程，快速完成账号登录。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN011eGoRs1Pf8a4hXQ0K_!!6000000001867-2-tps-1700-952.png",
    category: "Guide",
    command: "/auth",
    steps: [
      {
        title: "触发认证",
        description: "输入认证命令或点击登录按钮。",
        command: "/auth",
      },
      {
        title: "浏览器登录",
        description: "在打开的浏览器页面中完成登录流程。",
      },
      {
        title: "确认登录",
        description: "返回 Qwen Code 确认登录状态。",
      },
    ],
  },
  {
    id: "headless-mode",
    title: "Headless 模式",
    description: "在无 GUI 环境下使用 Qwen Code，适用于远程服务器和 CI/CD 场景。",
    thumbnail: "https://gw.alicdn.com/imgextra/i3/O1CN01qbxpC21KcK4K7lzGt_!!6000000001184-1-tps-1280-720.gif",
    category: "Guide",
    command: "qwen --p 'what is qwen code?'",
    steps: [
      {
        title: "使用 prompt 模式",
        description: "通过 --p 参数直接传入提示词。",
        command: "qwen --p 'what is qwen code?'",
      },
      {
        title: "脚本集成",
        description: "在脚本中调用 Qwen Code 命令。",
      },
    ],
  },
  {
    id: "file-reference",
    title: "@file 引用功能",
    description: "在对话中通过 @file 引用项目文件，让 AI 精准理解上下文。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN01Aaya6r1jMctBU7ajg_!!6000000004534-2-tps-1694-952.png",
    category: "Guide",
    command: "@file ./src/main.py",
    steps: [
      {
        title: "引用文件",
        description: "在对话中使用 @ 符号加文件路径。",
        command: "@file ./src/main.py",
      },
      {
        title: "描述需求",
        description: "告诉 AI 你想对这个文件做什么。",
      },
    ],
  },
  {
    id: "language-switch",
    title: "语言切换",
    description: "在 Qwen Code 中切换 UI 和输出语言，支持多语言交互。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000005337/O1CN01dGymbF1pIOvPoDCpT_!!6000000005337-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/3shVUlMOckkpLxiic7uHHYVb8B1bdN5Pe0Up0HhOCuk.mp4",
    category: "Guide",
    command: "/language ui zh-CN",
    steps: [
      {
        title: "切换 UI 语言",
        description: "使用 /language 命令切换界面语言。",
        command: "/language ui zh-CN",
      },
      {
        title: "切换输出语言",
        description: "设置 AI 回答的语言。",
        command: "/language output zh-CN",
      },
    ],
  },
  {
    id: "resume-session",
    title: "Resume 会话恢复",
    description: "中断的对话可以随时恢复，不丢失任何上下文和进度。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000004411/O1CN01KJRiqA1iSIAmOCkIP_!!6000000004411-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/2oGLaR2xoX1-RcWElW2yS5QMKXe03ab_Kcd01_wTOr8.mp4",
    category: "Guide",
    command: "qwen --resume",
    steps: [
      {
        title: "查看会话列表",
        description: "列出所有历史会话。",
        command: "qwen --list",
      },
      {
        title: "恢复会话",
        description: "使用 --resume 参数恢复最近的会话。",
        command: "qwen --resume",
      },
    ],
  },
  {
    id: "retry-shortcut",
    title: "Ctrl+Y 快速重试",
    description: "对 AI 回答不满意时，使用 Ctrl(Cmd)+Y 一键重试获取更好的结果。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01YtZAzm1ShNMbf8YTt_!!6000000002278-2-tps-1694-956.png",
    category: "Guide",
    steps: [
      {
        title: "触发重试",
        description: "按下 Ctrl+Y (macOS: Cmd+Y) 重新生成回答。",
      },
      {
        title: "调整提示词",
        description: "可以在重试前补充更多需求说明。",
      },
    ],
  },
  {
    id: "copy-optimization",
    title: "复制字符优化",
    description: "优化的代码复制体验，精准选取和复制代码片段。",
    thumbnail: "https://gw.alicdn.com/imgextra/i3/O1CN01rFSm7o1hoRiIy0xrP_!!6000000004324-1-tps-1280-720.gif",
    category: "Guide",
    steps: [
      {
        title: "选择代码块",
        description: "点击代码块右上角的复制按钮。",
      },
      {
        title: "粘贴使用",
        description: "粘贴到你的项目中，格式完整保留。",
      },
    ],
  },
  {
    id: "agents-config",
    title: "Agents 配置文件",
    description: "通过 Agents MD 文件自定义 AI 行为，让 AI 适配你的项目规范。",
    thumbnail: "https://gw.alicdn.com/imgextra/i4/O1CN01qjVpRJ1twwS25UK0D_!!6000000005967-2-tps-1902-1144.png",
    category: "Guide",
    steps: [
      {
        title: "创建配置文件",
        description: "在项目根目录创建 .qwen/agents.md 文件。",
        command: "mkdir -p .qwen && touch .qwen/agents.md",
      },
      {
        title: "编写配置",
        description: "定义 AI 的行为规范和项目上下文。",
      },
      {
        title: "生效配置",
        description: "重启 Qwen Code 或重新加载窗口。",
      },
    ],
  },
];

// Core Features Videos
export const featureVideos: VideoShowcaseItem[] = [
  {
    id: "terminal-capture",
    title: "终端输出捕获",
    description: "产品演示必备！让 AI 执行功能测试并自动捕获终端输出信息。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000005887/O1CN01hBRUux1tMIlTGx2Ym_!!6000000005887-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/eaDeo1zyE3n6VG9QscGbOLWzzY1dGknK8YNbu3srV9w.mp4",
    category: "Features",
    command: "/skills terminal-capture",
    steps: [
      {
        title: "安装 Skill",
        description: "安装终端捕获 Skill。",
        command: "/skills terminal-capture",
      },
      {
        title: "执行命令",
        description: "让 AI 执行测试命令。",
        command: "npm test",
      },
      {
        title: "查看输出",
        description: "AI 会自动捕获并分析终端输出。",
      },
    ],
  },
  {
    id: "web-search",
    title: "Web Search",
    description: "让 Qwen Code 搜索网络内容，获取实时信息辅助编程。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000002711/O1CN01hgoJib1VtgrRAkjQc_!!6000000002711-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/FVVvz922HnDIY_STwpKaBGBb1u2JXOCdUCOL36A8WW4.mp4",
    category: "Features",
    steps: [
      {
        title: "启用搜索",
        description: "在对话中请求搜索网络信息。",
        command: "搜索最新的 React 19 新特性",
      },
      {
        title: "查看结果",
        description: "AI 会整合搜索结果并给出答案。",
      },
    ],
  },
  {
    id: "plan-with-search",
    title: "Plan 模式 + Web Search",
    description: "在 Plan 模式下结合 Web Search，先搜索再规划，提升任务准确性。",
    thumbnail: "https://gw.alicdn.com/imgextra/i3/O1CN016eKNFf1CtFmYQHGsd_!!6000000000138-2-tps-1694-952.png",
    category: "Features",
    steps: [
      {
        title: "启用 Plan 模式",
        description: "切换到 Plan 模式处理复杂任务。",
        command: "/mode plan",
      },
      {
        title: "请求搜索",
        description: "让 AI 先搜索相关信息。",
      },
      {
        title: "执行规划",
        description: "基于搜索结果制定执行计划。",
      },
    ],
  },
  {
    id: "insight",
    title: "Insight 数据洞察",
    description: "查看个人 AI 使用报告，了解编程效率和协作数据。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000006496/O1CN01KNUXtG1xrDy75PPA5_!!6000000006496-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/a5X9O6PsdDdmXVqtHdhlzZ97mRNPrqroKO5cf4V71XM.mp4",
    category: "Features",
    link: "../blog/how-to-use-qwencode-insight",
    command: "/insight",
    steps: [
      {
        title: "打开洞察面板",
        description: "输入命令查看使用数据。",
        command: "/insight",
      },
      {
        title: "分析报告",
        description: "查看对话次数、任务类型分布等统计。",
      },
    ],
  },
  {
    id: "mcp-image-gen",
    title: "MCP 图片生成",
    description: "通过 MCP 接入图片生成服务，用自然语言驱动 AI 创作图像。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000008040/O1CN01S2cxYL29GNUmrvmzH_!!6000000008040-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/gQg8C_5f5MGoZE9YKCyKmHlWAgXZSTMbN8WSoN7crbc.mp4",
    category: "Features",
    steps: [
      {
        title: "配置 MCP",
        description: "在配置文件中添加图片生成 MCP 服务。",
      },
      {
        title: "描述需求",
        description: "用自然语言描述你想生成的图片。",
        command: "生成一张未来科技风格的城市图片",
      },
      {
        title: "查看结果",
        description: "AI 会调用 MCP 服务生成图片。",
      },
    ],
  },
  {
    id: "clipboard-paste",
    title: "剪贴板图片粘贴",
    description: "直接粘贴剪贴板中的图片到对话，AI 即时理解图片内容。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN01OsEDov1z4nJto1CfQ_!!6000000006661-2-tps-1694-956.png",
    category: "Features",
    steps: [
      {
        title: "复制图片",
        description: "截取或复制任意图片到剪贴板。",
        command: "Cmd+C / Ctrl+C",
      },
      {
        title: "粘贴到对话",
        description: "在输入框中粘贴图片。",
        command: "Cmd+V / Ctrl+V",
      },
      {
        title: "描述需求",
        description: "告诉 AI 你想对这张图片做什么。",
      },
    ],
  },
  {
    id: "image-recognition",
    title: "图片识别",
    description: "Qwen Code 可以读取和理解图片内容，辅助视觉相关的编程任务。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000006844/O1CN011X8nmv20QbnWSqSfJ_!!6000000006844-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/1wsWdUwqhw7-x6Hx5W_qQEI58kPw_kVSPS23AIM4PqQ.mp4",
    category: "Features",
    steps: [
      {
        title: "上传图片",
        description: "拖拽或粘贴图片到对话中。",
      },
      {
        title: "提问",
        description: "询问关于图片的问题。",
        command: "这张图片里有什么？",
      },
    ],
  },
  {
    id: "github-integration",
    title: "GitHub 命令集成",
    description: "在 Qwen Code 中直接执行 GitHub 操作，管理仓库和 PR。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/O1CN01bPIGqq27gp8F86nXp_!!6000000007827-2-videocover-1700-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/wWqieOtAazt1jJJdyZnxP0ZWYz4fuV6Ogb2wOvb8bBg.mp4",
    category: "Features",
    steps: [
      {
        title: "配置 GitHub",
        description: "设置 GitHub Token。",
        command: "/config github-token <your-token>",
      },
      {
        title: "执行操作",
        description: "使用 GitHub 命令管理仓库。",
        command: "gh pr list",
      },
    ],
  },
  {
    id: "lsp-intelligence",
    title: "LSP 智能感知",
    description: "集成 LSP 协议，提供精准的代码补全、跳转和诊断能力。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01kxCAnu1c0SPDCZsUt_!!6000000003538-2-tps-1694-948.png",
    category: "Features",
    steps: [
      {
        title: "自动检测",
        description: "Qwen Code 自动检测项目语言并加载对应 LSP。",
      },
      {
        title: "使用功能",
        description: "享受代码补全、跳转定义、错误诊断。",
      },
    ],
  },
  {
    id: "export-conversation",
    title: "导出对话记录",
    description: "导出对话记录，支持 Markdown、JSON 等格式。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000003561/O1CN01KmYvSF1cAzW7C9CHz_!!6000000003561-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/a4-IZVgzaAhKLdzRYhsG2dB-PPo8wG1gKlwq09gR01U.mp4",
    category: "Features",
    command: "/export html <session id>",
    steps: [
      {
        title: "查看会话列表",
        description: "列出所有历史会话。",
        command: "/list",
      },
      {
        title: "导出会话",
        description: "选择格式导出指定会话。",
        command: "/export html <session id>",
      },
    ],
  },
];

// Skills Videos
export const skillsVideos: VideoShowcaseItem[] = [
  {
    id: "skill-install-prompt",
    title: "通过提示词安装 Skills",
    description: "在对话中直接告诉 Qwen Code 安装所需的 Skill，即装即用。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000003086/O1CN01quNtwC1YfRNyxdAsy_!!6000000003086-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/WYeH55IR7WQ8OXKqmQfjM1WyK7xZ4llKM3A_dtf19wI.mp4",
    category: "Skills",
    command: "Please first check if find-skills exists, if not, please use npx skills add https://github.com/vercel-labs/skills --skill find-skills",
    steps: [
      {
        title: "描述需求",
        description: "告诉 AI 你想安装什么 Skill。",
        command: "帮我安装 find-skills",
      },
      {
        title: "自动安装",
        description: "AI 会自动执行安装命令。",
        command: "npx skills add https://github.com/vercel-labs/skills --skill find-skills",
      },
      {
        title: "确认使用",
        description: "安装完成后立即使用新 Skill。",
      },
    ],
  },
  {
    id: "skill-install-folder",
    title: "通过文件夹安装 Skills",
    description: "将 Skill 文件放入指定目录，Qwen Code 自动识别并加载。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/6000000005414/O1CN01WFKT3D1prfQWynZFH_!!6000000005414-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/_3BD_A4_-nQRKqdyyHw9e8Nm1qtusA7gHKtoJlaJP28.mp4",
    category: "Skills",
    steps: [
      {
        title: "下载 Skill",
        description: "从 GitHub 或其他来源下载 Skill 文件。",
      },
      {
        title: "放入目录",
        description: "将 Skill 文件夹放到 ~/.qwen/skills/ 目录。",
        command: "mkdir -p ~/.qwen/skills && cp -r <skill-folder> ~/.qwen/skills/",
      },
      {
        title: "重新加载",
        description: "重启 Qwen Code 或使用 /skills reload 命令。",
        command: "/skills reload",
      },
    ],
  },
  {
    id: "skills-panel",
    title: "Skills 面板",
    description: "通过 Skills 面板浏览、安装和管理已有的 Skill 扩展。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01xkzvoE1fomm8znzBG_!!6000000004054-2-tps-1694-952.png",
    category: "Skills",
    command: "/skills",
    steps: [
      {
        title: "打开面板",
        description: "输入命令打开 Skills 管理界面。",
        command: "/skills",
      },
      {
        title: "浏览技能",
        description: "查看已安装和可用的 Skill 列表。",
      },
      {
        title: "安装/卸载",
        description: "使用界面按钮管理 Skill。",
      },
    ],
  },
];

// Scenario Videos
export const scenarioVideos: VideoShowcaseItem[] = [
  {
    id: "quick-install",
    title: "下载安装，快速安装启动",
    description: "一行命令安装，直接启动。",
    thumbnail: "https://gw.alicdn.com/imgextra/i1/O1CN01DlD3YG1SSigum4nX2_!!6000000002246-2-tps-1696-956.png",
    videoUrl: "https://cloud.video.taobao.com/vod/okin3Lw4xAaK-6QXpG_xnH2ttE90q4pTkRD6EHSjQro.mp4",
    category: "Scenarios",
    difficulty: "quickstart",
    steps: [
      {
        title: "安装",
        description: "使用 npm 全局安装。",
        command: "npm install -g @qwen-code/qwen-code",
      },
      {
        title: "启动",
        description: "输入命令启动应用。",
        command: "qwen",
      },
    ],
  },
  {
    id: "terminal-theme",
    title: "Terminal 主题切换",
    description: "一句话更换 terminal 主题，可以用自然语言应用任何你想要的主题样式。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/O1CN01AsDV5C1aSHEa8IY3M_!!6000000003328-0-videocover-3163-1800.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/zxYwfE9B3STo2bLnbTBwePKBTtWPbqt6pS2BCZMJpTM.mp4",
    category: "Scenarios",
    difficulty: "quickstart",
    steps: [
      {
        title: "描述需求",
        description: "告诉 AI 你想要的主题风格。",
        command: "把 terminal 主题换成深色科技风",
      },
      {
        title: "确认应用",
        description: "AI 会应用主题并展示预览。",
      },
    ],
  },
  {
    id: "weekly-report",
    title: "自动获取生成周报",
    description: "定制技能，一行命令自动爬取本周更新，并按照设定的模板写作产品更新周报。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/O1CN01pGIjz425ghngaMvYX_!!6000000007556-2-videocover-1696-948.png",
    videoUrl: "https://cloud.video.taobao.com/vod/BrL3c4NkeIqLiT3MAAWUSp26QgM0hjN67ukuKQmgE4M.mp4",
    category: "Scenarios",
    difficulty: "office",
    steps: [
      {
        title: "配置数据源",
        description: "设置 GitHub 仓库或其他数据源。",
      },
      {
        title: "生成周报",
        description: "使用命令生成周报。",
        command: "生成本周的产品更新报告",
      },
      {
        title: "导出分享",
        description: "导出为 Markdown 或 HTML 格式。",
        command: "/export markdown weekly-report",
      },
    ],
  },
  {
    id: "ppt-presentation",
    title: "汇报展示：做 PPT",
    description: "根据产品演示的截图制作 PPT，你只需要提供截图，输入命令，然后等待，bling bling 的就完成了。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/O1CN01ZlnCqO1HtmJhfhZSm_!!6000000000816-2-videocover-2546-1388.png",
    videoUrl: "https://cloud.video.taobao.com/vod/08IfFcYkp4OkyvbSDklR11rrL69fTNuc8Rkz_2ikqOg.mp4",
    category: "Scenarios",
    difficulty: "office",
    steps: [
      {
        title: "准备素材",
        description: "收集产品截图和关键信息。",
      },
      {
        title: "生成 PPT",
        description: "告诉 AI 制作 PPT。",
        command: "根据这些截图制作一个产品演示 PPT",
      },
      {
        title: "导出文件",
        description: "下载生成的 PPT 文件。",
      },
    ],
  },
  {
    id: "read-paper",
    title: "读论文",
    description: "直接读取下载网络上的论文，比如这篇 attention is all you need，然后你可以直接跟 AI 对话学习。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01616oQD1d9RnY1XuLt_!!6000000003693-2-videocover-1696-956.png",
    videoUrl: "https://cloud.video.taobao.com/vod/is3SsCe3w-U5Y0ZxL-z6reSbw8NBhnzCtQfjH26lLFE.mp4",
    category: "Scenarios",
    difficulty: "coding",
    steps: [
      {
        title: "提供论文",
        description: "上传 PDF 或提供论文 URL。",
        command: "帮我分析这篇论文：attention is all you need",
      },
      {
        title: "提问学习",
        description: "向 AI 提问关于论文的问题。",
      },
      {
        title: "生成卡片",
        description: "让 AI 生成核心问题卡片帮助理解。",
        command: "生成这篇论文的核心问题卡片",
      },
    ],
  },
  {
    id: "code-learning",
    title: "代码学习",
    description: "直接克隆仓库学习理解，让 Qwen Code 直接告诉你该如何给开源项目做贡献。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01sarW5120qFytaxHSU_!!6000000006900-2-videocover-1696-956.png",
    videoUrl: "https://cloud.video.taobao.com/vod/M44s6lya5s2ni7h3SR4AdAjDvOe1r6o8Ryq9X6MgmUA.mp4",
    category: "Scenarios",
    difficulty: "coding",
    steps: [
      {
        title: "克隆仓库",
        description: "克隆你想学习的开源项目。",
        command: "git clone <repository-url>",
      },
      {
        title: "分析项目",
        description: "让 AI 分析项目结构和代码。",
        command: "帮我分析这个项目的架构",
      },
      {
        title: "找到切入点",
        description: "询问如何贡献。",
        command: "我该如何给这个项目做贡献？",
      },
    ],
  },
  {
    id: "solve-issue",
    title: "解决 issue",
    description: "根据上面的规划，你可以开始给开源项目解决 issue 了。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/O1CN01NVsgsm28t1IKZxoN3_!!6000000007989-2-videocover-1700-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/HV0QgHEac8zu3tL7gJqqMZlZDtHaFeNNoJ412hgkKYI.mp4",
    category: "Scenarios",
    difficulty: "coding",
    steps: [
      {
        title: "选择 issue",
        description: "在 GitHub 上找到适合的 issue。",
      },
      {
        title: "分析需求",
        description: "让 AI 分析 issue 需求。",
        command: "帮我分析这个 issue 需要做什么",
      },
      {
        title: "实现方案",
        description: "在 AI 辅助下编写代码。",
      },
      {
        title: "提交 PR",
        description: "推送代码并创建 Pull Request。",
      },
    ],
  },
  {
    id: "pr-review",
    title: "PR Review",
    description: "解决了 issue，自动提交了 pr，你还可以直接使用 Qwen Code 对 PR 进行测试 review。",
    thumbnail: "https://img.alicdn.com/imgextra/i1/O1CN01bPIGqq27gp8F86nXp_!!6000000007827-2-videocover-1700-952.png",
    videoUrl: "https://cloud.video.taobao.com/vod/Eu3Gyad-mLiz_FZqrXp76EZWYz4fuV6Ogb2wOvb8bBg.mp4",
    category: "Scenarios",
    difficulty: "coding",
    steps: [
      {
        title: "审查 PR",
        description: "让 AI 审查 PR 代码。",
        command: "帮我 review 这个 PR：#123",
      },
      {
        title: "运行测试",
        description: "执行测试验证改动。",
        command: "npm test",
      },
      {
        title: "给出反馈",
        description: "AI 会给出审查意见和改进建议。",
      },
    ],
  },
  {
    id: "oss-promo-video",
    title: "给自己开源项目做个宣传视频",
    description: "给开源项目做了贡献或者有了自己的开源项目，还可以直接提供仓库地址给项目做个演示视频。",
    thumbnail: "https://gw.alicdn.com/imgextra/i2/O1CN01KKPAv51ZL7QcgguxA_!!6000000003177-2-tps-2880-1622.png",
    videoUrl: "https://cloud.video.taobao.com/vod/TwRRLlr4EHfv-8kvb0J-w7zj70zxoGY7wiaPewqm4l0.mp4",
    category: "Scenarios",
    difficulty: "advanced",
    command: "based on this skill：https://github.com/QwenLM/qwen-code-examples/blob/main/skills/oss-styles/SKILL.md, help me to generate a video for <your repository url>",
    steps: [
      {
        title: "准备仓库",
        description: "准备好你的开源项目仓库。",
      },
      {
        title: "安装 Skill",
        description: "安装 oss-styles Skill。",
        command: "npx skills add QwenLM/qwen-code-examples@oss-styles",
      },
      {
        title: "生成视频",
        description: "提供仓库地址生成演示视频。",
        command: "帮我为这个仓库生成演示视频：<your-repo-url>",
      },
    ],
  },
  {
    id: "portfolio-site",
    title: "一句话制作个人简历",
    description: "你可以整合经历都写进简历，再让 Qwen Code 根据简历制作出你的展示页面。",
    thumbnail: "https://gw.alicdn.com/imgextra/i4/O1CN018tZPON1f8BwaGqauX_!!6000000003961-2-tps-2880-1622.png",
    videoUrl: "https://cloud.video.taobao.com/vod/XSaE8Uzz45gLXvG-PaKVdFTnQpUM2QJ3qRg3R0SPnrs.mp4",
    category: "Scenarios",
    difficulty: "advanced",
    steps: [
      {
        title: "提供经历",
        description: "告诉 AI 你的教育、工作、项目经历。",
      },
      {
        title: "生成简历",
        description: "让 AI 创建简历网站。",
        command: "根据我的经历制作一个个人简历网站",
      },
      {
        title: "导出 PDF",
        description: "打印页面导出为 PDF 格式。",
        command: "Ctrl+P / Cmd+P",
      },
    ],
  },
  {
    id: "youtube-to-blog",
    title: "将 YouTube 视频转为博客文章",
    description: "学习如何使用 Qwen Code 和 SOP 技能将 YouTube 视频转换为博客文章。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000000040/O1CN0173NMvF1CAMxpe5nTJ_!!6000000000040-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/P9CitZbzQunRT0QIkeZcEbhN5bSLiR95LftYE_t5BpY.mp4",
    category: "Scenarios",
    difficulty: "office",
    steps: [
      {
        title: "提供视频链接",
        description: "给出 YouTube 视频 URL。",
        command: "帮我把这个视频转成博客文章：<youtube-url>",
      },
      {
        title: "获取转录",
        description: "AI 获取视频转录内容。",
      },
      {
        title: "生成文章",
        description: "整理为博客文章格式。",
      },
    ],
  },
  {
    id: "website-clone",
    title: "一句话复刻你喜欢的网站",
    description: "截图给 Qwen Code，告诉它你想复刻的网站，它会帮你分析页面结构并生成代码。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000004217/O1CN01N9wncm1h1RKqs79Cs_!!6000000004217-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/corQwW7xwjNzdBg3gRnrbMX-nzXh2z0N0pSIECERpPc.mp4",
    category: "Scenarios",
    difficulty: "coding",
    link: "../blog/qwencode-coding-plan-guide-build-website",
    steps: [
      {
        title: "准备截图",
        description: "截取你想复刻的网站页面。",
      },
      {
        title: "粘贴截图",
        description: "将截图粘贴到对话中。",
      },
      {
        title: "描述需求",
        description: "告诉 AI 你想复刻这个网站。",
        command: "帮我复刻这个网站的设计",
      },
      {
        title: "运行预览",
        description: "在本地运行生成的代码查看效果。",
        command: "npm run dev",
      },
    ],
  },
  {
    id: "write-file",
    title: "一句话写入文件",
    description: "告诉 Qwen Code 要写什么内容，它会帮你创建和写入文件。",
    thumbnail: "https://img.alicdn.com/imgextra/i2/6000000003593/O1CN0139ueiV1cPeBczAQyA_!!6000000003593-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/ToffPMLiVnt3c_HDiisOPcfaWGYmYVsH3hIuj3YWBVg.mp4",
    category: "Scenarios",
    difficulty: "office",
    steps: [
      {
        title: "描述内容",
        description: "告诉 AI 你想创建什么文件。",
        command: "帮我创建一个 README.md 文件，介绍我的项目",
      },
      {
        title: "确认内容",
        description: "查看 AI 生成的文件内容。",
      },
      {
        title: "修改完善",
        description: "根据需要提出修改意见。",
      },
    ],
  },
  {
    id: "organize-desktop",
    title: "整理桌面文件",
    description: "用一句话让 Qwen Code 帮你自动整理桌面文件，按类型归类到对应文件夹。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000007569/O1CN01biAMzk25mewsNAHie_!!6000000007569-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/yWnCuZwvlYmYhhq-NuQ9AwNpg5b_KUKZNV8AFJTBMzw.mp4",
    category: "Scenarios",
    difficulty: "office",
    steps: [
      {
        title: "描述需求",
        description: "告诉 AI 你想整理桌面。",
        command: "帮我把桌面上的文件按类型整理好",
      },
      {
        title: "执行整理",
        description: "AI 会创建文件夹并移动文件。",
      },
      {
        title: "确认结果",
        description: "检查整理后的桌面。",
      },
    ],
  },
  {
    id: "remotion-prompt",
    title: "Remotion 视频创作（提示词方式）",
    description: "通过自然语言描述，使用 Remotion Skill 驱动代码生成视频内容。",
    thumbnail: "https://img.alicdn.com/imgextra/i3/6000000003932/O1CN01LtxRdA1euuSRJidi5_!!6000000003932-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/gIcfxkuLepTPXRLia5V-NCOFOwwJy-V2j2iXx6ifZms.mp4",
    category: "Scenarios",
    difficulty: "advanced",
    command: "npx skills add nicepkg/agent-skills@remotion-best-practices",
    steps: [
      {
        title: "安装 Skill",
        description: "安装 Remotion Best Practices Skill。",
        command: "npx skills add nicepkg/agent-skills@remotion-best-practices",
      },
      {
        title: "描述创意",
        description: "告诉 AI 你想制作什么视频。",
        command: "帮我制作一个产品介绍视频，包含 logo 动画和功能演示",
      },
      {
        title: "预览渲染",
        description: "在浏览器中预览并渲染最终视频。",
        command: "npm run dev",
      },
    ],
  },
  {
    id: "remotion-web",
    title: "Remotion 视频创作（网页方式）",
    description: "通过网页界面配合 Remotion Skill，可视化地创作和预览视频。",
    thumbnail: "https://img.alicdn.com/imgextra/i4/6000000005167/O1CN01agk2kT1o2XbAcYSLV_!!6000000005167-0-tbvideo.jpg",
    videoUrl: "https://cloud.video.taobao.com/vod/TGbVMvWkRJxgPeJFl04RCgZZDyxBvo-SxJdu57gyr9w.mp4",
    category: "Scenarios",
    difficulty: "advanced",
    command: "npx skills add nicepkg/agent-skills@remotion-best-practices",
    steps: [
      {
        title: "安装 Skill",
        description: "安装 Remotion Best Practices Skill。",
        command: "npx skills add nicepkg/agent-skills@remotion-best-practices",
      },
      {
        title: "打开网页",
        description: "在浏览器中打开 Remotion 编辑界面。",
        command: "npm run dev",
      },
      {
        title: "可视化编辑",
        description: "使用界面调整参数和预览效果。",
      },
      {
        title: "导出视频",
        description: "渲染并导出最终视频。",
        command: "npm run build",
      },
    ],
  },
];

// Category definitions
export const featureCategories = [
  { id: "Guide", label: "入门指南" },
  { id: "Features", label: "核心功能" },
  { id: "Skills", label: "Skills" },
  { id: "SDK", label: "SDK" },
];

export const difficultyLevels = [
  { id: "quickstart", label: "Quick Start", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  { id: "office", label: "日常使用", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  { id: "coding", label: "编程场景", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  { id: "advanced", label: "进阶技巧", color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400" },
];

// Helper function to get all videos as a flat array
export function getAllVideos(): VideoShowcaseItem[] {
  return [...guideVideos, ...featureVideos, ...skillsVideos, ...scenarioVideos];
}

// Helper function to get video by ID
export function getVideoById(id: string): VideoShowcaseItem | undefined {
  return getAllVideos().find((video) => video.id === id);
}

// Helper function to get videos by category
export function getVideosByCategory(category: string): VideoShowcaseItem[] {
  return getAllVideos().filter((video) => video.category === category);
}

// Helper function to get videos by difficulty
export function getVideosByDifficulty(difficulty: string): VideoShowcaseItem[] {
  return scenarioVideos.filter((video) => video.difficulty === difficulty);
}
