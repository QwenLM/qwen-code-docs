# Einheitlicher Reasoning-Aufwand (/effort)

> **Implementierungsstatus.** Abgeschlossen: die 5-stufige Leiter + `core/reasoning-effort.ts`
> (Rank-Clamp/Normalisierung), die globale `model.reasoningEffort`-Einstellung + Runtime-
> `Config.setReasoningEffort`/`getReasoningEffort` (bei Modellwechseln in `handleModelChange`
> erneut angewendet), der `/effort`-Befehl, der GLM-Verbatim-Flatten-Adapter (`provider/zai.ts`),
> das Gemini-`medium`/`xhigh`-Mapping, das **modell-spezifische Anthropic-Gating**
> (`anthropicSupportedEffortTiers` + Clamp: Opus 4.7/4.8- und 5.x-Familien geben `xhigh`/`max`
> durch; Opus 4.6/Sonnet 4.6 akzeptieren nur `max`; Opus 4.5 und unversionierte IDs werden auf
> `high` geclampt), die `model-with-reasoning`-Statuszeile (Live-Update bei `/effort`), das
> DashScope-Tier→Bool-Mapping (ein gesetzter Aufwand aktiviert `enable_thinking` für
> Qwen-Hybridmodelle; die einzelne Spalte, die erweitert werden muss, wenn Qwen ein echtes
> `reasoning_effort`-Feld ausliefert), und der interaktive `EffortDialog` – ein bloßes `/effort`
> öffnet im interaktiven Modus einen Tier-Picker (und listet die Tiers im nicht-interaktiven
> Modus auf), verdrahtet über `use-effort-command`, die UI-Kontexte, `DialogManager` und
> `useDialogClose`. Nichts ist aufgeschoben.

## Problem

Jeder Reasoning-fähige Provider stellt einen anderen Regler für "Wie stark soll das Modell
nachdenken" bereit: OpenAI/DeepSeek/GLM verwenden einen flachen `reasoning_effort`-String,
Anthropic verwendet `output_config.effort` (plus das Legacy-`thinking.budget_tokens`),
Gemini 3 verwendet `thinking_level` (Gemini 2.5 verwendete `thinkingConfig.thinkingBudget`),
und Qwen/DashScope hat nur einen booleschen `enable_thinking`-Wert.

Der Core trägt bereits eine vereinheitlichte `reasoning: { effort }`-Konfigurationsstruktur und
jeder Provider-Adapter übersetzt diese bereits (siehe Current State), aber es gibt keine
benutzerzugängliche Möglichkeit, zur Laufzeit einen Aufwand-Level auszuwählen. Der Level kann
nur durch manuelles Bearbeiten der generation config pro Modell gesetzt werden. Wir wollen einen
einzigen `/effort`-Befehl, der eine kleine Auswahl an Tiers bietet, diese auf das abbildet, was
der aktive Provider unterstützt, und die Auswahl persistiert.

Die vereinheitlichte Schicht muss auch das Hinzufügen eines neuen Providers trivial machen: Wenn
ein Modell, das derzeit nur einen Ein/Aus-Schalter hat (z. B. qwen3), echte Aufwands-Tiers
erhält, sollte die einzige Änderung eine einzige Zeile in der Mapping-/Capability-Tabelle sein.

## Goals

- Eine einheitliche, für den Benutzer sichtbare Aufwandsleiter: **`low | medium | high | xhigh | max`** (5 Tiers).
- Ein `/effort`-Slash-Befehl: `/effort <tier>` setzt direkt; ein bloßes `/effort` öffnet einen Picker-Dialog.
- Eine **einzelne globale** Einstellung, die für alle Modelle gilt und sitzungsübergreifend persistiert wird.
- Eine Provider-spezifische Übersetzungs- und **Clamp**-Schicht: Ein nicht unterstütztes Tier fällt auf das nächstgelegene unterstützte Tier für das aktive Modell zurück, mit einer einmaligen Warnung (unter Wiederverwendung der bestehenden Anthropic-Clamp-UX).
- Live-Anzeige über das bestehende `model-with-reasoning`-Statuszeilen-Preset.
- Hinzufügen/Anpassen eines Providers = Bearbeiten einer einzigen Capability-/Mapping-Tabelle, keine neue Verdrahtung.

