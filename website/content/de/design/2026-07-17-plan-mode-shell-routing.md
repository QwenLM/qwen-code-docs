---
title: 'Plan Mode Shell Routing and Exact One-Off Approval'
date: '2026-07-17'
status: 'implemented'
---

# Plan Mode Shell Routing and Exact One-Off Approval

## Problem

Der Plan-Modus behandelte historisch die Bestätigungsform als Proxy dafür, ob
ein Tool read-only ist. Das reicht für `run_shell_command` und `monitor` nicht
aus: Beide Tools können read-only, zustandsverändernde oder für den Parser
unbekannte Shell-Programme darstellen, während Permission-Regeln, Hooks,
ACP-Hosts, stream-json, TUI, Teammate- und Hintergrund-Bridges dieselbe
Genehmigung über verschiedene Pfade auflösen können.

Die Sicherheitsgrenze muss einen bekannten Schreibvorgang von einem
unbekannten Befehl unterscheiden, ohne dass `unknown` zu einem Weg wird, den
Plan-Modus zu umgehen. Eine Genehmigung muss außerdem an die exakte
Modell-Anfrage gebunden bleiben, die den Prompt erzeugt hat; ein späterer
Moduswechsel, eine Permission-Policy-Änderung, ein Host-Rewrite, eine
Editor-Modifikation oder eine konkurrierende Antwort darf sie nicht
wiederverwenden.

Dieses Design hängt vom Tri-State-Shell-Klassifizierer ab, der in #7053
gemergt wurde.

## Ziele

- Eine Routing-Policy für Modell-initiierte Shell- und Monitor-Aufrufe in Core
  und ACP anwenden.
- Nur als `read-only` klassifizierte Befehle ohne neuen Plan-spezifischen
  Prompt ausführen.
- Als `write` klassifizierte Befehle blockieren, bevor Confirmation-Hooks oder
  Hosts sie genehmigen können.
- `unknown` nur über eine exakte, einmalige Bestätigung erlauben, während der
  Plan-Modus aktiv bleibt.
- Ein explizites PermissionManager-Deny über jeder Plan-spezifischen Route
  erhalten.
- Warnungen und die tatsächlich erlaubten Auswahlmöglichkeiten durch TUI, ACP,
  stream-json, Dual-Output, Teammate-, Subagent- und Hintergrund-Bridges
  tragen.
- Das Nicht-Shell-Plan-Verhalten und die expliziten Plan-Exit-Semantiken
  unverändert lassen.

## Non-Goals

- Änderung des Plan-Gate-Lifecycles oder Injizierung einer neuen Erinnerung
  während eines bereits laufenden ACP-Turns.
- Regelung von User-eingegebenen `!command`-Shell-Eingaben.
- Hinzufügen eines Bestätigungstyps, einer Einstellung, eines Caches, eines
  Feature-Flags oder einer persistenten Einmal-Fähigkeit.
- Änderung der DataWorks-spezifischen Query-Tools.
- Dafür sorgen, dass Spekulation eine interaktive Genehmigungsfläche
  bereitstellt.

## Bedrohungsmodell

Das geschützte Asset ist das Dateisystem des Users, Prozesse,
netzwerksichtbarer Zustand, Repository-Zustand und die
Genehmigungsmodus-Grenze, während der Plan-Modus aktiv ist. Nicht
vertrauenswürdige Eingaben umfassen Modell-Tool-Argumente, Shell-Syntax, die
der Parser nicht als sicher beweisen kann, von Hooks zurückgegebenes
`updatedInput`, ACP-Options-Ids, stream-json-Host-Rewrites,
IDE-Edit-Callbacks, Teammate-/Hintergrund-Antworten und doppelte Antworten von
gleichzeitig angehängten Hosts.

Die relevanten Angriffe sind:

- Verwendung einer Allow-Regel oder einer YOLO-artigen Bridge, um den
  Plan-Modus zu umgehen;
