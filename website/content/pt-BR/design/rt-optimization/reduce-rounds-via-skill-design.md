```markdown
# Estratégia de Redução de Loops do Agent: Começando pelo Design de Skills

> No mesmo diretório que `rt-optimization-design.md`, complementares: aquele documento discute a redução de loops no nível de **mecanismo do framework** (D1 pular rodada de resumo final, D2 roteamento rápido, D4 pré-validação); este documento defende que **a verdadeira alavanca para redução de loops está no nível de design de skill/tool** e propõe um caminho viável que não depende de modificações no framework nem de dados de taxa de acerto de cache.

---

## 0. Especificação de Aceitação (Gate de Desenvolvimento Prévio)

> Esta seção é o **gate de desenvolvimento** – lista quais especificações devem ser confirmadas antes de começar a implementação e quais devem aguardar dados. Colocar a especificação como pré-requisito em vez de "fazer e depois ver as métricas" visa evitar: (a) métricas não mensuráveis ao final, (b) desvio de thresholds devido a resultados instáveis, (c) falta de stop-loss que leva a esforço sem retorno real.
>
> **Limite de aplicabilidade deste framework de especificação**: Este framework assume que a correção da direção pode ser avaliada após a medição da linha de base P1.5. Essa suposição é válida para o cenário de "redução de loops", pois possui sinais mensuráveis claros (número de rodadas, followup_rate, batch_size). **Para cenários além desta suposição** (por exemplo, usar o mesmo framework para "otimização de qualidade" – difícil de quantificar), pré-especificações podem atrapalhar o aprendizado rápido; nesses casos, volte ao processo de governança da §0.5 para reavaliar, sem aplicar este framework mecanicamente.

**A especificação tem quatro camadas – momentos diferentes:**

| Camada | Tipo                                                                           | Momento de Bloqueio                             |
| ------ | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| §0.1   | Especificação de engenharia (pipeline de dados, correção de alterações de código) | **Prévio**, pode ser bloqueado imediatamente    |
| §0.2   | Especificação estatística (métricas para definir "sucesso" do projeto)         | **Prévio**, thresholds a bloquear após linha de base P1.5 |
| §0.3   | Stop-loss (condição rígida: "se acontecer, abandone")                          | **Prévio**, imutável                            |
| §0.4   | Especificação por skill (qual alterar e qual a meta)                           | **Posterior**, orientada a dados da Camada 1    |

### 0.1 Especificação de Engenharia (Deve ser prévia · Pode ser bloqueada imediatamente)

Especificações de pipeline de dados e correção de alterações de código – não dependem de julgamento de negócio ou dados de linha de base, devem ser bloqueadas antes do desenvolvimento:

- **Cadeia do qwen-logger íntegra** (§4.1.1b): evento skill_launch deve cair tanto no pipeline OTLP quanto no qwen-logger
- **Encadeamento por `prompt_id`**: `skill_launch` + `tool_call` subsequente, disparados por um único prompt de usuário, devem ser pesquisáveis pelo mesmo `prompt_id` para rastrear o trail completo
- **`batch_size` não undefined** (§4.3.2 direção A): batch de ferramenta única deve definir explicitamente `batch_size = 1` / `batch_position = 0`
- **SQL executável** (§4.1.2): SQL offline deve produzir saída não vazia no backend de telemetria real e conseguir distinguir skills de alto/baixo followup_rate
- **Variância da linha de base < P50 × 20%** (P1.5): medição de linha de base estável (caso contrário, comparação A/B futura não será confiável) – Nota: embora listado na camada de engenharia §0.1, **o bloqueio depende de dados da linha de base P1.5**; é o único item de verificação posterior dentro de §0.1; se P1.5 falhar, os thresholds de §0.2 não podem ser bloqueados com confiança
- **Orçamento de tamanho da skill** (transformação Camada 2): após inline de followup, o número de tokens na descrição da skill não excede 2× o original e o valor absoluto é ≤ 500 tokens (o menor valor). Se exceder, divida a skill conforme §4.2 em vez de mesclar. Este item está alinhado com §7 item 2 e §4.2 restrições existentes; elevado ao nível de especificação
- **`npm run preflight` passa tudo**: requisito obrigatório para cada PR

### 0.2 Especificação Estatística (Deve ser prévia · Thresholds a bloquear após P1.5)

Métricas para definir "sucesso estatístico" do projeto – **direção** definida previamente, **thresholds** bloqueados após medição da linha de base (evitar preencher números sem dados):

| Métrica                                                                   | Direção | Momento de Bloqueio | Threshold Provisório (a calibrar) |
| ------------------------------------------------------------------------- | ------- | ------------------- | --------------------------------- |
| `followup_rate` ponderado dos top-3 skills                                | ↓       | Fim de P1.5         | ≥ 30%                             |
| RT P50 de ponta a ponta de sessões que contêm skill                       | ↓       | Fim de P1.5         | ≥ 2s                              |
| Proporção de `tool_call` com `batch_size > 1`                             | ↑       | Antes de P3         | ≥ 30%                             |
| Significância A/B do cenário que dispara a skill transformada             | p < 0.05 | Antes do fim P2     | n a determinar                  |

> **Restrição chave**: Thresholds provisórios não são promessas. Se a linha de base P1.5 mostrar "followup_rate ponderado dos top-5 skills < 30%" (disparando stop-loss #1 da §0.3), o projeto é encerrado; **não é permitido reduzir a especificação para que o threshold "seja atingido"** .
>
> **Como medir**: Método de medição, template SQL e design A/B para cada métrica estão nas §5.1-§5.2; cálculo de tamanho amostral para significância estatística (p < 0.05) está na §5.1.

### 0.3 Stop-Loss (Deve ser prévio · Imutável após bloqueio P-1, mas ajustável com restrições)

Listado na §5.3. Estas são condições rígidas de "se acontecer, abandone" – **em nenhuma circunstância os stop-loss devem ser relaxados para atingir as especificações estatísticas da §0.2**.

- **Métricas de resultado** (3): `followup_rate` ponderado top-5 < 30% / após alterar 2 skills, RT P50 ↓ < 1s / após Camada 3, `batch_size P50` ainda = 1
- **Métricas de processo** (3): taxa de acerto da skill ↓ ≥ 5pp / taxa de falha de inline followup ≥ 5% / taxa de cancelamento do usuário ↑ ≥ 2pp

Veja §5.3 para detalhes.

**Regras de ajustabilidade** (evitar rigidez disciplinar sem suporte de dados):

| Fase                                | Pode ajustar?                            | Direção de ajuste                                                                                 |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| No bloqueio P-1                     | ✅ Qualquer ajuste (baseado em telemetria histórica ou consenso) | Qualquer                                                                                          |
| Após bloqueio P-1 → Fim de P1.5     | ❌ Não ajustável                         | —                                                                                                 |
| Fim de P1.5 (quando linha de base sai) | ✅ Permitido **relaxar** uma vez        | Relaxar (ex.: 30% → 25%) requer evidência de dados + revisão por 2 pessoas; **não é permitido apertar** (evitar adicionar stop-loss retroativamente) |
| Após P1.5                           | ❌ Não ajustável                         | —                                                                                                 |

> Os valores provisórios dos thresholds (30% / 1s / 5pp, etc.) atualmente **não têm suporte de dados históricos**, são intuição do engenheiro antes da revisão P-1. Se for possível obter telemetria histórica das últimas 4 semanas durante a revisão P-1, os stop-loss devem ser calibrados com base nesses dados; caso contrário, mantenha os valores provisórios e aplique a regra de "relaxar uma vez" no fim de P1.5.

### 0.4 Especificação por Skill (Deve ser posterior · Orientada a dados)

Qual skill alterar, meta de `followup_rate` – **não bloqueado antes dos dados da Camada 1 estarem disponíveis**.

Motivo: design a priori vs. dados a posteriori podem diferir muito. Forçar pré-especificação repetiria o erro da rota D2 em `rt-optimization-design.md` §7 – a suposição prévia de "modelo fast é 2-3s mais rápido" foi derrubada pelo fato posterior de que o cache foi implementado, resultando em benefício líquido próximo de zero ou negativo.

**Local de saída**: a especificação por skill é produzida orientada a dados no fim de P1.5, declarada independentemente na descrição de cada PR da Camada 2 (não entra no documento de design, evitando alterações a cada skill modificada).

**Template de estrutura da especificação por skill** (alinhado com os itens obrigatórios da descrição do PR na §4.2 – as duas listas são a mesma, §4.2 é a perspectiva de processo, esta seção é a perspectiva de especificação):

| Campo                   | Conteúdo                                                                                                                                                              | Fonte de dados               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1. Dados atuais         | invocation_count, followup_rate, top followup tools                                                                                                                   | Telemetria Camada 1          |
| 2. Meta                 | followup_rate de X% para Y%                                                                                                                                          | Baseado na direção de melhoria §0.2; valor absoluto definido no próprio PR |
| 3. Escopo da transformação | inline de quais followups (read/grep/shell read-only), explicitamente o que **não** inlinar (operações write / cross-skill / raciocínio profundo)                   | Tabela de modos de transformação §4.2 |
| 4. Atualização do contrato de saída | pré-declarações adicionadas na descrição da skill (ex.: "Returns: ...")                                                                                       | Exemplo de transformação §3.2 |
| 5. Plano A/B              | Observar followup_rate / RT P50 / métricas de processo por 2 semanas após a transformação, comparar com linha de aceitação §5.1                                      | §5.1                          |
| 6. Prova de tamanho       | Número de tokens da descrição da skill antes e depois (estimado com tiktoken), não exceder "Orçamento de tamanho da skill" da §0.1                                      | §0.1 item 6                  |

### 0.5 Governança da Especificação

- **Modificar §0.1 / §0.3** requer atualização do documento de design + revisão PR; §0.3 segue apenas a "regra de ajustabilidade" da §0.3 para relaxar na janela do fim de P1.5
- **Modificar threshold da §0.2 (após bloqueio P1.5)** requer pelo menos uma das seguintes evidências de dados:
  - (a) Análise de desvio entre resultados da linha de base P1.5 e o threshold bloqueado (com link para registro de medição original)
  - (b) Dados de benchmark público de projetos similares (com link da fonte)
  - (c) Declaração de desvio assinada por ≥ 2 revisores internos

  Se na revisão PR nenhuma das evidências acima estiver presente, o revisor **tem a obrigação** de bloquear o PR – não aceitar ajuste baseado apenas em intuição do engenheiro

- **Especificação por skill §0.4**: após ser produzida orientada a dados, escreva na descrição do PR (conforme template de 6 itens da §0.4), não entra no documento de design

---

## 1. Contexto e Posicionamento

### 1.1 Problema

A linha de base fornecida em `rt-optimization-design.md` §1.2: 3 rodadas de agent loop, 13,4s ponta a ponta, com chamadas LLM representando 78%. Cada rodada ~3-4s.

```
Rodada 1 (3,8s, 28%): LLM decide chamar skill
Rodada 2 (3,0s, 22%): LLM decide chamar shell
Rodada 3 (3,8s, 28%): LLM resume
```

Após duas rodadas de revisão em `rt-optimization-design.md` §6/§7, D2/D4 foram rejeitados, e D1/D3 foram rebaixados para "reavaliar após conclusão dos itens mais fáceis". Mas **todo o documento original focava na rodada final (rodada 3, resumo) ou micro-otimizações dentro de uma única rodada (D4), sem discutir diretamente por que a rodada 1 → rodada 2 (a "rodada intermediária") existe e se pode ser eliminada**.

O fato é: a rodada 2 existe **na grande maioria dos casos porque a skill chamada na rodada 1 não retornou uma resposta completa**, e o modelo adiciona uma consulta shell para complementar. Se a skill for projetada para "obter o resultado completo de uma vez", 3 rodadas → 2 rodadas, economizando os ~3s da rodada 2 – um benefício que não se sobrepõe ao D1.

### 1.2 Relação com rt-optimization-design

| Direção de redução de loops              | Rodada(s) afetada(s)                | Ponto de alavancagem                     | Posicionamento neste documento                          |
| ---------------------------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| D1 `skipLlmRound`                        | Rodada de resumo final              | Mecanismo do framework + opt-in por tool | Plano B, **colocado após Camada 2**                     |
| D2 Roteamento rápido                     | Latência de uma rodada              | Mecanismo do framework                   | Já adiado, **fora do escopo deste documento**           |
| D3 Estado "Summarizing"                  | Rodada de resumo final (camada de percepção) | Máquina de estado UI          | Opcional, ortogonal a este plano                        |
| D4 Pré-validação                         | Latência de uma rodada              | Mecanismo do framework                   | Já adiado, **fora do escopo deste documento**           |
| **Este plano: Camadas 1-3**              | **Rodada de decisão intermediária + rodadas não disparadas por concorrência** | **Design de skill + engenharia de prompt** | **Nova direção**                                        |

### 1.3 Argumento Central

A verdadeira alavanca para redução de loops está no nível de design de skill/tool, não no framework do agent. Três razões:

1. **A linha de base §1.2 já expõe o problema na skill** – o salto da rodada 1 para a rodada 2 ocorre porque a skill não retornou completo; o framework funcionou, a skill errou
2. **A redução de loops em nível de framework também requer opt-in por tool** – o `skipLlmRound` do D1 exige que cada ferramenta seja explicitamente marcada, contornando de volta para engenharia de skill, com custo extra de invariantes + gate de decisão
3. **ROI localmente mensurável, fácil de fazer grayscale** – alterar uma skill economiza uma rodada × frequência de disparo dessa skill, não depende de dados de taxa de acerto de cache nem de alterações cross-system

> **Antes de implementar, deve-se passar pela revisão prévia da Especificação de Aceitação §0 (fase P-1, 0,5d)** – as especificações de engenharia §0.1 e stop-loss §0.3 devem ser bloqueadas antes de começar; a direção dos thresholds estatísticos §0.2 também deve ser confirmada previamente (valores numéricos bloqueados após linha de base P1.5). Pular §0 e entrar diretamente na implementação P0 = seguir o antipadrão de "fazer primeiro, medir depois"; este documento não endossa essa prática.

---

## 2. Princípios de Design

1. **Não modificar o framework do agent** – não mexer nos caminhos principais `useGeminiStream` / `coreToolScheduler` / `geminiChat`
2. **Priorização orientada a dados** – primeiro construir telemetria, deixar os dados dizerem qual skill modificar, não por adivinhação
3. **Por skill: mensurável e passível de grayscale** – cada transformação de skill é A/B independente, falha localizada reverte
4. **Priorizar juros compostos** – benefício = ganho por redução de rodada × frequência de disparo; skills de alta frequência primeiro
5. **Não atrelado ao D1** – o sucesso deste plano não depende da implementação do D1

---

## 3. Plano em Três Camadas

### 3.1 Camada 1: Telemetria para Redução de Loops (Encontrar Mina de Ouro)

**Objetivo**: Deixar os dados dizerem quais skills valem mais a pena modificar – ou seja, "depois de usar esta skill, qual a probabilidade de o modelo adicionar mais uma chamada de ferramenta?".

**Campos principais** (por turno, por invocação de skill):

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // relaciona todos os eventos dentro de um mesmo prompt de usuário
  turn_index: number; // número da rodada em que a skill foi chamada no loop
  followup_tool_names: string[]; // ferramentas chamadas após a skill, dentro do mesmo prompt_id
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // após a skill, a próxima rodada produz texto (sem chamar ferramentas)
  user_followup_within_30s: boolean; // usuário adicionou novo prompt em 30s após o resultado (sinal de regressão de qualidade)
}
```

