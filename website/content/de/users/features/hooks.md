# Qwen Code Hooks

## Übersicht

Qwen Code Hooks bieten einen leistungsstarken Mechanismus zur Erweiterung und Anpassung des Verhaltens der Qwen Code-Anwendung. Hooks ermöglichen es Benutzern, benutzerdefinierte Skripte oder Programme zu bestimmten Zeitpunkten im Anwendungslebenszyklus auszuführen, beispielsweise vor der Tool-Ausführung, nach der Tool-Ausführung, beim Sitzungsstart/-ende und während anderer wichtiger Ereignisse.

Hooks sind standardmäßig aktiviert. Sie können alle Hooks vorübergehend deaktivieren, indem Sie `disableAllHooks` in Ihrer Einstellungsdatei auf `true` setzen (auf der obersten Ebene, zusammen mit `hooks`):

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

Hooks sind benutzerdefinierte Skripte oder Programme, die von Qwen Code automatisch an vordefinierten Punkten im Anwendungsablauf ausgeführt werden. Sie ermöglichen Benutzern:

- Überwachung und Prüfung der Tool-Nutzung
- Durchsetzung von Sicherheitsrichtlinien
- Einfügen zusätzlicher Kontextinformationen in Konversationen
- Anpassung des Anwendungsverhaltens basierend auf Ereignissen
- Integration mit externen Systemen und Diensten
- Programmgesteuerte Änderung von Tool-Eingaben oder -Antworten

## Hook-Typen

Qwen Code unterstützt vier Hook-Ausführungstypen:

| Typ        | Beschreibung                                                                                             |
| :--------- | :------------------------------------------------------------------------------------------------------- |
| `command`  | Führt einen Shell-Befehl aus. Erhält JSON über `stdin`, gibt Ergebnisse über `stdout` zurück.              |
| `http`     | Sendet JSON als `POST`-Request-Body an eine bestimmte URL. Gibt Ergebnisse über den HTTP-Response-Body zurück. |
| `function` | Ruft direkt eine registrierte JavaScript-Funktion auf (nur für Hooks auf Sitzungsebene).                 |
| `prompt`   | Verwendet ein LLM, um die Hook-Eingabe zu bewerten und eine Entscheidung zurückzugeben.                  |

### Command-Hooks

Command-Hooks führen Befehle über untergeordnete Prozesse aus. Die Eingabe-JSON wird über stdin übergeben, die Ausgabe wird über stdout zurückgegeben.

**Konfiguration:**

| Feld             | Typ                      | Erforderlich | Beschreibung                                           |
| :--------------- | :----------------------- | :----------- | :----------------------------------------------------- |
| `type`           | `"command"`              | Ja           | Hook-Typ                                               |
| `command`        | `string`                 | Ja           | Auszuführender Befehl                                   |
| `name`           | `string`                 | Nein         | Hook-Name (für das Logging)                            |
| `description`    | `string`                 | Nein         | Hook-Beschreibung                                      |
| `timeout`        | `number`                 | Nein         | Timeout in Millisekunden, Standard 60000               |
| `async`          | `boolean`                | Nein         | Ob asynchron im Hintergrund ausgeführt werden soll     |
| `env`            | `Record<string, string>` | Nein         | Umgebungsvariablen                                     |
| `shell`          | `"bash" \| "powershell"` | Nein         | Zu verwendende Shell                                   |
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

### HTTP-Hooks

HTTP-Hooks senden Hook-Eingaben als POST-Requests an bestimmte URLs. Sie unterstützen URL-Whitelists, DNS-SSRF-Schutz, Interpolation von Umgebungsvariablen und andere Sicherheitsfunktionen.

**Konfiguration:**

