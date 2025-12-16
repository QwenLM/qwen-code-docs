# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões, personalizar a interface e controlar seu comportamento de forma eficiente.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se dividem em três categorias:

| Tipo de Prefixo            | Descrição da Função                                 | Caso de Uso Típico                                                |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Comandos com Barra (`/`)   | Controle de nível meta do próprio Qwen Code         | Gerenciamento de sessões, modificação de configurações, obtenção de ajuda |
| Comandos com Arroba (`@`)  | Injeção rápida de conteúdo de arquivos locais na conversa | Permitir que a IA analise arquivos ou códigos especificados em diretórios |
| Comandos com Exclamação (`!`) | Interação direta com o Shell do sistema           | Execução de comandos do sistema como `git status`, `ls`, etc.    |

## 1. Comandos com Barra (`/`)

Comandos com barra são usados para gerenciar sessões do Qwen Code, interface e comportamento básico.

### 1.1 Gerenciamento de Sessão e Projeto

Esses comandos ajudam você a salvar, restaurar e resumir o progresso do trabalho.

| Comando     | Descrição                                                  | Exemplos de Uso                      |
| ----------- | ---------------------------------------------------------- | ------------------------------------ |
| `/summary`  | Gera um resumo do projeto com base no histórico da conversa| `/summary`                           |
| `/compress` | Substitui o histórico do chat por um resumo para economizar Tokens | `/compress`                          |
| `/restore`  | Restaura arquivos ao estado anterior à execução da ferramenta | `/restore` (lista) ou `/restore <ID>` |
| `/init`     | Analisa o diretório atual e cria um arquivo de contexto inicial | `/init`                              |

### 1.2 Controle de Interface e Área de Trabalho

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando      | Descrição                                | Exemplos de Uso               |
| ------------ | ---------------------------------------- | ----------------------------- |
| `/clear`     | Limpar o conteúdo da tela do terminal    | `/clear` (atalho: `Ctrl+L`)   |
| `/theme`     | Alterar o tema visual do Qwen Code        | `/theme`                      |
| `/vim`       | Ativar/desativar modo de edição Vim na área de input | `/vim`                        |
| `/directory` | Gerenciar espaço de trabalho com suporte a múltiplos diretórios | `/dir add ./src,./tests`      |
| `/editor`    | Abrir diálogo para selecionar editor compatível | `/editor`                     |

### 1.3 Configurações de Idioma

Comandos especificamente para controlar o idioma da interface e da saída.

| Comando               | Descrição                        | Exemplos de Uso            |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | Visualizar ou alterar configurações de idioma | `/language`                |
| → `ui [idioma]`       | Definir o idioma da interface UI | `/language ui zh-CN`       |
| → `output [idioma]`   | Definir o idioma de saída do LLM | `/language output Chinese` |

