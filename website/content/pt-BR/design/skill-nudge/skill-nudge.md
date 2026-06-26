# AutoSkill: Documento de Design do Sistema de Extração Automática de Skills

## Visão Geral

Este documento descreve o plano de design para adicionar a capacidade **AutoSkill** sobre a arquitetura Memory-Dream existente do QwenCode.

AutoSkill é um **mecanismo de extração automática de memória procedural**: quando um agent conclui uma tarefa com uso intensivo de ferramentas, o sistema avalia silenciosamente em segundo plano se há fluxos operacionais reutilizáveis na conversa e os salva automaticamente como skills de nível de projeto.

### Diferenças de Posicionamento em Relação ao Memory Extract

| Dimensão          | Memory Extract                               | AutoSkill                                      |
| ----------------- | -------------------------------------------- | ---------------------------------------------- |
| **Tipo de Memória** | Memória declarativa (quem é o usuário, contexto do projeto) | Memória procedural (como fazer um tipo de tarefa) |
| **Gatilho**       | Após cada sessão                             | Quando o uso de ferramentas na sessão atinge um limite |
| **Destino de Gravação** | `${projectRoot}/.qwen/memory/`               | `${projectRoot}/.qwen/skills/`                 |
| **Natureza do Conteúdo** | Preferências do usuário, contexto do projeto, regras de feedback | Etapas operacionais reutilizáveis, melhores práticas |
| **Ciclo de Vida** | Integração/poda periódica pelo Dream          | Atualização sob demanda, mantida pelo review agent |

---

## Princípios Centrais do Design

1. **Nenhuma ferramenta dedicada de gravação**: o skill review agent usa diretamente as ferramentas genéricas `read_file`, `write_file` e `edit` para operar em `.qwen/skills/`, sem introduzir uma ferramenta `skill_manage` dedicada. O mesmo vale para a sessão principal: se o usuário quiser manter skills manualmente, usa as mesmas ferramentas genéricas.
2. **Detecção de alterações em skills em vez de reset de contagem de ferramentas**: seguindo o padrão do memory extract que detecta chamadas `memory_tool`, o sistema detecta se qualquer operação de escrita na sessão principal recai sobre o diretório `.qwen/skills/`. Se sim, significa que o usuário já operou skills ativamente nesta rodada, e o skill review automático é pulado ao final da sessão.
3. **Marcador `auto-skill` protege skills criados pelo usuário**: skills criados pelo review agent devem incluir a tag `source: auto-skill` no frontmatter YAML. O skill review agent **só pode modificar** skills com esta tag e **não pode tocar** em skills criados manualmente pelo usuário.
4. **Gatilho por densidade de chamadas de ferramentas**: só é acionado quando o total acumulado de chamadas de ferramentas na sessão for ≥ 20, garantindo que a extração só ocorra após tarefas verdadeiramente complexas.
5. **Limites de gravação claramente definidos**: o gerenciador de permissões do review agent restringe `write_file` e `edit` a `${projectRoot}/.qwen/skills/`, não podendo tocar nas camadas user / extension / bundled.
6. **Máxima preservação do prompt central do Hermes**: o prompt usado pelo review agent é transplantado diretamente do `_SKILL_REVIEW_PROMPT` do Hermes, com apenas adaptações mínimas.

---

## Mudanças na Arquitetura

### 1. Contadores: `toolCallCount` e Detecção de Alterações em Skills

Manter duas métricas paralelas no estado da sessão:

**Contador de chamadas de ferramentas** (decide se aciona o skill review):

```
Início da sessão
  toolCallCount = 0

A cada chamada de ferramenta concluída
  toolCallCount += 1

Fim da sessão
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // Padrão: 20
    Verificar skillsModifiedInSession
    ├─ true  → pular (skill já foi manipulado manualmente nesta rodada)
    └─ false → scheduleSkillReview()
```

**Detecção de alterações em skills** (substitui o reset da chamada `skill_manage`):

```
A cada chamada de ferramenta concluída
  if (o caminho alvo da chamada da ferramenta estiver em ${projectRoot}/.qwen/skills/):
    skillsModifiedInSession = true
```

Lógica de detecção: escanear os caminhos de arquivo envolvidos nos resultados da chamada de ferramenta para determinar se estão sob o diretório skills. A implementação segue o padrão de `historyCallsSkillManage()` — iterar pelos resultados da ferramenta no `history`, extrair os caminhos alvo de operações de escrita como `write_file` e `edit`, e fazer correspondência por prefixo.

