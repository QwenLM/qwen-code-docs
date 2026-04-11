# Qwen Code Hooks-Dokumentation

## Übersicht

Qwen Code Hooks bieten einen leistungsstarken Mechanismus zur Erweiterung und Anpassung des Verhaltens der Qwen Code-Anwendung. Hooks ermöglichen es Nutzern, benutzerdefinierte Skripte oder Programme an bestimmten Punkten im Anwendungslebenszyklus auszuführen, z. B. vor oder nach der Tool-Ausführung, beim Start/Ende einer Session oder während anderer wichtiger Ereignisse.

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

- die Tool-Nutzung zu überwachen und zu protokollieren
- Sicherheitsrichtlinien durchzusetzen
- zusätzlichen Kontext in Konversationen einzuspeisen
- das Anwendungsverhalten ereignisbasiert anzupassen
- sich in externe Systeme und Dienste zu integrieren
- Tool-Eingaben oder -Antworten programmatisch zu modifizieren

## Hook-Architektur

Das Hook-System von Qwen Code besteht aus mehreren Schlüsselkomponenten:

1. **Hook Registry**: Speichert und verwaltet alle konfigurierten Hooks
2. **Hook Planner**: Bestimmt, welche Hooks für jedes Ereignis ausgeführt werden sollen
3. **Hook Runner**: Führt einzelne Hooks mit dem entsprechenden Kontext aus
4. **Hook Aggregator**: Kombiniert Ergebnisse mehrerer Hooks
5. **Hook Event Handler**: Koordiniert das Auslösen von Hooks für Ereignisse

## Hook-Ereignisse

Hooks werden an bestimmten Stellen während einer Qwen Code-Session ausgelöst. Wenn ein Ereignis eintritt und ein Matcher übereinstimmt, übergibt Qwen Code JSON-Kontextdaten über das Ereignis an deinen Hook-Handler. Bei Command-Hooks erfolgt die Eingabe über stdin. Dein Handler kann die Eingabe prüfen, Aktionen ausführen und optional eine Entscheidung zurückgeben. Einige Ereignisse werden einmal pro Session ausgelöst, andere wiederholt innerhalb der agentic loop.

<div align="center">
<img src="https://img.alicdn.com/imgextra/i4/O1CN01sYWUTh1RDJl7Lz2ne_!!6000000002077-2-tps-812-1212.png" alt="Hook Lifecycle Diagram" width="400"/>
</div>

Die folgende Tabelle listet alle verfügbaren Hook-Ereignisse in Qwen Code auf:

| Ereignisname           | Beschreibung                                 | Anwendungsfall                                        |
| -------------------- | ------------------------------------------- | ----------------------------------------------- |
| `PreToolUse`         | Wird vor der Tool-Ausführung ausgelöst                 | Berechtigungsprüfung, Eingabevalidierung, Logging  |
| `PostToolUse`        | Wird nach erfolgreicher Tool-Ausführung ausgelöst       | Logging, Ausgabe-Verarbeitung, Monitoring          |
| `PostToolUseFailure` | Wird bei fehlgeschlagener Tool-Ausführung ausgelöst             | Fehlerbehandlung, Alarmierung, Fehlerbehebung           |
| `Notification`       | Wird beim Senden von Benachrichtigungen ausgelöst           | Anpassung von Benachrichtigungen, Logging             |
| `UserPromptSubmit`   | Wird beim Absenden eines Prompts durch den Nutzer ausgelöst            | Eingabeverarbeitung, Validierung, Kontext-Injektion |
| `SessionStart`       | Wird beim Start einer neuen Session ausgelöst             | Initialisierung, Kontext-Einrichtung                   |
| `Stop`               | Wird ausgelöst, bevor Qwen seine Antwort abschließt    | Finalisierung, Bereinigung                           |
| `SubagentStart`      | Wird beim Start eines Subagenten ausgelöst                | Subagenten-Initialisierung                         |
| `SubagentStop`       | Wird beim Beenden eines Subagenten ausgelöst                 | Subagenten-Finalisierung                           |
| `PreCompact`         | Wird vor der Konversations-Kompaktierung ausgelöst        | Verarbeitung vor der Kompaktierung                       |
| `SessionEnd`         | Wird beim Beenden einer Session ausgelöst                   | Bereinigung, Reporting                              |
| `PermissionRequest`  | Wird beim Anzeigen von Berechtigungsdialogen ausgelöst | Automatisierung von Berechtigungen, Richtliniendurchsetzung       |

## Eingabe-/Ausgaberegeln

### Hook-Eingabestruktur

Alle Hooks erhalten standardisierte Eingaben im JSON-Format über stdin. Folgende Felder sind in jedem Hook-Ereignis enthalten:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Ereignisspezifische Felder werden je nach Hook-Typ hinzugefügt. Nachfolgend findest du die ereignisspezifischen Felder für jedes Hook-Ereignis:

### Details zu einzelnen Hook-Ereignissen

#### PreToolUse

