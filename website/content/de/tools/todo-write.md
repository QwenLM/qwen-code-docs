# Todo Write Tool (`todo_write`)

Dieses Dokument beschreibt das `todo_write` Tool für Qwen Code.

## Beschreibung

Verwende `todo_write`, um eine strukturierte Aufgabenliste für deine aktuelle Coding-Session zu erstellen und zu verwalten. Dieses Tool hilft dem AI-Assistenten dabei, den Fortschritt zu verfolgen und komplexe Aufgaben zu organisieren. Es bietet dir somit einen guten Überblick darüber, welche Arbeiten gerade durchgeführt werden.

### Argumente

`todo_write` akzeptiert ein Argument:

- `todos` (Array, erforderlich): Ein Array von Todo-Elementen, wobei jedes Element folgende Felder enthält:
  - `id` (String, erforderlich): Eine eindeutige Kennung für das Todo-Element.
  - `content` (String, erforderlich): Die Beschreibung der Aufgabe.
  - `status` (String, erforderlich): Der aktuelle Status (`pending`, `in_progress` oder `completed`).

## Wie man `todo_write` mit Qwen Code verwendet

Der KI-Assistent nutzt dieses Tool automatisch, wenn er an komplexen, mehrstufigen Aufgaben arbeitet. Du musst es nicht explizit anfordern, aber du kannst den Assistenten bitten, eine Todo-Liste zu erstellen, wenn du den geplanten Ansatz für deine Anfrage sehen möchtest.

Das Tool speichert Todo-Listen in deinem Home-Verzeichnis (`~/.qwen/todos/`) in sessionspezifischen Dateien, sodass jede Coding-Session ihre eigene Task-Liste verwaltet.

## Wann die KI dieses Tool verwendet

Der Assistent verwendet `todo_write` für:

- Komplexe Aufgaben, die mehrere Schritte erfordern
- Feature-Implementierungen mit mehreren Komponenten
- Refactoring-Operationen über mehrere Dateien hinweg
- Jegliche Arbeiten, die 3 oder mehr unterschiedliche Aktionen beinhalten

Der Assistent wird dieses Tool nicht für einfache, einstufige Aufgaben oder rein informative Anfragen verwenden.

### `todo_write` Beispiele

Erstellen eines Feature-Implementierungsplans:

```
todo_write(todos=[
  {
    "id": "create-model",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "add-endpoints",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "implement-ui",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## Wichtige Hinweise

- **Automatische Verwaltung:** Der AI Assistant verwaltet Todo-Listen während komplexer Aufgaben automatisch.
- **Fortschrittsanzeige:** Du siehst Todo-Listen in Echtzeit aktualisiert, während die Arbeit voranschreitet.
- **Session-Isolation:** Jede Coding-Session hat ihre eigene Todo-Liste, die andere Sessions nicht beeinträchtigt.