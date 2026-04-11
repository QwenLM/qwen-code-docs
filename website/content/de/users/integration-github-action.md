# GitHub Actions: qwen-code-action

## Übersicht

`qwen-code-action` ist eine GitHub Action, die [Qwen Code] über die [Qwen Code CLI] in deinen Entwicklungs-Workflow integriert. Sie fungiert sowohl als autonomer Agent für wichtige Routine-Coding-Aufgaben als auch als bedarfsgesteuerter Mitarbeiter, an den du Aufgaben schnell delegieren kannst.

Nutze sie, um GitHub Pull-Request-Reviews durchzuführen, Issues zu triagieren, Code-Analysen und -Modifikationen vorzunehmen und mehr – alles konversationell mit [Qwen Code] (z. B. `@qwencoder fix this issue`) direkt in deinen GitHub-Repositories.

## Funktionen

- **Automatisierung**: Löse Workflows basierend auf Events (z. B. Öffnen eines Issues) oder Zeitplänen (z. B. nächtlich) aus.
- **Bedarfsgesteuerte Zusammenarbeit**: Löse Workflows in Issue- und Pull-Request-Kommentaren aus, indem du die [Qwen Code CLI](./features/commands) erwähnst (z. B. `@qwencoder /review`).
- **Erweiterbar mit Tools**: Nutze die Tool-Calling-Fähigkeiten der [Qwen Code](../developers/tools/introduction.md)-Modelle, um mit anderen CLIs wie der [GitHub CLI] (`gh`) zu interagieren.
- **Anpassbar**: Verwende eine `QWEN.md`-Datei in deinem Repository, um der [Qwen Code CLI](./features/commands) projektspezifische Anweisungen und Kontext bereitzustellen.

## Schnellstart

Starte in wenigen Minuten mit der Qwen Code CLI in deinem Repository:

### 1. Qwen API Key besorgen

