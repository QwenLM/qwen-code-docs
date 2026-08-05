# Explizite Genehmigung beim Plan-Exit

## Problem

`exit_plan_mode` hat bisher Genehmigung und Ausführung vermischt. Sein
Bestätigungs-Callback hat `ApprovalMode` geändert, bevor Hooks und Ausführung
abgeschlossen waren, und AUTO/YOLO-Sessions konnten den User über ein LLM Plan
Approval Gate umgehen. Allow-Regeln des Permission-Managers, Permission-Hooks
und Auto-Genehmigung durch Geschwister konnten eine `ask`-Entscheidung
ebenfalls ohne tatsächliche Host-/User-Antwort erfüllen. Dadurch konnte ein
vom Modell stammender Tool-Aufruf versuchen, den Plan-Modus ohne
User-Entscheidung zu verlassen, und es entstanden irreführende
Modus-Benachrichtigungen, wenn die spätere Ausführung fehlschlug.

## Design

Tool-Aufrufe können `requiresUserInteraction()` deklarieren. Dies ist eine
intrinsische Interaktionsanforderung, keine weitere Permission-Stufe:
Intrinsische oder durch den Permission-Manager verweigerte Entscheidungen
gewinnen weiterhin, während Allow-Regeln und automatische Genehmigungsmodi sie
nicht erfüllen können. `exit_plan_mode` der Haupt-Session deklariert die
Anforderung. Plan-Pflicht-Teammates behalten ihren
Leader-Genehmigungspfad, und gewöhnliche Subagents behalten die bestehende
Ablehnung des Lifecycle-Tools.

Der Plan-Bestätigungs-Callback zeichnet nur eine von vier Entscheidungen auf:
Pre-Plan-Modus wiederherstellen, zu auto-edit wechseln, zu default wechseln
oder abbrechen. Er ändert niemals den Modus. Das Erstellen der Bestätigung
friert den Plan-Text, den Pre-Plan-Modus und die aktuelle
Genehmigungsmodus-Revision ein. `execute()` prüft, dass eine Genehmigung
existiert, das Signal aktiv ist, die Session noch im Plan-Modus ist und die
Revision noch übereinstimmt, bevor der Modusübergang synchron angewendet
wird. Dadurch verhalten sich veraltete, erneut gestartete und parallele Exits
fail-closed. Die Plan-Persistenz erfolgt nur als Best-Effort, nachdem der
Übergang erfolgreich war.

`Config` besitzt eine monotone Genehmigungsmodus-Revision, die nur erhöht
wird, wenn sich der Modus tatsächlich ändert. Overrides des
Genehmigungsmodus besitzen unabhängige Revisionen. Das bestehende optionale
`enteredByModel`-Setter-Argument bleibt vorübergehend als ignorierter
Kompatibilitätsparameter erhalten; der Modell-Ursprung hat keine Auswirkung
auf die Genehmigung.

Das LLM Plan Approval Gate und seine AskUserQuestion-Metadaten-Kopplung
werden entfernt. `prePlanMode` bleibt erhalten, da es eine für den User
sichtbare Exit-Option ist. `originalRequest` und `researchSummary` bleiben
für das Leader-Review von Plan-Pflicht-Teammates erhalten.
`resolutionSummary` bleibt nur als deprecatede TypeScript-Eingabeproperty für
Quellkompatibilität erhalten und wird vom Runtime-Schema nicht mehr
akzeptiert.

## Host-Verhalten

CLI- und IDE-Bestätigung, ACP-`requestPermission` und
`can_use_tool`-Allow-Antworten von stream-json zählen als explizite
Interaktion. PermissionRequest-Allow-Hooks, PM-Allow-Regeln,
YOLO/AUTO/AUTO_EDIT und Auto-Genehmigung durch Geschwister zählen nicht
dazu. Deny-Entscheidungen von Hooks bleiben maßgeblich. Nicht-interaktive
Caller ohne genehmigungsfähigen Host verhalten sich fail-closed.

ACP sendet kein Modus-Update, wenn eine Genehmigung aussteht oder wenn
Bestätigung, Hooks, Ausführung oder der Übergang fehlschlägt. Nach
erfolgreicher Plan-Lifecycle-Ausführung und einem tatsächlichen Moduswechsel
sendet es ein Update mit dem aus `Config` gelesenen Modus. Das Fehlschlagen
der Legacy-Benachrichtigung ist nicht blockierend, und der
Extension-Side-Channel wird weiterhin mit einem korrekten `legacyFrameSent`-Wert
versucht.

## Fehlerverhalten

- Aufrufe außerhalb des Plan-Modus schlagen an derjenigen Grenze, die den
  Moduswechsel beobachtet, sicher mit umsetzbaren Zustandshinweisen fehl.
  `execute()` gibt einen Hinweis-Fehler zurück, wenn die Session nicht im
  Plan-Modus ist und kein Genehmigungs-Snapshot existiert.
  `getConfirmationDetails()` wirft denselben Hinweis, wenn es außerhalb des
  Plan-Modus aufgerufen wird (z. B. über eine PM-`ask`-Regel oder einen
  Wechsel von Plan zu Nicht-Plan zwischen Permission-Auswertung und
  Bestätigungs-Konstruktion). Die Standard-Permission ist `allow` — dies ist
  ein Zustandsproblem, kein Sicherheitsproblem.
- Ungültige Bestätigungsergebnisse, Stornierungen, Abbrüche, veraltete
  Revisionen und Übergangsfehler lassen den Plan-Modus aktiv.
- Zwei Exits, die für dieselbe Revision genehmigt wurden, können nicht beide
  erfolgreich sein.
- Wenn ein ACP-Host `switch_mode` nicht präsentieren kann, bleibt der
  Plan-Modus aktiv und der Fehler verweist den User auf den Modus-Selektor
  des Hosts oder auf `/plan exit`.
- Das Speichern eines bereits genehmigten Plans ist Best-Effort und macht
  einen erfolgreichen Modusübergang nicht rückgängig.

## Kompatibilität und Scope

Diese Änderung erweitert bewusst nicht die allgemeine Shell-Ausführung im
Plan-Modus und fügt keine DataWorks-spezifischen Read-Tools hinzu. Das sind
separate Permission-/Tooling-Änderungen. Die öffentliche Aufrufmethode ist
optional mit dem Standardwert `false`, sodass bestehende Tools und externe
Implementierungen kompatibel bleiben.
