# AutoSkill: Sistema de Extração Automática de Habilidades — Documento de Design

## Visão Geral

Este documento descreve o design para adicionar a capacidade **AutoSkill** à arquitetura Memory-Dream existente do QwenCode.

AutoSkill é um **mecanismo de extração automática de memória procedural**: quando um agente conclui uma tarefa intensiva em chamadas de ferramenta, o sistema avalia silenciosamente em segundo plano se existem fluxos de operação reutilizáveis na conversa atual e os salva automaticamente como uma skill de projeto.

### Diferenças de Posicionamento em Relação ao Memory Extract

| Dimensão              | Memory Extract                             | AutoSkill                                                      |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| **Tipo de memória**   | Memória declarativa (quem é o usuário, contexto do projeto) | Memória procedural (como fazer determinado tipo de tarefa)     |
| **Momento de gatilho** | Após cada sessão                           | Quando o número de chamadas de ferramenta na sessão atinge um limite |
| **Destino de escrita** | `${projectRoot}/.qwen/memory/`             | `${projectRoot}/.qwen/skills/`                                 |
| **Natureza do conteúdo** | Preferências do usuário, contexto do projeto, regras de feedback | Etapas operacionais reutilizáveis, melhores práticas           |
| **Ciclo de vida**     | Integração/poda periódica pelo Dream       | Atualização conforme necessário, mantida pelo agente de revisão |

---

## Princípios Centrais de Design

1. **Sem ferramenta dedicada de escrita**: O agente de revisão de skills usa diretamente as ferramentas genéricas `read_file`, `write_file` e `edit` para operar em `.qwen/skills/`, sem introduzir uma ferramenta dedicada `skill_manage`. O mesmo vale para a sessão principal — se o usuário quiser manter skills manualmente, também usa as mesmas ferramentas genéricas.
2. **Detecção de alterações em skills em vez de reset do contador de ferramentas**: Seguindo o padrão do Memory Extract que detecta chamadas de `memory_tool`, o sistema detecta se houve alguma operação de escrita no diretório `.qwen/skills/` durante a sessão principal. Se sim, significa que o usuário já manipulou skills ativamente nesta rodada, e ao final da sessão a revisão automática de skills é pulada.
3. **Identificador `auto-skill` protege skills criadas pelo usuário**: Skills criadas pelo agente de revisão DEVEM conter a tag `source: auto-skill` no frontmatter YAML. O agente de revisão só pode modificar skills que possuam essa tag, não podendo tocar em skills criadas manualmente pelo usuário.
4. **Gatilho por densidade de chamadas de ferramenta**: Só é acionado quando o total de chamadas de ferramenta na sessão atual for ≥ 20, garantindo que a extração ocorra apenas após tarefas realmente complexas.
5. **Limites de escrita claramente definidos**: O gerenciador de permissões do agente de revisão restringe `write_file` e `edit` a `${projectRoot}/.qwen/skills/`, não podendo tocar nas camadas user / extension / bundled.
6. **Máximo reaproveitamento do prompt principal do Hermes**: O prompt usado pelo agente de revisão é copiado diretamente do `_SKILL_REVIEW_PROMPT` do Hermes, com apenas adaptações mínimas.

---

## Mudanças na Arquitetura

### 1. Contadores: `toolCallCount` e Detecção de Alterações em Skills

Dois rastreadores paralelos são mantidos no estado da sessão:

**Contador de chamadas de ferramenta** (determina se deve acionar a revisão de skills):

```
Início da sessão
  toolCallCount = 0

Após cada chamada de ferramenta concluída
  toolCallCount += 1

Fim da sessão
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // padrão 20
    verificar skillsModifiedInSession
    ├─ true  → skip (já houve manipulação manual de skills nesta rodada, sem revisão automática)
    └─ false → scheduleSkillReview()
```

**Detecção de alterações em skills** (substitui o reset anterior baseado em chamada de `skill_manage`):

```
Após cada chamada de ferramenta concluída
  if (o caminho alvo da chamada de ferramenta estiver sob ${projectRoot}/.qwen/skills/):
    skillsModifiedInSession = true
```

Lógica de detecção: escaneia os caminhos de arquivo envolvidos nos resultados das chamadas de ferramenta, verificando se estão sob o diretório de skills. Implementação específica segue o padrão de `historyCallsSkillManage()` — itera sobre os resultados das ferramentas no `history`, extrai caminhos alvo de operações de escrita (`write_file`, `edit`, etc.) e faz correspondência por prefixo.

