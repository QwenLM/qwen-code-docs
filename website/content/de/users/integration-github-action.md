# GitHub Actions: qwen-code-action

## Übersicht

`qwen-code-action` ist eine GitHub Action, die [Qwen Code] über die [Qwen Code CLI] in Ihren Entwicklungsworkflow integriert. Es fungiert sowohl als autonomer Agent für kritische Routineaufgaben als auch als auf Abruf bereiter Mitarbeiter, dem Sie schnell Aufgaben delegieren können.

Nutzen Sie es, um GitHub Pull-Request-Reviews durchzuführen, Issues zu triagieren, Code-Analysen und -Modifikationen vorzunehmen und vieles mehr – und das konversationell (z. B. `@qwencoder fix this issue`) direkt in Ihren GitHub-Repositories.

## Funktionen

- **Automatisierung**: Workflows basierend auf Ereignissen (z. B. Issue-Erstellung) oder Zeitplänen (z. B. nächtlich) auslösen.
- **On-Demand-Zusammenarbeit**: Workflows in Issue- und Pull-Request-Kommentaren durch Erwähnung der [Qwen Code CLI](./features/commands) auslösen (z. B. `@qwencoder /review`).
- **Erweiterbar durch Tools**: Nutzen Sie die Tool-Calling-Fähigkeiten von [Qwen Code](../developers/tools/introduction.md)-Modellen, um mit anderen CLIs wie der [GitHub CLI] (`gh`) zu interagieren.
- **Anpassbar**: Verwenden Sie eine `QWEN.md`-Datei in Ihrem Repository, um projektspezifische Anweisungen und Kontext für die [Qwen Code CLI](./features/commands) bereitzustellen.

## Schnellstart

Starten Sie die Qwen Code CLI in Ihrem Repository in nur wenigen Minuten:

### 1. Qwen API-Key besorgen

