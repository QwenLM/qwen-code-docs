# Sessions, branches, and rewind

A session holds a conversation and its saved state. Use separate sessions for independent tasks and branches when you want to explore alternatives from an existing conversation.

## Find and resume work

| Command | Effect |
| --- | --- |
| `/resume` | Open the session browser |
| `/resume <identifier>` | Find a session by identifier |
| `/continue` | Continue the most recent session for the current project |
| `/rename <name>` | Give the current conversation a display name |
| `/new` or `/clear` | Start a fresh conversation |

You can also select a session when launching:

```bash
qwen --continue
qwen --resume '<session-id>'
qwen --list-sessions
qwen --name "API migration"
```

In the session browser, follow the on-screen project, branch, and worktree filters if an expected session is missing. Start in the relevant project directory. A custom `--config-dir` can change which user data is available.

`qwen --delete-session <index>` deletes a saved session using its listed index. List sessions immediately before selecting an index. Deleting a transcript does not revert the code changes made during that session.

## Branch a conversation

After at least one visible conversation message, run:

```text
/branch Alternative implementation
```

This creates a new session from the current conversation and switches into it. The command reports how to resume the original. Branching copies conversation state, including available runtime preferences and workspace information; it does not create a separate Git branch or filesystem copy. In an existing worktree, the branched conversation stays attached to that worktree.

At startup, `qwen --resume <session-id> --fork-session` creates a new session from a resumed conversation. Use a [worktree](/en/users/workspaces/) when alternatives also need separate working files.

## Rewind

`/rewind` (alias `/checkpoint`) opens the rewind selector. Select a point, then inspect the available restoration options: conversation, files, or both. The confirmation view explains the file changes that can be restored and any files without usable backups.

Rewind is limited to available file history. **Files edited manually or through shell commands may not be restored.** Conversation-only rewind leaves files as they are; file restoration can overwrite later edits. Review the preview and keep Git commits or backups for changes you need to preserve. Rewind does not undo external actions such as a deployment or a sent request.

## Export and persistence

Use `/export` to save a readable conversation. An export is for review and sharing; it is not a replacement for the saved session format used by `/resume`.

For non-interactive work, `--no-session-persistence` works with `--print` and prevents the session from being saved for later resumption:

```bash
qwen --print --no-session-persistence "Summarize the project structure"
```

This option concerns session persistence; it does not promise that no diagnostic logs or other application data are written.
