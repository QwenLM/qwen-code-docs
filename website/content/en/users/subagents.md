# Subagents

Subagents let the main agent delegate a bounded task to a specialized agent. A definition describes the agent's purpose, instructions, model preferences, and tool limits. The model decides when to invoke an available definition based on the task and description; merely creating a definition does not start it.

## Discover and reload definitions

Use `/agents` to manage agents and inspect available definitions. After editing definitions on disk, run `/agents reload` to refresh them. Do not assume a saved file is immediately available to the current conversation.

| Source | Default directory |
| --- | --- |
| User | `~/.qwen/agents/` |
| Project | `.qwen/agents/` |

Project discovery is subject to trust and configuration. Plugins and the `--agents` option can also supply definitions. Loading order is built-in, user, project, plugin, then flag/SDK definitions; later definitions with the same name take precedence. A custom user configuration root changes the user directory.

## Define an agent

Create `.qwen/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Review a focused code change for correctness and missing tests.
tools: Read, Glob, Grep
model: inherit
maxTurns: 12
---

Inspect the requested change and relevant call sites.
Report concrete defects with file locations and explain their impact.
Do not modify files. State what you could not verify.
```

Both `name` and `description` are required. The Markdown body supplies instructions. Reload the definition, then ask: “Use the reviewer agent to inspect this change.” You can also start a session with a selected agent using `qwen --agent reviewer`.

Frequently used frontmatter fields:

| Field | Meaning |
| --- | --- |
| `tools` | Tool names or supported patterns to include |
| `disallowedTools` | Tool names to remove from the available set |
| `model` | Model selection; `inherit` follows the parent model when the agent starts |
| `effort` | Reasoning preference; support depends on the selected model |
| `maxTurns` | Positive maximum turn count |
| `timeoutMins` | Positive runtime timeout in minutes |
| `skills` | Skills to preload |
| `memory` | Persistent memory scope: `user`, `project`, or `local` |
| `isolation` | `worktree` requests a separate Git worktree |
| `background` | Request background execution |
| `permissionMode` | Agent permission mode, subject to runtime validation and policy |

The full definition also supports agent-specific MCP servers and hooks. Use the corresponding guides to configure those mechanisms; plugin definitions are additionally sanitized before registration.

## Tool and permission boundaries

Omitting `tools` inherits the caller's active tools. **An empty `tools: []` also means inheritance, not zero tools.** Use an explicit allowlist for a restricted agent. Supported inclusion patterns include exact names, `*`, `mcp__*`, `mcp__server__*`, and `Agent(name1, name2)`.

For ordinary tools, `disallowedTools` removes exact names; it does not interpret wildcard patterns or shell-command permission expressions. `Agent(name)` is a special form that restricts a particular agent type. Execution-time permission rules are a separate layer.

The effective tool set also depends on caller visibility, foreground/background execution, nested-agent limits, memory support, and permissions. A child cannot make a tool available just by naming one its caller cannot use. Check the actual available tools and reported load errors if behavior differs from the definition.

## Persistent agent memory

`memory: user` stores memory under `~/.qwen/agent-memory/<agent-name>/`; `project` uses `.qwen/agent-memory/<agent-name>/`; `local` uses `.qwen/agent-memory-local/<agent-name>/`. These locations contain a `MEMORY.md` entrypoint and optional topic files. Use `local` for project-specific memory you do not intend to share, and exclude private local data from version control.

Agent memory takes effect only when automatic memory is enabled (`autoMemoryEnabled` / `autoMemoryUserScopeEnabled`; headless runs also need `QWEN_MEMORY_HEADLESS=1`). Otherwise the `memory` field is ignored. See [context and memory](/en/users/context-memory/).

Memory support can add the file tools needed to maintain it before deny rules are applied. Review the final permissions rather than assuming memory is read-only.

For a background worker that inherits the full current conversation instead of using a normal specialized definition, see [`/subtask` and task management](/en/users/tasks-workflows/).
