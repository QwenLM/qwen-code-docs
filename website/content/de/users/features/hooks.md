# Qwen Code Hooks

## Overview

Qwen Code Hooks bieten einen leistungsstarken Mechanismus zur Erweiterung und Anpassung des Verhaltens der Qwen Code-Anwendung. Hooks ermöglichen es Benutzern, benutzerdefinierte Skripte oder Programme an bestimmten Punkten im Anwendungslebenszyklus auszuführen, z. B. vor der Tool-Ausführung, nach der Tool-Ausführung, beim Sitzungsstart/-ende und bei anderen wichtigen Ereignissen.

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

## What are Hooks?

Hooks sind benutzerdefinierte Skripte oder Programme, die von Qwen Code automatisch an vordefinierten Punkten im Anwendungsablauf ausgeführt werden. Sie ermöglichen es Benutzern:

- Tool-Nutzung zu überwachen und zu auditieren
- Sicherheitsrichtlinien durchzusetzen
- Zusätzlichen Kontext in Konversationen einzubringen
- Das Anwendungsverhalten ereignisbasiert anzupassen
- Sich in externe Systeme und Dienste zu integrieren
- Tool-Inputs oder -Antworten programmgesteuert zu modifizieren

## Hook Types

Qwen Code unterstützt vier Hook-Executor-Typen:

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Führt einen Shell-Befehl aus. Empfängt JSON über `stdin`, gibt Ergebnisse über `stdout` zurück.              |
| `http`     | Sendet JSON als `POST`-Request-Body an eine angegebene URL. Gibt Ergebnisse über den HTTP-Response-Body zurück. |
| `function` | Ruft direkt eine registrierte JavaScript-Funktion auf (nur Hooks auf Sitzungsebene).                     |
| `prompt`   | Verwendet ein LLM, um den Hook-Input auszuwerten und eine Entscheidung zurückzugeben.                                       |

### Command Hooks

Command-Hooks führen Befehle über Child-Prozesse aus. Input-JSON wird über stdin übergeben und die Ausgabe über stdout zurückgegeben.

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

HTTP-Hooks senden den Hook-Input als POST-Requests an angegebene URLs. Sie unterstützen URL-Whitelists, SSRF-Schutz auf DNS-Ebene, Interpolation von Umgebungsvariablen und andere Sicherheitsfunktionen.

**Configuration:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Hook-Typ                                                 |
| `url`            | `string`                 | Yes      | Ziel-URL                                                |
| `headers`        | `Record<string, string>` | No       | Request-Header (unterstützt Interpolation von Umgebungsvariablen)          |
| `allowedEnvVars` | `string[]`               | No       | Whitelist der Umgebungsvariablen, die in URL/Headern erlaubt sind |
| `timeout`        | `number`                 | No       | Timeout in Sekunden, Standard 600                           |
| `name`           | `string`                 | No       | Hook-Name (für Logging)                                   |
| `statusMessage`  | `string`                 | No       | Statusmeldung, die während der Ausführung angezeigt wird                 |
| `once`           | `boolean`                | No       | Wird nur einmal pro Ereignis und Sitzung ausgeführt (nur HTTP-Hooks) |

**Security Features:**

- **URL-Whitelist**: Konfiguriere erlaubte URL-Muster über `allowedUrls`
- **SSRF-Schutz**: Blockiert private IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x, usw.), erlaubt aber Loopback-Adressen (127.0.0.1, ::1)
- **DNS-Validierung**: Validiert die Domain-Auflösung vor Requests, um DNS-Rebinding-Angriffe zu verhindern
- **Interpolation von Umgebungsvariablen**: `${VAR}`-Syntax, erlaubt nur Variablen in der `allowedEnvVars`-Whitelist

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

Function-Hooks rufen direkt registrierte JavaScript/TypeScript-Funktionen auf. Sie werden intern vom Skill-System verwendet und sind derzeit nicht als öffentliche API für Endbenutzer verfügbar.

**Note**: Verwende für die meisten Anwendungsfälle stattdessen **Command-Hooks** oder **HTTP-Hooks**, die in Einstellungsdateien konfiguriert werden können.

### Prompt Hooks

Prompt-Hooks verwenden ein LLM, um den Hook-Input auszuwerten und eine Entscheidung zurückzugeben. Dies ist nützlich, um kontextbasierte intelligente Entscheidungen zu treffen, z. B. ob eine Operation erlaubt oder blockiert werden soll.

**How it works:**

