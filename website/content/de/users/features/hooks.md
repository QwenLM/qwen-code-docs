# Qwen Code Hooks

## Overview

Qwen Code Hooks bieten einen leistungsstarken Mechanismus zur Erweiterung und Anpassung des Verhaltens der Qwen Code-Anwendung. Hooks ermöglichen es Benutzern, benutzerdefinierte Skripte oder Programme an bestimmten Punkten im Anwendungslebenszyklus auszuführen, z. B. vor oder nach der Tool-Ausführung, beim Start/Ende einer Session und bei anderen wichtigen Ereignissen.

Hooks sind standardmäßig aktiviert. Du kannst alle Hooks vorübergehend deaktivieren, indem du `disableAllHooks` in deiner Einstellungsdatei auf `true` setzt (auf der obersten Ebene, neben `hooks`):

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

Hooks sind benutzerdefinierte Skripte oder Programme, die von Qwen Code automatisch an vordefinierten Punkten im Anwendungsablauf ausgeführt werden. Sie ermöglichen es Benutzern:

- Tool-Nutzung zu überwachen und zu auditieren
- Sicherheitsrichtlinien durchzusetzen
- Zusätzlichen Kontext in Konversationen einzubringen
- Das Anwendungsverhalten ereignisbasiert anzupassen
- Sich in externe Systeme und Dienste zu integrieren
- Tool-Inputs oder -Antworten programmgesteuert zu modifizieren

## Hook-Typen

Qwen Code unterstützt vier Hook-Executor-Typen:

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Führt einen Shell-Befehl aus. Empfängt JSON über `stdin`, gibt Ergebnisse über `stdout` zurück. |
| `http`     | Sendet JSON als `POST`-Request-Body an eine angegebene URL. Gibt Ergebnisse über den HTTP-Response-Body zurück. |
| `function` | Ruft direkt eine registrierte JavaScript-Funktion auf (nur für Hooks auf Session-Ebene).       |
| `prompt`   | Nutzt ein LLM, um den Hook-Input auszuwerten und eine Entscheidung zurückzugeben.              |

### Command Hooks

Command Hooks führen Befehle über Child Processes aus. Input-JSON wird über stdin übergeben und Output über stdout zurückgegeben.

**Konfiguration:**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | Hook-Typ                                    |
| `command`       | `string`                 | Yes      | Auszuführender Befehl                       |
| `name`          | `string`                 | No       | Hook-Name (für Logging)                     |
| `description`   | `string`                 | No       | Hook-Beschreibung                           |
| `timeout`       | `number`                 | No       | Timeout in Millisekunden, Standard 60000    |
| `async`         | `boolean`                | No       | Ob asynchron im Hintergrund ausgeführt werden soll |
| `env`           | `Record<string, string>` | No       | Umgebungsvariablen                          |
| `shell`         | `"bash" \| "powershell"` | No       | Zu verwendende Shell                        |
| `statusMessage` | `string`                 | No       | Statusmeldung, die während der Ausführung angezeigt wird |

**Beispiel:**

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

HTTP Hooks senden den Hook-Input als POST-Requests an angegebene URLs. Sie unterstützen URL-Whitelists, SSRF-Schutz auf DNS-Ebene, Interpolation von Umgebungsvariablen und weitere Sicherheitsfunktionen.

**Konfiguration:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | Hook-Typ                                                  |
| `url`            | `string`                 | Yes      | Ziel-URL                                                  |
| `headers`        | `Record<string, string>` | No       | Request-Header (unterstützt Interpolation von Umgebungsvariablen) |
| `allowedEnvVars` | `string[]`               | No       | Whitelist der Umgebungsvariablen, die in URL/Headern erlaubt sind |
| `timeout`        | `number`                 | No       | Timeout in Sekunden, Standard 600                         |
| `name`           | `string`                 | No       | Hook-Name (für Logging)                                   |
| `statusMessage`  | `string`                 | No       | Statusmeldung, die während der Ausführung angezeigt wird  |
| `once`           | `boolean`                | No       | Wird nur einmal pro Ereignis und Session ausgeführt (nur HTTP Hooks) |

