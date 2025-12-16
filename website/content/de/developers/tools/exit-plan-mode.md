# Exit Plan Mode Tool (`exit_plan_mode`)

Dieses Dokument beschreibt das `exit_plan_mode`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `exit_plan_mode`, wenn Sie sich im Planungsmodus befinden und Ihre Implementierungsplanung abgeschlossen haben. Dieses Tool fordert den Benutzer auf, den Plan zu genehmigen oder abzulehnen, und wechselt vom Planungsmodus in den Implementierungsmodus.

Das Tool ist speziell für Aufgaben konzipiert, bei denen die Planung der Implementierungsschritte vor dem Schreiben von Code erforderlich ist. Es sollte NICHT für Forschungs- oder Informationsbeschaffungsaufgaben verwendet werden.

### Argumente

`exit_plan_mode` akzeptiert ein Argument:

- `plan` (String, erforderlich): Der Implementierungsplan, den Sie dem Benutzer zur Genehmigung vorlegen möchten. Dies sollte ein prägnanter, im Markdown-Format verfasster Plan sein, der die Implementierungsschritte beschreibt.

## Verwendung von `exit_plan_mode` mit Qwen Code

Das Exit Plan Mode-Tool ist Teil des Planungsworkflows von Qwen Code. Wenn Sie sich im Planmodus befinden (typischerweise nach dem Erkunden einer Codebasis und dem Entwerfen eines Implementierungsansatzes), verwenden Sie dieses Tool, um:

1. Ihren Implementierungsplan dem Benutzer zu präsentieren
2. Die Genehmigung zur Fortsetzung der Implementierung anzufordern
3. Basierend auf der Benutzerantwort vom Planmodus zum Implementierungsmodus zu wechseln

Das Tool fordert den Benutzer mit Ihrem Plan auf und bietet Optionen zum:

- **Einmal ausführen**: Den Plan nur für diese Sitzung genehmigen
- **Immer ausführen**: Den Plan genehmigen und die automatische Genehmigung für zukünftige Bearbeitungsvorgänge aktivieren
- **Abbrechen**: Den Plan ablehnen und im Planmodus bleiben

Verwendung:

```
exit_plan_mode(plan="Ihr detaillierter Implementierungsplan hier...")
```

## Wann dieses Tool verwenden

Verwenden Sie `exit_plan_mode`, wenn:

1. **Implementierungsaufgaben**: Sie die Implementierungsschritte für eine Coding-Aufgabe planen
2. **Planungsabschluss**: Sie das Erkunden und Entwerfen Ihres Implementierungsansatzes abgeschlossen haben
3. **Benutzerfreigabe erforderlich**: Sie eine Bestätigung des Benutzers benötigen, bevor Sie mit den Codeänderungen fortfahren
4. **Code-Schreibaufgaben**: Die Aufgabe das Schreiben, Ändern oder Refactoren von Code beinhaltet

### Beispiele für geeignete Verwendung:

- „Hilf mir bei der Implementierung der Benutzerauthentifizierung“ → Verwenden nach der Planung der Auth-System-Implementierung
- „Füge einen neuen API-Endpunkt für das Benutzermanagement hinzu“ → Verwenden nach dem Entwurf der Endpunktstruktur
- „Refaktoriere die Datenbankschicht zur Verwendung von TypeORM“ → Verwenden nach der Planung des Refactoring-Ansatzes

## Wann dieses Tool NICHT verwendet werden sollte

Verwenden Sie `exit_plan_mode` NICHT für:

1. **Forschungsaufgaben**: Aufgaben, die sich auf das Verstehen oder Erkunden bestehenden Codes konzentrieren
2. **Informationsbeschaffung**: Wenn Sie suchen, lesen oder analysieren, ohne etwas zu implementieren
3. **Dokumentationsaufgaben**: Wenn Sie Dokumentation erstellen, ohne Code-Änderungen vorzunehmen
4. **Analyseaufgaben**: Wenn Sie Erklärungen oder Reviews bereitstellen, ohne etwas zu implementieren

### Beispiele für unangemessene Nutzung:

- „Suche nach und verstehe die Implementierung des Vim-Modus in der Codebasis“ → Nicht verwenden (Forschungsaufgabe)
- „Erkläre, wie das Authentifizierungssystem funktioniert“ → Nicht verwenden (Analyseaufgabe)
- „Finde alle TODO-Kommentare im Projekt“ → Nicht verwenden (Informationsbeschaffung)

## `exit_plan_mode` Beispiele

### Beispiel für Implementierungsplanung

