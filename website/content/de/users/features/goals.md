# Goals

Ein Goal hält Qwen Code über mehrere Turns hinweg am Arbeiten, bis eine genannte Bedingung erfüllt ist. Setze eines mit `/goal <objective>`, und die Session läuft von alleine weiter. Jeder Turn wird als Beleg aufgezeichnet; wenn das Modell vorschlägt, dass das Ziel erledigt oder blockiert ist, beurteilt ein unabhängiger Verifier diesen Vorschlag ausschließlich anhand der Belege. Die Session stoppt, wenn der Verifier akzeptiert, oder wenn das Goal pausiert, gelöscht oder durch ein Limit gestoppt wird.

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

Sobald ein Goal einen Turn abgerechnet hat, zeigen die Footer-Pille und jede Statuskarte, was es gegen das erlaubte Fenster verbraucht hat, als `1.2k/30.0m`. Die Zahl zählt die Modellaufrufe, die das Goal in seinen eigenen Turns macht; Subagenten und die eigenen Checks des Verifiers sind nicht enthalten. Das Fenster wird von [`model.goalTokenBudget`](../configuration/settings.md) gesetzt; das Fortsetzen eines Goals, das sein Fenster verbraucht hat, gewährt ein weiteres oben auf das bereits verbrauchte, sodass die Zahl `30.0m/60.0m` anzeigt, statt von vorne zu beginnen. Ein Goal ohne Budget zeigt nur, was es verbraucht hat. Ein Goal, das noch keinen Turn abgerechnet hat, zeigt überhaupt keine Zahlen.

Jeder Turn, den die Session selbstständig ausführt, berichtet, was das Goal bisher verbraucht hat, wie viele Turns dahinterliegen und — außer das Goal läuft unbegrenzt — das erlaubte Fenster. Jeder solcher Turn außer der letzten Wind-Down-Übergabe trägt auch ständige Anweisungen, den Workspace erneut zu prüfen, statt den Berichten früherer Turns zu vertrauen, auf den Endzustand hinzuarbeiten, den das Ziel verlangt, etwas anderes zu tun, wenn der vorherige Turn nichts geändert hat (ab dem zweiten Turn, sobald es einen vorherigen Turn zu beurteilen gibt), und jede Anforderung gegen zitierbare Belege zu prüfen, bevor vorgeschlagen wird, dass das Goal erledigt ist.

Ein langes Goal komprimiert periodisch die aufgezeichneten Belege mit einem Side-Model-Check in Checkpoint-Claims, damit spätere Turns und der Verifier sie noch zitieren können. Der Check wird durch [`model.goalCheckpointTimeoutSeconds`](../configuration/settings.md) begrenzt, standardmäßig 180 Sekunden. Wenn seine Claims das aggregierte Byte-Budget überschreiten oder ein Claim das Zeichenlimit pro Claim überschreitet, macht er einen korrektiven Modell-Call und beide Calls teilen sich diese Obergrenze. Ein Check, der nicht rechtzeitig fertig wird, wird als inconclusive aufgegeben; er zählt nur dann zum Checkpoint-Stall-Limit, wenn das Beleg-Fenster überlaufen ist, während ein nicht überlaufender Check die Streak beibehält und in einem späteren Turn erneut versucht wird. Die Calls werden gestreamt, sodass der Transport-Timeout pro Anfrage nur Connect und erste Antwort begrenzt, und die Obergrenze selbst stoppt bei der 15-Minuten-Lebensdauer-Kappe der Stream-Guards, weil jenseits davon der Guard und nicht die Einstellung den Check beendet. Dieses 15-Minuten-Limit der Einstellung ist fest, und das Anheben der eigenen Kappe des Stream-Guards hebt es nicht an.

## Ein Goal unterbrechen

Das Abbrechen eines Goal-Turns pausiert das Goal. Drücke Esc, während das Modell antwortet oder seine Tools noch laufen, und der Turn stoppt, das Goal wechselt zu `paused`, und die Karte und `/goal` sagen beide, warum es gestoppt wurde. Nichts läuft weiter, bis du `/goal resume` ausführst.