Beziehe deinen API Key von [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (der KI-Plattform von Alibaba Cloud).

### 2. Als GitHub Secret hinzufügen

Speichere deinen API Key als Secret mit dem Namen `QWEN_API_KEY` in deinem Repository:

- Gehe zu **Settings > Secrets and variables > Actions** deines Repositories
- Klicke auf **New repository secret**
- Name: `QWEN_API_KEY`, Value: dein API Key

### 3. Deine .gitignore aktualisieren

Füge die folgenden Einträge zu deiner `.gitignore`-Datei hinzu:

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. Workflow auswählen

Du hast zwei Möglichkeiten, einen Workflow einzurichten:

**Option A: Setup-Befehl verwenden (Empfohlen)**

1. Starte die Qwen Code CLI in deinem Terminal:

   ```shell
   qwen
   ```

2. Gib in der Qwen Code CLI in deinem Terminal Folgendes ein:

   ```
   /setup-github
   ```

**Option B: Workflows manuell kopieren**

1. Kopiere die vorgefertigten Workflows aus dem Verzeichnis [`examples/workflows`](./common-workflow) in das Verzeichnis `.github/workflows` deines Repositories. Hinweis: Der Workflow `qwen-dispatch.yml` muss ebenfalls kopiert werden, da er die Ausführung der anderen Workflows auslöst.

### 5. Ausprobieren

**Pull-Request-Review:**

- Öffne einen Pull Request in deinem Repository und warte auf das automatische Review
- Kommentiere einen bestehenden Pull Request mit `@qwencoder /review`, um ein Review manuell auszulösen

**Issue-Triage:**

- Erstelle ein Issue und warte auf die automatische Triage
- Kommentiere bestehende Issues mit `@qwencoder /triage`, um die Triage manuell auszulösen

**Allgemeine KI-Unterstützung:**

- Erwähne in einem beliebigen Issue oder Pull Request `@qwencoder`, gefolgt von deiner Anfrage
- Beispiele:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflows

Diese Action bietet mehrere vorgefertigte Workflows für verschiedene Anwendungsfälle. Jeder Workflow ist darauf ausgelegt, in das Verzeichnis `.github/workflows` deines Repositories kopiert und bei Bedarf angepasst zu werden.

### Qwen Code Dispatch

Dieser Workflow fungiert als zentraler Dispatcher für die Qwen Code CLI und leitet Anfragen basierend auf dem auslösenden Event und dem im Kommentar angegebenen Befehl an den entsprechenden Workflow weiter. Eine detaillierte Anleitung zur Einrichtung des Dispatch-Workflows findest du in der [Qwen Code Dispatch Workflow-Dokumentation](./common-workflow).

### Issue Triage

Diese Action kann verwendet werden, um GitHub Issues automatisch oder nach Zeitplan zu triagieren. Eine detaillierte Anleitung zur Einrichtung des Issue-Triage-Systems findest du in der [GitHub Issue Triage Workflow-Dokumentation](./examples/workflows/issue-triage).

### Pull Request Review

Diese Action kann verwendet werden, um Pull Requests automatisch zu reviewen, sobald sie geöffnet werden. Eine detaillierte Anleitung zur Einrichtung des Pull-Request-Review-Systems findest du in der [GitHub PR Review Workflow-Dokumentation](./common-workflow).

### Qwen Code CLI Assistant

Dieser Action-Typ kann verwendet werden, um einen allgemeinen, konversationellen Qwen Code KI-Assistenten innerhalb von Pull Requests und Issues aufzurufen, um eine Vielzahl von Aufgaben zu erledigen. Eine detaillierte Anleitung zur Einrichtung des allgemeinen Qwen Code CLI Workflows findest du in der [Qwen Code Assistant Workflow-Dokumentation](./common-workflow).

## Konfiguration

### Inputs

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)* Der API Key für die Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, Standard: `latest`)* Die zu installierende Version der Qwen Code CLI. Kann "latest", "preview", "nightly", eine spezifische Versionsnummer oder ein Git-Branch, -Tag oder -Commit sein. Weitere Informationen findest du unter [Qwen Code CLI Releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)* Aktiviert Debug-Logging und Output-Streaming.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)* Das Modell, das mit Qwen Code verwendet werden soll.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, Standard: `You are a helpful assistant.`)_ Ein String, der an das [`--prompt`-Argument](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) der Qwen Code CLI übergeben wird.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ Ein JSON-String, der in `.qwen/settings.json` geschrieben wird, um die _Projekt_-Einstellungen der CLI zu konfigurieren.
  Weitere Details findest du in der Dokumentation zu [Einstellungsdateien](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, Standard: `false`)* Gibt an, ob Code Assist für den Zugriff auf Qwen Code-Modelle anstelle des standardmäßigen Qwen Code API Keys verwendet werden soll.
  Weitere Informationen findest du in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, Standard: `false`)* Gibt an, ob Vertex AI für den Zugriff auf Qwen Code-Modelle anstelle des standardmäßigen Qwen Code API Keys verwendet werden soll.
  Weitere Informationen findest du in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ Eine Liste der zu installierenden Qwen Code CLI-Erweiterungen.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, Standard: `false`)* Gibt an, ob Artefakte in die GitHub Action hochgeladen werden sollen.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, Standard: `false`)* Gibt an, ob pnpm anstelle von npm zur Installation von qwen-code-cli verwendet werden soll.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, Standard: `${{ github.workflow }}`)* Der Name des GitHub Workflows, der für Telemetrie-Zwecke verwendet wird.

<!-- END_AUTOGEN_INPUTS -->

### Outputs

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Die zusammengefasste Ausgabe der Qwen Code CLI-Ausführung.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Die Fehlerausgabe der Qwen Code CLI-Ausführung, falls vorhanden.

<!-- END_AUTOGEN_OUTPUTS -->

### Repository-Variablen

Wir empfehlen, die folgenden Werte als Repository-Variablen festzulegen, damit sie in allen Workflows wiederverwendet werden können. Alternativ kannst du sie inline als Action-Inputs in einzelnen Workflows festlegen, um Werte auf Repository-Ebene zu überschreiben.

| Name               | Beschreibung                                                | Typ      | Erforderlich | Wann erforderlich             |
| ------------------ | ----------------------------------------------------------- | -------- | ------------ | ----------------------------- |
| `DEBUG`            | Aktiviert Debug-Logging für die Qwen Code CLI.              | Variable | Nein         | Nie                           |
| `QWEN_CLI_VERSION` | Steuert, welche Version der Qwen Code CLI installiert wird. | Variable | Nein         | Pinning der CLI-Version       |
| `APP_ID`           | GitHub App ID für benutzerdefinierte Authentifizierung.     | Variable | Nein         | Verwendung einer benutzerdefinierten GitHub App |

