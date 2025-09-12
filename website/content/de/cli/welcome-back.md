# Welcome Back Feature

Die Welcome Back Funktion hilft dir dabei, deine Arbeit nahtlos fortzusetzen, indem sie automatisch erkennt, wann du zu einem Projekt mit bestehender Konversationshistorie zurückkehrst, und dir anbietet, dort weiterzumachen, wo du aufgehört hast.

## Übersicht

Wenn du Qwen Code in einem Projektverzeichnis startest, das eine zuvor generierte Projektzusammenfassung enthält (`.qwen/PROJECT_SUMMARY.md`), wird der Welcome Back Dialog automatisch angezeigt und gibt dir die Möglichkeit, entweder neu zu starten oder deine vorherige Konversation fortzusetzen.

## Funktionsweise

### Automatische Erkennung

Die Welcome Back Funktion erkennt automatisch:

- **Project Summary File:** Sucht nach `.qwen/PROJECT_SUMMARY.md` in deinem aktuellen Projektverzeichnis
- **Conversation History:** Prüft, ob es eine sinnvolle Konversationshistorie gibt, die fortgesetzt werden kann
- **Settings:** Berücksichtigt deine `enableWelcomeBack` Einstellung (standardmäßig aktiviert)

### Welcome Back Dialog

Wenn eine Projektübersicht gefunden wird, siehst du einen Dialog mit:

- **Last Updated Time:** Zeigt an, wann die Übersicht zuletzt generiert wurde
- **Overall Goal:** Zeigt das Hauptziel deiner vorherigen Sitzung an
- **Current Plan:** Zeigt den Fortschritt der Aufgaben mit Status-Indikatoren:
  - `[DONE]` – Abgeschlossene Aufgaben
  - `[IN PROGRESS]` – Aktuell in Arbeit
  - `[TODO]` – Geplante Aufgaben
- **Task Statistics:** Zusammenfassung der Gesamtaufgaben, abgeschlossenen, laufenden und ausstehenden Aufgaben

### Optionen

Wenn der Welcome Back Dialog erscheint, hast du zwei Wahlmöglichkeiten:

1. **Start new chat session**
   - Schließt den Dialog und beginnt eine neue Konversation
   - Kein vorheriger Kontext wird geladen

2. **Continue previous conversation**
   - Füllt das Eingabefeld automatisch mit: `@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation, Let's continue?`
   - Lädt die Projektübersicht als Kontext für die KI
   - Ermöglicht es dir, nahtlos dort weiterzumachen, wo du aufgehört hast

## Konfiguration

### Welcome Back aktivieren/deaktivieren

Du kannst die Welcome Back-Funktion über die Einstellungen steuern:

**Über den Einstellungsdialog:**

1. Führe `/settings` in Qwen Code aus
2. Suche "Enable Welcome Back" in der UI-Kategorie
3. Schalte die Einstellung ein/aus

**Über die Einstellungsdatei:**  
Füge Folgendes zu deiner `.qwen/settings.json` hinzu:

```json
{
  "enableWelcomeBack": true
}
```

**Speicherorte der Einstellungen:**

- **Benutzereinstellungen:** `~/.qwen/settings.json` (wirkt sich auf alle Projekte aus)
- **Projekteinstellungen:** `.qwen/settings.json` (projektspezifisch)

### Tastenkürzel

- **Escape:** Schließt den Welcome Back-Dialog (standardmäßig wird eine "neue Chat-Session gestartet")

## Integration mit anderen Funktionen

### Generierung der Projektzusammenfassung

Das Welcome Back-Feature arbeitet nahtlos mit dem Befehl `/chat summary` zusammen:

1. **Zusammenfassung generieren:** Verwende `/chat summary`, um eine Projektzusammenfassung zu erstellen  
2. **Automatische Erkennung:** Wenn du das nächste Mal Qwen Code in diesem Projekt startest, erkennt Welcome Back die Zusammenfassung automatisch  
3. **Arbeit fortsetzen:** Wähle „Weitermachen“, und die Zusammenfassung wird als Kontext geladen  

### Beenden-Bestätigung

Beim Beenden mit `/quit-confirm` und Auswahl von „Zusammenfassung generieren und beenden“:

1. Wird automatisch eine Projektzusammenfassung erstellt  
2. Die nächste Sitzung löst den Welcome Back-Dialog aus  
3. Du kannst deine Arbeit nahtlos fortsetzen  

## Dateistruktur

Das Welcome Back-Feature erstellt und verwendet:

```
dein-projekt/
├── .qwen/
│   └── PROJECT_SUMMARY.md    # Generierte Projektzusammenfassung
```

### PROJECT_SUMMARY.md Format

Die generierte Zusammenfassung folgt dieser Struktur:

```markdown

# Project Summary

## Overall Goal

<!-- Ein einzelner, präziser Satz, der das übergeordnete Ziel beschreibt -->
```

## Key Knowledge

<!-- Cruciale Fakten, Konventionen und Einschränkungen -->
<!-- Enthält: Technologieentscheidungen, Architektur-Entscheidungen, Benutzerpräferenzen -->

## Recent Actions

<!-- Zusammenfassung der wichtigsten jüngsten Arbeiten und Ergebnisse -->
<!-- Enthält: Errungenschaften, Entdeckungen, kürzliche Änderungen -->

## Current Plan

<!-- Die aktuelle Entwicklungs-Roadmap und nächste Schritte -->
<!-- Verwendet Status-Markierungen: [DONE], [IN PROGRESS], [TODO] -->

---

## Summary Metadata

**Update time**: 2025-01-10T15:30:00.000Z
```