- Verschleierung eines bekannten Schreibvorgangs mit einem Wrapper, sodass er
  einen schwächeren Pfad erreicht;
- Genehmigung eines Befehls und Ausführung einer modifizierten Anfrage oder
  validierten Invocation;
- Verlassen des Plan-Modus und erneutes Betreten, während ein alter Prompt
  sichtbar bleibt;
- Hinzufügen einer Deny-Regel nach Prompt-Anzeige, aber vor
  Genehmigungs-Verbrauch;
- Fälschung einer nicht angebotenen persistenten oder Modify-Option;
- Zweimalige Genehmigung über TUI, Remote-Input, IDE- oder
  Hintergrund-Bridges;
- Verwendung der persistenten Genehmigung eines Geschwister-Aufrufs, um den
  Plan-Shell-Aufruf automatisch zu genehmigen.

## Routing-Policy

Die PermissionManager-L3/L4-Evaluierung bleibt für Hard-Deny autoritativ. Nach
dieser Entscheidung und dem für Plan erforderlichen Teammate-Gate
klassifiziert das Plan-Shell-Routing den validierten Befehl.

| Klassifizierung | PM deny | PM allow             | PM ask/default       | Kein Genehmigung-Host                               |
| --------------- | ------- | -------------------- | -------------------- | --------------------------------------------------- |
| `read-only`     | deny    | ausführen            | exakter Einmal-Prompt | deny, wenn der normale PM-Prompt nicht gezeigt werden kann |
| `write`         | deny    | Plan-Block           | Plan-Block           | Plan-Block                                          |
| `unknown`       | deny    | exakter Einmal-Prompt | exakter Einmal-Prompt | Plan-sichere Verweigerung                           |

Die Monitor-Klassifizierung verwendet
`normalizeMonitorCommand(command).safetyCommand`; die Shell-Klassifizierung
verwendet den ursprünglichen Befehlsstring der validierten Invocation.
Spekulation wird nur ausgeführt, wenn das Tri-State-Ergebnis exakt `read-only`
ist; `write`, `unknown`, Parser-Fehler und leere Eingabe stoppen an der
Spekulationsgrenze.

## Exakte Invocations-Berechtigung

Die Klassifizierung erzeugt einen unveränderlichen Snapshot, der Folgendes
enthält:

- die ursprünglichen Tool-Anfrage-Argumente;
- die Parameter der validierten Invocation;
- die aktuelle Genehmigungsmodus-Revision;
- der PermissionManager-Prüfkontext, einschließlich des effektiven
  Shell-/Monitor-Arbeitsverzeichnisses;
- der rohe Shell- oder Monitor-Befehl, der für die Anzeige verwendet wird.

Core und ACP klonen die Plan-Shell-/Monitor-Invocation vor der
Klassifizierung, sodass der Host-sichtbare rohe Input keinen Alias auf die
ausführbaren Parameter behalten kann. Wenn das Modell `directory` weglässt,
wird dieser Klon zusätzlich an das aktuelle Session-Arbeitsverzeichnis
gebunden. Die ursprüngliche Anfrage bleibt unverändert, während die Ausführung
nach Verbrauch der Genehmigung keiner späteren Daemon-/ACP-Verzeichnisverlagerung
oder Mutation des Anfrageobjekts mehr folgt.

Der Scheduler validiert diesen Snapshot nach der Klassifizierung, vor der
Anzeige der Bestätigung und vor dem Verbrauch einer Bestätigung. Die
Validierung erfordert:

- eine live, nicht abgebrochene Anfrage;
- Plan-Modus mit derselben Revision, sodass Plan → anderer Modus → Plan den
  Prompt invalidiert;
- tiefe Gleichheit der Anfrage-Argumente und der validierten
  Invocations-Parameter;
- dasselbe effektive Arbeitsverzeichnis, wenn die Invocation auf das
  Ambient-Verzeichnis der Session angewiesen ist;
