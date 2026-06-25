# Internationalisierung (i18n) & Sprache

Qwen Code ist für mehrsprachige Arbeitsabläufe konzipiert: Es unterstützt UI-Lokalisierung (i18n/l10n) in der CLI, ermöglicht die Wahl der Ausgabesprache des Assistenten und erlaubt benutzerdefinierte Sprachpakete für die Benutzeroberfläche.

## Überblick

Aus Benutzersicht umfasst die „Internationalisierung“ von Qwen Code mehrere Ebenen:

| Funktion / Einstellung | Steuert                                                        | Gespeichert in                  |
| ---------------------- | -------------------------------------------------------------- | ------------------------------- |
| `/language ui`         | Terminal-UI-Text (Menüs, Systemmeldungen, Eingabeaufforderungen) | `~/.qwen/settings.json`         |
| `/language output`     | Sprache, in der die KI antwortet (eine Ausgabeeinstellung, keine UI-Übersetzung) | `~/.qwen/output-language.md`    |
| Benutzerdefinierte UI-Sprachpakete | Überschreibt/erweitert integrierte UI-Übersetzungen | `~/.qwen/locales/*.js`          |

## Sprache der Benutzeroberfläche (UI)

Dies ist die UI-Lokalisierungsebene (i18n/l10n) der CLI: Sie steuert die Sprache von Menüs, Eingabeaufforderungen und Systemmeldungen.

### Festlegen der UI-Sprache

Verwende den Befehl `/language ui`:

```bash
/language ui zh-CN    # Chinesisch
/language ui en-US    # Englisch
/language ui ru-RU    # Russisch
/language ui de-DE    # Deutsch
/language ui ja-JP    # Japanisch
/language ui pt-BR    # Portugiesisch (Brasilien)
/language ui fr-FR    # Französisch
/language ui ca-ES    # Katalanisch
```

Aliase werden ebenfalls unterstützt:

```bash
/language ui zh       # Chinesisch
/language ui en       # Englisch
/language ui ru       # Russisch
/language ui de       # Deutsch
/language ui ja       # Japanisch
/language ui pt       # Portugiesisch
/language ui fr       # Französisch
/language ui ca       # Katalanisch
```

### Automatische Erkennung

Beim ersten Start erkennt Qwen Code Ihre Systemsprache und setzt die UI-Sprache automatisch.

Erkennungsreihenfolge:

1. Umgebungsvariable `QWEN_CODE_LANG`
2. Umgebungsvariable `LANG`
3. Systemsprache über die JavaScript Intl API
4. Standard: Englisch

## Ausgabesprache des LLM

Die LLM-Ausgabesprache steuert, in welcher Sprache der KI-Assistent antwortet, unabhängig davon, in welcher Sprache Sie Ihre Fragen stellen.

### Funktionsweise

Die Ausgabesprache des LLM wird durch eine Regeldatei unter `~/.qwen/output-language.md` gesteuert. Diese Datei wird beim Start automatisch in den Kontext des LLM aufgenommen und weist ihn an, in der angegebenen Sprache zu antworten.

### Automatische Erkennung

Beim ersten Start, falls keine `output-language.md`-Datei existiert, erstellt Qwen Code automatisch eine basierend auf Ihrer Systemsprache. Zum Beispiel:

- Systemsprache `zh` erstellt eine Regel für chinesische Antworten
- Systemsprache `en` erstellt eine Regel für englische Antworten
- Systemsprache `ru` erstellt eine Regel für russische Antworten
- Systemsprache `de` erstellt eine Regel für deutsche Antworten
- Systemsprache `ja` erstellt eine Regel für japanische Antworten
- Systemsprache `pt` erstellt eine Regel für portugiesische Antworten
- Systemsprache `fr` erstellt eine Regel für französische Antworten
- Systemsprache `ca` erstellt eine Regel für katalanische Antworten

### Manuelle Einstellung

Verwende `/language output <Sprache>`, um die Sprache zu ändern:

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

### Dateipfad

```
~/.qwen/output-language.md
```

## Konfiguration

### Über den Einstellungsdialog

1. Führe `/settings` aus
2. Finde „Sprache“ unter „Allgemein“
3. Wähle deine bevorzugte UI-Sprache

### Über Umgebungsvariable

```bash
export QWEN_CODE_LANG=zh
```

Dies beeinflusst die automatische Erkennung beim ersten Start (falls noch keine UI-Sprache festgelegt wurde und keine `output-language.md`-Datei existiert).

## Benutzerdefinierte Sprachpakete

Für UI-Übersetzungen kannst du benutzerdefinierte Sprachpakete unter `~/.qwen/locales/` erstellen:

- Beispiel: `~/.qwen/locales/es.js` für Spanisch
- Beispiel: `~/.qwen/locales/fr.js` für Französisch

Das Benutzerverzeichnis hat Vorrang vor den integrierten Übersetzungen.

> [!tip]
>
> Beiträge sind willkommen! Wenn du die integrierten Übersetzungen verbessern oder neue Sprachen hinzufügen möchtest.
> Ein konkretes Beispiel findest du unter [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Pflege von `zh-TW` (Traditionelles Chinesisch für Taiwan)

`zh-TW` ist **keine** automatische OpenCC-s2t-Konvertierung von `zh.js` – es ist eine manuell gepflegte Übersetzung mit taiwanischem Vokabular. Beim Hinzufügen oder Ändern von Schlüsseln sind die folgenden Konventionen zu beachten.

Die Spalte „CI erzwungen?“ gibt an, ob `npm run check-i18n` den Build bei einem Verstoß fehlschlagen lässt. Zeilen, die mit **Nein** markiert sind, sind Stilrichtlinien, die nur durch Review durchgesetzt werden – typischerweise weil die beanstandete Form eine legitime nicht-UI-Bedeutung hat (`文件` kann „Dokument“ bedeuten, `打開` ist im Taiwan-Umgangssprachgebrauch in Ordnung).

| Zu vermeiden           | Stattdessen verwenden | CI erzwungen? | Begründung                                                                                                                                                                           |
| ---------------------- | --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 文件 (Datei)           | 檔案                  | Nein          | Taiwan-Begriff für Dateisystemdateien (aber `文件` kann legitim „Dokument“ bedeuten)                                                                                                  |
| 服務器 / 服务器        | 伺服器                | Ja            | Taiwan-Begriff für „Server“                                                                                                                                                          |
| 菜單 / 菜单            | 選單                  | Ja            | Taiwan-Begriff für „Menü“                                                                                                                                                            |
| 鏈接 / 链接            | 連結                  | Ja            | Taiwan-Begriff für „Link“ (nacktes `鏈` ist in Ordnung – z.B. 區塊鏈)                                                                                                                 |
| 打開                   | 開啟                  | Nein          | Bevorzugtes Verb in Taiwan für „Öffnen“ (UI); `打開` ist umgangssprachlich üblich                                                                                                     |
| 爲 / 啓 / 曆史 / 鏈接  | 為 / 啟 / 歷史 / 連結 | Ja            | Variante traditioneller Formen aus roher OpenCC-s2t. Hinweis: `曆` ist kontextabhängig und korrekt in Kalenderbegriffen (日曆, 農曆, 西曆); CI markiert nur das Bigramm `曆史`, nicht nacktes `曆`. |
Wenn Sie kein traditioneller Chinesisch-Sprecher sind und einen Wert bootstrappen müssen, **fügen Sie keine rohe OpenCC-`s2t`-Ausgabe ein**: das Standard-s2t-Profil gibt abweichende traditionelle Zeichen aus (z.B. 爲, 啓), die in Taiwan nicht verwendet werden, und schreibt nie chinesisches Vokabular aus Festlandchina um (服務器, 菜單). Bevorzugen Sie `s2twp.json` (Simplified → Taiwan mit Phrasenzuordnung) als Ausgangspunkt und lassen Sie es dann von einem taiwanesischen Chinesisch-Sprecher überprüfen.

Das `check-i18n`-Skript (ausgeführt in CI über `npm run check-i18n`) wird den Build fehlschlagen lassen, wenn eine der oben genannten CI-erzwungenen Teilzeichenfolgen in einem `zh-TW`-Wert landet. Siehe `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` für die vollständige Liste. Wenn eine Übersetzung legitimerweise eine CI-verbotene Teilzeichenfolge enthalten muss, fügen Sie ihren Schlüssel zu `ZH_TW_ALLOWED_EXCEPTIONS` in derselben Datei mit einer kurzen Begründung hinzu.

> [!note]
>
> Die Prüfung verwendet einfache Teilzeichenfolgensuche, die chinesische Wortgrenzen nicht versteht. Ein Bigramm-Muster kann daher fälschlich positiv über Wortverbindungsgrenzen hinweg anschlagen – zum Beispiel enthält `區塊鏈接口` (= `區塊鏈` + `接口`) die Teilzeichenfolge `鏈接`, obwohl keines der Wörter falsch ist. Wenn Sie auf einen solchen überraschenden CI-Fehler stoßen, fügen Sie den Übersetzungsschlüssel zu `ZH_TW_ALLOWED_EXCEPTIONS` hinzu, anstatt das Muster zu entfernen.

### Sprachpaket-Format

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