| Feld              | Typ                      | Erforderlich | Beschreibung                                                          |
| :---------------- | :----------------------- | :----------- | :-------------------------------------------------------------------- |
| `type`            | `"http"`                 | Ja           | Hook-Typ                                                              |
| `url`             | `string`                 | Ja           | Ziel-URL                                                              |
| `headers`         | `Record<string, string>` | Nein         | Request-Header (unterstützt Interpolation von Umgebungsvariablen)     |
| `allowedEnvVars`  | `string[]`               | Nein         | Whitelist von Umgebungsvariablen, die in URL/Headern erlaubt sind     |
| `timeout`         | `number`                 | Nein         | Timeout in Sekunden, Standard 600                                     |
| `name`            | `string`                 | Nein         | Hook-Name (für das Logging)                                           |
| `statusMessage`   | `string`                 | Nein         | Statusmeldung, die während der Ausführung angezeigt wird              |
| `once`            | `boolean`                | Nein         | Nur einmal pro Ereignis pro Sitzung ausführen (nur HTTP-Hooks)        |

**Sicherheitsfunktionen:**

- **URL-Whitelist**: Konfigurieren Sie erlaubte URL-Muster über `allowedUrls`
- **SSRF-Schutz**: Blockiert private IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x, usw.), erlaubt aber Loopback-Adressen (127.0.0.1, ::1)
- **DNS-Validierung**: Überprüft die Domain-Auflösung vor Requests, um DNS-Rebinding-Angriffe zu verhindern
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

### Function-Hooks

Function-Hooks rufen direkt registrierte JavaScript/TypeScript-Funktionen auf. Sie werden intern vom Skill-System verwendet und sind derzeit nicht als öffentliche API für Endbenutzer freigegeben.

**Hinweis**: Für die meisten Anwendungsfälle verwenden Sie stattdessen **Command-Hooks** oder **HTTP-Hooks**, die in Einstellungsdateien konfiguriert werden können.

### Prompt-Hooks

Prompt-Hooks verwenden ein LLM, um die Hook-Eingabe zu bewerten und eine Entscheidung zurückzugeben. Dies ist nützlich, um intelligente Entscheidungen basierend auf dem Kontext zu treffen, z. B. ob ein Vorgang erlaubt oder blockiert werden soll.

**So funktioniert es:**

1. Die Hook-Eingabe-JSON wird mit dem Platzhalter `$ARGUMENTS` in Ihren Prompt eingefügt
2. Der Prompt wird an ein LLM gesendet (Standard: Ihr aktuelles Modell)
3. Das LLM gibt eine JSON-Antwort mit der Entscheidung zurück
4. Qwen Code verarbeitet die Entscheidung und setzt die Ausführung fort oder blockiert sie entsprechend

**Konfiguration:**

| Feld             | Typ       | Erforderlich | Beschreibung                                               |
| :--------------- | :--------- | :----------- | :--------------------------------------------------------- |
| `type`           | `"prompt"` | Ja           | Hook-Typ                                                   |
| `prompt`         | `string`   | Ja           | Prompt, der an das LLM gesendet wird. Verwenden Sie `$ARGUMENTS` für Hook-Eingaben |
| `model`          | `string`   | Nein         | Zu verwendendes Modell (Standard: Ihr aktuelles Modell)    |
| `timeout`        | `number`   | Nein         | Timeout in Sekunden, Standard 30                           |
| `name`           | `string`   | Nein         | Hook-Name (für das Logging)                                |
| `description`    | `string`   | Nein         | Hook-Beschreibung                                          |
| `statusMessage`  | `string`   | Nein         | Statusmeldung, die während der Ausführung angezeigt wird   |

**Antwortformat:**

Das LLM muss JSON mit der folgenden Struktur zurückgeben:

```json
{
  "ok": true,
  "reason": "Begründung der Entscheidung",
  "additionalContext": "Optionaler Kontext, der in die Konversation eingefügt werden kann"
}
```

| Feld               | Beschreibung                                                                     |
| :----------------- | :------------------------------------------------------------------------------- |
| `ok`               | `true` zum Erlauben/Fortsetzen, `false` zum Blockieren/Stoppen                   |
| `reason`           | Erforderlich, wenn `ok` `false` ist. Wird dem Modell zur Erklärung des Blocks angezeigt |
| `additionalContext` | Optional. Zusätzlicher Kontext, der beim Erlauben in die Konversation eingefügt wird |

