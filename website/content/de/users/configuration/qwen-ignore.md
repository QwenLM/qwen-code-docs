# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Qwen Ignore-Funktion (`.qwenignore`) von Qwen Code.

Qwen Code bietet die Möglichkeit, Dateien automatisch zu ignorieren, ähnlich wie `.gitignore` (von Git verwendet). Wenn du Pfade zu deiner `.qwenignore`-Datei hinzufügst, werden sie von Tools, die diese Funktion unterstützen, ausgeschlossen. Für andere Dienste (wie Git) bleiben sie jedoch weiterhin sichtbar.

## Funktionsweise

Wenn du einen Pfad zu deiner `.qwenignore`-Datei hinzufügst, schließen Tools, die diese Datei beachten, passende Dateien und Verzeichnisse von ihren Operationen aus. Wenn du beispielsweise den Befehl [`read_many_files`](../../developers/tools/multi-file) verwendest, werden alle Pfade in deiner `.qwenignore`-Datei automatisch ausgeschlossen.

Grundsätzlich folgt `.qwenignore` den Konventionen von `.gitignore`-Dateien:

- Leerzeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Patterns werden unterstützt (z. B. `*`, `?` und `[]`).
- Ein `/` am Ende passt nur auf Verzeichnisse.
- Ein `/` am Anfang verankert den Pfad relativ zur `.qwenignore`-Datei.
- `!` negiert ein Pattern.

Du kannst deine `.qwenignore`-Datei jederzeit aktualisieren. Um die Änderungen anzuwenden, musst du deine Qwen Code-Sitzung neu starten.

## Verwendung von `.qwenignore`

| Schritt                | Beschreibung                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **`.qwenignore` aktivieren** | Erstelle eine Datei namens `.qwenignore` im Stammverzeichnis deines Projekts       |
| **Ignorierregeln hinzufügen** | Öffne die `.qwenignore`-Datei und füge die zu ignorierenden Pfade hinzu, z. B. `/archive/` oder `apikeys.txt` |

### Beispiele für `.qwenignore`

Du kannst `.qwenignore` verwenden, um Verzeichnisse und Dateien zu ignorieren:

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

Du kannst in deiner `.qwenignore`-Datei Platzhalter mit `*` verwenden:

```
# Exclude all .md files
*.md
```

Schließlich kannst du Dateien und Verzeichnisse mit `!` von der Ignorierung ausnehmen:

```
# Exclude all .md files except README.md
*.md
!README.md
```

Um Pfade aus deiner `.qwenignore`-Datei zu entfernen, lösche die entsprechenden Zeilen.