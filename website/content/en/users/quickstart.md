# Quickstart

Qwen Code is a terminal coding agent. Start it in a project, connect a model provider, and describe a task. It can inspect files, propose and apply changes, and run tools subject to the active permissions.

## 1. Open a project

After [installing a Preview build](/en/users/installation/), open your project directory:

```sh
cd /path/to/project
qwen
```

You can also choose the working directory explicitly:

```sh
qwen --cwd /path/to/project
```

Review the workspace trust prompt when it appears. Project settings can affect how the agent operates. Grant trust only after reviewing a project you intend to work in. See [Permissions and workspace trust](/en/users/permissions/).

## 2. Connect a provider

Follow the connection dialog shown at startup. You can reopen it at any time:

```text
/auth
```

Choose an account connection, an available provider preset, or a custom endpoint. The choices and their requirements are explained in [Authentication](/en/users/authentication/). After connecting, use `/model` to inspect and select the model.

## 3. Start with a bounded task

For example:

```text
Explain how this project starts and where its main tests are defined.
Read the relevant files first and include the paths in your explanation.
```

Then ask for a specific change:

```text
Add validation for an empty project name. Follow the existing validation
pattern and run the tests that cover the changed behavior.
```

Review tool approval requests before accepting them. Describe constraints such as files to preserve, commands to avoid, and the tests you expect. Model answers and proposed changes still need review.

## 4. Review and continue

Use `/diff` to inspect changes and `/context` to inspect context usage. Use `/help` for available commands and `/shortcuts` for the current keyboard shortcuts.

After leaving the CLI, continue the most recent session:

```sh
qwen --continue
```

Use `qwen --resume` to select a previous session. Session availability depends on the working directory and persisted local data. Keep your project under version control; conversation history is not a substitute for a repository backup.

## 5. Run a one-off request

```sh
qwen -p "Summarize the purpose of this project."
```

Print mode runs without the full interactive terminal UI. Set up credentials first and choose permissions suitable for unattended execution. Do not assume that an interactive approval dialog will be available.

## Useful next steps

- [Configure models and providers](/en/users/models/) for your endpoint or model.
- [Settings and environment](/en/users/settings/) explains user and project configuration.
- [Permissions and workspace trust](/en/users/permissions/) explains approval modes.
- [Troubleshooting](/en/users/troubleshooting/) covers connection and startup failures.

