# Plano Técnico de Otimização do RT do Loop do Agente Qwen Code

## 1. Contexto e Definição do Problema

### 1.1 Situação Atual

O Agent Loop do Qwen Code é um modelo estritamente sequencial:

```
User Prompt → [Decisão LLM] → Execução de Ferramenta → [Decisão LLM] → Execução de Ferramenta → ... → [Resposta LLM] → Inativo
               ~3-4s                ~Xms-Ns               ~3-4s                ~Xms-Ns              ~3-4s
```

Cada chamada LLM (incluindo RTT de rede + inferência do modelo) leva cerca de 3-4s, sendo o principal custo do RT ponta a ponta.

### 1.2 Dados Medidos

Cenário de teste: "Quais espaços de trabalho eu tenho?" (3 rodadas de agent loop, 2 chamadas de ferramenta, amostragem única)

| Etapa                         | Duração   | Proporção |
| ----------------------------- | --------- | --------- |
| LLM Rodada 1 (decide chamar skill) | 3.8s      | 28%       |
| Execução do Skill             | 1ms       | <1%       |
| LLM Rodada 2 (decide chamar shell) | 3.0s      | 22%       |
| Execução do Shell             | 2.5s      | 19%       |
| LLM Rodada 3 (resumo textual) | 3.8s      | 28%       |
 | Sobrecarga do framework (sincronização de estado, renderização) | 0.3s | 3% |
| **Total**                     | **13.4s** | **100%**  |

**Conclusão**: Chamadas LLM representam 78%, execução de ferramentas 19%, framework 3%. O núcleo da otimização é **reduzir o número de chamadas LLM** e **diminuir a latência de cada chamada LLM**.

> Nota: Amostragem única, cenário único. Os 19% de execução de ferramentas são dominados pela chamada lenta do shell; em cenários com muita leitura, a execução da ferramenta pode cair para <5%. Antes de implementar o plano, é necessário complementar a linha de base com ≥3 categorias de cenário (operações de escrita, raciocínio entre ferramentas, recuperação de erros).

### 1.3 Restrições Chave da Arquitetura Atual

| Restrição                              | Localização no Código                                                                              | Descrição                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Nenhum controle pós-execução no resultado da ferramenta | `tools.ts` interface `ToolResult` (L422)                                                           | Possui apenas `llmContent`/`returnDisplay`/`error`, não consegue expressar "pular LLM"                |
| Resultado incondicionalmente retornado ao LLM | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355) | Todos os resultados de ferramentas iniciados pelo gemini são retornados                               |
| Agendamento só após término do stream  | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                           | `scheduleToolCalls` só é chamado após o loop do stream terminar, sem agendamento incremental          |
| Seleção de modelo sem camada de estratégia | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                           | A infraestrutura já está integrada até `turn.run(model, …)` (L1707), mas o chamador só usa quando o skill especifica explicitamente |

### 1.4 Infraestrutura Pronta (Amplamente Reutilizada neste Plano)

| Capacidade                                        | Localização                                                  | Status                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Configuração `fastModel` + `/model --fast <id>`   | `config.ts:684`, `1987`, `2021`                              | Pronto                                                                     |
| `SendMessageOptions.modelOverride`                | `client.ts:142` → `1598` → `turn.run`                        | Integrado ponta a ponta até `geminiChat.sendMessageStream(model, …)`       |
| Camada de hook `modelOverrideRef` (carrega modelo selecionado pelo skill) | `useGeminiStream.ts:376`, `2225`, `1841`               | Integrado                                                                 |
| Exemplo de consulta lateral não-streaming do fast-model | `services/toolUseSummary.ts:108` (via `runSideQuery`) | Em produção, provando que a configuração do fast model está saudável; mas **caminho não-streaming** |
| Exemplo de **streaming** do fast-model            | `followup/speculation.ts:224`                                | Em produção, mas **usando chat bifurcado** (`createForkedChat`), isolado do chat principal |

**Lacuna chave**: **Nenhum código em produção** executa streaming com fast model no chat principal. O D2 deste plano é o primeiro caso, exigindo experimento de validação prévio (veja §3.2 Pré-condições).

---

## 2. Princípios de Design

1. **Generalidade**: O plano não é específico para nenhuma tool/skill
2. **Compatibilidade reversa**: Ferramentas existentes não precisam de modificação para continuar funcionando
3. **Progressivo + Sinal explícito**: A estratégia é conservadora por padrão, com opt-in do autor da ferramenta via campo explícito
4. **Reversível**: Todas as otimizações são controladas por feature flags; o usuário pode forçar desligamento
5. **Compensações honestas**: Riscos de qualidade, riscos de custo e limites de aplicabilidade claramente marcados

---

## 3. Plano de Otimização

### 3.1 Direção 1: Diretiva de Pós-Execução do ToolResult

#### Problema

Atualmente, `ToolResult` não contém nenhuma informação sobre "o que fazer a seguir". Independentemente de o resultado da ferramenta ser autoexplicativo, ele aciona incondicionalmente uma rodada de LLM.

#### Design

Estender a interface `ToolResult` (`packages/core/src/tools/tools.ts` L422):

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // Novo: Diretiva de pós-execução
  postExecution?: {
    /**
     * O resultado da ferramenta não é retornado ao LLM, sendo exibido diretamente como resposta final ao usuário.
     * Adequado para cenários onde o resultado é completamente autocontido e não precisa de reinterpretação pelo modelo.
     * É uma propriedade local do ToolResult.
     */
    skipLlmRound?: boolean;

    /**
     * O resultado da ferramenta é "autocontido e pode ser exibido diretamente ao usuário" — ou seja,
     * `returnDisplay` já é a forma final esperada pelo usuário, sem necessidade de processamento pelo modelo.
     * É uma propriedade local do ToolResult, **não** prevê se a "próxima rodada é resumo".
     * Interage com a Direção 3 (desacoplamento de apresentação): true → entra no estado Summarizing, permitindo entrada do usuário.
     */
    resultIsTerminal?: boolean;
  };
}
```

> **Correção de design**: Versões anteriores usavam um único campo `selfExplanatory` para acumular as responsabilidades de "propriedade do artefato da ferramenta" e "sinal de previsão do fluxo de diálogo", mas elas não coincidem (exemplo: prompt do usuário é "leia X e depois conserte Y", a saída de read_file é autocontida, mas a próxima rodada claramente não é um resumo). **Sinal de previsão é uma propriedade global do fluxo de diálogo** e não deve ser expresso por campos da ferramenta — no D2, isso é totalmente substituído por heurísticas do fluxo de diálogo (veja §3.2).

#### Mudança de Comportamento

Nova verificação em `handleCompletedTools`:

```
Lote de ferramentas concluído
  → Verificar postExecution.skipLlmRound de todas as ferramentas no lote
  → Todas são true?
    → SIM: markToolsAsSubmitted, não chamar submitQuery, ir direto para inativo
    → NÃO: manter comportamento atual (submitQuery)
```

**Restrição importante**: `skipLlmRound` só é efetivo quando **todas as ferramentas do lote atual declaram skip**. Lotes mistos ainda retornam.

#### Invariante de Histórico

Após pular LLM, o histórico fica: `user → function_call → function_response → <sem assistant>`.

- Revisar se `repairOrphanedToolUseTurnsInHistory` (chamado ao carregar sessão) tolera essa forma
- Revisar o comportamento da compactação automática na ausência de texto do assistant
- O PR #4176 acabou de fechar a invariante tool_use↔tool_result; antes de implementar, adicionar testes unitários cobrindo a alternância de "mensagem do usuário após skip"
- API estilo Qwen / OpenAI tolera; Anthropic é estrito quanto à alternância — se no futuro suportarmos conexão direta com Anthropic, será necessário um fallback (injetar texto vazio do assistant no histórico)

> **Ponto de correção unificado**: Aqui e na Direção 3 (§3.3, interromper Summarizing no D3) quebram a **mesma invariante de histórico**. A solução de correção deve ser uma entre duas opções (injetar assistant vazio / aceitar tolerância do Qwen), e ambas as direções devem usar a mesma escolha.

#### Ecossistema de Sinal (Trabalho Fase 2)

| Ferramenta                           | `skipLlmRound`         | `resultIsTerminal` | Observação                                                                                 |
| ------------------------------------ | ---------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `read_file`                          | Combinar com cenário query-only | true               | O conteúdo do arquivo é a resposta                                                         |
| `cat` (via shell)                    | Depende do cenário     | true               | Mesmo que read_file                                                                        |
| `grep` / `glob` / `ls`              | false                  | **false (padrão)** | Resultados frequentemente precisam de seleção/ordenação/resumo do modelo; no nível skill, explicitamente true em cenários conhecidos de "consulta pura" |
| `git status` / `git log` (via shell) | false                 | true               | Saída já formatada                                                                         |
| Ferramentas Skill                    | Decidido por cada skill | Decidido por cada skill | Skills do tipo consulta tendem a true                                                   |
| Ferramentas MCP                      | false (padrão)         | false (padrão)     | Opt-in explícito via allowlist                                                             |

Ferramentas de terceiros/MCP não são confiáveis, sem marcação por padrão; habilitar explicitamente via `config.toolPostExecAllowlist`.

> `grep/glob/ls` com false como padrão é uma escolha conservadora: evitar que D2/D3 julguem erroneamente em cenários que exigem resumo/ordenação do modelo.

#### Aplicável e Não Aplicável

- **Aplicável**: Consultas de estado final (tipo read/cat/print), resultados autocontidos (skill já formatou a saída)
- **Não aplicável**: Etapas intermediárias de tarefas de múltiplos passos, confirmação de operações de escrita, logs complexos que exigem interpretação

#### Riscos e Mitigações

| Risco                                                         | Gravidade | Mitigação                                                             |
| ------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| Ferramenta configura `skipLlmRound` incorretamente, interrompendo tarefa de múltiplos passos | Médio     | Semântica em nível de lote + `llmContent` ainda está no histórico, recuperável |
| Abuso por ferramentas de terceiros                            | Médio     | MCP desabilitado por padrão, allowlist explícita                      |
| Quebra de invariante de histórico                             | Médio     | Adicionar testes unitários antes da implementação; cobrir replay de carregamento de sessão |
| Expectativa inconsistente do usuário (espera resumo mas não tem) | Baixo     | Configuração `alwaysSummarize: true` pode sobrescrever                |

#### Ganho

Economia de 3-4s em cenários de consulta de estado final (pulando a última rodada de LLM).

---

### 3.2 Direção 2: Estratégia de Roteamento para Rodada de Resumo com Fast Model

#### Posicionamento

**Esta direção não introduz um novo pipeline, mas requer extensão da interface GeminiChat para suportar troca de modelo em tempo de execução**.

A infraestrutura da §1.4 fornece configuração do fast model e `modelOverride` integrado ponta a ponta, mas **não há precedente de executar fastModel + streaming no chat principal**, sendo necessário:

- Função de decisão: quando passar `config.getFastModel()` como override
- Fallback seguro: nova interface `GeminiChat.retryStreamWithModel` (lida com estado interno do chat)
- Validação experimental: alternar fast/primary no chat principal não quebra compactação / gravação de histórico

#### Escopo de Aplicação

O D2 atua apenas em:

- **useGeminiStream** (caminho principal do TUI) — ponto de chamada `sendMessageStream` L1841
- **ACP Session** (caminho de integração IDE) — `acp-integration/session/Session.ts:1182`, adaptação na Fase 3

O D2 **não atua** nos seguintes caminhos, para evitar modos de falha adicionais em contextos não interativos ou independentes:

- **Runtime do Subagente** (`agents/runtime/agent-core.ts:614`): subagente já tem configuração de modelo independente
- **Turn acionado por Cron** (`SendMessageType.Cron`, client.ts:127): não interativo, sem urgência de RT
- **Turn de Notificação** (`SendMessageType.Notification`, client.ts:129): o mesmo acima

#### Dificuldade Central

Ao chamar `submitQuery`, **não sabemos** se o modelo, após ver o resultado, iniciará uma nova ferramenta ou produzirá texto diretamente. Se usarmos fast model e o modelo realmente precisar chamar uma ferramenta — a consequência é **silenciosa**: o fast pode chamar a ferramenta errada ou com parâmetros errados, sem sinal claro de erro.

**Nenhum campo no nível da ferramenta pode prever confiavelmente** "se a próxima rodada é resumo", pois isso depende do fluxo de diálogo (prompt do usuário + contexto acumulado), não de uma propriedade local do artefato da ferramenta. Exemplo:

```
Usuário: "Leia utils.ts e depois mude todos os console.log para logger.info"
  → Ferramenta 1: read_file → resultado autocontido
  → Mas a próxima rodada claramente não é resumo
