# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões, personalizar a interface e controlar seu comportamento de forma eficiente.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se dividem em três categorias:

| Tipo de Prefixo                | Descrição da Função                                | Caso de Uso Típico                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Comandos Slash (`/`)       | Controle em nível meta do próprio Qwen Code              | Gerenciar sessões, modificar configurações, obter ajuda              |
| Comandos At (`@`)          | Injetar rapidamente o conteúdo de arquivos locais na conversa | Permitir que a IA analise arquivos especificados ou código em diretórios |
| Comandos de Exclamação (`!`) | Interação direta com o Shell do sistema                | Executar comandos do sistema como `git status`, `ls`, etc.          |

## 1. Comandos Slash (`/`)

Os comandos slash são usados para gerenciar sessões, a interface e o comportamento básico do Qwen Code.

### 1.1 Gerenciamento de Sessões e Projetos

Esses comandos ajudam você a salvar, restaurar e resumir o progresso do trabalho.

| Comando          | Descrição                                                              | Exemplos de Uso                                                |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init`          | Analisar o diretório atual e criar o arquivo de contexto inicial                | `/init`                                                       |
| `/summary`       | Gerar resumo do projeto com base no histórico de conversas                   | `/summary`                                                    |
| `/compress`      | Substituir o histórico do chat pelo resumo para economizar tokens                         | `/compress` ou `/summarize`                                   |
| `/compress-fast` | Compressão rápida sem IA — remove saídas antigas de ferramentas e partes de raciocínio | `/compress-fast`                                              |
| `/resume`        | Retomar uma sessão de conversa anterior                                   | `/resume` ou `/continue`                                      |
| `/recap`         | Gerar um resumo da sessão em uma linha                                    | `/recap`                                                      |
| `/restore`       | Reverter os arquivos do projeto para o checkpoint anterior à execução de uma chamada de ferramenta            | `/restore` (lista) ou `/restore <ID>`                          |
| `/delete`        | Excluir uma sessão anterior                                                | `/delete`                                                     |
| `/branch`        | Bifurcar a conversa atual em uma nova sessão                         | `/branch`                                                     |
| `/fork`          | Criar um agente em segundo plano que herda a conversa completa             | `/fork <directive>`                                           |
| `/rewind`        | Retroceder a conversa para um turno anterior                                   | `/rewind` ou `/rollback`                                      |
| `/export`        | Exportar o histórico da sessão para um arquivo                                           | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename`        | Renomear ou marcar a sessão atual                                        | `/rename My Feature` ou `/tag`                                |

> [!note]
>
> `/summarize` é um alias para `/compress` (ele comprime o histórico do chat — uma operação destrutiva). Para gerar um resumo do projeto não destrutivo, use `/summary`.

