# Github Actions: qwen-code-action

## Übersicht

`qwen-code-action` ist eine GitHub Action, die [Qwen Code] über die [Qwen Code CLI] in Ihren Entwicklungsworkflow integriert. Sie fungiert sowohl als autonomer Agent für kritische Routine-Coding-Aufgaben als auch als bedarfsgesteuerter Mitarbeiter, dem Sie schnell Aufgaben delegieren können.

Verwenden Sie sie, um GitHub Pull Request Reviews durchzuführen, Issues zu priorisieren, Code-Analysen und -Modifikationen vorzunehmen und vieles mehr mit [Qwen Code] konversationell (z. B. `@qwencoder fix this issue`) direkt in Ihren GitHub-Repositories.

## Funktionen

- **Automatisierung**: Workflows basierend auf Ereignissen (z. B. Öffnen eines Issues) oder Zeitplänen (z. B. nächtlich) auslösen.
- **Bedarfsgesteuerte Zusammenarbeit**: Workflows in Kommentaren zu Issues und Pull Requests durch Erwähnung der [Qwen Code CLI](./features/commands) auslösen (z. B. `@qwencoder /review`).
- **Erweiterbar mit Tools**: Nutze die Tool-Aufruffunktionen von [Qwen Code](../developers/tools/introduction.md)-Modellen, um mit anderen CLIs wie der [GitHub CLI] (`gh`) zu interagieren.
- **Anpassbar**: Verwende eine `QWEN.md`-Datei in deinem Repository, um projektspezifische Anweisungen und Kontext für die [Qwen Code CLI](./features/commands) bereitzustellen.

## Schnellstart

Beginne in nur wenigen Minuten mit der Qwen Code CLI in deinem Repository:

### 1. Einen Qwen-API-Schlüssel erhalten

