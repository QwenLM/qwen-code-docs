# GenAI- und ARMS-Feld-Alignment

## Scope und Standard-Baseline

Dieses Design richtet die erste Gruppe von Qwen-Code-Span-Attributen aus,
deren Namen, Typen und Bedeutung zwischen den OpenTelemetry-GenAI-Semantic-
Conventions und Alibaba Cloud ARMS LLM Trace übereinstimmen. Es ändert keine
Span-Namen, Span-Kinds, Parenting-Struktur oder Retry-Topologie. Außerdem
dokumentiert es die Opt-in-ARMS-only-Endnutzer-Identitäts-Erweiterung.

Die OpenTelemetry-GenAI-Konvention hat weiterhin Development-Status. Diese
Änderung ist auf Commit
[`2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b`](https://github.com/open-telemetry/semantic-conventions-genai/tree/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b)
gepinnt:

- [Inference-Spans](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-spans.md)
- [Agent-Spans](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-agent-spans.md)
- [GenAI-Registry](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/model/gen-ai/registry.yaml)

Die Streaming-Attribute sind eine schmale Ergänzung, gepinnt auf
[OpenTelemetry Semantic Conventions v1.41.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.41.0/docs/gen-ai/gen-ai-spans.md).
Diese Ergänzung übernimmt nur `gen_ai.request.stream` und
`gen_ai.response.time_to_first_chunk`; sie ist keine vollständige
Aktualisierung der obigen Baseline.

Die ARMS-Baseline sind die [LLM-Trace-Felddefinitionen](https://help.aliyun.com/zh/arms/application-monitoring/developer-reference/llm-trace-field-definition-description).
Eine Aktualisierung einer der beiden Baselines erfordert, diese Matrix neu zu
generieren und zu prüfen.

## Feldvertrag

| Span         | In dieser Phase emittierte Standard-Attribute                                                                                                                                                                            | Quelle und Auslassungsregel                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM          | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.conversation.id`, `gen_ai.request.model`                                                                                                                        | Wird bei der Span-Erzeugung geschrieben. Conversation-ID ist die bestehende Session-ID.                                                                                   |
| LLM-Request  | `gen_ai.request.choice.count`, `gen_ai.request.max_tokens`, `gen_ai.request.temperature`, `gen_ai.request.top_p`, `gen_ai.request.frequency_penalty`, `gen_ai.request.presence_penalty`, `gen_ai.request.stop_sequences` | Wird aus dem ersten Provider-finalen SDK-Request-Objekt gelesen. Ungültige oder nicht verfügbare Werte werden weggelassen; SDK- oder Server-Defaults werden nicht abgeleitet. |
| LLM-Stream   | `gen_ai.request.stream`, `gen_ai.response.time_to_first_chunk`                                                                                                                                                           | Streaming-Requests emittieren `true`; Nicht-Streaming-Requests lassen das Standard-Stream-Flag weg. Die First-Chunk-Zeit wird in Sekunden emittiert, nachdem die erste normalisierte Response eintrifft. |
| LLM-Input    | `gen_ai.input.messages`, `gen_ai.system_instructions`, `gen_ai.tool.definitions`                                                                                                                                         | Sensibles Compact-JSON aus demselben ersten Provider-finalen Request. Jeder vollständige Wert wird unabhängig weggelassen, wenn er ungültig oder zu groß ist.              |
| LLM-Response | `gen_ai.response.id`, `gen_ai.response.model`, `gen_ai.response.finish_reasons`                                                                                                                                          | Nur Provider-Response-Daten. Ein fehlendes Response-Modell wird weggelassen statt durch das Request-Modell ersetzt. Alle Kandidaten-Finish-Reasons sind nach Kandidaten-Index sortiert. |
| LLM-Output   | `gen_ai.output.type`, `gen_ai.output.messages`                                                                                                                                                                           | Der Output-Typ wird für unterstützte Gemini/Vertex-Request-Einstellungen emittiert. Sensible Output-Messages stammen vom finalen physischen Request-Versuch und behalten jeden Kandidaten. |
| LLM-Usage    | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`                                                                            | Nur vom Provider gemeldete nicht-negative sichere Integer. Explizite Null bleibt erhalten. Wenn nur eine Summe gemeldet wird, werden Input/Output weggelassen statt geschätzt. |
| Tool         | `gen_ai.operation.name=execute_tool`, `gen_ai.tool.name`, `gen_ai.tool.description`, `gen_ai.tool.type=function`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`                         | Die Beschreibung sind nicht-sensible statische Registry-Metadaten. Sensible Argumente spiegeln die ausgeführte Invocation wider; das Result wird nur bei einem erfolgreichen Tool-Aufruf emittiert. |
| Agent        | `gen_ai.operation.name=invoke_agent`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.conversation.id`, optional `gen_ai.request.model`                                                                         | Die Beschreibung nutzt den bestehenden 1024-UTF-16-Code-Unit-Trunkierungs-Schwellwert und trennt niemals Surrogate-Paare. Interne Invocation-IDs bleiben privat.          |

Private Attribute ohne exakte Standard-Äquivalente bleiben aus
Kompatibilitätsgründen verfügbar, sofern sie nicht unten explizit zur
Entfernung aufgelistet sind. Exakt-äquivalente private Aliase und ungültige
GenAI-Aliase werden ohne Dual-Write-Phase entfernt:

| Entferntes Attribut                                  | Ersatz                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| LLM `qwen-code.model`                                  | `gen_ai.request.model`; Interaktions-Spans verwenden weiterhin `qwen-code.model`, da sie keine GenAI-Inference-Spans sind |
| LLM `response_id`                                      | `gen_ai.response.id`; API-Response/Error-Logs behalten ihr bestehendes `response_id`-Schema                            |
| LLM `input_tokens`                                     | `gen_ai.usage.input_tokens`, wenn der Provider eine Input-Aufschlüsselung meldet                                       |
| LLM `output_tokens`                                    | `gen_ai.usage.output_tokens`, wenn der Provider eine Output-Aufschlüsselung meldet                                     |
| LLM `cached_input_tokens`                              | `gen_ai.usage.cache_read.input_tokens`, wenn der Provider Cache-Reads meldet                                           |
| `qwen-code.tool`-Span `tool.name`                      | `gen_ai.tool.name`; Blocked-on-User- und Hook-Spans verwenden weiterhin `tool.name`                                    |
| `gen_ai.usage.cached_tokens`                           | `gen_ai.usage.cache_read.input_tokens`, wenn der Provider Cache-Reads meldet                                           |
| LLM `llm_request.stream`                               | `gen_ai.request.stream`; Streaming emittiert `true`, Nicht-Streaming lässt das Attribut gemäß Semantic Convention weg  |
| `gen_ai.server.time_to_first_token`                    | Wird nicht emittiert; es ist nicht äquivalent zum Standard-First-Chunk-Attribut                                         |
| `gen_ai.usage.reasoning_tokens`                        | Kein gemeinsames ARMS/GenAI-Attribut in dieser Baseline; weiterhin das private `thoughts_token_count` abfragen          |
| LLM `system_prompt*`                                   | `gen_ai.system_instructions`; OpenAI-System/Developer-Messages werden in `gen_ai.input.messages` dargestellt           |
| LLM `tools`, `tool_schema`-Events                      | `gen_ai.tool.definitions`                                                                                               |
| LLM `response.model_output*`                           | `gen_ai.output.messages`                                                                                                |
| Tool `tool_input*`                                     | `gen_ai.tool.call.arguments`                                                                                            |
| Tool `tool_result*`                                    | `gen_ai.tool.call.result`                                                                                               |
| `tools_count`, Hash/Preview/Länge/Trunkierungs-Metadaten | Kein Standard-Äquivalent; entfernt                                                                                   |

`gen_ai.response.finish_reasons` behält jetzt die rohen Strings des Providers
für alle Kandidaten statt der bisherigen Gemini-normalisierten Werte.
Bestehende Queries, die Werte wie `STOP` oder `MAX_TOKENS` filtern, müssen zu
den Provider-Werten migrieren, etwa `stop`, `length`, `tool_calls` oder
`end_turn`.

`gen_ai.response.time_to_first_chunk` verwendet einen monotonen Timer von
unmittelbar vor dem gewrappten Provider-Aufruf bis zur ersten normalisierten
`GenerateContentResponse`, die `LoggingContentGenerator` beobachtet.
Provider-Adapter können rohe Protokoll-Frames filtern oder zusammenführen,
bevor sie den Logging-Wrapper erreichen, sodass Frames, die ein Adapter
verwirft (zum Beispiel der Empty-Response-Filter der OpenAI-Pipeline), von
dieser Messung ausgeschlossen sind und der aufgezeichnete Wert später als der
tatsächliche erste Netzwerk-Frame liegen kann. Metadaten-only und
Usage-only normalisierte Responses, die die Adapter-Filterung überstehen,
zählen als Chunks. Das Attribut bleibt erhalten, wenn der Stream später
fehlschlägt, abgebrochen wird oder in einen Timeout läuft, und wird
weggelassen, wenn kein Chunk eintrifft.

Der interne `ttftMs`-Timer bleibt die Latenz bis zum ersten nutzer-sichtbaren
Output und speist weiterhin `ApiResponseEvent.ttft_ms`, `sampling_ms`,
`output_tokens_per_second` und die API-Request-Breakdown-Metrik. Daher ist
`duration_ms - gen_ai.response.time_to_first_chunk * 1000` nicht
`sampling_ms`.

Bestehende Streaming-Span-Queries sollten `llm_request.stream=true` durch
`gen_ai.request.stream=true` ersetzen; Nicht-Streaming-Spans werden durch das
Fehlen von `gen_ai.request.stream` identifiziert (der alte
`llm_request.stream=false`-Filter matcht jetzt null Zeilen). Span-`ttft_ms`
bleibt für die Latenz bis zum ersten nutzer-sichtbaren Output verfügbar;
`gen_ai.response.time_to_first_chunk` ist ein unabhängiges Standard-Attribut,
das die Latenz bis zum ersten normalisierten Chunk in Sekunden misst.

## Provider- und Operation-Auflösung

Die Auflösung ist eine reine Funktion über der effektiven
Content-Generator-Konfiguration. Sie liefert niemals eine URL, Credential,
einen beliebigen Proxy-Hostnamen oder einen aus dem Modellnamen abgeleiteten
Wert zurück.

1. Qwen OAuth und eine exakte `DASHSCOPE_PROXY_BASE_URL`-Übereinstimmung
   lösen zu `dashscope` auf.
2. Ein grenzsicherer Hostname-Match erkennt Alibaba-Model-Studio-Endpoints
   und interne Alibaba-Gateways, Azure OpenAI sowie die unterstützten
   Drittanbieter-Endpoints (DeepSeek, xAI, Mistral, MiniMax, Z.AI, ModelScope,
   MiMo, OpenRouter und Requesty).
3. Ist der Host unbekannt, identifiziert ein bekannter `apiKeyEnvKey` den
   konfigurierten Provider. Die Host-Identität gewinnt bei Konflikten.
4. Unbekannte Endpoints fallen auf den Protokoll-Provider zurück: `openai`,
   `anthropic`, `gcp.gemini` oder `gcp.vertex_ai`.

OpenAI-kompatible, Anthropic- und Qwen-OAuth-Requests verwenden die Operation
`chat`. Gemini- und Vertex-AI-Requests verwenden `generate_content`.

## Request-Parameter

Request-Attribute werden erhoben, nachdem Provider-Adapter Defaults,
Overrides, Entfernung nicht unterstützter Felder und Output-Window-Clamps
angewendet haben, unmittelbar vor dem Aufruf des Provider-SDK. Dies ist das
für Qwen Code sichtbare finale SDK-Request-Objekt, nicht die ursprüngliche
logische Konfiguration oder der serialisierte HTTP-Body. Ein logischer
LLM-Span zeichnet nur seinen ersten solchen Request-Snapshot auf.

| Standard-Attribut                    | OpenAI-kompatibel und Qwen OAuth                             | Anthropic              | Gemini und Vertex AI        |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------- | --------------------------- |
| `gen_ai.request.choice.count`      | `n`                                                          | Nicht anwendbar        | `config.candidateCount`     |
| `gen_ai.request.max_tokens`        | `max_tokens`, `max_completion_tokens` oder `max_new_tokens` | `max_tokens`           | `config.maxOutputTokens`    |
| `gen_ai.request.temperature`       | `temperature`                                                | `temperature`          | `config.temperature`        |
| `gen_ai.request.top_p`             | `top_p`                                                      | `top_p`                | `config.topP`               |
| `gen_ai.request.frequency_penalty` | `frequency_penalty`                                          | Derzeit nicht gesendet | `config.frequencyPenalty`   |
| `gen_ai.request.presence_penalty`  | `presence_penalty`                                           | Derzeit nicht gesendet | `config.presencePenalty`    |
| `gen_ai.request.stop_sequences`    | `stop`                                                       | `stop_sequences`       | `config.stopSequences`      |

Endliche Zahlen und sichere Integer bleiben exakt erhalten, einschließlich
Null und negativer Werte bei fehlgeschlagenen Provider-Requests. Die
Choice-Anzahl wird weggelassen, wenn sie eins ist. Stop-Sequenzen müssen ein
vollständiges String-Array sein; OpenAIs Single-String-Form wird zu einem
Ein-Element-Array normalisiert. Leere Arrays bleiben erhalten, und gemischte
Arrays werden weggelassen statt gefiltert. Explizite Adapter-Defaults werden
aufgezeichnet, während implizite SDK- oder Server-Defaults nicht abgeleitet
werden.

Wenn mehrere OpenAI-kompatible Output-Budget-Aliase vorhanden sind, wird das
Standard-Maximum nur emittiert, wenn alle vorhandenen Werte gültige sichere
Integer und gleich sind. Widersprüchliche Werte werden weggelassen, da
kompatible Endpoints keine gemeinsame Vorrangregel haben.

## Content- und Tool-Payloads

Sensibler GenAI-Content wird nur erfasst, wenn
`telemetry.includeSensitiveSpanAttributes` aktiviert ist. Qwen Code liest
nicht `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`, daher gibt es
einen einzigen Content-Capture-Schalter. OpenAI-kompatible, Anthropic-,
Gemini- und Vertex-Adapter konvertieren ihre Provider-finalen SDK-Requests
und rohen Response-Strukturen in die mit diesem Design gepinnten
JSON-Schemas.

Der erste physische Request-Versuch liefert Input-Messages,
System-Instruktionen und Tool-Definitionen. Responses sind
Generations-gebunden: Ein Provider-Fallback oder ein Required-Thinking-Retry
startet einen neuen Response-Akkumulator, und späte Chunks eines älteren
Versuchs werden ignoriert. Streaming-Akkumulatoren behalten kanonische Parts
statt roher Chunks. Partielle Fehlschläge markieren unvollendete Kandidaten
mit `error`; eine erfolgreiche Response mit einem Kandidaten ohne explizite
Finish-Reason lässt das vollständige Output-Message-Attribut weg.

Jedes JSON-Attribut wird kompakt serialisiert und unabhängig durch
`telemetry.sensitiveSpanAttributeMaxLength` begrenzt. Ungültige, zyklische,
unvollständige oder zu große Attributwerte werden als Ganzes weggelassen;
JSON wird niemals trunkiert. Innerhalb von `gen_ai.tool.definitions` sind
`type` und `name` erforderliche Identitäten, sodass eine ungültige Identität
das vollständige Attribut weglässt. `parameters` ist im Standard-Schema
optional; wenn ein vom Provider geliefertes Parameter-Schema nicht zu
Draft-07 normalisiert werden kann, wird nur diese optionale Property
weggelassen, während die geordnete Tool-Identitätsliste erhalten bleibt.
Leere Arrays und Objekte bleiben erhalten, wenn der Provider sie explizit
sendet oder zurückgibt. Beim Default-Limit von 1 MiB liegt das
anwendungsseitige theoretische Maximum bei etwa 4 MiB sensibler Attribute pro
LLM-Span und 2 MiB pro Tool-Span. Collectors und Backends können niedrigere
Limits vorgeben.

Tool-Argumente werden unmittelbar vor der Ausführung aus den finalen
Invocation-Parametern erfasst, nach Berechtigungs- und Edit-Hooks. Ein
Tool-Result wird nur nach einem erfolgreichen Aufruf und erfolgreicher
Nachbearbeitung erfasst, aus dem finalen `FunctionResponse.response`-Objekt,
das an das Modell zurückgegeben wird. Beide Wurzeln müssen JSON-Objekte sein.
`gen_ai.tool.description` stammt aus der statischen Registry-Beschreibung und
ist nicht sensibel; es ist auf 4096 UTF-16-Code-Units begrenzt, bewahrt
Surrogate-Paare und hängt beim Kürzen `…[truncated]` an. Agent-Beschreibungen
und Span-Errors behalten ihre 1024-Unit-Limits.

## Response- und Usage-Herkunft

Provider-Konverter heften interne Herkunft an normalisierte Gemini-Usage-
Objekte über eine `WeakMap`. Sie zeichnet auf, ob ein Cache-Read-Feld
tatsächlich vorhanden war, sowie Anthropic-Cache-Creation-Tokens. Dies
bewahrt die öffentliche Response-JSON-Form und lässt die Garbage Collection
dem normalisierten Usage-Objekt folgen.

Wenn ein OpenAI-kompatibler Provider nur `total_tokens` meldet, bleibt die
normalisierte Summe für bestehende interne Consumer verfügbar, aber es wird
kein Input/Output-Split synthetisiert und keines der beiden
Standard-Usage-Attribute emittiert.

OpenAI `response.model`/`chunk.model` und das Anthropic-Message-Modell werden
als `modelVersion` bewahrt. Ein fehlendes Provider-Modell bleibt für Tracing
fehlend; der Request-Modell-Fallback bleibt auf bestehende API-Logs und
UI-Verhalten beschränkt. Stream-Merging trägt das letzte bekannte
Provider-Modell und die Usage-Herkunft in die terminale Response.
Anthropic-`message_start`-Input- und Cache-Usage wird an den ersten darauf
folgenden yielded Chunk angehängt, damit partielle Stream-Fehlschläge die vom
Provider gemeldete Usage behalten, ohne einen Output-Count zu synthetisieren.

## ARMS-Konfiguration

Die automatische GenAI-Anwendungserkennung von ARMS erfordert dieses
Resource-Attribut:

```json
{
  "telemetry": {
    "resourceAttributes": {
      "acs.arms.service.feature": "genai_app"
    }
  }
}
```

Qwen Code injiziert dieses herstellerspezifische Resource-Attribut oder
`gen_ai.span.kind` nicht. ARMS kann LLM-, Tool- und Agent-Rollen aus
`gen_ai.operation.name` ableiten.

### ARMS-Endnutzer-Identitäts-Erweiterung

`gen_ai.user.id` ist ein ARMS-Span-Common-Attribut und nicht Teil der oben
gepinnten OpenTelemetry-GenAI-Baseline. Qwen Code emittiert es nur, wenn der
Operator explizit `telemetry.userId` oder `QWEN_TELEMETRY_USER_ID`
konfiguriert. Der Wert wird bei der Erzeugung auf den Interaktions-Span
gesetzt und über den bestehenden In-Prozess-Kontext zu LLM-, Tool- und
Agent-Spans propagiert, einschließlich verlinkter Root-Fork/Hintergrund-
Agents. Tool-Result-Fortsetzungen lösen dieselbe logische Interaktion per
Prompt-ID auf, ohne das Span-Parenting zu ändern; dieser minimale
Identitätseintrag läuft mit dem bestehenden 30-Minuten-Span-Safety-Net-TTL
ab.

Der Wert wird niemals abgeleitet, generiert, in Resource/Logs/Metrics
geschrieben oder in ausgehenden Baggage gesetzt. Qwen Code schreibt
`enduser.id` oder `user.id` nicht per Dual-Write. Ein früheres
`telemetry.resourceAttributes.user.id` bleibt eine generische
Resource-Dimension und muss bei der Migration explizit entfernt werden. Da
die Einstellung prozessweit gilt, wird sie nur unterstützt, wenn ein Prozess
einen Endnutzer repräsentiert; Request-scoped Identität für geteilte
Daemon- und Channel-Deployments ist zurückgestellt, bis deren
vertrauenswürdige Caller-Identität Ende-zu-Ende verdrahtet werden kann.

## Zurückgestellte Arbeit

- `seed` und `top_k` haben in den Baselines inkompatible ARMS- und
  GenAI-Typen.
- Embedding benötigt einen korrekten Requested-Model-Lebenszyklus vor dem
  Tracing.
- ARMS Time-to-first-token und OpenTelemetry Time-to-first-chunk
  unterscheiden sich in Name, Einheit und Bedeutung. Qwen Code emittiert das
  Standard-`gen_ai.response.time_to_first_chunk` neben dem privaten
  `ttft_ms` und verspricht keine automatische Befüllung eines
  ARMS-First-Token-Dashboards.
- Vollständige GenAI-Span-Benennung, CLIENT-Span-Kind und logische
  Retry-Topologie sind ein separates Compliance-Projekt.
