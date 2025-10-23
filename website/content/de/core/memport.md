# Memory Import Processor

Der Memory Import Processor ist ein Feature, das es dir ermöglicht, deine Context-Dateien (z. B. `QWEN.md`) modular zu gestalten, indem du Inhalte aus anderen Dateien mit der Syntax `@file.md` importierst.

## Übersicht

Dieses Feature erlaubt es dir, große Context-Dateien (z. B. `QWEN.md`) in kleinere, überschaubare Komponenten aufzuteilen, die in verschiedenen Kontexten wiederverwendet werden können. Der Import Processor unterstützt sowohl relative als auch absolute Pfade und verfügt über eingebaute Sicherheitsfunktionen, um zyklische Imports zu verhindern und den Dateizugriff abzusichern.

## Syntax

Verwende das Symbol `@` gefolgt vom Pfad zur Datei, die du importieren möchtest:

```markdown

# Haupt-QWEN.md-Datei

Das ist der Hauptinhalt.

@./components/instructions.md

Weiterer Inhalt hier.

@./shared/configuration.md
```

## Unterstützte Pfadformate

### Relative Pfade

- `@./file.md` – Import aus dem gleichen Verzeichnis  
- `@../file.md` – Import aus dem übergeordneten Verzeichnis  
- `@./components/file.md` – Import aus einem Unterverzeichnis

### Absolute Pfade

- `@/absolute/path/to/file.md` - Import mittels absolutem Pfad

## Beispiele

### Einfacher Import

```markdown

# My QWEN.md

Willkommen in meinem Projekt!

@./getting-started.md

## Funktionen

@./features/overview.md
```

### Verschachtelte Imports

Die importierten Dateien können ihrerseits weitere Imports enthalten und so eine verschachtelte Struktur erzeugen:

```markdown

# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown

# header.md

# Projekt-Header

@./shared/title.md
```

## Sicherheitsfunktionen

### Erkennung zirkulärer Imports

Der Prozessor erkennt automatisch zirkuläre Imports und verhindert diese:

```markdown

# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- Wird erkannt und verhindert -->
```

### Dateizugriffssicherheit

Die Funktion `validateImportPath` stellt sicher, dass Imports nur aus festgelegten Verzeichnissen erlaubt sind, um den Zugriff auf sensible Dateien außerhalb des erlaubten Bereichs zu verhindern.

### Maximale Import-Tiefe

Um unendliche Rekursion zu verhindern, gibt es eine konfigurierbare maximale Import-Tiefe (Standard: 5 Ebenen).

## Fehlerbehandlung

### Fehlende Dateien

Wenn eine referenzierte Datei nicht existiert, schlägt der Import mit einem Fehlerkommentar in der Ausgabe fehl.

### Dateizugriffsfehler

Berechtigungsprobleme oder andere Dateisystemfehler werden mit passenden Fehlermeldungen behandelt.

## Code-Regionserkennung

Der Import-Prozessor verwendet die `marked`-Bibliothek, um Codeblöcke und Inline-Code-Spannen zu erkennen. Dadurch wird sichergestellt, dass `@`-Imports innerhalb dieser Bereiche korrekt ignoriert werden. Dies ermöglicht eine robuste Verarbeitung verschachtelter Codeblöcke und komplexer Markdown-Strukturen.

## Import-Tree-Struktur

Der Prozessor gibt einen Import-Tree zurück, der die Hierarchie der importierten Dateien darstellt. Dies hilft Nutzern dabei, Probleme mit ihren Context-Dateien zu debuggen, indem es zeigt, welche Dateien gelesen wurden und wie sie zueinander in Beziehung stehen.

Beispiel für eine Tree-Struktur:

```
 Memory Files
 L project: QWEN.md
            L a.md
              L b.md
                L c.md
              L d.md
                L e.md
                  L f.md
            L included.md
```

Der Tree behält die Reihenfolge bei, in der die Dateien importiert wurden, und zeigt die vollständige Import-Kette zu Debugging-Zwecken an.

## Vergleich mit dem `/memory`-Ansatz von Claude Code (`claude.md`)