> **Por que usar detecção de alterações em skills em vez de detecção por nome de ferramenta?**
> Como não há mais uma ferramenta `skill_manage` dedicada, tanto a sessão principal quanto o review agent usam `write_file`/`edit` genéricos. Portanto, a dimensão de detecção muda de "se uma ferramenta dedicada foi chamada" para "se uma operação de escrita recaiu sobre o diretório `.qwen/skills/`". A semântica é mais precisa: se o usuário já operou manualmente arquivos de skill nesta rodada, o review automático é pulado.

> **Por que usar o número de chamadas de ferramentas em vez de rodadas de diálogo?**
> O número de chamadas de ferramentas reflete a complexidade da tarefa — uma única mensagem do usuário pode disparar 1 ou 30 chamadas de ferramenta. Alta densidade de ferramentas significa mais tentativa e erro, ajuste de estratégia, etc., e maior probabilidade de gerar experiência reutilizável. O limite de 20 é mais conservador que o 10 do Hermes, pois a granularidade das chamadas de ferramenta do QwenCode costuma ser mais fina (ex.: edição linha por linha).

### 2. Ponto de Agendamento

O ponto de chamada existente do `MemoryManager` (final da sessão) atua como ponto de entrada unificado, estendido para agendar também o skill review.

```
Fim da sessão
  ├─ scheduleExtract(params)           // Lógica existente inalterada
  └─ scheduleSkillReview(params)       // Novo
       Condições: toolCallCount >= AUTO_SKILL_THRESHOLD
                  && !skillsModifiedInSession
```

extract e skill review são agendados de forma independente, executados em paralelo via `MemoryManager.track()`, sem bloqueio mútuo.

### 3. Permissões de Acesso a Ferramentas do Skill Review Agent

O skill review agent **não usa** a ferramenta dedicada `skill_manage`, mas sim as ferramentas de arquivo genéricas diretamente:

| Ferramenta   | Uso                                       | Restrição de Escopo                                                       |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------- |
| `read_file`  | Ler conteúdo de skill existente, verificar frontmatter | Ilimitada                                                                 |
| `ls`         | Escanear estrutura de diretórios `.qwen/skills/` | Ilimitada                                                                 |
| `write_file` | Criar novo arquivo de skill               | Apenas dentro de `${projectRoot}/.qwen/skills/`                           |
| `edit`       | Modificar conteúdo de skill existente     | Apenas dentro de `${projectRoot}/.qwen/skills/`, e o arquivo alvo deve conter `source: auto-skill` |
| `shell`      | Comandos somente leitura (ex.: `cat`, `find`) | Apenas comandos somente leitura permitidos (Análise Estática AST do Shell) |

**Restrição adicional para `edit` (proteção `auto-skill`)**:

Antes de executar `edit` ou `write_file` (substituição de arquivo existente), o gerenciador de permissões do skill review agent lê o frontmatter YAML do arquivo alvo e verifica o campo `source: auto-skill`. Se o campo não existir, a gravação é recusada e um erro é retornado:

```
skill_review_agent: edit só é permitido em skills com 'source: auto-skill' no frontmatter.
Este skill parece ter sido criado pelo usuário. Modifique-o manualmente ou pergunte ao usuário.
```

Esta verificação é implementada na camada de permissões do `createSkillScopedAgentConfig`, não apenas no system prompt, garantindo que, mesmo se o modelo errar, não sobrescreverá skills criados manualmente pelo usuário.

**Acesso a ferramentas na sessão principal**: O agent principal não tem restrições de leitura/gravação em `.qwen/skills/` — o usuário pode gerenciar skills através de comandos normais `write_file`/`edit`. Tais operações disparam `skillsModifiedInSession = true`, fazendo com que o skill review automático seja pulado ao final da sessão.

### 4. Sandbox de Permissões: `SkillScopedPermissionManager`

Seguindo o padrão de `createMemoryScopedAgentConfig` em `extractionAgentPlanner.ts`, criar um escopo de permissão dedicado para o skill review agent:

```typescript
// Operações permitidas para o skill review agent
read_file:    Sem restrições de caminho (precisa ler arquivos arbitrários para entender o contexto do projeto)
ls:           Sem restrições de caminho
shell:        Comandos somente leitura (Análise Estática AST do Shell, reutilizando o existente isShellCommandReadOnlyAST)
write_file:   Apenas arquivos sob o caminho ${projectRoot}/.qwen/skills/ (criar novo skill)
edit:         Apenas dentro de ${projectRoot}/.qwen/skills/ e arquivo alvo contém source: auto-skill
```

