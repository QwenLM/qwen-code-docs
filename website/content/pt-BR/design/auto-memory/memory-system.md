# Sistema de Gerenciamento de Memória

> Este artigo apresenta o mecanismo de gerenciamento de memória **Managed Auto-Memory** (Memória Automática Gerenciada) no Qwen Code, incluindo seus gatilhos e detalhes de implementação.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Estrutura de Armazenamento](#estrutura-de-armazenamento)
3. [Tipos de Memória](#tipos-de-memória)
4. [Formato das Entradas de Memória](#formato-das-entradas-de-memória)
5. [Ciclo de Vida Principal](#ciclo-de-vida-principal)
6. [Extract — Extração](#extract--extração)
7. [Dream — Consolidação](#dream--consolidação)
8. [Recall — Recuperação](#recall--recuperação)
9. [Forget — Esquecimento](#forget--esquecimento)
10. [Reconstrução do Índice](#reconstrução-do-índice)
11. [Telemetria e Eventos](#telemetria-e-eventos)

---

## Visão Geral

O Managed Auto-Memory é um sistema de memória persistente que **automaticamente** acumula, consolida e recupera conhecimento relevante do usuário durante sessões de IA. Ele mantém o ciclo de vida da memória através de quatro operações principais:

| Operação   | Inglês   | Gatilho                        | Função                                                      |
| ---------- | -------- | ------------------------------ | ----------------------------------------------------------- |
| Extração   | Extract  | Automático (após cada rodada)  | Extrai novo conhecimento do diálogo e grava em arquivos     |
| Consolidação | Dream    | Automático (tarefa em segundo plano periódica) | Deduplica e mescla arquivos de memória, mantendo-os organizados |
| Recuperação | Recall   | Automático (antes de cada rodada) | Recupera memórias relevantes para a requisição atual e injeta no prompt do sistema |
| Esquecimento | Forget   | Manual (comando `/forget`)     | Remove precisamente entradas de memória específicas         |

---

## Estrutura de Armazenamento

### Layout de Diretórios

```
~/.qwen/                                      ← Diretório base global (padrão)
└── projects/
    └── <sanitized-git-root>/                 ← Identificador do projeto (baseado na raiz Git)
        ├── meta.json                         ← Metadados (timestamps de extração/consolidação, status)
        ├── extract-cursor.json               ← Cursor de extração (offset do diálogo já processado)
        ├── consolidation.lock                ← Lock de exclusão mútua do processo Dream
        └── memory/                           ← Diretório principal de memória
            ├── MEMORY.md                     ← Arquivo de índice (gerado automaticamente, resume todas as entradas)
            ├── user.md                       ← Memória de preferências do usuário (exemplo)
            ├── feedback.md                   ← Memória de regras de feedback (exemplo)
            ├── project/
            │   └── milestone.md              ← Memória de projeto (suporta subdiretórios)
            └── reference/
                └── grafana.md                ← Memória de recurso externo
```

> **Sobrescrita por variável de ambiente**:
>
> - `QWEN_CODE_MEMORY_BASE_DIR`: Substitui o diretório base global
> - `QWEN_CODE_MEMORY_LOCAL=1`: Usa o caminho `.qwen/memory/` dentro do projeto

### Descrição dos Arquivos Chave

| Arquivo               | Descrição                                                                        |
| --------------------- | -------------------------------------------------------------------------------- |
| `meta.json`           | Registra o timestamp do último Extract/Dream, ID da sessão, tipos de memória envolvidos e status de execução |
| `extract-cursor.json` | Registra até qual offset do histórico da sessão atual já foi processado, evitando extração duplicada |
| `consolidation.lock`  | Lock de arquivo durante a execução do Dream; contém o PID do processo detentor; expira automaticamente após 1 hora |
| `MEMORY.md`           | Índice de todos os arquivos de tópico; reconstruído após cada Extract/Dream; formato de lista Markdown |

---

## Tipos de Memória

O sistema suporta quatro tipos de memória embutidos, cada um correspondendo a uma dimensão diferente de informação:

| Tipo        | Conteúdo Armazenado                                      | Quando Escrever                                                      | Quando Ler                                                  |
| ----------- | -------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `user`      | Papel do usuário, habilidades, hábitos de trabalho       | Ao descobrir o papel/preferências/contexto de conhecimento do usuário | Quando a resposta precisa ser personalizada ao perfil do usuário |
| `feedback`  | Orientações do usuário: o que evitar, o que continuar    | Quando o usuário corrige a IA ou confirma uma prática não óbvia       | Quando precisa influenciar o comportamento da IA            |
| `project`   | Progresso do projeto, objetivos, decisões, prazos, bugs  | Ao saber quem está fazendo o quê, por quê e até quando                | Quando ajuda a IA a entender o contexto e a motivação do trabalho |
| `reference` | Ponteiros para sistemas externos (Dashboard, ticket, Slack, etc.) | Ao tomar conhecimento de um recurso externo e seu propósito           | Quando o usuário menciona o sistema externo ou informação relacionada |

**Conteúdo que NÃO deve ser armazenado em memória**: Padrões/convenções de código, histórico Git, soluções de debug, status de tasks temporárias, conteúdo já presente em QWEN.md/AGENTS.md.

---

## Formato das Entradas de Memória

Cada arquivo de tópico usa o formato **YAML frontmatter + Markdown body**:

```markdown
---
name: Nome da memória
description: Descrição em uma frase (para julgar relevância na recuperação; seja específico)
type: user|feedback|project|reference
---

Conteúdo principal da memória (linha de sumário)

Why: Razão subjacente (para que a IA entenda casos de contorno em vez de seguir regras cegamente)
How to apply: Cenários de aplicação e modo de uso
```

Para os tipos `feedback` e `project`, é fortemente recomendado preencher `Why` e `How to apply` para que a memória ainda seja aplicada corretamente em casos de contorno.

---

## Ciclo de Vida Principal

```mermaid
flowchart TD
    A([Usuário envia requisição]) --> B

    subgraph "Recall (Recuperação)"
        B[Escaneia todos os arquivos de tópico] --> C{Número de documentos\nE conteúdo da consulta\nsão válidos?}
        C -- Não --> D[Retorna prompt vazio\nstrategy: none]
        C -- Sim --> E{Há um Config configurado?}
        E -- Sim --> F[Seleção orientada por modelo\nside query]
        F --> G{Documentos relevantes\nselecionados?}
        G -- Sim --> H[strategy: model]
        G -- Não --> I[strategy: none]
        E -- Não --> J[Pontuação heurística por palavras-chave]
        F -- Falha --> J
        J --> K{Há documentos\ncom score > 0?}
        K -- Sim --> L[strategy: heuristic]
        K -- Não --> I
        H --> M[Constrói prompt de Memória Relevante\nInjeta no prompt do sistema]
        L --> M
        I --> N[Não injeta memória]
    end

    M --> O([IA processa requisição])
    N --> O
    D --> O

    O --> P([IA retorna resposta])

    subgraph "Extract (Extração) — Segundo plano"
        P --> Q{A IA desta rodada\nescreveu diretamente\num arquivo de memória?}
        Q -- Sim --> R[Pula\nmemory_tool]
        Q -- Não --> S{Tarefa de extração\nestá em execução?}
        S -- Sim --> T[Coloca na fila ou pula\nalready_running / queued]
        S -- Não --> U[Carrega fatia do diálogo não processada\nCom base no extract cursor]
        U --> V[Chama agente de extração\nrunAutoMemoryExtractionByAgent]
        V --> W[Normaliza e deduplica patches]
        W --> X{Há touched topics?}
        X -- Sim --> Y[Atualiza meta.json\nReconstrói índice MEMORY.md]
        X -- Não --> Z[Apenas atualiza extract cursor]
        Y --> Z
    end

    subgraph "Dream (Consolidação) — Segundo plano, periódico"
        P --> AA{Verificação de gate do Dream}
        AA --> AB{Mesma sessão?}
        AB -- Sim --> AC[Pula\nsame_session]
        AB -- Não --> AD{Distância do último Dream\n≥ 24 horas?}
        AD -- Não --> AE[Pula\nmin_hours]
        AD -- Sim --> AF{Novas sessões desde\núltimo Dream ≥ 5?}
        AF -- Não --> AG[Pula\nmin_sessions]
        AF -- Sim --> AH{consolidation.lock\nexiste?}
        AH -- Sim --> AI[Pula\nlocked]
        AH -- Não --> AJ[Adquire lock\nEscreve PID]
        AJ --> AK{Config configurado?}
        AK -- Sim --> AL[Caminho do Agente\nplanManagedAutoMemoryDreamByAgent]
        AL --> AM{O Agente tocou\nem arquivos?}
        AM -- Sim --> AN[Registra touched topics]
        AM -- "Não/Falha" --> AO
        AK -- Não --> AO[Caminho de dedup mecânico\nParse + dedup + ordenação alfabética]
        AO --> AP[Reescreve arquivos de tópico atualizados]
        AN --> AQ[Reconstrói índice MEMORY.md\nAtualiza meta.json]
        AP --> AQ
        AQ --> AR[Libera lock]
    end
```

---

## Extract — Extração

### Momento do Gatilho

Após cada rodada de resposta da IA, é automaticamente acionado por `scheduleAutoMemoryExtract` (segundo plano, não bloqueante).

### Lógica de Agendamento (`extractScheduler.ts`)

```mermaid
flowchart TD
    A[scheduleAutoMemoryExtract é chamado] --> B{Nesta rodada,\nhá chamada de ferramenta\nque escreve arquivo de memória?}
    B -- Sim --> C[Registra tarefa skipped\nMotivo: memory_tool]
    B -- Não --> D{isExtractRunning?}
    D -- Sim --> E{Já há requisição\nna fila (queued)?}
    E -- Sim --> F[Atualiza parâmetro history\nda requisição na fila]
    E -- Não --> G[Registra tarefa pending\nColoca na fila]
    D -- Não --> H[Registra tarefa running\nChama runTask]
    H --> I[markExtractRunning\nsetCurrentTaskId]
    I --> J[runAutoMemoryExtract]
    J --> K[Tarefa concluída]
    K --> L[clearExtractRunning\nVerifica fila → startQueuedIfNeeded]
    F --> M[Retorna skipped: queued]
    G --> M
    C --> N[Retorna skipped: memory_tool]
```

**Explicação dos motivos de skip**:

| Motivo           | Significado                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `memory_tool`    | O Agente principal desta rodada já escreveu diretamente o arquivo de memória; pula para evitar conflito |
| `already_running` | A extração está em andamento e não pode ser enfileirada                     |
| `queued`         | Já há uma extração em execução; esta requisição foi colocada na fila        |

### Fluxo Principal de Extração (`extract.ts`)

```mermaid
flowchart TD
    A[runAutoMemoryExtract] --> B[ensureAutoMemoryScaffold\nInicializa diretórios e arquivos]
    B --> C[readExtractCursor\nLê posição processada anteriormente]
    C --> D[history.slice startOffset\nPega apenas fatia de mensagens não processadas]
    D --> E{A fatia contém\nnova mensagem user?}
    E -- Não --> F[Atualiza cursor\nRetorna resultado sem patches]
    E -- Sim --> G[runAutoMemoryExtractionByAgent\nChama forked agent para extrair]
    G --> H{Há touched topics?}
    H -- Sim --> I[bumpMetadata\nAtualiza meta.json]
    I --> J[rebuildManagedAutoMemoryIndex\nReconstrói MEMORY.md]
    J --> K[writeExtractCursor\nRegistra offset mais recente = history.length]
    H -- Não --> K
    K --> L[Retorna AutoMemoryExtractResult]
```

> **Nota:** O gate `isUnderMemoryPressure` fica em `MemoryManager.runExtract()`, não neste fluxo. Quando o monitor reporta pressão hard/critical, o `MemoryManager` pula a chamada de extract e não avança o cursor.

**Cursor de Extração (Cursor)**:

- Campos: `{ sessionId, processedOffset, updatedAt }`
- Antes de extrair, lê o progresso atual com `readExtractCursor` e processa apenas a parte não lida com `history.slice(processedOffset)`
- Após cada extração, atualiza `processedOffset` para o tamanho atual do histórico (`params.history.length`)
- Quando a sessão muda (`sessionId` muda), recomeça do offset 0
- Nota: Não constrói mais transcrição via `buildTranscriptMessages` / `loadUnprocessedTranscriptSlice` — `hasNewUserMessages` é verificado com `history.slice(startOffset).some(m => m.role === 'user' && partToString(m.parts).trim().length > 0)`, fazendo uma stringificação leve apenas na fatia não lida. O histórico completo não é mais processado.

**Regras de Filtragem de Patch**:

- Resumo com menos de 12 caracteres → descartado
- Resumo terminando em `?` → descartado (frase interrogativa)
- Contém palavras-chave temporárias (today/now/currently/temporary etc.) → descartado
- Combinação `topic:summary` duplicada → deduplicado

---

## Dream — Consolidação

### Momento do Gatilho

Após cada rodada de resposta da IA, é automaticamente acionado por `scheduleManagedAutoMemoryDream` (segundo plano, não bloqueante). No entanto, é protegido por múltiplos gates e, na maioria dos casos, é ignorado.

### Gates de Agendamento (`dreamScheduler.ts`)

```mermaid
flowchart TD
    A[scheduleManagedAutoMemoryDream é chamado] --> B{Função Dream\nestá habilitada?}
    B -- Não --> C[Pula: disabled]
    B -- Sim --> D[ensureAutoMemoryScaffold\nLê lastDreamSessionId]
    D --> E{sessionId atual\n== lastDreamSessionId?}
    E -- Sim --> F[Pula: same_session]
    E -- Não --> G{elapsedHours ≥ 24h\nou nunca houve Dream?}
    G -- Não --> H[Pula: min_hours]
    G -- Sim --> I{Distância do último\nscan de sessão\n< 10 minutos?}
    I -- Sim --> J[Pula: min_sessions\nAguardar próxima janela de scan]
    I -- Não --> K[Escaneia mtime de chats/*.jsonl\nConta novas sessões desde último Dream]
    K --> L{Novas sessões ≥ 5?}
    L -- Não --> M[Pula: min_sessions]
    L -- Sim --> N{lockExists?\nVerificação de PID + expiração}
    N -- Sim --> O[Pula: locked]
    N -- Não --> P{Já existe tarefa Dream\npara este projeto\ncom a mesma dedupeKey?}
    P -- Sim --> Q[Pula: running\nRetorna taskId existente]
    P -- Não --> R[Agenda tarefa em segundo plano\nBgTaskScheduler]
    R --> S[acquireDreamLock\nEscreve PID em consolidation.lock]
    S --> T[runManagedAutoMemoryDream]
    T --> U[Atualiza meta.json\nLibera lock]
```

**Parâmetros dos Gates**:

| Parâmetro                   | Valor Padrão | Descrição                                          |
| --------------------------- | ------------ | -------------------------------------------------- |
| `minHoursBetweenDreams`     | 24 horas     | Intervalo mínimo entre duas execuções do Dream     |
| `minSessionsBetweenDreams`  | 5 sessões    | Número mínimo de novas sessões para acionar o Dream |
| `SESSION_SCAN_INTERVAL_MS`  | 10 minutos   | Intervalo de throttle para escaneamento de arquivos de sessão |
| `DREAM_LOCK_STALE_MS`       | 1 hora       | Threshold de tempo para considerar o arquivo de lock expirado |

**Mecanismo de Lock**:

- Arquivo de lock localizado em `<project-state-dir>/consolidation.lock`
- Conteúdo é o PID do processo detentor
- Durante a verificação: se o processo PID não existe mais (`kill(pid, 0)` falha) ou o lock tem mais de 1 hora → considerado expirado e removido automaticamente

### Fluxo de Execução da Consolidação (`dream.ts`)

```mermaid
flowchart TD
    A[runManagedAutoMemoryDream] --> B{Config configurado?}
    B -- Sim --> C[Caminho do Agente\nplanManagedAutoMemoryDreamByAgent]
    C --> D{O Agente modificou arquivos?}
    D -- Sim --> E[Infere touched topics a partir do caminho do arquivo]
    E --> F[bumpMetadata\nReconstrói índice MEMORY.md]
    F --> G[updateDreamMetadataResult]
    G --> H[Registra evento de telemetria]
    H --> I[Retorna resultado]
    B -- Não --> J[Caminho de dedup mecânico]
    C -- Lança exceção --> J
    D -- Não --> J

    J --> K[scanAutoMemoryTopicDocuments\nLê todos os arquivos de tópico]
    K --> L[Para cada arquivo, executa buildDreamedBody]
    L --> M[Parse de entries → dedup por sumário\nOrdenação alfabética crescente → renderização]
    M --> N{body teve alterações?}
    N -- Sim --> O[Reescreve o arquivo]
    O --> P[Registra touched topic]
    N --> Q[Verifica duplicatas entre arquivos\ndedupeKey = type:summary]
    Q --> R{Arquivos duplicados\nencontrados?}
    R -- Sim --> S[Mescla entries no arquivo canônico\nRemove arquivo duplicado]
    S --> P
    R -- Não --> T{Há touched topics?}
    P --> T
    T -- Sim --> U[bumpMetadata\nReconstrói índice MEMORY.md]
    U --> V[updateDreamMetadataResult\nRegistra telemetria → retorna resultado]
    T -- Não --> V
```

**Lógica de Dedup Mecânico**:

1. Dentro de cada arquivo de tópico: deduplica por `summary.toLowerCase()`, mescla campos `why`/`howToApply`
2. Reordena entradas em ordem alfabética pelo sumário
3. Entre arquivos: entradas com o mesmo `type:summary` são mescladas no arquivo descoberto primeiro; arquivos duplicados são removidos

---

## Recall — Recuperação

### Momento do Gatilho

Antes de cada rodada da IA processar uma requisição do usuário, é automaticamente acionado por `resolveRelevantAutoMemoryPromptForQuery`, injetando memórias relevantes no prompt do sistema.

### Fluxo de Recuperação (`recall.ts`)

```mermaid
flowchart TD
    A[resolveRelevantAutoMemoryPromptForQuery] --> B[scanAutoMemoryTopicDocuments\nEscaneia todos os arquivos de tópico]
    B --> C[filterExcludedAutoMemoryDocuments\nFiltra arquivos já escritos nesta rodada]
    C --> D{query vazia\nou docs vazios\nou limit <= 0?}
    D -- Sim --> E[Retorna prompt vazio\nstrategy: none]
    D -- Não --> F{Config configurado?}
    F -- Sim --> G[selectRelevantAutoMemoryDocumentsByModel\nFaz side query para modelo escolher]
    G --> H{Modelo retornou resultado?}
    H -- Com documentos --> I[strategy: model]
    H -- Sem documentos --> J[strategy: none\nRetorna vazio mesmo]
    G -- "Falha/Exceção" --> K[Fallback para seleção heurística]
    F -- Não --> K
    K --> L[tokenize query\nExtrai tokens com ≥ 3 caracteres]
    L --> M[scoreDocument\nMatch de keyword +2 / Keyword de tipo +1 / Conteúdo presente +1]
    M --> N[Filtra documentos com score=0\nOrdena por score decrescente, pega Top 5]
    N --> O{Há documentos com score?}
    O -- Sim --> P[strategy: heuristic]
    O -- Não --> J
    I --> Q[buildRelevantAutoMemoryPrompt\nConstrói bloco de Memória Relevante]
    P --> Q
    Q --> R[Retorna fragmento de prompt para injeção no prompt do sistema]
```

**Regras de Pontuação (Heurística)**:

| Condição                                       | Pontuação Adicionada |
| ---------------------------------------------- | -------------------- |
| Token da query aparece no conteúdo do documento | +2 (por token)       |
| Token da query é uma keyword característica do tipo | +1 (por token)       |
| Body do documento não vazio                    | +1                   |

**Keywords Características de Cada Tipo**:

- `user`: user, preference, background, role, terse
- `feedback`: feedback, rule, avoid, style, summary
- `project`: project, goal, incident, deadline, release
- `reference`: reference, dashboard, ticket, docs, link

**Regras de Construção do Prompt**:

- Máximo de 5 documentos injetados (`MAX_RELEVANT_DOCS`)
- Body de cada documento truncado em 1200 caracteres (`MAX_DOC_BODY_CHARS`)
- Quando truncado, adiciona aviso: "NOTE: Relevant memory truncated for prompt budget."
- Inclui informação de frescor do documento (baseada no mtime do arquivo)

---

## Forget — Esquecimento

### Momento do Gatilho

Acionado manualmente pelo usuário através do comando `/forget <query>`.

### Fluxo de Esquecimento (`forget.ts`)

```mermaid
flowchart TD
    A[forgetManagedAutoMemoryEntries\nquery + config] --> B[ensureAutoMemoryScaffold]
    B --> C[listIndexedForgetCandidates\nEscaneia todas as entries de todos os arquivos]
    C --> D[Gera ID estável para cada entry\nArquivo de entrada única: relativePath\nArquivo de múltiplas entradas: relativePath:index]
    D --> E{Config configurado?}
    E -- Sim --> F[selectByModel\nConstrói selection prompt\nFaz side query temperature=0]
    F --> G{Modelo selecionou com sucesso?}
    G -- Sim --> H[strategy: model]
    G -- Falha --> I[selectByHeuristic\nMatch de palavras-chave]
    E -- Não --> I
    I --> J[strategy: heuristic]
    H --> K[Itera sobre candidates selecionados]
    J --> K
    K --> L{entries.length == 1?}
    L -- Sim --> M[Remove arquivo inteiro\nfs.unlink]
    L -- Não --> N[Parse de todas as entries do arquivo\nRemove entry alvo\nRe-renderiza e escreve de volta]
    M --> O[Registra removedEntries]
    N --> O
    O --> P{Há touched topics?}
    P -- Sim --> Q[bumpMetadata\nReconstrói índice MEMORY.md]
    P --> R[Retorna AutoMemoryForgetResult]
    Q --> R
```

**Design do Entry ID**:

- Arquivo de entrada única (caso comum): `relativePath` (ex: `feedback/no-summary.md`)
- Arquivo de múltiplas entradas: `relativePath:index` (ex: `feedback/style.md:2`)
- IDs estáveis permitem que o modelo localize precisamente a entrada sem afetar outras entradas no mesmo arquivo

---

## Reconstrução do Índice

`MEMORY.md` é o índice de navegação de todos os arquivos de tópico. Ele é reconstruído com `rebuildManagedAutoMemoryIndex` após cada Extract ou Dream:

```
- [Preferências do Usuário](user/preferences.md) — Usuário é engenheiro Go sênior, primeiro contato com React
- [Regras de Feedback](feedback/style.md) — Mantenha respostas concisas, sem resumo no final
- [Marcos do Projeto](project/milestone.md) — Janela de congelamento de merge antes do branch de corte para release mobile
```

**Limitações do Índice**:

- Máximo de 150 caracteres por linha (truncado com `…` se exceder)
- Máximo de 200 linhas
- Tamanho total não excede 25.000 bytes

---

## Telemetria e Eventos

O sistema possui três tipos de eventos de telemetria para monitorar o desempenho e a eficácia das operações de memória:

### Telemetria do Extract

| Campo             | Tipo                          | Descrição                          |
| ----------------- | ----------------------------- | ---------------------------------- |
| `trigger`         | `'auto'`                      | Modo de gatilho (atualmente apenas automático) |
| `status`          | `'completed'` \| `'failed'`   | Resultado da execução              |
| `patches_count`   | number                        | Número de patches válidos extraídos |
| `touched_topics`  | string[]                      | Lista de tipos de memória escritos |
| `duration_ms`     | number                        | Duração total (milissegundos)      |

### Telemetria do Dream

| Campo              | Tipo                                    | Descrição                                 |
| ------------------ | --------------------------------------- | ----------------------------------------- |
| `trigger`          | `'auto'`                                | Modo de gatilho                           |
| `status`           | `'updated'` \| `'noop'` \| `'failed'`   | Resultado da execução                     |
| `deduped_entries`  | number                                  | Número de entradas deduplicadas via caminho mecânico |
| `touched_topics`   | string[]                                | Lista de tipos de memória modificados     |
| `duration_ms`      | number                                  | Duração total (milissegundos)             |

### Telemetria do Recall

| Campo            | Tipo                                     | Descrição                         |
| ---------------- | ---------------------------------------- | --------------------------------- |
| `query_length`   | number                                   | Comprimento da string de consulta |
| `docs_scanned`   | number                                   | Total de documentos escaneados    |
| `docs_selected`  | number                                   | Número de documentos injetados    |
| `strategy`       | `'none'` \| `'heuristic'` \| `'model'`   | Estratégia de seleção             |
| `duration_ms`    | number                                   | Duração total (milissegundos)     |

---

## Índice de Arquivos Fonte Relacionados

| Arquivo                                                | Responsabilidade                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/memory/types.ts`                    | Definições de tipo: `AutoMemoryType`, `AutoMemoryMetadata`, `AutoMemoryExtractCursor` |
| `packages/core/src/memory/paths.ts`                    | Cálculo de caminhos: `getAutoMemoryRoot`, `isAutoMemPath`, helpers diversos de caminho |
| `packages/core/src/memory/store.ts`                    | Inicialização do scaffold: `ensureAutoMemoryScaffold`, leitura/escrita de índice/metadados |
| `packages/core/src/memory/scan.ts`                     | Escaneamento de arquivos de tópico: `scanAutoMemoryTopicDocuments`, parse de frontmatter |
| `packages/core/src/memory/entries.ts`                  | Parse e renderização de entradas: `parseAutoMemoryEntries`, `renderAutoMemoryBody` |
| `packages/core/src/memory/extract.ts`                  | Lógica principal de extração: `runAutoMemoryExtract`, gerenciamento de cursor, dedup de patches |
| `packages/core/src/memory/extractScheduler.ts`         | Agendador de extração: `ManagedAutoMemoryExtractRuntime`, máquina de estados fila/execução |
| `packages/core/src/memory/extractionAgentPlanner.ts`   | Agente de extração: `runAutoMemoryExtractionByAgent`                              |
| `packages/core/src/memory/dream.ts`                    | Lógica principal de consolidação: `runManagedAutoMemoryDream`, caminho do Agente + dedup mecânico |
| `packages/core/src/memory/dreamScheduler.ts`           | Agendador de consolidação: `ManagedAutoMemoryDreamRuntime`, verificação de gates, gerenciamento de lock |
| `packages/core/src/memory/dreamAgentPlanner.ts`        | Agente de consolidação: `planManagedAutoMemoryDreamByAgent`                       |
| `packages/core/src/memory/recall.ts`                   | Lógica de recuperação: `resolveRelevantAutoMemoryPromptForQuery`, caminho duplo heurística+modelo |
| `packages/core/src/memory/forget.ts`                   | Lógica de esquecimento: `forgetManagedAutoMemoryEntries`, geração de candidatos + remoção precisa |
| `packages/core/src/memory/indexer.ts`                  | Reconstrução de índice: `rebuildManagedAutoMemoryIndex`, `buildManagedAutoMemoryIndex` |
| `packages/core/src/memory/prompt.ts`                   | Template de prompt do sistema: descrição dos tipos de memória, exemplo de formato, regras de uso |
| `packages/core/src/memory/governance.ts`               | Tipos de sugestão de governance: `AutoMemoryGovernanceSuggestionType`             |
| `packages/core/src/memory/state.ts`                    | Estado de execução da extração: `isExtractRunning`, `markExtractRunning`, `clearExtractRunning` |
| `packages/core/src/memory/memoryAge.ts`                | Descrição de frescor: `memoryAge`, `memoryFreshnessText`                          |