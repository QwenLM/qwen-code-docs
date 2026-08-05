# Fork-Tool-Execution-Allowlist

## Zusammenfassung

Fügt der bestehenden `subagent_type: "fork"`-Runtime des Agent-Tools einen
optionalen `fork_tools`-Parameter hinzu. Der Parameter schränkt ein, welche
Tools ein Fork ausführen kann, ohne die Tool-Deklarationen zu ändern, die an
das Modell gesendet werden.

Dies ist die erste Phase von #7625. Benannte Profil-Dateien,
Shell-Argument-Patterns, Overlay-Dateisysteme und `/btw`-Integration sind out
of scope. Ein Launch-Prompt-Hint teilt dem Fork mit, welche sichtbaren Tools
die Allowlist erlaubt.

## Ziele

- Die geerbte Fork-Ausführungsfläche bewahren, wenn `fork_tools` weggelassen
  wird, mit Ausnahme von Interaktions-Tools, die Forks niemals ausführen
  dürfen.
- Eine leere Liste als deny-all behandeln statt als das bestehende
  `tools: []`-Wildcard-Verhalten.
- Die aktuellen modell-sichtbaren Deklarationen des Fork unverändert lassen,
  damit das Hinzufügen einer Ausführungseinschränkung seinen
  Prompt-Cache-Präfix nicht verändert.
- Nicht erlaubte Aufrufe ablehnen, bevor Tool-Konstruktion, Tool-Hooks,
  Berechtigungsklassifikation, Scheduling oder Genehmigung stattfinden.
- Die Einschränkung bewahren, wenn ein Hintergrund-Fork aus seinem
  persistierten Sidecar wiederbelebt wird.

## Parameter und Matching

`fork_tools` ist nur zusammen mit einem expliziten `subagent_type: "fork"`
gültig und kann nicht mit einem benannten Teammate kombiniert werden. Jeder
Eintrag muss ein nicht-leerer String ohne umgebende Whitespaces sein.
Unbekannte exakte Namen bleiben in der Allowlist und matchen nichts; sie
werden nicht herausgefiltert, denn eine ungültige nicht-leere Liste in eine
weggelassene Einschränkung zu verwandeln, würde fail-open bedeuten.

Eingebaute Tools verwenden exakte kanonische Funktionsnamen aus den
modell-sichtbaren Deklarationen. MCP-Einträge unterstützen exakte kanonische
Namen sowie Server- und angehängte Wildcard-Patterns. Patterns werden gegen
die rohe MCP-Server/Tool-Identität des registrierten Tools gematcht und nicht
nur gegen seinen vom Provider bereinigten Namen, damit sich unterschiedliche
Server-Namen, die auf denselben Präfix bereinigt werden, nicht gegenseitig
matchen können. Ein nacktes `*` wird abgelehnt; Weglassen erlaubt bereits
jedes anderweitig ausführbare geerbte Tool. Wildcard-Einträge sind auf
`mcp__*` oder ein angehängtes MCP-Tool-Präfix-Pattern wie
`mcp__github__read_*` beschränkt. `mcp__*` matcht absichtlich alle MCP-Tools,
ohne eingebaute Tools zu matchen.

Shell-Argument-Patterns sind nicht Teil dieser Phase. Das Aufführen von
`run_shell_command` erlaubt dem Tool-Aufruf, durch die normale
Berechtigungs-Pipeline zu laufen, genehmigt seinen Befehl aber nicht im
Voraus.

## Runtime-Trennung

`ToolConfig.tools` bleibt die Quelle für `AgentCore.prepareTools()` und die
Funktionsdeklarationen in jeder Modell-Anfrage. Ein separates
`executionAllowedTools`-Feld wird beim Erzeugen von `AgentCore` als Snapshot
erfasst. Exakte Einträge und MCP-Wildcard-Einträge werden separat
vorberechnet, damit ein Tool-Miss keine unverwandten eingebauten Namen
allokiert oder neu scannt.