**Métricas chave**:

- `skill_followup_rate = soma(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = soma(next_turn_is_terminal) / total_invocations`
- Agregar por `(skill_name, top followup tool)` – ver qual ferramenta é mais frequentemente adicionada após cada skill

**Critério de "mina de ouro"**:

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
Esta skill é mina de ouro para redução de loops, priorizar transformação Camada 2
```

Threshold sugerido: os top-3 skills ordenados pela fórmula acima; modificar os 2 primeiros.

### 3.2 Camada 2: Completude da Saída da Skill

**Objetivo**: Fazer com que a skill identificada como mina de ouro retorne uma resposta completa de uma só vez, eliminando o salto da rodada 1 para a rodada 2.

**Modo de transformação (classificado por tipo de followup)**:

| Padrão de Followup                  | Cenário Típico                        | Direção de Transformação                     |
| ----------------------------------- | ------------------------------------- | -------------------------------------------- |
| skill → `read_file`                 | skill dá caminho, modelo lê           | skill lê internamente, retorna conteúdo      |
| skill → `grep/glob`                 | skill dá diretório, modelo procura    | skill busca internamente, retorna matches    |
| skill → `shell` (read-only)         | skill dá comando, modelo executa      | skill executa comando internamente, retorna saída |
| skill → `shell` (write)             | skill dá plano, modelo executa escrita | **Manter** (operação write precisa confirmação, não deve ser mesclada) |
| skill → outra skill                 | chamada em cadeia                     | **Não mesclar** (manter composicionalidade)   |

**Checklist de transformação (template de PR por skill)**:

1. Na descrição da skill, **declarar contrato de saída previamente**: escrever explicitamente "Returns: full file content / matched lines / command output", para que o modelo saiba que não precisa consultar adicionalmente
2. Dentro da skill, **realizar todos os followups read-only**: operações read/search que a telemetria mostra taxa de followup >50% devem ser inline na própria skill
3. **Não inlinar operações write**: operações write precisam de confirmação do usuário, devem ficar em rodada separada
4. **Não inlinar followups de raciocínio profundo**: se o followup é "analise isso com base nisso", é trabalho do modelo, não da skill
5. **Anexar telemetria A/B**: comparar `followup_rate` 2 semanas após transformação, se reduziu para <20%

**Exemplo típico de transformação (ilustrativo)**:

Antes:

```
skill "list-workspaces" returns: ["ws_a", "ws_b"]
→ Rodada 2: modelo chama shell para obter detalhes de cada workspace
```

Depois:

```
skill "list-workspaces" returns:
  - ws_a (owner: foo, last_active: 2026-05-20, status: active)
  - ws_b (owner: bar, last_active: 2026-05-01, status: archived)
