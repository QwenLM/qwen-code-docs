# Werkzeug „Exit Plan Mode“ (`exit_plan_mode`)

Dieses Dokument beschreibt das Werkzeug `exit_plan_mode` für Qwen Code.

## Beschreibung

Verwenden Sie `exit_plan_mode`, wenn Sie sich im Planungsmodus befinden und Ihren Implementierungsplan vorgestellt haben. Dieses Werkzeug fordert den Benutzer zur Genehmigung oder Ablehnung des Plans auf und wechselt vom Planungsmodus in den Implementierungsmodus.

Das Werkzeug ist speziell für Aufgaben konzipiert, bei denen vor dem Schreiben von Code eine Planung der Implementierungsschritte erforderlich ist. Es darf NICHT für Recherche- oder Informationsbeschaffungsaufgaben verwendet werden.

### Argumente

`exit_plan_mode` akzeptiert ein Argument:

- `plan` (Zeichenkette, erforderlich): Der Implementierungsplan, den Sie dem Benutzer zur Genehmigung vorlegen möchten. Dieser sollte ein prägnanter, in Markdown formatierter Plan sein, der die Implementierungsschritte beschreibt.

## So verwenden Sie `exit_plan_mode` mit Qwen Code

Das Tool „Exit Plan Mode“ ist Teil des Planungs-Workflows von Qwen Code. Wenn Sie sich im Planungsmodus befinden (typischerweise nach der Exploration einer Codebasis und der Ausarbeitung eines Implementierungsansatzes), verwenden Sie dieses Tool, um:

1. Ihren Implementierungsplan dem Benutzer vorzustellen  
2. die Zustimmung des Benutzers zur Durchführung der Implementierung einzuholen  
3. basierend auf der Antwort des Benutzers vom Planungsmodus in den Implementierungsmodus zu wechseln  

Das Tool zeigt dem Benutzer Ihren Plan an und bietet folgende Auswahlmöglichkeiten:

- **Einmal ausführen**: Der Plan wird nur für diese Sitzung genehmigt.  
- **Immer ausführen**: Der Plan wird genehmigt, und zukünftige Bearbeitungsoperationen werden automatisch zugelassen.  
- **Abbrechen**: Der Plan wird abgelehnt, und Sie verbleiben im Planungsmodus.  

Verwendung:

```
exit_plan_mode(plan="Ihr detaillierter Implementierungsplan hier...")
```

## Wann dieses Tool verwenden

Verwenden Sie `exit_plan_mode`, wenn:

1. **Implementierungsaufgaben**: Sie planen die Implementierungsschritte für eine Programmieraufgabe.
2. **Planabschluss**: Sie haben die Erkundung und Gestaltung Ihres Implementierungsansatzes abgeschlossen.
3. **Benutzerfreigabe erforderlich**: Sie benötigen die Bestätigung des Benutzers, bevor Sie mit den Codeänderungen fortfahren.
4. **Code-Schreibaufgaben**: Die Aufgabe umfasst das Schreiben, Ändern oder Refaktorisieren von Code.

### Beispiele für die richtige Verwendung:

- „Helfen Sie mir bei der Implementierung der Benutzerauthentifizierung“ → Verwenden Sie das Tool nach der Planung der Authentifizierungssystem-Implementierung.
- „Fügen Sie einen neuen API-Endpunkt für das Benutzermanagement hinzu“ → Verwenden Sie das Tool nach der Gestaltung der Endpunktstruktur.
- „Refaktorieren Sie die Datenbank-Schicht, um TypeORM zu verwenden“ → Verwenden Sie das Tool nach der Planung des Refaktorisierungsansatzes.

## Wann dieses Tool NICHT verwendet werden sollte

Verwenden Sie `exit_plan_mode` NICHT für:

1. **Rechercheaufgaben**: Aufgaben, die darauf abzielen, bestehenden Code zu verstehen oder zu erforschen  
2. **Informationsbeschaffung**: Wenn Sie suchen, lesen oder analysieren, ohne etwas umzusetzen  
3. **Dokumentationsaufgaben**: Wenn Sie Dokumentation erstellen, ohne den Code zu ändern  
4. **Analyseaufgaben**: Wenn Sie Erklärungen oder Überprüfungen liefern, ohne etwas umzusetzen  

### Beispiele für eine unangemessene Verwendung:

- „Suchen und Verstehen der Implementierung des Vim-Modus im Code“ → Nicht verwenden (Rechercheaufgabe)  
- „Erklären, wie das Authentifizierungssystem funktioniert“ → Nicht verwenden (Analyseaufgabe)  
- „Alle TODO-Kommentare im Projekt finden“ → Nicht verwenden (Informationsbeschaffung)  

## Beispiele für `exit_plan_mode`

### Beispiel für eine Implementierungsplanung

