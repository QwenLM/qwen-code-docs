# Comandos

Este documento detalha todos os comandos suportados pelo Qwen Code, ajudando você a gerenciar sessões de forma eficiente, personalizar a interface e controlar seu comportamento.

Os comandos do Qwen Code são acionados por meio de prefixos específicos e se dividem em três categorias:

| Tipo de Prefixo            | Descrição da Função                                 | Caso de Uso Típico                                             |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Comandos de Barra (`/`)    | Controle meta-nível do próprio Qwen Code            | Gerenciamento de sessões, modificação de configurações, ajuda   |
| Comandos de Arroba (`@`)   | Injeção rápida de conteúdo de arquivos locais na conversa | Permitir que a IA analise arquivos ou códigos específicos sob diretórios |
| Comandos de Exclamação (`!`) | Interação direta com o Shell do sistema             | Execução de comandos do sistema como `git status`, `ls`, etc.   |

## 1. Comandos de Barra (`/`)

Comandos de barra são usados para gerenciar sessões do Qwen Code, interface e comportamento básico.

### 1.1 Gerenciamento de Sessão e Projeto

Esses comandos ajudam você a salvar, restaurar e resumir o progresso do trabalho.

| Comando     | Descrição                                                                 | Exemplos de Uso                      |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------ |
| `/init`     | Analisa o diretório atual e cria um arquivo de contexto inicial           | `/init`                              |
| `/summary`  | Gera um resumo do projeto com base no histórico da conversa               | `/summary`                           |
| `/compress` | Substitui o histórico da conversa por um resumo para economizar Tokens    | `/compress`                          |
| `/resume`   | Retoma uma sessão anterior de conversa                                    | `/resume`                            |
| `/restore`  | Restaura os arquivos ao estado anterior à execução da ferramenta          | `/restore` (lista) ou `/restore <ID>` |

### 1.2 Interface e Controle do Ambiente de Trabalho

Comandos para ajustar a aparência da interface e o ambiente de trabalho.

| Comando      | Descrição                                | Exemplos de Uso               |
| ------------ | ---------------------------------------- | ----------------------------- |
| `/clear`     | Limpar o conteúdo da tela do terminal    | `/clear` (atalho: `Ctrl+L`)   |
| `/theme`     | Alterar o tema visual do Qwen Code       | `/theme`                      |
| `/vim`       | Ativar/desativar modo de edição Vim na área de entrada | `/vim`                        |
| `/directory` | Gerenciar espaço de trabalho com suporte a múltiplos diretórios | `/dir add ./src,./tests`      |
| `/editor`    | Abrir diálogo para selecionar editor compatível | `/editor`                     |

### 1.3 Configurações de Idioma

Comandos especificamente para controlar o idioma da interface e da saída.

| Comando               | Descrição                            | Exemplos de Uso            |
| --------------------- | ------------------------------------ | -------------------------- |
| `/language`           | Visualizar ou alterar configurações de idioma | `/language`                |
| → `ui [idioma]`       | Definir idioma da interface          | `/language ui pt-BR`       |
| → `output [idioma]`   | Definir idioma de saída do LLM       | `/language output Portuguese` |

- Idiomas de interface disponíveis: `pt-BR` (Português Brasileiro), `en-US` (Inglês), `es-ES` (Espanhol), `fr-FR` (Francês)
- Exemplos de idiomas de saída: `Portuguese`, `English`, `Spanish`, etc.

### 1.4 Gerenciamento de Ferramentas e Modelos

Comandos para gerenciar ferramentas e modelos de IA.

| Comando          | Descrição                                             | Exemplos de Uso                                 |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `/mcp`           | Lista servidores e ferramentas MCP configurados       | `/mcp`, `/mcp desc`                             |
| `/tools`         | Exibe lista de ferramentas atualmente disponíveis    | `/tools`, `/tools desc`                         |
| `/skills`        | Lista e executa habilidades disponíveis (experimental) | `/skills`, `/skills <nome>`                     |
| `/approval-mode` | Altera o modo de aprovação para uso de ferramentas    | `/approval-mode <modo (auto-edit)> --project`   |
| →`plan`          | Apenas análise, sem execução                          | Revisão segura                                  |
| →`default`       | Requer aprovação para edições                         | Uso diário                                      |
| →`auto-edit`     | Aprova automaticamente edições                      | Ambiente confiável                              |
| →`yolo`          | Aprova automaticamente tudo                           | Prototipagem rápida                             |
| `/model`         | Alterna modelo usado na sessão atual                  | `/model`                                        |
| `/extensions`    | Lista todas extensões ativas na sessão atual          | `/extensions`                                   |
| `/memory`        | Gerencia contexto de instruções da IA                 | `/memory add Informação Importante`             |

### 1.5 Informações, Configurações e Ajuda

Comandos para obter informações e realizar configurações do sistema.