## Non-Goals

- Kein `off`-Tier. Das vollständige Deaktivieren von Reasoning bleibt das separate, bestehende `reasoning: false`-Konzept; `/effort` wechselt nur zwischen aktiven Tiers.
- Kein modell-spezifisch persistierter Aufwand (Entscheidung: globale Einzeleinstellung).
- Keine rohe `budget_tokens`-UI. Budget-basierte Provider (Gemini 2.5, Legacy-Anthropic) werden durch das Tier→Bucket-Mapping gesteuert und nicht numerisch offengelegt.
- Keine Änderung an der bestehenden Provider-spezifischen Request-Verdrahtung, abgesehen vom Schließen von Mapping-Lücken und Clamps.
- Keine Desktop-Integration (der Desktop hat sein eigenes `thinkingLevel`-Plumbing; nicht im Scope).

## Current State

Vereinheitlichter Config-Typ — [`packages/core/src/core/contentGenerator.ts:104-118`]:

```ts
reasoning?: false | { effort?: 'low' | 'medium' | 'high' | 'max'; budget_tokens?: number }
```

Bestehende Provider-spezifische Übersetzer:

| Provider             | Datei                                                                                | Verhalten                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| DeepSeek             | `provider/deepseek.ts:176-218`                                                       | nested → flaches `reasoning_effort`; `low/medium→high`, `xhigh→max`                           |
| Anthropic            | `anthropicContentGenerator.ts:521-593`, Clamp `665-693`, Beta-Hdr `393-431`         | `output_config.effort` + Thinking; `max`→`high`-Clamp + einmalige Warnung; `effort-2025-11-24`-Beta |
| Gemini               | `geminiContentGenerator.ts:107-146`                                                  | `thinkingConfig`/`thinkingLevel`; `low→LOW`, `high/max→HIGH`                                  |
| OpenAI/GLM/DashScope | `openaiContentGenerator/pipeline.ts:689-717` (`buildReasoningConfig`), Strip `597-602` | leitet `reasoning_effort` weiter/strippt es; DashScope fügt `preserve_thinking` hinzu         |

Lücken: Der Union fehlt `xhigh`; Gemini fehlt `medium` und eine `xhigh→high`-Regel; für die
generische Pipeline muss bestätigt werden, dass sie `reasoning_effort` für reines OpenAI/GLM
ausgibt und `max→xhigh` clampt; DashScope hat kein Tier→Bool-Mapping.

## Prior art: openclaw

`openclaw/openclaw` löst dasselbe Problem mit einer ausgereifteren Form, von der wir uns
inspirieren lassen (untersucht in `~/Documents/openclaw`):

- **Einheitliche kanonische Leiter + numerische Ränge** (`src/auto-reply/thinking.shared.ts`):
  `ThinkLevel = off|minimal|low|medium|high|xhigh|adaptive|max` mit
  `THINKING_LEVEL_RANKS` (off:0 … high:40, xhigh:60, max:70; adaptive≡30).
- **Rangbasierter Clamp** (`src/llm/model-utils.ts:59` `clampThinkingLevel`): Wenn das
  Modell den Level unterstützt, wird er verwendet; ein explizites `null`-Opt-out für xhigh/max
  ist ein Hard-Cap (zuerst nach unten wandern); andernfalls wird der nächststärkere unterstützte
  Level bevorzugt, sonst nach unten wandern – die Kosten werden niemals stillschweigend über das
  Cap eines Modells hinaus erhöht.
- **Modell-spezifische Capability**, nicht nur Provider-spezifisch: Der Katalog enthält
  `compat.supportedReasoningEfforts` und eine modell-spezifische `thinkingLevelMap`
  (Wert oder `null`).
