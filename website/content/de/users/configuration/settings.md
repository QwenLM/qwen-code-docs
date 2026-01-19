# Qwen Code Konfiguration

> [!tip]
>
> **Authentifizierung / API-Schlüssel:** Authentifizierung (Qwen OAuth vs OpenAI-kompatibles API) und authentifizierungsbezogene Umgebungsvariablen (wie `OPENAI_API_KEY`) sind in der Dokumentation unter **[Authentifizierung](../configuration/auth)** beschrieben.

> [!note]
>
> **Hinweis zum neuen Konfigurationsformat**: Das Format der Datei `settings.json` wurde auf eine neue, besser strukturierte Form aktualisiert. Das alte Format wird automatisch migriert.
> Qwen Code bietet verschiedene Möglichkeiten, das Verhalten zu konfigurieren, einschließlich Umgebungsvariablen, Befehlszeilenargumenten und Einstellungsdateien. Dieses Dokument beschreibt die verschiedenen Konfigurationsmethoden und verfügbaren Einstellungen.

## Konfigurationsschichten

Die Konfiguration wird in der folgenden Rangfolge angewendet (niedrigere Zahlen werden durch höhere Zahlen überschrieben):

| Ebene | Konfigurationsquelle   | Beschreibung                                                                     |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1     | Standardwerte          | Fest codierte Vorgaben innerhalb der Anwendung                                  |
| 2     | System-Standardeinstellungsdatei | Systemweite Standardeinstellungen, die durch andere Einstellungsdateien überschrieben werden können |
| 3     | Benutzereinstellungsdatei | Globale Einstellungen für den aktuellen Benutzer                                |
| 4     | Projekteinstellungsdatei | Projektspezifische Einstellungen                                                |
| 5     | Systemeinstellungsdatei | Systemweite Einstellungen, die alle anderen Einstellungsdateien überschreiben   |
| 6     | Umgebungsvariablen     | Systemweit oder pro Sitzung spezifische Variablen, möglicherweise aus `.env`-Dateien geladen |
| 7     | Befehlszeilenargumente | Werte, die beim Starten der CLI übergeben werden                                |

## Einstellungsdateien

Qwen Code verwendet JSON-Einstellungsdateien für persistente Konfigurationen. Es gibt vier Orte für diese Dateien:

| Dateityp              | Speicherort                                                                                                                                                                                                                                                                     | Gültigkeitsbereich                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System-Standardeinstellungen | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>Der Pfad kann mithilfe der Umgebungsvariable `QWEN_CODE_SYSTEM_DEFAULTS_PATH` überschrieben werden. | Stellt eine Basisschicht von systemweiten Standardeinstellungen bereit. Diese Einstellungen haben die niedrigste Priorität und sollen durch Benutzer-, Projekt- oder System-Überschreibungseinstellungen außer Kraft gesetzt werden. |
| Benutzereinstellungen | `~/.qwen/settings.json` (wobei `~` Ihr Home-Verzeichnis ist).                                                                                                                                                                                                                    | Gilt für alle Qwen Code-Sitzungen des aktuellen Benutzers.                                                                                                                                                                |
| Projekteinstellungen  | `.qwen/settings.json` innerhalb des Wurzelverzeichnisses Ihres Projekts.                                                                                                                                                                                                          | Gilt nur, wenn Qwen Code aus diesem spezifischen Projekt heraus ausgeführt wird. Projekteinstellungen überschreiben Benutzereinstellungen.                                                                                   |
| Systemeinstellungen   | Linux: `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>Der Pfad kann mithilfe der Umgebungsvariable `QWEN_CODE_SYSTEM_SETTINGS_PATH` überschrieben werden.                   | Gilt für alle Qwen Code-Sitzungen auf dem System für alle Benutzer. Systemeinstellungen überschreiben Benutzer- und Projekteinstellungen. Kann für Systemadministratoren in Unternehmen nützlich sein, um Kontrolle über die Qwen Code-Konfigurationen der Benutzer zu haben. |

> [!note]
>
> **Hinweis zu Umgebungsvariablen in Einstellungen:** Zeichenkettenwerte innerhalb Ihrer `settings.json`-Dateien können Umgebungsvariablen entweder mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren. Diese Variablen werden beim Laden der Einstellungen automatisch aufgelöst. Wenn Sie beispielsweise eine Umgebungsvariable `MY_API_TOKEN` haben, könnten Sie sie in `settings.json` wie folgt verwenden: `"apiKey": "$MY_API_TOKEN"`.

### Das `.qwen` Verzeichnis in Ihrem Projekt

Zusätzlich zu einer Projekteinstellungsdatei kann das `.qwen` Verzeichnis eines Projekts andere projekt-spezifische Dateien enthalten, die sich auf den Betrieb von Qwen Code beziehen, wie zum Beispiel:

- [Benutzerdefinierte Sandbox-Profile](../features/sandbox) (z.B. `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).
- [Agent Skills](../features/skills) (experimentell) unter `.qwen/skills/` (jeder Skill ist ein Verzeichnis, das eine `SKILL.md` enthält).

### Verfügbare Einstellungen in `settings.json`

Einstellungen sind in Kategorien organisiert. Alle Einstellungen sollten innerhalb ihres entsprechenden Kategorie-Objekts der obersten Ebene in Ihrer `settings.json` Datei platziert werden.

#### Allgemein

| Einstellung                     | Typ     | Beschreibung                                                                                               | Standard    |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor`       | string  | Der bevorzugte Editor zum Öffnen von Dateien.                                                              | `undefined` |
| `general.vimMode`               | boolean | Vim-Tastenkürzel aktivieren.                                                                               | `false`     |
| `general.disableAutoUpdate`     | boolean | Automatische Updates deaktivieren.                                                                         | `false`     |
| `general.disableUpdateNag`      | boolean | Hinweise auf verfügbare Updates deaktivieren.                                                              | `false`     |
| `general.gitCoAuthor`           | boolean | Automatisch einen Co-authored-by-Eintrag zu Git-Commit-Nachrichten hinzufügen, wenn Commits über Qwen Code erstellt werden. | `true`      |
| `general.checkpointing.enabled` | boolean | Sitzungs-Checkpointing für die Wiederherstellung aktivieren.                                               | `false`     |

#### output

| Einstellung     | Typ    | Beschreibung                  | Standard | Mögliche Werte     |
| --------------- | ------ | ----------------------------- | -------- | ------------------ |
| `output.format` | string | Das Format der CLI-Ausgabe.   | `"text"` | `"text"`, `"json"` |

#### ui

| Einstellung                              | Typ              | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                        | Standard    |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ui.theme`                               | string           | Das Farbthema für die Benutzeroberfläche. Siehe [Themes](../configuration/themes) für verfügbare Optionen.                                                                                                                                                                                                                                                                                                           | `undefined` |
| `ui.customThemes`                        | object           | Definitionen benutzerdefinierter Themen.                                                                                                                                                                                                                                                                                                                                                                            | `{}`        |
| `ui.hideWindowTitle`                     | boolean          | Die Titelleiste des Fensters ausblenden.                                                                                                                                                                                                                                                                                                                                                                            | `false`     |
| `ui.hideTips`                            | boolean          | Hilfreiche Tipps in der Benutzeroberfläche ausblenden.                                                                                                                                                                                                                                                                                                                                                              | `false`     |
| `ui.hideBanner`                          | boolean          | Den Anwendungsbanner ausblenden.                                                                                                                                                                                                                                                                                                                                                                                    | `false`     |
| `ui.hideFooter`                          | boolean          | Die Fußzeile aus der Benutzeroberfläche ausblenden.                                                                                                                                                                                                                                                                                                                                                                 | `false`     |
| `ui.showMemoryUsage`                     | boolean          | Speichernutzungsinformationen in der Benutzeroberfläche anzeigen.                                                                                                                                                                                                                                                                                                                                                  | `false`     |
| `ui.showLineNumbers`                     | boolean          | Zeilennummern in Codeblöcken in der CLI-Ausgabe anzeigen.                                                                                                                                                                                                                                                                                                                                                           | `true`      |
| `ui.showCitations`                       | boolean          | Zitate für generierten Text im Chat anzeigen.                                                                                                                                                                                                                                                                                                                                                                       | `true`      |
| `enableWelcomeBack`                      | boolean          | Willkommensdialog beim Zurückkehren zu einem Projekt mit Gesprächsverlauf anzeigen. Wenn aktiviert, erkennt Qwen Code automatisch, ob Sie zu einem Projekt mit einer zuvor generierten Projekts Zusammenfassung (`.qwen/PROJECT_SUMMARY.md`) zurückkehren, und zeigt einen Dialog an, mit dem Sie Ihr vorheriges Gespräch fortsetzen oder neu beginnen können. Diese Funktion arbeitet zusammen mit dem Befehl `/summary` und dem Bestätigungsdialog beim Beenden. | `true`      |
| `ui.accessibility.disableLoadingPhrases` | boolean          | Ladevorgänge für Barrierefreiheit deaktivieren.                                                                                                                                                                                                                                                                                                                                                                     | `false`     |
| `ui.accessibility.screenReader`          | boolean          | Aktiviert den Screenreader-Modus, welcher die TUI für eine bessere Kompatibilität mit Screenreadern anpasst.                                                                                                                                                                                                                                                                                                          | `false`     |
| `ui.customWittyPhrases`                  | array of strings | Eine Liste benutzerdefinierter Phrasen, die während Ladezuständen angezeigt werden sollen. Wenn angegeben, durchläuft die CLI diese Phrasen anstatt der Standardphrasen.                                                                                                                                                                                                                                              | `[]`        |

