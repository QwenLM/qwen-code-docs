# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões, personalizar a interface e controlar seu comportamento de forma eficiente.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se dividem em três categorias:

| Tipo de Prefixo             | Descrição da Função                                | Caso de Uso Típico                                            |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Comandos de Barra (`/`)     | Controle meta do próprio Qwen Code                 | Gerenciar sessões, modificar configurações, obter ajuda       |
| Comandos com Arroba (`@`)   | Injetar rapidamente conteúdo de arquivo local no chat | Permitir que a IA analise arquivos ou código sob diretórios especificados |
| Comandos de Exclamação (`!`) | Interação direta com o Shell do sistema            | Executar comandos do sistema como `git status`, `ls`, etc.   |

## 1. Comandos de Barra (`/`)

Comandos de barra são usados para gerenciar sessões, interface e comportamento básico do Qwen Code.

### 1.1 Gerenciamento de Sessão e Projeto

Estes comandos ajudam a salvar, restaurar e resumir o progresso do trabalho.

| Comando          | Descrição                                                              | Exemplos de Uso                                                |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/init`          | Analisa o diretório atual e cria um arquivo de contexto inicial        | `/init`                                                        |
| `/summary`       | Gera um resumo do projeto com base no histórico da conversa            | `/summary`                                                     |
| `/compress`      | Substitui o histórico do chat por um resumo para economizar Tokens     | `/compress` ou `/summarize`                                    |
| `/compress-fast` | Compressão rápida sem IA — remove saídas antigas de ferramentas e partes de pensamento | `/compress-fast`                              |
| `/resume`        | Retoma uma sessão de conversa anterior                                 | `/resume` ou `/continue`                                       |
| `/recap`         | Gera um resumo de uma linha da sessão agora                            | `/recap`                                                       |
| `/restore`       | Reverte arquivos do projeto para o ponto de verificação anterior a uma chamada de ferramenta | `/restore` (lista) ou `/restore <ID>`          |
| `/delete`        | Exclui uma sessão anterior                                             | `/delete`                                                      |
| `/branch`        | Bifurca a conversa atual em uma nova sessão                            | `/branch`                                                      |
| `/fork`          | Cria um agente em segundo plano que herda toda a conversa              | `/fork <diretiva>`                                             |
| `/rewind`        | Retrocede a conversa para uma etapa anterior                           | `/rewind` ou `/rollback`                                       |
| `/export`        | Exporta o histórico da sessão para um arquivo                          | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename`        | Renomeia ou marca a sessão atual                                       | `/rename Minha Funcionalidade` ou `/tag`                       |

> [!note]
>
> `/summarize` é um alias para `/compress` (comprime o histórico do chat — uma operação destrutiva). Para gerar um resumo não destrutivo do projeto, use `/summary`.

