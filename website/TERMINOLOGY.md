# Qwen Code 术语表

本文档定义了 Qwen Code 项目中关键术语的标准翻译。

## 📌 核心规则

1. **英文术语**: 某些技术术语必须保持英文
2. **一致性**: 同一术语在所有文档中必须有相同的翻译
3. **大写**: 某些术语必须使用特定的大小写形式

## 🔤 保持英文的术语

### 编程和开发

| 英文 | 中文示例 | 说明 |
|------|---------|------|
| CLI | CLI 工具 | Command Line Interface |
| API | API 调用 | Application Programming Interface |
| SDK | SDK 集成 | Software Development Kit |
| Token | Token 数量 | 语言模型的令牌 |
| Context | Context 窗口 | 上下文 |
| Prompt | Prompt 提示 | 输入给模型的文本 |
| LLM | LLM 模型 | Large Language Model |
| OAuth | OAuth 登录 | 认证协议 |

### 协议和技术

| 英文 | 中文示例 | 说明 |
|------|---------|------|
| HTTP | HTTP 请求 | 超文本传输协议 |
| HTTPS | HTTPS 连接 | 安全 HTTP |
| MCP | MCP 服务器 | Model Context Protocol |
| SSE | SSE 端点 | Server-Sent Events |
| Stdio | Stdio 传输 | Standard Input/Output |
| JSON | JSON 配置 | 数据格式 |
| YAML | YAML 文件 | 数据格式 |
| Markdown | Markdown 语法 | 标记语言 |
| TOML | TOML 配置 | 配置文件格式 |

### 工具和平台

| 英文 | 中文示例 | 说明 |
|------|---------|------|
| Git | Git 仓库 | 版本控制系统 |
| npm | npm 包 | Node.js 包管理器 |
| Node.js | Node.js 20+ | JavaScript 运行时 |
| Shell | Shell 命令 | 命令行解释器 |
| IDE | IDE 集成 | 集成开发环境 |
| VS Code | VS Code 扩展 | 编辑器 |

### GitHub 相关

| 英文 | 中文示例 | 说明 |
|------|---------|------|
| PR | PR #123 | Pull Request |
| commit | Git 提交 | 代码提交 |
| branch | 分支管理 | 代码分支 |
| repo | 代码仓库 | repository |

## 🌍 统一翻译的术语

### 用户体验

| 英文 | 中文 | 德文 | 法文 | 俄文 | 日文 |
|------|------|------|------|------|------|
| user | 用户 | Benutzer | utilisateur | пользователь | ユーザー |
| developer | 开发者 | Entwickler | développeur | разработчик | 開発者 |
| workspace | 工作区 | Arbeitsbereich | espace de travail | рабочее пространство | ワークスペース |
| project | 项目 | Projekt | projet | проект | プロジェクト |
| session | 会话 | Sitzung | session | сессия | セッション |
| conversation | 对话 | Gespräch | conversation | разговор | 会話 |

### 配置和设置

| 英文 | 中文 | 德文 | 法文 | 俄文 | 日文 |
|------|------|------|------|------|------|
| configuration | 配置 | Konfiguration | configuration | конфигурация | 設定 |
| settings | 设置 | Einstellungen | paramètres | настройки | 設定 |
| authentication | 认证 | Authentifizierung | authentification | аутентификация | 認証 |
| authorization | 授权 | Autorisierung | autorisation | авторизация | 認可 |
| permission | 权限 | Berechtigung | permission | разрешение | 権限 |

### 功能和特性

| 英文 | 中文 | 德文 | 法文 | 俄文 | 日文 |
|------|------|------|------|------|------|
| feature | 功能 | Funktion | fonction | функция | 機能 |
| extension | 扩展 | Erweiterung | extension | расширение | 拡張 |
| plugin | 插件 | Plugin | plugin | плагин | プラグイン |
| tool | 工具 | Tool | outil | инструмент | ツール |
| command | 命令 | Befehl | commande | команда | コマンド |

### 代码相关

| 英文 | 中文 | 德文 | 法文 | 俄文 | 日文 |
|------|------|------|------|------|------|
| repository | 代码仓库 | Repository | dépôt | репозиторий | リポジトリ |
| branch | 分支 | Branch | branche | ветка | ブランチ |
| merge | 合并 | zusammenführen | fusionner | слить | マージ |
| commit | 提交 | committen | valider | коммит | コミット |
| pull | 拉取 | pull | tirer | pull | プル |
| push | 推送 | push | pousser | push | プッシュ |

## 📏 大小写规范

### 必须大写首字母

| 术语 | 示例 | 错误示例 |
|------|------|---------|
| Shell | Shell 命令 | shell 命令 |
| Git | Git 仓库 | git 仓库 |
| Token | Token 数量 | token 数量 |
| CLI | CLI 工具 | Cli 工具 |
| OAuth | OAuth 登录 | oauth 登录 |
| Bug | Bug 修复 | bug 修复 |
| PR | PR #123 | pr #123 |

### 全大写缩写

| 缩写 | 全称 | 说明 |
|------|------|------|
| CLI | Command Line Interface | 命令行界面 |
| API | Application Programming Interface | 应用程序接口 |
| SDK | Software Development Kit | 软件开发工具包 |
| LLM | Large Language Model | 大语言模型 |
| MCP | Model Context Protocol | 模型上下文协议 |
| OAuth | Open Authorization | 开放授权 |

## 🔐 GitHub Alert Types (特殊处理)

**重要规则**: GitHub alert types 必须保持英文，不可翻译。

```markdown
> [!NOTE]
> [!TIP]
> [!IMPORTANT]
> [!WARNING]
> [!CAUTION]
```

**示例**:
```markdown
> [!IMPORTANT]
> 这是一条重要提示。（内容可以翻译，但 [!IMPORTANT] 保持英文）
```

## 🎯 动词翻译规范

### 常用动词

| 英文 | 中文 | 德文 | 法文 | 俄文 |
|------|------|------|------|------|
| install | 安装 | installieren | installer | установить |
| configure | 配置 | konfigurieren | configurer | настроить |
| run | 运行 | ausführen | exécuter | запустить |
| build | 构建 | erstellen | construire | собрать |
| deploy | 部署 | bereitstellen | déployer | развернуть |
| debug | 调试 | debuggen | déboguer | отладить |
| test | 测试 | testen | tester | тестировать |

## 📝 使用示例

### 正确示例 ✅

```markdown
使用 CLI 工具运行 npm install 命令。

> [!IMPORTANT]
Git 提交前请确保所有测试通过。

配置 OAuth 认证以访问 API。
```

### 错误示例 ❌

```markdown
使用命令行界面工具运行 npm install 命令。（❌ 不要翻译 CLI）

> [!重要]  （❌ alert type 必须英文）
Git 提交前请确保所有测试通过。

配置 oauth 认证以访问 api。（❌ 大小写错误）
```

## 🔄 更新日志

- **2026-02-05**: 创建术语表，定义核心翻译规则
- 添加 GitHub alert types 特殊规则
- 添加大小写规范

---

**维护者**: Qwen Code Docs Team  
**最后更新**: 2026-02-05
