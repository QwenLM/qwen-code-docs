# Qwen Code Konfiguration

> [!tip]
>
> **Authentifizierung / API-Keys:** Die Authentifizierung (Qwen OAuth, Alibaba Cloud Coding Plan oder API-Key) sowie authentifizierungsbezogene Umgebungsvariablen (wie `OPENAI_API_KEY`) sind unter **[Authentifizierung](../configuration/auth)** dokumentiert.

> [!note]
>
> **Hinweis zum neuen Konfigurationsformat**: Das Format der `settings.json`-Datei wurde auf eine neue, besser strukturierte Form aktualisiert. Das alte Format wird automatisch migriert.
> Qwen Code bietet mehrere Möglichkeiten, sein Verhalten zu konfigurieren, darunter Umgebungsvariablen, Befehlszeilenargumente und Einstellungsdateien. Dieses Dokument beschreibt die verschiedenen Konfigurationsmethoden und verfügbaren Einstellungen.

## Konfigurationsebenen

Die Konfiguration wird in der folgenden Prioritätsreihenfolge angewendet (niedrigere Nummern werden von höheren Nummern überschrieben):

| Ebene | Konfigurationsquelle   | Beschreibung                                                                     |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1     | Standardwerte         | In der Anwendung fest codierte Standardwerte                                       |
| 2     | System-Standarddatei   | Systemweite Standardeinstellungen, die durch andere Einstellungsdateien überschrieben werden können     |
| 3     | Benutzer-Einstellungsdatei     | Globale Einstellungen für den aktuellen Benutzer                                            |
| 4     | Projekt-Einstellungsdatei  | Projektspezifische Einstellungen                                                       |
| 5     | System-Einstellungsdatei   | Systemweite Einstellungen, die alle anderen Einstellungsdateien überschreiben                     |
| 6     | Umgebungsvariablen  | Systemweite oder sitzungsspezifische Variablen, die ggf. aus `.env`-Dateien geladen werden |
| 7     | Befehlszeilenargumente | Werte, die beim Starten der CLI übergeben werden                                            |

## Einstellungsdateien

Qwen Code verwendet JSON-Einstellungsdateien für die persistente Konfiguration. Es gibt vier Speicherorte für diese Dateien:

| Dateityp             | Speicherort                                                                                                                                                                                                                                                                        | Geltungsbereich                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System-Standarddatei  | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>Der Pfad kann mit der Umgebungsvariable `QWEN_CODE_SYSTEM_DEFAULTS_PATH` überschrieben werden. | Bietet eine Basisebene systemweiter Standardeinstellungen. Diese Einstellungen haben die niedrigste Priorität und sind dafür gedacht, durch Benutzer-, Projekt- oder System-Überschreibungseinstellungen überschrieben zu werden.                                         |
| Benutzer-Einstellungsdatei    | `~/.qwen/settings.json` (wobei `~` dein Home-Verzeichnis ist).                                                                                                                                                                                                                     | Gilt für alle Qwen Code-Sitzungen des aktuellen Benutzers.                                                                                                                                                                   |
| Projekt-Einstellungsdatei | `.qwen/settings.json` im Stammverzeichnis deines Projekts.                                                                                                                                                                                                                     | Gilt nur, wenn Qwen Code aus diesem spezifischen Projekt heraus ausgeführt wird. Projekteinstellungen überschreiben Benutzereinstellungen.                                                                                                                  |
| System-Einstellungsdatei  | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>Der Pfad kann mit der Umgebungsvariable `QWEN_CODE_SYSTEM_SETTINGS_PATH` überschrieben werden.                    | Gilt für alle Qwen Code-Sitzungen auf dem System, für alle Benutzer. Systemeinstellungen überschreiben Benutzer- und Projekteinstellungen. Kann für Systemadministratoren in Unternehmen nützlich sein, um die Qwen Code-Einrichtungen der Benutzer zu steuern. |

> [!note]
>
> **Hinweis zu Umgebungsvariablen in Einstellungen:** Zeichenkettenwerte in deinen `settings.json`-Dateien können Umgebungsvariablen entweder mit der `$VAR_NAME`- oder der `${VAR_NAME}`-Syntax referenzieren. Diese Variablen werden beim Laden der Einstellungen automatisch aufgelöst. Wenn du beispielsweise eine Umgebungsvariable `MY_API_TOKEN` hast, kannst du sie in `settings.json` so verwenden: `"apiKey": "$MY_API_TOKEN"`.

### Das `.qwen`-Verzeichnis in deinem Projekt

Zusätzlich zur Projekt-Einstellungsdatei kann das `.qwen`-Verzeichnis eines Projekts weitere projektspezifische Dateien enthalten, die sich auf den Betrieb von Qwen Code beziehen, wie z. B.:

- [Benutzerdefinierte Sandbox-Profile](../features/sandbox) (z. B. `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).
- [Agent Skills](../features/skills) unter `.qwen/skills/` (jeder Skill ist ein Verzeichnis, das eine `SKILL.md` enthält).

### Konfigurationsmigration

Qwen Code migriert veraltete Konfigurationseinstellungen automatisch in das neue Format. Alte Einstellungsdateien werden vor der Migration gesichert. Die folgenden Einstellungen wurden von einer negativen (`disable*`) zu einer positiven (`enable*`) Benennung umbenannt:

| Alte Einstellung                              | Neue Einstellung                                 | Hinweise                              |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate`                  | Zu einer einzigen Einstellung zusammengefasst |
| `disableLoadingPhrases`                  | `ui.accessibility.enableLoadingPhrases`     |                                    |
| `disableFuzzySearch`                     | `context.fileFiltering.enableFuzzySearch`   |                                    |
| `disableCacheControl`                    | `model.generationConfig.enableCacheControl` |                                    |

> [!note]
>
> **Invertierung von Boolean-Werten:** Bei der Migration werden Boolean-Werte invertiert (z. B. wird `disableAutoUpdate: true` zu `enableAutoUpdate: false`).

#### Konsolidierungsrichtlinie für `disableAutoUpdate` und `disableUpdateNag`

Wenn beide veralteten Einstellungen mit unterschiedlichen Werten vorhanden sind, folgt die Migration dieser Richtlinie: Wenn **entweder** `disableAutoUpdate` **oder** `disableUpdateNag` auf `true` gesetzt ist, wird `enableAutoUpdate` auf `false` gesetzt:

| `disableAutoUpdate` | `disableUpdateNag` | Migriertes `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false`             | `false`            | `true`                      |
| `false`             | `true`             | `false`                     |
| `true`              | `false`            | `false`                     |
| `true`              | `true`             | `false`                     |

### Verfügbare Einstellungen in `settings.json`

Die Einstellungen sind in Kategorien organisiert. Alle Einstellungen sollten innerhalb ihres entsprechenden Top-Level-Kategorieobjekts in deiner `settings.json`-Datei platziert werden.

#### general

| Setting                         | Type    | Description                                                                                                                                                                     | Default     |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor`       | string  | Der bevorzugte Editor zum Öffnen von Dateien.                                                                                                                                          | `undefined` |
| `general.vimMode`               | boolean | Vim-Tastenkombinationen aktivieren.                                                                                                                                                         | `false`     |
| `general.enableAutoUpdate`      | boolean | Automatische Update-Prüfungen und -Installationen beim Start aktivieren.                                                                                                                    | `true`      |
| `general.gitCoAuthor`           | boolean | Fügt Git-Commit-Nachrichten automatisch einen `Co-authored-by`-Trailer hinzu, wenn Commits über Qwen Code erstellt werden.                                                                      | `true`      |
| `general.checkpointing.enabled` | boolean | Session-Checkpointing für die Wiederherstellung aktivieren.                                                                                                                                      | `false`     |
| `general.defaultFileEncoding`   | string  | Standardkodierung für neue Dateien. Verwende `"utf-8"` (Standard) für UTF-8 ohne BOM oder `"utf-8-bom"` für UTF-8 mit BOM. Ändere dies nur, wenn dein Projekt explizit BOM erfordert. | `"utf-8"`   |

#### output

| Setting         | Type   | Description                   | Default  | Possible Values    |
| --------------- | ------ | ----------------------------- | -------- | ------------------ |
| `output.format` | string | Das Format der CLI-Ausgabe. | `"text"` | `"text"`, `"json"` |

#### ui

| Setting                                 | Type             | Description                                                                                                                                                                                                                                                                                                                                                                                                         | Default     |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ui.theme`                              | string           | Das Farbthema für die UI. Siehe [Themes](../configuration/themes) für verfügbare Optionen.                                                                                                                                                                                                                                                                                                                            | `undefined` |
| `ui.customThemes`                       | object           | Definitionen für benutzerdefinierte Themes.                                                                                                                                                                                                                                                                                                                                                                                           | `{}`        |
| `ui.statusLine`                         | object           | Konfiguration der benutzerdefinierten Statuszeile. Ein Shell-Befehl, dessen Ausgabe im linken Bereich der Fußzeile angezeigt wird. Siehe [Status Line](../features/status-line).                                                                                                                                                                                                                                                                   | `undefined` |
| `ui.hideWindowTitle`                    | boolean          | Die Fenstertitelleiste ausblenden.                                                                                                                                                                                                                                                                                                                                                                                          | `false`     |
| `ui.hideTips`                           | boolean          | Hilfreiche Tipps in der UI ausblenden.                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.hideBanner`                         | boolean          | Das Anwendungsbanner ausblenden.                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.hideFooter`                         | boolean          | Die Fußzeile in der UI ausblenden.                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.showMemoryUsage`                    | boolean          | Informationen zur Speichernutzung in der UI anzeigen.                                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `ui.showLineNumbers`                    | boolean          | Zeilennummern in Codeblöcken der CLI-Ausgabe anzeigen.                                                                                                                                                                                                                                                                                                                                                                 | `true`      |
| `ui.showCitations`                      | boolean          | Quellenangaben für generierten Text im Chat anzeigen.                                                                                                                                                                                                                                                                                                                                                                      | `true`      |
| `ui.compactMode`                        | boolean          | Tool-Ausgabe und Thinking-Blöcke für eine übersichtlichere Ansicht ausblenden. Umschaltbar mit `Ctrl+O` während einer Sitzung. Wenn aktiviert, erscheint ein `compact`-Indikator in der Fußzeile. Die Einstellung bleibt sitzungsübergreifend erhalten.                                                                                                                                                                                                                           | `false`     |
| `enableWelcomeBack`                     | boolean          | Willkommensdialog anzeigen, wenn du zu einem Projekt mit Chatverlauf zurückkehrst. Wenn aktiviert, erkennt Qwen Code automatisch, ob du zu einem Projekt mit einer zuvor generierten Projektzusammenfassung (`.qwen/PROJECT_SUMMARY.md`) zurückkehrst, und zeigt einen Dialog an, der es dir ermöglicht, deine vorherige Konversation fortzusetzen oder neu zu beginnen. Diese Funktion ist mit dem `/summary`-Befehl und dem Bestätigungsdialog beim Beenden integriert. | `true`      |
| `ui.accessibility.enableLoadingPhrases` | boolean          | Lade-Phrasen aktivieren (für Barrierefreiheit deaktivieren).                                                                                                                                                                                                                                                                                                                                                                 | `true`      |
| `ui.accessibility.screenReader`         | boolean          | Aktiviert den Screenreader-Modus, der die TUI für eine bessere Kompatibilität mit Screenreadern anpasst.                                                                                                                                                                                                                                                                                                                     | `false`     |
| `ui.customWittyPhrases`                 | array of strings | Eine Liste benutzerdefinierter Phrasen, die während Ladezuständen angezeigt werden. Wenn angegeben, durchläuft die CLI diese Phrasen anstelle der Standardphrasen.                                                                                                                                                                                                                                                                     | `[]`        |
| `ui.enableFollowupSuggestions`          | boolean          | [Folgevorschläge](../features/followup-suggestions) aktivieren, die vorhersagen, was du als Nächstes eingeben möchtest, nachdem das Modell geantwortet hat. Vorschläge erscheinen als Geister-Text und können mit Tab, Enter oder dem rechten Pfeil akzeptiert werden.                                                                                                                                                                                             | `true`      |
| `ui.enableCacheSharing`                 | boolean          | Cache-aware forked queries für die Vorschlagsgenerierung verwenden. Reduziert Kosten bei Providern, die Prefix-Caching unterstützen (experimentell).                                                                                                                                                                                                                                                                                     | `true`      |
| `ui.enableSpeculation`                  | boolean          | Akzeptierte Vorschläge spekulativ vor der Übermittlung ausführen. Ergebnisse erscheinen sofort bei Akzeptanz (experimentell).                                                                                                                                                                                                                                                                                              | `false`     |

#### ide

| Setting            | Type    | Description                                          | Default |
| ------------------ | ------- | ---------------------------------------------------- | ------- |
| `ide.enabled`      | boolean | IDE-Integrationsmodus aktivieren.                         | `false` |
| `ide.hasSeenNudge` | boolean | Gibt an, ob der Benutzer den Hinweis zur IDE-Integration bereits gesehen hat. | `false` |

#### privacy

| Setting                          | Type    | Description                            | Default |
| -------------------------------- | ------- | -------------------------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | Erfassung von Nutzungsstatistiken aktivieren. | `true`  |

#### model

| Setting                                            | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Default     |
| -------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | Das Qwen-Modell, das für Konversationen verwendet werden soll.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `model.maxSessionTurns`                            | number  | Maximale Anzahl an Benutzer-/Modell-/Tool-Turns, die in einer Sitzung gespeichert werden. -1 bedeutet unbegrenzt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `-1`        |
| `model.generationConfig`                           | object  | Erweiterte Overrides, die an den zugrunde liegenden Content-Generator übergeben werden. Unterstützt Request-Controls wie `timeout`, `maxRetries`, `enableCacheControl`, `contextWindowSize` (Überschreibt die Context-Window-Größe des Modells), `modalities` (Überschreibt automatisch erkannte Eingabe-Modalitäten), `customHeaders` (benutzerdefinierte HTTP-Header für API-Requests) und `extra_body` (zusätzliche Body-Parameter nur für OpenAI-kompatible API-Requests), sowie Feinabstimmungsparameter unter `samplingParams` (z. B. `temperature`, `top_p`, `max_tokens`). Nicht gesetzt lassen, um auf Provider-Standards zurückzugreifen. | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | Legt den Schwellenwert für die Chatverlaufskomprimierung als Prozentsatz des gesamten Token-Limits des Modells fest. Dies ist ein Wert zwischen 0 und 1, der sowohl für die automatische Komprimierung als auch für den manuellen `/compress`-Befehl gilt. Ein Wert von `0.6` löst beispielsweise die Komprimierung aus, wenn der Chatverlauf 60 % des Token-Limits überschreitet. Verwende `0`, um die Komprimierung vollständig zu deaktivieren.                                                                                                                                                                                               | `0.7`       |
| `model.skipNextSpeakerCheck`                       | boolean | Die Prüfung des nächsten Sprechers überspringen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `model.skipLoopDetection`                          | boolean | Deaktiviert Loop-Detection-Prüfungen. Die Loop-Detection verhindert Endlosschleifen in KI-Antworten, kann aber falsche Positive erzeugen, die legitime Workflows unterbrechen. Aktiviere diese Option, wenn du häufige Unterbrechungen durch falsch positive Loop-Detection-Erkennungen erlebst.                                                                                                                                                                                                                                                                                                              | `false`     |
| `model.skipStartupContext`                         | boolean | Überspringt das Senden des Startup-Workspace-Kontexts (Umgebungszusammenfassung und Bestätigung) zu Beginn jeder Sitzung. Aktiviere dies, wenn du den Kontext manuell bereitstellen oder Tokens beim Start sparen möchtest.                                                                                                                                                                                                                                                                                                                                                     | `false`     |
| `model.enableOpenAILogging`                        | boolean | Aktiviert das Logging von OpenAI-API-Aufrufen zum Debuggen und Analysieren. Wenn aktiviert, werden API-Requests und -Responses in JSON-Dateien protokolliert.                                                                                                                                                                                                                                                                                                                                                                                                                                   | `false`     |
| `model.openAILoggingDir`                           | string  | Benutzerdefinierter Verzeichnispfad für OpenAI-API-Logs. Wenn nicht angegeben, wird standardmäßig `logs/openai` im aktuellen Arbeitsverzeichnis verwendet. Unterstützt absolute Pfade, relative Pfade (aufgelöst vom aktuellen Arbeitsverzeichnis) und `~`-Erweiterung (Home-Verzeichnis).                                                                                                                                                                                                                                                                                                                      | `undefined` |

**Beispiel für `model.generationConfig`:**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "contextWindowSize": 128000,
      "modalities": {
        "image": true
      },
      "enableCacheControl": true,
      "customHeaders": {
        "X-Client-Request-ID": "req-123"
      },
      "extra_body": {
        "enable_thinking": true
      },
      "samplingParams": {
        "temperature": 0.2,
        "top_p": 0.8,
        "max_tokens": 1024
      }
    }
  }
}
```

**max_tokens (adaptive Ausgabe-Tokens):**

Wenn `samplingParams.max_tokens` nicht gesetzt ist, verwendet Qwen Code eine adaptive Strategie für Ausgabe-Tokens, um die GPU-Ressourcennutzung zu optimieren:

1. Requests beginnen mit einem Standardlimit von **8K** Ausgabe-Tokens
2. Wenn die Antwort abgeschnitten wird (das Modell erreicht das Limit), wiederholt Qwen Code den Vorgang automatisch mit **64K** Tokens
3. Die teilweise Ausgabe wird verworfen und durch die vollständige Antwort aus dem Retry ersetzt

Dies geschieht transparent für Benutzer – du siehst möglicherweise kurz einen Retry-Indikator, wenn eine Eskalation erfolgt. Da 99 % der Antworten unter 5K Tokens liegen, tritt der Retry selten auf (<1 % der Requests).

Um dieses Verhalten zu überschreiben, setze entweder `samplingParams.max_tokens` in deinen Einstellungen oder verwende die Umgebungsvariable `QWEN_CODE_MAX_OUTPUT_TOKENS`.

**contextWindowSize:**

Überschreibt die standardmäßige Context-Window-Größe für das ausgewählte Modell. Qwen Code ermittelt die Context-Window-Größe anhand interner Standards basierend auf Modellnamens-Matching, mit einem konstanten Fallback-Wert. Verwende diese Einstellung, wenn das effektive Context-Limit eines Providers von Qwen Codes Standard abweicht. Dieser Wert definiert die angenommene maximale Context-Kapazität des Modells, nicht ein Token-Limit pro Request.

**modalities:**

Überschreibt die automatisch erkannten Eingabe-Modalitäten für das ausgewählte Modell. Qwen Code erkennt unterstützte Modalitäten (Bild, PDF, Audio, Video) automatisch basierend auf Modellnamens-Mustern. Verwende diese Einstellung, wenn die Auto-Erkennung fehlerhaft ist – z. B. um `pdf` für ein Modell zu aktivieren, das es unterstützt, aber nicht erkannt wird. Format: `{ "image": true, "pdf": true, "audio": true, "video": true }`. Lasse einen Schlüssel weg oder setze ihn auf `false` für nicht unterstützte Typen.

**customHeaders:**

Ermöglicht das Hinzufügen benutzerdefinierter HTTP-Header zu allen API-Requests. Dies ist nützlich für Request-Tracing, Monitoring, API-Gateway-Routing oder wenn verschiedene Modelle unterschiedliche Header benötigen. Wenn `customHeaders` in `modelProviders[].generationConfig.customHeaders` definiert ist, wird es direkt verwendet; andernfalls werden Header aus `model.generationConfig.customHeaders` verwendet. Es findet kein Merging zwischen den beiden Ebenen statt.

Das Feld `extra_body` ermöglicht das Hinzufügen benutzerdefinierter Parameter zum Request-Body, der an die API gesendet wird. Dies ist nützlich für providerspezifische Optionen, die nicht von den Standardkonfigurationsfeldern abgedeckt werden. **Hinweis: Dieses Feld wird nur für OpenAI-kompatible Provider (`openai`, `qwen-oauth`) unterstützt. Es wird für Anthropic- und Gemini-Provider ignoriert.** Wenn `extra_body` in `modelProviders[].generationConfig.extra_body` definiert ist, wird es direkt verwendet; andernfalls werden Werte aus `model.generationConfig.extra_body` verwendet.

**Beispiele für `model.openAILoggingDir`:**

- `"~/qwen-logs"` - Logs im Verzeichnis `~/qwen-logs`
- `"./custom-logs"` - Logs in `./custom-logs` relativ zum aktuellen Verzeichnis
- `"/tmp/openai-logs"` - Logs im absoluten Pfad `/tmp/openai-logs`

#### fastModel

| Setting     | Type   | Description                                                                                                                                                                                                                                                      | Default |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `fastModel` | string | Modell, das zur Generierung von [Prompt-Vorschlägen](../features/followup-suggestions) und spekulativer Ausführung verwendet wird. Leer lassen, um das Hauptmodell zu verwenden. Ein kleineres/schnelleres Modell (z. B. `qwen3-coder-flash`) reduziert Latenz und Kosten. Kann auch über `/model --fast` gesetzt werden. | `""`    |

#### context

| Setting                                           | Type                       | Description                                                                                                                                                                                                                                                                                                                                                           | Default     |
| ------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName`                                | string or array of strings | Der Name der Kontextdatei(en).                                                                                                                                                                                                                                                                                                                                      | `undefined` |
| `context.importFormat`                            | string                     | Das Format, das beim Importieren von Memory verwendet werden soll.                                                                                                                                                                                                                                                                                                                              | `undefined` |
| `context.includeDirectories`                      | array                      | Zusätzliche Verzeichnisse, die in den Workspace-Kontext einbezogen werden sollen. Gibt ein Array zusätzlicher absoluter oder relativer Pfade an, die in den Workspace-Kontext aufgenommen werden sollen. Fehlende Verzeichnisse werden standardmäßig mit einer Warnung übersprungen. Pfade können `~` verwenden, um auf das Home-Verzeichnis des Benutzers zu verweisen. Diese Einstellung kann mit dem Befehlszeilenflag `--include-directories` kombiniert werden. | `[]`        |
| `context.loadFromIncludeDirectories`              | boolean                    | Steuert das Verhalten des `/memory refresh`-Befehls. Wenn auf `true` gesetzt, sollten `QWEN.md`-Dateien aus allen hinzugefügten Verzeichnissen geladen werden. Wenn auf `false` gesetzt, sollte `QWEN.md` nur aus dem aktuellen Verzeichnis geladen werden.                                                                                                                                        | `false`     |
| `context.fileFiltering.respectGitIgnore`          | boolean                    | `.gitignore`-Dateien bei der Suche beachten.                                                                                                                                                                                                                                                                                                                              | `true`      |
| `context.fileFiltering.respectQwenIgnore`         | boolean                    | `.qwenignore`-Dateien bei der Suche beachten.                                                                                                                                                                                                                                                                                                                             | `true`      |
| `context.fileFiltering.enableRecursiveFileSearch` | boolean                    | Gibt an, ob bei der Vervollständigung von `@`-Präfixen im Prompt rekursiv nach Dateinamen im aktuellen Baum gesucht werden soll.                                                                                                                                                                                                                                              | `true`      |
| `context.fileFiltering.enableFuzzySearch`         | boolean                    | Wenn `true`, aktiviert Fuzzy-Suchfunktionen bei der Dateisuche. Setze auf `false`, um die Leistung bei Projekten mit einer großen Anzahl von Dateien zu verbessern.                                                                                                                                                                                                              | `true`      |
| `context.gapThresholdMinutes`                     | number                     | Minuten der Inaktivität, nach denen beibehaltene Thinking-Blöcke gelöscht werden, um Context-Tokens freizugeben. Richtet sich nach der typischen Prompt-Cache-TTL von Providern. Erhöhe den Wert, wenn dein Provider eine längere Cache-TTL hat.                                                                                                                                                                     | `5`         |

#### Fehlerbehebung bei der Dateisuchleistung

Wenn du Leistungsprobleme bei der Dateisuche hast (z. B. bei `@`-Vervollständigungen), insbesondere in Projekten mit einer sehr großen Anzahl von Dateien, kannst du folgende Schritte in der empfohlenen Reihenfolge versuchen:

1. **Verwende `.qwenignore`:** Erstelle eine `.qwenignore`-Datei im Projektstamm, um Verzeichnisse auszuschließen, die eine große Anzahl von Dateien enthalten, auf die du nicht verweisen musst (z. B. Build-Artefakte, Logs, `node_modules`). Die Reduzierung der Gesamtzahl der durchsuchten Dateien ist der effektivste Weg, um die Leistung zu verbessern.
2. **Deaktiviere Fuzzy Search:** Wenn das Ignorieren von Dateien nicht ausreicht, kannst du die Fuzzy-Suche deaktivieren, indem du `enableFuzzySearch` in deiner `settings.json`-Datei auf `false` setzt. Dadurch wird ein einfacherer, nicht-fuzziger Matching-Algorithmus verwendet, der schneller sein kann.
3. **Deaktiviere rekursive Dateisuche:** Als letzten Ausweg kannst du die rekursive Dateisuche vollständig deaktivieren, indem du `enableRecursiveFileSearch` auf `false` setzt. Dies ist die schnellste Option, da sie einen rekursiven Durchlauf deines Projekts vermeidet. Das bedeutet jedoch, dass du bei der Verwendung von `@`-Vervollständigungen den vollständigen Pfad zu Dateien eingeben musst.

#### tools

| Setting                              | Type              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Default     | Notes                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                      | boolean or string | Sandbox-Ausführungsumgebung (kann ein Boolean oder ein Pfad-String sein).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.shell.enableInteractiveShell` | boolean           | Verwende `node-pty` für ein interaktives Shell-Erlebnis. Fallback auf `child_process` gilt weiterhin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |                                                                                                                                                                                                                                                      |
| `tools.core`                         | array of strings  | **Veraltet.** Wird in der nächsten Version entfernt. Verwende stattdessen `permissions.allow` + `permissions.deny`. Beschränkt integrierte Tools auf eine Allowlist. Alle Tools, die nicht in der Liste stehen, sind deaktiviert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.exclude`                      | array of strings  | **Veraltet.** Verwende stattdessen `permissions.deny`. Tool-Namen, die von der Discovery ausgeschlossen werden sollen. Wird beim ersten Laden automatisch in das `permissions`-Format migriert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.allowed`                      | array of strings  | **Veraltet.** Verwende stattdessen `permissions.allow`. Tool-Namen, die den Bestätigungsdialog umgehen. Wird beim ersten Laden automatisch in das `permissions`-Format migriert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.approvalMode`                 | string            | Legt den standardmäßigen Genehmigungsmodus für die Tool-Nutzung fest.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `default`   | Mögliche Werte: `plan` (nur analysieren, keine Dateien ändern oder Befehle ausführen), `default` (Genehmigung vor Dateiänderungen oder Shell-Befehlen erforderlich), `auto-edit` (Dateiänderungen automatisch genehmigen), `yolo` (alle Tool-Aufrufe automatisch genehmigen) |
| `tools.discoveryCommand`             | string            | Befehl, der für die Tool-Discovery ausgeführt werden soll.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.callCommand`                  | string            | Definiert einen benutzerdefinierten Shell-Befehl zum Aufrufen eines bestimmten Tools, das mit `tools.discoveryCommand` entdeckt wurde. Der Shell-Befehl muss folgende Kriterien erfüllen: Er muss den Funktions-`name` (genau wie in der [Funktionsdeklaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) als erstes Befehlszeilenargument übernehmen. Er muss Funktionsargumente als JSON auf `stdin` lesen, analog zu [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall). Er muss die Funktionsausgabe als JSON auf `stdout` zurückgeben, analog zu [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse). | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.useRipgrep`                   | boolean           | Verwende ripgrep für die Dateiinhaltsuche anstelle der Fallback-Implementierung. Bietet schnellere Suchleistung.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`      |                                                                                                                                                                                                                                                      |
| `tools.useBuiltinRipgrep`            | boolean           | Verwende das gebündelte ripgrep-Binary. Wenn auf `false` gesetzt, wird stattdessen der systemweite `rg`-Befehl verwendet. Diese Einstellung ist nur wirksam, wenn `tools.useRipgrep` auf `true` gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `true`      |                                                                                                                                                                                                                                                      |
| `tools.truncateToolOutputThreshold`  | number            | Kürzt die Tool-Ausgabe, wenn sie größer als diese Anzahl von Zeichen ist. Gilt für Shell-, Grep-, Glob-, ReadFile- und ReadManyFiles-Tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `25000`     | Erfordert Neustart: Ja                                                                                                                                                                                                                                |
| `tools.truncateToolOutputLines`      | number            | Maximale Anzahl an Zeilen oder Einträgen, die beim Kürzen der Tool-Ausgabe beibehalten werden. Gilt für Shell-, Grep-, Glob-, ReadFile- und ReadManyFiles-Tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `1000`      | Erfordert Neustart: Ja                                                                                                                                                                                                                                |

> [!note]
>
> **Migration von `tools.core` / `tools.exclude` / `tools.allowed`:** Diese veralteten Einstellungen sind **deprecated** und werden beim ersten Laden automatisch in das neue `permissions`-Format migriert. Konfiguriere `permissions.allow` / `permissions.deny` bevorzugt direkt. Verwende `/permissions`, um Regeln interaktiv zu verwalten.

#### permissions

Das Berechtigungssystem bietet eine feingranulare Kontrolle darüber, welche Tools ausgeführt werden können, welche eine Bestätigung erfordern und welche blockiert sind.

**Entscheidungspriorität (höchste zuerst): `deny` > `ask` > `allow` > _(Standard/interaktiver Modus)_**

Die erste übereinstimmende Regel gewinnt. Regeln verwenden das Format `"ToolName"` oder `"ToolName(Spezifizierer)"`.

| Setting             | Type             | Description                                                                                                      | Default     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | Regeln für automatisch genehmigte Tool-Aufrufe (keine Bestätigung erforderlich). Wird über alle Geltungsbereiche hinweg zusammengeführt (Benutzer + Projekt + System). | `undefined` |
| `permissions.ask`   | array of strings | Regeln für Tool-Aufrufe, die immer eine Benutzerbestätigung erfordern. Hat Vorrang vor `allow`.                         | `undefined` |
| `permissions.deny`  | array of strings | Regeln für blockierte Tool-Aufrufe. Höchste Priorität – überschreibt sowohl `allow` als auch `ask`.                               | `undefined` |

**Tool-Namen-Aliase (jeder davon funktioniert in Regeln):**

| Alias                 | Canonical tool      | Notes                     |
| --------------------- | ------------------- | ------------------------- |
| `Bash`, `Shell`       | `run_shell_command` |                           |
| `Read`, `ReadFile`    | `read_file`         | Metakategorie – siehe unten |
| `Edit`, `EditFile`    | `edit`              | Metakategorie – siehe unten |
| `Write`, `WriteFile`  | `write_file`        |                           |
| `Grep`, `SearchFiles` | `grep_search`       |                           |
| `Glob`, `FindFiles`   | `glob`              |                           |
| `ListFiles`           | `list_directory`    |                           |
| `WebFetch`            | `web_fetch`         |                           |
| `Agent`               | `task`              |                           |
| `Skill`               | `skill`             |                           |

**Metakategorien:**

Einige Regelnamen decken automatisch mehrere Tools ab:

| Rule name | Tools covered                                        |
| --------- | ---------------------------------------------------- |
| `Read`    | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit`    | `edit`, `write_file`                                 |

> [!important]
> `Read(/path/**)` stimmt mit **allen vier** Read-Tools überein (Datei lesen, grep, glob und Verzeichnisauflistung).
> Um nur das Lesen von Dateien einzuschränken, verwende `ReadFile(/path/**)` oder `read_file(/path/**)`.

**Beispiele für Regelsyntax:**

| Rule                          | Meaning                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `"Bash"`                      | Alle Shell-Befehle                                             |
| `"Bash(git *)"`               | Shell-Befehle, die mit `git` beginnen (Wortgrenze: NICHT `gitk`) |
| `"Bash(git push *)"`          | Shell-Befehle wie `git push origin main`                     |
| `"Bash(npm run *)"`           | Jedes `npm run`-Skript                                           |
| `"Read"`                      | Alle Datei-Lesevorgänge (lesen, grep, glob, auflisten)              |
| `"Read(./secrets/**)"`        | Lese jede Datei unter `./secrets/` rekursiv                   |
| `"Edit(/src/**/*.ts)"`        | Bearbeite TypeScript-Dateien unter dem Projektstamm `/src/`               |
| `"WebFetch(api.example.com)"` | Hole von `api.example.com` und allen seinen Subdomains            |
| `"mcp__puppeteer"`            | Alle Tools vom puppeteer-MCP-Server                        |

**Pfadmuster-Präfixe:**

| Prefix | Meaning                               | Example             |
| ------ | ------------------------------------- | ------------------- |
| `//`   | Absoluter Pfad vom Dateisystemstamm    | `//etc/passwd`      |
| `~/`   | Relativ zum Home-Verzeichnis            | `~/Documents/*.pdf` |
| `/`    | Relativ zum Projektstamm              | `/src/**/*.ts`      |
| `./`   | Relativ zum aktuellen Arbeitsverzeichnis | `./secrets/**`      |
| (none) | Gleichbedeutend mit `./`                          | `secrets/**`        |

**Verhinderung der Umgehung von Shell-Befehlen:**

Berechtigungsregeln für `Read`, `Edit` und `WebFetch` werden auch durchgesetzt, wenn der Agent äquivalente Shell-Befehle ausführt. Wenn sich beispielsweise `Read(./.env)` in `deny` befindet, kann der Agent dies nicht über `cat .env` in einem Shell-Befehl umgehen. Unterstützte Shell-Befehle umfassen `cat`, `grep`, `curl`, `wget`, `cp`, `mv`, `rm`, `chmod` und viele mehr. Unbekannte/sichere Befehle (z. B. `git`) sind von Datei-/Netzwerkregeln nicht betroffen.

**Migration von veralteten Einstellungen:**

| Legacy setting  | Equivalent `permissions` rule   | Notes                                                        |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow`             | Wird beim ersten Laden automatisch migriert                                  |
| `tools.exclude` | `permissions.deny`              | Wird beim ersten Laden automatisch migriert                                  |
| `tools.core`    | `permissions.allow` (Allowlist) | Automatisch migriert; nicht aufgeführte Tools werden auf Registry-Ebene deaktiviert |

**Beispielkonfiguration:**

```json
{
  "permissions": {
    "allow": ["Bash(git *)", "Bash(npm run *)", "Read(//Users/alice/code/**)"],
    "ask": ["Bash(git push *)", "Edit"],
    "deny": ["Bash(rm -rf *)", "Read(.env)", "WebFetch(malicious.com)"]
  }
}
```

> [!tip]
> Verwende `/permissions` in der interaktiven CLI, um Regeln anzuzeigen, hinzuzufügen und zu entfernen, ohne `settings.json` direkt zu bearbeiten.

#### mcp

| Setting             | Type             | Description                                                                                                                                                                                                                                                                  | Default     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | Befehl zum Starten eines MCP-Servers.                                                                                                                                                                                                                                              | `undefined` |
| `mcp.allowed`       | array of strings | Eine Allowlist von MCP-Servern, die erlaubt werden sollen. Ermöglicht die Angabe einer Liste von MCP-Servernamen, die dem Modell zur Verfügung gestellt werden sollen. Dies kann verwendet werden, um die Menge der zu verbindenden MCP-Server einzuschränken. Beachte, dass dies ignoriert wird, wenn `--allowed-mcp-server-names` gesetzt ist. | `undefined` |
| `mcp.excluded`      | array of strings | Eine Denylist von MCP-Servern, die ausgeschlossen werden sollen. Ein Server, der sowohl in `mcp.excluded` als auch in `mcp.allowed` aufgeführt ist, wird ausgeschlossen. Beachte, dass dies ignoriert wird, wenn `--allowed-mcp-server-names` gesetzt ist.                                                                                           | `undefined` |

> [!note]
>
> **Sicherheitshinweis für MCP-Server:** Diese Einstellungen verwenden einfaches String-Matching für MCP-Servernamen, die geändert werden können. Wenn du als Systemadministrator verhindern möchtest, dass Benutzer dies umgehen, erwäge, die `mcpServers` auf der Ebene der Systemeinstellungen so zu konfigurieren, dass Benutzer keine eigenen MCP-Server konfigurieren können. Dies sollte nicht als wasserdichter Sicherheitsmechanismus verwendet werden.

#### lsp

> [!warning]
> **Experimentelles Feature**: Die LSP-Unterstützung ist derzeit experimentell und standardmäßig deaktiviert. Aktiviere sie mit dem Befehlszeilenflag `--experimental-lsp`.

Das Language Server Protocol (LSP) bietet Code-Intelligence-Funktionen wie Gehe-zu-Definition, Referenzen suchen und Diagnosen.

Die Konfiguration des LSP-Servers erfolgt über `.lsp.json`-Dateien im Projektstammverzeichnis, nicht über `settings.json`. Siehe die [LSP-Dokumentation](../features/lsp) für Konfigurationsdetails und Beispiele.

#### security

| Setting                        | Type    | Description                                       | Default     |
| ------------------------------ | ------- | ------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | Einstellung, die angibt, ob Folder Trust aktiviert ist. | `false`     |
| `security.auth.selectedType`   | string  | Der aktuell ausgewählte Authentifizierungstyp.       | `undefined` |
| `security.auth.enforcedType`   | string  | Der erforderliche Authentifizierungstyp (nützlich für Unternehmen).  | `undefined` |
| `security.auth.useExternal`    | boolean | Gibt an, ob ein externer Authentifizierungsablauf verwendet werden soll.   | `undefined` |

#### advanced

| Setting                        | Type             | Description                                                                                                                                                                                                                                                                                                                        | Default                  |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | Node.js-Speicherlimits automatisch konfigurieren.                                                                                                                                                                                                                                                                                     | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | Die DNS-Auflösungsreihenfolge.                                                                                                                                                                                                                                                                                                          | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | Umgebungsvariablen, die vom Projektkontext ausgeschlossen werden sollen. Gibt Umgebungsvariablen an, die nicht aus Projekt-`.env`-Dateien geladen werden sollen. Dies verhindert, dass projektspezifische Umgebungsvariablen (wie `DEBUG=true`) das CLI-Verhalten beeinträchtigen. Variablen aus `.qwen/.env`-Dateien werden niemals ausgeschlossen. | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | Konfiguration für den Bug-Report-Befehl. Überschreibt die Standard-URL für den `/bug`-Befehl. Eigenschaften: `urlTemplate` (String): Eine URL, die `{title}`- und `{info}`-Platzhalter enthalten kann. Beispiel: `"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                    | `undefined`              |
| `advanced.tavilyApiKey`        | string           | API-Key für den Tavily-Websuchdienst. Wird verwendet, um die `web_search`-Tool-Funktionalität zu aktivieren.                                                                                                                                                                                                                                         | `undefined`              |

> [!note]
>
> **Hinweis zu `advanced.tavilyApiKey`:** Dies ist ein veraltetes Konfigurationsformat. Für Qwen OAuth-Benutzer ist der DashScope-Provider automatisch ohne Konfiguration verfügbar. Für andere Authentifizierungstypen konfiguriere Tavily- oder Google-Provider mit dem neuen `webSearch`-Konfigurationsformat.

#### mcpServers

Konfiguriert Verbindungen zu einem oder mehreren Model-Context Protocol (MCP)-Servern zum Entdecken und Verwenden benutzerdefinierter Tools. Qwen Code versucht, eine Verbindung zu jedem konfigurierten MCP-Server herzustellen, um verfügbare Tools zu entdecken. Wenn mehrere MCP-Server ein Tool mit demselben Namen bereitstellen, werden die Tool-Namen mit dem Server-Alias vorangestellt, den du in der Konfiguration definiert hast (z. B. `serverAlias__actualToolName`), um Konflikte zu vermeiden. Beachte, dass das System aus Kompatibilitätsgründen bestimmte Schema-Eigenschaften aus MCP-Tool-Definitionen entfernen kann. Mindestens einer der Werte `command`, `url` oder `httpUrl` muss angegeben werden. Wenn mehrere angegeben sind, ist die Prioritätsreihenfolge `httpUrl`, dann `url`, dann `command`.

| Property                                | Type             | Description                                                                                                                                                                                                                                                        | Optional |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`      | string           | Der Befehl zum Ausführen, um den MCP-Server über Standard-I/O zu starten.                                                                                                                                                                                                   | Yes      |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | Argumente, die an den Befehl übergeben werden sollen.                                                                                                                                                                                                                                  | Yes      |
| `mcpServers.<SERVER_NAME>.env`          | object           | Umgebungsvariablen, die für den Serverprozess festgelegt werden sollen.                                                                                                                                                                                                               | Yes      |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | Das Arbeitsverzeichnis, in dem der Server gestartet werden soll.                                                                                                                                                                                                                | Yes      |
| `mcpServers.<SERVER_NAME>.url`          | string           | Die URL eines MCP-Servers, der Server-Sent Events (SSE) für die Kommunikation verwendet.                                                                                                                                                                                     | Yes      |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | Die URL eines MCP-Servers, der streamable HTTP für die Kommunikation verwendet.                                                                                                                                                                                              | Yes      |
| `mcpServers.<SERVER_NAME>.headers`      | object           | Eine Map von HTTP-Headern, die mit Requests an `url` oder `httpUrl` gesendet werden sollen.                                                                                                                                                                                                 | Yes      |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | Timeout in Millisekunden für Requests an diesen MCP-Server.                                                                                                                                                                                                           | Yes      |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | Vertraue diesem Server und umgehe alle Tool-Aufruf-Bestätigungen.                                                                                                                                                                                                          | Yes      |
| `mcpServers.<SERVER_NAME>.description`  | string           | Eine kurze Beschreibung des Servers, die ggf. für Anzeigezwecke verwendet wird.                                                                                                                                                                                         | Yes      |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | Liste der Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.                                        | Yes      |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgeführten Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen. | Yes      |

#### telemetry

Konfiguriert Logging und Metrikerfassung für Qwen Code. Weitere Informationen findest du unter [Telemetry](/developers/development/telemetry).

| Setting                  | Type    | Description                                                                      | Default |
| ------------------------ | ------- | -------------------------------------------------------------------------------- | ------- |
| `telemetry.enabled`      | boolean | Gibt an, ob Telemetry aktiviert ist.                                             |         |
| `telemetry.target`       | string  | Das Ziel für erfasste Telemetry-Daten. Unterstützte Werte sind `local` und `gcp`. |         |
| `telemetry.otlpEndpoint` | string  | Der Endpunkt für den OTLP-Exporter.                                              |         |
| `telemetry.otlpProtocol` | string  | Das Protokoll für den OTLP-Exporter (`grpc` oder `http`).                           |         |
| `telemetry.logPrompts`   | boolean | Gibt an, ob der Inhalt von Benutzer-Prompts in die Logs aufgenommen werden soll.               |         |
| `telemetry.outfile`      | string  | Die Datei, in die Telemetry geschrieben wird, wenn `target` auf `local` gesetzt ist.                         |         |
| `telemetry.useCollector` | boolean | Gibt an, ob ein externer OTLP-Collector verwendet werden soll.                                       |         |

### Beispiel für `settings.json`

Hier ist ein Beispiel für eine `settings.json`-Datei mit der verschachtelten Struktur, neu ab v0.3.0:

```
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of 'em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "enableOpenAILogging": false,
    "openAILoggingDir": "~/qwen-logs",
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Shell-Verlauf

Die CLI speichert einen Verlauf der von dir ausgeführten Shell-Befehle. Um Konflikte zwischen verschiedenen Projekten zu vermeiden, wird dieser Verlauf in einem projektspezifischen Verzeichnis innerhalb deines Benutzer-Home-Ordners gespeichert.

- **Speicherort:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` ist eine eindeutige Kennung, die aus dem Root-Pfad deines Projekts generiert wird.
  - Der Verlauf