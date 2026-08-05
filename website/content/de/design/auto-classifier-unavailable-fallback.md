# Auto-Classifier-unavailable-Fallback

## Problem

Der Auto-Modus wandelt aktuell jeden Infrastrukturfehler des Classifiers in eine Ausführungsverweigerung um. Ein Netzwerkfehler, Timeout, ungültiges strukturiertes Response, nicht verfügbares schnelles Modell oder Kontext-Overflow lässt daher den pending Tool-Aufruf fehlschlagen, bevor der Standard-Bestätigungsflow den Nutzer fragen kann, was zu tun ist.

Dieses Verhalten vermischt zwei unterschiedliche Ergebnisse:

- Ein Policy-Block des Classifiers ist ein Sicherheitsurteil und sollte die Aktion weiterhin verweigern.
- Ein Classifier-unavailable-Ergebnis bedeutet, dass kein Urteil erzeugt wurde, und sollte den Nutzer die Entscheidung manuell treffen lassen.

Der bestehende Consecutive-unavailable-Fallback öffnet eine Bestätigung erst nach zwei fehlgeschlagenen Classifier-Aufrufen. Die ersten Fehlschläge terminieren ihre Tool-Aufrufe weiterhin, und der Prompt erklärt das Infrastrukturproblem nicht und bietet keinen direkten Wiederherstellungspfad.

## Ziele

- Das erste Classifier-unavailable-Ergebnis in den Standard-Manual-Confirmation-Flow leiten.
- In der Bestätigung erklären, dass der Auto-Modus die Aktion nicht klassifizieren konnte.
- Eine explizite Option anbieten, die die aktuelle Aktion einmal genehmigt und die Session in den Default-Modus schaltet.
- CLI- und ACP-Permission-Verhalten aligned halten.
- Policy-Blocks, explizite Deny-Regeln, deterministische Destruktive-Befehl-Guards und Nutzerverhalten beim Abbrechen bewahren.

## Nicht-Ziele

- Den Default-Modus in User- oder Workspace-Settings persistieren.
- Automatisch ohne Nutzerauswahl den Modus wechseln.
- Die Allow/Block-Regeln des Policy-Classifiers ändern.
- Nicht-interaktive Sessions oder Hintergrund-Sessions dazu befähigen, einen Prompt anzuzeigen, wenn sie keine Genehmigungsfläche haben.

## Vorgeschlagenes Verhalten

Wenn der Classifier `unavailable: true` zurückgibt, zeichnet der Permission-Layer das Unavailable-Ereignis weiterhin auf, gibt aber statt eines Blocked-Ergebnisses ein Manual-Fallback-Ergebnis zurück. Der pending Aufruf läuft weiter über die bestehenden PermissionRequest- und Bestätigungspfade.

Die generierte Bestätigung trägt Auto-Modus-Fallback-Metadaten und unterdrückt persistente „always allow“-Auswahlen. Die Bestätigung zeigt, dass der Classifier nicht verfügbar ist, und empfiehlt den Default-Modus, wenn die Fehlschläge andauern. Ihre Optionen umfassen:

- Einmal erlauben.
- In den Default-Modus wechseln und einmal erlauben.
- Ablehnen.

Die Wechsel-Option ist bewusst mit einer expliziten einmaligen Genehmigung kombiniert. Eine reine Modus-Beschriftung würde die Behandlung der bereits pending Aktion mehrdeutig lassen.

| Classifier-Ergebnis | Aktuelles Verhalten         | Neues Verhalten              |
| ------------------- | --------------------------- | ---------------------------- |
| Allow               | Automatisch ausführen       | Unverändert                  |
| Policy block        | Mit Policy-Grund verweigern | Unverändert                  |
| Unavailable         | Den Tool-Aufruf verweigern  | Manuelle Genehmigung anfragen|

## Core-Permission-Flow

`applyAutoModeDecision` zeichnet Unavailable-Zähler auf und gibt einen Fallback-Grund speziell für Classifier-Unverfügbarkeit zurück. Weil das Ergebnis nicht mehr blocked ist, feuern PermissionDenied-Hooks nicht für Infrastrukturfehler; stattdessen läuft der normale PermissionRequest-Hook vor dem Prompt.