### 1.2 Controle de Interface e Área de Trabalho

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando              | Descrição                                                                                                                                                                           | Exemplos de Uso                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/clear`             | Limpa o histórico da conversa e libera contexto                                                                                                                                     | `/clear`, `/reset`, `/new`                                                       |
| `/context`           | Mostra o detalhamento do uso da janela de contexto                                                                                                                                  | `/context`                                                                       |
| → `detail`           | Mostra o detalhamento do uso de contexto por item                                                                                                                                   | `/context detail`                                                                |
| `/history`           | Controla preferências de exibição do histórico e visibilidade                                                                                                                       | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff`              | Abre um visualizador de diff interativo mostrando mudanças não commitadas e diffs por turno. Use ←/→ para alternar entre o diff git atual e os turnos individuais, ↑/↓ para navegar pelos arquivos | `/diff`                                                                          |
| `/theme`             | Altera o tema visual do Qwen Code                                                                                                                                                   | `/theme`                                                                         |
| `/vim`               | Ativa/desativa o modo de edição Vim na área de entrada                                                                                                                              | `/vim`                                                                           |
| `/voice`             | Alterna a entrada de ditado por voz                                                                                                                                                 | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`              |
| `/directory`         | Gerencia o espaço de trabalho com suporte a múltiplos diretórios                                                                                                                    | `/dir add ./src,./tests`, `/dir show`                                            |
| `/cd`                | Move esta sessão para um novo diretório de trabalho                                                                                                                                 | `/cd ../other-project`                                                           |
| `/editor`            | Abre diálogo para selecionar editor suportado                                                                                                                                       | `/editor`                                                                        |
| `/statusline`        | Abre diálogo interativo de predefinição da [linha de status](./status-line.md)                                                                                                      | `/statusline`                                                                    |
| `/statusline <text>` | Gera uma [linha de status](./status-line.md) em modo comando via agente                                                                                                             | `/statusline show model and git branch`                                          |
| `/terminal-setup`    | Configura atalhos de teclado do terminal para entrada multilinha                                                                                                                    | `/terminal-setup`                                                                |

### 1.3 Configurações de Idioma

Comandos especificamente para controlar a interface e o idioma de saída.

| Comando               | Descrição                      | Exemplos de Uso             |
| --------------------- | ------------------------------ | --------------------------- |
| `/language`           | Visualizar ou alterar configurações de idioma | `/language`                |
| → `ui [idioma]`       | Definir idioma da interface UI | `/language ui zh-CN`        |
| → `output [idioma]`   | Definir idioma de saída do LLM | `/language output Chinese`  |

- Idiomas de interface UI disponíveis internamente: `zh-CN` (Chinês Simplificado), `en-US` (Inglês), `ru-RU` (Russo), `de-DE` (Alemão), `ja-JP` (Japonês), `pt-BR` (Português - Brasil), `fr-FR` (Francês), `ca-ES` (Catalão)
- Exemplos de idioma de saída: `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando          | Descrição                                          | Exemplos de Uso                                                                                  |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/mcp`           | Lista servidores e ferramentas MCP configurados    | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                |
| `/import-config` | Importa servidores MCP de configurações do Claude  | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools`         | Exibe a lista atual de ferramentas disponíveis     | `/tools`, `/tools desc`                                                                          |
| `/skills`        | Lista e executa skills disponíveis                 | `/skills`, `/skills <nome>`                                                                      |
| `/plan`          | Alterna para modo de plano ou sai do modo de plano | `/plan`, `/plan <tarefa>`, `/plan exit`                                                          |
| `/approval-mode` | Altera o modo de aprovação de ferramentas (apenas sessão atual) | `/approval-mode`, `/approval-mode auto-edit`                                      |
| → `plan`         | Apenas análise, sem execução (revisão segura)      | `/approval-mode plan`                                                                            |
| → `default`      | Exige aprovação para edições (uso diário)          | `/approval-mode default`                                                                         |
| → `auto-edit`    | Aprova edições automaticamente (ambiente confiável)| `/approval-mode auto-edit`                                                                       |
| → `auto`         | Aprovação avaliada por classificador (autônomo)    | `/approval-mode auto`                                                                            |
| → `yolo`         | Aprova tudo automaticamente (prototipagem rápida)  | `/approval-mode yolo`                                                                            |
| `/model`         | Alterna o modelo usado na sessão atual             | `/model`, `/model <id-do-modelo>` (alterna imediatamente)                                        |
| `/model --fast`  | Define um modelo mais leve para sugestões de prompt | `/model --fast qwen3-coder-flash`                                                                |
| `/model --voice` | Define o modelo usado para transcrição de voz      | `/model --voice <id-do-modelo>`                                                                  |
| `/extensions`    | Gerencia extensões                                 | `/extensions list`, `/extensions manage`                                                         |
| → `list`         | Lista extensões instaladas                         | `/extensions list`                                                                               |
| → `manage`       | Gerencia extensões instaladas (interativo)         | `/extensions manage`                                                                             |
| → `explore`      | Abre página de extensões no navegador              | `/extensions explore <Gemini\|ClaudeCode>`                                                       |
| → `install`      | Instala uma extensão de um repositório git ou caminho | `/extensions install <repo-ou-caminho>`                                                          |
| `/memory`        | Abre o diálogo do Gerenciador de Memória           | `/memory`                                                                                        |
| `/remember`      | Salva uma memória duradoura                        | `/remember Preferir respostas concisas`                                                          |
| `/forget`        | Remove entradas correspondentes da memória automática | `/forget <consulta>`                                                                            |
| `/dream`         | Executa manualmente a consolidação de memória automática | `/dream`                                                                                      |
| `/hooks`         | Gerencia hooks do Qwen Code                        | `/hooks`, `/hooks list`                                                                          |
| `/permissions`   | Gerencia regras de permissão                       | `/permissions`                                                                                   |
| `/agents`        | Gerencia subagentes                                | `/agents manage`, `/agents create`                                                               |
| `/arena`         | Gerencia sessões Arena                             | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (alias `choose`)                 |
| `/goal`          | Define uma meta — continua trabalhando até condição ser atendida | `/goal <condição>`, `/goal clear`                                                 |
| `/tasks`         | Lista tarefas em segundo plano                     | `/tasks`                                                                                         |
| `/workflows`     | Inspeciona execuções de workflow                   | `/workflows`, `/workflows <runId>`                                                               |
| `/lsp`           | Mostra status do servidor LSP                      | `/lsp`                                                                                           |
| `/trust`         | Gerencia configurações de confiança de pastas      | `/trust`                                                                                         |

