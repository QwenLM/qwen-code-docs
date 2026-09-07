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
        "matcher": "write_file",
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

#### Private-Network-Hooks erlauben (nur verwaltete Umgebungen)

Standardmäßig können HTTP-Hooks keine privaten oder link-lokalen IP-Bereiche ansprechen. In plattformverwalteten Umgebungen, in denen der Hook-Empfänger ein First-Party-Endpunkt innerhalb eines VPC ist (zum Beispiel ein internes API-Gateway, das auf `172.16.0.0/12` auflöst), kannst du die IP-Bereichsprüfungen lockern mit:

```json
{
  "security": {
    "allowPrivateNetworkHooks": true
  }
}
```

- Diese Einstellung wird **nur aus den Einstellungs-Scopes „User", „System" und „SystemDefaults" berücksichtigt**. Ein in Workspace- (Projekt-)Einstellungen gesetzter Wert wird ignoriert und als Warnung protokolliert, sodass ein geklontes Repository niemals selbstständig diese Ausnahme gewähren kann.
- Der Schalter lockert nur die allgemeinen Prüfungen für private/CGNAT/link-lokale **Bereiche**. Cloud-Metadaten-Endpunkte bleiben in jeder Konfiguration blockiert: Die `BLOCKED_HOSTS`-Liste wird wörtlich abgeglichen (`metadata.google.internal`, `metadata.azure.internal`, …), und die Metadaten-IPs `169.254.169.254` und `100.100.100.200` werden in allen serialisierten Formen (einschließlich IPv4-mapped IPv6 wie `::ffff:a9fe:a9fe`) und nach der DNS-Auflösung blockiert.
- Die `security.allowedHttpHookUrls`-Whitelist gilt weiterhin unabhängig davon. In verwalteten Umgebungen sollte dieser Schalter mit einer Whitelist kombiniert werden, sodass nur die beabsichtigten internen Endpunkte erreichbar sind.

> **Warnung:** Das Aktivieren dieses Schalters ermöglicht es Hooks, interne Infrastruktur in deinem Netzwerk zu erreichen. Aktiviere ihn nur in vertrauenswürdigen, verwalteten Umgebungen – niemals in einem Repository, das du nicht kontrollierst.

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

**Beispiel: External Judgment Service Adapter**

Die `remote-security-check`-Konfiguration oben erwartet, dass auf `http://127.0.0.1:8080/hooks/pre-tool-use` bereits ein Dienst läuft, der diesen Contract spricht (POST `{tool_name, tool_input, ...}` rein, `hookSpecificOutput.permissionDecision` raus). Hier ist ein minimaler, nur auf der Standardbibliothek basierender Adapter, der diese fehlende Hälfte ergänzt – verbunden mit einem konkreten Judgment-Backend, sodass das Ganze lauffähig und End-to-End-testbar ist und nicht nur ein Stub. Nur die `review()`-Funktion ist backend-spezifisch – tausche ihren Body und die Request/Response-Form gegen den Dienst deiner Wahl aus; alles andere (der Server, die Fail-Open-Behandlung, die Hook-Response-Form) bleibt unabhängig vom Backend gleich.

