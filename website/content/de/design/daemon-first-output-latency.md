# Daemon-First-Output-Latenz

- **Tracking**: #7757
- **Immediate-Prompt-Follow-up**: #7982
- **Hintergrund**: #7264
- **Umfang**: vom Daemon/ACP-Client beobachtbare Latenz
- **Status**: Messung und Immediate-Prompt-Attribution

## Entscheidung und Umfang

Der erste PR ist reine Messung: ein Opt-in-Benchmark, reine Klassifikations-/Statistik-Helfer, Tests und versionierte Artefakte. Er ändert das Produktions-Startverhalten nicht.

Ein separater Provider-Preparation-Prototyp ist nur erlaubt, wenn die Single-Bundle-Baseline ihr Gate besteht. Die Veröffentlichung dieses Prototyps erfordert dann, dass separate Kontroll- und Kandidaten-Bundles jedes Latenz-, Ressourcen-, Funktions- und Cleanup-Gate in diesem Dokument bestehen. Ein gültiges negatives Ergebnis beendet die Arbeit.

Der Benchmark misst vom Prozess-Spawn bis zur ersten modellabgeleiteten Ausgabe, während lokale Vorbereitung, Provider-Request-Ankunft, erste Ausgabe, erster Antworttext und terminale Vervollständigung getrennt bleiben. Das bestehende Produktions-`ttft_ms` bleibt unverändert: Es misst weiterhin vom Provider-Dispatch bis zum ersten sichtbaren Inhalt und nimmt kein Lazy-Loading oder lokale Prompt-Vorbereitung auf.

Außerhalb des Umfangs liegen TUI-/WebShell-/Editor-Rendering, Prompt-Caching, Kompression, Modell-Thinking-/Tool-Verhalten, Netzwerk-Preconnection, Latenzoptimierung mit echtem Modell, Produktions-Telemetrie-Änderungen, öffentliche Lifecycle-APIs, Protokollfelder, Konfiguration und Feature-Flags.

## Repository- und Runner-Vertrag

| Pfad                                                                 | Verantwortung                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `integration-tests/cli/qwen-daemon-first-output-benchmark.test.ts` | Opt-in-Runner, Fake-Provider, isolierter Prozess-Lifecycle, Baseline-/Vergleichsprotokolle und Artefakt-Schreiben |
| `integration-tests/cli/_first-output-benchmark.ts`                 | Reines Event-Tracking, Klassifikation, Perzentile, gepaarter Bootstrap und Entscheidungs-Inputs                  |
| `integration-tests/cli/_first-output-benchmark.test.ts`            | Deterministische Tests für den reinen Vertrag                                                                     |
| `integration-tests/fake-openai-server.ts`                          | Bestehender Fake-Provider mit Opt-in-Verbindungsschließung für unverfälschte Cold-/Warm-Messungen                 |

Der Runner ist deaktiviert, außer wenn `QWEN_FIRST_OUTPUT_BENCHMARK=1`. Seine zwei Input-Modi schließen sich gegenseitig aus:

- **Baseline**: `BENCHMARK_CLI_PATH`.
- **Vergleich**: sowohl `BENCHMARK_CONTROL_CLI_PATH` als auch `BENCHMARK_CANDIDATE_CLI_PATH`.

`BENCHMARK_POST_SESSION_DWELL_MS` ist nur für Vergleiche, akzeptiert exakt `0`, `100` oder `500` und steht standardmäßig auf `0`. `BENCHMARK_MEASURED_PAIRS` ist ebenfalls nur für Vergleiche und akzeptiert exakt `10` oder `30`; der Default ist `10` für die 500-ms-Diagnose und sonst `30`. Ein 500-ms-Lauf erfordert 10 Paare und die 0/100-ms-Läufe erfordern 30, sodass eine Diagnose nicht als entscheidungsrelevant falsch gelabelt werden kann. Formale Phase-2-Läufe rufen den Runner separat für die drei Dwell-Szenarien auf; Samples aus verschiedenen Dwell-Werten werden nie gepoolt. Fehlende oder gemischte Modi, identische Vergleichs-Bundles, unlesbare Pfade, nicht unterstützte Dwell- oder Paarzahlen und nicht zusammenpassende Dwell-/Sample-Pläne scheitern als `invalid_configuration` vor dem Sampling.

Der Dwell ist an der SSE-Bereitschaft verankert statt an der Session-Bereitschaft. Der SSE-Connect liegt zwischen beiden, daher würde eine Verankerung an `sessionReady` erlauben, dass ein langsamer Connect das gesamte Fenster konsumiert und ein 100-ms-Szenario stillschweigend zu einem Immediate-Prompt-Lauf reduziert, der trotzdem seinen konfigurierten Dwell meldet. `sseReadyToPromptMs` zeichnet das Idle-Fenster auf, das jedes Sample tatsächlich erhalten hat.

