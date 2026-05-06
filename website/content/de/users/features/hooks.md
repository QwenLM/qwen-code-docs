# Qwen Code Hooks

## Übersicht

Qwen Code Hooks bieten einen leistungsstarken Mechanismus zur Erweiterung und Anpassung des Verhaltens der Qwen Code Anwendung. Hooks ermöglichen es Nutzern, benutzerdefinierte Skripte oder Programme an bestimmten Punkten im Anwendungslebenszyklus auszuführen, z. B. vor oder nach der Tool-Ausführung, beim Start/Ende einer Session oder während anderer wichtiger Events.

Hooks sind standardmäßig aktiviert. Du kannst alle Hooks vorübergehend deaktivieren, indem du `disableAllHooks` in deiner Einstellungsdatei auf `true` setzt (auf oberster Ebene, neben `hooks`):

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

Dadurch werden alle Hooks deaktiviert, ohne ihre Konfigurationen zu löschen.

## Was sind Hooks?

Hooks sind benutzerdefinierte Skripte oder Programme, die von Qwen Code automatisch an vordefinierten Stellen im Anwendungsablauf ausgeführt werden. Sie ermöglichen es Nutzern:

- Tool-Nutzung zu überwachen und zu auditieren
- Sicherheitsrichtlinien durchzusetzen
- Zusätzlichen Kontext in Konversationen einzuspeisen
- Das Anwendungsverhalten basierend auf Events anzupassen
- Sich in externe Systeme und Dienste zu integrieren
- Tool-Eingaben oder -Antworten programmatisch zu modifizieren

## Hook-Typen

Qwen Code unterstützt drei Hook-Executor-Typen:

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Führt einen Shell-Befehl aus. Empfängt JSON über `stdin`, gibt Ergebnisse über `stdout` zurück.              |
| `http`     | Sendet JSON als `POST`-Request-Body an eine angegebene URL. Gibt Ergebnisse über den HTTP-Response-Body zurück. |
| `function` | Ruft direkt eine registrierte JavaScript-Funktion auf (nur für Session-Level-Hooks).                     |

### Command Hooks

Command Hooks führen Befehle über Child-Prozesse aus. Das Eingabe-JSON wird über stdin übergeben und die Ausgabe über stdout zurückgegeben.

**Configuration:**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | Hook-Typ                                   |
| `command`       | `string`                 | Yes      | Auszuführender Befehl                          |
| `name`          | `string`                 | No       | Hook-Name (für Logging)                     |
| `description`   | `string`                 | No       | Hook-Beschreibung                            |
| `timeout`       | `number`                 | No       | Timeout in Millisekunden, Standard 60000      |
| `async`         | `boolean`                | No       | Ob asynchron im Hintergrund ausgeführt werden soll |
| `env`           | `Record<string, string>` | No       | Umgebungsvariablen                       |
| `shell`         | `"bash" \| "powershell"` | No       | Zu verwendende Shell                                |
| `statusMessage` | `string`                 | No       | Statusmeldung, die während der Ausführung angezeigt wird   |

**Example:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WriteFile",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh",
            "name": "security-check",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### HTTP Hooks

HTTP Hooks senden Hook-Eingaben als POST-Requests an angegebene URLs. Sie unterstützen URL-Whitelists, DNS-basierten SSRF-Schutz, Interpolation von Umgebungsvariablen und weitere Sicherheitsfeatures.

**Configuration:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Hook-Typ                                                 |
| `url`            | `string`                 | Yes      | Ziel-URL                                                |
| `headers`        | `Record<string, string>` | No       | Request-Header (unterstützt Interpolation von Umgebungsvariablen)          |
| `allowedEnvVars` | `string[]`               | No       | Whitelist der in URL/Headern erlaubten Umgebungsvariablen |
| `timeout`        | `number`                 | No       | Timeout in Sekunden, Standard 600                           |
| `name`           | `string`                 | No       | Hook-Name (für Logging)                                   |
| `statusMessage`  | `string`                 | No       | Statusmeldung, die während der Ausführung angezeigt wird                 |
| `once`           | `boolean`                | No       | Nur einmal pro Event pro Session ausführen (nur HTTP Hooks) |

**Security Features:**

- **URL Whitelist**: Konfiguriere erlaubte URL-Patterns über `allowedUrls`
- **SSRF Protection**: Blockiert private IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x usw.), erlaubt aber Loopback-Adressen (127.0.0.1, ::1)
- **DNS Validation**: Validiert die Domain-Auflösung vor Requests, um DNS-Rebinding-Angriffe zu verhindern
- **Environment Variable Interpolation**: `${VAR}`-Syntax, erlaubt nur Variablen in der `allowedEnvVars`-Whitelist