```

Portanto, o D2 prevê inteiramente usando **heurísticas do fluxo de diálogo**, sem depender de campos da ferramenta.

#### Função de Decisão: Heurísticas de Fluxo de Diálogo + Vetos

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== Força bruta no nível do usuário (maior prioridade) =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // ainda sujeito a proteções em tempo de execução

  // ===== Vetos por intenção do usuário =====
  // 1. Prompt do usuário contém verbos de ação → próxima rodada provavelmente ainda chama ferramenta
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. Já há ferramentas mutator nesta rodada → provavelmente há verificação/leitura a seguir
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. Há erros não resolvidos nesta rodada ou no histórico → modelo precisa de primary para diagnosticar
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== Vetos por complexidade da saída =====
  // 4. Prompt do usuário requer análise profunda (explicar/comparar/por que)
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. Chamadas de ferramenta ≥3 ferramentas diferentes → narrativa entre resultados requer primary
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. Saída da ferramenta muito longa → resumo de conteúdo longo requer primary
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== Vetos por viabilidade do modelo =====
  // 7. Janela de contexto do fast model insuficiente → alternar para fast dispararia compressão
  //    (compressão exige chamada LLM própria, piorando RT e custo)
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== Fallback por idioma =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Fallback por estado da sessão =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

Significado dos oito vetos:

- **`requestImpliesFurtherAction`**: Verbos de ação (`改|删|加|替换|修复|实现|新建|create|fix|change|add|remove|implement|write|update`) → tarefa de múltiplos passos
- **`MUTATOR_KINDS` acionado**: Já houve escrita nesta rodada → provavelmente seguido de leitura/verificação. **Reutilizar `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` já existente em `tools.ts:806`** (a propriedade `kind: Kind` de cada instância Tool é a classificação autoritativa, não reinventar `isWriteTool`)
- **`hasUnresolvedError(turnResults, currentBatch)`**: Julgamento em duas partes —
  - **Qualquer erro no lote atual → sempre não resolvido** (não assumir que lotes paralelos podem se autocorrigir)
  - **Histórico: deduplicar por `(toolName, args fingerprint)`, última ocorrência ainda com erro = não resolvido** (apenas por toolName causaria julgamento incorreto com parâmetros diferentes com mesmo nome)
  - Shell etc. precisam preencher corretamente `ToolResult.error` (dependência de qualidade de dados prévia)
- **`needsDeepReasoning`**: Contém palavras-chave como "analisar/explicar/por que/comparar/diagnosticar"
- **`needsCrossResultReasoning`**: Chamadas de ferramenta distintas ≥3 (mesma ferramenta com mesmos parâmetros conta como uma)
- **Saída tokens > 4000**: Limiar empírico, **a ser ajustado após medição de linha de base do fast model**
- **`wouldTriggerCompression`**: Janela de contexto do fast model geralmente menor que a do primary; o mesmo histórico no fast pode disparar `tryCompress` mais cedo (geminiChat.ts:1418) — compressão requer uma chamada LLM própria, podendo **piorar RT e custo**. Estimativa orçamentária: `estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` é considerado como disparo
- **Idioma não suportado**: Apenas detecção de palavras-chave em chinês e inglês; outros idiomas (japonês, coreano etc.) usam primary por padrão
- **Mutação de estado da sessão**: Primeira continuação após `/compact` ou `/clear` → primary para reconstruir modelo mental

A direção dos vetos **favorece primary** (preferível perder 2s do que degradar qualidade).

#### Implementação Chave: `GeminiChat.retryStreamWithModel`

**Problema**: Abortar diretamente + chamar `client.sendMessageStream` quebra o estado do chat:

1. `geminiChat.ts:1428` faz push de `userContent` no histórico ao iniciar o stream; reiniciar faria **outro push**, resultando em `function_response` duplicado no histórico
2. Lock `sendPromise` (`geminiChat.ts:1392, 1398`) — após abort, é necessário garantir que `streamDoneResolver` seja chamado
3. Marcadores de invariante como `pendingPartialState` introduzidos pelo PR #4176 precisam ser limpos corretamente
4. Atributo `model` do span de telemetria precisa ser atualizado

**Nova interface** (`packages/core/src/core/geminiChat.ts`):

```typescript
/**
 * Tenta novamente um envio de streaming em andamento ou recém-abortado com um modelo diferente.
 * NÃO faz novo push de userContent (mantido do envio original).
 * Reseta pendingPartialState; libera sendPromise obsoleto; reabre span.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

Contrato de chamada:

- Chamar apenas após o envio original ter sido abortado (sem concorrência)
- Reutilizar prompt_id (mesma intenção do usuário)
- Não fazer novo push de userContent já inserido no histórico

Carga de trabalho de implementação: aproximadamente 1,5d com testes unitários.

#### Proteção em Tempo de Execução

`selectContinuationTier` retorna `'fast'`, mas o stream recebe um evento `ServerGeminiEventType.ToolCallRequest` → **abortar imediatamente o stream atual e chamar `retryStreamWithModel(primaryModel)`**.

Isso cobre o único cenário de erro silencioso onde a previsão era "resumo" mas na prática ainda precisa de ferramenta. Custo: tokens desperdiçados de uma chamada fast (atribuição de custo veja §5.3).

#### Desacoplamento do `modelOverride` do Skill

`useGeminiStream.modelOverrideRef` (L376, L2225) atualmente carrega o modelo **escolhido explicitamente pelo skill**, sendo de "semântica de negócio". O roteamento fast desta direção é de "semântica de otimização". Ambos **devem ser separados**:

```typescript
// Novo ref independente
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// Ponto de chamada combinado (não reutilizar modelOverrideRef)
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // escolha explícita do skill tem prioridade
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

Ciclo de vida:

| Momento                                                      | `modelOverrideRef` (skill) | `summaryTierRef` (roteamento fast)        |
| ------------------------------------------------------------ | -------------------------- | ----------------------------------------- |
| Novo turno do usuário (`!Retry && !ToolResult`)              | Limpar                     | Limpar                                    |
| Ferramenta skill retorna campo `modelOverride`                | Escrever                   | Inalterado                                |
| Lote de ferramentas concluído → `selectContinuationTier`      | Inalterado                 | Escrever                                  |
| Fallback em tempo de execução (ToolCallRequest visto)        | Inalterado                 | Atualizar para `'primary'`                |
| Retry (usuário manual Ctrl+Y)                                | Manter                     | Atualizar para `'primary'` (fast falhou, não tentar novamente) |

Escolha explícita do skill **sempre vence** — a intenção explícita do usuário tem prioridade sobre a estratégia de otimização.

#### Correção de Telemetria

O span de interação em `client.ts:1303` registra o atributo `model` ao iniciar o turno. Quando o fallback é acionado, o modelo realmente muda, distorcendo os dados do span. Necessário:

```typescript
// Quando fallback é acionado
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

E em `addUserPromptAttributes`, distinguir entre modelo `requested` / `actual`, para evitar confusão em faturamento/auditoria.

#### Chave de Força Bruta no Nível do Usuário

Nova configuração (`packages/cli/src/config/settingsSchema.ts`):

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// default: 'auto'
```

- `'auto'`: Usa `selectContinuationTier` (recomendado)
- `'always_primary'`: Desativa completamente a otimização D2 (cenários sensíveis à produção)
- `'always_fast'`: Pula vetos, **ainda sujeito a proteções em tempo de execução** (usuários avançados)

Motivo: D2 troca qualidade por velocidade; alguns usuários/cenários precisam de direito explícito de exclusão.

#### Pré-condições

- `config.getFastModel()` já configurado
- **Experimento de validação de fastModel-streaming no chat principal** (1d antes da codificação):
  - Mockar uma ferramenta com `resultIsTerminal=true`, disparar repetidamente rodadas de resumo no chat principal
  - Observar se `tryCompress` é acionado indevidamente (janela de contexto do fast model menor pode acionar mais cedo)
  - Observar se a saída do chatRecordingService tem mismatch de modelo
  - Observar se a chamada primária seguinte consegue ler o histórico normalmente após uma chamada fast
- **Medição de linha de base dos candidatos Fast** (1d):
  - Executar 100 prompts de rodada de resumo (entrada contendo `function_response`), medir latência P50/P95 ponta a ponta e time-to-first-token
  - Medir taxa de disparo de `tryCompress` `P_compact`, verificar ganho líquido de RT = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0`
  - Habilitar apenas se fast P50 ≤ primary P50 × 0,5 e P95 ≤ primary P95 × 0,6
- Fast model e primary model da mesma família (evitar diferenças na codificação de `function_response`); entre famílias, a camada `getFastModel()` deve rejeitar
- **Compatibilidade com `thinkingConfig`**:
  - Fast model deve ser consistente com primary quanto ao suporte a `thinkingConfig.includeThoughts`; ou
  - Caminho fast força `includeThoughts: false` (alinhado com `sideQuery.ts:118-122`)
  - Validação: fast model consegue processar corretamente histórico contendo thought parts (sem erro, não tratando thought como entrada do usuário)

#### Riscos e Mitigações

| Risco                                                                                        | Gravidade | Mitigação                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fast model faz tool-calling silenciosamente errada                                           | Alto      | Heurísticas de fluxo de diálogo + proteção de abort via ToolCallRequest em tempo de execução                                                                 |
| Fast alucina "resposta de erro visível ao usuário" em entrada contendo erro                  | **Alto**  | Veto `hasUnresolvedError`; monitorar taxa de perguntas de acompanhamento (Nota: o risco similar de `emitToolUseSummaries` afeta apenas rótulo de 60 tokens; este afeta a resposta final, de magnitude maior) |
| Caminho fast dispara `tryCompress` → mais uma chamada LLM, **piorando RT e custo**           | **Alto**  | Portão de pré-julgamento `wouldTriggerCompression` (veja função de decisão #7); medição de linha de base do limiar P_compact antes                              |
| A compressão usa qual modelo                                                                 | Médio     | Disparar compressão significa abandonar roteamento fast (portão #7 como fallback); evitar problema na resposta                                               |
| Trocar modelo no chat principal causa estado interno/gravação anormal                        | Médio     | Experimento de validação prévio cobre; testar replay de retomada de sessão                                                                                    |
| D2 e `emitToolUseSummaries` disparam chamada fast concorrente simultânea, excedendo rate-limit | Médio     | Uma das duas opções: desabilitar `emitToolUseSummaries` quando D2 está ativo (título não afeta funcionalidade), ou compartilhar token bucket de rate-limit  |
| `thinkingConfig` inconsistente entre fast / primary causa erro na análise do histórico       | Médio     | Mesma família + caminho fast força `includeThoughts: false` (veja pré-condições)                                                                               |
| Caminho de fallback acaba sendo mais caro (tokens fast desperdiçados + primary completo)     | Médio     | Monitorar `fast_tokens_consumed` no log de decisão; desligar flag automaticamente se taxa de fallback >20%                                                   |
| Atributo `model` do span de telemetria distorcido                                           | Médio     | Divisão `requested` / `actual` (veja Correção de Telemetria)                                                                                                 |
| Incompatibilidade de formato de contexto (entre famílias)                                    | Médio     | `getFastModel()` rejeita seleção entre famílias                                                                                                              |
| Conflito semântico com `modelOverride` do skill                                              | Médio     | Ref independente + prioridade do skill                                                                                                                        |
| Troca do modelo principal em tempo de execução via `/model` torna decisão `summaryTierRef` obsoleta | Baixo     | Limpar `summaryTierRef` sincronizadamente ao processar comando `/model`                                                                                     |
| fast tokens/s pode ser mais lento                                                            | Baixo     | Medir TTFT durante teste, não apenas RT total                                                                                                               |

#### Ganhos (Aguardando Medição)

- **RT**: Economia de 2-3s na rodada de resumo (não colocar no título do PR antes da medição)
- **Custo**: Preço unitário do fast model geralmente significativamente menor que o primary; em cenários de resumo frequente, custo de tokens pode cair 30-50%; mas o desperdício do caminho de fallback pode neutralizar parte do ganho, exigindo medição real com `fast_tokens_consumed` para confirmar ganho líquido

---

### 3.3 Direção 3: Desacoplamento de Exibição de Resultados e Interação (Presentation Decoupling)

#### Problema

O usuário, desde a conclusão da ferramenta até poder digitar novamente, precisa esperar a rodada de resumo do LLM terminar:

```
Ferramenta concluída → [Renderizar resultado] → [submitQuery] → [Esperar resposta streaming LLM 3-4s] → Inativo → Pode digitar
                                                               ~~~~~~~~~~~~~~~~~~~~~~~~
                                                               Usuário já viu o resultado mas não pode operar
```

#### Design

Novo estado `StreamingState.Summarizing`:

```typescript
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Summarizing = 'summarizing', // Novo
}
```

#### Mudança na Máquina de Estados

```
Ferramentas concluídas e resultados já exibidos
  → Se todos no lote têm postExecution.resultIsTerminal === true:
    → Entrar em Summarizing (usuário pode digitar)
    → submitQuery executado de forma assíncrona
    → Resumo do LLM é anexado ao histórico (ou cancelado por nova mensagem do usuário)
  → Caso contrário:
    → Permanecer em Responding (usuário não pode digitar)
```

#### Tratamento de Nova Mensagem do Usuário

- No estado `Summarizing`, se o usuário enviar nova mensagem → abortar resumo atual → processar nova mensagem
- **Texto parcial do resumo já gerado é descartado** (não entra no histórico), evitando poluir o contexto com meia frase do assistant
- `function_response` permanece no histórico (modelo sabe que a ferramenta foi executada)
- Sugestões de followup etc. são acionadas somente após o Summarizing ser concluído ou cancelado

#### Lista de Verificação de Limpeza de Texto Parcial ao Abortar

O texto parcial está distribuído em vários lugares, exigindo **limpeza simultânea**; a falta de qualquer um causa inconsistência de estado:

| Localização                                                                       | Ação de Limpeza                                                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pendingHistoryItemRef.current` (estado React do useGeminiStream)                 | Definir como `null`, não chamar `addItem`                                                                             |
| Acumulação interna em `GeminiChat.history`                                        | Se conteúdo parcial do assistant já foi inserido antes do abort, precisa reverter via nova interface `discardPendingAssistant()` |
| Turno bufferizado no `ChatRecordingService`                                      | Marcar como cancelado, não gravar no JSONL                                                                            |
| `dualOutput.emitText` (se habilitado)                                             | Enviar sentinela de abort, sidecar descarta por conta própria                                                         |
| Tokens acumulados em `loopDetectorRef`                                            | Resetar contagem do turno atual                                                                                      |
Ordem de execução: disparo do abort signal → coleta das cinco limpezas acima → só então permite que uma nova mensagem de usuário entre em `submitQuery`. Cobertura de teste de concorrência: último chunk recebido exatamente no momento do disparo do abort.

#### Condições de aplicabilidade

Todos os membros do batch têm `postExecution.resultIsTerminal === true`.

#### Invariante de histórico (mesma origem da §3.1)

Interromper o Summarizing no meio gera:

```
[user_1, function_call, function_response, user_2]
                                          ↑ sem assistant turn
```

**Isso quebra o mesmo invariante da §3.1 ao pular a rodada LLM** e deve usar a mesma estratégia de correção do D1 (injetar assistant vazio / aceitar tolerância do Qwen).

- Reutilizar cobertura de teste unitário do invariante D1
- Reprodução de session-load (incluindo `repairOrphanedToolUseTurnsInHistory`) deve cobrir essa forma
- Alternância Anthropic: ao conectar diretamente, aplicar fallback junto com D1

#### Riscos e Mitigações

| Risco                                                             | Gravidade | Mitigação                                                                              |
| ---------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| Meio assistant turn entra no history durante abort               | **Médio** | Descartar explicitamente texto parcial; manter apenas function_response; teste unitário cobre race |
| Invariante de histórico quebrado (sem assistant após)            | **Médio** | Problema de mesma origem do D1, correção unificada (ver §3.1 invariante de histórico) |
| Aumento da complexidade de estado da UI                          | Médio     | Summarizing = Idle + tarefa em segundo plano; caminho de entrada reutiliza Idle        |
| Benefício percebido pelo usuário depende do padrão de comportamento | Baixo     | Se o usuário não digitar em 3s, o summary já foi concluído → sem benefício percebido; mas **não degrada** |

#### Benefícios

- **Limite teórico**: 3-4s de RT percebido (usuário digita assim que a ferramenta termina)
- **Mediana real**: depende do intervalo de entrada do usuário — usuários que leem o resultado por 2-5s antes de digitar não sentirão diferença, mas **nunca será mais lento**

---

### 3.4 Direção 4: Agendamento Antecipado de Stream (Stream-Ahead Scheduling)

#### Problema

`processGeminiStreamEvents` agenda as ferramentas em lote somente após o stream terminar completamente. Eventos `ToolCallRequest` podem ter sido emitidos no meio do stream.

#### Design

No processamento de eventos do stream, iniciar imediatamente **pré-validação** (sem executar) para `ToolCallRequest`:

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // novo
  break;
```

`CoreToolScheduler.prevalidate(request)`:

1. Localizar o registro da ferramenta
2. Construir a invocação
3. Executar `shouldConfirmExecute` (armazenar resultado em cache)
4. Ao `schedule()`, usar diretamente o resultado em cache

#### Contrato de Pureza e Allowlist

`prevalidate` exige que `shouldConfirmExecute` seja **livre de efeitos colaterais** e que seu resultado não se torne inválido por modificações externas no intervalo entre prevalidate e schedule.

**Reutilizar diretamente `CONCURRENCY_SAFE_KINDS` de `tools.ts:818`**:

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

Esta é a classificação existente no projeto para "sem efeitos colaterais + concorrência segura", que atende perfeitamente os requisitos de prevalidate.

| Kind da Ferramenta                | Está na allowlist?         | Motivo                                                                   |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `Read` (read_file, etc.)          | ✅                         | Apenas leitura                                                           |
| `Search` (grep / glob)            | ✅                         | Apenas leitura                                                           |
| `Fetch` (web_fetch, etc.)         | ✅                         | Leitura remota, sem efeitos colaterais de escrita                        |
| `Edit`                            | **❌** (ver TOCTOU abaixo) | shouldConfirmExecute é puramente leitura, mas o diff pode ser inválido no intervalo de agendamento |
| `Delete` / `Move` / `Execute`     | ❌                         | MUTATOR_KINDS                                                            |
| `Think`                           | ❌                         | Contém operações de escrita implícitas como save_memory / todo_write     |
| Ferramentas MCP                   | ❌                         | Não confiáveis                                                           |

**TOCTOU: Por que Edit não entra na allowlist**

Teoricamente, `shouldConfirmExecute` do Edit é puramente leitura (ler arquivo, calcular diff). Mas existe uma janela de tempo entre prevalidate e schedule:

```
T=0      stream recebe Edit(file=a.ts, ...) → prevalidate
T=10ms   shouldConfirmExecute lê a.ts, armazena diff_v0 em cache
T=300ms  stream termina, scheduler.schedule()
T=305ms  Outra ferramenta/IDE/processo externo modifica a.ts durante o intervalo
T=310ms  scheduler exibe diff_v0 para o usuário
T=320ms  Usuário confirma com base em v0
T=330ms  Edit aplica params antigos no arquivo v1 → conteúdo corrompido / falha de merge
```

Isso é TOCTOU. Direções de correção:

- **A (Recomendado)**: Edit não entra na allowlist; prevalidate cobre apenas as três categorias de `CONCURRENCY_SAFE_KINDS`. Custo: o ganho cai de "50-200ms (dominado por Edit)" para "50-100ms (apenas leitura)"
- **B (Opcional, mais forte)**: Edit entra na allowlist, mas o cache inclui `(mtime, size, content_hash)`; ao schedule(), verifica se o arquivo não foi alterado antes de usar o cache, senão recalcula

O documento adota provisoriamente a opção A.

#### Interação com o agendamento paralelo existente

`coreToolScheduler.attemptExecutionOfScheduledCalls` (L2436+) usa `partitionToolCalls` para dividir as ferramentas em "lote com segurança concorrente" e "lote serial", sendo o lote concorrente executado via `runConcurrently` (L2473).

prevalidate deve se alinhar a esse modelo de particionamento:

- Cache indexado por `callId` (não por `(toolName, args)`, para evitar conflitos entre chamadas concorrentes de mesmo nome)
- Chamada que falha em prevalidate → não afeta outras chamadas; no schedule, essa chamada segue o caminho original de `shouldConfirmExecute`
- Ao cancelar o stream, abortar em cascata todas as prevalidates in-flight conforme o `signal`

#### Riscos

| Risco                                                        | Gravidade | Mitigação                                                                                     |
| ------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------- |
| Cache de diff inconsistente com o arquivo real no momento da confirmação (TOCTOU) | Alto      | Opção A: Edit não entra na allowlist; Opção B: cache com verificação de `(mtime, size, hash)` |
| Falha de prevalidate afetando o agendamento                  | Baixo     | Falha/timeout retorna ao caminho original de `shouldConfirmExecute`; cache ausente ≡ não habilitado |
| Concorrência de prevalidates compartilhando fd / disputa de recursos | Baixo     | `QWEN_CODE_MAX_TOOL_CONCURRENCY` já limita o máximo de concorrência (padrão 10)               |

#### Benefícios

50-100ms/rodada (apenas escopo `CONCURRENCY_SAFE_KINDS`). Se selecionar opção B incluindo Edit, ganho teórico de 100-200ms.

---

## 4. Avaliação Consolidada e Roadmap

### 4.1 Avaliação Consolidada

| Direção                     | Ganho de RT                       | Complexidade de Implementação | Risco de Qualidade | Dependências                                  | Prioridade |
| --------------------------- | --------------------------------- | ----------------------------- | ------------------ | --------------------------------------------- | ---------- |
| D1 – Instrução pós-ferramenta | 3-4s/rodada terminal              | Baixa (2-3d)                  | Baixo              | Nenhuma                                       | **P0**     |
| D2 – Roteamento rápido de summary | 2-3s/rodada de summary (a medir) | **Médio-Alta (9d)**           | Médio-Alto         | Heurística própria D2 + Experimento de validação do chat principal + Sincronização ACP | **P1** |
| D3 – Desacoplamento de exibição | 3-4s de melhoria percebida (depende do comportamento do usuário) | Médio (3-5d, incluindo correção de invariante) | Médio             | Correção de invariante de histórico D1        | **P1** |
| D4 – Agendamento antecipado de stream | 50-200ms/rodada                   | Alta (5-7d)                   | Muito Baixo        | Nenhuma                                       | P2         |

#### Detalhamento do esforço D2

| Subtarefa                                                                                                                                    | Estimativa |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Experimento de validação fastModel-streaming no chat principal (incluindo medição de P_compact)                                              | 1d         |
| Medição de linha de base do modelo candidato Fast (incluindo TTFT, P95, compatibilidade com `thinkingConfig`)                                | 1d         |
| Integração de `selectContinuationTier` + `summaryTierRef` (useGeminiStream)                                                                  | 0.5d       |
| Implementação da heurística (incluindo reutilização de `MUTATOR_KINDS` / estimativa de `wouldTriggerCompression` / multilíngue / mutação de estado) | 1d         |
| Implementação da interface `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`                                                    | 1.5d       |
| Modificação da sincronização de sessão ACP (acp-integration/session/Session.ts)                                                              | 1d         |
| Correção de spans de telemetria (separação `requested` / `actual`)                                                                           | 0.5d       |
| User-level setting `summaryTierStrategy` + JSON schema + integração `/config`                                                                | 0.5d       |
| Testes unitários (race, timing de abort, invariante de histórico, caminho de fallback, caminho ACP)                                        | 2d         |
| **Total**                                                                                                                                    | **9d**     |

> Nota: A estimativa inicial de 6.5d não incluía custos como caminho ACP, gate `wouldTriggerCompression`, lista de limpeza, engenharia de schema de configurações, etc.

### 4.2 Roadmap de Implementação

#### Phase 1: D1 – Instrução pós-ferramenta (1 semana)

- Estender `ToolResult.postExecution` (tools.ts L422): `skipLlmRound` + `resultIsTerminal`
- Implementar curto-circuito `skipLlmRound` em `handleCompletedTools` (useGeminiStream.ts L2038)
- Testes unitários cobrindo invariante de histórico
- **Phase 1 não consome `resultIsTerminal`** (deixado para Phase 3)

#### Phase 2: Construção do ecossistema de sinais (2 semanas, paralelo com Phase 4)

- Ferramentas integradas recebem gradualmente as marcações `skipLlmRound` / `resultIsTerminal` (ver tabela §3.1)
- Verificar cobertura de marcação ≥60% (ponderado por número de turnos, não por número de chamadas)
- Coletar dados de produção, calibrar limite do gate de veto da §3.2
- Ao final da Phase 2, executar experimento de validação do chat principal e medição de linha de base da §3.2

#### Phase 3: D2 + D3 (aproximadamente 3 semanas, incluindo sincronização ACP)

> **Correção**: Roadmap anterior estimava 1 semana, não incluindo experimento de validação fastModel-streaming, implementação de `retryStreamWithModel`, correção unificada de invariante, sincronização do caminho ACP.

- Antes da codificação: concluir experimento de validação do chat principal + medição de linha de base (incluindo compatibilidade de `P_compact` com thinkingConfig)
- Adicionar `summaryTierRef` + `selectContinuationTier` (incluindo gate `wouldTriggerCompression`)
- Adicionar `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`
- **Modificar simultaneamente o caminho de sessão ACP** (acp-integration/session/Session.ts) para usar a mesma função de decisão
- Adicionar `StreamingState.Summarizing` + reutilização de caminho de entrada + lista de limpeza de abort
- Correção unificada de invariante de histórico (mesma origem D1+D3)
- Feature flag `experimental.summaryRoundFastModel: false`, **Release N desligado por padrão**
- User setting `summaryTierStrategy`
- Correção de spans de telemetria
- Salvaguardas em tempo de execução (abort de ToolCallRequest + retryStreamWithModel)

#### Phase 4: D4 – Agendamento antecipado de stream (pode ser inserido independentemente)

- `CoreToolScheduler.prevalidate` + allowlist
- Agendamento incremental em `processGeminiStreamEvents`

---

## 5. Métricas, Aceitação e Limitações

### 5.1 Indicadores de desempenho

| Indicador                                   | Linha de base | Phase 1 | Phase 3                   |
| ------------------------------------------- | ------------- | ------- | ------------------------- |
| RT ponta a ponta P50 (loop de 3 turnos)     | 13.4s         | <10s    | <8s (a medir)             |
| RT ponta a ponta P95                        | -             | <13s    | <12s (limite do caminho de fallback) |
| Tempo até primeiro resultado percebido P50  | 13.4s         | <10s    | <5s (com D3 ativado)      |
| Tempo até primeiro resultado percebido P95  | -             | <13s    | <8s                       |
| Número de chamadas LLM (cenários puláveis)  | 3             | 2       | 2 (mais rápido)           |

> Nota: Linha de base é uma única amostragem; antes da implantação, é necessário complementar com ≥3 cenários.

### 5.2 Indicadores de qualidade

| Indicador                                                         | Linha de base | Degradação permitida |
| ---------------------------------------------------------------- | ------------- | -------------------- |
| Precisão de tool-calling (rodada de summary com fast model)      | 100%          | ≥98%                 |
| Taxa de uso indevido de skipLlmRound (usuário pede "mais detalhes") | -           | <1%                  |
| Taxa de fallback_triggered do fast model                         | -             | <10% (>20% desliga flag automaticamente) |
| Entrada de meio assistant turn no history durante Summarizing    | 0             | 0 (rígido)           |

### 5.3 Indicadores de custo

| Indicador                                                | Linha de base | Meta Phase 3                                             |
| -------------------------------------------------------- | ------------- | -------------------------------------------------------- |
| Custo de tokens por mil sessões (rodada de summary)      | 100%          | <70%                                                     |
| Proporção de tokens desperdiçados no caminho de fallback | 0             | <15% (taxa de fallback × tokens fast por chamada / tokens primary por chamada) |

### 5.4 Schema de log de decisão

Cada decisão crítica de `selectContinuationTier` e `handleCompletedTools` grava um log estruturado:

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // decisão (antes do fallback)
  tier_actual:    'fast' | 'primary',          // executado de fato (após fallback)
  signal_skipLlmRound: bool,
  signal_resultIsTerminal: bool,
  user_strategy: 'auto' | 'always_primary' | 'always_fast',
  veto_reason: 'further_action' | 'write_tool' | 'unresolved_error' |
               'deep_reasoning' | 'cross_result' | 'output_tokens' |
               'lang_unsupported' | 'compact_or_clear' | null,
  tool_count, distinct_tool_count,
  has_write_tool: bool,
  has_error: bool, has_cancel: bool,
  output_tokens_est: int,
  user_prompt_classification: 'query' | 'action' | 'analysis',
  fast_ttft_ms, primary_ttft_ms,                // duplicado quando há fallback
  fast_tokens_consumed: int,                    // tokens desperdiçados no fallback (atribuição de custo)
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

Indicadores a observar:

- Taxa de disparo do fast (esperado 30-50%)
- Taxa de fallback_triggered (esperado <10%; >20% sugere desligar default flag no próximo release)
- Proporção de cada veto (identificar muito rigoroso/muito permissivo)
- fast_tokens_consumed × fallback_rate (risco reverso de custo)
- Frequência de usuários pedindo "mais detalhes" (sinal de regressão de qualidade do fast)

**Nota sobre medição de `fast_tokens_consumed`**:

O stream interrompido por abort **provavelmente não receberá `finishReason` / `usageMetadata`** — este último só é preenchido no final completo do stream. A implementação precisa estimar:

- Prioritário: antes do abort, tentar `stream.return()` para que o gerador percorra o caminho finally, podendo obter usage parcial
- Fallback: acumular o comprimento de texto dos chunks já recebidos × 4 para estimar output tokens; input tokens estimados pelo history
- Anotação: o campo de log inclui `tokens_source: 'usage' | 'estimated'`; análises posteriores devem distinguir

### 5.5 Métodos de validação e estratégia de lançamento

#### Validação

- Reutilizar framework de temporização `/tmp/tool-timing.log`
- Adicionar `T_userIdle` (momento em que o usuário pode digitar novamente)
- Adicionar `T_firstToken` (momento do primeiro token do stream)
- Teste A/B comparando distribuições de RT e custo antes e depois de cada Phase

#### Estratégia de lançamento (adaptada para CLI local)

Qwen Code é uma CLI local, **sem capacidade de distribuição em tempo de execução** — o tradicional "5% / 25% / 100% gradual" não se aplica. Adotar **avanço por releases progressivos**:

| Fase                   | Release                | Valor padrão do feature flag | Condição de ativação                                                                  |
| ---------------------- | ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Phase 3a: dogfood      | Release N              | `false`                      | Usuários internos ativam manualmente com `summaryTierStrategy=always_fast`            |
| Phase 3b: opt-in padrão | Release N+1 (≥2 semanas) | `false` (inalterado)        | Logs de decisão da fase dogfood atendem: fallback <10%, ganho líquido de RT/custo >0 |
| Phase 3c: ativado por padrão | Release N+2 (≥4 semanas) | `true`                   | Nenhum relatório de regressão de qualidade em nível de usuário na Phase 3b            |
| Rollback               | Release N+3 (se necessário) | `true → false`           | Fallback em larga escala >20% ou indicadores de qualidade degradados                  |

**Mecanismo de rollback**:

- Sem distribuição em tempo de execução, **rollback = novo release com default flag desligado**
- O nível de usuário `summaryTierStrategy=always_primary` sempre fornece um canal de "quero sair imediatamente", não dependendo de novo release
- `fallback_rate` / `cost_regression` dos logs de decisão são avaliados a cada ciclo de Release para determinar o próximo passo

### 5.6 Limitações conhecidas

1. **Base de dados de linha de base insuficiente**: Uma única amostragem não cobre todos os padrões de tarefa; antes da implantação, é necessário complementar cenários
2. **Pré-condição do fast model**: Se não existir um modelo da mesma família significativamente mais rápido e com tool-calling adequado → D2 não é ativado
3. **`skipLlmRound` troca qualidade por velocidade**: Pular LLM = abrir mão da compreensão e correção do modelo, aplicável apenas em cenários de alta determinismo
4. **D2 troca qualidade+custo por velocidade**: Modelo fast tem qualidade inferior ao primary; o caminho de fallback é mais caro — o ganho líquido deve ser medido com logs de decisão
5. **Disparo de `tryCompress` pode piorar a situação**: Contexto do fast model é menor, compressão consome chamadas LLM por si só — gate `wouldTriggerCompression` é defesa obrigatória
6. **Desacoplamento de exibição altera o modelo de interação**: O novo modelo exige adaptação do usuário; o comportamento do usuário determina o ganho real percebido
7. **Latência de rede é incontrolável**: Esta solução reduz o número de chamadas, não otimiza cada chamada individual
8. **Conexão direta Anthropic não coberta**: A tolerância atual de alternância depende de APIs estilo Qwen / OpenAI
9. **fastModel-streaming no chat principal é a primeira implantação**: Sem precedentes em produção, requer experimento de validação independente
10. **CLI local sem distribuição em tempo de execução**: Estratégia de lançamento só pode avançar por releases, sem suporte a ajuste gradual rápido
11. **D2 atua apenas no caminho de interação**: Subagent / Cron / Notification não se beneficiam, intencionalmente
12. **Impacto de longo prazo do histórico de modelos mistos desconhecido**: Com D2 ativado, os turnos dentro da sessão alternam entre fast/primary; a continuidade do contexto em retomada de sessão longa precisa ser observada
13. **Ganho reduzido do D4**: Com Edit fora da allowlist, prevalidate cobre apenas ferramentas de leitura pura (ganho de 50-100ms); o ganho de 200ms incluindo Edit exigiria o mecanismo de verificação mtime/hash da opção B

### 5.7 Localizações-chave do código

| Arquivo                                                 | Símbolo-chave                                               | Localização |
| ------------------------------------------------------- | ----------------------------------------------------------- | ----------- |
| `packages/core/src/tools/tools.ts`                      | Interface `ToolResult`                                      | L422        |
| `packages/core/src/tools/tools.ts`                      | Enum `Kind` + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS`  | L793, L806, L818 |
| `packages/core/src/tools/tools.ts`                      | `DeclarativeTool.kind: Kind` (cada instância de Tool possui) | L165        |
| `packages/core/src/core/client.ts`                      | `SendMessageOptions.modelOverride`                          | L142        |
| `packages/core/src/core/client.ts`                      | `sendMessageStream`                                         | L1216       |
| `packages/core/src/core/client.ts`                      | `modelOverride ?? getModel()`                               | L1305, L1598 |
| `packages/core/src/core/client.ts`                      | `turn.run(model, …)`                                        | L1707       |
| `packages/core/src/core/geminiChat.ts`                  | `sendMessageStream(model, …)`                               | L1387       |
| `packages/core/src/core/geminiChat.ts`                  | `history.push(userContent)`                                 | L1428       |
| `packages/core/src/core/geminiChat.ts`                  | Trava `sendPromise`                                         | L1392       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `modelOverrideRef` (skill seleciona modelo)                | L376, L2225 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `processGeminiStreamEvents`                                 | L1365       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | Ponto de chamada de `sendMessageStream`                     | L1841       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `handleCompletedTools`                                      | L2038       |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `submitQuery(ToolResult, …)`                                | L2355       |
| `packages/core/src/services/toolUseSummary.ts`          | Consulta lateral fast-model (precedente não-streaming)      | L108        |
| `packages/core/src/followup/speculation.ts`             | Streaming fast-model (precedente forked chat)               | L224        |
| `packages/core/src/config/config.ts`                    | `fastModel` + `getFastModel` + `setFastModel`               | L684, L1987, L2021 |
| `packages/core/src/core/coreToolScheduler.ts`           | `attemptExecutionOfScheduledCalls`                          | L2436       |
| `packages/core/src/core/coreToolScheduler.ts`           | `runConcurrently` + `partitionToolCalls`                    | L2473       |
| `packages/cli/src/acp-integration/session/Session.ts`   | Ponto de chamada de `sendMessageStream` (caminho ACP / IDE) | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`        | `sendMessageStream` do Subagent (não afetado por D2)         | L614        |

---

## 6. Registro de Verificação de Revisão (2026-05-26)

### 6.1 Método de verificação

Para as **hipóteses de qualidade de dados pré-requisito e estimativas de ganho apenas declaradas, não quantificadas** no documento de design, iniciamos 4 subagentes Explore paralelos para pesquisa de código somente leitura. Cada subagente responde apenas a uma questão factual, sem emitir julgamentos ou sugestões de otimização. A pesquisa é baseada no branch `main` atual (HEAD: `026f2f768`).

| Pergunta de verificação                                                                 | Seção relacionada                         |
| --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Q3 – Taxa de preenchimento do campo `ToolResult.error` em todas as ferramentas atuais   | §3.2 Dependência prévia de `hasUnresolvedError` |
| Q4 – Disponibilidade real de `usageMetadata` após abort de stream                       | §5.4 Medição de `fast_tokens_consumed`    |
| Q5 – Existência de ponto de monitoramento para "perguntas do usuário / esclarecimento"  | §5.2 Sinal de monitoramento de regressão de qualidade fast |
| Q6 – Carga real de I/O de `shouldConfirmExecute` para ferramentas de `CONCURRENCY_SAFE_KINDS` | §3.4 Estimativa de ganho D4              |

### 6.2 Descoberta 1: Heurística `hasUnresolvedError` tem 32% de área cega de ferramentas (afeta D2)

**Fato**: Das 22 ferramentas com caminho de erro, **15 (68%) preenchem corretamente o campo `ToolResult.error`** (shell, read-file, write-file, edit, grep, glob, ls, web-fetch, mcp-tool, cron-\* e outras ferramentas de I/O principais estão completas), enquanto **7 (32%) apenas colocam o erro em uma string `llmContent`**: `askUserQuestion`, `monitor`, `skill`, `lsp`, `exitPlanMode`, `todoWrite`, etc.

**Não existe** um helper `createErrorResult` unificado; cada ferramenta implementa a construção de erro independentemente.

**Impacto no design**:

- O veto `hasUnresolvedError` da §3.2, se verificar apenas o campo `ToolResult.error`, **nunca acionará "voltar ao primary" para essas 7 ferramentas** quando falharem — a próxima rodada ainda será roteada para o fast model
- Entre elas, **a falha da ferramenta `skill` ser resumida erroneamente pelo fast model** é um cenário de risco de alta prioridade (muitos workflows orientados por skill neste repositório seriam afetados)
- A declaração da §3.2 de que "shell etc. precisam preencher ToolResult.error corretamente (dependência de qualidade de dados prévia)" **é muito restrita**; o shell já está padronizado, os verdadeiros casos de omissão são skill / lsp / todoWrite, etc.

**Correção sugerida**: Adicionar como dependência **rígida** do D2 a "**modificação das 7 ferramentas que passam erro apenas via `llmContent` para preencher o campo `error` de forma padronizada**" (pré-condição da §3.2), estimativa ~2d; não aceitar o caminho sujo de usar `llmContent.match(/^Error:/i)` como fallback (alto risco de falso positivo).

### 6.3 Descoberta 2: Custo de implementação do indicador `fast_tokens_consumed` foi subestimado (afeta D2 / §5.3)

**Fato**:

- O caminho de abort em `turn.ts` (L289-291) faz `return` diretamente, **sem bloco finally, sem chamada a `stream.return()`** — a sugestão do documento §5.4 de "antes do abort, tentar `stream.return()` para que o gerador percorra finally" não existe no código atual
- O loop `for await` em `geminiChat.ts:processStreamResponse` só registra o turn quando a iteração é completa (L1286); interromper por abort significa que o último chunk contendo usage-only (geralmente com metadados completos) **é descartado diretamente**
- O caminho principal do chat **não tem nenhuma acumulação de token em nível de chunk** como fallback; apenas a camada subagent (`agent.ts:731-744`) tem acumulação, não reutilizável
- Conclusão: ao abortar, `usageMetadata` **é zero obtido**, só é possível estimar por `chars/4` (erro de ±20%)

**Impacto no design**:

- Das três camadas "prioritário / fallback / anotação" no final da §5.4, o **caminho "prioritário" não é alcançável no código atual** — é necessário primeiro modificar a estrutura do gerador de `sendMessageStream` para incluir finally, esforço ~1d, não contabilizado no documento de design
- A §5.3 define "custo de tokens por mil sessões <70%" como meta da Phase 3, mas se o próprio indicador tiver erro de ±20%, **"70%" vs. "82%" caem dentro do ruído de medição**

**Correção sugerida**:

- Reescrever §5.3 como **indicador de tendência**, não como gate de release; usar em vez disso a combinação "taxa de `fallback_triggered` dos logs de decisão + tendência de `fast_tokens_consumed`" como julgamento conjunto
- Complementar §5.4: a implementação de `fast_tokens_consumed` exige primeiro modificar o caminho de abort de turn.ts para adicionar finally + `stream.return()`, como complemento de esforço da §3.2 (+1d)

### 6.4 Descoberta 3: `user_prompt_classification` e ponto de monitoramento de "perguntas do usuário" precisam ser criados (afeta D2 / §5.2)

**Fato**:

- `packages/core/src/followup/` já contém `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts`, mas sua telemetria (`PromptSuggestionEvent`) registra **"sugestão do sistema aceita/ignorada"**, não "pergunta ativa do usuário"
- `ChatRecordingService` armazena mensagens do usuário, mas **não aplica rótulos de classificação**
- grep em todo o repositório não encontra `user_prompt_classification`, nem correspondência de padrão de pergunta (em chinês ou inglês), nem mecanismo do tipo `clarif*` / `intentDetect`

**Impacto no design**:

- O campo `user_prompt_classification: 'query' | 'action' | 'analysis'` no schema de log de decisão da §5.4 **não tem fonte de dados** — não pode ser derivado do PromptSuggestionEvent existente nem lido do ChatRecord
- O sinal de monitoramento "frequência de usuários pedindo 'mais detalhes'" da §5.2 também não tem fonte; **o ponto de ancoragem existente mais próximo `followupState.onOutcome` não é reutilizável**
**Sugestões de correção**:

- §3.2 Adicionar "implementação mínima do classificador de entrada do usuário" (correspondência de padrão zh/en, ~3d) às pré-condições; caso contrário, tanto `user_prompt_classification` quanto `requestImpliesFurtherAction` no log de decisão §5.4 ficarão sem dados.
- **Ou aceitar** não ter esses dois sinais durante a fase de dogfood da Phase 3a, monitorando a regressão de qualidade apenas pela taxa de `fallback_triggered` — custo baixo, mas alto risco.

### 6.5 Descoberta 4: D4 Contradição Interna de Design — Allowlist vs. Atribuição de Ganho Desalinhados (Impacta D4 / §3.4)

**Fatos**:

- Para as três categorias de ferramentas `Kind.Read` (`read_file`), `Kind.Search` (`glob` / `grep`) e `Kind.Fetch` (`web_fetch`), os métodos `shouldConfirmExecute` / `getConfirmationDetails` **herdam, na grande maioria, a implementação padrão de `BaseToolInvocation`, resultando em zero E/S** (`read_file` / `glob` / `grep` não fazem override algum; `web_fetch` faz apenas parsing de string de 5 a 10 linhas para obter o hostname da URL).
- Quem realmente tem E/S é `Edit` / `WriteFile` (`calculateEdit` + `readTextFile` + `Diff.createPatch`, tipicamente ~20ms). No entanto, a Opção A da §3.4 os exclui da allowlist para mitigar a condição de corrida TOCTOU.
- **Resultado**: Para as três ferramentas que permanecem na allowlist, a carga de trabalho com e sem prevalidation é praticamente a mesma — a allowlist, na prática, está bloqueando apenas a "Edit, que é a única com E/S que poderia ser economizada", deixando dentro as ferramentas que já têm "custo zero".

**Impacto no Design**:

- A narrativa de "validação de E/S prévia" da §3.4 **não se sustenta**: a fonte real do ganho de 50-100ms é **a eliminação do atraso de agendamento causado por "somente agendar em lote após o stream terminar completamente"**, tendo quase nada a ver com E/S do lado da ferramenta.
- Essa atribuição incorreta de ganho traz dois problemas:
  1.  **A allowlist pode ser mais ampla** — qualquer ferramenta com prevalidation idempotente serve, sem a necessidade de restringir a `CONCURRENCY_SAFE_KINDS`.
  2.  **O investimento de 5-7d se torna difícil de justificar** — se o ganho real for apenas os ~50ms da mudança no modelo de agendamento, e a Edit não estiver na allowlist, o ROI desse investimento é menor do que o documento de design sugere.

**Sugestão de correção**: Reescrever a atribuição de ganho na §3.4:

- Dividir em duas partes: (a) ~50ms economizados com a mudança no modelo de agendamento (eliminação da espera do stream), (b) carga de trabalho ~0ms (dentro da allowlist atual) / ~20ms (se a Edit for incluída na allowlist) que pode ser economizada com a E/S prévia da ferramenta.
- Na tabela de avaliação abrangente §4.1, alterar o ganho de RT de D4 de "50-200ms" para "30-80ms (Opção A, vindo principalmente do modelo de agendamento) / 100-200ms (Opção B, incluindo a Edit)".
- No roteiro §4.2, rebaixar ainda mais D4 — a transformação do modelo de agendamento puro pode ser feita de forma independente, não precisa estar fortemente atrelada ao conceito de prevalidation.

### 6.6 Impacto Combinado no Roadmap

| Seção | Estimativa Original | Estimativa Pós- Validação | Incremento                                                                                                                       |
| :------------------------------ | :------------------ | :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| D2 §3.2 Carga de trabalho (Tabela detalhada §4.1) | 9d | **14-16d** | +2d (Descoberta 1: adaptação das ferramentas prévias) +1d (Descoberta 2: refatoração de `turn.ts` finally) +3d (Descoberta 3: classificador de entrada, se rota mais difícil) |
| D4 §3.4 Avaliação abrangente | 5-7d | 5-7d (inalterado) | Carga de trabalho inalterada, mas **a atribuição do ganho de RT mudou de "E/S da ferramenta" para "modelo de agendamento"**; ROI do investimento reduzido. |
| Duração total da Phase 3 (§4.2) | ~3 semanas | **~4-5 semanas** | Aumento da carga de trabalho de D2 + ciclo de review separado para o PR de adaptação das ferramentas prévias. |

**Sugestões de correção para o roadmap original**:

1.  **Manter D1 (P0) e D3 logo em seguida** — A validação atual não tocou nas premissas centrais deles; o julgamento de ROI permanece o mesmo.
2.  **Endurecer as condições de início para D2** — Tornar o trabalho prévio das Descobertas 1/2/3 (~6d no total) uma **"gate de início para D2"** , não entrando nos experimentos prévios da §3.2 sem que estejam concluídos.
3.  **Reavaliar prioridade de D4** — Já que o ganho real é a mudança no modelo de agendamento e não a E/S da ferramenta, ou (a) aceita-se 30-80ms e rebaixa-se D4 para P3, postergando-o, ou (b) considera-se a Opção B (Edit + mtime/hash) para obter 100-200ms com um custo adicional de 5-7d.
4.  **Não modificar a linha de base da amostra única da §1.2** — Mas a coluna P95 na §5.1 não deve receber números concretos até que a linha de base D1 seja implementada e a coleta de ≥3 tipos de cenários esteja completa.

### 6.7 Pontos de Investigação não Cobertos

Os pontos a seguir referem-se a julgamentos subjetivos ou intenção do autor, não foram tratados via subagent nesta validação e ficam para discussão futura no design review:

- A ordem de implementação do D2 deveria ser posterior à do D3 (ordem subjetiva).
- D1/D3 deveriam ser mesclados e feitos juntos na Phase 1 (estratégia de implementação).
- O limiar `≥3` para `needsCrossResultReasoning` na §3.2 é um ajuste reverso para se adequar aos cenários de linha de base da §1.2 (intenção do autor).
- As âncoras de número de linha na tabela de locais-chave do código na §5.7 deveriam ser alteradas para âncoras de símbolo (estabilidade da documentação).

---

## 7. Avaliação de Quick Wins e Próximos Passos (Segunda revisão: 2026-05-26)

### 7.1 Fatos que Desencadearam esta Reavaliação

Após a validação da §6, dois outros **fatos que mudam o julgamento de ROI** foram descobertos:

1.  **`cache_control` do DashScope já está implementado** (`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`)
    - Marca `system + última mensagem + última definição de tool` em requisições streaming.
    - Os dados de `cached_tokens` atingidos já são coletados em `usageMetadata.cachedContentTokenCount` (`converter.ts:1124-1149`).
    - Este é um mecanismo de prefix cache: a Rodada N+1 automaticamente atinge o prefixo escrito na Rodada N.
    - **A rodada de summary é exatamente a que atinge o prefixo mais longo.**

2.  **O system prompt já está estável** (resultado da auditoria em `prompts.ts`)
    - Não há "hard issues" como cwd / timestamp / git status / lista de arquivos / status LSP que mudam a cada turn.
    - `process.cwd()` é usado apenas como chave para `isGitRepository()`, não é escrito no conteúdo do prompt.
    - Únicos pontos dinâmicos: gatilho da ferramenta `save_memory` / troca de `/model` / carregamento dinâmico de MCP (todos event-driven e de baixa frequência).

### 7.2 Como Estes Dois Fatos Mudam o ROI de D2

O documento §3.2 assume uma comparação "modelo rápido ~2s mais rápido que o primary", com a linha de base sendo **primary uncached vs. fast uncached**.

Na realidade operacional, o primary está **cached** (a rodada de summary atinge exatamente o cache mais forte), então a comparação correta é:

> primary cached vs. fast uncached

| Rota | Latência Estimada | Observação |
| :-------------------------------- | :-------------------- | :-------------------------------------------------------------------- |
| Primary com 80% de hit no prefix cache | ~1.8-2.2s | Desempenho real atual da rodada de summary. |
| Fast sem cache (caches não compartilhados entre modelos) | ~1.5-2s | Desempenho real após a troca para D2. |

**Diferença líquida: algumas centenas de milissegundos; pode ser que o fast seja até mais lento**. Somando-se o custo de engenharia de 14-16d + risco de qualidade + desperdício do fallback, **o ganho líquido de D2 é próximo de zero ou negativo**.

**É obrigatório adicionar** uma nova pré-condição na §3.2: a medição da linha de base **deve** comparar primary **cached** vs. fast **uncached**, e D2 **não deve ser ativado** se `T_primary_cached < T_fast_uncached × 1.5`.

### 7.3 Lista de Candidatos (Reordenados por "Quick Win")

**Quick Wins Verdadeiros (ação imediata, <1d de esforço, risco muito baixo, ganho certo)**:

| Item | Esforço | Ganho | Local de Atuação |
| :---------------------------------------------------------- | :-------- | :------------------------------------------------------- | :-------------------------------------------------------------------------- |
| Instrução de resposta concisa | 30min | ~2s/rodada de summary (tokens de saída pela metade) | Adicionar uma frase ao segmento Final Reminder em `prompts.ts`. |
| Expor telemetria de cache hit rate | 0.5d | 0s direto, é um **facilitador** para decisões futuras | `cachedContentTokenCount` já coletado, falta expor; também deve marcar separadamente após `save_memory`. |

**Quase Quick Wins (esperar dados para decidir, 0.5-1d de esforço)**:

| Item | Esforço | Ganho | Pré-condição para Decisão |
| :----------------------------------------------------------- | :--------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool_choice='none'` na rodada de summary | 0.5-1d | 0.3-1s (sampling pula tokens de tool_call) | Precisa de lógica para determinar "é a rodada de summary"; risco de erro baixo. |
| Desligar thinking na rodada de summary | 1d | 0.5-2s | Só faz sentido para modelos com thinking ativado (qwen3.5-plus, glm-4.7, kimi-k2.5, etc.). |
| Chunk batching na camada de renderização da UI | 0.5d pesquisa + 0.5d implementação | A validar | Premissa: o custo acumulado de renderização de tokens com `useGeminiStream` em summaries longos pode ser significativo. |

**A Investigar (Podem ser Grandes Ganhos)**:

| Item | Esforço de Pesquisa | Ganho Potencial | Incógnita Chave |
| :-------------------------------------------------------------------- | :------------------------- | :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Suporte a `scope: 'global'` no DashScope~~ | ~~0.5d docs + 0.5d A/B~~ | ~~Hit entre sessões~~ | **Já investigado, conclusão (c) inviável** (ver resultado da pesquisa da Descoberta B na §7.4). Esta linha mantida como registro de decisão; não reabrir a investigação. |

**Modificações Médias (Não são Quick Wins, Avaliar Separadamente)**:

| Item | Esforço | Risco | Ganho |
| :------------------------------------------------ | :------ | :---- | :----------- |
| D1 `skipLlmRound` (cenário de consulta de estado final) | 2-3d | Médio | 3-4s/rodada de estado final |
| Corte de resultados de ferramentas na rodada de summary (subconjunto de D5) | 2d | Médio | 1-2s |
| Estado `Summarizing` (D3) | 3-5d | Médio | Melhoria percebida de 3s |
| Redução do system prompt | 2-3d com A/B | Médio | 0.5-1s |

**Direções Abandonadas (Não Fazer Mais)**:

| Item | Razão para Abandono |
| :------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| Roteamento de modelo fast D2 | Neutralizado pelo cache do DashScope; ganho líquido próximo de zero ou negativo. |
| Prevalidation D4 | Atribuição de ganho incorreta (real é apenas ~50ms do modelo de agendamento); investimento de 5-7d não vale a pena. |
| Estabilização do system prompt | Já está estável; não há o que fazer. |
| Terminalização precoce do streaming (abortar cortesia final) | Alto risco de julgamento incorreto; usuário percebe a resposta como cortada abruptamente. |

### 7.4 Três Novas Descobertas que Valem a Pena Explorar

#### Descoberta A: Mecanismo Real de `tool_choice='none'`

Na API OpenAI / DashScope, `tool_choice='none'` não é apenas "proibir chamada de ferramenta" — durante a fase de sampling do modelo, **a distribuição de probabilidade para o token especial `<tool_call>` é completamente ignorada**, e o decoder segue diretamente pelo caminho de geração de linguagem natural. O ganho não está em "evitar uma ou duas tentativas de retry", mas sim no fato de o sampling em si ser mais rápido.

#### Descoberta B: `scope: 'global'` já tem precedente com Anthropic no repositório

`packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` já possui o uso de `cache_control: { type: 'ephemeral', scope: 'global' }`. No entanto, em `provider/dashscope.ts:288`, ao marcar `cache_control`, **o parâmetro `scope` não é passado**:

```typescript
cache_control: { type: 'ephemeral' },   // sem scope
```

Se o servidor do DashScope reconhecer `scope: 'global'`:

- `system + tools` seriam promovidos a cache global (TTL muito maior que os 5min do `ephemeral`).
- **Haveria hit entre sessões**, reduzindo também a latência de inicialização.
- Só este ganho poderia superar todos os ganhos hipotéticos do D2 original.

##### Resultado da Pesquisa (2026-05-26, Conclusão: (c) Inviável, Fechar Esta Linha)

Fatos obtidos através da documentação oficial da Alibaba Cloud (help.aliyun.com/zh/model-studio/context-cache):

| Pergunta | Conclusão | Evidência |
| :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| Suporte ao campo `scope` | **Não suporta**. Apenas reconhece `type: 'ephemeral'`; qualquer `scope`/`persistent`/`global` é silenciosamente ignorado. | Texto original da documentação oficial: "Apenas suporta definir `type` como `ephemeral`". |
| TTL real do ephemeral | **Janela deslizante de 5 minutos** (reinicia após um hit). | Documentação do Bailian claramente explicada. |
| Mecanismo de TTL longo / Global | **Não há nenhum mecanismo via API pública**. Não existe valor de tipo `persistent`, nem API independente de pré-upload, nem `prompt_cache_key`; o único produto de "cache global persistente" é o Context Cache Global do PAI (self-deploy + vLLM + Lingjun + Redis compartilhado), não relacionado à API do DashScope. | Documentação do PAI. |
| Compartilhamento entre sessões | Mesma conta + mesmo modelo + conteúdo correspondente → já há hit (isto é o que o `ephemeral` já faz); contas diferentes absolutamente não compartilham. | Documentação do Bailian. |
| Preço | Cache write 125%, cache read explícito 10%, **cache read implícito 20%** (mesmo sem marcar `cache_control`, já se obtém o desconto implícito de 20%). | Documentação de preços do Bailian. |
| Prompt mínimo armazenável em cache | **1024 tokens**. | Documentação do Bailian. |
| Modelos com suporte (cache explícito) | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 estão listados explicitamente. **qwen3.6-plus e qwen3.7-max também usufruem do desconto de 90% para cache explícito.** | Lista de modelos do Bailian (reverificado em 2026-05-26). |

**Implicações Adicionais das Subdescobertas**:

1.  **A janela deslizante de TTL** é uma boa notícia para o agent loop — o intervalo entre chamadas consecutivas no loop é geralmente <30s, **o cache está sempre fresco, nunca expira em 5 minutos**.
2.  **O desconto de 20% para cache implícito** é um bônus gratuito — mesmo sem marcar `cache_control`, ele é obtido; mas o controle fino requer o cache explícito.
3.  ~~`qwen3.6-plus` não estava na lista explícita~~ — **Correção (2026-05-26)**: Após reaverificação, qwen3.6-plus **está sim na lista de cache explícito**, usufruindo do desconto de 90%. O relatório anterior continha um erro nesta parte, já corrigido na primeira tabela desta seção.
4.  **A prática atual em `dashscope.ts:288` já é o limite da capacidade da API pública do DashScope** — não há mais espaço para otimização.

**Reforço Adicional ao Julgamento de D2 na §7.2**:

A janela deslizante de TTL significa que, dentro do agent loop, a rodada de summary **atinge o cache do primary com quase 100% de probabilidade** (acabou de ser atingida nas rodadas anteriores, dentro de 5 minutos). Mudar para o modelo fast em D2 não apenas quebraria a cadeia de escrita de cache acumulada, **mas também faria a rodada de summary regredir de "quase 100% de hit" para "completamente miss"** — o julgamento do ganho líquido é ainda mais claramente negativo do que a suposição original na §7.2.

#### Descoberta C: Camada de Renderização da UI é um Ponto Cego Negligenciado

A linha de base da §1.2 marca a "sobrecarga do framework" como 0.3s (3%), mas é uma estimativa grosseira. Ink 7 + React 19.2, em cada chunk, dispara setState → re-render; em summaries longos, isso pode acumular 200-500ms. É necessário verificar como o `useGeminiStream` lida com o fluxo de tokens, se há `requestAnimationFrame` / `useDeferredValue` para mesclar chunks.

### 7.5 Checkpoints de Dados — Quando os Dados Chegarem, Qual Decisão Revisitar

Esta seção é a **porta de entrada ativa deste documento**: quando qualquer dado de métrica chegar, consulte a tabela abaixo para decidir qual decisão deve ser reavaliada.

#### Checkpoint 1: Após os Dados de Cache Hit Rate

**Condição de Gatilho**: O quick win "Expor telemetria de cache hit rate" está online há ≥3 dias, e o log de decisão contém a distribuição de `cached_tokens` / `prompt_tokens`.

**Dados a Observar**:

- Distribuição P50, P90 da taxa de hit geral (cached / prompt).
- Discriminado por rodada: Rodada 1 / Rodada 2 / Rodada 3 (summary) com suas respectivas taxas de hit.
- Taxa de hit na rodada seguinte a um gatilho `save_memory` (deve ser próxima de 0).
- Taxa de hit na rodada seguinte a uma troca de `/model` (deve ser próxima de 0).

**Árvore de Decisão**:

| Taxa de Hit Geral | Significado | Ação |
| :-------------------- | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| > 70% | A situação atual já está perto do limite teórico | Fazer apenas #1 Instrução concisa + pesquisa da Descoberta B; demais quick wins conforme necessidade. |
| 40-70% | Ainda há espaço, mas a fonte é desconhecida | Analisar por rodada para identificar qual segmento está errando o cache. |
| < 40% | Há pontos dinâmicos quebrando o cache | Reauditar frequência do system prompt / userMemory; pode ser que `save_memory` seja mais frequente que o esperado. |

#### Checkpoint 2: Resultado da Pesquisa sobre `scope: 'global'` do DashScope ✅ Concluído (2026-05-26)

**Resultado**: **Completamente não reconhecido**. Ver detalhes no segmento "Resultado da Pesquisa" da Descoberta B na §7.4.

**Ação Executada**: Aceitar a situação atual; pular este item. `dashscope.ts:288` mantém a marcação `ephemeral` existente, sem necessidade de modificação.

**Não reabrir esta pesquisa no futuro** — a menos que a DashScope anuncie oficialmente um novo mecanismo de persistência.

#### Checkpoint 3: Resultado da Pesquisa da Camada de Renderização da UI

**Condição de Gatilho**: Pesquisa da Descoberta C concluída (analisar o processamento do fluxo de tokens em `useGeminiStream` + medição com React DevTools/Ink).

**Árvore de Decisão**:

| Resultado | Ação |
| :------------------------------------------- | :------------------------------------------------------------------ |
| Custo de renderização de summary longo acumulado > 200ms | Adotar batching (`useDeferredValue` ou throttling customizado). |
| Custo de renderização < 100ms | Fechar esta linha de investigação. |

#### Checkpoint 4: Segunda Medição de Linha de Base Após "Quick Wins Verdadeiros"

**Condição de Gatilho**: Fazer #1 Instrução concisa + decisões do Checkpoint 1/2/3 concluídas há ≥1 semana.

**Dados a Observar**:

- RT ponta a ponta P50 comparado com a linha de base da amostra única da §1.2 (13.4s).
- P50 / P95 apenas da rodada de summary.
- Taxa de perguntas de acompanhamento do usuário (se o quick win A também implementou a classificação de entrada do usuário).

**Árvore de Decisão**:

| Economia Acumulada | Ação |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| > 4s (atingindo 9.6s P50 ponta a ponta) | Avaliar D1 `skipLlmRound` (economizar mais 3-4s/rodada de estado final). |
| 2-4s | Aceitar situação atual; avaliar se a melhoria percebida de D3 vale a pena. |
| < 2s | Reavaliar: o quick win foi superestimado, ou há gargalos não identificados (RTT de rede, latência do provedor)? |

### 7.6 Julgamento Final vs. Cada Direção da §3

Com base na validação da §6 + reavaliação de ROI desta seção:

| Direção | Prioridade Original na §3 | Julgamento desta Seção | Motivo |
| :---------------------- | :-------------------------------------- | :------------------------------------ | :----------------------------------------------------------------------------------------------------------------------- |
| D1 Instrução Pós- Ferramenta | P0 | **Manter P0**, mas reavaliar após conclusão dos quick wins. | ROI ainda bom, mas não "fazer imediatamente" — primeiro capturar os quick wins mais baratos. |
| D2 Rota Rápida de Summary | P1 | **Adiar / Won't Fix** | Neutralizado pelo cache do DashScope; investimento de 14-16d para ganho próximo de zero. |
| D3 Desacoplamento de Exibição | P1 | **Manter como Opcional**, depender dos dados do Checkpoint 4. | Melhoria percebida é certa, mas RT absoluto não muda; depende do comportamento do usuário. |
| D4 Agendamento Antecipado de Streaming | P2 | **Adiar** | Atribuição de ganho incorreta; ~50ms reais não valem 5-7d. |

### 7.7 Ordem de Execução Recomendada

**Dia 1** (pode ser feito por uma pessoa em um dia):

- ✅ Adicionar instrução de resposta concisa em `prompts.ts` (30min).
- ✅ Expor `cachedContentTokenCount` para telemetria + marcar gatilhos de `save_memory` / `/model` (0.5d).
- ✅ Iniciar pesquisa da Descoberta B: consulta de docs sobre `scope: 'global'` do DashScope + comparação com uso existente do Anthropic (0.5d).

**Dia 2-3**:

- Coletar primeiros dados de cache hit rate.
- Iniciar pesquisa da Descoberta C: caminho de renderização React do `useGeminiStream`.
- Decidir, com base no Checkpoint 2, se a modificação para `scope: 'global'` é necessária.

**Final da Semana 1**:

- Decisão com dados do Checkpoint 1 (analisar distribuição).
- Decidir se faz `tool_choice='none'` / desliga thinking (com base nos dados de hit rate).

**Semanas 2-3**:

- Checkpoint 4: segunda medição de linha de base.
- Decidir se inicia D1 (maior item não quick win, 3-4s/rodada de estado final).

**Sempre Não Fazer**: D2 / D4 / Estabilização do system prompt.

### 7.8 Auditoria de Conteúdo Dinâmico em `prompts.ts` (2026-05-27)

A §7.1 concluiu que "o system prompt já está estável" baseando-se apenas em um grep superficial. Esta seção é uma auditoria sistemática de `packages/core/src/core/prompts.ts` (1169 linhas), listando as evidências para servir de base para a análise futura de cache hit rate e decisões sobre quick wins.

**Método de Auditoria**: Enumerar todas as expressões de interpolação `${...}`, IIFEs, chamadas a `process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*`, e para cada uma, julgar "se mudará ou não dentro de uma mesma sessão".

#### Ausência Completa (Problemas Graves Comumente Suspeitos)

| Candidato | Fato do Código |
| :-------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `Date.now()` / `new Date()` | **Zero ocorrências** em todo o texto (`rg` não encontrou nenhuma correspondência). |
| `Math.random()` | **Zero ocorrências**. |
| Valor de `process.cwd()` escrito no prompt | Apenas L366 `if (isGitRepository(process.cwd())) { ... }`, **o valor não é escrito em nenhuma string**, serve apenas como chave. |
| Chamada de subprocesso para git status / git branch | **Zero**, a seção do git é texto de orientação estático. |
| Injeção de lista de arquivos atuais / estrutura do projeto | **Zero**. |
| Status LSP / número de erros | **Zero**. |
| Histórico de entrada do usuário | **Zero** (o histórico vai nas mensagens, não no system). |

#### Definido na Inicialização, Invariável na Sessão

| Localização | Conteúdo | Quando Pode Mudar |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------- |
| L190 | `process.env['QWEN_SYSTEM_MD']` decide a fonte do basePrompt (padrão vs. system.md do usuário). | Invariável no processo. |
| L342-343 | `process.env['SANDBOX']` decide qual versão do segmento sandbox (Seatbelt / Sandbox / Outside). | Invariável no processo. |
| L366 | `isGitRepository(process.cwd())` decide se o segmento git é inserido. | cwd normalmente invariável na sessão. |
| L871 | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` decide o estilo de tool call (qwen-coder / qwen-vl / general). | Invariável no processo. |

#### Acionado por Eventos (Baixa Frequência)

| Parâmetro | Condição de Gatilho | Frequência Estimada |
| :------------------------------------------------------------ | :-------------------------------------------------------------------- | :--------------------- |
| `userMemory` (1º parâmetro de `getCoreSystemPrompt`) | Ferramenta `save_memory` / `/memory refresh` / carregamento de extensão | 0-3 vezes/sessão |
| Nome do `model` (afeta qual ramo `getToolCallExamples` escolhe) | Troca de `/model` | Raro |
| `appendInstruction` | Item de configuração, basicamente invariável na sessão | Quase nunca |
| `deferredTools` (`buildDeferredToolsSection`) | Carregamento dinâmico de ferramentas MCP | Mais frequente no início da sessão |

#### Um Pequeno Problema Oculto

L207-209: Se a env `QWEN_SYSTEM_MD` estiver definida, **a cada** `getCoreSystemPrompt`, `fs.readFileSync(systemMdPath)` é chamado:

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- Quando o arquivo não muda, o conteúdo é estável → o hit do cache não é afetado.
- Mas a cada chamada LLM, há uma E/S síncrona (por padrão, `.qwen/system.md`; arquivos montados em rede serão mais lentos).
- Não afeta a conclusão "cache-friendly" desta seção, apenas registrado como um pequeno problema de desempenho conhecido.

#### Conclusões Adicionais

1.  **O system prompt, em uma sessão estável, produz exatamente o mesmo byte a byte a cada chamada** → a chave de cache ephemeral do DashScope (baseada no hash do conteúdo) é estável para todo o segmento → **a taxa de hit do cache para o segmento system é quase 100%**.
2.  O único evento que quebra o cache é `save_memory` — funcionalidade central, não pode ser sacrificada por causa do cache.
3.  **Análise de custo do quick win #1 (Instrução de resposta concisa)**: Adicionar a instrução ao segmento Final Reminder (L389-390) → o conteúdo do system prompt muda uma vez → **a primeira requisição terá cache miss (custo único de warm-up), mas todas as requisições subsequentes continuarão a ter hit**.
4.  **O julgamento "Estabilização do system prompt já está abandonado" da §7 recebe suporte formal de evidências** — não só é desnecessário fazer, como a afirmação "teoricamente, fazer isso reduziria ainda mais a taxa de cache miss" não se sustenta, pois a taxa já é ≈ 0.
5.  Esta auditoria pode servir como linha de base para futuras discussões relacionadas, evitando greps repetidos; se houver grandes alterações em `prompts.ts`, esta seção precisará ser atualizada em conjunto.