- **Drei Shape-Mapper**, einer pro API-Familie:
  - OpenAI-kompatibel — `mapThinkingLevelToReasoningEffort()`: `off→none`,
    `adaptive→medium`, `max→xhigh`, sonst Passthrough → `none|minimal|low|medium|high|xhigh`.
  - Anthropic — `mapThinkingLevelToEffort(model, level)`: Clamp, dann `output_config.effort`
    für Adaptive-Thinking-Modelle ausgeben, oder in `thinkingBudgetTokens` umwandeln
    (mit `adjustMaxTokensForThinking`) für ältere Modelle.
  - Gemini — `resolveGoogleGemini3ThinkingLevel()`: Gemini 3 Pro → LOW/HIGH,
    Flash → MINIMAL/LOW/MEDIUM/HIGH; Gemini 2.5 mappt ein Budget auf einen Level
    (`≤0→MINIMAL, ≤2048→LOW, ≤8192→MEDIUM, sonst HIGH`; `gemini-2.5-pro` lehnt
    Budget 0 ab – Thinking erforderlich).
  - DeepSeek-V4-Wrapper: `off`→strippen; `xhigh|max→max`, sonst `high`.
- **Provider-Thinking-Profil** (`src/plugins/provider-thinking.types.ts`):
  deklariert `levels`/`defaultLevel`; binäre Provider speichern `low`, zeigen aber `on` an.
- **Reasoning-Sanitizer** (`extensions/opencode-go/reasoning-sanitizer.ts`):
  strippt `reasoning_content`/`reasoning_effort` und Thinking-Teile beim Replayen
  der Historie an Provider, die diese ablehnen.

Was wir übernehmen: den **rangbasierten zentralen Clamp**, die **modell-spezifische
Capability-Deklaration**, die **drei Shape-Mapper** und die **exakten Gemini 2.5
Budget-Buckets**. Was wir für v1 weglassen: `minimal`/`adaptive`-Benutzer-Tiers
(Entscheidung = 5 Tiers) – sie bleiben gültige _interne_ Normalisierungsziele, sodass ein
Modell-Katalog sie weiterhin deklarieren kann.

## Design

### Aufwandsleiter & Capability-Tabelle

Kanonische geordnete Leiter: `low < medium < high < xhigh < max`.

Jeder Provider deklariert eine unterstützte Teilmenge; der Übersetzer clampt ein angefordertes
Tier in der Leiter **nach unten** auf das nächstgelegene unterstützte Tier. Mapping (kanonisch →
Wire-Wert), wobei `↓` einen Clamp markiert:

| Tier   | OpenAI `reasoning_effort` | DeepSeek `reasoning_effort` | GLM-5.2+ `reasoning_effort` | Anthropic `output_config.effort` | Gemini 3 `thinking_level` | Qwen DashScope       |
| ------ | ------------------------- | --------------------------- | --------------------------- | -------------------------------- | ------------------------- | -------------------- |
| low    | low                       | high¹                       | low                         | low                              | low                       | enable_thinking:true |
| medium | medium                    | high¹                       | medium                      | medium                           | medium                    | true                 |
| high   | high                      | high                        | high                        | high (Standard)                  | high                      | true                 |
| xhigh  | xhigh                     | max¹                        | xhigh                       | xhigh ↓high²                     | high ↓²                   | true                 |
| max    | xhigh ↓ (kein `max`)      | max                         | max                         | max ↓high²                       | high ↓²                   | true                 |

¹ Dokumentierte interne Gruppierung von DeepSeek/GLM (low/medium ≡ high, xhigh ≡ max).
² Geclampt auf die dokumentierte Obergrenze des Modells (variiert je nach Anthropic-Modell;
Gemini 3 cappt bei `high`). Gemini 2.5-Modelle mappen das Tier auf einen
`thinkingConfig.thinkingBudget`-Bucket anstelle von `thinking_level`.

