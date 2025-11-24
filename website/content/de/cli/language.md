# Language Command

Der Befehl `/language` ermöglicht es dir, die Spracheinstellungen sowohl für das Qwen Code User Interface (UI) als auch für die Ausgabesprache des Language Models (LLM) anzupassen. Dieser Befehl unterstützt zwei verschiedene Funktionen:

1. Festlegen der UI-Sprache für das Qwen Code-Interface  
2. Festlegen der Ausgabesprache für das Language Model (LLM)

## UI-Spracheinstellungen

Um die UI-Sprache von Qwen Code zu ändern, verwende den `ui`-Unterbefehl:

```
/language ui [zh-CN|en-US]
```

### Verfügbare UI-Sprachen

- **zh-CN**: Vereinfachtes Chinesisch (简体中文)  
- **en-US**: Englisch

### Beispiele

```
/language ui zh-CN    # UI-Sprache auf Vereinfachtes Chinesisch setzen
/language ui en-US    # UI-Sprache auf Englisch setzen
```

### UI-Sprache Unterbefehle

Für mehr Komfort kannst du auch direkte Unterbefehle verwenden:

- `/language ui zh-CN` oder `/language ui zh` oder `/language ui 中文`  
- `/language ui en-US` oder `/language ui en` oder `/language ui english`

## LLM Output Language Settings

Um die Sprache für die Responses des Language Models festzulegen, verwendest du den `output` Subcommand:

```
/language output <language>
```

Dieser Befehl generiert eine Sprachregel-Datei, die dem LLM anweist, in der angegebenen Sprache zu antworten. Die Regel-Datei wird unter `~/.qwen/output-language.md` gespeichert.

### Beispiele

```
/language output 中文      # Setzt die LLM-Ausgabesprache auf Chinesisch
/language output English   # Setzt die LLM-Ausgabesprache auf Englisch
/language output 日本語    # Setzt die LLM-Ausgabesprache auf Japanisch
```

## Aktuelle Einstellungen anzeigen

Wenn der `/language` Befehl ohne Argumente verwendet wird, zeigt er die aktuellen Spracheinstellungen an:

```
/language
```

Es werden folgende Informationen angezeigt:

- Aktuelle UI-Sprache
- Aktuelle LLM-Ausgabesprache (falls gesetzt)
- Verfügbare Subcommands

## Hinweise

- Änderungen der UI-Sprache werden sofort übernommen und alle Befehlsbeschreibungen neu geladen
- Die Einstellungen für die LLM-Ausgabesprache werden in einer Regel-Datei gespeichert, die automatisch im Kontext des Modells eingebunden wird
- Um zusätzliche UI-Sprachpakete anzufordern, öffne bitte ein Issue auf GitHub