| Comando     | Descrição                                            | Exemplos de Uso                   |
| ----------- | ---------------------------------------------------- | --------------------------------- |
| `/help`     | Exibe informações de ajuda para comandos disponíveis | `/help` ou `/?`                   |
| `/about`    | Exibe informações da versão                          | `/about`                          |
| `/stats`    | Exibe estatísticas detalhadas da sessão atual        | `/stats`                          |
| `/settings` | Abre o editor de configurações                       | `/settings`                       |
| `/auth`     | Altera o método de autenticação                      | `/auth`                           |
| `/bug`      | Envia um problema sobre o Qwen Code                  | `/bug Botão não responde ao clique` |
| `/copy`     | Copia o conteúdo da última saída para a área de transferência | `/copy`                 |
| `/quit`     | Sai do Qwen Code imediatamente                       | `/quit` ou `/exit`                |

### 1.6 Atalhos Comuns

| Atalho             | Função                      | Observação                  |
| ------------------ | --------------------------- | --------------------------- |
| `Ctrl/cmd+L`       | Limpar tela                 | Equivalente ao `/clear`     |
| `Ctrl/cmd+T`       | Alternar descrição da ferramenta | Gerenciamento de ferramentas MCP |
| `Ctrl/cmd+C`×2     | Confirmação de saída        | Mecanismo seguro de saída   |
| `Ctrl/cmd+Z`       | Desfazer entrada            | Edição de texto             |
| `Ctrl/cmd+Shift+Z` | Refazer entrada             | Edição de texto             |

## 2. Comandos @ (Inclusão de Arquivos)

Comandos @ são usados para adicionar rapidamente conteúdo de arquivos ou diretórios locais à conversa.

| Formato do Comando  | Descrição                                           | Exemplos                                            |
| ------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `@<caminho do arquivo>` | Injeta o conteúdo do arquivo especificado           | `@src/main.py Por favor, explique este código`        |
| `@<caminho do diretório>` | Lê recursivamente todos os arquivos de texto no diretório | `@docs/ Resuma o conteúdo deste documento`            |
| `@` isolado         | Usado quando se discute o símbolo `@` em si         | `@ Para que serve este símbolo na programação?`       |

Observação: Espaços nos caminhos precisam ser escapados com barra invertida (por exemplo, `@Meus\ Documentos/arquivo.txt`)

## 3. Comandos de Exclamação (`!`) - Execução de Comandos Shell

Comandos de exclamação permitem que você execute comandos do sistema diretamente dentro do Qwen Code.

| Formato do Comando | Descrição                                                                 | Exemplos                                 |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------- |
| `!<comando shell>` | Executa o comando em um sub-shell                                         | `!ls -la`, `!git status`                 |
| `!` isolado        | Alterna para o modo Shell, qualquer entrada é executada diretamente como comando Shell | `!`(enter) → Digite o comando → `!`(sair) |

Variáveis de Ambiente: Comandos executados via `!` definirão a variável de ambiente `QWEN_CODE=1`.

## 4. Comandos Personalizados

Salve prompts frequentemente usados como comandos de atalho para melhorar a eficiência do trabalho e garantir consistência.

### Visão Geral Rápida

| Função           | Descrição                                  | Vantagens                              | Prioridade | Cenários Aplicáveis                                  |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| Namespace        | Subdiretório cria comandos com nome após dois-pontos | Melhor organização de comandos       |          |                                                      |
| Comandos Globais | `~/.qwen/commands/`                        | Disponíveis em todos os projetos       | Baixa    | Comandos pessoais frequentemente usados, uso entre projetos |
| Comandos de Projeto | `<diretório raiz do projeto>/.qwen/commands/` | Específicos por projeto, controláveis por versão | Alta     | Compartilhamento em equipe, comandos específicos por projeto |

Regras de Prioridade: Comandos de projeto > Comandos de usuário (comando de projeto é usado quando os nomes são iguais)

### Regras de Nomenclatura de Comandos

#### Tabela de Mapeamento entre Caminho do Arquivo e Nome do Comando

