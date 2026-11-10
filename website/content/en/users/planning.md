# Plans and persistent goals

Use Plan Mode to investigate an approach before implementation. Use a goal when a session should keep working toward a stated outcome across turns. They can be used together, but neither removes tool permissions or guarantees success.

## Plan before implementation

`/plan` toggles Plan Mode. When entering, you can provide a task:

```text
/plan Design a migration that preserves the existing API
```

Review the resulting plan and its assumptions before moving to implementation. Running `/plan` again exits Plan Mode. Plan Mode is a separate session state, and some permission modes exclude it; in that case the command explains why it cannot enter. It is not a filesystem sandbox or a promise that arbitrary shell commands are harmless.

| Command | Purpose |
| --- | --- |
| `/plan` | Enter or exit Plan Mode |
| `/plan copy` | Copy the approved plan to the clipboard |
| `/plan open` | Open the approved plan, or current session plan, in an editor |

`/plan copy` needs an approved plan. `/plan open` uses `EDITOR`, then `VISUAL`, then `vi`; it waits for the editor to close and rereads the file. If no plan file exists or the editor cannot start, the CLI reports the problem. Editing the file does not by itself approve every action described in it.

## Set a goal

Define an outcome and, optionally, a turn limit:

```text
/goal Implement pagination and verify the relevant tests --turns 20
```

The command registers the goal and immediately starts work. A turn limit is a limit on goal turns, not tokens, money, or wall-clock time. The displayed status tracks turns used and elapsed time. A positive integer sets a limit; `--turns -1` explicitly requests unlimited turns. When a finite limit is exhausted, the goal is automatically paused.

| Command | Purpose |
| --- | --- |
| `/goal` or `/goal status` | Show the goal, status, turns, and time |
| `/goal pause` | Pause the active goal |
| `/goal resume` | Resume a paused or blocked goal, or restart active goal execution after an interruption |
| `/goal clear` | Remove the current goal |

Resuming a goal whose turn budget is exhausted grants a fresh block of turns. Inspect the status before resuming if you are controlling execution length. Clearing the goal removes its tracking state; it does not undo files, commands, or external actions already performed. The older `/goal set` spelling is deprecated; put the objective directly after `/goal`.

## A practical workflow

1. Start `/plan` for a task with unclear scope or consequential design choices.
2. Check the files, assumptions, and validation steps in the proposed plan.
3. Exit planning when ready, then set a bounded goal with a concrete completion condition.
4. Use `/goal status` and `/tasks` to inspect progress; pause to change the approach.
5. Inspect the diff and test results before accepting the result.

If a command is unavailable, check `/help` and the current feature settings. A goal needs an initialized session; use the reported error to distinguish missing initialization from a goal that is simply absent.
