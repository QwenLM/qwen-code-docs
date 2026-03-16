# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões, personalizar a interface e controlar seu comportamento de forma eficiente.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se dividem em três categorias:

| Tipo de Prefixo            | Descrição da Função                                 | Caso de Uso Típico                                               |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Comandos com barra (`/`)   | Controle em nível meta do próprio Qwen Code         | Gerenciamento de sessões, modificação de configurações, obtenção de ajuda |
| Comandos com arroba (`@`)  | Injeção rápida de conteúdo de arquivos locais na conversa | Permitir que a IA analise arquivos ou código específicos em diretórios |
| Comandos com ponto de exclamação (`!`) | Interação direta com o Shell do sistema             | Execução de comandos do sistema, como `git status`, `ls`, etc.    |

## 1. Comandos com barra (`/`)

Os comandos com barra são usados para gerenciar sessões do Qwen Code, a interface e o comportamento básico.

### 1.1 Gerenciamento de Sessão e Projeto

Esses comandos ajudam você a salvar, restaurar e resumir o andamento do trabalho.

| Comando     | Descrição                                                               | Exemplos de Uso                      |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `/init`     | Analisa o diretório atual e cria um arquivo de contexto inicial       | `/init`                                |
| `/summary`  | Gera um resumo do projeto com base no histórico da conversa            | `/summary`                             |
| `/compress` | Substitui o histórico da conversa por um resumo para economizar Tokens | `/compress`                            |
| `/resume`   | Retoma uma sessão de conversa anterior                                 | `/resume`                              |
| `/restore`  | Restaura os arquivos ao estado anterior à execução da ferramenta       | `/restore` (lista) ou `/restore <ID>` |

### 1.2 Interface e Controle do Espaço de Trabalho

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando       | Descrição                                      | Exemplos de Uso                 |
| ------------- | ---------------------------------------------- | ------------------------------- |
| `/clear`      | Limpa o conteúdo da tela do terminal           | `/clear` (atalho: `Ctrl+L`)     |
| `/theme`      | Altera o tema visual do Qwen Code              | `/theme`                        |
| `/vim`        | Ativa/desativa o modo de edição Vim na área de entrada | `/vim`                          |
| `/directory`  | Gerencia o espaço de trabalho com suporte a múltiplos diretórios | `/dir add ./src,./tests`       |
| `/editor`     | Abre um diálogo para selecionar um editor compatível | `/editor`                       |

### 1.3 Configurações de Idioma

Comandos específicos para controlar o idioma da interface e da saída.

| Comando               | Descrição                          | Exemplos de Uso            |
| --------------------- | ---------------------------------- | -------------------------- |
| `/language`           | Visualizar ou alterar as configurações de idioma | `/language`                |
| → `ui [idioma]`       | Definir o idioma da interface do usuário | `/language ui zh-CN`       |
| → `output [idioma]`   | Definir o idioma de saída do LLM   | `/language output Chinese` |

- Idiomas de interface disponíveis integrados: `zh-CN` (chinês simplificado), `en-US` (inglês), `ru-RU` (russo), `de-DE` (alemão)  
- Exemplos de idiomas de saída: `Chinese`, `English`, `Japanese`, etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando           | Descrição                                                    | Exemplos de Uso                                 |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `/mcp`            | Lista os servidores MCP e ferramentas configurados           | `/mcp`, `/mcp desc`                             |
| `/tools`          | Exibe a lista atual de ferramentas disponíveis               | `/tools`, `/tools desc`                         |
| `/skills`         | Lista e executa habilidades disponíveis                      | `/skills`, `/skills <nome>`                     |
| `/approval-mode`  | Altera o modo de aprovação para uso de ferramentas           | `/approval-mode <modo (auto-edit)> --project`  |
| →`plan`           | Apenas análise, sem execução                                   | Revisão segura                                  |
| →`default`        | Exige aprovação para edições                                   | Uso diário                                      |
| →`auto-edit`      | Aprova automaticamente edições                                 | Ambiente confiável                               |
| →`yolo`           | Aprova automaticamente todas as ações                          | Prototipagem rápida                             |
| `/model`          | Alterna o modelo usado na sessão atual                         | `/model`                                        |
| `/extensions`     | Lista todas as extensões ativas na sessão atual               | `/extensions`                                   |
| `/memory`         | Gerencia o contexto de instruções da IA                        | `/memory add Informação Importante`             |

