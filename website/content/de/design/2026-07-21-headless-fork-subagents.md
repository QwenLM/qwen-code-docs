# Headless context-inheriting subagents

## Problem

Ein expliziter `subagent_type: "fork"`-Request wird derzeit nur
berücksichtigt, wenn `Config.isInteractive()` true ist. Headless-Aufrufer wie
`qwen --prompt`, das TypeScript-SDK und CI-Runner führen stattdessen still
einen frischen `general-purpose`-Subagent aus. Der angefragte und der effektive
Kontextmodus unterscheiden sich daher, und das Kind erhält die
Parent-Konversation nicht.

## Design

Die Fork-Verfügbarkeit ist unabhängig von der Präsentationsfläche. Ein
Top-Level-Fork-Request verwendet immer den bestehenden
Fork-Konstruktionspfad, der die Historie des Parents und die cache-sichere
Generation-Konfiguration kopiert.

Headless-Forks laufen über die bestehende Hintergrund-Agenten-Registry, selbst
wenn `run_in_background` weggelassen wird oder false ist. Forks sind per
Definition abgetrennt, und die Registry gibt nicht interaktiven Aufrufern den
Lebenszyklus, den sie benötigen:

- Die Headless-Einmal-Ausführung wartet, bis der Fork abgeschlossen ist;
- Stream-Consumer erhalten `task_started` und terminale
  Task-Benachrichtigungen;
- Der effektive `subagent_type: "fork"` wird in Events, Metadaten und
  Subagent-Telemetrie aufgezeichnet;
- Permission-Anfragen, die in einer nicht interaktiven Session nicht angezeigt
  werden können, werden durch die bestehende Hintergrund-Agenten-Policy
  verweigert, statt zu hängen.

Das interaktive Fork-Verhalten bleibt unverändert.

Ein Fork-Request von einem verschachtelten Subagent wird weiterhin nicht
unterstützt, schlägt nun aber mit einem expliziten Tool-Fehler fehl, statt
still einen frischen `general-purpose`-Subagent auszuführen.

## Umfang

Diese Änderung verwendet das aktuelle Voll-Historie-Fork-Verhalten weiter. Sie
fügt keine Teil-Historie-Auswahl wie `fork_turns` hinzu; das kann separat
eingeführt werden, ohne die korrekte Headless-Vererbung zu blockieren.

## Verifikation

- Core-Dispatch-Tests decken interaktive Forks, Headless-Forks, erzwungenen
  Hintergrund-Lebenszyklus, Konstruktion der geerbten Historie,
  Permission-Verhalten und explizite Nested-Fork-Ablehnung ab.
- Der nicht interaktive CLI-Test deckt das SDK-seitige `task_started`-Event ab
  und verifiziert, dass es `subagent_type: "fork"` preisgibt.
- Der Desktop-SDK-Adapter-Test verifiziert, dass das Hintergrund-Ergebnis der
  Runtime Vorrang vor einem vom Aufrufer bereitgestellten
  `run_in_background: false` hat.
- Ein Ende-zu-Ende-Check mit `qwen --prompt --output-format stream-json`
  verwendet einen Parent-Marker, der in der Fork-Anweisung fehlt, und
  verifiziert, dass das Kind ihn weiterhin aus der geerbten Historie
  wiederherstellen kann.