> **Por que usar detecção de alterações em skills em vez de detecção pelo nome da ferramenta?**
> Não existe mais uma ferramenta dedicada `skill_manage`; tanto a sessão principal quanto o agente de revisão usam `write_file`/`edit` genéricos. Portanto, a dimensão de detecção muda de "se uma ferramenta específica foi chamada" para "se houve operação de escrita no diretório `.qwen/skills/`", sendo semanticamente mais precisa: se o usuário já modificou arquivos de skill nesta rodada, pula a revisão automática.

> **Por que usar o número de chamadas de ferramenta em vez de rodadas de conversa?**
> O número de chamadas de ferramenta reflete a complexidade da tarefa — uma única mensagem do usuário pode disparar 1 ou 30 chamadas de ferramenta. Alta densidade de ferramentas indica mais tentativa e erro, ajuste de estratégia, etc., aumentando a probabilidade de gerar experiência reutilizável. O limite de 20 é mais conservador que os 10 do Hermes, porque a granularidade das chamadas de ferramenta no QwenCode costuma ser mais fina (ex.: edição linha por linha).

### 2. Ponto de Agendamento

O ponto de chamada existente do `MemoryManager` (fim da sessão) serve como ponto de entrada unificado, estendido para também agendar a revisão de skills.

```
Fim da sessão
  ├─ scheduleExtract(params)           // lógica existente, inalterada
  └─ scheduleSkillReview(params)       // novo
       Condição: toolCallCount >= AUTO_SKILL_THRESHOLD
             && !skillsModifiedInSession
```

Extract e revisão de skills são agendados independentemente, executados em paralelo via `MemoryManager.track()`, sem bloqueio mútuo.

### 3. Permissões de Acesso a Ferramentas do Agente de Revisão de Skills

O agente de revisão de skills **não usa** a ferramenta dedicada `skill_manage`, mas sim as ferramentas genéricas de arquivo:

| Ferramenta    | Uso                                              | Limitação de Escopo                                                                 |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `read_file`   | Ler conteúdo de skill existente, verificar frontmatter | Sem restrições                                                                      |
| `ls`          | Escanear estrutura do diretório `.qwen/skills/`  | Sem restrições                                                                      |
| `write_file`  | Criar novo arquivo de skill                      | Apenas dentro de `${projectRoot}/.qwen/skills/`                                     |
| `edit`        | Modificar conteúdo de skill existente            | Apenas dentro de `${projectRoot}/.qwen/skills/`, e o arquivo alvo deve conter `source: auto-skill` |
| `shell`       | Comandos somente leitura (ex.: `cat`, `find`)    | Apenas comandos somente leitura (análise estática AST do shell)                      |

**Restrição adicional ao `edit` (proteção `auto-skill`)**:

Antes de executar `edit` ou `write_file` (sobrescrita de arquivo existente), o gerenciador de permissões do agente de revisão lê o frontmatter YAML do arquivo alvo e verifica o campo `source: auto-skill`. Se o campo não existir, a escrita é recusada e um erro é retornado:

```
agente_de_revisao: edit só é permitido em skills com 'source: auto-skill' no frontmatter.
Esta skill parece ter sido criada pelo usuário. Modifique-a manualmente ou pergunte ao usuário.
```

Essa verificação é implementada na camada de permissões do `createSkillScopedAgentConfig`, não apenas no system prompt, garantindo que mesmo se o modelo errar, skills escritas manualmente pelo usuário não serão sobrescritas.

**Acesso a ferramentas na sessão principal**: O agente principal não restringe leitura/escrita em `.qwen/skills/` — o usuário pode gerenciar skills através de comandos normais `write_file`/`edit`. Tais operações disparam `skillsModifiedInSession = true`, fazendo com que a revisão automática de skills seja pulada ao final da sessão.

### 4. Sandbox de Permissões: `SkillScopedPermissionManager`

Seguindo o padrão de `createMemoryScopedAgentConfig` em `extractionAgentPlanner.ts`, é criado um escopo de permissões dedicado para o agente de revisão de skills:

