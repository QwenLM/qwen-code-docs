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
| `/commit` | Cria um commit do git com uma mensagem redigida pela IA | `/commit` ou `/commit only stage the parser changes` |

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

| Comando | Descrição | Exemplos de Uso |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `/mcp` | Lista os servidores e ferramentas MCP configurados | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema` |
| `/import-config` | Importa servidores MCP das configurações do Claude | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools` | Exibe a lista de ferramentas atualmente disponíveis | `/tools`, `/tools desc` |
| `/skills` | Abre o painel de Skills para navegar, buscar, ativar/desativar e iniciar skills | `/skills`, `/<skill-name>` |
| `/learn` | Cria uma skill de projeto reutilizável a partir de um arquivo, diretório, URL, vídeo ou texto | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment` |
| `/curator` | Inspeciona, fixa, arquiva ou restaura auto-skills de projeto inativas | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>` |
| `/plan` | Alterna para o modo de planejamento ou sai do modo de planejamento | `/plan`, `/plan <task>`, `/plan exit` |
| `/approval-mode` | Altera o modo de aprovação de ferramentas (apenas na sessão atual) | `/approval-mode`, `/approval-mode auto-edit` |
| → `plan` | Apenas análise, sem execução (revisão segura) | `/approval-mode plan` |
| → `default` | Exige aprovação para edições (uso diário) | `/approval-mode default` |
| → `auto-edit` | Aprova automaticamente edições (ambiente confiável) | `/approval-mode auto-edit` |
| → `auto` | Aprovação avaliada por classificador (autônomo) | `/approval-mode auto` |
| → `yolo` | Aprova tudo automaticamente (prototipagem rápida) | `/approval-mode yolo` |
| `/peers` | Revisa mensagens de pares retidas; gerencia controladores confiáveis | `/peers`, `/peers accept <id>`, `/peers deny all`, `/peers controllers`, `/peers revoke <id>` |
| `/model` | Alterna o modelo usado na sessão atual | `/model`, `/model <model-id>` (alterna imediatamente) |
| `/model --fast` | Define um modelo mais leve para sugestões de prompt | `/model --fast qwen3-coder-flash` |
| `/model --voice` | Define o modelo usado para transcrição de voz | `/model --voice <model-id>` |
| `/model --vision` | Define o modelo de ponte de visão usado para transcrever imagens para um modelo principal apenas de texto | `/model --vision <model-id>` |
| `/model --compaction` | Define o modelo usado para compressão de chat | `/model --compaction <model-id>`, `/model --compaction clear` |
| `/model --image` | Define um modelo capaz de gerar imagens para a ferramenta integrada de geração de imagens | `/model --image <model-id>` |
| `/effort` | Define o esforço de raciocínio para modelos com capacidade de pensamento | `/effort` (abre seletor), `/effort high` (low/medium/high/xhigh/max; mapeado e limitado por provedor) |
| `/output-style` | Escolhe o estilo de saída que molda como as respostas são escritas | `/output-style` (abre seletor), `/output-style Concise`, `/output-style default` (sem estilo) |
| `/extensions` | Gerencia extensões | `/extensions list`, `/extensions manage` |
| → `list` | Lista extensões instaladas | `/extensions list` |
| → `manage` | Gerencia extensões instaladas (interativo) | `/extensions manage` |
| → `explore` | Abre a página de extensões no navegador | `/extensions explore <Gemini\|ClaudeCode>` |
| → `install` | Instala uma extensão de um repositório git ou caminho | `/extensions install <repo-or-path>` |
| `/memory` | Abre o diálogo do Gerenciador de Memória | `/memory` |
| `/remember` | Salva uma memória duradoura | `/remember Prefer terse responses` |
| `/forget` | Remove entradas correspondentes da auto-memória | `/forget <query>` |
| `/dream` | Executa manualmente a consolidação da auto-memória | `/dream` |
| `/hooks` | Gerencia hooks do Qwen Code | `/hooks`, `/hooks list` |
| `/reload-plugins` | Recarrega alterações de extensões (comandos, skills, agentes, workflows, hooks, servidores MCP/LSP) do disco | `/reload-plugins` |
| `/permissions` | Gerencia regras de permissão | `/permissions` |
| `/agents` | Gerencia subagentes | `/agents manage`, `/agents create` |
| `/arena` | Gerencia sessões Arena | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (alias `choose`) |
| `/goal` | Define uma Meta — continua trabalhando até que um verificador confirme (veja [Metas](./goals.md)) | `/goal <objective>`, `/goal edit <objective>`, `/goal pause`, `/goal resume`, `/goal clear` |
| `/tasks` | Lista tarefas em segundo plano | `/tasks` |
| `/workflows` | Inspeciona execuções de workflow; pausa/retoma cooperativamente uma execução em segundo plano | `/workflows`, `/workflows <runId>`, `/workflows p <runId>` |
| `/lsp` | Mostra o status do servidor LSP | `/lsp` |
| `/trust` | Gerencia configurações de confiança de pastas | `/trust` |