_Disclosure: Das unten verwendete Backend, [invinoveritas](https://api.babyblueviper.com), ist ein Dienst, mit dem der Autor verbunden ist – hier verwendet, weil es das einzige war, das für dieses Beispiel End-to-End verifiziert werden konnte, keine Empfehlung. Jeder HTTP-Dienst, der ein JSON-Votum zurückgibt, funktioniert genauso gut; nur `review()` muss angepasst werden._

_Datenbehandlung: Bei `matcher: "*"` wird der vollständige `tool_input` **jedes** Tool-Aufrufs an das Judgment-Backend gesendet – behandle diese Eingabe als sensibel (sie kann Dateiinhalte, Pfade oder Secrets enthalten). Schränke den Matcher ein (z. B. auf `run_shell_command`), wenn du nur Shell-Befehle bewerten lassen möchtest._

```python
#!/usr/bin/env python3
# judgment_hook.py -- run: JUDGMENT_API_KEY=... python3 judgment_hook.py
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

JUDGMENT_API_KEY = os.environ["JUDGMENT_API_KEY"]
JUDGMENT_URL = os.environ.get("JUDGMENT_URL", "https://api.babyblueviper.com/review")

def review(tool_name, tool_input):
    """POST the call to the judgment backend and return its verdict. This is the
    one function to change for a different backend -- request/response shape
    below matches invinoveritas's /review; adapt both to your own backend's
    contract if you swap it out."""
    body = json.dumps({
        "artifact": json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        "artifact_type": "shell_command" if tool_name in ("run_shell_command", "shell") else "general",
        "context": f"qwen-code PreToolUse: {tool_name}",
    }).encode()
    req = urllib.request.Request(
        JUDGMENT_URL, data=body,
        headers={"Authorization": f"Bearer {JUDGMENT_API_KEY}", "Content-Type": "application/json"},
    )
    # Keep this below the HTTP hook's own timeout (10s in the config above), so a "deny"
    # verdict is always returned before the hook gives up and fails open on its own.
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read())  # response includes a "verdict" field: "reject" denies, anything else allows

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        tool_name, tool_input = payload.get("tool_name", "unknown"), payload.get("tool_input", {})
        try:
            verdict = review(tool_name, tool_input)
            decision = "deny" if verdict.get("verdict") == "reject" else "allow"
            reason = verdict.get("summary", f"judgment verdict: {verdict.get('verdict')}")
        except Exception as e:
            decision, reason = "allow", "judgment backend unavailable, failing open"  # never block on a review-side outage
            print(f"judgment backend unavailable for {tool_name}, failing open: {e}", file=sys.stderr)
        out = {"continue": True, "decision": decision, "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason,
        }}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
```

End-to-End gegen die oben genannte reale Produktions-API getestet: Eine echt destruktive Eingabe (`{"tool_name": "run_shell_command", "tool_input": {"command": "rm -rf /important_data"}}`) lieferte `permissionDecision: "deny"` mit einer echten Erklärung; eine harmlose (`ls -la`) lieferte `"allow"`. Fail-Open bei jedem Netzwerk-/Timeout-/Fehlformatierungsproblem vom Judgment-Backend, sodass ein Ausfall niemals legitime Tool-Aufrufe blockiert – dieselbe Disziplin, die die `command`-Hook-Beispiele oben mit ihren eigenen Exit-Codes anwenden.

### Function Hooks

Function Hooks rufen direkt registrierte JavaScript/TypeScript-Funktionen auf. Sie werden intern vom Skill-System verwendet und sind derzeit nicht als öffentliche API für Endbenutzer verfügbar.

**Hinweis**: Verwende für die meisten Anwendungsfälle stattdessen **Command Hooks** oder **HTTP Hooks**, die in den Einstellungsdateien konfiguriert werden können.

### Prompt Hooks

Prompt Hooks nutzen ein LLM, um den Hook-Input auszuwerten und eine Entscheidung zurückzugeben. Dies ist nützlich, um kontextbasiert intelligente Entscheidungen zu treffen, wie z. B. das Erlauben oder Blockieren einer Operation.

> **Datenbehandlung:** Ein Prompt-Hook sendet seinen Event-Input an den konfigurierten Modell-Provider. Wenn dateibasierte Debug-Protokollierung aktiviert ist, wird der vollständig expandierte Prompt-Hook-Request auch in das Session-Debug-Log geschrieben. Behandle Hook-Input und Debug-Logs als potenziell sensibel.

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
- `UserPromptSubmit` - Berechtigte modellgebundene Prompts auswerten oder anreichern

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
        "matcher": "run_shell_command",
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

| Event                | Triggered When                                  | Matcher Target                                                 |
| :------------------- | :---------------------------------------------- | :------------------------------------------------------------- |
| `PreToolUse`         | Vor der Tool-Ausführung                         | Tool-Id (`write_file`, `read_file`, `run_shell_command`, usw.) |
| `PostToolUse`        | Nach erfolgreicher Tool-Ausführung              | Tool-Id                                                        |
| `PostToolUseFailure` | Nach fehlgeschlagener Tool-Ausführung           | Tool-Id                                                        |
| `UserPromptSubmit`   | Vor unterstützten Modell-Invokationen           | Keine                                                          |
| `SessionStart`       | Wenn die Session startet oder fortgesetzt wird  | Quelle (`startup`, `resume`, `clear`, `compact`)               |
| `SessionEnd`         | Wenn die Session endet                          | Grund (`clear`, `logout`, `prompt_input_exit`, usw.)           |
| `SessionDelete`      | Nach dem Löschen einer explizit ausgewählten Session | Keine                                                     |
| `MessageDisplay`     | Wiederholt während des Streamens der Antwort    | Keine (wird immer ausgelöst)                                   |
| `Stop`               | Wenn Claude die Antwort abschließen möchte      | Keine (wird immer ausgelöst)                                   |
| `SubagentStart`      | Wenn der Subagent startet                       | Agent-Typ (`Bash`, `Explorer`, `Plan`, usw.)                   |
| `SubagentStop`       | Wenn der Subagent stoppt                        | Agent-Typ                                                      |
| `PreCompact`         | Vor der Konversations-Kompaktierung             | Trigger (`manual`, `auto`)                                     |
| `Notification`       | Wenn Benachrichtigungen gesendet werden         | Typ (`permission_prompt`, `idle_prompt`, `auth_success`)       |
| `PermissionRequest`  | Wenn der Berechtigungsdialog angezeigt wird     | Tool-Id                                                        |
| `PermissionDenied`   | Wenn eine Tool-Berechtigung verweigert wird     | Tool-Id                                                        |
| `TodoCreated`        | Wenn ein neues Todo-Element erstellt wird       | Keine (wird immer ausgelöst)                                   |
| `TodoCompleted`      | Wenn ein Todo-Element als abgeschlossen markiert wird | Keine (wird immer ausgelöst)                             |
### Matcher-Pattern

`matcher` ist ein regulärer Ausdruck, der zum Filtern von Trigger-Bedingungen verwendet wird.

| Ereignistyp         | Ereignisse                                                                                     | Matcher-Unterstützung | Matcher-Ziel                                                |
| :------------------ | :-----------------------------------------------------------------------------------------     | :-------------------- | :---------------------------------------------------------- |
| Tool-Events         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`     | ✅ Regex              | Tool-Id: `write_file`, `read_file`, `run_shell_command`, etc. |
| Subagent-Events     | `SubagentStart`, `SubagentStop`                                                                | ✅ Regex              | Agent-Typ: `Bash`, `Explorer`, etc.                         |
| Session-Events      | `SessionStart`                                                                                 | ✅ Regex              | Quelle: `startup`, `resume`, `clear`, `compact`             |
| Session-Events      | `SessionEnd`                                                                                   | ✅ Regex              | Grund: `clear`, `logout`, `prompt_input_exit`, etc.         |
| Session-Events      | `SessionDelete`                                                                                | ❌ Nein               | N/A                                                         |
| Notification-Events | `Notification`                                                                                 | ✅ Exakter Match      | Typ: `permission_prompt`, `idle_prompt`, `auth_success`     |
| Compact-Events      | `PreCompact`                                                                                   | ✅ Exakter Match      | Trigger: `manual`, `auto`                                   |
| Todo-Events         | `TodoCreated`, `TodoCompleted`                                                                 | ❌ Nein               | N/A                                                         |
| Prompt-Events       | `UserPromptSubmit`                                                                             | ❌ Nein               | N/A                                                         |
| Stop-Events         | `Stop`                                                                                         | ❌ Nein               | N/A                                                         |
| Message Display     | `MessageDisplay`                                                                               | ❌ Nein               | N/A                                                         |

**Matcher-Syntax:**

- Ein leerer String `""` oder `"*"` stimmt mit allen Ereignissen dieses Typs überein
- Standard-Regex-Syntax wird unterstützt (z. B. `^run_shell_command$`, `read_.*`, `(write_file|edit)`)
- Tool-Hooks erhalten die Runtime-Tool-Id in `tool_name` (zum Beispiel `write_file`). Eingebaute Anzeigenamen wie `WriteFile` und `ReadFile` werden ebenfalls als Matcher-Aliase für die Kompatibilität akzeptiert, aber neue Konfigurationen sollten Runtime-Ids bevorzugen.

**Beispiele:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "write_.*",
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

Alle Hook-Executor erhalten den standardisierten Event-Input. Die Zustellgrenze hängt vom Executor ab:

| Hook-Typ   | Input-Empfänger                                                 |
| :--------- | :-------------------------------------------------------------- |
| `command`  | Child-Process über JSON auf `stdin`                             |
| `http`     | Konfigurierter Endpunkt über einen JSON-`POST`-Body             |
| `function` | Vertrauenswürdiger In-Process-Callback                          |
| `prompt`   | Konfigurierter Modell-Provider, nachdem der Input `$ARGUMENTS` ersetzt hat |

Function-Hooks sind vertrauenswürdiges Code, das im Qwen-Prozess läuft. Sie erhalten ein In-Process-Objekt, daher dürfen Felder bei einem Function-Hook nicht als unveränderlich betrachtet werden.

Qwen kontrolliert nicht, ob ein Hook-Prozess, Endpunkt, Callback oder Modell-Provider seinen Input aufbewahrt oder weiterleitet. Prüfe die Datenbehandlungsrichtlinie jedes konfigurierten Executors.

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

Hook-Input ist ein vorwärts-erweiterbarer JSON-Contract: Neue optionale Felder können zu bestehenden Events hinzugefügt werden. Konsumenten sollten unbekannte Felder ignorieren. Ein strikter Decoder, der unbekannte Properties ablehnt, muss explizit jedes neue optionale Feld erlauben, bevor ein Upgrade von Qwen Code durchgeführt wird. Bei sicherheitskritischen Hooks kann ein Decoder-Fehler das Fail-Open- oder Fail-Closed-Verhalten ändern, daher müssen Administratoren das aktualisierte Payload vor dem Rollout gegen den eingesetzten Hook validieren.

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

Für `"ask"` zeigt die TUI `permissionDecisionReason` als Literaltext an, statt Inline-Markdown zu interpretieren. Dadurch bleiben Formatierungsmarker und Link-Ziele für den Benutzer sichtbar.

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

**Zweck**: Wird vor unterstützten Modell-Invokationen ausgeführt, um den aktuellen modellgebundenen Prompt zu validieren, zu blockieren oder anzureichern. Das Event deckt derzeit `UserQuery`-, `ToolResult`- und `Hook`-Sendungen ab, während `Retry`-, `Steer`-, `Cron`-, `Notification`- und `Teammate`-Sendungen übersprungen werden. Es kann daher auf Fortsetzungspfaden auftreten, und `prompt` darf nicht als roher Benutzer-Input angenommen werden.

**Ereignisspezifische Felder**:

```json
{
  "prompt": "current model-bound prompt for this hook invocation",
  "submitted_prompt": "optional user text captured at a supported interactive TUI submission boundary"
}
```

`submitted_prompt` ist optional. Es ist nur vorhanden, wenn Qwen die Provenienz von einer unterstützten interaktiven TUI-Übermittlung zu einer neuen `UserQuery` transportieren kann. Es wird für nicht unterstützte Produzenten und maschinengesteuerte Pfade wie Same-Turn-Steering, Tool-Result-Fortsetzungen, Retries, Cron, Benachrichtigungen und Teammate-Traffic weggelassen. ACP-, Headless-, `serve`-, SDK- und Remote-Input-Pfade erzeugen es in dieser Version nicht.

Deferred Input kann das Feld behalten, wenn seine Provenienz vollständig bleibt. Ein kombiniertes Batch behält die Provenienz nur, wenn jedes konstituierende Element sie hat; bearbeitetes, teilweise bekanntes oder anderweitig mehrdeutiges Input lässt das Feld weg. Prompt-, Command- und Shell-History-Navigation oder ausgewählte Suchtreffer, Cross-Restart-Stash-Wiederherstellungen und Conversation-Rewind-Wiederherstellungen lassen es ebenfalls weg, da diese Pfade modellgebundenen Text ohne seine ursprüngliche Provenienz anzeigen können. Konsumenten, die vom Benutzer übermittelten Text benötigen, sollten Abwesenheit als nicht verfügbar behandeln, statt auf `prompt` zurückzufallen.

Nachdem wiederhergestellter oder nicht-provenienzverfügbarer modellgebundener Input gelöscht oder übermittelt wurde, löscht der Composer auch seine Undo- und Redo-History. Dies verhindert, dass Undo den expandierten Text wiederherstellt, nachdem sein Marker oder Sidecar verbraucht wurde.

Large-Paste-Platzhalter bleiben kompakt in `submitted_prompt`; der expandierte eingefügte Inhalt erscheint nur in `prompt`. Konsumenten sollten das Feld als TUI-Textprojektion behandeln, nicht als Byte-für-Byte-Aufzeichnung der Clipboard-Eingabe.

Jedes nicht-leere Input, das vorhanden ist, während der Vim-Modus aktiviert ist, lässt `submitted_prompt` weg, auch nachdem Vim deaktiviert wurde, da Vim-Register in dieser Version keine Provenienz transportieren. Diese konservative Regel deckt auch vor der Aktivierung von Vim eingegebene Entwürfe ab. Das Löschen des Composers startet ein neues berechtigtes Input.

Dieses Feld ist Provenienz, nicht Authentifizierung, Mandantenidentität, Autorisierung oder DLP. Es sind vom Aufrufer bereitgestellte Daten. Jeder für dieses Event konfigurierte Executor erhält es; insbesondere senden HTTP-Hooks es an ihren Endpunkt und Prompt-Hooks an ihren Modell-Provider.

Wenn beide Felder vorhanden sind, enthalten Prompt-Hook-Payloads überlappenden Text und können zusätzliche Modell-Input-Token verbrauchen. Es gibt in dieser Version keine Pro-Feld-Unterdrückung pro Hook.

Sequentielle UserPromptSubmit-Hooks können `additionalContext` an `prompt` anhängen; `submitted_prompt` repräsentiert weiterhin die erfasste Übermittlung. Function-Hooks sind vertrauenswürdiger Same-Process-Code und unterliegen keiner Unveränderlichkeitsgarantie.

Wenn die finale Hook-Ausgabe nicht-leeres `additionalContext` enthält, bereinigt Qwen den Wert und sendet ihn dann als separaten Textteil an das Modell:

```xml
<qwen:user-prompt-submit-context>
bereinigter Hook-Kontext
</qwen:user-prompt-submit-context>
```

Der Tag teilt dem Modell und Transkript-Konsumenten mit, dass der Teil von einem konfigurierten Hook stammt und nicht vom Benutzer-Prompt. Er ist ein Provenienz-Marker, keine Authentifizierung, Autorisierung oder allgemeine Vertrauensgrenze.

Für eine `UserQuery` mit diesem hinzugefügten Kontext bewahrt die Session-JSONL-Zeile die modellgebundenen Teile auf, einschließlich des getaggten Teils, und fügt das folgende `systemPayload` hinzu:

```json
{
  "displayText": "Pre-Hook-Anzeige-Projektion",
  "hookContext": "bereinigter Hook-Kontext"
}
```

Dieses Zwei-Feld-Payload wird nur für diese Art von Benutzer-Prompt-Zeile geschrieben. `hookContext` dupliziert absichtlich den getaggten Teil, damit Offline- und Drittanbieter-Konsumenten seine Provenienz erkennen können, ohne Modelltext zu parsen. `displayText` ist die Pre-Hook-Anzeige-Projektion und enthält niemals den Hook-Kontext. Für eine unterstützte interaktive TUI-Übermittlung ist es die rohe Composer-Projektion, die von `submitted_prompt` getragen wird; ACP-, Headless-, `serve`-, SDK-, Remote-Input- und andere Pfade ohne diese Provenienz zeichnen stattdessen den expandierten Pre-Hook-Prompt auf.

Transkript-Anzeige-Konsumenten behandeln `displayText` als diese Benutzer-Prompt-Projektion, wenn `systemPayload.hookContext` ein String ist. Für Kompatibilität mit veröffentlichten `displayText`-only Benutzer-Prompt-Zeilen ist ein vollständiger getaggter Kontext im letzten Teil nach mindestens einem weiteren Teil ein gleichwertiger pairing-Hinweis. Notification-, Cron- und Mid-Turn-Zeilen können ebenfalls `displayText` haben, aber diese Werte sind kompakte Anzeige-Labels und dürfen nicht ohne diesen Nachweis für ihren modellgebundenen Text substituiert werden.
Legacy-nackte Kontext-Zeilen behalten ihr modellgebundenes Anzeige-Verhalten, da der Kontext nicht zuverlässig getrennt werden kann. Für Metadaten-freie Zeilen, die die aktuelle getaggte Form verwenden, dürfen Kompatibilitäts-Konsumenten den gleichen vollständigen finalen getaggten Teil entfernen; sie dürfen nicht ableiten, dass beliebiger tag-artiger Benutzer-Text Hook-Provenienz ist.

Sensitive-Prompt-Telemetrie-Attribute (wenn aktiviert) und Managed-AutoMemory-Abfrage verwenden beide den Pre-Hook-Prompt. Sie enthalten keinen durch `UserPromptSubmit` hinzugefügten Kontext.

**Output-Optionen**:

- `decision`: "allow", "deny", "block" oder "ask"
- `reason`: Menschlich lesbare Begründung für die Entscheidung
- `hookSpecificOutput.additionalContext`: Zusätzlicher Context, der an den Prompt angehängt wird (optional)

Wenn das injizierte `additionalContext` an das Modell gesendet wird, wird es als eigener Nachrichtenteil in einem reservierten `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`-Tag gewrappt, sodass es in der Modell-History und Session-Transkripten unterscheidbar von vom Benutzer verfasstem Text bleibt. Spitze Klammern in der Hook-Ausgabe werden vor dem Wrappen escapet, sodass Hook-Inhalte den Tag nicht schließen oder fälschen können. Das Session-Transkript zeichnet den ursprünglichen Prompttext des Benutzers ebenfalls separat auf; das interaktive TUI und der ACP/Export-Transkript-Wiedergabepfad zeigen diesen ursprünglichen Text anstatt des injizierten Kontexts.

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

#### SessionDelete

**Zweck**: Wird ausgeführt, nachdem eine explizit ausgewählte Session dauerhaft gelöscht wurde. Dieses Event ist Fire-and-Forget: Output und Fehler können die Löschung nicht rückgängig machen.

**Ereignisspezifische Felder**:

```json
{
  "deleted_session_id": "the session that was deleted"
}
```

Der Hook verwendet die normalen Session-Felder des löschenden Runtimes (`session_id`, `transcript_path` und `cwd`); über ACP ist `transcript_path` leer, da der löschende Runtime kein eigenes Transkript hat. `SessionDelete` wird derzeit für den interaktiven `/delete`-Flow und ACPs explizite `deleteSession`-Methode ausgelöst; die Daemon-REST-Batchlöschung und internes Cleanup emittieren es nicht. Ein Command-Hook wird zu Ende ausgeführt, wenn Qwen nach dem Dispatch beendet wird; seine stdout und stderr werden ignoriert und bleiben unabhängig von Qwens Pipes.

#### MessageDisplay

**Zweck**: Wird wiederholt ausgelöst, während die Antwort des Assistenten gestreamt wird – vor `Stop`, das einmal am Ende des Turns feuert. Nützlich für Live-Narration, inkrementelles Logging oder jeden Konsumenten, der auf die Antwort reagieren möchte, während sie geschrieben wird, statt nachträglich. Dies ist ein **Fire-and-Forget**-Event – Hook-Output und Exit-Codes werden ignoriert.

**Ereignisspezifische Felder**:

```json
{
  "message_id": "stable id for the whole streamed message",
  "displayed_text": "the CUMULATIVE text streamed so far for this message (not a delta)",
  "is_final": "true on the last firing for this message, false otherwise"
}
```

`displayed_text` ist kumulativ statt ein Delta, damit Hook-Skripte nie selbst Chunks zusammensetzen müssen – jedes Firing trägt den vollständigen bisherigen Text. Das Firing wird gedebounced (höchstens alle ~200 ms), außer beim finalen Firing (`is_final: true`), das immer feuert, sobald die Nachricht endet, sodass das Ende der Antwort nie verloren geht, während auf das Debounce-Fenster gewartet wird.

**Zustellsemantik** – worauf sich ein Hook-Skript verlassen kann:

- **Langsame Hooks sehen weniger, neuere Payloads.** Höchstens eine Mid-Stream-Hook-Ausführung pro Nachricht ist gleichzeitig unterwegs; während eine läuft, _ersetzen_ neuere Debounce-Payloads die in der Warteschlange befindliche, statt sich dahinter anzustellen. Ein Hook, der langsamer als das Debounce-Fenster ist, überspringt daher Zwischensnapshots – verlustfrei, da jeder Payload den vollständigen kumulativen Text trägt.
- **`is_final` wird nie hinter einer veralteten Zustellung eingereiht.** Der finale Payload wird dispatcht, sobald die Nachricht endet – neben einer noch laufenden Mid-Stream-Ausführung, falls es eine gibt (die einzige Ausnahme von der Einmal-gleichzeitig-Regel, auf die gleiche Weise begründet: der finale kumulative Text macht die gerade verarbeitete Version strikt überflüssig). Dein Hook erhält immer den `is_final`-Payload, und erhält ihn vor dem `Stop`-Hook-Feuer. Eine Konsequenz für zustandsbehaftete Hooks: Wenn die finale Ausführung eine veraltete Mid-Stream-Ausführung überlappt, ist ihre _Abschlussreihenfolge_ nicht spezifiziert – die veraltete Ausführung kann nach der finalen enden (sogar nach `Stop`). Behandle `is_final` als terminal pro `message_id` und lass den kumulativen Text gewinnen, statt anzunehmen, dass die zuletzt beendete Ausführung den neuesten Zustand trägt.
- **Der Turn wartet auf den Abschluss der `is_final`-Zustellung – aber nicht ewig.** Das Turn-Ende (und der `Stop`-Hook, wenn er feuert) wartet bis zu 5 Sekunden auf den Abschluss der finalen Zustellung. Ein Hook, der innerhalb dieses Budgets abschließt, behält die stärkste Garantie: Ein Headless-Lauf (`qwen -p ...`) endet erst, nachdem der Hook fertig ist, und die `is_final`-Ausführung wird vor `Stop` abgeschlossen. Ein langsamerer Hook erhält `is_final` trotzdem zuerst – nur das Warten auf seinen Abschluss ist begrenzt: Im Terminal-UI oder einer ACP-Session wird die Ausführung einfach im Hintergrund abgeschlossen, während ein Headless-Lauf ohne Warten endet. Der Hook-Prozess wird beim Beenden nicht getötet; er darf von selbst fertig werden, sodass ein Skript, das `qwen -p … && next-step` verkettet, beobachten kann, dass `next-step` startet, während ein langsamer Hook noch läuft. Das Erreichen dieses Timeouts gibt eine Warnung auf stderr aus.
- **Das Abbruchverhalten hängt vom Timing ab.** Ein Turn, der _vor dem `is_final`-Dispatch_ abgebrochen wird, feuert kein `is_final` – die Nachricht wird als aufgegeben behandelt, und ein Konsument, der bis `is_final` puffert, sollte Abbruch-Stille als sein Flush/Discard-Signal behandeln (z. B. ein Timeout-Fallback). Das Kriterium ist der Zustand des Abort-Signals zum Zeitpunkt, zu dem der Turn endet, nicht ob jeder Chunk bereits gestreamt war – ein Abort, der in der kurzen Lücke vor dieser Prüfung eintrifft, kann `is_final` für eine Nachricht unterdrücken, deren Text praktisch bereits angekommen war. Ein Abbruch _nach dem `is_final`-Dispatch_ (während des Drain-Waitings) ist anders: Die noch laufende Hook-Ausführung kann mitten im Flug beendet werden (SIGTERM), aber der Payload selbst wurde bereits zugestellt.
- **`displayed_text` ist provisorisch bis `is_final`.** Es spiegelt wider, was bisher gestreamt wurde; behandle Zwischen-Payloads als Anzeigestatus, nicht als maßgeblichen finalen Inhalt.
- **Ein Turn mit Tool-Nutzung erzeugt mehrere Nachrichten.** Jeder Modellaufruf bekommt seine eigene `message_id` mit eigenem `is_final: true`-Firing: Der Text vor einem Tool-Aufruf ist eine Nachricht, die Fortsetzung nach dem Tool-Ergebnis eine andere. Modellaufrufe, die keinen angezeigten Text erzeugen (nur Tool-Aufruf), feuern nichts.

**Hinweis**: Feuer im Terminal-UI, Headless- (`-p`) und ACP- (IDE/Editor/`qwen serve`) Sessions mit dem gleichen Payload-Contract auf allen Oberflächen.

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

**Zweck**: Wird ausgeführt, wenn der Turn aufgrund eines API-Fehlers oder einer Loop-Erkennung endet (anstelle von Stop). Dies ist ein **Fire-and-Forget**-Event – Hook-Output und Exit-Codes werden ignoriert.

**Ereignisspezifische Felder**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | loop_detected | unknown",
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

Ein Command-Hook wird zu Ende ausgeführt, wenn Qwen nach dem Dispatch beendet wird; seine stdout und stderr werden ignoriert und bleiben unabhängig von Qwens Pipes.

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
        "matcher": "^run_shell_command$",
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

Async-Hooks sind auf den Qwen-Prozess beschränkt, da ihre erfasste Ausgabe über die In-Memory-Async-Hook-Registry zugestellt wird. Unter POSIX reklamiert Qwen einen noch laufenden Async-Hook-Prozessbaum, wenn es beendet wird, außer für Event-Typen, deren Abschnitte ausdrücklich eine Fire-and-Forget-Fertigstellung nach dem Beenden garantieren. Windows kann einen Nachkommen-Baum nach dem Beenden seines Roots nicht rekonstruieren, daher erfordert die vollständige Parent-Exit-Reklamation dort ein Job Object oder Descendant Tracking.

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
        "matcher": "write_file|edit",
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

### Beispiel 3: Interactive-TUI-Submitted-Prompt-Validation-Hook

Um stattdessen den aktuellen modellgebundenen Inhalt zu prüfen, lies `prompt`. Dieses Feld kann generierte oder expandierte Inhalte enthalten, ist nicht der ursprüngliche Benutzer-Input und impliziert nicht, dass `UserPromptSubmit` jede Modell-Sendung abdeckt. Falle nicht stillschweigend von `submitted_prompt` auf `prompt` zurück, wenn Quellprovenienz erforderlich ist.

Ein UserPromptSubmit-Hook, der unterstützte interaktive TUI-Übermittlungen auf sensible Informationen validiert und Kontext für lange Prompts bereitstellt. Er überspringt Invokationen, bei denen die Quellprovenienz nicht verfügbar ist. Die Keyword-Prüfung ist illustrierend und keine vollständige DLP-Richtlinie:

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
    sys.exit(1)

user_prompt = input_data.get("submitted_prompt")
if user_prompt is None:
    # Do not mistake model-bound or machine-generated content for raw input.
    sys.exit(0)

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
        sys.exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# No processing needed for normal cases
sys.exit(0)
```

## Troubleshooting

- Überprüfe die Anwendungslogs auf Details zur Hook-Ausführung
- Überprüfe die Berechtigungen und Ausführbarkeit der Hook-Skripte
- Stelle eine korrekte JSON-Formatierung in den Hook-Ausgaben sicher
- Verwende spezifische Matcher-Pattern, um eine unbeabsichtigte Hook-Ausführung zu vermeiden
- Verwende den `--debug`-Modus, um detaillierte Informationen zum Hook-Matching und zur Ausführung zu sehen. Prompt-Hook-Inputs können in das Session-Debug-Log geschrieben werden, also wende entsprechende Zugriffs- und Aufbewahrungskontrollen an.
- Deaktiviere vorübergehend alle Hooks: füge `"disableAllHooks": true` in den Einstellungen hinzu