1. Das Hook-Input-JSON wird über den Platzhalter `$ARGUMENTS` in deinen Prompt injiziert
2. Der Prompt wird an ein LLM gesendet (Standard: dein aktuelles Modell)
3. Das LLM gibt eine JSON-Antwort mit der Entscheidung zurück
4. Qwen Code verarbeitet die Entscheidung und setzt die Ausführung entsprechend fort oder blockiert sie

**Configuration:**

| Field           | Type       | Required | Description                                         |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | Yes      | Hook-Typ                                           |
| `prompt`        | `string`   | Yes      | Prompt, der an das LLM gesendet wird. Verwende `$ARGUMENTS` für den Hook-Input |
| `model`         | `string`   | No       | Zu verwendendes Modell (Standard ist dein aktuelles Modell)       |
| `timeout`       | `number`   | No       | Timeout in Sekunden, Standard 30                      |
| `name`          | `string`   | No       | Hook-Name (für Logging)                             |
| `description`   | `string`   | No       | Hook-Beschreibung                                    |
| `statusMessage` | `string`   | No       | Statusmeldung, die während der Ausführung angezeigt wird           |

**Response Format:**

Das LLM muss JSON mit der folgenden Struktur zurückgeben:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Field               | Description                                                                |
| :------------------ | :------------------------------------------------------------------------- |
| `ok`                | `true` zum Erlauben/Fortfahren, `false` zum Blockieren/Stoppen                            |
| `reason`            | Erforderlich, wenn `ok` `false` ist. Wird dem Modell angezeigt, um die Blockierung zu erklären     |
| `additionalContext` | Optional. Zusätzlicher Kontext, der beim Erlauben in die Konversation injiziert wird |

**Supported Events:**

Prompt-Hooks können mit den meisten Hook-Ereignissen verwendet werden, einschließlich:

- `PreToolUse` - Auswerten, ob ein Tool-Aufruf erlaubt werden soll
- `PostToolUse` - Tool-Ergebnisse auswerten und ggf. Kontext injizieren
- `Stop` - Bestimmen, ob fortgefahren oder gestoppt werden soll
- `SubagentStop` - Subagent-Ergebnisse auswerten
- `UserPromptSubmit` - Benutzer-Prompts auswerten oder anreichern

**Example: Stop Hook**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Qwen Code should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Wenn `ok` `false` ist, arbeitet Qwen Code weiter und verwendet den `reason` als Kontext für die nächste Antwort.

**Example: PreToolUse Hook**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate this tool call for security concerns. Tool input: $ARGUMENTS\n\nCheck for:\n- Dangerous commands (rm -rf, curl | sh, etc.)\n- Unauthorized access attempts\n- Data exfiltration patterns\n\nRespond with {\"ok\": true} if safe, or {\"ok\": false, \"reason\": \"concern\"} if blocked.",
            "model": "sonnet",
            "timeout": 30,
            "name": "security-evaluator"
          }
        ]
      }
    ]
  }
}
```

## Hook Events

Hooks werden an bestimmten Punkten während einer Qwen Code-Sitzung ausgelöst. Verschiedene Ereignisse unterstützen unterschiedliche Matcher, um Trigger-Bedingungen zu filtern.

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Vor der Tool-Ausführung                     | Tool-Name (`WriteFile`, `ReadFile`, `Bash`, usw.)         |
| `PostToolUse`        | Nach erfolgreicher Tool-Ausführung           | Tool-Name                                                 |
| `PostToolUseFailure` | Nach fehlgeschlagener Tool-Ausführung                | Tool-Name                                                 |
| `UserPromptSubmit`   | Nachdem der Benutzer den Prompt absendet                 | Keine (wird immer ausgelöst)                                       |
| `SessionStart`       | Wenn die Sitzung startet oder fortgesetzt wird            | Quelle (`startup`, `resume`, `clear`, `compact`)          |
| `SessionEnd`         | Wenn die Sitzung endet                         | Grund (`clear`, `logout`, `prompt_input_exit`, usw.)     |
| `Stop`               | Wenn Claude sich darauf vorbereitet, die Antwort abzuschließen | Keine (wird immer ausgelöst)                                       |
| `SubagentStart`      | Wenn der Subagent startet                      | Agent-Typ (`Bash`, `Explorer`, `Plan`, usw.)             |
| `SubagentStop`       | Wenn der Subagent stoppt                       | Agent-Typ                                                |
| `PreCompact`         | Vor der Konversations-Kompaktierung            | Trigger (`manual`, `auto`)                                |
| `Notification`       | Wenn Benachrichtigungen gesendet werden               | Typ (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest`  | Wenn der Berechtigungsdialog angezeigt wird           | Tool-Name                                                 |
| `TodoCreated`        | Wenn ein neues Todo-Element erstellt wird           | Keine (wird immer ausgelöst)                                       |
| `TodoCompleted`      | Wenn ein Todo-Element als abgeschlossen markiert wird   | Keine (wird immer ausgelöst)                                       |

