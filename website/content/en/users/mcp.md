# MCP servers

MCP connects Qwen Code to tools, resources, and prompts supplied by external servers. A configured server must be reachable and enabled before its capabilities can be used. Configuring a server does not grant credentials or bypass tool permissions.

## Add a server

For a local server executable you have already installed:

```bash
qwen mcp add --scope user local-tools /absolute/path/to/mcp-server
```

For a remote Streamable HTTP server:

```bash
qwen mcp add --scope user --transport http team-tools https://mcp.example.com/mcp
```

Replace paths and URLs with your server's values. Without `--transport`, an argument that looks like a URL (starting with `http://`, `https://`, or `localhost`, or ending in `/sse` or `/mcp`) uses `http`; anything else uses stdio. Pass `--transport sse` or `--transport ws` explicitly for those transports. Additional arguments after the executable are passed to it. Use `--` to separate server arguments when they could be interpreted as CLI flags, and inspect `qwen mcp add --help` for available options.

```bash
qwen mcp list
qwen mcp get team-tools
qwen mcp disable team-tools
qwen mcp enable team-tools
qwen mcp remove team-tools
```

In an interactive session, `/mcp` inspects the configured servers and their status. A connection failure affects that server; check the diagnostic message before changing model configuration.

## Configuration scopes

| Scope | Write location |
| --- | --- |
| `user` | `~/.qwen/settings.json`, under `mcpServers` |
| `local` (default) | `.qwen/settings.local.json`, under `mcpServers` |
| `project` | `.mcp.json` at the project root |

`--config-dir` changes the user configuration root. New project additions use `.mcp.json`; older entries in `.qwen/settings.json` are also read, with `.mcp.json` taking precedence within project configuration. Local and project scope cannot be written while the working directory is the user's home directory.

In interactive sessions, project servers are subject to project trust and server approval. Non-interactive runs (`-p`, piped input or output, CI) start project servers that have not been rejected without asking. Do not treat a checked-in `.mcp.json` as permission to execute every command it contains. `qwen mcp reset-project-choices` resets remembered project server choices. Keep local settings out of version control.

Example `.mcp.json`:

```json
{
  "mcpServers": {
    "local-tools": {
      "command": "/absolute/path/to/mcp-server",
      "args": ["--read-only"]
    }
  }
}
```

The executable and `--read-only` are illustrative: use only arguments your server supports. For an explicit JSON server entry, use:

```bash
qwen mcp add-json --scope user local-tools '{"command":"/absolute/path/to/mcp-server","args":[]}'
```

This argument is one server configuration, without an enclosing `mcpServers` object.

## Authentication and isolation

Use `--env` for a stdio process's environment and `--header` for HTTP/SSE headers. These values may be persisted in configuration; avoid literal secrets in shared files or shell history. `--headers-helper` can obtain dynamic HTTP headers from an external script. HTTP/SSE OAuth configuration supports `--client-id`, `--client-secret` (a prompt or `MCP_CLIENT_SECRET`), and `--callback-port`. Availability depends on the server's authentication support.

For a single run, supply configuration without adding a persistent entry:

```bash
qwen --mcp-config ./mcp-for-task.json --strict-mcp-config
```

`mcp-for-task.json` uses the `mcpServers` object shown above. `--mcp-config` accepts JSON files or inline JSON and can be repeated. `--strict-mcp-config` restricts the run to the supplied MCP configuration instead of loading the normal MCP server sources. Restrict tool access separately through permission and tool settings.

## Troubleshooting

- **Stdio server will not start:** run the executable independently, check absolute paths, runtime dependencies and environment. Its stdout must carry the MCP protocol; send diagnostic output to stderr.
- **HTTP connection or authentication fails:** verify the URL, transport, proxy and server authentication. An ordinary web page is not an MCP endpoint.
- **Configured server is absent:** check scope, project trust, saved approval, enabled state and whether `--strict-mcp-config` excluded it.
- **Tools are missing:** check what the server advertises and whether allow/deny settings filter them. A successful connection does not mean every server capability is a tool.
- **Duplicate server name:** inspect the existing entry with `get`; remove or rename it before adding another entry to the same scope.

See [plugins](/en/users/plugins/) for servers supplied by plugins and [headless scripting](/en/users/headless/) for automation.
