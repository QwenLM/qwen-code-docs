# Hook events and protocol reference

Start with the [Hooks guide](/en/users/hooks/). The table lists the 27 events explicitly exposed in the settings schema. Delivery depends on the associated feature and action; configuring an event alone does not create a workflow, team, or file watcher.

## Events

| Event | Trigger |
| --- | --- |
| `PreToolUse` | Before a tool executes; inspect tool_name and tool_input. |
| `PostToolUse` | After successful tool execution; includes tool_response. |
| `PostToolUseFailure` | After tool failure; includes error and interruption context. |
| `SubagentStart` | When a subagent starts. |
| `SubagentStop` | When a subagent is about to finish. |
| `Notification` | A notification is emitted; inspect notification_type. |
| `SessionStart` | Session initialization; source identifies how it started. |
| `SessionEnd` | Session shutdown; includes reason. |
| `PreCompact` | Before context compaction. |
| `PostCompact` | After context compaction. |
| `Stop` | The assistant is about to stop responding. |
| `QueryEnd` | A query completes; notification only. |
| `UserPromptSubmit` | Before a submitted user prompt is processed. |
| `ConfigChange` | A configuration change is being processed. |
| `StopFailure` | An error stops the agent; notification only. |
| `TeammateIdle` | A teammate attempts to become idle. |
| `InstructionsLoaded` | Instruction files load; notification only. |
| `CwdChanged` | The working directory changes; old_cwd and new_cwd. |
| `FileChanged` | A watched file changes; file_path and event. |
| `WorktreeCreate` | Create a worktree; return its path. |
| `WorktreeRemove` | Remove a worktree. |
| `Elicitation` | An MCP server requests structured user input. |
| `ElicitationResult` | After the MCP elicitation result. |
| `TaskCreated` | A task is created. |
| `TaskCompleted` | A task is marked complete. |
| `PermissionRequest` | A tool operation requires a permission decision. |
| `PermissionDenied` | A tool operation has been denied. |

## Configuration structure

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["-e", "process.stdout.write(JSON.stringify({systemMessage: 'Session started'}))"],
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

An event contains an array of definitions. Each definition has a `hooks` array and optional `matcher`, `sequential`, and `async`. Matcher values depend on the event; do not apply tool-name matching rules to every lifecycle event. For command hooks, `args` enables direct process invocation: shell pipes, redirects, and globbing are not interpreted, and `shell` is ignored.

| Type | Main fields | Behavior |
| --- | --- | --- |
| `command` | `command`, `args?`, `shell?`, `env?`, `timeout?` | Read JSON on stdin; return output on stdout |
| `http` | `url`, `headers?`, `allowedEnvVars?`, `timeout?` | POST input JSON and read a JSON response, subject to URL policy |
| `prompt` | `prompt`, `model?`, `timeout?` | Evaluate the event with a single model request |
| `agent` | `prompt`, `tools?`, `maxTurns?`, `timeout?` | Verify a condition with a tool-using agent and structured result |

`timeout` is measured in seconds. `runtime` is an internal function form, not a user hook to serialize in JSON. Model-based hooks make model requests. Asynchronous output is not guaranteed to arrive before the original operation; do not use asynchronous hooks for checks that must block synchronously.

## Input and output

Common input fields are `session_id`, `transcript_path`, `cwd`, and `hook_event_name`. `model`, `permission_mode`, `agent_id`, `agent_type`, and `workspace_dirs` are optional according to context. Events add their own fields; scripts should tolerate unknown fields and missing optional fields.

```json
{
  "systemMessage": "Validation completed"
}
```

`systemMessage` is a UI message; do not assume the model receives it. For model context, use the event-supported `hookSpecificOutput` fields. `SessionStart` and `UserPromptSubmit` also have dedicated stdout-to-context handling. When returning JSON on stdout, send debugging text to stderr to avoid corrupting parsing.

Command hooks generally use exit code `0` for success, `2` for blocking feedback, and other nonzero codes for non-blocking errors. Event semantics take precedence: `StopFailure` and `InstructionsLoaded` are notification-only and ignore control output; any nonzero `WorktreeCreate` exit fails creation, and success must return the worktree path. Not every event is a permission interceptor.

HTTP hooks transmit the event payload. Headers support `${ENV_VAR}` interpolation, optionally restricted by `allowedEnvVars`; review configurations using [permissions](/en/users/permissions/) and [data and privacy](/en/users/data-privacy/). First verify delivery with a notification-only hook, then add the necessary control fields. Avoid unbounded continuation loops in stop hooks.
