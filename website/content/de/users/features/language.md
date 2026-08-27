# Internationalisierung (i18n) & Sprache

Qwen Code ist für mehrsprachige Arbeitsabläufe ausgelegt: Es unterstützt UI-Lokalisierung (i18n/l10n) in der CLI, ermöglicht die Wahl der Ausgabesprache des Assistenten und erlaubt benutzerdefinierte UI-Sprachpakete.

## Übersicht

Aus Benutzersicht umfasst die „Internationalisierung“ von Qwen Code mehrere Ebenen:

| Fähigkeit / Einstellung | Was es steuert                                                         | Wo gespeichert                 |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `/language ui`          | Terminal-UI-Texte (Menüs, Systemmeldungen, Eingabeaufforderungen)      | `~/.qwen/settings.json`        |
| `/language output`      | Sprache, in der die KI antwortet (eine Ausgabepräferenz, keine UI-Übersetzung) | `~/.qwen/output-language.md` |
| Benutzerdefinierte UI-Sprachpakete | Überschreibt/erweitert integrierte UI-Übersetzungen            | `~/.qwen/locales/*.js`         |

## UI-Sprache

Dies ist die UI-Lokalisierungsebene der CLI (i18n/l10n): Sie steuert die Sprache von Menüs, Eingabeaufforderungen und Systemmeldungen.

### Festlegen der UI-Sprache

Verwenden Sie den Befehl `/language ui`:

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

Beim ersten Start erkennt Qwen Code Ihre Systemsprache und stellt die UI-Sprache automatisch ein.

Erkennungsreihenfolge:

1. Umgebungsvariable `QWEN_CODE_LANG`
2. Umgebungsvariable `LANG`
3. Systemsprache über die JavaScript Intl API
4. Standard: Englisch

## LLM-Ausgabesprache

Die LLM-Ausgabesprache steuert, in welcher Sprache der KI-Assistent antwortet, unabhängig davon, in welcher Sprache Sie Ihre Fragen stellen.

### Funktionsweise

Die LLM-Ausgabesprache wird durch eine Regeldatei unter `~/.qwen/output-language.md` gesteuert. Diese Datei wird beim Start automatisch in den Kontext des LLM aufgenommen und weist ihn an, in der angegebenen Sprache zu antworten.

### Automatische Erkennung

Beim ersten Start, falls keine Datei `output-language.md` existiert, erstellt Qwen Code automatisch eine basierend auf Ihrer Systemsprache. Zum Beispiel:

- Systemsprache `zh` erstellt eine Regel für chinesische Antworten
- Systemsprache `en` erstellt eine Regel für englische Antworten
- Systemsprache `ru` erstellt eine Regel für russische Antworten
- Systemsprache `de` erstellt eine Regel für deutsche Antworten
- Systemsprache `ja` erstellt eine Regel für japanische Antworten
- Systemsprache `pt` erstellt eine Regel für portugiesische Antworten
- Systemsprache `fr` erstellt eine Regel für französische Antworten
- Systemsprache `ca` erstellt eine Regel für katalanische Antworten

### Manuelle Einstellung

Verwenden Sie `/language output <Sprache>`, um die Ausgabesprache zu ändern:

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Jeder Sprachname funktioniert. Der LLM wird angewiesen, in dieser Sprache zu antworten.

> [!note]
>
> Nach dem Ändern der Ausgabesprache starten Sie Qwen Code neu, damit die Änderung wirksam wird.

### Speicherort

```
~/.qwen/output-language.md
```

## Konfiguration

### Über den Einstellungsdialog

1. Führen Sie `/settings` aus
2. Finden Sie „Sprache“ unter „Allgemein“
3. Wählen Sie Ihre bevorzugte UI-Sprache

### Über Umgebungsvariable

```bash
export QWEN_CODE_LANG=zh
```

Dies beeinflusst die automatische Erkennung beim ersten Start (falls Sie noch keine UI-Sprache festgelegt haben und noch keine Datei `output-language.md` existiert).

## Benutzerdefinierte Sprachpakete

Für UI-Übersetzungen können Sie benutzerdefinierte Sprachpakete in `~/.qwen/locales/` erstellen:

- Beispiel: `~/.qwen/locales/es.js` für Spanisch
- Beispiel: `~/.qwen/locales/fr.js` für Französisch

Das Benutzerverzeichnis hat Vorrang vor den integrierten Übersetzungen.