### Matcher Patterns

`matcher` ist ein regulärer Ausdruck, der zum Filtern von Trigger-Bedingungen verwendet wird.

| Event Type          | Events                                                                 | Matcher Support | Matcher Target                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| Tool Events         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex        | Tool-Name: `WriteFile`, `ReadFile`, `Bash`, usw.         |
| Subagent Events     | `SubagentStart`, `SubagentStop`                                        | ✅ Regex        | Agent-Typ: `Bash`, `Explorer`, usw.                     |
| Session Events      | `SessionStart`                                                         | ✅ Regex        | Quelle: `startup`, `resume`, `clear`, `compact`          |
| Session Events      | `SessionEnd`                                                           | ✅ Regex        | Grund: `clear`, `logout`, `prompt_input_exit`, usw.     |
| Notification Events | `Notification`                                                         | ✅ Exakte Übereinstimmung  | Typ: `permission_prompt`, `idle_prompt`, `auth_success` |
| Compact Events      | `PreCompact`                                                           | ✅ Exakte Übereinstimmung  | Trigger: `manual`, `auto`                                |
| Todo Events         | `TodoCreated`, `TodoCompleted`                                         | ❌ Nein           | k. A.                                                      |
| Prompt Events       | `UserPromptSubmit`                                                     | ❌ Nein           | k. A.                                                      |
| Stop Events         | `Stop`                                                                 | ❌ Nein           | k. A.                                                      |

**Matcher Syntax:**