#### ide

| Einstellung        | Typ     | Beschreibung                                           | Standardwert |
| ------------------ | ------- | ------------------------------------------------------ | ------------ |
| `ide.enabled`      | boolean | Aktiviert den IDE-Integrationsmodus.                   | `false`      |
| `ide.hasSeenNudge` | boolean | Zeigt an, ob der Benutzer den Hinweis zur IDE-Integration gesehen hat. | `false`      |

#### privacy

| Einstellung                        | Typ     | Beschreibung                                | Standardwert |
| ---------------------------------- | ------- | ------------------------------------------- | ------------ |
| `privacy.usageStatisticsEnabled`   | boolean | Aktiviert die Erfassung von Nutzungsstatistiken. | `true`       |

#### model

| Einstellung                                        | Typ     | Beschreibung                                                                                                                                                                                                                                                                                                                                                             | Standard    |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `model.name`                                       | string  | Das Qwen-Modell, das für Gespräche verwendet werden soll.                                                                                                                                                                                                                                                                                                                | `undefined` |
| `model.maxSessionTurns`                            | number  | Maximale Anzahl von Benutzer/Modell/Werkzeug-Aufrunden, die in einer Sitzung gespeichert bleiben sollen. -1 bedeutet unbegrenzt.                                                                                                                                                                                                                                         | `-1`        |
| `model.summarizeToolOutput`                        | object  | Aktiviert oder deaktiviert die Zusammenfassung der Werkzeugausgabe. Sie können das Token-Budget für die Zusammenfassung mit der Einstellung `tokenBudget` festlegen. Hinweis: Derzeit wird nur das Werkzeug `run_shell_command` unterstützt. Zum Beispiel `{"run_shell_command": {"tokenBudget": 2000}}`                                                              | `undefined` |
| `model.generationConfig`                           | object  | Erweiterte Überschreibungen, die an den zugrunde liegenden Inhaltsgenerator übergeben werden. Unterstützt Anfragesteuerungen wie `timeout`, `maxRetries`, `disableCacheControl` und `customHeaders` (benutzerdefinierte HTTP-Header für API-Anfragen) sowie Feineinstellungen unter `samplingParams` (zum Beispiel `temperature`, `top_p`, `max_tokens`). Leer lassen, um auf die Standardwerte des Providers zu vertrauen. | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | Legt den Schwellenwert für die Komprimierung des Chatverlaufs als Prozentsatz des Gesamttokenlimits des Modells fest. Dies ist ein Wert zwischen 0 und 1, der sowohl für die automatische Komprimierung als auch für den manuellen Befehl `/compress` gilt. Ein Wert von `0.6` löst beispielsweise eine Komprimierung aus, wenn der Chatverlauf 60 % des Tokenlimits überschreitet. Verwenden Sie `0`, um die Komprimierung vollständig zu deaktivieren. | `0.7`       |
| `model.skipNextSpeakerCheck`                       | boolean | Überspringt die nächste Sprecherprüfung.                                                                                                                                                                                                                                                                                                                                 | `false`     |
| `model.skipLoopDetection`                          | boolean | Deaktiviert die Schleifenerkennungsprüfungen. Die Schleifenerkennung verhindert Endlosschleifen in KI-Antworten, kann jedoch Fehlalarme erzeugen, die legitime Arbeitsabläufe unterbrechen. Aktivieren Sie diese Option, wenn Sie häufige Fehlalarme bei der Schleifenerkennung erleben.                                                                                                 | `false`     |
| `model.skipStartupContext`                         | boolean | Überspringt das Senden des Startarbeitsbereichskontexts (Umgebungszusammenfassung und Bestätigung) am Anfang jeder Sitzung. Aktivieren Sie dies, wenn Sie den Kontext manuell bereitstellen möchten oder Tokens beim Start sparen wollen.                                                                                                                                      | `false`     |
| `model.enableOpenAILogging`                        | boolean | Aktiviert die Protokollierung von OpenAI-API-Aufrufen zur Fehlerbehebung und Analyse. Wenn aktiviert, werden API-Anfragen und -Antworten in JSON-Dateien protokolliert.                                                                                                                                                                                                | `false`     |
| `model.openAILoggingDir`                           | string  | Benutzerdefinierter Verzeichnispfad für OpenAI-API-Protokolle. Falls nicht angegeben, wird standardmäßig `logs/openai` im aktuellen Arbeitsverzeichnis verwendet. Unterstützt absolute Pfade, relative Pfade (relativ zum aktuellen Arbeitsverzeichnis aufgelöst) und `~`-Erweiterung (Home-Verzeichnis).                                                            | `undefined` |

**Beispiel model.generationConfig:**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "disableCacheControl": false,
      "customHeaders": {
        "X-Request-ID": "req-123",
        "X-User-ID": "user-456"
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

Das Feld `customHeaders` ermöglicht es Ihnen, benutzerdefinierte HTTP-Header zu allen API-Anfragen hinzuzufügen. Dies ist nützlich für Request-Tracing, Monitoring, API-Gateway-Routing oder wenn verschiedene Modelle unterschiedliche Header benötigen. Wenn `customHeaders` in `modelProviders[].generationConfig.customHeaders` definiert ist, wird es direkt verwendet; andernfalls werden Header aus `model.generationConfig.customHeaders` verwendet. Zwischen den beiden Ebenen erfolgt keine Zusammenführung.

**model.openAILoggingDir Beispiele:**

- `"~/qwen-logs"` - Protokolliert in das Verzeichnis `~/qwen-logs`
- `"./custom-logs"` - Protokolliert in `./custom-logs` relativ zum aktuellen Verzeichnis
- `"/tmp/openai-logs"` - Protokolliert in den absoluten Pfad `/tmp/openai-logs`

#### modelProviders

Verwenden Sie `modelProviders`, um kuratierte Modelllisten pro Authentifizierungstyp zu deklarieren, zwischen denen der `/model`-Auswahlmodus wechseln kann. Die Schlüssel müssen gültige Authentifizierungstypen sein (`openai`, `anthropic`, `gemini`, `vertex-ai`, usw.). Jeder Eintrag erfordert eine `id` und **muss `envKey` enthalten**, optional können `name`, `description`, `baseUrl` und `generationConfig` angegeben werden. Anmeldedaten werden niemals in den Einstellungen gespeichert; die Laufzeit liest sie aus `process.env[envKey]`. Qwen-OAuth-Modelle sind fest codiert und können nicht überschrieben werden.

##### Beispiel

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "customHeaders": {
            "X-Model-Version": "v1.0",
            "X-Request-Priority": "high"
          },
          "samplingParams": { "temperature": 0.2 }
        }
      }
    ],
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ],
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ]
  }
}
```

> [!note]
> Nur der Befehl `/model` unterstützt Nicht-Standard-Authentifizierungstypen. Anthropic, Gemini, Vertex AI usw. müssen über `modelProviders` definiert werden. Der Befehl `/auth` listet absichtlich nur die integrierten Qwen-OAuth- und OpenAI-Flows auf.

##### Auflösungsschichten und Atomarität

Die effektiven Werte für Authentifizierung/Modell/Credentials werden pro Feld nach folgender Rangfolge ausgewählt (zuerst vorhanden gewinnt). Sie können `--auth-type` mit `--model` kombinieren, um direkt auf einen Anbietereintrag zu verweisen; diese CLI-Flags werden vor anderen Schichten ausgeführt.

| Schicht (höchste → niedrigste) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatische Überschreibungen | `/auth `                            | `/auth` Eingabe                                   | `/auth` Eingabe                                       | `/auth` Eingabe                                        | —                      | —                                 |
| Modellanbieter-Auswahl           | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI-Argumente                    | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (oder anbieterspezifische Äquivalente) | `--openaiBaseUrl` (oder anbieterspezifische Äquivalente) | —                      | —                                 |
| Umgebungsvariablen               | —                                   | Anbieterspezifisches Mapping (z.B. `OPENAI_MODEL`) | Anbieterspezifisches Mapping (z.B. `OPENAI_API_KEY`)   | Anbieterspezifisches Mapping (z.B. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Einstellungen (`settings.json`)  | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Standard / berechnet             | Fallback auf `AuthType.QWEN_OAUTH` | Integrierter Standard (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` falls konfiguriert |

