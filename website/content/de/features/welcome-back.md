# Welcome Back Feature

Die Welcome Back Funktion hilft dir dabei, deine Arbeit nahtlos fortzusetzen, indem sie automatisch erkennt, wenn du zu einem Projekt mit vorhandener Konversationshistorie zurückkehrst, und dir anbietet, dort weiterzumachen, wo du aufgehört hast.

## Übersicht

Wenn du Qwen Code in einem Projektverzeichnis startest, das eine zuvor generierte Projektzusammenfassung enthält (`.qwen/PROJECT_SUMMARY.md`), wird der Welcome Back Dialog automatisch angezeigt und gibt dir die Möglichkeit, entweder neu zu starten oder deine vorherige Konversation fortzusetzen.

## Funktionsweise

### Automatische Erkennung

Die Welcome Back Funktion erkennt automatisch:

- **Project Summary File:** Sucht nach `.qwen/PROJECT_SUMMARY.md` in deinem aktuellen Projektverzeichnis
- **Konversationshistorie:** Prüft, ob es eine sinnvolle Konversationshistorie zum Fortsetzen gibt
- **Einstellungen:** Berücksichtigt deine `enableWelcomeBack` Einstellung (standardmäßig aktiviert)

### Welcome Back Dialog

Wenn eine Projektübersicht gefunden wird, siehst du einen Dialog mit:

- **Last Updated Time:** Zeigt an, wann die Übersicht zuletzt generiert wurde
- **Overall Goal:** Zeigt das Hauptziel deiner vorherigen Sitzung an
- **Current Plan:** Zeigt den Fortschritt der Aufgaben mit Statusanzeigen:
  - `[DONE]` – Abgeschlossene Aufgaben
  - `[IN PROGRESS]` – Aktuell in Arbeit
  - `[TODO]` – Geplante Aufgaben
- **Task Statistics:** Zusammenfassung der Gesamtaufgaben, abgeschlossen, in Arbeit und ausstehend

### Optionen

Du hast zwei Möglichkeiten, wenn der „Welcome Back“-Dialog erscheint:

1. **Neue Chat-Sitzung starten**
   - Schließt den Dialog und beginnt ein neues Gespräch
   - Kein vorheriger Kontext wird geladen

2. **Vorheriges Gespräch fortsetzen**
   - Füllt das Eingabefeld automatisch mit:  
     `@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation, Let's continue?`
   - Lädt die Projektübersicht als Kontext für die KI
   - Ermöglicht es dir, nahtlos dort weiterzumachen, wo du aufgehört hast

## Konfiguration

### Welcome Back aktivieren/deaktivieren

Du kannst die Welcome Back-Funktion über die Einstellungen steuern:

**Über den Einstellungsdialog:**

1. Führe `/settings` in Qwen Code aus
2. Suche nach "Enable Welcome Back" in der Kategorie UI
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

- **Escape:** Schließt den Welcome Back-Dialog (standardmäßig wird eine "neue Chat-Sitzung gestartet")

## Integration mit anderen Funktionen

### Generierung der Projektzusammenfassung

Das Welcome Back Feature arbeitet nahtlos mit dem Befehl `/chat summary` zusammen:

1. **Zusammenfassung generieren:** Verwende `/chat summary`, um eine Projektzusammenfassung zu erstellen  
2. **Automatische Erkennung:** Wenn du das nächste Mal Qwen Code in diesem Projekt startest, erkennt Welcome Back die Zusammenfassung automatisch  
3. **Arbeit fortsetzen:** Wähle „Weitermachen“, und die Zusammenfassung wird als Kontext geladen  

### Beenden-Bestätigung

Beim Beenden mit `/quit-confirm` und Auswahl von „Zusammenfassung generieren und beenden“:

1. Wird automatisch eine Projektzusammenfassung erstellt  
2. Die nächste Sitzung löst den Welcome Back Dialog aus  
3. Du kannst deine Arbeit nahtlos fortsetzen  

## Dateistruktur

Das Welcome Back Feature erstellt und verwendet folgende Struktur:

```
dein-projekt/
├── .qwen/
│   └── PROJECT_SUMMARY.md    # Generierte Projektzusammenfassung
```

### Format von PROJECT_SUMMARY.md

Die generierte Zusammenfassung folgt dieser Struktur:

```markdown

# Project Summary

## Overall Goal

<!-- Ein einzelner, prägnanter Satz, der das übergeordnete Ziel beschreibt -->
```

## Key Knowledge

<!-- Cruciale Fakten, Konventionen und Einschränkungen -->
<!-- Enthält: Technologieentscheidungen, Architektur-Entscheidungen, Benutzerpräferenzen -->

## Recent Actions

<!-- Zusammenfassung der wichtigsten jüngsten Arbeiten und Ergebnisse -->
<!-- Enthält: Erfolge, Erkenntnisse, kürzliche Änderungen -->

## Current Plan

<!-- Die aktuelle Entwicklungs-Roadmap und nächste Schritte -->
<!-- Verwendet Status-Markierungen: [DONE], [IN PROGRESS], [TODO] -->

---

## Summary Metadata

**Update time**: 2025-01-10T15:30:00.000Z