**Zweck**: Wird vor der Verwendung eines Tools ausgeführt, um Berechtigungsprüfungen, Eingabevalidierungen oder Kontext-Injektionen zu ermöglichen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" oder "ask" (ERFORDERLICH)
- `hookSpecificOutput.permissionDecisionReason`: Begründung für die Entscheidung (ERFORDERLICH)
- `hookSpecificOutput.updatedInput`: Modifizierte Tool-Eingabeparameter, die anstelle des Originals verwendet werden
- `hookSpecificOutput.additionalContext`: Zusätzliche Kontextinformationen

**Hinweis**: Obwohl standardmäßige Hook-Ausgabefelder wie `decision` und `reason` von der zugrunde liegenden Klasse technisch unterstützt werden, erwartet das offizielle Interface `hookSpecificOutput` mit `permissionDecision` und `permissionDecisionReason`.

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Zweck**: Wird nach erfolgreicher Tool-Ausführung ausgeführt, um Ergebnisse zu verarbeiten, Ausgaben zu protokollieren oder zusätzlichen Kontext einzuspeisen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny" oder "block" (Standard ist "allow", falls nicht angegeben)
- `reason`: Begründung für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzliche Informationen, die eingebunden werden sollen

**Beispielausgabe**:

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

**Zweck**: Wird bei fehlgeschlagener Tool-Ausführung ausgeführt, um Fehler zu behandeln, Warnungen zu senden oder Fehler zu protokollieren.

**Ereignisspezifische Felder**:

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

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Informationen zur Fehlerbehandlung
- Standardmäßige Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Zweck**: Wird ausgeführt, wenn der Nutzer einen Prompt absendet, um die Eingabe zu modifizieren, zu validieren oder anzureichern.

**Ereignisspezifische Felder**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Für Menschen lesbare Begründung der Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzlicher Kontext, der an den Prompt angehängt wird (optional)

**Hinweis**: Da `UserPromptSubmitOutput` von `HookOutput` erbt, sind alle Standardfelder verfügbar, aber nur `additionalContext` in `hookSpecificOutput` ist spezifisch für dieses Ereignis definiert.

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

**Zweck**: Wird beim Start einer neuen Session ausgeführt, um Initialisierungsaufgaben durchzuführen.

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

- `hookSpecificOutput.additionalContext`: Kontext, der in der Session verfügbar sein soll
- Standardmäßige Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Zweck**: Wird beim Beenden einer Session ausgeführt, um Bereinigungsaufgaben durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Ausgabeoptionen**:

- Standardmäßige Hook-Ausgabefelder (werden typischerweise nicht zum Blockieren verwendet)

#### Stop

**Zweck**: Wird ausgeführt, bevor Qwen seine Antwort abschließt, um finales Feedback oder Zusammenfassungen bereitzustellen.

**Ereignisspezifische Felder**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Für Menschen lesbare Begründung der Entscheidung
- `stopReason`: Feedback, das in die Stop-Antwort aufgenommen werden soll
- `continue`: Auf `false` setzen, um die Ausführung zu stoppen
- `hookSpecificOutput.additionalContext`: Zusätzliche Kontextinformationen

**Hinweis**: Da `StopOutput` von `HookOutput` erbt, sind alle Standardfelder verfügbar, aber das Feld `stopReason` ist für dieses Ereignis besonders relevant.

**Beispielausgabe**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### SubagentStart

**Zweck**: Wird beim Start eines Subagenten (z. B. des Task-Tools) ausgeführt, um Kontext oder Berechtigungen einzurichten.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Initialer Kontext für den Subagenten
- Standardmäßige Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Zweck**: Wird beim Beenden eines Subagenten ausgeführt, um Finalisierungsaufgaben durchzuführen.

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
- `reason`: Für Menschen lesbare Begründung der Entscheidung

**Beispielausgabe**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Zweck**: Wird vor der Konversations-Kompaktierung ausgeführt, um diese vorzubereiten oder zu protokollieren.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Kontext, der vor der Kompaktierung eingebunden werden soll
- Standardmäßige Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

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

> **Hinweis**: Der Typ `elicitation_dialog` ist definiert, wird aber derzeit nicht implementiert.

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Zusätzliche Informationen, die eingebunden werden sollen
- Standardmäßige Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Zweck**: Wird beim Anzeigen von Berechtigungsdialogen ausgeführt, um Entscheidungen zu automatisieren oder Berechtigungen zu aktualisieren.

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

- `hookSpecificOutput.decision`: Strukturiertes Objekt mit Details zur Berechtigungsentscheidung:
  - `behavior`: "allow" oder "deny"
  - `updatedInput`: Modifizierte Tool-Eingabe (optional)
  - `updatedPermissions`: Modifizierte Berechtigungen (optional)
  - `message`: Nachricht, die dem Nutzer angezeigt wird (optional)
  - `interrupt`: Gibt an, ob der Workflow unterbrochen werden soll (optional)

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

## Hook-Konfiguration

Hooks werden in den Qwen Code-Einstellungen konfiguriert, typischerweise in `.qwen/settings.json` oder Benutzerkonfigurationsdateien:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$", // Regex to match tool names
        "sequential": false, // Whether to run hooks sequentially
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
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