\*Wenn vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmen `security.auth.selectedType` oder der implizite Standard den Authentifizierungstyp. Qwen OAuth und OpenAI sind die einzigen Authentifizierungstypen, die ohne zusätzliche Konfiguration angezeigt werden.

Vom Modellanbieter stammende Werte werden atomar angewendet: Sobald ein Anbietermodell aktiv ist, wird jedes von ihm definierte Feld vor niedrigeren Schichten geschützt, bis Sie die Credentials manuell über `/auth` löschen. Die endgültige `generationConfig` ist die Projektion über alle Schichten hinweg – niedrigere Schichten füllen nur Lücken, die von höheren Schichten übrig bleiben, und die Anbieterschicht bleibt unveränderlich.

Die Merge-Strategie für `modelProviders` ist ERSETZEN: Der gesamte `modelProviders`-Abschnitt aus den Projekteinstellungen überschreibt den entsprechenden Abschnitt in den Benutzereinstellungen, anstatt beide zusammenzuführen.

##### Schichtung der Generierungskonfiguration

Pro-Feld-Rangfolge für `generationConfig`:

1. Programmatische Überschreibungen (z. B. Laufzeitänderungen von `/model`, `/auth`)
2. `modelProviders[authType][].generationConfig`
3. `settings.model.generationConfig`
4. Standardwerte des Inhaltsgenerators (`getDefaultGenerationConfig` für OpenAI, `getParameterValue` für Gemini usw.)

`samplingParams` und `customHeaders` werden beide atomar behandelt; Anbietewerte ersetzen das gesamte Objekt. Wenn `modelProviders[].generationConfig` diese Felder definiert, werden sie direkt verwendet; andernfalls werden Werte aus `model.generationConfig` verwendet. Zwischen Anbieter- und globalen Konfigurationsstufen erfolgt keine Zusammenführung. Standards des Inhaltsgenerators werden zuletzt angewendet, sodass jeder Anbieter seine optimierte Baseline beibehält.

##### Auswahlpersistenz und Empfehlungen

> [!important]
> Definieren Sie `modelProviders` nach Möglichkeit im benutzerspezifischen `~/.qwen/settings.json` und vermeiden Sie das Speichern von Anmeldeinformationen in beliebigen Bereichen. Das Festhalten des Anbieterkatalogs in den Benutzereinstellungen verhindert Merge-/Überschreibekonflikte zwischen Projekt- und Benutzerbereich und stellt sicher, dass `/auth` und `/model`-Aktualisierungen immer in einen konsistenten Bereich geschrieben werden.

- `/model` und `/auth` speichern `model.name` (wenn zutreffend) und `security.auth.selectedType` im nächstgelegenen beschreibbaren Bereich, der bereits `modelProviders` definiert; andernfalls greifen sie auf den Benutzerbereich zurück. Dadurch bleiben Arbeitsbereichs-/Benutzerdateien mit dem aktiven Anbieterkatalog synchronisiert.
- Ohne `modelProviders` mischt der Resolver CLI-/Umgebungs-/Einstellungsebenen, was für Einzelanbieter-Konfigurationen in Ordnung ist, aber umständlich wird, wenn häufig gewechselt wird. Definieren Sie Anbieterkataloge immer dann, wenn Mehrfachmodell-Workflows üblich sind, damit Wechsel atomar, quellenbezogen und debuggbar bleiben.

#### Kontext

