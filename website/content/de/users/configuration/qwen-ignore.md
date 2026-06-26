# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Qwen Ignore-Funktion (`.qwenignore`) von Qwen Code. Qwen Code erkennt auch benutzerdefinierte Ignore-Dateien, die über `context.fileFiltering.customIgnoreFiles` konfiguriert werden und standardmäßig auf die Kompatibilitätsdateien `.agentignore` und `.aiignore` zurückgreifen.

Qwen Code bietet die Möglichkeit, Dateien automatisch zu ignorieren, ähnlich wie `.gitignore` (verwendet von Git). Das Hinzufügen von Pfaden zu `.qwenignore` oder einer konfigurierten benutzerdefinierten Ignore-Datei schließt diese aus den Tools aus, die diese Funktion unterstützen, obwohl sie für andere Dienste (wie Git) weiterhin sichtbar bleiben.

## Funktionsweise

Wenn Sie einen Pfad zu einer dieser Ignore-Dateien hinzufügen, schließen Tools, die die Qwen-Ignore-Regeln beachten, übereinstimmende Dateien und Verzeichnisse von ihren Operationen aus. Wenn Sie beispielsweise den Befehl [`read_many_files`](../../developers/tools/multi-file) verwenden, werden alle Pfade in `.qwenignore` oder konfigurierten benutzerdefinierten Ignore-Dateien automatisch ausgeschlossen.

Im Großen und Ganzen folgen diese Ignore-Dateien den Konventionen von `.gitignore`-Dateien:

- Leerzeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (wie `*`, `?` und `[]`).
- Ein `/` am Ende sorgt dafür, dass nur Verzeichnisse übereinstimmen.
- Ein `/` am Anfang verankert den Pfad relativ zur Ignore-Datei.
- `!` negiert ein Muster.

Sie können diese Ignore-Dateien jederzeit aktualisieren. Um die Änderungen zu übernehmen, müssen Sie Ihre Qwen Code-Sitzung neu starten.

## Verwenden von Ignore-Dateien

| Schritt                    | Beschreibung                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ignore-Regeln aktivieren** | Erstellen Sie `.qwenignore`, eine standardmäßige benutzerdefinierte Datei (`.agentignore` / `.aiignore`) oder eine konfigurierte benutzerdefinierte Ignore-Datei im Stammverzeichnis Ihres Projekts |
| **Ignore-Regeln hinzufügen**    | Öffnen Sie die Ignore-Datei und fügen Sie zu ignorierende Pfade hinzu, z. B. `/archive/` oder `apikeys.txt`                                    |

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

`.qwenignore` wird immer eingeschlossen, wenn `context.fileFiltering.respectQwenIgnore` aktiviert ist. Benutzerdefinierte Ignore-Dateipfade sind relativ zum Projektstammverzeichnis.

### Beispiele für Ignore-Dateien

Sie können jede unterstützte Ignore-Datei verwenden, um Verzeichnisse und Dateien zu ignorieren:

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

Sie können in Ihrer Ignore-Datei Platzhalter mit `*` verwenden:

```
# Exclude all .md files
*.md
```

Schließlich können Sie Dateien und Verzeichnisse von der Ausnahme ausnehmen, indem Sie `!` verwenden:

```
# Exclude all .md files except README.md
*.md
!README.md
```

Um Pfade aus einer Ignore-Datei zu entfernen, löschen Sie die entsprechenden Zeilen.
