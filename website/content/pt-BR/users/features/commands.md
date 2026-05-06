# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões, personalizar a interface e controlar seu comportamento de forma eficiente.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se dividem em três categorias:

| Tipo de Prefixo            | Descrição da Função                                 | Caso de Uso Típico                                               |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Comandos de Barra (`/`)    | Controle em nível meta do próprio Qwen Code         | Gerenciar sessões, modificar configurações, obter ajuda          |
| Comandos At (`@`)          | Injetar rapidamente o conteúdo de arquivos locais na conversa | Permitir que a IA analise arquivos especificados ou código em diretórios |
| Comandos de Exclamação (`!`) | Interação direta com o Shell do sistema           | Executar comandos do sistema como `git status`, `ls`, etc.       |

## 1. Comandos de Barra (`/`)

Os comandos de barra são usados para gerenciar sessões, a interface e o comportamento básico do Qwen Code.

### 1.1 Gerenciamento de Sessão e Projeto

Esses comandos ajudam você a salvar, restaurar e resumir o progresso do trabalho.

| Comando     | Descrição                                               | Exemplos de Uso                      |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analisar o diretório atual e criar o arquivo de contexto inicial | `/init`                              |
| `/summary`  | Gerar um resumo do projeto com base no histórico de conversa    | `/summary`                           |
| `/compress` | Substituir o histórico do chat por um resumo para economizar Tokens          | `/compress`                          |
| `/resume`   | Retomar uma sessão de conversa anterior                    | `/resume`                            |
| `/recap`    | Gerar um resumo de uma linha da sessão agora                     | `/recap`                             |
| `/restore`  | Restaurar arquivos para o estado anterior à execução da ferramenta              | `/restore` (lista) ou `/restore <ID>` |

### 1.2 Controle de Interface e Área de Trabalho

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando      | Descrição                              | Exemplos de Uso                |
| ------------ | ---------------------------------------- | ----------------------------- |
| `/clear`     | Limpar o conteúdo da tela do terminal            | `/clear` (atalho: `Ctrl+L`) |
| `/context`   | Mostrar o detalhamento do uso da janela de contexto      | `/context`                    |
| → `detail`   | Mostrar detalhamento do uso de contexto por item    | `/context detail`             |
| `/theme`     | Alterar o tema visual do Qwen Code            | `/theme`                      |
| `/vim`       | Ativar/desativar o modo de edição Vim na área de entrada  | `/vim`                        |
| `/directory` | Gerenciar área de trabalho com suporte a múltiplos diretórios | `/dir add ./src,./tests`      |
| `/editor`    | Abrir diálogo para selecionar o editor suportado   | `/editor`                     |

### 1.3 Configurações de Idioma

Comandos específicos para controlar o idioma da interface e da saída.

| Comando               | Descrição                      | Exemplos de Uso             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Visualizar ou alterar configurações de idioma | `/language`                |
| → `ui [language]`     | Definir idioma da interface do usuário        | `/language ui zh-CN`       |
| → `output [language]` | Definir idioma de saída do LLM          | `/language output Chinese` |

