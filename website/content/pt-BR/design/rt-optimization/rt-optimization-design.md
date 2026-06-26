# Plano Técnico de Otimização RT do Loop de Agente do Qwen Code

## 1. Contexto e Definição do Problema

### 1.1 Situação Atual

O Loop de Agente do Qwen Code atualmente segue um modelo estritamente sequencial:

```
User Prompt → [Decisão LLM] → Execução de Ferramenta → [Decisão LLM] → Execução de Ferramenta → ... → [Resposta LLM] → Idle
               ~3-4s          ~Xms-Ns          ~3-4s          ~Xms-Ns            ~3-4s
```

Cada chamada LLM (incluindo RTT de rede + inferência do modelo) leva cerca de 3-4s, sendo o principal custo do RT ponta a ponta.

### 1.2 Dados Medidos

Cenário de teste: "Quais espaços de trabalho tenho" (3 rodadas de loop de agente, 2 chamadas de ferramenta, amostragem única)

| Fase                             | Duração | Proporção |
| -------------------------------- | ------- | --------- |
| LLM Rodada 1 (decidir chamar skill) | 3.8s    | 28%       |
| Execução da Skill                | 1ms     | <1%       |
| LLM Rodada 2 (decidir chamar shell) | 3.0s    | 22%       |
| Execução do Shell                | 2.5s    | 19%       |
| LLM Rodada 3 (resumo textual)    | 3.8s    | 28%       |
| Overhead do framework (sincronização de estado, renderização) | 0.3s    | 3%        |
| **Total**                        | **13.4s** | 100%      |

**Conclusão**: Chamadas LLM representam 78%, execução de ferramentas 19%, framework 3%. O foco da otimização é **reduzir o número de chamadas LLM** e **reduzir a latência de cada chamada LLM**.

> Nota: Amostragem única, cenário único. Os 19% de execução de ferramentas são dominados por chamadas shell lentas; em cenários com muita leitura, a execução de ferramentas pode cair para <5%. Antes da implementação da solução, é necessário complementar a linha de base com ≥3 tipos de cenário (operações de escrita, raciocínio entre ferramentas, recuperação de erros).

### 1.3 Restrições Chave da Arquitetura Atual

| Restrição                        | Localização no Código                                                                                   | Descrição                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sem diretiva pós-resultado da ferramenta | `tools.ts` Interface `ToolResult` (L422)                                                                 | Apenas `llmContent`/`returnDisplay`/`error`, sem capacidade de expressar "pular LLM"                     |
| Resultados sempre retornados ao LLM | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355)               | Todos os resultados de ferramentas iniciadas pelo Gemini são retornados                                   |
| Agendamento apenas após fim do stream | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                                 | `scheduleToolCalls` só é chamado após o término do loop do stream, sem agendamento incremental           |
| Seleção de modelo sem camada de estratégia | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                                 | A infraestrutura já está integrada até `turn.run(model, …)` (L1707), mas é usada pelo chamador apenas quando explicitamente especificado na skill |

### 1.4 Infraestrutura Pronta (amplamente reutilizada neste plano)

| Capacidade                                    | Localização                                                     | Situação                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Configuração `fastModel` + `/model --fast <id>` | `config.ts:684`, `1987`, `2021`                                  | Pronta                                                                                                 |
| `SendMessageOptions.modelOverride`            | `client.ts:142` → `1598` → `turn.run`                            | Integrada ponta a ponta até `geminiChat.sendMessageStream(model, …)`                                    |
| Camada de hook `modelOverrideRef` (suporta seleção de modelo pela skill) | `useGeminiStream.ts:376`, `2225`, `1841`                         | Integrada                                                                                              |
| Precedente de query lateral **não-streaming** com fast-model | `services/toolUseSummary.ts:108` (via `runSideQuery`)             | Já em produção, comprova que a configuração do fast model está saudável; mas **caminho não-streaming** |
| Precedente **streaming** com fast-model        | `followup/speculation.ts:224`                                     | Já em produção, mas **usa chat bifurcado** (`createForkedChat`), isolado do chat principal               |

**Lacuna chave**: **Nenhum código de produção** executa streaming no chat principal com fast model. A Direção 2 deste plano é o primeiro caso, sendo necessário primeiro realizar experimentos de validação (veja §3.2 Pré-condições).

---

## 2. Princípios de Design

1. **Generalidade**: O plano não se vincula a uma tool/skill específica
2. **Compatibilidade Retroativa**: Ferramentas existentes continuam funcionando sem modificações
3. **Progressivo + Sinal Explícito**: A estratégia é conservadora por padrão, com opt-in para otimização através de campos explícitos pelos autores das ferramentas
4. **Reversibilidade**: Todas as otimizações são controladas por feature flags; podem ser desativadas por nível de usuário
5. **Compensações Honestas**: Risco de qualidade, risco de custo e limites de aplicabilidade são claramente sinalizados

---

## 3. Plano de Otimização

### 3.1 Direção 1: Diretiva Pós-Execução de Ferramenta (ToolResult Post-Execution Directive)

#### Problema

Atualmente, `ToolResult` não contém nenhuma informação sobre "o que fazer a seguir". Independentemente de o resultado da ferramenta ser autoexplicativo, ele aciona incondicionalmente uma rodada LLM.

#### Design

Extender a interface `ToolResult` (`packages/core/src/tools/tools.ts` L422):

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // Novo: Diretiva pós-execução
  postExecution?: {
    /**
     * O resultado da ferramenta não é retornado ao LLM, sendo exibido diretamente como resposta final ao usuário.
     * Adequado para cenários onde o resultado é completamente autocontido e não requer reinterpretação pelo modelo.
     * É uma propriedade local de ToolResult.
     */
    skipLlmRound?: boolean;

    /**
     * O resultado da ferramenta é "autocontido e pode ser exibido diretamente ao usuário" — ou seja, `returnDisplay` já é
     * a forma final que o usuário espera ver, sem necessidade de processamento pelo modelo.
     * É uma propriedade local de ToolResult, **não** prevê se a "próxima rodada é um resumo".
     * Interage com a Direção 3 (desacoplamento de exibição): true → entra no estado Summarizing permitindo entrada do usuário.
     */
    resultIsTerminal?: boolean;
  };
}
```

> **Correção de design**: Versões anteriores usavam um único campo `selfExplanatory` para carregar tanto o atributo "produto da ferramenta" quanto o sinal de "previsão do fluxo do diálogo", mas os dois não coincidem (exemplo: o prompt do usuário é "leia X e depois ajuste Y", a saída de `read_file` é autocontida, mas a próxima rodada claramente não é um resumo). **Sinais de previsão pertencem ao atributo global do fluxo do diálogo** e não devem ser expressos através de campos da ferramenta — a Direção 2 será alterada para usar heurísticas do fluxo do diálogo (veja §3.2).

#### Mudança de Comportamento

Nova verificação em `handleCompletedTools`:

```
Lote de ferramentas concluído
  → Verificar `postExecution.skipLlmRound` de todas as ferramentas no lote
  → Todas true?
    → SIM: markToolsAsSubmitted, não chamar submitQuery, entrar em idle diretamente
    → NÃO: manter comportamento atual (submitQuery)
```

**Restrição importante**: `skipLlmRound` só é eficaz quando **todas as ferramentas do lote atual declararem skip**. Lotes mistos ainda retornam.

#### Invariante de Histórico

Depois de pular o LLM, o histórico fica: `user → function_call → function_response → <sem assistant>`.

- Verificar se `repairOrphanedToolUseTurnsInHistory` (chamado ao carregar sessão) tolera esta forma
- Verificar comportamento do auto-compaction na ausência de texto do assistant
- PR #4176 acabou de fechar a invariância tool_use↔tool_result; antes de implementar, adicionar testes unitários cobrindo a alternância "pular LLM seguido de nova mensagem do usuário"
- API estilo Qwen / OpenAI tolera; Anthropic exige alternância estrita — se no futuro suportar conexão direta com Anthropic, será necessário um fallback (injetar texto assistant vazio no history)
> **Ponto de correção unificado**: Aqui e em §3.3 (Interrupção no meio do Summarizing D3) violam **a mesma invariante de histórico**. A correção tem duas opções (injetar assistant vazio / aceitar tolerância Qwen), e ambas as direções devem usar a mesma escolha.

#### Sinalização ecológica (Trabalho da Fase 2)

| Ferramenta                           | `skipLlmRound`       | `resultIsTerminal` | Observações                                                       |
| ------------------------------------ | -------------------- | ------------------ | ----------------------------------------------------------------- |
| `read_file`                          | Compatível com cenário query-only | true               | Conteúdo do arquivo é a resposta                                  |
| `cat` (via shell)                    | Depende do cenário   | true               | O mesmo que read_file                                             |
| `grep` / `glob` / `ls`               | false                | **false (padrão)** | Resultados frequentemente precisam de seleção/ordenação/resumo pelo modelo; a camada skill define como true explicitamente em cenários conhecidos como "consulta pura" |
| `git status` / `git log` (via shell) | false                | true               | Saída já formatada                                                |
| Ferramentas Skill                    | Cada skill decide    | Cada skill decide  | Skills de consulta tendem a true                                  |
| Ferramentas MCP                      | Padrão false         | Padrão false       | Opt-in explícito via allowlist                                    |

Ferramentas de terceiros/MCP não são confiáveis, por padrão não recebem marcação; habilite explicitamente via `config.toolPostExecAllowlist`.

> `grep/glob/ls` padrão false é uma escolha restritiva: evita que D2/D3 julguem erroneamente em cenários que requerem resumo/ordenação pelo modelo.

#### Aplicável e não aplicável

- **Aplicável**: Consultas de estado final (tipos read/cat/print), resultados autocontidos (skill já formatou a saída)
- **Não aplicável**: Etapas intermediárias de tarefas múltiplas, confirmação de operações de escrita, logs complexos que precisam de interpretação

#### Riscos e Mitigações

| Risco                                                                   | Gravidade | Mitigação                                                                   |
| ----------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| Ferramenta configurada incorretamente com skipLlmRound causa interrupção de tarefa de múltiplas etapas | Médio     | Semântica de batch + llmContent ainda está no histórico e pode ser recuperado |
| Abuso de ferramentas de terceiros                                       | Médio     | MCP desabilitado por padrão, allowlist habilita explicitamente              |
| Violação de invariante de histórico                                     | Médio     | Complementar testes unitários antes do lançamento; cobertura de replay session-load |
| Inconsistência de expectativa do usuário (esperava resumo mas não houve) | Baixo     | Configuração `alwaysSummarize: true` pode substituir                        |

#### Benefícios

Cenários de consulta de estado final economizam 3-4s (pula a última rodada de LLM).

---

### 3.2 Direção 2: Estratégia de roteamento fast-model para a rodada de resumo

#### Posicionamento

**Esta direção não introduz um novo pipeline, mas requer a extensão da interface GeminiChat para suportar a troca de modelo em tempo de execução**.

A infraestrutura de §1.4 fornece configuração de modelo fast e ponta a ponta do modelOverride, mas **não há precedente para executar fastModel + streaming no chat principal**, portanto é necessário:

- Função de decisão: quando passar `config.getFastModel()` como override
- Fallback seguro: nova interface `GeminiChat.retryStreamWithModel` (lida com estado interno do chat)
- Validação experimental: alternar entre fast/primary no chat principal não quebra compaction / history-recording

#### Escopo de aplicação

D2 atua apenas em:

- **useGeminiStream** (caminho principal TUI) — ponto de chamada `sendMessageStream` L1841
- **ACP Session** (caminho de integração IDE) — `acp-integration/session/Session.ts:1182`, modificação síncrona na Fase 3

D2 **não atua** nos seguintes caminhos, para evitar introduzir modos de falha adicionais em contextos não interativos ou independentes:

- **Tempo de execução do Subagent** (`agents/runtime/agent-core.ts:614`): subagent já tem sua própria configuração de modelo independente
- **Turn acionado por Cron** (`SendMessageType.Cron`, client.ts:127): não interativo, sem urgência de RT
- **Turn de Notificação** (`SendMessageType.Notification`, client.ts:129): o mesmo

#### Dificuldade principal

Ao chamar `submitQuery` **não sabemos** se o modelo, após ver os resultados, irá invocar uma nova ferramenta ou apenas gerar texto. Se usarmos fast model e o modelo na verdade precisar invocar ferramentas — a consequência é **silenciosa**: o fast pode chamar a ferramenta errada ou parâmetros errados, e o erro não terá sinal visível.

**Nenhum campo no nível da ferramenta pode prever confiavelmente** se a "próxima rodada é um resumo", pois depende do fluxo da conversa (user prompt + contexto acumulado), não de propriedades locais do resultado da ferramenta. Exemplo:

```
Usuário: "Leia utils.ts e depois mude todos os console.log para logger.info"
  → Tool 1: read_file → resultado autocontido
  → Mas a próxima rodada claramente não é um resumo
