# Qwen Code 文档翻译规范

本文档定义了翻译 Qwen Code 文档时必须遵守的规则和最佳实践。

## 🚨 关键规则（必须遵守）

### 1. GitHub Alert Types 必须保持英文

**问题**: GitHub Flavored Markdown 的 alert types 只支持特定的英文关键词。

**允许的 alert types**:
```markdown
> [!NOTE]
> [!TIP]
> [!IMPORTANT]
> [!WARNING]
> [!CAUTION]
```

**错误示例** ❌:
```markdown
> [!重要]        # 中文 - 会导致构建失败
> [!WICHTIG]     # 德语 - 会导致构建失败
> [!ВАЖНО]       # 俄语 - 会导致构建失败
> [!IMPORTANT]   # ✅ 正确 - 英文
```

**规则**: 
- **ALWAYS** use English alert types: `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`
- 翻译 alert 的**内容文本**，但**不要翻译** alert type 本身
- **Do not translate** alert types into any language

**正确示例** ✅:
```markdown
> [!IMPORTANT]
> 这是一个重要的提示。
```

```markdown
> [!WARNING]
> Dies ist eine Warnung.
```

```markdown
> [!TIP]
> Это полезный совет.
```

### 2. 技术术语处理

#### 保持英文的技术术语:

**编程概念**:
- CLI, API, SDK, Token, Context, Prompt
- HTTP, HTTPS, OAuth, MCP, SSE, Stdio
- JSON, YAML, Markdown, TOML
- Git, npm, Node.js, Shell
- IDE, VS Code
- Bug, PR (Pull Request)

**示例**:
```markdown
✅ CLI 工具
❌ 命令行界面工具

✅ API 密钥
❌ 应用程序接口密钥

✅ Shell 命令
❌ shell 命令 (小写)
```

#### 统一翻译的术语:

| 英文 | 中文 | 德文 | 俄文 |
|------|------|------|------|
| user | 用户 | Benutzer | пользователь |
| developer | 开发者 | Entwickler | разработчик |
| workspace | 工作区 | Arbeitsbereich | рабочее пространство |
| configuration | 配置 | Konfiguration | конфигурация |
| settings | 设置 | Einstellungen | настройки |
| repository | 代码仓库 | Repository | репозиторий |
| feature | 功能 | Funktion | функция |

### 3. 大小写规范

**Shell** - Always capitalize:
```markdown
✅ Shell 命令
✅ 执行 Shell 脚本
❌ shell 命令
```

**Git** - Always capitalize:
```markdown
✅ Git 提交
✅ Git 仓库
❌ git 提交
```

**Token** - Always capitalize:
```markdown
✅ Token 数量
✅ 保存 Token
❌ token 数量
```

### 4. 代码和命令

**保持代码块不变**:
- 代码示例中的注释可以翻译
- 命令本身保持英文
- 变量名、函数名、文件名保持原样

```markdown
```bash
# 安装依赖  # 可以翻译注释
npm install
```
```

### 5. 链接处理

**保留 URL 原文**:
```markdown
✅ [官方文档](https://example.com)
❌ [官方文档](https://example.com/zh)
```

### 6. 标点和符号

**中文使用全角标点**:
```markdown
✅ 这是中文，这是另一个句子。
❌ 这是中文,这是另一个句子.
```

**技术术语使用半角括号**:
```markdown
✅ 使用 CLI (Command Line Interface) 工具
❌ 使用 CLI（Command Line Interface）工具
```

## 📋 翻译检查清单

在提交翻译之前，请检查:

- [ ] 所有 GitHub alert types 都是英文 (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)
- [ ] 技术术语保持英文 (CLI, API, SDK, Token, Shell, Git)
- [ ] 大小写统一 (Shell, Git, Token, CLI)
- [ ] 代码块和命令保持原样
- [ ] URL 链接未被修改
- [ ] 标点符号符合目标语言规范

## 🔧 常见问题修复

### 构建错误: Invalid GitHub alert type

**错误信息**:
```
Error: Invalid GitHub alert type: "wichtig". Should be one of: note, tip, important, warning, caution.
```

**修复方法**:
1. 搜索文件中的 `[!WICHTIG]` (或其他语言变体)
2. 替换为 `[!IMPORTANT]`
3. 保留翻译的文本内容

### 术语不一致

**修复方法**:
1. 使用项目统一的术语表
2. 全局搜索替换不统一的翻译
3. 例如: `shell` → `Shell`

## 📚 参考资源

- [GitHub Flavored Markdown - Alert Syntax](https://github.github.com/gfm/#alerts)
- [Qwen Code Translation Config](./translation.config.json)
- [项目术语表](./TERMINOLOGY.md) (如果存在)

## 🤝 贡献

如果发现本规范遗漏的规则，请提交 PR 更新本文档。

---

**最后更新**: 2026-02-05  
**维护者**: Qwen Code Docs Team
