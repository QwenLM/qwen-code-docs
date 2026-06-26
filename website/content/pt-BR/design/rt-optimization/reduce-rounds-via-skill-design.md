# Plano de Redução de Rodadas no Agent Loop: A partir do Design de Skills

> No mesmo diretório de `rt-optimization-design.md`, complementar um ao outro: aquele documento discute a **redução de rodadas no nível do framework** (D1 pular sumário final, D2 roteamento fast, D4 pré-validação), este documento defende que **a verdadeira alavanca para redução de rodadas está no nível do design de skills/ferramentas**, e propõe um caminho implementável que não depende de modificação no framework nem de dados de cache hit rate.

---

## 0. Spec de Aceitação (Gate Prévio ao Desenvolvimento)

> Esta seção é o **gate prévio** para o desenvolvimento — lista quais specs devem ser confirmadas antes de começar a codificar e quais specs devem esperar por dados. Colocar spec antes, em vez de "olhar métricas depois de pronto", é para evitar: (a) descobrir depois de escrever que a métrica não é mensurável, (b) thresholds flutuarem com os resultados, distorcendo conclusões, (c) não ter stop-loss definido, fazendo o plano cair em "parece que está fazendo, mas não tem ganho".
>
> **Limite de aplicação deste framework de spec**: Este framework assume que a correção da direção pode ser julgada após a medição da linha de base P1.5. Essa suposição é válida para o cenário de "redução de rodadas", pois tem sinais mensuráveis claros (número de rodadas, followup_rate, batch_size). **Cenários além desta suposição** (por exemplo, usar o mesmo framework no futuro para "otimização de qualidade" etc., que são difíceis de quantificar), a pré-colocação de spec pode atrapalhar o aprendizado rápido; nesses casos, recue para o processo de governança da §0.5 e reavalie, não aplique mecanicamente este framework.

**Spec dividida em quatro camadas — momento diferente**:

| Camada | Tipo                                    | Momento de Bloqueio                   |
| ------ | --------------------------------------- | ------------------------------------- |
| §0.1   | Spec de engenharia (correção do pipeline de dados, alterações de código) | **Prévio**, pode ser bloqueado imediatamente |
| §0.2   | Spec estatístico (métrica para "projeto é bem-sucedido")       | **Prévio**, thresholds a serem bloqueados após linha de base P1.5 |
| §0.3   | Stop-loss ("se ocorrer, desista")        | **Prévio**, imutável                  |
| §0.4   | Spec por skill (qual alterar, meta)  | **Posterior**, orientado por dados da Layer 1 |

### 0.1 Spec de Engenharia (Deve ser prévio · Pode ser bloqueado imediatamente)

Spec de correção do pipeline de dados e alterações de código — não depende de qualquer julgamento de negócio ou dados de linha de base, deve ser bloqueado antes do desenvolvimento:

- **Pipeline qwen-logger funcionando** (§4.1.1b): evento skill_launch deve cair em ambas as pipelines OTLP e qwen-logger
- **Encadeamento de `prompt_id`**: skill_launch disparado por um único user prompt + tool_call subsequente devem poder ser greppados no mesmo `prompt_id` para rastrear toda a trilha
- **`batch_size` não undefined** (§4.3.2 Direção A): batch explícito de ferramenta única com `batch_size = 1` / `batch_position = 0`
- **SQL executável** (§4.1.2): SQL offline no backend de telemetria real deve retornar não vazio e ser capaz de distinguir skills com alta/baixa followup_rate
- **Variância da linha de base < P50 × 20%** (P1.5): medição da linha de base estável (caso contrário, comparação A/B subsequente não é confiável) — Nota: embora listada aqui na camada de engenharia §0.1, o **bloqueio depende dos dados da linha de base P1.5**, é o único item de verificação posterior em §0.1; se P1.5 não passar, os thresholds de §0.2 não podem ser bloqueados com confiança
- **Orçamento de tamanho da skill** (Modificação Layer 2): após inline do followup, tokens da descrição da skill não devem exceder 2× do antes da modificação, e valor absoluto ≤ 500 tokens (o menor dos dois). Se exceder, dividir a skill conforme §4.2 em vez de mesclar. Este item alinha-se com as restrições existentes na §7 item 2 e §4.2, sendo promovido para o nível de spec
- **`npm run preflight` passa tudo**: barreira dura para cada PR

### 0.2 Spec Estatístico (Deve ser prévio · Thresholds a serem bloqueados após P1.5)

Métricas para "estatisticamente bem-sucedido" — **direção** fixada previamente, **thresholds** bloqueados após medição da linha de base (evitar números arbitrários):

| Métrica                               | Direção   | Momento de Bloqueio | Threshold placeholder atual (a ser calibrado) |
| -------------------------------------- | --------- | ------------------- | --------------------------------------------- |
| followup_rate ponderado top-3 skills   | ↓         | Fim do P1.5         | ≥ 30%                                         |
| RT P50 ponta a ponta de sessões contendo skills | ↓         | Fim do P1.5         | ≥ 2s                                          |
| Proporção de tool_call com `batch_size > 1` | ↑         | Antes do P3         | ≥ 30%                                         |
| Significância A/B do cenário com skill modificada | p < 0.05 | Antes do P2 pronto  | n a determinar                                |

