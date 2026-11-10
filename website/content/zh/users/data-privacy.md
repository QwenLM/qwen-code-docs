# 本地数据、日志与隐私

Qwen Code 在本地保存配置与工作状态，并向你选择的模型提供商发送请求。工具输出、附件、项目指令和对话上下文可能成为请求的一部分。MCP 服务和 HTTP Hook 使用各自的目标地址与数据处理方式。

## 配置与诊断数据

默认用户配置根目录是 `~/.qwen`。`--config-dir` 可更改本次运行的用户配置根目录。项目配置见[设置](/zh/users/settings/)。

| 数据 | 默认位置或访问方式 |
| --- | --- |
| 用户设置 | `~/.qwen/settings.json` |
| 进程诊断日志 | `~/.qwen/logs/runs/<runId>/qwen.log` |
| 结构化会话日志 | `~/.qwen/logs/sessions/<projectId>/<sessionId>/segments/<runId>.jsonl` |
| 保存的对话 | 通过 `/resume` 或 `qwen --list-sessions` 浏览，通过 `/export` 导出 |

日志可能包含路径、错误、工具活动和会话信息。提交问题前先检查并脱敏。不要直接上传整个配置目录，其中可能包含凭证与私有项目数据。退出登录不等于删除已保存的对话或日志。

## 使用统计与隐私模式

`privacy.usageStatisticsEnabled` 默认为 `true`。设为 `false` 可启用隐私模式：

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

隐私模式会减少遥测属性，**不表示所有网络请求或遥测都停止**。公共属性仍可能包含会话 ID、随机安装 ID、是否交互运行以及隐私模式标记。登录认证、模型请求、已启用的集成与本地日志均独立于这一设置。不要把它当作离线模式开关。

## 保留与清理

自动会话清理默认关闭；诊断日志采用独立的 30 天清理策略。可通过以下配置主动开启会话清理：

```json
{
  "general": {
    "sessionRetention": {
      "enabled": true,
      "maxAge": "30d"
    }
  }
}
```

时长示例包括 `7d`、`24h`、`1w`。清理可能删除已保存会话及关联工具输出，请先导出需要保留的工作。`maxCount` 不是所有对话文件的统一数量上限：对话 JSONL 按时间清理，实现还会应用最短保留期保护。

脚本运行可用 `--no-session-persistence` 禁止保存本次会话，但它不会关闭诊断日志、模型请求或集成流量。详见[非交互模式](/zh/users/headless/)。

## 分享复现信息前

提供 CLI 版本、操作系统、所选提供商与协议、最小脱敏配置和准确错误。删除 API Key、授权头、令牌、个人标识、私有代码和私有 URL。涉及 Hook、插件或 Shell 执行的问题，尽量使用可丢弃的项目复现。
