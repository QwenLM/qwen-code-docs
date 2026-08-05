# Certified-Session-Writer-Handoff

## Problem

Der kooperative verwaltete Shutdown gibt aktuell jedes Session-Writer-Lock frei, bevor das ACP-Kind exited. Das fixt den normalen Ersetzungspfad, aber es kann einen Writer, der das Aufzeichnen bewusst gestoppt hat, nicht von einem Fremd-Host-Writer unterscheiden, der verschwunden ist, ohne sein aktives Lock freizugeben. Hostname, PID-Sichtbarkeit, Lock-Alter oder Transkript-Inaktivität als Todesbeweis zu behandeln, würde zwei lebenden Pods erlauben, an dasselbe Transkript anzuhängen.

## Scope

Diese Änderung fügt einen integritätsgeschützten Handoff-Zustand für verwaltete ACP-Writer hinzu. Nach dem Schließen der Admission und dem durable Drainen akzeptierter Recorder-Arbeit kann ein vertrauenswürdiges verwaltetes Kind sein aktives Lock durch einen versiegelten Record ersetzen. Ein vertrauenswürdiger verwalteter Ersatz kann Ownership nur übernehmen, nachdem er diesen Record gegen das exakte Transkript validiert hat, das von der neuen Config angefordert wird.

Transkript-Pfade müssen abwesend sein oder zu derselben regulären Datei auflösen, die für den Beweis geöffnet wurde. Ein toter Symlink wird nicht als abwesendes Transkript behandelt.

Das Protokoll bleibt gegatet durch `experimental.sessionWriterLease`, was standardmäßig deaktiviert ist und beim ACP-Prozess-Start gesnapshotet wird. Standalone-ACP-, interaktive und Headless-Recorder erhalten keine zertifizierte Übernahme. Normales Pro-Session-Close gibt sein Lock weiterhin frei, statt einen versiegelten Record zu hinterlassen.

Diese Änderung reklamiert kein aktives Lock zurück, das von SIGKILL, einem Event-Loop-Stall, einem unbehandelten Crash oder einem Storage-Fehler hinterlassen wurde, bevor das Versiegeln abgeschlossen ist. Sie fügt keine TTLs, Heartbeats, Hostname-Stealing, Kubernetes-API-Lookups, Operator-Force-Steal-Endpoints, Maintenance-Leases oder Mixed-Version-Unterstützung hinzu. Diese Active-Lock-Fälle erfordern weiterhin eine autoritative externe Writer-Fence und explizite Wiederherstellung.

## Lock-Records

Neue Owner schreiben Schema-v2-Records. Ein aktiver Record behält die bestehenden unveränderlichen Owner-Diagnosen und fügt hinzu:

```json
{
  "schema_version": 2,
  "state": "active"
}
```

Ein versiegelter Record behält die Diagnosen des vorherigen Owners und fügt hinzu:

```json
{
  "schema_version": 2,
  "state": "sealed",
  "sealed_at": "2026-07-28T00:00:00.000Z",
  "transcript": {
    "relative_path": "<runtime-relative transcript key>",
    "exists": true,
    "byte_length": 1234,
    "sha256": "<lowercase hex digest>"
  }
}
```

Der relative Schlüssel muss zu dem Transkript-Pfad auflösen, der bereits von der neuen Config geliefert wird. Er wird nie genutzt, um einen beliebigen Dateisystempfad auszuwählen. Schema-v1-Records bleiben für Kompatibilität während eines Rollbacks gültige aktive Records, aber sie können nie als versiegelt interpretiert werden.

## Fixierter Claim

Der fixierte Claim-Pfad ist:

```text
<primary lock path>.claim
```

Er serialisiert die zwei Übergänge, die den primären Pfad temporär entfernen: active-to-sealed und sealed-to-active. Der Claim wird mit dem bestehenden Write-Sync-und-Hard-Link-Primitiv erzeugt. Mehrdeutige Link-Fehler werden gegen die exakten Claim-Bytes abgeglichen, bevor der Übergang fortsetzt oder aufräumt. Ein Claim wird nie per PID, Hostname oder Alter reklamiert. Jeder bereits vorhandene Claim liefert `session_writer_unavailable` zurück; manuelles Cleanup ist nur nach einer autoritativen externen Writer-Fence erlaubt.

Gewöhnliche Akquise prüft den Claim vor jedem Versuch, ein fehlendes primäres Lock zu installieren. Sie prüft erneut nach der Installation und entfernt nur ihren eigenen exakten Kandidaten, wenn ein gleichzeitiger Übergang den Claim erworben hat. Das erhält den aktuellen Active-Lock-Fast-Path und die lokale Stale-Owner-Wiederherstellung, während beide Pfade einen Handoff-Übergang respektieren. Mixed-Version-Writer bleiben nicht unterstützt, weil ein älterer Writer den fixierten Claim nicht kennt.

