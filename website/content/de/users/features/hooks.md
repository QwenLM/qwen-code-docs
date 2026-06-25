# Qwen Code Hooks

## Übersicht

Qwen Code Hooks bieten einen leistungsstarken Mechanismus zur Erweiterung und Anpassung des Verhaltens der Qwen Code-Anwendung. Hooks ermöglichen es Benutzern, benutzerdefinierte Skripte oder Programme an bestimmten Punkten im Lebenszyklus der Anwendung auszuführen – z. B. vor der Toolausführung, nach der Toolausführung, beim Start/Ende einer Sitzung oder während anderer wichtiger Ereignisse.

Hooks sind standardmäßig aktiviert. Sie können vorübergehend alle Hooks deaktivieren, indem Sie `disableAllHooks` in Ihrer Einstellungsdatei auf `true` setzen (auf der obersten Ebene, zusammen mit `hooks`):

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

Dadurch werden alle Hooks deaktiviert, ohne dass ihre Konfigurationen gelöscht werden.

## Was sind Hooks?

Hooks sind benutzerdefinierte Skripte oder Programme, die von Qwen Code automatisch an vordefinierten Punkten im Anwendungsablauf ausgeführt werden. Sie ermöglichen es Benutzern:

- Toolnutzung zu überwachen und zu prüfen
- Sicherheitsrichtlinien durchzusetzen
- Zusätzlichen Kontext in Gespräche einzubringen
- Das Anwendungsverhalten basierend auf Ereignissen anzupassen
- Integration mit externen Systemen und Diensten
- Tool-Eingaben oder Antworten programmatisch zu ändern

## Hook-Typen

Qwen Code unterstützt vier Hook-Ausführertypen:

| Typ        | Beschreibung                                                                                         |
| :--------- | :--------------------------------------------------------------------------------------------------- |
| `command`  | Führt einen Shell-Befehl aus. Erhält JSON über `stdin`, gibt Ergebnisse über `stdout` zurück.       |
| `http`     | Sendet JSON als `POST`-Request-Body an eine angegebene URL. Antwort über HTTP-Response-Body.        |
| `function` | Ruft direkt eine registrierte JavaScript-Funktion auf (nur sitzungsbezogene Hooks).                 |
| `prompt`   | Nutzt ein LLM, um Hook-Eingaben auszuwerten und eine Entscheidung zurückzugeben.                    |

### Command Hooks

Command Hooks führen Befehle über Kindprozesse aus. Die JSON-Eingabe wird über stdin übergeben, die Ausgabe erfolgt über stdout.

**Konfiguration:**

| Feld             | Typ                      | Erforderlich | Beschreibung                                      |
| :--------------- | :----------------------- | :----------- | :------------------------------------------------ |
| `type`           | `"command"`              | Ja           | Hook-Typ                                         |
| `command`        | `string`                 | Ja           | Auszuführender Befehl                            |
| `name`           | `string`                 | Nein         | Hook-Name (für Logging)                           |
| `description`    | `string`                 | Nein         | Hook-Beschreibung                                 |
| `timeout`        | `number`                 | Nein         | Timeout in Millisekunden, Standard 60000          |
| `async`          | `boolean`                | Nein         | Ob der Hook asynchron im Hintergrund läuft        |
| `env`            | `Record<string, string>` | Nein         | Umgebungsvariablen                                |
| `shell`          | `"bash" \| "powershell"` | Nein         | Zu verwendende Shell                              |
| `statusMessage`  | `string`                 | Nein         | Statusmeldung, die während der Ausführung angezeigt wird |

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

HTTP Hooks senden Hook-Eingaben als POST-Requests an bestimmte URLs. Sie unterstützen URL-Whitelists, SSRF-Schutz auf DNS-Ebene, Interpolation von Umgebungsvariablen und weitere Sicherheitsfunktionen.

**Konfiguration:**

