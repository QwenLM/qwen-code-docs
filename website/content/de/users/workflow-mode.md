# Session Workflow-Modus


Der Workflow-Modus speichert eine Präferenz, das Workflow-Tool für gewöhnliche
neue Submissions in der aktuellen Session zu berücksichtigen. Er ist standardmäßig
ausgeschaltet. Das Modell entscheidet weiterhin, ob ein Workflow sinnvoll ist, und
alle Berechtigungs-, Vertrauens-, Budget- und Tool-Einschränkungen gelten weiterhin.
Das Aktivieren des Modus startet keinen Run, ändert nicht den Reasoning-Aufwand und
ändert nicht die Standardeinstellungen.

Workflow-Tools sind opt-in. Aktiviere `tools.workflowsEnabled` in den Einstellungen
oder setze `QWEN_CODE_ENABLE_WORKFLOWS=1`, bevor du den Modus einschaltest:

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

Der Start mit `--workflow-mode on`, während die Tools nicht verfügbar sind, schlägt
bei der Initialisierung fehl. `QWEN_CODE_DISABLE_WORKFLOWS=1` hat Vorrang vor
deren Aktivierung.

Verwende in beiden Terminal-Renderern `/workflows mode` oder
`/workflows mode status`, um den Zustand abzulesen, und `/workflows mode on` oder
`/workflows mode off`, um ihn zu ändern. Diese Modus-Steuerungen können während
einer laufenden Antwort ausgeführt werden; sie betreffen nachfolgende geeignete
Submissions. Der Footer zeigt `Workflow mode: on` oder
`Workflow mode: on (unavailable)`, wenn die gespeicherte Präferenz derzeit nicht
angewendet werden kann. Die bestehende `/workflows`-Run-Liste und die
Pause-Steuerungen behalten ihr ursprüngliches Verhalten.

Der Zustand unterscheidet `requested` (die gespeicherte Präferenz), `available`
(die erforderlichen Tools sind derzeit nutzbar) und `effective` (beides ist wahr).
Das Einschalten erfordert, dass die Workflow-Tools verfügbar sind. Das Ausschalten
bleibt auch dann möglich, wenn sie nicht verfügbar sind. Der Verlust eines Tools
löscht eine gespeicherte On-Präferenz nicht; die Wiederherstellung des Tools macht
diese Präferenz wieder wirksam.

Der Modus wird von gewöhnlichen lokalen Sessions und normalen Daemon-Sessions
unterstützt, einschließlich sekundärer Workspace-Owner. Managed-, SSH-,
Derived/Subagent- und Session-Agent-Sessions sowie Sessions mit deaktivierter
Chat-Aufzeichnung unterstützen keine Modusänderungen. Nicht unterstützte
Protokoll-Sessions bewerben die Capability oder Option nicht. Ein fehlgeschlagener
Write lässt den veröffentlichten Modus unverändert.

## WebShell und VS Code

Der Composer in WebShell, Split-Panes und dem modernen VS-Code-Chat listet
**Workflow** im **+**-Menü für unterstützte Sessions auf. Das Häkchen zeigt die
gespeicherte Präferenz, nicht ob der Modus derzeit wirksam werden kann; auf
breiteren Bildschirmen fasst eine zweite Zeile zusammen, was der Modus tut oder
was sein aktueller Zustand ist. Während die Präferenz eingeschaltet ist, zeigt
die Toolbar einen **Workflow**-Chip; sein Tooltip enthält die Statusdetails, und
ein Klick darauf schaltet den Modus aus. Wenn die Präferenz eingeschaltet ist,
aber die Tools nicht verfügbar sind, bleibt der Eintrag angehakt, der Chip wird
in der Warnfarbe angezeigt, und beide können den Modus weiterhin ausschalten.

Bevor eine Session erstellt oder wiederhergestellt wird, zeigt das Steuerelement
einen Verfügbarkeits-Platzhalter an. Es erstellt keine Session und speichert keine
zukünftige Präferenz. Hosts, die keine Unterstützung bewerben, einschließlich
älterer Server, blenden den Eintrag aus. Hosts, die das **+**-Menü ausblenden,
zeigen weder den Eintrag noch den Chip.

Änderungen von einem anderen Client aktualisieren das Steuerelement derselben
Session automatisch. Während eines Writes oder einer Wiederverbindung bleibt der
letzte bestätigte Wert sichtbar, und der Eintrag sowie der Chip sind deaktiviert,
bis der Zustand bestätigt ist. Ein Timeout ist ein unbestätigtes Ergebnis, keine
erfolgreiche Änderung; der Client liest den aktuellen Zustand, anstatt den Write
automatisch zu wiederholen. Eine aktive Antwort deaktiviert den Eintrag oder den
Chip nicht: Die Änderung gilt für den nächsten frischen Turn und lässt den Aufwand
unverändert.