**Níveis de implementação da proteção `auto-skill`**:

1. **Camada do Gerenciador de Permissões** (restrição forte): ler frontmatter antes de `edit`; recusar se não contiver `source: auto-skill`
2. **Camada do System Prompt** (restrição suave): informar explicitamente ao agent que ele só pode modificar skills com a tag `source: auto-skill`
3. **Dupla garantia**: mesmo que a restrição do system prompt seja contornada, o gerenciador de permissões intercepta

---

## Design do Skill Review Agent

### Prompt de Gatilho (transplantado do Hermes, adaptação mínima)

```
Revise a conversa acima e considere salvar ou atualizar um skill, se apropriado.

Foco em: foi usada uma abordagem não trivial para concluir uma tarefa que exigiu
tentativa e erro, ou mudança de curso devido a descobertas empíricas ao longo do caminho,
ou o usuário esperava ou desejava um método ou resultado diferente? Se um skill
relevante já existir e tiver 'source: auto-skill' em seu frontmatter, atualize-o com
o que você aprendeu. Caso contrário, crie um novo skill se a abordagem for reutilizável.

RESTRIÇÕES importantes:
- Você SÓ PODE modificar arquivos de skill que contenham 'source: auto-skill' em seu
  frontmatter YAML. Sempre leia um arquivo de skill antes de editá-lo.
- NÃO toque em skills que não tenham este marcador — eles foram criados pelo usuário.
- Ao criar um novo skill, você DEVE incluir 'source: auto-skill' no frontmatter
  para que futuros review agents possam atualizá-lo com segurança.
- NÃO exclua nenhum skill. Apenas crie ou atualize.

Se nada merecer ser salvo, apenas diga 'Nada a salvar.' e pare.

Os skills são salvos no projeto atual (.qwen/skills/).
Use write_file para criar um novo skill, edit para atualizar um auto-skill existente.
Cada skill reside em .qwen/skills/<nome>/SKILL.md com frontmatter YAML:

---
name: <nome-do-skill>
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
    "edit",        // Modificar auto-skill existente (gerenciador de permissões verifica frontmatter)
    "shell",       // Comandos somente leitura (ex.: find, cat)
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // Passar snapshot completo do histórico da conversa
}
```

---

## Integração com o MemoryManager Existente

### `ScheduleSkillReviewParams` (Novo Tipo)

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // Snapshot completo do histórico da sessão
  toolCallCount: number; // Número de chamadas de ferramenta nesta sessão
  skillsModified: boolean; // Se houve operação de escrita em .qwen/skills/ nesta sessão
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

### `MemoryManager.scheduleSkillReview()` (Novo Método)

```typescript
scheduleSkillReview(params: ScheduleSkillReviewParams): SkillReviewScheduleResult {
  // 1. Gate de configuração
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. Verificação de limite
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. Skill já foi operado manualmente nesta rodada, pular review automático
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. Agendamento independente
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### Extensão do Tipo de Tarefa

```typescript
// Estender MemoryTaskRecord.taskType existente
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// Constantes
export const AUTO_SKILL_THRESHOLD = 20; // Limite de chamadas de ferramenta
```

---

## Fluxo de Dados

```
Sessão em andamento
  Loop principal do agent
    ├─ A cada chamada de ferramenta → toolCallCount += 1
    └─ Se o caminho alvo da operação de escrita estiver em ${projectRoot}/.qwen/skills/
         → skillsModifiedInSession = true

Fim da sessão (evento sessionEnd)
  ├─ scheduleExtract(params)
  │     └─ [Lógica existente: fork extraction agent → escrever .qwen/memory/]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ Não → pular (densidade insuficiente OU skill já operado manualmente nesta rodada)
       └─ Sim → scheduleSkillReview(params)
                  └─ Fork independente do skill review agent
                         ↓
                  Skill review agent (máx 8 rodadas, 2 min, permissões em sandbox)
                   Ferramentas: read_file, ls, write_file, edit, shell
                   Recebe sessionHistory completo
                         ↓
                  Modelo decide se há método reutilizável
                  ├─ Sim → Ler skill existente (verificar source: auto-skill)
                  │         → write_file criar novo skill (incluindo source: auto-skill)
                  │         → edit atualizar auto-skill existente
                  │         → Cache do SkillManager invalidado (notifyChangeListeners)
                  └─ Não → "Nada a salvar." fim

