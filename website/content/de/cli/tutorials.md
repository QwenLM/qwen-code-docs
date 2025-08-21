# Tutorials

Diese Seite enthält Tutorials zur Interaktion mit Qwen Code.

## Einrichten eines Model Context Protocol (MCP) Servers

> [!CAUTION]
> Stelle sicher, dass du der Quelle eines Drittanbieter-MCP-Servers vertraust und die von ihm bereitgestellten Tools verstehst, bevor du ihn verwendest. Die Nutzung von Servern Dritter erfolgt auf eigene Gefahr.

Dieses Tutorial zeigt, wie du einen MCP-Server einrichtest, unter Verwendung des [GitHub MCP servers](https://github.com/github/github-mcp-server) als Beispiel. Der GitHub MCP Server stellt Tools zur Interaktion mit GitHub Repositories bereit, wie z. B. das Erstellen von Issues und das Kommentieren von Pull Requests.

### Voraussetzungen

Bevor du beginnst, stelle sicher, dass Folgendes installiert und konfiguriert ist:

- **Docker:** Installiere und führe [Docker] aus.
- **GitHub Personal Access Token (PAT):** Erstelle einen neuen [classic] oder [fine-grained] PAT mit den erforderlichen Berechtigungen.

[Docker]: https://www.docker.com/
[classic]: https://github.com/settings/tokens/new
[fine-grained]: https://github.com/settings/personal-access-tokens/new

### Anleitung

#### Konfiguriere den MCP-Server in `settings.json`

Erstelle oder öffne im Root-Verzeichnis deines Projekts die Datei [`.qwen/settings.json`](./configuration.md). Füge innerhalb der Datei den Konfigurationsblock `mcpServers` hinzu, der Anweisungen dafür enthält, wie der GitHub MCP-Server gestartet wird.

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### Setze deinen GitHub-Token

> [!CAUTION]
> Die Verwendung eines weitreichenden Personal Access Tokens (PAT), der Zugriff auf persönliche und private Repositories hat, kann dazu führen, dass Informationen aus dem privaten Repository in das öffentliche Repository gelangen. Wir empfehlen die Verwendung eines fein granulierten Zugriffstokens, das keinen gemeinsamen Zugriff auf sowohl öffentliche als auch private Repositories ermöglicht.

Speichere deinen GitHub PAT in einer Umgebungsvariable:

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Qwen Code verwendet diesen Wert in der `mcpServers`-Konfiguration, die du in der Datei `settings.json` definiert hast.

#### Starte Qwen Code und überprüfe die Verbindung

Beim Start von Qwen Code liest es automatisch deine Konfiguration und startet den GitHub MCP-Server im Hintergrund. Danach kannst du mit natürlicher Sprache Eingaben machen, um Qwen Code GitHub-Aktionen ausführen zu lassen. Zum Beispiel:

```bash
"get all open issues assigned to me in the 'foo/bar' repo and prioritize them"
```