**Example:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:8080/hooks/pre-tool-use",
            "headers": {
              "Authorization": "Bearer ${HOOK_API_KEY}"
            },
            "allowedEnvVars": ["HOOK_API_KEY"],
            "timeout": 10,
            "name": "remote-security-check"
          }
        ]
      }
    ]
  }
}
```

### Function Hooks

Function Hooks rufen direkt registrierte JavaScript/TypeScript-Funktionen auf. Sie werden intern vom Skill-System verwendet und sind derzeit nicht als öffentliche API für Endnutzer verfügbar.

**Note**: **Hinweis**: Für die meisten Anwendungsfälle verwende stattdessen **Command Hooks** oder **HTTP Hooks**, die in Einstellungsdateien konfiguriert werden können.

## Hook-Events

Hooks werden an bestimmten Punkten während einer Qwen Code Session ausgelöst. Verschiedene Events unterstützen unterschiedliche Matcher, um Trigger-Bedingungen zu filtern.

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Vor der Tool-Ausführung                     | Tool-Name (`WriteFile`, `ReadFile`, `Bash` usw.)         |
| `PostToolUse`        | Nach erfolgreicher Tool-Ausführung           | Tool-Name                                                 |
| `PostToolUseFailure` | Nach fehlgeschlagener Tool-Ausführung                | Tool-Name                                                 |
| `UserPromptSubmit`   | Nachdem der Nutzer einen Prompt gesendet hat                 | Keine (wird immer ausgelöst)                                       |
| `SessionStart`       | Beim Starten oder Fortsetzen einer Session            | Quelle (`startup`, `resume`, `clear`, `compact`)          |
| `SessionEnd`         | Beim Beenden einer Session                         | Grund (`clear`, `logout`, `prompt_input_exit` usw.)     |
| `Stop`               | Wenn Claude sich darauf vorbereitet, die Antwort abzuschließen | Keine (wird immer ausgelöst)                                       |
| `SubagentStart`      | Beim Starten eines Subagents                      | Agent-Typ (`Bash`, `Explorer`, `Plan` usw.)             |
| `SubagentStop`       | Beim Beenden eines Subagents                       | Agent-Typ                                                |
| `PreCompact`         | Vor der Gesprächskomprimierung            | Trigger (`manual`, `auto`)                                |
| `Notification`       | Beim Senden von Benachrichtigungen               | Typ (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest`  | Beim Anzeigen des Berechtigungsdialogs           | Tool-Name                                                 |

### Matcher-Patterns

Der `matcher` ist ein regulärer Ausdruck, der zum Filtern von Trigger-Bedingungen verwendet wird.

| Event Type          | Events                                                                 | Matcher Support | Matcher Target                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| Tool Events         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex        | Tool-Name: `WriteFile`, `ReadFile`, `Bash` usw.         |
| Subagent Events     | `SubagentStart`, `SubagentStop`                                        | ✅ Regex        | Agent-Typ: `Bash`, `Explorer` usw.                     |
| Session Events      | `SessionStart`                                                         | ✅ Regex        | Quelle: `startup`, `resume`, `clear`, `compact`          |
| Session Events      | `SessionEnd`                                                           | ✅ Regex        | Grund: `clear`, `logout`, `prompt_input_exit` usw.     |
| Notification Events | `Notification`                                                         | ✅ Exakter Match  | Typ: `permission_prompt`, `idle_prompt`, `auth_success` |
| Compact Events      | `PreCompact`                                                           | ✅ Exakter Match  | Trigger: `manual`, `auto`                                |
| Prompt Events       | `UserPromptSubmit`                                                     | ❌ No           | N/A                                                      |
| Stop Events         | `Stop`                                                                 | ❌ No           | N/A                                                      |

**Matcher Syntax:**

