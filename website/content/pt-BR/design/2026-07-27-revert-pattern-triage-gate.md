# Gate de triagem por padrão de revert

Data: 2026-07-27
Status: proposto
Área: triagem de CI — `.github/workflows/qwen-triage.yml`, `.qwen/skills/triage/`

## Problema

Pequenos PRs de manutenção neutros em comportamento atualmente consomem a
mesma capacidade de triagem multiestágio e review de modelo que mudanças de
comportamento. A proposta original (PR #7414) tentava filtrá-los, mas uma
medição dos mantenedores sobre o backlog ao vivo mostrou uma taxa de acerto
de apenas ~2% — a funcionalidade mirava um problema quase inexistente.

Enquanto isso, o repositório tem **111 commits de revert** ao longo da sua
história (19 apenas em julho de 2026), e **61,5% dos reverts ocorrem em até
24 horas após o merge** — significando que o problema é detectado rapidamente,
mas depois de já estar em `main`. O custo real não é revisar PRs inofensivos;
é mergear PRs que precisam ser revertidos.

Este design propõe um gate de triagem respaldado por dados que mira os PRs que
realmente causam reverts, não os que já são inofensivos.

## Dados

### Metodologia

Análise em três fases do histórico completo de reverts do repositório:

1. **Coleta**: `git log --all --grep="^Revert "` encontrou 111 commits de
   revert. O corpo de cada revert foi analisado em busca de
   `This reverts commit <hash>`, e então o commit original foi rastreado até
   seu PR via `gh api`. Resultado: 46 PRs revertidos únicos (59 reverts
   rastreáveis até um número de PR; 52 reverts tinham apenas o título do
   commit original sem link para o PR).

2. **Enriquecimento**: Para cada PR revertido, extraídos sinais observáveis
   no momento da triagem: escopo de toque (core/auth/providers/tools/services),
   tamanho do diff, contagem de rodadas de review, achados Critical do bot,
   ciclos CHANGES_REQUESTED, intervalo de tempo merge→revert, self-revert,
   presença de verificação E2E. 31 de 46 PRs foram enriquecidos com sucesso;
   15 estão removidos e inacessíveis (HTTP 404).

3. **Comparação com grupo de controle**: Amostrados 60 PRs recentemente
   mergados mas não revertidos e extraídos os mesmos sinais. Calculadas
   precisão (TP / (TP + FP)) e recall para cada sinal.

Scripts e dados brutos (artefatos de análise local, não commitados):
`.qwen/scripts/revert-analysis-*.mjs`, `.qwen/scripts/revert-data-*.json`,
`.qwen/scripts/revert-analysis-report-v2.json`.

### Precisão e recall dos sinais

| Sinal                        | Precisão  | Recall | Revertidos (n=31) | Controle (n=60) |
| ---------------------------- | --------- | ------ | ----------------- | --------------- |
| `touches_high_risk`          | **66,7%** | 32,3%  | 10                | 5               |
| `non_maintainer + high_risk` | **58,3%** | 22,6%  | 7                 | 5               |
| `core + contested`           | **50,0%** | 19,4%  | 6                 | 6               |
| `non_maintainer + core`      | 46,2%     | 38,7%  | 12                | 14              |
| `touches_core`               | 44,7%     | 54,8%  | 17                | 21              |
| `has_contested_pattern`      | 40,9%     | 29,0%  | 9                 | 13              |
| `had_changes_requested`      | 40,7%     | 35,5%  | 11                | 16              |
| `non_maintainer`             | 39,6%     | 67,7%  | 21                | 32              |
| `large_diff_gt_200`          | 37,0%     | 54,8%  | 17                | 29              |
| `critical_count > 0`         | 28,6%     | 12,9%  | 4                 | 10              |
| `fast_revert_24h`            | 100,0%    | 25,8%  | 8                 | 0               |
| `self_reverted`              | 100,0%    | 9,7%   | 3                 | 0               |

**Ressalva de amostragem:** a precisão é calculada com uma razão caso-controle
de 1:1,9 (31 revertidos vs 60 de controle), enquanto a taxa base real do
repositório é ~1,37% (46/3358). A precisão (PPV) é a métrica mais sensível a
esse enriquecimento — o valor preditivo positivo verdadeiro na taxa base do
repositório é muito menor (ex.: ~5% para `touches_high_risk`). Sensibilidade
(recall) e especificidade são invariantes à razão de amostragem e são as
métricas apropriadas para comparar sinais. O _ranking_ de sinais por precisão
continua válido (é monotônico na razão de verossimilhança para n fixo), mas
os valores absolutos não devem ser citados a contribuidores como
probabilidades posteriores.

`fast_revert_24h` e `self_reverted` têm 100% de precisão, mas são **sinais
pós-merge** — não podem ser usados como gates de triagem porque só são
observáveis depois que o PR já foi mergado e revertido. Eles confirmam que o
problema existe, mas não ajudam a preveni-lo.

`critical_count > 0` foi inicialmente considerado um sinal forte (o bot
marcou a causa raiz exata em estudos de caso como o PR #6866), mas depois de
corrigir o regex para casar apenas tags `**[Critical]**` (não a palavra nua
"critical" em prosa como "no critical blockers"), a precisão caiu para 28,6%.
O bot é muito afoito com achados Critical — 16,7% dos PRs do grupo de
controle também têm tags Critical.

### Definição de caminhos de alto risco

O sinal `touches_high_risk` verifica se algum arquivo alterado casa com estes
padrões de subsistema:

- `openaiContentGenerator` — parsing de respostas em streaming
- `streamingToolCallParser` — parsing de stream de chamadas de ferramenta
- `geminiChat` — pipeline de chat Gemini
- `acpConnection` — spawn de processos ACP
- `shell.ts` / `shellExecutionService` — execução da ferramenta de shell
- `mcp-client` / `mcp-pool` — gerenciamento de servidores MCP
- `LspServer` — gerenciamento de servidores LSP
- `acp-integration` — integração de sessão ACP
- `relaunch.ts` — ciclo de vida de relançamento do app desktop
- `sandbox.ts` — gerenciamento de processos de sandbox
- `electron-run-as-node` — ponto de entrada do modo node do Electron
  (correspondência de caminho)

Esses são os caminhos onde mudanças incorretas têm maior probabilidade de
causar regressões observáveis que exigem reversão.

### Intervalo de tempo merge→revert

Dos 13 PRs com dados de intervalo válidos (não negativos, pós-merge):

- Mediana: 4 horas
- Em até 24h: 61,5%
- Em até 72h: 84,6%
- Máximo: 97 horas

Isso confirma que defeitos que causam revert surgem rapidamente após o merge,
mas o dano já está em `main`.

### PRs flip-flop

8 PRs foram revertidos múltiplas vezes (ciclos revert → re-revert), indicando
contenção não resolvida:

- PR #6754 (3 reverts), PR #6751 (3 reverts), PR #3433 (3 reverts)
- PR #6869 (2 reverts), PR #5668 (2 reverts), PR #3567 (2 reverts),
  PR #3478 (2 reverts), PR #5060 (2 reverts)

Esses PRs flip-flop são os resultados de maior custo — consomem múltiplas
rodadas de review, múltiplos ciclos de merge/revert e frequentemente exigem
releases de patch.

## Design

### Escalonamento por caminho de alto risco

Quando um PR de não mantenedor toca qualquer caminho de alto risco (ver
definição acima), a triagem do Estágio 1 escalona o PR para o nível de review
mais profundo em vez do caminho normal. Isso **não** bloqueia nem fecha o PR —
garante que o pipeline completo de `/review` rode com cobertura máxima de
agentes.

Este é o sinal mais forte no momento da triagem: 10 de 31 PRs revertidos
(32,3% de sensibilidade) tocaram esses caminhos, contra 5 de 60 PRs de
controle (91,7% de especificidade; Fisher p = 0.006).

Implementação: o texto do skill do Estágio 1e instrui o modelo de triagem a
rodar `gh pr view --json files | grep -E '...'` contra os padrões de caminho
de alto risco. Nenhuma mudança no YAML do workflow é necessária — a detecção
roda dentro do skill, não como um passo separado do workflow.

### O que este design NÃO faz

- **Não fecha nem rejeita PRs automaticamente.** O gate escalona a
  profundidade do review e recomenda atenção de mantenedor; nunca bloqueia
  merge nem fecha o PR.
- **Não usa achados Critical do bot como sinal.** Os dados mostram 28,6% de
  precisão — o bot marca Criticals em 16,7% dos PRs seguros também. Criticals
  são ruidosos demais para servir de gate.
- **Não filtra apenas por tamanho de PR.** `large_diff_gt_200` tem 37,0% de
  precisão — tamanho sem contexto não é preditivo.
- **Não exige verificação E2E para todos os PRs.** `no_e2e` não é
  discriminativo — 100% do grupo de controle também não tem comentários de
  E2E, então o sinal não consegue distinguir PRs propensos a revert de PRs
  seguros.

## Comparação com o PR #7414

|                     | PR #7414 (neutro em comportamento) | Este design (padrão de revert)             |
| ------------------- | ---------------------------------- | ------------------------------------------ |
| Sinal               | "diff é inteiramente neutro em comportamento" | "toca caminhos de alto risco"   |
| Recall de revert    | não medido (sem reverts para comparar) | 32,3% (10/31)                         |
| Especificidade      | n/d                                | 91,7% (55/60)                              |
| Alvos               | PRs inofensivos (custo: baixo)     | PRs perigosos (custo: alto)                |
| Custo de falso positivo | pula review em um PR útil      | escalona profundidade do review (tempo extra de review) |

## Arquivos alterados

- `.qwen/skills/triage/references/pr-workflow.md` — adicionar o checklist do
  Estágio 1e de caminhos de alto risco. A detecção roda dentro do skill de
  triagem (o próprio modelo roda `gh api --paginate … | grep …`), então
  nenhuma mudança no YAML do workflow é necessária.
- `scripts/tests/qwen-triage-workflow.test.js` — assertir que as strings de
  roteamento de caminhos de alto risco existem no markdown do skill de
  triagem.
- `.github/scripts/qwen-triage-workflow.test.mjs` — as mesmas asserções no
  runner node:test.

## Não objetivos / acompanhamentos

- **Refinamento de Critical do bot.** A detecção atual de Critical do bot é
  muito ruidosa (28,6% de precisão). Se o bot pudesse distinguir "Critical
  não resolvido" de "Critical resolvido" (verificando se o thread do achado
  foi marcado como resolvido), o sinal poderia se tornar útil. Isso é uma
  melhoria separada do bot, não uma mudança no gate de triagem.
- **Grupo de controle alinhado no tempo.** O grupo de controle atual é
  amostrado dos 200 PRs mais recentemente mergados, mas os PRs revertidos
  abrangem 2025–2026. Um grupo de controle alinhado no tempo daria taxas de
  falso positivo mais precisas. A API `gh pr list` não suporta paginação
  profunda, então isso exige uma busca baseada em cursor GraphQL.
- **Recuperar 15 PRs removidos.** 15 dos 46 PRs revertidos estão removidos e
  inacessíveis via API do GitHub. Seus padrões podem diferir dos 31 que
  pudemos enriquecer. Não existe caminho de recuperação — o GitHub remove
  permanentemente PRs fechados em certos estados.
- **Detecção de flip-flop como gate em tempo real.** A análise atual detecta
  flip-flops retrospectivamente (após múltiplos reverts). Uma versão em tempo
  real monitoraria padrões revert→re-revert em `main` e alertaria
  mantenedores. Isso exige um workflow de monitoramento separado, não um gate
  de triagem.
- **Expandir a lista de caminhos de alto risco.** A lista atual é curada
  manualmente a partir dos caminhos de arquivo dos PRs revertidos. Conforme o
  código evolui, novos caminhos de alto risco podem surgir. Uma reexecução
  periódica dos scripts de análise manteria a lista atualizada.
