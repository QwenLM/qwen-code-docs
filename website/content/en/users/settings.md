# Settings and environment

Use `/settings` to inspect the interactive settings dialog. File-based settings support JSON with comments (JSONC). Keep credentials out of shared project configuration.

## Configuration files and precedence

| Layer | Default location | Intended use |
| --- | --- | --- |
| User | `~/.qwen/settings.json` | Personal defaults across projects. |
| Project | `<project>/.qwen/settings.json` | Settings shared with project collaborators. |
| Local | `<project>/.qwen/settings.local.json` | Machine-specific project overrides. |
| Flag | `--settings` file or inline JSON | Explicit overrides for one run. |

The merge order is defaults → user → trusted project → trusted local → flag. Higher layers take precedence according to each field's merge rule; arrays and nested objects do not all use the same replacement behavior.

Project and local settings are excluded when the project is not trusted. A project cannot grant itself trust through its own settings. Explicit `--settings` input still applies. See [Permissions](/en/users/permissions/).

Add local settings and files containing secrets to your project's ignore rules as appropriate. A filename containing “local” is not by itself a Git exclusion.

## Start with a small configuration

```json
{
  "general": {
    "vimMode": false,
    "defaultPermissionMode": "default",
    "enableAutoUpdate": false
  }
}
```

Use [Models and providers](/en/users/models/) to add a custom endpoint. Do not replace a complete existing settings file with a small example: merge the relevant keys.

## Select configuration sources

```sh
qwen --setting-sources user,project
qwen --setting-sources ""
```

The first command loads user and project disk settings, excluding the local layer. An empty source list excludes all three disk layers; built-in defaults and explicit flag settings still apply. Unknown source names are ignored, so check spelling.

Override a setting for one run:

```sh
qwen --settings '{"general":{"vimMode":true}}'
qwen --settings ./preview-settings.json
```

The inline example uses POSIX-shell quoting. Relative settings-file paths resolve against the project path. Explicit flag settings are independent of `--setting-sources` and project trust; review files you pass this way.

## Use a separate user configuration root

```sh
qwen --config-dir /path/to/qwen-profile
```

This changes the user-level configuration root for the run. It does not rename the project's `.qwen` directory. Use an explicit path and check which configuration root is active when diagnosing missing credentials or settings.

## Environment variables

Settings values can reference environment variables, for example `"${MODEL_API_KEY}"`. Export these variables in the shell before starting Qwen Code.

Settings expansion occurs **before** the settings service loads a `.env` file. Therefore, do not rely on a variable defined only in a newly loaded `.env` file to resolve a settings placeholder during that load. Hook placeholders are preserved for hook-specific handling.

The environment-file lookup is limited:

- A trusted, non-home project may load `<project>/.qwen/.env` when project or local settings sources are enabled.
- The user configuration directory's `.env` is the fallback.
- Parent directories and ordinary project-root `.env` files are not searched.
- Existing environment variables take precedence.
- An untrusted project's environment file is not loaded.

Disabling all disk setting sources does not by itself disable the user environment-file fallback.

## Apply and diagnose changes

Some settings apply during a session; others require restarting. Provider definitions require restart. If the expected value is not effective, check source selection, project trust, higher-priority overrides, and the active configuration root.

Ordinary settings-file problems can produce warnings while preserving usable configuration. Invalid explicitly requested flag settings can stop startup. Fix the reported field instead of deleting all configuration. See [Troubleshooting](/en/users/troubleshooting/).

