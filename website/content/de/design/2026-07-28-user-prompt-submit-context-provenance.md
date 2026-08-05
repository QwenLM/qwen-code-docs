# Herkunft des UserPromptSubmit-Hook-Kontexts

Issue: https://github.com/QwenLM/qwen-code/issues/7940

## Problem

`UserPromptSubmit`-Hooks können `additionalContext` zurückgeben, den der
Client als bloßen Text-Part an den ausgehenden Request anhängt. Weil
`recordUserMessage` den angereicherten Request persistiert, landet der
injizierte Text in `message.parts` des User-Datensatzes, ununterscheidbar von
vom Nutzer verfasstem Text.

Konsequenzen:

- **Resume**: Die UI-Projektion verkettet alle Text-Parts, sodass resumed
  Sessions Hook-injizierten Kontext so anzeigen, als hätte der Nutzer ihn
  eingegeben.
- **Offline-Analyse / nachgelagerte Consumer**: Das JSONL-Transkript kann
  User-Text nicht von Injektionen trennen; Consumer greifen zu fragilen
  eigenen Marker-Stripping-Heuristiken.
- **Telemetrie & Auto-Memory-Recall**: Beide konsumierten
  `partToString(request)` nach der Injektion und verschmutzen so das
  Prompt-Attribut und die Recall-Query.

Die Live-TUI ist nicht betroffen (sie baut ihr Historien-Item aus der
Pre-Hook-Eingabe), genau diese Asymmetrie machte das verschmutzte Transkript
leicht übersehbar.

## Design

Isomorph zu zwei bestehenden Mustern: `SessionStart`-Kontext wird als
getaggter Block in die System-Instruktion injiziert, und
Mid-Turn-/Benachrichtigungs-Datensätze trennen die modellgebundene `message`
von einer `systemPayload.displayText`-Projektion.

### Schreibpfad

1. **Getaggte Injektion** (`client.ts`): Der bereinigte `additionalContext`
   wird als eigener Part angehängt, eingehüllt in
   `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`.
   `getAdditionalContext()` escaped `<`/`>` in der Hook-Ausgabe, sodass der
   Wrapper von innen nicht geschlossen oder gefälscht werden kann. Vom Nutzer
   verfasster Text wird nie umgeschrieben oder escaped. `promptText` muss vor
   der Injektions-Zuweisung deklariert werden, die ihn in
   `preInjectionPromptText` einfängt (vermeidet eine TDZ, falls das
   umgebende Goal-try/catch später umgestellt wird).
2. **Display-Herkunft** (`chatRecordingService.ts`): `recordUserMessage`
   akzeptiert einen optionalen `UserPromptRecordPayload { displayText? }`, der
   als `systemPayload` gespeichert wird. `message` behält den exakten
   modellgebundenen Content — Resume muss abspielen, was das Modell
   tatsächlich gesehen hat — während `displayText` die Pre-Injektion-
   User-Projektion bewahrt. Hook-injizierter Text bleibt im getaggten
   `message.parts`-Eintrag (maschinenparsebar). Der Payload wird nur
   geschrieben, wenn ein Hook tatsächlich Kontext injiziert hat.
3. **Telemetrie & Recall** (`client.ts`): `addUserPromptAttributes` und
   `MemoryManager.recall` verwenden den Pre-Injektion-Prompt-Text, wenn eine
   Injektion stattgefunden hat.

### Lesepfad (Resume-Projektion)

`resumeHistoryUtils` projiziert einfache User-Datensätze über einen
Drei-Formen-Fallback:

- (a) neue Datensätze: bevorzuge `systemPayload.displayText`;
- (b) Nur-Tag-Datensätze (ohne Payload): entferne einen nachgestellten Part,
  der in seiner Gesamtheit ein getaggter Block ist — nur strikte
  Gesamt-Part-Übereinstimmung, sodass User-Prosa, die den Tag lediglich
  enthält, nie gestrippt wird. Ein einzelner Part, der der Tag-Form
  entspricht, wird ebenfalls behalten (Injektion hängt immer nach dem oder
  den eigenen Parts des Nutzers an, sodass ein Ein-Part-Datensatz nur vom
  Nutzer verfasst sein kann);
- (c) Legacy-Datensätze mit bloßer Injektion: unveränderte Verkettung.

Der `@`-Befehl-Resume-Zweig bevorzugt weiterhin
`AtCommandRecordPayload.userText`, wenn vorhanden; nur der
Ohne-`userText`-Fallback läuft durch `extractUserRecordDisplayText`, sodass
ein nachgestellter getaggter Part den `@`-Befehl-Display-Text nicht
überschreibt.

## Scope-Hinweise

- Fokussiert auf den interaktiven `UserPromptSubmit`-Pfad. Der
  ACP-Session-Pfad zeichnet den Pre-Injektion-Prompt-Text bereits auf, daher
  benötigte er nur dasselbe Tag-Wrapping für seine modellgebundene Injektion
  (hier enthalten). Die Subagent-Kontext-Injektion (`SubagentStart` über
  `contextState`) braucht eine eigene Untersuchung und ist ein Follow-up.
- Andere Transkript-Consumer (Desktop, Web-UI) können `displayText` in
  Follow-ups übernehmen; bis dahin sehen sie die getaggte Form, die zumindest
  mechanisch identifizierbar ist.

ACP-/Export-/Daemon-Consumer, die durch `projectUserRecord` von
`transcript-replay` laufen, bevorzugen ebenfalls `displayText` und strippen
einen nachgestellten getaggten Part bei User-Datensätzen ohne Subtype
(derselbe Drei-Formen-Fallback wie beim TUI-Resume-Pfad).