### 1.2 Controle de Interface e Espaço de Trabalho

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando              | Descrição                                                                                                                                                                       | Exemplos de Uso                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear`             | Limpar o histórico de conversas e liberar o contexto                                                                                                                                    | `/clear`, `/reset`, `/new`                                                        |
| `/context`           | Mostrar o detalhamento do uso da janela de contexto                                                                                                                                               | `/context`                                                                        |
| → `detail`           | Mostrar o detalhamento do uso do contexto por item                                                                                                                                             | `/context detail`                                                                 |
| `/history`           | Controlar preferências e visibilidade de exibição do histórico                                                                                                                                | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff`              | Abrir um visualizador de diff interativo mostrando alterações não commitadas e diffs por turno. Use ←/→ para alternar entre o diff git atual e os turnos individuais da conversa, ↑/↓ para navegar pelos arquivos | `/diff`                                                                           |
| `/theme`             | Alterar o tema visual do Qwen Code                                                                                                                                                     | `/theme`                                                                          |
| `/vim`               | Ativar/desativar o modo de edição Vim na área de entrada                                                                                                                                           | `/vim`                                                                            |
| `/voice`             | Alternar a entrada por ditado de voz                                                                                                                                                      | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`              |
| `/directory`         | Gerenciar o espaço de trabalho com suporte a múltiplos diretórios                                                                                                                                          | `/dir add ./src,./tests`, `/dir show`                                             |
| `/cd`                | Mover esta sessão para um novo diretório de trabalho                                                                                                                                      | `/cd ../other-project`                                                            |
| `/editor`            | Abrir diálogo para selecionar o editor suportado                                                                                                                                            | `/editor`                                                                         |
| `/statusline`        | Abrir o diálogo interativo de predefinições da [linha de status](./status-line.md)                                                                                                                    | `/statusline`                                                                     |
| `/statusline <text>` | Gerar uma [linha de status](./status-line.md) em modo de comando via agente                                                                                                                 | `/statusline show model and git branch`                                           |
| `/terminal-setup`    | Configurar atalhos de teclado do terminal para entrada multilinha                                                                                                                                | `/terminal-setup`                                                                 |

### 1.3 Configurações de Idioma

Comandos específicos para controlar o idioma da interface e da saída.

| Comando               | Descrição                      | Exemplos de Uso             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Visualizar ou alterar as configurações de idioma | `/language`                |
| → `ui [language]`     | Definir o idioma da interface do usuário        | `/language ui zh-CN`       |
| → `output [language]` | Definir o idioma de saída do LLM          | `/language output Chinese` |

- Idiomas integrados disponíveis para a interface: `zh-CN` (Chinês Simplificado), `en-US` (Inglês), `ru-RU` (Russo), `de-DE` (Alemão), `ja-JP` (Japonês), `pt-BR` (Português - Brasil), `fr-FR` (Francês), `ca-ES` (Catalão)
- Exemplos de idiomas de saída: `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando           | Descrição                                                                      | Exemplos de Uso                                                                                            |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/mcp`            | Listar servidores e ferramentas MCP configurados                                            | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                         |
| `/import-config`  | Importar servidores MCP a partir de configurações do Claude                                           | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools`          | Exibir a lista de ferramentas disponíveis no momento                                            | `/tools`, `/tools desc`                                                                                   |
| `/skills`         | Listar e executar skills disponíveis                                                    | `/skills`, `/skills <name>`                                                                               |
| `/plan`           | Alternar para o modo plan ou sair dele                                            | `/plan`, `/plan <task>`, `/plan exit`                                                                     |
| `/approval-mode`  | Alterar o modo de aprovação de ferramentas (apenas na sessão atual)                             | `/approval-mode`, `/approval-mode auto-edit`                                                              |
| → `plan`          | Apenas análise, sem execução (revisão segura)                                      | `/approval-mode plan`                                                                                     |
| → `default`       | Exigir aprovação para edições (uso diário)                                           | `/approval-mode default`                                                                                  |
| → `auto-edit`     | Aprovar edições automaticamente (ambiente confiável)                                         | `/approval-mode auto-edit`                                                                                |
| → `auto`          | Aprovação avaliada por classificador (autônomo)                                       | `/approval-mode auto`                                                                                     |
| → `yolo`          | Aprovar tudo automaticamente (prototipagem rápida)                                      | `/approval-mode yolo`                                                                                     |
| `/model`          | Alternar o modelo usado na sessão atual                                             | `/model`, `/model <model-id>` (alterna imediatamente)                                                        |
| `/model --fast`   | Definir um modelo mais leve para sugestões de prompt                                       | `/model --fast qwen3-coder-flash`                                                                         |
| `/model --voice`  | Definir o modelo usado para transcrição de voz                                       | `/model --voice <model-id>`                                                                               |
| `/model --vision` | Definir o modelo de visão usado para transcrever imagens para um modelo principal apenas de texto | `/model --vision <model-id>`                                                                              |
| `/effort`         | Definir o esforço de raciocínio para modelos com capacidade de pensamento                                 | `/effort` (abre o seletor), `/effort high` (low/medium/high/xhigh/max; mapeado e limitado por provedor)       |
| `/extensions`     | Gerenciar extensões                                                                | `/extensions list`, `/extensions manage`                                                                  |
| → `list`          | Listar extensões instaladas                                                        | `/extensions list`                                                                                        |
| → `manage`        | Gerenciar extensões instaladas (interativo)                                        | `/extensions manage`                                                                                      |
| → `explore`       | Abrir a página de extensões no navegador                                                  | `/extensions explore <Gemini\|ClaudeCode>`                                                                |
| → `install`       | Instalar uma extensão a partir de um repositório git ou caminho                                     | `/extensions install <repo-or-path>`                                                                      |
| `/memory`         | Abrir o diálogo do Gerenciador de Memória                                                   | `/memory`                                                                                                 |
| `/remember`       | Salvar uma memória durável                                                            | `/remember Prefer terse responses`                                                                        |
| `/forget`         | Remover entradas correspondentes da auto-memória                                         | `/forget <query>`                                                                                         |
| `/dream`          | Executar manualmente a consolidação da auto-memória                                           | `/dream`                                                                                                  |
| `/hooks`          | Gerenciar hooks do Qwen Code                                                           | `/hooks`, `/hooks list`                                                                                   |
| `/permissions`    | Gerenciar regras de permissão                                                          | `/permissions`                                                                                            |
| `/agents`         | Gerenciar subagentes                                                                 | `/agents manage`, `/agents create`                                                                        |
| `/arena`          | Gerenciar sessões do Arena                                                            | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (alias `choose`)                          |
| `/goal`           | Definir um objetivo — continuar trabalhando até que a condição seja atendida                                    | `/goal <condition>`, `/goal clear`                                                                        |
| `/tasks`          | Listar tarefas em segundo plano                                                            | `/tasks`                                                                                                  |
| `/workflows`      | Inspecionar execuções de workflow                                                            | `/workflows`, `/workflows <runId>`                                                                        |
| `/lsp`            | Mostrar o status do servidor LSP                                                           | `/lsp`                                                                                                    |
| `/trust`          | Gerenciar configurações de confiança de pasta                                                     | `/trust`                                                                                                  |