Eine Nachricht zu tippen, während ein Goal aktiv ist, pausiert es nicht. Deine Nachricht läuft als der nächste Goal-Turn, also nutze sie, um die Arbeit zu steuern; nutze `/goal pause` oder `/goal clear`, um es zu stoppen.

Jede Pause gibt ihren Grund an: dass du es unterbrochen hast, dass du `/goal pause` ausgeführt hast, dass das Session-Token-Limit die nächste Modellanfrage blockiert hat, dass der Turn fehlgeschlagen ist oder dass drei Turns hintereinander nichts aufgezeichnet haben, was der Verifier beurteilen könnte, und kein Vorschlag — Goal-Bookkeeping-Reads (`get_goal`, `update_goal`) zählen nicht als Fortschritt. Ein durch ein Limit gestopptes Goal behält stattdessen den Grund für dieses Limit.

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

Halte es bei einem Ziel. `/goal set` und `/goal edit` akzeptieren beliebige Länge, aber bleibe ungefähr unter 1.200 Zeichen: das Ziel wird bei jedem Goal-Turn erneut gesendet. Ein Ziel, das das Modell über `propose_goal` vorschlägt, ist auf 1.500 Zeichen begrenzt. Beide Befehle klappen Zeilenumbrüche zu Leerzeichen zusammen, also nummeriere die Elemente, statt dich auf Zeilenumbrüche zu verlassen.

`Budget` ist eine Anweisung an das Modell, wann es aufgeben und einen Blocker melden soll. Eine Turn-Anzahl oder ein Zeitlimit im Ziel zu schreiben konfiguriert keinen Runtime-Timer und ändert nicht das Token-Budget des Goals.

| Schwach                    | Warum es scheitert                                          | Stärker                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| make checkout faster       | Kein Schwellenwert, kein Check.                             | `Outcome: checkout p95 is below 250 ms. Done when: 1) npm run bench:checkout exits 0 and prints p95 < 250 (paste the line); 2) npm test exits 0. Must not: change the benchmark or skip tests. Budget: stop as blocked after 20 turns.` |
| clean up the auth module   | "Clean" hat keinen Beleg.                                   | Frage, was beobachtbar wäre: null Lint-Warnungen in `src/auth`, ein Coverage-Schwellenwert, ein Datei-Count.                                                                                                                             |
| ship the release           | Irreversibel und erfordert eine menschliche Entscheidung.   | Eingrenzen auf einen überprüfbaren Pre-Release-Zustand (Tag existiert, `npm run release:dry-run` endet mit 0) und "do not publish" in `Must not` setzen.                                                                                  |
| after I confirm the design | Der Verifier kann eine Bestätigung nicht sehen, die nie stattfand. | Verschiebe es nach `On block:` als die Entscheidung, die ein Mensch treffen muss.                                                                                                                                                        |

## `/goal-draft` schreibt es für dich

`/goal-draft <was erledigt werden soll>` ist ein gebündelter Skill, der das oben Beschriebene für dich erledigt. Er liest nur genug vom Workspace, um den Umfang und die echten Verifizierungsbefehle zu ermitteln, ohne Tests auszuführen, zu bauen, Abhängigkeiten zu installieren oder Services zu starten. Er stellt höchstens eine Runde Fragen, wenn wesentliche Entscheidungen unklar sind, und schreibt dann ein kompaktes Ziel, normalerweise mit 3–5 Completion-Checks (weniger, wenn genug). Explizite Anforderungen werden beibehalten; er fügt keine Checks hinzu, nur um eine Anzahl zu erreichen.

Für ein Audit bedeutet Completion, die vereinbarten Szenarien abzudecken und Belege zu melden, einschließlich Reproduktionsschritte für bestätigte Defekte. Keine Defekte zu finden ist ein gültiges Ergebnis. Der Draft sollte keine Mindestanzahl an Szenarien, Belegdateien, Explorationsrunden oder Defekten erfinden.

