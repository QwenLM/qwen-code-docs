# Hintergrund-npm-Updates

## Problem

Die publizierte CLI ist in inhaltsgehashte JavaScript-Chunks aufgeteilt.
`npm install -g` aus einer aktiven Session heraus ersetzt diese Chunks an
Ort und Stelle, sodass ein späterer dynamischer Import im alten Prozess mit
`ERR_MODULE_NOT_FOUND` fehlschlagen kann. Die Installation bis zum
Session-Exit aufzuschieben vermeidet Beschädigung, macht aus einem
Hintergrund-Update aber eine Exit-Zeit-Verzögerung und bringt Nutzern keinen
Vorteil, bevor sie die Session verlassen.

## Design

Für schreibbare globale npm-Installationen installiert der Update-Check nach
dem Rendern die exakt aufgelöste Version unter einem Verzeichnis, das vom
globalen Launcher abgeleitet ist:

```text
~/.qwen/updates/npm/<launcher-id>/versions/<version>/
```

Der Versions-Check führt npm in seinem globalen Kontext aus, und die
gestagte Installation verwendet einen isolierten Präfix. Der gestagte Befehl
bewahrt explizit die originale globale npm-Konfiguration, sodass das Ändern
des Präfix zwischen Entdeckung und Installation weder Registry noch
Authentifizierungseinstellungen umschaltet.

Der Launcher löst `QWEN_HOME` aus denselben Home-scoped `.env`-Dateien auf,
bevor er eine Version wählt. Dies hält den Bootstrap-Pfad mit dem
CLI-Storage abgeglichen, auch wenn der vollständige Umgebungs-Loader später
läuft.

Installation und Aktivierung laufen in einem abgelösten Worker, sodass das
Beenden der TUI ein bereits laufendes Update nicht unterbricht. Nachdem npm
erfolgreich exitet, verifiziert der Worker Paketname, Version, Bundle und
Launcher und schreibt dann atomar einen `active.json`-Zeiger neben die
Versionen dieses Launchers. Das globale npm-Paket wird nicht verändert. Der
bereits laufende Prozess und alle Kind-Befehle, die er startet, bleiben an
ihren ursprünglichen Build gepinnt. Beim nächsten Aufruf liest der stabile
Launcher den Zeiger und startet das verifizierte Versionsverzeichnis.

Jeder globale npm-Launcher hat seinen eigenen Zeiger und eigene
Versions-Payloads, sodass Installationen unter unterschiedlichen npm- oder
nvm-Präfixen `~/.qwen` teilen können, ohne einander zu überschreiben oder
Abhängigkeiten zu teilen. Ein langsameres paralleles Update kann eine neuere
aktive Version nicht ersetzen.

Eine unvollständige Installation ändert niemals den aktiven Zeiger. Vor der
Aktivierung validiert der Worker das installierte Manifest und führt einen
Launcher-Smoke-Test aus. Ein fehlender, missgebildeter oder nicht zum
Launcher passender Zeiger wird ignoriert, und das originale npm-Paket bleibt
der Fallback. Der Zeiger zeichnet außerdem Basis-Paket und
Launcher-Identität auf, sodass eine spätere explizite globale
npm-Installation die gemanagte Version ersetzt. Da der Launcher durch
gemanagte Updates nicht ersetzt wird, sind bestehende `active.json`-Felder
ein Kompatibilitätsvertrag: zukünftige Änderungen dürfen Felder hinzufügen,
aber keine entfernen oder neu interpretieren.

Versionsverzeichnisse werden behalten, da eine ältere Live-Session noch aus
ihnen laden kann. Cleanup ist bewusst zurückgestellt, bis die
Festplattennutzung zeigt, dass ein Lease-basierter Collector nötig ist.

## Scope

Dies ändert automatische Updates nur für npm-Installationen. Andere
Paketmanager und eigenständige Archive behalten das bestehende
Exit-sichere Verhalten, bis sie ein gleichwertiges
Immutable-Version-Installationslayout haben.