> [!warning]
>
> Instale extensões (`/extensions install`) apenas de fontes confiáveis. Extensões podem empacotar servidores MCP, skills e comandos que são executados com as mesmas permissões do próprio Qwen Code — eles podem acessar seus arquivos, chaves de API e dados de conversa. O `/extensions install` não solicita confirmação.

> [!warning]
>
> Os modos de aprovação `auto-edit`, `auto` e `yolo` ignoram os prompts de aprovação para execuções de ferramentas. No modo `yolo`, todas as ações — incluindo comandos de shell, gravações de arquivos e requisições de rede — são executadas sem confirmação. Use esses modos apenas em ambientes confiáveis, isolados (sandbox) ou descartáveis.

> [!note]
>
> `/workflows`, `/lsp` e `/trust` são registrados apenas quando seus respectivos recursos estão habilitados — por meio da variável de ambiente `QWEN_CODE_ENABLE_WORKFLOWS=1`, da flag de CLI `--experimental-lsp` e da configuração `security.folderTrust.enabled`. Quando desabilitados, eles não aparecerão e reportarão um comando desconhecido.

### 1.5 Skills Integradas

Esses comandos invocam skills integradas que fornecem workflows especializados.

| Comando      | Descrição                                                 | Exemplos de Uso                                    |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | Revisar alterações de código com 9 agentes de revisão paralelos           | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Executar um prompt em um cronograma recorrente                        | `/loop 5m check the build`                        |
| `/simplify`  | Revisar alterações recentes e aplicar edições de limpeza seguras diretamente | `/simplify`, `/simplify focus on duplication`     |
| `/qc-helper` | Responder perguntas sobre o uso e a configuração do Qwen Code    | `/qc-helper how do I configure MCP?`              |

Consulte [Code Review](./code-review.md) para a documentação completa do `/review`.

### 1.6 Pergunta Lateral (`/btw`)

O comando `/btw` permite que você faça perguntas laterais rápidas sem interromper ou afetar o fluxo da conversa principal.

| Comando                | Descrição                           |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Fazer uma pergunta lateral rápida             |
| `?btw <your question>` | Sintaxe alternativa para perguntas laterais |

**Como Funciona:**

- A pergunta lateral é enviada como uma chamada de API separada com o contexto recente da conversa (até as últimas 20 mensagens)
- A resposta é exibida acima do Composer — você pode continuar digitando enquanto aguarda
- A conversa principal **não é bloqueada** — ela continua de forma independente
- A resposta da pergunta lateral **não** faz parte do histórico da conversa principal
- As respostas são renderizadas com suporte completo a Markdown (blocos de código, listas, tabelas, etc.)
**Atalhos de Teclado (Modo Interativo):**

