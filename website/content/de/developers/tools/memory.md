# Speicher-Tool (`save_memory`)

Dieses Dokument beschreibt das `save_memory`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `save_memory`, um Informationen über Ihre Qwen-Code-Sitzungen hinweg zu speichern und abzurufen. Mit `save_memory` können Sie die CLI anweisen, wichtige Details über mehrere Sitzungen hinweg zu merken, wodurch eine personalisierte und zielgerichtete Unterstützung ermöglicht wird.

### Argumente

`save_memory` akzeptiert ein Argument:

- `fact` (Zeichenkette, erforderlich): Die konkrete Tatsache oder Information, die gespeichert werden soll. Dies sollte eine klare, in sich geschlossene Aussage in natürlicher Sprache sein.

## Verwendung von `save_memory` mit Qwen Code

Das Tool fügt die angegebene `fact` der Kontextdatei des Benutzers im Home-Verzeichnis an (standardmäßig `~/.qwen/QWEN.md`). Der Dateiname kann über `contextFileName` konfiguriert werden.

Sobald hinzugefügt, werden die Fakten im Abschnitt `## Qwen Added Memories` gespeichert. Diese Datei wird in nachfolgenden Sitzungen als Kontext geladen, sodass die CLI die gespeicherten Informationen abrufen kann.

Verwendung:

```
save_memory(fact="Ihre Tatsache hier.")
```

### `save_memory`-Beispiele

Eine Benutzervoreinstellung merken:

```
save_memory(fact="Meine bevorzugte Programmiersprache ist Python.")
```

Ein projektspezifisches Detail speichern:

```
save_memory(fact="Das Projekt, an dem ich derzeit arbeite, heißt 'qwen-code'.")
```

## Wichtige Hinweise

- **Allgemeine Verwendung:** Dieses Tool sollte für prägnante, wichtige Fakten verwendet werden. Es ist nicht dafür gedacht, große Datenmengen oder den gesamten Gesprächsverlauf zu speichern.
- **Speicherdatei:** Die Speicherdatei ist eine einfache Textdatei im Markdown-Format, sodass Sie sie bei Bedarf manuell anzeigen und bearbeiten können.