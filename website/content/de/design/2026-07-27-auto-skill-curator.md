# Auto-Skill-Curator

## Problem

Qwen Code kann wiederverwendbare Projekt-Skills aus Tool-lastigen
Konversationen extrahieren, aber akzeptierte Auto-Skills sammeln sich nur an.
Der bestehende Review-Agent kann `source: auto-skill`-Skills erstellen oder
aktualisieren und darf sie ausdrücklich nicht löschen. Pfad-Gating und
`skills.disabled` reduzieren Prompt-Noise, pflegen aber nicht die
On-Disk-Bibliothek.

## Scope

Füge einen kleinen, deterministischen Lifecycle-Manager für
Projekt-Auto-Skills hinzu:

- Verfolge erfolgreiche Aufrufe von Projekt-Skills, deren Verzeichnis mit
  `auto-skill-` beginnt und deren Frontmatter `source: auto-skill` enthält.
- Markiere einen verwalteten Skill nach 30 Tagen ohne Aktivität als stale.
- Archiviere ihn nach 90 Tagen ohne Aktivität, indem sein gesamtes
  Verzeichnis aus `.qwen/skills/` nach `.qwen/archived-skills/` verschoben
  wird.
- Erlaube, einzelne verwaltete Skills vor automatischen Übergängen zu pinnen.
- Führe den deterministischen Durchlauf höchstens einmal alle 7 Tage während
  der Konfigurations-Initialisierung aus, wenn Auto Skill aktiviert und der
  Workspace vertrauenswürdig ist.
- Stelle `/curator`, `/curator status`, `/curator run [--dry-run]` und
  `/curator pin|unpin|restore <verzeichnis>` in den interaktiven,
  nicht-interaktiven und ACP-Befehlsflächen bereit.

Diese erste Version nutzt kein LLM, fasst keine überlappenden Skills zusammen,
verwaltet keine persönlichen/bundled/Extension-/gelernten/handgeschriebenen
Skills, löscht nichts endgültig und führt keine konfigurierbaren Schwellwerte
ein.

## Ownership und Persistenz

Der Curator wird ausschließlich aus `Config.getProjectRoot()` aufgelöst. Sein
Zustand liegt unter `<projekt>/.qwen/skill-curator.json`, archivierte Pakete
unter `<projekt>/.qwen/archived-skills/`. Es gibt keinen Fallback auf den
primären Workspace des Prozesses, das Home-Verzeichnis oder eine andere aktive
Session. Das hält Daemon- und Multi-Workspace-Sessions isoliert.

Der Zustand ist über den Auto-Skill-Verzeichnisnamen keyed, da dies die
Einheit ist, die in das Archiv und aus ihm heraus verschoben wird. Jeder
Datensatz speichert den Frontmatter-Skill-Namen, den First-Seen-Zeitpunkt,
die letzte erfolgreiche Nutzung, die Nutzungszahl, den Lifecycle-Zustand, den
Pin-Zustand und die optionale Archivierungszeit. Schreibvorgänge werden mit
einem Cross-Process-Lock serialisiert und atomar committet.

Korrupter Zustand ist ein harter, nicht mutierender Fehler. Der Curator darf
aus fehlender Nutzung keine Inaktivität ableiten, wenn seine persistierten
Belege nicht lesbar sind.

## Qualifikation und Sicherheit

Ein Verzeichnis wird nur dann vom Curator verwaltet, wenn jede Bedingung
erfüllt ist:

1. Es ist ein direktes, nicht per Symlink eingebundenes Verzeichnis unterhalb
   der Projekt-Skills-Root.
2. Sein Name beginnt mit `auto-skill-`.
3. Es enthält eine reguläre, nicht per Symlink eingebundene `SKILL.md`.
4. Das einleitende YAML-Frontmatter enthält exakt `source: auto-skill`.

