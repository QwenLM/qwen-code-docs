# Daemon MCP force reconnect

## Problem

`POST /workspace/mcp/reload` lädt persistierte Einstellungen neu, gleicht
MCP-Verbindungen aber inkrementell ab. Ein Server, dessen Einstellungen
unverändert sind, behält seinen bestehenden Transport. OAuth-Credentials, die
von einem anderen Qwen-Code-Prozess geschrieben wurden, werden daher erst
gelesen, wenn dieser Transport sich neu verbindet.

## Design

Optionale Felder `forceReconnectAll` und `forceReconnectWhich` zu beiden
Workspace-MCP-Reload-Routen und ihren SDK-/ACP-Bridge-Methoden hinzufügen.
`forceReconnectAll` ist standardmäßig `false`; `forceReconnectWhich` wählt
benannte Server aus. Die Felder schließen sich gegenseitig aus.

Wenn eine der beiden Reconnect-Optionen angegeben wird, führt der Daemon
zuerst die normale Einstellungs-Reconciliation durch. Dann verbindet er jeden
konfigurierten MCP-Server des Workspaces neu, oder nur die durch
`forceReconnectWhich` ausgewählten Namen:

- Gepoolte Server werden über den Workspace-Transport-Pool einmal pro
  Server-Name neu gestartet und aktualisieren dann die Modell-Tool-Snapshots
  für Live-Konfigurationen;
- Server ohne Pool-Eintrag verwenden den bestehenden
  Pro-Konfiguration-Entdeckungspfad, der vor der Neu-Entdeckung trennt und neu
  verbindet.

Dies leitet bewusst kein OAuth ein. Es erzeugt nur eine neue Verbindung, die
die aktuell vom Token-Storage des Daemons persistierten Credentials liest.

## API

`POST /workspace/mcp/reload` und
`POST /workspaces/:workspace/mcp/reload` akzeptieren:

```json
{ "forceReconnectAll": true }
```

`forceReconnectWhich` akzeptiert ein Array aus nicht leeren Server-Namen.
Ungültige Werte liefern 400 zurück.
Die Antwort bleibt `202 { "accepted": true }`, da die Arbeit in die Queue
gestellt wird.

## Verifikation

- Routen-Tests decken Default-Weiterleitung, `true`-Weiterleitung und
  ungültige Eingaben ab.
- ACP-Tests decken die Propagierung zu jeder Live-Konfiguration und das
  Force-Reconnect-Verhalten ab.
- Der E2E-Plan dokumentiert ein Szenario mit extern geschriebenem
  OAuth-Token.