Millisekundenskalige Zahlen sind nur aussagekräftig, wenn nichts anderes um den Host konkurriert, daher ist der Runner von der geteilten Integrations-Konfiguration ausgenommen und hat seine eigene serielle Konfiguration in `integration-tests/vitest.firstoutput.config.ts` (`fileParallelism: false`, serielle Ausführung, `retry: 0`). Die reinen Helfer-Tests laufen weiterhin in der geteilten Suite. Den Benchmark ausführen mit:

```text
QWEN_FIRST_OUTPUT_BENCHMARK=1 QWEN_SANDBOX=false BENCHMARK_CLI_PATH=... \
  npx vitest run --config integration-tests/vitest.firstoutput.config.ts
```

Artefakte werden unterhalb von `.qwen/investigations/daemon-first-output-benchmark/` geschrieben, außerhalb des Einweg-Laufverzeichnisses des Integrations-Harness. Dies behält erfolgreiche, fehlgeschlagene und Negativ-Ergebnis-Läufe nach dem globalen Teardown, ohne `KEEP_OUTPUT` zu benötigen.

## Messvertrag

### Eine Uhr

Alle Latenz-Zeitstempel verwenden `performance.now()` im Eltern-Harness. Keine Dauer kombiniert Daemon-, ACP-Kind-, Provider- oder Wall-Clocks. Der Daemon-FIFO-Queue-Wait-Wert ist eine bestehende eigenständige Dauer, die nach Abschluss des isolierten Prompts gelesen wird; er wird nie von einem Eltern-Zeitstempel subtrahiert.

| Zeitstempel                | Vom Client beobachtbare Definition                                                     |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `processSpawnAt`           | unmittelbar vor dem Daemon-`spawn`                                                     |
| `sessionReadyAt`           | erfolgreiche Session-Antwort vollständig gelesen und validiert                          |
| `sseReadyAt`               | erster SSE-Epochen-Callback beobachtet; der Dwell-Anker                                 |
| `promptStartedAt`          | unmittelbar vor dem Start des nicht blockierenden Prompt-Requests                       |
| `promptAcceptedAt`         | HTTP-`202`-Body validiert, einschließlich Top-Level-`promptId` und Replay-Cursor        |
| `userEchoAt`               | passendes weitergeleitetes `user_message_chunk` aus dem SSE geparst                     |
| `providerRequestArrivalAt` | Fake-Provider akzeptiert den gemessenen Request, vor seinem festen Delay                |
| `providerReadyAt`          | fester 50-ms-Delay ist abgelaufen, unmittelbar bevor der Response-Stream verfügbar ist  |
| `firstModelOutputAt`       | erstes qualifizierendes SSE-Event für die akzeptierte Top-Level-`promptId` geparst      |
| `firstAnswerTextAt`        | erstes qualifizierendes Antworttext-Event geparst; nullable                             |
| `terminalAt`               | passendes `turn_complete` oder `turn_error` geparst                                     |

Die rohen Zeitstempel erzeugen diese exakten Metriken:

| Metrik                                 | Berechnung                                            |
| -------------------------------------- | ----------------------------------------------------- |
| `processToSessionReadyMs`              | `sessionReadyAt - processSpawnAt`                     |
| `sseReadyToPromptMs`                   | `promptStartedAt - sseReadyAt`, diagnostisch          |
| `promptToAcceptanceMs`                 | `promptAcceptedAt - promptStartedAt`                  |
| `acceptanceToProviderRequestArrivalMs` | `providerRequestArrivalAt - promptAcceptedAt`, vorzeichenbehaftet |
| `promptToUserEchoMs`                   | `userEchoAt - promptStartedAt`                        |
| `userEchoToProviderRequestArrivalMs`   | `providerRequestArrivalAt - userEchoAt`, vorzeichenbehaftet       |
| `daemonPromptQueueWaitMs`              | bestehende Daemon-FIFO-Queue-Wait-Dauer               |
| `promptToProviderRequestArrivalMs`     | `providerRequestArrivalAt - promptStartedAt`          |
| `promptToFirstModelOutputMs`           | `firstModelOutputAt - promptStartedAt`                |
| `promptToFirstAnswerTextMs`            | `firstAnswerTextAt - promptStartedAt`, nullable       |
| `providerReadyToFirstModelOutputMs`    | `firstModelOutputAt - providerReadyAt`                |
| `promptToTerminalMs`                   | `terminalAt - promptStartedAt`                        |
| `processToFirstModelOutputMs`          | `firstModelOutputAt - processSpawnAt`                 |

