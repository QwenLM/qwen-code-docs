# Local data, logs, and privacy

Qwen Code stores configuration and working state locally and sends requests to the model provider you select. Tool output, attached files, project instructions, and conversation context can become part of those requests. MCP servers and HTTP hooks have their own destinations and data handling.

## Local configuration and diagnostics

The default user configuration root is `~/.qwen`. `--config-dir` changes the user configuration root for a run. Project configuration is described in [settings](/en/users/settings/).

| Data | Default location or access |
| --- | --- |
| User settings | `~/.qwen/settings.json` |
| Process diagnostic log | `~/.qwen/logs/runs/<runId>/qwen.log` |
| Structured session logs | `~/.qwen/logs/sessions/<projectId>/<sessionId>/segments/<runId>.jsonl` |
| Saved conversations | Browse with `/resume` or `qwen --list-sessions`; export with `/export` |

Logs can contain paths, errors, tool activity, and session details. Inspect and redact logs before attaching them to an issue. Avoid uploading your whole configuration directory: it can include credentials and private project data. Signing out is not a request to delete saved conversations or logs.

## Usage statistics and Privacy Mode

`privacy.usageStatisticsEnabled` defaults to `true` and controls usage statistics. Set it to `false` to enable Privacy Mode:

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

The public Qwen Code build does not install a usage-telemetry exporter. Privacy Mode does **not** stop other network traffic: authentication, model requests, update checks, enabled integrations, and local logging are separate from this setting. Do not use it as an offline-mode switch.

## Retention

Automatic session cleanup is disabled by default. Diagnostic logs have a separate 30-day cleanup policy. To opt into session cleanup:

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

Supported duration examples include `7d`, `24h`, and `1w`. Cleanup can remove saved sessions and associated tool output. Export work you need to keep first. `maxCount` is not a universal cap on transcript files: transcript JSONL cleanup is age-based, and the implementation applies a minimum retention safeguard.

For scripts, `--no-session-persistence` prevents saving the session for that run. It does not disable diagnostic logging, provider requests, or integration traffic. See [headless mode](/en/users/headless/).

## Before sharing a reproduction

Include the CLI version, operating system, selected provider/protocol, a minimal redacted configuration, and the exact error. Remove API keys, authorization headers, tokens, personal identifiers, proprietary code, and private URLs. Reproduce against a disposable project if the issue involves hooks, plugins, or shell execution.
