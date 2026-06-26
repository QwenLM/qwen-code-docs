# Todo-Write-Tool (`todo_write`)

Dieses Dokument beschreibt das Tool `todo_write` für Qwen Code.

## Beschreibung

Verwenden Sie `todo_write`, um eine strukturierte Aufgabenliste für Ihre aktuelle Codiersitzung zu erstellen und zu verwalten. Dieses Tool hilft dem KI-Assistenten, den Fortschritt zu verfolgen und komplexe Aufgaben zu organisieren, und gibt Ihnen Einblick in die durchgeführten Arbeiten.

### Argumente

`todo_write` akzeptiert ein Argument:

- `todos` (Array, erforderlich): Ein Array von Aufgabenpunkten, wobei jeder Punkt Folgendes enthält:
  - `content` (String, erforderlich): Die Beschreibung der Aufgabe.
  - `status` (String, erforderlich): Der aktuelle Status (`pending`, `in_progress` oder `completed`).
  - `id` (String, erforderlich): Eine eindeutige Kennung für den Aufgabenpunkt.

## So verwenden Sie `todo_write` mit Qwen Code

Der KI-Assistent verwendet dieses Tool automatisch, wenn er an komplexen, mehrschrittigen Aufgaben arbeitet. Sie müssen es nicht explizit anfordern, können den Assistenten jedoch bitten, eine Aufgabenliste zu erstellen, wenn Sie die geplante Vorgehensweise für Ihre Anfrage sehen möchten.

Das Tool speichert Aufgabenlisten in Ihrem Home-Verzeichnis (`~/.qwen/todos/`) mit sitzungsspezifischen Dateien, sodass jede Codiersitzung ihre eigene Aufgabenliste verwaltet.

## Wann die KI dieses Tool verwendet

Der Assistent verwendet `todo_write` für:

- Komplexe Aufgaben, die mehrere Schritte erfordern
- Feature-Implementierungen mit mehreren Komponenten
- Refactoring-Operationen über mehrere Dateien hinweg
- Arbeiten, die drei oder mehr unterschiedliche Aktionen umfassen

Der Assistent wird dieses Tool nicht für einfache, einschrittige Aufgaben oder rein informative Anfragen verwenden.

### Beispiele für `todo_write`

Erstellen eines Plans für eine Feature-Implementierung:

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

- **Automatische Verwendung:** Der KI-Assistent verwaltet Aufgabenlisten während komplexer Aufgaben automatisch.
- **Fortschrittstransparenz:** Sie sehen Aufgabenlisten in Echtzeit aktualisiert, während die Arbeit fortschreitet.
- **Sitzungsisolierung:** Jede Codiersitzung hat ihre eigene Aufgabenliste, die andere Sitzungen nicht beeinträchtigt.