> [!tip]
>
> Beiträge sind willkommen! Wenn Sie die integrierten Übersetzungen verbessern oder neue Sprachen hinzufügen möchten.
> Ein konkretes Beispiel finden Sie unter [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Pflege von `zh-TW` (Traditionelles Chinesisch für Taiwan)

`zh-TW` ist **keine** automatische OpenCC-s2t-Konvertierung von `zh.js` – es ist eine manuell gepflegte Übersetzung mit taiwanischem Vokabular. Bitte beachten Sie beim Hinzufügen oder Aktualisieren von Schlüsseln die folgenden Konventionen.

Die Spalte „CI erzwungen?“ gibt an, ob `npm run check-i18n` den Build bei einem Verstoß fehlschlagen lässt. Mit **Nein** markierte Zeilen sind Stilrichtlinien, die nur durch Reviews durchgesetzt werden – in der Regel, weil die anstößige Form eine legitime Nicht-UI-Bedeutung hat (`文件` kann „Dokument“ bedeuten, `打開` ist im taiwanischen Sprachgebrauch umgangssprachlich in Ordnung).

| Vermeiden              | Stattdessen verwenden | CI erzwungen? | Grund                                                                                                                                                                           |
| ---------------------- | ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 (Datei)           | 檔案                  | Nein          | Taiwanischer Begriff für Dateien im Dateisystem (aber `文件` kann durchaus „Dokument“ bedeuten)                                                                                 |
| 服務器 / 服务器        | 伺服器                | Ja            | Taiwanischer Begriff für „Server“                                                                                                                                               |
| 菜單 / 菜单            | 選單                  | Ja            | Taiwanischer Begriff für „Menü“                                                                                                                                                 |
| 鏈接 / 链接            | 連結                  | Ja            | Taiwanischer Begriff für „Link“ (reines `鏈` ist in Ordnung – z. B. 區塊鏈)                                                                                                       |
| 打開                   | 開啟                  | Nein           | In Taiwan bevorzugtes Verb für „öffnen“ (UI); `打開` ist umgangssprachlich üblich                                                                                               |
| 爲 / 啓 / 曆史 / 鏈接  | 為 / 啟 / 歷史 / 連結 | Ja            | Varianten traditioneller Formen aus roher OpenCC-s2t-Konvertierung. Hinweis: `曆` ist kontextabhängig und korrekt in Kalenderbegriffen (日曆, 農曆, 西曆); CI markiert nur das Bigramm `曆史`, nicht ein einzelnes `歷`. |

Wenn Sie kein traditionelles Chinesisch sprechen und einen Wert bootstrappen müssen, **fügen Sie keine rohe OpenCC-`s2t`-Ausgabe ein**: Das Standard-s2t-Profil gibt Varianten traditioneller Zeichen aus (z. B. 爲, 啓), die in Taiwan nicht verwendet werden, und schreibt nie festlandchinesisches Vokabular um (服務器, 菜單). Bevorzugen Sie `s2twp.json` (Vereinfacht → Taiwan mit Phrasen-Mapping) als Ausgangspunkt und lassen Sie die Übersetzung dann von einem taiwanisch-chinesischen Muttersprachler überprüfen.

Das Skript `check-i18n` (ausgeführt in CI über `npm run check-i18n`) wird den Build fehlschlagen lassen, wenn eine der oben genannten CI-erzwungenen Teilzeichenfolgen in einem `zh-TW`-Wert vorkommt. Siehe `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` für die vollständige Liste. Wenn eine Übersetzung legitimerweise eine CI-verbotene Teilzeichenfolge enthalten muss, fügen Sie ihren Schlüssel mit einer kurzen Begründung zu `ZH_TW_ALLOWED_EXCEPTIONS` in derselben Datei hinzu.

> [!note]
>
> Die Prüfung verwendet einfache Teilzeichenfolgen-Suche, die keine chinesischen Wortgrenzen erkennt. Ein Bigramm-Muster kann daher fälschlicherweise über Wortzusammensetzungsgrenzen hinweg anschlagen – zum Beispiel enthält `區塊鏈接口` (= `區塊鏈` + `接口`) die Teilzeichenfolge `鏈接`, obwohl keines der Wörter falsch ist. Wenn Sie auf einen überraschenden CI-Fehler dieser Art stoßen, fügen Sie den Übersetzungsschlüssel zu `ZH_TW_ALLOWED_EXCEPTIONS` hinzu, anstatt das Muster zu entfernen.

### Format eines Sprachpakets

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... weitere Übersetzungen
};
```

## Verwandte Befehle

- `/language` – Aktuelle Spracheinstellungen anzeigen
- `/language ui [Sprache]` – UI-Sprache festlegen
- `/language output <Sprache>` – LLM-Ausgabesprache festlegen
- `/settings` – Einstellungsdialog öffnen