## Reminder und Eingabeverhalten

Die erste geeignete Submission erhält einen reinen Modell-Reminder. Ohne weitere
Änderungen folgen sparsame Reminders bei den Submissions 11 und 21, dann alle
zehn geeigneten Submissions. Das Ausschalten oder der Verlust der Capability
sendet eine Exit-Mitteilung bei der nächsten geeigneten Submission. Nur ein
tatsächlicher Modell-Dispatch verbraucht einen Reminder oder erhöht den Zähler;
Abbruch oder Ablehnung vor dem Dispatch nicht. Retries und Fallback-Versuche
teilen sich dasselbe Delivery-Token. Wenn ein Abbruch einen dispatchten
Modus-Reminder aus der Modell-Historie entfernt, kündigt die nächste geeignete
Submission den aktuellen Zustand erneut an.

Gewöhnliche CLI-, SDK- und ACP-Submissions können diesen expliziten Modus ohne
Human-Origin-Deklaration verwenden. Tool-Fortsetzungen, Retries, Hooks,
Slash-generierte Prompts, Shell-Modus, Side-Queries, automatische
Goal/Cron/Notification/Channel-Turns und Subagents fügen keinen neuen
Modus-Reminder hinzu und erhöhen nicht dessen Zähler. Prompt-Spekulation wird
pausiert, während der Modus oder eine nicht zugestellte Transition Kontext
benötigt.

Der [One-Turn-Keyword-Hint](./workflow-intent.md) bleibt separat. Seine
Human-Provenance-Anforderung und die Opt-out-Einstellung sind unverändert. Ein
gültiges Keyword und ein Modus-Reminder teilen sich ein Envelope; das Ausschalten
des persistenten Modus deaktiviert kein gültiges One-Turn-Keyword. Ein reiner
Modus-Reminder aktiviert nicht den transienten Keyword-Indikator oder die
Keyword-Telemetrie.

## Session-Lifecycle

Resume stellt den letzten gültigen Boolean-Datensatz auf dem ausgewählten
Transkript-Branch wieder her und kündigt einen gespeicherten On- oder Off-Zustand
einmal an. Ein expliziter CLI- oder SDK-Anfangswert überschreibt diesen
wiederhergestellten Wert einmal, nachdem die Session bereit ist. Widersprüchliche
Anfangswerte oder ein anfänglicher On-Wert, während Workflow-Tools nicht verfügbar
sind, schlagen bei der Initialisierung fehl. Eine neue oder gelöschte Session
startet ausgeschaltet. Ein Fork erbt seinen ausgewählten Checkpoint unabhängig;
Rewind bewahrt die aktuelle Präferenz und verankert sie im wiederhergestellten
Branch. Erfolgreiche Compaction kündigt den Zustand bei der nächsten geeigneten
frischen Submission erneut an. Nach einem fehlgeschlagenen Resume oder
Branch-Wechsel, der die Historie der vorherigen Session wieder aufbaut, kündigt
die nächste geeignete Submission ihren gespeicherten Zustand erneut an. Eine
Session ohne gespeicherte Präferenz bleibt still.

## TypeScript-SDK und ACP

```ts
const session = query({
  prompt: messages(),
  options: { workflowMode: true },
});
const state = await session.getWorkflowMode();
await session.setWorkflowMode(false);
```

`workflowMode` ist optional: Das Weglassen bewahrt einen wiederhergestellten Wert,
während `false` explizit Off speichert. Die Initialisierung verhandelt und stuft
den Anfangswert; `Query.initialized` ist der Control-Handshake. Get/Set-Operationen
warten auf die Session-Bereitschaft. Wiederholte Initialisierungsanfragen werden
abgelehnt, während die Session-Initialisierung läuft. Eine ältere CLI lehnt eine
explizite Modusanfrage vor dem ersten Prompt ab, anstatt sie stillschweigend zu
ignorieren. Custom Transports verwenden dasselbe Control-Protokoll.

ACP bewirbt eine Standard-`workflow_mode`-Config-Option mit den Werten `on` und
`off`. Sein `currentValue` spiegelt den angeforderten Zustand wider, während
`_meta['qwen.workflowMode']` `available`, `effective` und ein optionales `reason`
enthält. Committete Änderungen und Capability-Aktualisierungen veröffentlichen
die vollständigen Optionen über `config_option_update`.

Daemon-Clients verwenden den bestehenden Session-Config-Option-Endpunkt oder
`setSessionConfigOption(sessionId, 'workflow_mode', 'on', clientId)`. Die Option
akzeptiert keinen `persist`-Override: Sie ist immer Session-persistent.
Kontext-Readback und Updates gehören zum Live-Owner dieser Session, einschließlich
seiner Lease- und Generation-Prüfungen. WebShell und der moderne VS-Code-Host
verwenden dieselben Session-Steuerungen und -Updates.
