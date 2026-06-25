# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões, personalizar a interface e controlar seu comportamento de forma eficiente.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se enquadram em três categorias:

| Tipo de Prefixo              | Descrição da Função                                        | Caso de Uso Típico                                                 |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Comandos com Barra (`/`)     | Controle de meta-nível do próprio Qwen Code                | Gerenciar sessões, modificar configurações, obter ajuda            |
| Comandos com Arroba (`@`)    | Injetar rapidamente conteúdo de arquivos locais na conversa | Permitir que a IA analise arquivos ou código especificados em diretórios |
| Comandos de Exclamação (`!`) | Interação direta com o Shell do sistema                    | Executar comandos do sistema como `git status`, `ls`, etc.         |

## 1. Comandos com Barra (`/`)

Comandos com barra são usados para gerenciar sessões, interface e comportamento básico do Qwen Code.

### 1.1 Gerenciamento de Sessão e Projeto

Esses comandos ajudam você a salvar, restaurar e resumir o progresso do trabalho.

| Comando         | Descrição                                                                     | Exemplos de Uso                                                  |
| --------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/init`         | Analisar o diretório atual e criar arquivo de contexto inicial                | `/init`                                                          |
| `/summary`      | Gerar resumo do projeto com base no histórico da conversa                     | `/summary`                                                       |
| `/compress`     | Substituir o histórico do chat por um resumo para economizar Tokens           | `/compress`                                                      |
| `/compress-fast`| Compressão rápida sem IA — remove saídas de ferramentas antigas e partes de raciocínio | `/compress-fast`                                              |
| `/resume`       | Retomar uma sessão de conversa anterior                                       | `/resume`                                                        |
| `/recap`        | Gerar um resumo de uma linha da sessão agora                                  | `/recap`                                                         |
| `/restore`      | Reverter arquivos do projeto para o ponto de verificação anterior à execução de uma chamada de ferramenta | `/restore` (listar) ou `/restore <ID>`               |
| `/delete`       | Excluir uma sessão anterior                                                   | `/delete`                                                        |
| `/branch`       | Bifurcar a conversa atual em uma nova sessão                                  | `/branch`                                                        |
| `/fork`         | Gerar um agente em segundo plano que herda toda a conversa                    | `/fork <directive>`                                              |
| `/rewind`       | Rebobinar a conversa para um turno anterior                                   | `/rewind` ou `/rollback`                                         |
| `/export`       | Exportar histórico da sessão para arquivo                                     | `/export html`, `/export md`, `/export json`, `/export jsonl`    |
| `/rename`       | Renomear ou marcar a sessão atual                                             | `/rename My Feature` ou `/tag`                                   |

### 1.2 Controle de Interface e Espaço de Trabalho

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando               | Descrição                                                                                                                                                                           | Exemplos de Uso                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/clear`              | Limpar o conteúdo da tela do terminal                                                                                                                                               | `/clear` (atalho: `Ctrl+L`)                                                             |
| `/context`            | Mostrar detalhamento do uso da janela de contexto                                                                                                                                   | `/context`                                                                              |
| → `detail`            | Mostrar detalhamento do uso do contexto por item                                                                                                                                     | `/context detail`                                                                       |
| `/history`            | Controlar preferências de exibição e visibilidade do histórico                                                                                                                      | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now`       |
| `/diff`               | Abrir um visualizador de diff interativo mostrando alterações não confirmadas e diffs por turno. Use ←/→ para alternar entre o diff git atual e turnos individuais da conversa, ↑/↓ para navegar pelos arquivos | `/diff`                                                                                 |
| `/theme`              | Alterar o tema visual do Qwen Code                                                                                                                                                  | `/theme`                                                                                |
| `/vim`                | Ativar/desativar o modo de edição Vim na área de entrada                                                                                                                            | `/vim`                                                                                  |
| `/voice`              | Alternar entrada de ditado por voz                                                                                                                                                  | `/voice`, `/voice status`                                                               |
| `/directory`          | Gerenciar espaço de trabalho com suporte a vários diretórios                                                                                                                        | `/dir add ./src,./tests`                                                                |
| `/cd`                 | Mover esta sessão para um novo diretório de trabalho                                                                                                                                | `/cd ../other-project`                                                                  |
| `/editor`             | Abrir diálogo para selecionar editor suportado                                                                                                                                      | `/editor`                                                                               |
| `/statusline`         | Abrir diálogo interativo de predefinição da [linha de status](./status-line.md)                                                                                                     | `/statusline`                                                                           |
| `/statusline <text>`  | Gerar uma linha de status em modo comando via agente                                                                                                                                | `/statusline show model and git branch`                                                 |
| `/terminal-setup`     | Configurar atalhos de teclado do terminal para entrada multilinha                                                                                                                   | `/terminal-setup`                                                                       |
### 1.3 Configurações de Idioma

Comandos específicos para controlar o idioma da interface e da saída.

| Comando            | Descrição                             | Exemplos de Uso                    |
| ------------------ | ------------------------------------- | ---------------------------------- |
| `/language`        | Ver ou alterar as configurações de idioma | `/language`                |
| → `ui [idioma]`    | Definir o idioma da interface do usuário | `/language ui zh-CN`       |
| → `output [idioma]`| Definir o idioma de saída do LLM      | `/language output Chinese` |

- Idiomas de interface disponíveis: `zh-CN` (Chinês Simplificado), `en-US` (Inglês), `ru-RU` (Russo), `de-DE` (Alemão), `ja-JP` (Japonês), `pt-BR` (Português - Brasil), `fr-FR` (Francês), `ca-ES` (Catalão)
- Exemplos de idiomas de saída: `Chinese` (Chinês), `English` (Inglês), `Japanese` (Japonês), etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando           | Descrição                                   | Exemplos de Uso                                                               |
| ----------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `/mcp`            | Listar servidores e ferramentas MCP configurados | `/mcp`, `/mcp desc`                                                       |
| `/import-config`  | Importar servidores MCP de configurações do Claude | `/import-config claude-code`, `/import-config claude-desktop --scope project` |
| `/tools`          | Exibir a lista de ferramentas disponíveis atualmente | `/tools`, `/tools desc`                                                       |
| `/skills`         | Listar e executar habilidades disponíveis   | `/skills`, `/skills <nome>`                                                   |
| `/plan`           | Alternar para o modo de planejamento ou sair do modo de planejamento | `/plan`, `/plan <tarefa>`, `/plan exit`         |
| `/approval-mode`  | Alterar o modo de aprovação para uso de ferramentas | `/approval-mode <modo (auto-edit)> --project`                          |
| →`plan`           | Apenas análise, sem execução               | Revisão segura                                                               |
| →`default`        | Exigir aprovação para edições              | Uso diário                                                                    |
| →`auto-edit`      | Aprovar edições automaticamente            | Ambiente confiável                                                           |
| →`auto`           | Aprovação avaliada por classificador       | Sessões autônomas com salvaguardas de segurança                              |
| →`yolo`           | Aprovar tudo automaticamente               | Prototipagem rápida                                                          |
| `/model`          | Alternar modelo usado na sessão atual      | `/model`, `/model <id-do-modelo>` (alterna imediatamente)                        |
| `/model --fast`   | Definir um modelo mais leve para sugestões de prompt | `/model --fast qwen3-coder-flash`                                       |
| `/model --voice`  | Definir o modelo usado para transcrição de voz | `/model --voice <id-do-modelo>`                                                |
| `/extensions`     | Listar todas as extensões ativas na sessão atual | `/extensions`                                                              |
| `/memory`         | Abrir o diálogo do Gerenciador de Memória  | `/memory`                                                                     |
| `/remember`       | Salvar uma memória durável                  | `/remember Preferir respostas curtas`                                         |
| `/forget`         | Remover entradas correspondentes da memória automática | `/forget <consulta>`                                                    |
| `/dream`          | Executar manualmente a consolidação da memória automática | `/dream`                                                              |
| `/hooks`          | Gerenciar hooks do Qwen Code                | `/hooks`, `/hooks list`                                                       |
| `/permissions`    | Gerenciar regras de permissão               | `/permissions`                                                                |
| `/agents`         | Gerenciar subagentes                        | `/agents manage`, `/agents create`                                            |
| `/arena`          | Gerenciar sessões da Arena                  | `/arena start`, `/arena status`                                               |
| `/goal`           | Definir uma meta — continuar trabalhando até que a condição seja atendida | `/goal <condição>`, `/goal clear`                |
| `/tasks`          | Listar tarefas em segundo plano             | `/tasks`                                                                      |
| `/workflows`      | Inspecionar execuções de fluxo de trabalho  | `/workflows`, `/workflows <idDaExecução>`                                     |
| `/lsp`            | Mostrar status do servidor LSP              | `/lsp`                                                                        |
| `/trust`          | Gerenciar configurações de confiança de pastas | `/trust`                                                                    |
### 1.5 Habilidades Embutidas

Estes comandos invocam habilidades empacotadas que fornecem fluxos de trabalho especializados.

| Comando       | Descrição                                                             | Exemplos de Uso                                  |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `/review`     | Revisar alterações de código com 5 agentes paralelos + análise determinística | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`       | Executar um prompt em um agendamento recorrente                       | `/loop 5m verifique o build`                    |
| `/simplify`   | Revisar alterações recentes e aplicar edições de limpeza seguras diretamente | `/simplify`, `/simplify foco em duplicação`    |
| `/qc-helper`  | Responder perguntas sobre uso e configuração do Qwen Code             | `/qc-helper como configuro MCP?`                |