`promptAcceptedAt` ist diagnostisch, kein Latenz-Ursprung: Ein Provider-Request oder -Event kann dem Empfang des HTTP `202` vorausgehen. Der Daemon publiziert das passende User-Echo, bevor er den ACP-Prompt weiterleitet, aber die SSE-Zustellung kann weiterhin das Rennen gegen die Provider-Request-Ankunft verlieren. Daher sind sowohl `acceptanceToProviderRequestArrivalMs` als auch `userEchoToProviderRequestArrivalMs` vorzeichenbehaftete Offsets und negative Werte sind gültig. Jede andere Dauer muss nicht-negativ sein. Der Queue-Wait-Zähler muss exakt einmal pro isoliertem Prompt fortschreiten und ein endliches nicht-negatives `lastMs` behalten; andernfalls ist das Sample ungültig, weil der Wert nicht sicher korreliert werden kann. Fehlende erforderliche Zeitstempel oder nicht-endliche Werte invalidieren das Sample. Der Harness besitzt die 30-Sekunden-Deadline für die SSE-Bereitschaft; der SDK-Connect-Timeout wird aufgezeichnet und fünf Sekunden später gesetzt, sodass die Timer-Reihenfolge `sse_connect_timeout` nicht in einen anderen Fehlercode ändern kann.

Die Immediate-Prompt-Attributionsmetriken stoppen bewusst an bestehenden Grenzen. Zusammen unterscheiden sie Client-/Routen-Akzeptanz, das weitergeleitete Pre-Forward-User-Echo, Daemon-FIFO-Queueing und das verbleibende ACP-Kind-/Lokale-Vorbereitungs-Intervall, ohne einen prozessübergreifenden Zeitstempel, ein Protokollfeld oder Produktions-Telemetrie hinzuzufügen. Die Echo-Grenze enthält die SSE-Relay-Zeit und ist approximativ statt eines Daemon-internen Zeitstempels. Diese Metriken teilen das verbleibende Intervall nicht zwischen ACP-Transport, Prompt-Vorbereitung, Provider-Loader-Settlement und Request-Konstruktion auf; tiefere Instrumentierung erfordert separate Evidenz und Design.

### Prompt- und Event-Korrelation

Der SSE-Collector ist vor dem Prompt aktiv oder setzt von dem davor liegenden Cursor fort und puffert eine feste Anzahl von Events, bis der `202` die akzeptierte Top-Level-`promptId` liefert. Der Akzeptanz-Umschlag muss eine nicht-leere `promptId` und eine nicht-negative Ganzzahl `lastEventId` enthalten; ein Legacy-Synchronergebnis wird nur an seinem `stopReason` erkannt, während jede andere fehlerhafte Antwort abgelehnt wird. Ein Prompt-Akzeptanz-Timeout bricht den zugrunde liegenden Request vor dem Sample-Teardown ab. Der Collector wertet dann gepufferte und Live-Events in ursprünglicher Ankunftsreihenfolge aus und akzeptiert nur eine exakte Top-Level-ID-Übereinstimmung. Frühere, ID-lose und fremde Prompt-Events werden ignoriert; bei Buffer-Overflow latcht der Tracker den Fehler und stoppt das Puffern, sodass das Sample invalidiert wird und die überschüssigen Events verworfen werden.

Provider-Requests tragen die Daemon-`promptId` nicht. Jeder isolierte Fake-Provider erlaubt daher nur jeweils einen erwarteten gemessenen Request und matcht seinen eindeutigen Sentinel mit fester Länge. Sein Zeitstempel kann vor dem `202` gepuffert werden; ein zusätzlicher, fehlender, verfrühter oder gleichzeitiger Request lässt das Sample scheitern.

Das erste qualifizierende Event bestimmt `firstOutputAt`:

| Event                                 | Art                                      |
| ------------------------------------- | ---------------------------------------- |
| nicht-leerer `agent_message_chunk`-Text | `answer_text`, und First-Answer-Grenze |
| nicht-leerer `agent_thought_chunk`-Text | `thought_text`                         |
| wohlgeformter initialer `tool_call`   | `tool_call`                              |

Nicht-leer bedeutet, dass die dekodierte Textlänge größer als null ist; Text wird nicht getrimmt oder umgeschrieben. Replay-/Status-Frames, lokale diskrete Nachrichten (einschließlich Slash-Command- und Hintergrund-Benachrichtigungs-Ausgabe), User-Echo, Chunks nur mit Rolle oder Usage, Kompressions-Diagnosen, fehlerhafte Updates und `tool_call_update` zählen nicht. `turn_error` scheitert immer. `turn_complete` vor qualifizierender Ausgabe scheitert ebenfalls. Der reine Tracker erlaubt gültige Thought- oder Tool-first-Turns mit einer null-Antwort-Metrik, während der Live-Fake-Provider seinen bekannten Antwort-Sentinel erzeugen muss.