```typescript
// Operações permitidas para o agente de revisão de skills
read_file:    sem restrição de caminho (precisa ler qualquer arquivo para entender o contexto do projeto)
ls:           sem restrição de caminho
shell:        comandos somente leitura (análise estática AST do shell, reutilizando o existente isShellCommandReadOnlyAST)
write_file:   apenas arquivos sob ${projectRoot}/.qwen/skills/ (criar nova skill)
edit:         apenas dentro de ${projectRoot}/.qwen/skills/ e arquivo alvo deve conter source: auto-skill
```

**Níveis de implementação da proteção `auto-skill`**:

1. **Camada do gerenciador de permissões** (restrição rígida): antes de `edit`, lê o frontmatter; se não contém `source: auto-skill`, recusa
2. **Camada do system prompt** (restrição suave): informa claramente ao agente que ele só pode modificar skills com a tag `source: auto-skill`
3. **Dupla garantia**: mesmo que a restrição do system prompt seja ignorada, o gerenciador de permissões intercepta
---

## Design do Agent de Revisão de Skills

### Prompt de gatilho (adaptado do Hermes, com mínimas modificações)

```
Revise a conversa acima e considere salvar ou atualizar uma skill, se apropriado.

Foco em: foi usada uma abordagem não trivial para concluir uma tarefa que exigiu tentativa
e erro, ou mudança de rumo devido a descobertas empíricas ao longo do caminho, ou o
usuário esperava ou desejava um método ou resultado diferente? Se uma skill relevante
já existir e tiver 'source: auto-skill' em seu frontmatter, atualize-a com o que
você aprendeu. Caso contrário, crie uma nova skill se a abordagem for reutilizável.

Restrições IMPORTANTES:
- Você só pode MODIFICAR arquivos de skill que contenham 'source: auto-skill' no
  frontmatter YAML. Sempre leia um arquivo de skill antes de editá-lo.
- NÃO toque em skills que não possuam este marcador — elas foram criadas pelo usuário.
- Ao criar uma nova skill, você DEVE incluir 'source: auto-skill' no frontmatter
  para que agents de revisão futuros possam atualizá-la com segurança.
- NÃO exclua nenhuma skill. Apenas crie ou atualize.

Se não houver nada que valha a pena salvar, apenas diga 'Nothing to save.' e pare.

As skills são salvas no projeto atual (.qwen/skills/).
Use write_file para criar uma nova skill, edit para atualizar uma auto-skill existente.
Cada skill reside em .qwen/skills/<nome>/SKILL.md com frontmatter YAML:

---
name: <nome-da-skill>
description: <descrição em uma linha>
metadata:
  source: auto-skill
  extracted_at: '<timestamp ISO-8601>'
---

<corpo em markdown com o procedimento/abordagem>
```

### Configuração do Agent

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // Ler conteúdo de skill existente, verificar source: auto-skill
    "ls",          // Escanear diretório .qwen/skills/
    "write_file",  // Criar novo arquivo de skill (gerenciador de permissões restringe caminho)
    "edit",        // Modificar auto-skill existente (gerenciador de permissões valida frontmatter)
    "shell",       // Comandos somente leitura (ex.: find, cat)
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // Passar snapshot completo do histórico da conversa
}
```

---

## Integração com o MemoryManager Existente

### `ScheduleSkillReviewParams` (novo tipo)

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // Snapshot completo do histórico da sessão
  toolCallCount: number; // Número de chamadas de ferramenta na sessão atual
  skillsModified: boolean; // Se houve operação de escrita em .qwen/skills/ na sessão atual
  config?: Config;
  enabled?: boolean;
  threshold?: number;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface SkillReviewScheduleResult {
  status: 'scheduled' | 'skipped';
  taskId?: string;
  skippedReason?: 'below_threshold' | 'skills_modified_in_session' | 'disabled';
}
```

### `MemoryManager.scheduleSkillReview()` (novo método)

```typescript
scheduleSkillReview(params: ScheduleSkillReviewParams): SkillReviewScheduleResult {
  // 1. Gatilho de configuração
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. Verificação de limite
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. Se já houve operação manual em skills nesta rodada, pula revisão automática
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. Agendamento independente
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### Extensão do tipo de tarefa

```typescript
// Estende o MemoryTaskRecord.taskType existente
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// Constantes
export const AUTO_SKILL_THRESHOLD = 20; // Limite de número de chamadas de ferramenta
```

---

## Fluxo de dados

```
Sessão em andamento
  Loop principal do agent
    ├─ Cada chamada de ferramenta → toolCallCount += 1
    └─ Se o caminho alvo da operação de escrita estiver em ${projectRoot}/.qwen/skills/
         → skillsModifiedInSession = true