- Idiomas de UI integrados disponíveis: `zh-CN` (Chinês Simplificado), `en-US` (Inglês), `ru-RU` (Russo), `de-DE` (Alemão)
- Exemplos de idioma de saída: `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando          | Descrição                                   | Exemplos de Uso                                |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Listar servidores e ferramentas MCP configurados         | `/mcp`, `/mcp desc`                           |
| `/tools`         | Exibir lista de ferramentas disponíveis atualmente         | `/tools`, `/tools desc`                       |
| `/skills`        | Listar e executar skills disponíveis                 | `/skills`, `/skills <name>`                   |
| `/plan`          | Alternar para o modo de plano ou sair do modo de plano         | `/plan`, `/plan <task>`, `/plan exit`         |
| `/approval-mode` | Alterar o modo de aprovação para uso de ferramentas           | `/approval-mode <mode (auto-edit)> --project` |
| →`plan`          | Apenas análise, sem execução                   | Revisão segura                                 |
| →`default`       | Exigir aprovação para edições                    | Uso diário                                     |
| →`auto-edit`     | Aprovar edições automaticamente                   | Ambiente confiável                           |
| →`yolo`          | Aprovar tudo automaticamente          | Prototipagem rápida                             |
| `/model`         | Alternar o modelo usado na sessão atual          | `/model`                                      |
| `/model --fast`  | Definir um modelo mais leve para sugestões de prompt    | `/model --fast qwen3-coder-flash`             |
| `/extensions`    | Listar todas as extensões ativas na sessão atual | `/extensions`                                 |
| `/memory`        | Abrir o diálogo do Gerenciador de Memória                | `/memory`                                     |
| `/remember`      | Salvar uma memória durável                         | `/remember Prefer terse responses`            |
| `/forget`        | Remover entradas correspondentes da memória automática      | `/forget <query>`                             |
| `/dream`         | Executar manualmente a consolidação da memória automática        | `/dream`                                      |

### 1.5 Skills Integrados

Esses comandos invocam skills empacotados que fornecem fluxos de trabalho especializados.

| Comando      | Descrição                                                         | Exemplos de Uso                                    |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | Revisar alterações de código com 5 agentes paralelos + análise determinística | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | Executar um prompt em um cronograma recorrente                                | `/loop 5m check the build`                        |
| `/qc-helper` | Responder perguntas sobre o uso e configuração do Qwen Code            | `/qc-helper how do I configure MCP?`              |

Consulte [Code Review](./code-review.md) para a documentação completa do `/review`.

### 1.6 Pergunta Lateral (`/btw`)

O comando `/btw` permite fazer perguntas laterais rápidas sem interromper ou afetar o fluxo principal da conversa.

| Comando                | Descrição                           |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | Fazer uma pergunta lateral rápida             |
| `?btw <your question>` | Sintaxe alternativa para perguntas laterais |

**Como funciona:**

- A pergunta lateral é enviada como uma chamada de API separada com o contexto recente da conversa (até as últimas 20 mensagens)
- A resposta é exibida acima do Composer — você pode continuar digitando enquanto aguarda
- A conversa principal **não é bloqueada** — ela continua de forma independente
- A resposta da pergunta lateral **não** se torna parte do histórico da conversa principal
- As respostas são renderizadas com suporte completo a Markdown (blocos de código, listas, tabelas, etc.)

**Atalhos de Teclado (Modo Interativo):**

| Shortcut             | Ação                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | Cancelar (durante o carregamento) ou dispensar (após a conclusão) |
| `Space` ou `Enter`   | Dispensar a resposta (quando a entrada está vazia)            |
| `Ctrl+C` ou `Ctrl+D` | Cancelar uma pergunta lateral em andamento                   |

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

| Mode                 | Comportamento                                     |
| -------------------- | -------------------------------------------- |
| Interactive          | Exibe acima do Composer com renderização Markdown |
| Non-interactive      | Retorna resultado em texto: `btw> question\nanswer` |
| ACP (Agent Protocol) | Retorna gerador assíncrono stream_messages      |

> [!tip]
>
> Use `/btw` quando precisar de uma resposta rápida sem desviar do seu objetivo principal. É especialmente útil para esclarecer conceitos, verificar fatos ou obter explicações rápidas enquanto mantém o foco no seu fluxo de trabalho principal.

### 1.7 Resumo da Sessão (`/recap`)

O comando `/recap` gera um breve resumo de "onde você parou" da sessão atual, permitindo que você retome uma conversa antiga sem precisar rolar páginas de histórico.

| Comando  | Descrição                                |
| -------- | ------------------------------------------ |
| `/recap` | Gerar e exibir um resumo de uma linha da sessão |

**Como funciona:**

- Usa o modelo rápido configurado (configuração `fastModel`) quando disponível, com fallback para o modelo principal da sessão. Um modelo pequeno e barato é suficiente para um resumo.
- A conversa recente (até 30 mensagens, apenas texto — chamadas e respostas de ferramentas são filtradas) é enviada ao modelo com um prompt de sistema restrito.
- O resumo é renderizado em cor mais clara com o prefixo `❯` para se destacar das respostas reais do assistente.
- Recusa com um erro inline se uma resposta do modelo estiver em andamento ou outro comando estiver sendo processado. Se não houver conversa utilizável ou se a geração subjacente falhar, o `/recap` mostra uma mensagem informativa curta em vez de um resumo — o comando manual sempre responde com algo.

**Acionamento automático ao retornar de uma ausência:**

Se o terminal ficar desfocado por **5+ minutos** e for focado novamente, um resumo é gerado e exibido automaticamente (apenas quando nenhuma resposta do modelo está em andamento; caso contrário, ele aguarda a conclusão da vez atual e então é acionado). Diferente do comando manual, o acionamento automático é totalmente silencioso em caso de falha: se houver erros de geração ou nada para resumir, nenhuma mensagem é adicionada ao histórico. Controlado pela configuração `general.showSessionRecap` (padrão: `true`); o comando manual `/recap` sempre funciona independentemente dessa configuração.

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
> `general.showSessionRecap` como `false` para desativar o acionamento automático
> mantendo o comando manual disponível.

### 1.8 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando     | Descrição                                     | Exemplos de Uso                   |
| ----------- | ----------------------------------------------- | -------------------------------- |
| `/help`     | Exibir informações de ajuda para comandos disponíveis | `/help` ou `/?`                  |
| `/about`    | Exibir informações de versão                     | `/about`                         |
| `/stats`    | Exibir estatísticas detalhadas da sessão atual | `/stats`                         |
| `/settings` | Abrir editor de configurações                            | `/settings`                      |
| `/auth`     | Alterar método de autenticação                    | `/auth`                          |
| `/bug`      | Enviar relatório de problema sobre o Qwen Code                    | `/bug Button click unresponsive` |
| `/copy`     | Copiar o conteúdo da última saída para a área de transferência           | `/copy`                          |
| `/quit`     | Sair do Qwen Code imediatamente                      | `/quit` ou `/exit`               |

### 1.9 Atalhos Comuns

| Shortcut           | Função                | Nota                   |
| ------------------ | ----------------------- | ---------------------- |
| `Ctrl/cmd+L`       | Limpar tela            | Equivalente a `/clear` |
| `Ctrl/cmd+T`       | Alternar descrição da ferramenta | Gerenciamento de ferramentas MCP    |
| `Ctrl/cmd+C`×2     | Confirmação de saída       | Mecanismo de saída segura  |
| `Ctrl/cmd+Z`       | Desfazer entrada              | Edição de texto           |
| `Ctrl/cmd+Shift+Z` | Refazer entrada              | Edição de texto           |

### 1.10 Subcomandos de Autenticação via CLI

Além do comando de barra `/auth` dentro da sessão, o Qwen Code fornece subcomandos CLI independentes para gerenciar a autenticação diretamente pelo terminal:

| Command                                              | Descrição                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `qwen auth`                                          | Configuração interativa de autenticação                              |
| `qwen auth coding-plan`                              | Autenticar com o Alibaba Cloud Coding Plan                   |
| `qwen auth coding-plan --region china --key sk-sp-…` | Configuração não interativa do Coding Plan (para scripts)             |
| `qwen auth api-key`                                  | Autenticar com uma chave de API                                  |
| `qwen auth qwen-oauth`                               | ~~Autenticar com Qwen OAuth~~ (descontinuado em 2026-04-15) |
| `qwen auth status`                                   | Mostrar status atual da autenticação                            |

> [!tip]
>
> Esses comandos são executados fora de uma sessão do Qwen Code. Use-os para configurar a autenticação antes de iniciar uma sessão ou em scripts e ambientes de CI. Consulte a página [Authentication](../configuration/auth) para detalhes completos.

## 2. Comandos @ (Introduzindo Arquivos)

Os comandos @ são usados para adicionar rapidamente o conteúdo de arquivos ou diretórios locais à conversa.

| Formato do Comando      | Descrição                                  | Exemplos                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<file path>`      | Injetar conteúdo do arquivo especificado             | `@src/main.py Please explain this code`          |
| `@<directory path>` | Ler recursivamente todos os arquivos de texto no diretório | `@docs/ Summarize content of this document`      |
| `@` isolado      | Usado ao discutir o próprio símbolo `@`       | `@ What is this symbol used for in programming?` |