## Fake-Provider und Isolation

Der Loopback-nur-OpenAI-kompatible Fake-Provider zeichnet die Request-Ankunft auf, validiert Request/Modell, wartet auf einen konfigurierten 50-ms-Timer, zeichnet den tatsächlich vergangenen Delay und `providerReadyAt` auf, emittiert einen gestreamten Antwort-Sentinel und schließt normal ab. Benchmark-Responses verwenden explizit `Connection: close`, sodass der Warm-Turn nicht von einer TCP-Verbindung profitieren kann, die vom Cold-Turn geöffnet wurde; Netzwerk-Preconnection bleibt außerhalb der gemessenen Optimierung. Der Delay trennt lokale Pre-Request-Arbeit von Response-/Event-Propagation; er modelliert keine echte Latenzverteilung. Reine Tests decken Thought- und Tool-first-Fixtures ab, ohne Nichtdeterminismus zu Live-Läufen hinzuzufügen.

Jeder Baseline-Prozess und jeder Vergleichsarm erhält einen frischen Daemon-/ACP-Prozessbaum, Workspace, Home und `QWEN_HOME`, ephemere Daemon-/Provider-Ports, Event-Collector und Request-Ledger. Samples laufen seriell.

Node-Compile-Caches sind zu Beginn formaler Läufe leer, nach Bundle und Modus isoliert, werden nur von ausgeschlossenen Warmups befüllt und dann nur von demselben Bundle wiederverwendet. Das Artefakt zeichnet jedes Cache-Verzeichnis für die Provenienz auf, aber ein sauberer Lauf entfernt es während des Teardowns, sodass der aufgezeichnete Pfad danach nicht existieren muss. Kontrolle und Kandidat teilen sie nie. Warmup-Beobachtungen bleiben im Artefakt mit `measured: false`.

Das Kind startet von einer minimalen Environment-Allowlist. Es verwendet feste Locale/Zeitzone, isolierte beschreibbare Pfade, deaktivierte Telemetrie-/Update-Checks, Dummy-Provider-Konfiguration und geleerte echte Credentials und Proxy-Variablen. Das Artefakt zeichnet nur bewusst gelieferte nicht-geheime Werte auf.

Formale Vergleiche verwenden Release-Bundles, die aus demselben Lockfile auf demselben idle 2-vCPU-Linux-Host gebaut wurden. Das Artefakt zeichnet aufgelöste Pfade, SHA-256-Hashes, Quell-Revisionen falls verfügbar, Node/OS/CPU/Speicher und Load-Metadaten auf. Filesystem-Page-Cache- und Scheduler-Rauschen können nicht zuverlässig geflusht werden, daher sind AB/BA-Reihenfolge und das Reihenfolge-Sensitivitäts-Gate verpflichtend.

## Phase 1: Single-Bundle Cold/Warm-Baseline

Führe 2 ausgeschlossene Warmup-Prozesse aus, dann 50 gemessene Prozesse. Jeder gemessene Prozess:

1. erzeugt eine frische `sessionScope: thread`-Session und sendet einen sofortigen Prompt fester Länge (`cold`);
2. wartet auf seinen validierten Terminal;
3. hält die erste Session offen, erzeugt eine separate `sessionScope: thread`-Session auf demselben ACP-Kindprozess; und
4. sendet einen Prompt gleicher Länge mit einem separaten Sentinel (`warm`).

Der Runner zeichnet die ACP-Kind-PID nach beiden Turns auf und invalidiert das Sample, außer genau ein unverändertes Kind hat sie bedient. Erst nach dem zweiten Turn schließt er beide Sessions. Die zweite Session hat daher einen frischen Pro-Session-Lazy-Provider-Wrapper, aber warme ACP-prozessweite ESM-/Runtime-Caches. Das Paar begrenzt die einmaligen lokalen Kosten des ersten Durchlaufs eines Prozesses durch den Prompt-Pfad, ohne Konfounding durch Konversationshistorie. Die Provider-Konstruktion ist eine Komponente dieser Kosten; der erste Prompt bezahlt auch den ersten Daemon-Routen-Hit, den ersten ACP-IPC-Round-Trip, JIT-Warm-up und jeden fremden Lazy-Import. Das Delta ist daher eine Obergrenze für das, was das Preloaden des Providers zurückgewinnen könnte, nicht eine Schätzung des Provider-Ladens, und ein bestandenes Gate etabliert nicht, dass der Provider einen bestimmten Anteil daran ausmacht. Die Attribution ist das, was die gepaarten Phase-2-Vergleichstests prüfen. Beide Sessions konstruieren ihren eigenen Provider weiterhin beim Prompt, sodass Arbeit, die der Prototyp möglicherweise in den Dwell verschiebt, nicht gutgeschrieben wird; das Gate ist konservativ. Zweite-Session-Prozess-bis-Metriken sind diagnostisch.