> [!warning]
>
> Instale apenas extensões (`/extensions install`) de fontes nas quais você confia. As extensões podem incluir servidores MCP, skills e comandos que executam com as mesmas permissões do próprio Qwen Code — eles podem acessar seus arquivos, chaves de API e dados de conversa. Também podem incluir scripts de workflow, que executam no sandbox de workflow sem acesso direto a arquivos ou shell, agem através dos subagentes que iniciam e passam pela aprovação da ferramenta Workflow. `/extensions install` não solicita confirmação.

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

| Comando | Descrição | Exemplos de Uso |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/review` | Revisão de código multi-agente (12 agentes paralelos com alto esforço) | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low` |
| `/coordinate` | Coordena trabalhadores somente-leitura e um escritor opcional de worktree | `/coordinate investigate and fix the authentication regression` |
| `/loop` | Executa um prompt em um cronograma recorrente | `/loop 5m check the build` |
| `/goal-draft` | Transforma uma intenção vaga em um objetivo `/goal` verificável | `/goal-draft make the auth tests pass` |
| `/autofix-pr` | Monitora um PR e corrige seu CI, feedback de revisão e conflitos | `/autofix-pr 123`, `/autofix-pr 123 --once`, `/autofix-pr resume`, `/autofix-pr stop 123` |
| `/simplify` | Revisa mudanças recentes e aplica edições de limpeza seguras diretamente | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper` | Responde perguntas sobre uso e configuração do Qwen Code | `/qc-helper how do I configure MCP?` |

Veja [Revisão de Código](./code-review.md) para documentação completa de `/review`, e [Autofix de um Pull Request](./autofix-pr.md) para `/autofix-pr`.

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
(While the main conversation is about refactoring code)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

(After the answer arrives)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` is block-scoped, while `var` is    │
  │ function-scoped. `let` was introduced    │
  │ in ES6 and doesn't hoist the same way.   │
  │                                          │
  │ Press Space, Enter, or Escape to dismiss │
  ╰──────────────────────────────────────────╯
  > (Composer still active)
