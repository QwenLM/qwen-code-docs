# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões, personalizar a interface e controlar seu comportamento de forma eficiente.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se dividem em três categorias:

| Tipo de Prefixo                | Descrição da Função                                | Caso de Uso Típico                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Comandos Slash (`/`)       | Controle em nível meta do próprio Qwen Code              | Gerenciamento de sessões, modificação de configurações, obtenção de ajuda              |
| Comandos de Arroba (`@`)          | Injeção rápida de conteúdo de arquivos locais na conversa | Permitir que a IA analise arquivos especificados ou código em diretórios |
| Comandos de Exclamação (`!`) | Interação direta com o Shell do sistema                | Execução de comandos do sistema como `git status`, `ls`, etc.          |

## 1. Comandos Slash (`/`)

Os comandos slash são usados para gerenciar sessões, interface e comportamento básico do Qwen Code.

### 1.1 Gerenciamento de Sessões e Projetos

Esses comandos ajudam você a salvar, restaurar e resumir o progresso do trabalho.

| Comando          | Descrição                                                              | Exemplos de Uso                                                |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init`          | Analisar o diretório atual e criar o arquivo de contexto inicial                | `/init`                                                       |
| `/summary`       | Gerar resumo do projeto com base no histórico de conversas                   | `/summary` ou `/summary docs/my-summary.md`                   |
| `/compress`      | Substituir o histórico do chat pelo resumo para salvar Tokens                         | `/compress` ou `/summarize`                                   |
| `/compress-fast` | Compressão rápida sem IA — remove saídas antigas de ferramentas e partes de raciocínio | `/compress-fast`                                              |
| `/resume`        | Retomar uma sessão de conversa anterior                                   | `/resume` ou `/continue`                                      |
| `/recap`         | Gerar um resumo de uma linha da sessão agora                                    | `/recap`                                                      |
| `/restore`       | Reverter os arquivos do projeto para o checkpoint antes da execução de uma chamada de ferramenta            | `/restore` (lista) ou `/restore <ID>`                          |
| `/delete`        | Excluir uma sessão anterior                                                | `/delete`                                                     |
| `/branch`        | Bifurcar a conversa atual em uma nova sessão                         | `/branch`                                                     |
| `/fork`          | Criar um agente em segundo plano que herda a conversa completa             | `/fork <directive>`                                           |
| `/rewind`        | Retroceder a conversa para um turno anterior                                   | `/rewind` ou `/rollback`                                      |
| `/export`        | Exportar o histórico da sessão para um arquivo                                           | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename`        | Renomear ou marcar a sessão atual                                        | `/rename My Feature` ou `/tag`                                |

> [!note]
>
> Abrir uma exportação HTML carrega o renderizador e a folha de estilos daquela versão exata do Qwen Code a partir de `unpkg.com`. Se a versão não tiver sido publicada ou qualquer um dos recursos não puder ser alcançado, o arquivo exibirá um erro de carregamento. As exportações em Markdown, JSON e JSONL permanecem autocontidas.

> [!note]
>
> `/summarize` é um alias para `/compress` (ele comprime o histórico do chat — uma operação destrutiva). Para gerar um resumo do projeto não destrutivo, use `/summary`.

> [!note]
>
> `/summary` aceita um argumento opcional `[path]` para salvar o resumo em um local personalizado dentro da raiz do projeto. Sem argumento, ele salva em `.qwen/PROJECT_SUMMARY.md`. Resumos com caminho personalizado não são detectados pelo fluxo de boas-vindas (`ui.enableWelcomeBack`), que lê apenas o local padrão `.qwen/PROJECT_SUMMARY.md`.

