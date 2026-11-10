# Directories and Git worktrees

The working directory determines the initial project context. Start Qwen Code inside a project, or select it explicitly:

```bash
qwen --cwd /path/to/project
```

`--config-dir` changes the user-level configuration root; it does not select the project. Use `--cwd` for that purpose.

## Include another directory

For a task spanning related repositories, run:

```text
/add-dir ../shared-library
/add-dir list
```

The path must exist and be a directory. Relative paths resolve against the current target directory. `/add-dir` without a path opens the directory picker. The command asks whether to trust the directory for this session or persist it in the project's local settings.

| Choice | Lifetime |
| --- | --- |
| Session only | Added to the current workspace and permission context; removed when the session is cleared |
| Persist | Saved in `.qwen/settings.local.json` as `permissions.additionalDirectories`; reloaded for later conversations |

When local settings are read-only, such as a home-directory workspace, the command can fall back to session-only access. Read the resulting message. After adding a trusted directory, Qwen Code refreshes its resources; if refreshing fails, the directory can still be trusted, so address the reported refresh error separately.

At startup, you can repeat `--add-dir`:

```bash
qwen --cwd /path/to/app --add-dir /path/to/library --add-dir /path/to/tests
```

Adding a directory expands workspace access. It does not bypass individual tool permissions. Review instructions and executable resources from a directory before trusting it.

## Work in an isolated checkout

In a Git repository, use:

```bash
qwen --worktree preview-fix
```

Omit the optional name to let Qwen Code choose one. The worktree is created under the repository's `.qwen/worktrees/` directory with a corresponding Git branch. This provides separate checked-out files for the task. It does not isolate the network, credentials, external services, or all runtime state like an operating-system sandbox.

Use simple names containing letters, digits, dots, underscores, and dashes. Avoid traversal components such as `..`. If creation fails, inspect the Git repository state, write permissions, and whether the requested name is already in use. Do not delete a worktree containing needed changes to resolve a naming conflict; choose another name or inspect it first.

Before leaving or removing a worktree, inspect `git status` and save the changes you need. Session branching alone does not create a worktree. Subagents can request worktree isolation in their definitions; see [subagents](/en/users/subagents/).
