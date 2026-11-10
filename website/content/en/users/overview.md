# Qwen Code 1.0 Preview

Qwen Code is a terminal coding agent. Work inside a project, ask a question or describe a change, inspect the proposed tool actions, and review the resulting diff and verification output.

The interactive CLI combines project instructions, model selection, file and shell tools, permission controls, persistent sessions, and extensions. Print mode supports scripted requests. Availability can depend on the selected model, account, project trust, and configuration.

## Start with one task

After obtaining the Preview executable, start it in a project:

```sh
cd my-project
qwen
```

Use `/auth` to connect an account or provider and `/model` to select a model. Ask: “Explain this project's entry points and test commands. Do not edit files yet.” Then request a small change with an explicit verification step. Read the proposed permissions before approving tools; use `/diff` to inspect changes.

See [installation](/en/users/installation/) for installation commands and [quickstart](/en/users/quickstart/) for your first task.

## Find the right guide

| Need | Guide |
| --- | --- |
| Connect an account, API, or model | [Authentication](/en/users/authentication/), [models](/en/users/models/) |
| Set project behavior and control actions | [Settings](/en/users/settings/), [permissions](/en/users/permissions/) |
| Work efficiently in the terminal | [Terminal](/en/users/terminal/), [context and memory](/en/users/context-memory/) |
| Resume, branch, or recover work | [Sessions](/en/users/sessions/), [workspaces](/en/users/workspaces/) |
| Plan and delegate a task | [Planning](/en/users/planning/), [subagents](/en/users/subagents/), [background tasks](/en/users/tasks-workflows/) |
| Add reusable capabilities | [Skills](/en/users/skills/), [commands](/en/users/custom-commands/), [plugins](/en/users/plugins/) |
| Connect tools and automate events | [MCP](/en/users/mcp/), [hooks](/en/users/hooks/) |
| Use the CLI from a script | [Headless mode](/en/users/headless/) |
| Look up exact syntax | [CLI reference](/en/users/cli-reference/), [settings reference](/en/users/settings-reference/), [hook reference](/en/users/hooks-reference/) |
| Diagnose a failure or inspect local data | [Troubleshooting](/en/users/troubleshooting/), [data and privacy](/en/users/data-privacy/) |

## Preview scope

These guides cover the terminal CLI. A command registered in the application may require an enabled feature or a supported session state. `/help`, a command's own help, and the active UI show the options available in your installation. Experimental settings are not a guarantee of a stable integration contract.

Review generated code and test results before merging changes. Session rewind is useful for recovery but does not replace Git or backups, and may not restore edits made outside the agent's tracked file tools.

To work on the code itself, see the [contributor guide](/en/developers/contributing/).
