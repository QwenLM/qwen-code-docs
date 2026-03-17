# GitHub-Aktionen: qwen-code-action

## Übersicht

`qwen-code-action` ist eine GitHub-Aktion, die [Qwen Code] über die [Qwen Code-CLI] in Ihren Entwicklungsworkflow integriert. Sie fungiert sowohl als autonomer Agent für kritische, wiederkehrende Programmieraufgaben als auch als nach Bedarf einsetzbarer Kooperationspartner, dem Sie Aufgaben schnell zuweisen können.

Nutzen Sie sie, um GitHub-Pull-Request-Reviews durchzuführen, Issues zu priorisieren, Codeanalysen und -änderungen vorzunehmen und vieles mehr – alles mithilfe von [Qwen Code] in einer konversationellen Weise (z. B. `@qwencoder behebe dieses Problem`) direkt innerhalb Ihrer GitHub-Repositorys.

## Funktionen

- **Automatisierung**: Starten Sie Workflows basierend auf Ereignissen (z. B. Eröffnung eines Issues) oder Zeitplänen (z. B. nächtlich).
- **Kollaboration auf Abruf**: Starten Sie Workflows durch Kommentare in Issues und Pull Requests, indem Sie die [Qwen Code CLI](./features/commands) erwähnen (z. B. `@qwencoder /review`).
- **Erweiterbar mit Tools**: Nutzen Sie die Tool-Aufruf-Funktionen der [Qwen Code](../developers/tools/introduction.md)-Modelle, um mit anderen CLIs wie der [GitHub CLI] (`gh`) zu interagieren.
- **Anpassbar**: Verwenden Sie eine `QWEN.md`-Datei in Ihrem Repository, um projektbezogene Anweisungen und Kontext an die [Qwen Code CLI](./features/commands) bereitzustellen.

## Schnellstart

Beginnen Sie innerhalb weniger Minuten mit der Qwen Code CLI in Ihrem Repository:

### 1. Holen Sie sich einen Qwen-API-Schlüssel