> **Restrição chave**: Thresholds placeholder não são compromissos. Se a linha de base P1.5 mostrar "followup_rate ponderado top-5 skills < 30%" (disparando stop-loss #1 da §0.3), o projeto termina; **não é permitido abaixar o spec apenas para que o threshold "alcance"**.
>
> **Como medir**: Método de medição para cada métrica, template SQL, design A/B veja §5.1-§5.2; cálculo de tamanho da amostra para significância estatística (p < 0.05) veja §5.1.

### 0.3 Stop-Loss (Deve ser prévio · Ajustável apenas após bloqueio P-1 com restrição)

Listado em §5.3. Estas são condições duras de "se ocorrer, desista" — **em nenhuma circunstância as stop-loss podem ser relaxadas para atingir o spec estatístico §0.2**.

- **Métricas de resultado** (3 itens): followup_rate ponderado top-5 < 30% / Após modificar 2 skills, RT P50 ↓ < 1s / Após Layer 3, `batch_size P50` ainda = 1
- **Métricas de processo** (3 itens): Queda na taxa de acerto da skill ≥ 5pp / Taxa de falha de inline followup ≥ 5% / Aumento na taxa de cancelamento do usuário ≥ 2pp

Veja §5.3 para detalhes.

**Regra de ajustabilidade** (evitar rigidez disciplinar sem suporte de dados):

| Estágio                  | Pode ajustar?                                    | Direção de ajuste                                                                  |
| ------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| No bloqueio P-1          | ✅ Pode ajustar arbitrariamente (baseado em telemetria histórica ou consenso) | Arbitrária                                                                         |
| Após bloqueio P-1 → Fim do P1.5 | ❌ Não pode ajustar                           | —                                                                                  |
| Fim do P1.5 (quando linha de base sai) | ✅ Apenas **relaxar** uma vez               | Relaxamento (ex.: 30% → 25%) requer evidência de dados + revisão por 2 pessoas; **não permitido endurecer** (evitar adicionar stop-loss a posteriori) |
| Após P1.5                | ❌ Não pode ajustar                              | —                                                                                  |

> Thresholds placeholder (30% / 1s / 5pp, etc.) **atualmente sem suporte de dados históricos**, são intuição do engenheiro antes da revisão P-1. Se na revisão P-1 for possível obter telemetria das últimas 4 semanas, calibrar stop-loss baseado em dados históricos; se não for possível, manter placeholder, aplicar a regra de "relaxar uma vez" no fim do P1.5.

### 0.4 Spec por Skill (Deve ser posterior · Orientado por dados)

Qual skill modificar, meta de `followup_rate` para qual valor — **não bloquear antes dos dados da Layer 1 estarem disponíveis**.

Razão para não bloquear: design a priori vs dados a posteriori podem divergir muito. Forçar pré-bloqueio repetiria o erro da rota D2 de `rt-optimization-design.md` §7 — a suposição a priori de "modelo fast é 2-3s mais rápido" foi derrubada pelo fato a posteriori (implementação real de cache), resultando em ganho líquido próximo de zero ou até negativo.

**Local de produção**: Spec por skill é produzida orientada por dados no final do P1.5, declarada independentemente na descrição de cada PR Layer 2 (não entra no documento de design, para evitar ter que alterar o documento a cada skill modificada).

**Template de estrutura de spec por skill** (alinhado com os itens obrigatórios na descrição do PR da §4.2 — as duas listas são a mesma, §4.2 é a perspectiva de processo, esta seção é a perspectiva de spec):

| Campo            | Conteúdo                                                                                             | Fonte de dados                    |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1. Dados atuais  | invocation_count, followup_rate, top followup tools                                                  | Telemetria Layer 1                |
| 2. Meta          | Reduzir followup_rate de X% para Y%                                                                  | Baseado na direção de melhoria §0.2, valor absoluto definido no PR |
| 3. Escopo da modificação | Quais followups inline (read/grep/shell read-only), explicitamente **o que não** inline (operações write / cross-skill / raciocínio profundo) | Tabela de padrões de modificação §4.2 |
| 4. Atualização do contrato de saída | Pré-declaração adicionada na descrição da skill ("Returns: ...")                              | Exemplo de modificação §3.2       |
| 5. Plano A/B      | Observar followup_rate / RT P50 / métricas de processo por 2 semanas após modificação, comparar com linha de aceitação §5.1 | §5.1                               |
| 6. Prova de tamanho | Tokens da descrição da skill antes e depois da modificação (estimar com tiktoken), não exceder "Orçamento de tamanho da skill" §0.1 item 6 | §0.1 item 6                       |
### 0.5 spec 治理

- **修改 §0.1 / §0.3 spec** 需 design 文档更新 + PR 评审；§0.3 仅遵循 §0.3"可调性规则"在 P1.5 末窗口内放宽
- **修改 §0.2 阈值（P1.5 锁定后）** 需附以下至少一项数据证据：
  - (a) P1.5 基线测量结果与已锁定阈值的偏差分析（含原始测量记录链接）
  - (b) 同类项目的公开 benchmark 数据（含来源链接）
  - (c) 内部 ≥ 2 人评审签字的偏差说明

  PR 评审时若上述证据均无，评审者**有义务** block PR — 不接受"凭工程师直觉调整"

- **§0.4 per-skill spec** 在数据驱动产出后写入 PR description（按 §0.4 6 项模板），不进 design 文档

---

## 1. 背景与定位

### 1.1 问题

`rt-optimization-design.md` §1.2 给出的基线：3 轮 agent loop，13.4s 端到端，其中 LLM 调用占 78%。每一轮 ~3-4s。

```
Round 1 (3.8s, 28%): LLM 决策调 skill
Round 2 (3.0s, 22%): LLM 决策调 shell
Round 3 (3.8s, 28%): LLM 总结
```

`rt-optimization-design.md` §6/§7 经过两轮 review 后，D2/D4 已被否决，D1/D3 也降级为"等浮油完成后再评估"。但**整份原文档都聚焦在末尾的 Round 3（总结轮）或单轮内的微优化（D4）上，完全没有正面讨论 Round 1 → Round 2 这个"中间轮"为什么会出现、能不能消掉**。

事实是：Round 2 之所以存在，**绝大多数情况是因为 Round 1 调用的 skill 没有返回完整答案**，模型才追加 shell 查询补全。如果 skill 设计成"一次拿到完整结果"，3 轮 → 2 轮，省掉的就是 Round 2 那 ~3s — 这是与 D1 完全不重叠的收益面。

### 1.2 与 rt-optimization-design 的关系

| 减轮方向             | 命中的轮次                      | 杠杆位置                     | 本文档定位                   |
| -------------------- | ------------------------------- | ---------------------------- | ---------------------------- |
| D1 `skipLlmRound`    | 末尾总结轮                      | 框架机制 + per-tool opt-in   | 兜底，**放在 Layer 2 之后**  |
| D2 fast 路由         | 单轮延迟                        | 框架机制                     | 已 defer，**不在本文档范围** |
| D3 Summarizing 状态  | 末尾总结轮（感知层）            | UI 状态机                    | 可选，与本方案正交           |
| D4 prevalidate       | 单轮延迟                        | 框架机制                     | 已 defer，**不在本文档范围** |
| **本方案 Layer 1-3** | **中间决策轮 + 并发未触发的轮** | **skill 设计 + prompt 工程** | **新增方向**                 |

### 1.3 核心论点

减轮的真正杠杆在 skill/tool 设计层，不在 agent 框架。三个理由：

1. **§1.2 基线本身就暴露问题在 skill** — Round 1 → Round 2 的跳跃是 skill 返回不全才发生的，框架做对了，skill 做错了
2. **框架级减轮最终也要 per-tool opt-in** — D1 的 `skipLlmRound` 必须每个工具显式标记，绕一圈回到 skill 工程，还多一套不变量修复 + 决策门控成本
3. **ROI 局部可测、灰度容易** — 改一个 skill 就少一轮 × 该 skill 触发次数，不依赖 cache hit rate 数据，不依赖跨系统改动

> **实施前必须先走 §0 验收 Spec 前置评审（P-1 阶段，0.5d）** — §0.1 工程层 spec 和 §0.3 止损线在动手前必须锁定；§0.2 统计层阈值的方向也要前置确认（具体数值等 P1.5 基线后再锁）。跳过 §0 进入 P0 实施 = 默认走"做完才看指标"的反模式，文档不背书这种做法。

---

## 2. 设计原则

1. **不改 agent 框架** — 不动 `useGeminiStream` / `coreToolScheduler` / `geminiChat` 核心路径
2. **数据驱动选优先级** — 先建 telemetry，让数据告诉你改哪个 skill，不靠拍脑袋
3. **per-skill 可测可灰度** — 每个 skill 改造独立 A/B，失败局部回退
4. **复利优先** — 收益 = 单次减轮收益 × 触发频率，高频 skill 优先
5. **不绑定 D1** — 本方案的成功不依赖 D1 是否落地

---

## 3. 三层方案

### 3.1 Layer 1：减轮 Telemetry（找金矿）

**目标**：让数据告诉你哪些 skill 最值得改 — 即"用了这个 skill 之后，模型有多大概率追加一次工具调用"。

**核心字段**（per-turn、per-skill-invocation）：

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // 关联同一 user prompt 内的所有 events
  turn_index: number; // 该 skill 在 loop 里是第几轮
  followup_tool_names: string[]; // 同一 prompt_id 下，skill 之后还调了哪些工具
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // skill 之后下一轮就出文字（不再调工具）
  user_followup_within_30s: boolean; // 用户在结果显示后 30s 内追加新 prompt（质量回归信号）
}
```

**关键指标**：

- `skill_followup_rate = sum(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = sum(next_turn_is_terminal) / total_invocations`
- 按 `(skill_name, top followup tool)` 聚合 — 看哪些 skill 之后最常追加哪个工具

**金矿判定**：

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
该 skill 是减轮金矿，优先 Layer 2 改造
```

阈值建议：top-3 按上式排序的 skill，先改前 2 个。

### 3.2 Layer 2：Skill 输出完整化

**目标**：让被识别为金矿的 skill 一次返回完整答案，消除 Round 1 → Round 2 的跳跃。

**改造模式（按 followup 类型分类）**：

| Followup 模式               | 典型场景                   | 改造方向                           |
| --------------------------- | -------------------------- | ---------------------------------- |
| skill → `read_file`         | skill 给路径，模型再读     | skill 内部直接读，返回内容         |
| skill → `grep/glob`         | skill 给目录，模型再搜     | skill 内部搜好，返回匹配           |
| skill → `shell` (read-only) | skill 给命令，模型再执行   | skill 内部跑命令，返回输出         |
| skill → `shell` (write)     | skill 给方案，模型再执行写 | **保留**（写操作要确认，不应合并） |
| skill → another skill       | 链式调用                   | **不合并**（保持组合性）           |

**改造检查清单（per-skill PR 模板）**：

1. 在 skill 描述里**预声明输出契约**：明确写 "Returns: full file content / matched lines / command output"，让模型知道不必追加查询
2. 在 skill 内部**完成所有 read-only followup**：把 telemetry 显示 >50% 追加率的 read/search 操作内联进 skill
3. **不内联 write 操作**：写操作需要用户确认，必须单独成轮
4. **不内联深度推理 followup**：如果 followup 是"基于此再分析"，那是模型的事，不是 skill 的事
5. **附 A/B telemetry**：改造后 2 周对比 `followup_rate` 是否下降到 <20%

**典型改造示例（示意）**：

改造前：

```
skill "list-workspaces" returns: ["ws_a", "ws_b"]
→ Round 2: model calls shell to get details for each workspace
```

改造后：

```
skill "list-workspaces" returns:
  - ws_a (owner: foo, last_active: 2026-05-20, status: active)
  - ws_b (owner: bar, last_active: 2026-05-01, status: archived)
description updated: "Returns workspaces with owner, last_active, status"
→ Round 2 disappears for ~80% of queries
```
### 3.3 Camada 3: Prompt para ensinar concorrência ao modelo

**Objetivo**: Para ferramentas independentes (ler múltiplos arquivos, pesquisar em múltiplos diretórios), fazer o modelo emitir tool_calls concorrentes na mesma rodada, comprimindo N rodadas em 1.

**Pré-requisito**: A infraestrutura já está pronta — `CONCURRENCY_SAFE_KINDS` em `tools/tools.ts:818` + `partitionToolCalls` do `coreToolScheduler` já conseguem executar concorrentemente as ferramentas read/search/fetch dentro do mesmo lote. **Falta apenas a vontade do modelo de iniciar tool_calls concorrentes ativamente**, o qwen-coder por padrão tende a ser serial.

**Local da alteração**: `packages/core/src/core/prompts.ts` (já auditado, adicionar perto do segmento `# Final Reminder` linha L396 não afeta nada além do cache hit — apenas custo de aquecimento único).

**Texto de orientação (ilustrativo, precisa de ajuste A/B)**:

```
When you need to call multiple independent read-only tools (read_file,
grep, glob, web_fetch), emit them in a SINGLE tool_calls batch — do NOT
call them sequentially across rounds. They will execute concurrently.

Examples:
- Reading 3 files for comparison: emit 3 read_file calls in one batch
- Searching for 2 patterns: emit 2 grep calls in one batch

Do NOT batch when the second call depends on the first call's result.
```

**Métrica de eficácia**: Novo campo de telemetria `batch_size` (número de tool_calls dentro do mesmo turno) — comparar distribuição antes e depois da alteração do prompt.

#### 3.3.1 Expandir `CONCURRENCY_SAFE_KINDS` (Subitem da Camada 3)

O prompt ensina concorrência ao modelo apenas do lado da oferta (modelo disposto a emitir múltiplos tool_calls de uma vez), mas `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` em `tools/tools.ts:818` determina **o escopo real de ferramentas que podem ser executadas concorrentemente**: `partitionToolCalls` (`coreToolScheduler.ts:775`) empacota "ferramentas seguras consecutivas" em lotes concorrentes, as demais são seriais.

Se o modelo seguir a orientação e emitir 3 tool_calls de uma vez, mas um deles pertencer a `Kind.Execute` e não estiver no conjunto seguro, todo o lote será desmembrado e executado serialmente — o ganho da alteração do prompt da Camada 3 será anulado pelo escalonador em tempo de execução.

**Candidatos para expansão** (em ordem crescente de risco):

- `Kind.Think` (incluindo save_memory / todo_write) — **Não adicionar**, possui escrita implícita
- Shell somente leitura (Execute onde `isShellCommandReadOnly()` retorna true) — `partitionToolCalls` já possui tratamento especial (comentário em `coreToolScheduler.ts` `partitionToolCalls` menciona "Execute (shell) is safe only when isShellCommandReadOnly() returns true"), a situação atual já cobre, não precisa alterar `CONCURRENCY_SAFE_KINDS`
- Ferramentas MCP por `Kind` — Cada servidor MCP se comporta de forma muito diferente, precisa de opt-in explícito no registro da ferramenta para ser seguro

**Conclusão**: O conjunto atual já é razoável, **a Camada 3 não depende da expansão de `CONCURRENCY_SAFE_KINDS`**. O propósito desta seção é: após coletar os dados de telemetria `batch_size`, **se descobrir que o "P50 dos lotes concorrentes < valor esperado", primeiro verificar se é o `partitionToolCalls` que está cortando, não a falta de concorrência do modelo**. Este é um caminho de diagnóstico em caso de falha do A/B da Camada 3, não é obrigatório.

> Crédito: codex review levantou que "expandir `CONCURRENCY_SAFE_KINDS` é uma alavanca ignorada". Após verificação, conclui-se: a situação atual já cobre a maior parte com o tratamento especial `isShellCommandReadOnly`, expandir o conjunto traria pouco ganho e alto risco; manter como caminho de diagnóstico.

---

## 4. Implementação Detalhada

### 4.1 Camada 1: Extensão de Telemetria (1-2d)

#### 4.1.1 Adicionar `prompt_id` ao `SkillLaunchEvent`

**Local**: `packages/core/src/telemetry/types.ts:896`

Atualmente, `SkillLaunchEvent` contém apenas `skill_name` + `success`, **sem `prompt_id`** — impossível associar a outros `ToolCallEvent` no mesmo turno.

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // novo
  turn_index?: number;                  // novo

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // novo
    turn_index?: number,                // novo
  ) { ... }
}
```

**Atualização dos chamadores**: 4 pontos de chamada `logSkillLaunch` em `packages/core/src/tools/skill.ts` (L386, L399, L426, L482) — `BaseToolInvocation` possui apenas `params`, não o campo `request.prompt_id`. **Implementação real**: usar duck typing para injetar: `SkillToolInvocation` expõe um setter `setPromptId(id)` + campo privado `promptId`, `CoreToolScheduler.buildInvocation` (`coreToolScheduler.ts:1253`) chama duck-type `setPromptId(request.prompt_id)` após construir, alinhado com o padrão do hook `setCallId` existente; a invocação nos 4 `logSkillLaunch` dentro de `execute()` passa `this.promptId`. **A descrição desta seção em versão anterior ("BaseToolInvocation já possui request.prompt_id") estava errada**, corrigida após review do PR #4565.

#### 4.1.1b Correção do link qwen-logger (pré-requisito)

Antes de adicionar `prompt_id`, é preciso resolver um **ponto de ruptura existente**: o método `logSkillLaunchEvent(event)` definido em `packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` **não possui nenhum chamador em todo o repositório** — `logSkillLaunch` em `loggers.ts:958` vai diretamente pelo caminho OTLP `logs.getLogger(SERVICE_NAME).emit()`, ignorando o qwen-logger.

Consequências:

- Eventos skill_launch no caminho OTLP chegam ao coletor OTLP (já funciona), mas o caminho de envio dedicado do qwen-logger está atualmente morto
- Se o backend de telemetria consumir do qwen-logger (em vez de OTLP), eventos skill_launch **não são reportados**
- §4.1.2 deriva `SkillFollowupRecord` offline, dependendo da persistência dos eventos skill_launch — **primeiro validar se skill_launch está visível no backend atualmente**

Direções de correção (duas opções):

- **A** (recomendado) Adicionar uma linha `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)` em `logSkillLaunch` em `loggers.ts:958`, alinhado com a escrita de `logToolCall` em `loggers.ts:230`
- **B** Confirmar que o backend consome apenas de OTLP, marcar `logSkillLaunchEvent` no qwen-logger como `@deprecated` ou remover

**Por que apenas adicionar o caminho QwenLogger, e não alinhar com os 4 caminhos completos de `logToolCall`**:

`logToolCall` (`loggers.ts:220-247`) tem na verdade 4 saídas:

1. `uiTelemetryService.addEvent(...)` — exibição na UI
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` — histórico de chat
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` — telemetria backend qwen-logger
4. OTLP `logger.emit(...)` — OpenTelemetry

skill_launch é **um evento de telemetria puramente de backend**, não precisa ser exibido na UI (o usuário já vê o returnDisplay do SkillTool) nem entrar no histórico de turnos do ChatRecording (as chamadas de ferramentas internas da skill já são registradas individualmente por recordUiTelemetryEvent). Portanto, adicionar apenas o caminho 3 (QwenLogger) e manter o caminho 4 (OTLP), pulando o 1/2 é intencional, não omissão.

**Detalhes de passagem de campos**: `loggers.ts:961-966` usa spread `{ ...event }` para passar automaticamente novos campos (após adicionar `prompt_id` ao `SkillLaunchEvent`, esse caminho funciona automaticamente), mas `logSkillLaunchEvent` em `qwen-logger.ts:908`, se internamente desestruturar explicitamente `event.skill_name` / `event.success`, novos campos não serão incluídos automaticamente, precisando de sincronização manual.

Carga de trabalho: Caminho A ~0.5d (incluindo confirmação no backend); Caminho B ~0.2d (remover código + documentação).

#### 4.1.2 Derivar `SkillFollowupRecord` (agregação offline)
Não são necessários novos tipos de eventos — `ToolCallEvent` e `SkillLaunchEvent` já possuem `prompt_id`, basta uma consulta SQL offline para derivar:

```sql
-- pseudo SQL, ajuste conforme seu backend de telemetry
WITH skill_events AS (
  SELECT prompt_id, skill_name, timestamp FROM events
  WHERE event_name = 'skill_launch' AND success = true
),
tool_events AS (
  SELECT prompt_id, function_name, timestamp FROM events
  WHERE event_name = 'tool_call'
),
followups AS (
  SELECT s.skill_name, s.prompt_id,
         COUNT(t.function_name) AS followup_count,
         ARRAY_AGG(t.function_name) AS followup_tool_names
  FROM skill_events s
  LEFT JOIN tool_events t
    ON s.prompt_id = t.prompt_id AND t.timestamp > s.timestamp
  GROUP BY s.skill_name, s.prompt_id
)
SELECT skill_name,
       COUNT(*) AS invocations,
       AVG(followup_count) AS avg_followup,
       SUM(CASE WHEN followup_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) AS followup_rate