Besorge dir deinen API-Schlüssel über [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (Alibabas KI-Plattform)

### 2. Als GitHub Secret hinzufügen

Speichere deinen API-Schlüssel als Secret mit dem Namen `QWEN_API_KEY` in deinem Repository:

- Gehe zu den **Einstellungen deines Repositorys > Secrets und Variablen > Actions**
- Klicke auf **Neues Repository-Secret**
- Name: `QWEN_API_KEY`, Wert: dein API-Schlüssel

### 3. Aktualisiere deine .gitignore

Füge die folgenden Einträge zu deiner `.gitignore`-Datei hinzu:

```gitignore

# qwen-code-cli Einstellungen
.qwen/

# GitHub App Zugangsdaten
gha-creds-*.json
```

### 4. Wähle einen Workflow

Du hast zwei Optionen, um einen Workflow einzurichten:

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

1. Kopiere die vorgefertigten Workflows aus dem Verzeichnis [`examples/workflows`](./common-workflow) in das Verzeichnis `.github/workflows` deines Repositorys. Hinweis: Der Workflow `qwen-dispatch.yml` muss ebenfalls kopiert werden, da er die Ausführung der Workflows auslöst.

### 5. Probier es aus

**Pull-Request-Review:**

- Öffne einen Pull Request in deinem Repository und warte auf die automatische Überprüfung
- Kommentiere `@qwencoder /review` in einem bestehenden Pull Request, um eine manuelle Überprüfung auszulösen

**Issue-Triaging:**

- Öffne ein Issue und warte auf das automatische Triaging
- Kommentiere `@qwencoder /triage` in bestehenden Issues, um das Triaging manuell auszulösen

**Allgemeine KI-Unterstützung:**

- Erwähne in jedem Issue oder Pull Request `@qwencoder` gefolgt von deiner Anfrage
- Beispiele:
  - `@qwencoder erkläre diese Codeänderung`
  - `@qwencoder schlage Verbesserungen für diese Funktion vor`
  - `@qwencoder hilf mir bei der Fehlersuche`
  - `@qwencoder schreibe Unit-Tests für diese Komponente`

## Workflows

Diese Action bietet mehrere vorgefertigte Workflows für verschiedene Anwendungsfälle. Jeder Workflow ist so konzipiert, dass er in das Verzeichnis `.github/workflows` deines Repositories kopiert und nach Bedarf angepasst werden kann.

### Qwen Code Dispatch

Dieser Workflow fungiert als zentraler Dispatcher für die Qwen Code CLI und leitet Anfragen basierend auf dem auslösenden Ereignis und dem im Kommentar angegebenen Befehl an den entsprechenden Workflow weiter. Eine detaillierte Anleitung zur Einrichtung des Dispatch-Workflows findest du in der [Qwen Code Dispatch Workflow-Dokumentation](./common-workflow).

### Issue-Triage

Diese Aktion kann verwendet werden, um GitHub Issues automatisch oder nach einem Zeitplan zu kategorisieren. Eine detaillierte Anleitung zur Einrichtung des Issue-Triage-Systems findest du in der [GitHub Issue Triage Workflow-Dokumentation](./examples/workflows/issue-triage).

### Pull Request Review

Diese Aktion kann verwendet werden, um Pull Requests beim Öffnen automatisch zu überprüfen. Eine detaillierte Anleitung zur Einrichtung des Pull Request Review-Systems findest du in der [GitHub PR Review Workflow-Dokumentation](./common-workflow).

### Qwen Code CLI-Assistent

Diese Art von Aktion kann verwendet werden, um einen allgemeinen, konversationellen Qwen Code KI-Assistenten innerhalb von Pull Requests und Issues aufzurufen, um eine Vielzahl von Aufgaben durchzuführen. Eine detaillierte Anleitung zur Einrichtung des allgemeinen Qwen Code CLI-Workflows finden Sie in der [Qwen Code Assistant Workflow-Dokumentation](./common-workflow).

## Konfiguration

### Eingaben

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ Der API-Schlüssel für die Qwen-API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, Standard: `latest`)\_ Die Version der zu installierenden Qwen Code CLI. Kann „latest“, „preview“, „nightly“, eine bestimmte Versionsnummer oder ein Git-Branch, -Tag oder -Commit sein. Weitere Informationen findest du unter [Qwen Code CLI-Releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)\_ Aktiviert Debug-Protokollierung und Streaming der Ausgabe.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)\_ Das Modell, das mit Qwen Code verwendet werden soll.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, Standard: `You are a helpful assistant.`)_ Eine Zeichenfolge, die an das [`--prompt`-Argument](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) der Qwen Code CLI übergeben wird.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ Ein JSON-String, der in `.qwen/settings.json` geschrieben wird, um die _Projekt_-Einstellungen der CLI zu konfigurieren.
  Weitere Details findest du in der Dokumentation zu [Einstellungsdateien](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, Standard: `false`)\_ Gibt an, ob Code Assist für den Zugriff auf das Qwen Code-Modell anstelle des Standard-Qwen Code-API-Schlüssels verwendet werden soll.
  Weitere Informationen findest du in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, Standard: `false`)\_ Gibt an, ob Vertex AI für den Zugriff auf das Qwen Code-Modell anstelle des Standard-Qwen Code-API-Schlüssels verwendet werden soll.
  Weitere Informationen findest du in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ Eine Liste von Qwen Code CLI-Erweiterungen, die installiert werden sollen.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, Standard: `false`)\_ Gibt an, ob Artefakte in die GitHub Action hochgeladen werden sollen.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, Standard: `false`)\_ Gibt an, ob pnpm anstelle von npm zum Installieren von qwen-code-cli verwendet werden soll.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, Standard: `${{ github.workflow }}`)\_ Der Name des GitHub-Workflows, der zu Telemetriezwecken verwendet wird.

<!-- END_AUTOGEN_INPUTS -->

### Ausgaben

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Die zusammengefasste Ausgabe der Qwen Code CLI-Ausführung.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Die Fehlerausgabe der Qwen Code CLI-Ausführung, falls vorhanden.

<!-- END_AUTOGEN_OUTPUTS -->

### Repository-Variablen

Wir empfehlen, die folgenden Werte als Repository-Variablen festzulegen, damit sie in allen Workflows wiederverwendet werden können. Alternativ kannst du sie auch inline als Action-Eingaben in einzelnen Workflows setzen oder Repository-Level-Werte überschreiben.

| Name               | Beschreibung                                                      | Typ      | Erforderlich | Wann erforderlich              |
| ------------------ | ----------------------------------------------------------------- | -------- | ------------ | ------------------------------ |
| `DEBUG`            | Aktiviert das Debug-Logging für die Qwen Code CLI.                | Variable | Nein         | Nie                            |
| `QWEN_CLI_VERSION` | Legt fest, welche Version der Qwen Code CLI installiert wird.     | Variable | Nein         | Anheften der CLI-Version       |
| `APP_ID`           | GitHub App-ID für die benutzerdefinierte Authentifizierung.       | Variable | Nein         | Verwendung einer eigenen GitHub App |

