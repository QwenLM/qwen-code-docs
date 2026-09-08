# Output-Styles

Output-Styles ändern, wie Qwen Code seine Antworten formuliert — den Tonfall, den Umfang der Erläuterungen, wie viel es erklärt — ohne seine Fähigkeiten zu verändern. Ein Style ist ein benannter Block von Anweisungen, der auf das eingebaute System-Prompt gelegt wird, und das Modell wird in jedem Turn an den aktiven Style erinnert, damit er über lange Sessions hinweg bestehen bleibt.

## Eingebaute Styles

| Style             | Funktion                                                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **default**       | Kein zusätzlicher Style — das Standard-Prompt.                                                                                                                                                                                |
| **Concise**       | Antworten zuerst, ohne Einleitung, Erzählung oder abschließende Zusammenfassung. Die Arbeit bleibt genauso gründlich; Fehlerberichte und Sicherheitsbestätigungen behalten ihren vollen Inhalt.                                |
| **Proactive**     | Beginnt sofort mit der Arbeit und zieht bei risikoarmen Entscheidungen eine begründete Annahme einer Frage vor. Ändert nichts an den erlaubten Aktionen: Genehmigungsmodus und Bestätigungsregeln gelten weiterhin uneingeschränkt. |
| **Explanatory**   | Fügt kurze lehrreiche „Insight"-Hinweise zum Codebase und zu den Implementierungsentscheidungen neben der Arbeit hinzu.                                                                                                       |
| **Learning**      | Kollaboratives Lernen durch Tun: Gibt dir kleine, sinnvolle Code-Stücke zum Schreiben (markiert mit `TODO(human)`), und wartet dann. Wird in Headless-Läufen übersprungen, da diese nicht warten können.                     |

## Einen Style wählen

Führe `/output-style` aus, um einen Picker zu öffnen, oder setze einen Style direkt:

```
/output-style Concise
/output-style default   # zurück zu keinem Style
```

Die Änderung wirkt sofort auf die laufende Session — das System-Prompt wird an Ort und Stelle neu aufgebaut, sodass der nächste Turn bereits im neuen Style antwortet — und sie wird für zukünftige Sessions gespeichert. Wenn eine vertrauenswürdige Projekt-Einstellung derzeit `general.outputStyle` besitzt, aktualisiert der Befehl diese Projekt-Einstellung; andernfalls aktualisiert er deine Benutzer-Einstellung. Style-Namen sind case-insensitiv.

Du kannst den Style auch ohne den Befehl setzen:

- **Einstellungen**: `"general": { "outputStyle": "Concise" }` in `settings.json` (Benutzer- oder Projekt-Scope). Der Wert ist ein eingebauter oder [benutzerdefinierter](#benutzerdefinierte-styles) Style-Name. Eine manuelle Bearbeitung wirkt beim nächsten Start.
- **Ein einzelner Run**: `qwen -p "..." --output-style Concise` überschreibt die Einstellung für diesen Run. Siehe [Headless Mode](./headless).

## Benutzerdefinierte Styles

Ein benutzerdefinierter Style ist eine Markdown-Datei, deren Inhalt die Anweisungen des Styles bildet. Lege sie in eines von zwei Verzeichnissen:

| Ort                                  | Scope                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| `~/.qwen/output-styles/<name>.md`    | Deine Styles, verfügbar in jedem Projekt                     |
| `<project>/.qwen/output-styles/*.md` | Die Styles des Projekts, nur gelesen wenn der Workspace vertrauenswürdig ist |

Die Vertrauenswürdigkeit wird jedes Mal geprüft, wenn der Style verwendet wird, nicht nur beim Lesen der Datei, sodass ein Entzug der Vertrauenswürdigkeit mitten in der Session verhindert, dass ein Projekt-Style die Konversation beeinflusst.

```markdown
---
name: Reviewer
description: Reviews code and reports findings without editing anything
keep-coding-instructions: false
---

You are reviewing, not implementing. Read the code the user points you at, list concrete findings ordered by severity, and never edit files unless the user asks for a fix.
```

Das Frontmatter ist optional. Jedes Feld hat einen Standardwert:

- `name` — der Name des Styles, verwendet mit `/output-style <name>` und in `general.outputStyle`. Standardmäßig der Dateiname ohne `.md`. `default` ist reserviert.
- `description` — die einzeilige Zusammenfassung, die im Picker angezeigt wird. Standardmäßig die erste Zeile des Inhalts.
- `keep-coding-instructions` — `true` behält die eingebaute Anleitung zum Software-Engineering-Workflow im Prompt neben deinem Style; `false` entfernt diesen einen Abschnitt, für einen Style, dessen Arbeit nicht das Coden ist. Eine Datei, die nichts angibt, erbt den Wert des eingebauten Styles, den sie überschreibt, sodass das Umschreiben von `concise.md` die Formulierung ändert, ohne diese Anleitung zu entfernen; eine Datei ohne eingebautes Gegenstück hat standardmäßig `false`. Alles andere im eingebauten Prompt — Identität, Sicherheitsregeln, Tool-Anleitung — bleibt unter jedem Style in Kraft.

Benutzerdefinierte Styles erscheinen nach den eingebauten im `/output-style`-Picker, gekennzeichnet mit ihrer Quelle, und werden jedes Mal neu gelesen, wenn der Picker geöffnet oder ein Name angegeben wird, sodass eine neue Datei keinen Neustart erfordert. Namen werden case-insensitiv verglichen und müssen eindeutig sein: Ein Projekt-Style überschreibt einen Benutzer-Style gleichen Namens, und beide überschreiben einen eingebauten Style dieses Namens. Eine Datei, die nicht geladen werden kann, wird übersprungen und im Debug-Log gemeldet, während die anderen Dateien weiterhin geladen werden — ein leerer Inhalt, ein ungültiger Name, eine Datei größer als 25 kB (ein Style ist ein Prompt, kein Dokument), eine, die kein UTF-8-Text ist, oder eine, deren gesamter Inhalt ein HTML-Kommentar ist. HTML-Kommentare werden aus dem Inhalt entfernt, sodass eine Notiz an deine Teamkollegen nicht an das Modell gesendet wird.

Eine Style-Datei darf nur sich selbst lesen: Eine Projekt-Datei, die ein Symlink ist, wird übersprungen; eine Benutzer-Datei darf ein Symlink in dein eigenes Home sein (ein Dotfiles-Setup), aber nicht nach außerhalb, und ein Hard Link wird auf beiden Ebenen abgelehnt.

Benutzerdefinierte Styles werden in `--bare` und `--safe-mode` ignoriert, die nur die eingebauten behalten.

## Scope und Interaktionen

- Ein Style wird auf das eingebaute Prompt gelegt. Wenn `--system-prompt` oder `QWEN_SYSTEM_MD` das Prompt vollständig ersetzt, wird der Style (und seine Turn-für-Turn-Erinnerung) nicht angewendet.
- Styles gelten nur für die Hauptkonversation. Subagenten führen ihre eigenen System-Prompts aus, und ein Arena-Peer erbt nur dann den Style der Session, wenn dieser Style die Coding-Anleitungen behält — ein Peer wird an dem Diff beurteilt, das er erzeugt, daher läuft er niemals ohne die Software-Engineering-Anleitung.
- `--bare` und `--safe-mode` ignorieren die Einstellung und erlauben keine `/output-style`-Änderungen.
- Das Ändern des Styles mitten in der Session invalidiert den gecachten Prompt-Präfix einmalig; danach funktioniert das Caching wie gewohnt.

Styles passen Tonfall und Workflow an, nicht Wissen oder Berechtigungen. Für Projekt-Konventionen, die das Modell immer wissen soll, verwende Kontext-Dateien (`QWEN.md`); für eine einmalige Ergänzung des Prompts verwende `--append-system-prompt`.