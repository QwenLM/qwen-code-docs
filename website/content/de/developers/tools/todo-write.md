# Todo Write Tool (`todo_write`)

Dieses Dokument beschreibt das `todo_write` Tool für Qwen Code.

## Beschreibung

Verwende `todo_write`, um eine strukturierte Aufgabenliste für deine aktuelle Coding-Session zu erstellen und zu verwalten. Dieses Tool hilft dem KI-Assistenten, den Fortschritt zu verfolgen und komplexe Aufgaben zu organisieren, sodass du stets einen Überblick über die ausgeführten Arbeiten hast.

### Argumente

`todo_write` erwartet ein Argument:

- `todos` (array, erforderlich): Ein Array von Todo-Einträgen, wobei jeder Eintrag Folgendes enthält:
  - `content` (string, erforderlich): Die Beschreibung der Aufgabe.
  - `status` (string, erforderlich): Der aktuelle Status (`pending`, `in_progress` oder `completed`).
  - `activeForm` (string, erforderlich): Die Verlaufsform (Present Continuous), die beschreibt, was gerade getan wird (z. B. „Running tests“, „Building the project“).

## So verwendest du `todo_write` mit Qwen Code

Der KI-Assistent verwendet dieses Tool automatisch, wenn er an komplexen, mehrstufigen Aufgaben arbeitet. Du musst es nicht explizit anfordern, kannst den Assistenten aber bitten, eine Todo-Liste zu erstellen, wenn du den geplanten Ansatz für deine Anfrage einsehen möchtest.

Das Tool speichert Todo-Listen in deinem Home-Verzeichnis (`~/.qwen/todos/`) in sessionspezifischen Dateien, sodass jede Coding-Session ihre eigene Aufgabenliste verwaltet.

## Wann der KI-Assistent dieses Tool verwendet

Der Assistent verwendet `todo_write` für:

- Komplexe Aufgaben, die mehrere Schritte erfordern
- Feature-Implementierungen mit mehreren Komponenten
- Refactoring-Operationen über mehrere Dateien hinweg
- Jegliche Arbeiten, die drei oder mehr unterschiedliche Aktionen umfassen

Der Assistent verwendet dieses Tool nicht für einfache, einstufige Aufgaben oder rein informative Anfragen.

### `todo_write`-Beispiele

Erstellen eines Feature-Implementierungsplans:

```
todo_write(todos=[
  {
    "content": "Create user preferences model",
    "status": "pending",
    "activeForm": "Creating user preferences model"
  },
  {
    "content": "Add API endpoints for preferences",
    "status": "pending",
    "activeForm": "Adding API endpoints for preferences"
  },
  {
    "content": "Implement frontend components",
    "status": "pending",
    "activeForm": "Implementing frontend components"
  }
])
```

## Wichtige Hinweise

- **Automatische Verwendung:** Der KI-Assistent verwaltet Todo-Listen bei komplexen Aufgaben automatisch.
- **Fortschrittsübersicht:** Du siehst Todo-Listen in Echtzeit aktualisiert, während die Arbeit fortschreitet.
- **Session-Isolation:** Jede Coding-Session verfügt über eine eigene Todo-Liste, die andere nicht beeinträchtigt.