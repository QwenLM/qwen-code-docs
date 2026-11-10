# Custom commands

Custom commands turn a repeated prompt into a named slash command. Use a Markdown file for a compact prompt; use a [skill](/en/users/skills/) when the task also needs scripts or reference material.

## Create a command

Create `.qwen/commands/review-change.md`:

```markdown
---
description: Review a change for correctness and missing tests.
argument-hint: "[path]"
disable-model-invocation: true
---
Review the changes affecting $ARGUMENTS.
Read the diff and nearby implementation.
Report actionable findings with file paths and explain their impact.
If there are no findings, say so and describe any unverified behavior.
Do not edit files.
```

Enter `/review-change src/` in an interactive session. The command supplies instructions to the model; it is not a separate executable. Tools requested by those instructions still follow the session's permission rules.

## Location and names

| File | Command |
| --- | --- |
| `.qwen/commands/review-change.md` | `/review-change` |
| `.qwen/commands/team/review-change.md` | `/team:review-change` |
| `~/.qwen/commands/review-change.md` | Personal `/review-change` |
| Plugin `commands/review-change.md` | `/plugin-name:review-change` |

Directory segments become colon-separated namespaces; command-name segments retain their characters. The identity comes from the relative file path. Project commands require the project's resources to be available under the current trust policy. The effective user directory follows `--config-dir`.

Use `/commands` to browse commands and `/skills` to inspect their shared resource state. Avoid names that collide with built-in commands or another extension, and use the displayed qualified name when necessary.

## Arguments

`$ARGUMENTS` inserts the complete argument string. `$0` and `$ARGUMENTS[0]` insert the first argument; `$1` inserts the second. Quoted values are parsed as a single argument. These placeholders construct a prompt and do not, by themselves, execute a shell command.

For named arguments:

```markdown
---
description: Compare two modules.
arguments:
  - name: source
    description: First module
    required: true
  - name: target
    description: Second module
    required: true
---
Compare $source with $target. Explain responsibilities and dependencies.
```

Argument metadata provides guidance; write instructions for handling incomplete input rather than treating it as a complete input-validation system. If a nonempty argument string has no placeholder, it is appended to the prompt. See [Skills](/en/users/skills/) for the other supported frontmatter fields.

## Maintain commands

Keep each command focused on one repeatable result. Describe the expected evidence and output. Put shared commands in the repository; keep personal or environment-specific instructions in the user directory. Never embed credentials in committed command files.

Commands and skills share discovery and invocation machinery. A command with `user-invocable: false` does not appear as a user slash command. With `disable-model-invocation: true`, it is reserved for explicit invocation. Changes are watched; restart the session if a new file or namespace does not appear.

If invocation fails, check YAML syntax, the project's trusted status, disabled state, and the actual relative path. A file renamed into a subdirectory also changes its command name. Instructions mentioning an unavailable tool cannot make that tool available.
