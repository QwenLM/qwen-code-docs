# Tool für den Exit-Plan-Modus (`exit_plan_mode`)

Dieses Dokument beschreibt das Tool `exit_plan_mode` für Qwen Code.

## Beschreibung

Verwende `exit_plan_mode`, wenn du dich im Plan-Modus befindest und die Präsentation deines Implementierungsplans abgeschlossen hast. Dieses Tool fordert den Benutzer auf, den Plan zu genehmigen oder abzulehnen, und wechselt vom Plan-Modus in den Implementierungsmodus.

Das Tool ist speziell für Aufgaben konzipiert, die eine Planung der Implementierungsschritte vor dem Schreiben von Code erfordern. Es sollte NICHT für Recherche- oder Informationssammlungsaufgaben verwendet werden.

### Argumente

`exit_plan_mode` erwartet ein Argument:

- `plan` (String, erforderlich): Der Implementierungsplan, den du dem Benutzer zur Genehmigung vorlegen möchtest. Dies sollte ein prägnanter, in Markdown formatierter Plan sein, der die Implementierungsschritte beschreibt.

## So wird `exit_plan_mode` mit Qwen Code verwendet

Das Exit-Plan-Mode-Tool ist Teil des Planungs-Workflows von Qwen Code. Wenn du dich im Plan-Modus befindest (typischerweise nachdem du eine Codebasis erkundet und einen Implementierungsansatz entworfen hast), verwendest du dieses Tool, um:

1. Deinen Implementierungsplan dem Benutzer zu präsentieren
2. Die Genehmigung zur Durchführung der Implementierung anzufordern
3. Basierend auf der Benutzerantwort vom Plan-Modus in den Implementierungsmodus zu wechseln

Das Tool wird dem Benutzer deinen Plan anzeigen und Optionen bereitstellen:

- **Proceed Once**: Den Plan nur für diese Sitzung genehmigen
- **Proceed Always**: Den Plan genehmigen und die automatische Genehmigung für zukünftige Bearbeitungsvorgänge aktivieren
- **Cancel**: Den Plan ablehnen und im Plan-Modus bleiben

Verwendung:

```
exit_plan_mode(plan="Your detailed implementation plan here...")
```

## Wann dieses Tool verwendet werden sollte

Verwende `exit_plan_mode`, wenn:

1. **Implementierungsaufgaben**: Du die Implementierungsschritte für eine Codierungsaufgabe planst
2. **Planabschluss**: Du das Erkunden und Entwerfen deines Implementierungsansatzes abgeschlossen hast
3. **Benutzergenehmigung erforderlich**: Du eine Bestätigung des Benutzers benötigst, bevor du mit Codeänderungen fortfährst
4. **Code-Schreibaufgaben**: Die Aufgabe das Schreiben, Ändern oder Refactoring von Code umfasst

### Beispiele für angemessene Verwendung:

- „Hilf mir bei der Implementierung der Benutzerauthentifizierung“ → Verwenden nach der Planung der Auth-System-Implementierung
- „Füge einen neuen API-Endpunkt für die Benutzerverwaltung hinzu“ → Verwenden nach dem Entwerfen der Endpunktstruktur
- „Refaktoriere die Datenbankschicht auf TypeORM“ → Verwenden nach der Planung des Refactoring-Ansatzes

## Wann dieses Tool NICHT verwendet werden sollte

Verwende `exit_plan_mode` NICHT für:

1. **Rechercheaufgaben**: Aufgaben, die sich auf das Verstehen oder Erkunden vorhandenen Codes konzentrieren
2. **Informationssammlung**: Wenn du suchst, liest oder analysierst, ohne zu implementieren
3. **Dokumentationsaufgaben**: Wenn du Dokumentation erstellst, ohne Codeänderungen vorzunehmen
4. **Analyseaufgaben**: Wenn du Erklärungen oder Überprüfungen ohne Implementierung bereitstellst

### Beispiele für unangemessene Verwendung:

- „Suche nach der Implementierung des vim-Modus in der Codebasis und verstehe sie“ → Nicht verwenden (Rechercheaufgabe)
- „Erkläre, wie das Authentifizierungssystem funktioniert“ → Nicht verwenden (Analyseaufgabe)
- „Finde alle TODO-Kommentare im Projekt“ → Nicht verwenden (Informationssammlung)

## Beispiele für `exit_plan_mode`

### Beispiel für einen Implementierungsplan

```
exit_plan_mode(plan="## Implementation Plan for User Dashboard

### 1. Create Dashboard Components
- Create `UserDashboard.tsx` with main dashboard layout
- Add `DashboardStats.tsx` for displaying user statistics
- Implement `ActivityFeed.tsx` for recent user activities

### 2. Add API Integration
- Create `dashboardApi.ts` for dashboard data fetching
- Add endpoints for user stats and activity data
- Implement error handling and loading states

### 3. Update Routing
- Add dashboard route in `App.tsx`
- Update navigation component with dashboard link
- Add route protection for authenticated users

### 4. Testing and Documentation
- Write unit tests for dashboard components
- Add integration tests for API calls
- Update user documentation with dashboard features

This implementation will take approximately 4-6 hours and requires changes to 8-10 files.")
```

### Beispiel für einen Refactoring-Plan

```
exit_plan_mode(plan="## Database Layer Refactoring Plan

### Phase 1: Setup and Configuration
- Install and configure TypeORM dependencies
- Create database connection configuration
- Set up entity definitions for existing models

### Phase 2: Migration
- Create migration scripts for existing data
- Implement new repository pattern using TypeORM
- Replace raw SQL queries with TypeORM query builder

### Phase 3: Testing and Validation
- Update all database tests to use TypeORM
- Validate data integrity after migration
- Performance testing to ensure no regressions

This refactoring will modernize our database layer while maintaining backward compatibility.")
```

## Behandlung der Benutzerantwort

Nach dem Aufruf von `exit_plan_mode` kann der Benutzer auf verschiedene Weise antworten:

- **Proceed Once**: Der Plan wird zur sofortigen Implementierung mit den Standard-Bestätigungseinstellungen genehmigt
- **Proceed Always**: Der Plan wird genehmigt und die automatische Genehmigung für nachfolgende Bearbeitungsvorgänge aktiviert
- **Cancel**: Der Plan wird abgelehnt, und das System bleibt im Plan-Modus für die weitere Planung

Das Tool passt den Genehmigungsmodus automatisch an die Wahl des Benutzers an und optimiert so den Implementierungsprozess entsprechend den Benutzerpräferenzen.

## Wichtige Hinweise

- **Nur Plan-Modus**: Dieses Tool sollte nur verwendet werden, wenn du dich derzeit im Plan-Modus befindest
- **Implementierungsfokus**: Nur für Aufgaben verwenden, die das Schreiben oder Ändern von Code beinhalten
- **Prägnante Pläne**: Halte Pläne fokussiert und prägnant – strebe nach Klarheit anstelle von übermäßigen Details
- **Markdown-Unterstützung**: Pläne unterstützen Markdown-Formatierung für bessere Lesbarkeit
- **Einmalige Verwendung**: Das Tool sollte pro Planungssitzung einmal verwendet werden, wenn du bereit bist fortzufahren
- **Benutzerkontrolle**: Die endgültige Entscheidung über das Fortfahren liegt immer beim Benutzer

## Integration in den Planungs-Workflow

Das Exit-Plan-Mode-Tool ist Teil eines größeren Planungs-Workflows:

1. **Plan-Modus betreten**: Der Benutzer fordert eine Planung an oder das System stellt fest, dass eine Planung erforderlich ist
2. **Erkundungsphase**: Codebasis analysieren, Anforderungen verstehen, Optionen erkunden
3. **Planentwurf**: Implementierungsstrategie basierend auf der Erkundung erstellen
4. **Planpräsentation**: `exit_plan_mode` verwenden, um den Plan dem Benutzer zu präsentieren
5. **Implementierungsphase**: Nach Genehmigung mit der geplanten Implementierung fortfahren

Dieser Workflow stellt durchdachte Implementierungsansätze sicher und gibt den Benutzern die Kontrolle über bedeutende Codeänderungen.