Veja [Revisão de Código](./code-review.md) para documentação completa do `/review`.

### 1.6 Pergunta Lateral (`/btw`)

O comando `/btw` permite que você faça perguntas laterais rápidas sem interromper ou afetar o fluxo principal da conversa.

| Comando               | Descrição                            |
| --------------------- | ------------------------------------ |
| `/btw <sua pergunta>` | Faça uma pergunta lateral rápida     |
| `?btw <sua pergunta>` | Sintaxe alternativa para perguntas laterais |

**Como Funciona:**

- A pergunta lateral é enviada como uma chamada de API separada com contexto recente da conversa (até as últimas 20 mensagens)
- A resposta é exibida acima do Composer — você pode continuar digitando enquanto espera
- A conversa principal **não é bloqueada** — ela continua de forma independente
- A resposta da pergunta lateral **não** se torna parte do histórico da conversa principal
- As respostas são renderizadas com suporte completo a Markdown (blocos de código, listas, tabelas, etc.)

**Atalhos de Teclado (Modo Interativo):**

| Atalho              | Ação                                              |
| ------------------- | ------------------------------------------------- |
| `Escape`            | Cancelar (enquanto carrega) ou dispensar (após concluído) |
| `Espaço` ou `Enter` | Dispensar a resposta (quando a entrada está vazia)              |
| `Ctrl+C` ou `Ctrl+D`| Cancelar uma pergunta lateral em andamento                   |