```

**Modos de Execução Suportados:**

| Modo | Comportamento |
| -------------------- | -------------------------------------------- |
| Interativo | Mostra acima do Composer com renderização Markdown |
| Non-interactive      | Retorna o resultado em texto: `btw> question\nanswer` |
| ACP (Agent Protocol) | Retorna o gerador assíncrono stream_messages |

> [!tip]
>
> Use `/btw` quando precisar de uma resposta rápida sem desviar do seu foco principal. É especialmente útil para esclarecer conceitos, verificar fatos ou obter explicações rápidas enquanto mantém o foco no seu fluxo de trabalho principal.

### 1.7 Segunda Opinião (`/advisor`) [#17-second-opinion-advisor]

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

O comando `/recap` gera um breve resumo de "onde você parou" da sessão atual, para que você possa retomar uma conversa antiga sem rolar por páginas de histórico.

| Comando | Descrição |
| -------- | ------------------------------------------ |
| `/recap` | Gerar e mostrar um resumo da sessão em uma linha |

**Como funciona:**

- Usa o modelo rápido configurado (configuração `fastModel`) quando disponível, recorrendo ao modelo principal da sessão como alternativa. Um modelo pequeno e barato é suficiente para um resumo.
- A conversa recente (até 30 mensagens, apenas texto — chamadas de ferramentas e respostas de ferramentas são filtradas) é enviada ao modelo com um prompt de sistema conciso.
- O resumo é renderizado em cor esmaecida com um prefixo `❯` para se destacar das respostas reais do assistente.
- Recusa com um erro inline se um turno do modelo estiver em andamento ou outro comando estiver sendo processado. Se não houver conversa utilizável, ou se a geração subjacente falhar, `/recap` mostra uma breve mensagem informativa em vez de um resumo — o comando manual sempre responde com algo.

**Gatilho automático ao retornar após estar ausente:**

Se o terminal ficar desfocado por **5+ minutos** e for focado novamente, um resumo é gerado e exibido automaticamente (somente quando nenhuma resposta do modelo está em andamento; caso contrário, ele aguarda o turno atual terminar e então dispara). Diferentemente do comando manual, o disparo automático é totalmente silencioso em caso de falha: se a geração apresentar erros ou não houver nada para resumir, nenhuma mensagem é adicionada ao histórico. Controlado pela configuração `general.showSessionRecap` (padrão: `false`); o comando manual `/recap` sempre funciona independentemente desta configuração.

**Exemplo:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> Configure um modelo rápido via `/model --fast <model>` (ex.: `qwen3-coder-flash`) para tornar `/recap` rápido e barato. Defina `general.showSessionRecap` como `true` para habilitar o disparo automático; o comando manual `/recap` sempre funciona independentemente desta configuração.

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
| `/logout` | Sair da conta ativa da Qwen Subscription (disponível com login na Qwen Subscription) | `/logout` |
| `/upgrade` | Abrir planos de assinatura da Qwen (disponível com login na Qwen Subscription) | `/upgrade` |
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

No prompt interativo, a conclusão `@` suporta nomes de arquivos Unicode, incluindo emojis. Emojis em outros lugares do prompt não alteram o caminho do arquivo usado para a conclusão.

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Os comandos de exclamação permitem que você execute comandos do sistema diretamente dentro do Qwen Code.

| Formato do Comando | Descrição                                                        | Exemplos                               |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `!<shell command>` | Executa o comando em um sub-Shell                                | `!ls -la`, `!git status`               |
| `!` isolado        | Alterna para o modo Shell, qualquer entrada é executada diretamente como um comando Shell | `!`(enter) → Input command → `!`(exit) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados [#4-custom-commands]

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

| Operação | Interação do Usuário |
| ------------------------------- | -------------------- |
| 1. Analisar comando e parâmetros | - |
| 2. Escapamento automático do Shell | - |
| 3. Mostrar diálogo de confirmação | ✅ Confirmação do usuário |
| 4. Executar comando | - |
| 5. Injetar saída no prompt | - |

Exemplo: Geração de Mensagem de Commit do Git

````markdown
---
description: Generate Commit message based on staged changes
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo | Status de Suporte | Método de Processamento |
| ------------ | ---------------------- | --------------------------- |
| Arquivos de Texto | ✅ Suporte Completo | Injeta conteúdo diretamente |
| Imagens/PDF | ✅ Suporte Multimodal | Codifica e injeta |
| Arquivos Binários | ⚠️ Suporte Limitado | Pode ser ignorado ou truncado |
| Diretório | ✅ Injeção Recursiva | Segue regras do .gitignore |

Exemplo: Comando de Revisão de Código

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### Exemplo Prático de Criação

#### Tabela de Etapas de Criação do Comando "Refatoração de Função Pura"

| Operação | Comando/Código |
| ----------------------------- | ----------------------------------------- |
| 1. Criar estrutura de diretórios | `mkdir -p ~/.qwen/commands/refactor` |
| 2. Criar arquivo de comando   | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Editar conteúdo do comando | Consulte o código completo abaixo.      |
| 4. Testar comando             | `@file.js` → `/refactor:pure`           |

```markdown
---
description: Refactor code to pure function
---

Please analyze code in current context, refactor to pure function.
Requirements:

1. Provide refactored code
2. Explain key changes and pure function characteristic implementation
3. Maintain function unchanged
```

### Resumo das Melhores Práticas para Comandos Personalizados

#### Tabela de Recomendações de Design de Comandos

| Pontos de Prática | Abordagem Recomendada | Evitar |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nomeação de Comandos | Use namespaces para organização | Evite nomes excessivamente genéricos |
| Processamento de Parâmetros | Usar `{{args}}` de forma clara  | Confiar na anexação padrão (fácil de confundir) |
| Tratamento de Erros | Utilize a saída de erro do Shell | Ignore falhas de execução |
| Organização de Arquivos | Organize por função em diretórios | Todos os comandos no diretório raiz |
| Campo de Descrição | Sempre forneça uma descrição clara | Dependa de descrições geradas automaticamente |

#### Tabela de Lembretes de Recursos de Segurança

| Mecanismo de Segurança | Efeito de Proteção | Operação do Usuário |
| ---------------------- | -------------------------- | ---------------------- |
| Escapamento do Shell | Previne injeção de comandos | Processamento automático |
| Confirmação de Execução | Evita execução acidental | Confirmação via diálogo |
| Relatórios de Erro | Ajuda a diagnosticar problemas | Visualizar informações de erro |

## 5. Subcomandos CLI

Estes comandos são executados pelo shell como `qwen <subcommand>` antes de iniciar uma sessão interativa.

### Gerenciamento de Sessões

| Comando | Descrição | Exemplos de Uso |
| --------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
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
# Show last 20 sessions (default)
qwen sessions list

# Show last 50 sessions
qwen sessions list --limit 50

# Output as JSON for scripting
qwen sessions list --json | jq .
```

#### `qwen sessions ps`

Lista os registros de sessões do Qwen Code visíveis nesta máquina. `sessions list` percorre transcrições salvas ("no que eu trabalhei"). Este comando mostra tanto o registro de processos ativos quanto os registros do Agent View marcados como `managed`. Registros deixados por uma sessão encerrada abruptamente são removidos do registro à medida que são encontrados. Um registro gerenciado é uma contabilidade persistente, não evidência de que seu worker ainda está vivo. Uma execução única `qwen -p` nunca se registra e não é mostrada.

**Flags:**

| Flag | Tipo | Padrão | Descrição |
| -------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | Saída como JSON Lines (um objeto JSON por linha) |

**Saída legível por humanos (padrão):**

Uma tabela com colunas: NAME, KIND, PID, AGE, DIRECTORY.

KIND indica o que registrou a sessão — `tui` para alguém em um terminal, `external` para um programa que não é uma sessão do Qwen Code (uma interface de voz, um relay), e `headless` ou `serve` para uma sessão dirigida por outro programa. Várias linhas `serve` ou `headless` podem compartilhar um PID: um filho `qwen --acp` hospeda todas as suas sessões em um processo — `serve` quando o daemon o iniciou, `headless` quando um cliente o dirige diretamente — e cada um deles se registra separadamente quando a comunicação entre pares está ativa. Uma sessão hospedada não se registra aqui quando seu próprio ambiente a coloca em modo bare ou safe. O `--bare` de um daemon não alcança as sessões que ele hospeda (`QWEN_CODE_SIMPLE` é removido do ambiente do filho); um `QWEN_CODE_SAFE_MODE` herdado sim, mantendo essas sessões hospedadas fora desta listagem. É um autorrelato, assim como NAME e DIRECTORY: todos os campos aqui foram escritos pelo processo que descrevem, e nada sobre o que uma sessão pode fazer depende disso. Um registro do Agent View marcado como `managed` usa `managed` para KIND e `-` para PID e AGE. Ele permanece como uma linha separada quando a mesma sessão também possui um registro ativo no registro. Veja [Protocolo Entre Sessões](./cross-session-protocol.md) para o formato do registro e para saber como registrar um programa seu.

**Saída em JSON (`--json`):**

Emite JSON Lines na saída padrão com registros gerenciados primeiro. Registros do registro mantêm sua estrutura existente:

```
schemaVersion, pid, procStart, pidNs, sessionId, cwd, name, startedAt,
qwenVersion, kind, ipcPath (when peer messaging is available)
```