- Leerer String `""` oder `"*"` entspricht allen Ereignissen dieses Typs
- Standard-Regex-Syntax wird unterstützt (z. B. `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

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

## Input/Output Rules

### Hook Input Structure

Alle Hooks erhalten standardisierten Input im JSON-Format über stdin (command) oder den POST-Body (http).

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

Ereignisspezifische Felder werden basierend auf dem Hook-Typ hinzugefügt. Bei der Ausführung in einem Subagenten werden zusätzlich `agent_id` und `agent_type` eingeschlossen.

### Hook Output Structure

Der Hook-Output wird über `stdout` (command) oder den HTTP-Response-Body (http) als JSON zurückgegeben.

**Exit Code Behavior (Command Hooks):**

| Exit Code | Behavior                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | Erfolg. JSON in `stdout` parsen, um das Verhalten zu steuern.                                  |
| `2`       | **Blockierender Fehler**. Ignoriert `stdout`, übergibt `stderr` als Fehler-Feedback an das Modell. |
| Other     | Nicht-blockierender Fehler. `stderr` wird nur im Debug-Modus angezeigt, die Ausführung wird fortgesetzt.           |

**Output Structure:**

Der Hook-Output unterstützt drei Kategorien von Feldern:

1. **Allgemeine Felder**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Top-Level-Entscheidung**: `decision`, `reason` (von einigen Ereignissen verwendet)
3. **Ereignisspezifische Steuerung**: `hookSpecificOutput` (muss `hookEventName` enthalten)

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

### Individual Hook Event Details

#### PreToolUse

**Purpose**: Wird ausgeführt, bevor ein Tool verwendet wird, um Berechtigungsprüfungen, Input-Validierung oder Kontext-Injektion zu ermöglichen.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**Output Options**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" oder "ask" (ERFORDERLICH)
- `hookSpecificOutput.permissionDecisionReason`: Begründung für die Entscheidung (ERFORDERLICH)
- `hookSpecificOutput.updatedInput`: Modifizierte Tool-Input-Parameter, die anstelle der Originale verwendet werden sollen
- `hookSpecificOutput.additionalContext`: Zusätzliche Kontextinformationen

**Note**: Obwohl Standard-Hook-Output-Felder wie `decision` und `reason` technisch von der zugrunde liegenden Klasse unterstützt werden, erwartet die offizielle Schnittstelle das `hookSpecificOutput` mit `permissionDecision` und `permissionDecisionReason`.

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

**Purpose**: Wird ausgeführt, nachdem ein Tool erfolgreich abgeschlossen wurde, um Ergebnisse zu verarbeiten, Ergebnisse zu loggen oder zusätzlichen Kontext zu injizieren.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" (Standard ist "allow", wenn nicht angegeben)
- `reason`: Grund für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzliche Informationen, die eingeschlossen werden sollen

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

**Purpose**: Wird ausgeführt, wenn eine Tool-Ausführung fehlschlägt, um Fehler zu behandeln, Warnungen zu senden oder Fehlschläge zu protokollieren.

**Event-specific fields**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```
**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Fehlerbehandlungsinformationen
- Standard-Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Zweck**: Wird ausgeführt, wenn der Benutzer einen Prompt übermittelt, um die Eingabe zu ändern, zu validieren oder anzureichern.

**Ereignisspezifische Felder**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: menschenlesbare Erklärung für die Entscheidung
- `hookSpecificOutput.additionalContext`: zusätzlicher Kontext, der an den Prompt angehängt wird (optional)

**Hinweis**: Da UserPromptSubmitOutput HookOutput erweitert, sind alle Standardfelder verfügbar, aber nur additionalContext in hookSpecificOutput ist spezifisch für dieses Ereignis definiert.

**Beispielausgabe**:

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

**Zweck**: Wird beim Start einer neuen Sitzung ausgeführt, um Initialisierungsaufgaben durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Kontext, der in der Sitzung verfügbar sein soll
- Standard-Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Zweck**: Wird beim Beenden einer Sitzung ausgeführt, um Aufräumaufgaben durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Ausgabeoptionen**:

- Standard-Hook-Ausgabefelder (werden in der Regel nicht zum Blockieren verwendet)

#### Stop

**Zweck**: Wird ausgeführt, bevor Qwen seine Antwort abschließt, um finales Feedback oder Zusammenfassungen bereitzustellen.

**Ereignisspezifische Felder**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant",
  "context_usage": "ratio of context window used (may exceed 1 when tokens exceed window; optional)",
  "context_limit": "context window size in tokens (optional)",
  "input_tokens": "prompt token count (may include output tokens depending on provider; optional)"
}
```

Die Felder `context_usage`, `context_limit` und `input_tokens` ermöglichen es Hook-Skripten, die Kontextnutzung zu beobachten und benutzerdefinierte Kompaktierungsstrategien zu implementieren – beispielsweise ein Skript, das eine Erinnerung zur Ausführung von `/compact` ausgibt, wenn die Nutzung einen benutzerdefinierten Schwellenwert überschreitet.

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: menschenlesbare Erklärung für die Entscheidung
- `stopReason`: Feedback, das in die Stop-Antwort aufgenommen werden soll
- `continue`: auf false setzen, um die Ausführung zu stoppen
- `hookSpecificOutput.additionalContext`: zusätzliche Kontextinformationen

**Hinweis**: Da StopOutput HookOutput erweitert, sind alle Standardfelder verfügbar, aber das Feld `stopReason` ist für dieses Ereignis besonders relevant.

**Beispielausgabe**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Zweck**: Wird ausgeführt, wenn der Durchlauf (Turn) aufgrund eines API-Fehlers endet (anstelle von Stop). Dies ist ein **Fire-and-Forget**-Ereignis – Hook-Ausgaben und Exit-Codes werden ignoriert.

**Ereignisspezifische Felder**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: Gleicht das Feld `error` ab. Zum Beispiel löst `"matcher": "rate_limit"` nur bei Rate-Limit-Fehlern aus.

**Ausgabeoptionen**:

- **Keine** – StopFailure ist Fire-and-Forget. Alle Hook-Ausgaben und Exit-Codes werden ignoriert.

**Exit-Code-Behandlung**:

| Exit-Code | Verhalten                  |
| --------- | ------------------------- |
| Beliebig       | Ignoriert (Fire-and-Forget) |

**Beispielkonfiguration**:

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

**Anwendungsfälle**:

- Rate-Limit-Überwachung und Alarmierung
- Protokollierung von Authentifizierungsfehlern
- Benachrichtigungen bei Abrechnungsfehlern
- Erfassung von Fehlerstatistiken

#### SubagentStart

**Zweck**: Wird ausgeführt, wenn ein Subagent (wie das Task-Tool) gestartet wird, um Kontext oder Berechtigungen einzurichten.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: initialer Kontext für den Subagenten
- Standard-Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Zweck**: Wird ausgeführt, wenn ein Subagent abgeschlossen ist, um Finalisierungsaufgaben durchzuführen.

**Ereignisspezifische Felder**:

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

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: menschenlesbare Erklärung für die Entscheidung

**Beispielausgabe**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Zweck**: Wird vor der Konversationskompaktierung ausgeführt, um die Kompaktierung vorzubereiten oder zu protokollieren.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Kontext, der vor der Kompaktierung einbezogen werden soll
- Standard-Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Zweck**: Wird nach Abschluss der Konversationskompaktierung ausgeführt, um Zusammenfassungen zu archivieren oder die Nutzung zu tracken.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Gleicht das Feld `trigger` ab. Zum Beispiel löst `"matcher": "manual"` nur bei manueller Kompaktierung über den `/compact`-Befehl aus.

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: zusätzlicher Kontext (nur zur Protokollierung)
- Standard-Hook-Ausgabefelder (nur zur Protokollierung)

**Hinweis**: PostCompact steht **nicht** auf der Liste der offiziell unterstützten Ereignisse im Entscheidungsmodus. Das Feld `decision` und andere Steuerungsfelder haben keine steuernde Wirkung – sie dienen ausschließlich der Protokollierung.

**Exit-Code-Behandlung**:

| Exit-Code | Verhalten                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Erfolg – stdout wird im Verbose-Modus dem Benutzer angezeigt            |
| Andere     | Nicht-blockierender Fehler – stderr wird im Verbose-Modus dem Benutzer angezeigt |

**Beispielkonfiguration**:

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

**Anwendungsfälle**:

- Archivierung von Zusammenfassungen in Dateien oder Datenbanken
- Tracking von Nutzungsstatistiken
- Überwachung von Kontextänderungen
- Audit-Protokollierung für Kompaktierungsvorgänge

#### Notification

**Zweck**: Wird beim Senden von Benachrichtigungen ausgeführt, um diese anzupassen oder abzufangen.

**Ereignisspezifische Felder**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Hinweis**: Der Typ `elicitation_dialog` ist definiert, aber derzeit nicht implementiert.

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: zusätzliche Informationen, die einbezogen werden sollen
- Standard-Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Zweck**: Wird bei der Anzeige von Berechtigungsdialogen ausgeführt, um Entscheidungen zu automatisieren oder Berechtigungen zu aktualisieren.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.decision`: strukturiertes Objekt mit Details zur Berechtigungsentscheidung:
  - `behavior`: "allow" oder "deny"
  - `updatedInput`: modifizierte Tool-Eingabe (optional)
  - `updatedPermissions`: modifizierte Berechtigungen (optional)
  - `message`: Nachricht, die dem Benutzer angezeigt werden soll (optional)
  - `interrupt`: ob der Workflow unterbrochen werden soll (optional)

