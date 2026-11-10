# Settings reference

This page covers common and advanced user settings. See [settings](/en/users/settings/) for file selection, precedence, and trust. Dots in a key represent nested objects; do not write a dotted key as a literal top-level JSON property.

```json
{
  "ui": { "showLineNumbers": true },
  "general": { "plan": { "enabled": true } }
}
```

Defaults describe source definitions; unset values may be resolved by the host, model, or runtime policy. Restart the process after changing fields marked for restart. `outputStyle` applies to the next conversation; use `/clear` or `/new`.

## Models and behavior

| Key | Type | Default | Restart | Purpose |
| --- | --- | --- | --- | --- |
| `model.name` | string | Unset / runtime-dependent | No | The model to use for conversations. |
| `model.reasoningEffort` | enum | Unset / runtime-dependent | No | Deprecated: migrated into model.preferences[modelId].reasoning.effort. Explicit reasoning effort for models that support effort levels. |
| `model.contextWindow` | number | Unset / runtime-dependent | No | Deprecated: migrated into model.preferences[modelId].contextWindow. Explicit context window in tokens for models that support context window options. |
| `outputStyle` | string | Unset / runtime-dependent | Yes | Active output style name. Applies on top of the mandatory identity guards — it can only extend the system prompt, not replace it. |
| `language` | string | Unset / runtime-dependent | Yes | Preferred language for AI responses (e.g., "Chinese", "Japanese", "Spanish"). Leave empty for default (English). |
| `agent` | 'string' as const | Unset / runtime-dependent | Yes | Name of an agent to use for the main thread. When set, the main session uses this agent's system prompt, tools, and model configuration. |
| `general.maxAttempts` | number | Provided by CLI host | No | Maximum main-model request attempts, including the initial attempt. |
| `general.retryFetchErrors` | boolean | `true` | No | Retry on "exception TypeError: fetch failed sending request" errors. |
| `output.format` | enum | `text` | No | The format of the CLI output. Can be `text` or `json`. |
| `autoMemoryEnabled` | boolean | Unset / runtime-dependent | Yes | Automatically save and load reusable information for the current project. When unset, the QCS rollout default applies. |
| `autoMemoryUserScopeEnabled` | boolean | Unset / runtime-dependent | Yes | Automatically save and load reusable information shared across projects. When unset, the QCS rollout default applies. |


## Permissions and trust

| Key | Type | Default | Restart | Purpose |
| --- | --- | --- | --- | --- |
| `general.defaultPermissionMode` | string | `default` | No | Default tool permission mode: default, accept_edits, auto, bypass_permissions or dont_ask. Legacy aliases are accepted for compatibility. |
| `security.folderTrust.enabled` | boolean | `true` | Yes | Setting to track whether Folder trust is enabled. |
| `security.disableYoloMode` | boolean | `false` | Yes | Disable bypass permissions mode, even if enabled by a flag. |
| `permissions.additionalDirectories` | array | `[]` | No | Additional workspace directories trusted for file access in the project. |
| `permissions.trustDirectories` | array | `[]` | No | Explicitly trusted directories stored at user scope. |
| `security.enableAllExternalImports` | boolean | `false` | Yes | Automatically approve all external @import references in AGENTS.md files, even when they point outside the project root. |
| `security.approvedExternalImportProjects` | array | `[]` | Yes | List of project directories where external @import references in AGENTS.md files have been approved. |
| `security.environmentVariableRedaction.enabled` | boolean | `false` | Yes | Enable redaction of environment variables that may contain secrets. |
| `security.environmentVariableRedaction.allowed` | array | `[]` | Yes | Environment variables to always allow (bypass redaction). |
| `security.environmentVariableRedaction.blocked` | array | `[]` | Yes | Environment variables to always redact. |


## Context and workspaces

