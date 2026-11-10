# Background tasks and workflows

Background work allows the main conversation to continue while another operation runs. Use bounded tasks with clear outputs, and inspect their completion state before relying on the result.

## Send a contextual subtask

After the first conversation turn has completed, run:

```text
/subtask Inspect the parser tests and report missing edge cases. Do not edit files.
```

This starts a background fork worker with the parent conversation's full context and rendered system instructions. It executes the directive and reports completion back to the conversation. Its state is also visible through `/tasks`.

The command requires an initialized session and a rendered system prompt, so it cannot run before the first conversation turn. It cannot be invoked from inside another forked worker. If agent sessions are disabled, the command explains that it is unavailable. Agent sessions are enabled by default; set `QWEN_ENABLE_AGENT_SESSIONS=0` before launching the default branded build to disable them. This is distinct from other experimental agent settings.

Forking context does not promise separate working files. Give parallel workers independent scopes; use explicit worktree isolation when filesystem separation is required. A directive such as “do not edit files” is an instruction, not a substitute for tool restrictions.

## Inspect tasks

`/tasks` opens the unified background task panel; `/bg` and `/background` are aliases. Use the panel to inspect current state and output and follow the actions shown for the selected task. Task types can have different controls. A completed, failed, or interrupted state should be reviewed before continuing dependent work.

Saved task records support history and diagnostics. They do not guarantee execution continues after the CLI process exits. On a subsequent startup, abandoned running records can be reconciled to an interrupted state. If a background result is missing, first inspect `/tasks` and the reported error rather than immediately starting a duplicate operation.

## Workflow tasks

`/workflows` (alias `/workflow-tasks`) opens the session's workflow task browser. It does not itself define or start a workflow.

Available workflow commands are loaded from displayable workflow Skills, including enabled plugin resources. Their names and argument requirements depend on the installed definitions. Use `/help`, command completion, and the Skill's instructions to identify the actual command; there is no universal workflow command name that works in every installation.

For a workflow supplied by an installed resource:

1. Check that the resource is enabled and visible in `/skills` or `/plugins`.
2. Inspect the workflow's description, inputs, and expected output.
3. Invoke its displayed slash command with the documented arguments.
4. Follow execution in `/workflows` and inspect task outputs before accepting the result.

If a workflow command is absent, check resource availability, workspace trust, and whether Skills are administratively disabled. A workflow definition appearing on disk does not establish that it is loaded or runnable. Use [subagents](/en/users/subagents/) for individual specialized workers, and [plans and goals](/en/users/planning/) for coordinating an outcome across turns.