- Leere Zeichenkette `""` oder `"*"` matcht alle Events dieses Typs
- Standard-Regex-Syntax unterstützt (z. B. `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

**Examples:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "Write.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "echo 'all tools' >> /tmp/hooks.log" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'subagent check' >> /tmp/hooks.log"
          }
        ]
      }
    ]
  }
}
```

## Eingabe-/Ausgaberegeln

### Hook-Eingabestruktur

Alle Hooks erhalten standardisierte Eingaben im JSON-Format über stdin (command) oder den POST-Body (http).

**Common Fields:**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Event-spezifische Felder werden je nach Hook-Typ hinzugefügt. Bei Ausführung in einem Subagent werden zusätzlich `agent_id` und `agent_type` enthalten.

### Hook-Ausgabestruktur

Die Hook-Ausgabe wird als JSON über `stdout` (command) oder den HTTP-Response-Body (http) zurückgegeben.

**Exit Code Behavior (Command Hooks):**

| Exit Code | Behavior                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | Erfolg. Parse JSON in `stdout`, um das Verhalten zu steuern.                                  |
| `2`       | **Blockierender Fehler**. Ignoriert `stdout`, übergibt `stderr` als Fehler-Feedback an das Modell. |
| Other     | Nicht-blockierender Fehler. `stderr` wird nur im Debug-Modus angezeigt, Ausführung wird fortgesetzt.           |

**Output Structure:**

Die Hook-Ausgabe unterstützt drei Kategorien von Feldern:

1. **Common Fields**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Top-level Decision**: `decision`, `reason` (von einigen Events verwendet)
3. **Event-specific Control**: `hookSpecificOutput` (muss `hookEventName` enthalten)

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Operation approved",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Additional context information"
  }
}
```

### Details zu einzelnen Hook-Events

#### PreToolUse

**Purpose**: Wird vor der Tool-Nutzung ausgeführt, um Berechtigungsprüfungen, Eingabevalidierungen oder Kontext-Injektionen zu ermöglichen.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Output Options**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" oder "ask" (ERFORDERLICH)
- `hookSpecificOutput.permissionDecisionReason`: Begründung für die Entscheidung (ERFORDERLICH)
- `hookSpecificOutput.updatedInput`: Modifizierte Tool-Eingabeparameter, die anstelle des Originals verwendet werden
- `hookSpecificOutput.additionalContext`: Zusätzliche Kontextinformationen

**Note**: **Hinweis**: Obwohl standardmäßige Hook-Ausgabefelder wie `decision` und `reason` von der zugrunde liegenden Klasse technisch unterstützt werden, erwartet das offizielle Interface `hookSpecificOutput` mit `permissionDecision` und `permissionDecisionReason`.

**Example Output**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Security policy blocks database writes",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Purpose**: Wird nach erfolgreicher Tool-Ausführung ausgeführt, um Ergebnisse zu verarbeiten, Ergebnisse zu protokollieren oder zusätzlichen Kontext einzuspeisen.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" (Standard ist "allow", wenn nicht angegeben)
- `reason`: Begründung für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzliche Informationen, die eingebunden werden sollen

**Example Output**:

```json
{
  "decision": "allow",
  "reason": "Tool executed successfully",
  "hookSpecificOutput": {
    "additionalContext": "File modification recorded in audit log"
  }
}
```

#### PostToolUseFailure

**Purpose**: Wird bei fehlgeschlagener Tool-Ausführung ausgeführt, um Fehler zu behandeln, Warnungen zu senden oder Fehler zu protokollieren.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: Fehlerbehandlungsinformationen
- Standardmäßige Hook-Ausgabefelder

**Example Output**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Purpose**: Wird ausgeführt, wenn der Nutzer einen Prompt sendet, um die Eingabe zu modifizieren, zu validieren oder zu erweitern.

**Event-specific fields**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Menschenlesbare Begründung für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzlicher Kontext, der an den Prompt angehängt wird (optional)

**Note**: **Hinweis**: Da `UserPromptSubmitOutput` von `HookOutput` erbt, sind alle Standardfelder verfügbar, aber nur `additionalContext` in `hookSpecificOutput` ist spezifisch für dieses Event definiert.

**Example Output**:

```json
{
  "decision": "allow",
  "reason": "Prompt reviewed and approved",
  "hookSpecificOutput": {
    "additionalContext": "Remember to follow company coding standards."
  }
}
```

#### SessionStart

**Purpose**: Wird beim Starten einer neuen Session ausgeführt, um Initialisierungsaufgaben durchzuführen.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: Kontext, der in der Session verfügbar sein soll
- Standardmäßige Hook-Ausgabefelder

**Example Output**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Purpose**: Wird beim Beenden einer Session ausgeführt, um Bereinigungsaufgaben durchzuführen.

**Event-specific fields**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Output Options**:

- Standardmäßige Hook-Ausgabefelder (werden typischerweise nicht zum Blockieren verwendet)

#### Stop

**Purpose**: Wird ausgeführt, bevor Qwen seine Antwort abschließt, um finales Feedback oder Zusammenfassungen bereitzustellen.

**Event-specific fields**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Menschenlesbare Begründung für die Entscheidung
- `stopReason`: Feedback, das in der Stop-Antwort enthalten sein soll
- `continue`: Auf `false` setzen, um die Ausführung zu stoppen
- `hookSpecificOutput.additionalContext`: Zusätzliche Kontextinformationen

**Note**: **Hinweis**: Da `StopOutput` von `HookOutput` erbt, sind alle Standardfelder verfügbar, aber das `stopReason`-Feld ist für dieses Event besonders relevant.

**Example Output**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Purpose**: Wird ausgeführt, wenn der Turn aufgrund eines API-Fehlers endet (anstelle von `Stop`). Dies ist ein **Fire-and-Forget**-Event – Hook-Ausgabe und Exit-Codes werden ignoriert.

**Event-specific fields**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: Matcht gegen das `error`-Feld. Zum Beispiel wird `"matcher": "rate_limit"` nur bei Rate-Limit-Fehlern ausgelöst.

**Output Options**:

- **Keine** – StopFailure ist Fire-and-Forget. Alle Hook-Ausgaben und Exit-Codes werden ignoriert.

**Exit Code Handling**:

| Exit Code | Behavior                  |
| --------- | ------------------------- |
| Any       | Ignoriert (Fire-and-Forget) |

**Example Configuration**:

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/rate-limit-alert.sh",
            "name": "rate-limit-alerter"
          }
        ]
      }
    ]
  }
}
```