| Key | Type | Default | Restart | Purpose |
| --- | --- | --- | --- | --- |
| `context.fileName` | string | `AGENTS.md` | No | The name of the context file or files to load into memory. Accepts either a single string or an array of strings. |
| `context.discoveryMaxDirs` | number | `200` | No | Maximum number of directories to search for memory. |
| `context.memoryBoundaryMarkers` | array | `['.git']` | Yes | Stop upward AGENTS.md discovery at a directory containing a boundary marker. An empty array disables parent traversal. |
| `context.loadMemoryFromIncludeDirectories` | boolean | `false` | No | Load AGENTS.md from trusted additional workspace directories at startup. |
| `context.fileFiltering.respectGitIgnore` | boolean | `true` | Yes | Respect .gitignore files when searching. |
| `context.fileFiltering.respectBrandIgnore` | boolean | `true` | Yes | Respect .qwenignore when searching. |
| `context.fileFiltering.customIgnoreFilePaths` | array | `[]` | Yes | Additional ignore files, with earlier entries taking precedence over later entries, .qwenignore and .gitignore. |
| `agentsMdExcludes` | array | `[]` | Yes | Glob patterns or absolute paths excluding project/local instruction files; global and extension instructions are unaffected. |
| `worktree.baseRef` | string | `'fresh'` | Yes | fresh starts from the origin default branch; head inherits the requesting checkout HEAD, not its uncommitted changes. |
| `worktree.sparsePaths` | array | `[]` | Yes | Repository-relative sparse-checkout cone paths. An empty list checks out the full tree. Requires Git 2.27 or later. |
| `worktree.symlinkDirectories` | array | `[]` | Yes | Repository-relative real directories to symlink from the main checkout. Escaping or invalid paths are skipped. |
| `general.fileCheckpointing.enabled` | boolean | `true` | Yes | Enable file checkpointing for code rewind |
| `general.plan.enabled` | boolean | `true` | Yes | Enable Plan Mode for read-only safety during planning. When disabled, /plan command and --permission-mode plan are both rejected. |
| `general.plan.directory` | string | Unset / runtime-dependent | Yes | The directory where planning artifacts are stored. If not specified, defaults to the system temporary directory. A custom directory requires a policy to allow write access in Plan Mode. |


## Tools and extensions

| Key | Type | Default | Restart | Purpose |
| --- | --- | --- | --- | --- |
| `tools.core` | array | Unset / runtime-dependent | Yes | Restrict built-in tools to an allowlist; omitted tools are denied. |
| `tools.exclude` | array | Unset / runtime-dependent | Yes | Tool names to exclude. |
| `tools.shell.pager` | string | `'cat'` | No | The pager command to use for shell output. Defaults to `cat`. |
| `tools.shell.showColor` | boolean | `true` | No | Show color in shell output. |
| `tools.shell.inactivityTimeout` | number | `300` | No | The maximum time in seconds allowed without output from the shell command. Defaults to 5 minutes. |
| `tools.useRipgrep` | boolean | `true` | No | Use ripgrep for file content search instead of the fallback implementation. Provides faster search performance. |
| `mcp.allowed` | array | Unset / runtime-dependent | Yes | A list of MCP servers to allow. |
| `mcp.excluded` | array | Unset / runtime-dependent | Yes | A list of MCP servers to exclude. |
| `mcp.enableAllProjectMcpServers` | boolean | `false` | Yes | Automatically approve all project-level MCP servers. |
| `mcp.enabledProjectMcpServers` | array | `[]` | Yes | List of approved project-level MCP server names. |
| `mcp.disabledProjectMcpServers` | array | `[]` | Yes | List of rejected project-level MCP server names. |
| `mcp.lazyLoad` | boolean | `false` | Yes | Expose MCP discovery and invocation through meta tools when CodeMode is off. CodeMode uses its own discovery path. |
| `skills.enabled` | boolean | `true` | Yes | Enable Agent Skills. |
| `skills.loadFromAgentsDirectory` | boolean | `true` | Yes | Load skills from legacy .agents/skills directories for this session. The user source is shared across sessions; trusted project settings can enable it when needed. SDK mode defaults this off unless explicitly enabled. Restart the CLI after changing this setting. |
| `skills.disabled` | array | `[]` | Yes | List of disabled skills. |
| `skills.disableShellExecution` | boolean | `false` | No | Disable shell injection in user Skill prompts; built-in and managed Skills are unaffected. |
| `plugins.enabled` | array | `[]` | Yes | Deprecated: use top-level enabledPlugins instead. Retained for migration only. |
| `plugins.disabled` | array | `[]` | Yes | Deprecated: use top-level enabledPlugins with value false instead. Retained for migration only. |
| `plugins.autoUpdate` | boolean | `true` | No | Automatically refresh eligible marketplace data and update already-installed plugins in the background. Declared marketplace source changes are still reconciled. |
| `disableAllHooks` | boolean | `false` | No | When true, all hooks and statusLine execution are disabled regardless of individual settings. Top-level kill switch. |
| `allowedHttpHookUrls` | array | Unset / runtime-dependent | Yes | Allowlist of URL patterns that HTTP hooks may target. Supports * as a wildcard. Undefined allows all URLs; an empty array blocks all HTTP hooks. |
| `hooksConfig.enabled` | boolean | `true` | Yes | Canonical toggle for the hooks system. When disabled, no hooks will be executed. |
| `hooksConfig.notifications` | boolean | `false` | No | Show hook lifecycle messages (started/completed/progress) in chat history. Hook failures are always shown regardless of this setting. |
| `hooksConfig.headlessFastMode` | boolean | `false` | Yes | Skip user hooks in headless mode. This can bypass user-defined audit or policy hooks. |
| `experimental.enableAgents` | boolean | `true` | Yes | Enable subagents. |


