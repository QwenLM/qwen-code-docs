# Memory-Tool (`save_memory`)

Dieses Dokument beschreibt das `save_memory`-Tool für Qwen Code.

## Beschreibung

Verwende `save_memory`, um Informationen über deine Qwen-Code-Sitzungen hinweg zu speichern und abzurufen. Mit `save_memory` kannst du die CLI anweisen, wichtige Details sitzungsübergreifend zu speichern, um personalisierte und gezielte Unterstützung zu bieten.

### Argumente

`save_memory` erwartet ein Argument:

- `fact` (string, erforderlich): Die spezifische Tatsache oder Information, die gespeichert werden soll. Dies sollte eine klare, in sich geschlossene Aussage in natürlicher Sprache sein.

## Verwendung von `save_memory` mit Qwen Code

Das Tool hängt das angegebene `fact` an deine Kontextdatei im Home-Verzeichnis des Benutzers an (standardmäßig `~/.qwen/QWEN.md`). Dieser Dateiname kann über `contextFileName` konfiguriert werden.

Nach dem Hinzufügen werden die Fakten unter einem `## Qwen Added Memories`-Abschnitt gespeichert. Diese Datei wird in nachfolgenden Sitzungen als Kontext geladen, wodurch die CLI auf die gespeicherten Informationen zugreifen kann.

Verwendung:

```
save_memory(fact="Your fact here.")
```

### `save_memory`-Beispiele

Speichern einer Benutzereinstellung:

```
save_memory(fact="My preferred programming language is Python.")
```

Speichern eines projektspezifischen Details:

```
save_memory(fact="The project I'm currently working on is called 'qwen-code'.")
```

## Wichtige Hinweise

- **Allgemeine Verwendung:** Dieses Tool sollte für prägnante, wichtige Fakten verwendet werden. Es ist nicht dafür gedacht, große Datenmengen oder Konversationsverläufe zu speichern.
- **Memory-Datei:** Die Memory-Datei ist eine einfache Markdown-Textdatei. Du kannst sie bei Bedarf also manuell ansehen und bearbeiten.