So fügst du eine Repository-Variable hinzu:

1. Gehe zu den **Einstellungen deines Repositorys > Secrets und Variablen > Actions > Neue Variable**.
2. Gib den Variablennamen und -wert ein.
3. Speichere.

Weitere Informationen zu Repository-Variablen findest du in der [GitHub-Dokumentation zu Variablen][variables].

[variables]: https://docs.github.com/en/actions/learn-github-actions/variables

### Secrets

Du kannst die folgenden Secrets in deinem Repository festlegen:

| Name              | Beschreibung                                      | Erforderlich | Wann erforderlich                            |
| ----------------- | ------------------------------------------------- | ------------ | -------------------------------------------- |
| `QWEN_API_KEY`    | Dein Qwen-API-Schlüssel von DashScope.            | Ja           | Erforderlich für alle Workflows, die Qwen aufrufen. |
| `APP_PRIVATE_KEY` | Privater Schlüssel für deine GitHub App (PEM-Format). | Nein         | Bei Verwendung einer benutzerdefinierten GitHub App. |

So fügst du ein Secret hinzu:

1. Gehe zu den **Einstellungen deines Repositorys > Secrets und Variablen > Actions > Neues Repository-Secret**.
2. Gib den Namen und Wert des Secrets ein.
3. Speichere.

Weitere Informationen findest du in der [offiziellen GitHub-Dokumentation zum Erstellen und Verwenden verschlüsselter Secrets][secrets].

## Authentifizierung

Diese Aktion erfordert eine Authentifizierung gegenüber der GitHub-API und optional gegenüber den Qwen Code Services.

### GitHub-Authentifizierung

Du kannst dich auf zwei Arten bei GitHub authentifizieren:

1. **Standard-`GITHUB_TOKEN`:** Für einfachere Anwendungsfälle kann die Action das
   standardmäßig vom Workflow bereitgestellte `GITHUB_TOKEN` verwenden.
2. **Benutzerdefinierte GitHub App (empfohlen):** Für die sicherste und flexibelste
   Authentifizierung empfehlen wir das Erstellen einer benutzerdefinierten GitHub App.

Ausführliche Einrichtungsanweisungen für Qwen- und GitHub-Authentifizierung findest du in der
[**Authentifizierungsdokumentation**](./configuration/auth).

## Erweiterungen

Die Qwen Code CLI kann durch Erweiterungen mit zusätzlicher Funktionalität erweitert werden.
Diese Erweiterungen werden aus ihren GitHub-Repositories direkt aus dem Quellcode installiert.

Eine detaillierte Anleitung zur Einrichtung und Konfiguration von Erweiterungen findest du in der
[Dokumentation zu Erweiterungen](../developers/extensions/extension).

## Best Practices

Um die Sicherheit, Zuverlässigkeit und Effizienz Ihrer automatisierten Workflows zu gewährleisten, empfehlen wir dringend, unsere Best Practices zu befolgen. Diese Richtlinien decken wichtige Bereiche wie Repositoriesicherheit, Workflow-Konfiguration und Überwachung ab.

Zu den wichtigsten Empfehlungen gehören:

- **Absichern Ihres Repositories:** Implementierung von Branch- und Tag-Schutz sowie Einschränkung der Pull-Request-Genehmiger.
- **Überwachung und Auditierung:** Regelmäßige Überprüfung der Aktionsprotokolle und Aktivierung von OpenTelemetry für tiefere Einblicke in Leistung und Verhalten.

Eine umfassende Anleitung zum Absichern Ihres Repositories und Ihrer Workflows finden Sie in unserer [**Best Practices-Dokumentation**](./common-workflow).

## Anpassung

Erstellen Sie eine QWEN.md-Datei im Stammverzeichnis Ihres Repositories, um projektspezifischen Kontext und Anweisungen für die [Qwen Code CLI](./common-workflow) bereitzustellen. Dies ist nützlich, um Codierungsrichtlinien, Architekturmuster oder andere Richtlinien zu definieren, denen das Modell in einem bestimmten Repository folgen sollte.

## Mitwirken

Beiträge sind willkommen! Schauen Sie sich den **Leitfaden zum Mitwirken** von Qwen Code CLI an, um weitere Details zur ersten Schritte zu erhalten.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context