## Terminal appearance

| Key | Type | Default | Restart | Purpose |
| --- | --- | --- | --- | --- |
| `ui.language` | enum | `en` | No | Language used by the interactive interface. |
| `ui.theme` | string | `'auto'` | No | The color theme for the UI, or `auto` to follow the terminal background color. See the CLI themes guide for available options. |
| `ui.autoThemeSwitching` | boolean | `true` | No | Re-check the terminal background color while running and update the theme when `ui.theme` is `auto`. Disable to resolve the theme once at startup and then hold it. |
| `general.preferredEditor` | string | Unset / runtime-dependent | No | The preferred editor to open files in. |
| `general.vimMode` | boolean | `false` | No | Enable Vim keybindings |
| `ui.hideWindowTitle` | boolean | `false` | Yes | Hide the window title bar |
| `ui.inlineThinkingMode` | enum | `full` | No | Display model thinking inline: off or full. |
| `ui.showShortcutsHint` | boolean | `true` | No | Show the "? for shortcuts" hint above the input. |
| `ui.compactToolOutput` | boolean | `true` | No | Display tool outputs (like directory listings and file reads) in a compact, structured format. |
| `ui.copyFullResponse` | boolean | `false` | No | Skip the /copy picker and always copy the full assistant response. |
| `ui.hideBanner` | boolean | `false` | No | Hide the application banner |
| `ui.hideContextSummary` | boolean | `false` | No | Hide the context summary above the input. |
| `ui.hideFooter` | boolean | `false` | No | Deprecated and ignored. Retained so existing settings files keep validating; the legacy footer is retired. |
| `ui.showLineNumbers` | boolean | `true` | No | Show line numbers in the chat. |
| `ui.renderMermaid` | boolean | `true` | No | Render complete Mermaid code blocks as text diagrams. |
| `ui.errorVerbosity` | enum | `low` | No | Controls whether recoverable errors are hidden (low) or fully shown (full). |
| `ui.accessibility.screenReader` | boolean | `false` | Yes | Render output in plain-text to be more screen reader accessible |
| `statusLine.type` | string | `command` | No | The type of status line. Currently only "command" is supported. |
| `statusLine.command` | string | `""` | No | Shell command to execute for the status line. Receives JSON session data on stdin. Output (including ANSI colors) is displayed below the input prompt. |
| `statusLine.padding` | number | `0` | No | Horizontal padding (in characters) applied to the status line output. |


## Updates and data

| Key | Type | Default | Restart | Purpose |
| --- | --- | --- | --- | --- |
| `general.enableAutoUpdate` | boolean | `true` | No | Enable automatic updates. |
| `general.enableAutoUpdateNotification` | boolean | `true` | No | Enable update notification prompts. |
| `general.enableNotifications` | boolean | `false` | No | Enable run-event notifications for action-required prompts and session completion. |
| `privacy.usageStatisticsEnabled` | boolean | `true` | No | Share usage data; false enables Privacy Mode, not a complete telemetry shutdown. |
| `general.sessionRetention.enabled` | boolean | `false` | No | Enable automatic cleanup of sessions and associated tool outputs (disabled by default). Diagnostic logs are cleaned independently after 30 days. |
| `general.sessionRetention.maxAge` | string | `'30d'` | No | Automatically delete chats older than this time period (e.g., "30d", "7d", "24h", "1w") |
| `general.sessionRetention.maxCount` | number | Unset / runtime-dependent | No | Maximum number of count-limited cleanup targets to keep. Transcript JSONL files ignore this setting and are deleted only by maxAge. |
| `general.sessionRetention.minRetention` | string | Provided by CLI host | No | Minimum retention period used as a deletion safety limit. |
| `advanced.useProxyFromEnvironment` | boolean | `true` | Yes | Whether the CLI, including SDK integrations, automatically uses HTTPS_PROXY, https_proxy, HTTP_PROXY, or http_proxy when no explicit startup proxy is supplied. |
| `advanced.excludedEnvVars` | array | `['DEBUG', 'DEBUG_MODE']` | No | Environment variables to exclude from project context. |


## Structured configuration and advanced boundaries

`providers`, `mcpServers`, `hooks`, `permissions`, marketplace entries, and agent definitions have structured formats. Use the examples in [models](/en/users/models/), [MCP](/en/users/mcp/), [hooks](/en/users/hooks/), [permissions](/en/users/permissions/), [plugins](/en/users/plugins/), and [subagents](/en/users/subagents/).

The source file `schemas/settings.schema.json` contains machine-readable definitions, including host integrations, compatibility fields, and experiments. A schema entry does not establish a stable public feature contract. Do not copy unknown internal settings to bypass feature restrictions. Model overrides, team protocols, debugging, and runtime-injected fields are outside this page's user configuration contract.
