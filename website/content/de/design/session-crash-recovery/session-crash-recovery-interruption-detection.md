# Session-Crash-Recovery und einheitlicher Recovery Service — Design

## 1. Designziele

Der Recovery Service ist die einheitliche Entscheidungsschicht für die
Session-Recovery. Er liest die wiederhergestellte Session-History,
klassifiziert den aktuellen Recovery-Zustand, erstellt die für das
Fortsetzen benötigten Protokoll-Reparaturen und Continuation-Payloads und
stellt TUI, Daemon, SDK und Headless-Einstiegspunkten dasselbe Ergebnis
bereit.

Bestehende Fähigkeiten umfassen:

- Append-only-JSONL-Session-Speicherung.
- Laden von Sessions und Rekonstruktion der API-History.
- Reparatur verwaister `tool_use` / `tool_result`.
- Drei-Zustands-Unterbrechungserkennung.
- Continue-Einstiegspunkte für Headless, nonInteractive Control und ACP.

Das Hauptproblem heute ist nicht, dass die Recovery-Fähigkeit komplett
fehlt. Das Problem ist:

- Recovery-Entscheidungen sind über mehrere Einstiegspunkte verteilt.
- TUI / Daemon / SDK sehen nicht denselben Recovery-Zustand.
- Reparatur passiert implizit auf niedriger Ebene und ist für Nutzer oder
  Clients nicht sichtbar.
- Jeder zukünftige Recovery-Zustand müsste wiederholt in mehrere
  Einstiegspunkte verdrahtet werden.

Die Ziele eines einheitlichen Recovery Service sind:

- Einheitliche Klassifikation: Jeder Einstiegspunkt verwendet denselben
  Recovery-Plan.
- Einheitliche Reparatur: Jeder Einstiegspunkt nutzt dieselbe
  Tool-Paar-Reparatur und Unterbrechungsklassifikation.
- Einheitliche Sichtbarkeit: TUI / Daemon / SDK können alle erkennen, ob
  ein Resume sauber, unterbrochen oder degradiert ist.
- Einheitliche Debugging-Daten: Reparaturen, synthetisierte Ergebnisse und
  Drops werden als strukturierte Ausgabe für Anzeige und Logs offengelegt.
- Einheitliches Testen: Dieselben Crash-Fixtures können den Kern-Plan und
  jeden Einstiegspunkt-Adapter abdecken.

## 2. Kerndesign: Recovery Service

Füge einen Kern-Service hinzu:

```text
packages/core/src/core/session-recovery.ts
```

Er rendert kein UI und führt keine Tools aus. Seine einzige Aufgabe ist
es, aus dem Session-Transkript und der aktuellen Chat-History einen
deterministischen `SessionRecoveryPlan` zu erzeugen.

Vorgeschlagene Typen:

```ts
export type SessionRecoveryKind =
  | 'clean'
  | 'interrupted_prompt'
  | 'interrupted_turn'
  | 'degraded_history';

export type RecoveryRepair =
  | { type: 'synthesized_tool_result'; callId: string; name: string }
  | { type: 'dropped_duplicate_tool_result'; callId: string; name: string }
  | { type: 'history_gap'; childUuid: string; missingParentUuid: string };

export interface SessionRecoveryPlan {
  planId: string;
  sessionId: string;
  kind: SessionRecoveryKind;
  originalApiHistory: Content[];
  apiHistory: Content[];
  repairs: RecoveryRepair[];
  canContinue: boolean;
  canAutoContinue: boolean;
  requiresUserConfirmation: boolean;
  visibleNotice?: string;
  continuation?: {
    mode: 'retry_user_parts' | 'tool_result_parts';
    parts: Part[];
    displayText: string;
  };
}
```

Vorgeschlagener Einstiegspunkt:

```ts
export function buildSessionRecoveryPlan(input: {
  sessionId: string;
  conversation: ConversationRecord;
  historyGaps?: HistoryGap[];
  options?: {
    allowAutoContinue?: boolean;
  };
}): SessionRecoveryPlan;
```

Kernablauf:

1. Baue `originalApiHistory` aus `ConversationRecord`.
2. Wenn nicht ignorierbare `historyGaps` existieren, klassifiziere die
   Session als `degraded_history`.
3. Führe `detectTurnInterruption` auf `originalApiHistory` aus. Das muss
   vor der Reparatur passieren. Andernfalls würde ein
   Dangling-`model[functionCall]` zuerst durch ein synthetisches
   `functionResponse` geschlossen, wodurch es unmöglich wird, den Zustand
   als `interrupted_turn` zu klassifizieren.
4. Klone `originalApiHistory` in eine Provider-sichere History, führe das
   bestehende `repairOrphanedToolUseTurns` auf dem Klon aus und speichere
   das Ergebnis in `plan.apiHistory`.