> [!warning]
>
> Instale extensões (`/extensions install`) apenas de fontes confiáveis. Extensões podem agrupar servidores MCP, skills e comandos que são executados com as mesmas permissões do Qwen Code — elas podem acessar seus arquivos, chaves de API e dados de conversa. `/extensions install` não solicita confirmação.

> [!warning]
>
> Os modos de aprovação `auto-edit`, `auto` e `yolo` ignoram as solicitações de aprovação para execuções de ferramentas. No modo `yolo`, todas as ações — incluindo comandos shell, gravações de arquivo e requisições de rede — são executadas sem confirmação. Use esses modos apenas em ambientes confiáveis, em sandbox ou descartáveis.

> [!note]
>
> `/workflows`, `/lsp` e `/trust` são registrados apenas quando seus recursos estão ativados — respectivamente, pela variável de ambiente `QWEN_CODE_ENABLE_WORKFLOWS=1`, pela flag de CLI `--experimental-lsp` e pela configuração `security.folderTrust.enabled`. Quando desativados, não aparecerão e reportarão um comando desconhecido.

### 1.5 Skills Internos

Estes comandos invocam skills integrados que fornecem fluxos de trabalho especializados.

| Comando      | Descrição                                                          | Exemplos de Uso                                       |
| ------------ | ------------------------------------------------------------------ | ----------------------------------------------------- |
| `/review`    | Revisa alterações de código com 5 agentes paralelos + análise determinística | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Executa um prompt em um agendamento recorrente                     | `/loop 5m verificar o build`                          |
| `/simplify`  | Revisa alterações recentes e aplica edições de limpeza seguras diretamente | `/simplify`, `/simplify focus on duplication`      |
| `/qc-helper` | Responde perguntas sobre uso e configuração do Qwen Code           | `/qc-helper how do I configure MCP?`                 |

Consulte [Code Review](./code-review.md) para documentação completa do `/review`.

### 1.6 Pergunta Paralela (`/btw`)

O comando `/btw` permite fazer perguntas rápidas paralelas sem interromper ou afetar o fluxo principal da conversa.

| Comando                | Descrição                         |
| ---------------------- | --------------------------------- |
| `/btw <sua pergunta>`  | Faz uma pergunta paralela rápida  |
| `?btw <sua pergunta>`  | Sintaxe alternativa para perguntas paralelas |

**Como Funciona:**

- A pergunta paralela é enviada como uma chamada de API separada com contexto recente da conversa (até as últimas 20 mensagens)
- A resposta é exibida acima do Composer — você pode continuar digitando enquanto aguarda
- A conversa principal **não é bloqueada** — continua independentemente
- A resposta da pergunta paralela **não** se torna parte do histórico da conversa principal
- As respostas são renderizadas com suporte completo a Markdown (blocos de código, listas, tabelas, etc.)

**Atalhos de Teclado (Modo Interativo):**

| Atalho               | Ação                                                  |
| -------------------- | ----------------------------------------------------- |
| `Escape`             | Cancelar (enquanto carrega) ou dispensar (após concluído) |
| `Espaço` ou `Enter`  | Dispensar a resposta (quando a entrada está vazia)    |
| `Ctrl+C` ou `Ctrl+D` | Cancelar uma pergunta paralela em andamento           |

**Exemplo:**

```
(Enquanto a conversa principal é sobre refatoração de código)

> /btw Qual a diferença entre let e var em JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw Qual a diferença entre let          │
  │     e var em JavaScript?                 │
  │                                          │
  │ + Respondendo...                         │
  │ Pressione Escape, Ctrl+C ou Ctrl+D para  │
  │ cancelar                                 │
  ╰──────────────────────────────────────────╯
  > (Composer permanece ativo — continue digitando)

(Depois que a resposta chega)

  ╭──────────────────────────────────────────╮
  │ /btw Qual a diferença entre let          │
  │     e var em JavaScript?                 │
  │                                          │
  │ `let` tem escopo de bloco, enquanto      │
  │ `var` tem escopo de função. `let` foi    │
  │ introduzido no ES6 e não sofre hoisting  │
  │ da mesma forma.                          │
  │                                          │
  │ Pressione Espaço, Enter ou Escape para   │
  │ dispensar                                │
  ╰──────────────────────────────────────────╯
  > (Composer ainda ativo)
```
**Modos de Execução Suportados:**

