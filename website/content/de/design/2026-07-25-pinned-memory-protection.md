# Pinned-Managed-Memory-Schutz

## Problem

Der verwaltete Auto-Memory entdeckt rekursiv gültige Markdown-Themen unterhalb
der Projekt- und Nutzer-Memory-Roots, begrenzt durch die bestehenden
Index-Limits. Die Agenten für automatische Extraktion und Dream-Konsolidierung
können Pfade innerhalb ihrer erlaubten Memory-Roots schreiben oder bearbeiten,
sodass eine manuell gepflegte Datei wie ein automatisch erzeugter Memory
überschrieben oder konsolidiert werden kann.

Der rekursive Scanner entdeckt bereits gültige Dateien unterhalb `pinned/`;
das fehlende Verhalten ist ein deterministischer Mutationsschutz während der
automatisierten Memory-Pflege.

## Gewähltes Design

Ein Top-Level-Verzeichnis `pinned/` innerhalb einer Managed-Memory-Root wird
als geschützt vor Mutation durch automatische Extraktion und als
ausgeschlossen von der Dream-Konsolidierung behandelt:

- Gültige gepinnte Dokumente bleiben für den normalen Memory-Recall lesbar und
  für den bestehenden Indexer unter dessen normalen Limits auffindbar.
- `write_file`- und `edit`-Operationen der automatischen Extraktion und des
  geforkten Dream werden abgelehnt, wenn der angefragte Pfad lexikalisch
  unterhalb `pinned/` liegt.
- Der reservierte Top-Level-Verzeichnisname wird case-insensitiv gematcht,
  damit die Deny-List auf case-insensitiven Dateisystemen nicht offen
  fehlschlagen kann.
- Aliasse, die über einen Symlink in `pinned/` auflösen, werden ebenfalls
  abgelehnt.
- Das bestehende Read-only-Shell-Gate bleibt erhalten; es lehnt bereits `rm`
  und jeden anderen mutierenden Shell-Befehl ab.
- Die Prompts für automatische Extraktion und Dream werden angewiesen,
  gepinnte Dokumente unverändert zu lassen und ihre bestehenden Index-Einträge
  nicht absichtlich zu entfernen, innerhalb der normalen Index-Limits.

Der Pfad-Check vergleicht sowohl den literalen als auch den aufgelösten Pfad
case-insensitiv. Das Enthaltensein des literalen Pfads schützt `pinned/` auch
dann, wenn das Verzeichnis selbst ein Symlink ist. Das Enthaltensein des
aufgelösten Pfads verhindert, dass ein andernorts im Memory beschreibbar
aussehender Pfad per Symlink zurück in `pinned/` zeigt.

Der Schutz ist eine explizite Option in der bestehenden Memory-scoped
Agent-Konfiguration und wird von den Planern der automatischen Extraktion und
des geforkten Dream aktiviert. Das deckt die Nach-Session-Extraktion, den
geplanten Dream und die Aufrufer des Workspace-Memory-Dream-Endpoints ab.
Explizite Remember-Operationen behalten ihr aktuelles Verhalten.

## Scope-Grenzen

- Keine Änderung an Scanner- oder Indexer-Produktion: die rekursive Entdeckung
  behandelt `pinned/`-Dokumente in Projekt und Nutzer bereits mit dem
  bestehenden Frontmatter-Schema.
- Kein neues Frontmatter-Feld und keine automatische Erstellung des
  Verzeichnisses.
- Kein `/memory`-UI-Indikator.
- Explizite `/forget`-Anfragen behalten ihr aktuelles Verhalten.
- Diese pfadbasierte Grenze erkennt keine bereits existierenden
  Hardlink-Aliasse auf gepinnte Dateien. Automatische Memory-Worker können sie
  mit `write_file` oder `edit` nicht erzeugen, und ihre Read-only-Shell-Policy
  blockiert `ln`; ein stärkeres Threat-Model würde eine separate
  inode-basierte Policy erfordern.
- Der sichtbare `/dream`-Slash-Befehl-Turn erhält die gemeinsame
  Skip-Prompt-Regel, bekommt aber in dieser Änderung kein deterministisches
  Tool-Gate. Der Slash-Befehl läuft auf dem Haupt-Agenten, der keinen
  bestehenden Pro-Turn-Permission-Override hat; einen solchen hinzuzufügen
  wäre ein separates flächenübergreifendes Berechtigungsdesign.
- Der geforkte Dream bleibt auf Projekt-Memory beschränkt, da seine bestehende
  scoping-basierte Konfiguration die globale Nutzer-Memory-Root ausschließt.
- Die automatische Extraktion deckt weiterhin sowohl die Projekt- als auch die
  globale Nutzer-Memory-Root ab, sodass beide Top-Level-`pinned/`-Verzeichnisse
  denselben Schutz erhalten.

## Betroffene Dateien

- `packages/core/src/memory/paths.ts`
- `packages/core/src/memory/memory-scoped-agent-config.ts`
- `packages/core/src/memory/dreamAgentPlanner.ts`
- `packages/core/src/memory/extractionAgentPlanner.ts`
- Kolokalisierte Memory-Berechtigungs-, Prompt- und Index-Tests
- `docs/users/features/memory.md`

## Offene Frage

Ob der sichtbare `/dream`-Slash-Befehl dasselbe deterministische Gate erhalten
muss, bleibt eine Scope-Entscheidung der Maintainer. Falls nötig, sollte es
als genereller Pro-Turn-Permission-Override implementiert werden statt den
Session-weiten Berechtigungsmanager um eine asynchrone Tool-Schleife herum zu
mutieren.
