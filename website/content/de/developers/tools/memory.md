# Speicherwerkzeug (`save_memory`)

Dieses Dokument beschreibt das `save_memory`-Werkzeug für Qwen Code.

## Beschreibung

Verwenden Sie `save_memory`, um Informationen über Ihre Qwen Code-Sitzungen hinweg zu speichern und abzurufen. Mit `save_memory` können Sie die CLI anweisen, wichtige Details über Sitzungen hinweg zu merken, um personalisierte und gezielte Unterstützung zu bieten.

### Argumente

`save_memory` akzeptiert ein Argument:

- `fact` (String, erforderlich): Die spezifische Tatsache oder Information, die gemerkt werden soll. Dies sollte eine klare, eigenständige Aussage in natürlicher Sprache sein.

## Verwendung von `save_memory` mit Qwen Code

Das Werkzeug fügt die angegebene `fact` Ihrer Kontextdatei im Benutzerverzeichnis hinzu (standardmäßig `~/.qwen/QWEN.md`). Dieser Dateiname kann über `contextFileName` konfiguriert werden.

Einmal hinzugefügt, werden die Fakten unter einem Abschnitt namens `## Qwen Added Memories` gespeichert. Diese Datei wird in nachfolgenden Sitzungen als Kontext geladen, sodass die CLI die gespeicherten Informationen abrufen kann.

Verwendung:

```
save_memory(fact="Ihre Tatsache hier.")
```

### `save_memory` Beispiele

Eine Benutzereinstellung merken:

```
save_memory(fact="Meine bevorzugte Programmiersprache ist Python.")
```

Ein projektspezifisches Detail speichern:

```
save_memory(fact="Das Projekt, an dem ich derzeit arbeite, heißt 'qwen-code'.")
```

## Wichtige Hinweise

- **Allgemeine Verwendung:** Dieses Tool sollte für prägnante, wichtige Fakten verwendet werden. Es ist nicht dafür gedacht, große Datenmengen oder Konversationsverläufe zu speichern.
- **Speicherdatei:** Die Speicherdatei ist eine einfache Text-Markdown-Datei, daher kannst du sie bei Bedarf manuell anzeigen und bearbeiten.