Wenn ein Erfolgskriterium, Befehl, Eingabepfad oder eine wesentliche Entscheidung nicht ermittelt werden kann, gibt der Skill einen Draft zurück, der mit "Needs clarification" und `<TODO: …>`-Elementen markiert ist. Er bietet diesen Draft nicht zur Genehmigung an und gibt keinen ausführbaren `/goal set`- oder `/goal edit`-Befehl aus. Unwesentliche Defaults sind mit `[ASSUMPTION]` markiert; sie ersetzen keine fehlenden Erfolgskriterien.

Sobald das Ziel fertig ist, kann eine interaktive Terminal-Session den unten beschriebenen `propose_goal`-Genehmigungsdialog anzeigen. Web Shell und andere ACP-Clients, Headless-Runs, Sessions mit deaktiviertem Tool und Sessions mit einem aktiven Goal erhalten stattdessen einen Befehl zum manuellen Ausführen. Die Übergabe sagt, dass der Draft nicht angewendet wurde. Der Skill beginnt niemals die Arbeit selbst, und ohne deine Genehmigung wird nichts gesetzt.

Übergib ein bestehendes Ziel, um es zu straffen: `/goal-draft all tests pass and the lint is clean`. Für ein aktives Goal erzeugt eine explizite Anfrage zum Straffen `/goal edit`; eine Ersetzung verwendet `/goal set`. Wenn die beabsichtigte Operation unklar ist, beinhaltet der Skill diese Wahl in seiner einzigen Fragerunde.

### Ein vom Modell vorgeschlagenes Goal genehmigen

In einer interaktiven Terminal-Session hat das Modell ein `propose_goal`-Tool. Wenn `/goal-draft` fertig ist oder wenn du ein Ergebnis anforderst, das sich über mehrere Turns erstreckt, kann es das Ziel vorschlagen, anstatt eine `/goal set …`-Zeile zum Kopieren auszugeben. Der Vorschlag erscheint als Genehmigungsdialog, der das vollständige Ziel anzeigt. Ihn zu genehmigen setzt das Goal genau wie `/goal set`, sobald der aktuelle Turn endet (das Modell bestätigt und stoppt; der erste Goal-Turn startet dann automatisch), und ihn abzulehnen setzt nichts — das Modell sieht nur, dass der Tool-Aufruf nicht erlaubt wurde, und seine Anweisungen sagen ihm, nicht nach dem Grund zu fragen und nicht dasselbe Ziel erneut vorzuschlagen. Die Genehmigung ist an den Turn gebunden, der sie angefordert hat: Wird dieser Turn abgebrochen oder erreicht sonst nicht sein Ende, wird die Genehmigung verworfen, statt unter einer späteren Nachricht oder einem automatisierten Turn angewendet zu werden. Keine Berechtigungsregel oder Genehmigungsmodus (einschließlich YOLO) überspringt diesen Dialog, und das Tool verweigert die Ausführung, während ein anderes Goal aktiv ist, im Plan-Modus und in nicht vertrauenswürdigen Ordnern; Subagenten wird es niemals angeboten. Es ist nicht in Headless-Runs verfügbar und auch noch nicht in Web Shell oder anderen ACP-gesteuerten Sessions (diese durchlaufen nicht die Turn-Grenze, die die Genehmigung anwendet); dort bleibt die ausgegebene `/goal set`-Zeile die Übergabe.

Schalte es aus mit `goals.modelProposed: "disabled"` in deinen Benutzer-Einstellungen. Da die Einstellung entscheidet, ob das Modell dich fragen darf, eine autonome Schleife zu starten, wird sie nur aus Benutzer- und System-Scope berücksichtigt; ein Wert in einer Workspace-`.qwen/settings.json` wird mit einer Warnung ignoriert.

Der Skill ist angewiesen, schreibgeschützt zu arbeiten, und nur seine nicht-mutierenden Tools werden automatisch genehmigt (`get_goal`, `read_file`, `glob`, `grep_search`). `ask_user_question` ist absichtlich nicht automatisch genehmigt, sodass sein Fragedialog angezeigt wird, bevor der Skill aus deinen Antworten entwirft. Wie bei anderen gebündelten Skills überschreibt ein Projekt- oder persönlicher Skill namens `goal-draft` ihn, und `skills.disabled` kann ihn ausschalten. Siehe [Skills](./skills.md), wie gebündelte Skills entdeckt werden.
