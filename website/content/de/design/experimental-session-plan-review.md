# Experimental Session Plan & Review

## Ziel

Macht die Workflow-Visualisierung gewöhnlicher Sessions zu einem Opt-in und
lässt Benutzer den exakten Todo-Abhängigkeitsgraphen vor der Ausführung
prüfen. Verwendet den Plan-Modus, Todo-Snapshots und den bestehenden
Berechtigungslebenszyklus wieder.

## Rollout

`experimental.sessionWorkflow` ist standardmäßig deaktiviert. Wenn
deaktiviert, behält die WebShell das bestehende Todo-Listen- und
Plan-Modus-Verhalten bei, rendert aber weder den Workflow-DAG noch benennt
sie den Plan-Modus um. Die Einstellung ändert nur die Darstellung; sie
registriert keine Tools, verändert keine Todo-Semantik und erzeugt keinen
weiteren Genehmigungsmodus.

Wenn aktiviert, wird der bestehende `plan`-Modus als **Plan & Review**
präsentiert. Der Plan-Modus bleibt das Ausführungs-Gate: schreibgeschützte
Untersuchung ist erlaubt, mutierende Tools bleiben blockiert, das Ablehnen
von `exit_plan_mode` verbleibt im Plan-Modus und das Genehmigen verlässt den
Plan-Modus.

## Auslieferung

### Phase 1: Opt-in-Darstellung

- Die standardmäßig deaktivierte Einstellung über die bestehende
  Daemon-Workspace-Einstellungsroute verfügbar machen.
- Die effektive Einstellung aus dem aktiven Workspace der WebShell lesen und
  konsistent auf deren Hauptchat, Split-Panes und Side-Task-Panes anwenden.
- Das Rendern der Todo-Liste unverändert lassen, während die
  Workflow-DAG-Inputs gegatet werden.
- Den bestehenden Plan-Eintrag nur umbenennen, solange die Einstellung
  aktiviert ist.

### Phase 2: Revisionsgebundene Genehmigung

- In Plan & Review einen strukturierten Todo-Ausführungs-Snapshot verlangen,
  dessen Knoten vor der Genehmigung ausstehend bleiben.
- Die Todo-Plan-Identität und die Quell-Tool-Call-Identität mit der
  `exit_plan_mode`-Genehmigungsanfrage mitführen.
- Den Genehmigungs-DAG aus dieser Identität auflösen statt aus der neuesten
  aktiven Todo-Liste.
- Die bestehende Plan-ID-Lineage wiederverwenden, damit spätere Snapshots und
  Agent-Ausführungen weiterhin denselben Workflow aktualisieren, ohne einen
  weiteren Store.
- Auf die bestehende rein textbasierte Genehmigung zurückfallen, wenn kein
  passender Snapshot verfügbar ist.

## Grenzen

Der Workflow bleibt beobachtend. Er plant keine Abhängigkeiten, führt keine
Agent-Retries aus, propagiert keinen Abschluss und fügt keinen Workflow-Store
hinzu. `blockedBy` und `todo_id` bleiben für Sessions außerhalb von
Plan & Review optional.