Próxima sessão
  SkillManager.listSkills({ level: 'project' })
  → Escanear .qwen/skills/ e encontrar novo skill
  → Injetar bloco <available_skills> no system prompt (Tier 1)
```

---

## Convenção de Formato SKILL.md (nível projeto)

Skills extraídos automaticamente são gravados em `${projectRoot}/.qwen/skills/<nome>/SKILL.md`, formato totalmente compatível com o SkillManager existente:

```yaml
---
name: <nome-do-skill> # Obrigatório, letras minúsculas + hífen
description: <descrição> # Obrigatório, ≤ 1024 caracteres
version: 1.0.0
metadata:
  source: auto-skill # Obrigatório (forçado ao criar pelo review agent)
  extracted_at: '2026-04-24T12:00:00Z'
---
# <Título do Skill>

<Etapas operacionais / Melhores práticas / Notas importantes>
```

**Semântica da restrição `source: auto-skill`**:

| Valor do Marcador | Criado por           | Modificável pelo skill review agent? | Modificável pelo usuário? |
| ----------------- | -------------------- | ----------------------------------- | -------------------------- |
| `auto-skill`      | review agent         | ✅ Sim                             | ✅ Sim                    |
| Ausente           | Usuário (manual)     | ❌ Não (interceptado pelo gerenciador de permissões) | ✅ Sim |

Se o usuário adicionar `source: auto-skill` a um skill que criou manualmente, estará permitindo que o review agent o atualize automaticamente no futuro.

---

## Considerações de Segurança

| Risco                                                  | Mitigação                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extração automática sobrescreve skill bem elaborado do usuário | Gerenciador de permissões lê frontmatter; recusa `edit` sem `source: auto-skill`; system prompt também deixa claro que só pode modificar auto-skill                         |
| Crescimento infinito de skills                         | Review prompt exige explicitamente "priorizar atualização de skill existente"; atualizar skill existente é melhor que criar novo                                               |
| Gravação em caminhos fora do projeto                   | Permissões de `write_file`/`edit` restritas a `${projectRoot}/.qwen/skills/`; `assertRealProjectSkillPath` recusa travessia de symlink                                        |
| Extração de conteúdo com risco de injeção              | Reutilizar lógica de verificação de segurança de conteúdo existente                                                                                                           |
| Review agent exclui skill                              | Conjunto de ferramentas do review agent não inclui operações de exclusão (sem `rm`, sem operações de `shell` de escrita); system prompt proíbe exclusão explicitamente         |
| Review acionado mesmo após usuário manipular skill manualmente | Detecção `skillsModifiedInSession`: se a sessão principal teve operação de escrita em `.qwen/skills/`, o review é pulado                                         |
| Travessia de symlink para fora do diretório de skills  | `assertRealProjectSkillPath` (async): usa `fs.realpath()` para resolver o caminho real; só permite gravação se estiver dentro da raiz real de skills                           |

---

## Itens de Configuração

Adicionar os seguintes itens de configuração no config do QwenCode (opcionais, com valores padrão):

```typescript
// Novo no schema de config (dentro de memory)
memory?: {
  enableAutoSkill?: boolean;   // Padrão true
}
```

Exemplo de configuração correspondente no QWEN.md / `~/.qwen/config.json`:

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## Lista de Verificação de Testes E2E

Após a implementação funcional, seguir o fluxo de `.qwen/skills/e2e-testing/SKILL.md`, executar primeiro `npm run build && npm run bundle` e, em seguida, usar o artefato de build local `node dist/cli.js` para validação ponta a ponta.

### 1. Baixa densidade de chamadas de ferramenta não aciona

- Executar modo headless usando um diretório de projeto temporário.
- Configurar `memory.enableAutoSkill: true`.
- Executar uma tarefa simples que requer apenas algumas chamadas de ferramenta e finalizar a sessão normalmente.
- Afirmar que `.qwen/skills/` não tem novos skills com `source: auto-skill`; o fluxo JSON não deve conter operações de escrita em `.qwen/skills/`.

### 2. Acionamento do skill review ao atingir o limite

- Executar modo headless usando um diretório de projeto temporário (`AUTO_SKILL_THRESHOLD` codificado como 20, pode ser reduzido no fixture de teste).
- Enviar uma tarefa que exija múltiplas chamadas de ferramenta e contenha um fluxo reutilizável.
- Afirmar que o skill review foi agendado após o fim da sessão; se o modelo julgar que vale a pena salvar, `.qwen/skills/<nome>/SKILL.md` é criado e o frontmatter contém `source: auto-skill`.
- Se o modelo julgar `Nada a salvar.`, afirmar que o fluxo termina normalmente e sem erros de permissão.

### 3. Sessão principal operando skill pula o review

- Construir uma sessão onde, enquanto as chamadas de ferramenta atingem o limite, o usuário escreve `.qwen/skills/` via `write_file` ou `edit` (simulando gerenciamento manual de skill).
- Afirmar que, ao final da sessão, `skillsModifiedInSession = true` e `scheduleSkillReview` retorna `skippedReason: 'skills_modified_in_session'`.
- Afirmar que o review agent não é iniciado, evitando gravação duplicada.

### 4. Proteção de gravação permite apenas skills de nível projeto

- Tentar, através do skill review agent, gravar em caminhos fora do projeto, caminhos de skill de nível de usuário ou caminhos de skill bundled.
- Afirmar que a gravação é recusada, com mensagem de erro indicando que só pode gravar em `${projectRoot}/.qwen/skills/`.
- Afirmar que a gravação é permitida em `${projectRoot}/.qwen/skills/<nome>/SKILL.md`.

### 5. Marcador `auto-skill` protege skills criados pelo usuário

- Pré-colocar um skill criado pelo usuário sem `source: auto-skill` em `.qwen/skills/`.
- Acionar o skill review agent e orientar o modelo a tentar modificar esse skill.
- Afirmar que a gravação é recusada pelo gerenciador de permissões, com mensagem de erro informando que o skill não é um auto-skill.
- Afirmar que skills com `source: auto-skill` no mesmo diretório podem ser atualizados normalmente.

### 6. Travessia de symlink é recusada

- Criar um symlink dentro de `.qwen/skills/` apontando para um diretório fora do projeto.
- Acionar o skill review agent tentando gravar no caminho do symlink.
- Afirmar que `assertRealProjectSkillPath` recusa a gravação, retornando erro `detectada travessia de symlink`.

### 7. Interruptor de configuração funciona

- Configurar `memory.enableAutoSkill: false` e verificar que, mesmo com chamadas de ferramenta acima do limite, o skill review não é acionado.
- Verificar que, com a configuração padrão ativada (`enableAutoSkill` não configurado ou `true`), o skill review é acionado normalmente ao atingir o limite.

### 8. Verificação com artefato de build local

- Seguir o skill e2e-testing usando saída JSON headless:
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`.
- Se necessário, adicionar `--openai-logging --openai-logging-dir <tmp-dir>` para inspecionar o schema das ferramentas, prompt e configuração de permissões no corpo da requisição.
- Para cenários envolvendo TUI ou estado visível de sessionEnd, usar o fluxo tmux interactive para capturar a saída final.

