# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Qwen-Ignore-Funktion (`.qwenignore`) von Qwen Code.

Qwen Code unterstützt das automatische Ignorieren von Dateien – ähnlich wie `.gitignore` (das von Git verwendet wird). Wenn Sie Pfade in Ihre `.qwenignore`-Datei eintragen, werden diese von Tools, die diese Funktion unterstützen, ausgeschlossen. Andere Dienste (z. B. Git) zeigen diese Dateien jedoch weiterhin an.

## So funktioniert es

Wenn Sie einen Pfad zu Ihrer `.qwenignore`-Datei hinzufügen, ignorieren Tools, die diese Datei berücksichtigen, übereinstimmende Dateien und Verzeichnisse bei ihren Operationen. Wenn Sie beispielsweise den Befehl [`read_many_files`](../../developers/tools/multi-file) verwenden, werden alle in Ihrer `.qwenignore`-Datei angegebenen Pfade automatisch ausgeschlossen.

Im Großen und Ganzen folgt `.qwenignore` den Konventionen von `.gitignore`-Dateien:

- Leerzeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (z. B. `*`, `?` und `[]`).
- Ein `/` am Ende eines Musters passt nur auf Verzeichnisse.
- Ein `/` am Anfang eines Musters legt den Pfad relativ zur `.qwenignore`-Datei fest.
- `!` kehrt ein Muster um („negiert“ es).

Sie können Ihre `.qwenignore`-Datei jederzeit aktualisieren. Um die Änderungen wirksam zu machen, müssen Sie Ihre Qwen Code-Sitzung neu starten.

## So verwenden Sie `.qwenignore`

| Schritt                 | Beschreibung                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| **`.qwenignore` aktivieren** | Erstellen Sie eine Datei mit dem Namen `.qwenignore` im Stammverzeichnis Ihres Projekts             |
| **Ignorierungsregeln hinzufügen** | Öffnen Sie die Datei `.qwenignore` und fügen Sie Pfade hinzu, die ignoriert werden sollen, z. B.: `/archive/` oder `apikeys.txt` |

### Beispiele für `.qwenignore`

Sie können `.qwenignore`, um Verzeichnisse und Dateien zu ignorieren:

```
# Ignoriert das Verzeichnis `/packages/` und alle Unterverzeichnisse
/packages/

# Ignoriert die Datei `apikeys.txt`
apikeys.txt
```

Sie können Platzhalter (`*`) in Ihrer `.qwenignore`-Datei verwenden:

```
# Ignoriert alle `.md`-Dateien
*.md
```

Schließlich können Sie Dateien und Verzeichnisse von der Ignorierung mit `!` wieder ausschließen:

```
# Alle `.md`-Dateien ausschließen, außer `README.md`
*.md
!README.md
```

Um Pfade aus Ihrer `.qwenignore`-Datei zu entfernen, löschen Sie die entsprechenden Zeilen.