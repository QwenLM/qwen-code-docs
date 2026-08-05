# Overridable default-disabled skills

## Problem

`skills.disabled` ist eine Case-insensitive-Union über
Einstellungen-Scopes hinweg. Das macht sie zu einer harten Deny-Liste: Ein
Projekt kann keinen Skill aktivieren, der durch Benutzer- oder
Systemeinstellungen deaktiviert ist. Das ist für Policies korrekt, kann aber
keinen Skill darstellen, der ausgeschaltet starten und für Projekt-Opt-in
verfügbar bleiben soll.

## Einstellungen

Zwei Case-insensitive-Union-Listen hinzufügen, während `skills.disabled`
unverändert bleibt:

| Einstellung            | Bedeutung                                                              |
| ---------------------- | ---------------------------------------------------------------------- |
| `skills.disabled`      | Harte Deaktivierung. Gewinnt immer und bewahrt bestehende Sperren.     |
| `skills.defaultDisabled` | Deaktiviert, sofern nicht explizit aktiviert.                        |
| `skills.enabled`       | Explizites Opt-in; kann `skills.disabled` nicht überschreiben.         |

Effektive Deaktivierungen sind `disabled + (defaultDisabled - enabled)`. Eine
explizite `enabled`-Liste wird statt Ersetzungssemantik verwendet, damit das
Aktivieren eines geerbten Defaults keine unzusammenhängenden Defaults ersetzt.

## Runtime und Persistenz

Ein CLI-lokaler Resolver berechnet die effektiven deaktivierten Namen und ob
jeder deaktivierte Skill `hard` oder `default` ist. Bestehende
Runtime-Consumer lesen weiterhin das effektive Set über
`Config.getDisabledSkillNames()`; Core-Skill-Entdeckungs- und
-Ausführungs-APIs ändern sich nicht.

Der `/skills`-Picker und der Daemon-Toggle wenden dieselben Regeln an:

- Aktivieren entfernt eine Workspace-Hard-Deaktivierung und fügt den
  kanonischen Namen nur bei Bedarf zum Workspace-`skills.enabled` hinzu;
- Deaktivieren entfernt das Workspace-Opt-in und fügt den kanonischen Namen
  zum Workspace-`skills.disabled` hinzu;
- `skills.disabled`-Einträge höherer Scopes bleiben gesperrt;
- Unzusammenhängende und nicht verfügbare Skill-Einträge bleiben erhalten.

Der Workspace-Skill-Status erhält einen Deaktivierungsgrund und einen
optionalen Lock-Scope, sodass Clients eine harte Sperre von einem
überschreibbaren Default unterscheiden können. Die Daemon-lokalen und
ACP-Statuspfade lesen beide denselben CLI-lokalen Resolver.

## Umfang

- Durch diese Änderung wird kein Skill zu `defaultDisabled` hinzugefügt.
- `disable-model-invocation` und Managed-Skill-ACP-Operationen bleiben
  unverändert.
- Bestehende `skills.disabled`-Konfiguration bleibt kompatibel.
- Änderungen beschränken sich auf Einstellungen, die beiden bestehenden
  Toggle-Flächen, Workspace-Skill-Status, ihre Wire-Typen, Dokumentation und
  fokussierte Tests.
