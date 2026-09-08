# Writer-Locks und Recovery für Conversations

Aktualisierte Daemons können Conversations gemeinsam nutzen und verschiedene
Sessions gleichzeitig verwenden. Eine geladene Session hat weiterhin genau
einen Writer. Die Live-Aktivierung gehört ausschließlich dem exakten Publisher
des stabilen Live-Locators; der Verlust der Live-Publikation deaktiviert
keine Standalone-Conversations.

## Eine Conversation lässt sich nicht öffnen

`session_writer_conflict` bedeutet, dass die Writer-Fence den Zugriff
verhindert hat. Das kann bedeuten, dass ein anderer Prozess die Conversation
geöffnet hat oder dass ein verbleibender Lock nicht sicher zurückgefordert
werden kann. Es ist kein Beweis dafür, dass ein anderer Writer derzeit aktiv
ist. `session_writer_unavailable` bedeutet, dass die Ownership nicht
verifiziert werden konnte; erneutes Versuchen berechtigt nicht dazu, dies zu
umgehen. Archivieren und Löschen können für eine einzelne Session HTTP 200
mit einem Writer-Fehler zurückgeben. Prüfen Sie jedes Ergebnis-Element.

Schließen Sie die Conversation normal im besitzenden Qwen-Prozess und
verwenden Sie dann **Try again** in der betroffenen Conversation. Sie können
andere Sessions weiterhin verwenden. Erstellen Sie keine Ersatz-Conversation
nur dazu, den Fehler verschwinden zu lassen.