| Atalho               | Ação                                                |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Cancelar (durante o carregamento) ou dispensar (após a conclusão) |
| `Space` ou `Enter`   | Dispensar a resposta (quando a entrada está vazia)  |
| `Ctrl+C` ou `Ctrl+D` | Cancelar uma pergunta lateral em andamento          |

**Exemplo:**

```
(Enquanto a conversa principal é sobre refatoração de código)

> /btw Qual é a diferença entre let e var no JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw Qual é a diferença entre let        │
  │     e var no JavaScript?                 │
  │                                          │
  │ + Respondendo...                         │
  │ Pressione Escape, Ctrl+C ou Ctrl+D para  │
  │   cancelar                               │
  ╰──────────────────────────────────────────╯
  > (O Composer permanece ativo — continue digitando)

(Após a resposta chegar)

  ╭──────────────────────────────────────────╮
  │ /btw Qual é a diferença entre let        │
  │     e var no JavaScript?                 │
  │                                          │
  │ `let` tem escopo de bloco, enquanto      │
  │ `var` tem escopo de função. `let` foi    │
  │ introduzido no ES6 e não faz hoist da    │
  │ mesma forma.                             │
  │                                          │
  │ Pressione Space, Enter ou Escape para    │
  │   dispensar                              │
  ╰──────────────────────────────────────────╯
  > (Composer ainda ativo)
```

**Modos de Execução Suportados:**

| Modo                 | Comportamento                                    |
| -------------------- | ------------------------------------------------ |
| Interativo           | Mostra o Composer acima com renderização Markdown |
| Não interativo       | Retorna o resultado em texto: `btw> question\nanswer` |
| ACP (Agent Protocol) | Retorna o gerador assíncrono `stream_messages`   |

> [!tip]
>
> Use `/btw` quando precisar de uma resposta rápida sem desviar do seu foco principal. É especialmente útil para esclarecer conceitos, verificar fatos ou obter explicações rápidas enquanto mantém o foco no seu fluxo de trabalho principal.

### 1.7 Recap da Sessão (`/recap`)

O comando `/recap` gera um breve resumo de "onde você parou" da sessão atual, para que você possa retomar uma conversa antiga sem precisar rolar por páginas de histórico.

| Comando  | Descrição                                |
| -------- | ---------------------------------------- |
| `/recap` | Gerar e mostrar um resumo da sessão em uma linha |

**Como funciona:**

- Usa o modelo rápido configurado (configuração `fastModel`) quando disponível, recorrendo ao modelo principal da sessão como fallback. Um modelo pequeno e barato é suficiente para um recap.
- A conversa recente (até 30 mensagens, apenas texto — chamadas de ferramentas e respostas de ferramentas são filtradas) é enviada ao modelo com um prompt de sistema restrito.
- O recap é renderizado em cor esmaecida com o prefixo `❯` para se destacar das respostas reais do assistente.
- Recusa com um erro inline se uma resposta do modelo estiver em andamento ou outro comando estiver sendo processado. Se não houver conversa utilizável, ou se a geração subjacente falhar, o `/recap` mostra uma mensagem informativa curta em vez de um recap — o comando manual sempre responde com algo.

**Acionamento automático ao retornar de uma ausência:**

Se o terminal ficar desfocado por **5 minutos ou mais** e for focado novamente, um recap é gerado e mostrado automaticamente (apenas quando nenhuma resposta do modelo estiver em andamento; caso contrário, ele aguarda o turno atual terminar e então é acionado). Diferente do comando manual, o acionamento automático é totalmente silencioso em caso de falha: se a geração der erro ou não houver nada para resumir, nenhuma mensagem é adicionada ao histórico. Controlado pela configuração `general.showSessionRecap` (padrão: `false`); o comando manual `/recap` sempre funciona independentemente dessa configuração.

**Exemplo:**

```
> /recap

❯ Refatorando loopDetectionService.ts para resolver OOM de sessão longa causado por
  streamContentHistory e contentStats ilimitados. O próximo passo é
  implementar a opção B (janela deslizante LRU com FNV-1a) pendente de confirmação.
```