### 1.5 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando     | Descrição                                             | Exemplos de Uso                     |
| ----------- | ----------------------------------------------------- | ------------------------------------- |
| `/help`     | Exibe informações de ajuda sobre os comandos disponíveis | `/help` ou `/?`                       |
| `/about`    | Exibe informações sobre a versão                      | `/about`                              |
| `/stats`    | Exibe estatísticas detalhadas da sessão atual         | `/stats`                              |
| `/settings` | Abre o editor de configurações                        | `/settings`                           |
| `/auth`     | Altera o método de autenticação                       | `/auth`                               |
| `/bug`      | Envia um relatório de problema sobre o Qwen Code      | `/bug Clique no botão não responde`   |
| `/copy`     | Copia o conteúdo da última saída para a área de transferência | `/copy`                               |
| `/quit`     | Sai do Qwen Code imediatamente                        | `/quit` ou `/exit`                    |

### 1.6 Atalhos comuns

| Atalho             | Função                  | Observação             |
| ------------------ | ----------------------- | ---------------------- |
| `Ctrl/Cmd+L`       | Limpar tela             | Equivalente a `/clear` |
| `Ctrl/Cmd+T`       | Alternar descrição da ferramenta | Gerenciamento de ferramentas MCP |
| `Ctrl/Cmd+C`×2     | Confirmação de saída    | Mecanismo seguro de saída |
| `Ctrl/Cmd+Z`       | Desfazer entrada        | Edição de texto        |
| `Ctrl/Cmd+Shift+Z` | Refazer entrada         | Edição de texto        |

## 2. Comandos @ (Introduzindo Arquivos)

Os comandos `@` são usados para adicionar rapidamente o conteúdo de arquivos ou diretórios locais à conversa.

| Formato do Comando  | Descrição                                      | Exemplos                                           |
| ------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `@<caminho do arquivo>`      | Insere o conteúdo do arquivo especificado        | `@src/main.py Explique este código`                |
| `@<caminho do diretório>` | Lê recursivamente todos os arquivos de texto no diretório | `@docs/ Resuma o conteúdo deste documento`         |
| `@` isolado         | Usado ao discutir o próprio símbolo `@`        | `@ Para que serve esse símbolo na programação?`   |

Observação: Espaços nos caminhos devem ser escapados com uma barra invertida (por exemplo, `@Meus\ Documentos/arquivo.txt`).

## 3. Comandos de exclamação (`!`) — Execução de comandos do shell

Comandos de exclamação permitem executar comandos do sistema diretamente no Qwen Code.

| Formato do comando     | Descrição                                                                 | Exemplos                               |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `!<comando shell>`     | Executa o comando em um subshell                                        | `!ls -la`, `!git status`               |
| `!` isolado            | Alterna para o modo shell: qualquer entrada é executada diretamente como comando do shell | `!`(Enter) → Digite o comando → `!`(sair) |

Variáveis de ambiente: os comandos executados via `!` definem a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts frequentemente usados como comandos de atalho para melhorar a eficiência no trabalho e garantir consistência.

> [!note]
>
> Os comandos personalizados agora usam o formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade com versões anteriores. Quando arquivos TOML forem detectados, um aviso automático de migração será exibido.

### Visão Geral Rápida

| Função             | Descrição                                          | Vantagens                              | Prioridade | Cenários Aplicáveis                                      |
| ------------------ | -------------------------------------------------- | -------------------------------------- | ---------- | -------------------------------------------------------- |
| Namespace          | Subdiretório cria comandos com nome separado por dois-pontos | Melhor organização de comandos         |            |                                                          |
| Comandos Globais   | `~/.qwen/commands/`                                | Disponíveis em todos os projetos       | Baixa      | Comandos pessoais usados com frequência, uso entre projetos |
| Comandos de Projeto | `<diretório raiz do projeto>/.qwen/commands/`     | Específicos do projeto, controláveis por versionamento | Alta       | Compartilhamento em equipe, comandos específicos do projeto |