Ein Erwerber kann seinen ersten Claim-Check unmittelbar bestehen, bevor ein Übergang den Claim erzeugt, und dann seinen aktiven Kandidaten während der Primärpfad-Lücke des Übergangs installieren. Der Übergang erkennt denselben Session-Schema-v2-Aktiv-Record als Claim-bewussten Kandidaten, bewahrt den zurückgezogenen Vorgänger auf und wartet darauf, dass der verpflichtende zweite Check des Kandidaten ihn entfernt, bevor er den Hard-Link erneut versucht. Dieses Warten ist begrenzt; wenn der Kandidat vor seinem zweiten Check stockt oder exited, fehlschlägt der Übergang als unavailable, während er seinen Claim und den zurückgezogenen Vorgänger behält. Unbekannte, fehlerhafte oder Cross-Session-Nachfolger werden nie entfernt oder überschrieben.

## Versiegelung

Verwalteter Shutdown stoppt synchron die Session- und Recorder-Admission und startet dann alle Writer-Terminals parallel. Ein Writer-Terminal:

1. drained jede Recorder-Operation, die vor dem Cutoff akzeptiert wurde;
2. öffnet das erwartete Transkript, ohne einem Symlink zu folgen, verifiziert den bestehenden Owner und den Transkript-Snapshot und hasht die Bytes durch diesen offen gehaltenen Dateideskriptor;
3. schreibt und synct einen Owner-eindeutigen versiegelten Kandidaten;
4. erwirbt den fixierten Claim und revalidiert den aktiven Owner plus die Identität und Metadaten des offen gehaltenen Transkripts;
5. benennt das exakte aktive Primär-Lock in einen Owner-eindeutigen zurückgezogenen Pfad um;
6. hard-linkt den versiegelten Kandidaten in den nun fehlenden primären Pfad ohne Ersetzung; und
7. entfernt nur seine exakten zurückgezogenen Records, Kandidaten und Claim-Records.

Der Primärpfad-Übergang ist für kooperierende Writer logisch atomar, weil jede Installation den fixierten Claim respektiert und der finale Hard-Link kein Lock überschreiben kann, das von einem anderen Prozess erzeugt wurde. Ein Fehler nach Wirkung wird aus exakten Record-Bytes abgeglichen. Der alte Owner löscht oder überschreibt nie ein unbekanntes Primär-Lock.

Ein verwalteter Flush- oder Beweis-Fehler behält das aktive Lock. Normales Pro-Session-Close bewahrt das bestehende Freigabeverhalten einschließlich Exakter-Owner-Cleanup. Wenn eine normale Freigabe mit dem verwalteten Shutdown raced und zuerst committed, ist das fehlende Primär-Lock bereits ein sicherer Handoff und der Ersatz führt gewöhnliche Akquise aus.

Fehler-Cleanup entfernt den fixierten Claim erst, nachdem bewiesen ist, dass das exakte Prä-Übergangs-Primär-Lock wiederhergestellt wurde. Wenn ein Rollback diesen Record nicht wiederherstellen oder verifizieren kann, bleibt der Claim bestehen, selbst wenn ein anderes Primär-Lock erscheint, denn dieser Pfad kann ein verlierender gewöhnlicher Akquise-Kandidat sein, der sich selbst entfernt, nachdem er den Claim beobachtet hat. Der Rollback selbst wird nur versucht, solange der fixierte Claim noch den exakten Record dieses Übergangs enthält; ein fehlender oder ersetzter Claim bedeutet, dass das aktuelle Primär-Lock nicht geändert werden darf. Wiederherstellung erfordert dann dieselbe autoritative externe Writer-Fence wie jeder andere verbleibende Claim.

Fehler vor Beginn des Primär-Übergangs sind anders: Der Anwärter hat keine Primärpfad-Lücke erzeugt oder den Vorgänger verschoben, daher gibt er nur seinen eigenen exakten Claim frei, selbst wenn ein anderer zertifizierter Konkurrent das beobachtete versiegelte Primär-Lock bereits ersetzt hat. Das verhindert, dass ein verspäteter verlierender Konkurrent einen Claim stranden lässt, nachdem der Gewinner aktiv wurde.

## Zertifizierte Übernahme

Nur eine Config, die unter einem vertrauenswürdigen verwalteten Elternprozess erzeugt wurde, aktiviert die zertifizierte Übernahme. Wenn die Akquise einen versiegelten Record beobachtet:

1. verifiziert sie, dass der relative Schlüssel des Records zum erwarteten Transkript der Config passt;
2. öffnet und hasht sie dieses Transkript außerhalb des fixierten Claims und behält den Dateideskriptor und seine Identität;
3. erwirbt sie den fixierten Claim;
4. liest sie das exakte versiegelte Primär-Lock erneut und revalidiert den offen gehaltenen Deskriptor, Pfadidentität, Metadaten, Byte-Länge und Digest;
5. benennt sie das versiegelte Primär-Lock in einen Kandidaten-eindeutigen zurückgezogenen Pfad um;
6. hard-linkt sie den gesyncten aktiven Kandidaten vom Claim in den primären Pfad ohne Ersetzung; und
7. entfernt sie nur den exakten zurückgezogenen Record und ihren eigenen Claim.

