# Workspace Skill Installation Paths

Datum: 2026-07-13

## Vertrag

Jeder Skill, der von `GET /workspace/skills` und `GET /workspaces/:workspace/skills` zurückgegeben wird, enthält `installedPath`, den bestehenden absoluten `SkillConfig.filePath`, der auf seine `SKILL.md`-Datei zeigt. Der Wert wird unverändert wie gespeichert kopiert; die Statusschicht löst keine Symlinks auf und kanonisiert ihn nicht erneut.

## Kompatibilität

Dies ist ein additives v1-Feld. Der aktuelle Daemon emittiert es immer, während die ACP-Bridge und die öffentlichen Statustypen des TypeScript-SDK es optional halten, damit Clients mit älteren Daemons kompatibel bleiben. Protokollversion und Capability-Liste ändern sich nicht.

## Datenfluss

`SkillManager.listSkills()` liefert `SkillConfig`-Datensätze. Die geteilte Funktion `mapSkillConfigToStatus()` kopiert `filePath` nach `installedPath`. Sowohl der Live-ACP-Snapshot als auch der daemon-lokale Fallback verwenden diesen Mapper, sodass Projekt-, Benutzer-, Bundled-, Extension-, Inactive-Extension- und deaktivierte Skills dieselbe Form haben. Der Workspace-Status-Service leitet dieses geteilte Ergebnis an beide Routenformen weiter.

## Redaction-Grenze

Der Status-Mapper bleibt eine explizite Metadaten-Allowlist. Er legt den Installations-Dateipfad offen, aber nicht den Skill-Body, Hooks, `skillRoot` oder irgendeine andere Skill-Konfiguration. Diese Änderung fügt kein UI-Verhalten hinzu.