description updated: "Returns workspaces with owner, last_active, status"
→ Rodada 2 desaparece para ~80% das consultas
```

### 3.3 Camada 3: Educar o Modelo via Prompt para Concorrência

**Objetivo**: Para ferramentas independentes (ler vários arquivos, pesquisar em vários diretórios), fazer o modelo emitir tool_calls concorrentes na mesma rodada, comprimindo N rodadas em 1.

**Pré-requisito**: Infraestrutura já pronta – `CONCURRENCY_SAFE_KINDS` em `tools/tools.ts:818` + `partitionToolCalls` do `coreToolScheduler` já conseguem executar concorrentemente ferramentas read/search/fetch dentro do mesmo batch. **Falta apenas a vontade do modelo de iniciar tool_calls concorrentes**; o qwen-coder tende a ser serial.

**Local da alteração**: `packages/core/src/core/prompts.ts` (já auditado; adicionar perto da seção `# Final Reminder` L396 não quebra nada além do cache – apenas custo único de aquecimento).

**Texto guia (ilustrativo, requer otimização A/B)**:

```
When you need to call multiple independent read-only tools (read_file,
grep, glob, web_fetch), emit them in a SINGLE tool_calls batch – do NOT
call them sequentially across rounds. They will execute concurrently.

Examples:
- Reading 3 files for comparison: emit 3 read_file calls in one batch
- Searching for 2 patterns: emit 2 grep calls in one batch

Do NOT batch when the second call depends on the first call's result.
```

