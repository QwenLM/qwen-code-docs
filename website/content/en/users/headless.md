# Headless scripting

Use `--print` (`-p`) to submit a prompt, print the result, and exit without opening the interactive terminal UI. Configure authentication and model access before starting an unattended job.

## Run a prompt

```bash
qwen -p "Explain the purpose of this repository. Do not modify files."
qwen -p --cwd /path/to/project "Summarize the public interfaces."
```

The prompt is positional; `-p` is a mode switch, not an option that consumes the prompt. Without `-p`, a positional prompt starts an interactive session only when stdin and stdout are both terminals; piped or redirected runs and runs with `CI=true` or `GITHUB_ACTIONS=true` execute headless. Use `-p` explicitly in scripts. You can pipe plain-text input:

```bash
git diff --no-ext-diff | qwen -p "Review this diff for correctness and missing tests."
```

The model may need repository access to verify a diff. Run from the intended directory, and state whether changes are permitted. Prompt wording is not a substitute for tool permissions.

## Output formats

| Format | Use |
| --- | --- |
| `text` | Human-readable result; default |
| `json` | Final structured result object |
| `stream-json` | Newline-delimited event objects, including a terminal result |

```bash
qwen -p --output-format json "Summarize this project." > result.json
qwen -p --output-format stream-json "Explain the test layout." > events.jsonl
```

JSON output is a CLI result envelope, not a guarantee that the model's answer itself follows an application-defined JSON schema. Parse stdout as the selected format and check the process exit status. For streaming, parse each complete line, dispatch on `type`, and handle the final `result` and error fields. Do not assume every event contains text or concatenate the entire stream into one JSON document. Preview consumers should tolerate additional fields and event types.

| Exit code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | The run finished with a failed result |
| `41` | Authentication error |
| `42` | Input error |
| `52` | Configuration error |
| `130` | Cancelled |

Non-interactive runs treat the working directory as trusted, so project settings, hooks, and project MCP servers load. See [Permissions](/en/users/permissions/).

A POSIX shell wrapper can preserve failure status:

```bash
if qwen -p --output-format json "Summarize this project." > result.json; then
  node -e 'const fs = require("fs"); const r = JSON.parse(fs.readFileSync("result.json", "utf8")); console.log(r.result ?? r);'
else
  echo "Qwen Code failed; inspect result.json and diagnostics." >&2
  exit 1
fi
```

Treat a successful model response as task output, not proof that generated code passes tests. Apply your own validation before consuming artifacts in a deployment pipeline.

## Structured input

`--input-format stream-json` requires `--output-format stream-json`. Send newline-delimited user messages, for example:

```bash
printf '%s\n' '{"type":"user","message":{"content":"Explain the repository structure."}}' |
  qwen -p --input-format stream-json --output-format stream-json
```

Text content is sufficient for a basic integration. A stream is a sequence of messages, not a top-level JSON array. Send complete lines and close stdin when the batch is complete. This guide covers the public CLI options; it does not establish compatibility with a separate SDK or every internal control message.

## Permissions, settings and persistence

Use `--tools`, `--allowed-tools`, and `--disallowed-tools` to control the available and permitted tools. Check tool names with `/tools` in an interactive session. An unattended run cannot rely on a person answering a terminal approval prompt; configure the required permissions in advance and handle denied calls as failures or incomplete work. `--dangerously-skip-permissions` bypasses ordinary permission confirmation; checks designated as unskippable or immune to bypass still apply. It should not be a default CI configuration.

For reproducible jobs, select `--cwd`, `--model`, settings sources and MCP inputs explicitly. `--setting-sources` chooses disk sources (`user`, `project`, `local`); `--settings` accepts a file or inline JSON as a separate flag layer. Removing disk settings can also remove authentication/provider configuration you were relying on.

Session history is normally persisted. `--no-session-persistence` works with `--print`, disables saved session history and prevents later resume. It does not mean no diagnostic logs or service-side data exist. To resume a saved session, use `--resume <id>`; use `--continue` for the most recent session in the relevant context. Prefer explicit IDs for automation.

`--max-output-tokens` limits model output tokens, not total task cost or wall-clock time. `--max-model-request-retries` controls provider request retries. Put a job-level timeout in the surrounding runner when required, and avoid retrying a task with side effects blindly.

## Troubleshooting

- **Login required:** configure the selected authentication path before the job; do not automate typing secrets into a terminal login dialog.
- **Wrong project or missing configuration:** check the process working directory, `--cwd`, `--config-dir`, and settings sources.
- **Malformed stream:** use matching input/output formats, send one complete JSON object per line, and keep unrelated process output out of stdout.
- **Task incomplete despite output:** inspect denied tools, result errors and exit status; verify the intended artifacts and tests independently.
- **Resume cannot find a session:** check the configuration root and project context, and confirm the original run did not disable persistence.

See [MCP](/en/users/mcp/) and [hooks](/en/users/hooks/) for external integrations that also run in automation.
