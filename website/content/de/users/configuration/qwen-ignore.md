# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Qwen Ignore-Funktion (`.qwenignore`) von Qwen Code.

Qwen Code enthält die Möglichkeit, Dateien automatisch zu ignorieren, ähnlich wie `.gitignore` (verwendet von Git). Durch Hinzufügen von Pfaden zu Ihrer `.qwenignore`-Datei werden diese von Tools ausgeschlossen, die dieses Feature unterstützen, obwohl sie für andere Dienste (wie Git) weiterhin sichtbar bleiben.

## Funktionsweise

Wenn Sie einen Pfad zu Ihrer `.qwenignore`-Datei hinzufügen, schließen Tools, die diese Datei berücksichtigen, übereinstimmende Dateien und Verzeichnisse von ihren Operationen aus. Wenn Sie beispielsweise den Befehl [`read_many_files`](../../developers/tools/multi-file) verwenden, werden alle Pfade in Ihrer `.qwenignore`-Datei automatisch ausgeschlossen.

In den meisten Fällen folgt `.qwenignore` den Konventionen von `.gitignore`-Dateien:

- Leere Zeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (wie `*`, `?` und `[]`).
- Ein `/` am Ende stimmt nur mit Verzeichnissen überein.
- Ein `/` am Anfang verankert den Pfad relativ zur `.qwenignore`-Datei.
- `!` negiert ein Muster.

Sie können Ihre `.qwenignore`-Datei jederzeit aktualisieren. Um die Änderungen anzuwenden, müssen Sie Ihre Qwen Code-Sitzung neu starten.

## So verwenden Sie `.qwenignore`

| Schritt                | Beschreibung                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **.qwenignore aktivieren** | Erstellen Sie eine Datei mit dem Namen `.qwenignore` im Stammverzeichnis Ihres Projekts |
| **Ignorierregeln hinzufügen** | Öffnen Sie die Datei `.qwenignore` und fügen Sie Pfade zum Ignorieren hinzu, Beispiel: `/archive/` oder `apikeys.txt` |

### `.qwenignore` Beispiele

Sie können `.qwenignore` verwenden, um Verzeichnisse und Dateien zu ignorieren:

```

# Ausschließen Ihres /packages/ Verzeichnisses und aller Unterverzeichnisse
/packages/

# Ausschließen Ihrer apikeys.txt Datei
apikeys.txt
```

Sie können Platzhalter in Ihrer `.qwenignore` Datei mit `*` verwenden:

```

# Ausschließen aller .md Dateien
*.md
```

Schließlich können Sie Dateien und Verzeichnisse von der Ausschließung mit `!` wieder ausschließen:

# Alle .md-Dateien außer README.md ausschließen
*.md
!README.md
```

Um Pfade aus deiner `.qwenignore`-Datei zu entfernen, lösche die entsprechenden Zeilen.