Unavailable-Zähler bleiben nützlich. Die Genehmigung eines Fallbacks setzt die Consecutive-Zähler zurück, während eine Ablehnung sie bewahrt. Wenn wiederholte Fehlschläge den bestehenden Schwellwert erreichen, können spätere classifier-fähige Aufrufe den bekanntermaßen kaputten Classifier umgehen und direkt zur manuellen Bestätigung gehen.

Bestätigungsdetails erhalten optionale Auto-Modus-Fallback-Metadaten, die über Edit-, Execute-, Info-, MCP- und andere Bestätigungsformen geteilt werden. Ein neues Genehmigungsergebnis repräsentiert „einmal fortfahren und zu Default wechseln“. Der CLI-Scheduler wechselt den Runtime-Session-Modus und normalisiert dieses Ergebnis zu einem gewöhnlichen `ProceedOnce`, bevor er toolspezifische Bestätigungs-Callbacks aufruft oder die Tool-Entscheidung aufzeichnet.

`Config.setApprovalMode` stellt bereits den benötigten Session-Übergang bereit: Es stellt Regeln wieder her, die beim Eintritt in den Auto-Modus temporär entfernt wurden, setzt Denial-Zähler zurück und erhöht die Approval-Mode-Revision. Keine Settings-Datei wird geändert.

## CLI-Präsentation

Die TUI-Bestätigungskomponente rendert den Fallback-Hinweis vor den Aktionsdetails und fügt die Wechsel-Option vor Ablehnen ein. Volle und kompakte Bestätigungs-Layouts bieten die Option beide an. Die Höhenberechnung muss Platz für die zusätzliche Warnung und Option reservieren, damit kleine Terminals weiterhin ausführbare Optionen zeigen.

## ACP-Präsentation

ACP-Permission-Requests enthalten den Fallback-Hinweis als Text-Content und bieten dieselbe Wechsel-und-einmal-erlauben-Option. Wenn sie gewählt wird, normalisiert die Session die Tool-Genehmigung zu `ProceedOnce`, schaltet den Runtime-Modus auf Default und veröffentlicht die bestehende Current-Mode-Update-Benachrichtigung.

ACP-Clients, die nur Erlauben oder Ablehnen wählen, nutzen weiterhin das bestehende Protokollverhalten.

## Fehlergrenzen

- Das Abbrechen des Classifier-Requests durch den Nutzer bleibt ein Abbruch und wird nicht zu einem Genehmigungsprompt.
- Explizite Permission-Denies und deterministische Destruktive-Befehl-Blocks bleiben Fehler.
- Nicht-interaktive Aufrufe ohne Permission-Transport und Hintergrund-Agents, die nicht prompten können, verweigern weiterhin über ihr bestehendes Manual-Confirmation-Fallback-Handling.
- Ein fehlgeschlagener Policy-Review in Classifier-Stage 2 gilt als unavailable und fragt daher den Nutzer; ein abgeschlossener Stage-2-Policy-Block bleibt verweigert.

## Betroffene Dateien

- `packages/core/src/permissions/autoMode.ts` und Tests: Unavailable-zu-Fallback-Mapping, Metadaten und Hook-Gating.
- `packages/core/src/tools/tools.ts`: Fallback-Bestätigungsmetadaten und Switch-Genehmigungsergebnis.
- `packages/core/src/core/coreToolScheduler.ts` und Tests: Bestätigungen dekorieren, Fallback-Auflösung verfolgen, Modus wechseln und Genehmigung normalisieren.
- `packages/core/src/telemetry/tool-call-decision.ts` und Tests: das neue Genehmigungsergebnis klassifizieren.
- `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` und Tests: Hinweis- und Options-Rendering.
- `packages/cli/src/acp-integration/session/permissionUtils.ts` und Tests: ACP-Content- und Options-Mapping.
- `packages/cli/src/acp-integration/session/Session.ts` und Tests: ACP-Fallback, Modus-Übergang und Benachrichtigung.
- `docs/users/features/auto-mode.md`: sofortigen manuellen Fallback und die Default-Modus-Wiederherstellungsoption dokumentieren.

## Offene Fragen

Keine. Der Wechsel ist session-only und genehmigt die pending Aktion explizit einmal.