| Feld              | Typ                      | Erforderlich | Beschreibung                                                     |
| :---------------- | :------------------------ | :----------- | :--------------------------------------------------------------- |
| `type`            | `"http"`                 | Ja           | Hook-Typ                                                        |
| `url`             | `string`                 | Ja           | Ziel-URL                                                        |
| `headers`         | `Record<string, string>` | Nein         | Request-Header (unterstützt Interpolation von Umgebungsvariablen) |
| `allowedEnvVars`  | `string[]`               | Nein         | Whitelist der in URL/Headern erlaubten Umgebungsvariablen        |
| `timeout`         | `number`                 | Nein         | Timeout in Sekunden, Standard 600                               |
| `name`            | `string`                 | Nein         | Hook-Name (für Logging)                                          |
| `statusMessage`   | `string`                 | Nein         | Statusmeldung, die während der Ausführung angezeigt wird          |
| `once`            | `boolean`                | Nein         | Nur einmal pro Ereignis und Sitzung ausführen (nur HTTP Hooks)   |

**Sicherheitsfunktionen:**

- **URL-Whitelist**: Konfigurieren Sie erlaubte URL-Muster über `allowedUrls`
- **SSRF-Schutz**: Blockiert private IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.), erlaubt aber Loopback-Adressen (127.0.0.1, ::1)
- **DNS-Validierung**: Überprüft die Domainauflösung vor Requests, um DNS-Rebinding-Angriffe zu verhindern
- **Interpolation von Umgebungsvariablen**: `${VAR}`-Syntax, erlaubt nur Variablen in der `allowedEnvVars`-Whitelist
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

### Funktions-Hooks

Funktions-Hooks rufen direkt registrierte JavaScript/TypeScript-Funktionen auf. Sie werden intern vom Skill-System verwendet und sind derzeit nicht als öffentliche API für Endbenutzer freigegeben.

**Hinweis**: Verwenden Sie für die meisten Anwendungsfälle stattdessen **Befehls-Hooks** oder **HTTP-Hooks**, die in den Einstellungsdateien konfiguriert werden können.

### Prompt-Hooks

Prompt-Hooks verwenden ein LLM, um Hook-Eingaben auszuwerten und eine Entscheidung zu treffen. Dies ist nützlich, um intelligente Entscheidungen basierend auf dem Kontext zu treffen, z. B. ob ein Vorgang erlaubt oder blockiert werden soll.

**So funktioniert es:**

1. Das Hook-Eingabe-JSON wird mit dem Platzhalter `$ARGUMENTS` in Ihren Prompt eingefügt.
2. Der Prompt wird an ein LLM gesendet (Standard: Ihr aktuelles Modell).
3. Das LLM gibt eine JSON-Antwort mit der Entscheidung zurück.
4. Qwen Code verarbeitet die Entscheidung und setzt die Ausführung entsprechend fort oder blockiert sie.

**Konfiguration:**

| Feld             | Typ        | Erforderlich | Beschreibung                                                         |
| :--------------- | :--------- | :----------- | :------------------------------------------------------------------- |
| `type`           | `"prompt"` | Ja           | Hook-Typ                                                             |
| `prompt`         | `string`   | Ja           | An LLM gesendeter Prompt. Verwenden Sie `$ARGUMENTS` für Hook-Eingaben |
| `model`          | `string`   | Nein         | Zu verwendendes Modell (Standard: Ihr aktuelles Modell)              |
| `timeout`        | `number`   | Nein         | Timeout in Sekunden, Standard 30                                     |
| `name`           | `string`   | Nein         | Hook-Name (für Protokollierung)                                      |
| `description`    | `string`   | Nein         | Hook-Beschreibung                                                    |
| `statusMessage`  | `string`   | Nein         | Statusmeldung, die während der Ausführung angezeigt wird             |

**Antwortformat:**

Das LLM muss JSON mit der folgenden Struktur zurückgeben:

```json
{
  "ok": true,
  "reason": "Erklärung der Entscheidung",
  "additionalContext": "Optionaler Kontext, der in die Konversation eingefügt wird"
}
```

