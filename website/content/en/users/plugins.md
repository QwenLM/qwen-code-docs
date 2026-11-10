# Plugins and marketplaces

A plugin packages related skills, commands, agents, hooks, MCP servers, or output styles. A marketplace is a catalog from which plugins can be discovered and installed. Adding a marketplace does not install all its plugins.

## Install and manage

Use `/plugins` for the interactive manager and `/marketplace` to browse marketplaces. The standalone commands also work outside a chat session:

```bash
qwen plugins marketplace add ./team-marketplace
qwen plugins marketplace list
qwen plugins install review-kit@team-marketplace --scope project
qwen plugins list
qwen plugins disable review-kit@team-marketplace --scope project
qwen plugins enable review-kit@team-marketplace --scope project
qwen plugins update review-kit@team-marketplace --scope project
qwen plugins uninstall review-kit@team-marketplace --scope project
```

Replace the example catalog and plugin names with entries you actually have. Marketplace sources accept a local path, URL, Git URL, or `owner/repo`. Plugin installation accepts a catalog name, `name@marketplace`, local plugin directory, or HTTPS ZIP URL. For a local plugin, use `qwen plugins install ./review-kit`.

| Scope | Intended use |
| --- | --- |
| `user` | Personal plugins across projects; installation default |
| `project` | Configuration shared through the repository |
| `local` | Personal configuration for the current project |

Project and local declarations follow `.qwen/settings.json` and `.qwen/settings.local.json`; keep the local file out of version control. Installed files and the installation registry are managed under the user plugin storage. Declaring a shared plugin is not equivalent to committing its installed files. Other users still need access to the source and any required credentials.

Enable and disable can detect the installed scope when omitted. Use explicit scopes when the same plugin exists in several scopes. `qwen plugins list --json` provides machine-readable inspection. Update marketplace metadata with `qwen plugins marketplace update <name>`; remove a catalog with `qwen plugins marketplace remove <name>`. Plugin updates and marketplace updates are separate operations.

## Create a local plugin

Start with this directory:

```text
review-kit/
  .qwen-plugin/
    plugin.json
  commands/
    review.md
  skills/
    check-tests/
      SKILL.md
```

`.qwen-plugin/plugin.json`:

```json
{
  "name": "review-kit",
  "version": "0.1.0",
  "description": "Review instructions and test coverage checks"
}
```

`commands/review.md`:

```markdown
---
description: Review changes without editing files.
disable-model-invocation: true
---
Review $ARGUMENTS. Read the relevant diff and report concrete findings.
Do not edit files.
```

The command is available under the plugin namespace, such as `/review-kit:review`. Put resources in directories at the plugin root, beside `.qwen-plugin`, rather than inside the metadata directory. Conventional resource directories include `commands`, `skills`, `agents`, `output-styles`, `workflows`, and `hooks`; declared manifest paths can replace convention discovery for that resource type. Do not assume every accepted manifest field has runtime behavior.

Validate and load it for development:

```bash
qwen plugins validate ./review-kit
qwen plugins validate ./review-kit --json
qwen --plugin-dir ./review-kit
```

`--plugin-dir` supplies a plugin directory for that run. It is useful for testing before a persistent installation. Validation checks plugin structure and declarations; it does not establish that every script, remote server, or model-dependent task will succeed.

## Trust and configuration

Plugins may contain executable hooks and start MCP processes. Review their origin and configuration before enabling them. Project trust and resource-specific restrictions still apply. Check external program requirements and supply credentials through the supported environment/configuration mechanism rather than committing secrets.

When a plugin changes, verify its newly declared capabilities as well as its version. Disabling a plugin stops its contributions from being available through that configuration; it does not reverse changes already made by its tools. Removing a marketplace should not be used as a substitute for explicitly uninstalling plugins you no longer want.

## Troubleshooting

- **Plugin not found:** list marketplaces, check the exact `name@marketplace`, and update catalog metadata.
- **Installed but commands are missing:** check enabled state, scope, project trust, namespace, and validation output; restart after editing plugin metadata.
- **Authentication or network failure:** verify access to the source independently. A catalog entry does not grant access to a private repository or remote service.
- **A skill or hook loads but fails:** check its interpreter, paths, environment variables, and the corresponding [skill](/en/users/skills/), [hook](/en/users/hooks/), or [MCP](/en/users/mcp/) guide.

Use `qwen plugins <command> --help` for command-specific options.
