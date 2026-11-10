# Hooks

Hooks run actions at defined points in a Qwen Code session. Use them for deterministic checks, notifications, and integration with local or remote systems. A hook is executable configuration: inspect its command, destination, and data use before enabling it.

## Add a command hook

Merge this configuration into `.qwen/settings.json` in a trusted project:

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

Create `.qwen/hooks/prompt-check.cjs`:

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

This example needs Node.js on PATH and assumes Qwen Code starts at the project root. It reads the event JSON from stdin and emits a JSON hook result. It does not store the prompt or modify files. Send a message and inspect `/hooks` and session diagnostics to verify loading and execution. Restart after editing configuration if the active session has not adopted it.

Using `args` invokes an executable directly without a shell: each array element is one literal argument, and the `shell` setting is ignored. Without `args`, `command` is a shell command; `shell` can select `bash` or `powershell`. Resolve scripts explicitly when running from different working directories. Hook environments include `QWEN_PROJECT_DIR` for the project directory.

## Configuration shape and scope

Hooks live under the `hooks` setting, with event names mapping to arrays of definitions. Each definition contains a `hooks` array and may include `matcher`, `sequential`, and `async`. User hooks belong in `~/.qwen/settings.json`; project hooks belong in `.qwen/settings.json`, and personal project hooks in `.qwen/settings.local.json`. Project/local configuration follows project trust. Plugins and skills can also supply hooks.

`matcher` filters the event's tool name or trigger where available. Omit it for all occurrences of that event. Tool matchers support regular expressions; use anchors when you require an exact match. A per-hook `if` filter can restrict a tool name and argument pattern. Do not assume every event has a tool name or accepts the same output fields.

By default, synchronous hooks can run concurrently. `sequential: true` requests sequential execution for the event's synchronous plan. Asynchronous hooks do not block the current action, so they are unsuitable for a check that must prevent that action from starting.

## Hook types

| Type | Required fields | Behavior |
| --- | --- | --- |
| `command` | `command` | Executes a program or shell command; event JSON is provided on stdin |
| `http` | `url` | POSTs event JSON and reads a JSON hook result |
| `prompt` | `prompt` | Asks a model to evaluate the event and return a decision |
| `agent` | `prompt` | Uses an agent with tools to verify a condition |

`timeout` is measured in **seconds**. HTTP hooks support `headers` with `${ENV_VAR}` substitution and an `allowedEnvVars` allowlist. Prompt and agent hooks may use a `model` override; they require working model access and consume model requests. Agent hooks also accept `tools` and `maxTurns`. Runtime callback hooks are host integration facilities, not JSON functions to paste into settings.

## Events

Common lifecycle events include `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PreCompact`, `PostCompact`, `Stop`, `QueryEnd`, `SubagentStart`, `SubagentStop`, and `Notification`.

The configuration also recognizes events for configuration, instructions, permissions, tasks, worktrees and elicitation: `ConfigChange`, `InstructionsLoaded`, `CwdChanged`, `FileChanged`, `PermissionRequest`, `PermissionDenied`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `WorktreeCreate`, `WorktreeRemove`, `Elicitation`, `ElicitationResult`, and `StopFailure`. Their occurrence depends on the corresponding feature and operation. An event being accepted in configuration does not mean it fires in every session or execution mode.

## Input, output and failures

Common input fields include `session_id`, `transcript_path`, `cwd`, and `hook_event_name`; event-specific fields supply the prompt, tool input, or other context. Do not assume all optional fields are present. Treat input as data, especially when constructing shell commands or sending it to another service.

A command exit code of `0` means successful execution. Exit code `2` represents a blocking result; whether and how it blocks depends on the event. Other nonzero exit codes are execution errors rather than an instruction to block. JSON output may carry `systemMessage`, `reason`, or event-specific control fields. A UI `systemMessage` is not equivalent to injecting instructions into the model. Keep stdout reserved for a valid result and use stderr for diagnostics.

Stop hooks must avoid repeatedly rejecting the same completion without a path to success. Asynchronous results cannot retroactively stop an already-completed tool call. Do not use notification-only events as permission enforcement.

## Troubleshooting

- **Nothing runs:** verify the active settings scope, project trust, event spelling, hook availability, and matcher. Test without a matcher first.
- **Executable cannot be found:** verify PATH and interpreter availability; prefer explicit paths for automation.
- **Invalid result:** remove banners and logging from stdout; parse stdin as one JSON document.
- **Unexpected delays:** set a suitable timeout, check network/model dependencies, and avoid sequential execution unless ordered checks are required.
- **Old configuration:** `/hooks` helps inspect current hooks; `qwen hooks migrate --help` describes migration of supported older hook formats. Review changes before replacing your configuration.
