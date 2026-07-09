# Gesamtplan für Hot Reload

Dieses Verzeichnis verfolgt die Designarbeit für Issue
[#3696](https://github.com/QwenLM/qwen-code/issues/3696): ein umfassendes
Hot-Reload-System für Skills, Extensions, MCP-Server, LSP-Server und die
Runtime-Konfiguration.

## Ziel

Benutzer sollten in der Lage sein, Skills, den Zustand von Extensions, die
MCP/LSP-Konfiguration und unterstützte Einstellungen zu aktualisieren, ohne die
aktuelle Qwen Code-Sitzung neu starten zu müssen. Das System soll den
Konversationskontext beibehalten und gleichzeitig die Änderungen des
Runtime-Zustands vorhersehbar und sichtbar machen.

## Aufschlüsselung der Teilaufgaben

Der Hot-Reload-Plan umfasst **6 übergeordnete Teilaufgaben**. Das aktuelle
Tracking-Issue teilt Teilaufgabe 3 aus Gründen der Implementierungsklarheit in
**3a** und **3b** auf, sodass die Umsetzungs-Checkliste **7 Einträge** enthält.

| Aufgabe | Umfang | Status | Designdokument |
| ---- | ---------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| 1 | Erkennung von Änderungen in der Settings-Datei | Erledigt in #4933 | [settings-change-detection.md](./settings-change-detection.md) |
| 2 | Verbesserungen beim Skill-Hot-Reload | Erledigt über #2415 und #3923 | Nicht in diesem Verzeichnis |
| 3a | Runtime-Reinitialisierung von MCP-Servern | In Bearbeitung über #5561 | [mcp-runtime-reinitialization.md](./mcp-runtime-reinitialization.md) |
| 3b | Runtime-Reinitialisierung von LSP-Servern | In Bearbeitung | [lsp-runtime-reinitialization.md](./lsp-runtime-reinitialization.md) |
| 4 | Zentrale Refresh/Cache-Orchestrierung | Nicht gestartet | Ausstehend |
| 5 | Benutzerseitiger `/reload`-Slash-Command | Nicht gestartet | Ausstehend |
| 6 | `needsRefresh` App-State/UI-Benachrichtigung | Nicht gestartet | Ausstehend |

## Dokumentzuordnung

- `settings-change-detection.md` entspricht **Teilaufgabe 1: Erkennung von
  Änderungen in der Settings-Datei**. Sie stellt die Watcher-Infrastruktur
  bereit: Erkennt unterstützte `settings.json`-Änderungen, lädt die
  Einstellungen von der Festplatte neu und benachrichtigt Listener. Absichtlich
  werden aktualisierte Werte nicht in `Config`-Snapshots übernommen oder
  Runtime-Subsysteme neu gestartet.
- `mcp-runtime-reinitialization.md` entspricht **Teilaufgabe 3a:
  Runtime-Reinitialisierung von MCP-Servern**. Sie verarbeitet
  Settings-Change-Events, aktualisiert die Runtime-MCP-Konfiguration und gleicht
  aktive MCP-Verbindungen inkrementell ab. Das ursprüngliche Issue fasste MCP
  und LSP unter der übergeordneten Teilaufgabe 3 zusammen; dieses Dokument
  behandelt nur den MCP-Teil.
- `lsp-runtime-reinitialization.md` entspricht **Teilaufgabe 3b:
  Runtime-Reinitialisierung von LSP-Servern**. Sie überwacht Änderungen an
  `.lsp.json` im Workspace, nutzt den vorhandenen nativen LSP-Client wieder und
  gleicht aktive LSP-Server inkrementell ab.

## Implementierungsreihenfolge

1. Teilaufgabe 1 als Grundlage beibehalten: Settings-Änderungen werden erkannt
   und weitergeleitet, aber die Consumer entscheiden, was aktualisiert werden
   soll.
2. Teilaufgabe 3a abschließen, damit das Hinzufügen, Entfernen und Bearbeiten
   der Konfiguration von MCP-Servern zur Laufzeit wirksam werden kann.
3. Teilaufgabe 3b für die LSP-Runtime-Reinitialisierung nach demselben Prinzip
   hinzufügen: Runtime-Konfiguration aktualisieren, betroffene Server stoppen
   und nur das neu starten, was sich geändert hat.
4. Teilaufgabe 4 als zentrale Orchestrierungsschicht für Cache- und
   Runtime-Aktualisierungen über Skills, Commands, Prompts, Extensions, MCP und
   LSP hinweg einführen.
5. Teilaufgabe 5 als manuellen Entry-Point für Benutzer hinzufügen: `/reload`
   sollte den einheitlichen Orchestrierungspfad aufrufen und melden, was sich
   geändert hat.
6. Teilaufgabe 6 für die UX bei Hintergrundänderungen hinzufügen: `needsRefresh`
   setzen, wenn eine erkannte Änderung nicht automatisch vollständig angewendet
   werden kann oder soll, und den Benutzer dann auffordern, `/reload`
   auszuführen.

## Designprinzip

Jede Schicht schmal halten:

- File-Watching erkennt und meldet Settings-Änderungen;
- Die Reinitialisierung von Subsystemen aktualisiert nur den betroffenen
  Runtime-Zustand;
- Die einheitliche Orchestrierung koordiniert die Abfolge bestehender
  Aktualisierungsvorgänge;
- UI-Commands und Benachrichtigungen bilden das Verhalten ab, ohne die
  Reload-Logik zu duplizieren.