**Exemplo:**

```
(Enquanto a conversa principal é sobre refatoração de código)

> /btw Qual é a diferença entre let e var em JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw Qual é a diferença entre let e var  │
  │     em JavaScript?                       │
  │                                          │
  │ + Respondendo...                         │
  │ Pressione Escape, Ctrl+C, ou Ctrl+D p/   │
  │ cancelar                                 │
  ╰──────────────────────────────────────────╯
  > (Composer permanece ativo — continue digitando)

(Depois que a resposta chega)

  ╭──────────────────────────────────────────╮
  │ /btw Qual é a diferença entre let e var  │
  │     em JavaScript?                       │
  │                                          │
  │ `let` tem escopo de bloco, enquanto      │
  │ `var` tem escopo de função. `let` foi    │
  │ introduzido no ES6 e não sofre hoisting  │
  │ da mesma forma.                          │
  │                                          │
  │ Pressione Espaço, Enter ou Escape p/     │
  │ dispensar                                │
  ╰──────────────────────────────────────────╯
  > (Composer ainda ativo)
```

**Modos de Execução Suportados:**

| Modo                | Comportamento                                     |
| ------------------- | ------------------------------------------------- |
| Interativo          | Mostra acima do Composer com renderização Markdown |
| Não interativo      | Retorna resultado em texto: `btq> pergunta\nresposta` |
| ACP (Agent Protocol)| Retorna um gerador assíncrono `stream_messages`    |