**Sicherheitsfunktionen:**

- **URL-Whitelist**: Erlaubte URL-Muster über `allowedUrls` konfigurieren
- **SSRF-Schutz**: Blockiert private IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x, usw.), erlaubt aber Loopback-Adressen (127.0.0.1, ::1)
- **DNS-Validierung**: Validiert die Domain-Auflösung vor Requests, um DNS-Rebinding-Angriffe zu verhindern
- **Interpolation von Umgebungsvariablen**: `${VAR}`-Syntax, erlaubt nur Variablen aus der `allowedEnvVars`-Whitelist

**Beispiel:**

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

Function Hooks rufen direkt registrierte JavaScript/TypeScript-Funktionen auf. Sie werden intern vom Skill-System verwendet und sind derzeit nicht als öffentliche API für Endbenutzer verfügbar.

**Hinweis**: Verwende für die meisten Anwendungsfälle stattdessen **Command Hooks** oder **HTTP Hooks**, die in den Einstellungsdateien konfiguriert werden können.

### Prompt Hooks

Prompt Hooks nutzen ein LLM, um den Hook-Input auszuwerten und eine Entscheidung zurückzugeben. Dies ist nützlich, um kontextbasiert intelligente Entscheidungen zu treffen, wie z. B. das Erlauben oder Blockieren einer Operation.

**Funktionsweise:**

1. Das Hook-Input-JSON wird über den Platzhalter `$ARGUMENTS` in deinen Prompt injiziert
2. Der Prompt wird an ein LLM gesendet (Standard: dein aktuelles Modell)
3. Das LLM gibt eine JSON-Antwort mit der Entscheidung zurück
4. Qwen Code verarbeitet die Entscheidung und setzt die Ausführung entsprechend fort oder blockiert sie

**Konfiguration:**

| Field           | Type       | Required | Description                                         |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | Yes      | Hook-Typ                                            |
| `prompt`        | `string`   | Yes      | An das LLM gesendeter Prompt. Verwende `$ARGUMENTS` für den Hook-Input |
| `model`         | `string`   | No       | Zu verwendendes Modell (Standard ist dein aktuelles Modell) |
| `timeout`       | `number`   | No       | Timeout in Sekunden, Standard 30                    |
| `name`          | `string`   | No       | Hook-Name (für Logging)                             |
| `description`   | `string`   | No       | Hook-Beschreibung                                   |
| `statusMessage` | `string`   | No       | Statusmeldung, die während der Ausführung angezeigt wird |

**Antwortformat:**

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
| `ok`                | `true` zum Erlauben/Fortfahren, `false` zum Blockieren/Stoppen             |
| `reason`            | Erforderlich, wenn `ok` `false` ist. Wird dem Modell angezeigt, um die Blockierung zu erklären |
| `additionalContext` | Optional. Zusätzlicher Kontext, der beim Erlauben in die Konversation injiziert wird |

**Unterstützte Ereignisse:**

Prompt Hooks können mit den meisten Hook-Ereignissen verwendet werden, einschließlich:

- `PreToolUse` - Auswerten, ob ein Tool-Aufruf erlaubt werden soll
- `PostToolUse` - Tool-Ergebnisse auswerten und ggf. Kontext injizieren
- `Stop` - Bestimmen, ob fortgefahren oder gestoppt werden soll
- `SubagentStop` - Subagent-Ergebnisse auswerten
- `UserPromptSubmit` - Benutzer-Prompts auswerten oder anreichern

**Beispiel: Stop Hook**

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

**Beispiel: PreToolUse Hook**

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

## Hook-Ereignisse