**Métrica de eficácia**: Novo campo de telemetria `batch_size` (número de tool_calls no mesmo turno) – comparar distribuição antes e depois da alteração do prompt.

#### 3.3.1 Expandir `CONCURRENCY_SAFE_KINDS` (Subitem da Camada 3)

Educar o modelo via prompt é apenas o lado da oferta (modelo disposto a emitir vários tool_calls de uma vez), mas `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` em `tools/tools.ts:818` determina o **escopo real de ferramentas que podem ser executadas concorrentemente**: `partitionToolCalls` (`coreToolScheduler.ts:775`) empacota "ferramentas seguras consecutivas" em um batch concorrente; as demais são executadas serialmente.

Se o modelo, seguindo a orientação, emitir 3 tool_calls de uma vez, mas um deles for do tipo `Kind.Execute` e não estiver no conjunto seguro, todo o batch será desmembrado para execução serial – o ganho da alteração do prompt da Camada 3 será neutralizado pelo runtime.

**Candidatos a expansão (em ordem crescente de risco)**:

- `Kind.Think` (inclui save_memory / todo_write) – **Não adicionar**, tem escrita implícita
- Shell somente leitura (`isShellCommandReadOnly()` retorna true para Execute) – `partitionToolCalls` já tem tratamento especial (comentário em `coreToolScheduler.ts`: "Execute (shell) is safe only when isShellCommandReadOnly() returns true"), já coberto, sem necessidade de alterar `CONCURRENCY_SAFE_KINDS`
- Ferramentas MCP por `Kind` – comportamento varia entre servidores MCP; seria necessário opt-in explícito no registro da ferramenta para ser seguro

**Conclusão**: O conjunto atual já é razoável; **a Camada 3 não depende da expansão de `CONCURRENCY_SAFE_KINDS`**. Esta subseção existe para: após coletar dados de telemetria `batch_size`, **se for descoberto que "concorrência batch P50 < esperado", primeiro verificar se está sendo cortado pelo `partitionToolCalls` em vez de o modelo não ser concorrente**. É um caminho de diagnóstico para falha A/B da Camada 3, não uma tarefa obrigatória.

> Crédito: revisão codex sugeriu que "expandir `CONCURRENCY_SAFE_KINDS` é uma alavanca ignorada". Após verificação, julgou-se que: o tratamento especial `isShellCommandReadOnly` já cobre o maior volume; expandir o conjunto traz pouco benefício e alto risco; mantido como caminho de diagnóstico.

---

## 4. Implementação Detalhada

### 4.1 Camada 1: Extensão de Telemetria (1-2d)

#### 4.1.1 Adicionar `prompt_id` ao `SkillLaunchEvent`

**Local**: `packages/core/src/telemetry/types.ts:896`