| Modo                | Comportamento                                    |
| ------------------- | ------------------------------------------------ |
| Interativo          | Mostra acima do Composer com renderização Markdown |
| Não interativo      | Retorna resultado em texto: `btw> pergunta\nresposta` |
| ACP (Agent Protocol)| Retorna um gerador assíncrono `stream_messages`      |

> [!tip]
>
> Use `/btw` quando precisar de uma resposta rápida sem sair da sua tarefa principal. É especialmente útil para esclarecer conceitos, verificar fatos ou obter explicações rápidas enquanto mantém o foco no seu fluxo de trabalho principal.

### 1.7 Recap da Sessão (`/recap`)

O comando `/recap` gera um breve resumo de "onde você parou" da sessão atual, para que você possa retomar uma conversa antiga sem precisar rolar para trás em páginas de histórico.

| Comando   | Descrição                                |
| --------- | ---------------------------------------- |
| `/recap`  | Gerar e mostrar um resumo de uma linha da sessão |

**Como funciona:**

- Usa o modelo rápido configurado (`fastModel`) quando disponível, caindo de volta para o modelo principal da sessão. Um modelo pequeno e barato é suficiente para um resumo.
- A conversa recente (até 30 mensagens, apenas texto — chamadas de ferramenta e respostas de ferramenta são filtradas) é enviada ao modelo com um prompt de sistema restrito.
- O resumo é renderizado em cor dim com um prefixo `❯` para se destacar das respostas reais do assistente.
- Recusa com um erro inline se um turno do modelo estiver em andamento ou outro comando estiver processando. Se não houver conversa utilizável, ou a geração subjacente falhar, `/recap` mostra uma mensagem informativa curta em vez de um resumo — o comando manual sempre responde com algo.

**Disparo automático ao retornar de ausência:**

Se o terminal ficar sem foco por **5 minutos ou mais** e receber foco novamente, um resumo é gerado e mostrado automaticamente (apenas quando nenhuma resposta do modelo está em andamento; caso contrário, aguarda o turno atual terminar e então dispara). Diferente do comando manual, o disparo automático é completamente silencioso em caso de falha: se houver erro de geração ou não houver nada para resumir, nenhuma mensagem é adicionada ao histórico. Controlado pela configuração `general.showSessionRecap` (padrão: `false`); o comando manual `/recap` sempre funciona independentemente dessa configuração.

**Exemplo:**

```
> /recap

❯ Refatorando loopDetectionService.ts para tratar OOM de sessões longas causado
  por streamContentHistory e contentStats ilimitados. O próximo passo é
  implementar a opção B (janela deslizante LRU com FNV-1a) pendente de confirmação.
```

> [!tip]
>
> Configure um modelo rápido via `/model --fast <model>` (ex.: `qwen3-coder-flash`) para tornar `/recap` rápido e barato. Defina `general.showSessionRecap` como `true` para ativar o disparo automático; o comando manual `/recap` sempre funciona independentemente dessa configuração.

### 1.8 Visualizador de Diff (`/diff`)

O comando `/diff` abre um visualizador de diff interativo mostrando alterações não commitadas e diffs por turno. Use ←/→ para alternar entre o diff git atual e turnos individuais da conversa, ↑/↓ para navegar pelos arquivos e Enter para visualizar diffs inline.

**Como funciona:**

No modo interativo, `/diff` abre um diálogo com um **seletor de fonte** na parte superior:

- **Atual (Current)** — árvore de trabalho vs HEAD (`git diff HEAD`). Mostra todas as alterações não commitadas, incluindo arquivos staged, unstaged e não rastreados.
- **T1, T2, T3, …** — diffs por turno, uma aba para cada turno do modelo que modificou arquivos. Os turnos mais recentes aparecem primeiro. Cada aba mostra uma prévia do prompt original para contexto.

A lista de arquivos exibe estatísticas por arquivo (linhas adicionadas/removidas) com tags para estados especiais (`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`). Pressione Enter em um arquivo para ver seu diff inline com hunks destacados por sintaxe.