Beziehen Sie Ihren API-Schlüssel von [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (der KI-Plattform von Alibaba Cloud).

### 2. Als GitHub-Geheimnis hinzufügen

Speichern Sie Ihren API-Schlüssel als Geheimnis mit dem Namen `QWEN_API_KEY` in Ihrem Repository:

- Navigieren Sie zu **Settings > Secrets and variables > Actions** Ihres Repositories.
- Klicken Sie auf **New repository secret**.
- Name: `QWEN_API_KEY`, Wert: Ihr API-Schlüssel

### 3. Aktualisieren Sie Ihre `.gitignore`

Fügen Sie die folgenden Einträge in Ihre `.gitignore`-Datei ein:

```gitignore

# qwen-code-cli-Einstellungen
.qwen/

# GitHub-App-Anmeldeinformationen
gha-creds-*.json
```

### 4. Wählen Sie einen Workflow

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

1. Kopieren Sie die vorkonfigurierten Workflows aus dem Verzeichnis [`examples/workflows`](./common-workflow) in das Verzeichnis `.github/workflows` Ihres Repositories. Hinweis: Der Workflow `qwen-dispatch.yml` muss ebenfalls kopiert werden, da er die Ausführung der anderen Workflows auslöst.

### 5. Ausprobieren

**Pull-Request-Überprüfung:**

- Öffnen Sie einen Pull Request in Ihrem Repository und warten Sie auf die automatische Überprüfung.
- Kommentieren Sie `@qwencoder /review` in einem bestehenden Pull Request, um eine manuelle Überprüfung auszulösen.

**Issue-Triage:**

- Öffnen Sie ein Issue und warten Sie auf die automatische Triage.
- Kommentieren Sie `@qwencoder /triage` in bestehenden Issues, um die Triage manuell auszulösen.

**Allgemeine KI-Unterstützung:**

- In jedem Issue oder Pull Request erwähnen Sie `@qwencoder`, gefolgt von Ihrer Anfrage.
- Beispiele:
  - `@qwencoder erkläre diese Codeänderung`
  - `@qwencoder schlage Verbesserungen für diese Funktion vor`
  - `@qwencoder hilf mir beim Debuggen dieses Fehlers`
  - `@qwencoder schreibe Unit-Tests für diese Komponente`

## Workflows

Diese Aktion bietet mehrere vorgefertigte Workflows für verschiedene Anwendungsfälle. Jeder Workflow ist so konzipiert, dass er in das Verzeichnis `.github/workflows` Ihres Repositories kopiert und nach Bedarf angepasst werden kann.

### Qwen Code-Dispatch

Dieser Workflow fungiert als zentraler Dispatcher für die Qwen Code-CLI und leitet Anfragen an den entsprechenden Workflow weiter, basierend auf dem auslösenden Ereignis und dem im Kommentar angegebenen Befehl. Eine detaillierte Anleitung zum Einrichten des Dispatch-Workflows finden Sie in der [Dokumentation zum Qwen Code-Dispatch-Workflow](./common-workflow).

### Issue-Triage

Diese Aktion kann zur automatischen oder zeitgesteuerten Triage von GitHub-Issues verwendet werden. Eine detaillierte Anleitung zum Einrichten des Issue-Triage-Systems finden Sie in der [Dokumentation zum GitHub-Issue-Triage-Workflow](./examples/workflows/issue-triage).

### Pull-Request-Review

Diese Aktion kann zur automatischen Überprüfung von Pull Requests beim Öffnen verwendet werden. Eine detaillierte Anleitung zum Einrichten des Pull-Request-Review-Systems finden Sie in der [Dokumentation zum GitHub-PR-Review-Workflow](./common-workflow).

### Qwen Code-CLI-Assistent

Mit dieser Aktionstyp können Sie innerhalb von Pull Requests und Issues einen allgemeinen, konversationellen Qwen Code-KI-Assistenten aufrufen, um eine breite Palette an Aufgaben durchzuführen. Eine detaillierte Anleitung zum Einrichten des allgemeinen Qwen Code-CLI-Workflows finden Sie in der [Dokumentation zum Qwen Code-Assistent-Workflow](./common-workflow).

## Konfiguration

### Eingaben

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ Der API-Schlüssel für die Qwen-API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, Standardwert: `latest`)\_ Die Version der Qwen Code CLI, die installiert werden soll. Kann `latest`, `preview`, `nightly`, eine bestimmte Versionsnummer oder ein Git-Branch, ein Tag oder ein Commit sein. Weitere Informationen finden Sie in den [Qwen Code CLI-Versionen](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)\_ Aktiviert Debug-Protokollierung und Ausgabestreaming.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)\_ Das Modell, das mit Qwen Code verwendet werden soll.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: *(Optional, Standardwert: `You are a helpful assistant.`)* Eine Zeichenkette, die als [`--prompt`-Argument](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) an die Qwen Code CLI übergeben wird.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: *(Optional)* Ein JSON-String, der in `.qwen/settings.json` geschrieben wird, um die _Projekteinstellungen_ der CLI zu konfigurieren.  
  Weitere Details finden Sie in der Dokumentation zu [Einstellungsdateien](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, Standardwert: `false`)\_ Ob Code Assist zur Nutzung des Qwen Code-Modells statt des standardmäßigen Qwen Code-API-Schlüssels verwendet werden soll.  
  Weitere Informationen finden Sie in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, Standardwert: `false`)\_ Ob Vertex AI zur Nutzung des Qwen Code-Modells statt des standardmäßigen Qwen Code-API-Schlüssels verwendet werden soll.  
  Weitere Informationen finden Sie in der [Qwen Code CLI-Dokumentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: *(Optional)* Eine Liste der Qwen Code CLI-Erweiterungen, die installiert werden sollen.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, Standardwert: `false`)\_ Ob Artefakte an die GitHub-Aktion hochgeladen werden sollen.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, Standardwert: `false`)\_ Ob pnpm statt npm zur Installation von `qwen-code-cli` verwendet werden soll.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, Standardwert: `${{ github.workflow }}`)\_ Der Name des GitHub-Workflows, der für Telemetrie-Zwecke verwendet wird.

<!-- END_AUTOGEN_INPUTS -->

### Ausgaben

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Die zusammengefasste Ausgabe der Qwen Code-CLI-Ausführung.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Die Fehlerausgabe der Qwen Code-CLI-Ausführung, falls vorhanden.

<!-- END_AUTOGEN_OUTPUTS -->

### Repository-Variablen

Wir empfehlen, die folgenden Werte als Repository-Variablen festzulegen, damit sie in allen Workflows wiederverwendet werden können. Alternativ können Sie sie inline als Eingabeparameter für einzelne Aktionen in spezifischen Workflows festlegen oder verwenden, um Repository-weite Werte zu überschreiben.

| Name               | Beschreibung                                               | Typ      | Erforderlich | Erforderlich bei                    |
| ------------------ | ---------------------------------------------------------- | -------- | ------------ | ------------------------------------- |
| `DEBUG`            | Aktiviert die Debug-Protokollierung für die Qwen Code-CLI. | Variable | Nein         | Nie                                   |
| `QWEN_CLI_VERSION` | Legt die Version der Qwen Code-CLI fest, die installiert wird. | Variable | Nein         | Festlegung einer bestimmten CLI-Version |
| `APP_ID`           | GitHub-App-ID für eine benutzerdefinierte Authentifizierung. | Variable | Nein         | Verwendung einer benutzerdefinierten GitHub-App |