Atualmente `SkillLaunchEvent` contém apenas `skill_name` + `success`, **sem `prompt_id`** – impossível de associar a outros `ToolCallEvent` no mesmo turno.

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // Novo
  turn_index?: number;                  // Novo

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // Novo
    turn_index?: number,                // Novo
  ) { ... }
}
```

**Atualização dos chamadores**: Os 4 pontos de chamada `logSkillLaunch` em `packages/core/src/tools/skill.ts` (L386, L399, L426, L482) – `this.params` não possui `prompt_id`; `BaseToolInvocation` contém apenas `params`, não tem campo `request.prompt_id`. **Implementação real**: injetar via duck typing: `SkillToolInvocation` expõe setter `setPromptId(id)` + campo privado `promptId`; `CoreToolScheduler.buildInvocation` (`coreToolScheduler.ts:1253`) chama duck-type `setPromptId(request.prompt_id)` após build, alinhando com o padrão existente do hook `setCallId`; os 4 `logSkillLaunch` dentro de `execute()` passam `this.promptId`. **A descrição anterior desta seção ("BaseToolInvocation já tem request.prompt_id") estava errada**, corrigida após revisão do PR #4565.

#### 4.1.1b Correção da Cadeia do qwen-logger (Pré-requisito)

Antes de adicionar `prompt_id`, resolver um **ponto de interrupção existente na cadeia**: `packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` define o método `logSkillLaunchEvent(event)`, mas **não há nenhum chamador em todo o repositório** – `loggers.ts:958` `logSkillLaunch` vai diretamente pelo caminho OTLP `logs.getLogger(SERVICE_NAME).emit()`, ignorando o qwen-logger.

Consequências:

- Eventos skill_launch no caminho OTLP chegam ao collector OTLP (já funciona), mas a cadeia de relatório dedicada do qwen-logger está morta
- Se o backend de telemetria consome do qwen-logger (não do OTLP), eventos skill_launch **não são relatados**
- O SQL offline §4.1.2 para derivar `SkillFollowupRecord` depende dos eventos skill_launch no banco – **é necessário verificar primeiro se skill_launch está visível no backend atualmente**

Duas direções de correção:

- **A** (recomendado): Adicionar uma linha `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)` em `loggers.ts:958` `logSkillLaunch`, alinhando com a escrita de `logToolCall` em `loggers.ts:230`
- **B** Confirmar que o backend consome apenas OTLP e marcar `logSkillLaunchEvent` no qwen-logger como `@deprecated` ou removê-lo

**Por que adicionar apenas o caminho QwenLogger, sem alinhar com os 4 caminhos completos de `logToolCall`**:

`logToolCall` (`loggers.ts:220-247`) tem na verdade 4 saídas:

1. `uiTelemetryService.addEvent(...)` – exibição UI
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` – histórico de chat
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` – telemetria backend qwen-logger
4. OTLP `logger.emit(...)` – OpenTelemetry

skill_launch é **um evento puro de telemetria backend**, não precisa ser exibido na UI (o usuário já vê o returnDisplay do SkillTool) nem entrar no histórico de turnos do ChatRecording (as chamadas de ferramentas internas à skill já são registradas individualmente por recordUiTelemetryEvent). Portanto, adicionar apenas o caminho 3 (QwenLogger), mantendo o caminho 4 (OTLP), e ignorar os caminhos 1/2 é intencional, não uma omissão.

**Detalhe de transmissão de campos**: `loggers.ts:961-966` usa spread `{ ...event }` para transmitir automaticamente novos campos (após adicionar `prompt_id` ao `SkillLaunchEvent`, esse caminho funciona automaticamente), mas `logSkillLaunchEvent` em `qwen-logger.ts:908` internamente, se destruturar `event.skill_name` / `event.success` explicitamente, novos campos não serão incluídos automaticamente – é necessário sincronização manual.

Esforço: caminho A ~0,5d (incluindo confirmação no backend); caminho B ~0,2d (remover código + documentação).

#### 4.1.2 Derivar `SkillFollowupRecord` (Agregação Offline)

Nenhum novo tipo de evento necessário – `ToolCallEvent` e `SkillLaunchEvent` já possuem `prompt_id`, basta SQL offline:

```sql
-- SQL pseudo, ajustar conforme backend de telemetria real
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

#### 4.1.3 Rodar Telemetria por 1 Semana para Coletar Dados

- Nenhuma alteração no comportamento visível ao usuário
- Nenhuma chave de configuração necessária – telemetria já possui framework opt-in (configuração `telemetry.target`)
- Após 1 semana, produzir relatório de ranking de skills

### 4.2 Camada 2: Transformação de Skills (0,5-1d por skill)

Transformar do topo para baixo com base nos dados da Camada 1. Cada skill em um PR independente; a descrição do PR deve conter:

1. **Dados**: invocation_count atual, followup_rate, top followup tools
2. **Escopo da transformação**: quais followups foram inline (explicitamente o que não foi inline)
3. **Atualização do contrato de saída**: quais pré-declarações foram adicionadas na descrição da skill
4. **Plano A/B**: observar followup_rate por 2 semanas após transformação

**Observações**:

- Ao inlinar operações read na skill, não reimplementar todo o tratamento de casos de fronteira do `read_file` (encoding, detecção binária, etc.) – chamar a própria ferramenta `read_file`, não reescrever
- O mesmo para grep/glob inline
- Comandos shell inline na skill devem passar pelo caminho padrão `executeToolCall` (preservar telemetria)
- **Não deixar o tamanho da skill explodir**: se a descrição da skill após inline de followup ultrapassar 500 tokens, dividir a skill em vez de mesclar

### 4.3 Camada 3: Educação via Prompt (0,5d de alteração + otimização com medição)

#### 4.3.1 Adicionar Orientação de Concorrência

**Local**: `packages/core/src/core/prompts.ts` seção `# Final Reminder` (L396)