| Localização do Arquivo       | Comando Gerado    | Exemplo de Chamada    |
| ---------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.toml` | `/test`           | `/test Parâmetro`     |
| `<projeto>/git/commit.toml`  | `/git:commit`     | `/git:commit Mensagem`|

Regras de Nomenclatura: O separador de caminho (`/` ou `\`) é convertido em dois-pontos (`:`)

### Especificação do Formato de Arquivo TOML

| Campo         | Obrigatório | Descrição                                     | Exemplo                                    |
| ------------- | ----------- | --------------------------------------------- | ------------------------------------------ |
| `prompt`      | Obrigatório | Conteúdo enviado ao modelo                    | `prompt = "Por favor, analise o código: {{args}}"` |
| `description` | Opcional    | Descrição do comando (exibida em /help)       | `description = "Ferramenta de análise de código"` |

### Mecanismo de Processamento de Parâmetros

| Método de Processamento      | Sintaxe            | Cenários Aplicáveis                  | Recursos de Segurança                  |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| Injeção com Consciência de Contexto | `{{args}}`         | Necessita controle preciso de parâmetros | Escaping automático de shell          |
| Processamento Padrão de Parâmetros | Sem marcação especial | Comandos simples, acréscimo de parâmetros | Acrescenta conforme está               |
| Injeção de Comando Shell     | `!{command}`       | Necessita conteúdo dinâmico          | Confirmação de execução necessária antes |

#### 1. Injeção com contexto (`{{args}}`)

| Cenário          | Configuração TOML                       | Método de Chamada     | Efeito Real              |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| Injeção Bruta    | `prompt = "Corrigir: {{args}}"`         | `/fix "Problema no botão"` | `Corrigir: "Problema no botão"` |
| Em Comando Shell | `prompt = "Pesquisar: !{grep {{args}} .}"` | `/search "olá"`       | Executar `grep "olá" .`  |

#### 2. Processamento Padrão de Parâmetros

| Situação de Entrada | Método de Processamento                                | Exemplo                                        |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Com parâmetros      | Adiciona ao final da mensagem (separado por duas quebras de linha) | `/cmd parametro` → Mensagem original + parametro |
| Sem parâmetros      | Envia a mensagem como está                             | `/cmd` → Mensagem original                     |

🚀 Injeção Dinâmica de Conteúdo

| Tipo de Injeção       | Sintaxe        | Ordem de Processamento | Propósito                                     |
| --------------------- | -------------- | ---------------------- | --------------------------------------------- |
| Conteúdo de Arquivo   | `@{caminho do arquivo}` | Processado primeiro    | Injetar arquivos de referência estáticos      |
| Comandos Shell        | `!{comando}`   | Processado no meio     | Injetar resultados de execução dinâmica       |
| Substituição de Parâmetros | `{{args}}`     | Processado por último  | Injetar parâmetros fornecidos pelo usuário    |

#### 3. Execução de Comando Shell (`!{...}`)

| Operação                          | Interação do Usuário |
| --------------------------------- | -------------------- |
| 1. Análise do comando e parâmetros | -                    |
| 2. Escapamento automático do shell | -                    |
| 3. Exibir diálogo de confirmação   | ✅ Confirmação do usuário |
| 4. Executar comando               | -                    |
| 5. Injetar saída no prompt        | -                    |

Exemplo: Geração de Mensagem de Commit do Git

```

# git/commit.toml
description = "Gerar mensagem de commit com base nas alterações em stage"
prompt = """
Por favor, gere uma mensagem de commit com base no seguinte diff:
diff
!{git diff --staged}
"""
```

#### 4. Injeção de Conteúdo de Arquivo (`@{...}`)

| Tipo de Arquivo | Status de Suporte      | Método de Processamento     |
| --------------- | ---------------------- | --------------------------- |
| Arquivos Texto  | ✅ Suporte Completo    | Injeta conteúdo diretamente |
| Imagens/PDF     | ✅ Suporte Multi-modal | Codifica e injeta           |
| Arquivos Binários | ⚠️ Suporte Limitado  | Pode ser ignorado ou truncado |
| Diretório       | ✅ Injeção Recursiva   | Segue regras do .gitignore  |

Exemplo: Comando de Revisão de Código

```

# review.toml
description = "Revisão de código baseada em boas práticas"
prompt = """
Revise {{args}}, referenciando padrões:

@{docs/code-standards.md}
"""
```

### Exemplo Prático de Criação

#### Tabela de Etapas para Criação do Comando "Refatoração de Função Pura"

| Operação                      | Comando/Código                              |
| ----------------------------- | ------------------------------------------- |
| 1. Criar estrutura de diretórios | `mkdir -p ~/.qwen/commands/refactor`        |
| 2. Criar arquivo de comando   | `touch ~/.qwen/commands/refactor/pure.toml` |
| 3. Editar conteúdo do comando | Consulte o código completo abaixo.          |
| 4. Testar comando             | `@file.js` → `/refactor:pure`               |

```# ~/.qwen/commands/refactor/pure.toml
description = "Refatorar código para função pura"
prompt = """
	Por favor, analise o código no contexto atual e refatore para uma função pura.
	Requisitos:
		1. Forneça o código refatorado
		2. Explique as mudanças principais e a implementação das características de função pura
		3. Mantenha a função inalterada
"""
```

### Resumo das Melhores Práticas para Comandos Personalizados

#### Tabela de Recomendações de Design de Comandos

| Pontos de Prática    | Abordagem Recomendada               | Evitar                                      |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| Nomeação de Comandos | Usar namespaces para organização    | Nomes excessivamente genéricos              |
| Processamento de Parâmetros | Usar claramente `{{args}}`     | Contar com acréscimo padrão (fácil confusão)|
| Tratamento de Erros  | Utilizar saída de erro do Shell     | Ignorar falha na execução                   |
| Organização de Arquivos | Organizar por função em diretórios | Todos os comandos no diretório raiz         |
| Campo de Descrição   | Sempre fornecer descrição clara     | Contar com descrição gerada automaticamente |

#### Tabela de Recursos de Segurança

| Mecanismo de Segurança | Efeito da Proteção         | Operação do Usuário    |
| ---------------------- | -------------------------- | ---------------------- |
| Escapamento de Shell   | Prevenir injeção de comandos | Processamento automático |
| Confirmação de Execução | Evitar execução acidental  | Confirmação em diálogo |
| Relatório de Erros     | Ajudar no diagnóstico de problemas | Visualizar informações de erro |