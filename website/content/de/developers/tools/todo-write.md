# Todo Write Tool (`todo_write`)

In diesem Dokument wird das `todo_write`-Tool für Qwen Code beschrieben.

## Beschreibung

Verwende `todo_write`, um eine strukturierte Aufgabenliste für deine aktuelle Coding-Session zu erstellen und zu verwalten. Dieses Tool hilft dem KI-Assistenten, den Fortschritt zu verfolgen und komplexe Aufgaben zu organisieren, und verschafft dir Einblick in die gerade ausgeführten Arbeiten.

Das Tool ist standardmäßig deaktiviert. Aktiviere es in `settings.json` und starte Qwen Code neu:

```json
{
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

### Argumente

`todo_write` akzeptiert ein Argument:

- `todos` (Array, erforderlich): Ein Array von Todo-Elementen, wobei jedes Element Folgendes enthält:
  - `content` (String, erforderlich): Die Beschreibung der Aufgabe.
  - `status` (String, erforderlich): Der aktuelle Status (`pending`, `in_progress` oder `completed`).
  - `id` (String, erforderlich): Eine eindeutige Kennung für das Todo-Element.

## Verwendung von `todo_write` mit Qwen Code

Wenn das Tool aktiviert ist, kann der KI-Assistent es für komplexe, mehrstufige Aufgaben verwenden. Du kannst den Assistenten auch bitten, eine Todo-Liste zu erstellen, wenn du den geplanten Ansatz für deine Anfrage sehen möchtest.

Das Tool speichert Todo-Listen in deinem Home-Verzeichnis (`~/.qwen/todos/`) in sitzungsspezifischen Dateien, sodass jede Coding-Session ihre eigene Aufgabenliste behält.

## Wann der KI-Assistent dieses Tool verwendet

Der Assistent verwendet `todo_write` für:

- Komplexe Aufgaben, die mehrere Schritte erfordern
- Feature-Implementierungen mit mehreren Komponenten
- Refactoring-Vorgänge über mehrere Dateien hinweg
- Jegliche Arbeiten mit 3 oder mehr verschiedenen Aktionen

Der Assistent verwendet dieses Tool nicht für einfache, einstufige Aufgaben oder rein informative Anfragen.

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

- **Opt-in:** Setze `tools.todoWrite.enabled` auf `true` und starte Qwen Code neu, bevor du das Tool verwendest.
- **Automatische Nutzung wenn aktiviert:** Der KI-Assistent verwaltet Todo-Listen während komplexer Aufgaben.
- **Fortschrittssichtbarkeit:** Du siehst, wie Todo-Listen in Echtzeit aktualisiert werden, während die Arbeit voranschreitet.
- **Session-Isolierung:** Jede Coding-Session hat ihre eigene Todo-Liste, die andere nicht beeinflusst.