`processFunctionCalls()` verifiziert zuerst, dass ein angefragter Name in der
Deklarationsmenge vorhanden ist. Danach wendet es die optionale
Execution-Allowlist an. Ein nicht erlaubter Aufruf erzeugt eine synthetische
Error-Response mit der ursprünglichen Call-ID und dem Namen, während andere
Aufrufe im selben Batch weiter zum Scheduler laufen. Da dieser Check vor der
Scheduler-Konstruktion stattfindet, kann der abgelehnte Aufruf weder eine
Genehmigungsanfrage öffnen noch einen Pre-Tool-Hook ausführen.

Die Allowlist schränkt nur die bestehende Fläche ein. Sie kann keine Tools
reaktivieren, die durch Subagent-Ausschlüsse entfernt wurden, keine normalen
Berechtigungen für ein erlaubtes Tool umgehen und keine Deklarationen
hinzufügen.

Jeder Fork erhält eine In-Memory-Execution-Allowlist, auch wenn `fork_tools`
weggelassen wird. Der Runtime-eigene Floor entfernt `ask_user_question`,
nachdem die vom Aufrufer gelieferte Liste angewendet wurde, sodass ein
Aufrufer es nicht reaktivieren kann. Das Tool bleibt in der vom Parent
abgeleiteten Deklarationsliste für Prompt-Cache-Sharing, aber ein Aufruf wird
vor Scheduling oder Genehmigung abgelehnt. Ein blockierter Fork meldet die
fehlende Eingabe an seinen Parent, statt zu versuchen, direkt mit dem Nutzer
zu interagieren.

Der Fork erhält einen Einschränkungshinweis im Task-Prompt nach dem geerbten
cachebaren Präfix. Dies vermeidet Trial-and-Error-Aufrufe, ohne die vom
Parent abgeleitete System-Instruktion, den Verlaufs-Präfix oder die
Tool-Deklarationen zu ändern.

## Wiederbelebung im Hintergrund

Hintergrund-Forks persistieren die geerbte Historie im
`agent_bootstrap`-Transkript-Record und den Launch-Task-Prompt in einem
separaten Record. System-Instruktion und Tool-Deklarationen sind Capabilities,
daher bindet Cold Revival sie aus der aktuellen Parent-Runtime neu und löst
die aktuellen Tool-Namen über die Live-Registry auf.

Das vom Aufrufer gelieferte `executionAllowedTools` ist dagegen
Launch-Zeit-Policy. Eingeschränkte Forks speichern es im `AgentMeta`-Sidecar,
einschließlich einer leeren deny-all-Liste, und Cold Revival wendet es erneut
auf das Live-`ToolConfig` an. Forks, die ohne `fork_tools` gestartet wurden,
persistieren die abgeleitete Liste nicht, sodass die Wiederbelebung sie aus
der aktuellen Parent-Tool-Fläche neu berechnen kann. Die resultierende
ausführbare Fläche ist die aktuelle vom Parent abgeleitete Tool-Fläche,
eingeschränkt durch die persistierte Policy und den obligatorischen
Ausschluss von Interaktions-Tools.

Das Feld bleibt aus Kompatibilitätsgründen optional. Ältere Transkripte und
Forks, die ohne `fork_tools` gestartet wurden, werden mit der aktuellen vom
Parent abgeleiteten Tool-Fläche minus dem obligatorischen Ausschluss von
Interaktions-Tools wiederhergestellt.

## Abgrenzung

`fork_tools` wird bei jedem Agent-Tool-Aufruf vom Parent-Modell oder Aufrufer
geliefert. Es ist daher eine Einschränkung der Child-Capabilities und keine
vom Nutzer oder Administrator erzwungene Sicherheits-Sandbox. Eine zukünftige
Profil-Ebene kann einen kurzen, projekt-kontrollierten Policy-Namen auf diesem
Ausführungsmechanismus bereitstellen.

Die Einschränkung kann nicht durch ein anderes Child umgangen werden: Die
Fork-Ausführung läuft innerhalb des Fork-Runtime-Kontexts, dessen
maßgeblicher Agent-Tool-Guard das Spawnen aller Sub-Agents ablehnt.
Allgemeiner kann `fork_tools` kein ausgeschlossenes oder nicht deklariertes
Tool ausführbar machen.
