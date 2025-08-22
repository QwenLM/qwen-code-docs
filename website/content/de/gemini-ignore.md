# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Gemini Ignore (`.geminiignore`) Funktion von Qwen Code.

Qwen Code bietet die Möglichkeit, Dateien automatisch zu ignorieren, ähnlich wie `.gitignore` (verwendet von Git) und `.aiexclude` (verwendet von Gemini Code Assist). Wenn du Pfade zu deiner `.geminiignore` Datei hinzufügst, werden diese von Tools ausgeschlossen, die diese Funktion unterstützen, obwohl sie für andere Services (wie Git) weiterhin sichtbar bleiben.

## Wie es funktioniert

Wenn du einen Pfad zu deiner `.geminiignore`-Datei hinzufügst, schließen Tools, die diese Datei berücksichtigen, übereinstimmende Dateien und Verzeichnisse von ihren Operationen aus. Wenn du zum Beispiel den Befehl [`read_many_files`](./tools/multi-file.md) verwendest, werden alle Pfade in deiner `.geminiignore`-Datei automatisch ausgeschlossen.

Im Wesentlichen folgt `.geminiignore` den Konventionen von `.gitignore`-Dateien:

- Leere Zeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (wie `*`, `?` und `[]`).
- Ein `/` am Ende matcht nur Verzeichnisse.
- Ein `/` am Anfang verankert den Pfad relativ zur `.geminiignore`-Datei.
- `!` negiert ein Muster.

Du kannst deine `.geminiignore`-Datei jederzeit aktualisieren. Um die Änderungen anzuwenden, musst du deine Qwen Code-Sitzung neu starten.

## Wie man `.geminiignore` verwendet

Um `.geminiignore` zu aktivieren:

1. Erstelle eine Datei mit dem Namen `.geminiignore` im Stammverzeichnis deines Projektordners.

Um eine Datei oder ein Verzeichnis zu `.geminiignore` hinzuzufügen:

1. Öffne deine `.geminiignore`-Datei.
2. Füge den Pfad oder die Datei hinzu, die du ignorieren möchtest, zum Beispiel: `/archive/` oder `apikeys.txt`.

### `.geminiignore` Beispiele

Du kannst `.geminiignore` verwenden, um Verzeichnisse und Dateien zu ignorieren:

```

# Schließe dein /packages/-Verzeichnis und alle Unterverzeichnisse aus
/packages/

# Schließe deine apikeys.txt-Datei aus
apikeys.txt
```

Du kannst Platzhalter in deiner `.geminiignore`-Datei mit `*` verwenden:

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

Um Pfade aus deiner `.geminiignore`-Datei zu entfernen, lösche die entsprechenden Zeilen.