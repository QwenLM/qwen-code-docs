# Todo Write Tool (`todo_write`)

Dieses Dokument beschreibt das `todo_write`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `todo_write`, um eine strukturierte Aufgabenliste für Ihre aktuelle Codiersitzung zu erstellen und zu verwalten. Dieses Tool hilft dem KI-Assistenten dabei, den Fortschritt zu verfolgen und komplexe Aufgaben zu organisieren, indem es Ihnen einen Überblick darüber gibt, welche Arbeiten gerade durchgeführt werden.

### Argumente

`todo_write` akzeptiert ein Argument:

- `todos` (Array, erforderlich): Ein Array von Todo-Elementen, wobei jedes Element folgende Eigenschaften enthält:
  - `content` (String, erforderlich): Die Beschreibung der Aufgabe.
  - `status` (String, erforderlich): Der aktuelle Status (`pending`, `in_progress` oder `completed`).
  - `activeForm` (String, erforderlich): Die fortlaufende Form, die beschreibt, was gerade getan wird (z. B. „Tests werden ausgeführt“, „Projekt wird gebaut“).

## Verwendung von `todo_write` mit Qwen Code

Der KI-Assistent verwendet dieses Tool automatisch bei der Bearbeitung komplexer Aufgaben mit mehreren Schritten. Sie müssen es nicht explizit anfordern, aber Sie können den Assistenten bitten, eine To-do-Liste zu erstellen, wenn Sie den geplanten Ansatz für Ihre Anfrage sehen möchten.

Das Tool speichert To-do-Listen in Ihrem Home-Verzeichnis (`~/.qwen/todos/`) in dateispezifischen Dateien, sodass jede Codiersitzung ihre eigene Aufgabenliste verwaltet.

## Wann die KI dieses Tool verwendet

Der Assistent verwendet `todo_write` für:

- Komplexe Aufgaben, die mehrere Schritte erfordern
- Funktionsimplementierungen mit mehreren Komponenten
- Refactoring-Vorgänge über mehrere Dateien hinweg
- Jede Arbeit, die drei oder mehr unterschiedliche Aktionen beinhaltet

Der Assistent wird dieses Tool nicht für einfache Aufgaben mit nur einem Schritt oder rein informative Anfragen verwenden.

### `todo_write` Beispiele

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

- **Automatische Verwendung:** Der KI-Assistent verwaltet Todo-Listen während komplexer Aufgaben automatisch.
- **Fortschrittsanzeige:** Du siehst Todo-Listen in Echtzeit aktualisiert, während die Arbeit voranschreitet.
- **Sitzungsisolation:** Jede Codiersitzung hat ihre eigene Todo-Liste, die andere nicht beeinträchtigt.