Dieser doppelte Marker verhindert, dass der Curator handgeschriebene,
gelernte, Extension-, bundled-, persönliche, fehlerhafte oder per Symlink
eingebundene Inhalte verschiebt. Archivierung und Wiederherstellung
überschreiben nie einen bestehenden Skill. Bei einer Zielkollision wird nur
dieses Paket übersprungen, damit unbeteiligte Pflege weiterlaufen kann.
Archivierte Verzeichnisnamen werden im Review-Prompt als reserviert angezeigt
und von dessen Schreib-Berechtigungs-Guard abgelehnt, während das
Bestätigungs-Staging weiterhin nur aktive Skills snapshotet. Schlägt die
Zustandspersistenz nach Verschiebungen fehl, versucht der Durchlauf, jedes
Paket zurückzuverschieben, bevor der Fehler angezeigt wird.

Read-only-Status- und Dry-Run-Vorschauen bleiben im Safe Mode und in nicht
vertrauenswürdigen Workspaces verfügbar. Das Anwenden eines
Pflege-Durchlaufs, Pinnen, Entpinnen und Wiederherstellen erfordern einen
vertrauenswürdigen Workspace außerhalb des Safe Mode.

## Aktivität und Übergänge

Ein erfolgreicher Skill-Tool- oder direkter Skill-Slash-Befehl-Aufruf
aktualisiert einen qualifizierten Auto-Skill-Datensatz best-effort, auch wenn
die automatische Skill-Generierung deaktiviert ist. Das hält die beobachtete
Aktivität unabhängig von dem Schalter, der Generierung und geplante Pflege
steuert. Fehlgeschlagene, skill-deaktivierte oder Hook-blockierte Aufrufe
zählen nicht.

Für einen Live-Skill ist Aktivität der neueste Wert aus:

- der persistierten letzten erfolgreichen Aufrufzeit;
- der persistierten First-Seen-Zeit;
- der persistierten Wiederherstellungszeit; und
- der Änderungszeit des Skill-Manifests.

Die Änderungszeit einzubeziehen verhindert, dass ein kürzlich verbesserter
Skill nur deshalb archiviert wird, weil er noch nicht erneut aufgerufen wurde.

Die erste Beobachtung jedes qualifizierten Skills setzt
`firstSeenAt = now`, statt aus einem alten Dateisystem-Timestamp Inaktivität
abzuleiten. Die erste automatische Beobachtung setzt auch `lastRunAt` und
wartet dann ein volles 7-Tage-Intervall. Ein explizites `/curator run`
umgeht das Intervall, bewahrt aber die Pro-Skill-First-Sight-Kulanz;
`--dry-run` meldet dieselben Seeding- und Übergangskandidaten, ohne
Verzeichnisse zu verschieben oder Zustand zu ändern. Gepinnte Datensätze
umgehen Stale- und Archivierungsübergänge, bis sie explizit entpinnt werden.

## Integrationspunkte

- `Config.initialize`: führt den fälligen deterministischen Durchlauf aus,
  bevor `SkillManager` das Dateisystem scannt.
- `SkillTool`: zeichnet einen erfolgreichen Aufruf eines verwalteten Skills
  auf.
- `SkillCommandLoader` und die interaktiven/nicht-interaktiven
  Befehlsprozessoren: zeichnen erfolgreiche direkte Slash-Befehl-Aufrufe auf;
  ACP verwendet den nicht-interaktiven Prozessor wieder.
- `SkillManager`: sein bestehender Refresh-Pfad wird nach manueller
  Archivierung oder Wiederherstellung genutzt, damit Modell- und
  Slash-Befehl-Flächen sofort der Festplatte entsprechen.
- `BuiltinCommandLoader`: publiziert den neuen `/curator`-Befehl.

Kein anderer Consumer sollte Curator-Zustand schreiben oder verwaltete
Skill-Pakete verschieben.

## Verifizierung

Unit-Tests decken Qualifikation, First-Run-Seeding, Stale-/Archiv-Schwellwerte,
Dry-Run-Nicht-Mutation, Schutz bei kürzlicher Nutzung, Schutz bei kürzlicher
Änderung, Fail-Closed-Verhalten bei korruptem Zustand, Kollisionsbehandlung,
Wiederherstellung und die Befehlsfläche ab. Bestehende Skill-Tool-Tests
verifizieren, dass nur erfolgreiche Ladungen Nutzung aufzeichnen. Build und
Typecheck decken den paketübergreifenden Export und die Befehlsregistrierung
ab.