**Beispielausgabe**:

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

#### TodoCreated

**Zweck**: Wird ausgeführt, wenn ein neues Todo-Element über das `todo_write`-Tool erstellt wird. Ermöglicht die Validierung, Protokollierung oder Blockierung der Todo-Erstellung.

Todo-Hooks werden in zwei Phasen ausgeführt:

- `validation`: wird vor der Persistierung ausgeführt. Verwende diese Phase nur für die Validierung; die Rückgabe von `block` oder `deny` verhindert das Schreiben.
- `postWrite`: wird nach der Persistierung ausgeführt. Verwende diese Phase für Nebeneffekte wie Protokollierung oder Synchronisierung; `block` oder `deny` wird in dieser Phase ignoriert.

**Ereignisspezifische Felder**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "block" oder "deny"
- `reason`: menschenlesbare Erklärung für die Entscheidung (erforderlich beim Blockieren)

**Blockierungsverhalten**:

Während der `validation`-Phase wird die Todo-Erstellung verhindert, wenn `decision` auf `block` oder `deny` gesetzt ist (Exit-Code 2). Die Todo-Liste bleibt unverändert und der Grund wird als Feedback an das Modell übergeben.

Während der `postWrite`-Phase wurde das Todo bereits persistiert. Hooks können weiterhin Ausgaben zurückgeben, aber `block` / `deny` macht das Schreiben nicht rückgängig und sollte nicht für die Validierung verwendet werden.