| Feld                | Beschreibung                                                                        |
| :------------------ | :---------------------------------------------------------------------------------- |
| `ok`                | `true` zum Erlauben/Fortsetzen, `false` zum Blockieren/Stoppen                     |
| `reason`            | Erforderlich, wenn `ok` `false` ist. Wird dem Modell gezeigt, um die Blockierung zu erklären |
| `additionalContext` | Optional. Zusätzlicher Kontext, der in die Konversation eingefügt wird, wenn erlaubt wird |

**Unterstützte Ereignisse:**

Prompt-Hooks können mit den meisten Hook-Ereignissen verwendet werden, darunter:

- `PreToolUse` – Bewerten, ob ein Tool-Aufruf erlaubt werden soll
- `PostToolUse` – Tool-Ergebnisse auswerten und ggf. Kontext einfügen
- `Stop` – Entscheiden, ob fortgesetzt oder gestoppt werden soll
- `SubagentStop` – Subagent-Ergebnisse auswerten
- `UserPromptSubmit` – Benutzer-Prompts auswerten oder anreichern

**Beispiel: Stop-Hook**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Sie bewerten, ob Qwen Code die Arbeit einstellen soll. Kontext: $ARGUMENTS\n\nAnalysieren Sie die Konversation und bestimmen Sie, ob:\n1. Alle vom Benutzer angeforderten Aufgaben abgeschlossen sind\n2. Fehler behoben werden müssen\n3. Nacharbeiten erforderlich sind\n\nAntworten Sie mit JSON: {\"ok\": true} um das Stoppen zu erlauben, oder {\"ok\": false, \"reason\": \"Ihre Erklärung\"} um weiterzuarbeiten.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Wenn `ok` `false` ist, arbeitet Qwen Code weiter und verwendet den `reason` als Kontext für die nächste Antwort.

**Beispiel: PreToolUse-Hook**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Bewerten Sie diesen Tool-Aufruf auf Sicherheitsbedenken. Tool-Eingabe: $ARGUMENTS\n\nPrüfen Sie auf:\n- Gefährliche Befehle (rm -rf, curl | sh usw.)\n- Unberechtigte Zugriffsversuche\n- Datenexfiltrationsmuster\n\nAntworten Sie mit {\"ok\": true} wenn sicher, oder {\"ok\": false, \"reason\": \"Bedenken\"} wenn blockiert.",
            "model": "sonnet",
            "timeout": 30,
            "name": "sicherheitsbewertung"
          }
        ]
      }
    ]
  }
}
```

## Hook-Ereignisse

Hooks werden an bestimmten Punkten während einer Qwen Code-Sitzung ausgelöst. Verschiedene Ereignisse unterstützen unterschiedliche Matcher, um Auslösebedingungen zu filtern.

| Ereignis              | Ausgelöst bei                                        | Matcher-Ziel                                                       |
| :-------------------- | :--------------------------------------------------- | :----------------------------------------------------------------- |
| `PreToolUse`          | Vor der Tool-Ausführung                              | Tool-Name (`WriteFile`, `ReadFile`, `Bash`, etc.)                  |
| `PostToolUse`         | Nach erfolgreicher Tool-Ausführung                   | Tool-Name                                                          |
| `PostToolUseFailure`  | Nach fehlgeschlagener Tool-Ausführung                | Tool-Name                                                          |
| `UserPromptSubmit`    | Nachdem der Benutzer einen Prompt eingegeben hat      | Keine (wird immer ausgelöst)                                       |
| `SessionStart`        | Wenn die Sitzung startet oder fortgesetzt wird       | Quelle (`startup`, `resume`, `clear`, `compact`)                   |
| `SessionEnd`          | Wenn die Sitzung endet                               | Grund (`clear`, `logout`, `prompt_input_exit`, etc.)               |
| `Stop`                | Wenn Claude sich darauf vorbereitet, die Antwort abzuschließen | Keine (wird immer ausgelöst)                                       |
| `SubagentStart`       | Wenn ein Subagent startet                            | Agententyp (`Bash`, `Explorer`, `Plan`, etc.)                      |
| `SubagentStop`        | Wenn ein Subagent stoppt                             | Agententyp                                                         |
| `PreCompact`          | Vor der Konversationskomprimierung                   | Auslöser (`manual`, `auto`)                                        |
| `Notification`        | Wenn Benachrichtigungen gesendet werden               | Typ (`permission_prompt`, `idle_prompt`, `auth_success`)           |
| `PermissionRequest`   | Wenn der Berechtigungsdialog angezeigt wird           | Tool-Name                                                          |
| `TodoCreated`         | Wenn ein neuer Todo-Eintrag erstellt wird             | Keine (wird immer ausgelöst)                                       |
| `TodoCompleted`       | Wenn ein Todo-Eintrag als erledigt markiert wird      | Keine (wird immer ausgelöst)                                       |
### Matcher-Muster

`matcher` ist ein regulärer Ausdruck, der zum Filtern von Auslösebedingungen verwendet wird.

| Ereignistyp          | Ereignisse                                                             | Matcher-Unterstützung | Matcher-Ziel                                              |
| :------------------- | :--------------------------------------------------------------------- | :-------------------- | :-------------------------------------------------------- |
| Tool-Ereignisse      | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex              | Tool-Name: `WriteFile`, `ReadFile`, `Bash`, usw.         |
| Subagent-Ereignisse  | `SubagentStart`, `SubagentStop`                                        | ✅ Regex              | Agententyp: `Bash`, `Explorer`, usw.                     |
| Sitzungsereignisse   | `SessionStart`                                                         | ✅ Regex              | Quelle: `startup`, `resume`, `clear`, `compact`          |
| Sitzungsereignisse   | `SessionEnd`                                                           | ✅ Regex              | Grund: `clear`, `logout`, `prompt_input_exit`, usw.      |
| Benachrichtigungs- ereignisse | `Notification`                                                 | ✅ Exakte Übereinstimmung | Typ: `permission_prompt`, `idle_prompt`, `auth_success` |
| Komprimierungs- ereignisse | `PreCompact`                                                    | ✅ Exakte Übereinstimmung | Auslöser: `manual`, `auto`                               |
| Todo-Ereignisse      | `TodoCreated`, `TodoCompleted`                                         | ❌ Nein                | N/A                                                       |
| Prompt-Ereignisse    | `UserPromptSubmit`                                                     | ❌ Nein                | N/A                                                       |
| Stopp-Ereignisse     | `Stop`                                                                 | ❌ Nein                | N/A                                                       |

**Matcher-Syntax:**

- Leerer String `""` oder `"*"` passt auf alle Ereignisse dieses Typs
- Standard-Regex-Syntax wird unterstützt (z.B. `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

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