Fim da sessão (evento sessionEnd)
  ├─ scheduleExtract(params)
  │     └─ [Lógica existente: fork do agent de extração → escreve em .qwen/memory/]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ Não → skip (densidade insuficiente ou skill já foi manipulada manualmente nesta rodada)
       └─ Sim → scheduleSkillReview(params)
                 └─ Fork independente do agent de revisão de skills
                        ↓
                 Agent de revisão de skills (máx. 8 rodadas, 2 min, permissões restritas)
                 Ferramentas: read_file, ls, write_file, edit, shell
                 Recebe sessionHistory completo
                        ↓
                 Modelo decide se há método reutilizável
                 ├─ Sim → Lê skill existente (verifica source: auto-skill)
                 │         → write_file cria nova skill (inclui source: auto-skill)
                 │         → edit atualiza auto-skill existente
                 │         → Cache do SkillManager é invalidado (notifyChangeListeners)
                 └─ Não → "Nothing to save." finaliza

Próxima sessão
  SkillManager.listSkills({ level: 'project' })
  → Escaneia .qwen/skills/ descobre nova skill
  → Injeta bloco <available_skills> no system prompt (Tier 1)
```

---

## Convenção de formato SKILL.md (nível de projeto)

A skill extraída automaticamente é gravada em `${projectRoot}/.qwen/skills/<nome>/SKILL.md`, com formato totalmente compatível com o SkillManager existente:

```yaml
---
name: <nome-da-skill> # Obrigatório, minúsculas + hífen
description: <descrição> # Obrigatório, ≤ 1024 caracteres
version: 1.0.0
metadata:
  source: auto-skill # Obrigatório (forçado pelo agent de revisão ao criar)
  extracted_at: '2026-04-24T12:00:00Z'
---
# <Título da Skill>

