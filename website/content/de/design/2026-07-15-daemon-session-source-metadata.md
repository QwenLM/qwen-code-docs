# Daemon session source metadata

## Motivation

Daemon-Clients müssen identifizieren können, welche Integration eine Session erzeugt hat, nachdem der Daemon neu gestartet wurde. Reine Live-Bridge-Metadaten reichen nicht aus, weil Live-Einträge beim Load oder Resume aus dem persistierten Transkript neu aufgebaut werden.

## API

`POST /session` akzeptiert zwei optionale unveränderliche Felder:

- `sourceType`: ein Kleinbuchstaben-Source-Token (`[a-z][a-z0-9_-]{0,63}`).
- `sourceId`: ein nicht-leerer Identifier von höchstens 256 Zeichen. Er ist nur gültig, wenn `sourceType` vorhanden ist.

Die Felder werden von Session-Erstellungs-, Status- und Workspace-Session-Listen-Antworten zurückgegeben. Bestehende Sessions lassen beide Felder weg. Unter `sessionScope: single` liefert ein Attach die Source der bestehenden Session zurück und übernimmt niemals die Source der anhängenden Anfrage.

Workspace-Session-Listen akzeptieren die Query-Parameter `sourceType` und optionales `sourceId`. `sourceId` erfordert `sourceType`; wenn beide vorhanden sind, werden sie gemeinsam gematcht. Source-Filter werden nicht mit der organisierten Ansicht kombiniert.

Geplante Daemon-Aufgaben markieren ihre dedizierte Session mit `sourceType: "scheduled_task"` und der dauerhaften Aufgaben-Id als `sourceId`.

Daemon-Channel-Worker markieren Sessions, die sie erzeugen, mit `sourceType: "channel"` und dem konfigurierten Channel-Instanznamen (z. B. `feishu-main`) als `sourceId`, damit die Channel-Instanz — und über die Channel-Konfiguration auch der Channel-Typ (dingtalk/feishu/...) — auf der Daemon-Datenebene zugeordnet werden kann. Das Laden oder Anhängen einer bestehenden Session prägt deren Erstellungs-Source niemals neu.

## Persistenz

Eine frische Session speichert ein `session_source`-System-Record nahe dem Anfang ihres JSONL-Transkripts:

```json
{
  "type": "system",
  "subtype": "session_source",
  "systemPayload": {
    "sourceType": "web_shell",
    "sourceId": "window-1"
  }
}
```

Die Bridge bittet das Session-Child, dieses Record über eine erwartete ACP-Control-Methode anzuhängen, analog zur bestehenden `parent_session`-Persistenzgrenze. Die Erstellungsantwort legt `sourcePersisted` offen, damit ein Aufrufer eine degradierte Live-only-Source erkennen kann, falls die Aufzeichnung fehlschlägt.

`SessionService` liest das Record beim Scannen des Transkript-Anfangs für Listenantworten und vor Load/Resume, damit wiederhergestellte Live-Zusammenfassungen die Source behalten.

## Branching

Geforkte Transkripte dürfen `session_source` nicht kopieren; andernfalls würde ein neuer Branch den Erzeuger der ursprünglichen Session beanspruchen. Ein Branch hat keine Source, bis sein Erstellungspfad explizit eine zuweist.

## Kompatibilität

Beide Felder sind optional. Ältere Transkripte und Clients bleiben gültig. REST, ACP-over-HTTP und das TypeScript-SDK leiten die Erstellungs- und Listen-Filter-Felder weiter. Daemons, die die Felder implementieren, bewerben `session_source_metadata`; das SDK prüft dieses Capability, bevor es Source-Metadaten oder Source-Filter sendet, damit ein älterer Daemon sie nicht stillschweigend ignorieren und ungefilterte Ergebnisse zurückgeben kann. Die Werte dienen nur der Zuordnung und dürfen nicht als Autorisierungssignal verwendet werden, weil Clients sie liefern können.

Wenn sich ein Client trennt, bevor er eine neu erzeugte Session erhält, entfernt der Daemon sowohl die Live-Session als auch ihr neu geschriebenes Transkript. Ein gleichzeitiger Attach verhindert beide Operationen und erhält die Session für den angehängten Client.
