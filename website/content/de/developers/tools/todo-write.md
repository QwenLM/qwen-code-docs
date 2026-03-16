# Todo-Schreibtool (`todo_write`)

Dieses Dokument beschreibt das `todo_write`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `todo_write`, um eine strukturierte Aufgabenliste für Ihre aktuelle Codingsitzung zu erstellen und zu verwalten. Dieses Tool hilft dem KI-Assistenten dabei, den Fortschritt zu verfolgen und komplexe Aufgaben zu organisieren, und bietet Ihnen Transparenz darüber, welche Arbeiten gerade ausgeführt werden.

### Argumente

`todo_write` akzeptiert ein Argument:

- `todos` (Array, erforderlich): Ein Array von To-do-Einträgen, wobei jeder Eintrag folgende Felder enthält:
  - `content` (Zeichenkette, erforderlich): Die Beschreibung der Aufgabe.
  - `status` (Zeichenkette, erforderlich): Der aktuelle Status (`pending`, `in_progress` oder `completed`).
  - `activeForm` (Zeichenkette, erforderlich): Die Form im Present Continuous, die beschreibt, was gerade ausgeführt wird (z. B. „Tests ausführen“, „Projekt erstellen“).

## So verwenden Sie `todo_write` mit Qwen Code

Der KI-Assistent nutzt dieses Tool automatisch bei komplexen, mehrstufigen Aufgaben. Sie müssen es nicht explizit anfordern, können den Assistenten jedoch auffordern, eine To-do-Liste zu erstellen, falls Sie den geplanten Ansatz für Ihre Anfrage einsehen möchten.

Das Tool speichert To-do-Listen in Ihrem Home-Verzeichnis (`~/.qwen/todos/`) in sessionsspezifischen Dateien, sodass jede Codiersitzung ihre eigene Aufgabenliste behält.

## Wann die KI dieses Tool verwendet

Der Assistent nutzt `todo_write` für:

- Komplexe Aufgaben, die mehrere Schritte erfordern
- Implementierungen neuer Funktionen mit mehreren Komponenten
- Refactoring-Vorgänge über mehrere Dateien hinweg
- Jede Arbeit, die drei oder mehr unterschiedliche Aktionen umfasst

Der Assistent nutzt dieses Tool nicht für einfache, einstufige Aufgaben oder rein informative Anfragen.

### `todo_write`-Beispiele

Erstellen eines Implementierungsplans für eine neue Funktion:

```
todo_write(todos=[
  {
    "content": "Benutzereinstellungsmodell erstellen",
    "status": "ausstehend",
    "activeForm": "Benutzereinstellungsmodell wird erstellt"
  },
  {
    "content": "API-Endpunkte für Einstellungen hinzufügen",
    "status": "ausstehend",
    "activeForm": "API-Endpunkte für Einstellungen werden hinzugefügt"
  },
  {
    "content": "Frontend-Komponenten implementieren",
    "status": "ausstehend",
    "activeForm": "Frontend-Komponenten werden implementiert"
  }
])
```

## Wichtige Hinweise

- **Automatische Nutzung:** Der KI-Assistent verwaltet To-do-Listen automatisch während komplexer Aufgaben.
- **Sichtbarkeit des Fortschritts:** Die To-do-Listen werden in Echtzeit aktualisiert, während die Arbeit fortschreitet.
- **Sitzungsisolation:** Jede Codiersitzung verfügt über ihre eigene To-do-Liste, die sich nicht mit anderen Sitzungen überschneidet.