Diffs por turno requerem que o checkpoint de arquivos esteja ativado (ativado por padrão no modo interativo). Quando o checkpoint de arquivos está desligado, apenas a fonte "Atual" está disponível.

**Atalhos de teclado:**

| Tecla      | Ação                                      |
| ---------- | ----------------------------------------- |
| `←` / `→`  | Alternar entre fontes (Atual / T1 / T2…) |
| `↑` / `↓`  | Navegar pela lista de arquivos            |
| `j` / `k`  | Navegar pela lista de arquivos (estilo vim) |
| Enter      | Visualizar diff inline do arquivo selecionado |
| `←` / Esc  | Voltar à lista de arquivos da visualização inline |
| Esc        | Fechar o diálogo                          |

**Exemplo:**

```
┌ /diff · Turno 3 "refatorar o middleware de autenticação" ──── 3 arquivos +45 -12 ┐
│                                                                                    │
│ ◀ Atual · T3 · T2 · T1 ▶                                                          │
│                                                                                    │
│ › src/utils/parser.ts                              +30 -8                          │
│   src/utils/parser.test.ts                         +12 -2                          │
│   README.md                                        +3 -2                           │
│                                                                                    │
│ ←/→ fonte · ↑/↓ arquivo · Enter ver · Esc fechar                                  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Modo não interativo:**

Em contextos headless (`--prompt`) ou não interativos, `/diff` imprime um resumo em texto simples da árvore de trabalho vs HEAD. A navegação por turno não está disponível.

```
3 arquivos alterados, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando          | Descrição                                                                                                                              | Exemplos de Uso                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/help`          | Exibir informações de ajuda para comandos disponíveis                                                                                  | `/help` ou `/?`                                                                                        |
| `/status`        | Exibir informações de versão                                                                                                           | `/status` ou `/about`                                                                                  |
| `/status paths`  | Exibir caminhos do arquivo de sessão e log atuais                                                                                      | `/status paths`                                                                                        |
| `/stats`         | Abrir o painel interativo de estatísticas de uso (abas Sessão, Atividade e Eficiência)                                                 | `/stats` ou `/usage`                                                                                   |
| `/stats model`   | Mostrar detalhamento de tokens por modelo e custo estimado                                                                             | `/stats model`                                                                                         |
| `/stats tools`   | Mostrar contagens de chamadas por ferramenta                                                                                           | `/stats tools`                                                                                         |
| `/stats skills`  | Mostrar contagens de chamadas por habilidade para a sessão ativa atual (apenas ao vivo; exclui atividade diária/mensal entre sessões)  | `/stats skills`                                                                                        |
| `/stats daily`   | Mostrar estatísticas de uso diário de tokens                                                                                           | `/stats daily` (alias `day`), `/stats day [YYYY-MM-DD]`                                                |
| `/stats monthly` | Mostrar estatísticas de uso mensal de tokens                                                                                           | `/stats monthly` (alias `month`), `/stats month [YYYY-MM]`                                             |
| `/stats export`  | Exportar estatísticas de uso para CSV ou JSON                                                                                          | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]`                    |
| `/settings`      | Abrir editor de configurações                                                                                                          | `/settings`                                                                                            |
| `/auth`          | Alterar método de autenticação                                                                                                         | `/auth`, `/connect`, `/login`                                                                          |
| `/doctor`        | Executar diagnósticos de instalação e ambiente                                                                                         | `/doctor`, `/doctor memory`                                                                            |
| → `memory`       | Mostrar diagnósticos de memória do processo atual                                                                                      | `/doctor memory [--json] [--sample] [--snapshot]`                                                      |
| → `cpu-profile`  | Gravar um perfil de CPU para análise no Chrome DevTools                                                                                | `/doctor cpu-profile [--duration <segundos>]`                                                          |
| → `rollback`     | Reverter o binário CLI autônomo para a versão anterior (apenas instalações autônomas; para histórico de conversas use `/rewind`)       | `/doctor rollback`                                                                                     |
| `/docs`          | Abrir a documentação completa do Qwen Code no navegador                                                                                | `/docs`                                                                                                |
| `/ide`           | Gerenciar integração com IDE                                                                                                           | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                                           |
| `/insight`       | Gerar insights de programação a partir do histórico de chat                                                                           | `/insight`                                                                                             |
| `/setup-github`  | Configurar GitHub Actions                                                                                                              | `/setup-github`                                                                                        |
| `/bug`           | Enviar um relatório de bug sobre o Qwen Code                                                                                           | `/bug Botão de clique não responde`                                                                    |
| `/copy`          | Copiar para área de transferência: resposta (N-ésima anterior), código (por linguagem), LaTeX ou Mermaid                              | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                                     |
| `/quit`          | Sair do Qwen Code imediatamente                                                                                                        | `/quit` ou `/exit`                                                                                     |

