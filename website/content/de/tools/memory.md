# Memory Tool (`save_memory`)

Dieses Dokument beschreibt das `save_memory` Tool für Qwen Code.

## Beschreibung

Verwende `save_memory`, um Informationen über deine Qwen Code-Sitzungen hinweg zu speichern und abzurufen. Mit `save_memory` kannst du die CLI anweisen, wichtige Details über Sitzungen hinweg zu merken und so eine personalisierte und gezielte Unterstützung zu bieten.

### Argumente

`save_memory` akzeptiert ein Argument:

- `fact` (string, erforderlich): Die spezifische Tatsache oder Information, die gespeichert werden soll. Dies sollte eine klare, eigenständige Aussage in natürlicher Sprache sein.

## Verwendung von `save_memory` mit Qwen Code

Das Tool fügt den übergebenen `fact` deiner Kontextdatei im Home-Verzeichnis des Benutzers hinzu (standardmäßig `~/.qwen/QWEN.md`). Dieser Dateiname kann über `contextFileName` konfiguriert werden.

Einmal hinzugefügt, werden die Fakten unter einem Abschnitt namens `## Qwen Added Memories` gespeichert. Diese Datei wird in nachfolgenden Sitzungen als Kontext geladen, sodass die CLI die gespeicherten Informationen abrufen kann.

Verwendung:

```
save_memory(fact="Dein Fakt hier.")
```

### `save_memory` Beispiele

Eine Benutzerpräferenz speichern:

```
save_memory(fact="Meine bevorzugte Programmiersprache ist Python.")
```

Ein projektspezifisches Detail speichern:

```
save_memory(fact="Das Projekt, an dem ich gerade arbeite, heißt 'gemini-cli'.")
```

## Wichtige Hinweise

- **Allgemeine Verwendung:** Dieses Tool sollte für prägnante, wichtige Fakten verwendet werden. Es ist nicht dafür gedacht, große Datenmengen oder Konversationsverläufe zu speichern.
- **Memory-Datei:** Die Memory-Datei ist eine einfache Markdown-Textdatei, die du bei Bedarf manuell einsehen und bearbeiten kannst.