5. Baue das Continuation-Payload aus der Klassifikation:
   - `interrupted_prompt`: Replay der abschließenden User-Parts mit
     Retry-Semantik.
   - `interrupted_turn`: Schließe Dangling-Tool-Calls mit synthetischen
     Fehler-`functionResponse`-Parts.
6. Erzeuge `visibleNotice` und `repairs` für Anzeige und Debugging in
   UI / Daemon / SDK.

Namenskompatibilität:

- Verwende weiterhin den bestehenden öffentlichen Protokoll-String
  `interrupted_turn`; füge kein `interrupted_tool_turn` hinzu.
  nonInteractive Control, ACP und bestehende Tests hängen bereits von
  `interrupted_turn` ab, und der Recovery Service sollte keine
  Migrationskosten verursachen.

## 3. Rolle und Nutzen des Recovery Service

### 3.1 Robustheit

Ein einheitlicher Service macht das aktuelle implizite und verstreute
Recovery-Verhalten zu einer expliziten Zustandsmaschine.

Aktueller Zustand:

- Die Resume-Initialisierung repariert verwaiste `tool_use`-Einträge, aber
  die Einstiegspunkte wissen nicht immer, dass diese Reparatur
  stattgefunden hat.
- Headless / ACP können fortsetzen, aber die TUI weiß nicht, was sie dem
  Nutzer sagen soll.
- Lücken in der Parent-Kette haben bereits eine teilweise sichtbare
  Behandlung: `SessionService.loadSession` gibt `historyGaps` zurück, und
  TUI / ACP können Gap-Hinweise anzeigen. Es gibt jedoch noch keine
  einheitlichen Recovery-Metadaten oder eine konsistente
  Safe-Mode-Policy.

Nach Einführung des Recovery Service:

- Jedes Resume erzeugt zuerst einen expliziten Zustand: `clean`,
  `interrupted_prompt`, `interrupted_turn` oder `degraded_history`.
- Jeder Einstiegspunkt kann anhand desselben Plans entscheiden, ob er
  fortsetzt, benachrichtigt oder degradiert.
- History-Lücken werden nicht stillschweigend als saubere History
  behandelt.
- Wenn später neue Recovery-Zustände hinzukommen, muss nur die
  Plan-Erstellung erweitert werden; die Einstiegspunkte müssen die Logik
  nicht jeweils neu implementieren.

Der Robustheitsgewinn besteht darin, dass Recovery sich von "jede Stelle
repariert bei Bedarf ein wenig" zu "jede Recovery hat ein einheitliches
Klassifikationsergebnis" bewegt.

### 3.2 Sicherheit

Das größte Sicherheitsrisiko bei der Recovery ist das automatische
Wiederholen von Aktionen mit Seiteneffekten, etwa Shell-Befehle,
Dateischreibvorgänge oder externe API-Aufrufe.

Sicherheitsprinzipien des Recovery Service:

- Unbekannte Tools standardmäßig nicht automatisch erneut abspielen.
- Dangling-Tool-Calls standardmäßig in fehlgeschlagene
  `functionResponse`-Parts umwandeln und das Modell entscheiden lassen, ob
  ein Retry erfolgt.
- `interrupted_turn` ist standardmäßig `requiresUserConfirmation = true`,
  es sei denn, der Caller aktiviert es explizit.
- `degraded_history` wird niemals automatisch fortgesetzt.
- Alle synthetischen Reparaturen sind für Logs und Debugging in `repairs`
  enthalten.

Dies priorisiert:

- Provider erhalten keine ungültige History.
- Nutzer wiederholen wegen der Recovery-Logik keine gefährlichen Aktionen.
- TUI / SDK können klar anzeigen, welche Tool-Ergebnisse als
  Recovery-Fehler synthetisiert wurden.

Der Sicherheitswert liegt darin, dass Recovery die Ausführung nicht blind
fortsetzt. Sie repariert zuerst die Protokollform und setzt dann mit
konservativer Policy fort.

### 3.3 Vollständigkeit

Dieses Design löst nicht sofort jedes Crash-Szenario. Es konzentriert sich
auf die Zustände, die aktuelle Fähigkeiten zuverlässig klassifizieren
können.

Sofort abgedeckt:

- Sauberes Resume.
- Abschließender User-Prompt: `interrupted_prompt`.
- Abschließende Tool-Result-Übermittlung: wird ebenfalls als
  `interrupted_prompt` klassifiziert und mit Retry wiederholt.
- Dangling-Tool-Call: `interrupted_turn`, mit synthetisierten
  Fehler-Tool-Results.
