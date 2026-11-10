# Permissions and workspace trust

Qwen Code can read and modify files, execute commands, and call connected tools. Permissions determine how tool requests are allowed, denied, or presented for approval. Workspace trust also determines whether project configuration is loaded.

## Choose a permission mode

```sh
qwen --permission-mode default
```

| Mode | Behavior |
| --- | --- |
| `default` | Preserves approval requests that are not already resolved by applicable rules. |
| `accept_edits` | Automatically accepts eligible edit requests. Other requests, safety objections, and applicable hook requests can still require approval. |
| `auto` | Uses the automatic permission classifier where available to evaluate requests. It is not a guarantee that every request proceeds without intervention. |
| `dont_ask` | Denies requests that would otherwise need approval. Already allowed operations can proceed. |
| `bypass_permissions` | Skips ordinary approval requests. Some non-skippable or bypass-immune requests remain; this is not an override of every policy. |

Set a default in user settings:

```json
{
  "general": {
    "defaultPermissionMode": "default"
  }
}
```

`--dangerously-skip-permissions` selects bypass behavior. Use it only when you intend to authorize ordinary tool actions without reviewing each request. Permission modes are not an operating-system sandbox, and neither mode selection nor workspace trust isolates your filesystem or network.

## Review rules

Open `/permissions` to manage tool permission rules, review recent denials, and inspect trusted directories. Inspect a rule's scope before saving it: a persistent user rule has a wider effect than a session-specific decision.

For a launch-specific allowance or denial:

```sh
qwen --allowed-tools 'Bash(ls:*)'
qwen --disallowed-tools 'Bash'
```

Rule strings identify tools and can constrain tool arguments. Quote them so your shell does not interpret parentheses or wildcards. Do not turn a narrowly intended command allowance into a blanket shell allowance.

Allow rules do not make a disabled tool available and do not establish that every other applicable check will pass. If a request is denied, inspect the recorded reason rather than immediately switching to bypass mode.

## Restrict the available tools

`--tools` changes the available built-in tool set. It is distinct from allowing a tool through the permission system.

```sh
qwen --tools "" -p "Answer without using built-in tools."
```

An empty value disables built-in tools. It does not claim to disable every separately configured MCP capability. `--tools default` selects the normal built-in set. The option accepts multiple values, so separate the prompt with `-p` or `--` to avoid treating prompt words as tool names.

Use `--allowed-mcp-server-names` when you need to limit MCP servers for a launch. Review server definitions and tool descriptions as well as permissions.

## Workspace trust

Untrusted project and local settings are excluded from the normal settings merge. The project `.qwen/.env` file is still read, but variables that control which programs run (the shell prefix, the Git Bash path, and on Windows `PATH` and related variables) are ignored for an untrusted project. User configuration remains independent. An explicit `--settings` file is an intentional override and is not protected by the project-trust filter.

Non-interactive runs treat the working directory as trusted. With `-p`, piped or redirected input or output, `CI=true`, or `GITHUB_ACTIONS=true`, project and local settings, hooks, and project MCP servers load without a trust decision. Only automate repositories whose configuration you have reviewed, or pass `--setting-sources user`.

Use the trust and directory controls in `/permissions` to review directories beyond the current workspace. `/add-dir` and `--add-dir` add workspace directories; granting access to an additional directory broadens the files available for the task.

Do not treat “trusted project” as a promise that every file, hook, plugin, or shell command in it is harmless. Review the configuration and the tool request you are authorizing.

## Non-interactive tasks

For automation, establish credentials and explicit permissions before running. `dont_ask` is useful when operations requiring new approval should fail rather than await a prompt. Test a small representative request first and handle denied operations as failures.

See [Settings](/en/users/settings/) for source precedence and [Troubleshooting](/en/users/troubleshooting/) for diagnosing unexpected denials.