Die Baseline erwartet exakt zwei Provider-Requests pro Prozess. Alle 50 Cold-/Warm-Paare müssen gültig sein. Cold und Warm teilen einen Prozess, daher sind ihre Deltas gepaarte statt unabhängige Samples, und das Gate wird auf dem gepaarten Median mit seinem geseedeten 95%-Bootstrap-Intervall entschieden:

```text
providerDelta[i] =
  cold promptToProviderRequestArrivalMs[i] -
  warm promptToProviderRequestArrivalMs[i]

providerDeltaCiLow = untere Grenze des 95%-KI von median(providerDelta)
```

Phase 1 besteht, wenn entweder:

```text
providerDeltaCiLow >= 25 ms
```

oder:

```text
providerDeltaCiLow >= 10% * P50(cold promptToFirstModelOutputMs)
```

Die untere Grenze statt der Punktschätzung muss die Schwelle überschreiten, sodass ein Delta, das sie nur knapp überschreitet, einen Prototyp nicht auf Basis von Rauschen autorisieren kann. Die Differenz der beiden P50s wird weiterhin für Kontinuität aufgezeichnet, entscheidet aber nichts mehr. Cold ist immer die erste Session, daher kann das Paar nicht reihenfolgebalanciert werden, wie es ein Phase-2-Vergleich kann; dies ist eine bekannte Einschränkung des Konstrukts, kein Versäumnis.

Andernfalls wird das Artefakt behalten und die Produktionsarbeit stoppt.

## Vergleich und Statistik

Jeder Vergleichs-Dwell verwendet 2 ausgeschlossene Warmup-Paare, gefolgt von 30 gemessenen Paaren, außer dem explizit diagnostischen 500-ms-Szenario, das 10 verwendet und immer ein nicht aussagekräftiges Top-Level-Ergebnis meldet. Ungerade Paare fahren Kontrolle dann Kandidat (AB); gerade Paare fahren Kandidat dann Kontrolle (BA). Jeder Arm hat frischen Zustand, und jedes aufgezeichnete Delta ist `Kandidat - Kontrolle`, sodass negative Latenz schneller ist.

Fehlgeschlagene Arme bleiben im Roh-Output und invalidieren ihre Paare. Sie werden nicht ersetzt. Das Sampling stoppt nach dem ersten ungültigen Prozess oder abgeschlossenen Paar. Die äußere Vitest-Deadline wird konservativ aus dem größten legalen Sample-Plan und jedem festen Lifecycle-Timeout abgeleitet, mit Scheduler-Marge, sodass selbst legale Deadline-nahe Samples das Artefakt-Schreiben nicht preempten können. Der Notfall-Teardown hat seine eigene feste Hook-Deadline. Es gibt keine Ausreißer-Löschung, Winsorisierung, Teilmengen-Auswahl oder Vitest-Retry. Jedes ungültige primäre Paar invalidiert den formalen Lauf.

Für jede Metrik werden Nearest-Rank P50/P90/P99 und Mittelwert für jeden Arm, gepaarter Median-Delta, Siege/Gleichstände und AB/BA-Untergruppen-Mediane berichtet. P90/P99 sind bei 30 Paaren nur deskriptiv; ohne mindestens 100 Paare wird keine P95- oder Tail-Latenz-Schlussfolgerung gezogen.

Zwei Median-Definitionen koexistieren bewusst, und ein Leser, der Spalten vergleicht, sollte erwarten, dass sie bei einer geraden Sample-Anzahl abweichen. Der Pro-Arm-`p50` ist Nearest-Rank, daher ist er immer ein beobachteter Wert. Der gepaarte `median delta` und die Mediane, die innerhalb des Bootstraps resampelt werden, mitteln die zwei mittleren Werte bei geraden Anzahlen. Eine Markdown-Zeile kann daher einen `p50` und einen `median delta` zeigen, die sich arithmetisch nicht in Einklang bringen lassen, ohne dass einer von beiden falsch ist.

