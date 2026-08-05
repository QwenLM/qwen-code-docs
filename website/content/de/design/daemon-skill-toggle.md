# Daemon-Skill-Toggle

## Ziel

Das Workspace-Aktivierungs-/Deaktivierungsverhalten des CLI-Panels `/skills` über Daemon-REST und das TypeScript-SDK verfügbar machen, einschließlich sofortiger Aktualisierung aktiver ACP-Sessions.

## Öffentlicher Vertrag

- `POST /workspace/skills/:name/enable`
- `POST /workspaces/:workspace/skills/:name/enable`
- Request-Body: `{ "enabled": boolean }`
- SDK: `DaemonClient.setWorkspaceSkillEnabled` und `WorkspaceDaemonClient.setWorkspaceSkillEnabled`
- Capability: `workspace_skill_toggle`

Die Antwort enthält den kanonischen Skill-Namen, den angeforderten Zustand, ob die Persistenz geändert wurde, den Aktivierungszustand und die Anzahl der Session-Aktualisierungen. `applied` bedeutet, dass jede aktive Session aktualisiert wurde, `deferred` bedeutet, dass kein ACP-Child lief, und `partial` bedeutet, dass nach dem Commit der Persistenz mindestens eine Session nicht aktualisiert werden konnte.

## Semantik

Die API ändert `skills.disabled` und `skills.enabled` des Workspaces nach Bedarf. Die Skill-Suche erfolgt Case-insensitive, aber der entdeckte kanonische Name wird persistiert. Das Aktivieren eines per Default deaktivierten Skills schreibt ein explizites Opt-in; das Deaktivieren entfernt das Opt-in und schreibt eine harte Workspace-Deaktivierung. Das Aktualisieren eines Ziels entfernt Duplikate und Schreibweisen-Varianten des Ziels, ohne verwaiste Einträge für nicht verfügbare Skills zu löschen. Eine zweite identische Anfrage ist ein No-Op.

Die Route lehnt Zustände ab, die das CLI-Panel nicht umschalten kann:

- unbekannter Skill: `404 skill_not_found`;
- `userInvocable === false`: `409 skill_not_toggleable`;
- Skill aus einer inaktiven Extension: `409 skill_not_toggleable`;
- in System-Defaults, User-Scope oder System-Scope deaktiviert: `409 skill_not_toggleable` mit dem Lock-Scope;
- nicht vertrauenswürdiger Workspace: `403 untrusted_workspace`.

Der Scope-Lock-Check und das Read-Modify-Write des Workspaces finden innerhalb des Settings-Locks pro Workspace des Daemons statt. Ein fehlgeschlagener Schreibvorgang stoppt vor der Aktualisierung und der Event-Veröffentlichung.

## Skill-Verfügbarkeit gegenüber `disable-model-invocation`

`skills.disabled` ist eine harte Operator-Deny-Liste, die als Case-insensitive-Union über Scopes hinweg zusammengeführt wird. `skills.defaultDisabled` liefert überschreibbare Defaults und `skills.enabled` liefert explizite Opt-ins, mit dem Vorrang `disabled > enabled > defaultDisabled`. Effektive Deaktivierungen entfernen passende Skill-Slash-Befehle und für das Modell sichtbare Skill-Einträge, und die Validierung zur Ausführungszeit lehnt den Skill ab. Der Daemon-Endpunkt schreibt die Workspace-Einträge von `disabled` und `enabled`.

`disable-model-invocation` sind SKILL.md-Metadaten. Sie verbergen einen Skill vor Modell-Aufrufen, während der direkte Benutzer-Aufruf erhalten bleibt. Die bestehende Managed-Skill-ACP-Operation bearbeitet diese Metadaten und wird von dieser API absichtlich nicht wiederverwendet.

## Aktivierungsfluss

1. Den kanonischen, umschaltbaren Skill aus dem Workspace-Status-Snapshot auflösen.
2. Unter dem Workspace-Settings-Lock jeden Scope neu einlesen, Locks höherer Scopes ablehnen und die kanonische Workspace-Liste committen.
3. Den gecachten Skill-Status des Daemons invalidieren.
4. Wenn ein ACP-Child live ist, `qwen/control/workspace/skills/refresh` aufrufen.
5. Das Child lädt die Einstellungen des Workspace-Scopes neu und aktualisiert jede aktive Session, einschließlich beschäftigter Sessions.
6. Jede Session lädt ihre eigenen Workspace-Einstellungen neu, baut `available_commands_update` neu auf und pusht es und benachrichtigt die SkillManager-Consumer.
7. Das bestehende Workspace-`settings_changed`-Event für jeden geänderten Skill-Einstellungs-Key veröffentlichen.

Ein In-flight-Modell-Request kann nicht umgeschrieben werden. Nachfolgende Skill-Ausführungs-Checks, Befehls-Snapshots und Modellkontexte lesen den neuen Zustand.

## Downstream-Consumer

- Einstellungen-Merge: System-Defaults sowie User-, Workspace- und System-Listen bilden das effektive Set deaktivierter Namen mit dem Vorrang `disabled > enabled > defaultDisabled`.
- Workspace-Status: Das ACP- und das Daemon-lokale Skill-Mapping exponieren den Deaktivierungszustand, den Deaktivierungsgrund, den Lock-Scope und `userInvocable` nur als false.
- Slash-Befehle: Der Aufbau der verfügbaren Befehle entfernt deaktivierte Skills und sendet aktualisierte Befehls-Metadaten an Daemon-Clients.
- Modellkontext: SkillManager-Change-Listener aktualisieren die Skill-Tool-Beschreibung und den Kontext verfügbarer Skills.
- Ausführungs-Validierung: Das Skill-Tool liest den Disabled-Name-Provider vor dem Aufruf erneut, sodass spätere Aufrufe sofort abgelehnt werden.
- Extension-Status: Skills inaktiver Extensions bleiben nicht umschaltbar, auch wenn sie nicht per Einstellungen deaktiviert sind.
- Daemon-Cache: Der gecachte Live-Child-Skill-Snapshot wird nach der Persistenz invalidiert, damit spätere GET-Requests keinen veralteten Zustand wiedergeben können.
- SDK-Consumer: Sowohl Clients des primären Workspaces als auch Workspace-qualifizierte Clients teilen den Antwort- und Fehler-Vertrag.
- Events: Bestehende `settings_changed`-Consumer beobachten jeden committeten `skills.disabled`- oder `skills.enabled`-Wert; es gibt keinen neuen Event-Typ.

## Fehlverhalten

- Persistenz-Fehler: Der HTTP-Request schlägt fehl; keine ACP-Aktualisierung und kein Event.
- Kein Child: Die Persistenz gelingt mit `deferred`; das nächste Child lädt die Einstellung beim Start.
- Aktualisierungsfehler pro Session: Die Persistenz bleibt committet; erfolgreiche Sessions bleiben aktualisiert und die Antwort ist `partial`.
- Transport-Wettlauf des Childs: Wenn das Child nach dem Liveness-Check verschwindet, ist die Antwort `deferred`; andere Aktualisierungsfehler werden als `partial` gemeldet.