Hooks werden an bestimmten Punkten während einer Qwen Code-Session ausgelöst. Verschiedene Ereignisse unterstützen unterschiedliche Matcher, um Trigger-Bedingungen zu filtern.

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Vor der Tool-Ausführung                   | Tool-Name (`WriteFile`, `ReadFile`, `Bash`, usw.)         |
| `PostToolUse`        | Nach erfolgreicher Tool-Ausführung        | Tool-Name                                                 |
| `PostToolUseFailure` | Nach fehlgeschlagener Tool-Ausführung     | Tool-Name                                                 |
| `UserPromptSubmit`   | Nachdem der Benutzer den Prompt abgeschickt hat | Keine (wird immer ausgelöst)                      |
| `SessionStart`       | Wenn die Session startet oder fortgesetzt wird | Quelle (`startup`, `resume`, `clear`, `compact`)   |
| `SessionEnd`         | Wenn die Session endet                    | Grund (`clear`, `logout`, `prompt_input_exit`, usw.)      |
| `Stop`               | Wenn Claude die Antwort abschließen möchte | Keine (wird immer ausgelöst)                             |
| `SubagentStart`      | Wenn der Subagent startet                 | Agent-Typ (`Bash`, `Explorer`, `Plan`, usw.)              |
| `SubagentStop`       | Wenn der Subagent stoppt                  | Agent-Typ                                                 |
| `PreCompact`         | Vor der Konversations-Kompaktierung       | Trigger (`manual`, `auto`)                                |
| `Notification`       | Wenn Benachrichtigungen gesendet werden   | Typ (`permission_prompt`, `idle_prompt`, `auth_success`)  |
| `PermissionRequest`  | Wenn der Berechtigungsdialog angezeigt wird | Tool-Name                                               |
| `TodoCreated`        | Wenn ein neues Todo-Element erstellt wird | Keine (wird immer ausgelöst)                              |
| `TodoCompleted`      | Wenn ein Todo-Element als abgeschlossen markiert wird | Keine (wird immer ausgelöst)                    |
### Matcher-Pattern

`matcher` ist ein regulärer Ausdruck, der zum Filtern von Trigger-Bedingungen verwendet wird.

| Ereignistyp         | Ereignisse                                                             | Matcher-Unterstützung | Matcher-Ziel                                             |
| :------------------ | :--------------------------------------------------------------------- | :-------------------- | :------------------------------------------------------- |
| Tool-Events         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex              | Tool-Name: `WriteFile`, `ReadFile`, `Bash`, etc.         |
| Subagent-Events     | `SubagentStart`, `SubagentStop`                                        | ✅ Regex              | Agent-Typ: `Bash`, `Explorer`, etc.                      |
| Session-Events      | `SessionStart`                                                         | ✅ Regex              | Quelle: `startup`, `resume`, `clear`, `compact`          |
| Session-Events      | `SessionEnd`                                                           | ✅ Regex              | Grund: `clear`, `logout`, `prompt_input_exit`, etc.      |
| Notification-Events | `Notification`                                                         | ✅ Exakter Match      | Typ: `permission_prompt`, `idle_prompt`, `auth_success`  |
| Compact-Events      | `PreCompact`                                                           | ✅ Exakter Match      | Trigger: `manual`, `auto`                                |
| Todo-Events         | `TodoCreated`, `TodoCompleted`                                         | ❌ Nein               | N/A                                                      |
| Prompt-Events       | `UserPromptSubmit`                                                     | ❌ Nein               | N/A                                                      |
| Stop-Events         | `Stop`                                                                 | ❌ Nein               | N/A                                                      |

**Matcher-Syntax:**