So fügen Sie eine Repository-Variable hinzu:

1. Navigieren Sie zu den **Einstellungen > Geheimnisse und Variablen > Actions > Neue Variable** Ihres Repositorys.
2. Geben Sie den Namen und den Wert der Variablen ein.
3. Speichern Sie die Einstellung.

Weitere Informationen zu Repository-Variablen finden Sie in der [GitHub-Dokumentation zu Variablen][variables].

### Geheime Werte

Sie können die folgenden geheimen Werte in Ihrem Repository festlegen:

| Name              | Beschreibung                                               | Erforderlich | Wann erforderlich                              |
| ----------------- | ---------------------------------------------------------- | ------------ | ---------------------------------------------- |
| `QWEN_API_KEY`    | Ihr Qwen-API-Schlüssel von DashScope.                      | Ja           | Erforderlich für alle Workflows, die Qwen aufrufen. |
| `APP_PRIVATE_KEY` | Privater Schlüssel für Ihre GitHub-App (im PEM-Format).    | Nein         | Bei Verwendung einer benutzerdefinierten GitHub-App. |

So fügen Sie einen geheimen Wert hinzu:

1. Navigieren Sie zu den **Einstellungen > Geheime Werte und Variablen > Aktionen > Neuer Repository-geheimer Wert** Ihres Repositorys.
2. Geben Sie den Namen und den Wert des geheimen Werts ein.
3. Speichern Sie die Einstellungen.

Weitere Informationen finden Sie in der [offiziellen GitHub-Dokumentation zum Erstellen und Verwenden verschlüsselter geheimer Werte][secrets].

## Authentifizierung

Diese Aktion erfordert eine Authentifizierung beim GitHub-API und optional bei den Qwen Code-Diensten.

### GitHub-Authentifizierung

Sie können sich bei GitHub auf zwei Arten authentifizieren:

1. **Standard-`GITHUB_TOKEN`:** Für einfachere Anwendungsfälle kann die Aktion den standardmäßig vom Workflow bereitgestellten `GITHUB_TOKEN` verwenden.
2. **Benutzerdefizierte GitHub-App (empfohlen):** Für die sicherste und flexibelste Authentifizierung empfehlen wir die Erstellung einer benutzerdefinierten GitHub-App.

Ausführliche Anleitungen zur Einrichtung der Authentifizierung sowohl für Qwen als auch für GitHub finden Sie in der  
[**Authentifizierungsdokumentation**](./configuration/auth).

## Erweiterungen

Die Qwen Code CLI kann durch Erweiterungen um zusätzliche Funktionalität ergänzt werden.  
Diese Erweiterungen werden direkt aus ihren GitHub-Repositorys installiert.

Detaillierte Anleitungen zum Einrichten und Konfigurieren von Erweiterungen finden Sie in der  
[Erweiterungsdokumentation](../developers/extensions/extension).

## Bewährte Verfahren

Um die Sicherheit, Zuverlässigkeit und Effizienz Ihrer automatisierten Workflows sicherzustellen, empfehlen wir dringend, unsere bewährten Verfahren zu befolgen. Diese Richtlinien umfassen zentrale Bereiche wie Repository-Sicherheit, Workflow-Konfiguration und Überwachung.

Wichtige Empfehlungen sind:

- **Sicherung Ihres Repositorys:** Implementierung von Branch- und Tag-Schutz sowie Einschränkung der Personen, die Pull Requests genehmigen dürfen.
- **Überwachung und Auditierung:** Regelmäßige Überprüfung der Aktionsprotokolle und Aktivierung von OpenTelemetry für tiefere Einblicke in Leistung und Verhalten.

Für eine umfassende Anleitung zur Sicherung Ihres Repositorys und Ihrer Workflows verweisen wir auf unsere [**Dokumentation zu bewährten Verfahren**](./common-workflow).

## Anpassung

Erstellen Sie eine Datei `QWEN.md` im Stammverzeichnis Ihres Repositorys, um projektbezogene Kontextinformationen und Anweisungen für die [Qwen Code CLI](./common-workflow) bereitzustellen. Dies ist nützlich, um Codierkonventionen, Architekturmuster oder andere Richtlinien festzulegen, denen das Modell bei einem bestimmten Repository folgen soll.

## Mitwirken

Beiträge sind willkommen! Weitere Informationen zum Einstieg finden Sie in der **Mitwirkungsanleitung** für die Qwen Code CLI.

[secrets]: https://docs.github.com/de/actions/security-guides/using-secrets-in-github-actions  
[Qwen Code]: https://github.com/QwenLM/qwen-code  
[DashScope]: https://dashscope.console.aliyun.com/apiKey  
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/  
[variables]: https://docs.github.com/de/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository  
[GitHub CLI]: https://docs.github.com/de/github-cli/github-cli  
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context