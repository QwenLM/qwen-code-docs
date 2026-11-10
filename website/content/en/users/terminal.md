# Terminal and everyday interaction

Start `qwen` in your project directory to open an interactive conversation. Enter a request, review any permission prompts, and inspect the resulting changes before committing them. Use `/help` to discover commands available in the current session; installed resources and feature settings can change that list.

## Input and keyboard shortcuts

| Action | Default input |
| --- | --- |
| Submit a message or confirm a dialog selection | Enter |
| Insert a newline | Ctrl+J; Shift+Enter when supported by the terminal |
| Move to the start or end of the input | Ctrl+A / Ctrl+E |
| Delete from the cursor to the end or start of input | Ctrl+K / Ctrl+U |
| Previous / next input history entry | Ctrl+P / Ctrl+N |
| Search input history | Ctrl+R |
| Close a dialog or cancel its current operation | Esc |
| Show or hide shortcut hints | `/shortcuts` |

Bindings are contextual: a dialog can use the same key for a different action. Follow its displayed hints. For example, Ctrl+A in the session browser changes the project filter; it does not edit the input.

If a modified Enter key submits instead of inserting a newline, use Ctrl+J and run `/terminal-setup`. Depending on the terminal, this command checks native support, installs supported shortcuts, or reports manual steps. It can change terminal configuration. It is available in the interactive CLI; do not use it as a batch command.

## Appearance and editing

Use `/theme` to select a theme, `/settings` to inspect preferences, `/editor` to choose an editor, and `/vim` to toggle Vim input mode. In Vim mode, follow the displayed NORMAL/INSERT state; Esc and `i` change modes. These controls affect interaction, not model access or tool permissions.

## Output styles

`/output-style` opens the style browser. Selecting a style saves the choice in the project's local settings. **It applies to the next conversation:** run `/clear` or `/new` when ready. The current conversation keeps its existing style.

User styles are discovered under `~/.qwen/output-styles/`; project styles under `.qwen/output-styles/`. A custom user configuration root changes the user location. You can also select a style at startup with `qwen --output-style <name>`. Use the browser to inspect the available definitions rather than assuming a style supplied by a plugin is installed everywhere. A plugin-enforced style cannot be replaced through this picker.

## Custom status line

For a request such as:

```text
/statusline Show the current project and Git branch
```

Qwen Code sends a setup request to the model, which uses the status-line setup agent to inspect configuration and create a script. This is an agent task, not an immediate cosmetic toggle: it can read shell configuration and edit files, and normal permissions still apply. Inspect the proposed script and settings changes. The resulting status line is updated after responses.

## Copy and export

`/copy` copies the latest assistant response; `/copy 2` selects the second-latest response. When a response contains code blocks, a selector can offer code or the whole response depending on your copy preference. `/export` opens conversation export options; `/export review.txt` writes a text export relative to the current working directory. Exports may contain prompts, code, and tool output, so inspect them before sharing.

See [sessions](/en/users/sessions/) for starting over, branching, and restoring a conversation.
