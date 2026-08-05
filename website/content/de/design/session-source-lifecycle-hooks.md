# Session-Quelle in Lifecycle-Hooks

## Kontext

Die Daemon-Session-Erstellung leitet bereits optionale `sourceType`- und
`sourceId`-Werte in `_meta['qwen.session.source']` an ACP weiter. Die
ACP-Runtime nutzt den Source-Typ derzeit, um natives Cron für
Channel-Sessions zu deaktivieren, aber Lifecycle-Hook-Payloads können keinen
der beiden Werte sehen. Empfänger können eine neue Session daher nicht
zuordnen, wenn `SessionStart` feuert, bevor die Bridge ihre Quelle
persistiert.

## Design

Die bestehenden Source-Metadaten werden einmal an der ACP-Session-Grenze
geparst. Die beiden optionalen Strings werden neben der Session-ID und
anderem Session-Scoped-State in der `Config` der Session gespeichert und
über Read-only-Getter exponiert.

Der Hook-Event-Handler fügt vorhandene Source-Werte seinem gemeinsamen
Input hinzu:

- `sourceType` wird zu `source_type`.
- `sourceId` wird zu `source_id`.

Bedingte Object-Spreads lassen fehlende Werte weg, statt leere oder
undefinierte Felder zu serialisieren. Da jedes Lifecycle-Event den
gemeinsamen Input-Builder verwendet, erhalten `SessionStart`,
`UserPromptSubmit`, `Stop` und `SessionEnd` dieselbe Zuordnung ohne
eventspezifisches Wiring.

## Grenzen

Dies ist ein Read-through der bestehenden Erstellungs-Metadaten. Der
REST-Create-Request, der Metadaten-Key der ACP-Bridge, die
Capability-Aushandlung, die Session-Persistierung und das Resume-Verhalten
ändern sich nicht. Eine ohne Source-Metadaten erstellte Session behält die
bisherige Hook-Payload-Form.

## Verifikation

- Hook-Handler-Tests decken vorhandene und fehlende Source-Felder in
  `SessionStart`-Payloads ab.
- ACP-Session-Tests decken die Weitergabe von Channel-Source-Metadaten in
  die Session-`Config` ab.
- Bestehende Channel-Worker-Tests decken weiterhin die
  Erstellungs-Metadaten ab, einschließlich des Channel-Instanznamens als
  `sourceId`.