Das 95%-Konfidenzintervall des gepaarten Medians verwendet 10.000 geseedete Bootstrap-Resamples gültiger Paar-Deltas mit Zurücklegen; Seed und Iterationszahl werden gespeichert. Seine Grenzen sind die Nearest-Rank-2,5- und 97,5-Perzentile. Der Seed jeder Metrik wird um ihre Position in der Metrikliste versetzt, sodass das Einfügen oder Umsortieren einer Metrik die Bootstrap-Grenzen jeder späteren Metrik verschiebt und Artefakte auf beiden Seiten der Änderung selbst bei identischen Roh-Samples unvergleichbar macht; der gespeicherte Pro-Metrik-`seed` hält dies auditierbar. `orderSensitive` ist wahr, wenn AB- und BA-Median-Deltas entgegengesetzte Vorzeichen haben und entweder der absolute Median mindestens 10 ms beträgt. Reihenfolge-Sensitivität macht den Lauf nicht aussagekräftig, statt weggemittelt zu werden.

Das Top-Level-Ergebnis eines gepaarten Artefakts beschreibt nur seine primäre Metrik in diesem einen Szenario. Es evaluiert nicht die szenarienübergreifenden, Ressourcen-, Funktions- oder Publikations-Gates und kann allein keinen Phase-2-Pull-Request autorisieren.

## Fehler, Artefakte und Cleanup

Jeder klassifizierte Lifecycle- oder Sample-Fehler wird behalten und hat einen primären Code:

| Code                              | Auslöser                                                          |
| --------------------------------- | ----------------------------------------------------------------- |
| `invalid_configuration`           | ungültiger Modus, Pfad, Dwell, Environment oder Bundle-Identität  |
| `daemon_boot_timeout`             | kein lauschender Endpunkt vor der Deadline                        |
| `daemon_exited_before_listen`     | Daemon vor Bereitschaft beendet                                   |
| `session_create_failed`           | Fehler oder fehlerhafte Session-Antwort                           |
| `sse_connect_timeout`             | SSE vor der Deadline nicht etabliert                              |
| `sse_stream_ended`                | SSE vor passendem Terminal beendet                                |
| `prompt_accept_timeout`           | Prompt-Request wurde vor der Deadline nicht fertig                |
| `prompt_rejected`                 | Fehler oder fehlerhafte `202`-Antwort                             |
| `legacy_prompt_response`          | Endpunkt schloss synchron ab, statt `promptId` zurückzugeben      |
| `event_buffer_overflow`           | fester Pre-Acceptance-Buffer überschritten                        |
| `provider_request_count_mismatch` | zusätzlicher, fehlender, verfrühter oder gleichzeitiger Fake-Request |
| `unexpected_output_kind`          | Answer-only-Live-Benchmark emittierte zuerst eine andere Ausgabeart |
| `first_output_timeout`            | keine qualifizierende Ausgabe vor der Deadline                    |
| `terminal_before_first_output`    | sauberer Terminal ohne qualifizierende Ausgabe                    |
| `turn_error`                      | passender Fehler-Terminal                                         |
| `terminal_timeout`                | kein Terminal nach Ausgabe vor der Deadline                       |
| `wrong_final_text`                | Antwort weicht vom Sentinel ab                                    |
| `cleanup_timeout`                 | eigene Ressourcen wurden bis zur Deadline nicht gestoppt          |
| `residual_process`                | verfolgter Daemon-/ACP-Nachkomme überlebte Cleanup                |
| `harness_error`                   | nicht klassifizierte Harness-Invariante oder I/O-Fehler           |

Der erste kausale Lifecycle-Fehler bleibt primär; SSE-/Session- und Prozess-Cleanup-Fehler werden separat aufgezeichnet und invalidieren weiterhin das Paar. Nicht-endliche Timings und ungültige negative Timings außer den beiden vorzeichenbehafteten Offsets werden als Harness-Fehler behalten, aber vor der Aggregation zu `null` normalisiert, und fehlgeschlagene Läufe tragen nie zu Perzentil- oder Gate-Berechnungen bei. Feste Timeouts, Request-Limits und Buffer-Kapazität werden serialisiert. Diagnosemeldungen und begrenzte Stdout-/Stderr-Tails beeinflussen keine Entscheidungen.

Jeder Aufruf schreibt Schema-Version-2-`daemon-first-output`-JSON plus Markdown, das nur aus diesem JSON abgeleitet wird. Es enthält Lauf-/Plattform-/Bundle-Identität, bereinigte Konfiguration, Warmups, jeden rohen relativen Zeitstempel und jede Metrik, gelatchte First-Output-/Antwort-/Terminal-Event-Typen und Korrelationszählungen, Provider-Request-Zählungen, ungültige Samples und Paare, Fehler, Cleanup-Ergebnisse, Statistik-/Bootstrap-/Reihenfolge-Zusammenfassungen und Gate-Inputs mit expliziten Entscheidungsgründen. Phase-2-Ressourcen-Läufe erweitern ihren Validierungsnachweis mit RSS-Messungen. Klassifizierte Sample-Fehler bleiben in ihren festen Sample-Slots; ungültige Konfiguration oder ein nicht klassifizierter Harness-Fehler erzeugt ein fatales Artefakt. Artefakte schließen Credentials, Tokens und Prompt-Inhalte jenseits des nicht-geheimen Benchmark-Sentinels aus.

