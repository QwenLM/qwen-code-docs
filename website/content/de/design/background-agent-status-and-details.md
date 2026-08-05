# Hintergrund-Agent-Status und -Details

## Problem

Ein Agent-Tool-Aufruf kehrt zurück, sobald ein Hintergrund-Agent gestartet ist. Sein Transkript-Block hat daher ein terminales Tool-Event, dessen Payload `status: background` besagt. Die WebShell mappt dieses Start-Ergebnis bewusst auf eine Pending-Tool-Karte zurück, aber nichts gleicht die Karte später mit der Live-Hintergrund-Task-Registry ab. Die Task-Liste im Footer erreicht einen terminalen Zustand, während die ursprüngliche Agent-Karte running bleibt.

Vordergrund-Agenten öffnen sich bereits im geteilten Subagent-Detail-Panel. Hintergrund-Agenten haben dieselbe `toolUseId`, denselben Task-Registry-Eintrag, dasselbe JSONL-Transkript und denselben Virtual-Session-Resolver, aber dieser Pfad hat keine explizite Abdeckung.

## Design

Die Launch-Projektion bleibt unverändert: Ein Start-Ergebnis mit `status: background` bleibt pending, bis der maßgebliche Task-Zustand eintrifft. Der Daemon sendet bereits terminale Hintergrund-Agent-Benachrichtigungen über den Session-SSE-Stream mit dem Task-`status` und der `toolUseId`. Die WebShell konsumiert diese versteckten Benachrichtigungsmetadaten und gleicht sie zurück in die projizierte Agent-Tool-Karte.

- `completed` und `cancelled` schließen die Karte ab.
- `failed` lässt die Karte fehlschlagen.
- Der Benachrichtigungs-Zeitstempel wird zur Endzeit der Karte.
- Benachrichtigungen ohne `toolUseId`, Nicht-Agent-Benachrichtigungen und fremde Tool-Aufrufe ändern Nachrichten nicht direkt.

Der bestehende Subagent-Detail-Provider bleibt der einzige UI-Pfad. Hintergrund-Agent-Karten bleiben klickbar, während sie pending sind und nach terminalem Abgleich. Der Virtual-Session-Resolver streamt weiterhin das Task-JSONL und holt den Live-Status aus der Task-Registry, ohne nach Vordergrund-/Hintergrund-Modus zu filtern. Für Legacy-Tasks ohne `toolUseId` matcht er den Launch-Record gegen den persistierten Sidecar und behält einen terminalen Sidecar-Status, wenn das ursprüngliche Hintergrund-Start-Ergebnis weiterhin `running` besagt.

Während abgetrennte Arbeit aktiv ist, nutzt ihre Hauptlisten-Karte ein dediziertes statisches `background task`-Label statt des Vordergrund-`running`-Labels. Die Karte nutzt weder den Running-Shimmer noch einen tickenden Elapsed-Timer. Terminale Benachrichtigungen ersetzen dieses Label durch die normale Completed-, Failed- oder Cancelled-Präsentation.

Hintergrund-Agenten werden aus der unteren Statusleiste ausgelassen, weil ihr Fortschritt über die klickbare Karte und das Detail-Panel verfügbar ist. Sie bleiben im vollen Tasks-Panel. Andere Hintergrund-Task-Arten, einschließlich Shell-Befehle, bleiben in der unteren Statusleiste und behalten ihr bestehendes Polling. Ein Hintergrund-Agent allein aktiviert kein Task-Polling der unteren Leiste.

Persistierte Benachrichtigungs-Datensätze behalten nicht immer eine `toolUseId`. Wenn ein geladenes Transkript eine aktive Hintergrund-Agent-Karte enthält, löst die WebShell daher jede Pending-Karte nach dem Transkript-Catch-up über den bestehenden Subagent-Endpoint auf. Sie wiederholt diesen One-Shot-Check nach einem Reconnect und wenn eine terminale Agent-Benachrichtigung eintrifft, selbst wenn diese Benachrichtigung die Karte nicht direkt identifizieren kann. Sie startet nie ein Intervall. Eingabefokus und normales Streaming ändern weder die Pending-Agent-Call-IDs noch den Terminal-Benachrichtigungs-Key und lösen daher keinen weiteren Request aus.

Das angedockte Detail-Panel expandiert vom rechten Rand, sodass der Chat kontinuierlich nach links geschoben wird, statt vor einer separaten Panel-Bewegung resized zu werden. Reduced-Motion-Einstellungen deaktivieren die Dock-Animation. Panel-Tabs behalten eine feste Breite, kürzen lange Titel und scrollen horizontal, wenn die Tab-Liste den verfügbaren Platz übersteigt.

## Scope

Diese Änderung aktualisiert die WebShell-Projektion und den Virtual-Subagent-Status-Resolver des Daemons. Sie schreibt keine persistierten Eltern-Transkripte um, ändert nicht den Task-Lebenszyklus, fügt kein Task-Polling für Hintergrund-Agenten hinzu, entfernt keine Agenten aus dem vollen Tasks-Panel und fügt keinen zweiten Subagent-Viewer hinzu.