**Beispielausgabe (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**Beispielausgabe (Block)**:

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**Beispiel-Hook-Skript**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Validates todo content before creation

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Check minimum length
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Block test-related todos
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Beispielkonfiguration**:

```json
{
  "hooks": {
    "TodoCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-validator.sh",
            "name": "todo-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### TodoCompleted

**Zweck**: Wird ausgeführt, wenn ein Todo-Element als abgeschlossen markiert wird. Ermöglicht die Validierung, Protokollierung oder Blockierung des Todo-Abschlusses.

Todo-Hooks werden in zwei Phasen ausgeführt:

- `validation`: wird vor der Persistierung ausgeführt. Verwende diese Phase nur für die Validierung; die Rückgabe von `block` oder `deny` verhindert das Schreiben.
- `postWrite`: wird nach der Persistierung ausgeführt. Verwende diese Phase für Nebeneffekte wie Protokollierung oder Synchronisierung; `block` oder `deny` wird in dieser Phase ignoriert.

**Ereignisspezifische Felder**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "previous_status": "pending | in_progress (status before completion)",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "block" oder "deny"
- `reason`: menschenlesbare Erklärung für die Entscheidung (erforderlich beim Blockieren)

**Blockierungsverhalten**:

Während der `validation`-Phase wird der Todo-Abschluss verhindert, wenn `decision` auf `block` oder `deny` gesetzt ist (Exit-Code 2). Das Todo-Element bleibt in seinem vorherigen Status und der Grund wird als Feedback an das Modell übergeben.

Während der `postWrite`-Phase wurde das Todo bereits persistiert. Hooks können weiterhin Ausgaben zurückgeben, aber `block` / `deny` macht das Schreiben nicht rückgängig und sollte nicht für die Validierung verwendet werden.

**Beispielausgabe (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**Beispielausgabe (Block)**:

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**Beispiel-Hook-Skript**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validates todo completion conditions

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Check if there are incomplete dependent todos (example logic)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Beispielkonfiguration**:

```json
{
  "hooks": {
    "TodoCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-completion-validator.sh",
            "name": "completion-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**Anwendungsfälle**:

- **Protokollierung**: Todo-Erstellung und -Abschluss für Audits oder Analysen tracken
- **Validierung**: Durchsetzung von Inhaltsqualitätsstandards (Mindestlänge, erforderliche Schlüsselwörter)
- **Workflow-Steuerung**: Abschluss blockieren, bis Voraussetzungen erfüllt sind
- **Integration**: Todos mit externen Aufgabenmanagementsystemen (Jira, Trello usw.) synchronisieren

## Hook-Konfiguration

Hooks werden in den Qwen Code-Einstellungen konfiguriert, typischerweise in `.qwen/settings.json` oder Benutzerkonfigurationsdateien:

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

- Standardmäßig werden Hooks parallel ausgeführt, um die Performance zu verbessern
- Verwende `sequential: true` in der Hook-Definition, um eine reihenfolgeabhängige Ausführung zu erzwingen
- Sequentielle Hooks können die Eingabe für nachfolgende Hooks in der Kette modifizieren

### Asynchrone Hooks

Nur der Typ `command` unterstützt asynchrone Ausführung. Das Setzen von `"async": true` führt den Hook im Hintergrund aus, ohne den Hauptfluss zu blockieren.

**Funktionen:**

- Kann keine Entscheidungssteuerung zurückgeben (der Vorgang hat bereits stattgefunden)
- Ergebnisse werden im nächsten Konversations-Turn über `systemMessage` oder `additionalContext` injiziert
- Geeignet für Auditing, Protokollierung, Hintergrundtests usw.

**Beispiel:**

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

- Hooks werden in der Umgebung des Benutzers mit Benutzerrechten ausgeführt
- Hooks auf Projektebene erfordern den Status eines vertrauenswürdigen Ordners
- Timeouts verhindern das Hängenbleiben von Hooks (Standard: 60 Sekunden)

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

Konfigurieren in `.qwen/settings.json`:

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

### Beispiel 3: Benutzer-Prompt-Validierungs-Hook

Ein UserPromptSubmit-Hook, der Benutzer-Prompts auf sensible Informationen validiert und Kontext für lange Prompts bereitstellt:
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

- Überprüfe die Anwendungslogs auf Details zur Hook-Ausführung
- Überprüfe die Berechtigungen und Ausführbarkeit des Hook-Skripts
- Stelle sicher, dass die Hook-Ausgaben korrekt als JSON formatiert sind
- Verwende spezifische Matcher-Patterns, um eine unbeabsichtigte Hook-Ausführung zu vermeiden
- Verwende den `--debug`-Modus, um detaillierte Informationen zum Hook-Matching und zur Ausführung zu erhalten
- Deaktiviere vorübergehend alle Hooks: Füge `"disableAllHooks": true` in den Einstellungen hinzu