**Unterstützte Ereignisse:**

Prompt-Hooks können mit den meisten Hook-Ereignissen verwendet werden, einschließlich:

- `PreToolUse` – Bewerten, ob ein Tool-Aufruf erlaubt werden soll
- `PostToolUse` – Tool-Ergebnisse bewerten und ggf. Kontext einfügen
- `Stop` – Festlegen, ob fortgesetzt oder gestoppt werden soll
- `SubagentStop` – Ergebnisse von Sub-Agenten bewerten
- `UserPromptSubmit` – Benutzer-Prompts bewerten oder anreichern

**Beispiel: Stop-Hook**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Sie bewerten, ob Qwen Code die Arbeit einstellen soll. Kontext: $ARGUMENTS\n\nAnalysieren Sie die Konversation und bestimmen Sie, ob:\n1. Alle vom Benutzer angeforderten Aufgaben abgeschlossen sind\n2. Fehler behoben werden müssen\n3. Folgearbeiten erforderlich sind\n\nAntworten Sie mit JSON: {\"ok\": true} zum Erlauben des Stoppens, oder {\"ok\": false, \"reason\": \"Ihre Erklärung\"} zum Fortsetzen der Arbeit.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Wenn `ok` `false` ist, setzt Qwen Code die Arbeit fort und verwendet die `reason` als Kontext für die nächste Antwort.

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
            "prompt": "Bewerten Sie diesen Tool-Aufruf hinsichtlich Sicherheitsbedenken. Tool-Eingabe: $ARGUMENTS\n\nPrüfen Sie auf:\n- Gefährliche Befehle (rm -rf, curl | sh, usw.)\n- Unberechtigte Zugriffsversuche\n- Datenexfiltrationsmuster\n\nAntworten Sie mit {\"ok\": true} bei Sicherheit oder {\"ok\": false, \"reason\": \"Bedenken\"} bei Blockierung.",
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

Hooks werden zu bestimmten Zeitpunkten während einer Qwen Code-Sitzung ausgelöst. Verschiedene Ereignisse unterstützen unterschiedliche Matcher zur Filterung der Auslösebedingungen.

| Ereignis              | Ausgelöst durch                                     | Matcher-Ziel                                                 |
| :-------------------- | :-------------------------------------------------- | :----------------------------------------------------------- |
| `PreToolUse`          | Vor der Tool-Ausführung                             | Tool-Name (`WriteFile`, `ReadFile`, `Bash`, usw.)            |
| `PostToolUse`         | Nach erfolgreicher Tool-Ausführung                  | Tool-Name                                                    |
| `PostToolUseFailure`  | Nach fehlgeschlagener Tool-Ausführung               | Tool-Name                                                    |
| `UserPromptSubmit`    | Nachdem der Benutzer einen Prompt abgeschickt hat    | Kein (wird immer ausgelöst)                                  |
| `SessionStart`        | Wenn die Sitzung startet oder fortgesetzt wird      | Quelle (`startup`, `resume`, `clear`, `compact`)             |
| `SessionEnd`          | Wenn die Sitzung endet                              | Grund (`clear`, `logout`, `prompt_input_exit`, usw.)         |
| `Stop`                | Wenn Claude sich darauf vorbereitet, die Antwort abzuschließen | Kein (wird immer ausgelöst)                                  |
| `SubagentStart`       | Wenn ein Sub-Agent startet                          | Agent-Typ (`Bash`, `Explorer`, `Plan`, usw.)                 |
| `SubagentStop`        | Wenn ein Sub-Agent stoppt                           | Agent-Typ                                                    |
| `PreCompact`          | Vor der Komprimierung der Konversation              | Auslöser (`manual`, `auto`)                                  |
| `Notification`        | Wenn Benachrichtigungen gesendet werden             | Typ (`permission_prompt`, `idle_prompt`, `auth_success`)     |
| `PermissionRequest`   | Wenn ein Berechtigungsdialog angezeigt wird         | Tool-Name                                                    |
| `TodoCreated`         | Wenn ein neues Todo-Element erstellt wird           | Kein (wird immer ausgelöst)                                  |
| `TodoCompleted`       | Wenn ein Todo-Element als abgeschlossen markiert wird | Kein (wird immer ausgelöst)                                  |

### Matcher-Muster

`matcher` ist ein regulärer Ausdruck, der zum Filtern der Auslösebedingungen verwendet wird.

| Ereignistyp       | Ereignisse                                                             | Matcher-Unterstützung | Matcher-Ziel                                             |
| :---------------- | :--------------------------------------------------------------------- | :-------------------- | :------------------------------------------------------- |
| Tool-Ereignisse   | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex              | Tool-Name: `WriteFile`, `ReadFile`, `Bash`, usw.         |
| Sub-Agent-Ereignisse | `SubagentStart`, `SubagentStop`                                    | ✅ Regex              | Agent-Typ: `Bash`, `Explorer`, usw.                     |
| Sitzungsereignisse | `SessionStart`                                                       | ✅ Regex              | Quelle: `startup`, `resume`, `clear`, `compact`          |
| Sitzungsereignisse | `SessionEnd`                                                         | ✅ Regex              | Grund: `clear`, `logout`, `prompt_input_exit`, usw.      |
| Benachrichtigungsereignisse | `Notification`                                               | ✅ Exakte Übereinstimmung | Typ: `permission_prompt`, `idle_prompt`, `auth_success` |
| Komprimierungsereignisse | `PreCompact`                                                   | ✅ Exakte Übereinstimmung | Auslöser: `manual`, `auto`                              |
| Todo-Ereignisse   | `TodoCreated`, `TodoCompleted`                                         | ❌ Nein               | Nicht zutreffend                                          |
| Prompt-Ereignisse | `UserPromptSubmit`                                                     | ❌ Nein               | Nicht zutreffend                                          |
| Stop-Ereignisse   | `Stop`                                                                 | ❌ Nein               | Nicht zutreffend                                          |

**Matcher-Syntax:**

- Leere Zeichenkette `""` oder `"*"` stimmt mit allen Ereignissen dieses Typs überein
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

## Eingabe-/Ausgaberegeln

### Hook-Eingabestruktur

Alle Hooks erhalten standardisierte Eingaben im JSON-Format über stdin (command) oder POST-Body (http).

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

Ereignisspezifische Felder werden basierend auf dem Hook-Typ hinzugefügt. Bei Ausführung in einem Sub-Agenten werden zusätzlich `agent_id` und `agent_type` eingefügt.

### Hook-Ausgabestruktur

Die Hook-Ausgabe wird über `stdout` (command) oder HTTP-Response-Body (http) als JSON zurückgegeben.

**Exit-Code-Verhalten (Command-Hooks):**

| Exit-Code | Verhalten                                                                                  |
| :-------- | :----------------------------------------------------------------------------------------- |
| `0`       | Erfolg. Parse JSON in `stdout`, um das Verhalten zu steuern.                               |
| `2`       | **Blockierender Fehler**. Ignoriert `stdout`, übergibt `stderr` als Fehlerfeedback an das Modell. |
| Andere    | Nicht-blockierender Fehler. `stderr` wird nur im Debug-Modus angezeigt, die Ausführung wird fortgesetzt. |

**Ausgabestruktur:**

Die Hook-Ausgabe unterstützt drei Kategorien von Feldern:

1. **Allgemeine Felder**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Top-Level-Entscheidung**: `decision`, `reason` (wird von einigen Ereignissen verwendet)
3. **Ereignisspezifische Steuerung**: `hookSpecificOutput` (muss `hookEventName` enthalten)

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Vorgang genehmigt",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Zusätzliche Kontextinformationen"
  }
}
```

### Details zu einzelnen Hook-Ereignissen

#### PreToolUse

**Zweck**: Wird vor der Verwendung eines Tools ausgeführt, um Berechtigungsprüfungen, Eingabevalidierung oder Kontexteinfügungen zu ermöglichen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "Name des ausgeführten Tools",
  "tool_input": "Objekt mit den Eingabeparametern des Tools",
  "tool_use_id": "Eindeutige Kennung für diese Tool-Verwendung (internes Format, z. B. toolu_xxx)",
  "tool_call_id": "Ursprüngliche API-Call-ID vom LLM-Anbieter (z. B. call_xxx für OpenAI/Qwen) (optional)"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" oder "ask" (ERFORDERLICH)
- `hookSpecificOutput.permissionDecisionReason`: Begründung für die Entscheidung (ERFORDERLICH)
- `hookSpecificOutput.updatedInput`: Geänderte Tool-Eingabeparameter, die anstelle der Originale verwendet werden sollen
- `hookSpecificOutput.additionalContext`: Zusätzliche Kontextinformationen

**Hinweis**: Obwohl Standard-Hook-Ausgabefelder wie `decision` und `reason` technisch von der zugrunde liegenden Klasse unterstützt werden, erwartet die offizielle Schnittstelle die Verwendung von `hookSpecificOutput` mit `permissionDecision` und `permissionDecisionReason`.

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

**Zweck**: Wird nach erfolgreichem Abschluss eines Tools ausgeführt, um Ergebnisse zu verarbeiten, Ergebnisse zu protokollieren oder zusätzlichen Kontext einzufügen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "Name des ausgeführten Tools",
  "tool_input": "Objekt mit den Eingabeparametern des Tools",
  "tool_response": "Objekt mit der Antwort des Tools",
  "tool_use_id": "Eindeutige Kennung für diese Tool-Verwendung (internes Format, z. B. toolu_xxx)",
  "tool_call_id": "Ursprüngliche API-Call-ID vom LLM-Anbieter (z. B. call_xxx für OpenAI/Qwen) (optional)"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" (standardmäßig "allow", wenn nicht angegeben)
- `reason`: Grund für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzliche Informationen, die eingefügt werden sollen

**Beispielausgabe**:

```json
{
  "decision": "allow",
  "reason": "Tool erfolgreich ausgeführt",
  "hookSpecificOutput": {
    "additionalContext": "Dateiänderung im Audit-Log aufgezeichnet"
  }
}
```

#### PostToolUseFailure

**Zweck**: Wird ausgeführt, wenn eine Tool-Ausführung fehlschlägt, um Fehler zu behandeln, Warnungen zu senden oder Fehlschläge aufzuzeichnen.

**Ereignisspezifische Felder**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "Eindeutige Kennung für die Tool-Verwendung (internes Format, z. B. toolu_xxx)",
  "tool_call_id": "Ursprüngliche API-Call-ID vom LLM-Anbieter (z. B. call_xxx für OpenAI/Qwen) (optional)",
  "tool_name": "Name des fehlgeschlagenen Tools",
  "tool_input": "Objekt mit den Eingabeparametern des Tools",
  "error": "Fehlermeldung, die den Fehlschlag beschreibt",
  "is_interrupt": "Boolescher Wert, der angibt, ob der Fehlschlag auf eine Benutzerunterbrechung zurückzuführen ist (optional)"
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

**Zweck**: Wird ausgeführt, wenn der Benutzer einen Prompt einreicht, um die Eingabe zu modifizieren, validieren oder anzureichern.

**Ereignisspezifische Felder**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: menschenlesbare Erklärung für die Entscheidung
- `hookSpecificOutput.additionalContext`: zusätzlicher Kontext, der an den Prompt angehängt werden soll (optional)

**Hinweis**: Da UserPromptSubmitOutput von HookOutput erbt, stehen alle Standardfelder zur Verfügung, aber nur `additionalContext` in `hookSpecificOutput` ist speziell für dieses Ereignis definiert.

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

**Zweck**: Wird ausgeführt, wenn eine neue Sitzung beginnt, um Initialisierungsaufgaben durchzuführen.

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

**Zweck**: Wird ausgeführt, wenn eine Sitzung endet, um Bereinigungsaufgaben durchzuführen.

**Ereignisspezifische Felder**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Ausgabeoptionen**:

- Standard-Hook-Ausgabefelder (werden normalerweise nicht zum Blockieren verwendet)

#### Stop

**Zweck**: Wird ausgeführt, bevor Qwen seine Antwort abschließt, um abschließende Rückmeldungen oder Zusammenfassungen zu liefern.

**Ereignisspezifische Felder**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Ausgabeoptionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: menschenlesbare Erklärung für die Entscheidung
- `stopReason`: Rückmeldung, die in die Stop-Antwort aufgenommen werden soll
- `continue`: auf false setzen, um die Ausführung zu stoppen
- `hookSpecificOutput.additionalContext`: zusätzliche Kontextinformationen

**Hinweis**: Da StopOutput von HookOutput erbt, stehen alle Standardfelder zur Verfügung, aber das Feld `stopReason` ist für dieses Ereignis besonders relevant.

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

**Matcher**: Gleicht mit dem Feld `error` ab. Beispielsweise löst `"matcher": "rate_limit"` nur bei Rate-Limit-Fehlern aus.

**Ausgabeoptionen**:

- **Keine** – StopFailure ist Fire-and-Forget. Alle Hook-Ausgaben und Exit-Codes werden ignoriert.

**Exit-Code-Handhabung**:

| Exit-Code | Verhalten                |
| --------- | ------------------------ |
| Beliebig  | Ignoriert (Fire-and-Forget) |

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

- `hookSpecificOutput.additionalContext`: anfänglicher Kontext für den Subagent
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

**Zweck**: Wird ausgeführt, wenn ein Subagent beendet ist, um Finalisierungsaufgaben durchzuführen.

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

**Zweck**: Wird vor der Gesprächskompaktierung ausgeführt, um die Kompaktierung vorzubereiten oder zu protokollieren.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: Kontext, der vor der Kompaktierung eingefügt werden soll
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

**Zweck**: Wird nach Abschluss der Gesprächskompaktierung ausgeführt, um Zusammenfassungen zu archivieren oder die Nutzung zu verfolgen.

**Ereignisspezifische Felder**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Gleicht mit dem Feld `trigger` ab. Beispielsweise löst `"matcher": "manual"` nur bei manueller Kompaktierung über den Befehl `/compact` aus.

**Ausgabeoptionen**:

- `hookSpecificOutput.additionalContext`: zusätzlicher Kontext (nur zur Protokollierung)
- Standard-Hook-Ausgabefelder (nur zur Protokollierung)

**Hinweis**: PostCompact ist **nicht** in der offiziellen Liste der unterstützten Ereignisse für den Entscheidungsmodus enthalten. Das Feld `decision` und andere Steuerfelder haben keine Steuerwirkung – sie werden nur für Protokollierungszwecke verwendet.

**Exit-Code-Handhabung**:

| Exit-Code | Verhalten                                                     |
| --------- | ------------------------------------------------------------- |
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
- Audit-Protokollierung für Kompaktierungsvorgänge

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
  - `updatedInput`: geänderte Tool-Eingabe (optional)
  - `updatedPermissions`: geänderte Berechtigungen (optional)
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

**Zweck**: Wird ausgeführt, wenn ein neues Todo-Element über das Tool `todo_write` erstellt wird. Ermöglicht die Validierung, Protokollierung oder Blockierung der Todo-Erstellung.

Todo-Hooks laufen in zwei Phasen:

- `validation`: läuft vor dem Persistieren. Verwenden Sie diese Phase nur für die Validierung; die Rückgabe von `block` oder `deny` verhindert das Schreiben.
- `postWrite`: läuft nach dem Persistieren. Verwenden Sie diese Phase für Nebenwirkungen wie Protokollierung oder Synchronisation; `block` oder `deny` wird in dieser Phase ignoriert.

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
- `reason`: menschenlesbare Erklärung für die Entscheidung (beim Blockieren erforderlich)

**Blockierungsverhalten**:

In der `validation`-Phase wird bei `decision` = `block` oder `deny` (Exit-Code 2) die Todo-Erstellung verhindert. Die Todo-Liste bleibt unverändert, und der Grund wird als Rückmeldung an das Modell gegeben.

In der `postWrite`-Phase wurde das Todo bereits persistiert. Hooks können weiterhin eine Ausgabe zurückgeben, aber `block` / `deny` macht den Schreibvorgang nicht rückgängig und sollte nicht für die Validierung verwendet werden.

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

Todo-Hooks laufen in zwei Phasen:

- `validation`: läuft vor dem Persistieren. Verwenden Sie diese Phase nur für die Validierung; die Rückgabe von `block` oder `deny` verhindert das Schreiben.
- `postWrite`: läuft nach dem Persistieren. Verwenden Sie diese Phase für Nebenwirkungen wie Protokollierung oder Synchronisation; `block` oder `deny` wird in dieser Phase ignoriert.

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
- `reason`: menschenlesbare Erklärung für die Entscheidung (beim Blockieren erforderlich)

**Blockierungsverhalten**:

In der `validation`-Phase wird bei `decision` = `block` oder `deny` (Exit-Code 2) der Todo-Abschluss verhindert. Das Todo-Element bleibt in seinem vorherigen Status, und der Grund wird als Rückmeldung an das Modell gegeben.

In der `postWrite`-Phase wurde das Todo bereits persistiert. Hooks können weiterhin eine Ausgabe zurückgeben, aber `block` / `deny` macht den Schreibvorgang nicht rückgängig und sollte nicht für die Validierung verwendet werden.

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

- **Protokollierung**: Verfolgen der Todo-Erstellung und -Abschluss für Audit oder Analysen
- **Validierung**: Durchsetzung von Qualitätsstandards für Inhalte (Mindestlänge, erforderliche Schlüsselwörter)
- **Workflow-Steuerung**: Blockieren des Abschlusses, bis Voraussetzungen erfüllt sind
- **Integration**: Synchronisation von Todos mit externen Task-Management-Systemen (Jira, Trello usw.)

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

- Standardmäßig werden Hooks parallel ausgeführt, um eine bessere Leistung zu erzielen
- Verwenden Sie `sequential: true` in der Hook-Definition, um eine reihenfolgeabhängige Ausführung zu erzwingen
- Sequentielle Hooks können die Eingabe für nachfolgende Hooks in der Kette ändern

### Async-Hooks

Nur der Typ `command` unterstützt asynchrone Ausführung. Das Setzen von `"async": true` führt den Hook im Hintergrund aus, ohne den Hauptfluss zu blockieren.

**Eigenschaften:**

- Kann keine Entscheidungssteuerung zurückgeben (der Vorgang ist bereits erfolgt)
- Ergebnisse werden im nächsten Gesprächsdurchlauf über `systemMessage` oder `additionalContext` eingefügt
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
- Projektbezogene Hooks erfordern den Status eines vertrauenswürdigen Ordners
- Timeouts verhindern das Hängenbleiben von Hooks (Standard: 60 Sekunden)

## Bewährte Methoden

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

Konfigurieren Sie dies in `.qwen/settings.json`:

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

Ein PostToolUse-HTTP-Hook, der alle Tool-Ausführungsdatensätze an einen entfernten Audit-Dienst sendet:

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

Ein UserPromptSubmit-Hook, der Benutzer-Prompts auf vertrauliche Informationen überprüft und für lange Prompts Kontext bereitstellt:

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

- Überprüfen Sie die Anwendungslogs auf Details zur Hook-Ausführung.
- Verifizieren Sie die Berechtigungen und die Ausführbarkeit der Hook-Skripte.
- Stellen Sie sicher, dass die Hook-Ausgaben korrekt JSON-formatiert sind.
- Verwenden Sie spezifische Matcher-Muster, um unbeabsichtigte Hook-Ausführungen zu vermeiden.
- Nutzen Sie den `--debug`-Modus, um detaillierte Informationen zu Hook-Matching und -Ausführung zu sehen.
- Deaktivieren Sie vorübergehend alle Hooks, indem Sie `"disableAllHooks": true` in den Einstellungen hinzufügen.