# `qwen serve` 本地启动模板（v0.16-alpha）

`qwen serve` 作为开发者工作站上长期运行的后台进程的参考模板。配合 [v0.16-alpha 已知限制](./qwen-serve.md#v016-alpha-known-limits) 使用——仅限本地、单用户、自备 bearer token。容器化 / 多主机 / TLS 前置部署推迟到 v0.16.x。

> **适用人群**：希望守护进程在重启后仍能运行、日志写入持久存储、并具备清晰 `restart-on-failure` 策略的 dogfooding 开发者。如果只需要在单次 shell 会话期间运行守护进程，直接使用 `qwen serve`（前台运行，Ctrl-C 停止）即可。

## 生成 bearer token（只需一次）

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # 用户自管理，非内置路径
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

路径和文件名由你决定；v0.16-alpha 不会自动生成或自动定位 token 文件（推迟到 v0.16.x）。请参阅用户指南中的 [Authentication](./qwen-serve.md#authentication) 章节了解标准 BYO 配置方式。

> **将此 `export` 的作用域限制在当前 shell 会话内。** 不要将其添加到 `~/.bashrc` / `~/.zshrc`——配置文件级别的 export 会将 bearer token 暴露给从该 shell 派生的所有进程（IDE 子进程、浏览器调试器、无关项目的 `npm` 脚本）。对于长期运行的配置，请使用下面介绍的 systemd `EnvironmentFile=` / launchd `EnvironmentVariables` 机制——两者都将 token 的作用域限定为仅守护进程。

守护进程从 CLI 的 `--token <value>` 或 `QWEN_SERVER_TOKEN` 环境变量（两者均会去除首尾空白）读取 bearer token。TypeScript SDK 的 `DaemonClient` 构造函数在未传入 `token` 选项时会回退读取 `QWEN_SERVER_TOKEN`（PR 27 回退机制——设置了该环境变量的客户端无需在脚本中显式传递该值）。

一次 shell 级别的 `export` 即可同时覆盖服务器启动和 SDK 客户端构建（只需按上述说明将其限定在会话范围内）。

## Linux：systemd 用户单元

> **首先找到你的 `qwen` 二进制文件。** 单元文件的 `ExecStart=` 必须使用**绝对路径**——服务管理器不读取 shell 的 `PATH`。运行 `which qwen` 查找路径。常见位置：`/usr/local/bin/qwen`（Linuxbrew、手动安装），`~/.nvm/versions/node/vX.Y.Z/bin/qwen`（nvm），`~/.fnm/aliases/default/bin/qwen`（fnm），`~/.volta/bin/qwen`（Volta）。将下面模板中 `/PATH/TO/qwen` 替换为实际路径。

`~/.config/systemd/user/qwen-serve.service`：

```ini
[Unit]
Description=Qwen Code daemon (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Replace with your project; %h expands to $HOME under user units.
WorkingDirectory=%h/your-project
# Run `which qwen` to find the absolute path. systemd does NOT read $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Read the bearer token from a chmod 600 file rather than inlining it
# in the unit. `Environment=` would expose the token in the unit file
# (typically 644 = world-readable). EnvironmentFile keeps the token in
# the user-owned secret file you already created with `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

一次性构建 env 文件（setup 步骤中创建的 token 文件保存的是原始值；这里将其包装为 `KEY=value` 格式，以便 systemd 将其识别为环境变量赋值）：

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

管理命令：

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # 注销后/重启后保持用户管理器运行
journalctl --user -u qwen-serve -f               # 追踪日志
systemctl --user restart qwen-serve.service     # token 轮换后重启
systemctl --user disable --now qwen-serve.service
```

若不使用 `loginctl enable-linger`，用户级 systemd 实例会在用户注销时关闭，只在下次登录时重启——在无头开发机上，SSH 会话结束后守护进程将无法存活。`enable-linger` 是让"跨重启持久运行"真正生效的关键。

**系统级替代方案**（共享开发主机，较少见）：将单元文件放置于 `/etc/systemd/system/qwen-serve@.service`，添加 `User=%i`，通过 `sudo systemctl enable --now qwen-serve@<username>.service` 管理。`[Service]` 主体内容相同——但在此级别，`Environment=` 的世界可读暴露问题更为严重，因此务必使用 `EnvironmentFile=` 指向用户的 `chmod 600` 文件。单用户工作站建议选择用户级 + linger 方案。

## macOS：launchd 用户代理

> **首先找到你的 `qwen` 二进制文件。** 与 systemd 限制相同——`ProgramArguments` 必须使用**绝对路径**。运行 `which qwen` 查找路径。macOS 上的常见位置：`/opt/homebrew/bin/qwen`（Apple Silicon 上的 Homebrew），`/usr/local/bin/qwen`（Intel 上的 Homebrew、手动安装），`~/.nvm/versions/node/vX.Y.Z/bin/qwen`（nvm），`~/.volta/bin/qwen`（Volta）。将模板中 `/PATH/TO/qwen` 替换为实际路径。

`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- Run `which qwen` to find the absolute path; launchd does NOT read $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd does NOT expand `~` or `$HOME` — use absolute paths. -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- DO NOT COMMIT this file with a real token. Also chmod 600 the
         plist itself so the inlined token is not world-readable. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Restart only on non-zero exits (matches systemd Restart=on-failure).
       A bare `<true/>` would respawn even after a clean SIGTERM, making
       `kill <pid>` impossible to use as a stop signal — operator would
       have to `launchctl unload`. SuccessfulExit=false fixes that. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Throttle restart storms on persistent failures (mirrors systemd
       RestartSec=5; launchd's default would respawn every <1s). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Log into the user's Library, not /tmp. /tmp is world-writable
       (symlink-attack risk on shared workstations) and gets cleaned by
       periodic-daily after 3 days; `~/Library/Logs/qwen-serve/` is
       user-scoped and survives. launchd truncates these on every
       `load`, so the unload→load token-rotation cycle wipes prior
       diagnostic logs — back them up if you need post-incident
       inspection. -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

管理命令：

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # 仅首次执行
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist 中包含内联 token
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # 停止服务
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

编辑 plist 后（例如轮换 token），必须先 `unload` 再 `load`——`launchctl` 不像 `systemd daemon-reload` 那样自动重新加载 plist 更改。注意：每次 `load` 都会清空日志文件，因此如果你在轮换前正在排查问题，请先将日志备份。

## tmux 会话（交互式监控）

假设 `QWEN_SERVER_TOKEN` 已在你的 shell 中 export（参见上面的设置章节）：

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # 查看实时日志；Ctrl-b d 分离
tmux kill-session -t qwen-serve
```

`tmux new -d` 会继承父 shell 的环境，因此 `QWEN_SERVER_TOKEN` 会自动传入。适合偶尔需要查看守护进程 stdout（认证警告、MCP 发现进度、慢客户端警告）但又不想配置服务单元的场景。关闭终端后仍可存活，但不能跨主机重启持久化。

## nohup 一行命令（快速但粗糙）

假设 `QWEN_SERVER_TOKEN` 已在你的 shell 中 export：

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # 守护进程 PID；如需后续 `kill` 清理，请记录此值
```

外层 `bash -c '...'` 确保守护进程绑定到 `~/your-project`，而不是你运行命令时所在的目录。若不加 `cd`，`qwen serve` 默认使用 `process.cwd()`，客户端发送的 `POST /session` 期望使用你的项目工作区时会返回 `400 workspace_mismatch`——这是个难以察觉的陷阱。

适用于"让我在后台运行一下，同时调试 API"的一次性场景。**不推荐**用于超过单次会话的任何场景——崩溃后不会自动重启、日志文件无限增长、如果忘记 PID 也没有简洁的方式找到守护进程。交互式监控首选 tmux，需要跨重启持久化时首选 systemd / launchd。

## 验证守护进程是否正常运行

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # 守护进程的功能集
```

当配置了认证（即守护进程以 `--token` / `QWEN_SERVER_TOKEN` 启动，或设置了 `--require-auth=true`），除 loopback 绑定上的 `/health` 外，所有路由都需要 `Authorization: Bearer <token>`。如果你在 loopback 默认模式下启动守护进程时未设置 token（即 `qwen serve` 零配置路径），则两个请求都不需要 header。上面的模板均配置了 token，因此实际使用中需要 `Authorization` header。如果 `/capabilities` 返回 `401`，说明单元 / plist 中的 token 与你的 `curl` 使用的环境变量 token 不匹配。

## Token 轮换

1. 生成新 token 并写入单元引用的 env 文件：
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   （对于 launchd / nohup / tmux 模板：编辑 plist 中的 `<string>` 值，或重新 `export QWEN_SERVER_TOKEN`。如果重新生成 plist，不要忘记 `chmod 600`。）
2. 重启守护进程：
   - **systemd**：`systemctl --user restart qwen-serve.service`
   - **launchd**：`launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**：`kill <pid>`，然后以新 token 重新运行
3. 更新所有客户端 SDK / 脚本。TypeScript SDK 的 `DaemonClient` 会自动读取 `QWEN_SERVER_TOKEN`（PR 27 回退机制）——在客户端 shell 中重新 `export` 新值并重新构建客户端即可。

## 重启与崩溃行为

各模板的服务管理器重启语义有所不同：

- **systemd `Restart=on-failure`**——仅在非零退出 / 信号时重启。干净的 SIGTERM（`systemctl stop`）**不会**触发重启循环。
- **launchd `KeepAlive` 配合 `SuccessfulExit=false`**（上面的模板）——与 systemd 行为一致。裸 `<true/>` 会在干净退出后也触发重启。`ThrottleInterval=10` 在持续失败时限制重启频率，对应 systemd 的 `RestartSec=5`。
- **tmux / nohup**——不自动重启。守护进程崩溃后留下一个失效的 PID，直到你手动重新运行。

在**单个守护进程进程生命周期内**，客户端断连可通过 SSE `Last-Event-ID` 恢复，详见用户指南的 [Durability model](./qwen-serve.md#durability-model) 章节——重放环形缓冲区保存在内存中。

守护进程**重启**会丢弃所有内存中的会话；客户端重新连接后从头开始。跨重启的会话内容持久化（提示词、工具调用、对话历史）在 v0.16-alpha 中**不支持**。

## 超出范围（推迟到 v0.16.x 或更高版本）

- **容器化部署**——Dockerfile、docker-compose、Kubernetes 清单、nginx + TLS 反向代理、多实例 token 隔离。待企业试点确定后推迟到 v0.16.x；否则文档无人验证会腐化。
- **跨主机联邦 / 单主机多守护进程协调**——`1 守护进程 = 1 工作区 × N 会话` 是强制约束。实例路径 token 绑定 + 过期 token 清理推迟到 v0.16.x。
- **自动生成守护进程 token**——alpha 阶段为 BYO-token。自动生成 + token 存储基础设施推迟到 v0.16.x。
- **Windows 原生服务**（`nssm`、Service Control Manager 封装）——目前请使用 [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) 并参照上面的 systemd 章节操作。

完整的延迟功能列表请参阅主用户指南中的 [v0.16-alpha 已知限制](./qwen-serve.md#v016-alpha-known-limits) 说明，v0.16-alpha 推出追踪 issue 请见 [#4175](https://github.com/QwenLM/qwen-code/issues/4175)。
