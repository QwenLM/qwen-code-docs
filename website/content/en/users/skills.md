# Skills

Skills give Qwen Code reusable instructions and supporting files for a particular task. A skill can be selected with a slash command or made available for the model to select from its description. Installing a skill makes it discoverable; it does not run its scripts immediately.

## Create a project skill

Create `.qwen/skills/review-tests/SKILL.md`:

```markdown
---
name: review-tests
description: Review a change for missing tests and explain the most important gaps.
argument-hint: "[file or directory]"
disable-model-invocation: true
---
Review the tests relevant to $ARGUMENTS.
Read the implementation and existing tests before making recommendations.
Report concrete missing cases with file paths. Do not edit files.
```

Start Qwen Code in the project and enter `/review-tests src/`. Use `/skills` to inspect available skills and their enabled state. The directory name determines this skill's command identity. Keep `name` aligned with it for clarity.

Place supporting material beside `SKILL.md`, for example `references/checklist.md` or `scripts/check.py`, and describe when to read or run it in the skill body. A script needs its own interpreter and dependencies. A skill is instructions, not a sandbox.

## Locations and visibility

| Location | Use |
| --- | --- |
| `~/.qwen/skills/<name>/SKILL.md` | Personal skills across projects |
| `.qwen/skills/<name>/SKILL.md` | Skills shared with a trusted project |
| Plugin `skills/` directory | Skills supplied by an enabled plugin |

The user root follows `--config-dir` when configured. Additional workspace directories may also contribute project skills. Project trust, disabled skills, administration settings, and name conflicts can affect which skills are available. The optional `.agents/skills` compatibility directory is controlled by configuration; it is not required for Qwen Code skills.

Choose unique command names. Nested paths create namespaces: `.qwen/skills/team/review-tests/SKILL.md` is `/team:review-tests`. Plugin skills are prefixed by the plugin name. Use the displayed name in `/skills`, particularly when more than one source defines a skill.

## Frontmatter

| Field | Meaning |
| --- | --- |
| `description` | Explains when the skill is useful; write a specific task trigger |
| `argument-hint` | Hint displayed while entering arguments |
| `arguments` | Array of `{name, description, required}` argument descriptions |
| `disable-model-invocation: true` | Prevents autonomous model selection; useful for explicit workflows |
| `user-invocable: false` | Hides the skill from user slash invocation; model selection is controlled separately |
| `allowed-tools` | Tool names or rules used by the skill's execution policy |
| `model` | Model override; the model must be available in the session's configuration |
| `effort` | `none`, `low`, `medium`, `high`, `xhigh`, `max`, or a positive integer; effective support depends on the model |
| `context: fork` | Runs the skill in a separate agent context |
| `agent` | Agent used with a forked skill |
| `hooks` | Hooks associated with skill execution |
| `paths` | File patterns used for contextual skill visibility |
| `shell` | `bash` or `powershell` for shell preprocessing |

Omit fields you do not need. Tool allowances do not remove project trust requirements or higher-level restrictions. Model selection and user invocation are independent: setting both visibility controls can make a skill unavailable through either normal entry point.

The body supports `$ARGUMENTS` for the complete argument string, `$ARGUMENTS[0]` or `$0` for the first argument, and subsequent zero-based indices. Quoted arguments remain grouped. Missing indexed arguments become empty strings. When a nonempty argument string has no placeholder, it is appended to the body. `${QWEN_SKILL_DIR}` identifies the skill directory for supporting files.

## Install and manage

```bash
qwen skills list
qwen skills list --all
qwen skills install ./review-tests --scope project
qwen skills link ./review-tests --scope user
qwen skills disable review-tests --scope project
qwen skills enable review-tests
qwen skills uninstall review-tests --scope project
```

Install accepts a Git repository URL, an HTTPS ZIP URL, a local directory, or a local `.skill`/`.zip` archive. Use `--path` for a subdirectory in a repository or archive. Installation and linking default to `user`; `project` and `workspace` name the same skill scope. Disable defaults to the workspace. Enable does not take a scope flag and clears the applicable disabled entries.

Linking is useful while developing a local skill because it references the source. Review instructions and scripts before accepting installation. `--consent` skips the installation confirmation and should only be used after that review.

## Troubleshooting

- **Missing from `/skills`:** check `SKILL.md`, YAML syntax, project trust, the scope, and loading diagnostics. Keep `SKILL.md` inside its own named directory.
- **Listed but absent from slash completion:** check `user-invocable`, disabled state, and the full namespace.
- **The model never selects it:** check `disable-model-invocation`, its description, and any `paths` filter. Test explicit invocation first.
- **An edit is not reflected:** skill files are watched, but deep asset changes may not trigger a refresh. Restart the session after changing nested support files.
- **A tool or model is unavailable:** verify it independently in the session; frontmatter cannot install missing tools or grant an account access to a model.

See [custom commands](/en/users/custom-commands/), [plugins](/en/users/plugins/), and [hooks](/en/users/hooks/).