## Eingabe-/Ausgaberegeln

### Hook-Eingabestruktur

Alle Hooks erhalten standardisierte Eingaben im JSON-Format über stdin (Befehl) oder POST-Body (http).

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

Ereignisspezifische Felder werden basierend auf dem Hook-Typ hinzugefügt. Bei Ausführung in einem Subagenten werden zusätzlich `agent_id` und `agent_type` eingefügt.

### Hook-Ausgabestruktur

Die Hook-Ausgabe wird über `stdout` (Befehl) oder HTTP-Antwortbody (http) als JSON zurückgegeben.

**Verhalten bei Exit-Codes (Befehls-Hooks):**

| Exit-Code | Verhalten                                                                              |
| :-------- | :------------------------------------------------------------------------------------- |
| `0`       | Erfolg. JSON aus `stdout` parsen, um das Verhalten zu steuern.                         |
| `2`       | **Blockierender Fehler**. Ignoriert `stdout`, gibt `stderr` als Fehlerrückmeldung an das Modell. |
| Andere    | Nicht blockierender Fehler. `stderr` wird nur im Debug-Modus angezeigt, Ausführung wird fortgesetzt. |

**Ausgabestruktur:**

Die Hook-Ausgabe unterstützt drei Kategorien von Feldern:

1. **Allgemeine Felder**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Entscheidung auf oberster Ebene**: `decision`, `reason` (von einigen Ereignissen verwendet)
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

### Details zu einzelnen Hook-Ereignissen

#### PreToolUse