```
exit_plan_mode(plan="## Implementierungsplan für das Benutzer-Dashboard

### 1. Erstellen von Dashboard-Komponenten  
- Erstellen Sie `UserDashboard.tsx` mit dem Haupt-Dashboard-Layout.  
- Fügen Sie `DashboardStats.tsx` hinzu, um Benutzerstatistiken anzuzeigen.  
- Implementieren Sie `ActivityFeed.tsx`, um die jüngsten Aktivitäten des Benutzers anzuzeigen.  

### 2. Hinzufügen der API-Integration  
- Erstellen Sie `dashboardApi.ts` zum Abrufen von Dashboard-Daten.  
- Fügen Sie Endpunkte für Benutzerstatistiken und Aktivitätsdaten hinzu.  
- Implementieren Sie Fehlerbehandlung sowie Ladezustände.  

### 3. Aktualisierung der Routing-Konfiguration  
- Fügen Sie die Dashboard-Route in `App.tsx` hinzu.  
- Aktualisieren Sie die Navigationskomponente mit einem Link zum Dashboard.  
- Fügen Sie eine Routensicherung für authentifizierte Benutzer hinzu.  

### 4. Tests und Dokumentation  
- Schreiben Sie Unit-Tests für die Dashboard-Komponenten.  
- Fügen Sie Integrationstests für die API-Aufrufe hinzu.  
- Aktualisieren Sie die Benutzerdokumentation mit den neuen Dashboard-Funktionen.  

Diese Implementierung wird etwa 4–6 Stunden dauern und Änderungen an 8–10 Dateien erfordern.  
```  

### Beispiel für einen Refaktorierungsplan  

```  
exit_plan_mode(plan="## Refaktorierungsplan: Datenbankschicht

### Phase 1: Einrichtung und Konfiguration
- Installieren und konfigurieren Sie die TypeORM-Abhängigkeiten.
- Erstellen Sie die Konfiguration für die Datenbankverbindung.
- Richten Sie Entitätsdefinitionen für bestehende Modelle ein.

### Phase 2: Migration
- Erstellen Sie Migrationsskripts für vorhandene Daten.
- Implementieren Sie das neue Repository-Muster mithilfe von TypeORM.
- Ersetzen Sie direkte SQL-Abfragen durch den TypeORM-Query-Builder.

### Phase 3: Testen und Validierung
- Aktualisieren Sie alle Datenbanktests, sodass sie TypeORM verwenden.
- Überprüfen Sie die Datenintegrität nach der Migration.
- Führen Sie Leistungstests durch, um sicherzustellen, dass keine Regressionen auftreten.

Durch diese Refaktorisierung wird unsere Datenbankschicht modernisiert, wobei die Abwärtskompatibilität erhalten bleibt.

## Behandlung der Benutzerantwort

Nach dem Aufruf von `exit_plan_mode` kann der Benutzer auf verschiedene Weisen reagieren:

- **Einmal ausführen**: Der Plan wird zur sofortigen Umsetzung mit den standardmäßigen Bestätigungseinstellungen genehmigt.  
- **Immer ausführen**: Der Plan wird genehmigt, und die automatische Genehmigung wird für nachfolgende Bearbeitungsvorgänge aktiviert.  
- **Abbrechen**: Der Plan wird abgelehnt, und das System verbleibt im Planungsmodus für weitere Planungsschritte.

Das Tool passt den Genehmigungsmodus automatisch an die Auswahl des Benutzers an und optimiert so den Umsetzungsprozess entsprechend den Benutzervorgaben.

## Wichtige Hinweise

- **Nur im Planungsmodus**: Dieses Tool darf nur verwendet werden, wenn Sie sich aktuell im Planungsmodus befinden.
- **Implementierungsfokus**: Verwenden Sie es ausschließlich für Aufgaben, die das Schreiben oder Ändern von Code beinhalten.
- **Prägnante Pläne**: Halten Sie Ihre Pläne fokussiert und prägnant – legen Sie Wert auf Klarheit statt auf erschöpfende Detailtiefe.
- **Markdown-Unterstützung**: Pläne unterstützen Markdown-Formatierung zur besseren Lesbarkeit.
- **Einmalige Nutzung**: Das Tool sollte pro Planungssitzung nur einmal verwendet werden – und zwar dann, wenn Sie bereit sind, fortzufahren.
- **Benutzerkontrolle**: Die endgültige Entscheidung, fortzufahren, liegt stets beim Benutzer.

## Integration in den Planungsworkflow

Das Tool „Exit Plan Mode“ ist Teil eines umfassenderen Planungsworkflows:

1. **Planungsmodus aktivieren**: Der Benutzer fordert den Planungsmodus an oder das System ermittelt, dass eine Planung erforderlich ist.
2. **Erkundungsphase**: Analyse des Codebases, Verständnis der Anforderungen und Untersuchung möglicher Lösungsansätze
3. **Planentwurf**: Erstellung einer Implementierungsstrategie basierend auf den Erkenntnissen aus der Erkundungsphase
4. **Planpräsentation**: Verwendung von `exit_plan_mode`, um den Plan dem Benutzer zu präsentieren
5. **Implementierungsphase**: Nach Genehmigung durch den Benutzer wird die geplante Implementierung ausgeführt

Dieser Workflow stellt sicher, dass Implementierungsansätze sorgfältig durchdacht werden, und gibt Benutzern die Kontrolle über umfangreiche Codeänderungen.