Um registro gerenciado contém apenas dados respaldados pela fonte:

```
sessionId, cwd, managed: true
```

Nada mais é escrito na saída padrão — uma listagem vazia não imprime nada — então `qwen sessions ps --json | jq .` é seguro para scripts. Se o armazenamento do supervisor não puder ser lido, os registros do registro ainda são impressos e o motivo é escrito na saída de erro padrão.

A saída JSON é dados brutos: os valores dos campos são emitidos exatamente como registrados, sem sanitização de terminal. Trate-os como dados e sanitize antes de exibi-los em um terminal.

**Exemplos:**

```bash
# Show the other live sessions
qwen sessions ps

# Which directories have a visible session record?
# Note: `jq -r` renders the raw recorded value in your terminal (see the
# raw-data note above); pipe through a sanitizer if the path is untrusted.
qwen sessions ps --json | jq -r .cwd
```

## 6. Mensagens para Outra Sessão em Execução [#6-messaging-another-running-session]

Duas sessões interativas na mesma máquina podem enviar mensagens uma para a outra. O recurso está **habilitado por padrão**, mas `--bare` e `--safe-mode` o desabilitam independentemente da configuração. Com uma caixa de entrada de escuta, uma sessão é descoberta pelas outras sessões do mesmo usuário na máquina, e o que elas enviam passa pelas regras de revisão abaixo antes que seu modelo veja qualquer parte dela. Para desabilitar a descoberta e a comunicação entre pares, desligue-a em `settings.json` e reinicie:

```json
{ "agents": { "crossSessionMessaging": false } }
```

Uma sessão interativa com comunicação entre pares desabilitada ainda pode aparecer em `qwen sessions ps`, mas não tem `ipcPath` e não é um par acessível em `list_agents`. A interface OpenTUI também não vincula uma caixa de entrada de pares; habilitar a configuração sozinho não a torna mensageira.

Com a troca de mensagens ativa, o modelo em uma sessão pode descobrir as outras com `list_agents` — cada uma aparece sob `sessions` com o `name` que `qwen sessions ps --json` registra (a visualização de tabela pode truncar nomes longos) — e direcionar uma delas com `send_message` usando esse nome como `to`. Quando duas sessões compartilham um nome, `list_agents` mostra cada uma com um curto `[ref]` e o envio deve incluí-lo (`name [ref]`); um nome simples que poderia significar qualquer uma das duas é recusado em vez de ser adivinhado. `list_agents` também relata o próprio nome da sessão sob `self`, e `to: "*"` ainda significa "meus colegas do Agent Team" e nunca alcança outras sessões.

Uma mensagem chega na outra sessão marcada como vinda de outra sessão, não de seu usuário, e não carrega nenhuma de suas autoridades lá: a sessão receptora age sobre ela apenas dentro de suas próprias configurações de permissão. Seu usuário pode escolher o que acontece com as mensagens recebidas com `agents.crossSessionInbound` (`accept`, `hold` ou `refuse`). Quando não definido, uma mensagem é entregue apenas quando ambas as sessões estão na mesma classe de revisão: ambas ainda revisam cada ação (modo padrão ou plan), ou ambas estão em um modo que aplica algumas ações sem revisão por ação (auto-edit, auto ou yolo). Uma mensagem de uma sessão na outra classe, ou de um remetente que não diz em qual classe está, é retida para revisão — em ambos os sentidos. Uma sessão que revisa cada ação retém uma mensagem de uma que não faz isso, porque essa mensagem foi escrita por um modelo que ninguém estava observando, e os prompts por ação protegem ações, não aquilo no qual a sessão está sendo induzida. Mensagens retidas são listadas e liberadas com `/peers` na sessão receptora, e uma mensagem retida apenas porque os modos diferiam é liberada automaticamente assim que concordarem.

