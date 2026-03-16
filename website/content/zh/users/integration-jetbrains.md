# JetBrains IDE

> JetBrains IDE 通过代理客户端协议（ACP）原生支持 AI 编程助手。该集成使你能够在 JetBrains IDE 中直接使用 Qwen Code，并获得实时代码建议。

### 功能

- **原生代理体验**：在 JetBrains IDE 内集成 AI 助手面板  
- **代理客户端协议（ACP）**：完整支持 ACP，实现高级 IDE 交互  
- **符号管理**：使用 `#` 引用文件，将其添加至对话上下文  
- **对话历史**：可在 IDE 内访问过往对话记录  

### 要求

- 支持 ACP 的 JetBrains IDE（如 IntelliJ IDEA、WebStorm、PyCharm 等）  
- 已安装 Qwen Code CLI  

### 安装

#### 从 ACP 仓库安装（推荐）

1. 安装 Qwen Code CLI：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. 打开 JetBrains IDE，进入 AI Chat 工具窗口。

3. 点击 **Add ACP Agent**（添加 ACP Agent），然后点击 **Install**（安装）。

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   若您已使用 JetBrains AI Assistant 和/或其他 ACP Agent，请在 Agents List（Agent 列表）中点击 **Install From ACP Registry**（从 ACP 仓库安装），然后安装 Qwen Code ACP。

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. 此时，Qwen Code Agent 应已在 AI Assistant 面板中可用。

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### 手动安装（适用于较旧版本的 JetBrains IDE）

1. 安装 Qwen Code CLI：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. 打开你的 JetBrains IDE，并导航至 AI Chat 工具窗口。

3. 点击右上角的三点菜单，选择 **Configure ACP Agent**（配置 ACP Agent），并使用以下设置配置 Qwen Code：

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/path/to/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. 此时，Qwen Code Agent 应已在 AI Assistant 面板中可用。

![Qwen Code 在 JetBrains AI Chat 中](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## 故障排除

### Agent 未显示

- 在终端中运行 `qwen --version`，验证是否已正确安装；
- 确保你的 JetBrains IDE 版本支持 ACP；
- 重启你的 JetBrains IDE。

### Qwen Code 无响应

- 检查您的网络连接  
- 在终端中运行 `qwen` 命令，验证 CLI 是否正常工作  
- 若问题仍然存在，[请在 GitHub 上提交 Issue](https://github.com/qwenlm/qwen-code/issues)