### 1.2 Controle de Interface e Workspace

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando              | Descrição                                                                                                                                                                       | Exemplos de Uso                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear`             | Limpar o histórico de conversas e liberar o contexto                                                                                                                                    | `/clear`, `/reset`, `/new`                                                        |
| `/context`           | Mostrar o detalhamento do uso da janela de contexto                                                                                                                                               | `/context`                                                                        |
| → `detail`           | Mostrar o detalhamento do uso do contexto por item                                                                                                                                             | `/context detail`                                                                 |
| `/history`           | Controlar preferências e visibilidade de exibição do histórico                                                                                                                                | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff`              | Abrir um visualizador de diff interativo mostrando alterações não commitadas e diffs por turno. Use ←/→ para alternar entre o git diff atual e os turnos individuais da conversa, ↑/↓ para navegar pelos arquivos | `/diff`                                                                           |
| `/log`               | Abrir um visualizador de histórico de commits para o workspace (apenas Web Shell)                                                                                                                   | `/log`                                                                            |
| `/theme`             | Alterar o tema visual do Qwen Code                                                                                                                                                     | `/theme`                                                                          |
| `/vim`               | Ativar/desativar o modo de edição Vim na área de entrada                                                                                                                                           | `/vim`                                                                            |
| `/voice`             | Alternar entrada por ditado de voz                                                                                                                                                      | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`              |
| `/directory`         | Gerenciar workspace com suporte a múltiplos diretórios                                                                                                                                          | `/dir add ./src,./tests`, `/dir show`                                             |
| `/cd`                | Mover esta sessão para um novo diretório de trabalho                                                                                                                                      | `/cd ../other-project`                                                            |
| `/editor`            | Abrir diálogo para selecionar o editor suportado                                                                                                                                            | `/editor`                                                                         |
| `/statusline`        | Abrir diálogo interativo de predefinição da [linha de status](./status-line.md)                                                                                                                    | `/statusline`                                                                     |
| `/statusline <text>` | Gerar uma [linha de status](./status-line.md) em modo de comando via agente                                                                                                                 | `/statusline show model and git branch`                                           |
| `/terminal-setup`    | Configurar atalhos de teclado do terminal para entrada multilinha                                                                                                                                | `/terminal-setup`                                                                 |

### 1.3 Configurações de Idioma

Comandos específicos para controlar o idioma da interface e da saída.

| Comando               | Descrição                      | Exemplos de Uso             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Visualizar ou alterar as configurações de idioma | `/language`                |
| → `ui [language]`     | Definir o idioma da interface do usuário        | `/language ui zh-CN`       |
| → `output [language]` | Definir o idioma de saída do LLM          | `/language output Chinese` |

- Idiomas de interface integrados disponíveis: `zh-CN` (Chinês Simplificado), `en-US` (Inglês), `ru-RU` (Russo), `de-DE` (Alemão), `ja-JP` (Japonês), `pt-BR` (Português - Brasil), `fr-FR` (Francês), `ca-ES` (Catalão)
- Exemplos de idioma de saída: `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando           | Descrição                                                                      | Exemplos de Uso                                                                                            |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/mcp`            | Listar servidores e ferramentas MCP configurados                                            | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                         |
| `/import-config`  | Importar servidores MCP das configurações do Claude                                           | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools`          | Exibir a lista de ferramentas disponíveis atualmente                                            | `/tools`, `/tools desc`                                                                                   |
| `/skills`         | Abrir o painel de Skills para navegar, pesquisar, alternar e iniciar skills               | `/skills`, `/<skill-name>`                                                                                |
| `/learn`          | Criar uma skill reutilizável de projeto a partir de um arquivo, diretório, URL, vídeo ou texto | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment`                        |
| `/curator`        | Inspecionar, fixar, arquivar ou restaurar auto-skills inativas do projeto                        | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>`          |
| `/plan`           | Alternar para o modo de plano ou sair do modo de plano                                            | `/plan`, `/plan <task>`, `/plan exit`                                                                     |
| `/approval-mode`  | Alterar o modo de aprovação de ferramentas (apenas na sessão atual)                             | `/approval-mode`, `/approval-mode auto-edit`                                                              |
| → `plan`          | Apenas análise, sem execução (revisão segura)                                      | `/approval-mode plan`                                                                                     |
| → `default`       | Exigir aprovação para edições (uso diário)                                           | `/approval-mode default`                                                                                  |
| → `auto-edit`     | Aprovar edições automaticamente (ambiente confiável)                                         | `/approval-mode auto-edit`                                                                                |
| → `auto`          | Aprovação avaliada por classificador (autônomo)                                       | `/approval-mode auto`                                                                                     |
| → `yolo`          | Aprovar tudo automaticamente (prototipagem rápida)                                      | `/approval-mode yolo`                                                                                     |
| `/peers`              | Revisar mensagens de pares em espera; gerenciar controladores confiáveis                                 | `/peers`, `/peers accept <id>`, `/peers deny all`, `/peers controllers`, `/peers revoke <id>`             |
| `/model`          | Alternar o modelo usado na sessão atual                                             | `/model`, `/model <model-id>` (alterna imediatamente)                                                        |
| `/model --fast`   | Definir um modelo mais leve para sugestões de prompt                                       | `/model --fast qwen3-coder-flash`                                                                         |
| `/model --voice`  | Definir o modelo usado para transcrição de voz                                       | `/model --voice <model-id>`                                                                               |
| `/model --vision` | Definir o modelo de vision bridge usado para transcrever imagens para um modelo principal somente de texto | `/model --vision <model-id>`                                                                              |
| `/model --compaction` | Definir o modelo usado para compressão de chat                                               | `/model --compaction <model-id>`, `/model --compaction clear`                                             |
| `/model --image`  | Definir um modelo com capacidade de geração de imagens para a ferramenta integrada de geração de imagens     | `/model --image <model-id>`                                                                               |
| `/effort`         | Definir o esforço de raciocínio para modelos com capacidade de pensamento                                 | `/effort` (abre o seletor), `/effort high` (low/medium/high/xhigh/max; mapeado e limitado por provedor)       |
| `/output-style`       | Escolher o estilo de saída que define como as respostas são escritas                         | `/output-style` (abre o seletor), `/output-style Concise`, `/output-style default` (sem estilo)               |
| `/extensions`     | Gerenciar extensões                                                                | `/extensions list`, `/extensions manage`                                                                  |
| → `list`          | Listar extensões instaladas                                                        | `/extensions list`                                                                                        |
| → `manage`        | Gerenciar extensões instaladas (interativo)                                        | `/extensions manage`                                                                                      |
| → `explore`       | Abrir a página de extensões no navegador                                                  | `/extensions explore <Gemini\|ClaudeCode>`                                                                |
| → `install`       | Instalar uma extensão de um repositório git ou caminho                                     | `/extensions install <repo-or-path>`                                                                      |
| `/memory`         | Abrir o diálogo do Gerenciador de Memória                                                   | `/memory`                                                                                                 |
| `/remember`       | Salvar uma memória durável                                                            | `/remember Prefer terse responses`                                                                        |
| `/forget`         | Remover entradas correspondentes da auto-memória                                         | `/forget <query>`                                                                                         |
| `/dream`          | Executar manualmente a consolidação de auto-memória                                           | `/dream`                                                                                                  |
| `/hooks`          | Gerenciar hooks do Qwen Code                                                           | `/hooks`, `/hooks list`                                                                                   |
| `/reload-plugins` | Recarregar alterações de extensões (comandos, skills, agentes, hooks, servidores MCP/LSP) do disco | `/reload-plugins`                                                                                         |
| `/permissions`    | Gerenciar regras de permissão                                                          | `/permissions`                                                                                            |
| `/agents`         | Gerenciar subagentes                                                                 | `/agents manage`, `/agents create`                                                                        |
| `/arena`          | Gerenciar sessões da Arena                                                            | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (alias `choose`)                          |
| `/goal`               | Definir um Goal — continuar trabalhando até que um verificador o confirme (veja [Goals](./goals.md))      | `/goal <objective>`, `/goal edit <objective>`, `/goal pause`, `/goal resume`, `/goal clear`               |
| `/tasks`          | Listar tarefas em segundo plano                                                            | `/tasks`                                                                                                  |
| `/workflows`      | Inspecionar execuções de workflow; pausar/retomar cooperativamente uma execução em segundo plano | `/workflows`, `/workflows <runId>`, `/workflows p <runId>`                                                |
| `/lsp`            | Mostrar o status do servidor LSP                                                           | `/lsp`                                                                                                    |
| `/trust`          | Gerenciar configurações de confiança de pasta                                                     | `/trust`                                                                                                  |
> [!warning]
>
> Instale extensões (`/extensions install`) apenas de fontes confiáveis. Extensões podem incluir servidores MCP, skills e comandos que são executados com as mesmas permissões do próprio Qwen Code — eles podem acessar seus arquivos, API keys e dados de conversação. O `/extensions install` não solicita confirmação.

> [!warning]
>
> Os modos de aprovação `auto-edit`, `auto` e `yolo` ignoram os prompts de aprovação para execuções de ferramentas. No modo `yolo`, todas as ações — incluindo comandos de shell, escrita de arquivos e requisições de rede — são executadas sem confirmação. Use esses modos apenas em ambientes confiáveis, em sandbox ou descartáveis.

> [!note]
>
> `/workflows`, `/lsp` e `/trust` são registrados apenas quando seus respectivos recursos estão habilitados — por meio da configuração `tools.workflowsEnabled` com escopo de usuário/sistema ou da env var `QWEN_CODE_ENABLE_WORKFLOWS=1`, da flag CLI `--experimental-lsp` e da configuração `security.folderTrust.enabled`, respectivamente. Valores de workspace para `tools.workflowsEnabled` são ignorados. Quando desabilitados, eles não aparecerão e retornarão um erro de comando desconhecido. Da mesma forma, `/dream` e `/forget` são registrados apenas quando a auto-memória gerenciada está disponível; sem ela, não aparecerão.