> [!tip]
>
> Configure um modelo rápido via `/model --fast <model>` (ex.: `qwen3-coder-flash`) para tornar o `/recap` rápido e barato. Defina `general.showSessionRecap` como `true` para habilitar o acionamento automático; o comando manual `/recap` sempre funciona independentemente dessa configuração.

### 1.8 Visualizador de Diff (`/diff`)

O comando `/diff` abre um visualizador de diff interativo mostrando alterações não commitadas e diffs por turno. Use ←/→ para alternar entre o diff atual do git e os turnos individuais da conversa, ↑/↓ para navegar pelos arquivos e Enter para ver os diffs inline.

**Como funciona:**

No modo interativo, o `/diff` abre uma caixa de diálogo com um **seletor de origem** na parte superior:

- **Current** — working tree vs HEAD (`git diff HEAD`). Mostra todas as alterações não commitadas, incluindo arquivos staged, unstaged e untracked.
- **T1, T2, T3, …** — diffs por turno, uma aba por turno do modelo que modificou arquivos. Os turnos mais recentes aparecem primeiro. Cada aba mostra uma prévia do prompt original para contexto.

A lista de arquivos exibe estatísticas por arquivo (linhas adicionadas/removidas) com tags para estados especiais (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Pressione Enter em um arquivo para ver seu diff inline com hunks destacados por sintaxe.

Diffs por turno exigem que o file checkpointing esteja habilitado (ativado por padrão no modo interativo). Quando o file checkpointing está desativado, apenas a origem "Current" está disponível.

**Atalhos de teclado:**

| Tecla     | Ação                                      |
| --------- | ----------------------------------------- |
| `←` / `→` | Alternar entre origens (Current / T1 / T2…) |
| `↑` / `↓` | Navegar pela lista de arquivos            |
| `j` / `k` | Navegar pela lista de arquivos (estilo vim) |
| Enter     | Ver diff inline do arquivo selecionado    |
| `←` / Esc | Voltar para a lista de arquivos a partir da visualização de diff inline |
| Esc       | Fechar a caixa de diálogo                 |

**Exemplo:**

```
┌ /diff · Turno 3 "refactor the auth middleware" ──── 3 arquivos +45 -12 ┐
│                                                                         │
│ ◀ Current · T3 · T2 · T1 ▶                                             │
│                                                                         │
│ › src/utils/parser.ts                                  +30 -8           │
│   src/utils/parser.test.ts                             +12 -2           │
│   README.md                                            +3 -2            │
│                                                                         │
│ ←/→ origem · ↑/↓ arquivo · Enter ver · Esc fechar                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Modo não interativo:**

No modo headless (`--prompt`) ou contextos não interativos, o `/diff` imprime um resumo em texto simples da working tree vs HEAD. A navegação por turno não está disponível.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando          | Descrição                                                                                                                    | Exemplos de Uso                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/help`          | Exibir informações de ajuda para os comandos disponíveis                                                                     | `/help` ou `/?`                                                                     |
| `/status`        | Exibir informações da versão                                                                                                 | `/status` ou `/about`                                                               |
| `/status paths`  | Exibir o arquivo da sessão atual e os caminhos de log                                                                        | `/status paths`                                                                     |
| `/stats`         | Abrir o painel interativo de estatísticas de uso (abas Session, Activity e Efficiency)                                       | `/stats` ou `/usage`                                                                |
| `/stats model`   | Mostrar o detalhamento de tokens por modelo e custo estimado                                                                 | `/stats model`                                                                      |
| `/stats tools`   | Mostrar contagens de chamadas por ferramenta                                                                                 | `/stats tools`                                                                      |
| `/stats skills`  | Mostrar contagens de chamadas por skill para a sessão ao vivo atual (apenas ao vivo; exclui atividade diária/mensal entre sessões) | `/stats skills`                                                                     |
| `/stats daily`   | Mostrar estatísticas de uso diário de tokens                                                                                 | `/stats daily` (alias `day`), `/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | Mostrar estatísticas de uso mensal de tokens                                                                                 | `/stats monthly` (alias `month`), `/stats month [YYYY-MM]`                          |
| `/stats export`  | Exportar estatísticas de uso para CSV ou JSON                                                                                | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | Abrir o editor de configurações                                                                                              | `/settings`                                                                         |
| `/auth`          | Alterar o método de autenticação                                                                                             | `/auth`, `/connect`, `/login`                                                       |
| `/doctor`        | Executar diagnósticos de instalação e ambiente                                                                               | `/doctor`, `/doctor memory`                                                         |
| → `memory`       | Mostrar diagnósticos de memória do processo atual                                                                            | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | Gravar um perfil de CPU para análise no Chrome DevTools                                                                      | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | Reverter o binário CLI standalone para a versão anterior (apenas instalações standalone; para histórico de conversas use `/rewind`) | `/doctor rollback`                                                                  |
| `/docs`          | Abrir a documentação completa do Qwen Code no navegador                                                                      | `/docs`                                                                             |
| `/ide`           | Gerenciar integração com IDE                                                                                                 | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                        |
| `/insight`       | Gerar insights de programação a partir do histórico de chat                                                                  | `/insight`                                                                          |
| `/setup-github`  | Configurar o GitHub Actions                                                                                                  | `/setup-github`                                                                     |
| `/bug`           | Enviar issue sobre o Qwen Code                                                                                               | `/bug Button click unresponsive`                                                    |
| `/copy`          | Copiar para a área de transferência: resposta (N-ésima última), código (por linguagem), LaTeX ou Mermaid                     | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                  |
| `/quit`          | Sair do Qwen Code imediatamente                                                                                              | `/quit` ou `/exit`                                                                  |

> [!warning]
>
> `/doctor memory --snapshot` grava um snapshot do heap do V8 que pode conter prompts, conteúdos de arquivos, API keys e resultados de ferramentas da sessão atual. Revise o arquivo antes de compartilhá-lo.

### 1.10 Atalhos Comuns

| Atalho             | Função                  | Nota                                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | Limpar tela             | Limpa apenas a tela visível (não reseta a sessão como o `/clear`)         |
| `Ctrl/cmd+T`       | Alternar descrição da ferramenta | Gerenciamento de ferramentas MCP                                 |
| `Ctrl/cmd+C`×2     | Confirmação de saída    | Mecanismo de saída segura                                                 |
| `Ctrl/cmd+Z`       | Desfazer entrada        | Edição de texto                                                           |
| `Ctrl/cmd+Shift+Z` | Refazer entrada         | Edição de texto                                                           |

### 1.11 Comandos de Autenticação

Use `/auth` dentro de uma sessão do Qwen Code para configurar a autenticação. Use `/doctor` para inspecionar o status atual de autenticação e ambiente.

| Comando   | Descrição                                                            |
| --------- | -------------------------------------------------------------------- |
| `/auth`   | Configurar autenticação interativamente (aliases: `/connect`, `/login`) |
| `/doctor` | Mostrar verificações de autenticação e ambiente                      |

> [!note]
>
> O comando CLI standalone `qwen auth` foi removido. Invocações legadas como `qwen auth status` exibem um aviso de remoção com orientações de migração. Consulte a página [Authentication](../configuration/auth) para detalhes completos.

## 2. Comandos @ (Introduzindo Arquivos)

Os comandos @ são usados para adicionar rapidamente o conteúdo de um arquivo ou diretório local à conversa.

| Formato do Comando  | Descrição                                  | Exemplos                                         |
| ------------------- | ------------------------------------------ | ------------------------------------------------ |
| `@<caminho do arquivo>` | Injetar conteúdo do arquivo especificado | `@src/main.py Please explain this code`          |
| `@<caminho do diretório>` | Ler recursivamente todos os arquivos de texto no diretório | `@docs/ Summarize content of this document`      |
| `@` isolado         | Usado ao discutir o próprio símbolo `@`    | `@ What is this symbol used for in programming?` |

Nota: Espaços nos caminhos precisam ser escapados com barra invertida (ex.: `@My\ Documents/file.txt`)

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Os comandos de exclamação permitem executar comandos do sistema diretamente dentro do Qwen Code.

| Formato do Comando | Descrição                                                        | Exemplos                               |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `!<comando shell>` | Executar comando no sub-Shell                                    | `!ls -la`, `!git status`               |
| `!` isolado        | Alternar para o modo Shell, qualquer entrada é executada diretamente como comando Shell | `!`(enter) → Input command → `!`(exit) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts usados com frequência como comandos de atalho para melhorar a eficiência do trabalho e garantir consistência.

> [!note]
>
> Os comandos personalizados agora usam o formato Markdown com frontmatter YAML opcional. O formato TOML foi descontinuado, mas ainda é suportado para compatibilidade com versões anteriores. Quando arquivos TOML são detectados, um prompt de migração automática será exibido.

### Visão Geral Rápida

| Função           | Descrição                                | Vantagens                             | Prioridade | Cenários Aplicáveis                                 |
| ---------------- | ---------------------------------------- | ------------------------------------- | ---------- | --------------------------------------------------- |
| Namespace        | Subdiretório cria comandos com nomes separados por dois pontos | Melhor organização dos comandos       |            |                                                     |
| Comandos Globais | `~/.qwen/commands/`                      | Disponível em todos os projetos       | Baixa      | Comandos pessoais de uso frequente, uso entre projetos |
| Comandos de Projeto | `<diretório raiz do projeto>/.qwen/commands/` | Específico do projeto, versionável  | Alta       | Compartilhamento em equipe, comandos específicos do projeto |

Regras de Prioridade: Comandos de projeto > Comandos de usuário (o comando do projeto é usado quando os nomes são iguais)

### Regras de Nomenclatura de Comandos

#### Tabela de Mapeamento de Caminho de Arquivo para Nome de Comando

| Localização do Arquivo                 | Comando Gerado    | Chamada de Exemplo      |
| -------------------------------------- | ----------------- | ----------------------- |
| `~/.qwen/commands/test.md`             | `/test`           | `/test Parâmetro`       |
| `<projeto>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Mensagem`  |

Regras de Nomenclatura: O separador de caminho (`/` ou `\`) é convertido em dois pontos (`:`)

### Especificação do Formato de Arquivo Markdown (Recomendado)

Comandos personalizados usam arquivos Markdown com frontmatter YAML opcional:

```markdown
---
description: Descrição opcional (exibida em /help)
---

Seu conteúdo de prompt aqui.
Use {{args}} para injeção de parâmetros.
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

| Método de Processamento          | Sintaxe            | Cenários Aplicáveis                  | Recursos de Segurança                  |
| -------------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injeção Sensível ao Contexto     | `{{args}}`         | Necessidade de controle preciso de parâmetros | Escape automático de Shell             |
| Processamento Padrão de Parâmetros | Sem marcação especial | Comandos simples, anexação de parâmetros | Anexar como está                       |
| Injeção de Comando Shell         | `!{command}`       | Necessidade de conteúdo dinâmico     | Confirmação de execução necessária antes |

#### 1. Injeção Sensível ao Contexto (`{{args}}`)

| Cenário          | Configuração TOML                       | Método de Chamada     | Efeito Real              |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Injeção Direta   | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| Em Comando Shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Executa `grep "hello" .` |

#### 2. Processamento Padrão de Parâmetros

| Situação de Entrada | Método de Processamento                              | Exemplo                                      |
| ------------------- | ---------------------------------------------------- | -------------------------------------------- |
| Possui parâmetros   | Anexar ao final do prompt (separado por duas quebras de linha) | `/cmd parâmetro` → Prompt original + parâmetro |
| Sem parâmetros      | Enviar prompt como está                              | `/cmd` → Prompt original                     |

🚀 Injeção de Conteúdo Dinâmico

| Tipo de Injeção         | Sintaxe        | Ordem de Processamento | Propósito                          |
| ----------------------- | -------------- | ---------------------- | ---------------------------------- |
| Conteúdo de Arquivo     | `@{file path}` | Processado primeiro    | Injetar arquivos de referência estáticos |
| Comandos Shell          | `!{command}`   | Processado no meio     | Injetar resultados de execução dinâmica |
| Substituição de Parâmetros | `{{args}}`  | Processado por último  | Injetar parâmetros do usuário      |

#### 3. Execução de Comando Shell (`!{...}`)

| Operação                        | Interação do Usuário |
| ------------------------------- | -------------------- |
| 1. Analisar comando e parâmetros | -                    |
| 2. Escape automático de Shell   | -                    |
| 3. Exibir diálogo de confirmação | ✅ Confirmação do usuário |
| 4. Executar comando             | -                    |
| 5. Injetar saída no prompt      | -                    |

Exemplo: Geração de Mensagem de Commit Git

````markdown
---
description: Gera mensagem de Commit com base nas alterações staged
---

Por favor, gere uma mensagem de Commit com base no seguinte diff:

```diff
!{git diff --staged}
```
````

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo | Status de Suporte        | Método de Processamento           |
| --------------- | ------------------------ | --------------------------------- |
| Arquivos de Texto | ✅ Suporte Completo      | Injetar conteúdo diretamente      |
| Imagens/PDF     | ✅ Suporte Multimodal    | Codificar e injetar               |
| Arquivos Binários | ⚠️ Suporte Limitado      | Pode ser ignorado ou truncado     |
| Diretório       | ✅ Injeção Recursiva     | Seguir regras do .gitignore       |

Exemplo: Comando de Code Review

```markdown
---
description: Code review com base nas melhores práticas
---

Revisar {{args}}, padrões de referência:

@{docs/code-standards.md}
```

### Exemplo Prático de Criação

#### Tabela de Etapas de Criação do Comando "Refatoração para Função Pura"

| Operação                      | Comando/Código                          |
| ----------------------------- | --------------------------------------- |
| 1. Criar estrutura de diretórios | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Criar arquivo de comando   | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Editar conteúdo do comando | Consulte o código completo abaixo.      |
| 4. Testar comando             | `@file.js` → `/refactor:pure`             |

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

| Boas Práticas        | Abordagem Recomendada                 | Evitar                                      |
| -------------------- | ------------------------------------- | ------------------------------------------- |
| Nomenclatura de Comandos | Usar namespaces para organização  | Evitar nomes excessivamente genéricos       |
| Processamento de Parâmetros | Usar `{{args}}` claramente      | Confiar na anexação padrão (fácil de confundir) |
| Tratamento de Erros  | Utilizar saída de erro do Shell       | Ignorar falha de execução                   |
| Organização de Arquivos | Organizar por função em diretórios | Todos os comandos no diretório raiz         |
| Campo de Descrição   | Sempre fornecer uma descrição clara   | Confiar na descrição gerada automaticamente |

#### Tabela de Lembrete de Recursos de Segurança

| Mecanismo de Segurança | Efeito de Proteção               | Operação do Usuário        |
| ---------------------- | -------------------------------- | -------------------------- |
| Escape de Shell        | Prevenir injeção de comando      | Processamento automático   |
| Confirmação de Execução | Evitar execução acidental       | Confirmação por diálogo    |
| Relatório de Erros     | Ajudar a diagnosticar problemas  | Visualizar informações de erro |

## 5. Subcomandos da CLI

Esses comandos são executados a partir do shell como `qwen <subcommand>` antes de iniciar uma sessão interativa.

### Gerenciamento de Sessões

| Comando              | Descrição                       | Exemplos de Uso                                                |
| -------------------- | ------------------------------- | -------------------------------------------------------------- |
| `qwen sessions list` | Listar sessões de conversa recentes | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Lista suas sessões recentes do Qwen Code com metadados.

**Flags:**

| Flag      | Tipo    | Padrão  | Descrição                                     |
| --------- | ------- | ------- | --------------------------------------------- |
| `--json`  | booleano | `false` | Saída como JSON Lines (um objeto JSON por linha) |
| `--limit` | número  | `20`    | Número máximo de sessões a exibir             |

**Saída legível por humanos (padrão):**

Uma tabela com as colunas: SESSION ID, STARTED (timestamp UTC), TITLE, BRANCH, PROMPT.

**Saída JSON (`--json`):**

Gera JSON Lines no stdout. Cada linha é um objeto JSON com os campos:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

O aviso de "has more sessions" é emitido via stderr para que o pipe para `jq` permaneça seguro.

**Exemplos:**

```bash
# Exibir as últimas 20 sessões (padrão)
qwen sessions list

# Exibir as últimas 50 sessões
qwen sessions list --limit 50

# Gerar saída como JSON para scripts
qwen sessions list --json | jq .
```