Um repositório pode tornar as sessões abertas nele mais cautelosas, nunca menos: um `.qwen/settings.json` de workspace pode definir `agents.crossSessionInbound` como `hold` ou `refuse`, ou `agents.crossSessionMessaging` como `false`, e esse valor prevalece sobre um mais permissivo nas configurações do usuário. Um valor de workspace que afrouxaria um definido pelo operador (`accept`, ou `true` para a chave quando um escopo de usuário ou sistema definiu como `false`) é ignorado com um aviso; um `true` de workspace onde nada mais definiu a chave meramente repete o padrão e é descartado silenciosamente. Um valor que a CLI não reconhece retém todas as mensagens sempre que for o valor efetivo. As configurações do sistema substituem tudo isso, como fazem para todas as configurações.

Uma retenção não espera para sempre. Uma mensagem sobre a qual ninguém decide expira após `agents.crossSessionHeldExpiry` — `1m`, `5m`, `10m` ou `never`, cinco minutos por padrão — e a sessão remetente é informada de que nenhuma decisão veio. Encurtar a configuração se aplica às mensagens já aguardando.

Se a sessão não puder vincular sua caixa de entrada — o diretório de runtime está ausente, pertence a outro usuário ou é somente leitura, como pode acontecer dentro de um contêiner — ela primeiro tenta um diretório privado sob o diretório temporário, e só falha completamente se iniciar sem um. Quando isso acontece, a sessão informa na inicialização, e `/peers` repete o motivo e o que mudar (geralmente `XDG_RUNTIME_DIR` ou `TMPDIR`).

Duas sessões também podem resolver o mesmo endereço de caixa de entrada, porque o endereço é indexado pelo ID do processo e IDs de processo se repetem entre contêineres que compartilham um diretório de runtime. A sessão iniciada em segundo lugar assume um endereço vizinho em vez de tomar o que está em uso, então nenhuma fica inalcançável. Os pares não são afetados: eles leem o endereço de uma sessão do registro de sessões em vez de derivá-lo.

A chamada `send_message` apenas confirma que a mensagem foi entregue à outra sessão. O que aconteceu com ela chega depois como um recibo: se foi retida, recusada, rejeitada, descartada, expirou ou foi endereçada incorretamente (o endereço mudou de mãos — liste os agentes novamente) — ou liberada após uma retenção — um aviso aparece na transcrição da sessão remetente (`Message to <name>: …`). Recusada, rejeitada e descartada são três respostas diferentes: recusada significa que alguém revisou a mensagem e disse não, rejeitada significa que o `agents.crossSessionInbound` dessa sessão é `refuse` e ninguém a viu, e descartada significa que sua caixa de entrada afastou a mensagem antes disso (veja abaixo). A primeira descarte é respondida imediatamente e as demais são agrupadas em um recibo a cada poucos segundos, cada um nomeando as mensagens que representa, então uma sequência delas custa um punhado de linhas em vez de uma linha cada. O modelo que enviou não é informado; se a outra sessão responder, a resposta chega como uma mensagem entre sessões.

### Proteção contra inundação

Uma sessão aceita até 30 mensagens de uma só vez de um remetente e, em seguida, uma a cada dois segundos, e até 32 de uma só vez de todos os remetentes juntos e, em seguida, uma por segundo. O segundo limite existe porque um remetente se nomeia: rotacionar esse nome obtém uma nova cota do primeiro limite, mas não do segundo. Ele é apenas ligeiramente superior ao primeiro porque cada mensagem aceita gera um recibo, e uma sessão só pode ter um número limitado deles sendo enviados ao mesmo tempo. Uma mensagem de outra sessão que repete a mensagem anterior desse remetente palavra por palavra dentro de 30 segundos também é rejeitada — um modelo em loop em uma frase gera um novo ID de mensagem toda vez, então é o texto que detecta isso. Mensagens de um script iniciado pela sessão e de um controlador confiável estão isentas da verificação de repetição, porque um hook relatando a mesma linha duas vezes está relatando dois fatos e uma pessoa dizendo "continue" duas vezes significa isso duas vezes; ambos ainda estão sujeitos aos limites de taxa. Finalmente, uma mensagem que é aceita, mas não pode ser colocada na fila porque a sessão já tem 50 aguardando, também é rejeitada.