<Passos de operação / Melhores práticas / Observações>
```
**`source: auto-skill` 的约束语义**：

| 标记值       | 创建方       | skill review agent 可修改？ | 用户可修改？ |
| ------------ | ------------ | --------------------------- | ------------ |
| `auto-skill` | review agent | ✅ 是                       | ✅ 是        |
| 无此字段     | 用户手工创建 | ❌ 否（权限管理器拦截）     | ✅ 是        |

用户若将自己创建的 skill 也加上 `source: auto-skill`，即表示允许 review agent 后续自动更新它。

---

## 安全考量

| 风险                                 | 缓解措施                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 自动提炼覆盖用户精心编写的 skill     | 权限管理器读取 frontmatter，无 `source: auto-skill` 则拒绝 `edit`；system prompt 也明确告知只能改 auto-skill     |
| skill 无限增长                       | review prompt 明确要求"优先更新已有 skill"；更新已有 skill 优于新建                                              |
| 写入项目外路径                       | `write_file`/`edit` 权限限制在 `${projectRoot}/.qwen/skills/` 内；`assertRealProjectSkillPath` 拒绝 symlink 穿越 |
| 提炼出含注入风险的内容               | 复用现有内容安全扫描逻辑                                                                                         |
| review agent 删除 skill              | review agent 工具集不含删除操作（无 `rm`、无 `shell` 写操作）；system prompt 明确禁止删除                        |
| 主会话手动操作 skill 后仍触发 review | `skillsModifiedInSession` 检测：主会话有写操作落在 `.qwen/skills/` 则跳过 review                                 |
| symlink 穿越写入 skills 目录外的文件 | `assertRealProjectSkillPath`（async）：用 `fs.realpath()` 解析真实路径，确认在真实 skills root 内才允许写入      |

---

## 配置项

在 QwenCode config 中新增以下配置项（可选，有默认值）：

```typescript
// config schema 新增（在 memory 下）
memory?: {
  enableAutoSkill?: boolean;   // 默认 true
}
```

对应 QWEN.md / `~/.qwen/config.json` 配置示例：

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## E2E 测试清单

功能实现完成后，按照 `.qwen/skills/e2e-testing/SKILL.md` 的流程，先执行 `npm run build && npm run bundle`，再使用本地构建产物 `node dist/cli.js` 进行端到端验证。

### 1. 低工具调用密度不触发

- 使用临时项目目录运行 headless 模式。
- 配置 `memory.enableAutoSkill: true`。
- 执行一个只需要少量工具调用的简单任务并正常结束会话。
- 断言 `.qwen/skills/` 未新增 `source: auto-skill` skill；JSON 流中不应出现对 `.qwen/skills/` 的写操作。

### 2. 达到阈值后触发 skill review

- 使用临时项目目录运行 headless 模式（`AUTO_SKILL_THRESHOLD` 硬编码为 20，可在测试夹具中调低）。
- 发送一个需要多次工具调用并包含可复用流程的任务。
- 断言会话结束后调度了 skill review；若模型判断值得保存，`.qwen/skills/<name>/SKILL.md` 被创建，且 frontmatter 包含 `source: auto-skill`。
- 若模型判断 `Nothing to save.`，断言流程正常结束且没有权限错误。

### 3. 主会话操作 skill 后跳过 review

- 构造一次会话，在工具调用达到阈值的同时，通过 `write_file` 或 `edit` 写入 `.qwen/skills/` 下的文件（模拟用户手动管理 skill）。
- 断言 session 结束时 `skillsModifiedInSession = true`，`scheduleSkillReview` 返回 `skippedReason: 'skills_modified_in_session'`。
- 断言不会启动 review agent，避免重复写入。

### 4. 写保护只允许 project-level skills

- 通过 skill review agent 尝试写入项目外路径、user-level skill 路径或 bundled skill 路径。
- 断言写入被拒绝，错误信息指向只能写入 `${projectRoot}/.qwen/skills/`。
- 断言允许写入 `${projectRoot}/.qwen/skills/<name>/SKILL.md`。

### 5. `auto-skill` 标识保护用户创建的 skill

- 在 `.qwen/skills/` 中预置一个无 `source: auto-skill` 的用户创建 skill。
- 触发 skill review agent 并引导模型尝试修改该 skill。
- 断言写入被权限管理器拒绝，错误信息说明该 skill 不是 auto-skill。
- 断言同目录下带有 `source: auto-skill` 的 skill 可以正常更新。

### 6. symlink 穿越被拒绝

- 在 `.qwen/skills/` 下创建一个指向项目外目录的 symlink。
- 触发 skill review agent 尝试写入该 symlink 路径。
- 断言 `assertRealProjectSkillPath` 拒绝写入，返回 `symlink traversal detected` 错误。

### 7. 配置开关生效

- 配置 `memory.enableAutoSkill: false`，即使工具调用次数超过阈值也不触发。
- 验证默认开启时（`enableAutoSkill` 未配置或为 `true`），工具调用达到阈值后正常触发。

### 8. 本地构建产物验证

- 按 e2e-testing skill 使用 headless JSON 输出：
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`。
- 必要时加 `--openai-logging --openai-logging-dir <tmp-dir>` 检查请求体中的工具 schema、prompt 和权限配置。
- 对涉及 TUI 或 sessionEnd 可见状态的场景，使用 tmux interactive 流程捕获最终输出。

## 与现有系统的关系

```
现有 MemoryManager
  ├─ scheduleExtract()       ← 不变
  ├─ scheduleDream()         ← 不变
  ├─ recall()                ← 不变
  ├─ forget()                ← 不变
  └─ scheduleSkillReview()   ← 新增（本文档）

现有 SkillManager
  ├─ listSkills()            ← 不变（自动发现 .qwen/skills/ 下新增文件）
  └─ loadSkill()             ← 不变

现有文件工具（read_file / write_file / edit）
  ├─ 主会话中：用户可通过这些工具手动管理 skill
  │   └─ 写操作落在 .qwen/skills/ → skillsModifiedInSession = true
  └─ skill review agent 中：直接用于创建/更新 auto-skill
      └─ 权限管理器限制路径 + 验证 source: auto-skill

触发点（现有 sessionEnd hook）
  └─ 同时调用 scheduleExtract + scheduleSkillReview（条件满足时）
```

SkillManager 的读取侧（`listSkills`、`loadSkill`）完全不需要修改——review agent 写入 `${projectRoot}/.qwen/skills/` 后，`SkillManager` 通过现有的 `chokidar` 文件监听自动感知变化，调用 `notifyChangeListeners()` 触发缓存刷新，下次对话自然可以在 system prompt 中看到新 skill。