| Einstellung                                         | Typ                        | Beschreibung                                                                                                                                                                                                                                                                                                                                                          | Standard    |
| --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName`                                  | string oder Array von Strings | Der Name der Kontextdatei(en).                                                                                                                                                                                                                                                                                                                                        | `undefined` |
| `context.importFormat`                              | string                     | Das Format, das beim Importieren von Speicher verwendet werden soll.                                                                                                                                                                                                                                                                                                  | `undefined` |
| `context.discoveryMaxDirs`                          | number                     | Maximale Anzahl an Verzeichnissen, in denen nach Speicher gesucht wird.                                                                                                                                                                                                                                                                                               | `200`       |
| `context.includeDirectories`                        | array                      | Zusätzliche Verzeichnisse, die in den Arbeitsbereichskontext einbezogen werden sollen. Gibt ein Array zusätzlicher absoluter oder relativer Pfade an, die in den Arbeitsbereichskontext einbezogen werden sollen. Fehlende Verzeichnisse werden standardmäßig mit einer Warnung übersprungen. Pfade können `~` verwenden, um auf das Home-Verzeichnis des Benutzers zu verweisen. Diese Einstellung kann mit dem Befehlszeilenflag `--include-directories` kombiniert werden. | `[]`        |
| `context.loadFromIncludeDirectories`                | boolean                    | Steuert das Verhalten des Befehls `/memory refresh`. Wenn auf `true` gesetzt, sollten `QWEN.md`-Dateien aus allen hinzugefügten Verzeichnissen geladen werden. Wenn auf `false` gesetzt, sollte `QWEN.md` nur aus dem aktuellen Verzeichnis geladen werden.                                                                                                    | `false`     |
| `context.fileFiltering.respectGitIgnore`            | boolean                    | Berücksichtigt .gitignore-Dateien bei der Suche.                                                                                                                                                                                                                                                                                                                      | `true`      |
| `context.fileFiltering.respectQwenIgnore`           | boolean                    | Berücksichtigt .qwenignore-Dateien bei der Suche.                                                                                                                                                                                                                                                                                                                     | `true`      |
| `context.fileFiltering.enableRecursiveFileSearch`   | boolean                    | Ob die rekursive Suche nach Dateinamen unterhalb des aktuellen Baums aktiviert werden soll, wenn `@`-Präfixe im Prompt vervollständigt werden.                                                                                                                                                                                                                         | `true`      |
| `context.fileFiltering.disableFuzzySearch`          | boolean                    | Wenn `true`, werden die Fuzzy-Suchfunktionen bei der Dateisuche deaktiviert, was die Leistung in Projekten mit einer großen Anzahl von Dateien verbessern kann.                                                                                                                                                                                                       | `false`     |

#### Problembehandlung bei der Dateisuchleistung

Wenn Sie Leistungsprobleme bei der Dateisuche haben (z. B. bei `@`-Vervollständigungen), insbesondere in Projekten mit einer sehr großen Anzahl von Dateien, können Sie folgende Maßnahmen in der empfohlenen Reihenfolge ausprobieren:

1. **Verwenden Sie `.qwenignore`:** Erstellen Sie eine `.qwenignore`-Datei im Stammverzeichnis Ihres Projekts, um Verzeichnisse auszuschließen, die viele Dateien enthalten, auf die Sie nicht zugreifen müssen (z. B. Build-Artefakte, Protokolle, `node_modules`). Die Reduzierung der Gesamtanzahl durchsuchter Dateien ist die effektivste Methode, um die Leistung zu verbessern.
2. **Deaktivieren Sie die unscharfe Suche:** Falls das Ignorieren von Dateien nicht ausreicht, können Sie die unscharfe Suche deaktivieren, indem Sie `disableFuzzySearch` in Ihrer `settings.json`-Datei auf `true` setzen. Dadurch wird ein einfacheres, nicht-unscharfes Übereinstimmungsalgorithmus verwendet, was schneller sein kann.
3. **Deaktivieren Sie die rekursive Dateisuche:** Als letzte Möglichkeit können Sie die rekursive Dateisuche vollständig deaktivieren, indem Sie `enableRecursiveFileSearch` auf `false` setzen. Dies ist die schnellste Option, da sie einen rekursiven Durchlauf Ihres Projekts vermeidet. Allerdings müssen Sie dann beim Verwenden von `@`-Vervollständigungen den vollständigen Pfad zu den Dateien eingeben.

#### tools

| Einstellung                          | Typ               | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Standard    | Hinweise                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools.sandbox`                      | boolean oder string | Sandbox-Ausführungsumgebung (kann ein Boolean oder ein Pfad-String sein).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `undefined` |                                                                                                                                                                                                                                                        |
| `tools.shell.enableInteractiveShell` | boolean           | Verwenden Sie `node-pty` für eine interaktive Shell-Erfahrung. Der Fallback auf `child_process` gilt weiterhin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |                                                                                                                                                                                                                                                        |
| `tools.core`                         | Array von Strings | Dies kann verwendet werden, um die Menge der integrierten Tools mit einer Positivliste einzuschränken. Sie können auch toolspezifische Einschränkungen für Tools angeben, die dies unterstützen, wie das `run_shell_command`-Tool. Zum Beispiel erlaubt `"tools.core": ["run_shell_command(ls -l)"]` nur die Ausführung des Befehls `ls -l`.                                                                                                                                                                                                                                                                                                            | `undefined` |                                                                                                                                                                                                                                                        |
| `tools.exclude`                      | Array von Strings | Tool-Namen, die von der Erkennung ausgeschlossen werden sollen. Sie können auch toolspezifische Einschränkungen für Tools angeben, die dies unterstützen, wie das `run_shell_command`-Tool. Zum Beispiel wird `"tools.exclude": ["run_shell_command(rm -rf)"]` den Befehl `rm -rf` blockieren. **Sicherheitshinweis:** Toolspezifische Einschränkungen in `tools.exclude` für `run_shell_command` basieren auf einfacher String-Übereinstimmung und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und sollte nicht als sicher angesehen werden, um nicht vertrauenswürdigen Code auszuführen. Es wird empfohlen, `tools.core` zu verwenden, um explizit ausführbare Befehle auszuwählen. | `undefined` |                                                                                                                                                                                                                                                        |
| `tools.allowed`                      | Array von Strings | Eine Liste von Tool-Namen, die den Bestätigungsdialog umgehen. Dies ist nützlich für Tools, denen Sie vertrauen und die Sie häufig verwenden. Zum Beispiel überspringt `["run_shell_command(git)", "run_shell_command(npm test)"]` den Bestätigungsdialog zum Ausführen beliebiger `git`- und `npm test`-Befehle.                                                                                                                                                                                                                                                                                                                                                                                               | `undefined` |                                                                                                                                                                                                                                                        |
| `tools.approvalMode`                 | string            | Legt den Standard-Bestätigungsmodus für die Tool-Nutzung fest.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `default`   | Mögliche Werte: `plan` (nur Analyse, keine Dateiänderungen oder Befehlsausführungen), `default` (Bestätigung erforderlich vor Dateiänderungen oder Shell-Befehlen), `auto-edit` (Dateiänderungen automatisch genehmigen), `yolo` (alle Tool-Aufrufe automatisch genehmigen) |
| `tools.discoveryCommand`             | string            | Befehl zur Ausführung der Tool-Erkennung.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `undefined` |                                                                                                                                                                                                                                                        |
| `tools.callCommand`                  | string            | Definiert einen benutzerdefinierten Shell-Befehl zum Aufruf eines bestimmten Tools, das mit `tools.discoveryCommand` entdeckt wurde. Der Shell-Befehl muss folgende Kriterien erfüllen: Er muss den Funktionsnamen (genau wie in der [Funktionsdeklaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) als erstes Kommandozeilenargument übernehmen. Er muss Funktionsargumente als JSON über `stdin` lesen, analog zu [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall). Er muss die Funktionsausgabe als JSON über `stdout` zurückgeben, analog zu [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse). | `undefined` |                                                                                                                                                                                                                                                        |
| `tools.useRipgrep`                   | boolean           | Verwenden Sie ripgrep für die Suche im Dateiinhalt anstelle der Fallback-Implementierung. Bietet schnellere Suchleistung.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `true`      |                                                                                                                                                                                                                                                        |
| `tools.useBuiltinRipgrep`            | boolean           | Verwenden Sie das gebündelte ripgrep-Binary. Wenn auf `false` gesetzt, wird stattdessen der systemweite `rg`-Befehl verwendet. Diese Einstellung ist nur wirksam, wenn `tools.useRipgrep` auf `true` gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `true`      |                                                                                                                                                                                                                                                        |
| `tools.enableToolOutputTruncation`   | boolean           | Aktiviert die Kürzung großer Tool-Ausgaben.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `true`      | Erfordert Neustart: Ja                                                                                                                                                                                                                                |
| `tools.truncateToolOutputThreshold`  | number            | Kürzt die Tool-Ausgabe, wenn sie größer als diese Anzahl an Zeichen ist. Gilt für Shell-, Grep-, Glob-, ReadFile- und ReadManyFiles-Tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `25000`     | Erfordert Neustart: Ja                                                                                                                                                                                                                                |
| `tools.truncateToolOutputLines`      | number            | Maximale Anzahl an Zeilen oder Einträgen, die beim Kürzen der Tool-Ausgabe erhalten bleiben. Gilt für Shell-, Grep-, Glob-, ReadFile- und ReadManyFiles-Tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `1000`      | Erfordert Neustart: Ja                                                                                                                                                                                                                                |
| `tools.autoAccept`                   | boolean           | Steuert, ob die CLI automatisch Tool-Aufrufe akzeptiert und ausführt, die als sicher gelten (z.B. Nur-Lese-Operationen), ohne explizitige Benutzerbestätigung. Wenn auf `true` gesetzt, wird die CLI die Bestätigungsabfrage für als sicher eingestufte Tools umgehen.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `false`     |                                                                                                                                                                                                                                                        |
| `tools.experimental.skills`          | boolean           | Aktiviert die experimentelle Agent Skills-Funktion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `false`     |                                                                                                                                                                                                                                                        |

#### mcp

| Einstellung         | Typ              | Beschreibung                                                                                                                                                                                                                                                                 | Standard    |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | Befehl zum Starten eines MCP-Servers.                                                                                                                                                                                                                                        | `undefined` |
| `mcp.allowed`       | Array von Strings | Eine Positivliste von MCP-Servern, die erlaubt sind. Erlaubt Ihnen, eine Liste von MCP-Servernamen anzugeben, die dem Modell zur Verfügung stehen sollen. Dies kann verwendet werden, um den Satz der zu verbindenden MCP-Server einzuschränken. Beachten Sie, dass dies ignoriert wird, wenn `--allowed-mcp-server-names` gesetzt ist. | `undefined` |
| `mcp.excluded`      | Array von Strings | Eine Negativliste von MCP-Servern, die ausgeschlossen werden sollen. Ein Server, der sowohl in `mcp.excluded` als auch in `mcp.allowed` aufgeführt ist, wird ausgeschlossen. Beachten Sie, dass dies ignoriert wird, wenn `--allowed-mcp-server-names` gesetzt ist.                                                              | `undefined` |

> [!note]
>
> **Sicherheitshinweis für MCP-Server:** Diese Einstellungen verwenden einfache String-Übereinstimmung bei MCP-Servernamen, die geändert werden können. Wenn Sie als Systemadministrator Benutzer daran hindern möchten, diese zu umgehen, erwägen Sie, die `mcpServers` auf der Systemeinstellungsebene zu konfigurieren, sodass der Benutzer keine eigenen MCP-Server konfigurieren kann. Dies sollte nicht als vollständiger Sicherheitsmechanismus verwendet werden.

#### Sicherheit

| Einstellung                      | Typ     | Beschreibung                                                | Standardwert |
| -------------------------------- | ------- | ----------------------------------------------------------- | ------------ |
| `security.folderTrust.enabled`   | boolean | Einstellung zur Verfolgung, ob der Ordnervertrauensmodus aktiviert ist. | `false`      |
| `security.auth.selectedType`     | string  | Der aktuell ausgewählte Authentifizierungstyp.              | `undefined`  |
| `security.auth.enforcedType`     | string  | Der erforderliche Authentifizierungstyp (nützlich für Unternehmen). | `undefined`  |
| `security.auth.useExternal`      | boolean | Gibt an, ob ein externer Authentifizierungsfluss verwendet werden soll. | `undefined`  |

#### Erweitert

| Einstellung                      | Typ              | Beschreibung                                                                                                                                                                                                                                                                                                                       | Standard                 |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory`   | boolean          | Konfiguriert automatisch die Speicherlimits für Node.js.                                                                                                                                                                                                                                                                           | `false`                  |
| `advanced.dnsResolutionOrder`    | string           | Die Reihenfolge der DNS-Auflösung.                                                                                                                                                                                                                                                                                                 | `undefined`              |
| `advanced.excludedEnvVars`       | array of strings | Umgebungsvariablen, die aus dem Projekt-Kontext ausgeschlossen werden sollen. Gibt Umgebungsvariablen an, die nicht aus den `.env`-Dateien des Projekts geladen werden sollen. Dadurch wird verhindert, dass projektspezifische Umgebungsvariablen (wie `DEBUG=true`) das Verhalten der CLI beeinflussen. Variablen aus `.qwen/.env`-Dateien sind niemals ausgeschlossen. | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`            | object           | Konfiguration für den Befehl zum Melden von Fehlern. Überschreibt die Standard-URL für den `/bug`-Befehl. Eigenschaften: `urlTemplate` (string): Eine URL, die die Platzhalter `{title}` und `{info}` enthalten kann. Beispiel: `"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                       | `undefined`              |
| `advanced.tavilyApiKey`          | string           | API-Schlüssel für den Tavily-Websuchdienst. Wird verwendet, um die Funktionalität des `web_search`-Tools zu aktivieren.                                                                                                                                                                                                             | `undefined`              |

> [!note]
>
> **Hinweis zu advanced.tavilyApiKey:** Dies ist ein veraltetes Konfigurationsformat. Für Qwen-OAuth-Benutzer steht der DashScope-Anbieter automatisch ohne weitere Konfiguration zur Verfügung. Für andere Authentifizierungstypen konfigurieren Sie Tavily oder Google-Anbieter mit dem neuen `webSearch`-Konfigurationsformat.

#### mcpServers

Konfiguriert Verbindungen zu einem oder mehreren Model-Context Protocol (MCP)-Servern zum Entdecken und Nutzen benutzerdefinierter Tools. Qwen Code versucht, eine Verbindung zu jedem konfigurierten MCP-Server herzustellen, um verfügbare Tools zu entdecken. Wenn mehrere MCP-Server ein Tool mit demselben Namen bereitstellen, werden die Toolnamen mit dem Server-Alias präfixiert, den Sie in der Konfiguration definiert haben (z.B. `serverAlias__actualToolName`), um Konflikte zu vermeiden. Beachten Sie, dass das System bestimmte Schema-Eigenschaften aus MCP-Tool-Definitionen zur Kompatibilität entfernen kann. Mindestens eines von `command`, `url` oder `httpUrl` muss angegeben werden. Wenn mehrere angegeben sind, ist die Prioritätsreihenfolge `httpUrl`, dann `url`, dann `command`.

| Eigenschaft                             | Typ              | Beschreibung                                                                                                                                                                                                                                                       | Optional |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`      | string           | Der Befehl, der ausgeführt werden soll, um den MCP-Server über Standard-I/O zu starten.                                                                                                                                                                           | Ja       |
| `mcpServers.<SERVER_NAME>.args`         | Array von Strings| Argumente, die an den Befehl übergeben werden sollen.                                                                                                                                                                                                              | Ja       |
| `mcpServers.<SERVER_NAME>.env`          | Objekt           | Umgebungsvariablen, die für den Server-Prozess gesetzt werden sollen.                                                                                                                                                                                              | Ja       |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | Das Arbeitsverzeichnis, in dem der Server gestartet werden soll.                                                                                                                                                                                                   | Ja       |
| `mcpServers.<SERVER_NAME>.url`          | string           | Die URL eines MCP-Servers, der Server-Sent Events (SSE) für die Kommunikation verwendet.                                                                                                                                                                           | Ja       |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | Die URL eines MCP-Servers, der streamfähiges HTTP für die Kommunikation verwendet.                                                                                                                                                                                  | Ja       |
| `mcpServers.<SERVER_NAME>.headers`      | Objekt           | Eine Zuordnung von HTTP-Headern, die mit Anfragen an `url` oder `httpUrl` gesendet werden sollen.                                                                                                                                                                 | Ja       |
| `mcpServers.<SERVER_NAME>.timeout`      | Zahl             | Timeout in Millisekunden für Anfragen an diesen MCP-Server.                                                                                                                                                                                                        | Ja       |
| `mcpServers.<SERVER_NAME>.trust`        | Boolean          | Diesem Server vertrauen und alle Bestätigungen für Tool-Aufrufe umgehen.                                                                                                                                                                                            | Ja       |
| `mcpServers.<SERVER_NAME>.description`  | string           | Eine kurze Beschreibung des Servers, die für Anzeigezwecke verwendet werden kann.                                                                                                                                                                                    | Ja       |
| `mcpServers.<SERVER_NAME>.includeTools` | Array von Strings| Liste von Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools von diesem Server verfügbar (Verhalten wie einer Positivliste). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert. | Ja       |
| `mcpServers.<SERVER_NAME>.excludeTools` | Array von Strings| Liste von Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Hier aufgelistete Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn sich ein Tool in beiden Listen befindet, wird es ausgeschlossen. | Ja       |

#### telemetry

Konfiguriert das Logging und die Metrik-Erfassung für Qwen Code. Weitere Informationen finden Sie unter [Telemetrie](/developers/development/telemetry).

| Einstellung              | Typ     | Beschreibung                                                                     | Standardwert |
| ------------------------ | ------- | -------------------------------------------------------------------------------- | ------------ |
| `telemetry.enabled`      | boolean | Gibt an, ob Telemetrie aktiviert ist.                                            |              |
| `telemetry.target`       | string  | Das Ziel für die gesammelte Telemetrie. Unterstützte Werte sind `local` und `gcp`. |              |
| `telemetry.otlpEndpoint` | string  | Der Endpunkt für den OTLP-Exporter.                                              |              |
| `telemetry.otlpProtocol` | string  | Das Protokoll für den OTLP-Exporter (`grpc` oder `http`).                        |              |
| `telemetry.logPrompts`   | boolean | Gibt an, ob der Inhalt der Benutzer-Prompts in die Logs aufgenommen werden soll. |              |
| `telemetry.outfile`      | string  | Die Datei, in die die Telemetriedaten geschrieben werden, wenn `target` auf `local` gesetzt ist. |              |
| `telemetry.useCollector` | boolean | Gibt an, ob ein externer OTLP-Collector verwendet werden soll.                   |              |

### Beispiel `settings.json`

Hier ist ein Beispiel für eine `settings.json`-Datei mit der verschachtelten Struktur, neu ab Version 0.3.0:

```
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideBanner": true,
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
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
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

Die CLI speichert einen Verlauf der Shell-Befehle, die Sie ausführen. Um Konflikte zwischen verschiedenen Projekten zu vermeiden, wird dieser Verlauf in einem projektspezifischen Verzeichnis innerhalb des Home-Ordners Ihres Benutzers gespeichert.

- **Speicherort:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` ist eine eindeutige Kennung, die aus dem Stammverzeichnis Ihres Projekts generiert wird.
  - Der Verlauf wird in einer Datei mit dem Namen `shell_history` gespeichert.

## Umgebungsvariablen und `.env`-Dateien

Umgebungsvariablen sind ein üblicher Weg, um Anwendungen zu konfigurieren, insbesondere für sensible Informationen (wie Token) oder für Einstellungen, die sich zwischen verschiedenen Umgebungen ändern können.

Qwen Code kann Umgebungsvariablen automatisch aus `.env`-Dateien laden.
Informationen zu authentifizierungsbezogenen Variablen (wie `OPENAI_*`) und dem empfohlenen Ansatz mit `.qwen/.env` finden Sie unter **[Authentifizierung](../configuration/auth)**.

> [!tip]
>
> **Ausschluss von Umgebungsvariablen:** Einige Umgebungsvariablen (wie `DEBUG` und `DEBUG_MODE`) werden standardmäßig automatisch aus Projekt-`.env`-Dateien ausgeschlossen, um eine Beeinträchtigung des CLI-Verhaltens zu verhindern. Variablen aus `.qwen/.env`-Dateien werden niemals ausgeschlossen. Sie können dieses Verhalten über die Einstellung `advanced.excludedEnvVars` in Ihrer `settings.json`-Datei anpassen.

### Tabelle der Umgebungsvariablen

| Variable                         | Beschreibung                                                                                                                                           | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_TELEMETRY_ENABLED`       | Auf `true` oder `1` setzen, um Telemetrie zu aktivieren. Jeder andere Wert wird als Deaktivierung behandelt.                                           | Überschreibt die Einstellung `telemetry.enabled`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GEMINI_TELEMETRY_TARGET`        | Legt das Telemetrie-Ziel fest (`local` oder `gcp`).                                                                                                    | Überschreibt die Einstellung `telemetry.target`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GEMINI_TELEMETRY_OTLP_ENDPOINT` | Legt den OTLP-Endpunkt für die Telemetrie fest.                                                                                                        | Überschreibt die Einstellung `telemetry.otlpEndpoint`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GEMINI_TELEMETRY_OTLP_PROTOCOL` | Legt das OTLP-Protokoll fest (`grpc` oder `http`).                                                                                                     | Überschreibt die Einstellung `telemetry.otlpProtocol`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GEMINI_TELEMETRY_LOG_PROMPTS`   | Auf `true` oder `1` setzen, um das Protokollieren von Benutzer-Prompts zu aktivieren oder deaktivieren. Jeder andere Wert wird als Deaktivierung behandelt. | Überschreibt die Einstellung `telemetry.logPrompts`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GEMINI_TELEMETRY_OUTFILE`       | Legt den Dateipfad fest, in den die Telemetriedaten geschrieben werden sollen, wenn das Ziel `local` ist.                                              | Überschreibt die Einstellung `telemetry.outfile`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GEMINI_TELEMETRY_USE_COLLECTOR` | Auf `true` oder `1` setzen, um die Verwendung eines externen OTLP-Sammlers zu aktivieren oder deaktivieren. Jeder andere Wert wird als Deaktivierung behandelt. | Überschreibt die Einstellung `telemetry.useCollector`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GEMINI_SANDBOX`                 | Alternative zur `sandbox`-Einstellung in `settings.json`.                                                                                              | Akzeptiert `true`, `false`, `docker`, `podman` oder einen benutzerdefinierten Befehlsstring.                                                                                                                                                                                                                                                                                                                                                                                        |
| `SEATBELT_PROFILE`               | (macOS-spezifisch) Wechselt das Seatbelt (`sandbox-exec`)-Profil unter macOS.                                                                          | `permissive-open`: (Standard) Beschränkt Schreibvorgänge auf den Projektordner (und einige wenige andere Ordner, siehe `packages/cli/src/utils/sandbox-macos-permissive-open.sb`), erlaubt aber andere Operationen. `strict`: Verwendet ein strenges Profil, das Operationen standardmäßig ablehnt. `<profil_name>`: Verwendet ein benutzerdefiniertes Profil. Um ein benutzerdefiniertes Profil zu definieren, erstellen Sie eine Datei mit dem Namen `sandbox-macos-<profil_name>.sb` im `.qwen/`-Verzeichnis Ihres Projekts (z.B. `mein-projekt/.qwen/sandbox-macos-custom.sb`). |
| `DEBUG` oder `DEBUG_MODE`        | (häufig von zugrunde liegenden Bibliotheken oder der CLI selbst verwendet) Auf `true` oder `1` setzen, um ausführliche Debug-Protokollierung zu aktivieren, was bei der Fehlerbehebung hilfreich sein kann. | **Hinweis:** Diese Variablen sind standardmäßig von Projekt-`.env`-Dateien ausgeschlossen, um Störungen mit dem CLI-Verhalten zu verhindern. Verwenden Sie `.qwen/.env`-Dateien, wenn Sie diese speziell für Qwen Code setzen müssen.                                                                                                                                                                                                 |
| `NO_COLOR`                       | Auf einen beliebigen Wert setzen, um alle Farbausgaben in der CLI zu deaktivieren.                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CLI_TITLE`                      | Auf einen String setzen, um den Titel der CLI anzupassen.                                                                                              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`           | Gibt den Endpunkt für den Code-Assist-Server an.                                                                                                       | Dies ist nützlich für Entwicklung und Tests.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `TAVILY_API_KEY`                 | Ihr API-Schlüssel für den Tavily-Websuchdienst.                                                                                                        | Wird verwendet, um die Funktionalität des `web_search`-Tools zu aktivieren. Beispiel: `export TAVILY_API_KEY="tvly-ihr-api-schlüssel-hier"`                                                                                                                                                                                                                                                                                                                                      |

## Befehlszeilenargumente

Argumente, die direkt beim Ausführen der CLI übergeben werden, können andere Konfigurationen für diese spezifische Sitzung überschreiben.

### Befehlszeilenargumente-Tabelle

| Argument                     | Alias | Beschreibung                                                                                                                                                                              | Mögliche Werte                         | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | Gibt das Qwen-Modell an, das für diese Sitzung verwendet werden soll.                                                                                                                     | Modellname                             | Beispiel: `npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--prompt`                   | `-p`  | Wird verwendet, um eine Eingabeaufforderung direkt an den Befehl zu übergeben. Dadurch wird Qwen Code im nicht-interaktiven Modus aufgerufen.                                              | Ihr Prompt-Text                        | Verwenden Sie für Skriptbeispiele das Flag `--output-format json`, um strukturierte Ausgabe zu erhalten.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--prompt-interactive`       | `-i`  | Startet eine interaktive Sitzung mit dem bereitgestellten Prompt als Initialwert.                                                                                                         | Ihr Prompt-Text                        | Der Prompt wird innerhalb der interaktiven Sitzung verarbeitet, nicht davor. Kann nicht verwendet werden, wenn die Eingabe über stdin geleitet wird. Beispiel: `qwen -i "erkläre diesen Code"`                                                                                                                                                                                                                                                                                                                                                                   |
| `--output-format`            | `-o`  | Gibt das Format der CLI-Ausgabe für den nicht-interaktiven Modus an.                                                                                                                      | `text`, `json`, `stream-json`          | `text`: (Standard) Die übliche menschenlesbare Ausgabe. `json`: Eine maschinenlesbare JSON-Ausgabe, die am Ende der Ausführung ausgegeben wird. `stream-json`: Streamende JSON-Nachrichten, die während der Ausführung ausgegeben werden. Für strukturierte Ausgabe und Skripte verwenden Sie das Flag `--output-format json` oder `--output-format stream-json`. Siehe [Headless-Modus](../features/headless) für detaillierte Informationen. |
| `--input-format`             |       | Gibt das Format an, das von der Standardeingabe konsumiert wird.                                                                                                                          | `text`, `stream-json`                  | `text`: (Standard) Standard-Texteingabe von stdin oder Befehlszeilenargumenten. `stream-json`: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation. Voraussetzung: `--input-format stream-json` erfordert, dass `--output-format stream-json` gesetzt ist. Bei Verwendung von `stream-json` ist stdin für Protokollnachrichten reserviert. Siehe [Headless-Modus](../features/headless) für detaillierte Informationen.                                  |
| `--include-partial-messages` |       | Schließt teilweise Assistentennachrichten ein, wenn das Ausgabeformat `stream-json` verwendet wird. Wenn aktiviert, werden Stream-Ereignisse (message_start, content_block_delta usw.) während des Streamings ausgegeben.                            |                                        | Standard: `false`. Voraussetzung: Erfordert, dass `--output-format stream-json` gesetzt ist. Siehe [Headless-Modus](../features/headless) für detaillierte Informationen zu Stream-Ereignissen.                                                                                                                                                                                                                                                                                                                                                                   |
| `--sandbox`                  | `-s`  | Aktiviert den Sandbox-Modus für diese Sitzung.                                                                                                                                            |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--sandbox-image`            |       | Setzt die URI des Sandbox-Images.                                                                                                                                                         |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--debug`                    | `-d`  | Aktiviert den Debug-Modus für diese Sitzung und liefert eine ausführlichere Ausgabe.                                                                                                     |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--all-files`                | `-a`  | Falls gesetzt, werden rekursiv alle Dateien innerhalb des aktuellen Verzeichnisses als Kontext für den Prompt eingeschlossen.                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--help`                     | `-h`  | Zeigt Hilfegrundlagen zu den Befehlszeilenargumenten an.                                                                                                                                 |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--show-memory-usage`        |       | Zeigt die aktuelle Speichernutzung an.                                                                                                                                                    |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--yolo`                     |       | Aktiviert den YOLO-Modus, bei dem automatisch alle Tool-Aufrufe genehmigt werden.                                                                                                        |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--approval-mode`            |       | Legt den Genehmigungsmodus für Tool-Aufrufe fest.                                                                                                                                         | `plan`, `default`, `auto-edit`, `yolo` | Unterstützte Modi: `plan`: Nur Analyse – keine Dateiänderungen oder Befehlsausführungen. `default`: Erfordert Genehmigung für Dateiänderungen oder Shell-Befehle (Standardverhalten). `auto-edit`: Genehmigt Änderungstools (edit, write_file) automatisch, fragt aber bei anderen nach. `yolo`: Genehmigt alle Tool-Aufrufe automatisch (äquivalent zu `--yolo`). Kann nicht zusammen mit `--yolo` verwendet werden. Verwenden Sie `--approval-mode=yolo` statt `--yolo` für den neuen vereinheitlichten Ansatz. Beispiel: `qwen --approval-mode auto-edit`<br>Weitere Informationen unter [Genehmigungsmodus](../features/approval-mode). |
| `--allowed-tools`            |       | Eine durch Kommas getrennte Liste von Toolnamen, die den Bestätigungsdialog umgehen.                                                                                                      | Toolnamen                              | Beispiel: `qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--telemetry`                |       | Aktiviert [Telemetrie](/developers/development/telemetry).                                                                                                                                |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-target`         |       | Legt das Telemetrie-Ziel fest.                                                                                                                                                            |                                        | Siehe [Telemetrie](/developers/development/telemetry) für weitere Informationen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--telemetry-otlp-endpoint`  |       | Legt den OTLP-Endpunkt für die Telemetrie fest.                                                                                                                                           |                                        | Siehe [Telemetrie](../../developers/development/telemetry) für weitere Informationen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--telemetry-otlp-protocol`  |       | Legt das OTLP-Protokoll für die Telemetrie fest (`grpc` oder `http`).                                                                                                                     |                                        | Standard ist `grpc`. Siehe [Telemetrie](../../developers/development/telemetry) für weitere Informationen.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--telemetry-log-prompts`    |       | Aktiviert die Protokollierung von Prompts für die Telemetrie.                                                                                                                             |                                        | Siehe [Telemetrie](../../developers/development/telemetry) für weitere Informationen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--checkpointing`            |       | Aktiviert [Checkpointing](../features/checkpointing).                                                                                                                                     |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--acp`                      |       | Aktiviert den ACP-Modus (Agent Client Protocol). Nützlich für IDE-/Editor-Integrationen wie [Zed](../integration-zed).                                                                    |                                        | Stabil. Ersetzt das veraltete Flag `--experimental-acp`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--experimental-skills`      |       | Aktiviert experimentelle [Agent Skills](../features/skills) (registriert das `skill`-Tool und lädt Skills aus `.qwen/skills/` und `~/.qwen/skills/`).                                    |                                        | Experimentell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--extensions`               | `-e`  | Gibt eine Liste von Erweiterungen an, die für die Sitzung verwendet werden sollen.                                                                                                        | Erweiterungsnamen                      | Falls nicht angegeben, werden alle verfügbaren Erweiterungen verwendet. Verwenden Sie den speziellen Begriff `qwen -e none`, um alle Erweiterungen zu deaktivieren. Beispiel: `qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                        |
| `--list-extensions`          | `-l`  | Listet alle verfügbaren Erweiterungen auf und beendet das Programm.                                                                                                                       |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--proxy`                    |       | Legt den Proxy für die CLI fest.                                                                                                                                                          | Proxy-URL                              | Beispiel: `--proxy http://localhost:7890`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--include-directories`      |       | Schließt zusätzliche Verzeichnisse in den Arbeitsbereich ein, um Multi-Verzeichnis-Unterstützung zu bieten.                                                                              | Verzeichnispfade                       | Kann mehrfach angegeben oder als kommagetrennte Werte übergeben werden. Maximal 5 Verzeichnisse können hinzugefügt werden. Beispiel: `--include-directories /pfad/zu/projekt1,/pfad/zu/projekt2` oder `--include-directories /pfad/zu/projekt1 --include-directories /pfad/zu/projekt2`                                                                                                                                                                                                                      |
| `--screen-reader`            |       | Aktiviert den Screenreader-Modus, der die TUI für bessere Kompatibilität mit Screenreadern anpasst.                                                                                       |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--version`                  |       | Zeigt die Version der CLI an.                                                                                                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--openai-logging`           |       | Aktiviert die Protokollierung von OpenAI-API-Aufrufen zur Fehlerbehebung und Analyse.                                                                                                     |                                        | Dieses Flag überschreibt die Einstellung `enableOpenAILogging` in `settings.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--openai-logging-dir`       |       | Legt einen benutzerdefinierten Verzeichnispfad für OpenAI-API-Protokolle fest.                                                                                                            | Verzeichnispfad                        | Dieses Flag überschreibt die Einstellung `openAILoggingDir` in `settings.json`. Unterstützt absolute Pfade, relative Pfade und `~`-Erweiterung. Beispiel: `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                             |
| `--tavily-api-key`           |       | Legt den Tavily-API-Schlüssel für die Websuche-Funktionalität für diese Sitzung fest.                                                                                                     | API-Schlüssel                          | Beispiel: `qwen --tavily-api-key tvly-ihr-api-schlüssel-hier`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Kontextdateien (hierarchischer instruktiver Kontext)

Obwohl dies nicht strikt eine Konfiguration für das Verhalten der CLI ist, sind Kontextdateien (standardmäßig `QWEN.md`, aber konfigurierbar über die Einstellung `context.fileName`) entscheidend für die Konfiguration des instruktiven Kontexts (auch als „Speicher“ bezeichnet). Diese leistungsstarke Funktion ermöglicht es Ihnen, projektspezifische Anweisungen, Kodierungsstile oder sonstige relevante Hintergrundinformationen an die KI zu übergeben, wodurch deren Antworten besser auf Ihre Bedürfnisse zugeschnitten und genauer werden. Die CLI enthält Benutzeroberflächenelemente, wie beispielsweise einen Indikator in der Fußzeile, der die Anzahl der geladenen Kontextdateien anzeigt, um Sie über den aktiven Kontext zu informieren.

- **Zweck:** Diese Markdown-Dateien enthalten Anweisungen, Richtlinien oder Kontext, von dem Sie möchten, dass das Qwen-Modell ihn während Ihrer Interaktionen berücksichtigt. Das System ist so ausgelegt, diesen instruktiven Kontext hierarchisch zu verwalten.

### Beispiel für Kontextdatei-Inhalt (z. B. `QWEN.md`)

Hier ist ein konzeptionelles Beispiel dafür, was eine Kontextdatei im Stammverzeichnis eines TypeScript-Projekts enthalten könnte:

```

# Projekt: Meine fantastische TypeScript-Bibliothek

## Allgemeine Anweisungen:
- Beim Generieren von neuem TypeScript-Code bitte den bestehenden Codierstil beachten.
- Sicherstellen, dass alle neuen Funktionen und Klassen JSDoc-Kommentare haben.
- Wo angebracht, funktionale Programmierparadigmen bevorzugen.
- Der gesamte Code sollte mit TypeScript 5.0 und Node.js 20+ kompatibel sein.

## Codierstil:
- 2 Leerzeichen für Einrückung verwenden.
- Schnittstellennamen sollten mit `I` beginnen (z. B. `IUserService`).
- Private Klassenmember sollten mit einem Unterstrich (`_`) beginnen.
- Immer strikte Gleichheit verwenden (`===` und `!==`).

## Spezifische Komponente: `src/api/client.ts`
- Diese Datei behandelt alle ausgehenden API-Anfragen.
- Beim Hinzufügen neuer API-Aufruffunktionen sicherstellen, dass sie robuste Fehlerbehandlung und Protokollierung enthalten.
- Für alle GET-Anfragen das vorhandene `fetchWithRetry`-Hilfsmittel verwenden.
```

## Bezüglich Abhängigkeiten:
- Vermeiden Sie die Einführung neuer externer Abhängigkeiten, es sei denn, sie sind absolut notwendig.
- Falls eine neue Abhängigkeit erforderlich ist, geben Sie bitte den Grund an.
```

Dieses Beispiel zeigt, wie Sie allgemeinen Projekt-Kontext, spezifische Kodierungsrichtlinien und sogar Hinweise zu bestimmten Dateien oder Komponenten bereitstellen können. Je relevanter und präziser Ihre Kontextdateien sind, desto besser kann die KI Ihnen helfen. Kontextdateien auf Projektebene werden dringend empfohlen, um Konventionen und Kontext festzulegen.

- **Hierarchisches Laden und Priorisierung:** Die CLI implementiert ein ausgeklügeltes hierarchisches Speichersystem durch das Laden von Kontextdateien (z.B. `QWEN.md`) aus mehreren Orten. Inhalte aus Dateien weiter unten in dieser Liste (spezifischer) überschreiben oder ergänzen typischerweise Inhalte aus Dateien weiter oben (allgemeiner). Die genaue Zusammenfügungsreihenfolge und der endgültige Kontext können mit dem Befehl `/memory show` eingesehen werden. Die typische Lade-Reihenfolge ist:
  1. **Globale Kontextdatei:**
     - Ort: `~/.qwen/<konfigurierte-kontext-dateiname>` (z.B. `~/.qwen/QWEN.md` in Ihrem Benutzerverzeichnis).
     - Geltungsbereich: Stellt Standardanweisungen für alle Ihre Projekte bereit.
  2. **Projekt-Stamm- und übergeordnete Kontextdateien:**
     - Ort: Die CLI sucht nach der konfigurierten Kontextdatei im aktuellen Arbeitsverzeichnis und dann in jedem übergeordneten Verzeichnis bis zum Projektstamm (identifiziert durch einen `.git`-Ordner) oder Ihrem Home-Verzeichnis.
     - Geltungsbereich: Stellt Kontext bereit, der für das gesamte Projekt oder einen bedeutenden Teil davon relevant ist.
  3. **Unterverzeichnis-Kontextdateien (kontextuell/lokal):**
     - Ort: Die CLI scannt auch nach der konfigurierten Kontextdatei in Unterverzeichnissen _unterhalb_ des aktuellen Arbeitsverzeichnisses (unter Beachtung gängiger Ignoriermuster wie `node_modules`, `.git` usw.). Die Breite dieser Suche ist standardmäßig auf 200 Verzeichnisse begrenzt, kann aber über die Einstellung `context.discoveryMaxDirs` in Ihrer `settings.json`-Datei konfiguriert werden.
     - Geltungsbereich: Erlaubt sehr spezifische Anweisungen, die für eine bestimmte Komponente, ein Modul oder einen Abschnitt Ihres Projekts relevant sind.
- **Zusammenfügung & UI-Anzeige:** Die Inhalte aller gefundenen Kontextdateien werden zusammengeführt (mit Trennzeichen, die ihren Ursprung und Pfad anzeigen) und als Teil des System-Prompts bereitgestellt. Die CLI-Fußzeile zeigt die Anzahl der geladenen Kontextdateien an und gibt Ihnen so einen schnellen visuellen Hinweis auf den aktiven instruktionalen Kontext.
- **Inhalte importieren:** Sie können Ihre Kontextdateien modularisieren, indem Sie andere Markdown-Dateien mit der Syntax `@pfad/zu/datei.md` importieren. Weitere Details finden Sie in der [Memory Import Processor Dokumentation](../configuration/memory).
- **Befehle zur Speicherverwaltung:**
  - Verwenden Sie `/memory refresh`, um einen erneuten Scan und Neuladen aller Kontextdateien aus allen konfigurierten Orten zu erzwingen. Dadurch wird der instruktionelle Kontext der KI aktualisiert.
  - Verwenden Sie `/memory show`, um den aktuell geladenen kombinierten instruktionellen Kontext anzuzeigen, sodass Sie die Hierarchie und die von der KI verwendeten Inhalte überprüfen können.
  - Siehe [Befehlsdokumentation](../features/commands) für vollständige Details zum `/memory`-Befehl und seinen Unterbefehlen (`show` und `refresh`).

Durch das Verständnis und die Nutzung dieser Konfigurationsschichten sowie der hierarchischen Natur der Kontextdateien können Sie den Speicher der KI effektiv verwalten und die Antworten von Qwen Code an Ihre spezifischen Anforderungen und Projekte anpassen.

## Sandbox

Qwen Code kann potenziell unsichere Operationen (wie Shell-Befehle und Dateiänderungen) innerhalb einer isolierten Umgebung ausführen, um Ihr System zu schützen.

Die [Sandbox](../features/sandbox) ist standardmäßig deaktiviert, kann aber auf verschiedene Weisen aktiviert werden:

- Verwendung des `--sandbox` oder `-s` Flags.
- Setzen der `GEMINI_SANDBOX` Umgebungsvariable.
- Die Sandbox ist standardmäßig aktiviert, wenn `--yolo` oder `--approval-mode=yolo` verwendet wird.

Standardmäßig wird ein vorgefertigtes `qwen-code-sandbox` Docker-Image verwendet.

Für projektspezifische Sandbox-Anforderungen können Sie eine benutzerdefinierte Dockerfile unter `.qwen/sandbox.Dockerfile` im Stammverzeichnis Ihres Projekts erstellen. Diese Dockerfile kann auf dem Basis-Sandbox-Image basieren:

```
FROM qwen-code-sandbox

# Fügen Sie hier Ihre benutzerdefinierten Abhängigkeiten oder Konfigurationen hinzu

# Zum Beispiel:

# RUN apt-get update && apt-get install -y some-package

# COPY ./my-config /app/my-config
```

Wenn `.qwen/sandbox.Dockerfile` existiert, können Sie die Umgebungsvariable `BUILD_SANDBOX` verwenden, wenn Sie Qwen Code ausführen, um automatisch das benutzerdefinierte Sandbox-Image zu erstellen:

```
BUILD_SANDBOX=1 qwen -s
```

## Nutzungsstatistiken

Um uns bei der Verbesserung von Qwen Code zu helfen, sammeln wir anonymisierte Nutzungsstatistiken. Diese Daten helfen uns zu verstehen, wie die CLI verwendet wird, häufige Probleme zu identifizieren und neue Funktionen zu priorisieren.

**Was wir sammeln:**

- **Tool-Aufrufe:** Wir protokollieren die Namen der aufgerufenen Tools, ob sie erfolgreich waren oder fehlschlugen, und wie lange die Ausführung dauerte. Wir erfassen nicht die Argumente, die an die Tools übergeben wurden, oder Daten, die von ihnen zurückgegeben wurden.
- **API-Anfragen:** Wir protokollieren das Modell, das für jede Anfrage verwendet wurde, die Dauer der Anfrage und ob sie erfolgreich war. Wir erfassen nicht den Inhalt der Prompts oder Antworten.
- **Sitzungsinformationen:** Wir sammeln Informationen über die Konfiguration der CLI, wie z.B. die aktivierten Tools und den Genehmigungsmodus.

**Was wir NICHT sammeln:**

- **Personenbezogene Daten (PII):** Wir erfassen keine persönlichen Informationen wie Ihren Namen, Ihre E-Mail-Adresse oder API-Schlüssel.
- **Inhalt von Prompts und Antworten:** Wir protokollieren nicht den Inhalt Ihrer Prompts oder die Antworten des Modells.
- **Dateiinhalte:** Wir protokollieren nicht den Inhalt von Dateien, die von der CLI gelesen oder geschrieben werden.

**So deaktivieren Sie die Erfassung:**

Sie können die Erfassung von Nutzungsstatistiken jederzeit deaktivieren, indem Sie die Eigenschaft `usageStatisticsEnabled` in der Kategorie `privacy` Ihrer Datei `settings.json` auf `false` setzen:

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> Wenn Nutzungsstatistiken aktiviert sind, werden Ereignisse an einen Alibaba Cloud RUM-Erfassungsendpunkt gesendet.