- Idiomas disponíveis para UI: `zh-CN` (Chinês Simplificado), `en-US` (Inglês)
- Exemplos de idiomas de saída: `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando          | Descrição                                       | Exemplos de Uso                               |
| ---------------- | ----------------------------------------------- | --------------------------------------------- |
| `/mcp`           | Lista servidores e ferramentas MCP configurados | `/mcp`, `/mcp desc`                           |
| `/tools`         | Exibe a lista de ferramentas disponíveis atualmente | `/tools`, `/tools desc`                   |
| `/approval-mode` | Altera o modo de aprovação para uso de ferramentas | `/approval-mode <modo (auto-edit)> --project` |
| →`plan`          | Apenas análise, sem execução                    | Revisão segura                                |
| →`default`       | Exige aprovação para edições                    | Uso diário                                    |
| →`auto-edit`     | Aprova automaticamente as edições               | Ambiente confiável                            |
| →`yolo`          | Aprova automaticamente tudo                     | Prototipagem rápida                           |
| `/model`         | Alterna o modelo usado na sessão atual          | `/model`                                      |
| `/extensions`    | Lista todas as extensões ativas na sessão atual | `/extensions`                                 |
| `/memory`        | Gerencia o contexto de instrução da IA          | `/memory add Informação Importante`           |

### 1.5 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando         | Descrição                                        | Exemplos de Uso                                  |
| --------------- | ------------------------------------------------ | ------------------------------------------------ |
| `/help`         | Exibe informações de ajuda para comandos disponíveis | `/help` ou `/?`                                  |
| `/about`        | Exibe informações de versão                      | `/about`                                         |
| `/stats`        | Exibe estatísticas detalhadas da sessão atual    | `/stats`                                         |
| `/settings`     | Abre o editor de configurações                   | `/settings`                                      |
| `/auth`         | Altera o método de autenticação                  | `/auth`                                          |
| `/bug`          | Envia um problema sobre o Qwen Code              | `/bug Botão não responde ao clique`              |
| `/copy`         | Copia o conteúdo da última saída para a área de transferência | `/copy`                                          |
| `/quit-confirm` | Mostra diálogo de confirmação antes de sair      | `/quit-confirm` (atalho: pressione `Ctrl+C` duas vezes) |
| `/quit`         | Sai imediatamente do Qwen Code                   | `/quit` ou `/exit`                               |

### 1.6 Atalhos Comuns

| Atalho             | Função                  | Nota                    |
| ------------------ | ----------------------- | ----------------------- |
| `Ctrl/cmd+L`       | Limpar tela             | Equivalente a `/clear`  |
| `Ctrl/cmd+T`       | Alternar descrição da ferramenta | Gerenciamento de ferramentas MCP |
| `Ctrl/cmd+C`×2     | Confirmação de saída    | Mecanismo de saída seguro |
| `Ctrl/cmd+Z`       | Desfazer entrada        | Edição de texto         |
| `Ctrl/cmd+Shift+Z` | Refazer entrada         | Edição de texto         |

## 2. Comandos @ (Introduzindo Arquivos)

Comandos @ são usados para adicionar rapidamente conteúdo de arquivos ou diretórios locais à conversa.

| Formato do Comando   | Descrição                                      | Exemplos                                           |
| -------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `@<caminho do arquivo>` | Injeta o conteúdo do arquivo especificado     | `@src/main.py Por favor, explique este código`    |
| `@<caminho do diretório>` | Lê recursivamente todos os arquivos de texto no diretório | `@docs/ Resuma o conteúdo deste documento`      |
| `@` sozinho           | Usado ao discutir o próprio símbolo `@`        | `@ Para que serve este símbolo em programação?`   |

Nota: Espaços nos caminhos precisam ser escapados com barra invertida (ex.: `@Meus\ Documentos/arquivo.txt`)

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Os comandos de exclamação permitem que você execute comandos do sistema diretamente dentro do Qwen Code.

| Formato do Comando     | Descrição                                                           | Exemplos                                |
| ---------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| `!<comando shell>`     | Executa o comando em um sub-Shell                                   | `!ls -la`, `!git status`                |
| `!` sozinho            | Alterna para o modo Shell, qualquer entrada é executada diretamente como comando Shell | `!`(enter) → Digitar comando → `!`(sair) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts frequentemente usados como comandos de atalho para melhorar a eficiência do trabalho e garantir consistência.

### Visão Geral Rápida

| Função           | Descrição                                  | Vantagens                              | Prioridade | Cenários Aplicáveis                                  |
| ---------------- | ------------------------------------------ | -------------------------------------- | ---------- | ---------------------------------------------------- |
| Namespace        | Subdiretório cria comandos com nomes em dois-pontos | Melhor organização de comandos         |            |                                                      |
| Comandos Globais | `~/.qwen/commands/`                        | Disponíveis em todos os projetos       | Baixa      | Comandos pessoais frequentemente usados, uso entre projetos |
| Comandos de Projeto | `<diretório raiz do projeto>/.qwen/commands/` | Específicos do projeto, controláveis por versão | Alta     | Compartilhamento em equipe, comandos específicos do projeto |

Regras de Prioridade: Comandos de projeto > Comandos do usuário (comando de projeto é usado quando os nomes são iguais)

### Regras de Nomenclatura de Comandos

#### Tabela de Mapeamento de Caminho de Arquivo para Nome de Comando

| Localização do Arquivo       | Comando Gerado    | Exemplo de Chamada    |
| ---------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.toml` | `/test`           | `/test Parâmetro`     |
| `<projeto>/git/commit.toml`  | `/git:commit`     | `/git:commit Mensagem` |

