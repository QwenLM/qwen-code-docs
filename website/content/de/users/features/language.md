# Internationalisierung (i18n) & Sprache

Qwen Code ist für mehrsprachige Workflows konzipiert: Es unterstützt UI-Lokalisierung (i18n/l10n) in der CLI, ermöglicht die Auswahl der Assistent-Ausgabesprache und erlaubt benutzerdefinierte UI-Sprachpakete.

## Übersicht

Aus Sicht des Benutzers erstreckt sich die "Internationalisierung" von Qwen Code über mehrere Ebenen:

| Fähigkeit / Einstellung  | Was wird gesteuert                                                   | Wo gespeichert               |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | Terminal-UI-Text (Menüs, Systemmeldungen, Eingabeaufforderungen)      | `~/.qwen/settings.json`      |
| `/language output`       | Sprache, in der die KI antwortet (Ausgabeeinstellung, keine UI-Übersetzung) | `~/.qwen/output-language.md` |
| Benutzerdefinierte UI-Sprachpakete | Überschreibt/erweitert eingebaute UI-Übersetzungen                    | `~/.qwen/locales/*.js`       |

## UI-Sprache

Dies ist die UI-Lokalisierungsschicht (i18n/l10n) der CLI: Sie steuert die Sprache von Menüs, Eingabeaufforderungen und Systemmeldungen.

### Festlegen der UI-Sprache

Verwenden Sie den Befehl `/language ui`:

```bash
/language ui zh-CN    # Chinesisch
/language ui en-US    # Englisch
/language ui ru-RU    # Russisch
/language ui de-DE    # Deutsch
```

Aliase werden ebenfalls unterstützt:

```bash
/language ui zh       # Chinesisch
/language ui en       # Englisch
/language ui ru       # Russisch
/language ui de       # Deutsch
```

### Automatische Erkennung

Beim ersten Start erkennt Qwen Code die Systemspracheinstellung und setzt die UI-Sprache automatisch.

Erkennungspriorität:

1. Umgebungsvariable `QWEN_CODE_LANG`
2. Umgebungsvariable `LANG`
3. Systemsprache über JavaScript Intl API
4. Standard: Englisch

## LLM-Ausgabesprache

Die LLM-Ausgabesprache legt fest, in welcher Sprache der KI-Assistent antwortet, unabhängig davon, in welcher Sprache Sie Ihre Fragen eingeben.

### Funktionsweise

Die Ausgabesprache des LLM wird durch eine Regeldatei unter `~/.qwen/output-language.md` gesteuert. Diese Datei wird beim Start automatisch in den Kontext des LLM eingeschlossen und weist es an, in der angegebenen Sprache zu antworten.

### Automatische Erkennung

Beim ersten Start erstellt Qwen Code automatisch eine solche Datei basierend auf der Systemsprache, falls noch keine `output-language.md`-Datei existiert. Beispielsweise:

- Systemsprache `zh` erstellt eine Regel für chinesische Antworten
- Systemsprache `en` erstellt eine Regel für englische Antworten
- Systemsprache `ru` erstellt eine Regel für russische Antworten
- Systemsprache `de` erstellt eine Regel für deutsche Antworten

### Manuelle Einstellung

Verwenden Sie `/language output <Sprache>`, um die Sprache zu ändern:

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Jeder Sprachname funktioniert. Das LLM erhält dann die Anweisung, in dieser Sprache zu antworten.

> [!note]
>
> Nach der Änderung der Ausgabesprache starten Sie Qwen Code neu, damit die Änderung wirksam wird.

### Dateispeicherort

```
~/.qwen/output-language.md
```

## Konfiguration

### Über Einstellungsdialog

1. Führe `/settings` aus
2. Suche unter "Allgemein" nach "Sprache"
3. Wähle deine bevorzugte UI-Sprache

### Über Umgebungsvariable

```bash
export QWEN_CODE_LANG=zh
```

Dies beeinflusst die automatische Erkennung beim ersten Start (wenn du noch keine UI-Sprache festgelegt hast und noch keine Datei `output-language.md` existiert).

## Benutzerdefinierte Sprachpakete

Für UI-Übersetzungen kannst du benutzerdefinierte Sprachpakete in `~/.qwen/locales/` erstellen:

- Beispiel: `~/.qwen/locales/es.js` für Spanisch
- Beispiel: `~/.qwen/locales/fr.js` für Französisch

Das Benutzerverzeichnis hat Vorrang vor eingebauten Übersetzungen.

> [!tip]
>
> Beiträge sind willkommen! Wenn du eingebaute Übersetzungen verbessern oder neue Sprachen hinzufügen möchtest.
> Als konkretes Beispiel siehe [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Sprachpaket-Format

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... weitere Übersetzungen
};
```

## Verwandte Befehle

- `/language` - Aktuelle Spracheinstellungen anzeigen
- `/language ui [lang]` - UI-Sprache festlegen
- `/language output <Sprache>` - Ausgabesprache für KI festlegen
- `/settings` - Einstellungsdialog öffnen