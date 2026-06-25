# GitHub Actions: qwen-code-action

## Überblick

`qwen-code-action` ist eine GitHub Action, die [Qwen Code] über die [Qwen Code CLI] in Ihren Entwicklungsworkflow integriert. Sie fungiert sowohl als autonomer Agent für kritische Routineaufgaben in der Programmierung als auch als bedarfsorientierter Mitarbeiter, dem Sie schnell Aufgaben delegieren können.

Verwenden Sie sie, um GitHub Pull Requests zu überprüfen, Issues zu kategorisieren, Code-Analysen und -Änderungen durchzuführen und vieles mehr – direkt in Ihren GitHub-Repositories, indem Sie [Qwen Code] konversationell einsetzen (z. B. `@qwencoder behebe dieses Problem`).

## Funktionen

- **Automatisierung**: Workflows basierend auf Ereignissen (z. B. Issue-Erstellung) oder Zeitplänen (z. B. nächtlich) auslösen.
- **Bedarfsorientierte Zusammenarbeit**: Workflows in Issue- und Pull-Request-Kommentaren durch Erwähnung der [Qwen Code CLI](./features/commands) auslösen (z. B. `@qwencoder /review`).
- **Erweiterbar mit Tools**: Nutzen Sie die Tool-Calling-Fähigkeiten der [Qwen Code](../developers/tools/introduction.md)-Modelle, um mit anderen CLIs wie der [GitHub CLI] (`gh`) zu interagieren.
- **Anpassbar**: Verwenden Sie eine `QWEN.md`-Datei in Ihrem Repository, um [Qwen Code CLI](./features/commands) projektspezifische Anweisungen und Kontext zu geben.

## Schnellstart

Richten Sie Qwen Code CLI innerhalb weniger Minuten in Ihrem Repository ein:

### 1. Holen Sie sich einen Qwen API-Schlüssel

