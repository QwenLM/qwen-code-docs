# Multi-Agenten-Koordination

Qwen Code kann mehrere Teammitglieder mit der experimentellen Agent-Team-Runtime koordinieren. Teammitglieder erhalten separate Aufgaben, teilen eine Aufgabenliste, tauschen Nachrichten aus und erscheinen in den bestehenden Agent-View-Registerkarten. `/coordinate` setzt Untersuchungs-Worker standardmäßig auf einen erzwungenen Read-only-Tool-Satz und kann einen Writer in einem Leader-eigenen Git-Worktree platzieren.

## Agent Team aktivieren

Setze `experimental.agentTeam` in den Qwen Code-Einstellungen auf `true` und starte neu, oder starte Qwen Code mit `QWEN_CODE_ENABLE_AGENT_TEAM=1`.

## Eine koordinierte Aufgabe ausführen

Verwende den gebündelten Skill mit einem Ziel:

```text
/coordinate investigate the authentication regression and propose the smallest fix
```

Der Leader erstellt ein Team, weist bis zu drei unabhängige Workstreams zu und verwendet die bestehenden Team-Tools für Nachrichten und Aufgabenstatus. Teammitglieder-Konversationen und Genehmigungen bleiben über die bestehende Agent-View-UI sichtbar. Read-only-Teammitglieder können keine Shell-Befehle ausführen oder Dateien schreiben. Wenn eine Implementierung erforderlich ist, kann der Leader einen Git-Worktree erstellen und ein Writer-Teammitglied daran anheften; der Leader bleibt die einzige Merge-Autorität für den aktuellen Branch.

Wenn Agent Team deaktiviert ist, kann `/coordinate` weiterhin normale Foreground-Agenten für Read-only-Paralleluntersuchung verwenden. Dieser Fallback ist Delegation, kein zusammenarbeitendes Team: die Worker berichten nur an den Leader.

## Den richtigen Multi-Agenten-Modus wählen

| Modus                           | Einsatzbereich                                                | Kommunikation                      | Workspace-Verhalten                                         |
| ------------------------------- | ------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `/coordinate` mit Agent Team    | Verschiedene Workstreams, die zu einem Ergebnis beitragen     | Geteilte Aufgaben und Teammitglied-Nachrichten | Erzwungene Read-only-Worker; optionaler einzelner Worktree-Writer |
| Subagenten                      | Kleine delegierte Aufgaben                                    | Worker berichtet an Parent         | Abhängig vom gewählten Agenten                              |
| Arena                           | Mehrere Modelle, die um dieselbe Aufgabe konkurrieren         | Agenten arbeiten nicht zusammen    | Isolierte Worktrees; ein Gewinner wird ausgewählt           |
| Herdr                           | Koordinierung verschiedener CLI-Produkte oder Remote-Terminal-Sitzungen | Externe Terminal-Steuerung         | Außerhalb von Qwen Code verwaltet                           |

Der aktuelle Workflow verwendet bewusst die In-Prozess-Agent-Team-Runtime und Agent-View-UI wieder. Teammitglieder erben normalerweise das Session-Modell, obwohl eine Agent-Definition es überschreiben kann. Persistente unabhängige PTY-Sessions, herstellerübergreifende Worker und Remote-Attach sind separate Produktanliegen und werden von `/coordinate` nicht implementiert.
