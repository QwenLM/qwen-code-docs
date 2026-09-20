# Regeln

Eine Regel ist eine Markdown-Datei, die entweder zu Beginn einer Session oder in dem Moment, in dem die Arbeit eine Datei berührt, auf die sie zutrifft, an das Modell gelangt. Regeln liegen in `.qwen/rules/`, und das Feld `paths:` ermöglicht die zweite Variante: Hinweise zu deinen React-Komponenten müssen nicht im Prompt stehen, während du ein Makefile bearbeitest.

Sie sind das günstige Gegenstück zu einer Kontextdatei (`QWEN.md`), die bei **jedem** Request jeder Session mitgeführt wird — siehe [Resident Context Cost](./context-cost.md).

## Wo Regeln liegen

| Speicherort                                 | Geladen                                    |
| ------------------------------------------- | ------------------------------------------ |
| `~/.qwen/rules/` (oder `$QWEN_HOME/rules/`) | immer                                      |
| `<project>/.qwen/rules/`                    | wenn der Workspace vertrauenswürdig ist    |
| `rules/` einer aktiven Extension            | immer, nur bedingte Regeln — siehe unten   |

Jede `.md`-Datei in diesen Verzeichnissen wird erkannt, einschließlich Unterverzeichnissen, in einer deterministischen Reihenfolge.

## Basisregeln und bedingte Regeln

```markdown
---
description: How we write React components
paths:
  - 'src/**/*.tsx'
  - 'src/**/*.jsx'
---

Components are function components. Co-locate the test beside the component.
Never reach for a global store for state one screen owns.
```

- **Mit `paths:`** — eine _bedingte_ Regel. Sie bleibt außerhalb des Prompts, bis ein Tool-Aufruf eine Datei liest oder bearbeitet, die auf einen ihrer Globs passt, und wird dann einmal für den Rest der Session injiziert.
- **Ohne `paths:`** — eine _Basisregel_. Sie ist ab dem ersten Request Teil des System-Prompts, genau wie eine Kontextdatei, und kostet in jedem Turn dasselbe.

Beide Felder sind optional, und eine Regel ohne jegliches Frontmatter ist eine Basisregel.

Wissenswerte Details:

- Globs werden gegen den Pfad **relativ zum Projekt-Root** gematcht, mit Forward Slashes auf jeder Plattform, und sie matchen Dotfiles.
- Symlinks werden aufgelöst, sodass eine Regel unabhängig davon matcht, ob der Tool-Aufruf den Link oder den realen Pfad verwendet hat.
- Eine bedingte Regel wird **einmal pro Session** injiziert — die zweite passende Datei wiederholt sie nicht.
- HTML-Kommentare werden aus dem Body einer Regel entfernt, bevor sie gesendet wird.

## Regeln aus Extensions

Eine Extension kann ein `rules/`-Verzeichnis mitliefern, und **ihre Regeln müssen bedingt sein**: Eine Regel ohne `paths:` wird übersprungen, mit einer Startup-Warnung, die sie benennt. Diese Einschränkung ist der eigentliche Zweck. Die Kontextdatei (`contextFileName`) einer Extension wird an jeden Request jeder Session angehängt, in der die Extension aktiv ist, ohne Relevanz-Filter — in einer gemessenen Session beliefen sich die Kontextdateien von neun Extensions auf 9.989 Token, 65 % des gesamten Always-on-Kontexts dieser Session. Eine Basisregel einer Extension würde genau das reproduzieren, nur über einen weiteren Mechanismus.

Extensions-Regeln werden im Prompt mit ihrem Owner gekennzeichnet — `charts:rules/charting.md`, kein Pfad, der aus dem Projekt herausklettert — sodass ein Transkript zeigt, wessen Regel gefeuert hat.

Sie werden nicht über Workspace-Trust gefiltert, im Gegensatz zu Projektregeln: Das Installieren einer Extension ist bereits ein expliziter Akt, und dieselbe Extension kann MCP-Server, Commands, Skills und eine ungefilterte Kontextdatei beisteuern. Trust für den einen Mechanismus zu verlangen, der schmaler und günstiger als eine Kontextdatei ist, würde Autoren nur zurück zur teuren Option drängen.

**Wenn du eine Extension entwickelst**, ist dies die Migration, die du vornehmen solltest:

| Inhalt                                                                            | Ablegen in                                     |
| --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Immer gültige Fakten — die Identität der Extension, ihr Vokabular, eine harte Einschränkung | die Kontextdatei                               |
| "When working on X, do Y"                                                         | eine `paths:`-gefilterte Regel oder ein [Skill](./skills.md) |
| Eine Prozedur, die das Modell auf Anfrage ausführt                                | ein [Skill](./skills.md)                       |

## Regeln, Skills und Kontextdateien

|                             | Von Anfang an im Prompt | Auf Anfrage geladen             |
| --------------------------- | ----------------------- | ------------------------------- |
| Kontextdatei (`QWEN.md`)    | immer, vollständig      | —                               |
| Basisregel                  | immer, vollständig      | —                               |
| Bedingte Regel (`paths:`)   | nichts                  | wenn eine passende Datei berührt wird |
| Skill                       | nur Name + Beschreibung | Body, wenn das Modell ihn aufruft |

Ein Skill ist der richtige Ort für eine Prozedur, der das Modell zu folgen wählt; eine bedingte Regel ist der richtige Ort für eine Einschränkung, die für einen Bereich des Codebases gilt, unabhängig davon, ob das Modell daran gedacht hat, nachzuschauen. Skills können ebenfalls [auf `paths:` gefiltert werden](./skills.md#optional-gate-a-skill-on-file-paths-paths), was sogar ihren Listeneintrag aus dem Prompt hält, bis er relevant ist.

## Siehe auch

- [Resident Context Cost](./context-cost.md) — wie du misst, was dein Prefix kostet, und die anderen Stellschrauben.
- [Skills](./skills.md)
- [Memory](./memory.md)