Nota: Espaços em caminhos precisam ser escapados com barra invertida (ex.: `@My\ Documents/file.txt`)

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Os comandos de exclamação permitem executar comandos do sistema diretamente dentro do Qwen Code.

| Formato do Comando     | Descrição                                                        | Exemplos                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | Executar comando em sub-Shell                                       | `!ls -la`, `!git status`               |
| `!` isolado     | Alternar modo Shell, qualquer entrada é executada diretamente como comando Shell | `!`(enter) → Inserir comando → `!`(exit) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts usados frequentemente como comandos de atalho para melhorar a eficiência do trabalho e garantir consistência.

> [!note]
>
> Os comandos personalizados agora usam o formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade com versões anteriores. Quando arquivos TOML são detectados, um prompt de migração automática será exibido.

### Visão Rápida

| Função         | Descrição                                | Vantagens                             | Prioridade | Cenários Aplicáveis                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Namespace        | Subdiretório cria comandos nomeados com dois-pontos  | Melhor organização de comandos            |          |                                                      |
| Comandos Globais  | `~/.qwen/commands/`                        | Disponível em todos os projetos              | Baixa      | Comandos pessoais usados frequentemente, uso entre projetos |
| Comandos do Projeto | `<project root directory>/.qwen/commands/` | Específico do projeto, versionável | Alta     | Compartilhamento em equipe, comandos específicos do projeto              |