## Relacionamento com o Sistema Existente

```
MemoryManager Existente
  ├─ scheduleExtract()       ← Inalterado
  ├─ scheduleDream()         ← Inalterado
  ├─ recall()                ← Inalterado
  ├─ forget()                ← Inalterado
  └─ scheduleSkillReview()   ← Novo (este documento)

SkillManager Existente
  ├─ listSkills()            ← Inalterado (descobre automaticamente novos arquivos em .qwen/skills/)
  └─ loadSkill()             ← Inalterado

Ferramentas de Arquivo Existentes (read_file / write_file / edit)
  ├─ Na sessão principal: usuário pode gerenciar skills manualmente através destas ferramentas
  │   └─ Operação de escrita em .qwen/skills/ → skillsModifiedInSession = true
  └─ No skill review agent: usado diretamente para criar/atualizar auto-skill
       └─ Gerenciador de permissões restringe caminho + verifica source: auto-skill

Ponto de Gatilho (hook sessionEnd existente)
  └─ Chama scheduleExtract + scheduleSkillReview simultaneamente (quando as condições são atendidas)
```

O lado de leitura do SkillManager (`listSkills`, `loadSkill`) não requer nenhuma modificação — depois que o review agent grava em `${projectRoot}/.qwen/skills/`, o `SkillManager` detecta automaticamente a mudança através do monitoramento de arquivos `chokidar` existente, chama `notifyChangeListeners()` para disparar a atualização do cache, e na próxima conversa, o novo skill será naturalmente visível no system prompt.