FROM followups
GROUP BY skill_name
ORDER BY invocations * followup_rate DESC;
```

#### 4.1.3 Executar telemetry por 1 semana para coletar dados

- Nenhuma alteração no comportamento visível ao usuário
- Nenhuma necessidade de chave de configuração — telemetry já possui framework opt-in (configuração `telemetry.target`)
- Após 1 semana, produzir relatório de ranking de skills

### 4.2 Layer 2: Refatoração de Skills (0,5-1d por skill)

Refatorar de cima para baixo com base nos dados da Layer 1. Cada skill em um PR separado; a descrição do PR deve conter:

1. **Dados**: invocation_count atual, followup_rate, principais ferramentas de followup
2. **Escopo da refatoração**: quais followups foram incorporados (declarar explicitamente o que não foi incorporado)
3. **Atualização do contrato de saída**: o que foi adicionado na descrição da skill como pré-declaração
4. **Plano A/B**: após refatoração, observar followup_rate por mais 2 semanas

**Observações**:

- Ao incorporar operações de leitura na skill, não reimplementar todo o tratamento de casos especiais de `read_file` (codificação, detecção binária, etc.) — chamar a ferramenta `read_file` em si, não reescrever
- Incorporação de grep/glob na skill, da mesma forma
- Incorporação de comandos shell na skill deve seguir o caminho padrão `executeToolCall` (preservar telemetry)
- **Não explodir o tamanho da skill**: se após incorporar followups a descrição da skill ultrapassar 500 tokens, dividir a skill em vez de mesclar

### 4.3 Layer 3: Educação via Prompt (0,5d de alteração + ajuste com medição)

#### 4.3.1 Adicionar orientação de concorrência

**Localização**: `packages/core/src/core/prompts.ts` seção `# Final Reminder` (L396)