Regras de Nomenclatura: Separador de caminho (`/` ou `\`) convertido para dois-pontos (`:`)

### Especificação do Formato de Arquivo TOML

| Campo         | Obrigatório | Descrição                                | Exemplo                                     |
| ------------- | ----------- | ---------------------------------------- | ------------------------------------------- |
| `prompt`      | Obrigatório | Conteúdo do prompt enviado ao modelo     | `prompt = "Por favor, analise o código: {{args}}"` |
| `description` | Opcional    | Descrição do comando (exibida em /help)  | `description = "Ferramenta de análise de código"` |

### Mecanismo de Processamento de Parâmetros

| Método de Processamento      | Sintaxe            | Cenários Aplicáveis                  | Recursos de Segurança                  |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injeção Sensível ao Contexto | `{{args}}`         | Necessidade de controle preciso dos parâmetros | Escape automático do Shell             |
| Processamento Padrão de Parâmetros | Sem marcação especial | Comandos simples, adição de parâmetros | Adiciona como está                     |
| Injeção de Comando Shell     | `!{command}`       | Necessidade de conteúdo dinâmico    | Requer confirmação de execução antes   |

#### 1. Injeção com Contexto (`{{args}}`)

| Cenário             | Configuração TOML                        | Método de Chamada      | Efeito Real               |
| ------------------- | ---------------------------------------- | ---------------------- | ------------------------- |
| Injeção Bruta       | `prompt = "Fix: {{args}}"`               | `/fix "Button issue"`  | `Fix: "Button issue"`     |
| Em Comando Shell    | `prompt = "Search: !{grep {{args}} .}"`  | `/search "hello"`      | Executar `grep "hello" .` |

#### 2. Processamento Padrão de Parâmetros

| Situação de Entrada | Método de Processamento                                  | Exemplo                                        |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Com parâmetros      | Adiciona ao final do prompt (separado por duas quebras de linha) | `/cmd parametro` → Prompt original + parâmetro |
| Sem parâmetros      | Envia o prompt como está                                 | `/cmd` → Prompt original                       |

🚀 Injeção Dinâmica de Conteúdo

| Tipo de Injeção       | Sintaxe        | Ordem de Processamento | Propósito                          |
| --------------------- | -------------- | ---------------------- | ---------------------------------- |
| Conteúdo de Arquivo   | `@{caminho}`   | Processado primeiro    | Injetar arquivos de referência     |
| Comandos Shell        | `!{comando}`   | Processado no meio     | Injetar resultados de execução     |
| Substituição de Parâmetros | `{{args}}` | Processado por último  | Injetar parâmetros do usuário      |

#### 3. Execução de Comandos Shell (`!{...}`)

| Operação                          | Interação do Usuário   |
| --------------------------------- | ---------------------- |
| 1. Analisar comando e parâmetros  | -                      |
| 2. Escape automático do Shell     | -                      |
| 3. Mostrar diálogo de confirmação | ✅ Confirmação do usuário |
| 4. Executar comando               | -                      |
| 5. Injetar saída no prompt        | -                      |

Exemplo: Geração de Mensagem de Commit Git

```

# git/commit.toml
description = "Gerar mensagem de commit com base nas alterações preparadas"
prompt = """
Por favor, gere uma mensagem de commit com base no seguinte diff:
diff
!{git diff --staged}
"""
```

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo | Status de Suporte      | Método de Processamento     |
| --------------- | ---------------------- | --------------------------- |
| Arquivos de Texto | ✅ Suporte Completo    | Injetar conteúdo diretamente |
| Imagens/PDF       | ✅ Suporte Multimodal  | Codificar e injetar         |
| Arquivos Binários | ⚠️ Suporte Limitado    | Pode ser ignorado ou truncado |
| Diretório         | ✅ Injeção Recursiva   | Seguir regras do .gitignore |

Exemplo: Comando de Revisão de Código

```

# review.toml
description = "Revisão de código baseada em boas práticas"
prompt = """
Revise {{args}}, com referência aos padrões:

@{docs/code-standards.md}
"""
```

### Exemplo Prático de Criação

#### Tabela de Etapas para Criação do Comando "Pure Function Refactoring"

| Operação                          | Comando/Código                                  |
| --------------------------------- | ----------------------------------------------- |
| 1. Criar estrutura de diretórios  | `mkdir -p ~/.qwen/commands/refactor`            |
| 2. Criar arquivo de comando       | `touch ~/.qwen/commands/refactor/pure.toml`     |
| 3. Editar conteúdo do comando     | Consulte o código completo abaixo.              |
| 4. Testar comando                 | `@file.js` → `/refactor:pure`                   |

```# ~/.qwen/commands/refactor/pure.toml
description = "Refatorar código para função pura"
prompt = """
	Analise o código no contexto atual e refatore para uma função pura.
	Requisitos:
		1. Forneça o código refatorado
		2. Explique as principais mudanças e a implementação das características da função pura
		3. Mantenha a função inalterada
	"""
```

### Resumo das Melhores Práticas para Comandos Personalizados

#### Tabela de Recomendações para Design de Comandos

| Pontos de Prática    | Abordagem Recomendada               | Evitar                                      |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nomeação de Comandos | Usar namespaces para organização    | Evitar nomes genéricos demais               |
| Processamento de Parâmetros | Usar claramente `{{args}}`     | Contar com acréscimo padrão (fácil de confundir) |
| Tratamento de Erros  | Utilizar saída de erro do Shell     | Ignorar falha na execução                   |
| Organização de Arquivos | Organizar por função em diretórios | Todos os comandos no diretório raiz         |
| Campo de Descrição   | Sempre fornecer descrição clara     | Contar com descrição gerada automaticamente |

#### Tabela de Lembrete dos Recursos de Segurança

| Mecanismo de Segurança  | Efeito de Proteção            | Operação do Usuário    |
| ----------------------- | ----------------------------- | ---------------------- |
| Escape de Shell         | Prevenir injeção de comandos  | Processamento automático |
| Confirmação de Execução | Evitar execução acidental     | Diálogo de confirmação   |
| Relatório de Erros      | Ajudar a diagnosticar problemas | Visualizar informações de erro |