Adicionar o texto guia da seção 3.3. A redação exata requer A/B – começar com a versão mais simples e refinar com base no aumento da taxa de concorrência.

#### 4.3.2 Adicionar Telemetria `batch_size`

**Local**: `ToolCallEvent` em `packages/core/src/telemetry/types.ts` ou novo evento leve `ToolBatchEvent`

```typescript
// Opção A: Adicionar campos no ToolCallEvent (menos intrusivo)
export class ToolCallEvent {
  ...
  batch_size?: number;        // número de tool_calls no mesmo batch
  batch_position?: number;    // posição dentro do batch (0-indexed)
}

// Opção B: Novo ToolBatchEvent (semântica mais clara, mas requer fluxo completo de novo tipo de evento)
```

**Recomendação: Opção A** – alteração pequena, fácil de agregar em consultas.

**Caminho de transmissão de estado (crítico – esta etapa foi subestimada na versão anterior)**:

`partitionToolCalls(callsToExecute)` em `coreToolScheduler.ts:2456` retorna `batches`, **mas a informação de batch se perde imediatamente no caminho de escalonamento**:

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

O construtor de `ToolCallEvent` (`types.ts:189`) recebe apenas um único `CompletedToolCall`, sem campos de batch.

Direções de correção:

- **Direção A** (recomendado): Adicionar `batchSize?: number` + `batchPosition?: number` em `ScheduledToolCall`. Preencher nas duas ramificações:
  - Ramificação concorrente (`coreToolScheduler.ts:2459-2460`, `batch.calls.length > 1`): antes de `runConcurrently(batch.calls, ...)`, escrever `batchSize = batch.calls.length`, `batchPosition = i` em cada `call`
  - Ramificação serial (`L2462-2464`, `for (const call of batch.calls)`): para batch de ferramenta única, definir explicitamente `batchSize = 1`, `batchPosition = 0` (**não deixar como undefined**, caso contrário a agregação de telemetria downstream pode interpretar rodadas sem concorrência como dados ausentes)

  `new ToolCallEvent(call)` no construtor lê esses dois campos de `call`

- **Direção B**: Alterar assinatura do construtor de `ToolCallEvent` para `new ToolCallEvent(call, batchInfo?)`, sincronizar todos os chamadores (4 pontos de chamada `logToolCall` + testes). Alteração maior que a A

Esforço: direção A ~0.5d incluindo testes unitários; direção B ~1d (mais chamadores).

**Medir simultaneamente a "vontade de concorrência do modelo"** – antes e depois da alteração do prompts.ts na Camada 3, comparar a distribuição da `proporção de tool_calls com batch_size > 1`. Essa é a métrica chave para saber se a Camada 3 é eficaz; sem ela, o A/B da Camada 3 não pode ser finalizado.

#### 4.3.3 Avaliação de Impacto no Cache

A alteração no `prompts.ts` fará com que o cache efêmero do DashScope seja invalidado uma vez (primeira requisição cache miss, depois recupera). Este é um custo único conhecido, consulte `rt-optimization-design.md` §7.8 sobre auditoria de estabilidade de prompt.

---

## 5. Aceitação e Medição

> **Esta seção complementa a Especificação de Aceitação §0 com "metodologia"** – §0 declara "métricas de sucesso + thresholds prévios/posteriores", §5 explica "como medir, SQL, design A/B". Os thresholds nesta seção são os valores provisórios atuais da §0.2; os valores finais serão bloqueados após a medição da linha de base P1.5.

### 5.1 Métricas A/B por Skill (2 semanas após transformação)

