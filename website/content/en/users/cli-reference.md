# CLI command reference

Use `qwen --help` in your shell and `/help` inside an interactive session. They are different interfaces. This reference covers root options visible in help, user slash commands, and extension subcommands. Hidden host protocols and developer diagnostics are not a stable public API.

```sh
qwen
qwen "Explain this project"
qwen -p "Summarize the README"
qwen --help
qwen --version
```

The positional argument is the initial prompt; `-p` selects print mode. Separate a prompt from variadic options with `--` so it is not consumed as another option value. Examples require a configured model.

## Root options

| Syntax | Purpose |
| --- | --- |
| `-d, --debug` | Run in debug mode |
| `-m, --model <model>` | Model for the current session. Default and New Models use model name; Custom uses modelID |
| `--reasoning-effort <level>` | Set reasoning effort level |
| `--thinking <mode>` | Set thinking mode (auto, adaptive, enabled, or disabled) |
| `--thinking-budget <tokens>` | Set a fixed thinking token budget (implies --thinking enabled) |
| `--context-window <size>` | Explicit context window for supported models |
| `--list-models` | List available models for the current user |
| `-i, --prompt-interactive <text>` | Execute prompt and continue in interactive mode |
| `-w, --cwd <dir>` | Change working directory before startup |
| `--config-dir <dir>` | Use a custom user-level config root for this run |
| `--worktree [name]` | Start in a new git worktree |
| `--permission-mode <mode>` | Permission mode: default, accept_edits, bypass_permissions, dont_ask, auto (subject to policy). |
| `--dangerously-skip-permissions` | Skip ordinary approval requests; non-skippable checks and policies still apply |
| `--allowed-mcp-server-names <name>` | Allowed MCP server names |
| `--tools <tools...>` | Restrict available built-in tools ("" to disable all, "default" for all; use -p or -- to separate from query) |
| `--allowed-tools <tool>` | Tools to allow |
| `--disallowed-tools <tool>` | Tools to deny |
| `--attachment <file>` | Attach files to the initial prompt |
| `--plugin-dir <dir>` | Plugin directories to load |
| `-c, --continue` | Continue the most recent session |
| `--fork-session` | Create a new session from a resumed conversation |
| `-r, --resume [id]` | Resume a previous session by identifier |
| `-n, --name <name>` | Set a display name for this session |
| `--session-id <id>` | Use a specific session ID |
| `--list-sessions` | List available sessions and exit |
| `--delete-session <index>` | Delete a session by index number |
| `--add-dir <dir>` | Additional directories to include in the workspace |
| `-o, --output-format <format>` | The format of the CLI output |
| `--input-format <format>` | The format of the CLI input |
| `--max-output-tokens <size>` | Set maximum model output tokens |
| `-p, --print` | Print response and exit (non-interactive) |
| `--no-session-persistence` | Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print) |
| `--agent <name>` | Agent for the current session |
| `--agents <json>` | JSON object defining custom agents |
| `--append-system-prompt <text>` | Append to the default system prompt |
| `--system-prompt <text>` | System prompt for the session |
| `--output-style <style>` | Output style for this session |
| `--max-model-request-retries <count>` | Maximum retries for Provider model requests |
| `--mcp-config <config>` | Load MCP servers from JSON file(s) or inline JSON |
| `--strict-mcp-config` | Only use MCP servers from --mcp-config |
| `--setting-sources <source>` | Setting sources to load (user, project, local) |
| `--settings <json>` | Load additional settings from a JSON file path or inline JSON string |

The command framework also provides `--help` and `--version`. Tool allow rules do not replace project trust or organizational restrictions. Non-skippable checks still apply when bypassing approvals. Read [permissions](/en/users/permissions/) before using `--dangerously-skip-permissions`. Thinking and context-window options depend on model support.

## Interactive slash commands

