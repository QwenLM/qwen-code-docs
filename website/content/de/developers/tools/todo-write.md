# Todo Write Tool (`todo_write`)

Dieses Dokument beschreibt das `todo_write`-Tool für Qwen Code.

## Beschreibung

Verwende `todo_write`, um eine strukturierte Aufgabenliste für deine aktuelle Coding-Session zu erstellen und zu verwalten. Dieses Tool hilft dem KI-Assistenten, den Fortschritt zu verfolgen und komplexe Aufgaben zu organisieren, und gibt dir Einblick in die durchgeführten Arbeiten.

### Argumente

`todo_write` akzeptiert ein Argument:

- `todos` (Array, erforderlich): Ein Array von Todo-Elementen, wobei jedes Element Folgendes enthält:
  - `content` (String, erforderlich): Die Beschreibung der Aufgabe.
  - `status` (String, erforderlich): Der aktuelle Status (`pending`, `in_progress` oder `completed`).
  - `id` (String, erforderlich): Eine eindeutige Kennung für das Todo-Element.

## So verwendest du `todo_write` mit Qwen Code

Der KI-Assistent wird dieses Tool automatisch verwenden, wenn er an komplexen, mehrstufigen Aufgaben arbeitet. Du musst es nicht explizit anfordern, aber du kannst den Assistenten bitten, eine Todo-Liste zu erstellen, wenn du den geplanten Ansatz für deine Anfrage sehen möchtest.

Das Tool speichert Todo-Listen in deinem Home-Verzeichnis (`~/.qwen/todos/`) in sitzungsspezifischen Dateien, sodass jede Coding-Session ihre eigene Aufgabenliste behält.

## Wann der KI dieses Tool verwendet

Der Assistent verwendet `todo_write` für:

- Komplexe Aufgaben, die mehrere Schritte erfordern
- Feature-Implementierungen mit mehreren Komponenten
- Refactoring-Vorgänge über mehrere Dateien hinweg
- Jegliche Arbeiten mit 3 oder mehr verschiedenen Aktionen

Der Assistent wird dieses Tool nicht für einfache, einstufige Aufgaben oder rein informative Anfragen verwenden.

### `todo_write`-Beispiele

Erstellen eines Implementierungsplans für eine Funktion:

```
todo_write(todos=[
  {
    "id": "1",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "2",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "3",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## Wichtige Hinweise

- **Automatische Nutzung:** Der KI-Assistent verwaltet Todo-Listen automatisch während komplexer Aufgaben.
- **Fortschrittstransparenz:** Du wirst sehen, wie Todo-Listen in Echtzeit aktualisiert werden, während die Arbeit voranschreitet.
- **Sitzungsisolierung:** Jede Coding-Session hat ihre eigene Todo-Liste, die andere nicht beeinträchtigt.