Adicionar o texto de orientação da seção 3.3. O texto exato precisa de A/B — começar com a versão mais simples, refinar de acordo com o aumento da taxa de concorrência.

#### 4.3.2 Adicionar telemetry de `batch_size`

**Localização**: `ToolCallEvent` em `packages/core/src/telemetry/types.ts` ou novo `ToolBatchEvent` leve

```typescript
// Opção A: Adicionar campo em ToolCallEvent (menos intrusivo)
export class ToolCallEvent {
  ...
  batch_size?: number;        // número de tool_call no mesmo batch
  batch_position?: number;    // posição dentro do batch (0-indexed)
}

// Opção B: Novo ToolBatchEvent (semântica mais clara, exige fluxo completo de novo tipo de evento)
```

**Recomendação: Opção A** — menos alterações, agregação mais fácil em consultas.

**Caminho de passagem de estado** (crítico — este custo foi subestimado nas versões iniciais):

`coreToolScheduler.ts:2456` `partitionToolCalls(callsToExecute)` retorna `batches`, **mas a informação do batch é imediatamente perdida no caminho de dispatch**:

```
executeToolCalls
  └─ batches = partitionToolCalls(...)           // sabe batch.calls.length
     └─ for batch of batches:
        └─ this.runConcurrently(batch.calls, ...) // sabe batch.calls.length
           └─ executeSingleToolCall(call, ...)   // ❌ já não sabe o batch
              └─ ...
                 └─ finalizeToolCalls
                    └─ logToolCall(config, new ToolCallEvent(call)) // ❌ sem contexto de batch
```