| Command | Purpose |
| --- | --- |
| `/about` | Show version info |
| `/add-dir` | Add a directory to the workspace context |
| `/agents` | Manage agents |
| `/branch` | Create a new session branch from the current conversation |
| `/btw` | Ask a quick side question without interrupting the main conversation |
| `/clear` | Clear the screen and start a new conversation |
| `/commands` | Reload and list all available slash commands |
| `/compact` | Compresses the context by replacing it with a summary |
| `/context` | Visualize current context window usage |
| `/context-window` | Set context window for the current model |
| `/continue` | Continue the most recent session for the current project |
| `/copy` | Copy the last assistant response to clipboard, or /copy N for the Nth-latest |
| `/corgi` | Toggles corgi mode |
| `/diff` | Show uncommitted git changes |
| `/editor` | Set external editor preference |
| `/effort` | Set reasoning effort for the current model |
| `/export` | Export the current conversation to a file or clipboard |
| `/goal` | Set or manage a persistent goal for the current session |
| `/help` | Show application help and keyboard shortcuts |
| `/hooks` | Open hooks management panel |
| `/init` | Analyzes the project and creates a tailored context file |
| `/insights` | Generate a report analyzing your sessions |
| `/marketplace` | Manage plugin marketplaces |
| `/mcp` | Manage configured Model Context Protocol (MCP) servers |
| `/memory` | Commands for interacting with memory |
| `/model` | Set or manage model configuration |
| `/new` | Start a new conversation |
| `/output-style` | Configure the output style for the next conversation |
| `/permissions` | Manage permissions |
| `/plan` | Toggle Plan Mode (enter when off, exit when on) |
| `/plugins` | Manage plugins |
| `/quit` | Exit the application |
| `/release-notes` | Show recent release notes |
| `/rename` | Rename the current conversation |
| `/resume` | Resume a session by identifier, or open the session browser |
| `/review` | Review code changes and find actionable issues |
| `/rewind` | Open rewind selector |
| `/settings` | View and edit application settings |
| `/shortcuts` | Toggle the shortcuts panel above the input |
| `/skills` | Manage agent skills |
| `/status` | Show session status |
| `/statusline` | Set up a custom status line. Uses a sub-agent to read your shell config and create a statusline script that's updated after each response. |
| `/subtask` | Send a subagent off with your full context; its result comes back here |
| `/tasks` | Show background tasks panel |
| `/theme` | Change the theme |
| `/tools` | List available tools |
| `/usage` | Show usage statistics for the current session |
| `/vim` | Toggle vim mode on/off for this session |
| `/workflows` | Browse workflow tasks in the session rail |
| `/auth` | Connect or switch an account/provider; aliases `/connect`, `/login` |
| `/logout` | Sign out of the selected account; alias `/signout` |
| `/terminal-setup` | Configure terminal integration in supported interactive terminals |

Common aliases include `/summarize` and `/compress` for `/compact`, `/checkpoint` for `/rewind`, `/bg` and `/background` for `/tasks`, `/config` for `/settings`, and `/exit` for `/quit`.

This list does not imply every command is enabled in every environment: planning and agents can be disabled; `/subtask` requires an initial turn and does not allow a nested fork; `/terminal-setup` is not for ACP sessions. Skills, plugins, and workflows can register more commands; inspect them with `/commands`.

## Shell subcommands

The following groups expose these actions. Read their `--help` output for arguments and scopes, then follow the linked guide.

| Group | Actions | Guide |
| --- | --- | --- |
| `qwen mcp` | `add`, `add-json`, `remove`, `get`, `list`, `enable`, `disable`, `reset-project-choices` | [MCP](/en/users/mcp/) |
| `qwen plugins` | `list`, `validate`, `install`, `uninstall`, `enable`, `disable`, `update`, `marketplace` | [Plugins](/en/users/plugins/) |
| `qwen skills` | `list`, `enable`, `disable`, `install`, `link`, `uninstall` | [Skills](/en/users/skills/) |
| `qwen agents` | `list` | [Agents](/en/users/subagents/) |
| `qwen hooks` | `migrate` | [Hooks](/en/users/hooks/) |
| `qwen update` | `--check` | [Installation](/en/users/installation/) |
| `qwen rollback` | `--to` | [Installation](/en/users/installation/) |

Update and rollback depend on installation state and an available release source. Public distribution remains unconfirmed. See [headless mode](/en/users/headless/) for scripted input and output.
