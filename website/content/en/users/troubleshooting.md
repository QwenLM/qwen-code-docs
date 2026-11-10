# Troubleshooting

Start with the exact command, version, working directory, and error message. Change one variable at a time so that a successful retry has a clear explanation.

## The command is missing or the wrong version starts

Run `qwen --version` and inspect your shell's executable lookup. Open a new terminal after changing PATH. If several installations coexist, verify the resolved executable before changing settings. The Preview distribution method is still being finalized; follow the instructions accompanying your actual build.

## Startup reports a settings error

Check the file and field named in the warning. Settings support JSONC, but field types and values still have to be valid. Check [configuration precedence](/en/users/settings/), especially a higher-priority local file or `--settings` override.

To isolate disk settings, compare startup with:

```sh
qwen --setting-sources ""
```

This can also remove needed provider configuration. It is a diagnostic comparison, not a general fix; defaults and explicit flag settings still apply, and user environment-file fallback remains possible. Back up a problematic file before editing it.

## A project setting has no effect

Confirm the working directory, project trust, enabled setting sources, and higher-priority overrides. `--config-dir` changes the user root, not the project directory name. Restart after changing provider definitions or another setting that requires restart.

## Login succeeds but requests fail

Open `/auth` and `/model` to verify the selected connection and model. Check account entitlement separately from successful login. For a custom API, verify the endpoint, protocol, model ID, and credential in the shell that launches Qwen Code.

Typical service errors require different responses:

| Symptom | Check |
| --- | --- |
| Authentication or authorization failure | Credential validity and access to the selected model. |
| Unknown model or endpoint | Exact model ID, base URL, and protocol. |
| Rate or quota limit | Provider quota and request rate; retry according to the provider's response. |
| Connection timeout | Network reachability and service availability. |
| Unsupported request field | Model capabilities and reasoning/thinking overrides. |

Do not repeatedly retry a request that is clearly rejected for credentials or configuration. Restore model defaults when testing whether a reasoning or output-limit override caused an error.

## An environment variable is not resolved

Export the variable before starting the process. Settings placeholders are expanded before settings-service `.env` loading. A variable defined only in that file may therefore be unavailable during settings expansion. Ordinary project-root `.env` files are not searched by this loader. See [Settings and environment](/en/users/settings/).

## A tool is denied or unavailable

Use `/permissions` to inspect rules and recent denials. Check the active mode, explicit deny rules, available tool selection, workspace directories, and MCP configuration. `dont_ask` rejects requests that require new approval. `accept_edits` does not automatically approve arbitrary shell commands.

A tool absent from the available tool set cannot be restored solely by adding an allow rule. Avoid disabling all permission checks as a diagnostic shortcut.

## Update or rollback fails

Check the current version, network, and whether your build has a configured release source. `qwen update --check` checks without installing. Rollback requires an explicit available target version. Keep the full error message, but remove credentials or signed download parameters before sharing it.

## Gather a useful issue report

Include the operating system and terminal, `qwen --version`, a minimal reproduction, expected and actual behavior, selected provider/protocol without secrets, and whether the problem persists after restarting.

Default diagnostic locations are:

- Process log: `~/.qwen/logs/runs/<runId>/qwen.log`.
- Session event segments: `~/.qwen/logs/sessions/<projectId>/<sessionId>/segments/<runId>.jsonl`.

A custom configuration root changes these locations. Logs and settings can contain sensitive paths, prompts, tool arguments, or service details. Inspect and redact material before sharing a minimal excerpt. Never attach credential files or complete logs by default.