> [!tip]
>
> Use `/btw` quando precisar de uma resposta rápida sem desviar sua tarefa principal. É especialmente útil para esclarecer conceitos, verificar fatos ou obter explicações rápidas enquanto mantém o foco no seu fluxo de trabalho principal.

### 1.7 Resumo da Sessão (`/recap`)

O comando `/recap` gera um breve resumo de "onde você parou" da sessão
atual, para que você possa retomar uma conversa antiga sem precisar rolar
para trás por páginas de histórico.

| Comando   | Descrição                                   |
| --------- | ------------------------------------------- |
| `/recap`  | Gerar e mostrar um resumo de uma linha da sessão |

**Como funciona:**

- Usa o modelo rápido configurado (`fastModel`) quando disponível, caso
  contrário usa o modelo principal da sessão. Um modelo pequeno e barato já é suficiente para um resumo.
- A conversa recente (até 30 mensagens, apenas texto — chamadas de ferramenta e
  respostas de ferramenta são filtradas) é enviada ao modelo com um prompt de sistema enxuto.
- O resumo é renderizado em cor mais escura com um prefixo `❯` para se destacar
  das respostas reais do assistente.
- Recusa com um erro inline se uma resposta do modelo estiver em andamento ou outro comando
  estiver sendo processado. Se não houver conversa utilizável, ou a geração
  subjacente falhar, `/recap` mostra uma mensagem informativa curta em vez de um resumo —
  o comando manual sempre responde com algo.
**Auto-acionamento ao retornar de ausência:**

Se o terminal ficar embaçado por **5+ minutos** e receber foco novamente, um
resumo é gerado e mostrado automaticamente (apenas quando não houver resposta
do modelo em andamento; caso contrário, aguarda a conclusão da rodada atual e
então dispara). Diferente do comando manual, o auto-acionamento é totalmente
silencioso em caso de falha: se houver erro na geração ou não houver nada a
resumir, nenhuma mensagem é adicionada ao histórico. Controlado pela
configuração `general.showSessionRecap` (padrão: `false`); o comando manual
`/recap` sempre funciona independentemente dessa configuração.

**Exemplo:**

```
> /recap

❯ Refatorando loopDetectionService.ts para resolver OOM em sessões longas
  causado por streamContentHistory e contentStats sem limites. O próximo passo
  é implementar a opção B (janela deslizante LRU com FNV-1a) pendente de
  confirmação.
```

> [!tip]
>
> Configure um modelo rápido via `/model --fast <model>` (ex.:
> `qwen3-coder-flash`) para tornar `/recap` rápido e barato. Defina
> `general.showSessionRecap` como `true` para ativar o auto-acionamento; o
> comando manual `/recap` sempre funciona independentemente dessa configuração.

### 1.8 Visualizador de Diff (`/diff`)

O comando `/diff` abre um visualizador de diff interativo mostrando alterações
não commitadas e diffs por rodada. Use ←/→ para alternar entre o diff atual do
git e as rodadas individuais da conversa, ↑/↓ para navegar pelos arquivos e
Enter para visualizar diffs inline.

**Como funciona:**

No modo interativo, `/diff` abre um diálogo com um **seletor de fonte** na
parte superior:

- **Atual** — árvore de trabalho vs HEAD (`git diff HEAD`). Mostra todas as
  alterações não commitadas, incluindo arquivos staged, unstaged e não rastreados.
- **T1, T2, T3, …** — diffs por rodada, uma aba por rodada do modelo que
  modificou arquivos. As rodadas mais recentes aparecem primeiro. Cada aba
  exibe uma prévia do prompt original para contexto.

A lista de arquivos exibe estatísticas por arquivo (linhas adicionadas/removidas)
com tags para estados especiais (`novo`, `deletado`, `não rastreado`, `binário`,
`truncado`, `acima do tamanho`). Pressione Enter em um arquivo para visualizar
seu diff inline com hunks com destaque de sintaxe.

Diffs por rodada exigem que o checkpoint de arquivos esteja ativado (ativado por
padrão no modo interativo). Quando o checkpoint de arquivos está desativado,
apenas a fonte "Atual" está disponível.

**Atalhos de teclado:**

