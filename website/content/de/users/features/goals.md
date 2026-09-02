# Goals

Ein Goal hält Qwen Code über mehrere Turns hinweg am Arbeiten, bis eine festgelegte Bedingung erfüllt ist. Setze eines mit `/goal <objective>`; nach jedem Turn prüft ein unabhängiger Verifier das Transkript, und die Session läuft weiter, bis das Ziel als erledigt verifiziert, als blockiert verifiziert, pausiert oder gelöscht wird.

## Befehle

| Befehl                 | Verhalten                                                   |
| ---------------------- | ----------------------------------------------------------- |
| `/goal`                | Zeigt das aktuelle Goal und seinen Status an.               |
| `/goal <objective>`    | Erstellt ein Goal oder ersetzt das aktive.                  |
| `/goal set <objective>` | Wie oben, explizite Form.                                  |
| `/goal edit <objective>` | Überarbeitet die Formulierung des aktiven Goals, ohne neu anzufangen. |
| `/goal pause` / `resume` | Stoppt oder setzt die Schleife fort, ohne das Goal zu verlieren. |
| `/goal clear`          | Entfernt das Goal.                                          |
| `/goal-draft <intent>` | Lässt das Ziel für dich schreiben, bevor du es setzt (unten). |

Das Erstellen, Bearbeiten oder Fortsetzen eines Goals erfordert einen vertrauenswürdigen Workspace (`/trust`). Die Headless-Nutzung wird in [Headless-Modus](./headless.md#run-a-persistent-goal) behandelt.

## Wie ein Goal beurteilt wird

Der Verifier führt niemals selbst Befehle aus oder liest Dateien. Er sieht nur, was bereits im Transkript steht:

- Sichtbare Assistant-Ausgaben und Tool-Ergebnisse zählen als Belege. Der Zieltext, deine Prompts und die versteckten Reasoning-Ausgaben des Modells nicht.
- Gedruckter Text beweist nur, dass Text gedruckt wurde. Eine Behauptung, dass Tests bestanden, eine Datei geändert oder ein Remote aktualisiert wurde, benötigt das entsprechende Tool-Ergebnis im Transkript.
- Eine Behauptung, dass du etwas bestätigt, ausgewählt oder genehmigt hast, benötigt eine echte Nachricht von dir; der Verifier weist Vorschläge zurück, die das voraussetzen.
- Wenn Belege fehlen, lautet das Urteil "noch nicht", nicht "erledigt". Eine Bedingung, die niemand belegen kann, hält die Schleife am Laufen, bis ein Limit sie stoppt.

Das Ziel muss den Agenten also dazu bringen, Belege zu produzieren: den genannten Check ausführen und die entscheidende Ausgabe zeigen.

## Ein gutes Ziel formulieren

Setze diese Bestandteile in das Ziel, in dieser Reihenfolge:

| Teil         | Was zu schreiben ist                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Outcome:`   | Ein Satz: Was wahr ist, wenn dies erledigt ist.                                                                                         |
| `Done when:` | Nummerierte, binäre Checks. Mindestens einer nennt einen Befehl und seinen erwarteten Exit-Code oder seine erwartete Ausgabezeile und verlangt, dass diese Zeile eingefügt wird. |
| `Must not:`  | Dateien nicht anfassen, Tests oder Schwellenwerte nicht schwächen, irreversible Aktionen (Push, Delete, Publish) nicht durchführen.     |
| `Budget:`    | Wann aufzugeben ist: "stop as blocked after 20 turns" oder ein Zeitlimit.                                                               |
| `On block:`  | Was zu melden ist, wenn es feststeckt, und welche Entscheidung ein Mensch treffen muss.                                                 |
| `Context:`   | Nur Fakten, die der Agent nicht im Workspace finden kann: Branch, Umgebung, frühere Entscheidungen.                                     |

Halte es bei einem Ziel und ungefähr unter 1.200 Zeichen. `/goal set` und `/goal edit` kollabieren Zeilenumbrüche zu Leerzeichen, also nummeriere die Elemente, statt dich auf Zeilenumbrüche zu verlassen.

| Schwach                    | Warum es scheitert                                          | Stärker                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| make checkout faster       | Kein Schwellenwert, kein Check.                             | `Outcome: checkout p95 is below 250 ms. Done when: 1) npm run bench:checkout exits 0 and prints p95 < 250 (paste the line); 2) npm test exits 0. Must not: change the benchmark or skip tests. Budget: stop as blocked after 20 turns.` |
| clean up the auth module   | "Clean" hat keinen Beleg.                                   | Frage, was beobachtbar wäre: null Lint-Warnungen in `src/auth`, ein Coverage-Schwellenwert, ein Datei-Count.                                                                                                                             |
| ship the release           | Irreversibel und erfordert eine menschliche Entscheidung.   | Eingrenzen auf einen überprüfbaren Pre-Release-Zustand (Tag existiert, `npm run release:dry-run` endet mit 0) und "do not publish" in `Must not` setzen.                                                                                  |
| after I confirm the design | Der Verifier kann eine Bestätigung nicht sehen, die nie stattfand. | Verschiebe es nach `On block:` als die Entscheidung, die ein Mensch treffen muss.                                                                                                                                                        |

## `/goal-draft` schreibt es für dich

`/goal-draft <was erledigt werden soll>` ist ein gebündelter Skill, der das oben Beschriebene für dich erledigt. Er prüft, ob die Anfrage überhaupt ein Goal ist, liest den Workspace nach den echten Test- und Lint-Befehlen, statt zu raten, stellt höchstens eine Runde Multiple-Choice-Fragen, wenn die Antwort den Check oder den Umfang ändert, entwirft das Ziel im obigen Format, führt den Selbstcheck durch und übergibt es: in einer interaktiven Session schlägt er das Ziel über den unten beschriebenen `propose_goal`-Genehmigungsdialog vor, andernfalls gibt er eine `/goal set …`-Zeile aus, die du unverändert ausführen kannst. Er beginnt niemals die Arbeit selbst, und ohne deine Genehmigung wird nichts gesetzt.

Übergib ein bestehendes Ziel, um es zu straffen: `/goal-draft all tests pass and the lint is clean`.

### Approve a Goal the model proposes

In einer interaktiven Terminal-Session hat das Modell ein `propose_goal`-Tool. Wenn `/goal-draft` fertig ist oder wenn du ein Ergebnis anforderst, das sich über mehrere Turns erstreckt, kann es das Ziel vorschlagen, anstatt eine `/goal set …`-Zeile zum Kopieren auszugeben. Der Vorschlag erscheint als Genehmigungsdialog, der das vollständige Ziel anzeigt. Ihn zu genehmigen setzt das Goal genau wie `/goal set`, sobald der aktuelle Turn endet (das Modell bestätigt und stoppt; der erste Goal-Turn startet dann automatisch), und ihn abzulehnen setzt nichts – dem Modell wird nur mitgeteilt, dass das Goal nicht gesetzt wurde, und es darf es nicht erneut vorschlagen. Die Genehmigung ist an den Turn gebunden, der sie angefordert hat: Wird dieser Turn abgebrochen oder erreicht sonst nicht sein Ende, wird die Genehmigung verworfen, statt unter einer späteren Nachricht oder einem automatisierten Turn angewendet zu werden. Keine Berechtigungsregel oder Genehmigungsmodus (einschließlich YOLO) überspringt diesen Dialog, und das Tool verweigert die Ausführung, während ein anderes Goal aktiv ist, im Plan-Modus, in Subagenten und in nicht vertrauenswürdigen Ordnern. Es ist nicht in Headless-Runs verfügbar und auch noch nicht in Web Shell oder anderen ACP-gesteuerten Sessions (diese durchlaufen nicht die Turn-Grenze, die die Genehmigung anwendet); dort bleibt die ausgegebene `/goal set`-Zeile die Übergabe.

Schalte es aus mit `goals.modelProposed: "disabled"` in deinen Benutzer-Einstellungen. Da die Einstellung entscheidet, ob das Modell dich fragen darf, eine autonome Schleife zu starten, wird sie nur aus Benutzer- und System-Scope berücksichtigt; ein Wert in einer Workspace-`.qwen/settings.json` wird mit einer Warnung ignoriert.

Der Skill ist angewiesen, schreibgeschützt zu arbeiten, und nur seine nicht-mutierenden Tools werden automatisch genehmigt (`get_goal`, `read_file`, `glob`, `grep_search`). `ask_user_question` ist absichtlich nicht automatisch genehmigt, sodass sein Fragedialog angezeigt wird, bevor der Skill aus deinen Antworten entwirft. Wie bei anderen gebündelten Skills überschreibt ein Projekt- oder persönlicher Skill namens `goal-draft` ihn, und `skills.disabled` kann ihn ausschalten. Siehe [Skills](./skills.md), wie gebündelte Skills entdeckt werden.
