# Conversation-Branch-Inspektion

## Motivation

Session-JSONL-Dateien bilden über `uuid` und `parentUuid` bereits einen Baum, aber Resume rekonstruiert aktuell nur ein physisch gewähltes Ende. Ein Neustart kann daher gültige Geschwister-Historien verbergen, wenn mehrere Writer an dieselbe Session angehängt haben oder wenn ein Rewind einen zweiten Branch erzeugt hat.

Diese Änderung fügt einen Read-only-Topologie-Inspektor hinzu. Er identifiziert jedes semantische Leaf, beschreibt dessen Beziehung zu expliziten Rewind-Records und erzeugt eine kleine deterministische Zusammenfassung. Er entscheidet nicht, welcher Branch aktiv ist.

## Grenze

Der Inspektor akzeptiert In-Memory-`ChatRecord`-Werte und hat keine Dateisystem-, Session-Service-, Modell- oder Writer-Abhängigkeit. Bestehendes Resume-, Fork-, Transkript-Paginations-, Daemon-, ACP- und CLI-Verhalten bleibt unverändert.

Die Rekonstruktion des gewählten Branches nutzt weiterhin `buildOrderedUuidChain` mit einem expliziten `leafUuid`. Eine spätere Write-Seiten-Änderung muss einen exklusiven, stabilen Transkript-Snapshot beschaffen, den Nutzer oder eine dauerhafte Policy bitten, eines der gemeldeten Leafs auszuwählen, diese Auswahl persistieren und den resumed Writer damit seeden. Keine dieser Ownership-Operationen gehört in den Inspektor.

Claude Code hat einen All-Leaves-Transkript-Reader für Analysen, während sein normaler Resume-Pfad weiterhin das neueste Nicht-Sidechain-Leaf auswählt. Qwen kann diese Auswahlregel nicht sicher nutzen: Ein expliziter Rewind beweist eine strukturelle Beziehung, aber in einem Multi-Writer-Transkript beweist er nicht, dass jede Geschwister-Historie bewusst aufgegeben wurde.

## Semantische Leafs

Der erste physische Record einer UUID definiert ihren Parent, passend zum bestehenden Chain-Walker. Widersprüchliche doppelte Parents werden diagnostiziert statt geraten.

Rohe terminale Records werden mit einer bewusst kleinen Neutral-Tail-Allowlist normalisiert: `custom_title`, `session_artifact_event` und `session_artifact_snapshot`. Diese Records dürfen neben oder nach einem Konversations-Tail angehängt werden, ohne eine eigenständige wiederherstellbare Konversation zu erzeugen. Ein terminaler Lauf davon wird zu seinem nächsten bekannten nicht-neutralen Vorfahren zusammengefasst. Wenn kein solcher Vorfahre existiert, wird der reine Metadaten-Lauf ausgelassen, weil er kein rekonstruierbarer Konversations-Branch ist.
Zusammengefasste Kandidaten werden dedupliziert, dann wird jeder Kandidat entfernt, der ein strikter Vorfahre eines anderen Kandidaten ist. Das Ergebnis ist eine Antikette semantischer Leafs.

Alle anderen System-Records bleiben signifikant. Insbesondere Rewind-, Compression-, Attributions- und Dateihistorie-Records können Wiederherstellungszustand tragen und dürfen nicht verworfen werden, nur weil sie keinen nutzervisible Text haben.

Fehlende Parents stoppen eine Kette an der erreichbaren Tail-Insel. Parent-Zyklen werden gemeldet und begrenzt. Die Lese-Seite verbindet fehlende Historie nie neu und markiert keinen Branch als aktiv oder aufgegeben.

## Zusammenfassungen und Rewind-Beziehungen

Zusammenfassungen sind lokal und deterministisch. Sie enthalten den nächsten Branch-Punkt, Nachrichtenzahlen, Zeitstempel, den ersten echten Nutzertext nach dem Branch-Punkt und den letzten echten Nutzer- und Nicht-Thought-Assistant-Text. Notification-, Cron- und Mid-Turn-Nutzer-Records werden nicht als User-Prompts behandelt. Text wird Whitespace-normalisiert und gekürzt; Tool-Argumente und Nicht-Text-Teile werden ignoriert. `updatedAt` nutzt den Zeitstempel des letzten physischen Terminals, das in das semantische Leaf normalisiert wurde, damit neutrale Metadaten-Aktivität nicht verloren geht.

Ein Branch ist ein Rewind-Nachkomme, wenn sein Pfad einen Rewind-Record enthält. Er ist ein Rewind-Geschwister, wenn sein Pfad vom Pfad zu einem Rewind-Record abweicht. Das sind nur strukturelle Labels und implizieren nie, dass das Geschwister veraltet ist.