> [!warning]
>
> `/doctor memory --snapshot` escreve um snapshot do heap V8 que pode conter prompts, conteúdos de arquivos, chaves de API e resultados de ferramentas da sessão atual. Revise o arquivo antes de compartilhá-lo.

### 1.10 Atalhos Comuns

| Atalho             | Função                | Observação                                                                 |
| ------------------ | --------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | Limpar tela           | Limpa apenas a tela visível (não reinicia a sessão como `/clear`)         |
| `Ctrl/cmd+T`       | Alternar descrição de ferramenta | Gerenciamento de ferramentas MCP                                           |
| `Ctrl/cmd+C`×2     | Confirmação de saída  | Mecanismo de saída segura                                                  |
| `Ctrl/cmd+Z`       | Desfazer entrada      | Edição de texto                                                            |
| `Ctrl/cmd+Shift+Z` | Refazer entrada       | Edição de texto                                                            |

### 1.11 Comandos de Autenticação

Use `/auth` dentro de uma sessão do Qwen Code para configurar autenticação. Use `/doctor` para inspecionar o status atual da autenticação e do ambiente.

| Comando   | Descrição                                                               |
| --------- | ----------------------------------------------------------------------- |
| `/auth`   | Configurar autenticação interativamente (aliases: `/connect`, `/login`) |
| `/doctor` | Mostrar verificações de autenticação e ambiente                         |

> [!note]
>
> O comando CLI autônomo `qwen auth` foi removido. Invocações legadas como `qwen auth status` exibem um aviso de remoção com orientação de migração. Veja a página [Autenticação](../configuration/auth) para detalhes completos.

## 2. Comandos @ (Introduzindo Arquivos)

Os comandos @ são usados para adicionar rapidamente conteúdo de arquivos ou diretórios locais à conversa.

| Formato do Comando | Descrição                                  | Exemplos                                         |
| ------------------ | ------------------------------------------ | ------------------------------------------------ |
| `@<caminho do arquivo>` | Inserir conteúdo do arquivo especificado   | `@src/main.py Explique este código, por favor`   |
| `@<caminho do diretório>` | Ler recursivamente todos os arquivos de texto no diretório | `@docs/ Resuma o conteúdo deste documento`      |
| `@` isolado        | Usado quando discutindo o símbolo `@` em si | `@ Para que este símbolo é usado em programação?` |

Observação: Espaços em caminhos precisam ser escapados com barra invertida (ex.: `@My\ Documents/file.txt`)

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Os comandos de exclamação permitem executar comandos do sistema diretamente no Qwen Code.

| Formato do Comando | Descrição                                                        | Exemplos                               |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `!<comando shell>` | Executar comando em um sub-Shell                                 | `!ls -la`, `!git status`               |
| `!` isolado        | Alternar modo Shell; qualquer entrada é executada diretamente como comando Shell | `!`(enter) → Digitar comando → `!`(sair) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts frequentemente usados como comandos de atalho para melhorar a eficiência do trabalho e garantir consistência.

> [!note]
>
> Comandos personalizados agora usam o formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade retroativa. Quando arquivos TOML são detectados, um aviso de migração automática será exibido.

### Visão Geral Rápida

| Função         | Descrição                                | Vantagens                             | Prioridade | Cenários Aplicáveis                                 |
| -------------- | ---------------------------------------- | ------------------------------------ | ---------- | ---------------------------------------------------- |
| Namespace      | Subdiretório cria comandos com prefixo de dois pontos | Melhor organização de comandos      |            |                                                      |
| Comandos Globais| `~/.qwen/commands/`                      | Disponível em todos os projetos       | Baixa      | Comandos pessoais frequentes, uso entre projetos     |
| Comandos do Projeto | `<diretório raiz do projeto>/.qwen/commands/` | Específicos do projeto, versionáveis | Alta       | Compartilhamento em equipe, comandos específicos do projeto |

Regras de Prioridade: Comandos do projeto > Comandos do usuário (comando do projeto é usado quando os nomes são iguais)

### Regras de Nomenclatura de Comandos

#### Tabela de Mapeamento de Caminho de Arquivo para Nome de Comando

