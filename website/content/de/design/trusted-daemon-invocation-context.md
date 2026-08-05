# Vertrauenswürdiger Daemon-Aufrufkontext

## Ziel

Für einen akzeptierten Root-Prompt die vom Daemon attestierte Identität an
die MCP-Server übergeben, die Qwen über stdio startet. Der Kontext ist
Korrelationsmetadaten, kein Autorisierungs-Credential.

Der vollständige Produktionspfad ist:

```text
daemon prompt admission
  -> private ACP child
  -> root Session turn
  -> Qwen-launched stdio MCP tools/call request metadata
```

## Wire-Vertrag

Qwen fügt den folgenden Wert in
`tools/call.params._meta["qwen-code/invocation"]` ein:

```ts
interface InvocationContextV1 {
  version: 1;
  sessionId: string;
  promptId: string;
  originatorClientId?: string;
}
```

- `sessionId` ist die Live-Daemon-Session, die von der Request-Route
  ausgewählt wurde.
- `promptId` wird festgelegt, wenn der Daemon den Prompt zulässt, bevor er
  in der Pro-Session-Warteschlange wartet. Nicht blockierende Caller
  können die Korrelations-ID liefern, die vom bestehenden
  Terminal-Event-Matching verwendet wird; andernfalls erzeugt der Daemon
  eine UUID. In beiden Fällen identifiziert der Wert den Prompt, den der
  Daemon tatsächlich zugelassen hat, statt Metadaten, die aus dem
  Prompt-Body kopiert wurden.
- `originatorClientId` ist, falls vorhanden, der Request-Header-Wert,
  nachdem der Daemon verifiziert hat, dass er für diese Session
  registriert ist.
- Unbekannte Felder, unbekannte Versionen und leere Bezeichner sind
  ungültig.

Der Daemon entfernt vom Caller gelieferte Werte für die reservierten
Metadaten-Keys und rekonstruiert den Kontext aus seinem eigenen Zustand.
Er gibt den Wert nur an das ACP-Child weiter, das er gestartet und mit
einer Capability pro Prozess authentifiziert hat. Eigenständige ACP-Caller
können den reservierten Kontext nicht injizieren.

## Lebensdauer und Offenlegung

Die ACP-Session verifiziert, dass die Session des Kontexts ihrer
tatsächlichen Session entspricht, und bindet ihn mit `AsyncLocalStorage`
an den Root-Prompt. Gleichzeitige Prompts bleiben isoliert, auch wenn sie
einen gepoolten MCP-Transport teilen. Aufgeschobene
Bestätigungs-Callbacks stellen den erfassten Kontext explizit wieder her.

Automatische Cron-Turns, Hintergrund-Benachrichtigungen, fortgesetzte
Hintergrund-Agents und Subagent-Reasoning-Loops laufen ohne
Aufrufkontext. Der Kontext wird nicht persistiert, nachdem der Root-Turn
abgeschlossen ist.

Nur eine Transport-Instanz, die Qwen als `StdioClientTransport` aus einer
MCP-`command`-Konfiguration erstellt, wird als berechtigt markiert. HTTP-,
SSE-, WebSocket-, Reverse-, SDK-bereitgestellte und Client-gehostete
Transports erhalten die Metadaten nicht. Der Berechtigungs-Marker
übersteht Tool-Discovery, Cloning, Pooling, Reconnect und Retry, ohne zu
einer öffentlichen MCP-Konfigurationsoption zu werden.

## Non-Goals

- Kein spezifisches Verhalten für Browser Use, opencode,
  Local-/Remote-Backend, Page oder Skills.
- Keine Ingress-Enumeration oder allgemeiner Provenance-Graph.
- Keine neue TypeScript-SDK-API und kein
  qwen-serve-MCP-Lifecycle-Verhalten.
- Keine Autorisierungsentscheidung auf Basis von `originatorClientId`.