Clamping ist **zentral und rangbasiert** (übernommen aus openclaws `clampThinkingLevel`): Jedes
Tier erhält einen Rang (`low:20, medium:30, high:40, xhigh:60, max:70`); ein Provider/Modell
deklariert seine unterstützte Menge (und optionale `null` Hard-Caps für `xhigh`/`max`); der
Clamp wählt das nächstgelegene unterstützte Tier – hard-gecappte Anfragen wandern nach unten,
andernfalls wird das nächste unterstützte Tier auf oder unterhalb der Anfrage bevorzugt. Dies
ersetzt die ad-hoc Clamp-Mechanismen der einzelnen Adapter (z. B. Anthroics aktueller
`max→high`-Clamp).

Capability wird **pro Modell deklariert, nicht nur pro Provider** (Lehre aus openclaw): Der
Katalog-Eintrag des Modells / das Provider-Preset enthält `supportedReasoningEfforts?:
EffortTier[]` (und eine optionale modell-spezifische Override-Map). Standard, wenn nicht gesetzt
= die vollständige unterstützte Menge des Providers. Ein neuer Provider/ein neues Modell ist
eine einzige Tabellenzeile; der Clamp und die drei Shape-Mapper bleiben unverändert.

Drei Shape-Mapper übernehmen die Wire-Übersetzung (einer pro API-Familie), gespeist mit dem
bereits geclampten Tier:

- `toReasoningEffort(tier)` – flaches `reasoning_effort` für OpenAI/DeepSeek/GLM/DashScope
  (DashScope stattdessen → `enable_thinking`-Bool).
- `toAnthropicThinking(tier, model)` – `output_config.effort` für adaptive Modelle, sonst
  `thinking.budget_tokens`.
- `toGeminiThinking(tier, model)` – `thinking_level` (Gemini 3) oder
  `thinkingConfig.thinkingBudget`-Bucket (Gemini 2.5, Schwellenwerte gemäß openclaw).

### Hygiene der Sampling-Parameter

DeepSeek und GLM lehnen `temperature`/`top_p`/`presence_penalty`/`frequency_penalty` im
Thinking-Modus ab. Wenn ein Übersetzer Thinking für diese Provider aktiviert, muss er diese
Sampling-Parameter aus dem Request-Body strippen.

### Abweichungen der Feldformen bei OpenAI-Kompatibilität

"OpenAI-kompatibel" bedeutet NICHT ein einheitliches Aufwands-Feld. Die kanonische Config ist
das verschachtelte `reasoning: { effort }`-Objekt; `buildReasoningConfig()`
(`pipeline.ts:689-717`) gibt es **wortwörtlich weiter, ohne Wert-Mapping**. Jeder Provider,
dessen Wire-Feld abweicht, muss es in seinem `buildRequest`-Hook umformen. Bekannte Formen:

| Wire-Form                              | Provider                                              | qwen-code-Handling                                                                                       |
| -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| verschachteltes `reasoning: { effort }`| OpenAI Responses, OpenRouter, gpt-5.x                 | Passthrough (Standard) ✅                                                                                |
| flaches Top-Level `reasoning_effort`   | DeepSeek, **GLM/z.ai**, OpenAI Chat Completions, Groq | DeepSeek-Adapter flattet ✅; **GLM hat keinen Adapter → liefert derzeit die verschachtelte Form aus, wahrscheinlich falsch ❌** |
| `enable_thinking`-Bool                 | qwen3 / DashScope                                     | Adapter emittiert Bool (nur Disable); noch keine Aufwands-Tiers                                          |
| `extra_body.thinking.enabled`-Toggle   | GLM                                                   | separater Ein/Aus-Regler neben dem Aufwands-Wert                                                         |
Implikation: Ein reiner Passthrough "funktioniert out-of-the-box" nur bei Providern, die die verschachtelte Struktur akzeptieren. **PR1 muss GLM/z.ai-Flattening hinzufügen** (angelehnt an `deepseek.ts`) und, wenn Qwen ein Effort-Feld hinzufügt, den DashScope-Adapter erweitern, um die von Qwen's API dokumentierte Struktur auszugeben (höchstwahrscheinlich ein flaches `reasoning_effort`). Ein neuer Provider wird nur dann automatisch unterstützt, wenn er die verschachtelte kanonische Struktur akzeptiert; andernfalls benötigt er ein Reshape über einen einzigen Hook.

