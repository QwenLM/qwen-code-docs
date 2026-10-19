# Évaluation de Qwen Code


Cette évaluation compare sept versions de Qwen Code sur SWE-bench Verified en utilisant
le même modèle et la même configuration Qwen 3.7 Max. Les scores moyens vont de
**76,40 % à 77,80 %**, soit un écart de **1,40 point de pourcentage**.

## Scores par version de Qwen Code

![Scores moyens SWE-bench Verified par version de Qwen Code, allant de 76,40 % à 77,80 %.](https://github.com/QwenLM/qwen-code/raw/main/.github/assets/qwen-code-avg-score-trend.svg)

| Version | Score moyen | Taux de réussite | pass @3 | pass^3 |
| ------- | --------: | --------: | -----: | -----: |
| 0.0.14  |    77.80% |     84.6% |  84.6% |  69.2% |
| 0.1.0   |    76.73% |     84.6% |  84.6% |  68.0% |
| 0.5.0   |    76.60% |     83.0% |  83.0% |  68.4% |
| 0.10.0  |    76.47% |     84.4% |  84.4% |  67.4% |
| 0.15.0  |    77.67% |     84.6% |  84.6% |  68.6% |
| 0.19.0  |    76.40% |     85.0% |  85.0% |  65.8% |
| 0.22.0  |    77.33% |     84.4% |  84.4% |  68.0% |

Le graphique linéaire relie les versions dans l'ordre de sortie et utilise une échelle 70 %–80 % explicitement étiquetée. Le tableau conserve toutes les métriques rapportées ;
Pass Rate et pass @3 ont des valeurs identiques dans ces résultats.

## Configuration de l'évaluation

| Configuration           | Valeur                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Dataset                 | `princeton-nlp/SWE-bench_Verified`, 500 cas                                                          |
| Runs                    | 3 essais par version, 1 500 jobs par version ; 7 versions de Qwen Code                               |
| Modèle                  | `Qwen 3.7 Max`                                                                                        |
| Sampling                | `temperature=1`, `top_p=0.95`                                                                         |
| Thinking / Reasoning    | `interleaved_thinking=true`, `thinking_type=adaptive`, `reasoning_effort=high`                        |
| Limites contexte / sortie | `context_1m=true`, `model_context_length=1,000,000`, `max_tokens=64,000`, `model_max_tokens=65,535` |
| Limites du harness      | `max_iterations=500`, `runtime_timeout_sec=7,200`, `agent_timeout_multiplier=3.0`                     |

[Retour au README](../README.md#qwen-code-evaluation)