O construtor de `ToolCallEvent` (`types.ts:189`) recebe apenas um `CompletedToolCall`, sem campo de batch.

Direção de correção:

- **Direção A** (recomendada): Adicionar `batchSize?: number` + `batchPosition?: number` em `ScheduledToolCall`. Preencher nas duas ramificações:
  - Ramificação concorrente (`coreToolScheduler.ts:2459-2460`, `batch.calls.length > 1`): antes do loop em `runConcurrently(batch.calls, ...)`, atribuir a cada `call` `batchSize = batch.calls.length`, `batchPosition = i`
  - Ramificação serial (`L2462-2464` loop `for (const call of batch.calls)`): para batch de ferramenta única, definir explicitamente `batchSize = 1`, `batchPosition = 0` (**não deixar undefined**, senão a agregação downstream de telemetry interpretará incorretamente como dado faltante em rodadas sem concorrência)

  `new ToolCallEvent(call)` no construtor lê esses dois campos de `call`

- **Direção B**: Alterar assinatura do construtor `ToolCallEvent` para `new ToolCallEvent(call, batchInfo?)`, ajustar todos os pontos de chamada sincronamente (4 pontos de logToolCall + testes). Mudança maior que a direção A

Esforço: Direção A ~0,5d incluindo testes unitários; Direção B ~1d (mais pontos de chamada).

