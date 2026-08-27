# Ignorieren von Dateien

Dieses Dokument gibt einen Überblick über die Qwen Ignore (`.qwenignore`)-Funktion von Qwen Code. Qwen Code erkennt auch benutzerdefinierte Ignore-Dateien, die über `context.fileFiltering.customIgnoreFiles` konfiguriert werden; standardmäßig werden die Kompatibilitätsdateien `.agentignore` und `.aiignore` verwendet.

Qwen Code bietet die Möglichkeit, Dateien automatisch zu ignorieren, ähnlich wie `.gitignore` (das von Git verwendet wird). Wenn Sie Pfade zu `.qwenignore` oder einer konfigurierten benutzerdefinierten Ignore-Datei hinzufügen, werden diese von Tools ausgeschlossen, die diese Funktion unterstützen. Sie bleiben jedoch für andere Dienste (wie Git) sichtbar.

## Funktionsweise

Wenn Sie einen Pfad zu einer dieser Ignore-Dateien hinzufügen, schließen Tools, die die Qwen-Ignore-Regeln beachten, übereinstimmende Dateien und Verzeichnisse von ihren Vorgängen aus. Wenn Sie beispielsweise den Befehl [`read_many_files`](../../developers/tools/multi-file) verwenden, werden alle in `.qwenignore` oder in konfigurierten benutzerdefinierten Ignore-Dateien aufgeführten Pfade automatisch ausgeschlossen.

Im Großen und Ganzen folgen diese Ignore-Dateien den Konventionen von `.gitignore`-Dateien:

- Leere Zeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (wie `*`, `?` und `[]`).
- Ein `/` am Ende stimmt nur mit Verzeichnissen überein.
- Ein `/` am Anfang verankert den Pfad relativ zur Ignore-Datei.
- `!` negiert ein Muster.

Sie können diese Ignore-Dateien jederzeit aktualisieren. Um die Änderungen anzuwenden, müssen Sie Ihre Qwen Code-Sitzung neu starten.

## Verwenden von Ignore-Dateien

| Schritt                    | Beschreibung                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ignore-Regeln aktivieren** | Erstellen Sie `.qwenignore`, eine standardmäßige benutzerdefinierte Datei (`.agentignore` / `.aiignore`) oder eine konfigurierte benutzerdefinierte Ignore-Datei im Stammverzeichnis Ihres Projekts. |
| **Ignore-Regeln hinzufügen** | Öffnen Sie die Ignore-Datei und fügen Sie Pfade hinzu, die ignoriert werden sollen, z. B. `/archive/` oder `apikeys.txt`.                           |

Standardmäßig liest Qwen Code `.qwenignore`, `.agentignore` und `.aiignore`.
Um eine andere benutzerdefinierte Ignore-Datei zu verwenden, konfigurieren Sie:

```json
{
  "context": {
    "fileFiltering": {
      "customIgnoreFiles": [".cursorignore"]
    }
  }
}
```

`.qwenignore` wird immer einbezogen, wenn `context.fileFiltering.respectQwenIgnore`
aktiviert ist. Pfade zu benutzerdefinierten Ignore-Dateien sind relativ zum Projektstammverzeichnis.

### Beispiele für Ignore-Dateien

Sie können jede unterstützte Ignore-Datei verwenden, um Verzeichnisse und Dateien zu ignorieren:

```
# Schließt Ihr /packages/-Verzeichnis und alle Unterverzeichnisse aus
/packages/

# Schließt Ihre apikeys.txt-Datei aus
apikeys.txt
```

Sie können Platzhalter in Ihrer Ignore-Datei mit `*` verwenden:

```
# Schließt alle .md-Dateien aus
*.md
```

Schließlich können Sie Dateien und Verzeichnisse mit `!` von der Ausschließung ausnehmen:

```
# Schließt alle .md-Dateien außer README.md aus
*.md
!README.md
```

Um Pfade aus einer Ignore-Datei zu entfernen, löschen Sie die entsprechenden Zeilen.