# Hooks

Hook 在 Qwen Code 会话的特定节点执行操作，适合确定性检查、通知和本地或远程系统集成。Hook 属于可执行配置，启用前应检查命令、目标地址以及数据用途。

## 添加命令 Hook

将下面配置合并到受信任项目的 `.qwen/settings.json`：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": [".qwen/hooks/prompt-check.cjs"],
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

创建 `.qwen/hooks/prompt-check.cjs`：

```javascript
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const event = JSON.parse(input);
  if (event.hook_event_name !== 'UserPromptSubmit') process.exit(0);
  process.stdout.write(JSON.stringify({
    systemMessage: 'Project prompt check completed.'
  }));
});
```

示例需要 PATH 中有 Node.js，并假设从项目根目录启动 Qwen Code。脚本从 stdin 读取事件 JSON，输出 JSON Hook 结果，不保存提示词、不修改文件。发送一条消息后，通过 `/hooks` 与会话诊断确认加载和执行。修改配置后，若活动会话尚未采用新配置，可重启验证。

配置 `args` 时直接调用程序，不经过 Shell：数组每项是一个原样参数，此时忽略 `shell`。没有 `args` 时，`command` 按 Shell 命令执行，可用 `shell` 选择 `bash` 或 `powershell`。工作目录会变化时，应明确脚本路径。Hook 环境中包含表示项目目录的 `QWEN_PROJECT_DIR`。

## 配置结构和作用域

`hooks` 设置下以事件名为键，值为定义数组。每个定义包含 `hooks` 数组，也可设置 `matcher`、`sequential` 和 `async`。用户 Hook 放在 `~/.qwen/settings.json`，项目 Hook 放在 `.qwen/settings.json`，项目个人 Hook 放在 `.qwen/settings.local.json`。项目及本地配置受信任规则控制。插件和 Skill 也可以提供 Hook。

事件提供相应信息时，`matcher` 筛选工具名或触发来源；省略则匹配该事件的所有发生。工具 matcher 支持正则表达式，要求精确匹配时应使用锚点。每个 Hook 的 `if` 还可筛选工具名与参数模式。并非每个事件都有工具名，也并非都接受相同的输出字段。

同步 Hook 默认可以并行执行。`sequential: true` 要求该事件的同步执行计划按顺序执行。异步 Hook 不阻塞当前操作，因此不适合必须在操作开始前阻止执行的检查。

## Hook 类型

| 类型 | 必填字段 | 行为 |
| --- | --- | --- |
| `command` | `command` | 执行程序或 Shell 命令，从 stdin 传入事件 JSON |
| `http` | `url` | POST 事件 JSON，并读取 JSON Hook 结果 |
| `prompt` | `prompt` | 让模型评估事件并返回决定 |
| `agent` | `prompt` | 通过有工具能力的 Agent 验证条件 |

`timeout` 单位为**秒**。HTTP Hook 的 `headers` 支持 `${ENV_VAR}` 替换，可通过 `allowedEnvVars` 限制变量。Prompt 和 agent Hook 可指定 `model`，需要有效模型访问并产生模型请求。Agent Hook 还接受 `tools` 与 `maxTurns`。运行时回调属于宿主集成能力，不能把 JavaScript 函数当作 JSON 配置粘贴进设置。

## 事件

常用生命周期事件包括 `SessionStart`、`SessionEnd`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PreCompact`、`PostCompact`、`Stop`、`QueryEnd`、`SubagentStart`、`SubagentStop` 和 `Notification`。

配置还接受与设置、指令、权限、任务、工作树和信息征询有关的事件：`ConfigChange`、`InstructionsLoaded`、`CwdChanged`、`FileChanged`、`PermissionRequest`、`PermissionDenied`、`TaskCreated`、`TaskCompleted`、`TeammateIdle`、`WorktreeCreate`、`WorktreeRemove`、`Elicitation`、`ElicitationResult` 和 `StopFailure`。是否发生取决于对应能力和具体操作。事件名可配置，不代表每种会话和运行模式都会触发。

## 输入、输出与失败

公共输入包括 `session_id`、`transcript_path`、`cwd` 和 `hook_event_name`；事件特有字段提供提示词、工具输入等上下文。不能假设所有可选字段都存在。应将输入当作数据处理，尤其是在拼接 Shell 命令或发送到外部服务时。

命令退出码 `0` 表示执行成功，`2` 表示阻断结果；能否以及如何阻断取决于事件。其他非零退出码表示执行错误，不等同于要求阻断。JSON 输出可携带 `systemMessage`、`reason` 或事件特有控制字段。面向 UI 的 `systemMessage` 不等同于向模型注入指令。stdout 保留给有效结果，诊断日志写入 stderr。

Stop Hook 应避免反复否决同一完成状态却不给出可满足的条件。异步结果不能撤销已完成的工具调用，通知类事件也不能替代权限控制。

## 故障排查

- **没有执行：**检查实际生效的作用域、项目信任、事件拼写、Hook 是否可用和 matcher；先去掉 matcher 验证。
- **找不到程序：**检查 PATH 和解释器，自动化场景优先使用明确路径。
- **结果格式错误：**移除 stdout 中的横幅和日志，将 stdin 作为完整 JSON 文档解析。
- **耗时异常：**设置合适超时，检查网络与模型依赖，只有确需顺序时才启用顺序执行。
- **旧配置未更新：**用 `/hooks` 检查当前配置；`qwen hooks migrate --from-claude` 将 Claude Code 的 Hook 配置导入 `.qwen/settings.json`，替换前审阅迁移结果。
