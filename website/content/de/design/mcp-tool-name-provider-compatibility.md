# MCP-Tool-Namen-Provider-Kompatibilität

## Problem

Qwen Code akzeptiert derzeit MCP-Tool-Namen mit Geminis Zeichensatz. Namen
wie `literature.search_pubmed` werden zu
`mcp__server__literature.search_pubmed`, was Gemini akzeptiert, aber
strikte OpenAI-kompatible und Anthropic-kompatible Endpoints lehnen es
möglicherweise ab, bevor das Tool laufen kann.

Derselbe rohe Name wird unabhängig für Registrierung,
Berechtigungs-Persistierung, Reconnect-Lookup, Output-Trunkierung und
wiederhergestellte Historie rekonstruiert. Nur den Provider-Request zu
ändern, würde daher dazu führen, dass sich der modell-sichtbare Name vom
Registry-Key unterscheidet.

## Design

Verwende eine deterministische Provider-sichere Normalisierungsregel für
MCP-Tool-Namen:

- Behalte Namen, die bereits `^[A-Za-z][A-Za-z0-9_-]*$` matchen und höchstens
  63 Zeichen lang sind.
- Ersetze nicht unterstützte Zeichen, stelle einen alphabetischen ersten
  Buchstaben sicher und hänge einen stabilen kurzen Hash an, wenn immer
  Normalisierung oder Trunkierung erforderlich ist.
- Halte den finalen Namen bei 63 Zeichen oder weniger; dies wird von Gemini
  und strikteren OpenAI-kompatiblen und Anthropic-kompatiblen Providern
  akzeptiert.
- Verwende den registrierten Namen während einer gesamten MCP-Invocation,
  statt ihn aus rohen Server- und Tool-Namen neu zu bauen.
- Normalisiere MCP-Namen in wiederhergestellter OpenAI- und
  Anthropic-Request-Historie, damit Sessions, die vor der Änderung erzeugt
  wurden, sendbar bleiben.
- Matche weiterhin Legacy-MCP-Berechtigungs- und Deaktivierte-Tool-Einträge,
  indem der exakte Alias aus der Zeit vor der Normalisierung mitgeführt
  wird, der aus den rohen Server- und Tool-Namen abgeleitet ist. Dies
  bewahrt auch Namen, die vom vorherigen Mitten-Trunkierungsalgorithmus
  trunkiert wurden, ohne Wildcard-Matches auszuweiten.

Es wird keine Provider-spezifische Alias-Tabelle eingeführt. Gültige
bestehende Namen bleiben Byte-für-Byte unverändert, sodass Gemini-Verhalten
und normale eingebaute Tools nicht betroffen sind.

Wiederhergestellte Namen, die der vorherige Mitten-Trunkierungsalgorithmus
erzeugt hat, sind bereits Provider-sicher und bleiben in historischen
Nachrichten unverändert. Ihre entfernte Mitte kann nicht zuverlässig
rekonstruiert werden, daher raten Konverter keinen neuen Hash-basierten
Namen; exakte Berechtigungs- und Deaktivierte-Tool-Kompatibilität nutzt
stattdessen den während der MCP-Registrierung verfügbaren Roher-Name-Alias.

## Verifikation

- Unit-Tests für gültige, ungültige, kollidierende, lange, stabile und
  idempotente Namen.
- MCP-Tool-Tests für Registrierung, Berechtigungsregeln, Reconnect-Lookup
  und deaktivierte Tools.
- OpenAI- und Anthropic-Konverter-Tests für wiederhergestellte Historie mit
  MCP-Namen mit Punkten.
- Core-Paket-Build und Typecheck.