**Zweck**: Wird vor der Verwendung eines Tools ausgeführt, um Berechtigungsprüfungen, Eingabevalidierung oder Kontextinjektion zu ermöglichen.

**Ereignisspezifische Felder:**

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```
**Ausgabeoptionen**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" oder "ask" (ERFORDERLICH)
- `hookSpecificOutput.permissionDecisionReason`: Begründung für die Entscheidung (ERFORDERLICH)
- `hookSpecificOutput.updatedInput`: geänderte Tool-Eingabeparameter, die anstelle der ursprünglichen verwendet werden sollen
- `hookSpecificOutput.additionalContext`: zusätzliche Kontextinformationen

**Hinweis**: Während Standard-Hook-Ausgabefelder wie `decision` und `reason` technisch von der zugrunde liegenden Klasse unterstützt werden, erwartet das offizielle Interface `hookSpecificOutput` mit `permissionDecision` und `permissionDecisionReason`.

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Sicherheitsrichtlinie blockiert Datenbankschreibvorgänge",
    "additionalContext": "Aktuelle Umgebung: Produktion. Mit Vorsicht vorgehen."
  }
}
```

#### PostToolUse

**Zweck**: Wird ausgeführt, nachdem ein Tool erfolgreich abgeschlossen wurde, um Ergebnisse zu verarbeiten, Ergebnisse zu protokollieren oder zusätzlichen Kontext einzufügen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "Name des ausgeführten Tools",
  "tool_input": "Objekt mit den Eingabeparametern des Tools",
  "tool_response": "Objekt mit der Antwort des Tools",
  "tool_use_id": "Eindeutige Kennung für diese Tool-Nutzungsinstanz (internes Format, z. B. toolu_xxx)",
  "tool_call_id": "Ursprüngliche API-Aufruf-ID des LLM-Anbieters (z. B. call_xxx für OpenAI/Qwen) (optional)"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" (Standard: "allow", falls nicht angegeben)
- `reason`: Grund für die Entscheidung
- `hookSpecificOutput.additionalContext`: zusätzliche Informationen, die eingefügt werden sollen

**Beispielausgabe**:

```json
{
  "decision": "allow",
  "reason": "Tool erfolgreich ausgeführt",
  "hookSpecificOutput": {
    "additionalContext": "Dateiänderung im Prüfprotokoll aufgezeichnet"
  }
}
```

#### PostToolUseFailure

**Zweck**: Wird ausgeführt, wenn eine Tool-Ausführung fehlschlägt, um Fehler zu behandeln, Benachrichtigungen zu senden oder Fehlschläge zu protokollieren.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "Eindeutige Kennung für die Tool-Nutzung (internes Format, z. B. toolu_xxx)",
  "tool_call_id": "Ursprüngliche API-Aufruf-ID des LLM-Anbieters (z. B. call_xxx für OpenAI/Qwen) (optional)",
  "tool_name": "Name des fehlgeschlagenen Tools",
  "tool_input": "Objekt mit den Eingabeparametern des Tools",
  "error": "Fehlermeldung, die den Fehler beschreibt",
  "is_interrupt": "Boolescher Wert, der angibt, ob der Fehler auf eine Unterbrechung durch den Benutzer zurückzuführen ist (optional)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Informationen zur Fehlerbehandlung