Holen Sie Ihren API-Schlüssel von [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (Alibaba Cloud's AI-Plattform).

### 2. Fügen Sie ihn als GitHub Secret hinzu

Speichern Sie Ihren API-Schlüssel als Secret mit dem Namen `QWEN_API_KEY` in Ihrem Repository:

- Gehen Sie zu **Einstellungen > Secrets and variables > Actions** Ihres Repositorys.
- Klicken Sie auf **New repository secret**.
- Name: `QWEN_API_KEY`, Wert: Ihr API-Schlüssel.

### 3. Aktualisieren Sie Ihre .gitignore

Fügen Sie die folgenden Einträge zu Ihrer `.gitignore`-Datei hinzu:

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. Wählen Sie einen Workflow aus

Sie haben zwei Möglichkeiten, einen Workflow einzurichten:

**Option A: Setup-Befehl verwenden (empfohlen)**

1. Starten Sie die Qwen Code CLI in Ihrem Terminal:

   ```shell
   qwen
   ```

2. Geben Sie in der Qwen Code CLI in Ihrem Terminal Folgendes ein:

   ```
   /setup-github
   ```

**Option B: Workflows manuell kopieren**

1. Kopieren Sie die vorgefertigten Workflows aus dem Verzeichnis [`examples/workflows`](./common-workflow) in das Verzeichnis `.github/workflows` Ihres Repositorys. Hinweis: Der Workflow `qwen-dispatch.yml` muss ebenfalls kopiert werden, da er die Ausführung der Workflows auslöst.

### 5. Testen Sie es aus

**Pull-Request-Überprüfung:**

- Öffnen Sie einen Pull Request in Ihrem Repository und warten Sie auf die automatische Überprüfung.
- Kommentieren Sie `@qwencoder /review` in einem vorhandenen Pull Request, um eine manuelle Überprüfung auszulösen.

**Issue-Triage:**

- Öffnen Sie ein Issue und warten Sie auf die automatische Kategorisierung.
- Kommentieren Sie `@qwencoder /triage` in vorhandenen Issues, um manuell eine Kategorisierung auszulösen.

**Allgemeine KI-Unterstützung:**

- Erwähnen Sie in einem Issue oder Pull Request `@qwencoder` gefolgt von Ihrer Anfrage.
- Beispiele:
  - `@qwencoder erkläre diese Codeänderung`
  - `@qwencoder schlage Verbesserungen für diese Funktion vor`
  - `@qwencoder hilf mir, diesen Fehler zu debuggen`
  - `@qwencoder schreibe Unit-Tests für diese Komponente`

## Workflows

Diese Action bietet mehrere vorgefertigte Workflows für verschiedene Anwendungsfälle. Jeder Workflow ist dafür ausgelegt, in das Verzeichnis `.github/workflows` Ihres Repositorys kopiert und nach Bedarf angepasst zu werden.

### Qwen Code Dispatch

Dieser Workflow fungiert als zentraler Verteiler für die Qwen Code CLI und leitet Anfragen basierend auf dem auslösenden Ereignis und dem im Kommentar angegebenen Befehl an den entsprechenden Workflow weiter. Eine detaillierte Anleitung zur Einrichtung des Dispatch-Workflows finden Sie in der [Dokumentation zum Qwen Code Dispatch Workflow](./common-workflow).

### Issue-Triage

Diese Action kann verwendet werden, um GitHub Issues automatisch oder nach einem Zeitplan zu kategorisieren. Ein funktionierendes Issue-Triage-Setup finden Sie im [Workflow zur automatisierten Issue-Kategorisierung](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Pull-Request-Überprüfung

Diese Action kann verwendet werden, um Pull Requests automatisch zu überprüfen, wenn sie geöffnet werden. Eine detaillierte Anleitung zur Einrichtung des Pull-Request-Überprüfungssystems finden Sie in der [Dokumentation zum GitHub PR Review Workflow](./common-workflow).

### Qwen Code CLI Assistent

Diese Art von Action kann verwendet werden, um einen allgemeinen, konversationellen Qwen Code KI-Assistenten in Pull Requests und Issues aufzurufen, der eine Vielzahl von Aufgaben erledigen kann. Eine detaillierte Anleitung zur Einrichtung des allgemeinen Qwen Code CLI Workflows finden Sie in der [Dokumentation zum Qwen Code Assistent Workflow](./common-workflow).

## Konfiguration

### Eingaben

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ Der API-Schlüssel für die Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, Standard: `latest`)\_ Die zu installierende Version der Qwen Code CLI. Kann "latest", "preview", "nightly", eine bestimmte Versionsnummer oder ein Git-Branch, -Tag oder -Commit sein. Weitere Informationen finden Sie unter [Qwen Code CLI Releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).
- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)*\_ Aktiviert Debug-Logging und Streaming der Ausgabe.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)*\_ Das mit Qwen Code zu verwendende Modell.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, Standard: `You are a helpful assistant.`)_ Ein String, der als [`--prompt`-Argument](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) an die Qwen Code CLI übergeben wird.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ Ein JSON-String, der in `.qwen/settings.json` geschrieben wird, um die _Projekt_-Einstellungen der CLI zu konfigurieren.
  Weitere Details finden Sie in der Dokumentation zu [Einstellungsdateien](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, Standard: `false`)*\_ Gibt an, ob Code Assist für den Zugriff auf das Qwen Code-Modell anstelle des standardmäßigen Qwen Code API-Schlüssels verwendet werden soll.
  Weitere Informationen finden Sie in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, Standard: `false`)*\_ Gibt an, ob Vertex AI für den Zugriff auf das Qwen Code-Modell anstelle des standardmäßigen Qwen Code API-Schlüssels verwendet werden soll.
  Weitere Informationen finden Sie in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ Eine Liste von Qwen Code CLI-Erweiterungen, die installiert werden sollen.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, Standard: `false`)*\_ Gibt an, ob Artefakte in die GitHub Action hochgeladen werden sollen.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, Standard: `false`)*\_ Gibt an, ob pnpm anstelle von npm zur Installation von qwen-code-cli verwendet werden soll.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, Standard: `${{ github.workflow }}`)*\_ Der Name des GitHub-Workflows, der zu Telemetriezwecken verwendet wird.

<!-- END_AUTOGEN_INPUTS -->

### Ausgaben

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Die zusammengefasste Ausgabe der Qwen Code CLI-Ausführung.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Die Fehlerausgabe der Qwen Code CLI-Ausführung, falls vorhanden.

<!-- END_AUTOGEN_OUTPUTS -->

### Repository-Variablen

Wir empfehlen, die folgenden Werte als Repository-Variablen festzulegen, damit sie in allen Workflows wiederverwendet werden können. Alternativ können Sie sie als Action-Eingaben in einzelnen Workflows festlegen oder dadurch repository-weite Werte überschreiben.