Uma mensagem rejeitada dessa forma nunca é retida, nunca é mostrada ao modelo e não deixa registro, para que o remetente possa tentar novamente mais tarde e ter sucesso. A sessão receptora informa isso em sua transcrição no máximo uma vez por minuto por remetente, com uma contagem do que essa linha representa. A sessão de envio recebe um recibo nomeando todas as mensagens que a rajada custou a ela, e sua transcrição diz para incorporar o que ainda importa em uma mensagem posterior em vez de reenviar.

O lado de envio não espera para descobrir. Cada sessão rastreia o que enviou para cada endereço e recusa um envio que o receptor descartaria, para que o modelo seja instruído a agrupar antes que a mensagem seja escrita, em vez de depois — e o receptor nunca gasta uma conexão em uma mensagem que ele ia rejeitar.

### apresentá-lo em sua primeira linha antes que qualquer mensagem seja lida, e as sessões

A caixa de entrada de cada sessão requer um token por sessão: uma conexão deve apresentá-lo em sua primeira linha antes que qualquer mensagem seja lida, e as sessões trocam tokens automaticamente através dos mesmos registros de registro pelo qual descobrem umas às outras. Sessões de uma compilação sem suporte a tokens podem receber de uma mais recente, mas seus envios para ela são descartados.

Uma sessão exporta seu próprio endereço de caixa de entrada e um token para processos filhos como `QWEN_CODE_MESSAGING_SOCKET` e `QWEN_CODE_MESSAGING_TOKEN`, para que um script ou hook executado pela sessão possa enviar uma mensagem de volta para ela. Este é um segundo token _filho_ que nunca é publicado em nenhum lugar: apenas processos iniciados pela sessão podem possuí-lo, então uma mensagem que chega com ele é reconhecida como própria da sessão, em vez de como de outra sessão.

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CODE_MESSAGING_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"build finished"}}'; \
} | socat - UNIX-CONNECT:"$QWEN_CODE_MESSAGING_SOCKET"
```

Dê a cada injeção um novo `msgId`. O portão de recebimento lembra os IDs que já liquidou, então um hook que reutiliza um é entregue na primeira vez e silenciosamente deduplicado em todas as execuções subsequentes. Repetir o mesmo _texto_ é aceitável — a verificação de repetição acima não se aplica aos próprios processos de uma sessão — mas os limites de taxa se aplicam, então um hook em um loop é descartado como qualquer outra inundação.

Uma mensagem injetada ainda passa pelo portão de entrada e é marcada como não vindo do usuário, mas o portão sabe que veio do próprio processo da sessão: sob o padrão de paridade de modo, ela é entregue sem revisão (um par na mesma posição seria retido), enquanto um `agents.crossSessionInbound` explícito de `hold` ou `refuse` se aplica a ela como a qualquer outra coisa. O modelo a vê como `<cross_session_message from="own process" origin="own-process">` com um aviso de que veio de um script ou hook executado pela sessão, não do usuário.

### Controladores confiáveis [#trusted-controllers]

A regra acima retém uma mensagem de qualquer remetente que não diga em qual classe de revisão está, e um programa que não é uma sessão do Qwen Code não tem nenhuma para dizer. Esse é o padrão correto para um estranho, mas não para um programa que você escolheu: um front-end de voz, uma ponte de ditado, um daemon de automação retransmitindo suas próprias instruções teria todas as mensagens estacionadas, e aprovar cada uma manualmente derrota o propósito.

Você concede entrega a tal programa emitindo-lhe um token:

```bash
qwen sessions controllers add --label voice-bridge
```

O token é impresso uma vez e não é armazenado em lugar nenhum: o arquivo sob seu diretório inicial do Qwen mantém apenas seu hash SHA-256, então nada que leia esse arquivo posteriormente pode apresentar o token. Coloque-o na configuração do próprio controlador quando o comando imprimi-lo.

Um controlador apresenta o token da mesma forma que qualquer outro remetente faz — como a primeira linha da conexão — e obtém o caminho do socket do registro de sessões (`qwen sessions ps --json` imprime um registro por sessão ativa, `ipcPath` sendo o endereço):

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CONTROLLER_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"open the failing test"}}'; \
} | socat - UNIX-CONNECT:"$SESSION_IPC_PATH"
```