**Medir sincronamente a "vontade de concorrência do modelo"** — comparar antes e depois da alteração de prompts.ts na Layer 3, a distribuição de `proporção de tool_call com batch_size > 1`. Este é o indicador-chave de eficácia da Layer 3; sem esses dados, o A/B da Layer 3 não pode ser concluído.

#### 4.3.3 Avaliação de impacto no cache

A alteração em `prompts.ts` invalidará o cache efêmero DashScope por completo (primeira requisição com cache miss, depois recuperação). Este é um custo único conhecido, consulte `rt-optimization-design.md` §7.8 sobre auditoria de estado estacionário de prompts.

---

## 5. Aceitação e Métricas

> **Esta seção é o complemento metodológico da Spec de Aceitação §0** — §0 declara "indicadores de sucesso + thresholds pré/pós", §5 explica "como medir, como escrever SQL, como projetar A/B". Os thresholds aqui são placeholders atuais de §0.2; os valores finais serão travados após a medição da linha de base P1.5.

### 5.1 Indicadores A/B por skill (2 semanas após refatoração)

| Indicador                                    | Linha de aceitação          | Observação                       |
| -------------------------------------------- | --------------------------- | -------------------------------- |
| `followup_rate` da skill                     | < 20% (se antes estava 70%+) | Indicador principal               |
| P50 de RT ponta a ponta do cenário acionado pela skill | Redução ≥ 2s     | Devido a uma chamada LLU a menos  |
| Taxa de `user_followup_within_30s` da skill  | Não aumentar                | Usuário não perguntou = resposta completa |
| Taxa de `success` da skill                   | Não diminuir                | Incorporar followup não introduziu novas falhas |

### 5.2 Indicadores gerais de RT

| Indicador                             | Linha de base                                    | Meta após Layer 2 refatorar top-3 skill |
| ------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| P50 de RT ponta a ponta (sessões com skill) | 13,4s (amostra única) / pendente: linha de base de ≥3 cenários | Redução de 2-3s |
| P50 de tamanho de Tool batch (Layer 3) | Pendente                                        | ≥ 1,3 (>30% das chamadas envolvem batch concorrente) |
| `followup_rate` total das skills (média ponderada) | Pendente                                        | Redução ≥ 30% |
### 5.3 Sinais de falha — quando abandonar esta direção

**Linhas de parada para métricas de resultado**:

- Após os dados da Layer 1 estarem disponíveis, **taxa de followup ponderada dos top-5 skills < 30%** → espaço de redução de rodadas pequeno, não vale a pena continuar com Layer 2
- Após modificar 2 skills na Layer 2, **queda no RT P50 de ponta a ponta < 1s** → direção de melhoria errada (pode ser que followup seja uma operação de escrita que não deveria ser mesclada), pare e revise
- Após 2 semanas de modificação no prompt da Layer 3, **batch_size P50 ainda = 1** → modelo não aceita orientação de concorrência, abandone Layer 3, mantenha apenas Layer 1+2