### Matcher-Muster

Matcher ermöglichen das Filtern von Hooks basierend auf dem Kontext. Nicht alle Hook-Ereignisse unterstützen Matcher:

| Ereignistyp          | Ereignisse                                                                 | Matcher-Unterstützung | Matcher-Ziel (Werte)                                                                |
| ------------------- | ---------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| Tool-Ereignisse         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Ja (Regex)  | Tool-Name: `bash`, `read_file`, `write_file`, `edit`, `glob`, `grep_search` usw.      |
| Subagenten-Ereignisse     | `SubagentStart`, `SubagentStop`                                        | ✅ Ja (Regex)  | Agenten-Typ: `Bash`, `Explorer` usw.                                                   |
| Session-Ereignisse      | `SessionStart`                                                         | ✅ Ja (Regex)  | Quelle: `startup`, `resume`, `clear`, `compact`                                        |
| Session-Ereignisse      | `SessionEnd`                                                           | ✅ Ja (Regex)  | Grund: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| Benachrichtigungs-Ereignisse | `Notification`                                                         | ✅ Ja (exakt)  | Typ: `permission_prompt`, `idle_prompt`, `auth_success`                               |
| Kompaktierungs-Ereignisse      | `PreCompact`                                                           | ✅ Ja (exakt)  | Auslöser: `manual`, `auto`                                                              |
| Prompt-Ereignisse       | `UserPromptSubmit`                                                     | ❌ Nein           | N/A                                                                                    |
| Stop-Ereignisse         | `Stop`                                                                 | ❌ Nein           | N/A                                                                                    |

**Matcher-Syntax**:

- Regex-Muster, das mit dem Zielfeld abgeglichen wird
- Leerer String `""` oder `"*"` stimmt mit allen Ereignissen dieses Typs überein
- Standard-Regex-Syntax wird unterstützt (z. B. `^bash$`, `read.*`, `(bash|run_shell_command)`)

**Beispiele**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$",           // Only match bash tool
        "hooks": [...]
      },
      {
        "matcher": "read.*",           // Match read_file, read_multiple_files, etc.
        "hooks": [...]
      },
      {
        "matcher": "",                 // Match all tools (same as "*" or omitting matcher)
        "hooks": [...]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$", // Only match Bash and Explorer agents
        "hooks": [...]
      }
    ],
    "SessionStart": [
      {
        "matcher": "^(startup|resume)$", // Only match startup and resume sources
        "hooks": [...]
      }
    ]
  }
}
```

## Hook-Ausführung

### Parallele vs. sequenzielle Ausführung

- Standardmäßig werden Hooks parallel ausgeführt, um die Leistung zu optimieren
- Verwende `sequential: true` in der Hook-Definition, um eine reihenfolgenabhängige Ausführung zu erzwingen
- Sequentielle Hooks können die Eingabe für nachfolgende Hooks in der Kette modifizieren

### Sicherheitsmodell

- Hooks laufen in der Umgebung des Nutzers mit dessen Berechtigungen
- Hooks auf Projektebene erfordern den Status eines vertrauenswürdigen Ordners
- Timeouts verhindern hängende Hooks (Standard: 60 Sekunden)

### Exit-Codes

Hook-Skripte kommunizieren ihr Ergebnis über Exit-Codes:

| Exit-Code | Bedeutung            | Verhalten                                        |
| --------- | ------------------ | ----------------------------------------------- |
| `0`       | Erfolg            | stdout/stderr werden nicht angezeigt                         |
| `2`       | Blockierender Fehler     | stderr wird dem Modell angezeigt und der Tool-Aufruf wird blockiert        |
| Andere     | Nicht-blockierender Fehler | stderr wird nur dem Nutzer angezeigt, der Tool-Aufruf wird jedoch fortgesetzt |

**Beispiele**:

```bash
#!/bin/bash

# Success (exit 0 is default, can be omitted)
echo '{"decision": "allow"}'
exit 0

# Blocking error - prevents operation
echo "Dangerous operation blocked by security policy" >&2
exit 2
```

> **Hinweis**: Wenn kein Exit-Code angegeben wird, verwendet das Skript standardmäßig `0` (Erfolg).

## Best Practices

### Beispiel 1: Hook zur Sicherheitsvalidierung

Ein PreToolUse-Hook, der gefährliche Befehle protokolliert und gegebenenfalls blockiert:

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
    "decision": "deny",
    "reason": "Potentially dangerous operation detected",
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Dangerous command blocked by security policy"
    }
  }'
  exit 2  # Blocking error
fi

# Allow the operation with a log
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "decision": "allow",
  "reason": "Operation approved by security checker",
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

### Beispiel 2: Hook zur Validierung von Nutzer-Prompts

Ein UserPromptSubmit-Hook, der Nutzer-Prompts auf sensible Informationen prüft und bei langen Prompts Kontext bereitstellt:

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
- Verwende spezifische Matcher-Muster, um eine unbeabsichtigte Hook-Ausführung zu vermeiden