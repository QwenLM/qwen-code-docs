# `qwen serve` 的本地启动模板（v0.16-alpha）

用于在开发者工作站上将 `qwen serve` 作为长期后台进程运行的参考模板。与 [v0.16-alpha 已知限制](./qwen-serve.md#v016-alpha-已知限制) 搭配使用——仅限本地、单用户、自带 bearer token。容器化/多主机/TLS 前端部署推迟至 v0.16.x。

> **目标读者**：希望守护进程在重启后仍能运行、日志持久保存、并且有清晰的“失败自动重启”机制的内测开发者。如果你只需要守护进程存在于单个 shell 会话期间，直接用 `qwen serve`（前台运行，Ctrl-C 停止）即可。

## 生成 bearer token（一次性操作）

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # 用户自行管理，非内置路径
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

路径/文件名由你自行选择；v0.16-alpha 不会自动生成或定位 token 文件（推迟至 v0.16.x）。请参阅用户指南中的[身份验证](./qwen-serve.md#身份验证)章节了解标准 BYO 设置。

> **将 `export` 限制在当前 shell 会话内。** 不要将其添加到 `~/.bashrc` / `~/.zshrc` —— 在 profile 级别导出会将 bearer token 暴露给从该 shell 启动的每个进程（IDE 子进程、浏览器调试器、来自不相关项目的 `npm` 脚本）。对于长期运行的环境，请使用下面的 systemd `EnvironmentFile=` / launchd `EnvironmentVariables` 机制 —— 两者都将 token 范围限定在守护进程本身。

守护进程通过 CLI 的 `--token <value>` 或环境变量 `QWEN_SERVER_TOKEN`（两者均会去除空白字符）读取 bearer token。TypeScript SDK 的 `DaemonClient` 构造函数在未传入 `token` 选项时会回退到 `QWEN_SERVER_TOKEN`（PR 27 回退 —— 设置了该环境变量的客户端永远无需在脚本中传递 token 值）。

一个 shell 级别的 `export` 即可同时覆盖服务器启动和 SDK 客户端构造（只需按照上述说明将其限制在当前会话内即可）。

## Linux：systemd 用户单元

> **首先找到你的 `qwen` 二进制文件。** 单元文件中的 `ExecStart=` 必须是**绝对路径** —— 服务管理器不会读取你的 shell 的 `PATH`。运行 `which qwen` 来找到它。常见位置：`/usr/local/bin/qwen`（Linuxbrew、手动安装）、`~/.nvm/versions/node/vX.Y.Z/bin/qwen`（nvm）、`~/.fnm/aliases/default/bin/qwen`（fnm）、`~/.volta/bin/qwen`（Volta）。在下方模板显示 `/PATH/TO/qwen` 的地方替换为实际路径。

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code 守护进程（回环 HTTP + SSE）
After=network.target

[Service]
Type=simple
# 替换为你的项目；在用户单元下，%h 展开为 $HOME。
WorkingDirectory=%h/your-project
# 运行 `which qwen` 找到绝对路径。systemd 不会读取 $PATH。
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# 从 chmod 600 的文件中读取 bearer token，而不是将其内联到单元中。
# `Environment=` 会将 token 暴露在单元文件中（通常权限为 644 = 世界可读）。
# EnvironmentFile 将 token 保留在你已创建的 `chmod 600` 用户私有文件中。
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

一次性创建环境文件（设置步骤中的 token 文件保存原始值；此处将其包装为 `KEY=value` 形式，以便 systemd 将其作为环境变量赋值读取）：

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

管理：

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # 保持用户管理器在注销后/重启后运行
journalctl --user -u qwen-serve -f               # 查看日志尾部
systemctl --user restart qwen-serve.service     # token 轮换后
systemctl --user disable --now qwen-serve.service
```

如果不执行 `loginctl enable-linger`，用户级别的 systemd 实例会在用户注销时关闭，并仅在下次登录时重新启动 —— 在无头开发机上，守护进程将无法在 SSH 会话结束后存活。`enable-linger` 是实现“重启后仍运行”的关键。

**系统级替代方案**（共享开发主机，较少见）：将单元文件放在 `/etc/systemd/system/qwen-serve@.service` 中，并设置 `User=%i`，通过 `sudo systemctl enable --now qwen-serve@<username>.service` 管理。其他 `[Service]` 内容相同 —— 但在此级别下，世界可读的 `Environment=` 暴露问题更为严重，因此始终使用 `EnvironmentFile=` 指向用户的 `chmod 600` 文件。对于单用户工作站，优先选择用户级 + linger。

## macOS：launchd 用户代理

> **首先找到你的 `qwen` 二进制文件。** 与 systemd 相同 —— `ProgramArguments` 必须是**绝对路径**。运行 `which qwen` 找到它。macOS 上的常见位置：`/opt/homebrew/bin/qwen`（Apple Silicon 上的 Homebrew）、`/usr/local/bin/qwen`（Intel 上的 Homebrew、手动安装）、`~/.nvm/versions/node/vX.Y.Z/bin/qwen`（nvm）、`~/.volta/bin/qwen`（Volta）。在下方模板显示 `/PATH/TO/qwen` 的地方替换。

`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- 运行 `which qwen` 找到绝对路径；launchd 不会读取 $PATH。 -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd 不会展开 `~` 或 `$HOME` —— 使用绝对路径。 -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- 不要将包含真实 token 的此文件提交到版本控制。同时将 plist 设置为 chmod 600，
         以免内联的 token 被世界可读。 -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>在此粘贴你的 token</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- 仅在非零退出时重启（与 systemd 的 Restart=on-failure 匹配）。
       使用裸的 `<true/>` 会在干净的 SIGTERM 后也重新启动，使得 `kill <pid>`
       无法用作停止信号 —— 操作者必须执行 `launchctl unload`。
       SuccessfulExit=false 解决了这个问题。 -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- 限制持续失败时的重启风暴（与 systemd 的 RestartSec=5 对应；
       launchd 的默认行为是每不到 1 秒重新启动一次）。 -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- 日志写入用户的 Library 目录，而不是 /tmp。/tmp 是全世界可写的
       （在共享工作站上存在符号链接攻击风险），并且会被 periodic-daily 在 3 天后清理；
       `~/Library/Logs/qwen-serve/` 是用户作用域的且持久保存。
       launchd 在每次 `load` 时截断这些文件，因此 unload→load 的 token 轮换周期会擦除之前的
       诊断日志 —— 如果需要事后检查，请备份这些日志。 -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

管理：

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # 仅首次
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist 包含内联 token
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # 停止
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

编辑 plist 后（例如轮换 token），你必须先 `unload` 再 `load` —— launchd 不会像 systemd 的 `daemon-reload` 那样自动重新加载 plist。注意：每次 `load` 会截断日志文件，因此如果你在轮换前正在调查某个事件，请先保存它们。

## tmux 会话（交互式监督）

假设 `QWEN_SERVER_TOKEN` 已在你的 shell 中导出（见上面的设置章节）：

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # 查看实时日志；Ctrl-b d 分离
tmux kill-session -t qwen-serve
```

`tmux new -d` 继承父 shell 的环境，因此 `QWEN_SERVER_TOKEN` 会自动传递。最适合当你希望偶尔查看守护进程的标准输出（认证警告、MCP 发现进度、慢客户端警告）又不想提交给服务单元时使用。终端关闭后仍可存活，但主机重启后不会保留。

## nohup 单行命令（快速且简陋）

假设 `QWEN_SERVER_TOKEN` 已在你的 shell 中导出：

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # 守护进程 PID；如果后续想干净地 `kill`，请记下它
```

外层的 `bash -c '...'` 确保守护进程绑定到 `~/your-project` 而不是你执行命令时的随机目录。如果没有这个 `cd`，`qwen serve` 默认使用 `process.cwd()`，而客户端的 `POST /session` 如果期望你的项目工作区，会返回 `400 workspace_mismatch` —— 这是一个隐蔽的陷阱。

适用于一次性“让我在后台运行一下，同时调试 API”的工作流。**不推荐**用于任何超出单个会话的场景 —— 没有崩溃重启机制，日志文件无限增长，如果忘记 PID 则无法干净地找到守护进程。对于交互式监督，优先使用 tmux；对于需要跨重启运行的任何东西，优先使用 systemd 或 launchd。

## 验证守护进程是否已启动

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # 守护进程的功能集
```

当配置了认证（即守护进程是通过 `--token` / `QWEN_SERVER_TOKEN` 启动的，或者使用了 `--require-auth=true`）时，回环接口上的除 `/health` 之外的所有路由都需要 `Authorization: Bearer <token>`。如果你在没有 token 的情况下使用回环默认值启动守护进程（`qwen serve` 零配置路径），则两个调用都不需要请求头。上面的模板都配置了 token，因此实践中需要 `Authorization` 请求头。如果 `/capabilities` 返回 401，说明单元/plist 中的 token 与你的 `curl` 使用的环境变量中的 token 不匹配。

## Token 轮换

1. 生成新 token 并写入单元引用的环境文件：
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   （对于 launchd / nohup / tmux 模板：编辑 plist 中的 `<string>` 值或重新执行 `export QWEN_SERVER_TOKEN`。如果重新生成 plist，别忘了 `chmod 600`。）
2. 重启守护进程：
   - **systemd**：`systemctl --user restart qwen-serve.service`
   - **launchd**：`launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**：`kill <pid>` 然后使用环境中的新 token 重新运行
3. 更新所有客户端 SDK / 脚本。TypeScript SDK 的 `DaemonClient` 会自动读取 `QWEN_SERVER_TOKEN`（PR 27 回退）—— 在任何客户端 shell 中重新 `export` 新值并重建客户端。

## 重启与崩溃行为

不同模板的服务管理器重启语义不同：

- **systemd `Restart=on-failure`** —— 仅在非零退出/信号时重启。干净的 SIGTERM（`systemctl stop`）**不会**触发重启循环。
- **launchd 的 `KeepAlive` 配合 `SuccessfulExit=false`**（上面的模板）—— 与 systemd 行为一致。裸的 `<true/>` 会在干净退出后也重新启动。`ThrottleInterval=10` 限制了持续失败时的重启风暴速率，与 systemd 的 `RestartSec=5` 对应。
- **tmux / nohup** —— 无自动重启。守护进程崩溃后 PID 变为无效，直到你重新运行。

在**单个守护进程生命周期内**，客户端断开连接可以通过 SSE `Last-Event-ID` 恢复，具体见用户指南中的[持久性模型](./qwen-serve.md#持久性模型)章节 —— 重放环位于内存中。

守护进程**重启**会丢弃所有内存中的会话；客户端重新连接并从头开始。会话内容（提示词、工具调用、对话历史）的跨重启持久性**不**在 v0.16-alpha 中。

## 超出范围（推迟至 v0.16.x 或更晚）

- **容器化部署** —— Dockerfile、docker-compose、Kubernetes 清单、nginx + TLS 反向代理、多实例 token 隔离。推迟至 v0.16.x，届时将有一个企业试点项目；否则文档会因无人验证而过时。
- **跨主机联邦 / 单主机上的多守护进程协调** —— 强制 `1 个守护进程 = 1 个工作区 × N 个会话`。实例路径 token 键控 + 过期 token 清理推迟至 v0.16.x。
- **自动生成守护进程 token** —— alpha 版本为 BYO token。自动生成 + token 存储基础设施推迟至 v0.16.x。
- **Windows 原生服务**（`nssm`、服务控制管理器包装器）—— 目前请使用 [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) 并参考上面的 systemd 章节。

请参阅主用户指南中的 [v0.16-alpha 已知限制](./qwen-serve.md#v016-alpha-已知限制) 提醒，了解完整的推迟功能列表，以及 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) 了解 v0.16-alpha 发布跟踪问题。