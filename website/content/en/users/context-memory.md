# Context and memory

Qwen Code combines conversation history, project instructions, tool definitions, and task-specific content when preparing model requests. Keep durable project rules in a context file and use the conversation for the task at hand.

## Project instructions

The default context filename is `AGENTS.md`. Run `/init` to analyze the project and create tailored instructions; interactive mode offers initialization choices. Review the generated file before committing it.

For example, a project-root `AGENTS.md` might contain:

```markdown
# Project instructions

Use the package manager declared in package.json.
Run only tests relevant to the changed package.
Preserve public API compatibility unless the task explicitly changes it.
Report the tests you ran and any remaining failures.
```

Directory-specific instruction files can provide more specific guidance. Discovery is scoped by workspace and trust rules, and nested instructions can be loaded when the agent accesses files in that directory. A file existing on disk does not mean it is already included in the current request. Use `/memory` to inspect the current overview.

To use another filename, set `context.fileName` in settings. It accepts one name or an array:

```json
{
  "context": {
    "fileName": ["AGENTS.md", "PROJECT.md"]
  }
}
```

Loaded instruction changes are checked across turns; newly discovered nested instructions are handled as files are accessed. There is no `/memory reload` command in this version.

## Inspect and compact context

`/context` displays context-window usage and a breakdown that includes conversation, system instructions, and tool schemas. This is a context diagnostic, not a billing statement. `/context-window` manages the window preference for models that support it; choosing a larger value cannot expand a provider's actual model limit.

Use `/compact` to replace earlier conversational context with a summary. You can supply retention guidance:

```text
/compact Keep the API decisions, failing test names, and unfinished migration steps
```

Summaries may omit details. Keep exact requirements in project files and check the retained context before continuing a sensitive change. Start a separate conversation when the next task is unrelated.

## Automatic memory

Automatic memory saves reusable information in project or user scopes. Project memory is specific to the project; user memory can influence work across projects. It is separate from the human-maintained `AGENTS.md` files and from saved conversation transcripts.

Two settings control the scopes:

```json
{
  "autoMemoryEnabled": true,
  "autoMemoryUserScopeEnabled": false
}
```

These settings require a restart. If omitted, the runtime determines the defaults; do not assume automatic memory is enabled in every installation. `/memory` shows the overview, and `/memory manage` opens automatic-memory file management when the feature is enabled. If it reports that memory is disabled, review the settings and restart.

Review saved information periodically, especially before sharing a workspace. Memory is contextual guidance, not a guarantee that every past fact will be remembered or remain correct. Agent-specific persistent memory is described in [subagents](/en/users/subagents/).