Cleanup bricht immer SSE ab und wartet darauf, schließt Live-Sessions, erfasst ACP-/MCP-Nachkommen-PIDs, sendet `SIGTERM` an die eigene Prozessgruppe, während ihr Leader noch bekannt lebendig ist, und eskaliert die Gruppe nur, wenn derselbe Leader die feste Grace-Periode überlebt. Erfasste Nachkommen und ein Enumerations-Vollständigkeits-Latch bleiben durch den Notfall-Cleanup an der aktiven Ressource angehängt. Sobald der Leader exited, probiert oder signalisiert Cleanup seine numerische Prozessgruppen-ID nie wieder, weil POSIX sie wiederverwenden kann; er verifiziert nur die behaltene Nachkommen-Menge und scheitert sicher, wenn ein Nachkomme überlebt oder die Enumeration unvollständig war. Provider-Sockets schließen erst nach Prozess-Teardown, und temporärer Zustand wird erst entfernt, nachdem beides verifiziert ist. Cleanup verwendet nie prozessnamenweites Töten. Jeder ungültige Prozess oder jedes abgeschlossene Paar stoppt das Sampling sofort, während der Fehler behalten wird. Wenn ein eigener Prozess oder Listener nicht als gestoppt verifiziert werden kann, zeichnet der Runner die Temp-Root auf, die an den Notfall-Cleanup deferred wird, markiert bei Bedarf ein nicht-gestartetes Gegenstück, um ein ungültiges Paar zu erhalten, und macht Notfall-Teardown-Fehler sichtbar, statt seine verfolgte Ressource stillschweigend zu verwerfen. Der Notfall-Teardown retryt verfolgte Prozesse und Provider, bevor er deferrte Temp-Roots oder Compile-Caches löscht.

## Phase 2: Best-Effort-Provider-Preparation

### Verhalten und Grenze

Der aktuelle Lazy-Generator memoisiert ein Loader-Promise über Generation, Streaming, Token-Zählung und Embedding. Die Preparation darf dasselbe Promise früh starten; sie darf keinen weiteren Loader/Provider hinzufügen, keinen Modell-/Token-/Embed-Request stellen, keine Credentials aktualisieren oder Eager-Validierung und Qwen-OAuth-Credential-Timing ändern. Ein sofortiger Prompt muss demselben Promise beitreten.

Ein abgelehntes Preparation-Promise bleibt memoisiert, sodass der erste Prompt denselben Fehler beobachtet. Der abgelöste Caller darf einen Rejection-Observer nur anhängen, um eine unbehandelte Rejection zu verhindern; er darf das gespeicherte Promise nicht löschen oder ersetzen. Die Fähigkeit bleibt intern in Core und erweitert den öffentlichen `ContentGenerator`-Vertrag nicht.

Der früheste erlaubte Trigger ist das erfolgreiche Schreiben eines `session/new`-Ergebnisses durch das ACP-Kind:

1. beobachte die empfangene Request-ID;
2. beobachte eine gesendete Antwort mit derselben ID und
3. verlasse dich darauf, dass die bestehende Beobachtung erst stattfindet, nachdem `writer.write(frame)` resolved; und
4. plane ein unref'ed `setImmediate`, das die Preparation startet, aber nicht auf sie wartet.

Fehlgeschlagene Antworten, Authentifizierung, `session/load`, `session/resume` und andere RPCs triggern ihn nicht. Es wird kein Sleep verwendet, um die Antwortzustellung zu erraten. ESM-Import ist nicht abbrechbar, daher darf eine geschlossene Session einen bereits gestarteten Import abschließen lassen; er darf dennoch keinen Request stellen, keine externe Ressource behalten und keine unbehandelte Rejection erzeugen.

Diese Grenze ist nur Best-Effort. Der Daemon verrichtet weiterhin Session-Ownership-/-Konfigurations-/-Quell-Persistenzarbeit und serialisiert die äußere HTTP-Antwort nach dem Kind-Write. Der Provider-Import kann auf einem 2-vCPU-Host konkurrieren und `processToSessionReadyMs` verschlechtern; `setImmediate` erzeugt keine prozessübergreifende Happens-before-Beziehung. Session-Nicht-Unterlegenheit ist daher blockierend. Wenn sie scheitert, stoppen statt einen Timer zu tunen. Ein exaktes äußeres Antwort-fertig-Signal würde HTTP-Transport, Daemon-Bridge und ACP-Kind überqueren und erfordert ein separates Design nur, wenn der gemessene Wert diese Komplexität rechtfertigt.