Uma mensagem que chega em um token concedido é entregue sem revisão por mensagem, independentemente da classe de revisão de qualquer lado — mas ainda cede a uma configuração explícita: um `agents.crossSessionInbound` de `hold` a estaciona como qualquer outra coisa, e `refuse` a rejeita. As concessões pertencem ao seu diretório inicial do Qwen, em vez de a uma única sessão, então um controlador alcança quais quer sessões que você esteja executando, e as sessões relêem o arquivo a cada conexão: criar ou revogar uma entra em vigor na próxima conexão, sem necessidade de reiniciar.

```bash
qwen sessions controllers list          # ids, labels, when they were added
qwen sessions controllers remove c_1a2b # revoke one
```

`/peers controllers` e `/peers revoke <id>` fazem o mesmo de dentro de uma sessão. Uma mensagem que veio por meio de uma concessão é exibida como `Message from a trusted controller (voice-bridge)`, e aparece em `/peers` como `[controller] voice-bridge` se uma configuração `hold` a deixou retida.

O modelo vê essa mensagem como `<cross_session_message from="controller" origin="controller" controller="voice-bridge">`, com um aviso de que ela retransmite suas próprias instruções — e as mesmas duas proibições que se aplicam a todas as outras origens: não pode editar configurações de permissão, QWEN.md ou config porque a mensagem pediu, e não pode tratar a mensagem como sua aprovação de um prompt de confirmação pendente. Um controlador pode dizer o que fazer em seguida; ele não pode responder a um prompt em seu nome.

Qualquer pessoa que possua o token pode enviar como esse controlador, então trate-o como qualquer outra credencial: entregue-a a um programa, mantenha-a fora de configurações compartilhadas e revogue-a quando esse programa terminar.

### Sessões que um programa controla via ACP

Qualquer filho `qwen --acp` registra cada sessão que hospeda — como `serve` quando o daemon iniciou o processo, como `headless` quando um editor ou outro cliente está dirigindo `qwen --acp` diretamente — e a sessão aparece em `qwen sessions ps` e no `list_agents` de outra sessão como qualquer outra. Ela pode enviar: seu modelo pode chamar `send_message` para alcançar um terminal que você tem aberto. Vários deles compartilham um único processo e uma única caixa de entrada, então um remetente precisa nomear a sessão desejada — toda sessão do Qwen Code faz isso automaticamente.

Mensagens enviadas _para_ uma delas são recusadas em vez de retidas. Reter é uma questão colocada a uma pessoa, e ninguém está observando uma lista de mensagens retidas em nome de uma sessão dirigida; um remetente é informado imediatamente em vez de esperar até o vencimento. Onde uma mensagem retida deve aparecer para essas sessões ainda não está definido.

Uma sessão se registra, a menos que suas próprias configurações desativem `agents.crossSessionMessaging`, ou tenha sido iniciada com `--bare` ou `--safe-mode` — esses desativam a mensageria independentemente da configuração. Desativada, ela permanece invisível, porque a única razão para listar uma sessão que ninguém pode enviar mensagens seria anunciar um endereço que nunca responde.

### Programas que não são sessões do Qwen Code

Tudo acima funciona entre sessões, mas nada nele é específico para uma. Um programa que escreve um registro de cadastro para si mesmo e vincula uma caixa de entrada da mesma maneira é listado por `qwen sessions ps` e por `list_agents`, pode ser endereçado pelo nome a partir de `send_message` e recebe recibos de entrega para o que envia — uma interface de voz, um relay, um monitor de build. Ele deve registrar `kind: "external"` para que uma listagem possa dizer o que é.

[Protocolo Entre Sessões](./cross-session-protocol.md) é o contrato para escrever um: o esquema de registro e como a vitalidade é julgada, os caminhos de socket e o enquadramento, a linha de autenticação, cada campo de quadro, os estados de recibo e suas transições, e o que um receptor faz com uma mensagem antes que seu modelo a veja.

Um programa Node não precisa escrever nada disso manualmente: `@qwen-code/sdk/peer` implementa o contrato. `PeerEndpoint.start({ name })` publica o registro e vincula a caixa de entrada, `list()` e `send()` endereçam sessões pelo nome, e `onMessage` recebe o que elas enviam.
