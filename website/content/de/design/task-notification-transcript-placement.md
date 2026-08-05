# Transkript-Platzierung von Task-Benachrichtigungen

Abschlüsse von Hintergrund-Tasks sind Modelleingaben, keine vom Nutzer
verfassten Prompts. Der Live-Daemon-Pfad kennzeichnet sie bereits mit
`_meta.source = "background_notification"`, aber der History-Replay hat
persistierte Benachrichtigungs-Records bisher als unmarkierte
Nutzernachrichten projiziert.

Der History-Replay behält die persistierte Rolle als Modelleingabe und
ergänzt denselben Source-Marker, den Live-Benachrichtigungen verwenden.
Der WebShell-Transkript-Adapter bildet diese Source, aus einem User- oder
Assistant-Chunk, auf eine informative Systemnachricht ab. Neue Records
persistieren zusätzlich den bestehenden strukturierten Task-Status, damit
Live- und Replay-Nachrichten dasselbe Label completed, failed oder
cancelled verwenden; ältere Records fallen auf ein generisches
Benachrichtigungs-Label zurück. Der Benachrichtigungsinhalt wird
unverändert neben einem semantischen Status-Icon gerendert. So bleiben
sowohl Live- als auch Replay-Benachrichtigungen links sichtbar, ohne die
geteilte Replay-Semantik für andere Konsumenten zu ändern.