| Tecla       | Ação                                             |
| ----------- | ------------------------------------------------ |
| `←` / `→`   | Alternar entre fontes (Atual / T1 / T2…)         |
| `↑` / `↓`   | Navegar na lista de arquivos                     |
| `j` / `k`   | Navegar na lista de arquivos (estilo vim)         |
| Enter       | Visualizar diff inline do arquivo selecionado    |
| `←` / Esc   | Retornar à lista de arquivos da visualização inline |
| Esc         | Fechar o diálogo                                 |

**Exemplo:**

```
┌ /diff · Rodada 3 "refatorar o middleware de autenticação" ──── 3 arquivos +45 -12 ┐
│                                                                                     │
│ ◀ Atual · T3 · T2 · T1 ▶                                                           │
│                                                                                     │
│ › src/utils/parser.ts                              +30 -8                           │
│   src/utils/parser.test.ts                         +12 -2                           │
│   README.md                                        +3 -2                            │
│                                                                                     │
│ ←/→ fonte · ↑/↓ arquivo · Enter visualizar · Esc fechar                            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Modo não interativo:**

Em contextos headless (`--prompt`) ou não interativos, `/diff` imprime um resumo
em texto simples da árvore de trabalho vs HEAD. A navegação por rodadas não
está disponível.

```
3 arquivos alterados, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando          | Descrição                                                                                                                                                                                                                                                                                     | Exemplos de uso                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `/help`          | Exibir informações de ajuda sobre os comandos disponíveis                                                                                                                                                                                                                                     | `/help` ou `/?`                 |
| `/status`        | Exibir informações da versão                                                                                                                                                                                                                                                                  | `/status` ou `/about`           |
| `/status paths`  | Exibir caminhos do arquivo de sessão atual e de logs                                                                                                                                                                                                                                          | `/status paths`                 |
| `/stats`         | Abrir painel interativo de estatísticas de uso com três abas: Sessão (métricas em tempo real), Atividade (mapa de calor, tendência de tokens, ranking de projetos) e Eficiência (taxa de cache, ranking de ferramentas, comparação de modelos). Use `tab` para alternar abas, `r` para alternar intervalos de tempo, `←→` para navegar meses, `esc` para fechar. | `/stats`                         |
| `/stats model`   | Mostrar detalhamento de tokens por modelo e custo estimado                                                                                                                                                                                                                                    | `/stats model`                  |
| `/stats tools`   | Mostrar contagens de chamadas por ferramenta                                                                                                                                                                                                                                                  | `/stats tools`                  |
| `/stats skills`  | Mostrar contagens de chamadas por habilidade para a sessão ativa atual. Isso não inclui atividade diária/mensal entre sessões.                                                                                                                                                                 | `/stats skills`                 |
| `/settings`      | Abrir editor de configurações                                                                                                                                                                                                                                                                 | `/settings`                     |
| `/auth`          | Alterar método de autenticação                                                                                                                                                                                                                                                                | `/auth`                         |
| `/doctor`        | Executar diagnóstico de instalação e ambiente                                                                                                                                                                                                                                                 | `/doctor`, `/doctor memory`     |
| `/docs`          | Abrir documentação completa do Qwen Code no navegador                                                                                                                                                                                                                                         | `/docs`                         |
| `/ide`           | Gerenciar integração com IDE                                                                                                                                                                                                                                                                  | `/ide status`, `/ide install`   |
| `/insight`       | Gerar insights de programação a partir do histórico do chat                                                                                                                                                                                                                                   | `/insight`                      |
| `/setup-github`  | Configurar GitHub Actions                                                                                                                                                                                                                                                                     | `/setup-github`                 |
| `/bug`           | Enviar relatório de problema sobre o Qwen Code                                                                                                                                                                                                                                                | `/bug Botão de clique não responde` |
| `/copy`          | Copiar saída da IA para a área de transferência (`/copy N` = N-ésima última mensagem da IA)                                                                                                                                                                                                  | `/copy` ou `/copy 2`            |
| `/quit`          | Sair do Qwen Code imediatamente                                                                                                                                                                                                                                                               | `/quit` ou `/exit`              |
### 1.10 Atalhos Comuns