Holen Sie sich Ihren API-Key von [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (Alibaba Clouds KI-Plattform)

### 2. Als GitHub Secret hinzufügen

Speichern Sie Ihren API-Key als Secret mit dem Namen `QWEN_API_KEY` in Ihrem Repository:

- Gehen Sie zu **Einstellungen > Secrets und Variablen > Actions** in Ihrem Repository
- Klicken Sie auf **Neues Repository-Secret**
- Name: `QWEN_API_KEY`, Wert: Ihr API-Key

### 3. `.gitignore` aktualisieren

Fügen Sie die folgenden Einträge zu Ihrer `.gitignore`-Datei hinzu:

```gitignore
# qwen-code-cli Einstellungen
.qwen/

# GitHub App-Anmeldedaten
gha-creds-*.json
```

### 4. Einen Workflow auswählen

Sie haben zwei Optionen, um einen Workflow einzurichten:

**Option A: Setup-Befehl verwenden (Empfohlen)**

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

### 5. Ausprobieren

**Pull-Request-Review:**

- Öffnen Sie einen Pull-Request in Ihrem Repository und warten Sie auf die automatische Überprüfung
- Kommentieren Sie `@qwencoder /review` in einem bestehenden Pull-Request, um manuell ein Review auszulösen

**Issue-Triage:**

- Erstellen Sie ein Issue und warten Sie auf die automatische Triage
- Kommentieren Sie `@qwencoder /triage` in bestehenden Issues, um manuell eine Triage auszulösen

**Allgemeine KI-Unterstützung:**

- Erwähnen Sie in einem Issue oder Pull-Request `@qwencoder` gefolgt von Ihrer Anfrage
- Beispiele:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflows

Diese Action bietet mehrere vorgefertigte Workflows für verschiedene Anwendungsfälle. Jeder Workflow ist dafür ausgelegt, in das Verzeichnis `.github/workflows` Ihres Repositorys kopiert und nach Bedarf angepasst zu werden.

### Qwen Code Dispatch

Dieser Workflow fungiert als zentraler Verteiler für die Qwen Code CLI und leitet Anfragen basierend auf dem auslösenden Ereignis und dem im Kommentar angegebenen Befehl an den entsprechenden Workflow weiter. Eine detaillierte Anleitung zur Einrichtung des Dispatch-Workflows finden Sie in der [Qwen Code Dispatch Workflow-Dokumentation](./common-workflow).

### Issue-Triage

Diese Aktion kann verwendet werden, um GitHub Issues automatisch oder nach Zeitplan zu triagieren. Ein funktionierendes Setup für die automatische Issue-Triage finden Sie im [Workflow für automatisierte Issue-Triage](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Pull-Request-Review

Diese Aktion kann verwendet werden, um Pull-Requests beim Öffnen automatisch zu überprüfen. Eine detaillierte Anleitung zur Einrichtung des Pull-Request-Review-Systems finden Sie in der [GitHub PR Review Workflow-Dokumentation](./common-workflow).

### Qwen Code CLI Assistent

Diese Art von Aktion kann verwendet werden, um einen allgemeinen, konversationellen Qwen Code KI-Assistenten in Pull-Requests und Issues aufzurufen und eine Vielzahl von Aufgaben auszuführen. Eine detaillierte Anleitung zur Einrichtung des allgemeinen Qwen Code CLI Workflows finden Sie in der [Qwen Code Assistent Workflow-Dokumentation](./common-workflow).

## Konfiguration

### Eingaben

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)* Der API-Key für die Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, Standard: `latest`)* Die Version der Qwen Code CLI, die installiert werden soll. Kann "latest", "preview", "nightly", eine bestimmte Versionsnummer oder ein Git-Branch, -Tag oder -Commit sein. Weitere Informationen finden Sie unter [Qwen Code CLI Releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)* Aktiviert Debug-Logging und Streaming der Ausgabe.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)* Das mit Qwen Code zu verwendende Modell.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: *(Optional, Standard: `You are a helpful assistant.`)* Ein String, der an das [`--prompt`-Argument](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) der Qwen Code CLI übergeben wird.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: *(Optional)* Ein JSON-String, der in `.qwen/settings.json` geschrieben wird, um die *Projekt*-Einstellungen der CLI zu konfigurieren. Weitere Details finden Sie in der Dokumentation zu [Einstellungsdateien](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, Standard: `false`)* Gibt an, ob Code Assist für den Qwen Code Modellzugriff anstelle des Standard-Qwen-API-Keys verwendet werden soll. Weitere Informationen finden Sie in der [Qwen Code CLI Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, Standard: `false`)* Gibt an, ob Vertex AI für den Qwen Code Modellzugriff anstelle des Standard-Qwen-API-Keys verwendet werden soll. Weitere Informationen finden Sie in der [Qwen Code CLI Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: *(Optional)* Eine Liste der zu installierenden Qwen Code CLI Erweiterungen.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, Standard: `false`)* Gibt an, ob Artefakte in der GitHub Action hochgeladen werden sollen.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, Standard: `false`)* Gibt an, ob pnpm anstelle von npm zur Installation von qwen-code-cli verwendet werden soll.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, Standard: `${{ github.workflow }}`)* Der GitHub Workflow-Name, der für Telemetriezwecke verwendet wird.

<!-- END_AUTOGEN_INPUTS -->

### Ausgaben

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Die zusammengefasste Ausgabe der Qwen Code CLI Ausführung.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Die Fehlerausgabe der Qwen Code CLI Ausführung, falls vorhanden.

<!-- END_AUTOGEN_OUTPUTS -->

### Repository-Variablen

Wir empfehlen, die folgenden Werte als Repository-Variablen festzulegen, damit sie in allen Workflows wiederverwendet werden können. Alternativ können Sie sie inline als Action-Eingaben in einzelnen Workflows setzen oder um Werte auf Repository-Ebene zu überschreiben.

| Name               | Beschreibung                                              | Typ     | Erforderlich | Wann erforderlich             |
| ------------------ | --------------------------------------------------------- | ------- | ------------ | ----------------------------- |
| `DEBUG`            | Aktiviert Debug-Logging für die Qwen Code CLI.            | Variable | Nein         | Nie                           |
| `QWEN_CLI_VERSION` | Steuert, welche Version der Qwen Code CLI installiert wird. | Variable | Nein         | Wenn die CLI-Version festgelegt wird |
| `APP_ID`           | GitHub App-ID für die benutzerdefinierte Authentifizierung. | Variable | Nein         | Bei Verwendung einer benutzerdefinierten GitHub App |

