# Managed-Session-Worktrees


In einer unterstützten lokalen Managed-Bereitstellung wählen Sie beim Erstellen einer Session ein Git-Projekt aus. Öffnen Sie den Git-Branch-Button neben dem Workspace unterhalb des Composers und wählen Sie **Worktree**. Der Picker schließt sich; das Senden Ihrer ersten Nachricht erstellt automatisch einen isolierten Checkout aus dem aktuellen HEAD auf einem eigenen Branch. Es gibt kein Branch- oder Verzeichnisformular zum Ausfüllen. Nicht committete Dateien, ignorierte Konfiguration und installierte Dependencies bleiben im Quellverzeichnis.

Wählen Sie vor dem Senden **Current branch** oder entfernen Sie den Worktree-Chip, um direkt am Quell-Branch zu arbeiten. Der Chip zeigt den tatsächlichen Quell-Branch an, wie z. B. **main**, wenn keine Isolierung ausgewählt ist.

Die Session meldet die Vorbereitung und wartet möglicherweise auf andere Tools, die denselben
Speicher verwenden. Dateireferenzen und Workspace-Uploads werden verfügbar, nachdem der
Worktree bereit ist. Projektanweisungen stammen aus dem Zielverzeichnis; Managed-
Modell, Genehmigung, Skills, MCP und Extensions-Einstellungen behalten ihre Session-Pins.

Im Home-Chat enthält die Mehr-Informationen-Karte der Session den Worktree-Status, Branch und Basis-Commit. Bereite Worktree-Details belegen nicht mehr den oberen Bereich des Gesprächs; Vorbereitungs- und Fehlermeldungen bleiben dort bei Bedarf sichtbar.

Das Schließen, Archivieren oder Löschen des Chats behält den Checkout und Branch bei. Öffnen
Sie **Session worktrees** aus dem Popover des neuen Task-Composers desselben Workspaces, um
behaltene Verzeichnisse zu inspizieren. Schließen Sie die Session und beenden Sie ihre
Hintergrundaufgaben vor der Bereinigung. Committen oder speichern Sie anderweitig verfolgte/unverfolgte/ignorierte Inhalte zuerst. Die Bereinigung entfernt nur einen sauberen
Checkout und behält alle Branches; sie führt keine Änderungen in die Quelle zusammen.

Bereitstellungen aktivieren `qwen.managed-agent.runtime-broker.session-worktrees-enabled`.
Es ist standardmäßig deaktiviert; `qwen serve --managed` aktiviert berechtigte lokale Hosts. Diese Version
unterstützt LOKALEN macOS/Linux-Speicher, Session-isolierte persistente lokale Prozess-
Worker und Git 2.40 oder später. Das Repository und sein Git-Common-Verzeichnis müssen
sich innerhalb des registrierten Speicher-Roots befinden. Wählen Sie für einen bestehenden verknüpften Checkout mit Git-
Metadaten an anderer Stelle den ursprünglichen Checkout aus oder bitten Sie den Administrator,
einen Root zu registrieren, der beide enthält. SSH und CSI werden in dieser Version nicht unterstützt.

Das Neustarten einer bereiten Session verwendet ihren ursprünglichen Checkout erneut. Fehlende oder ersetzte
Verzeichnisse blockieren die Ausführung. Wenn der Server während der Erstellung oder
Entfernung eines Worktrees durch Git getötet wird, hinterlässt ein nicht verifizierter ursprünglicher Git-Prozess die Operation
blockiert und seine Wartungssperre intakt. Erneutes Überprüfen erzwingt keine Wiederherstellung;
die automatische macOS-Wiederherstellung für diesen Fall liegt außerhalb dieser Version. Bewahren Sie das
Verzeichnis und den Branch auf, bis die ursprüngliche Ausführung abgeglichen werden kann.

Die öffentliche Session-Erstellungsanfrage fügt `worktree: {"base_ref":"main"}` hinzu;
`worktree: {}` wählt HEAD aus und das Weglassen verwendet das aktuelle Verzeichnis. Senden Sie einen
expliziten autorisierten `workspace` und behalten Sie denselben Idempotency-Key beim erneuten Versuch bei.
Fragen Sie den `worktree.state` der zurückgegebenen Session ab, bevor Sie nachfolgende Eingaben senden.

Diese Entwicklungsversion aktualisiert die gemeinsame V1-Schema-Basislinie. Verwenden Sie einen
Entwicklungskatalog, der aus dieser Basislinie neu erstellt wurde; eine Upgrade-Migration für einen
älteren Katalog ist nicht enthalten.