| Métrica                                                               | Linha de Aceitação                  | Observações                                           |
| --------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `followup_rate` da skill                                              | < 20% (se antes era 70%+)           | Métrica principal                                     |
| RT P50 ponta a ponta do cenário que dispara a skill                   | Redução ≥ 2s                        | Devido a uma chamada LLM a menos                      |
| Taxa de `user_followup_within_30s` da skill                           | Não aumentar                        | Usuário não perguntou mais = resposta completa         |
| Taxa de `success` da skill                                            | Não diminuir                        | Inline de followup não introduziu novas falhas        |
```

**Nota:** O conteúdo foi traduzido para português brasileiro, mantendo a estrutura Markdown, código inline, blocos de código, tabelas e termos técnicos em inglês quando apropriado (ex.: `followup_rate`, `prompt_id`, `skill`, `tool`, `batch_size`). As traduções seguem o estilo de documentação técnica para desenvolvedores.
### 5.2 Métricas gerais de RT

| Métrica                                        | Linha de base                                          | Meta após Layer 2 alterar top-3 skills          |
| ---------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| RT P50 ponta a ponta (sessões com skill)       | 13.4s (amostragem única) / a complementar ≥3 cenários base | Reduzir 2-3s                                    |
| Tamanho P50 do batch de ferramentas (Layer 3)  | A medir                                                | ≥ 1,3 (>30% das chamadas envolvem batch concorrente) |
| Taxa de followup total do skill (média ponderada) | A medir                                                | Reduzir ≥ 30%                                   |

### 5.3 Sinais de falha – quando abandonar essa direção

**Linhas de parada para métricas de resultado**:

- Após os dados da Layer 1, se a **taxa de followup ponderada dos top-5 skills < 30%** → o espaço para redução de rodadas é pequeno, não vale continuar para Layer 2
- Após alterar 2 skills na Layer 2, se a **redução do RT P50 ponta a ponta for < 1s** → a direção da alteração está errada (talvez o followup seja uma operação de escrita que não deveria ser mesclada), pare e reavalie
- Se após 2 semanas de alteração de prompt na Layer 3, **batch_size P50 ainda = 1** → o modelo não aceitou a orientação de concorrência, abandone Layer 3, mantenha apenas Layer 1+2

**Linhas de parada para métricas de processo (alerta preventivo, evita que a abordagem "pareça estar acontecendo mas não traga retorno")**:

- **Queda na taxa de acerto do skill (skill pretendido vs skill selecionado) ≥ 5 pp** → a descrição do skill foi alterada de forma errada, fazendo o modelo escolher o skill errado. Cenário típico: antes da alteração, usuário perguntava X e sempre acertava skill_a; depois da alteração, ocasionalmente é roteado para skill_b sem gerar erro (o modelo usou o skill errado, mas deu um jeito de montar uma resposta), as métricas de resultado parecem normais, mas a taxa de followup aumenta. **Método de medição**: adicionar em telemetry `skill_invocation_pattern` – agrupar pelos primeiros N keywords do user prompt, ver qual skill cada cluster aciona principalmente; comparar antes e depois da alteração o deslocamento do top 1
- **Taxa de falha no followup inline do skill ≥ 5%** → a alteração do skill introduziu um modo de falha que não existia antes (ex.: inline `read_file` processando arquivo grande estourando memória). Medição: comparar `SkillLaunchEvent.success` antes e depois da alteração
- **Aumento na taxa de cancelamento do usuário por skill (Ctrl+C) ≥ 2 pp** → a saída do skill ficou mais lenta ou mais longa, fazendo o usuário perder a paciência. Medição: proporção de `ToolCallEvent.status === 'cancelled'`

---

## 6. Conexão com D1/D3

### 6.1 Relação com D1

Depois que a Layer 2 alterar os top skills, os **skills restantes com muito followup é que são o verdadeiro cenário de aplicação do `skipLlmRound` do D1** – aqueles skills cuja saída já está completa (não precisa da Round 2) e são de fato consultas de estado final (a Round 3 de resumo também é desperdício).

Ordem de execução:

1. Layer 1 telemetry entra no ar → 1 semana de dados
2. Layer 2 altera top 2-3 skills → A/B por 2 semanas
3. Layer 3 prompt com concorrência → teste real por 1 semana
4. **Só então** avaliar D1: dos skills frequentes restantes, quantos são do tipo "saída completa + consulta de estado final" → vale a pena uma alteração de framework de 2-3d?

### 6.2 Relação com D3

D3 (`StreamingState.Summarizing`) é uma otimização da camada de percepção, totalmente ortogonal a esta proposta. Layer 1-3 reduzem o **número real de rodadas**, D3 reduz o **tempo de espera percebido pelo usuário**. Se a Layer 2 já reduzir o RT a um nível aceitável para o usuário, o valor do D3 diminui; caso contrário, D3 pode ser sobreposto.

---

## 7. Limitações e Riscos Conhecidos

1. **A cobertura é limitada pelo escopo da alteração** – alterar 10 skills cobre apenas os cenários desses 10 skills. Mas o retorno é mensurável e com juros compostos
2. **O followup inline do skill pode tornar um único skill mais pesado** – descrição inflada, carregamento mais lento, reutilização reduzida. A defesa está no item 5 da checklist da Layer 2
3. **O modelo da Layer 3 pode não seguir a orientação de concorrência** – qwen-coder tem dados de treino mais sequenciais; os dados A/B podem mostrar que a alteração de prompt é ineficaz, como modo de falha conhecido
4. **Limites de privacidade na telemetry** – `SkillFollowupRecord` não deve registrar parâmetros de ferramentas (já obtém de `ToolCallEvent.function_args` por padrão, mas precisa auditar se `skill_name` vaza a intenção do usuário)
5. **Não se aplica a sub-agentes / cron / notificações** – esses caminhos não passam pelo sistema de skills, esta proposta não os cobre
6. **Linha de base de dados insuficiente** – herda a amostragem única da `rt-optimization-design.md` §1.2; antes da Layer 2, é necessário complementar com ≥3 cenários base
7. **A extensão de campos `logSkillLaunch` quebrará consumidores existentes de telemetry** – os 4 pontos de chamada + loggers downstream precisam ser alterados em sincronia
8. **`qwen-logger.ts:908` `logSkillLaunchEvent` é atualmente código morto** – nenhum chamador no repositório, a correção prévia está listada em §4.1.1b

### 7.1 Limite com mecanismos existentes do framework (fora do escopo desta proposta)

O repositório já possui alguns mecanismos de framework indiretamente relacionados à redução de rodadas. **Esta proposta não reinventa nem substitui**:

| Mecanismo existente                                        | Localização                                  | Relação com esta proposta                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently` (execução concorrente) | `coreToolScheduler.ts:775, 2473`             | Layer 3 reutiliza diretamente; esta proposta não o altera                                                                                |
| `CONCURRENCY_SAFE_KINDS` (define quais ferramentas podem ser concorrentes) | `tools/tools.ts:818`                         | §3.3.1 já demonstrou que a situação atual é razoável, não será expandido                                                                |
| `FileReadCache` (evita ler o mesmo arquivo repetidamente)  | `services/fileReadCache.ts`                  | Afeta indiretamente as rodadas de "modelo lendo o mesmo arquivo de novo"; já está em vigor; esta proposta não depende nem o reforça      |
| `chatCompressionService` (compressão de histórico)         | `services/chatCompressionService.ts`         | Ortogonal às rodadas (afeta o custo por rodada, não o número de rodadas); é o mesmo componente que o gate `wouldTriggerCompression` da rota rápida de `rt-optimization-design.md` §3.2 |

Listar esses mecanismos evita que esta proposta seja interpretada como ignorando os existentes.

---

## 8. Cronograma de Implementação

