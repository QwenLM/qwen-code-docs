# Qwen Code 평가


이 평가는 동일한 Qwen 3.7 Max 모델과 설정을 사용하여 SWE-bench Verified에서 7개의 Qwen Code 버전을 비교합니다. 평균 점수는 **76.40%에서 77.80%** 범위이며, 차이는 **1.40% 포인트**입니다.

## Qwen Code 버전별 점수

![Qwen Code 버전별 SWE-bench Verified 평균 점수, 76.40%에서 77.80% 범위.](../.github/assets/qwen-code-avg-score-trend.svg)

| Version | Avg Score | Pass Rate | pass @3 | pass^3 |
| ------- | --------: | --------: | -----: | -----: |
| 0.0.14  |    77.80% |     84.6% |  84.6% |  69.2% |
| 0.1.0   |    76.73% |     84.6% |  84.6% |  68.0% |
| 0.5.0   |    76.60% |     83.0% |  83.0% |  68.4% |
| 0.10.0  |    76.47% |     84.4% |  84.4% |  67.4% |
| 0.15.0  |    77.67% |     84.6% |  84.6% |  68.6% |
| 0.19.0  |    76.40% |     85.0% |  85.0% |  65.8% |
| 0.22.0  |    77.33% |     84.4% |  84.4% |  68.0% |

꺾은선 그래프는 릴리스 순서대로 버전을 연결하며 명시적으로 표시된 70%–80% 스케일을 사용합니다. 표는 보고된 모든 지표를 유지하며, 이 결과에서 Pass Rate와 pass @3은 동일한 값을 가집니다.

## 평가 설정

| Configuration           | Value                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Dataset                 | `princeton-nlp/SWE-bench_Verified`, 500 cases                                                       |
| Runs                    | 3 trials per version, 1,500 jobs per version; 7 Qwen Code versions                                  |
| Model                   | `Qwen 3.7 Max`                                                                                      |
| Sampling                | `temperature=1`, `top_p=0.95`                                                                       |
| Thinking / Reasoning    | `interleaved_thinking=true`, `thinking_type=adaptive`, `reasoning_effort=high`                      |
| Context / Output Limits | `context_1m=true`, `model_context_length=1,000,000`, `max_tokens=64,000`, `model_max_tokens=65,535` |
| Harness Limits          | `max_iterations=500`, `runtime_timeout_sec=7,200`, `agent_timeout_multiplier=3.0`                   |

[README로 돌아가기](../README.md#qwen-code-evaluation)
