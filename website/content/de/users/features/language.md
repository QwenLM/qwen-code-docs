# Internationalisierung (i18n) und Sprache

Qwen Code ist für multilinguale Workflows konzipiert: Es unterstützt die Lokalisierung der Benutzeroberfläche (i18n/l10n) in der Befehlszeile, ermöglicht die Auswahl der Ausgabesprache des Assistenten und erlaubt benutzerdefinierte Sprachpakete für die Benutzeroberfläche.

## Übersicht

Aus Sicht eines Benutzers umfasst die „Internationalisierung“ von Qwen Code mehrere Ebenen:

| Funktion / Einstellung       | Was sie steuert                                                                 | Wo gespeichert                     |
| ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ |
| `/language ui`               | Text der Terminal-Benutzeroberfläche (Menüs, Systemmeldungen, Aufforderungen)      | `~/.qwen/settings.json`             |
| `/language output`           | Sprache, in der die KI antwortet (eine Ausgabepräferenz, keine Übersetzung der UI) | `~/.qwen/output-language.md`         |
| Benutzerdefinierte UI-Sprachpakete | Überschreibt oder erweitert die integrierten UI-Übersetzungen                      | `~/.qwen/locales/*.js`              |

## Benutzeroberflächensprache

Dies ist die UI-Lokalisierungsschicht (i18n/l10n) der CLI: Sie steuert die Sprache von Menüs, Eingabeaufforderungen und Systemmeldungen.

### Festlegen der Benutzeroberflächensprache

Verwenden Sie den Befehl `/language ui`:

```bash
/language ui zh-CN    # Chinesisch
/language ui en-US    # Englisch
/language ui ru-RU    # Russisch
/language ui de-DE    # Deutsch
/language ui ja-JP    # Japanisch
```

Aliasnamen werden ebenfalls unterstützt:

```bash
/language ui zh       # Chinesisch
/language ui en       # Englisch
/language ui ru       # Russisch
/language ui de       # Deutsch
/language ui ja       # Japanisch
```

### Automatische Erkennung

Beim ersten Start erkennt Qwen Code automatisch Ihre Systemspracheinstellung und stellt die Benutzeroberflächensprache entsprechend ein.

Erkennungsreihenfolge:

1. Umgebungsvariable `QWEN_CODE_LANG`
2. Umgebungsvariable `LANG`
3. Systemspracheinstellung über die JavaScript-Intl-API
4. Standard: Englisch

## Ausgabesprache des LLM

Die Ausgabesprache des LLM legt fest, in welcher Sprache der KI-Assistent antwortet – unabhängig davon, in welcher Sprache Sie Ihre Fragen eingeben.

### Funktionsweise

Die Ausgabesprache des LLM wird durch eine Regel-Datei unter `~/.qwen/output-language.md` gesteuert. Diese Datei wird beim Start automatisch in den Kontext des LLM eingebunden und weist das Modell an, in der angegebenen Sprache zu antworten.

### Automatische Erkennung

Beim ersten Start erstellt Qwen Code automatisch eine `output-language.md`-Datei, falls noch keine vorhanden ist. Die Sprache wird dabei anhand Ihrer System-Locale bestimmt. Beispiele:

- System-Locale `zh` erzeugt eine Regel für Antworten auf Chinesisch  
- System-Locale `en` erzeugt eine Regel für Antworten auf Englisch
- System-Locale `ru` erzeugt eine Regel für Antworten auf Russisch
- System-Locale `de` erzeugt eine Regel für Antworten auf Deutsch
- System-Locale `ja` erzeugt eine Regel für Antworten auf Japanisch

### Manuelle Einstellung

Verwenden Sie `/language output <Sprache>`, um die Ausgabesprache zu ändern:

```bash
/language output Chinesisch
/language output Englisch
/language output Japanisch
/language output Deutsch
```

Jeder Sprachname funktioniert. Das LLM erhält die Anweisung, in dieser Sprache zu antworten.

> [!note]
>
> Nach der Änderung der Ausgabesprache müssen Sie Qwen Code neu starten, damit die Änderung wirksam wird.

### Dateispeicherort

```
~/.qwen/output-language.md
```

## Konfiguration

### Über den Einstellungsdialog

1. Führen Sie `/settings` aus.
2. Suchen Sie unter „Allgemein“ nach „Sprache“.
3. Wählen Sie Ihre bevorzugte Benutzeroberflächensprache aus.

### Über eine Umgebungsvariable

```bash
export QWEN_CODE_LANG=zh
```

Dies beeinflusst die automatische Erkennung beim ersten Start (sofern Sie noch keine Benutzeroberflächensprache festgelegt und noch keine Datei `output-language.md` vorhanden ist).

## Benutzerdefinierte Sprachpakete

Für Übersetzungen der Benutzeroberfläche können Sie benutzerdefinierte Sprachpakete im Verzeichnis `~/.qwen/locales/` erstellen:

- Beispiel: `~/.qwen/locales/es.js` für Spanisch
- Beispiel: `~/.qwen/locales/fr.js` für Französisch

Das Benutzerverzeichnis hat Vorrang vor den integrierten Übersetzungen.

> [!tip]
>
> Beiträge sind willkommen! Wenn Sie die integrierten Übersetzungen verbessern oder neue Sprachen hinzufügen möchten.
> Ein konkretes Beispiel finden Sie in [PR #1238: feat(i18n): Russian language support hinzufügen](https://github.com/QwenLM/qwen-code/pull/1238).

### Format eines Sprachpakets

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Einstellungen',
  // ... weitere Übersetzungen
};
```

## Verwandte Befehle

- `/language` – Aktuelle Spracheinstellungen anzeigen
- `/language ui [lang]` – Sprache der Benutzeroberfläche festlegen
- `/language output <Sprache>` – Ausgabesprache des LLM festlegen
- `/settings` – Einstellungsdialog öffnen