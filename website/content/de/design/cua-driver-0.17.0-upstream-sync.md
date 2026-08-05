# CUA Driver 0.17.0 Upstream-Sync

## Ziel

Den vendorten CUA-Driver-Quellcode vom Upstream `cua-driver-rs-v0.7.0` auf den veröffentlichten Tag `cua-driver-rs-v0.17.0` bringen und dabei den Qwen-spezifischen Runtime- und Distributionsvertrag erhalten.

Der Release-Tag, Commit `10279552e2bbe479e367a082f78b1b98ee85a697`, ist die Source of Truth. Der lokale Checkout `/Users/mochi/code/cua`, alte Design-Notizen und generierte Artefakte sind nur Vergleichseingaben.

## Scope

Der Upstream-Import ist auf `trycua/cua:libs/cua-driver` beschränkt und wird auf `packages/cua-driver` gemappt. Upstream-Monorepo-Workflows, Root-Skripte, Dokumentation und fremde Libraries werden nicht automatisch importiert. Jede neue Abhängigkeit von diesen Dateien muss entweder paket-lokal gemacht oder explizit auf eine bestehende Qwen-Code-Einrichtung gemappt werden.

Der Qwen-eigene Release-Workflow bleibt `.github/workflows/cd-cua-driver.yml`. Er darf die minimalen Änderungen erhalten, die der neue Driver-Build- und Release-Vertrag erfordert, muss aber weiterhin Qwen-eigene Artefakte veröffentlichen.

## Erforderliche Qwen-Deltas

Der Sync ist unvollständig, solange nicht alle diese Punkte wirksam bleiben:

1. Das installierte Executable, der Prozess, das App-Bundle, der Bundle-Identifier, Pfade, geplante Dienste, Dokumentation und Release-Assets nutzen die Qwen-eigene Identität, die von der aktuellen Qwen-Release-Linie erwartet wird. Das Release-Zustands-Home bleibt für Upgrade-Kompatibilität `~/.cua-driver`; das isolierte Local-Build-Home bleibt `~/.qwen-cua-driver-local`.
2. `CUA_DRIVER_RS_COORDINATE_SPACE=1` liefert weiterhin den Opt-in-0-1000-Koordinatenvertrag an der geteilten Aufrufgrenze. Er muss jedes neue Koordinaten-tragende Desktop- und Browser-nahe Tool abdecken oder fail-closen.
3. `MCP_MODEL_PAYLOAD_FILTER=1` filtert weiterhin Modell-sichtbares Branding sowohl in MCP-Text-Content als auch in strukturiertem Content, ohne binäre Medien zu verändern.
4. Das immer noch nicht gemergte Verhalten für Windows-Top-Level-Fenster mit leerem/null-Titel aus trycua/cua#2021 bleibt vorhanden und wird an das aktuelle Window-Modell angepasst.
5. Der EAGAIN-Socket-Write-Patch aus trycua/cua#2036 wird aus dem lokalen Patch-Inventar zurückgezogen, weil er Teil der 0.17.0-Basis ist.

## Upstream-Vertragsänderungen

Der Import umfasst die SDK-eigene Runtime, die Python- und TypeScript-UniFFI-SDKs, typisierte Browser-Automation, Runtime-Permission-Modes, Pro-Session-Capture-Scope, Snapshot-gebundene Element-Token, den geschlossenen `ActionResult`-Vertrag, `verify_state`, Native-Menu-Aufrufe, Clipboard-Tools, Window-Framing und semantische Cursor-Themes.

Das sind Architekturersetzungen und keine unabhängigen Leaf-Features. Die Qwen-Koordinaten- und Payload-Transformationen müssen an der kanonischen SDK/Tool-Grenze neu angebracht werden, damit CLI, MCP, direktes SDK, Private Worker und Daemon-Ausführung nicht auseinanderlaufen können.

## Importstrategie

1. Das vom Repository unterstützte Upstream-Delta-Skript vom aktuellen `.vendored-from`-Ref auf `cua-driver-rs-v0.17.0` ausführen.
2. Jeden Reject, jede Löschung, neu generierte Datei, Root-relativen Pfad, Paket-Identität, Release-Version und externe Build-Abhängigkeit inventarisieren.
3. Upstream/Lokale Überlappungen auflösen, indem die Upstream-Architektur erhalten und jedes Qwen-Delta an seiner neuen kanonischen Grenze neu ausgedrückt wird.
4. `.vendored-from`, `.vendored-patches.md`, Versionsreferenzen, Qwen-Installer und den Qwen-Release-Workflow gemeinsam aktualisieren.
5. Quellen, Tests, Dokumentation, generierte Bindings, Installer, Bundle-Metadaten, Prozessnamen, Dienstnamen und Release-Archive auf Identitätskonsistenz auditieren.

## Verifikation

Die Verifikation ist geschichtet, damit ein grüner schmaler Unit-Test keine kaputte Distribution oder Trust-Grenze verbergen kann:

- Rust-Formatierung, Paket-Checks, Core/Contract/SDK-Unit-Tests und generierte Vertragskonsistenz.
- Fokussierte Koordinaten-Normalisierungs-, Payload-Filter-, Windows-Window-Enumerations-, Installer- und Versions-Tests.
- Python- und TypeScript-SDK-Generierungs-/Paket-Checks, wenn ihre paket-lokale Toolchain verfügbar ist.
- Statische Checks des Qwen-Release-Workflows auf Executable-Namen, App-Bundle-Layout, Bundle-Identifier, Assets und eingebrannte Versionen.
- `npm run build && npm run typecheck` für das umgebende Repository.
- Vollständiger Diff- und Untracked-File-Audit, wiederholt, bis zwei aufeinanderfolgende Durchläufe sauber sind.

Signierte/notarisierte Release-Produktion und physische Windows/Linux/macOS-GUI-Zertifizierung liegen außerhalb der lokalen Verifikation und müssen explizite Release-Gates bleiben.