Das Lease führt dann den bestehenden autoritativen Session-Reload und die Transkript-Fence vor der Recorder-Aktivierung aus. Zwei Ersatz-Instanzen, die um denselben versiegelten Record racen, können höchstens einen aktiven Owner erzeugen. Ein Verlierer erhält ein Conflict- oder Unavailable-Ergebnis, je nachdem, ob er das aktive Primär-Lock des Gewinners oder einen laufenden/verbleibenden Claim beobachtet.

## Fehlervertrag

| Bedingung                                                                                     | Ergebnis                           |
| --------------------------------------------------------------------------------------------- | ---------------------------------- |
| Gültiger aktiver Owner, einschließlich Fremd-Host- oder verwaltetem Dead-PID-Record           | `session_writer_conflict` / 409    |
| Versiegelter Beweis passt nicht zum erwarteten Transkript                                     | `session_transcript_changed` / 409 |
| Fehlerhafter Record, nicht-regulärer Pfad, verbleibender Claim oder unsicheres Dateisystemergebnis | `session_writer_unavailable` / 503 |
| Aktueller Writer besitzt seinen exakten aktiven Record nicht mehr                             | `session_writer_lost` / 409        |

Öffentliche Fehler bleiben sanitisiert. Erfolgreiche Versiegelungs- und Übernahmelogs enthalten die Session-ID, den vorherigen Hostnamen/PID und die Versiegelungszeit, aber nie den Owner-Token oder Transkript-Pfad.

## Kompatibilität und Rollout

Das Feature-Gate muss während eines Mixed-Version-Rollouts deaktiviert bleiben. Das Aktivieren oder Deaktivieren erfordert das Drainen alter ACP-Prozesse. Ein Schema-v2-Reader akzeptiert weiterhin Schema-v1-Aktiv-Records, aber ein älterer Reader versteht Schema v2 nicht. Ein Rollback erfordert daher das Drainen aller neuen Writer und die Bestätigung, dass kein aktiver, versiegelter oder Claim-Record dieses Protokolls verbleibt.

Ein Writer, der kein Lease erwirbt — zum Beispiel eine einfache `qwen --resume`-Session, weil Standalone-, interaktive und Headless-Recorder außerhalb dieses Protokolls laufen — kann weiterhin an ein Transkript anhängen, das ein verwalteter Writer versiegelt hat. Dieser Append invalidiert den versiegelten Beweis, sodass eine spätere zertifizierte Übernahme derselben Session fail-closed mit `session_transcript_changed` fehlschlägt und der Daemon gefenced bleibt, bis eine autoritative externe Writer-Fence den verbleibenden Record räumt. Der Rollout muss daher Nicht-Lease-Writer von jedem Transkript fernhalten, das am zertifizierten Handoff teilnimmt.

Das Hashen wird bewusst bei Versiegelung und Übernahme durchgeführt, statt jeden Append mit einem inkrementellen Digest zu versehen. Das hält die erste Implementierung klein und macht den Beweis unabhängig vom Prozessspeicher. Ein sehr großes Transkript kann dazu führen, dass verwaltetes Versiegeln die Eltern-Deadline überschreitet; das fehlschlägt fail-closed unter Beibehaltung des aktiven Locks und ist als unsauberer Shutdown beobachtbar.

## Verifikation

Unit- und Multiprozess-Coverage müssen beweisen:

- Schema-v1- und v2-Aktiv-Locks behalten ihr bestehendes Live/Stale-Verhalten;
- verwaltete Akquise reklamiert nie ein aktives Dead-PID- oder Fremd-Host-Lock;
- erfolgreiche Versiegelung zeichnet den exakten relativen Schlüssel, Existenz, Byte-Länge und SHA-256-Digest auf;
- ein zertifizierter Ersatz lädt das versiegelte Transkript neu und wird aktiv;
- zwei Ersatz-Instanzen, die um einen versiegelten Record racen, wählen exakt einen Owner;
- Transkript-Modifikation, -Ersetzung, -Trunkierung, Beweis-Korruption, fehlerhafte versiegelte Records und verbleibende Claims fail-closen;
- Fehler vor und nach jedem Primärpfad-Übergang überschreiben oder löschen nie einen unbekannten Nachfolger;
- verwalteter Flush-Fehler behält das aktive Primär-Lock;
- normales Recorder-Close gibt frei statt zu versiegeln; und
- die Default-off- und Standalone-ACP-Pfade bleiben unverändert.