```
exit_plan_mode(plan="## Implementierungsplan für Benutzer-Dashboard

### 1. Dashboard-Komponenten erstellen
- Erstelle `UserDashboard.tsx` mit dem Haupt-Dashboard-Layout
- Füge `DashboardStats.tsx` für die Anzeige von Benutzerstatistiken hinzu
- Implementiere `ActivityFeed.tsx` für aktuelle Benutzeraktivitäten

### 2. API-Integration hinzufügen
- Erstelle `dashboardApi.ts` für das Abrufen von Dashboard-Daten
- Füge Endpunkte für Benutzerstatistiken und Aktivitätsdaten hinzu
- Implementiere Fehlerbehandlung und Ladezustände

### 3. Routing aktualisieren
- Füge eine Dashboard-Route in `App.tsx` hinzu
- Aktualisiere die Navigationskomponente mit einem Dashboard-Link
- Füge Routenschutz für authentifizierte Benutzer hinzu

### 4. Tests und Dokumentation
- Schreibe Unit-Tests für Dashboard-Komponenten
- Füge Integrationstests für API-Aufrufe hinzu
- Aktualisiere die Benutzerdokumentation mit Dashboard-Funktionen

Diese Implementierung dauert etwa 4–6 Stunden und erfordert Änderungen an 8–10 Dateien.")
```

### Beispiel für einen Refactoring-Plan

```
exit_plan_mode(plan="## Datenbankschicht-Refactoring-Plan

### Phase 1: Einrichtung und Konfiguration
- Installation und Konfiguration der TypeORM-Abhängigkeiten
- Erstellung der Datenbankverbindungs-Konfiguration
- Einrichtung der Entitätsdefinitionen für bestehende Modelle

### Phase 2: Migration
- Erstellung von Migrationsskripten für vorhandene Daten
- Implementierung des neuen Repository-Musters unter Verwendung von TypeORM
- Ersetzung von Raw-SQL-Abfragen durch den TypeORM Query Builder

### Phase 3: Testen und Validierung
- Aktualisierung aller Datenbanktests zur Verwendung von TypeORM
- Validierung der Datenintegrität nach der Migration
- Leistungstests zur Sicherstellung, dass keine Regressionen auftreten

Diese Überarbeitung wird unsere Datenbankschicht modernisieren und gleichzeitig die Abwärtskompatibilität beibehalten.

## Umgang mit Benutzerantworten

Nach dem Aufruf von `exit_plan_mode` kann der Benutzer auf verschiedene Arten reagieren:

- **Einmalig fortfahren**: Der Plan wird zur sofortigen Umsetzung genehmigt, wobei die Standardbestätigungs-Einstellungen verwendet werden
- **Immer fortfahren**: Der Plan wird genehmigt und die automatische Genehmigung für nachfolgende Bearbeitungsvorgänge aktiviert
- **Abbrechen**: Der Plan wird abgelehnt und das System bleibt im Planmodus, um weitere Planungsschritte zu ermöglichen

Das Tool passt den Genehmigungsmodus automatisch entsprechend der Benutzerwahl an, um den Umsetzungsprozess gemäß den Benutzerpräferenzen zu optimieren.

## Wichtige Hinweise

- **Nur im Planungsmodus**: Dieses Tool sollte nur verwendet werden, wenn du dich derzeit im Planungsmodus befindest
- **Fokus auf Implementierung**: Nur für Aufgaben verwenden, die das Schreiben oder Ändern von Code beinhalten
- **Präzise Pläne**: Halte Pläne fokussiert und präzise – Klarheit geht vor vollständiger Detailgenauigkeit
- **Markdown-Unterstützung**: Pläne unterstützen Markdown-Formatierung für bessere Lesbarkeit
- **Einmalige Nutzung**: Das Tool sollte einmal pro Planungssitzung verwendet werden, wenn du bereit bist fortzufahren
- **Benutzerkontrolle**: Die endgültige Entscheidung zum Fortfahren liegt immer beim Benutzer

## Integration mit dem Planungs-Workflow

Das Exit-Plan-Mode-Tool ist Teil eines größeren Planungsworkflows:

1. **Planmodus aktivieren**: Der Benutzer fordert dies an oder das System ermittelt, dass eine Planung erforderlich ist
2. **Erkundungsphase**: Analyse der Codebasis, Verständnis der Anforderungen, Erkundung von Optionen
3. **Plangestaltung**: Erstellung einer Implementierungsstrategie basierend auf der Erkundung
4. **Planpräsentation**: Verwendung von `exit_plan_mode`, um den Plan dem Benutzer zu präsentieren
5. **Implementierungsphase**: Bei Genehmigung fortfahren mit der geplanten Implementierung

Dieser Workflow stellt sicher, dass fundierte Ansätze für die Implementierung gewählt werden und gibt den Benutzern Kontrolle über wesentliche Codeänderungen.