**Use Cases**:

- Rate-Limit-Überwachung und -Warnungen
- Protokollierung von Authentifizierungsfehlern
- Benachrichtigungen bei Abrechnungsfehlern
- Erfassung von Fehlerstatistiken

#### SubagentStart

**Purpose**: Wird beim Starten eines Subagents (wie dem Task-Tool) ausgeführt, um Kontext oder Berechtigungen einzurichten.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: Anfangskontext für den Subagent
- Standardmäßige Hook-Ausgabefelder

**Example Output**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Purpose**: Wird beim Beenden eines Subagents ausgeführt, um Finalisierungsaufgaben durchzuführen.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "boolean indicating if stop hook is active",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent",
  "agent_transcript_path": "path to the subagent's transcript",
  "last_assistant_message": "the last message from the subagent"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Menschenlesbare Begründung für die Entscheidung

**Example Output**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Purpose**: Wird vor der Gesprächskomprimierung ausgeführt, um die Komprimierung vorzubereiten oder zu protokollieren.

**Event-specific fields**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: Kontext, der vor der Komprimierung eingebunden werden soll
- Standardmäßige Hook-Ausgabefelder

**Example Output**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Purpose**: Wird nach Abschluss der Gesprächskomprimierung ausgeführt, um Zusammenfassungen zu archivieren oder die Nutzung zu tracken.

**Event-specific fields**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Matcht gegen das `trigger`-Feld. Zum Beispiel wird `"matcher": "manual"` nur bei manueller Komprimierung über den `/compact`-Befehl ausgelöst.

**Output Options**:

- `hookSpecificOutput.additionalContext`: Zusätzlicher Kontext (nur für Logging)
- Standardmäßige Hook-Ausgabefelder (nur für Logging)

**Note**: **Hinweis**: PostCompact ist **nicht** in der offiziellen Liste der Events enthalten, die Entscheidungsmodi unterstützen. Das `decision`-Feld und andere Steuerungsfelder haben keine Steuerungswirkung – sie werden nur zu Protokollierungszwecken verwendet.

**Exit Code Handling**:

| Exit Code | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Erfolg – stdout wird dem Nutzer im Verbose-Modus angezeigt            |
| Other     | Nicht-blockierender Fehler – stderr wird dem Nutzer im Verbose-Modus angezeigt |

**Example Configuration**:

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/save-compact-summary.sh",
            "name": "save-summary"
          }
        ]
      }
    ]
  }
}
```

**Use Cases**:

- Archivierung von Zusammenfassungen in Dateien oder Datenbanken
- Tracking von Nutzungsstatistiken
- Überwachung von Kontextänderungen
- Audit-Logging für Komprimierungsvorgänge

#### Notification

**Purpose**: Wird beim Senden von Benachrichtigungen ausgeführt, um diese anzupassen oder abzufangen.

**Event-specific fields**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Hinweis**: Der Typ `elicitation_dialog` ist definiert, aber derzeit nicht implementiert.

**Output Options**:

- `hookSpecificOutput.additionalContext`: Zusätzliche Informationen, die eingebunden werden sollen
- Standardmäßige Hook-Ausgabefelder

**Example Output**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Purpose**: Wird beim Anzeigen von Berechtigungsdialogen ausgeführt, um Entscheidungen zu automatisieren oder Berechtigungen zu aktualisieren.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**Output Options**:

- `hookSpecificOutput.decision`: Strukturiertes Objekt mit Details zur Berechtigungsentscheidung:
  - `behavior`: "allow" oder "deny"
  - `updatedInput`: Modifizierte Tool-Eingabe (optional)
  - `updatedPermissions`: Modifizierte Berechtigungen (optional)
  - `message`: Nachricht, die dem Nutzer angezeigt wird (optional)
  - `interrupt`: Ob der Workflow unterbrochen werden soll (optional)

**Example Output**:

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Permission granted based on security policy",
      "interrupt": false
    }
  }
}
```