Das `/memory`-Feature von Claude Code (wie in `claude.md` zu sehen) erzeugt ein flaches, lineares Dokument durch Aneinanderreihung aller eingebundenen Dateien. Dabei werden die Dateigrenzen immer durch klare Kommentare und Pfadnamen markiert. Die Import-Hierarchie wird nicht explizit dargestellt, aber das LLM erhält alle Dateiinhalte und Pfade, was ausreichend ist, um die Hierarchie bei Bedarf rekonstruieren zu können.

Hinweis: Der Import-Baum dient hauptsächlich der Übersicht während der Entwicklung und hat nur begrenzte Relevanz für die Verarbeitung durch das LLM.

## API Reference

### `processImports(content, basePath, debugMode?, importState?)`

Verarbeitet Import-Anweisungen im Kontext der Dateiinhalte.

**Parameter:**

- `content` (string): Der zu verarbeitende Inhalt für Imports
- `basePath` (string): Der Verzeichnispfad, in dem sich die aktuelle Datei befindet
- `debugMode` (boolean, optional): Ob das Debug-Logging aktiviert werden soll (Standard: false)
- `importState` (ImportState, optional): Zustandsverfolgung zur Verhinderung zirkulärer Imports

**Rückgabewert:** Promise&lt;ProcessImportsResult&gt; - Objekt mit verarbeitetem Inhalt und Import-Baumstruktur

### `ProcessImportsResult`

```typescript
interface ProcessImportsResult {
  content: string; // Der verarbeitete Inhalt mit aufgelösten Imports
  importTree: MemoryFile; // Baumstruktur, die die Import-Hierarchie darstellt
}
```

### `MemoryFile`

```typescript
interface MemoryFile {
  path: string; // Der Dateipfad
  imports?: MemoryFile[]; // Direkte Imports, in der Reihenfolge ihres Imports
}
```

### `validateImportPath(importPath, basePath, allowedDirectories)`

Validiert Import-Pfade, um sicherzustellen, dass sie sicher sind und sich innerhalb der erlaubten Verzeichnisse befinden.

**Parameter:**

- `importPath` (string): Der zu validierende Import-Pfad
- `basePath` (string): Das Basisverzeichnis für die Auflösung von relativen Pfaden
- `allowedDirectories` (string[]): Array mit erlaubten Verzeichnispfaden

**Rückgabewert:** boolean - Ob der Import-Pfad gültig ist

### `findProjectRoot(startDir)`

Findet das Projekt-Root-Verzeichnis, indem es rekursiv nach einem `.git`-Verzeichnis sucht, beginnend vom angegebenen Startverzeichnis. Implementiert als **async** Funktion unter Verwendung nicht-blockierender Filesystem-APIs, um den Node.js Event Loop nicht zu blockieren.

**Parameter:**

- `startDir` (string): Das Verzeichnis, ab dem die Suche gestartet wird

**Rückgabewert:** Promise&lt;string&gt; - Das Root-Verzeichnis des Projekts (oder das Startverzeichnis, falls kein `.git` gefunden wurde)

## Best Practices

1. **Verwende beschreibende Dateinamen** für importierte Komponenten
2. **Halte Imports flach** - vermeide tief verschachtelte Import-Ketten
3. **Dokumentiere deine Struktur** - pflege eine klare Hierarchie der importierten Dateien
4. **Teste deine Imports** - stelle sicher, dass alle referenzierten Dateien existieren und erreichbar sind
5. **Verwende relative Pfade** wenn möglich für bessere Portabilität

## Troubleshooting

### Häufige Probleme

1. **Import funktioniert nicht**: Prüfe, ob die Datei existiert und der Pfad korrekt ist
2. **Warnungen bei zirkulären Imports**: Überprüfe deine Import-Struktur auf zirkuläre Referenzen
3. **Berechtigungsfehler**: Stelle sicher, dass die Dateien lesbar sind und sich innerhalb erlaubter Verzeichnisse befinden
4. **Probleme bei der Pfadauflösung**: Verwende absolute Pfade, wenn relative Pfade nicht korrekt aufgelöst werden

### Debug Modus

Aktiviere den Debug-Modus, um detaillierte Logs des Import-Prozesses zu sehen:

```typescript
const result = await processImports(content, basePath, true);
```