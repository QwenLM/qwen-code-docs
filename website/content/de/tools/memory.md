# Memory Tool (`save_memory`)

Dieses Dokument beschreibt das `save_memory` Tool für Qwen Code.

## Beschreibung

Verwende `save_memory`, um Informationen über deine Qwen Code-Sitzungen hinweg zu speichern und abzurufen. Mit `save_memory` kannst du die CLI anweisen, wichtige Details über Sitzungen hinweg zu merken, um personalisierte und gezielte Unterstützung zu bieten.

### Argumente

`save_memory` akzeptiert ein Argument:

- `fact` (string, erforderlich): Die spezifische Tatsache oder Information, die gespeichert werden soll. Dies sollte eine klare, eigenständige Aussage in natürlicher Sprache sein.

## Verwendung von `save_memory` mit Qwen Code

Das Tool fügt den übergebenen `fact` zur Kontextdatei im Home-Verzeichnis des Benutzers hinzu (standardmäßig `~/.qwen/QWEN.md`). Dieser Dateiname kann über `contextFileName` konfiguriert werden.

Einmal hinzugefügt, werden die Fakten unter einem Abschnitt mit dem Namen `## Qwen Added Memories` gespeichert. Diese Datei wird in nachfolgenden Sitzungen als Kontext geladen, sodass die CLI die gespeicherten Informationen abrufen kann.

Verwendung:

```
save_memory(fact="Your fact here.")
```

### `save_memory` Beispiele

Eine Benutzereinstellung merken:

```
save_memory(fact="Meine bevorzugte Programmiersprache ist Python.")
```

Ein projektspezifisches Detail speichern:

```
save_memory(fact="Das Projekt, an dem ich gerade arbeite, heißt 'qwen-code'.")
```

## Wichtige Hinweise

- **Allgemeine Verwendung:** Dieses Tool sollte für prägnante, wichtige Fakten verwendet werden. Es ist nicht dafür gedacht, große Datenmengen oder Konversationsverläufe zu speichern.
- **Memory-Datei:** Die Memory-Datei ist eine einfache Text-Markdown-Datei, daher kannst du sie bei Bedarf manuell einsehen und bearbeiten.