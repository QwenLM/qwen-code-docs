# Avaliação do Qwen Code


Esta avaliação compara sete versões do Qwen Code no SWE-bench Verified usando o mesmo modelo e configuração Qwen 3.7 Max. As pontuações médias variam de **76,40% a 77,80%**, uma variação de **1,40 pontos percentuais**.

## Pontuações por versão do Qwen Code

![Pontuações médias no SWE-bench Verified por versão do Qwen Code, variando de 76,40% a 77,80%.](../.github/assets/qwen-code-avg-score-trend.svg)

| Versão | Pontuação média | Taxa de aprovação | pass @3 | pass^3 |
| ------- | --------: | --------: | -----: | -----: |
| 0.0.14  |    77,80% |     84,6% |  84,6% |  69,2% |
| 0.1.0   |    76,73% |     84,6% |  84,6% |  68,0% |
| 0.5.0   |    76,60% |     83,0% |  83,0% |  68,4% |
| 0.10.0  |    76,47% |     84,4% |  84,4% |  67,4% |
| 0.15.0  |    77,67% |     84,6% |  84,6% |  68,6% |
| 0.19.0  |    76,40% |     85,0% |  85,0% |  65,8% |
| 0.22.0  |    77,33% |     84,4% |  84,4% |  68,0% |

O gráfico de linhas conecta as versões na ordem de lançamento e usa uma escala de 70%–80% explicitamente rotulada. A tabela mantém todas as métricas reportadas; Taxa de aprovação e pass @3 têm valores idênticos nestes resultados.

## Configuração da avaliação

| Configuração           | Valor                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Dataset                 | `princeton-nlp/SWE-bench_Verified`, 500 casos                                                       |
| Execuções               | 3 tentativas por versão, 1.500 jobs por versão; 7 versões do Qwen Code                              |
| Modelo                  | `Qwen 3.7 Max`                                                                                      |
| Amostragem              | `temperature=1`, `top_p=0.95`                                                                       |
| Pensamento / Raciocínio | `interleaved_thinking=true`, `thinking_type=adaptive`, `reasoning_effort=high`                      |
| Limites de contexto / saída | `context_1m=true`, `model_context_length=1,000,000`, `max_tokens=64,000`, `model_max_tokens=65,535` |
| Limites do harness      | `max_iterations=500`, `runtime_timeout_sec=7,200`, `agent_timeout_multiplier=3.0`                   |

[Voltar ao README](../README.md#qwen-code-evaluation)