| Atalho             | Função                    | Nota                       |
| ------------------ | ------------------------- | -------------------------- |
| `Ctrl/cmd+L`       | Limpar tela               | Equivalente a `/clear`     |
| `Ctrl/cmd+T`       | Alternar descrição da ferramenta | Gerenciamento de ferramentas MCP |
| `Ctrl/cmd+C`×2     | Confirmação de saída      | Mecanismo de saída segura  |
| `Ctrl/cmd+Z`       | Desfazer entrada          | Edição de texto            |
| `Ctrl/cmd+Shift+Z` | Refazer entrada           | Edição de texto            |

### 1.11 Comandos de Autenticação

Use `/auth` dentro de uma sessão do Qwen Code para configurar a autenticação. Use `/doctor` para inspecionar o status atual da autenticação e do ambiente.

| Comando    | Descrição                                      |
| ---------- | ---------------------------------------------- |
| `/auth`    | Configurar autenticação interativamente        |
| `/doctor`  | Mostrar verificações de autenticação e ambiente |

> [!note]
>
> O comando CLI autônomo `qwen auth` foi removido. Invocações legadas como `qwen auth status` exibem um aviso de remoção com orientações de migração. Consulte a página [Autenticação](../configuration/auth) para detalhes completos.

## 2. Comandos @ (Introduzindo Arquivos)

Os comandos @ são usados para adicionar rapidamente conteúdo de arquivos ou diretórios locais à conversa.

| Formato do Comando | Descrição                                       | Exemplos                                        |
| ------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `@<caminho do arquivo>` | Injetar conteúdo do arquivo especificado        | `@src/main.py Por favor, explique este código`   |
| `@<caminho do diretório>` | Ler recursivamente todos os arquivos de texto no diretório | `@docs/ Resuma o conteúdo deste documento`       |
| `@` isolado        | Usado ao discutir o próprio símbolo `@`         | `@ Para que este símbolo é usado em programação?` |

Nota: Espaços em caminhos precisam ser escapados com barra invertida (ex.: `@My\ Documents/file.txt`)

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Os comandos de exclamação permitem executar comandos do sistema diretamente no Qwen Code.

| Formato do Comando | Descrição                                                    | Exemplos                        |
| ------------------ | ------------------------------------------------------------ | ------------------------------- |
| `!<comando shell>` | Executar comando em sub-Shell                                | `!ls -la`, `!git status`        |
| `!` isolado        | Alternar modo Shell, qualquer entrada é executada diretamente como comando Shell | `!`(enter) → Insira comando → `!`(exit) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts usados com frequência como comandos de atalho para melhorar a eficiência do trabalho e garantir consistência.

> [!note]
>
> Os comandos personalizados agora usam o formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade reversa. Quando arquivos TOML são detectados, um prompt de migração automática será exibido.

### Visão Geral Rápida

| Função             | Descrição                                    | Vantagens                    | Prioridade | Cenários Aplicáveis                         |
| ------------------ | -------------------------------------------- | ---------------------------- | ---------- | -------------------------------------------- |
| Namespace          | Subdiretório cria comandos nomeados com dois-pontos | Melhor organização de comandos |            |                                              |
| Comandos Globais   | `~/.qwen/commands/`                          | Disponível em todos os projetos | Baixa      | Comandos pessoais usados com frequência, uso entre projetos |
| Comandos do Projeto| `<diretório raiz do projeto>/.qwen/commands/`| Específico do projeto, controlável por versão | Alta       | Compartilhamento em equipe, comandos específicos do projeto |

Regras de Prioridade: Comandos de projeto > Comandos de usuário (comando do projeto usado quando os nomes são iguais)

### Regras de Nomenclatura de Comandos

#### Tabela de Mapeamento de Caminho de Arquivo para Nome de Comando

| Localização do Arquivo                      | Comando Gerado     | Exemplo de Chamada       |
| ------------------------------------------- | ------------------ | ------------------------ |
| `~/.qwen/commands/test.md`                  | `/test`            | `/test Parâmetro`        |
| `<projeto>/.qwen/commands/git/commit.md`    | `/git:commit`      | `/git:commit Mensagem`   |

