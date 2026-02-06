# Qwen Code Documentation Site

Qwen Code 项目的多语言文档网站。

## 📚 文档

- **[翻译规范 (TRANSLATION_GUIDELINES.md)](./TRANSLATION_GUIDELINES.md)** - 翻译时必须遵守的规则
- **[术语表 (TERMINOLOGY.md)](./TERMINOLOGY.md)** - 标准术语翻译对照表

## 🌐 支持的语言

- 🇨🇳 中文 (zh)
- 🇩🇪 德文 (de)
- 🇺🇸 英文 (en)
- 🇫🇷 法文 (fr)
- 🇯🇵 日文 (ja)
- 🇧🇷 葡萄牙文 (pt-BR)
- 🇷🇺 俄文 (ru)

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看文档。

### 构建生产版本

```bash
npm run build
```

## 📖 翻译工作流

### 翻译规范

在开始翻译之前，请务必阅读 [翻译规范](./TRANSLATION_GUIDELINES.md)，特别是：

1. **GitHub Alert Types** - 必须使用英文（如 `[!IMPORTANT]`），不能翻译
2. **技术术语** - CLI, API, SDK, Token 等术语保持英文
3. **大小写** - Shell, Git, Token 等术语首字母大写

### 翻译步骤

1. 更新源文档（英文）
2. 运行翻译工具同步到其他语言
3. 检查翻译是否符合规范
4. 运行构建验证：`npm run build`
5. 提交 PR

### 常见问题

**Q: 构建失败，提示 "Invalid GitHub alert type"**

A: 检查是否有使用了本地化 alert types（如 `[!重要]`），必须改为英文 `[!IMPORTANT]`。详见 [翻译规范 - GitHub Alert Types](./TRANSLATION_GUIDELINES.md#1-github-alert-types-必须保持英文)。

**Q: 技术术语应该翻译吗？**

A: 不应该。CLI, API, SDK 等术语必须保持英文。详见 [术语表](./TERMINOLOGY.md)。

## 🔧 配置文件

- `translation.config.json` - 翻译工具配置
- `next.config.mjs` - Next.js 配置
- `mdx-components.tsx` - MDX 组件配置

## 📦 项目结构

```
website/
├── content/           # 多语言文档内容
│   ├── en/           # 英文源文档
│   ├── zh/           # 中文文档
│   ├── de/           # 德文文档
│   └── ...
├── app/              # Next.js 应用
├── components/       # React 组件
├── TRANSLATION_GUIDELINES.md  # 翻译规范 ⭐
├── TERMINOLOGY.md    # 术语表 ⭐
└── package.json
```

## 🤝 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add feature'`
4. 推送到分支：`git push origin feature/my-feature`
5. 创建 Pull Request

### 翻译贡献

如果你想要改进翻译：

1. 阅读 [翻译规范](./TRANSLATION_GUIDELINES.md)
2. 参考 [术语表](./TERMINOLOGY.md) 确保术语一致
3. 检查构建是否通过：`npm run build`
4. 提交 PR

## 📄 许可证

MIT

## 👥 团队

Qwen Code Docs Team

---

**重要提示**: 在进行任何翻译工作之前，请务必阅读 [翻译规范](./TRANSLATION_GUIDELINES.md) 和 [术语表](./TERMINOLOGY.md)，以避免常见的翻译错误。