### Publikations-Gates

Verwende separate Release-Bundles auf dem Referenz-Host:

| Szenario                       | Erforderliches Ergebnis                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Fake, 0 ms Dwell, 30 Paare     | obere Grenze des 95%-Paar-Median-KI sowohl für `processToSessionReadyMs` als auch `promptToFirstModelOutputMs` ist `<= +10 ms` |
| Fake, 100 ms Dwell, 30 Paare   | Paar-Median von `processToFirstModelOutputMs` ist `<= -10 ms` und seine 95%-KI-obere Grenze ist `< 0`                  |
| Fake, 500 ms Dwell, 10 Paare   | nur diagnostische obere Grenze; kann ein anderes fehlgeschlagenes Gate nicht kompensieren oder einen Merge unabhängig rechtfertigen |

Über die 0- und 100-ms-Fake-Läufe müssen alle 60/60 Paare gültig sein, mit null Preload-Fenster-Provider-Requests, null verbleibenden Prozessen und keiner Reihenfolge-Sensitivität.

Miss den RSS des gesamten Prozessbaums für 1, 4 und 16 Idle-Sessions, nachdem die Provider-Preparation sich gesetzt hat und vor jedem Prompt. Beide Gates müssen bestehen:

- Einzelsession-Kandidat-minus-Kontrolle-P50-RSS `<= +10 MiB`;
- Kandidat-minus-Kontrolle-Zuwachs von 1 zu 16 Live-Sessions `<= +0.5 MiB` pro zusätzlicher Session:

```text
((candidateRss16 - candidateRss1) -
 (controlRss16 - controlRss1)) / 15
```

Jeder Idle-Session-Probe erzeugt Sessions seriell, wartet, bis die Preparation sich gesetzt hat, und sendet keinen Prompt vor der RSS-Messung; jeder Provider-Request lässt ihn scheitern. Paaranzahl und Reihenfolge werden im Phase-2-Validierungsartefakt vor der formalen Messung festgelegt.

Erst nachdem alle Fake-/Ressourcen-Gates bestehen, führe Echte-Provider-externe Validität auf demselben Host aus: 30 AB/BA-Paare bei 100 ms plus ein 10-Paar-Immediate-Smoke. Funktions-/Auth-/Streaming-/Antwort-Fehler blockieren. Netzwerk-Unsicherheit wird berichtet, kann aber Fake-lokale Schlüsse in keiner Richtung überstimmen.

## Validierung und Entscheidung

Phase-1-reine Tests decken Antwort-/Thought-/Tool-Klassifikation; lokale/Replay-/Diagnose-Ausschlüsse; exakte und Pre-`202`-Korrelation; Buffer-Overflow; Terminal-/Fehlerpfade; nullable Antwort-Metriken; Nearest-Rank-Perzentile; deterministischen Bootstrap; Delta-Vorzeichen; ungültige Paar-Behaltung; Reihenfolge-Sensitivität; repräsentative fatale Artefakte; und JSON-zu-Markdown-Rendering. Ein Opt-in-Release-Bundle-Smoke validiert Provider-Wiring, Lifecycle, Artefakt-Schema und Cleanup. Formale Benchmarks sind kein Default-CI.

Ein Phase-2-Kandidat testet zusätzlich Trigger-Timing und RPC-Filterung, Single-Flight mit einem Immediate-Prompt, null Provider-Requests/Credential-Refresh, memoisierte Rejection, nicht-blockierenden Response-Write und sicheres Herunterfahren. Er muss Build, Typecheck, betroffene Unit-/Integrationstests und die vollständigen Artefakt-Gates bestehen.

```text
50-Prozess-Cold/Warm-Baseline gültig und Schwelle erreicht?
├─ nein → Artefakt behalten; stoppen
└─ ja   → Prototyp separat
          └─ Fake 0 ms nicht unterlegen?
             ├─ nein → Artefakt behalten; stoppen
             └─ ja
                └─ Fake 100 ms substanziell schneller mit KI < 0?
                   ├─ nein → Artefakt behalten; stoppen
                   └─ ja
                      └─ 60/60 gültig + Request/Cleanup/Reihenfolge/RSS-Gates bestanden?
                         ├─ nein → Artefakt behalten; stoppen
                         └─ ja
                            └─ Echte-Provider-Läufe funktional bestanden?
                               ├─ nein → Artefakt behalten; stoppen
                               └─ ja → Optimierungs-PR darf veröffentlicht werden
```