- Nicht benachbartes Tool-Result: Die bestehende Reparatur hebt es an eine
  legale Position. Die erste Version dieses Plans zeichnet Hoist-Details
  nicht separat auf, es sei denn, das Reparatur-API wird später erweitert,
  um sie zurückzugeben.
- Dupliziertes Tool-Result: Das Duplikat wird gedroppt.
- Lücke in der Parent-Kette: `degraded_history`.

Noch nicht abgedeckt:

- Ein Modell-Textstream, der mittendrin abbricht, aber ein Ende
  hinterlässt, das wie normaler Modell-Text aussieht.
- Feinkörnige Unterscheidung zwischen geordnetem Abbruch und unbekanntem
  Crash.

Vollständigkeit kommt hier nicht davon, auf einmal große Mengen Code
hinzuzufügen. Sie kommt davon, die aktuellen Fähigkeiten in einem
einheitlichen Plan zu konsolidieren, damit die heute klassifizierbaren
Zustände konsistent behandelt werden.

### 3.4 Engineering-Architektur

Der Recovery Service sollte im Core liegen, nicht in CLI, TUI, Daemon oder
einem einzelnen Einstiegspunkt.

Gründe:

- `SessionService`, `buildApiHistoryFromConversation`, die
  `GeminiChat`-Reparatur und `detectTurnInterruption` liegen alle im Core
  oder in Core-nahen Schichten.
- TUI / Headless / ACP / Daemon / SDK sind Adapter.
- Recovery-Klassifikation ist Domänenlogik, keine UI-Rendering-Logik.

Vorgeschlagene Schichtung:

```text
SessionService
  Read JSONL, rebuild ConversationRecord, return historyGaps

SessionRecoveryService
  Build RecoveryPlan from ConversationRecord + historyGaps

GeminiClient / GeminiChat
  Consume plan.apiHistory to initialize chat
  Execute plan.continuation when needed

TUI / headless / ACP / daemon / SDK
  Display plan.visibleNotice
  Trigger continuation from user or API requests
```

Vorteile dieser Schichtung:

- Der Core besitzt Fakten und Entscheidungen.
- Das UI besitzt die Anzeige.
- Daemon / SDK besitzen die Protokollausgabe.
- Tests können den Kern-Plan direkt ausführen, ohne eine vollständige TUI
  zu starten.

### 3.5 Sichtbarkeit und Debuggbarkeit

Der vom Recovery Service erzeugte Plan sollte in zwei Arten von Ausgabe
umwandelbar sein:

1. Für Nutzer sichtbarer Hinweis:

```text
The previous session stopped after tool execution. Marked 2 unfinished tool
calls as failed so the history can be sent safely. You can continue the task;
the model will decide whether to retry based on the failure results.
```

2. Debug-Log oder optionaler System-Record:

```ts
type RecoveryDebugPayload = {
  planId: string;
  kind: SessionRecoveryKind;
  repairs: RecoveryRepair[];
  timestamp: string;
};
```

Diese Informationen gehen nicht in die API-History ein. Sie dienen nur der
Diagnose, dem Export und dem Debugging. Sie als System-Record zu
persistieren kann verschoben werden und ist keine harte Anforderung dieses
Designs.

Nutzen:

- Nutzer wissen, was während der Recovery passiert ist.
- SDK-Clients können den genauen Zustand anzeigen.
- Bug-Reports können `planId` und `repairs` enthalten.
- Dasselbe unterbrochene Ende wird weniger wahrscheinlich mehrfach
  automatisch fortgesetzt.

## 4. Einstiegspunkt-Integration

### 4.1 TUI

Nach `/resume` oder dem Start mit `--resume`:

1. `SessionService.loadSession(sessionId)`.
2. `buildSessionRecoveryPlan(...)`.
3. `config.startNewSession(sessionId, sessionData, recoveryPlan)` oder ein
   gleichwertiger Mechanismus, um den Plan zu behalten.
4. UI-History laden.
5. Wenn `plan.kind !== 'clean'`, füge ein INFO-Item ein.
6. Biete `/continue` oder eine Aktion "Continue interrupted turn" an.

Die TUI setzt `interrupted_turn` / `degraded_history` standardmäßig nicht
automatisch fort.

### 4.2 Headless / nonInteractive Control

`continueInterrupted` oder `continue_last_turn` rufen nicht länger
verstreute Detektoren direkt auf. Stattdessen:

1. Baue einen Plan aus der aktuellen Chat-History oder der
   wiederhergestellten Conversation.
2. Wenn `plan.canContinue = false`, gib einen No-op zurück.
3. Wenn Fortsetzen erlaubt ist, führe `plan.continuation` aus.

### 4.3 ACP / Daemon

Füge Recovery-Metadaten zur Response von `loadSession` / `resumeSession`
hinzu:

```ts
{
  recovered: boolean;
  recoveryKind: SessionRecoveryKind;
  canContinue: boolean;
  requiresUserConfirmation: boolean;
  repairs: {
    type: string;
    count: number;
  }
  [];
}
```

`continueLastTurn` sollte ebenfalls basierend auf dem Plan
annehmen/ablehnen und unmittelbar vor der Ausführung erneut validieren.

### 4.4 SDK

Die SDK-Integration muss zwei Kategorien unterscheiden:

- Daemon-gestütztes SDK: konsumiert Recovery-Metadaten aus den
  `loadSession` / `resumeSession`-Responses des Daemons, zeigt ein
  Recovery-Banner und erlaubt dem Nutzer oder der Host-Anwendung, das
  Fortsetzen auszulösen.
- Prozess-gestütztes SDK: startet die CLI über `ProcessTransport` und
  verwendet die `--resume` / `--continue`-Flags. Es benötigt
  gleichwertige Recovery-Metadaten, die über eine
  Stream-JSON-Systemnachricht oder ein SDK-Protokollfeld offengelegt
  werden.

Keine der beiden SDK-Kategorien sollte die JSONL auf niedriger Ebene oder
die Tool-Paar-Reparatur direkt verstehen. Sie sollten nur das strukturierte
Recovery-Ergebnis konsumieren, das von der Einstiegspunkt-Schicht
offengelegt wird, und sie sollten das automatische Fortsetzen in
degradierten Zuständen blockieren.

## 5. Unit-Test-Design

Der Recovery Service muss unabhängige Unit-Tests haben, die nicht von der
TUI oder einem echten Provider abhängen.

Kern-Fixtures:

1. Saubere History:
   - Ende aus Modell-Text.
   - Vollständiger Tool-Call + Tool-Result + abschließende Modell-Antwort.

2. `interrupted_prompt`:
   - Letzter Eintrag ist User-Text.
   - Letzter Eintrag ist eine Gruppe von User-`functionResponse`-Parts.
   - Mehrere abschließende User-Einträge.

3. `interrupted_turn`:
   - Modell-`functionCall` ohne `functionResponse`.
   - Mehrere `functionCalls`, von denen nur einige abgeschlossen sind.
   - `functionCall` ohne id wird übersprungen.

4. Reparatur:
   - Nicht benachbarte `functionResponse` wird gehoistet und die
     Provider-sichere History ist legal.
   - Duplizierte `functionResponse` wird gedroppt.
   - Die Form synthetischer Tool-Results bleibt konsistent mit der
     bestehenden Reparatur.

5. `degraded_history`:
   - `historyGaps` ist nicht leer.
   - Bestätige `canAutoContinue = false`.
   - Bestätige, dass `visibleNotice` Gap-Informationen enthält.

6. Kompressions-Checkpoint:
   - Der Tail nach der letzten Kompression wird korrekt erkannt.
   - System-Records gehen nicht in die API-History ein.

Einstiegspunkt-Adapter-Tests:

- Die TUI fügt nach Erhalt eines nicht sauberen Plans über `/resume` ein
  INFO-Item ein.
- Headless-`continueInterrupted` verwendet die Plan-Continuation und
  dupliziert die User-Nachricht nicht.
- ACP-`continueLastTurn` gibt für dieselbe Fixture dieselbe Recovery-Art
  zurück.
- Die `loadSession`-Response des Daemons enthält Recovery-Metadaten.

Das zentrale Testziel ist: Dieselbe History-Fixture sollte im Core, in der
TUI, in ACP und im Daemon dieselbe Recovery-Art erzeugen.

## 6. Fazit

Ein einheitlicher Recovery Service ist die wertvollste Änderung in dieser
Phase, weil er hauptsächlich bestehende Fähigkeiten konsolidiert, statt
sofort viele neue Mechanismen einzuführen.

Sein direkter Nutzen:

- Macht den Recovery-Zustand über TUI / Daemon / SDK / Headless konsistent.
- Macht die bestehende Reparatur verwaister `tool_use` von einem
  impliziten Schritt zur 400-Vermeidung zu einem expliziten Recovery-Plan.
- Macht die Fortsetzung unterbrochener Turns von einer lokalen Headless- /
  ACP-Fähigkeit zu einer wiederverwendbaren Kern-Fähigkeit.
- Bietet einen stabilen Erweiterungspunkt für zukünftige
  Recovery-Zustände.

Er löst nicht jedes Crash-Problem allein, insbesondere keine Crashes
mitten im Textstream. Dieses Dokument hält diese Erweiterungen bewusst aus
dem Scope dieser Runde heraus, um Over-Design zu vermeiden. Das aktuelle
Ziel ist, die bereits existierenden und zuverlässig klassifizierbaren
Recovery-Fähigkeiten zu vereinheitlichen.
