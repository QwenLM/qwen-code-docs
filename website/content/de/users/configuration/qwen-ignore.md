# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Qwen Ignore (`.qwenignore`) Funktion von Qwen Code.

Qwen Code verfügt über die Möglichkeit, Dateien automatisch zu ignorieren, ähnlich wie `.gitignore` (verwendet von Git). Das Hinzufügen von Pfaden zu Ihrer `.qwenignore`-Datei schließt diese von Tools aus, die diese Funktion unterstützen, obwohl sie für andere Dienste (wie Git) weiterhin sichtbar bleiben.

## So funktioniert es

Wenn du einen Pfad zu deiner `.qwenignore`-Datei hinzufügst, schließen Tools, die diese Datei berücksichtigen, übereinstimmende Dateien und Verzeichnisse von ihren Operationen aus. Zum Beispiel werden bei der Verwendung des Befehls [`read_many_files`](/developers/tools/multi-file) alle Pfade in deiner `.qwenignore`-Datei automatisch ausgeschlossen.

Im Wesentlichen folgt `.qwenignore` den Konventionen von `.gitignore`-Dateien:

- Leere Zeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (wie `*`, `?` und `[]`).
- Ein `/` am Ende matcht nur Verzeichnisse.
- Ein `/` am Anfang verankert den Pfad relativ zur `.qwenignore`-Datei.
- `!` negiert ein Muster.

Du kannst deine `.qwenignore`-Datei jederzeit aktualisieren. Um die Änderungen anzuwenden, musst du deine Qwen Code-Sitzung neu starten.

## Verwendung von `.qwenignore`

| Schritt                     | Beschreibung                                                            |
| --------------------------- | ----------------------------------------------------------------------- |
| **.qwenignore aktivieren**  | Erstelle eine Datei mit dem Namen `.qwenignore` im Stammverzeichnis deines Projekts |
| **Ignorierregeln hinzufügen** | Öffne die Datei `.qwenignore` und füge Pfade zum Ignorieren hinzu, z. B.: `/archive/` oder `apikeys.txt` |

### Beispiele für `.qwenignore`

Du kannst `.qwenignore` verwenden, um Verzeichnisse und Dateien zu ignorieren:

```

# Schließe dein /packages/-Verzeichnis und alle Unterverzeichnisse aus
/packages/

# Schließe deine apikeys.txt-Datei aus
apikeys.txt
```

Du kannst Platzhalter in deiner `.qwenignore`-Datei mit `*` verwenden:

```

# Schließe alle .md-Dateien aus
*.md
```

Schließlich kannst du Dateien und Verzeichnisse von der Ausschlussliste mit `!` wieder einbeziehen:

```

# Schließe alle .md-Dateien außer README.md aus
*.md
!README.md
```

Um Pfade aus deiner `.qwenignore`-Datei zu entfernen, lösche die entsprechenden Zeilen.