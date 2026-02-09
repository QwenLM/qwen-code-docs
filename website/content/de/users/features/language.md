# Internationalisierung (i18n) & Sprache

Qwen Code ist für mehrsprachige Workflows konzipiert: Es unterstützt die Lokalisierung der Benutzeroberfläche (i18n/l10n) in der Befehlszeilenschnittstelle (CLI), ermöglicht die Auswahl der Ausgabesprache des Assistenten und erlaubt benutzerdefinierte Sprachpakete für die Benutzeroberfläche.

## Übersicht

Aus Sicht des Benutzers erstreckt sich die „Internationalisierung“ von Qwen Code auf mehrere Ebenen:

| Funktion / Einstellung   | Was wird gesteuert                                                   | Wo gespeichert               |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | Text der Terminal-Benutzeroberfläche (Menüs, Systemmeldungen, Aufforderungen) | `~/.qwen/settings.json`      |
| `/language output`       | Sprache, in der die KI antwortet (eine Ausgabeeinstellung, keine Übersetzung der Benutzeroberfläche) | `~/.qwen/output-language.md` |
| Benutzerdefinierte Sprachpakete für die Benutzeroberfläche | Überschreibt/erweitert integrierte Übersetzungen der Benutzeroberfläche | `~/.qwen/locales/*.js`       |

## UI-Sprache

Dies ist die Lokalisierungsschicht (i18n/l10n) der CLI-Benutzeroberfläche: Sie steuert die Sprache von Menüs, Eingabeaufforderungen und Systemmeldungen.

### Festlegen der UI-Sprache

Verwenden Sie den Befehl `/language ui`:

```bash
/language ui zh-CN    # Chinesisch
/language ui en-US    # Englisch
/language ui ru-RU    # Russisch
/language ui de-DE    # Deutsch
/language ui ja-JP    # Japanisch
```

Aliase werden ebenfalls unterstützt:

```bash
/language ui zh       # Chinesisch
/language ui en       # Englisch
/language ui ru       # Russisch
/language ui de       # Deutsch
/language ui ja       # Japanisch
```

### Automatische Erkennung

Beim ersten Start erkennt Qwen Code das Systemsprachumgebung und setzt die UI-Sprache automatisch.

Erkennungspriorität:

1. Umgebungsvariable `QWEN_CODE_LANG`
2. Umgebungsvariable `LANG`
3. Systemsprache über JavaScript Intl API
4. Standard: Englisch

## LLM-Ausgabesprache

Die LLM-Ausgabesprache bestimmt, in welcher Sprache der KI-Assistent antwortet, unabhängig davon, in welcher Sprache Sie Ihre Fragen eingeben.

### Funktionsweise

Die Ausgabesprache des LLM wird durch eine Regeldatei unter `~/.qwen/output-language.md` gesteuert. Diese Datei wird beim Start automatisch in den Kontext des LLM eingebunden und weist es an, in der angegebenen Sprache zu antworten.

### Automatische Erkennung

Beim ersten Start erstellt Qwen Code automatisch eine solche Datei, wenn noch keine `output-language.md` existiert. Dabei orientiert sich die Erstellung am lokalen Systemgebietsschema. Beispiele:

- Systemgebietsschema `zh` erzeugt eine Regel für Antworten auf Chinesisch
- Systemgebietsschema `en` erzeugt eine Regel für Antworten auf Englisch
- Systemgebietsschema `ru` erzeugt eine Regel für Antworten auf Russisch
- Systemgebietsschema `de` erzeugt eine Regel für Antworten auf Deutsch
- Systemgebietsschema `ja` erzeugt eine Regel für Antworten auf Japanisch

### Manuelle Einstellung

Verwenden Sie `/language output <Sprache>`, um die Sprache zu ändern:

```bash
/language output Chinesisch
/language output Englisch
/language output Japanisch
/language output Deutsch
```

Jeder Sprachname funktioniert. Das KI-Modell wird angewiesen, in dieser Sprache zu antworten.

> [!note]
>
> Nach dem Ändern der Ausgabesprache starten Sie Qwen Code neu, damit die Änderung wirksam wird.

### Dateispeicherort

```
~/.qwen/output-language.md
```

## Konfiguration

### Über den Einstellungsdialog

1. Führen Sie `/settings` aus
2. Suchen Sie unter Allgemein nach „Language“
3. Wählen Sie Ihre bevorzugte Oberflächensprache

### Über Umgebungsvariable

```bash
export QWEN_CODE_LANG=zh
```

Dies beeinflusst die automatische Erkennung beim ersten Start (falls Sie noch keine Oberflächensprache festgelegt und noch keine Datei `output-language.md` vorhanden ist).

## Benutzerdefinierte Sprachpakete

Für UI-Übersetzungen können Sie benutzerdefinierte Sprachpakete in `~/.qwen/locales/` erstellen:

- Beispiel: `~/.qwen/locales/es.js` für Spanisch
- Beispiel: `~/.qwen/locales/fr.js` für Französisch

Das Benutzerverzeichnis hat Vorrang vor eingebauten Übersetzungen.

> [!tip]
>
> Beiträge sind willkommen! Wenn Sie eingebaute Übersetzungen verbessern oder neue Sprachen hinzufügen möchten.
> Ein konkretes Beispiel finden Sie unter [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Format des Sprachpakets

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
- `/language output <Sprache>` - Ausgabesprache der KI festlegen
- `/settings` - Einstellungsdialog öffnen