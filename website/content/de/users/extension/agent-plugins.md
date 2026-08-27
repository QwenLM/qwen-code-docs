# Agent Plugins v1

Qwen Code lädt portable [Agent Plugins v1](https://agent-plugins.org/)-Pakete nativ. Das Paket behält seine Standarddateien `plugin.json`, `mcp.json` und `SKILL.md`: Die Installation erzeugt keine `qwen-extension.json` und schreibt portable Dateien nicht um.

Verwende die bestehenden Erweiterungs-Befehle mit einem lokalen Verzeichnis, Link, Archiv, Git-Repository, Archiv-URL oder gescopeten npm-Paket:

```bash
qwen extensions install ./my-agent-plugin
qwen extensions link ./my-agent-plugin
qwen extensions install owner/my-agent-plugin
```

Das Root-Manifest muss auf das kanonische v1-Schema verweisen:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-agent-plugin",
  "version": "1.0.0"
}
```

## Unterstützte Capabilities

| Capability                                   | Unterstützung                            |
| -------------------------------------------- | ---------------------------------------- |
| Direct-child `skills/*/SKILL.md`             | Ja                                       |
| Stdio-MCP-Server                             | Ja                                       |
| Streamable-HTTP-MCP-Server                   | Ja                                       |
| Legacy-HTTP+SSE-MCP-Server                   | Nein; der Eintrag wird übersprungen      |
| Commands, Agents und Hooks                   | Nein; diese Verzeichnisse werden ignoriert |
| Qwen-Kontext, Einstellungen, Channels und Apps | Nein                                   |
| `extensions.*`-Client-Namespaces             | Nein; nicht implementierte Namespaces werden ignoriert |

Skills folgen der [Agent Skills Specification](https://agentskills.io/specification).
Ein ungültiger Skill wird übersprungen, ohne gültige Nachbar-Skills zu deaktivieren. Das experimentelle `allowed-tools`-Feld wird als String erkannt, gewährt aber keine vorab genehmigten Qwen-Tools.

Für Stdio-MCP-Server expandiert Qwen Code `${PLUGIN_ROOT}` und `${PLUGIN_DATA}` einmalig in `args`, Umgebungswerten und `cwd`. `PLUGIN_DATA` ist ein beschreibbares, installations-spezifisches Verzeichnis, dessen Inhalt über Updates und Neuinstallationen hinweg erhalten bleibt. Remote-MCP-Endpunkte müssen HTTPS verwenden, ausgenommen Loopback-HTTP-Endpunkte.

Agent Plugins v1 ist ein Paketformat, keine Marketplace-Integration. Installiere Pakete über die bestehenden Erweiterungsquellen von Qwen Code.