- Standard-Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Fehler: Datei nicht gefunden. Fehler im Überwachungssystem protokolliert."
  }
}
```

#### UserPromptSubmit

**Zweck**: Wird ausgeführt, wenn der Benutzer eine Eingabeaufforderung sendet, um die Eingabe zu ändern, zu validieren oder anzureichern.

**Ereignisspezifische Felder**:

```json
{
  "prompt": "Der vom Benutzer übermittelte Prompt-Text"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Für Menschen lesbare Erklärung der Entscheidung
- `hookSpecificOutput.additionalContext`: zusätzlicher Kontext, der an den Prompt angehängt werden soll (optional)

**Hinweis**: Da UserPromptSubmitOutput von HookOutput erbt, sind alle Standardfelder verfügbar, aber nur additionalContext in hookSpecificOutput ist speziell für dieses Ereignis definiert.

**Beispielausgabe**:

```json
{
  "decision": "allow",
  "reason": "Prompt überprüft und genehmigt",
  "hookSpecificOutput": {
    "additionalContext": "Denken Sie daran, die unternehmensinternen Codierungsstandards zu befolgen."
  }
}
```

#### SessionStart

**Zweck**: Wird ausgeführt, wenn eine neue Sitzung beginnt, um Initialisierungsaufgaben durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "Das verwendete Modell",
  "agent_type": "Der Typ des Agenten, falls zutreffend (optional)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Kontext, der in der Sitzung verfügbar sein soll
- Standard-Hook-Ausgabefelder

**Beispielausgabe**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Sitzung mit aktivierten Sicherheitsrichtlinien gestartet."
  }
}
```

#### SessionEnd

**Zweck**: Wird ausgeführt, wenn eine Sitzung endet, um Aufräumarbeiten durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Ausgabeoptionen**:

- Standard-Hook-Ausgabefelder (normalerweise nicht zum Blockieren verwendet)

#### Stop

**Zweck**: Wird ausgeführt, bevor Qwen seine Antwort zusammenfasst, um abschließendes Feedback oder Zusammenfassungen zu liefern.

**Ereignisspezifische Felder**:

```json
{
  "stop_hook_active": "Boolescher Wert, der angibt, ob der Stop-Hook aktiv ist",
  "last_assistant_message": "Die letzte Nachricht des Assistenten"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Für Menschen lesbare Erklärung der Entscheidung
- `stopReason`: Feedback, das in die Stop-Antwort aufgenommen werden soll
- `continue`: auf false setzen, um die Ausführung zu stoppen
- `hookSpecificOutput.additionalContext`: zusätzliche Kontextinformationen
**Hinweis**: Da StopOutput von HookOutput erbt, sind alle Standardfelder verfügbar, aber das Feld stopReason ist für dieses Ereignis besonders relevant.

**Beispielausgabe**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Zweck**: Wird ausgeführt, wenn die Runde aufgrund eines API-Fehlers endet (anstelle von Stop). Dies ist ein **Fire-and-Forget**-Ereignis – Hook-Ausgabe und Exit-Codes werden ignoriert.

**Ereignisspezifische Felder**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: Vergleicht mit dem `error`-Feld. Zum Beispiel wird `"matcher": "rate_limit"` nur bei Rate-Limit-Fehlern ausgelöst.

**Ausgabeoptionen**:

- **Keine** – StopFailure ist Fire-and-Forget. Alle Hook-Ausgaben und Exit-Codes werden ignoriert.

**Exit-Code-Handhabung**:

| Exit-Code | Verhalten                     |
| --------- | ----------------------------- |
| Beliebig  | Ignoriert (Fire-and-Forget)   |

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

- Rate-Limit-Überwachung und -Benachrichtigung
- Protokollierung von Authentifizierungsfehlern
- Benachrichtigungen bei Abrechnungsfehlern
- Sammlung von Fehlerstatistiken

#### SubagentStart

**Zweck**: Wird ausgeführt, wenn ein Subagent (z. B. das Task-Tool) gestartet wird, um Kontext oder Berechtigungen einzurichten.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: anfänglicher Kontext für den Subagenten
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

**Zweck**: Wird ausgeführt, wenn ein Subagent beendet wird, um Abschlussaufgaben durchzuführen.

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

**Zweck**: Wird ausgeführt, nachdem die Konversationskomprimierung abgeschlossen ist, um Zusammenfassungen zu archivieren oder die Nutzung zu verfolgen.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Vergleicht mit dem `trigger`-Feld. Zum Beispiel wird `"matcher": "manual"` nur bei manueller Komprimierung über den Befehl `/compact` ausgelöst.

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: zusätzlicher Kontext (nur zur Protokollierung)
- Standard-Hook-Ausgabefelder (nur zur Protokollierung)

**Hinweis**: PostCompact ist **nicht** in der offiziellen Liste der unterstützten Ereignisse im Entscheidungsmodus. Das `decision`-Feld und andere Steuerfelder haben keine Steuerwirkung – sie dienen nur zu Protokollierungszwecken.

**Exit-Code-Handhabung**:

| Exit-Code | Verhalten                                                        |
| --------- | ---------------------------------------------------------------- |
| 0         | Erfolg – stdout wird dem Benutzer im ausführlichen Modus angezeigt |
| Andere    | Nicht blockierender Fehler – stderr wird dem Benutzer im ausführlichen Modus angezeigt |

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
- Verfolgung von Nutzungsstatistiken
- Überwachung von Kontextänderungen
- Audit-Logging für Komprimierungsvorgänge
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

> **Hinweis**: Der Typ `elicitation_dialog` ist definiert, wird aber derzeit nicht implementiert.

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: zusätzliche einzufügende Informationen
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
  - `message`: dem Benutzer anzuzeigende Nachricht (optional)
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

**Zweck**: Wird ausgeführt, wenn ein neues Todo-Element über das Tool `todo_write` erstellt wird. Ermöglicht die Validierung, Protokollierung oder Blockierung der Todo-Erstellung.

Todo-Hooks laufen in zwei Phasen ab:

- `validation`: wird vor der Persistierung ausgeführt. Diese Phase nur zur Validierung nutzen; die Rückgabe von `block` oder `deny` verhindert das Schreiben.
- `postWrite`: wird nach der Persistierung ausgeführt. Diese Phase für Nebeneffekte wie Protokollierung oder Synchronisierung nutzen; `block` oder `deny` wird in dieser Phase ignoriert.

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
- `reason`: menschenlesbare Erklärung für die Entscheidung (erforderlich bei Blockierung)

**Blockierungsverhalten**:

Während der `validation`-Phase wird die Todo-Erstellung verhindert, wenn `decision` auf `block` oder `deny` (Exit-Code 2) gesetzt ist. Die Todo-Liste bleibt unverändert, und der Grund wird als Feedback an das Modell gegeben.

Während der `postWrite`-Phase wurde das Todo bereits persistiert. Hooks können weiterhin eine Ausgabe zurückgeben, aber `block` / `deny` macht das Schreiben nicht rückgängig und sollte nicht für die Validierung verwendet werden.

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

**Zweck**: Wird ausgeführt, wenn ein Todo-Element als abgeschlossen markiert wird. Ermöglicht die Validierung, Protokollierung oder Blockierung der Todo-Abschließung.

Todo-Hooks laufen in zwei Phasen ab:

- `validation`: wird vor der Persistierung ausgeführt. Diese Phase nur zur Validierung nutzen; die Rückgabe von `block` oder `deny` verhindert das Schreiben.
- `postWrite`: wird nach der Persistierung ausgeführt. Diese Phase für Nebeneffekte wie Protokollierung oder Synchronisierung nutzen; `block` oder `deny` wird in dieser Phase ignoriert.

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
- `reason`: menschenlesbare Erklärung für die Entscheidung (erforderlich bei Blockierung)

**Blockierungsverhalten**:
Während der `validation`-Phase wird die Todo-Erledigung verhindert, wenn `decision` `block` oder `deny` ist (Exit-Code 2). Der Todo-Eintrag bleibt in seinem vorherigen Status, und der Grund wird als Rückmeldung an das Modell übergeben.

Während der `postWrite`-Phase wurde der Todo bereits persistiert. Hooks können weiterhin eine Ausgabe zurückgeben, aber `block` / `deny` macht das Schreiben nicht rückgängig und sollte nicht zur Validierung verwendet werden.

**Beispiel-Ausgabe (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo-Erledigung genehmigt"
}
```

**Beispiel-Ausgabe (Block)**:

```json
{
  "decision": "block",
  "reason": "Dieser Todo kann erst abgeschlossen werden, wenn abhängige Aufgaben erledigt sind."
}
```

**Beispiel-Hook-Skript**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validiert Bedingungen für die Todo-Erledigung

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Prüfen, ob es unvollständige abhängige Todos gibt (Beispiellogik)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Zu viele unerledigte Todos. Schließen Sie zuerst andere Aufgaben ab."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Beispiel-Konfiguration**:

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

- **Protokollierung**: Erstellung und Abschluss von Todos für Audit oder Analyse verfolgen
- **Validierung**: Qualitätsstandards für Inhalte durchsetzen (Mindestlänge, erforderliche Schlüsselwörter)
- **Workflow-Steuerung**: Abschluss blockieren, bis Vorbedingungen erfüllt sind
- **Integration**: Todos mit externen Aufgabenverwaltungssystemen synchronisieren (Jira, Trello usw.)

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
            "description": "Sicherheitsprüfungen vor der Tool-Ausführung durchführen",
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
            "command": "echo 'Session gestartet'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

## Ausführung von Hooks

### Parallele vs. sequentielle Ausführung

- Standardmäßig werden Hooks parallel ausgeführt, um die Leistung zu verbessern
- Verwenden Sie `sequential: true` in der Hook-Definition, um eine reihenfolgeabhängige Ausführung zu erzwingen
- Sequentielle Hooks können die Eingabe für nachfolgende Hooks in der Kette ändern

### Asynchrone Hooks

Nur der Typ `command` unterstützt asynchrone Ausführung. Die Einstellung `"async": true` führt den Hook im Hintergrund aus, ohne den Hauptablauf zu blockieren.

**Merkmale:**

- Kann keine Entscheidungssteuerung zurückgeben (die Operation hat bereits stattgefunden)
- Ergebnisse werden im nächsten Konversationsdurchlauf via `systemMessage` oder `additionalContext` eingespielt
- Geeignet für Auditierung, Protokollierung, Hintergrundtests usw.

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
  echo "{\"systemMessage\": \"Tests bestanden nach Bearbeitung von $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests fehlgeschlagen: $RESULT\"}"
fi
```

### Sicherheitsmodell

- Hooks werden in der Benutzerumgebung mit Benutzerrechten ausgeführt
- Hooks auf Projektebene erfordern den Status eines vertrauenswürdigen Ordners
- Timeouts verhindern hängende Hooks (Standard: 60 Sekunden)

## Best Practices

### Beispiel 1: Sicherheitsvalidierungs-Hook

Ein PreToolUse-Hook, der gefährliche Befehle protokolliert und ggf. blockiert:

**security_check.sh**

```bash
#!/bin/bash

# Eingabe von stdin lesen
INPUT=$(cat)

# Eingabe parsen, um Tool-Informationen zu extrahieren
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Auf potenziell gefährliche Operationen prüfen
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Sicherheitsrichtlinie blockiert gefährlichen Befehl"
    }
  }'
  exit 2  # Blockierender Fehler
fi

# Operation protokollieren
echo "INFO: Tool $TOOL_NAME wurde am $(date) sicher ausgeführt" >> /var/log/qwen-security.log

# Zulassen mit zusätzlichem Kontext
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Sicherheitsprüfung bestanden",
    "additionalContext": "Befehl durch Sicherheitsrichtlinie genehmigt"
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

Ein PostToolUse HTTP-Hook, der alle Tool-Ausführungsdatensätze an einen entfernten Audit-Dienst sendet:

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

### Beispiel 3: Benutzereingabe-Validierungs-Hook

Ein UserPromptSubmit-Hook, der Benutzereingaben auf vertrauliche Informationen prüft und bei langen Eingaben Kontext bereitstellt:

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

- Überprüfen Sie die Anwendungsprotokolle auf Details zur Hook-Ausführung
- Stellen Sie sicher, dass die Hook-Skripte ausführbar sind und die richtigen Berechtigungen haben
- Achten Sie auf korrekte JSON-Formatierung in den Hook-Ausgaben
- Verwenden Sie spezifische Matcher-Muster, um unbeabsichtigte Hook-Ausführungen zu vermeiden
- Verwenden Sie den `--debug`-Modus, um detaillierte Informationen zur Hook-Zuordnung und -Ausführung zu sehen
- Deaktivieren Sie vorübergehend alle Hooks: Fügen Sie `"disableAllHooks": true` in den Einstellungen hinzu
