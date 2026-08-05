# Fork-Resume-Live-Capabilities

## Problem

Hintergrund-Transkripte von Legacy-Forks persistierten die gerenderte
System-Instruktion des Parents sowie Inline-Tool-Deklarationen. Diese
Deklarationen vom Startzeitpunkt zu replayen, während die Ausführung die
aktuelle `ToolRegistry` nutzt, kann dazu führen, dass ein entferntes oder
geändertes Tool weiterhin für das Modell sichtbar ist, obwohl es nicht
ausgeführt werden kann.

## Design

Behalte die Bootstrap- und Runtime-Nachrichten des Forks als seine dauerhafte
Identität bei. Baue beim Resume seine ausführbare Fläche aus der aktuellen
Parent-Session neu auf:

- verwende die gerenderte System-Instruktion des aktuellen Parents;
- übernimm die beworbenen Tool-Namen des aktuellen Parents und löse ihre
  Schemas über die aktuelle Registry des resumed Agents auf;
- füge auf dem Fortsetzungs-Turn aktuelle MCP-, Deferred-Tool- und
  Skill-Reminder ein und erkläre frühere Capability-Auflistungen für
  veraltet;
- lasse den Task pausiert, wenn der aktuelle Parent-Prompt oder die
  Tool-Fläche nicht rekonstruiert werden kann.

System-Instruktionen und Tool-Deklarationen vom Startzeitpunkt bleiben aus
Kompatibilitätsgründen in alten Transkripten lesbar, aber Resume behandelt
sie nicht länger als Autorität für die Ausführung. Neue Transkripte
persistieren die geerbte Historie und den Task-Prompt, keine
Capability-Snapshots; der aktuelle Runtime-Zustand ist maßgeblich.

Ausführungseinschränkungen zum Startzeitpunkt unterscheiden sich von
Capability-Snapshots. Wenn ein Fork `fork_tools` verwendet, wird seine
`executionAllowedTools`-Policy im `AgentMeta`-Sidecar gespeichert und erneut
angewendet, nachdem die Live-Tool-Fläche neu aufgebaut wurde. Eine leere
persistierte Liste bleibt deny-all; ein fehlendes Feld bleibt
uneingeschränkt.

## Konsequenzen

Entfernte Tools werden nach dem Resume nicht mehr beworben, und geänderte
Tools verwenden ihre aktuellen Schemas. Ein resumed Fork kann ein Tool, das
seinem Parent neu zur Verfügung steht, nur dann erhalten, wenn seine
persistierte Ausführungs-Policy dieses Tool ebenfalls erlaubt. Dies bevorzugt
Live-Konsistenz gegenüber einem byte-identischen Replay, ohne eine explizite
Einschränkung zum Startzeitpunkt aufzuweichen. Das Rebinding kann außerdem
den alten Prompt-Cache-Präfix invalidieren; das ist dem Senden veralteter
Capabilities vorzuziehen.