```

Portanto, D2 prevê completamente usando **heurística de fluxo de conversa**, sem depender de campos de ferramenta.

#### Função de decisão: heurística de fluxo de conversa + negação

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== 用户级别强制开关（最高优先级） =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // 仍受运行时保险约束

  // ===== 用户意图否决 =====
  // 1. user prompt 含动作动词 → 下一轮大概率还要调工具
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. 本轮已有 mutator 工具 → 大概率有验证/读后续
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. 本轮或历史有未解决 error → 模型需要 primary 诊断
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== 输出复杂度否决 =====
  // 4. user prompt 要求深度分析（解释/对比/为什么类）
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. 工具调用 ≥3 个不同工具 → 跨结果叙述靠 primary
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. 工具输出过长 → 长内容总结靠 primary
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== 模型可行性否决 =====
  // 7. fast 模型 context window 不够 → 切到 fast 会触发 compression
  //    （compression 自身要 LLM 调用，反而拖慢且增加成本）
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== 多语言兜底 =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Session 状态兜底 =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

Significado dos oito itens de negação:

- **`requestImpliesFurtherAction`**: verbos de ação (`改|删|加|替换|修复|实现|新建|create|fix|change|add|remove|implement|write|update`) → tarefa de múltiplas etapas
- **`MUTATOR_KINDS` acionado**: já escreveu nesta rodada → grande probabilidade de seguir com uma leitura/verificação. **Reutilizar `MUTATOR_KINDS` existente em `tools.ts:806` = `[Edit, Delete, Move, Execute]`** (a propriedade `kind: Kind` de cada instância de Tool é a classificação autoritativa; não reinventar `isWriteTool`)
- **`hasUnresolvedError(turnResults, currentBatch)`**: julgamento em duas partes:
  - **Qualquer erro no lote atual → sempre não resolvido** (não assume que lotes paralelos podem se autocorrigir)
  - **Histórico por `(toolName, args fingerprint)`**: se o último ainda for erro, considera-se não resolvido (apenas por toolName, sob diferentes parâmetros com mesmo nome, pode julgar incorretamente)
  - shell etc. precisam preencher corretamente `ToolResult.error` (dependência de qualidade dos dados anteriores)
- **`needsDeepReasoning`**: contém palavras-chave como "análise/explicar/por que/comparar/diagnosticar"
- **`needsCrossResultReasoning`**: chamadas de ferramentas distintas ≥3 (mesma ferramenta e mesmos parâmetros contam como uma)
- **tokens de saída > 4000**: limiar empírico, **ajustar após medição da linha de base do modelo fast**
- **`wouldTriggerCompression`**: a janela de contexto do modelo fast geralmente é menor que a do primary; o mesmo histórico pode acionar `tryCompress` mais cedo no fast (geminiChat.ts:1418) — compression precisa de uma chamada LLM, podendo **piorar RT e custo**. Estimativa orçamentária: se `estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD`, considera-se que acionará
- **Idioma não suportado**: detecta apenas palavras-chave em chinês e inglês; outros idiomas (japonês, coreano, etc.) usam primary por padrão
- **Mudança de estado da sessão**: primeira continuação após `/compact` ou `/clear` → primary para reconstruir modelo mental
否决方向**青睐 primary**（宁可多 2s 不要降质）。

#### 关键实现：`GeminiChat.retryStreamWithModel`

**问题**：直接 abort + 调用 `client.sendMessageStream` 会破坏 chat 状态：

1. `geminiChat.ts:1428` 在 stream 启动时就 push `userContent` 到 history；重起会**再 push 一次**导致 history 出现重复 `function_response`
2. `sendPromise` 锁（`geminiChat.ts:1392, 1398`）—— abort 后需要确保 `streamDoneResolver` 被调用
3. `pendingPartialState` 等 PR #4176 引入的不变量 marker 需要正确清理
4. Telemetry span 的 model 属性需要更新

**新增接口**（`packages/core/src/core/geminiChat.ts`）：

```typescript
/**
 * Retry an in-flight or just-aborted streaming send with a different model.
 * Does NOT re-push userContent (kept from original send).
 * Resets pendingPartialState; releases stale sendPromise; re-opens span.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

调用契约：

- 仅在原 send 已经 abort 后调用（不并发）
- prompt_id 复用（同一用户意图）
- 历史中已经 push 的 userContent 不再 push

实现工作量约 1.5d 加单测。

#### 运行时保险

`selectContinuationTier` 返回 `'fast'` 但 stream 中出现 `ServerGeminiEventType.ToolCallRequest` 事件 → **立即 abort 当前流，调 `retryStreamWithModel(primaryModel)`**。

这覆盖"预测为 summary 实际仍需工具"的唯一静默放错场景。代价：一次 fast 调用浪费的 tokens（成本归因见 §5.3）。

#### 与 skill `modelOverride` 解耦

`useGeminiStream.modelOverrideRef`（L376, L2225）当前承载 **skill 显式选择的模型**，属"业务语义"。本方向的 fast 路由属"优化语义"，两者**必须分离**：

```typescript
// 新增独立 ref
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// 调用点合并（不复用 modelOverrideRef）
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // skill 显式选择优先
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

生命周期：

| 时机                                       | `modelOverrideRef`（skill） | `summaryTierRef`（fast 路由）            |
| ------------------------------------------ | --------------------------- | ---------------------------------------- |
| 新 user turn (`!Retry && !ToolResult`)     | 清空                        | 清空                                     |
| skill 工具返回 `modelOverride` 字段        | 写入                        | 不变                                     |
| tool batch 完成 → `selectContinuationTier` | 不变                        | 写入                                     |
| Runtime fallback（看到 ToolCallRequest）   | 不变                        | 升级为 `'primary'`                       |
| Retry（用户手动 Ctrl+Y）                   | 保留                        | 升级为 `'primary'`（fast 失败不再 fast） |

skill 显式选择**永远赢**——用户的显式意图优先于优化策略。

#### Telemetry 修正

`client.ts:1303` 的 interaction span 在 turn 启动时记录 `model` 属性。fallback 触发时 model 实际变了，span 数据失真。需要：

```typescript
// fallback 触发时
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

并在 `addUserPromptAttributes` 中区分 `requested` / `actual` 模型，避免计费/审计混淆。

#### 用户级别强制开关

新增 setting（`packages/cli/src/config/settingsSchema.ts`）：

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// default: 'auto'
```

- `'auto'`：使用 `selectContinuationTier`（推荐）
- `'always_primary'`：完全禁用 D2 优化（生产敏感场景）
- `'always_fast'`：跳过 vetoes，**仍受运行时保险约束**（高级用户）

理由：D2 是质量换速度，部分用户/场景需要明确退出权。

#### 前置条件

- `config.getFastModel()` 已配置
- **主 chat fastModel-streaming 验证实验**（编码前 1d）：
  - mock 一个 `resultIsTerminal=true` 工具，在主 chat 反复触发 summary 轮
  - 观察 `tryCompress` 是否被错误触发（fast 模型 context window 小可能提前触发）
  - 观察 chatRecordingService 输出是否有 model mismatch
  - 观察单次 fast 调用后下一次 primary 调用是否能正常读 history
- **Fast 候选模型基线测量**（1d）：
  - 跑 100 条 summary 轮 prompt（输入含 `function_response`），测 P50/P95 端到端延迟与 time-to-first-token
  - 测 `tryCompress` 触发率 `P_compact`，验证净 RT 收益 = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0`
  - 仅当 fast P50 ≤ primary P50 × 0.5 且 P95 ≤ primary P95 × 0.6 时启用
- Fast model 与 primary model 同家族（避免 function_response 编码差异）；跨家族需 `getFastModel()` 层校验拒绝
- **`thinkingConfig` 兼容性**：
  - Fast 模型必须与 primary 在 `thinkingConfig.includeThoughts` 支持上一致；或
  - Fast 路径强制 `includeThoughts: false`（与 `sideQuery.ts:118-122` 对齐）
  - 验证：history 含 thought parts 时 fast 模型能正确处理（不报错、不把 thought 当用户输入）

#### 风险与缓解

| 风险                                                                      | 严重度 | 缓解                                                                                                                                 |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Fast 模型 tool-calling 静默放错                                           | 高     | 对话流启发式 + 运行时 ToolCallRequest abort 保险                                                                                     |
| Fast 在含 error 的输入上幻觉成"对用户可见的错误回答"                      | **高** | `hasUnresolvedError` 否决；监控用户追问率（注：`emitToolUseSummaries` 的同类风险只影响 60 token 标签，本风险影响最终回答，量级更高） |
| Fast 路径触发 `tryCompress` → 多一次 LLM 调用，**反向恶化 RT 和成本**     | **高** | `wouldTriggerCompression` 预判 gate（见决策函数 #7）；前置基线测量 P_compact 阈值                                                    |
| Compression 自身用谁的模型                                                | 中     | 触发 compression 即放弃 fast 路由（gate #7 兜底）；避免回答出问题                                                                    |
| 主 chat 切模型让 chat 内部状态/recording 异常                             | 中     | 前置验证实验覆盖；session resume 重放测试                                                                                            |
| D2 与 `emitToolUseSummaries` 同时触发 concurrent fast 调用，超 rate-limit | 中     | 二选一：D2 启用时禁用 `emitToolUseSummaries`（标题不影响功能），或共享 rate-limit token bucket                                       |
| `thinkingConfig` 在 fast / primary 间不一致导致 history 解析异常          | 中     | 同家族 + fast 路径强制 `includeThoughts: false`（见前置条件）                                                                        |
| Fallback 路径反而更贵（fast tokens 浪费 + primary 全程）                  | 中     | `fast_tokens_consumed` 决策日志监控；fallback 率 >20% 自动关 flag                                                                    |
| Telemetry span model 失真                                                 | 中     | `requested` / `actual` 拆分（见 Telemetry 修正）                                                                                     |
| 上下文格式不兼容（跨家族）                                                | 中     | `getFastModel()` 拒绝跨家族选择                                                                                                      |
| 与 skill modelOverride 语义冲突                                           | 中     | 独立 ref + skill 优先                                                                                                                |
| `/model` 运行时切换主模型后 `summaryTierRef` 决策失效                     | 低     | `/model` 命令处理时同步清空 `summaryTierRef`                                                                                         |
| fast tokens/s 反而更慢                                                    | 低     | 实测时同时测 TTFT，不只总 RT                                                                                                         |
####  Benefícios (a serem medidos na prática)

- **RT**: economia de 2-3s por rodada de sumário (antes de escrever o título do PR, na prática)
- **Custo**: o preço unitário do modelo fast geralmente é significativamente menor que o do primary; em cenários de sumário com alta frequência, o custo de tokens pode cair de 30 a 50%; mas o desperdício do caminho fallback compensa parte do ganho — é necessário medir o ganho líquido com `fast_tokens_consumed` na prática

---

### 3.3 Direção 3: Desacoplamento da Exibição e Interação dos Resultados (Presentation Decoupling)

#### Problema

O usuário precisa esperar a rodada de sumarização do LLM terminar para poder inserir novamente, desde a conclusão da ferramenta:

```
Ferramenta concluída → [Renderizar resultado] → [submitQuery] → [Esperar 3-4s de resposta em streaming do LLM] → Idle → Pode inserir
                                         ~~~~~~~~~~~~~~~~~~~~~~~~
                                         O usuário já viu o resultado, mas não pode interagir
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

#### Alterações na Máquina de Estados

```
Ferramenta concluída e resultado exibido
  → Se todos do batch tiverem `postExecution.resultIsTerminal === true`:
    → Entrar em Summarizing (usuário pode inserir)
    → submitQuery executado de forma assíncrona
    → Sumário do LLM anexado ao histórico (ou cancelado por nova mensagem do usuário)
  → Senão:
    → Permanecer em Responding (usuário não pode inserir)
```

#### Tratamento de Nova Mensagem do Usuário

- Usuário envia nova mensagem no estado `Summarizing` → abortar o sumário atual → processar nova mensagem
- **Texto parcial do sumário já gerado é descartado** (não entra no histórico) para evitar poluição do contexto com um assistant pela metade
- `function_response` permanece no histórico (o modelo sabe que a ferramenta foi executada)
- Sugestões de followup são disparadas somente após o Summarizing ser concluído ou cancelado

#### Lista de Limpeza do Texto Parcial ao Abortar

O texto parcial está distribuído em vários lugares; precisa ser **limpo simultaneamente** — faltar um causa inconsistência de estado:

| Local                                                           | Ação de limpeza                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pendingHistoryItemRef.current` (useGeminiStream React state)  | Definir como `null`, não chamar `addItem`                                                  |
| Acumulação interna em `GeminiChat.history`                     | Se um conteúdo parcial de assistant já foi inserido antes do abort, reverter via nova interface `discardPendingAssistant()` |
| Buffered turn em `ChatRecordingService`                        | Marcar como cancelled, não escrever no JSONL                                               |
| `dualOutput.emitText` (se habilitado)                          | Enviar sentinel de abort; sidecar descarta por conta própria                                |
| Tokens acumulados em `loopDetectorRef`                         | Redefinir contagem da rodada atual                                                          |

Ordem de execução: sinal de abort é disparado → todas as cinco limpezas acima são concluídas → só então a nova mensagem do usuário pode entrar no `submitQuery`. Cobertura de teste de concorrência: o último chunk chega exatamente no momento em que o abort é disparado.

#### Condições de Aplicação

Todos do batch com `postExecution.resultIsTerminal === true`.

#### Invariante do Histórico (mesma origem da §3.1)

Interromper o Summarizing no meio gera:

```
[user_1, function_call, function_response, user_2]
                                          ↑ Nenhum turno de assistant
```

**Isso quebra o mesmo invariante que a §3.1 ao pular a rodada LLM**, exigindo a mesma estratégia de correção da D1 (injetar assistant vazio / aceitar que o Qwen tolera).

- Reutilizar os testes de invariante da D1
- Reprodução em session-load (incluindo `repairOrphanedToolUseTurnsInHistory`) deve cobrir essa forma
- Alternância do Anthropic: na conexão direta, complementar com o mesmo fallback da D1

#### Riscos e Mitigações

| Risco                                | Gravidade | Mitigação                                                           |
| ------------------------------------ | --------- | ------------------------------------------------------------------- |
| Assistant pela metade entra no histórico ao abortar | **Médio** | Descartar explicitamente o texto parcial; manter apenas `function_response`; testes unitários cobrindo race condition |
| Invariante do histórico quebrado (sem assistant sucedendo) | **Médio** | Problema de mesma origem que a D1; correção unificada (ver §3.1 Invariante do Histórico)                 |
| Complexidade do estado da UI aumenta                   | Médio     | Summarizing = Idle + tarefa em segundo plano; caminho de entrada reutiliza Idle               |
| Percepção de ganho pelo usuário depende do padrão de comportamento | Baixo     | Se o usuário não inserir dentro de 3s, o sumário já terminou → sem ganho percebido; mas **não degrada** |

#### Benefícios

- **Limite teórico**: 3-4s de RT percebido (usuário insere assim que a ferramenta termina)
- **Mediana real**: depende do intervalo de entrada do usuário — quem leva 2-5s lendo o resultado não sente diferença, mas **nunca fica mais lento**

---

### 3.4 Direção 4: Agendamento Antecipado em Streaming (Stream-Ahead Scheduling)

#### Problema

`processGeminiStreamEvents` só agenda ferramentas em lote depois que o stream termina completamente. O evento `ToolCallRequest` pode ter sido emitido no meio do stream.

#### Design

No processamento de eventos do stream, iniciar **pré-validação** (sem execução) imediatamente para `ToolCallRequest`:

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // Novo
  break;
```

`CoreToolScheduler.prevalidate(request)`:

1. Procurar o registro da ferramenta
2. Construir a invocação
3. Executar `shouldConfirmExecute` (cache do resultado)
4. Ao chamar `schedule()`, usar diretamente o resultado em cache

#### Contrato de Pureza e Allowlist

`prevalidate` exige que `shouldConfirmExecute` seja **sem efeitos colaterais** e que o resultado não seja invalidado por alteração externa no intervalo entre prevalidate e schedule.

**Reutilizar diretamente o `CONCURRENCY_SAFE_KINDS` de `tools.ts:818`**:

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

Essa classificação já existe no projeto como "sem efeitos colaterais + concorrente seguro", que atende perfeitamente a necessidade do prevalidate.

| Kind da ferramenta                | Está na allowlist?       | Motivo                                                    |
| --------------------------------  | ------------------------ | --------------------------------------------------------- |
| `Read` (read_file etc.)           | ✅                       | Somente leitura                                           |
| `Search` (grep / glob)            | ✅                       | Somente leitura                                           |
| `Fetch` (web_fetch etc.)          | ✅                       | Leitura remota, sem efeitos de escrita                     |
| `Edit`                            | **❌** (ver TOCTOU abaixo) | shouldConfirmExecute é somente leitura, mas o diff pode invalidar no intervalo de agendamento |
| `Delete` / `Move` / `Execute`     | ❌                       | MUTATOR_KINDS                                             |
| `Think`                           | ❌                       | Contém save_memory / todo_write etc., escritas implícitas  |
| Ferramentas MCP                   | ❌                       | Não confiáveis                                              |
**TOCTOU：Por que o Edit não entra na allowlist**

Teoricamente, `shouldConfirmExecute` do Edit é puramente somente leitura (lê arquivo, calcula diff). Mas existe uma janela de tempo entre prevalidate e schedule:

```
T=0      stream recebe Edit(file=a.ts, ...) → prevalidate
T=10ms   shouldConfirmExecute lê a.ts, cache diff_v0
T=300ms  stream termina, scheduler.schedule()
T=305ms  nesse período, outras ferramentas/IDE/processo externo modificam a.ts
T=310ms  scheduler exibe diff_v0 para o usuário
T=320ms  usuário confirma com base em v0
T=330ms  Edit aplica params antigos no arquivo v1 → corrompimento / falha no merge
```

Isso é TOCTOU. Direção de correção:

- **A (recomendado)**: Edit não entra na allowlist, prevalidate cobre apenas as três categorias `CONCURRENCY_SAFE_KINDS`. Custo: ganho reduz de "50-200ms (dominado por Edit)" para "50-100ms (apenas leitura)"
- **B (opcional, melhoria)**: Edit entra na allowlist, mas cache anexa `(mtime, size, content_hash)`; schedule() verifica se não mudou para usar cache, senão recalcula

Documentação opta por A por enquanto.

#### Interação com o escalonamento paralelo existente

`coreToolScheduler.attemptExecutionOfScheduledCalls` (L2436+) usa `partitionToolCalls` para dividir ferramentas em "batch seguro concorrente" e "batch serial", o batch concorrente executa via `runConcurrently` (L2473).

prevalidate precisa se alinhar com esse modelo de divisão:

- Cache indexado por `callId` (não por `(toolName, args)`, para evitar conflitos entre chamadas concorrentes de mesmo nome)
- Chamada com prevalidate falho → não afeta outras chamadas, no schedule essa chamada segue o caminho original de `shouldConfirmExecute`
- Cancelamento de stream → aborta todos os prevalidate in-flight em cascata via `signal`

#### Riscos

| Risco | Severidade | Mitigação |
|---------------------------------------------|-----------|----------------------------------------------------------------------|
| Cache diff inconsistente com arquivo real no momento da confirmação (TOCTOU) | Alto | Solução A: Edit não entra na allowlist; Solução B: cache com verificação de `(mtime, size, hash)` |
| Falha no prevalidate afeta escalonamento | Baixo | Falha/timeout retorna ao caminho original `shouldConfirmExecute`, ausência de cache ≡ não habilitado |
| Concorrência de prevalidate compartilhando fd / disputa de recursos | Baixo | `QWEN_CODE_MAX_TOOL_CONCURRENCY` já limita concorrência máxima (padrão 10) |

#### Ganhos

50-100ms/rodada (apenas escopo `CONCURRENCY_SAFE_KINDS`). Se optar pela solução B incluindo Edit, ganho teórico de 100-200ms.

---

## 4. Avaliação abrangente e roadmap

### 4.1 Avaliação abrangente

| Direção | Ganho RT | Complexidade de implementação | Risco de qualidade | Dependências | Prioridade |
|---------------------|---------------------------|--------------------------|----------------|------------------------------------------|-----------|
| D1 Diretiva pós-ferramenta | 3-4s/rodada final | Baixo (2-3d) | Baixo | Nenhuma | **P0** |
| D2 Roteamento rápido de summary | 2-3s/rodada de summary (a confirmar com medições) | **Médio-Alto (9d)** | Médio-Alto | Heurística própria do D2 + experimento de validação do chat principal + sincronização ACP | **P1** |
| D3 Desacoplamento de exibição | 3-4s melhoria percebida (dependente do comportamento do usuário) | Médio (3-5d, incluindo correção de invariantes) | Médio | Correção de invariantes históricos do D1 | **P1** |
| D4 Escalonamento antecipado por streaming | 50-200ms/rodada | Alto (5-7d) | Muito baixo | Nenhuma | P2 |

#### Detalhamento de carga de trabalho do D2

| Subtarefa | Estimativa |
|----------------------------------------------------------------------------------------------|-------|
| Experimento de validação de streaming com fast model no chat principal (incluindo medição de P_compact) | 1d |
| Medições de linha de base do modelo fast candidato (incluindo TTFT, P95, compatibilidade `thinkingConfig`) | 1d |
| Integração de `selectContinuationTier` + `summaryTierRef` (useGeminiStream) | 0.5d |
| Implementação de heurística (incluindo reuso de `MUTATOR_KINDS` / estimativa de `wouldTriggerCompression` / multilíngue / mutação de estado) | 1d |
| Implementação da interface `GeminiChat.retryStreamWithModel` + `discardPendingAssistant` | 1.5d |
| Adaptação da sincronização de sessão ACP (acp-integration/session/Session.ts) | 1d |
| Correção de spans de Telemetry (divisão `requested` / `actual`) | 0.5d |
| User-level setting `summaryTierStrategy` + JSON schema + integração `/config` | 0.5d |
| Testes unitários (race, momento de abort, invariantes de histórico, caminho de fallback, caminho ACP) | 2d |
| **Total** | **9d** |

> Nota: A estimativa inicial de 6.5d não incluía o caminho ACP, o gate `wouldTriggerCompression`, a lista de limpeza, a engenharia de schema de configurações, etc.

### 4.2 Roteiro de implementação

#### Phase 1: D1 Diretiva pós-ferramenta (1 semana)

- Estender `ToolResult.postExecution` (tools.ts L422): `skipLlmRound` + `resultIsTerminal`
- Implementar curto-circuito `skipLlmRound` em `handleCompletedTools` (useGeminiStream.ts L2038)
- Testes unitários cobrindo invariantes históricos
- **Phase 1 não consome `resultIsTerminal`** (deixado para Phase 3)

#### Phase 2: Construção do ecossistema de sinais (2 semanas, paralelo à Phase 4)

- Ferramentas internas recebem gradualmente marcações `skipLlmRound` / `resultIsTerminal` (ver tabela §3.1)
- Verificar cobertura de marcação ≥60% (ponderado por número de turns, não por número de chamadas)
- Coletar dados de produção, calibrar limites dos gates de veto da §3.2
- No final da Phase 2, executar o experimento de validação do chat principal e medições de linha de base da §3.2

#### Phase 3: D2 + D3 (aproximadamente 3 semanas, incluindo sincronização ACP)

> **Correção**: Roadmap inicial estimava 1 semana, não incluía o experimento de validação do fast model streaming, implementação de `retryStreamWithModel`, correção unificada de invariantes, sincronização do caminho ACP.

- Antes da codificação: concluir experimento de validação do chat principal + medições de linha de base (incluindo compatibilidade `P_compact` com thinkingConfig)
- Adicionar `summaryTierRef` + `selectContinuationTier` (incluindo gate `wouldTriggerCompression`)
- Adicionar `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`
- **Adaptar sincronicamente o caminho da sessão ACP** (acp-integration/session/Session.ts) usando a mesma função de decisão
- Adicionar `StreamingState.Summarizing` + reuso do caminho de entrada + lista de limpeza de abort
- Correção unificada de invariantes históricos (D1 + D3 mesma origem)
- Feature flag `experimental.summaryRoundFastModel: false`, **desabilitado por padrão no Release N**
- User setting `summaryTierStrategy`
- Correção de spans de Telemetry
- Salvaguardas em tempo de execução (ToolCallRequest abort + retryStreamWithModel)

#### Phase 4: D4 Escalonamento antecipado por streaming (pode ser inserido independentemente)

- `CoreToolScheduler.prevalidate` + allowlist
- `processGeminiStreamEvents` escalonamento incremental
---

## 5. Métricas, Aceitação e Limitações

### 5.1 Indicadores de Desempenho

| Métrica                               | Linha de base | Phase 1 | Phase 3                         |
| ------------------------------------- | ------------- | ------- | ------------------------------- |
| RT P50 ponta a ponta (3 loops)        | 13.4s         | <10s    | <8s (a ser medido)              |
| RT P95 ponta a ponta                  | -             | <13s    | <12s (limite do caminho fallback) |
| Tempo de primeiro resultado percebido pelo usuário P50 | 13.4s         | <10s    | <5s (D3 ativado)               |
| Tempo de primeiro resultado percebido pelo usuário P95 | -             | <13s    | <8s                             |
| Número de chamadas LLM (cenários que podem ser ignorados) | 3             | 2       | 2 (mais rápido)                 |

> Nota: A linha de base é uma única amostra. Antes da implantação, é necessário complementar ≥3 tipos de cenários.

### 5.2 Indicadores de Qualidade

| Métrica                                               | Linha de base | Degeneração permitida    |
| ----------------------------------------------------- | ------------- | ------------------------- |
| Precisão do Tool-calling (rodada de resumo do modelo rápido) | 100%          | ≥98%                      |
| Taxa de uso indevido de skipLlmRound (usuário pergunta 'mais detalhes') | -             | <1%                       |
| Taxa de fallback_triggered do modelo rápido           | -             | <10% (desligar flag automaticamente se >20%) |
| Inclusão da meia sentença do assistente no histórico durante o estado Summarizing | 0             | 0 (obrigatório)           |

### 5.3 Indicadores de Custo

| Métrica                                              | Linha de base | Meta Phase 3                                             |
| ---------------------------------------------------- | ------------- | -------------------------------------------------------- |
| Custo de token por mil sessões (rodada de resumo)    | 100%          | <70%                                                     |
| Proporção de tokens desperdiçados no caminho fallback | 0             | <15% (taxa de fallback × tokens rápidos únicos / tokens primários únicos) |

### 5.4 Schema do log de decisão

Escreva um log estruturado para cada julgamento crítico de `selectContinuationTier` e `handleCompletedTools`:

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // 决策（fallback 前）
  tier_actual:    'fast' | 'primary',          // 实际跑（fallback 后）
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
  fast_ttft_ms, primary_ttft_ms,                // fallback 时双份
  fast_tokens_consumed: int,                    // fallback 浪费的 tokens（成本归因）
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

Indicadores observados:

- Taxa de acionamento rápido (esperado 30-50%)
- Taxa de fallback_triggered (esperado <10%; >20% sugere desativar flag padrão no próximo release)
- Proporção de cada veto (identificar muito rigoroso/muito frouxo)
- fast_tokens_consumed × fallback_rate (risco inverso de custo)
- Frequência de perguntas do usuário 'mais detalhes' (sinal de regressão de qualidade rápida)

**Nota de medição de `fast_tokens_consumed`:**

Stream interrompido por abort provavelmente **não receberá `finishReason` / `usageMetadata`** — o último só é preenchido quando o stream termina completamente. A implementação precisa estimar:

- Prioridade: antes do abort, tente `stream.return()` para que o gerador percorra o caminho finally, possivelmente obtendo uso parcial
- Fallback: acumular o comprimento do texto dos chunks recebidos × 4 para estimar tokens de saída; tokens de entrada estimados com base no histórico
- Anotação: campo de log anexa `tokens_source: 'usage' | 'estimated'`, e a análise posterior precisa distinguir

### 5.5 Métodos de Validação e Estratégia de Lançamento

#### Validação

- Reutilizar a estrutura de temporização `/tmp/tool-timing.log`
- Adicionar `T_userIdle` (momento em que o usuário pode inserir novamente)
- Adicionar `T_firstToken` (momento do primeiro token do stream)
- Teste A/B para comparar distribuições de RT e custo antes e depois de cada Phase

#### Estratégia de Lançamento (adaptada para CLI local)

Qwen Code é um CLI local, **não tem capacidade de distribuição em tempo de execução** — a escala de cinza tradicional '5% / 25% / 100%' não se aplica. Adote **lançamentos por fases**:

| Fase                | Ponto de Release       | Valor padrão da feature flag | Condição de ativação                                                                 |
| ------------------- | ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| Phase 3a: dogfood   | Release N              | `false`                      | Usuários internos ativam com `summaryTierStrategy=always_fast`                     |
| Phase 3b: opt-in padrão | Release N+1 (≥2 semanas depois) | `false` (inalterado)          | Logs de decisão da fase dogfood atendem: fallback <10%, ganho líquido de RT/custo >0 |
| Phase 3c: ativado por padrão | Release N+2 (≥4 semanas depois) | `true`                       | Nenhum relatório de regressão de qualidade no nível do usuário na Phase 3b          |
| Rollback            | Release N+3 (se necessário) | `true → false`               | Fallback em larga escala >20% ou degradação de indicadores de qualidade                |

**Mecanismo de Rollback:**

- Sem distribuição em tempo de execução, **rollback = novo release desativando a flag padrão**
- O `summaryTierStrategy=always_primary` no nível do usuário sempre fornece um canal de 'quero sair imediatamente', sem depender de novo release
- A `fallback_rate` / `cost_regression` dos logs de decisão são avaliados em cada ciclo de Release para decidir o próximo passo

### 5.6 Limitações Conhecidas

1. **Dados de linha de base insuficientes**: uma única amostra não cobre todos os padrões de tarefas, é necessário complementar cenários antes da implantação.
2. **Pré-requisito do modelo rápido**: não existe um modelo da mesma família significativamente mais rápido e com tool-calling adequado → D2 não é ativado.
3. **`skipLlmRound` é trocar qualidade por velocidade**: pular LLM = abandonar compreensão e correção do modelo, aplicável apenas a cenários de alta determinismo.
4. **D2 é trocar qualidade+custo por velocidade**: a qualidade do modelo rápido é inferior ao primary; o caminho fallback é mais caro — o ganho líquido deve ser medido com logs de decisão.
5. **A ativação de `tryCompress` pode piorar**: contexto do modelo rápido é pequeno, a compressão em si consome chamadas LLM — o gate `wouldTriggerCompression` é uma defesa necessária.
6. **Desacoplamento de exibição altera o modelo de interação**: o novo modelo requer adaptação do usuário; o comportamento do usuário determina o ganho percebido real.
7. **Latência de rede incontrolável**: este esquema reduz o número de chamadas, não otimiza chamadas individuais.
8. **Conexão direta Anthropic não coberta**: a tolerância de alternância atual depende de APIs no estilo Qwen / OpenAI.
9. **fastModel-streaming no chat principal é a primeira implementação**: sem precedentes em produção, requer experimento de validação independente.
10. **CLI local sem distribuição em tempo de execução**: a estratégia de lançamento só pode avançar por releases em fases, não suporta ajuste rápido de escala de cinza.
11. **D2 atua apenas no caminho interativo**: Subagent / Cron / Notification não se beneficiam, intencionalmente.
12. **Impacto de longo prazo do histórico de modelos mistos desconhecido**: após a ativação do D2, as rodadas da sessão alternam entre rápido/primário, a retomada de sessões longas e a coerência do contexto precisam ser observadas.
13. **Ganho reduzido do D4**: após o Edit sair da lista de permissões, o prevalidate cobre apenas ferramentas de leitura pura (ganho de 50-100ms); o ganho de 200ms com Edit requer o mecanismo de verificação mtime/hash da solução B.
### 5.7 Localizações-chave do código

| Arquivo                                                  | Símbolo-chave                                                 | Localização           |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------------------- |
| `packages/core/src/tools/tools.ts`                       | interface `ToolResult`                                        | L422                  |
| `packages/core/src/tools/tools.ts`                       | enum `Kind` + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS`      | L793, L806, L818      |
| `packages/core/src/tools/tools.ts`                       | `DeclarativeTool.kind: Kind` (cada instância de Tool possui)  | L165                  |
| `packages/core/src/core/client.ts`                       | `SendMessageOptions.modelOverride`                            | L142                  |
| `packages/core/src/core/client.ts`                       | `sendMessageStream`                                           | L1216                 |
| `packages/core/src/core/client.ts`                       | `modelOverride ?? getModel()`                                 | L1305, L1598          |
| `packages/core/src/core/client.ts`                       | `turn.run(model, …)`                                          | L1707                 |
| `packages/core/src/core/geminiChat.ts`                   | `sendMessageStream(model, …)`                                 | L1387                 |
| `packages/core/src/core/geminiChat.ts`                   | `history.push(userContent)`                                   | L1428                 |
| `packages/core/src/core/geminiChat.ts`                   | trava `sendPromise`                                           | L1392                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `modelOverrideRef` (seleção de modelo do skill)               | L376, L2225           |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `processGeminiStreamEvents`                                   | L1365                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | ponto de chamada `sendMessageStream`                          | L1841                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `handleCompletedTools`                                        | L2038                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `submitQuery(ToolResult, …)`                                  | L2355                 |
| `packages/core/src/services/toolUseSummary.ts`           | consulta fast-model side (precedente não streaming)           | L108                  |
| `packages/core/src/followup/speculation.ts`              | streaming fast-model (precedente de chat bifurcado)           | L224                  |
| `packages/core/src/config/config.ts`                     | `fastModel` + `getFastModel` + `setFastModel`                 | L684, L1987, L2021    |
| `packages/core/src/core/coreToolScheduler.ts`            | `attemptExecutionOfScheduledCalls`                            | L2436                 |
| `packages/core/src/core/coreToolScheduler.ts`            | `runConcurrently` + `partitionToolCalls`                      | L2473                 |
| `packages/cli/src/acp-integration/session/Session.ts`    | ponto de chamada `sendMessageStream` (caminho ACP/IDE)        | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`         | Subagent `sendMessageStream` (não afetado por D2)             | L614                  |

---

## 6. Registro de Verificação de Revisão (2026-05-26)

### 6.1 Método de Verificação

Para várias suposições de qualidade de dados prévias e estimativas de ganho que estavam **apenas declaradas, não quantificadas** no documento de design, foram iniciados 4 Explore subagents paralelos para realizar pesquisa de código somente leitura. Cada subagent responde apenas a uma questão factual, sem emitir julgamentos ou dar sugestões de otimização. A pesquisa baseia-se no branch `main` atual (HEAD: `026f2f768`).

| Pergunta de Verificação                                                               | Seção Relacionada                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------- |
| Q3 Taxa de preenchimento do campo `ToolResult.error` de todas as ferramentas atuais   | §3.2 Dependência prévia de `hasUnresolvedError` |
| Q4 Disponibilidade real de `usageMetadata` após abort do stream                       | §5.4 Medição de `fast_tokens_consumed`    |
| Q5 Existência de pontos de instrumentação para 'perguntas de acompanhamento / esclarecimento' | §5.2 Sinal de monitoramento de regressão de qualidade fast |
| Q6 Carga de trabalho real de IO de `shouldConfirmExecute` para ferramentas `CONCURRENCY_SAFE_KINDS` | §3.4 Estimativa de ganho D4              |

### 6.2 Descoberta 1: Heurística `hasUnresolvedError` possui 32% de pontos cegos de ferramentas (afeta D2)

**Fato**: Das 22 ferramentas com caminhos de erro, **15 (68%) preenchem corretamente o campo `ToolResult.error`** (shell, read-file, write-file, edit, grep, glob, ls, web-fetch, mcp-tool, cron-* e outras ferramentas de I/O core estão completas), **7 (32%) apenas colocam o erro na string `llmContent`**: `askUserQuestion`, `monitor`, `skill`, `lsp`, `exitPlanMode`, `todoWrite`, etc.

**Não existe** um helper `createErrorResult` unificado; cada ferramenta implementa a construção de erro independentemente.

**Impacto no design**:

- A condição de rejeição `hasUnresolvedError` de §3.2, se verificar apenas o campo `ToolResult.error`, **a falha dessas 7 ferramentas nunca acionará 'voltar para primary'** — a próxima rodada ainda será roteada para o fast model.
- Destas, **a falha da ferramenta `skill` sendo resumida erroneamente pelo fast model** é um cenário de risco de alta prioridade (grande parte dos fluxos de trabalho orientados a skill deste repositório será afetada).
- O escopo listado em §3.2 'shell etc. precisam preencher ToolResult.error corretamente (dependência de qualidade de dados prévia)' é **muito estreito**; shell já está padronizado, as verdadeiras omissões são skill / lsp / todoWrite, etc.

**Correção sugerida**: Listar '**transformar as 7 ferramentas que transmitem erros apenas via `llmContent` para preencher corretamente o campo `error`**' como dependência prévia obrigatória de D2 (pré-condição de §3.2), esforço estimado ~2d; não aceitar o caminho sujo de 'usar `llmContent.match(/^Error:/i)` como fallback' (alto risco de falso positivo).
### 6.3 Descoberta 2: Custo de implementação da métrica `fast_tokens_consumed` subestimado (impacto D2 / §5.3)

**Fatos**:

- O caminho abort de `turn.ts` (L289-291) dá `return` direto, **sem bloco finally, e sem chamada `stream.return()`** — o que a §5.4 sugere como "`stream.return()` antes do abort para o generator executar o finally" não possui essa entrada no código atual
- O loop `for await` de `geminiChat.ts:processStreamResponse` só registra o turn na iteração completa (L1286), abortar a iteração significa que o último chunk de uso (que geralmente traz metadados completos) **é descartado diretamente**
- O caminho principal do chat **não possui nenhum fallback cumulativo de tokens em nível de chunk**; apenas a camada subagent (`agent.ts:731-744`) tem acumulação, que não pode ser reutilizada
- Conclusão: ao abortar, o `usageMetadata` **não é obtido**, só é possível estimar via `chars/4` (erro de ±20%)

**Impacto no design**:

- No esquema de três camadas "prioritário / fallback / anotação" do final da §5.4, o caminho **"prioritário" não é alcançável no código atual** — é necessário primeiro modificar a estrutura do generator `sendMessageStream` para adicionar finally, trabalho de aproximadamente 1d, custo não refletido no documento de design
- A §5.3 define "custo de token por mil sessões <70%" como meta da Fase 3, mas se a própria métrica tem erro de ±20%, **"70%" e "82%" estão dentro do ruído de medição**

**Correção sugerida**:

- A §5.3 deve ser reescrita como **métrica de tendência**, não como gate de release; usar o julgamento combinado de duas métricas: "taxa de `fallback_triggered` nos logs de decisão + tendência de `fast_tokens_consumed`"
- A §5.4 deve adicionar: a implementação de `fast_tokens_consumed` requer primeiro a modificação do caminho abort de turn.ts para adicionar finally + `stream.return()`, como complemento de esforço à §3.2 (+1d)

### 6.4 Descoberta 3: `user_prompt_classification` e instrumentação de "perguntas de acompanhamento do usuário" precisam ser criadas (impacto D2 / §5.2)

**Fatos**:

- Em `packages/core/src/followup/` já existem `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts`, mas sua telemetria (`PromptSuggestionEvent`) registra **"sugestão do sistema aceita/ignorada"**, não "pergunta ativa do usuário"
- O `ChatRecordingService` armazena mensagens do usuário mas **não aplica tags de classificação**
- Grep no repositório inteiro não encontra `user_prompt_classification`, nem correspondência de padrões de perguntas de acompanhamento em chinês/inglês, nem mecanismos como `clarif*` / `intentDetect`

**Impacto no design**:

- O campo `user_prompt_classification: 'query' | 'action' | 'analysis'` no schema de log de decisão da §5.4 **não possui fonte de dados** — não pode ser derivado do `PromptSuggestionEvent` existente nem lido do `ChatRecord`
- O sinal de monitoramento "frequência de 'mais detalhes' do usuário" da §5.2 é o mesmo, **o ponto de ancoragem mais próximo, `followupState.onOutcome`, não é reutilizável**

**Correção sugerida**:

- Adicionar como pré-condição na §3.2 a "implementação mínima de classificador de entrada do usuário" (correspondência de padrões em chinês/inglês, ~3d), caso contrário, tanto `user_prompt_classification` quanto `requestImpliesFurtherAction` nos logs de decisão da §5.4 ficarão sem dados
- Ou **aceitar** não ter esses dois sinais na fase de dogfood da Phase 3a, monitorando regressão de qualidade apenas com a taxa de `fallback_triggered` — custo baixo, mas risco alto

### 6.5 Descoberta 4: Contradição interna no design D4 — allowlist e atribuição de ganho não alinhados (impacto D4 / §3.4)

**Fatos**:

- Para os três tipos de ferramenta `Kind.Read` (read_file), `Kind.Search` (glob / grep), `Kind.Fetch` (web_fetch), `shouldConfirmExecute` / `getConfirmationDetails`, **a grande maioria herda a implementação padrão de `BaseToolInvocation`, fazendo zero IO** (read_file / glob / grep não sobrescrevem nada, web_fetch só faz 5-10 linhas de parsing de string para extrair hostname da URL)
- Quem realmente faz IO são `Edit` / `WriteFile` (`calculateEdit` + `readTextFile` + `Diff.createPatch`, tipicamente ~20ms), mas a §3.4 opção A as exclui da allowlist para evitar TOCTOU
- **Resultado**: as três ferramentas que ficam na allowlist têm praticamente o mesmo esforço com ou sem pré-validação — a allowlist, na prática, bloqueia o "único Edit que poderia economizar IO", deixando "ferramentas que já eram de custo zero"

**Impacto no design**:

- A narrativa de "pré-validação de IO" da §3.4 **não se sustenta**: o ganho real de 50-100ms vem de **"o stream termina completamente → só então agenda em lote" — esse tempo de espera do agendamento é eliminado**, quase nada relacionado ao IO da ferramenta
- A atribuição incorreta do ganho traz dois problemas:
  1. **A allowlist poderia ser mais ampla** — qualquer ferramenta com pré-validação idempotente serve, não precisa ser vinculada a `CONCURRENCY_SAFE_KINDS`
  2. **O investimento de 5-7d é difícil de justificar** — se o ganho real é apenas ~50ms da mudança no modelo de agendamento, e Edit não está na allowlist, o ROI desse investimento é menor do que o documento de design sugere

**Correção sugerida**: Reescrever a atribuição de ganho na §3.4 —

- Dividir em duas partes: (a) mudança no modelo de agendamento economiza ~50ms de espera do stream, (b) pré-validação de IO na ferramenta pode economizar ~0ms (dentro da allowlist) / ~20ms (se Edit entrar na allowlist)
- Na tabela de avaliação consolidada da §4.1, mudar o ganho de RT do D4 de "50-200ms" para "30-80ms (opção A, principalmente do modelo de agendamento) / 100-200ms (opção B, incluindo Edit)"
- No roadmap da §4.2, rebaixar ainda mais o D4 — a pura modificação do modelo de agendamento pode ser feita de forma independente, sem forçar o vínculo com o conceito de pré-validação

### 6.6 Impacto consolidado no roadmap

| Seção                           | Estimativa original | Estimativa pós-verificação | Fonte do incremento                                                                                                         |
| ------------------------------- | ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| D2 §3.2 esforço (tabela §4.1)   | 9d                | **14-16d**                 | +2d (descoberta 1, reforma de ferramentas prévia) +1d (descoberta 2, reforma turn.ts finally) +3d (descoberta 3, classificador de entrada, se caminho difícil) |
| D4 §3.4 avaliação consolidada   | 5-7d              | 5-7d (inalterado)          | Esforço inalterado, mas **atribuição de ganho de RT muda de "IO da ferramenta" para "modelo de agendamento"**, ROI do investimento reduzido |
| Duração total da Fase 3 (§4.2) | ~3 semanas        | **~4-5 semanas**           | Aumento de esforço D2 + PR de reforma de ferramentas prévia passando por ciclo de review separado                         |

**Correções sugeridas ao roadmap original**:

1. **Manter D1 (P0) e D3 logo em seguida** — esta verificação não tocou nas premissas centrais deles, julgamento de ROI inalterado
2. **Endurecer a condição de início do D2** — usar o trabalho prévio das descobertas 1/2/3 (~6d no total) como "gate de início do D2", sem concluir não entrar no experimento prévio da §3.2
3. **Reavaliar prioridade do D4** — já que o ganho real é da mudança no modelo de agendamento, não de IO da ferramenta, ou (a) aceitar 30-80ms e rebaixar D4 para depois do P3, ou (b) considerar opção B (Edit + mtime/hash) para recuperar 100-200ms, mas com 5-7d adicionais
4. **Não modificar a linha de base de amostragem única da §1.2** — mas não escrever números concretos na coluna P95 da §5.1 antes de o D1 ser implementado e a linha de base de ≥3 tipos de cenário ser concluída

### 6.7 Pontos de questionamento não cobertos pela verificação

Os seguintes pontos de questionamento são de julgamento subjetivo ou de intenção do autor; esta verificação não os tratou via subagent, deixando para discussão em design review posterior:

- A ordem de implementação do D2 deveria ser postergada para depois do D3 (ordem subjetiva)
- D1/D3 deveriam ser mesclados na Fase 1 e feitos juntos (estratégia de implementação)
- O limiar `needsCrossResultReasoning ≥3` da §3.2 é um ajuste reverso para os cenários de linha de base da §1.2 (intenção do autor)
- Os âncoras de linha da tabela de localização de código-chave da §5.7 deveriam ser alterados para âncoras de símbolo (estabilidade do documento)

---

## 7. Avaliação de óleo superficial e próximos passos (segunda revisão em 2026-05-26)

### 7.1 Fatos que desencadearam esta reordenação

Após a verificação da §6, dois **fatos que alteram o julgamento de ROI** foram descobertos:

1. **`cache_control` do DashScope já implementado** (`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`)
   - Requisições streaming marcam `system + última mensagem + última definição de ferramenta`
   - Dados de acerto `cached_tokens` já coletados em `usageMetadata.cachedContentTokenCount` (`converter.ts:1124-1149`)
   - Este é o mecanismo de prefix cache: a Rodada N+1 automaticamente acerta o prefixo escrito na Rodada N
   - **A rodada de resumo é exatamente a que tem o prefixo de maior acerto**

2. **O system prompt já está estável** (resultado da auditoria de `prompts.ts`)
   - Sem problemas como cwd / timestamp / git status / lista de arquivos / status LSP que "mudam a cada turno"
   - `process.cwd()` é usado apenas como chave para `isGitRepository()`, não é escrito no conteúdo do prompt
   - Únicos pontos dinâmicos: gatilho da ferramenta `save_memory` / troca de `/model` / carregamento dinâmico de MCP (todos eventuais, de baixa frequência)

### 7.2 Esses dois fatos alteraram o julgamento de ROI do D2

A §3.2 assume que "o modelo rápido é ~2s mais rápido que o primário", com a comparação sendo **primário sem cache vs rápido sem cache**.

Mas na execução real, o primário está **com cache** (a rodada de resumo acerta o cache mais forte), então a comparação correta é:
> primary em cache vs fast sem cache

| Rota                          | Latência estimada | Observações                     |
| ----------------------------- | ----------------- | ------------------------------- |
| primary acerta 80% do cache de prefixo | ~1.8-2.2s         | Desempenho atual da rodada summary |
| fast sem cache (não compartilhado entre modelos) | ~1.5-2s           | Desempenho real após comutação D2  |

**Diferença líquida: centenas de milissegundos, podendo até o fast ser mais lento**. Somando o custo de engenharia de 14-16d + risco de qualidade + desperdício de fallback, **o ganho líquido do D2 é próximo de 0 ou negativo**.

§3.2 Pré-condição **deve ser adicionada**: A medição de linha de base deve comparar primary **cached** vs fast **uncached**, e o D2 não deve ser ativado quando `T_primary_cached < T_fast_uncached × 1.5`.

### 7.3 Lista de candidatos (reordenados por rapidez de implementação)

**Verdadeiros quick wins (agir imediatamente, < 1d de esforço, risco muito baixo, ganho garantido):**

| Item                            | Esforço | Ganho                             | Local de operação                                                                    |
| ------------------------------- | ------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| Instrução de resposta concisa   | 30min   | ~2s/rodada summary (metade dos tokens de saída) | Adicionar uma frase no parágrafo Final Reminder em `prompts.ts`                      |
| Expor telemetria de cache hit rate | 0.5d    | 0s diretamente, é um **facilitador** para decisões futuras | `cachedContentTokenCount` já coletado, falta expor; e deve identificar e marcar separadamente após `save_memory` |

**Quick wins próximos (aguardar dados para decidir, 0.5-1d de esforço):**

| Item                             | Esforço               | Ganho                                     | Pré-condição para decisão                                             |
| -------------------------------- | --------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| summary rodada `tool_choice='none'` | 0.5-1d                | 0.3-1s (amostragem pula token `tool_call`) | Precisa de lógica para determinar 'é rodada summary', baixo risco de erro de julgamento |
| Desligar thinking na rodada summary | 1d                    | 0.5-2s                                    | Significativo apenas para modelos com thinking habilitado (qwen3.5-plus, glm-4.7, kimi-k2.5 etc.) |
| UI camada de renderização chunk batching | 0.5d pesquisa + 0.5d implementação | A verificar                               | Hipótese: o custo de renderização cumulativo dos tokens de `useGeminiStream` em summary longo não é pequeno |

**A investigar (podem ser grandes oportunidades):**

| Item                                  | Esforço de pesquisa      | Ganho potencial       | Incógnita chave                                                                                   |
| ------------------------------------- | ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------- |
| ~~Suporte DashScope `scope: 'global'`~~ | ~~0.5d docs + 0.5d A/B~~ | ~~Atingir entre sessões~~ | **Já investigado, conclusão (c) inviável** (veja Descoberta B em §7.4). Esta linha mantida como registro de decisão, não reiniciar investigação. |

**Modificações médias (não são quick wins, avaliar separadamente):**

| Item                               | Esforço        | Risco | Ganho       |
| ---------------------------------- | -------------- | ----- | ----------- |
| D1 `skipLlmRound` (cenário de consulta final) | 2-3d           | Médio | 3-4s/rodada final |
| Poda de resultados de ferramentas na rodada summary (subconjunto D5) | 2d             | Médio | 1-2s        |
| D3 estado `Summarizing`            | 3-5d           | Médio | Melhora percepção 3s |
| Emagrecimento do system prompt     | 2-3d incluindo teste A/B | Médio | 0.5-1s      |

**Direções obsoletas (não fazer mais):**

| Item                                        | Motivo de descarte                                               |
| ------------------------------------------- | ---------------------------------------------------------------- |
| D2 roteamento fast model                    | Neutralizado pelo cache DashScope, ganho líquido próximo de 0 ou negativo |
| D4 pré-validação                            | Atribuição de ganho errada (na verdade apenas ~50ms vêm do modelo de escalonamento), 5-7d de esforço não vale a pena |
| Estabilização do system prompt              | Já estável, nada a fazer                                         |
| Streaming terminal antecipado (abortar precocemente palavras de cortesia) | Alto risco de erro de julgamento, usuário percebe resposta cortada |

### 7.4 Três novas descobertas que merecem ser detalhadas

#### Descoberta A: Mecanismo real de `tool_choice='none'`

Na API OpenAI / DashScope, `tool_choice='none'` não é apenas "proibir chamada de ferramenta" — durante a fase de sampling do modelo, ela **pula completamente a alocação de probabilidade do token especial `<tool_call>`**, e o decoder segue diretamente pelo caminho de geração de linguagem natural. O ganho não está em "economizar uma ou duas tentativas", mas em sampling ser mais rápido em si.

#### Descoberta B: `scope: 'global'` já tem precedente Anthropic no repositório

`packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` já tem o uso de `cache_control: { type: 'ephemeral', scope: 'global' }`. Mas em `provider/dashscope.ts:288`, ao marcar cache_control, **não passa scope**:

```typescript
cache_control: { type: 'ephemeral' },   // sem scope
```

Se o servidor DashScope reconhecer `scope: 'global'`:

- system + tools são atualizados para global cache (TTL muito maior que os 5min do ephemeral)
- **Atinge entre sessões**, latência de inicialização também reduz
- Só este ganho pode superar todos os ganhos hipotéticos do D2 original

##### Resultado da investigação (2026-05-26, conclusão: (c) inviável, encerrar esta linha)

Lista de fatos obtida consultando a documentação oficial da Alibaba Cloud Bailian `help.aliyun.com/zh/model-studio/context-cache`:

| Questão                   | Conclusão                                                                                                                                                                                               | Evidência                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Suporte ao campo `scope`  | **Não suportado**. Apenas reconhece `type: 'ephemeral'`, qualquer `scope`/`persistent`/`global` é silenciosamente ignorado                                                                              | Documentação oficial: "Suporta apenas definir `type` como `ephemeral`" |
| TTL real do ephemeral     | **Janela deslizante de 5 minutos** (reinicia ao ser atingido)                                                                                                                                          | Documentação Bailian deixa claro                        |
| Mecanismo de TTL longo / global | **Nenhum mecanismo via API pública**. Sem valor `persistent`, sem API de pré-upload independente, sem `prompt_cache_key`; o único produto 'global persistente' é o PAI Global Context Cache (autodeploy + vLLM + Lingjun + Redis compartilhado), não relacionado à API DashScope | Documentação PAI                                        |
| Compartilhamento entre sessões | Mesma conta + mesmo modelo + conteúdo correspondente → já atinge (é o que `ephemeral` já faz); contas diferentes absolutamente não compartilham                                                        | Documentação Bailian                                    |
| Precificação               | cache write 125%, cache read explícito 10%, **cache read implícito 20%** (sem marcação `cache_control` ainda obtém desconto implícito de 20%)                                                           | Documentação de preços Bailian                          |
| Mínimo de prompt armazenável | **1024 tokens**                                                                                                                                                                                       | Documentação Bailian                                    |
| Suporte de modelo (cache explícito) | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 todos listados explicitamente. **qwen3.6-plus e qwen3.7-max também desfrutam de 90% de desconto de cache explícito** | Lista de modelos Bailian (reverificado em 2026-05-26)   |
**Algumas implicações adicionais das descobertas secundárias**:

1. **Janela deslizante TTL** é uma boa notícia para o agent loop — o intervalo entre chamadas consecutivas no loop geralmente é < 30s, o **cache permanece sempre fresco, sem expiração de 5 minutos**.
2. **Desconto de 20% do cache implícito** é um bônus gratuito — você pode obtê-lo mesmo sem marcar `cache_control`; mas o controle refinado requer explícito.
3. ~~`qwen3.6-plus` não está na lista explícita~~ — **Correção (2026-05-26)**: Após reavaliação, qwen3.6-plus **está sim na lista de cache explícito**, com desconto de 90%. A seção anterior reportou um erro aqui, já corrigido na primeira tabela desta seção.
4. **A abordagem atual em `dashscope.ts:288` já é o limite da capacidade da API pública DashScope** — não há mais espaço para otimizar.

**Implicações adicionais para a avaliação D2 em §7.2**:

A janela deslizante TTL significa que, dentro do agent loop, as rodadas de resumo **quase sempre acertam 100%** o cache do modelo primário (acabaram de acertar nas rodadas anteriores, dentro de 5 minutos). D2, ao trocar para um modelo fast, não apenas quebrará a cadeia de escrita de cache acumulada, **mas também fará com que a rodada de resumo passe de "quase 100% de acerto" para "erro total"** — a avaliação de ganho líquido é ainda mais claramente negativa do que a suposição original em §7.2.

#### Descoberta C: A camada de renderização da UI é um ponto cego negligenciado

A linha de base em §1.2 estima a "sobrecarga do framework" em 0,3s (3%), mas isso é uma aproximação grosseira. Ink 7 + React 19.2 aciona `setState` → re-render a cada chunk, e um resumo longo pode acumular 200-500ms. Precisamos verificar como `useGeminiStream` lida com o fluxo de tokens, se há `requestAnimationFrame` / `useDeferredValue` para mesclar chunks.

### 7.5 Checkpoint de espera por dados — Quando os dados chegarem, qual decisão tomar

Esta seção é **a porta de entrada dinâmica deste documento**: Para qualquer dado de medição subsequente, consulte a tabela abaixo para decidir qual decisão revisitar.

#### Checkpoint 1: Após os dados de taxa de acerto do cache

**Condição de gatilho**: Telemetria de "expor taxa de acerto do cache" ativa por ≥3 dias, com distribuição de `cached_tokens` / `prompt_tokens` no log de decisões.

**Dados a observar**:

- Distribuição P50, P90 da taxa de acerto geral (cached / prompt)
- Por rodada: Taxa de acerto individual para Round 1 / Round 2 / Round 3 (resumo)
- Taxa de acerto da rodada seguinte após acionar `save_memory` (deve ser próxima de 0)
- Taxa de acerto da rodada seguinte após trocar `/model` (deve ser próxima de 0)

**Caminho de decisão**:

| Taxa de acerto geral | Significado                 | Ação                                                                                          |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| > 70%                | Já está perto do limite teórico | Faça apenas #1 Instrução concisa + pesquisa da Descoberta B; demais itens sob demanda          |
| 40-70%               | Ainda há espaço, mas fonte desconhecida | Analise a taxa de acerto por rodada para identificar onde estão os erros                        |
| < 40%                | Há pontos dinâmicos quebrando o cache | Reaudite a frequência de acionamento de system prompt / userMemory; pode ser que `save_memory` seja mais frequente que o esperado |

#### Checkpoint 2: Resultado da pesquisa de documentação do DashScope `scope: 'global'` ✅ Concluído (2026-05-26)

**Resultado**: **Não é reconhecido**. Veja detalhes na seção "Resultado da pesquisa" da Descoberta B em §7.4.

**Ação executada**: Aceitar o estado atual, pular este item. `dashscope.ts:288` mantém a marcação `ephemeral` existente, sem necessidade de modificação.

**Não reinicie esta pesquisa no futuro** — a menos que a DashScope anuncie oficialmente um novo mecanismo de persistência.

#### Checkpoint 3: Resultado da pesquisa da camada de renderização da UI

**Condição de gatilho**: Pesquisa da Descoberta C concluída (verificar processamento do fluxo de tokens em `useGeminiStream` + medição real com Ink/React DevTools).

**Caminho de decisão**:

| Resultado                                               | Ação                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Renderização do fluxo de resumo longo acumula > 200ms  | Mudar para batching (`useDeferredValue` ou throttle customizado) |
| Sobrecarga de renderização < 100ms                     | Fechar esta linha de investigação                               |

#### Checkpoint 4: Medição de linha de base secundária após concluir as "verdadeiras melhorias rápidas"

**Condição de gatilho**: #1 Instrução concisa + decisões do Checkpoint 1/2/3 concluídas por ≥1 semana.

**Dados a observar**:

- Comparação do P50 de RT ponta a ponta com a linha de base de amostra única de §1.2 (13,4s)
- P50 / P95 individuais da rodada de resumo
- Taxa de perguntas de acompanhamento do usuário (se a Melhoria Rápida A também incluir classificação de entrada do usuário)

**Caminho de decisão**:

| Economia acumulada                    | Ação                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| > 4s (atingir P50 de 9,6s ponta a ponta) | Avaliar D1 `skipLlmRound` (economizar mais 3-4s/rodada terminal)                                                  |
| 2-4s                                  | Aceitar estado atual, avaliar se vale a pena fazer a melhoria de percepção D3                                        |
| < 2s                                  | Reavaliar: Será que as melhorias rápidas foram superestimadas, ou há gargalos não identificados (RTT de rede, latência do provedor)? |

### 7.6 Julgamento final em relação às direções de §3

Com base na validação de §6 + reordenamento de ROI desta seção:

| Direção                       | Prioridade original em §3 | Julgamento desta seção                       | Motivo                                                                                                |
| ----------------------------- | ------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1 Instrução pós-ferramenta   | P0                        | **Manter P0**, mas reavaliar após concluir melhorias rápidas | ROI ainda bom, mas não "fazer agora" — primeiro obter as melhorias rápidas mais baratas               |
| D2 Roteamento rápido de resumo | P1                        | **Adiar / Não corrigir**                     | Neutralizado pelo cache DashScope; investimento de 14-16d para retorno próximo de 0                   |
| D3 Desacoplamento de exibição | P1                        | **Manter como opcional**, aguardar dados do Checkpoint 4 | Melhoria de percepção confirmada, mas RT absoluto inalterado, depende do comportamento do usuário      |
| D4 Agendamento antecipado de stream | P2                   | **Adiar**                                    | Benefício atribuído incorretamente; real ~50ms não vale 5-7d                                       |

### 7.7 Ordem de execução recomendada

**Dia 1** (pode ser concluído por uma pessoa em um dia):

- ✅ Adicionar instrução de resposta concisa em `prompts.ts` (30min)
- ✅ Expor `cachedContentTokenCount` na telemetria + marcar `save_memory` / troca de `/model` (0,5d)
- ✅ Iniciar pesquisa da Descoberta B: consulta de documentação do DashScope `scope: 'global'` + comparação com uso existente do Anthropic (0,5d)

**Dia 2-3**:

- Coletar primeiros dados de taxa de acerto do cache
- Iniciar pesquisa da Descoberta C: caminho de renderização React de `useGeminiStream`
- Decidir se deve fazer a modificação `scope: 'global'` com base no Checkpoint 2

**Final da Semana 1**:

- Decisão com base nos dados do Checkpoint 1 (ver distribuição)
- Decidir se deve fazer `tool_choice='none'` / desativar thinking (com base nos dados de taxa de acerto)

**Semanas 2-3**:

- Medição de linha de base secundária do Checkpoint 4
- Decidir se deve iniciar D1 (maior item não-melhoria rápida, 3-4s/rodada terminal)

**Nunca fazer**: D2 / D4 / Estabilização do system prompt.

### 7.8 Auditoria de conteúdo dinâmico de `prompts.ts` (2026-05-27)

§7.1 concluiu que "o system prompt está estável" apenas com um grep superficial. Esta seção é uma auditoria sistemática de `packages/core/src/core/prompts.ts` (1169 linhas), listada como base para análise futura da taxa de acerto do cache e decisões de melhorias rápidas.

**Método de auditoria**: Enumerar todas as expressões de interpolação `${...}`, IIFE, chamadas `process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*`, e para cada uma, determinar se "muda ou não dentro da mesma sessão".

#### Problemas inexistentes (suspeitas comuns)

| Candidato                          | Fato no código                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Date.now()` / `new Date()`        | **Zero ocorrências** em todo o texto (`rg` não encontra nenhuma)                                          |
| `Math.random()`                    | **Zero ocorrências**                                                                                     |
| Valor de `process.cwd()` escrito no prompt | Apenas L366 `if (isGitRepository(process.cwd())) { ... }`, o **valor não é escrito na string**, é apenas um switch |
| Chamada de subprocesso git status / git branch | **Nenhuma**, a seção git é texto de orientação estático                                                  |
| Injeção de lista atual de arquivos / estrutura do projeto | **Nenhuma**                                                                                      |
| Status do LSP / número de erros    | **Nenhuma**                                                                                              |
| Histórico de entrada do usuário    | **Nenhuma** (history vai para messages, não no system)                                                    |
#### Uma vez na inicialização, inalterado durante a sessão

| Posição | Conteúdo                                                                                            | Quando pode mudar                |
| ------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| L190    | `process.env['QWEN_SYSTEM_MD']` determina a origem do basePrompt (padrão vs system.md do usuário)   | Inalterado dentro do processo    |
| L342-343| `process.env['SANDBOX']` determina qual versão da seção sandbox é selecionada (Seatbelt / Sandbox / Outside) | Inalterado dentro do processo    |
| L366    | `isGitRepository(process.cwd())` determina se a seção git é inserida                                | cwd normalmente inalterado durante a sessão |
| L871    | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` determina o estilo de tool call (qwen-coder / qwen-vl / general) | Inalterado dentro do processo    |

#### Disparado por eventos (baixa frequência)

| Parâmetro                                        | Condição de disparo                                        | Frequência estimada |
| ------------------------------------------------ | ---------------------------------------------------------- | ------------------- |
| `userMemory` (1º parâmetro de `getCoreSystemPrompt`) | Ferramenta `save_memory` / `/memory refresh` / carregamento de extensão | 0-3 vezes/sessão    |
| Nome do `model` (afeta qual ramo de `getToolCallExamples` é selecionado) | Alternância de `/model`                                    | Raro                |
| `appendInstruction`                              | Item de configuração, basicamente inalterado durante a sessão | Quase nunca         |
| `deferredTools` (`buildDeferredToolsSection`)    | Carregamento dinâmico de ferramentas MCP                    | Principalmente no início da sessão |

#### Uma pequena armadilha oculta

L207-209: Se a env `QWEN_SYSTEM_MD` estiver definida, **cada** chamada de `getCoreSystemPrompt` fará `fs.readFileSync(systemMdPath)`:

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- Se o arquivo não mudar, o conteúdo é estável → o cache hit não é afetado
- Mas cada chamada LLM tem uma IO síncrona (padrão `.qwen/system.md`, arquivos montados em rede serão mais lentos)
- Não afeta a conclusão de 'cache-friendly' desta seção, apenas registrado como uma pequena armadilha de desempenho conhecida

#### Conclusões decorrentes

1. **O system prompt produz saída byte-for-byte consistente a cada vez em uma sessão estável** → A chave de cache efêmera do DashScope (baseada no hash do conteúdo) é estável para todo o bloco → **A taxa de cache hit da seção system é quase 100%**
2. O único evento que quebra o cache é `save_memory` – funcionalidade central, não pode ser sacrificada pelo cache
3. **Análise de custo da gordura #1 (instrução de resposta concisa)**: Adicionar a instrução na seção Final Reminder (L389-390) → o conteúdo do system prompt muda uma vez → **Primeira requisição gera cache miss (custo único de aquecimento), todas as requisições subsequentes continuam com hit**
4. **O julgamento da seção §7 de que 'estabilizar o system prompt' está obsoleto é apoiado por evidências formais** – não apenas não é necessário, como mesmo 'teoricamente poderia reduzir ainda mais a taxa de cache miss' não se sustenta, pois já é ≈ 0
5. Esta auditoria pode ser usada como linha de base de referência para discussões futuras, evitando grep repetitivo; se houver grandes alterações em prompts.ts, esta seção precisa ser atualizada em conjunto
