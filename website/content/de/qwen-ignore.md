# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Qwen Ignore (`.qwenignore`) Funktion von Qwen Code.

Qwen Code unterstützt die automatische Ignorierung von Dateien, ähnlich wie `.gitignore` (verwendet von Git). Wenn Sie Pfade zu Ihrer `.qwenignore` Datei hinzufügen, werden diese von Tools ausgeschlossen, die diese Funktion unterstützen, obwohl sie für andere Services (wie Git) weiterhin sichtbar bleiben.

## Wie es funktioniert

Wenn du einen Pfad zu deiner `.qwenignore`-Datei hinzufügst, schließen Tools, die diese Datei berücksichtigen, passende Dateien und Verzeichnisse von ihren Operationen aus. Zum Beispiel werden bei Verwendung des [`read_many_files`](./tools/multi-file.md)-Befehls alle Pfade in deiner `.qwenignore`-Datei automatisch ignoriert.

Im Wesentlichen folgt `.qwenignore` den Konventionen von `.gitignore`-Dateien:

- Leere Zeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (wie `*`, `?` und `[]`).
- Ein `/` am Ende matcht nur Verzeichnisse.
- Ein `/` am Anfang verankert den Pfad relativ zur `.qwenignore`-Datei.
- `!` negiert ein Muster.

Du kannst deine `.qwenignore`-Datei jederzeit aktualisieren. Um die Änderungen zu übernehmen, musst du deine Qwen Code-Sitzung neu starten.

## Wie man `.qwenignore` verwendet

Um `.qwenignore` zu aktivieren:

1. Erstelle eine Datei mit dem Namen `.qwenignore` im Stammverzeichnis deines Projektordners.

Um eine Datei oder ein Verzeichnis zu `.qwenignore` hinzuzufügen:

1. Öffne deine `.qwenignore`-Datei.
2. Füge den Pfad oder die Datei hinzu, die du ignorieren möchtest, zum Beispiel: `/archive/` oder `apikeys.txt`.

### `.qwenignore` Beispiele

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