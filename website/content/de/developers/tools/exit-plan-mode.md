# Exit Plan Mode Tool (`exit_plan_mode`)

Dieses Dokument beschreibt das `exit_plan_mode`-Tool für Qwen Code.

## Beschreibung

Verwende `exit_plan_mode`, wenn du dich im Plan-Modus befindest und die Vorstellung deines Implementierungsplans abgeschlossen hast. Dieses Tool fordert den Benutzer auf, den Plan zu genehmigen oder abzulehnen, und wechselt vom Planungs- in den Implementierungsmodus.

Das Tool ist speziell für Aufgaben konzipiert, bei denen Implementierungsschritte vor dem Schreiben von Code geplant werden müssen. Es sollte NICHT für Recherche- oder Informationsbeschaffungsaufgaben verwendet werden.

### Argumente

`exit_plan_mode` erwartet ein Argument:

- `plan` (string, erforderlich): Der Implementierungsplan, den du dem Benutzer zur Genehmigung vorlegen möchtest. Dies sollte ein prägnanter, im Markdown-Format gehaltener Plan sein, der die Implementierungsschritte beschreibt.

## Verwendung von `exit_plan_mode` mit Qwen Code

Das Exit Plan Mode Tool ist Teil des Planungs-Workflows von Qwen Code. Wenn du dich im Plan-Modus befindest (typischerweise nach dem Erkunden einer Codebasis und dem Entwerfen eines Implementierungsansatzes), verwendest du dieses Tool, um:

1. deinen Implementierungsplan dem Benutzer vorzustellen
2. die Genehmigung zur Fortsetzung der Implementierung anzufordern
3. basierend auf der Benutzerantwort vom Plan- in den Implementierungsmodus zu wechseln

Das Tool zeigt dem Benutzer deinen Plan an und bietet folgende Optionen:

- **Proceed Once**: Genehmigt den Plan nur für diese Sitzung
- **Proceed Always**: Genehmigt den Plan und aktiviert die automatische Genehmigung für zukünftige Bearbeitungsvorgänge
- **Cancel**: Lehnt den Plan ab und verbleibt im Planungsmodus

Verwendung:

```
exit_plan_mode(plan="Your detailed implementation plan here...")
```

## Wann dieses Tool verwendet werden sollte

Verwende `exit_plan_mode`, wenn:

1. **Implementierungsaufgaben**: Du die Implementierungsschritte für eine Programmieraufgabe planst
2. **Planungsabschluss**: Du das Erkunden und Entwerfen deines Implementierungsansatzes abgeschlossen hast
3. **Benutzergenehmigung erforderlich**: Du vor der Durchführung von Codeänderungen die Bestätigung des Benutzers benötigst
4. **Code-Schreibaufgaben**: Die Aufgabe das Schreiben, Ändern oder Refactoring von Code beinhaltet

### Beispiele für die angemessene Verwendung:

- „Help me implement user authentication" → Verwenden, nachdem die Implementierung des Auth-Systems geplant wurde
- „Add a new API endpoint for user management" → Verwenden, nachdem die Endpunkt-Struktur entworfen wurde
- „Refactor the database layer to use TypeORM" → Verwenden, nachdem der Refactoring-Ansatz geplant wurde

## Wann dieses Tool NICHT verwendet werden sollte

Verwende `exit_plan_mode` NICHT für:

1. **Rechercheaufgaben**: Aufgaben, die sich auf das Verstehen oder Erkunden von bestehendem Code konzentrieren
2. **Informationssammlung**: Wenn du suchst, liest oder analysierst, ohne zu implementieren
3. **Dokumentationsaufgaben**: Wenn du Dokumentation erstellst, ohne Code zu ändern
4. **Analyseaufgaben**: Wenn du Erklärungen oder Reviews ohne Implementierung lieferst

### Beispiele für unangemessene Verwendung:

- „Search for and understand the implementation of vim mode in the codebase" → Nicht verwenden (Rechercheaufgabe)
- „Explain how the authentication system works" → Nicht verwenden (Analyseaufgabe)
- „Find all TODO comments in the project" → Nicht verwenden (Informationssammlung)

## `exit_plan_mode`-Beispiele

### Beispiel für die Implementierungsplanung

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

## Verarbeitung der Benutzerantwort

Nach dem Aufruf von `exit_plan_mode` kann der Benutzer auf verschiedene Weise antworten:

- **Proceed Once**: Der Plan wird für die sofortige Implementierung mit den Standardbestätigungseinstellungen genehmigt
- **Proceed Always**: Der Plan wird genehmigt und die automatische Genehmigung für nachfolgende Bearbeitungsvorgänge aktiviert
- **Cancel**: Der Plan wird abgelehnt und das System verbleibt für weitere Planungen im Plan-Modus

Das Tool passt den Genehmigungsmodus automatisch basierend auf der Auswahl des Benutzers an und optimiert den Implementierungsprozess entsprechend den Benutzereinstellungen.

## Wichtige Hinweise

- **Nur im Plan-Modus**: Dieses Tool sollte nur verwendet werden, wenn du dich aktuell im Plan-Modus befindest
- **Fokus auf Implementierung**: Nur für Aufgaben verwenden, die das Schreiben oder Ändern von Code beinhalten
- **Prägnante Pläne**: Halte Pläne fokussiert und prägnant – strebe Klarheit vor erschöpfenden Details an
- **Markdown-Unterstützung**: Pläne unterstützen Markdown-Formatierung für bessere Lesbarkeit
- **Einmalige Verwendung**: Das Tool sollte pro Planungssitzung einmal verwendet werden, wenn du bereit bist, fortzufahren
- **Benutzerkontrolle**: Die endgültige Entscheidung zur Fortsetzung liegt immer beim Benutzer

## Integration in den Planungs-Workflow

Das Exit Plan Mode Tool ist Teil eines umfassenderen Planungs-Workflows:

1. **Plan-Modus starten**: Benutzeranfrage oder System erkennt, dass Planung erforderlich ist
2. **Explorationsphase**: Codebasis analysieren, Anforderungen verstehen, Optionen erkunden
3. **Planentwurf**: Implementierungsstrategie basierend auf der Exploration erstellen
4. **Planvorstellung**: `exit_plan_mode` verwenden, um den Plan dem Benutzer vorzustellen
5. **Implementierungsphase**: Nach Genehmigung mit der geplanten Implementierung fortfahren

Dieser Workflow stellt durchdachte Implementierungsansätze sicher und gibt Benutzern die Kontrolle über bedeutende Codeänderungen.