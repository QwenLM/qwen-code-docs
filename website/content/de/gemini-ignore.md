# Dateien ignorieren

Dieses Dokument bietet einen Überblick über die Gemini Ignore (`.geminiignore`) Funktion von Qwen Code.

Qwen Code verfügt über die Möglichkeit, Dateien automatisch zu ignorieren, ähnlich wie `.gitignore` (verwendet von Git) und `.aiexclude` (verwendet von Gemini Code Assist). Das Hinzufügen von Pfaden zu deiner `.geminiignore` Datei schließt diese von Tools aus, die dieses Feature unterstützen, obwohl sie für andere Services (wie Git) weiterhin sichtbar bleiben.

## Wie es funktioniert

Wenn du einen Pfad zu deiner `.gemmiignore`-Datei hinzufügst, schließen Tools, die diese Datei berücksichtigen, übereinstimmende Dateien und Verzeichnisse automatisch von ihren Operationen aus. Wenn du zum Beispiel den Befehl [`read_many_files`](./tools/multi-file.md) verwendest, werden alle Pfade in deiner `.geminiignore`-Datei automatisch ignoriert.

Im Wesentlichen folgt `.geminiignore` den Konventionen von `.gitignore`-Dateien:

- Leere Zeilen sowie Zeilen, die mit `#` beginnen, werden ignoriert.
- Standard-Glob-Muster werden unterstützt (wie z. B. `*`, `?` und `[]`).
- Ein abschließender `/` bewirkt, dass nur Verzeichnisse gematcht werden.
- Ein vorangestellter `/` verankert den Pfad relativ zur Position der `.geminiignore`-Datei.
- `!` negiert ein Muster.

Du kannst deine `.geminiignore`-Datei jederzeit aktualisieren. Um die Änderungen zu übernehmen, musst du deine Qwen Code-Sitzung neu starten.

## Wie man `.geminiignore` verwendet

Um `.geminiignore` zu aktivieren:

1. Erstelle eine Datei mit dem Namen `.geminiignore` im Root-Verzeichnis deines Projekts.

So fügst du eine Datei oder ein Verzeichnis zur `.geminiignore` hinzu:

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

Du kannst Wildcards in deiner `.geminiignore`-Datei mit `*` verwenden:

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