| Name               | Beschreibung                                              | Typ      | Erforderlich | Wann erforderlich            |
| ------------------ | --------------------------------------------------------- | -------- | ------------ | ---------------------------- |
| `DEBUG`            | Aktiviert Debug-Logging für die Qwen Code CLI.            | Variable | Nein         | Nie                          |
| `QWEN_CLI_VERSION` | Steuert, welche Version der Qwen Code CLI installiert wird. | Variable | Nein         | Zum Festlegen der CLI-Version |
| `APP_ID`           | GitHub App-ID für benutzerdefinierte Authentifizierung.    | Variable | Nein         | Bei Verwendung einer benutzerdefinierten GitHub App |

So fügen Sie eine Repository-Variable hinzu:

1. Gehen Sie zu den **Einstellungen > Secrets and variables > Actions > Neue Variable** Ihres Repositorys.
2. Geben Sie den Variablennamen und den Wert ein.
3. Speichern.

Details zu Repository-Variablen finden Sie in der [GitHub-Dokumentation zu Variablen][variables].

### Secrets

Sie können die folgenden Secrets in Ihrem Repository festlegen:

| Name              | Beschreibung                                    | Erforderlich | Wann erforderlich                       |
| ----------------- | ----------------------------------------------- | ------------ | --------------------------------------- |
| `QWEN_API_KEY`    | Ihr Qwen-API-Schlüssel von DashScope.           | Ja           | Erforderlich für alle Workflows, die Qwen aufrufen. |
| `APP_PRIVATE_KEY` | Privater Schlüssel für Ihre GitHub App (PEM-Format). | Nein         | Bei Verwendung einer benutzerdefinierten GitHub App. |

So fügen Sie ein Secret hinzu:

1. Gehen Sie zu den **Einstellungen > Secrets and variables > Actions > Neues Repository-Secret** Ihres Repositorys.
2. Geben Sie den Secret-Namen und den Wert ein.
3. Speichern.

Weitere Informationen finden Sie in der [offiziellen GitHub-Dokumentation zum Erstellen und Verwenden verschlüsselter Secrets][secrets].
## Authentifizierung

Diese Aktion erfordert eine Authentifizierung gegenüber der GitHub-API und optional gegenüber den Qwen Code-Diensten.

### GitHub-Authentifizierung

Sie können sich auf zwei Arten bei GitHub authentifizieren:

1. **Standardmäßiges `GITHUB_TOKEN`:** Für einfachere Anwendungsfälle kann die Aktion das vom Workflow bereitgestellte Standard-`GITHUB_TOKEN` verwenden.
2. **Benutzerdefinierte GitHub-App (empfohlen):** Für die sicherste und flexibelste Authentifizierung empfehlen wir die Erstellung einer benutzerdefinierten GitHub-App.

Detaillierte Einrichtungsanweisungen für die Qwen- und GitHub-Authentifizierung finden Sie in der [**Authentifizierungsdokumentation**](./configuration/auth).

## Erweiterungen

Die Qwen Code CLI kann durch Erweiterungen mit zusätzlichen Funktionen ausgestattet werden. Diese Erweiterungen werden aus dem Quellcode ihrer GitHub-Repositories installiert.

Detaillierte Anweisungen zum Einrichten und Konfigurieren von Erweiterungen finden Sie in der [Erweiterungsdokumentation](./extension/introduction.md).

## Best Practices

Um die Sicherheit, Zuverlässigkeit und Effizienz Ihrer automatisierten Workflows zu gewährleisten, empfehlen wir dringend, unsere Best Practices zu befolgen. Diese Richtlinien decken wichtige Bereiche wie Repository-Sicherheit, Workflow-Konfiguration und Überwachung ab.

Zu den wichtigsten Empfehlungen gehören:

- **Sicherung Ihres Repositorys:** Implementierung von Branch- und Tag-Schutz sowie Einschränkung der Pull-Request-Genehmiger.
- **Überwachung und Prüfung:** Regelmäßige Überprüfung von Aktionsprotokollen und Aktivierung von OpenTelemetry für tiefere Einblicke in Leistung und Verhalten.

Eine umfassende Anleitung zur Sicherung Ihres Repositorys und Ihrer Workflows finden Sie in unserer [**Best Practices-Dokumentation**](./common-workflow).

## Anpassung

Erstellen Sie eine QWEN.md-Datei im Stammverzeichnis Ihres Repositorys, um projektspezifischen Kontext und Anweisungen für die [Qwen Code CLI](./common-workflow) bereitzustellen. Dies ist nützlich, um Codierungskonventionen, Architekturmuster oder andere Richtlinien zu definieren, die das Modell für ein bestimmtes Repository befolgen soll.

## Mitwirken

Beiträge sind willkommen! Weitere Informationen zum Einstieg finden Sie im **Contributing Guide** der Qwen Code CLI.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context