| Localização do Arquivo               | Comando Gerado | Exemplo de Chamada     |
| ------------------------------------ | -------------- | --------------------- |
| `~/.qwen/commands/test.md`          | `/test`        | `/test Parâmetro`     |
| `<projeto>/.qwen/commands/git/commit.md` | `/git:commit`  | `/git:commit Mensagem` |

Regras de Nomenclatura: Separador de caminho (`/` ou `\`) convertido para dois pontos (`:`)

### Especificação do Formato de Arquivo Markdown (Recomendado)

Comandos personalizados usam arquivos Markdown com frontmatter YAML opcional:

```markdown
---
description: Descrição opcional (exibida em /help)
---

Seu conteúdo de prompt aqui.
Use {{args}} para injeção de parâmetros.
```

| Campo       | Obrigatório | Descrição                              | Exemplo                                    |
| ----------- | ----------- | -------------------------------------- | ----------------------------------------- |
| `description` | Opcional  | Descrição do comando (exibida em /help) | `description: Ferramenta de análise de código` |
| Corpo do prompt | Obrigatório | Conteúdo do prompt enviado ao modelo  | Qualquer conteúdo Markdown após o frontmatter |

### Formato de Arquivo TOML (Obsoleto)

> [!warning]
>
> **Obsoleto:** O formato TOML ainda é suportado, mas será removido em uma versão futura. Migre para o formato Markdown.

| Campo       | Obrigatório | Descrição                              | Exemplo                                    |
| ----------- | ----------- | -------------------------------------- | ----------------------------------------- |
| `prompt`    | Obrigatório | Conteúdo do prompt enviado ao modelo   | `prompt = "Por favor analise o código: {{args}}"` |
| `description` | Opcional  | Descrição do comando (exibida em /help) | `description = "Ferramenta de análise de código"` |

### Mecanismo de Processamento de Parâmetros

| Método de Processamento        | Sintaxe             | Cenários Aplicáveis                | Recursos de Segurança                  |
| ------------------------------ | ------------------- | --------------------------------- | -------------------------------------- |
| Injeção sensível ao contexto    | `{{args}}`          | Necessita controle preciso de parâmetros | Escape automático de Shell             |
| Processamento padrão de parâmetros | Sem marcação especial | Comandos simples, anexação de parâmetros | Anexado como está                      |
| Injeção de comando Shell        | `!{comando}`        | Necessita conteúdo dinâmico        | Requer confirmação antes da execução   |

#### 1. Injeção Sensível ao Contexto (`{{args}}`)

| Cenário         | Configuração TOML                          | Método de Chamada      | Efeito Real                  |
| --------------- | ------------------------------------------ | --------------------- | ---------------------------- |
| Injeção crua    | `prompt = "Corrigir: {{args}}"`            | `/corrigir "Problema no botão"` | `Corrigir: "Problema no botão"` |
| Em comando Shell| `prompt = "Pesquisar: !{grep {{args}} .}"` | `/pesquisar "olá"`    | Executa `grep "olá" .`       |

#### 2. Processamento Padrão de Parâmetros

| Situação de Entrada | Método de Processamento                             | Exemplo                                        |
| ------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Com parâmetros      | Anexar ao final do prompt (separado por duas quebras de linha) | `/cmd parâmetro` → Prompt original + parâmetro |
| Sem parâmetros      | Enviar prompt como está                              | `/cmd` → Prompt original                       |
🚀 Injeção Dinâmica de Conteúdo

| Tipo de Injeção            | Sintaxe         | Ordem de Processamento | Propósito                           |
| -------------------------- | --------------- | ---------------------- | ----------------------------------- |
| Conteúdo de Arquivo        | `@{caminho}`    | Processado primeiro    | Injetar arquivos de referência estáticos |
| Comandos Shell             | `!{comando}`    | Processado no meio     | Injetar resultados de execução dinâmica  |
| Substituição de Parâmetros | `{{args}}`      | Processado por último  | Injetar parâmetros do usuário       |

#### 3. Execução de Comando Shell (`!{...}`)

| Operação                          | Interação do Usuário    |
| --------------------------------- | ----------------------- |
| 1. Analisar comando e parâmetros  | -                       |
| 2. Escape automático do Shell     | -                       |
| 3. Exibir diálogo de confirmação  | ✅ Confirmação do usuário |
| 4. Executar comando               | -                       |
| 5. Injetar saída no prompt        | -                       |

Exemplo: Geração de Mensagem de Commit Git

````markdown
---
description: Gerar mensagem de commit baseada nas alterações em staged
---

Por favor, gere uma mensagem de commit com base no seguinte diff:

```diff
!{git diff --staged}
```
````

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo      | Status de Suporte           | Método de Processamento        |
| -------------------- | --------------------------- | ------------------------------- |
| Arquivos de Texto    | ✅ Suporte Completo         | Injetar conteúdo diretamente    |
| Imagens/PDF          | ✅ Suporte Multimodal       | Codificar e injetar             |
| Arquivos Binários    | ⚠️ Suporte Limitado         | Pode ser ignorado ou truncado   |
| Diretório            | ✅ Injeção Recursiva        | Seguir regras do .gitignore     |

Exemplo: Comando de Revisão de Código

```markdown
---
description: Revisão de código baseada em melhores práticas
---

Revise {{args}}, consulte os padrões:

@{docs/code-standards.md}
```

### Exemplo Prático de Criação

#### Tabela de Etapas de Criação do Comando "Refatoração de Função Pura"

| Operação                         | Comando/Código                                |
| -------------------------------- | --------------------------------------------- |
| 1. Criar estrutura de diretórios | `mkdir -p ~/.qwen/commands/refactor`          |
| 2. Criar arquivo de comando      | `touch ~/.qwen/commands/refactor/pure.md`     |
| 3. Editar conteúdo do comando    | Consulte o código completo abaixo.            |
| 4. Testar comando                | `@file.js` → `/refactor:pure`                 |

```markdown
---
description: Refatorar código para função pura
---

Analise o código no contexto atual e refatore para função pura.
Requisitos:

1. Fornecer o código refatorado
2. Explicar as principais alterações e a implementação das características de função pura
3. Manter a funcionalidade inalterada
```

### Resumo de Melhores Práticas para Comandos Personalizados

#### Tabela de Recomendações de Design de Comando

| Pontos de Prática      | Abordagem Recomendada              | Evitar                              |
| ---------------------- | ---------------------------------- | ----------------------------------- |
| Nomeação de Comandos   | Use namespaces para organização    | Evitar nomes muito genéricos        |
| Processamento de Parâmetros | Use `{{args}}` claramente         | Depender de anexo padrão (confunde) |
| Tratamento de Erros    | Utilize saída de erro do Shell     | Ignorar falhas de execução          |
| Organização de Arquivos | Organize por função em diretórios | Todos os comandos no diretório raiz |
| Campo de Descrição     | Sempre forneça descrição clara     | Depender de descrição automática    |

#### Tabela de Lembrete de Funcionalidades de Segurança

| Mecanismo de Segurança   | Efeito de Proteção               | Operação do Usuário       |
| ------------------------ | -------------------------------- | ------------------------- |
| Escape do Shell          | Prevenir injeção de comandos     | Processamento automático  |
| Confirmação de Execução  | Evitar execução acidental        | Confirmação em diálogo    |
| Relato de Erros          | Ajudar a diagnosticar problemas  | Visualizar informações de erro |

## 5. Subcomandos da CLI

Esses comandos são executados no shell como `qwen <subcommand>` antes de iniciar uma sessão interativa.

### Gerenciamento de Sessões

| Comando               | Descrição                          | Exemplos de Uso                                              |
| --------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `qwen sessions list`  | Listar sessões de conversa recentes | `qwen sessions list`, `qwen sessions list --json --limit 50` |

#### `qwen sessions list`

Lista suas sessões recentes do Qwen Code com metadados.

**Flags:**

| Flag      | Tipo    | Padrão  | Descrição                                         |
| --------- | ------- | ------- | ------------------------------------------------- |
| `--json`  | booleano | `false` | Saída como JSON Lines (um objeto JSON por linha)  |
| `--limit` | número  | `20`    | Número máximo de sessões a exibir                 |

**Saída legível por humanos (padrão):**

Uma tabela com colunas: ID DA SESSÃO, INICIADA (timestamp UTC), TÍTULO, BRANCH, PROMPT.

**Saída JSON (`--json`):**

Gera saída JSON Lines no stdout. Cada linha é um objeto JSON com campos:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

O aviso "há mais sessões" é emitido via stderr, para que o redirecionamento para `jq` permaneça seguro.

**Exemplos:**

```bash
# Mostrar as últimas 20 sessões (padrão)
qwen sessions list

# Mostrar as últimas 50 sessões
qwen sessions list --limit 50

# Saída como JSON para uso em scripts
qwen sessions list --json | jq .
```