Regras de Prioridade: Comandos de projeto > Comandos de usuário (o comando do projeto é usado quando os nomes forem iguais)

### Regras de Nomeação de Comandos

#### Tabela de Mapeamento do Caminho do Arquivo para o Nome do Comando

| Localização do Arquivo                   | Comando Gerado | Chamada de Exemplo     |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parâmetro`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Mensagem` |

Regras de nomeação: O separador de caminho (`/` ou `\`) é convertido em dois-pontos (`:`)

### Especificação do Formato de Arquivo Markdown (Recomendado)

Comandos personalizados utilizam arquivos Markdown com frontmatter YAML opcional:

```markdown
---
description: Descrição opcional (exibida em /help)
---

Conteúdo do seu prompt aqui.
Use `{{args}}` para injeção de parâmetros.
```

| Campo         | Obrigatório | Descrição                                      | Exemplo                                      |
| -------------- | ----------- | ---------------------------------------------- | -------------------------------------------- |
| `description`  | Opcional    | Descrição do comando (exibida em `/help`)      | `description: Ferramenta de análise de código` |
| Corpo do prompt | Obrigatório | Conteúdo do prompt enviado ao modelo           | Qualquer conteúdo Markdown após o frontmatter |

### Formato de Arquivo TOML (Obsoleto)

> [!warning]
>
> **Obsoleto:** O formato TOML ainda é suportado, mas será removido em uma versão futura. Migre para o formato Markdown.

| Campo         | Obrigatório | Descrição                                      | Exemplo                                    |
| ------------- | ----------- | ---------------------------------------------- | ------------------------------------------ |
| `prompt`      | Obrigatório | Conteúdo do prompt enviado ao modelo           | `prompt = "Por favor, analise o código: {{args}}"` |
| `description` | Opcional    | Descrição do comando (exibida em `/help`)      | `description = "Ferramenta de análise de código"`       |

### Mecanismo de Processamento de Parâmetros

| Método de Processamento       | Sintaxe            | Cenários Aplicáveis                  | Recursos de Segurança                |
| ----------------------------- | ------------------ | ------------------------------------ | ------------------------------------ |
| Injeção com Consciência de Contexto | `{{args}}`         | Necessidade de controle preciso de parâmetros | Escape automático para shell        |
| Processamento Padrão de Parâmetros | Sem marcação especial | Comandos simples, acréscimo de parâmetros | Acrescentado conforme está          |
| Injeção de Comando Shell      | `!{command}`       | Necessidade de conteúdo dinâmico     | Confirmação de execução obrigatória antes |

#### 1. Injeção com Consciência de Contexto (`{{args}}`)

| Cenário          | Configuração TOML                         | Método de Chamada      | Efeito Real               |
| ---------------- | ----------------------------------------- | ---------------------- | ------------------------- |
| Injeção Direta   | `prompt = "Corrigir: {{args}}"`           | `/fix "Problema no botão"` | `Corrigir: "Problema no botão"` |
| Em Comando Shell | `prompt = "Pesquisar: !{grep {{args}} .}"` | `/search "olá"`        | Executa `grep "olá" .`    |

#### 2. Processamento Padrão de Parâmetros

| Situação de Entrada | Método de Processamento                                      | Exemplo                                        |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Tem parâmetros      | Anexar ao final do prompt (separado por duas quebras de linha) | `/cmd parâmetro` → Prompt original + parâmetro |
| Sem parâmetros      | Enviar o prompt conforme está                                 | `/cmd` → Prompt original                       |

🚀 Injeção Dinâmica de Conteúdo

| Tipo de Injeção        | Sintaxe         | Ordem de Processamento | Finalidade                              |
| ---------------------- | --------------- | ---------------------- | --------------------------------------- |
| Conteúdo de Arquivo    | `@{caminho/do/arquivo}` | Processado primeiro    | Injetar arquivos de referência estáticos |
| Comandos Shell         | `!{comando}`    | Processado no meio     | Injetar resultados de execuções dinâmicas |
| Substituição de Parâmetros | `{{args}}`      | Processado por último  | Injetar parâmetros fornecidos pelo usuário |

#### 3. Execução de Comandos Shell (`!{...}`)

| Operação                              | Interação do Usuário     |
| ------------------------------------- | ------------------------ |
| 1. Analisar o comando e os parâmetros | —                        |
| 2. Escapamento automático no Shell    | —                        |
| 3. Exibir caixa de diálogo de confirmação | ✅ Confirmação do usuário |
| 4. Executar o comando                 | —                        |
| 5. Injetar a saída no prompt          | —                        |

Exemplo: Geração de Mensagem de Commit do Git

````markdown
---
description: Gerar mensagem de commit com base nas alterações em staging
---

Por favor, gere uma mensagem de commit com base na seguinte diferença:

```diff
!{git diff --staged}
```
````

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo | Status de Suporte      | Método de Processamento     |
| --------------- | ---------------------- | --------------------------- |
| Arquivos de Texto   | ✅ Suporte Completo    | Injeta o conteúdo diretamente |
| Imagens/PDF     | ✅ Suporte Multimodal  | Codifica e injeta             |
| Arquivos Binários | ⚠️ Suporte Limitado    | Pode ser ignorado ou truncado |
| Diretório       | ✅ Injeção Recursiva   | Segue as regras do `.gitignore` |

Exemplo: Comando de Revisão de Código

```markdown
---
description: Revisão de código com base nas melhores práticas
---

Revise {{args}}, consultando os padrões:

@{docs/code-standards.md}
```

### Exemplo Prático de Criação

#### Etapas para Criar o Comando "Refatoração para Função Pura"

| Operação                          | Comando/Código                                 |
| --------------------------------- | ---------------------------------------------- |
| 1. Criar estrutura de diretórios  | `mkdir -p ~/.qwen/commands/refactor`           |
| 2. Criar arquivo de comando       | `touch ~/.qwen/commands/refactor/pure.md`      |
| 3. Editar conteúdo do comando     | Consulte o código completo abaixo.             |
| 4. Testar comando                 | `@file.js` → `/refactor:pure`                  |

```markdown
---
description: Refatora código para uma função pura
---

Analise o código no contexto atual e refatore-o para uma função pura.  
Requisitos:

1. Forneça o código refatorado  
2. Explique as principais alterações e como as características de uma função pura foram implementadas  
3. Mantenha a assinatura da função inalterada  
```

### Resumo das Melhores Práticas para Comandos Personalizados

#### Tabela de Recomendações de Projeto de Comandos

| Pontos de Prática      | Abordagem Recomendada                | Evitar                                           |
| ---------------------- | ------------------------------------ | ------------------------------------------------ |
| Nomeação de Comandos   | Usar namespaces para organização     | Usar nomes excessivamente genéricos            |
| Processamento de Parâmetros | Usar claramente `{{args}}`       | Confiar na concatenação padrão (fácil de confundir) |
| Tratamento de Erros    | Utilizar a saída de erro do Shell    | Ignorar falhas de execução                      |
| Organização de Arquivos | Organizar por função em diretórios | Colocar todos os comandos no diretório raiz    |
| Campo de Descrição     | Sempre fornecer uma descrição clara  | Confiar na descrição gerada automaticamente    |

#### Tabela de Lembrete de Recursos de Segurança

| Mecanismo de Segurança | Efeito de Proteção             | Operação do Usuário       |
| ---------------------- | -------------------------------- | --------------------------- |
| Escapamento de Shell   | Previne injeção de comandos      | Processamento automático    |
| Confirmação de Execução| Evita execução acidental         | Confirmação por diálogo     |
| Relatório de Erros     | Ajuda a diagnosticar problemas   | Visualização das informações de erro |