Regras de Nomenclatura: Separador de caminho (`/` ou `\`) convertido para dois-pontos (`:`)

### Especificação de Formato de Arquivo Markdown (Recomendado)

Comandos personalizados usam arquivos Markdown com frontmatter YAML opcional:

```markdown
---
description: Descrição opcional (exibida em /help)
---

Seu conteúdo de prompt aqui.
Use {{args}} para injeção de parâmetros.
```

| Campo          | Obrigatório | Descrição                              | Exemplo                                    |
| -------------- | ----------- | -------------------------------------- | ------------------------------------------ |
| `description`  | Opcional    | Descrição do comando (exibida em /help)| `description: Ferramenta de análise de código` |
| Corpo do prompt| Obrigatório | Conteúdo do prompt enviado ao modelo   | Qualquer conteúdo Markdown após o frontmatter |
### Formato de Arquivo TOML (Obsoleto)

> [!warning]
>
> **Obsoleto:** O formato TOML ainda é suportado, mas será removido em uma versão futura. Por favor, migre para o formato Markdown.

| Campo          | Obrigatório  | Descrição                                | Exemplo                                    |
| -------------- | ------------ | ---------------------------------------- | ------------------------------------------ |
| `prompt`       | Obrigatório  | Conteúdo do prompt enviado para o modelo | `prompt = "Por favor, analise o código: {{args}}"` |
| `description`  | Opcional     | Descrição do comando (exibida em /help)  | `description = "Ferramenta de análise de código"` |

### Mecanismo de Processamento de Parâmetros

| Método de Processamento          | Sintaxe           | Cenários Aplicáveis                 | Recursos de Segurança                      |
| -------------------------------- | ----------------- | ------------------------------------ | ------------------------------------------ |
| Injeção Sensível ao Contexto     | `{{args}}`        | Precisa de controle preciso de parâmetros | Escaping automático do Shell               |
| Processamento de Parâmetro Padrão | Sem marcação especial | Comandos simples, anexação de parâmetros | Anexar como está                           |
| Injeção de Comando Shell         | `!{command}`      | Precisa de conteúdo dinâmico         | Confirmação de execução necessária antes   |

#### 1. Injeção Sensível ao Contexto (`{{args}}`)

| Cenário          | Configuração TOML                          | Método de Chamada         | Efeito Real                    |
| ---------------- | ------------------------------------------ | ------------------------- | ------------------------------ |
| Injeção Bruta    | `prompt = "Corrigir: {{args}}"`            | `/fix "Problema do botão"`| `Corrigir: "Problema do botão"`|
| Em Comando Shell | `prompt = "Buscar: !{grep {{args}} .}"`    | `/buscar "olá"`          | Executar `grep "olá" .`        |

#### 2. Processamento de Parâmetro Padrão

| Situação de Entrada | Método de Processamento                                | Exemplo                                        |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Tem parâmetros      | Anexar ao final do prompt (separado por duas quebras de linha) | `/cmd parâmetro` → Prompt original + parâmetro |
| Sem parâmetros      | Enviar prompt como está                                | `/cmd` → Prompt original                       |

🚀 Injeção de Conteúdo Dinâmico

| Tipo de Injeção              | Sintaxe          | Ordem de Processamento    | Propósito                          |
| ---------------------------- | ---------------- | ------------------------- | ---------------------------------- |
| Conteúdo de Arquivo          | `@{caminho}`     | Processado primeiro       | Injetar arquivos de referência estáticos |
| Comandos Shell               | `!{comando}`    | Processado no meio        | Injetar resultados de execução dinâmica |
| Substituição de Parâmetro    | `{{args}}`       | Processado por último     | Injetar parâmetros do usuário     |

#### 3. Execução de Comando Shell (`!{...}`)

| Operação                           | Interação do Usuário     |
| ---------------------------------- | ------------------------ |
| 1. Analisar comando e parâmetros   | -                        |
| 2. Escaping automático do Shell    | -                        |
| 3. Exibir diálogo de confirmação   | ✅ Confirmação do usuário |
| 4. Executar comando                | -                        |
| 5. Injetar saída no prompt         | -                        |

Exemplo: Geração de Mensagem de Commit Git

````markdown
---
description: Gere uma mensagem de commit com base nas alterações preparadas
---

Por favor, gere uma mensagem de commit com base na seguinte diff:

```diff
!{git diff --staged}
```
````

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo    | Status de Suporte         | Método de Processamento           |
| ------------------ | ------------------------- | --------------------------------- |
| Arquivos de Texto  | ✅ Suporte Total          | Injetar conteúdo diretamente      |
| Imagens/PDF        | ✅ Suporte Multimodal     | Codificar e injetar               |
| Arquivos Binários  | ⚠️ Suporte Limitado      | Podem ser ignorados ou truncados  |
| Diretório          | ✅ Injeção Recursiva      | Seguir regras do .gitignore       |

Exemplo: Comando de Revisão de Código

```markdown
---
description: Revisão de código com base nas melhores práticas
---

Revise {{args}}, consulte os padrões:

@{docs/code-standards.md}
```

### Exemplo Prático de Criação

#### Tabela de Passos de Criação do Comando "Refatoração para Função Pura"

| Operação                   | Comando/Código                                |
| -------------------------- | --------------------------------------------- |
| 1. Criar estrutura de diretórios | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. Criar arquivo de comando     | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. Editar conteúdo do comando   | Consulte o código completo abaixo.         |
| 4. Testar comando               | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refatorar código para função pura
---

Analise o código no contexto atual, refatore para uma função pura.
Requisitos:

1. Forneça o código refatorado
2. Explique as principais alterações e a implementação da característica de função pura
3. Mantenha a função inalterada
```
### Resumo das Melhores Práticas para Comandos Personalizados

#### Tabela de Recomendações para Design de Comandos

| Pontos de Prática      | Abordagem Recomendada                | Evite                                       |
| ---------------------- | ------------------------------------ | ------------------------------------------- |
| Nomeação de Comandos   | Use namespaces para organização      | Evite nomes muito genéricos                 |
| Processamento de Parâmetros | Use claramente `{{args}}`        | Depender de acréscimo padrão (fácil de confundir) |
| Tratamento de Erros    | Utilize saída de erro do Shell       | Ignore falhas de execução                   |
| Organização de Arquivos | Organize por função em diretórios   | Todos os comandos no diretório raiz         |
| Campo de Descrição     | Sempre forneça uma descrição clara   | Depender de descrição gerada automaticamente |

#### Tabela de Lembrete de Recursos de Segurança

| Mecanismo de Segurança | Efeito de Proteção          | Operação do Usuário         |
| ---------------------- | --------------------------- | -------------------------- |
| Escapamento de Shell   | Evitar injeção de comandos  | Processamento automático   |
| Confirmação de Execução| Evitar execução acidental   | Confirmação por diálogo    |
| Relato de Erros        | Ajudar a diagnosticar problemas | Visualizar informações de erro |

## 5. Subcomandos da CLI

Esses comandos são executados a partir do shell como `qwen <subcommand>` antes de iniciar uma sessão interativa.

### Gerenciamento de Sessões

| Comando               | Descrição                              | Exemplos de Uso                                                |
| --------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `qwen sessions list`  | Listar sessões de conversa recentes    | `qwen sessions list`, `qwen sessions list --json --limit 50`   |

#### `qwen sessions list`

Lista suas sessões recentes do Qwen Code com metadados.

**Flags:**

| Flag     | Tipo      | Padrão  | Descrição                                                |
| -------- | --------- | ------- | -------------------------------------------------------- |
| `--json` | booleano  | `false` | Saída como JSON Lines (um objeto JSON por linha)         |
| `--limit`| número    | `20`    | Número máximo de sessões a exibir                        |

**Saída legível por humanos (padrão):**

Uma tabela com colunas: SESSION ID, STARTED (UTC timestamp), TITLE, BRANCH, PROMPT.

**Saída JSON (`--json`):**

Gera JSON Lines na saída padrão (stdout). Cada linha é um objeto JSON com campos:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

O aviso "has more sessions" é emitido via stderr para que o pipe para `jq` permaneça seguro.

**Exemplos:**

```bash
# Show last 20 sessions (default)
qwen sessions list

# Show last 50 sessions
qwen sessions list --limit 50

# Output as JSON for scripting
qwen sessions list --json | jq .
```