- Ein leerer String `""` oder `"*"` stimmt mit allen Ereignissen dieses Typs überein
- Standard-Regex-Syntax wird unterstützt (z. B. `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

**Beispiele:**

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

## Input/Output-Regeln

### Hook-Input-Struktur

Alle Hooks erhalten standardisierte Inputs im JSON-Format über stdin (command) oder den POST-Body (http).

**Allgemeine Felder:**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Ereignisspezifische Felder werden je nach Hook-Typ hinzugefügt. Bei der Ausführung in einem Subagenten werden zusätzlich `agent_id` und `agent_type` eingeschlossen.

### Hook-Output-Struktur

Der Hook-Output wird über stdout (command) oder den HTTP-Response-Body (http) als JSON zurückgegeben.

**Exit-Code-Verhalten (Command-Hooks):**

| Exit-Code | Verhalten                                                                              |
| :-------- | :------------------------------------------------------------------------------------- |
| `0`       | Erfolg. JSON in `stdout` wird geparst, um das Verhalten zu steuern.                    |
| `2`       | **Blockierender Fehler**. Ignoriert `stdout`, übergibt `stderr` als Fehler-Feedback an das Modell. |
| Andere    | Nicht-blockierender Fehler. `stderr` wird nur im Debug-Modus angezeigt, die Ausführung wird fortgesetzt. |

**Output-Struktur:**

Der Hook-Output unterstützt drei Kategorien von Feldern:

1. **Allgemeine Felder**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Top-Level-Entscheidung**: `decision`, `reason` (wird von einigen Events verwendet)
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

### Details zu einzelnen Hook-Events

#### PreToolUse

**Zweck**: Wird ausgeführt, bevor ein Tool verwendet wird, um Berechtigungsprüfungen, Input-Validierung oder Context-Injection zu ermöglichen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**Output-Optionen**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" oder "ask" (ERFORDERLICH)
- `hookSpecificOutput.permissionDecisionReason`: Begründung für die Entscheidung (ERFORDERLICH)
- `hookSpecificOutput.updatedInput`: Modifizierte Tool-Input-Parameter, die anstelle der ursprünglichen verwendet werden sollen
- `hookSpecificOutput.additionalContext`: Zusätzliche Context-Informationen

Der `permissionDecision`-Wert steuert, ob das Tool ausgeführt wird:

- `"allow"` — Führt das Tool ohne die übliche Bestätigungsaufforderung aus.
- `"deny"` — Blockiert das Tool; es wird nicht ausgeführt und ein Fehler wird an das Modell zurückgegeben.
- `"ask"` — Pausiert und fordert den Benutzer auf, den Tool-Aufruf in der TUI zu bestätigen, bevor er ausgeführt wird. Bestätigen führt das Tool einmal aus; Ablehnen bricht es ab. In Kontexten, die keine Bestätigungsaufforderung ermöglichen können — Headless- (`--prompt`) Ausführungen und Hintergrund-Subagenten — fällt `"ask"` auf `"deny"` zurück.

**Hinweis**: Obwohl Standard-Hook-Output-Felder wie `decision` und `reason` technisch von der zugrunde liegenden Klasse unterstützt werden, erwartet das offizielle Interface das `hookSpecificOutput` mit `permissionDecision` und `permissionDecisionReason`.

**Beispiel-Output**:

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

**Zweck**: Wird ausgeführt, nachdem ein Tool erfolgreich abgeschlossen wurde, um Ergebnisse zu verarbeiten, Ausgaben zu loggen oder zusätzlichen Context zu injizieren.

**Ereignisspezifische Felder**:

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

**Output-Optionen**:

- `decision`: "allow", "deny", "block" (Standardmäßig "allow", wenn nicht angegeben)
- `reason`: Begründung für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzliche Informationen, die eingeschlossen werden sollen

**Beispiel-Output**:

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

**Zweck**: Wird ausgeführt, wenn eine Tool-Ausführung fehlschlägt, um Fehler zu behandeln, Benachrichtigungen zu senden oder Fehlschläge zu protokollieren.

**Ereignisspezifische Felder**:

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

**Output-Optionen**:

- `hookSpecificOutput.additionalContext`: Informationen zur Fehlerbehandlung
- Standard-Hook-Output-Felder

**Beispiel-Output**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Zweck**: Wird ausgeführt, wenn der Benutzer einen Prompt absendet, um den Input zu modifizieren, zu validieren oder anzureichern.

**Ereignisspezifische Felder**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Output-Optionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Menschlich lesbare Begründung für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzlicher Context, der an den Prompt angehängt wird (optional)

**Hinweis**: Da `UserPromptSubmitOutput` `HookOutput` erweitert, sind alle Standardfelder verfügbar, aber nur `additionalContext` in `hookSpecificOutput` ist spezifisch für dieses Event definiert.

**Beispiel-Output**:

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

**Zweck**: Wird ausgeführt, wenn eine neue Session startet, um Initialisierungsaufgaben durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Output-Optionen**:

- `hookSpecificOutput.additionalContext`: Context, der in der Session verfügbar sein soll
- Standard-Hook-Output-Felder

**Beispiel-Output**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Zweck**: Wird ausgeführt, wenn eine Session endet, um Aufräumaufgaben durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Output-Optionen**:

- Standard-Hook-Output-Felder (werden typischerweise nicht zum Blockieren verwendet)

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

Die Felder `context_usage`, `context_limit` und `input_tokens` ermöglichen es Hook-Skripten, die Context-Nutzung zu beobachten und benutzerdefinierte Compact-Strategien zu implementieren – zum Beispiel ein Skript, das eine Erinnerung ausgibt, `/compact` auszuführen, wenn die Nutzung einen benutzerdefinierten Schwellenwert überschreitet.

**Output-Optionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Menschlich lesbare Begründung für die Entscheidung
- `stopReason`: Feedback, das in die Stop-Antwort aufgenommen werden soll
- `continue`: Auf `false` setzen, um die Ausführung zu stoppen
- `hookSpecificOutput.additionalContext`: Zusätzliche Context-Informationen

**Hinweis**: Da `StopOutput` `HookOutput` erweitert, sind alle Standardfelder verfügbar, aber das Feld `stopReason` ist für dieses Event besonders relevant.

**Beispiel-Output**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Zweck**: Wird ausgeführt, wenn der Turn aufgrund eines API-Fehlers endet (anstelle von Stop). Dies ist ein **Fire-and-Forget**-Event – Hook-Output und Exit-Codes werden ignoriert.

**Ereignisspezifische Felder**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```
**Matcher**: Prüft gegen das `error`-Feld. Zum Beispiel löst `"matcher": "rate_limit"` nur bei Rate-Limit-Fehlern aus.

**Ausgabeoptionen**:

- **None** - StopFailure ist "fire-and-forget". Alle Hook-Ausgaben und Exit-Codes werden ignoriert.

**Exit-Code-Behandlung**:

| Exit-Code | Verhalten                 |
| --------- | ------------------------- |
| Beliebig  | Ignoriert (fire-and-forget) |

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

- Rate-Limit-Überwachung und -Alarmierung
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

- `hookSpecificOutput.additionalContext`: initialer Kontext für den Subagent
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

**Zweck**: Wird vor der Konversationskomprimierung ausgeführt, um die Komprimierung vorzubereiten oder zu protokollieren.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Kontext, der vor der Komprimierung eingefügt werden soll
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

**Zweck**: Wird nach Abschluss der Konversationskomprimierung ausgeführt, um Zusammenfassungen zu archivieren oder die Nutzung zu tracken.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Prüft gegen das `trigger`-Feld. Zum Beispiel löst `"matcher": "manual"` nur bei manueller Komprimierung über den `/compact`-Befehl aus.

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: zusätzlicher Kontext (nur zur Protokollierung)
- Standard-Hook-Ausgabefelder (nur zur Protokollierung)

> **Hinweis**: PostCompact steht **nicht** auf der Liste der offiziell unterstützten Ereignisse im Entscheidungsmodus. Das `decision`-Feld und andere Steuerungsfelder haben keine steuernde Wirkung – sie dienen ausschließlich der Protokollierung.

**Exit-Code-Behandlung**:

| Exit-Code | Verhalten                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Erfolg - stdout wird im Verbose-Modus dem Benutzer angezeigt            |
| Andere    | Nicht-blockierender Fehler - stderr wird im Verbose-Modus dem Benutzer angezeigt |

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
- Audit-Protokollierung für Komprimierungsvorgänge

#### Notification

**Zweck**: Wird ausgeführt, wenn Benachrichtigungen gesendet werden, um diese anzupassen oder abzufangen.

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

- `hookSpecificOutput.additionalContext`: zusätzliche Informationen, die eingefügt werden sollen
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

**Zweck**: Wird ausgeführt, wenn Berechtigungsdialoge angezeigt werden, um Entscheidungen zu automatisieren oder Berechtigungen zu aktualisieren.

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

**Zweck**: Wird ausgeführt, wenn ein neues Todo-Element über das `todo_write`-Tool erstellt wird. Ermöglicht Validierung, Protokollierung oder Blockierung der Todo-Erstellung.

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

Während der `validation`-Phase wird die Todo-Erstellung verhindert, wenn `decision` auf `block` oder `deny` (Exit-Code 2) gesetzt ist. Die Todo-Liste bleibt unverändert und der Grund wird als Feedback an das Modell übergeben.

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

**Zweck**: Wird ausgeführt, wenn ein Todo-Element als abgeschlossen markiert wird. Ermöglicht Validierung, Protokollierung oder Blockierung des Todo-Abschlusses.

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

Während der `validation`-Phase wird der Todo-Abschluss verhindert, wenn `decision` auf `block` oder `deny` (Exit-Code 2) gesetzt ist. Das Todo-Element bleibt in seinem vorherigen Status und der Grund wird als Feedback an das Modell übergeben.

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

- **Protokollierung**: Todo-Erstellung und -Abschluss für Audit- oder Analysezwecke tracken
- **Validierung**: Qualitätsstandards für Inhalte durchsetzen (Mindestlänge, erforderliche Schlüsselwörter)
- **Workflow-Steuerung**: Abschluss blockieren, bis Voraussetzungen erfüllt sind
- **Integration**: Todos mit externen Aufgabenmanagementsystemen synchronisieren (Jira, Trello usw.)

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

- Standardmäßig werden Hooks für eine bessere Performance parallel ausgeführt
- Verwende `sequential: true` in der Hook-Definition, um eine reihenfolgeabhängige Ausführung zu erzwingen
- Sequentielle Hooks können die Eingabe für nachfolgende Hooks in der Kette modifizieren

### Asynchrone Hooks

Nur der Typ `command` unterstützt asynchrone Ausführung. Das Setzen von `"async": true` führt den Hook im Hintergrund aus, ohne den Hauptfluss zu blockieren.

**Funktionen:**

- Kann keine Steuerungsentscheidung zurückgeben (die Operation wurde bereits ausgeführt)
- Ergebnisse werden im nächsten Konversationsdurchlauf über `systemMessage` oder `additionalContext` injiziert
- Geeignet für Auditing, Logging, Hintergrundtests usw.

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
- Timeouts verhindern hängende Hooks (Standard: 60 Sekunden)

## Best Practices

### Beispiel 1: Security-Validation-Hook

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

Konfiguration in `.qwen/settings.json`:

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

Ein PostToolUse-HTTP-Hook, der alle Tool-Ausführungsprotokolle an einen Remote-Audit-Dienst sendet:

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

### Beispiel 3: User-Prompt-Validation-Hook

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

## Troubleshooting

- Überprüfe die Anwendungslogs auf Details zur Hook-Ausführung
- Überprüfe die Berechtigungen und Ausführbarkeit der Hook-Skripte
- Stelle eine korrekte JSON-Formatierung in den Hook-Ausgaben sicher
- Verwende spezifische Matcher-Pattern, um eine unbeabsichtigte Hook-Ausführung zu vermeiden
- Verwende den `--debug`-Modus, um detaillierte Informationen zum Hook-Matching und zur Ausführung zu sehen
- Deaktiviere vorübergehend alle Hooks: füge `"disableAllHooks": true` in den Einstellungen hinzu