Nach einem unsauberen Shutdown kann ein Linux-Reboot oder ein
Container-Neustart in einen neuen PID-Namespace dazu führen, dass ein nicht
versiegelter aktiver Writer-Datensatz auf unbestimmte Zeit gefenced bleibt.
Möglicherweise gibt es keinen überlebenden Owner zum Schließen. Folgen Sie
stattdessen
[Operator-Recovery für einen verbleibenden Lock](#operator-recovery-for-a-residual-lock),
anstatt wiederholt zu retryen; dieses Release übernimmt nicht automatisch
über diese Identitätsgrenzen hinweg.

Wenn das Problem weiterhin besteht, aktivieren Sie lokales Debug-Logging
(`QWEN_DEBUG_LOG_FILE=1`) beim Starten des betroffenen Daemons und prüfen
Sie die Diagnostik des Daemons und des ACP-Kindprozesses. Diagnostiken zur
Lease-Akquisition enthalten die Session-ID, die Fehlerart und den genauen
`lockPath`, der aus dem Runtime-Speicher dieses Writers aufgelöst wurde.
Raten Sie nicht einen Lock-Pfad aus dem primären Workspace oder einem
Standard-Home-Verzeichnis. Öffentliche HTTP/ACP-Fehler lassen absichtlich
Pfade und Ownership-Datensätze weg. Halten Sie Diagnose-Dateien privat;
veröffentlichen Sie keine Owner-Tokens oder nicht geschwärzte Lock-Inhalte.

## Welche Zustände können automatisch wiederhergestellt werden?

Diese Regeln gelten für Session-Writer-Leases. Legacy globale
Owner-Datensätze verwenden die weiter unten beschriebene eingeschränkte
Kompatibilitätsprüfung.

- Normales Schließen gibt die Lease frei. Eine zertifizierte versiegelte
  Übergabe wird nur akzeptiert, wenn ihr Transkript-Beweis noch gültig ist.
- Ein toter aktiver Writer kann nur zurückgefordert werden, wenn die
  vorhandenen Identitätsprüfungen feststellen, dass sein Prozess zur selben
  verifizierten Liveness-Domain gehört.
- Live- oder steckengebliebene Writer bleiben gefenced. Das Töten eines
  Daemons reicht nicht aus, wenn sein ACP-Writer-Kindprozess überlebt.
- Fremde oder fehlende Boot-/Prozess-Namespace-Identität ist kein Beweis
  für den Tod. Eine fehlende PID in Ihrem Namespace beweist nicht, dass ein
  fremder Writer beendet wurde.
- Fehlerhafte Datensätze, unsichere Transkript-Identität und verbleibende
  Transition-Claims fail-closed. Verstrichene Zeit allein autorisiert
  niemals eine Übernahme.

## Operator-Recovery für einen verbleibenden Lock

1. Identifizieren Sie die exakt betroffene Session und den Speicher aus der
   lokalen Diagnostik. Bewahren Sie das Fehlerprotokoll und ein privates
   Backup seiner Transkript- und Lock-Artefakte auf. Notieren Sie, welche
   Binaries und Hosts auf diesen Speicher zugreifen können.
2. Stoppen oder fencen Sie **jeden möglichen Writer**, einschließlich
   abgekoppelter ACP-Kindprozesse, anderer Daemons, Container, Namespaces
   und Maschinen, die das Dateisystem gemeinsam nutzen. Verifizieren Sie die
   Fence vom relevanten Host/Namespace aus. Wenn Sie dies nicht herstellen
   können, stoppen Sie hier und fragen Sie einen Operator, der dies kann.
3. Prüfen Sie den exakten Datensatz und alle zugehörigen Claim-/Retired-
   Artefakte mit einem Maintainer. Stellen Sie fest, ob das letzte Transkript
   und der Übergabebeweis autoritativ sind. Bearbeiten Sie keine
   Ownership-Identitätsfelder, um eine Übereinstimmung zu fabrizieren.
4. Erst nachdem Writer gefenced und Beweise gesichert sind, verschieben Sie
   einzeln verifizierte verbleibende Artefakte unter Operator-Aufsicht in
   den privaten Recovery-Speicher. Löschen Sie niemals rekursiv ein
   Lock-Verzeichnis oder entfernen Sie alle Locks.
5. Starten Sie einen aktualisierten Daemon, stellen Sie die ursprüngliche
   Session wieder her und verifizieren Sie ihren letzten aufgezeichneten
   Turn vor dem Anhängen. Behalten Sie die Backups, bis die Kontinuität
   bestätigt ist. Bringen Sie andere aktualisierte Daemons erst nach dieser
   Prüfung zurück.

Es gibt keine Force-Unlock-API oder automatische Cross-Boot/TTL-Übernahme in
diesem Release. Wenn sichere Ownership nicht festgestellt werden kann,
behalten Sie die Fence bei.

## Koordiniertes Upgrade und Rollback

Das Backend-Cutover und die WebShell-Lokalfehler/Retry-Änderungen müssen im
selben Release ausgeliefert werden. Dies ist **kein Mixed-Version-Rolling-
Upgrade**: ältere Daemons können einen globalen Owner erzeugen, nachdem ein
aktualisierter Daemon bereits gestartet wurde.

Vor dem Upgrade drainen Sie alle alten Sessions und geplante Arbeit, stoppen
Sie alle alten Daemons und ihre ACP-Kindprozesse, bewahren Sie Runtime-Daten
auf und starten Sie erst dann die aktualisierten Binaries. Ein aktualisierter
Daemon, der auf einen Live-Legacy-Owner trifft, gibt
`503 conversation_runtime_in_use` zurück; nach dem Beenden dieses Owners
erneut versuchen, ohne neu zu starten. Nur ein exakt erneut validierter
veralteter Legacy-Datensatz wird retired. Fehlerhafte oder unsichere
Legacy-Zustände erfordern Operator-Untersuchung.

Der Legacy-Datensatz `conversations/runtime-owner.json` enthält eine PID und
eine Nonce, aber keine Hostname-, Boot-ID oder PID-Namespace-Identität. Seine
Kompatibilitätsprüfung kann nur testen, ob diese PID im eigenen Host und
PID-Namespace des aktualisierten Daemons existiert. Sie kann keinen alten
Writer erkennen, der andernorts auf einem gemeinsam genutzten Speicher aktiv
ist. Dies ist ein weiterer Grund, jeden möglichen Writer vor dem Start eines
aktualisierten Daemons zu fencen; die Prüfung macht Mixed-Host- oder
Mixed-Namespace-Upgrades nicht sicher.

Vor dem Rollback drainen und fencen Sie ebenfalls jeden aktualisierten Daemon
und Writer. Inventarisieren Sie aktive, versiegelte, Claim-, Retired- und
Extended-Schema-Datensätze. Bestätigen Sie, dass die Ziel-Binary jedes
beibehaltene Schema und jeden Übergabezustand versteht; füttern Sie niemals
ein nicht unterstütztes Schema an einen älteren Writer oder löschen Sie
seinen schützenden Datensatz, um den Rollback fortzusetzen. Wenn
Kompatibilität nicht hergestellt werden kann, halten Sie Writer gestoppt und
verwenden Sie Maintainer-geführte Recovery oder das kohärente Pre-Upgrade-
Backup. Stellen Sie niemals ein altes Transkript über spätere autoritative
Turns wieder her, ohne diese Turns explizit zu berücksichtigen.