So fügen Sie eine Repository-Variable hinzu:

1. Gehen Sie zu **Einstellungen > Secrets und Variablen > Actions > Neue Variable** in Ihrem Repository.
2. Geben Sie den Variablennamen und den Wert ein.
3. Speichern.

Einzelheiten zu Repository-Variablen finden Sie in der [GitHub-Dokumentation zu Variablen][variables].

### Secrets

Sie können die folgenden Secrets in Ihrem Repository festlegen:

| Name              | Beschreibung                                   | Erforderlich | Wann erforderlich                              |
| ----------------- | ---------------------------------------------- | ------------ | ---------------------------------------------- |
| `QWEN_API_KEY`    | Ihr Qwen API-Key von DashScope.                | Ja           | Erforderlich für alle Workflows, die Qwen aufrufen. |
| `APP_PRIVATE_KEY` | Privater Schlüssel für Ihre GitHub App (PEM-Format). | Nein          | Bei Verwendung einer benutzerdefinierten GitHub App. |

So fügen Sie ein Secret hinzu:

1. Gehen Sie zu **Einstellungen > Secrets und Variablen > Actions > Neues Repository-Secret** in Ihrem Repository.
2. Geben Sie den Secret-Namen und den Wert ein.
3. Speichern.

Weitere Informationen finden Sie in der [offiziellen GitHub-Dokumentation zum Erstellen und Verwenden von verschlüsselten Secrets][secrets].

## Authentifizierung

Diese Action erfordert eine Authentifizierung gegenüber der GitHub API und optional gegenüber den Qwen Code Diensten.

### GitHub-Authentifizierung

Sie können sich auf zwei Arten bei GitHub authentifizieren:

1. **Standard-`GITHUB_TOKEN`:** Für einfachere Anwendungsfälle kann die Action das vom Workflow bereitgestellte Standard-`GITHUB_TOKEN` verwenden.
2. **Benutzerdefinierte GitHub App (Empfohlen):** Für die sicherste und flexibelste Authentifizierung empfehlen wir die Erstellung einer benutzerdefinierten GitHub App.

Eine detaillierte Anleitung zur Einrichtung der Authentifizierung für Qwen und GitHub finden Sie in der
[**Authentifizierungsdokumentation**](./configuration/auth).

## Erweiterungen

Die Qwen Code CLI kann durch Erweiterungen mit zusätzlichen Funktionen ausgestattet werden.
Diese Erweiterungen werden aus dem Quellcode ihrer GitHub-Repositories installiert.

Eine detaillierte Anleitung zur Einrichtung und Konfiguration von Erweiterungen finden Sie in der
[Erweiterungsdokumentation](./extension/introduction.md).

## Best Practices

Um die Sicherheit, Zuverlässigkeit und Effizienz Ihrer automatisierten Workflows zu gewährleisten, empfehlen wir dringend, unsere Best Practices zu befolgen. Diese Richtlinien decken wichtige Bereiche wie Repository-Sicherheit, Workflow-Konfiguration und Überwachung ab.

Wichtige Empfehlungen sind:

- **Sicherung Ihres Repositorys:** Implementieren von Branch- und Tag-Schutz sowie Einschränkung der Pull-Request-Genehmiger.
- **Überwachung und Prüfung:** Regelmäßiges Überprüfen der Aktionsprotokolle und Aktivieren von OpenTelemetry für tiefere Einblicke in Leistung und Verhalten.

Eine umfassende Anleitung zur Sicherung Ihres Repositorys und Ihrer Workflows finden Sie in unserer [**Best Practices Dokumentation**](./common-workflow).

## Anpassung

Erstellen Sie eine `QWEN.md`-Datei im Stammverzeichnis Ihres Repositorys, um der [Qwen Code CLI](./common-workflow) projektspezifischen Kontext und Anweisungen bereitzustellen. Dies ist nützlich, um Codierungskonventionen, Architekturmuster oder andere Richtlinien zu definieren, die das Modell für ein bestimmtes Repository befolgen soll.

## Mitwirken

Beiträge sind willkommen! Weitere Informationen zum Einstieg finden Sie im **Contributing Guide** der Qwen Code CLI.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context