**Linhas de parada para métricas de processo (alerta antecipado, para evitar que a solução "pareça estar funcionando, mas não traz retorno")**:

- **Queda na taxa de acerto do skill (intended skill vs selected skill) ≥ 5pp** → descrição do skill piorou fazendo o modelo escolher o skill errado. Cenário típico: antes da modificação, o usuário perguntava X e sempre acertava skill_a; após a modificação, ocasionalmente é roteado para skill_b sem gerar erro (o modelo usou o skill errado mas produziu uma resposta quebrada), a métrica de resultado parece normal mas a followup_rate na verdade aumenta. **Método de medição**: adicionar `skill_invocation_pattern` na telemetria — agrupar por palavras-chave principais dos prompts do usuário, ver qual skill cada cluster aciona principalmentente; comparar antes e depois para ver deslocamento do top 1
- **Taxa de falha de followup inline do skill ≥ 5%** → a modificação do skill introduziu modos de falha que não existiam antes (ex.: `read_file` inline processando arquivo grande estourando memória). Medição: comparar `SkillLaunchEvent.success` antes e depois
- **Aumento na taxa de cancelamento por usuário por skill (Ctrl+C) ≥ 2pp** → saída do skill ficou mais lenta ou mais longa, fazendo o usuário perder a paciência. Medição: proporção de `ToolCallEvent.status === 'cancelled'`

---

## 6. Integração com D1/D3

### 6.1 Relação com D1

Após modificar os top skills na Layer 2, **os skills restantes com alto followup são o cenário real de aplicação do D1 `skipLlmRound`** — aqueles skills cuja saída já está completa (não precisam de Round 2) e realmente são consultas de estado final (Round 3 de resumo também é desperdício).

Ordem de execução:

1. Layer 1 telemetry no ar → 1 semana de dados
2. Layer 2 modificar top 2-3 skills → A/B por 2 semanas
3. Layer 3 prompt com concorrência → 1 semana de teste real
4. **Só então** avaliar D1: quantos dos skills de alta frequência restantes estão no formato "saída completa + consulta de estado final" → se vale 2-3d de modificação no framework

### 6.2 Relação com D3

D3 (`StreamingState.Summarizing`) é uma otimização na camada de percepção, totalmente ortogonal a este plano. Layer 1-3 reduzem o **número real de rodadas**, D3 reduz a **espera percebida pelo usuário**. Se Layer 2 já reduziu o RT para uma faixa aceitável para o usuário, o valor de D3 diminui; caso contrário, D3 pode ser adicionado em cima.

---

## 7. Limitações e riscos conhecidos

1. **Cobertura limitada pelo escopo da modificação** — modificar 10 skills cobre apenas os cenários desses 10. Mas o retorno é mensurável e composto
2. **Skill inline followup pode tornar um skill individual mais pesado** — descrição inchada, carregamento lento, menor reuso. A defesa é o item 5 da checklist da Layer 2
3. **Layer 3: modelo pode ignorar orientação de concorrência** — qwen-coder tem dados de treinamento mais seriais; dados A/B podem mostrar que a alteração no prompt é ineficaz, sendo um modo de falha conhecido
4. **Limites de privacidade na telemetria** — `SkillFollowupRecord` não deve registrar argumentos de ferramenta (já por padrão obtidos de `ToolCallEvent.function_args`, mas é preciso auditar se `skill_name` vaza a intenção do usuário)
5. **Não se aplica a sub-agent / cron / notification** — esses caminhos não passam pelo sistema de skills, este plano não os cobre
6. **Dados de baseline escassos** — usando a amostragem única da §1.2 do `rt-optimization-design.md`, antes de implementar Layer 2 é necessário complementar com ≥3 tipos de baseline de cenário
7. **Extensão do campo `logSkillLaunch` quebra consumidores existentes de telemetria** — 4 pontos de chamada + logger downstream precisam ser alterados em sincronia
8. **`qwen-logger.ts:908` `logSkillLaunchEvent` atualmente é código morto** — nenhum cliente no repositório, §4.1.1b já lista a correção prévia

### 7.1 Limites com mecanismos existentes do framework (fora do escopo deste plano)

O repositório já possui vários mecanismos indiretamente relacionados à redução de rodadas. **Este plano não reinventa nem substitui**:

| Mecanismo existente                                      | Localização                            | Relação com este plano                                                                                                                |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently` (execução concorrente) | `coreToolScheduler.ts:775, 2473`     | Layer 3 reutiliza diretamente; este plano não mexe                                                                                      |
| `CONCURRENCY_SAFE_KINDS` (define quais ferramentas podem ser concorrentes) | `tools/tools.ts:818`                 | §3.3.1 já argumentou que a situação atual é razoável, não expande                                                                     |
| `FileReadCache` (evita ler o mesmo arquivo várias vezes)  | `services/fileReadCache.ts`          | Afeta indiretamente as rodadas de "modelo relê arquivo"; já está ativo; este plano não depende nem aprimora                             |
| `chatCompressionService` (compressão de histórico)        | `services/chatCompressionService.ts` | Ortogonal ao número de rodadas (afeta custo por rodada, não quantidade); é o mesmo componente que o gate `wouldTriggerCompression` da rota fast em `rt-optimization-design.md` §3.2 |

A listagem é para evitar que "este plano seja interpretado como ignorar mecanismos existentes".

---

## 8. Cronograma de implementação

> **Premissa: esta linha do tempo começa em P-1 e não pode ser pulada.** P-1 é a revisão prévia da especificação de aceitação da §0, com 0.5d de trabalho mas **obrigatória** — se não aprovada, não se avança para P0. Essa restrição visa evitar o anti-padrão de "primeiro escrever código e depois fazer a spec": fazer a spec depois equivale a adiar o julgamento de "sucesso" para depois dos resultados, o que tende a gerar desvios de ajustar a spec para que os indicadores pareçam bons (vide o precedente da rota D2 em `rt-optimization-design.md` §7).

| Fase       | Conteúdo                                                                 | Esforço                | Entrega                           | Ação de travamento da spec                           |
| ---------- | ------------------------------------------------------------------------ | ---------------------- | --------------------------------- | ---------------------------------------------------- |
| **P-1**    | Revisão prévia da spec                                                   | 0.5d                   | §0.1 / §0.3 travados              | **Travar §0.1 (spec da camada de engenharia) + §0.3 (linhas de parada)** |
| **P0**     | Correção da cadeia qwen-logger (§4.1.1b prévia)                          | 0.5d                   | Visibilidade do evento skill_launch confirmada | Validar §0.1 item 1                        |
| **P1**     | Layer 1 telemetry: adicionar campo `prompt_id` + SQL offline             | 1-2d                   | Relatório de ranking de skills     | Validar §0.1 itens 2/3/4                             |
| **P1.5**   | 1 semana de coleta de dados + medição de baseline (≥3 cenários × ≥10 execuções) | 1w                | Decidir quais 2-3 skills modificar | **Travar §0.2 limites + validar §0.1 item 5**        |
| **P2**     | Layer 2 modificar top-1 skill (PR + A/B)                                 | 0.5-1d mod + 2w obs  | Verificar queda de followup_rate ↓, RT P50 ↓ | **Declarar §0.4 per-skill spec dentro do PR** |
| **P3**     | Layer 3: prompt com orientação de concorrência + telemetria `batch_size` (incluindo §4.3.2 passagem de estado) | 1-1.5d alteração + 1w teste real | Distribuição de batch_size        | Validar §0.2 item 3                                  |
| **P4**     | Layer 2 continuar modificando top-2 / top-3 skills (paralelo a P3)       | 0.5-1d × N            | Queda acumulada de RT P50 ↓        | Declarar §0.4 em cada PR                             |
| **P5**     | Avaliar se D1 ainda tem valor                                           | Reunião de decisão    | Atualização de roadmap             | —                                                    |
**Pontos de Decisão Chave (comparados com a linha de parada §0.3):**

- **Fim de P-1**: §0.1 / §0.3 qualquer item sem consenso → não entrar em P0
- **Fim de P1.5**: Acionar indicador de resultado §0.3 #1 (taxa de acompanhamento ponderada top-5 < 30%) → terminar a direção; caso contrário, travar o limiar §0.2
- **Fim de P2**: Acionar indicador de resultado §0.3 #2 (após modificação top-1, RT P50 ↓ < 1s) ou qualquer indicador de processo → parar para revisão
- **Fim de P3**: Acionar indicador de resultado §0.3 #3 (batch_size P50 ainda = 1) → abandonar a Layer 3
- **P5**: Decidir o ROI D1 com base na forma das skills restantes

---

## 9. Principais Locais de Código

| Arquivo                                                     | Símbolo Chave                                                      | Localização                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `packages/core/src/telemetry/types.ts`                      | `ToolCallEvent` (contém `prompt_id` / `duration_ms`)              | L170                                     |
| `packages/core/src/telemetry/types.ts`                      | `SkillLaunchEvent` (precisa adicionar `prompt_id`)                 | L896                                     |
| `packages/core/src/telemetry/loggers.ts`                    | `logToolCall`                                                      | L220                                     |
| `packages/core/src/telemetry/loggers.ts`                    | `logSkillLaunch` (via OTLP; sem encaminhamento do qwen-logger)     | L958                                     |
| `packages/core/src/telemetry/loggers.ts`                    | `logToolCall` (caminho duplo: OTLP + qwen-logger, usado como modelo de correção) | L220, L230                        |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`    | `logSkillLaunchEvent` (**código morto atualmente**, alvo de correção prévia §4.1.1b) | L908                              |
| `packages/core/src/core/coreToolScheduler.ts`               | `partitionToolCalls`                                               | L775                                     |
| `packages/core/src/core/coreToolScheduler.ts`               | `runConcurrently` / agendamento batch                              | L2456, L2473                             |
| `packages/core/src/core/coreToolScheduler.ts`               | Ponto de chamada `logToolCall` (ponto final de passagem de estado batch_size) | L3163                              |
| `packages/core/src/services/fileReadCache.ts`               | `FileReadCache` (já existente, afeta rodadas de leitura repetidas) | L135                                     |
| `packages/core/src/tools/skill.ts`                          | `SkillTool` + 4 pontos de chamada `logSkillLaunch`                | L386, L399, L426, L482                   |
| `packages/core/src/skills/skill-manager.ts`                 | `SkillManager` (registro/carregamento de skills)                  | Arquivo inteiro                          |
| `packages/core/src/skills/skill-load.ts`                    | Carregamento de descrição de skill (ponto de entrada de mudanças no contrato de saída) | Arquivo inteiro                    |
| `packages/core/src/tools/tools.ts`                          | `Kind` + `CONCURRENCY_SAFE_KINDS`                                 | L793, L818                               |
| `packages/core/src/core/coreToolScheduler.ts`               | `partitionToolCalls` + `runConcurrently` (infraestrutura de concorrência existente) | veja rt-optimization-design.md §5.7 |
| `packages/core/src/core/prompts.ts`                         | Seção `# Final Reminder` (ponto de adição de orientação de concorrência na Layer 3) | L396                              |
| `.qwen/skills/`                                             | Diretório de definição de cada skill (objeto de modificação da Layer 2) | Diretório                             |
