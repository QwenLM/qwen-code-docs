# Qwen Code Evaluation


Diese Evaluation vergleicht sieben Qwen Code-Versionen auf SWE-bench Verified unter Verwendung
des gleichen Qwen 3.7 Max-Modells und der gleichen Konfiguration. Die Durchschnittswerte liegen zwischen
**76,40 % und 77,80 %**, eine Spanne von **1,40 Prozentpunkten**.

## Ergebnisse nach Qwen Code-Version

| Version | Ø Ergebnis | Bestehensrate | pass @3 | pass^3 |
| ------- | --------: | --------: | -----: | -----: |
| 0.0.14  |    77.80% |     84.6% |  84.6% |  69.2% |
| 0.1.0   |    76.73% |     84.6% |  84.6% |  68.0% |
| 0.5.0   |    76.60% |     83.0% |  83.0% |  68.4% |
| 0.10.0  |    76.47% |     84.4% |  84.4% |  67.4% |
| 0.15.0  |    77.67% |     84.6% |  84.6% |  68.6% |
| 0.19.0  |    76.40% |     85.0% |  85.0% |  65.8% |
| 0.22.0  |    77.33% |     84.4% |  84.4% |  68.0% |

Das Liniendiagramm verbindet die Versionen in Release-Reihenfolge und verwendet eine explizit beschriftete
Skala von 70 %–80 %. Die Tabelle enthält alle berichteten Metriken;
Bestehensrate und pass @3 haben in diesen Ergebnissen identische Werte.

## Evaluationskonfiguration

| Konfiguration            | Wert                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Datensatz               | `princeton-nlp/SWE-bench_Verified`, 500 Fälle                                                       |
| Durchläufe              | 3 Versuche pro Version, 1.500 Jobs pro Version; 7 Qwen Code-Versionen                                |
| Modell                  | `Qwen 3.7 Max`                                                                                      |
| Sampling                | `temperature=1`, `top_p=0.95`                                                                       |
| Thinking / Reasoning    | `interleaved_thinking=true`, `thinking_type=adaptive`, `reasoning_effort=high`                      |
| Kontext- / Ausgabelimits | `context_1m=true`, `model_context_length=1,000,000`, `max_tokens=64,000`, `model_max_tokens=65,535` |
| Harness-Limits          | `max_iterations=500`, `runtime_timeout_sec=7,200`, `agent_timeout_multiplier=3.0`                   |

[Zurück zur README](../README.md#qwen-code-evaluation)