> [!note]
>
> Uma skill de uma extensão instalada também é um comando slash, e seu nome carrega seu dono: `/rust:pdf`, não `/pdf`. A forma simples não é um alias — se outra skill se chamar `pdf`, `/pdf` executará aquela skill em vez disso. `slashCommands.disabled` bloqueia tal comando sob qualquer grafia, então uma entrada escrita antes de o nome carregar o dono ainda pega. Veja [How extension Skills are named](./skills.md#how-extension-skills-are-named).

### 1.5 Skills Integradas

Estes comandos invocam skills integradas que fornecem fluxos de trabalho especializados.

| Comando      | Descrição                                                   | Exemplos de Uso                                                           |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/review`     | Revisão de código multi-agente (12 agentes paralelos no esforço alto) | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low` |
| `/coordinate` | Coordenar workers somente leitura e um escritor opcional de worktree  | `/coordinate investigate and fix the authentication regression`           |
| `/loop`       | Executar um prompt em um cronograma recorrente                        | `/loop 5m check the build`                                                |
| `/goal-draft` | Transformar uma intenção vaga em um objetivo `/goal` verificável      | `/goal-draft make the auth tests pass`                                    |
| `/simplify`   | Revisar alterações recentes e aplicar edições seguras de limpeza diretamente | `/simplify`, `/simplify focus on duplication`                             |
| `/qc-helper`  | Responder perguntas sobre o uso e configuração do Qwen Code           | `/qc-helper how do I configure MCP?`                                      |

Consulte [Code Review](./code-review.md) para a documentação completa do `/review`.

### 1.6 Pergunta Paralela (`/btw`)

O comando `/btw` permite que você faça perguntas paralelas rápidas sem interromper ou afetar o fluxo da conversa principal.

| Comando                | Descrição                             |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Fazer uma pergunta paralela rápida    |
| `?btw <your question>` | Sintaxe alternativa para perguntas paralelas |

**Como Funciona:**

- A pergunta paralela é enviada como uma chamada de API separada com o contexto recente da conversa (até as últimas 20 mensagens)
- A resposta é exibida acima do Composer — você pode continuar digitando enquanto aguarda
- A conversa principal **não é bloqueada** — ela continua independentemente
- A resposta da pergunta paralela **não** faz parte do histórico da conversa principal
- As respostas são renderizadas com suporte completo a Markdown (blocos de código, listas, tabelas, etc.)

**Atalhos de Teclado (Modo Interativo):**

| Atalho               | Ação                                                |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Cancelar (durante o carregamento) ou dispensar (após a conclusão) |
| `Space` or `Enter`   | Dispensar a resposta (quando a entrada está vazia)  |
| `Ctrl+C` or `Ctrl+D` | Cancelar uma pergunta paralela em andamento         |

**Exemplo:**

```
(Enquanto a conversa principal é sobre refatorar código)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Respondendo...                         │
  │ Pressione Escape, Ctrl+C ou Ctrl+D para  │
  │ cancelar                                 │
  ╰──────────────────────────────────────────╯
  > (O Composer permanece ativo — continue digitando)

(Depois que a resposta chegar)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` tem escopo de bloco, enquanto      │
  │ `var` tem escopo de função. `let` foi    │
  │ introduzido no ES6 e não faz hoist da    │
  │ mesma forma.                             │
  │                                          │
  │ Pressione Space, Enter ou Escape para    │
  │ dispensar                                │
  ╰──────────────────────────────────────────╯
  > (Composer ainda ativo)
```

**Modos de Execução Suportados:**

| Modo                 | Comportamento                                  |
| -------------------- | ---------------------------------------------- |
| Interactive          | Mostra acima do Composer com renderização Markdown |
| Non-interactive      | Retorna o resultado em texto: `btw> question\nanswer` |
| ACP (Agent Protocol) | Retorna o gerador assíncrono stream_messages |

> [!tip]
>
> Use `/btw` quando precisar de uma resposta rápida sem desviar do seu foco principal. É especialmente útil para esclarecer conceitos, verificar fatos ou obter explicações rápidas enquanto mantém o foco no seu fluxo de trabalho principal.

### 1.7 Segunda Opinião (`/advisor`)

O comando `/advisor` executa uma revisão independente e somente leitura da conversa até o momento e retorna uma segunda opinião estruturada — sem realizar a tarefa nem interromper a conversa principal.

| Comando            | Descrição                            |
| ------------------ | ------------------------------------ |
| `/advisor`         | Revisar a conversa acima             |
| `/advisor <focus>` | Focar a revisão em uma preocupação específica |

**Como Funciona:**

- A revisão é enviada como uma chamada de API separada e de turno único com o contexto recente da conversa (até as últimas 40 mensagens)
- O modelo revisor **não pode executar ferramentas** — as ferramentas são removidas no nível da requisição (o mesmo mecanismo que o `/btw`), então a revisão nunca escreve código nem executa comandos; cada afirmação deve estar fundamentada na transcrição visível
- A conversa principal **não** é interrompida; a revisão é mostrada apenas para você
- A revisão é renderizada como um bloco markdown em caixa com quatro seções fixas — **Veredito**, **Riscos**, **Evidência faltando** e **Recomendação** — sob um cabeçalho `/advisor · <model>` que nomeia o modelo revisor resolvido
- Diferente do `/btw`, que é fire-and-forget e deixa a sessão utilizável, o `/advisor` bloqueia a entrada até a revisão retornar; em uma janela de contexto completa com um revisor forte, isso pode levar dezenas de segundos
- Por padrão, o modelo principal é usado; defina [`advisorModel`](../configuration/settings.md#advisormodel) para direcionar a revisão para um modelo diferente (tipicamente mais forte) — a transcrição recente é enviada para esse modelo mesmo quando ele usa outro provedor

**Exemplo:**

```
> /advisor is my fix for the null check actually correct?

  Consulting advisor...

  ╭──────────────────────────────────────────────────────╮
  │ /advisor · qwen3-max                                 │
  │                                                      │
  │ Verdict                                              │
  │ The approach is sound, but the edge case at line 42  │
  │ is unverified.                                       │
  │                                                      │
  │ Risks                                                │
  │  - The fix assumes the config is always loaded; a    │
  │    startup race could leave it null.                 │
  │                                                      │
  │ Missing evidence                                     │
  │  - No test exercises the null-config path in the     │
  │    visible transcript.                               │
  │                                                      │
  │ Recommendation                                       │
  │ Add a focused unit test for the null-config branch   │
  │ before merging.                                      │
  ╰──────────────────────────────────────────────────────╯
```

A revisão é renderizada em uma caixa com borda cujo cabeçalho nomeia o modelo revisor resolvido. Um `advisorModel` desconhecido não é validado antecipadamente — se o provedor o rejeitar, o `/advisor` reporta a falha, então verifique o nome do modelo; apenas seletores de alias não resolvíveis (ex.: `fast` sem modelo rápido configurado) retornam ao modelo principal. Requisições de advisor não usam fallbacks de modelo configurados.

**Modos de Execução Suportados:**

| Modo                 | Comportamento                                       |
| -------------------- | --------------------------------------------------- |
| Interactive          | Renderiza a revisão de quatro seções na conversa    |
| ACP (Agent Protocol) | Retorna a revisão como resultado de mensagem        |

> [!tip]
>
> Use `/advisor` para uma segunda opinião antes de se comprometer com uma direção — é especialmente útil para capturar suposições falhas, afirmações não verificadas ou próximos passos arriscados. Configure `advisorModel` para obter a revisão de um modelo diferente daquele que conduz a conversa principal.

> [!note]
>
> `advisorModel` é definido apenas nas configurações; diferentemente de `fastModel` e `visionModel`, ainda não tem um flag `/model` correspondente.

### 1.8 Resumo da Sessão (`/recap`)

O comando `/recap` gera um breve resumo de "onde você parou" da sessão atual, permitindo que você retome uma conversa antiga sem precisar rolar por páginas de histórico.

| Comando  | Descrição                                  |
| -------- | ------------------------------------------ |
| `/recap` | Gerar e mostrar um resumo da sessão em uma linha |

**Como funciona:**

- Usa o modelo rápido configurado (configuração `fastModel`) quando disponível, voltando para o modelo principal da sessão como fallback. Um modelo pequeno e barato é suficiente para um resumo.
- A conversa recente (até 30 mensagens, apenas texto — chamadas de ferramentas e respostas de ferramentas são filtradas) é enviada ao modelo com um system prompt restrito.
- O resumo é renderizado em cor esmaecida com o prefixo `❯` para se destacar das respostas reais do assistente.
- Recusa com um erro inline se um turno do modelo estiver em andamento ou outro comando estiver sendo processado. Se não houver conversa utilizável, ou se a geração subjacente falhar, o `/recap` mostra uma mensagem informativa curta em vez de um resumo — o comando manual sempre responde com algo.

**Acionamento automático ao retornar de uma ausência:**

Se o terminal ficar desfocado por **5+ minutos** e for focado novamente, um resumo é gerado e exibido automaticamente (apenas quando nenhuma resposta do modelo estiver em progresso; caso contrário, ele aguarda o turno atual terminar e então é acionado). Diferente do comando manual, o acionamento automático é totalmente silencioso em caso de falha: se houver erros de geração ou não houver nada para resumir, nenhuma mensagem é adicionada ao histórico. Controlado pela configuração `general.showSessionRecap` (padrão: `false`); o comando manual `/recap` sempre funciona independentemente desta configuração.

**Exemplo:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Configure um modelo rápido via `/model --fast <model>` (ex.:
> `qwen3-coder-flash`) para tornar o `/recap` rápido e barato. Defina
> `general.showSessionRecap` como `true` para habilitar o acionamento automático; o
> comando manual `/recap` sempre funciona independentemente desta configuração.

### 1.9 Visualizador de Diff (`/diff`)

O comando `/diff` abre um visualizador de diff interativo mostrando alterações não commitadas e diffs por turno. Use ←/→ para alternar entre o git diff atual e os turnos individuais da conversa, ↑/↓ para navegar pelos arquivos e Enter para visualizar os diffs inline.

**Como funciona:**

No modo interativo, o `/diff` abre um diálogo com um **seletor de origem** na parte superior:

- **Current** — working tree vs HEAD (`git diff HEAD`). Mostra todas as alterações não commitadas, incluindo arquivos staged, unstaged e untracked.
- **T1, T2, T3, …** — diffs por turno, uma aba por turno do modelo que modificou arquivos. Os turnos mais recentes aparecem primeiro. Cada aba mostra uma prévia do prompt original para contexto.

A lista de arquivos exibe estatísticas por arquivo (linhas adicionadas/removidas) com tags para estados especiais (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Pressione Enter em um arquivo para ver seu diff inline com hunks destacados por sintaxe.

Diffs por turno requerem que o file checkpointing esteja habilitado (ativado por padrão no modo interativo). Quando o file checkpointing está desativado, apenas a origem "Current" está disponível.

**Atalhos de teclado:**

| Tecla     | Ação                                        |
| --------- | ------------------------------------------- |
| `←` / `→` | Alternar entre origens (Current / T1 / T2…) |
| `↑` / `↓` | Navegar pela lista de arquivos              |
| `j` / `k` | Navegar pela lista de arquivos (estilo vim) |
| Enter     | Ver diff inline do arquivo selecionado      |
| `←` / Esc | Voltar para a lista de arquivos a partir da visualização de diff inline |
| Esc       | Fechar o diálogo                            |

**Exemplo:**

```
┌ /diff · Turn 3 "refactor the auth middleware" ──── 3 files +45 -12 ┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ source · ↑/↓ file · Enter view · Esc close                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Modo não interativo:**

Em contextos headless (`--prompt`) ou não interativos, o `/diff` imprime um resumo em texto simples do working tree vs HEAD. A navegação por turno não está disponível.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

**Web Shell:** Na UI do Web Shell (`qwen serve`), o `/diff` abre uma caixa de diálogo gráfica de diff. Uma barra de abas na parte superior permite alternar entre a visualização **Changes** e a visualização **History** (`/log`).

#### Visualizador de Histórico (`/log`) — Apenas Web Shell

O comando `/log` abre um navegador de histórico de commits para o workspace atual. Está disponível apenas na UI do Web Shell; a CLI/TUI não possui este comando.

**Como funciona:**

O `/log` abre uma caixa de diálogo listando commits em ordem cronológica inversa (mais recentes primeiro). Cada linha mostra:

- SHA curto (monoespaçado, com botão de cópia para o SHA completo)
- Assunto do commit (linha única)
- Nome do autor e tempo relativo (ex.: "2h ago")
- Rótulos de ref de branch/tag, quando presentes
- Um ícone de merge (⎇) para commits de merge

Clique em uma linha de commit para expandir seus detalhes sob demanda:

- Corpo completo da mensagem do commit
- Estatísticas de alteração de arquivos (arquivos alterados, linhas adicionadas/removidas, detalhamento por arquivo)

Use **Load more** na parte inferior para buscar a próxima página de commits (50 por página).

**Exemplo:**

```
┌─ History ──────────────────────────── 50 commits ─ ✕ ┐
│                                                       │
│  a1b2c3d  feat(cli): add --json flag        2h ago   │
│           wenshao                                    │
│                                                       │
│  e4f5g6h  fix(core): handle null config     5h ago   │
│           dev · main  v1.2.0                         │
│                                                       │
│ ▼ 789abcd  refactor: simplify parser        1d ago   │
│   ┌─────────────────────────────────────────────┐    │
│   │  Broke the monolithic parse() into smaller  │    │
│   │  functions for readability.                 │    │
│   │                                             │    │
│   │  3 files · +45 −12                          │    │
│   │   +30 −8   src/parser.ts                    │    │
│   │   +10 −2   src/utils.ts                     │    │
│   │   +5  −2   test/parser.test.ts              │    │
│   └─────────────────────────────────────────────┘    │
│                                                       │
│              [ Load more ]                            │
└───────────────────────────────────────────────────────┘
```

> [!note]
>
> `/log` requer um workspace de repositório git. Se o workspace não for um repositório git ou não tiver commits, a caixa de diálogo exibirá uma mensagem de placeholder.

### 1.10 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando          | Descrição                                                                                                                      | Exemplos de Uso                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/help`          | Exibir informações de ajuda para os comandos disponíveis                                                                       | `/help` or `/?`                                                                     |
| `/status`        | Exibir informações da versão                                                                                                   | `/status` or `/about`                                                               |
| `/status paths`  | Exibir caminhos do arquivo e logs da sessão atual                                                                              | `/status paths`                                                                     |
| `/stats`         | Abrir o painel interativo de estatísticas de uso (abas Session, Activity e Efficiency)                                         | `/stats` or `/usage`                                                                |
| `/stats model`   | Mostrar detalhamento de tokens por modelo e custo estimado                                                                     | `/stats model`                                                                      |
| `/stats tools`   | Mostrar contagens de chamadas por ferramenta                                                                                   | `/stats tools`                                                                      |
| `/stats skills`  | Mostrar contagens de chamadas por skill para a sessão ativa atual (apenas ao vivo; exclui atividade diária/mensal entre sessões) | `/stats skills`                                                                     |
| `/stats daily`   | Mostrar estatísticas diárias de uso de tokens                                                                                  | `/stats daily` (alias `day`), `/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | Mostrar estatísticas mensais de uso de tokens                                                                                  | `/stats monthly` (alias `month`), `/stats month [YYYY-MM]`                          |
| `/stats export`  | Exportar estatísticas de uso para CSV ou JSON                                                                                  | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | Abrir o editor de configurações                                                                                                | `/settings`                                                                         |
| `/config`        | Obter ou definir qualquer configuração por chave dot-path (escreve nas configurações do usuário)                               | `/config` (list all), `/config <key>`, `/config <key>=<value>`                      |
| `/auth`          | Alterar método de autenticação                                                                                                 | `/auth`, `/connect`, `/login`                                                       |
| `/doctor`        | Executar diagnósticos de instalação e ambiente                                                                                 | `/doctor`, `/doctor memory`                                                         |
| → `memory`       | Mostrar diagnósticos de memória do processo atual                                                                              | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | Gravar um perfil de CPU para análise no Chrome DevTools                                                                        | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | Reverter o binário CLI standalone para a versão anterior (apenas instalações standalone; para histórico de conversas use `/rewind`) | `/doctor rollback`                                                                  |
| `/docs`          | Abrir a documentação completa do Qwen Code no navegador                                                                        | `/docs`                                                                             |
| `/ide`           | Gerenciar integração com IDE                                                                                                   | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                        |
| `/insight`       | Gerar insights de programação a partir do histórico de chat                                                                    | `/insight`                                                                          |
| `/setup-github`  | Configurar GitHub Actions                                                                                                      | `/setup-github`                                                                     |
| `/bug`           | Enviar issue sobre o Qwen Code                                                                                                 | `/bug Button click unresponsive`                                                    |
| `/copy`          | Copiar para a área de transferência: resposta (N-ésima última), código (por linguagem), LaTeX ou Mermaid                       | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                  |
| `/quit`          | Sair do Qwen Code imediatamente                                                                                                | `/quit` or `/exit`                                                                  |
> [!warning]
>
> `/doctor memory --snapshot` grava um snapshot do heap do V8 que pode conter prompts, conteúdos de arquivos, API keys e resultados de ferramentas da sessão atual. Revise o arquivo antes de compartilhá-lo.

> [!note]
>
> `/config` lê e grava configurações individuais por chave de caminho com ponto (ex.: `general.vimMode`), complementando o editor interativo `/settings`. Executar `/config` sem argumentos (ou `--help`) lista todas as chaves configuráveis com seu tipo e valor atual. `/config <key>` imprime o valor atual — exceto para chaves booleanas, onde ele alterna o valor. `/config <key>=<value>` define o valor. As alterações são gravadas nas configurações do usuário (`~/.qwen/settings.json`). Apenas configurações `boolean`, `string`, `number` e `enum` podem ser alteradas dessa forma — configurações `array` e `object` devem ser editadas diretamente no `settings.json`. Valores sensíveis (API keys, tokens, base URLs) são mascarados na saída, e definir `tools.approvalMode` como `yolo` é bloqueado.

### 1.11 Atalhos Comuns

| Atalho             | Função                    | Nota                                                                      |
| ------------------ | ------------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | Limpar tela               | Limpa apenas a tela visível (não reseta a sessão como `/clear`)           |
| `Ctrl/cmd+T`       | Alternar descrição da ferramenta | Gerenciamento de ferramentas MCP                                     |
| `Ctrl/cmd+C`×2     | Confirmação de saída      | Mecanismo de saída segura                                                 |
| `Ctrl/cmd+Z`       | Desfazer entrada          | Edição de texto                                                           |
| `Ctrl/cmd+Shift+Z` | Refazer entrada           | Edição de texto                                                           |

### 1.12 Comandos de Autenticação

Use `/auth` dentro de uma sessão do Qwen Code para configurar a autenticação. Use `/doctor` para inspecionar o status atual de autenticação e do ambiente.

| Comando   | Descrição                                                            |
| --------- | -------------------------------------------------------------------- |
| `/auth`   | Configurar autenticação interativamente (aliases: `/connect`, `/login`) |
| `/doctor` | Mostrar verificações de autenticação e ambiente                      |

> [!note]
>
> O comando CLI independente `qwen auth` foi removido. Invocações legadas como `qwen auth status` exibem um aviso de remoção com orientações de migração. Consulte a página [Authentication](../configuration/auth) para detalhes completos.

## 2. Comandos @ (Introduzindo Arquivos)

Os comandos @ são usados para adicionar rapidamente o conteúdo de arquivos ou diretórios locais à conversa.

| Formato do Comando  | Descrição                                  | Exemplos                                         |
| ------------------- | ------------------------------------------ | ------------------------------------------------ |
| `@<file path>`      | Injeta o conteúdo do arquivo especificado  | `@src/main.py Please explain this code`          |
| `@<directory path>` | Lê recursivamente todos os arquivos de texto no diretório | `@docs/ Summarize content of this document`      |
| `@` isolado         | Usado ao discutir o próprio símbolo `@`    | `@ What is this symbol used for in programming?` |

Nota: Espaços nos caminhos precisam ser escapados com barra invertida (ex.: `@My\ Documents/file.txt`)

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Os comandos de exclamação permitem que você execute comandos do sistema diretamente dentro do Qwen Code.

| Formato do Comando | Descrição                                                        | Exemplos                               |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `!<shell command>` | Executa o comando em um sub-Shell                                | `!ls -la`, `!git status`               |
| `!` isolado        | Alterna para o modo Shell, qualquer entrada é executada diretamente como um comando Shell | `!`(enter) → Input command → `!`(exit) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts usados com frequência como comandos de atalho para melhorar a eficiência do trabalho e garantir consistência.

> [!note]
>
> Os comandos personalizados agora usam o formato Markdown com frontmatter YAML opcional. O formato TOML foi descontinuado, mas ainda é suportado para compatibilidade com versões anteriores. Quando arquivos TOML são detectados, um prompt de migração automática será exibido.

### Visão Geral Rápida

| Função         | Descrição                                | Vantagens                             | Prioridade | Cenários Aplicáveis                                 |
| -------------- | ---------------------------------------- | ------------------------------------- | ---------- | --------------------------------------------------- |
| Namespace      | Subdiretório cria comandos nomeados com dois pontos | Melhor organização de comandos        |            |                                                     |
| Comandos Globais | `~/.qwen/commands/`                    | Disponível em todos os projetos       | Baixa      | Comandos pessoais de uso frequente, uso entre projetos |
| Comandos do Projeto | `<project root directory>/.qwen/commands/` | Específicos do projeto, versionáveis | Alta       | Compartilhamento em equipe, comandos específicos do projeto |

Regras de Prioridade: Comandos do projeto > Comandos do usuário (o comando do projeto é usado quando os nomes são iguais)

### Regras de Nomenclatura de Comandos

#### Tabela de Mapeamento de Caminho de Arquivo para Nome de Comando

| Localização do Arquivo               | Comando Gerado    | Chamada de Exemplo    |
| ------------------------------------ | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`           | `/test`           | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit` | `/git:commit Message` |

Regras de Nomenclatura: O separador de caminho (`/` ou `\`) é convertido em dois pontos (`:`)

### Especificação de Formato de Arquivo Markdown (Recomendado)

Comandos personalizados usam arquivos Markdown com frontmatter YAML opcional:

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| Campo         | Obrigatório | Descrição                              | Exemplo                                    |
| ------------- | ----------- | -------------------------------------- | ------------------------------------------ |
| `description` | Opcional    | Descrição do comando (exibida em /help) | `description: Code analysis tool`          |
| Corpo do prompt | Obrigatório | Conteúdo do prompt enviado ao modelo   | Qualquer conteúdo Markdown após o frontmatter |

### Formato de Arquivo TOML (Descontinuado)

> [!warning]
>
> **Descontinuado:** O formato TOML ainda é suportado, mas será removido em uma versão futura. Por favor, migre para o formato Markdown.

| Campo         | Obrigatório | Descrição                              | Exemplo                                    |
| ------------- | ----------- | -------------------------------------- | ------------------------------------------ |
| `prompt`      | Obrigatório | Conteúdo do prompt enviado ao modelo   | `prompt = "Please analyze code: {{args}}"` |
| `description` | Opcional    | Descrição do comando (exibida em /help) | `description = "Code analysis tool"`       |

### Mecanismo de Processamento de Parâmetros

| Método de Processamento      | Sintaxe            | Cenários Aplicáveis                | Recursos de Segurança                  |
| ---------------------------- | ------------------ | ---------------------------------- | -------------------------------------- |
| Injeção Sensível ao Contexto | `{{args}}`         | Necessidade de controle preciso de parâmetros | Escape automático de Shell             |
| Processamento Padrão de Parâmetros | Sem marcação especial | Comandos simples, anexação de parâmetros | Anexar como está                       |
| Injeção de Comando Shell     | `!{command}`       | Necessidade de conteúdo dinâmico   | Confirmação de execução necessária antes |

#### 1. Injeção Sensível ao Contexto (`{{args}}`)

| Cenário          | Configuração TOML                       | Método de Chamada     | Efeito Real              |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Injeção Bruta    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| Em Comando Shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Executa `grep "hello" .` |

#### 2. Processamento Padrão de Parâmetros

| Situação de Entrada | Método de Processamento                      | Exemplo                                      |
| ------------------- | -------------------------------------------- | -------------------------------------------- |
| Possui parâmetros   | Anexa ao final do prompt (separado por duas quebras de linha) | `/cmd parameter` → Prompt original + parâmetro |
| Sem parâmetros      | Envia o prompt como está                     | `/cmd` → Prompt original                     |

🚀 Injeção de Conteúdo Dinâmico

| Tipo de Injeção     | Sintaxe        | Ordem de Processamento | Propósito                          |
| ------------------- | -------------- | ---------------------- | ---------------------------------- |
| Conteúdo do Arquivo | `@{file path}` | Processado primeiro    | Injeta arquivos de referência estáticos |
| Comandos Shell      | `!{command}`   | Processado no meio     | Injeta resultados de execução dinâmicos |
| Substituição de Parâmetros | `{{args}}` | Processado por último  | Injeta parâmetros do usuário       |

#### 3. Execução de Comando Shell (`!{...}`)

| Operação                        | Interação do Usuário |
| ------------------------------- | -------------------- |
| 1. Analisa comando e parâmetros | -                    |
| 2. Escape automático de Shell   | -                    |
| 3. Exibe diálogo de confirmação | ✅ Confirmação do usuário |
| 4. Executa o comando            | -                    |
| 5. Injeta a saída no prompt     | -                    |

Exemplo: Geração de Mensagem de Commit Git

````markdown
---
description: Gera mensagem de Commit com base nas alterações staged
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo | Status de Suporte      | Método de Processamento     |
| --------------- | ---------------------- | --------------------------- |
| Arquivos de Texto | ✅ Suporte Completo    | Injeta o conteúdo diretamente |
| Imagens/PDF     | ✅ Suporte Multimodal  | Codifica e injeta           |
| Arquivos Binários | ⚠️ Suporte Limitado  | Pode ser ignorado ou truncado |
| Diretório       | ✅ Injeção Recursiva   | Segue as regras do .gitignore |

Exemplo: Comando de Code Review

```markdown
---
description: Code review com base nas melhores práticas
---

Revise {{args}}, padrões de referência:

@{docs/code-standards.md}
```

### Exemplo Prático de Criação

#### Tabela de Etapas de Criação do Comando "Refatoração para Função Pura"

| Operação                      | Comando/Código                          |
| ----------------------------- | --------------------------------------- |
| 1. Criar estrutura de diretórios | `mkdir -p ~/.qwen/commands/refactor` |
| 2. Criar arquivo de comando   | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Editar conteúdo do comando | Consulte o código completo abaixo.      |
| 4. Testar comando             | `@file.js` → `/refactor:pure`           |

```markdown
---
description: Refatora código para função pura
---

Por favor, analise o código no contexto atual e refatore para uma função pura.
Requisitos:

1. Fornecer o código refatorado
2. Explicar as principais alterações e a implementação das características de função pura
3. Manter a função inalterada
```

### Resumo das Melhores Práticas para Comandos Personalizados

#### Tabela de Recomendações de Design de Comandos

| Práticas           | Abordagem Recomendada               | Evitar                                      |
| ------------------ | ----------------------------------- | ------------------------------------------- |
| Nomenclatura de Comandos | Usar namespaces para organização | Evitar nomes excessivamente genéricos       |
| Processamento de Parâmetros | Usar `{{args}}` de forma clara  | Confiar na anexação padrão (fácil de confundir) |
| Tratamento de Erros | Utilizar a saída de erro do Shell  | Ignorar falha de execução                   |
| Organização de Arquivos | Organizar por função em diretórios | Todos os comandos no diretório raiz         |
| Campo de Descrição | Sempre fornecer uma descrição clara | Confiar na descrição gerada automaticamente |
#### Tabela de Resumo dos Recursos de Segurança

| Mecanismo de Segurança   | Efeito de Proteção             | Operação do Usuário          |
| ------------------------ | ------------------------------ | ---------------------------- |
| Escape de Shell          | Previne injeção de comandos    | Processamento automático     |
| Confirmação de Execução  | Evita execução acidental       | Confirmação via diálogo      |
| Relatório de Erros       | Ajuda a diagnosticar problemas | Visualizar informações de erro |

## 5. Subcomandos da CLI

Estes comandos são executados a partir do shell como `qwen <subcomando>` antes de iniciar uma sessão interativa.

### Gerenciamento de Sessões

| Comando              | Descrição                           | Exemplos de Uso                                              |
| -------------------- | --------------------------------- | ------------------------------------------------------------ |
| `qwen sessions list` | Lista sessões de conversa recentes | `qwen sessions list`, `qwen sessions list --json --limit 50` |
| `qwen sessions ps`   | Lista sessões interativas em execução agora | `qwen sessions ps`, `qwen sessions ps --json`                |
| `qwen sessions controllers` | Gerenciar tokens de controlador confiáveis            | `qwen sessions controllers add --label <name>`, `qwen sessions controllers list` |

#### `qwen sessions list`

Lista suas sessões recentes do Qwen Code com metadados.

**Flags:**

| Flag      | Tipo    | Padrão  | Descrição                                       |
| --------- | ------- | ------- | ----------------------------------------------- |
| `--json`  | boolean | `false` | Saída como JSON Lines (um objeto JSON por linha)|
| `--limit` | number  | `20`    | Número máximo de sessões a exibir               |

**Saída legível por humanos (padrão):**

Uma tabela com as colunas: SESSION ID, STARTED (timestamp UTC), TITLE, BRANCH, PROMPT.

**Saída em JSON (`--json`):**

Gera JSON Lines no stdout. Cada linha é um objeto JSON com os campos:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

O aviso de "has more sessions" é emitido via stderr para que o pipe para `jq` permaneça seguro.

**Exemplos:**

```bash
# Mostra as últimas 20 sessões (padrão)
qwen sessions list

# Mostra as últimas 50 sessões
qwen sessions list --limit 50

# Saída em JSON para scripts
qwen sessions list --json | jq .
```

#### `qwen sessions ps`

Lista as sessões interativas do Qwen Code em execução nesta máquina agora.
`sessions list` percorre transcrições salvas ("no que eu trabalhei");
este percorre o registro de processos ativos ("o que está executando neste momento").
Registros deixados por uma sessão encerrada são varridos conforme encontrados.
Sessões headless (`qwen -p`) não se registram no registro de processos ativos,
então não são mostradas.

**Flags:**

| Flag     | Tipo    | Padrão  | Descrição                                       |
| -------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | Saída como JSON Lines (um objeto JSON por linha)|

**Saída legível por humanos (padrão):**

Uma tabela com as colunas: NAME, KIND, PID, AGE, DIRECTORY.

KIND indica o que registrou a sessão — `tui` para alguém em um terminal, `external` para um programa que não é uma sessão do Qwen Code (um front-end de voz, um relay) e `headless` ou `serve` para uma sessão controlada por outro programa. Várias linhas `serve` ou `headless` podem compartilhar um único PID: um filho `qwen --acp` hospeda todas as suas sessões em um processo — `serve` quando o daemon o iniciou, `headless` quando um cliente o controla diretamente — e cada uma delas se registra separadamente. É um autorrelato, assim como NAME e DIRECTORY: cada campo aqui foi escrito pelo processo que descreve, e nada sobre o que uma sessão pode fazer depende disso. Consulte o [Cross-Session Protocol](./cross-session-protocol.md) para o formato do registro e como registrar seu próprio programa.

**Saída em JSON (`--json`):**

Gera JSON Lines no stdout, com a sessão mais recente primeiro. Cada linha é um
objeto JSON com os campos:

```
schemaVersion, pid, procStart, pidNs, sessionId, cwd, name, startedAt,
qwenVersion, kind, ipcPath (quando peer messaging está disponível)
```

Nada mais é escrito no stdout — uma listagem vazia não imprime nada — então
`qwen sessions ps --json | jq .` é seguro para scripts.

A saída em JSON são dados brutos: os valores dos campos são emitidos exatamente
como gravados, sem sanitização de terminal. Trate-os como dados e sanitize antes
de renderizá-los em um terminal.

**Exemplos:**

```bash
# Mostra as outras sessões ativas
qwen sessions ps

# Quais diretórios estão ocupados agora?
# Nota: `jq -r` renderiza o valor bruto gravado no seu terminal (veja a
# nota de dados brutos acima); pipe através de um sanitizador se o caminho não for confiável.
qwen sessions ps --json | jq -r .cwd
```

## 6. Enviando Mensagens para Outra Sessão em Execução

Duas sessões interativas na mesma máquina podem enviar mensagens uma para a outra. O recurso é experimental e **desativado por padrão**; ative-o em `settings.json` e reinicie:

```json
{ "agents": { "crossSessionMessaging": true } }
```

Uma vez ativado, o modelo em uma sessão pode descobrir as outras com `list_agents` — cada uma aparece sob `sessions` com o `name` que `qwen sessions ps --json` registra (a visualização em tabela pode truncar nomes longos) — e endereçar uma com `send_message` usando esse nome como `to`. Quando duas sessões compartilham um nome, `list_agents` mostra cada uma com um curto `[ref]` e o envio deve incluí-lo (`name [ref]`); um nome simples que poderia significar qualquer uma é recusado em vez de adivinhado. `list_agents` também reporta o nome da própria sessão sob `self`, e `to: "*"` ainda significa "meus colegas da Agent Team" e nunca alcança outras sessões.

Uma mensagem chega na outra sessão marcada como vindo de outra sessão, não do seu usuário, e não carrega nenhuma de suas autoridades lá: a sessão receptora age sobre ela apenas dentro de suas próprias configurações de permissão. Seu usuário pode escolher o que acontece com mensagens recebidas usando `agents.crossSessionInbound` (`accept`, `hold` ou `refuse`). Quando não definido, uma mensagem é entregue apenas quando ambas as sessões estão na mesma classe de revisão: ambas ainda revisam cada ação (modo default ou plan), ou ambas estão em um modo que aplica algumas ações sem revisão por ação (auto-edit, auto ou yolo). Uma mensagem de uma sessão na outra classe, ou de um remetente que não informa em qual classe está, é mantida para revisão — em ambas as direções. Uma sessão que revisa cada ação mantém uma mensagem de uma que não revisa, porque essa mensagem foi escrita por um modelo que ninguém estava observando, e os prompts por ação protegem as ações, não o que a sessão está sendo levada a fazer. Mensagens mantidas são listadas e liberadas com `/peers` na sessão receptora, e uma mensagem mantida apenas porque os modos diferiam é liberada automaticamente quando eles concordam.

Um repositório pode tornar as sessões abertas nele mais cautelosas, nunca menos: um `.qwen/settings.json` de workspace pode definir `agents.crossSessionInbound` como `hold` ou `refuse`, ou `agents.crossSessionMessaging` como `false`, e esse valor prevalece sobre um valor mais permissivo nas suas configurações de usuário. Um valor de workspace que tornaria sua configuração mais permissiva (`accept`, ou `true` para o switch) é ignorado com um aviso, e um valor que a CLI não reconhece mantém toda mensagem quando é o valor efetivo. Configurações de sistema sobrescrevem tudo isso, como fazem para toda configuração.

Uma retenção não espera para sempre. Uma mensagem sobre a qual ninguém decide expira após `agents.crossSessionHeldExpiry` — `1m`, `5m`, `10m` ou `never`, cinco minutos por padrão — e a sessão remetente é informada de que nenhuma decisão foi tomada. Encurtar a configuração se aplica a mensagens já em espera.

Se a sessão não puder vincular sua caixa de entrada — o diretório do runtime estiver faltando, pertencer a outro usuário ou ser somente leitura, como pode acontecer dentro de um container — ela primeiro tenta um diretório privado sob o diretório temporário, e apenas se isso também falhar é que inicia sem uma. Quando isso acontece, a sessão informa isso na inicialização, e `/peers` repete o motivo e o que mudar (geralmente `XDG_RUNTIME_DIR` ou `TMPDIR`).

Duas sessões também podem resolver o mesmo endereço de caixa de entrada, porque o endereço é chaveado por pid de processo e pids de processo se repetem entre containers que compartilham um diretório de runtime. A sessão que inicia segundo pega um endereço vizinho em vez de tomar o que está em uso, então nenhuma se torna inalcançável. Os pares não são afetados: eles leem o endereço de uma sessão a partir do registro de sessões em vez de derivá-lo.

A chamada `send_message` apenas confirma que a mensagem foi entregue à outra sessão. O que aconteceu com ela chega mais tarde como um recibo: se foi mantida, recusada, rejeitada, descartada, expirou ou endereçada incorretamente (o endereço mudou de mãos — liste os agentes novamente) — ou liberada após uma retenção — um aviso aparece na transcrição da sessão remetente (`Message to <name>: …`). Recusada, rejeitada e descartada são três respostas diferentes: recusada significa que alguém revisou a mensagem e disse não, rejeitada significa que o `agents.crossSessionInbound` daquela sessão é `refuse` e ninguém a viu, e descartada significa que sua caixa de entrada recusou a mensagem antes de qualquer disso (veja abaixo). O primeiro descarte é respondido imediatamente e os demais são agrupados em um recibo a cada poucos segundos, cada um nomeando as mensagens que representa, então uma sequência deles custa algumas linhas em vez de uma linha cada. O modelo que a enviou não é informado; se a outra sessão responder, a resposta chega como uma mensagem entre sessões.

### Proteção contra inundação

Uma sessão aceita até 30 mensagens de uma vez de um único remetente e depois uma a cada dois segundos, e até 32 de uma vez de todos os remetentes juntos e depois uma por segundo. O segundo limite existe porque um remetente se identifica pelo nome: alternar esse nome obtém uma nova cota do primeiro limite, mas não do segundo. É pouco acima do primeiro porque cada mensagem aceita gera um recibo, e uma sessão só pode ter tantos sendo enviados de uma vez. Uma mensagem de outra sessão que repete a mensagem anterior do mesmo remetente palavra por palavra dentro de 30 segundos também é recusada — um modelo em loop em uma única frase cria um novo id de mensagem a cada vez, então é o texto que o detecta. Mensagens de um script que a sessão iniciou e de um controlador confiável são isentas da verificação de repetição, porque um hook reportando a mesma linha duas vezes está reportando dois fatos e uma pessoa dizendo "continue" duas vezes significa duas vezes; ambas ainda estão sujeitas aos limites de taxa. Por fim, uma mensagem que é aceita mas não pode ser enfileirada porque a sessão já tem 50 em espera também é recusada.

Uma mensagem recusada dessa forma nunca é mantida, nunca é mostrada ao modelo e não deixa registro, então o remetente pode tentar novamente mais tarde e conseguir. A sessão receptora informa isso em sua transcrição no máximo uma vez por minuto por remetente, com uma contagem do que aquela linha representa. A sessão remetente recebe um recibo nomeando cada mensagem que a explosão custou, e sua transcrição diz para consolidar o que ainda importa em uma mensagem posterior em vez de reenviar.

O lado remetente não espera para descobrir. Cada sessão rastreia o que enviou para cada endereço e recusa um envio que o receptor descartaria, então o modelo é instruído a agrupar antes da mensagem ser escrita, não depois — e o receptor nunca gasta uma conexão em uma mensagem que iria recusar.

### Autenticação de caixa de entrada e injeção via script

A caixa de entrada de cada sessão requer um token por sessão: uma conexão deve apresentá-lo na primeira linha antes que qualquer mensagem seja lida, e as sessões trocam tokens automaticamente através dos mesmos registros de registro pelas quais se descobrem. Sessões de uma build sem suporte a token podem receber de uma mais nova, mas seus envios para ela são descartados.

Uma sessão exporta seu próprio endereço de caixa de entrada e um token para processos filhos como `QWEN_CODE_MESSAGING_SOCKET` e `QWEN_CODE_MESSAGING_TOKEN`, então um script ou hook que a sessão executa pode enviar uma mensagem de volta para ela. Este é um segundo token _filho_ que nunca é publicado em nenhum lugar: apenas processos que a sessão iniciou podem segurá-lo, então uma mensagem que chega com ele é reconhecida como da própria sessão em vez de ser de outra sessão.

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CODE_MESSAGING_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"build finished"}}'; \
} | socat - UNIX-CONNECT:"$QWEN_CODE_MESSAGING_SOCKET"
```

Dê a cada injeção um `msgId` fresco. O gate receptor lembra os ids que já liquidou, então um hook que reutiliza um é entregue na primeira vez e silenciosamente deduplicado em cada execução depois disso. Repetir o mesmo _texto_ é permitido — a verificação de repetição acima não se aplica aos processos da própria sessão — mas os limites de taxa se aplicam, então um hook em loop é descartado como qualquer outra inundação.

Uma mensagem injetada ainda passa pelo gate de entrada e é marcada como não vindo do usuário, mas o gate sabe que veio do próprio processo da sessão: sob o padrão de paridade de modo ela é entregue sem revisão (um par na mesma posição seria mantido), enquanto um `agents.crossSessionInbound` explícito de `hold` ou `refuse` se aplica a ela como a qualquer outra coisa. O modelo a vê como `<cross_session_message from="own process" origin="own-process">` com um aviso de que veio de um script ou hook que a sessão executou, não do usuário.

### Controladores confiáveis

A regra acima mantém uma mensagem de qualquer remetente que não diz em qual classe de revisão está, e um programa que não é uma sessão do Qwen Code não tem nenhuma para dizer. Esse é o padrão correto para um estranho, mas não para um programa que você escolheu: um front-end de voz, uma ponte de ditado, um daemon de automação retransmitindo suas próprias instruções teria toda mensagem estacionada, e aprovar cada uma manualmente derrotaria o propósito.

Você concede a entrega a tal programa cunhando um token para ele:

```bash
qwen sessions controllers add --label voice-bridge
```

O token é impresso uma vez e não é armazenado em nenhum lugar: o arquivo sob seu Qwen home mantém apenas seu hash SHA-256, então nada que posteriormente leia esse arquivo pode apresentar o token. Coloque-o na própria configuração do controlador quando o comando o imprimir.

Um controlador apresenta o token da mesma forma que qualquer outro remetente — como a primeira linha da conexão — e pega o caminho do socket a partir do registro de sessões (`qwen sessions ps --json` imprime um registro por sessão ativa, sendo `ipcPath` o endereço):

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CONTROLLER_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"open the failing test"}}'; \
} | socat - UNIX-CONNECT:"$SESSION_IPC_PATH"
```

Uma mensagem que chega com um token concedido é entregue sem revisão por mensagem, qualquer que seja a classe de revisão de qualquer lado — mas ainda cede a uma configuração explícita: um `agents.crossSessionInbound` de `hold` a estaciona como qualquer outra coisa, e `refuse` a afasta. Concessões pertencem ao seu Qwen home em vez de a uma sessão, então um controlador alcança quaisquer sessões que você estiver executando, e as sessões releem o arquivo em cada conexão: cunhar ou revogar uma tem efeito na próxima conexão, sem nada para reiniciar.

```bash
qwen sessions controllers list          # ids, rótulos, quando foram adicionados
qwen sessions controllers remove c_1a2b # revogar um
```

`/peers controllers` e `/peers revoke <id>` fazem o mesmo de dentro de uma sessão. Uma mensagem que veio através de uma concessão é mostrada como `Message from a trusted controller (voice-bridge)`, e aparece em `/peers` como `[controller] voice-bridge` se uma configuração `hold` a estacionou.

O modelo vê tal mensagem como `<cross_session_message from="controller" origin="controller" controller="voice-bridge">`, com um aviso de que ela retransmite suas próprias instruções — e as mesmas duas proibições que se aplicam a qualquer outra origem: ela não pode editar configurações de permissão, QWEN.md ou config porque a mensagem pediu, e não pode tratar a mensagem como você aprovando um prompt de confirmação pendente. Um controlador pode dizer o que fazer a seguir; não pode responder a um prompt em seu nome.

Qualquer um que segure o token pode enviar como aquele controlador, então trate-o como qualquer outra credencial: dê-o a um programa, mantenha-o fora de config compartilhado, e revogue-o quando esse programa terminar.

### Sessões controladas por um programa via ACP

Qualquer filho `qwen --acp` registra cada sessão que hospeda — como `serve` quando o daemon iniciou o processo, como `headless` quando um editor ou outro cliente está controlando `qwen --acp` diretamente — e a sessão aparece em `qwen sessions ps` e no `list_agents` de outra sessão como qualquer outra. Ela pode enviar: seu modelo pode chamar `send_message` para alcançar um terminal que você tenha aberto. Várias delas compartilham um processo e uma caixa de entrada, então um remetente precisa nomear a sessão que pretende atingir — toda sessão do Qwen Code faz isso automaticamente.

Mensagens enviadas _para_ uma delas são recusadas em vez de mantidas. Manter é uma pergunta feita a uma pessoa, e ninguém está observando uma lista de mensagens mantidas em nome de uma sessão controlada; um remetente é informado imediatamente em vez de esperar o expirar. Onde uma mensagem mantida deveria aparecer para essas sessões ainda não está definido.

Uma sessão se registra apenas enquanto suas próprias configurações tiverem `agents.crossSessionMessaging` ativado. Com ele desativado, ela permanece invisível, porque a única razão para listar uma sessão que ninguém pode enviar mensagens seria anunciar um endereço que nunca responde.

### Programas que não são sessões do Qwen Code

Tudo acima funciona entre sessões, mas nada disso é específico a uma. Um programa que escreve um registro no registro para si mesmo e vincula uma caixa de entrada da mesma forma é listado pelo `qwen sessions ps` e pelo `list_agents`, pode ser endereçado por nome a partir do `send_message` e recebe recibos de entrega para o que envia — um front-end de voz, um relay, um observador de build. Ele deve registrar `kind: "external"` para que uma listagem possa dizer o que ele é.

O [Cross-Session Protocol](./cross-session-protocol.md) é o contrato para escrever um: o schema do registro e como a atividade é julgada, os caminhos de socket e enquadramento, a linha de autenticação, cada campo de frame, os estados de recibo e suas transições, e o que um receptor faz com uma mensagem antes que seu modelo a veja.

Um programa Node não precisa escrever nada disso à mão: `@qwen-code/sdk/peer` implementa o contrato. `PeerEndpoint.start({ name })` publica o registro e vincula a caixa de entrada, `list()` e `send()` endereçam sessões por nome, e `onMessage` recebe o que elas enviam.