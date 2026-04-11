# Internationalisierung (i18n) & Sprache

Qwen Code ist für mehrsprachige Workflows konzipiert: Es unterstützt die UI-Lokalisierung (i18n/l10n) in der CLI, ermöglicht die Auswahl der Ausgabesprache des Assistenten und erlaubt benutzerdefinierte UI-Sprachpakete.

## Übersicht

Aus Benutzersicht umfasst die „Internationalisierung“ von Qwen Code mehrere Ebenen:

| Funktion / Einstellung     | Steuerung                                                              | Speicherort                  |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | Terminal-UI-Texte (Menüs, Systemmeldungen, Prompts)                    | `~/.qwen/settings.json`      |
| `/language output`       | Sprache, in der die KI antwortet (Ausgabeeinstellung, keine UI-Übersetzung) | `~/.qwen/output-language.md` |
| Benutzerdefinierte UI-Sprachpakete | Überschreibt/erweitert integrierte UI-Übersetzungen              | `~/.qwen/locales/*.js`       |

## UI-Sprache

Dies ist die UI-Lokalisierungsebene der CLI (i18n/l10n): Sie steuert die Sprache von Menüs, Prompts und Systemmeldungen.

### UI-Sprache festlegen

Verwende den Befehl `/language ui`:

```bash
/language ui zh-CN    # Chinese
/language ui en-US    # English
/language ui ru-RU    # Russian
/language ui de-DE    # German
/language ui ja-JP    # Japanese
```

Aliase werden ebenfalls unterstützt:

```bash
/language ui zh       # Chinese
/language ui en       # English
/language ui ru       # Russian
/language ui de       # German
/language ui ja       # Japanese
```

### Automatische Erkennung

Beim ersten Start erkennt Qwen Code dein System-Locale und legt die UI-Sprache automatisch fest.

Erkennungspriorität:

1. Umgebungsvariable `QWEN_CODE_LANG`
2. Umgebungsvariable `LANG`
3. System-Locale über die JavaScript Intl API
4. Standard: Englisch

## LLM-Ausgabesprache

Die LLM-Ausgabesprache steuert, in welcher Sprache der KI-Assistent antwortet, unabhängig davon, in welcher Sprache du deine Fragen stellst.

### Funktionsweise

Die LLM-Ausgabesprache wird durch eine Regeldatei unter `~/.qwen/output-language.md` gesteuert. Diese Datei wird beim Start automatisch in den Kontext des LLM eingebunden und weist es an, in der angegebenen Sprache zu antworten.

### Automatische Erkennung

Beim ersten Start erstellt Qwen Code automatisch eine solche Datei basierend auf deinem System-Locale, falls noch keine `output-language.md` vorhanden ist. Zum Beispiel:

- System-Locale `zh` erstellt eine Regel für chinesische Antworten
- System-Locale `en` erstellt eine Regel für englische Antworten
- System-Locale `ru` erstellt eine Regel für russische Antworten
- System-Locale `de` erstellt eine Regel für deutsche Antworten
- System-Locale `ja` erstellt eine Regel für japanische Antworten

### Manuelle Einstellung

Verwende `/language output <language>`, um die Sprache zu ändern:

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Jeder Sprachname funktioniert. Das LLM wird angewiesen, in dieser Sprache zu antworten.

> [!note]
>
> Starte Qwen Code nach dem Ändern der Ausgabesprache neu, damit die Änderung wirksam wird.

### Dateispeicherort

```
~/.qwen/output-language.md
```

## Konfiguration

### Über den Einstellungsdialog

1. Führe `/settings` aus
2. Suche unter „General“ nach „Language“
3. Wähle deine bevorzugte UI-Sprache aus

### Über Umgebungsvariablen

```bash
export QWEN_CODE_LANG=zh
```

Dies beeinflusst die automatische Erkennung beim ersten Start (falls du noch keine UI-Sprache festgelegt hast und noch keine `output-language.md`-Datei existiert).

## Benutzerdefinierte Sprachpakete

Für UI-Übersetzungen kannst du benutzerdefinierte Sprachpakete in `~/.qwen/locales/` erstellen:

- Beispiel: `~/.qwen/locales/es.js` für Spanisch
- Beispiel: `~/.qwen/locales/fr.js` für Französisch

Das Benutzerverzeichnis hat Vorrang vor den integrierten Übersetzungen.

> [!tip]
>
> Beiträge sind willkommen! Falls du die integrierten Übersetzungen verbessern oder neue Sprachen hinzufügen möchtest.
> Ein konkretes Beispiel findest du unter [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Format von Sprachpaketen

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... more translations
};
```

## Verwandte Befehle

- `/language` - Aktuelle Spracheinstellungen anzeigen
- `/language ui [lang]` - UI-Sprache festlegen
- `/language output <language>` - LLM-Ausgabesprache festlegen
- `/settings` - Einstellungsdialog öffnen