So fügst du eine Repository-Variable hinzu:

1. Gehe zu **Settings > Secrets and variables > Actions > New variable** deines Repositories.
2. Gib den Variablennamen und den Wert ein.
3. Speichere die Änderungen.

Details zu Repository-Variablen findest du in der [GitHub-Dokumentation zu Variablen][variables].

### Secrets

Du kannst die folgenden Secrets in deinem Repository festlegen:

| Name              | Beschreibung                                    | Erforderlich | Wann erforderlich                              |
| ----------------- | ----------------------------------------------- | ------------ | ---------------------------------------------- |
| `QWEN_API_KEY`    | Dein Qwen API Key von DashScope.                | Ja           | Erforderlich für alle Workflows, die Qwen aufrufen. |
| `APP_PRIVATE_KEY` | Privater Schlüssel für deine GitHub App (PEM-Format). | Nein         | Verwendung einer benutzerdefinierten GitHub App.   |

So fügst du ein Secret hinzu:

1. Gehe zu **Settings > Secrets and variables > Actions > New repository secret** deines Repositories.
2. Gib den Secret-Namen und den Wert ein.
3. Speichere die Änderungen.

Weitere Informationen findest du in der [offiziellen GitHub-Dokumentation zum Erstellen und Verwenden verschlüsselter Secrets][secrets].

## Authentifizierung

Diese Action erfordert eine Authentifizierung gegenüber der GitHub API und optional gegenüber den Qwen Code-Diensten.

### GitHub-Authentifizierung

Du kannst dich auf zwei Arten bei GitHub authentifizieren:

1. **Standard-`GITHUB_TOKEN`:** Für einfachere Anwendungsfälle kann die Action das vom Workflow bereitgestellte Standard-`GITHUB_TOKEN` verwenden.
2. **Benutzerdefinierte GitHub App (Empfohlen):** Für die sicherste und flexibelste Authentifizierung empfehlen wir, eine benutzerdefinierte GitHub App zu erstellen.

Detaillierte Anleitungen zur Einrichtung der Authentifizierung für Qwen und GitHub findest du in der [**Authentifizierungsdokumentation**](./configuration/auth).

## Erweiterungen

Die Qwen Code CLI kann durch Erweiterungen um zusätzliche Funktionen erweitert werden. Diese Erweiterungen werden aus dem Quellcode ihrer GitHub-Repositories installiert.

Detaillierte Anleitungen zur Einrichtung und Konfiguration von Erweiterungen findest du in der [Erweiterungsdokumentation](../developers/extensions/extension).

## Best Practices

Um die Sicherheit, Zuverlässigkeit und Effizienz deiner automatisierten Workflows zu gewährleisten, empfehlen wir dringend, unsere Best Practices zu befolgen. Diese Richtlinien decken Schlüsselbereiche wie Repository-Sicherheit, Workflow-Konfiguration und Monitoring ab.

Zu den wichtigsten Empfehlungen gehören:

- **Sicherung deines Repositories:** Implementierung von Branch- und Tag-Schutz sowie Einschränkung von Pull-Request-Approvern.
- **Monitoring und Auditing:** Regelmäßige Überprüfung der Action-Logs und Aktivierung von OpenTelemetry für tiefere Einblicke in Performance und Verhalten.

Einen umfassenden Leitfaden zur Sicherung deines Repositories und deiner Workflows findest du in unserer [**Best Practices-Dokumentation**](./common-workflow).

## Anpassung

Erstelle eine `QWEN.md`-Datei im Root-Verzeichnis deines Repositories, um der [Qwen Code CLI](./common-workflow) projektspezifischen Kontext und Anweisungen bereitzustellen. Dies ist nützlich, um Coding-Konventionen, Architekturmuster oder andere Richtlinien zu definieren, denen das Modell für ein bestimmtes Repository folgen soll.

## Contributing

Beiträge sind willkommen! Wirf einen Blick in den **Contributing Guide** der Qwen Code CLI, um weitere Details zum Einstieg zu erhalten.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context