### Config-Flow & Persistenz

- Neue globale Einstellung **`model.reasoningEffort`**: `'low' | 'medium' | 'high' | 'xhigh' | 'max'`,
  hinzugefügt zu `settingsSchema.ts` (nahe dem `generationConfig`-Knoten, `1412-1504`).
- Zur Build-Zeit des Content-Generators mappt die Config-Schicht `model.reasoningEffort`
  auf `generationConfig.reasoning.effort` (Single Source of Truth für die bestehenden
  Translatoren). Ein globaler Wert für alle Modelle.
- Runtime-Änderung: `config.setReasoningEffort(tier)` hinzufügen (neben `switchModel`,
  `config.ts:~2047`), was das In-Memory-`generationConfig.reasoning.effort` aktualisiert
  und den aktiven ContentGenerator refreshed, anschließend `persistSetting('model.reasoningEffort', tier)`.

### CLI-Oberfläche

- Neue `effortCommand.ts` (angelehnt an `modelCommand.ts:39-79`):
  - `/effort` → `{ type: 'dialog', dialog: 'effort' }`
  - `/effort high` → Tier validieren, `config.setReasoningEffort` aufrufen, persistieren, Ack-Nachricht senden.
  - `completion()` bietet die 5 Tiers an.
- Neue `EffortDialog` Ink-Komponente + Registrierung des `'effort'`-Dialogtyps in
  `commands/types.ts:168-198`. Der Dialog listet die 5 Tiers auf und annotiert, welche
  für das aktuelle Modell geclampt werden (z. B. "max → high für dieses Modell").
- Statuszeile: Das bestehende `model-with-reasoning`-Preset
  (`statusLinePresets.ts:13,46-51`) liest den Live-Effort – kein neues Preset.

### Type-Änderung

Die Effort-Union in `contentGenerator.ts:104-118` erweitern, um `'xhigh'` hinzuzufügen. Der
Deaktivierungspfad `reasoning: false` bleibt unverändert.

## Phasing (kleine PRs, jeder verlinkt ein Issue)

1. **core: ladder + mappings + clamps.** Union um `xhigh` erweitern; den rangbasierten
   zentralen Clamp + `supportedReasoningEfforts` pro Modell hinzufügen; die drei
   Shape-Mapper auslagern; Gemini `medium`/`xhigh↓` + 2.5-Budget-Buckets befüllen,
   OpenAI/GLM `reasoning_effort`-Ausgabe + `max↓xhigh` bestätigen, DashScope
   tier→bool hinzufügen; Sampling-Param-Stripping; überprüfen, ob der bestehende
   Reasoning-Strip-Pfad (`pipeline.ts:597-602`) das History-Replay wie openclaw's
   Sanitizer abdeckt. Unit-Tests pro Provider-Translator + Clamp-Grenzen. Keine UI.
2. **cli: setting + direct command.** `model.reasoningEffort`-Schema, Config-Mapping
   + `setReasoningEffort`-Runtime-Refresh, `/effort <tier>`, Statuszeilen-Live-Read. Tests.
3. **cli: picker dialog.** `EffortDialog` + nacktes `/effort`, Clamp-Hinweise pro Modell.
4. **docs.** `docs/users/` Effort-Seite; Reasoning/Token-Caching-Docs verlinken.

## Testabdeckung

Wichtigste Checks: Jeder Provider-Translator gibt für jeden Tier das korrekte Wire-Feld
für jeden Tier aus, einschließlich der Clamp-Grenzen (`max` bei OpenAI→`xhigh`,
`xhigh`/`max` bei einem Gemini-3 / capped-Anthropic-Modell→`high`); Sampling-Params
werden gestrippt, wenn Thinking für DeepSeek/GLM aktiviert ist; `model.reasoningEffort`
durchläuft einen Roundtrip durch die Einstellungen und in `generationConfig.reasoning.effort`;
`setReasoningEffort` rebuilt den ContentGenerator; die einmalige Clamp-Warnung wird
einmal pro Modell+Tier ausgelöst.