- eine erfolgreiche aktuelle PermissionManager-Evaluierung, die nicht `deny`
  zurückgibt.

Spätere `allow`-, `ask`- oder `default`-Änderungen leiten einen bereits
ausgewählten Prompt nicht um. Eine PermissionManager-Exception schlägt
fail-closed fehl. Sobald die finale Validierung erfolgreich ist, wird die
Berechtigung verbraucht; eine spätere Modus- oder Regeländerung widerruft die
bereits verbrauchte Invocation nicht.

Nur `ProceedOnce` und `Cancel` werden akzeptiert. `updatedInput` wird nur
akzeptiert, wenn es tief gleich mit der Snapshot-Anfrage ist. `newContent`
wird niemals akzeptiert. Eine erfolgreiche Genehmigung übergibt ein leeres
Payload an das Tool, sodass Antworten, Permission-Regeln oder
Host-only-Metadaten nicht zu einer persistenten Freigabe werden können.
Ungültige Ergebnisse werden zu `Cancel` mit der Stale-Approval-Meldung.

Die Core-Bestätigungs-Closure beansprucht die Antwort synchron vor ihrem
ersten `await`. Konkurrierende TUI-, Remote-Input-, Teammate-, IDE- oder
Hintergrund-Antworten können die Berechtigung daher nicht zweimal verbrauchen.
Plan-Shell-Edit-Bestätigungen gelangen niemals in den IDE-Auto-Diff-Pfad, und
persistente Geschwister-Genehmigungen überspringen Bestätigungen, die mit
`hideAlwaysAllow` markiert sind.

## Bestätigungspräsentation

Jeder Plan-Shell-Prompt verbirgt die persistente Genehmigung. Unbekannte
Bestätigungen fügen hinzu:

> Der Plan-Modus konnte nicht bestimmen, ob dieser Shell-Befehl read-only ist.
> Die Genehmigung gilt nur einmal für exakt diese Invocation; sie kann den
> Systemzustand ändern, und der Plan-Modus bleibt aktiv.

Bestätigungen für unbekannte Edits verbergen zusätzlich die Modify-Aktionen
und fügen den rohen Befehl als zweite Warnung hinzu, während der Diff erhalten
bleibt. Das TUI rendert Edit-Warnungen über dem Diff und reserviert ihre
umbrochene Höhe, damit die Optionen auf kleinen Terminals sichtbar bleiben.
ACP sendet Warnungen vor Diff- oder Plan-Inhalten. Stream-json und Dual-Output
nehmen Warnungen in ihr bestehendes `permission_suggestions`-Feld auf.

ACP- und verschachtelte Subagent-Bridges validieren die zurückgegebene
Options-Id gegen die exakt an den Host gesendeten Optionen. Der Plan-Exit
behält seine bestehenden vier speziellen Auswahlmöglichkeiten, da diese
Auswahlmöglichkeiten tatsächlich gesendet wurden. Fehlende, gefälschte,
verborgene oder fehlerhafte Optionen schlagen fail-closed fehl.

Teammate-Events tragen optionale callback-freie Bestätigungsdetails.
Stream-json verwendet sie für Warnungen, während der Core-Scheduler des
Teammates der finale Exakte-Invocation-Validator bleibt. Headless-YOLO bricht
eine Nicht-Plan-Bestätigung ab, die mit `hideAlwaysAllow` markiert ist, da
keine interaktive Warnungsfläche existiert. Die Hintergrund-Genehmigung
wandelt ein nicht angebotenes persistentes Ergebnis niemals in `ProceedOnce`
um; Nicht-Plan-persistente Ergebnisse werden abgebrochen, während die
Plan-Bestätigung nur ihre tatsächliche `ProceedAlways`-Auswahl behält.

## Fehlermeldungen