Regras de Prioridade: Comandos do projeto > Comandos do usuário (o comando do projeto é usado quando os nomes são iguais)

### Regras de Nomeação de Comandos

#### Tabela de Mapeamento de Caminho de Arquivo para Nome do Comando

| Localização do Arquivo                            | Comando Gerado | Exemplo de Chamada          |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parâmetro`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Mensagem` |

Regras de Nomeação: Separador de caminho (`/` ou `\`) convertido para dois-pontos (`:`)

### Especificação do Formato de Arquivo Markdown (Recomendado)

Comandos personalizados usam arquivos Markdown com frontmatter YAML opcional:

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| Campo         | Obrigatório | Descrição                              | Exemplo                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `description` | Opcional | Descrição do comando (exibida em /help) | `description: Code analysis tool`          |
| Corpo do prompt   | Obrigatório | Conteúdo do prompt enviado ao modelo             | Qualquer conteúdo Markdown após o frontmatter |

### Formato de Arquivo TOML (Obsoleto)

> [!warning]
>
> **Obsoleto:** O formato TOML ainda é suportado, mas será removido em uma versão futura. Migre para o formato Markdown.

| Campo         | Obrigatório | Descrição                              | Exemplo                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | Obrigatório | Conteúdo do prompt enviado ao modelo             | `prompt = "Please analyze code: {{args}}"` |
| `description` | Opcional | Descrição do comando (exibida em /help) | `description = "Code analysis tool"`       |

### Mecanismo de Processamento de Parâmetros

| Método de Processamento            | Sintaxe             | Cenários Aplicáveis                 | Recursos de Segurança                      |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injeção Sensível ao Contexto      | `{{args}}`         | Necessita controle preciso de parâmetros       | Escapamento automático de Shell               |
| Processamento Padrão de Parâmetros | Sem marcação especial | Comandos simples, anexação de parâmetros | Anexar como está                           |
| Injeção de Comando Shell      | `!{command}`       | Necessita conteúdo dinâmico                 | Confirmação de execução necessária antes |

#### 1. Injeção Sensível ao Contexto (`{{args}}`)

| Cenário         | Configuração TOML                      | Método de Chamada           | Efeito Real            |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Injeção Bruta    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| Em Comando Shell | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | Executar `grep "hello" .` |

#### 2. Processamento Padrão de Parâmetros

| Situação de Entrada | Método de Processamento                                      | Exemplo                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Possui parâmetros  | Anexar ao final do prompt (separado por duas quebras de linha) | `/cmd parâmetro` → Prompt original + parâmetro |
| Sem parâmetros   | Enviar prompt como está                                      | `/cmd` → Prompt original                       |

🚀 Injeção de Conteúdo Dinâmico

| Tipo de Injeção        | Sintaxe         | Ordem de Processamento    | Finalidade                          |
| --------------------- | -------------- | ------------------- | -------------------------------- |
| Conteúdo de Arquivo          | `@{file path}` | Processado primeiro     | Injetar arquivos de referência estáticos    |
| Comandos Shell        | `!{command}`   | Processado no meio | Injetar resultados de execução dinâmica |
| Substituição de Parâmetro | `{{args}}`     | Processado por último      | Injetar parâmetros do usuário           |

#### 3. Execução de Comando Shell (`!{...}`)

| Operação                       | Interação do Usuário     |
| ------------------------------- | -------------------- |
| 1. Analisar comando e parâmetros | -                    |
| 2. Escapamento automático de Shell     | -                    |
| 3. Mostrar diálogo de confirmação     | ✅ Confirmação do usuário |
| 4. Executar comando              | -                    |
| 5. Injetar saída no prompt      | -                    |

Exemplo: Geração de Mensagem de Commit Git

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

| Tipo de Arquivo    | Status de Suporte         | Método de Processamento           |
| ------------ | ---------------------- | --------------------------- |
| Arquivos de Texto   | ✅ Suporte Completo        | Injetar conteúdo diretamente     |
| Imagens/PDF   | ✅ Suporte Multimodal | Codificar e injetar           |
| Arquivos Binários | ⚠️ Suporte Limitado     | Pode ser ignorado ou truncado |
| Diretório    | ✅ Injeção Recursiva | Seguir regras do .gitignore     |

Exemplo: Comando de Revisão de Código

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### Exemplo Prático de Criação

#### Tabela de Etapas de Criação do Comando "Refatoração para Função Pura"

| Operação                     | Comando/Código                              |
| ----------------------------- | ----------------------------------------- |
| 1. Criar estrutura de diretórios | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Criar arquivo de comando        | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Editar conteúdo do comando       | Consulte o código completo abaixo.         |
| 4. Testar comando               | `@file.js` → `/refactor:pure`             |

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

| Pontos de Prática      | Abordagem Recomendada                | Evitar                                       |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nomeação de Comandos       | Use namespaces para organização     | Evitar nomes genéricos demais                  |
| Processamento de Parâmetros | Usar claramente `{{args}}`              | Confiar no anexo padrão (fácil de confundir) |
| Tratamento de Erros       | Utilizar saída de erro do Shell          | Ignorar falha de execução                    |
| Organização de Arquivos    | Organizar por função em diretórios | Todos os comandos no diretório raiz              |
| Campo de Descrição    | Sempre fornecer descrição clara    | Confiar em descrição gerada automaticamente          |

#### Tabela de Lembrete de Recursos de Segurança

| Mecanismo de Segurança     | Efeito de Proteção          | Operação do Usuário         |
| ---------------------- | -------------------------- | ---------------------- |
| Escapamento de Shell         | Prevenir injeção de comando  | Processamento automático   |
| Confirmação de Execução | Evitar execução acidental | Confirmação via diálogo    |
| Relatório de Erros        | Ajudar a diagnosticar problemas       | Visualizar informações de erro |