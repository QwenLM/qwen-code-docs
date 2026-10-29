# Session-Workflow-Modus


Der Workflow-Modus speichert eine Präferenz, das Workflow-Tool für gewöhnliche
neue Submissions in der aktuellen Session zu berücksichtigen. Er ist standardmäßig
deaktiviert. Das Modell entscheidet weiterhin, ob ein Workflow sinnvoll ist, und
alle Berechtigungs-, Vertrauens-, Budget- und Tool-Einschränkungen gelten
weiterhin. Das Aktivieren des Modus startet keinen Run, ändert nicht den
Reasoning-Aufwand und ändert nicht die Standardeinstellungen.

Workflow-Tools sind opt-in. Aktiviere `tools.workflowsEnabled` in den
Einstellungen oder setze `QWEN_CODE_ENABLE_WORKFLOWS=1`, bevor du den Modus
einschaltest:

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

Der Start mit `--workflow-mode on`, während die Tools nicht verfügbar sind,
schlägt bei der Initialisierung fehl. `QWEN_CODE_DISABLE_WORKFLOWS=1` hat
Vorrang vor deren Aktivierung.

Verwende in beiden Terminal-Renderern `/workflows mode` oder
`/workflows mode status`, um den Zustand abzulesen, und `/workflows mode on`
oder `/workflows mode off`, um ihn zu ändern. Diese Modus-Steuerungen können
ausgeführt werden, während eine Antwort streamt; sie betreffen nachfolgende
geeignete Submissions. Der Footer zeigt `Workflow mode: on` oder
`Workflow mode: on (unavailable)`, wenn die gespeicherte Präferenz derzeit
nicht angewendet werden kann. Die bestehende `/workflows`-Run-Liste und die
Pause-Steuerungen behalten ihr ursprüngliches Verhalten.

Der Zustand trennt `requested` (die gespeicherte Präferenz), `available` (die
erforderlichen Tools sind derzeit nutzbar) und `effective` (beides ist wahr).
Das Einschalten erfordert, dass die Workflow-Tools verfügbar sind. Das
Ausschalten bleibt auch möglich, wenn sie nicht verfügbar sind. Der Verlust
eines Tools löscht nicht eine gespeicherte On-Präferenz; die Wiederherstellung
des Tools macht diese Präferenz wieder wirksam.

Der Modus wird von gewöhnlichen lokalen Sessions und normalen Daemon-Sessions
unterstützt, einschließlich sekundärer Workspace-Owner. Managed-, SSH-,
Derived/Subagent- und Session-Agent-Sessions sowie Sessions mit deaktivierter
Chat-Aufzeichnung unterstützen keine Modusänderungen. Nicht unterstützte
Protokoll-Sessions bewerben die Capability oder Option nicht. Ein
fehlgeschlagener Schreibvorgang lässt den veröffentlichten Modus unverändert.

## Reminder- und Input-Verhalten

Die erste geeignete Submission erhält einen reinen Modell-Reminder. Ohne weitere
Änderungen folgen spärliche Reminder bei den Submissions 11 und 21, dann alle
zehn geeigneten Submissions. Das Ausschalten oder der Verlust der Capability
sendet eine einzige Austrittsmitteilung bei der nächsten geeigneten Submission.
Nur ein tatsächlicher Modell-Dispatch verbraucht einen Reminder oder erhöht den
Zähler; Abbruch oder Ablehnung vor dem Dispatch nicht. Retries und
Fallback-Versuche teilen sich dasselbe Delivery-Token. Wenn ein Abbruch einen
dispatchten Modus-Reminder aus dem Modellverlauf entfernt, kündigt die nächste
geeignete Submission den aktuellen Zustand erneut an.

Gewöhnliche CLI-, SDK- und ACP-Submissions können diesen expliziten Modus ohne
eine Human-Origin-Deklaration verwenden. Tool-Fortsetzungen, Retries, Hooks,
Slash-generierte Prompts, Shell-Modus, Side-Queries, automatische
Goal/Cron/Notification/Channel-Turns und Subagents fügen keinen neuen
Modus-Reminder hinzu und erhöhen nicht dessen Zähler. Die Prompt-Spekulation
ist pausiert, während der Modus oder ein nicht zugestellter Übergang Kontext
benötigt.

Der [One-Turn-Keyword-Hint](./workflow-intent.md) bleibt separat. Die
Anforderung an die menschliche Herkunft und die Opt-out-Einstellung bleiben
unverändert. Ein gültiges Keyword und ein Modus-Reminder teilen sich ein
Envelope; das Ausschalten des persistenten Modus deaktiviert kein gültiges
One-Turn-Keyword. Ein reiner Modus-Reminder aktiviert nicht den transienten
Keyword-Indikator oder die Keyword-Telemetrie.

## Session-Lifecycle

Resume stellt den letzten gültigen booleschen Eintrag auf dem ausgewählten
Transkript-Branch wieder her und kündigt einen gespeicherten On- oder
Off-Zustand einmalig an. Ein expliziter CLI- oder SDK-Initialwert
überschreibt diesen wiederhergestellten Wert einmalig, nachdem die Session
bereit ist. Konflikträchtige Initialwerte oder ein initialer On-Wert, während
Workflow-Tools nicht verfügbar sind, schlagen bei der Initialisierung fehl.
Eine neue oder gelöschte Session startet im Off-Zustand. Ein Fork erbt seinen
ausgewählten Checkpoint unabhängig; Rewind bewahrt die aktuelle Präferenz und
verankert sie im wiederhergestellten Branch. Erfolgreiche Kompression kündigt
den Zustand bei der nächsten geeigneten frischen Submission erneut an. Nach
einem fehlgeschlagenen Resume oder Branch-Wechsel, der die History der
vorherigen Session neu aufbaut, kündigt die nächste geeignete Submission ihren
gespeicherten Zustand erneut an. Eine Session ohne gespeicherte Präferenz
bleibt still.

## TypeScript-SDK und ACP

```ts
const session = query({
  prompt: messages(),
  options: { workflowMode: true },
});
const state = await session.getWorkflowMode();
await session.setWorkflowMode(false);
```

`workflowMode` ist optional: Das Weglassen bewahrt einen wiederhergestellten
Wert, während `false` explizit Off speichert. Die Initialisierung verhandelt
und stagt den Initialwert; `Query.initialized` ist der Control-Handshake.
Get/Set-Operationen warten auf die Session-Bereitschaft. Wiederholte
Initialisierungsanfragen werden abgelehnt, während die Session-Initialisierung
läuft. Eine ältere CLI lehnt eine explizite Modusanfrage vor dem ersten Prompt
ab, anstatt sie stillschweigend zu ignorieren. Custom Transports verwenden
dasselbe Control-Protokoll.

ACP bewirbt eine Standard-`workflow_mode`-Config-Option mit den Werten `on` und
`off`. Deren `currentValue` spiegelt den angeforderten Zustand wider, während
`_meta['qwen.workflowMode']` `available`, `effective` und einen optionalen
`reason` enthält. Committete Änderungen und Capability-Aktualisierungen
veröffentlichen die vollständigen Optionen über `config_option_update`.

Daemon-Clients verwenden den bestehenden Session-Config-Option-Endpunkt oder
`setSessionConfigOption(sessionId, 'workflow_mode', 'on', clientId)`. Die
Option akzeptiert keinen `persist`-Override: sie ist immer Session-persistent.
Kontext-Readback und Updates gehören dem Live-Owner dieser Session,
einschließlich deren Lease- und Generation-Prüfungen. Web/IDE-spezifische
Steuerungen sind in dieser Implementierung nicht enthalten.