Bekannte Schreibvorgänge, nicht verfügbare Genehmigungsflächen für unbekannte
Befehle und stale Approvals verwenden die festen Meldungen aus dem
Implementierungsplan. Diese Meldungen stellen bewusst fest, dass der
Plan-Modus aktiv bleibt, und verbieten das erneute Versuchen bekannter
Schreibvorgänge über Wrapper oder Verschleierung.

## Abgelehnte Alternativen

- **Unbekannt als write behandeln.** Einfacher, blockiert aber notwendige
  Untersuchungen, wenn der Parser einen ansonsten legitimen Befehl nicht
  modellieren kann.
- **Unbekannt nach PM-allow als read-only behandeln.** Eine Allow-Regel ist
  kein Beweis für Read-only-Verhalten und würde die Plan-Grenze löschen.
- **Eine Allow-Regel nach Unbekannt-Genehmigung persistieren.** Das
  Klassifiziererergebnis und die exakte Anfrage sind flüchtig; Persistenz
  würde einen breiteren zukünftigen Befehl autorisieren.
- **IDE-Diff-Akzeptanz wiederverwenden.** IDE-Callbacks können Inhalte ändern
  und mit der Warnungsfläche konkurrieren, daher können sie eine exakte
  Shell-Berechtigung nicht sicher verbrauchen.
- **Nur rohe Anfrage-Argumente validieren.** Tool-Builder normalisieren und
  validieren Eingaben; sowohl die rohe als auch die ausführbare Form müssen
  gebunden bleiben.
- **Nur beim Erstellen des Prompts validieren.** Modus- und Permission-Zustand
  können sich ändern, während ein Prompt sichtbar ist.
- **Einen dedizierten Bestätigungstyp oder Feature-Flag hinzufügen.**
  Bestehende Bestätigungsformen und Warnungsfelder reichen aus und halten die
  Änderung kleiner.

## Verifikation

Die Unit-Abdeckung übt Policy-Klassifizierung, Snapshots, Abbruch,
Revisions- und Argumentänderungen, PermissionManager-deny/-Fehler,
Warnungsdekoration, Payload-Sanitisierung, Core-Routing, Ownership doppelter
Antworten, Geschwister-Auto-Approval, umbrochenes sed-Edit-Verhalten,
Monitor-Parität, Spekulation, ACP-Optionen und -Warnungen, SubagentTracker,
Teammate-stream-json, Hintergrund-Normalisierung, Dual-Output, TUI-Layout und
Prompt-Wortlaut.

Die manuelle Validierung verwendet einen wegwerfbaren Git-Workspace mit einer
Beispieldatei und deckt diese Fälle ab:

1. Im Plan-Modus verifizieren, dass `git status` läuft, `touch changed.txt`
   blockiert wird und ein unbekannter Befehl wie `python -c 'print(1)'` nur
   Einmal-Genehmigung und Abbruch anbietet, bevor er bei seiner nächsten
   Invocation erneut fragt.
2. Einen umbrochenen Edit in einer engen Kompakt-Bestätigung ausführen und
   verifizieren, dass roher Befehl, Warnung, Diff-Kontext, Frage und
   verfügbare Auswahlmöglichkeiten sichtbar bleiben, während Modify und
   persistente Genehmigung nicht verfügbar bleiben.
3. Die Plan-Modus-Revision oder das Arbeitsverzeichnis ändern, während eine
   Genehmigung aussteht, geänderte oder nicht angebotene
   Genehmigungs-Payloads zurückgeben und doppelte oder verspätete Antworten
   senden; verifizieren, dass jeder Pfad ohne Ausführung abbricht.
4. Read-only-, Write- und Unbekannt-Fälle über Monitor, ACP, stream-json,
   verschachtelte Teammates und Hintergrund-Ausführung wiederholen;
   verifizieren, dass jede Fläche dieselbe Klassifizierung und dasselbe
   Fail-closed-Verhalten verwendet.