## Hook-Konfiguration

Hooks werden in den Qwen Code Einstellungen konfiguriert, typischerweise in `.qwen/settings.json` oder Nutzerkonfigurationsdateien:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/security-check.sh",
            "name": "security-check",
            "description": "Run security checks before tool execution",
            "timeout": 30000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

## Hook-Ausführung

### Parallele vs. sequenzielle Ausführung

- Standardmäßig werden Hooks parallel ausgeführt, um die Leistung zu optimieren
- Verwende `sequential: true` in der Hook-Definition, um eine reihenfolgenabhängige Ausführung durchzusetzen
- Sequenzielle Hooks können die Eingabe für nachfolgende Hooks in der Kette modifizieren

### Asynchrone Hooks

Nur der Typ `command` unterstützt die asynchrone Ausführung. Das Setzen von `"async": true` führt den Hook im Hintergrund aus, ohne den Hauptablauf zu blockieren.

**Features:**

- Kann keine Entscheidungssteuerung zurückgeben (der Vorgang ist bereits erfolgt)
- Ergebnisse werden im nächsten Konversationsschritt über `systemMessage` oder `additionalContext` eingespeist
- Geeignet für Auditing, Logging, Hintergrundtests usw.

**Example:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "WriteFile|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300000
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then exit 0; fi
RESULT=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  echo "{\"systemMessage\": \"Tests passed after editing $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests failed: $RESULT\"}"
fi
```

### Sicherheitsmodell

- Hooks laufen in der Umgebung des Nutzers mit dessen Berechtigungen
- Hooks auf Projektebene erfordern einen vertrauenswürdigen Ordnerstatus
- Timeouts verhindern hängende Hooks (Standard: 60 Sekunden)

## Best Practices

### Beispiel 1: Sicherheitsvalidierungs-Hook

Ein PreToolUse-Hook, der gefährliche Befehle protokolliert und potenziell blockiert:

**security_check.sh**

```bash
#!/bin/bash

# Read input from stdin
INPUT=$(cat)

# Parse the input to extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check for potentially dangerous operations
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Blocking error
fi

# Log the operation
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

Configure in `.qwen/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${SECURITY_CHECK_SCRIPT}",
            "name": "security-checker",
            "description": "Security validation for bash commands",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Beispiel 2: HTTP-Audit-Hook

Ein PostToolUse-HTTP-Hook, der alle Tool-Ausführungsdatensätze an einen Remote-Audit-Dienst sendet:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://audit.example.com/api/tool-execution",
            "headers": {
              "Authorization": "Bearer ${AUDIT_API_TOKEN}",
              "Content-Type": "application/json"
            },
            "allowedEnvVars": ["AUDIT_API_TOKEN"],
            "timeout": 10,
            "name": "audit-logger"
          }
        ]
      }
    ]
  }
}
```

### Beispiel 3: User-Prompt-Validierungs-Hook

Ein UserPromptSubmit-Hook, der Nutzer-Prompts auf sensible Informationen prüft und Kontext für lange Prompts bereitstellt:

**prompt_validator.py**

```python
import json
import sys
import re

# Load input from stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# Sensitive words list
sensitive_words = ["password", "secret", "token", "api_key"]

# Check for sensitive information
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Block prompts containing sensitive information
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# No processing needed for normal cases
exit(0)
```

## Fehlerbehebung

- Prüfe die Anwendungslogs auf Details zur Hook-Ausführung
- Überprüfe die Berechtigungen und Ausführbarkeit der Hook-Skripte
- Stelle sicher, dass die Hook-Ausgaben korrekt im JSON-Format vorliegen
- Verwende spezifische Matcher-Patterns, um unbeabsichtigte Hook-Ausführungen zu vermeiden
- Verwende den `--debug`-Modus, um detaillierte Informationen zum Hook-Matching und zur Ausführung zu sehen
- Deaktiviere vorübergehend alle Hooks: Füge `"disableAllHooks": true` in den Einstellungen hinzu