> **Pré-requisito: Este cronograma começa em P-1 e não pode ser pulado.** P-1 é a revisão prévia da especificação de §0, com 0,5d de trabalho, mas **obrigatória** – se não for aprovada, não se avança para P0. Essa restrição visa evitar o antipadrão de "escrever código primeiro e depois complementar a especificação": especificação postergada equivale a adiar o julgamento de "sucesso" até depois dos resultados, o que facilmente leva a ajustar a especificação para fazer os indicadores parecerem bons (veja o precedente da rota D2 de `rt-optimization-design.md` §7).

| Fase     | Conteúdo                                                                 | Esforço                 | Entregável                          | Ação de congelamento da spec                              |
| -------- | ------------------------------------------------------------------------ | ----------------------- | ----------------------------------- | --------------------------------------------------------- |
| **P-1**  | Revisão prévia da spec                                                   | 0,5d                    | §0.1 / §0.3 congelados              | **Congelar §0.1 (spec de engenharia) + §0.3 (linhas de parada)** |
| **P0**   | Correção da cadeia qwen-logger (pré-requisito §4.1.1b)                   | 0,5d                    | Visibilidade do evento skill_launch confirmada | Validar §0.1 item 1                              |
| **P1**   | Layer 1 telemetry: adicionar campo `prompt_id` + SQL offline             | 1-2d                    | Relatório de ranking de skills       | Validar §0.1 itens 2/3/4                                    |
| **P1.5** | Coleta de dados por 1 semana + medição de base (≥3 cenários × ≥10 vezes) | 1w                      | Decidir quais 2-3 skills alterar     | **Congelar §0.2 thresholds + validar §0.1 item 5**          |
| **P2**   | Layer 2 alterar top-1 skill (PR + A/B)                                   | 0,5-1d alteração + 2w observação | Verificar redução de followup_rate e RT P50 | **Declarar §0.4 per-skill spec dentro do PR**              |
| **P3**   | Layer 3 prompt com orientação de concorrência + telemetry `batch_size` (incluindo passagem de estado §4.3.2) | 1-1,5d alteração + 1w teste real | Distribuição de batch_size          | Validar §0.2 item 3                                        |
| **P4**   | Layer 2 continua alterando top-2 / top-3 skills (paralelo a P3)          | 0,5-1d × N             | Redução acumulada de RT P50          | Declarar §0.4 em cada PR                                    |
| **P5**   | Avaliar se D1 ainda tem valor                                           | Reunião de decisão      | Atualização do roadmap               | —                                                         |

**Pontos-chave de decisão (conforme linhas de parada de §0.3)**:

- **Fim de P-1**: Se qualquer item de §0.1 / §0.3 não obtiver consenso → não entrar em P0
- **Fim de P1.5**: Se acionar a linha de parada de métrica de resultado §0.3 #1 (taxa de followup ponderada dos top-5 < 30%) → encerrar a direção; caso contrário, congelar §0.2 thresholds
- **Fim de P2**: Se acionar a linha de parada §0.3 #2 (RT P50 após alteração do top-1 ↓ < 1s) ou qualquer métrica de processo → parar e reavaliar
- **Fim de P3**: Se acionar a linha de parada §0.3 #3 (batch_size P50 ainda = 1) → abandonar Layer 3
- **P5**: Decidir ROI do D1 com base na forma dos skills restantes

---

## 9. Localizações-chave no Código

| Arquivo                                                   | Símbolo-chave                                                    | Localização                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `packages/core/src/telemetry/types.ts`                     | `ToolCallEvent` (com `prompt_id` / `duration_ms`)                | L170                                 |
| `packages/core/src/telemetry/types.ts`                     | `SkillLaunchEvent` (precisa adicionar `prompt_id`)               | L896                                 |
| `packages/core/src/telemetry/loggers.ts`                   | `logToolCall`                                                    | L220                                 |
| `packages/core/src/telemetry/loggers.ts`                   | `logSkillLaunch` (via OTLP; falta encaminhamento do qwen-logger) | L958                                 |
| `packages/core/src/telemetry/loggers.ts`                   | `logToolCall` (duplo caminho: OTLP + qwen-logger, como modelo de correção) | L220, L230                   |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`   | `logSkillLaunchEvent` (**atualmente código morto**, alvo de correção prévia §4.1.1b) | L908                               |
| `packages/core/src/core/coreToolScheduler.ts`              | `partitionToolCalls`                                             | L775                                 |
| `packages/core/src/core/coreToolScheduler.ts`              | `runConcurrently` / escalonamento de batch                       | L2456, L2473                         |
| `packages/core/src/core/coreToolScheduler.ts`              | Ponto de chamada `logToolCall` (ponto final de passagem de estado batch_size) | L3163                              |
| `packages/core/src/services/fileReadCache.ts`              | `FileReadCache` (existente, afeta rodadas de leitura repetida)   | L135                                 |
| `packages/core/src/tools/skill.ts`                         | `SkillTool` + 4 pontos de chamada `logSkillLaunch`               | L386, L399, L426, L482               |
| `packages/core/src/skills/skill-manager.ts`                | `SkillManager` (registro/carregamento de skills)                 | Arquivo inteiro                      |
| `packages/core/src/skills/skill-load.ts`                   | Carregamento de descrição de skill (ponto de entrada para alteração de contrato de saída) | Arquivo inteiro                      |
| `packages/core/src/tools/tools.ts`                         | `Kind` + `CONCURRENCY_SAFE_KINDS`                                | L793, L818                           |
| `packages/core/src/core/coreToolScheduler.ts`              | `partitionToolCalls` + `runConcurrently` (infraestrutura de concorrência existente) | Ver rt-optimization-design.md §5.7 |
| `packages/core/src/core/prompts.ts`                        | Seção `# Final Reminder` (local para adicionar orientação de concorrência na Layer 3) | L396                               |
| `.qwen/skills/`                                            | Diretório de definição de cada skill (objeto de alteração da Layer 2) | Diretório                             |