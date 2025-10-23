# Comandos CLI

O Qwen Code suporta vários comandos integrados para ajudá-lo a gerenciar sua sessão, personalizar a interface e controlar seu comportamento. Esses comandos são prefixados com uma barra (`/`), um símbolo de arroba (`@`) ou um ponto de exclamação (`!`).

## Comandos com barra (`/`)

Os comandos com barra fornecem controle de nível meta sobre o próprio CLI.

### Comandos Integrados

- **`/bug`**
  - **Descrição:** Registre um problema sobre o Qwen Code. Por padrão, o problema é registrado no repositório GitHub do Qwen Code. A string que você digita após `/bug` se tornará o título do bug sendo registrado. O comportamento padrão de `/bug` pode ser modificado usando a configuração `advanced.bugCommand` nos seus arquivos `.qwen/settings.json`.

- **`/chat`**
  - **Descrição:** Salve e retome o histórico da conversa para gerenciar estados de conversação interativamente ou retomar um estado anterior em uma sessão posterior.
  - **Subcomandos:**
    - **`save`**
      - **Descrição:** Salva o histórico atual da conversa. Você deve adicionar uma `<tag>` para identificar o estado da conversa.
      - **Uso:** `/chat save <tag>`
      - **Detalhes sobre Localização dos Checkpoints:** Os locais padrão para os checkpoints salvos são:
        - Linux/macOS: `~/.qwen/tmp/<project_hash>/`
        - Windows: `C:\Users\<SeuUsuario>\.qwen\tmp\<project_hash>\`
        - Quando você executa `/chat list`, a CLI só varre esses diretórios específicos para encontrar os checkpoints disponíveis.
        - **Nota:** Esses checkpoints servem para salvar e retomar manualmente os estados da conversa. Para checkpoints automáticos criados antes das modificações de arquivos, consulte a [documentação de Checkpointing](../checkpointing.md).
    - **`resume`**
      - **Descrição:** Retoma uma conversa de um salvamento anterior.
      - **Uso:** `/chat resume <tag>`
    - **`list`**
      - **Descrição:** Lista as tags disponíveis para retomar o estado da conversa.
    - **`delete`**
      - **Descrição:** Exclui um checkpoint de conversa salvo.
      - **Uso:** `/chat delete <tag>`
    - **`share`**
      - **Descrição:** Escreve a conversa atual em um arquivo Markdown ou JSON fornecido.
      - **Uso:** `/chat share file.md` ou `/chat share file.json`. Se nenhum nome de arquivo for fornecido, a CLI irá gerar um automaticamente.

- **`/clear`**
  - **Descrição:** Limpa a tela do terminal, incluindo o histórico visível da sessão e o scrollback dentro da CLI. Os dados subjacentes da sessão (para recuperação do histórico) podem ser preservados dependendo da implementação exata, mas a exibição visual é limpa.
  - **Atalho de teclado:** Pressione **Ctrl+L** a qualquer momento para realizar a ação de limpeza.

- **`/summary`**
  - **Descrição:** Gera um resumo abrangente do projeto com base no histórico atual da conversa e o salva em `.qwen/PROJECT_SUMMARY.md`. Este resumo inclui o objetivo geral, conhecimentos-chave, ações recentes e o plano atual, sendo perfeito para retomar o trabalho em sessões futuras.
  - **Uso:** `/summary`
  - **Recursos:**
    - Analisa todo o histórico da conversa para extrair contexto importante
    - Cria um resumo estruturado em markdown com seções para objetivos, conhecimento, ações e planos
    - Salva automaticamente em `.qwen/PROJECT_SUMMARY.md` na raiz do seu projeto
    - Mostra indicadores de progresso durante a geração e o salvamento
    - Integra-se com o recurso "Welcome Back" para retomada de sessão contínua
  - **Nota:** Este comando requer uma conversa ativa com pelo menos 2 mensagens para gerar um resumo significativo.

- **`/compress`**
  - **Descrição:** Substitui todo o contexto do chat por um resumo. Isso economiza tokens usados para tarefas futuras, mantendo um resumo de alto nível do que aconteceu.

- **`/copy`**
  - **Descrição:** Copia a última saída produzida pelo Qwen Code para sua área de transferência, facilitando o compartilhamento ou reutilização.

- **`/directory`** (ou **`/dir`**)
  - **Descrição:** Gerencia diretórios do workspace para suporte a múltiplos diretórios.
  - **Subcomandos:**
    - **`add`**:
      - **Descrição:** Adiciona um diretório ao workspace. O caminho pode ser absoluto ou relativo ao diretório de trabalho atual. Além disso, referências a partir do diretório home também são suportadas.
      - **Uso:** `/directory add <caminho1>,<caminho2>`
      - **Nota:** Desabilitado em perfis restritivos de sandbox. Se estiver usando isso, utilize `--include-directories` ao iniciar a sessão.
    - **`show`**:
      - **Descrição:** Exibe todos os diretórios adicionados por `/directory add` e `--include-directories`.
      - **Uso:** `/directory show`

- **`/directory`** (ou **`/dir`**)
  - **Descrição:** Gerencia diretórios do workspace para suporte a múltiplos diretórios.
  - **Subcomandos:**
    - **`add`**:
      - **Descrição:** Adiciona um diretório ao workspace. O caminho pode ser absoluto ou relativo ao diretório de trabalho atual. Além disso, referências a partir do diretório home também são suportadas.
      - **Uso:** `/directory add <caminho1>,<caminho2>`
      - **Nota:** Desabilitado em perfis restritivos de sandbox. Se estiver usando isso, utilize `--include-directories` ao iniciar a sessão.
    - **`show`**:
      - **Descrição:** Exibe todos os diretórios adicionados por `/directory add` e `--include-directories`.
      - **Uso:** `/directory show`

- **`/editor`**
  - **Descrição:** Abre um diálogo para selecionar editores suportados.

- **`/extensions`**
  - **Descrição:** Lista todas as extensões ativas na sessão atual do Qwen Code. Veja [Extensões do Qwen Code](../extension.md).

- **`/help`** (ou **`/?`**)
  - **Descrição:** Exibe informações de ajuda sobre o Qwen Code, incluindo comandos disponíveis e seu uso.

- **`/mcp`**
  - **Descrição:** Lista os servidores configurados do Model Context Protocol (MCP), seu status de conexão, detalhes do servidor e ferramentas disponíveis.
  - **Subcomandos:**
    - **`desc`** ou **`descriptions`**:
      - **Descrição:** Mostra descrições detalhadas dos servidores e ferramentas MCP.
    - **`nodesc`** ou **`nodescriptions`**:
      - **Descrição:** Oculta as descrições das ferramentas, mostrando apenas os nomes.
    - **`schema`**:
      - **Descrição:** Mostra o schema JSON completo para os parâmetros configurados da ferramenta.
  - **Atalho de Teclado:** Pressione **Ctrl+T** a qualquer momento para alternar entre mostrar e ocultar as descrições das ferramentas.

- **`/memory`**
  - **Descrição:** Gerencia o contexto instrucional da IA (memória hierárquica carregada a partir de arquivos `QWEN.md` por padrão; configurável via `contextFileName`).
  - **Subcomandos:**
    - **`add`**:
      - **Descrição:** Adiciona o texto seguinte à memória da IA. Uso: `/memory add <texto para lembrar>`
    - **`show`**:
      - **Descrição:** Exibe o conteúdo completo e concatenado da memória hierárquica atual carregada de todos os arquivos de contexto (ex.: `QWEN.md`). Isso permite inspecionar o contexto instrucional fornecido ao modelo.
    - **`refresh`**:
      - **Descrição:** Recarrega a memória instrucional hierárquica de todos os arquivos de contexto (padrão: `QWEN.md`) encontrados nos locais configurados (global, projeto/ancestrais e subdiretórios). Isso atualiza o modelo com o conteúdo mais recente do contexto.
    - **Nota:** Para mais detalhes sobre como os arquivos de contexto contribuem para a memória hierárquica, veja a [documentação de Configuração da CLI](./configuration.md#context-files-hierarchical-instructional-context).

- **`/restore`**
  - **Descrição:** Restaura os arquivos do projeto ao estado em que estavam imediatamente antes da execução de uma ferramenta. Isso é particularmente útil para desfazer edições feitas por uma ferramenta. Se executado sem um ID de chamada de ferramenta, ele listará os checkpoints disponíveis para restauração.
  - **Uso:** `/restore [tool_call_id]`
  - **Nota:** Disponível apenas se a CLI for invocada com a opção `--checkpointing` ou configurada via [configurações](./configuration.md). Veja a [documentação de Checkpointing](../checkpointing.md) para mais detalhes.

- **`/settings`**
  - **Descrição:** Abre o editor de configurações para visualizar e modificar as configurações do Qwen Code.
  - **Detalhes:** Este comando fornece uma interface amigável para alterar as configurações que controlam o comportamento e a aparência do Qwen Code. É equivalente a editar manualmente o arquivo `.qwen/settings.json`, mas com validação e orientação para evitar erros.
  - **Uso:** Basta executar `/settings` e o editor será aberto. Você pode navegar ou pesquisar por configurações específicas, ver seus valores atuais e modificá-las conforme desejado. Alterações em algumas configurações são aplicadas imediatamente, enquanto outras exigem reinicialização.

- **`/stats`**
  - **Descrição:** Exibe estatísticas detalhadas da sessão atual do Qwen Code, incluindo uso de tokens, economia de tokens em cache (quando disponível) e duração da sessão. Nota: Informações sobre tokens em cache só são exibidas quando tokens em cache estão sendo usados, o que ocorre com autenticação via chave de API, mas não com autenticação OAuth neste momento.

- [**`/theme`**](./themes.md)
  - **Descrição:** Abre um diálogo que permite alterar o tema visual do Qwen Code.

- **`/auth`**
  - **Descrição:** Abre um diálogo que permite alterar o método de autenticação.

- **`/approval-mode`**
  - **Descrição:** Altera o modo de aprovação para uso de ferramentas.
  - **Uso:** `/approval-mode [modo] [--session|--project|--user]`
  - **Modos Disponíveis:**
    - **`plan`**: Apenas análise; não modifica arquivos nem executa comandos
    - **`default`**: Requer aprovação para edição de arquivos ou comandos shell
    - **`auto-edit`**: Aprova automaticamente edições de arquivos
    - **`yolo`**: Aprova automaticamente todas as ferramentas
  - **Exemplos:**
    - `/approval-mode plan --project` (persiste o modo plan para este projeto)
    - `/approval-mode yolo --user` (persiste o modo YOLO para este usuário em todos os projetos)

- **`/about`**
  - **Descrição:** Mostra informações da versão. Por favor, compartilhe essas informações ao registrar problemas.

- **`/agents`**
  - **Descrição:** Gerencia subagentes de IA especializados para tarefas focadas. Subagentes são assistentes de IA independentes configurados com expertise específica e acesso a ferramentas.
  - **Subcomandos:**
    - **`create`**:
      - **Descrição:** Inicia um assistente interativo para criar um novo subagente. O assistente guia você pela seleção de localização, geração de prompts com IA, seleção de ferramentas e personalização visual.
      - **Uso:** `/agents create`
    - **`manage`**:
      - **Descrição:** Abre um diálogo de gerenciamento interativo para visualizar, editar e excluir subagentes existentes. Mostra agentes de nível de projeto e de usuário.
      - **Uso:** `/agents manage`
  - **Locais de Armazenamento:**
    - **Nível de Projeto:** `.qwen/agents/` (compartilhado com a equipe, tem precedência)
    - **Nível de Usuário:** `~/.qwen/agents/` (agentes pessoais, disponíveis em todos os projetos)
  - **Nota:** Para informações detalhadas sobre criação e gerenciamento de subagentes, veja a [documentação de Subagentes](../subagents.md).

- [**`/tools`**](../tools/index.md)
  - **Descrição:** Exibe uma lista das ferramentas atualmente disponíveis no Qwen Code.
  - **Uso:** `/tools [desc]`
  - **Subcomandos:**
    - **`desc`** ou **`descriptions`**:
      - **Descrição:** Mostra descrições detalhadas de cada ferramenta, incluindo o nome de cada ferramenta com sua descrição completa conforme fornecida ao modelo.
    - **`nodesc`** ou **`nodescriptions`**:
      - **Descrição:** Oculta as descrições das ferramentas, mostrando apenas os nomes.

- **`/quit-confirm`**
  - **Descrição:** Mostra um diálogo de confirmação antes de sair do Qwen Code, permitindo escolher como lidar com a sessão atual.
  - **Uso:** `/quit-confirm`
  - **Recursos:**
    - **Sair imediatamente:** Sai sem salvar nada (equivalente a `/quit`)
    - **Gerar resumo e sair:** Cria um resumo do projeto usando `/summary` antes de sair
    - **Salvar conversa e sair:** Salva a conversa atual com uma tag gerada automaticamente antes de sair
  - **Atalho de teclado:** Pressione **Ctrl+C** duas vezes para acionar o diálogo de confirmação de saída
  - **Nota:** Este comando é acionado automaticamente ao pressionar Ctrl+C uma vez, fornecendo um mecanismo de segurança para prevenir saídas acidentais.

- **`/quit`** (ou **`/exit`**)
  - **Descrição:** Sai do Qwen Code imediatamente sem nenhum diálogo de confirmação.

- **`/vim`**
  - **Descrição:** Ativa ou desativa o modo vim. Quando o modo vim está ativado, a área de entrada suporta comandos de navegação e edição estilo vim tanto no modo NORMAL quanto no INSERT.
  - **Recursos:**
    - **Modo NORMAL:** Navegue com `h`, `j`, `k`, `l`; pule palavras com `w`, `b`, `e`; vá para início/fim da linha com `0`, `$`, `^`; vá para linhas específicas com `G` (ou `gg` para primeira linha)
    - **Modo INSERT:** Entrada de texto padrão com escape para retornar ao modo NORMAL
    - **Comandos de edição:** Delete com `x`, mude com `c`, insira com `i`, `a`, `o`, `O`; operações complexas como `dd`, `cc`, `dw`, `cw`
    - **Suporte a contagem:** Prefixe comandos com números (ex.: `3h`, `5w`, `10G`)
    - **Repetição do último comando:** Use `.` para repetir a última operação de edição
    - **Configuração persistente:** A preferência do modo vim é salva em `~/.qwen/settings.json` e restaurada entre sessões
  - **Indicador de status:** Quando ativado, mostra `[NORMAL]` ou `[INSERT]` no rodapé

- **`/init`**
  - **Descrição:** Analisa o diretório atual e cria um arquivo de contexto `QWEN.md` por padrão (ou o nome especificado por `contextFileName`). Se já existir um arquivo não vazio, nenhuma alteração será feita. O comando cria um arquivo vazio e solicita ao modelo que o preencha com instruções específicas do projeto.

### Comandos Personalizados

Para começar rapidamente, veja o [exemplo](#example-a-pure-function-refactoring-command) abaixo.

Comandos personalizados permitem que você salve e reutilize seus prompts favoritos ou mais usados como atalhos pessoais dentro do Qwen Code. Você pode criar comandos específicos para um único projeto ou comandos disponíveis globalmente em todos os seus projetos, otimizando seu fluxo de trabalho e garantindo consistência.

#### Localização dos Arquivos e Precedência

O Qwen Code descobre comandos a partir de dois locais, carregados em uma ordem específica:

1.  **Comandos do Usuário (Global):** Localizados em `~/.qwen/commands/`. Esses comandos estão disponíveis em qualquer projeto no qual você esteja trabalhando.
2.  **Comandos do Projeto (Local):** Localizados em `<seu-diretorio-do-projeto>/.qwen/commands/`. Esses comandos são específicos para o projeto atual e podem ser versionados para serem compartilhados com sua equipe.

Se um comando no diretório do projeto tiver o mesmo nome que um comando no diretório do usuário, **o comando do projeto sempre será usado.** Isso permite que os projetos substituam comandos globais por versões específicas do projeto.

#### Nomeação e Namespacing

O nome de um command é determinado pelo seu caminho de arquivo relativo ao diretório `commands`. Subdiretórios são usados para criar comandos com namespace, com o separador de caminho (`/` ou `\`) sendo convertido para dois pontos (`:`).

- Um arquivo em `~/.qwen/commands/test.toml` se torna o comando `/test`.
- Um arquivo em `<project>/.qwen/commands/git/commit.toml` se torna o comando com namespace `/git:commit`.

#### Formato de Arquivo TOML (v1)

Seus arquivos de definição de comandos devem ser escritos no formato TOML e usar a extensão `.toml`.

##### Campos Obrigatórios

- `prompt` (String): O prompt que será enviado ao modelo quando o comando for executado. Pode ser uma string de uma única linha ou multi-linhas.

##### Campos Opcionais

- `description` (String): Uma breve descrição de uma linha sobre o que o comando faz. Esse texto será exibido ao lado do seu comando no menu `/help`. **Se você omitir esse campo, uma descrição genérica será gerada a partir do nome do arquivo.**

#### Tratamento de Argumentos

Comandos personalizados suportam dois métodos poderosos para lidar com argumentos. O CLI escolhe automaticamente o método correto com base no conteúdo do `prompt` do seu comando.

##### 1. Injeção Contextual com `{{args}}`

Se seu `prompt` contém o placeholder especial `{{args}}`, o CLI irá substituir esse placeholder pelo texto que o usuário digitou após o nome do comando.

O comportamento dessa injeção depende de onde ela é usada:

**A. Injeção Bruta (Fora de Comandos Shell)**

Quando usado no corpo principal do prompt, os argumentos são injetados exatamente como o usuário os digitou.

**Exemplo (`git/fix.toml`):**

```toml

# Invocado via: /git:fix "Button is misaligned"

description = "Gera uma correção para um determinado problema."
prompt = "Por favor, forneça uma correção de código para o problema descrito aqui: {{args}}."
```

O modelo recebe: `Por favor, forneça uma correção de código para o problema descrito aqui: "Button is misaligned".`

**B. Usando Argumentos em Comandos Shell (Dentro de Blocos `!{...}`)**

Quando você usa `{{args}}` dentro de um bloco de injeção shell (`!{...}`), os argumentos são automaticamente **escapados para shell** antes da substituição. Isso permite que você passe argumentos com segurança para comandos shell, garantindo que o comando resultante seja sintaticamente correto e seguro, prevenindo vulnerabilidades de injeção de comando.

**Exemplo (`/grep-code.toml`):**

```toml
prompt = """
Por favor, resuma os resultados para o padrão `{{args}}`.

Resultados da Busca:
!{grep -r {{args}} .}
"""
```

Quando você executa `/grep-code It's complicated`:

1. O CLI detecta que `{{args}}` é usado tanto fora quanto dentro de `!{...}`.
2. Fora: O primeiro `{{args}}` é substituído diretamente por `It's complicated`.
3. Dentro: O segundo `{{args}}` é substituído pela versão escapada (ex., no Linux: `"It's complicated"`).
4. O comando executado é `grep -r "It's complicated" .`.
5. O CLI solicita que você confirme este comando exato e seguro antes da execução.
6. O prompt final é enviado.

##### 2. Tratamento Padrão de Argumentos

Se seu `prompt` **não** contiver o placeholder especial `{{args}}`, a CLI usará um comportamento padrão para lidar com os argumentos.

Se você fornecer argumentos ao comando (por exemplo, `/mycommand arg1`), a CLI irá adicionar o comando completo que você digitou ao final do prompt, separado por duas quebras de linha. Isso permite que o modelo veja tanto as instruções originais quanto os argumentos específicos que você acabou de fornecer.

Se você **não** fornecer nenhum argumento (por exemplo, `/mycommand`), o prompt será enviado ao modelo exatamente como está, sem nada adicionado.

**Exemplo (`changelog.toml`):**

Este exemplo mostra como criar um comando robusto definindo um papel para o modelo, explicando onde encontrar a entrada do usuário e especificando o formato e comportamento esperados.

```toml

# In: <project>/.qwen/commands/changelog.toml

# Invocado via: /changelog 1.2.0 added "Support for default argument parsing."

description = "Adiciona uma nova entrada ao arquivo CHANGELOG.md do projeto."
prompt = """

# Tarefa: Atualizar Changelog

Você é um mantenedor experto deste projeto de software. Um usuário invocou um comando para adicionar uma nova entrada ao changelog.

**O comando bruto do usuário está anexado abaixo das suas instruções.**

Sua tarefa é parsear a `<version>`, `<change_type>`, e `<message>` da entrada do usuário e usar a tool `write_file` para atualizar corretamente o arquivo `CHANGELOG.md`.

## Formato Esperado
O comando segue este formato: `/changelog <version> <type> <message>`
- `<type>` deve ser um destes: "added", "changed", "fixed", "removed".

```markdown
## Comportamento
1. Ler o arquivo `CHANGELOG.md`.
2. Encontrar a seção para a `<version>` especificada.
3. Adicionar a `<message>` sob o cabeçalho `<type>` correto.
4. Se a seção de versão ou tipo não existir, criá-la.
5. Aderir estritamente ao formato "Keep a Changelog".

Quando você executar `/changelog 1.2.0 added "New feature"`, o texto final enviado para o modelo será o prompt original seguido por duas quebras de linha e o comando que você digitou.
```

##### 3. Executando Comandos Shell com `!{...}`

Você pode tornar seus comandos dinâmicos executando comandos shell diretamente dentro do seu `prompt` e injetando sua saída. Isso é ideal para coletar contexto do seu ambiente local, como ler o conteúdo de arquivos ou verificar o status do Git.

Quando um comando personalizado tenta executar um comando shell, o Qwen Code agora irá solicitar sua confirmação antes de prosseguir. Esta é uma medida de segurança para garantir que apenas comandos intencionais possam ser executados.

**Como Funciona:**

1.  **Injetar Comandos:** Use a sintaxe `!{...}`.
2.  **Substituição de Argumentos:** Se `{{args}}` estiver presente dentro do bloco, ele será automaticamente escapado para shell (veja [Injeção Contextual](#1-context-aware-injection-with-args) acima).
3.  **Parsing Robusto:** O parser lida corretamente com comandos shell complexos que incluem chaves aninhadas, como payloads JSON. **Nota:** O conteúdo dentro de `!{...}` deve ter chaves balanceadas (`{` e `}`). Se você precisar executar um comando contendo chaves desbalanceadas, considere envolvê-lo em um arquivo de script externo e chamar o script dentro do bloco `!{...}`.
4.  **Verificação de Segurança e Confirmação:** A CLI realiza uma verificação de segurança no comando final resolvido (após os argumentos serem escapados e substituídos). Uma caixa de diálogo aparecerá mostrando os comandos exatos a serem executados.
5.  **Execução e Relatório de Erros:** O comando é executado. Se o comando falhar, a saída injetada no prompt incluirá as mensagens de erro (stderr) seguidas por uma linha de status, por exemplo, `[Shell command exited with code 1]`. Isso ajuda o modelo a entender o contexto da falha.

**Exemplo (`git/commit.toml`):**

Este comando obtém o diff git staged e o utiliza para pedir ao modelo que escreva uma mensagem de commit.

````toml

# Em: <project>/.qwen/commands/git/commit.toml

# Invocado via: /git:commit

description = "Gera uma mensagem de commit Git baseada nas alterações staged."

# O prompt usa !{...} para executar o comando e injetar sua saída.
prompt = """
Por favor, gere uma mensagem de commit no formato Conventional Commit baseada no seguinte git diff:

```diff
!{git diff --staged}
```

"""

````

Quando você executa `/git:commit`, a CLI primeiro executa `git diff --staged`, depois substitui `!{git diff --staged}` pela saída desse comando antes de enviar o prompt final e completo para o modelo.

##### 4. Injetando Conteúdo de Arquivos com `@{...}`

Você pode incorporar diretamente o conteúdo de um arquivo ou uma listagem de diretório no seu prompt usando a sintaxe `@{...}`. Isso é útil para criar comandos que operam em arquivos específicos.

**Como Funciona:**

- **Injeção de Arquivo**: `@{caminho/para/arquivo.txt}` é substituído pelo conteúdo de `arquivo.txt`.
- **Suporte Multimodal**: Se o caminho apontar para uma imagem suportada (ex.: PNG, JPEG), PDF, áudio ou vídeo, ele será codificado corretamente e injetado como entrada multimodal. Outros arquivos binários são tratados com segurança e ignorados.
- **Listagem de Diretório**: `@{caminho/para/diretorio}` é percorrido e cada arquivo presente dentro do diretório e todos os subdiretórios é inserido no prompt. Isso respeita `.gitignore` e `.qwenignore`, se habilitados.
- **Ciente do Workspace**: O comando busca o caminho no diretório atual e em quaisquer outros diretórios do workspace. Caminhos absolutos são permitidos se estiverem dentro do workspace.
- **Ordem de Processamento**: A injeção de conteúdo de arquivo com `@{...}` é processada _antes_ dos comandos shell (`!{...}`) e da substituição de argumentos (`{{args}}`).
- **Parsing**: O parser exige que o conteúdo dentro de `@{...}` (o caminho) tenha chaves balanceadas (`{` e `}`).

**Exemplo (`review.toml`):**

Este comando injeta o conteúdo de um arquivo de boas práticas _fixo_ (`docs/best-practices.md`) e usa os argumentos do usuário para fornecer contexto para a revisão.

```toml

```toml
# In: <project>/.qwen/commands/review.toml

# Invoked via: /review FileCommandLoader.ts

description = "Revisa o contexto fornecido usando um guia de boas práticas."
prompt = """
Você é um revisor de código especialista.

Sua tarefa é revisar {{args}}.

Use as seguintes boas práticas ao fornecer sua revisão:

@{docs/best-practices.md}
"""
```

Quando você executa `/review FileCommandLoader.ts`, o placeholder `@{docs/best-practices.md}` é substituído pelo conteúdo desse arquivo, e `{{args}}` é substituído pelo texto que você forneceu, antes que o prompt final seja enviado para o modelo.

#### Exemplo: Comando de Refatoração "Função Pura"

Vamos criar um comando global que solicita ao modelo para refatorar um trecho de código.

**1. Crie o arquivo e os diretórios:**

Primeiro, certifique-se de que o diretório de comandos do usuário exista, depois crie um subdiretório `refactor` para organização e o arquivo TOML final.

```bash
mkdir -p ~/.qwen/commands/refactor
touch ~/.qwen/commands/refactor/pure.toml
```

**2. Adicione o conteúdo ao arquivo:**

Abra `~/.qwen/commands/refactor/pure.toml` no seu editor e adicione o seguinte conteúdo. Estamos incluindo o campo opcional `description` como boa prática.

```toml

# In: ~/.qwen/commands/refactor/pure.toml

```markdown
# Este comando será invocado via: /refactor:pure

description = "Pede ao modelo para refatorar o contexto atual em uma função pura."

prompt = """
Por favor, analise o código que eu forneci no contexto atual.
Refatore-o em uma função pura.

Sua resposta deve incluir:
1. O bloco de código da função refatorada e pura.
2. Uma breve explicação das principais mudanças feitas e por que elas contribuem para a pureza.
"""
```

**3. Execute o Comando:**

É isso! Agora você pode rodar seu comando no CLI. Primeiro, você pode adicionar um arquivo ao contexto e depois invocar seu comando:

```
> @my-messy-function.js
> /refactor:pure
```

O Qwen Code irá então executar o prompt multi-linha definido no seu arquivo TOML.
```

## Atalhos do Input Prompt

Esses atalhos se aplicam diretamente ao input prompt para manipulação de texto.

- **Desfazer:**
  - **Atalho de teclado:** Pressione **Ctrl+z** para desfazer a última ação no input prompt.

- **Refazer:**
  - **Atalho de teclado:** Pressione **Ctrl+Shift+Z** para refazer a última ação desfeita no input prompt.

## Comandos At (`@`)

Os comandos At são usados para incluir o conteúdo de arquivos ou diretórios como parte do seu prompt para o modelo. Esses comandos incluem filtragem com base no Git.

- **`@<caminho_para_arquivo_ou_diretório>`**
  - **Descrição:** Injeta o conteúdo do arquivo especificado ou de vários arquivos no seu prompt atual. Isso é útil para fazer perguntas sobre código específico, textos ou conjuntos de arquivos.
  - **Exemplos:**
    - `@caminho/para/seu/arquivo.txt Explique este texto.`
    - `@src/meu_projeto/ Resuma o código neste diretório.`
    - `Sobre o que é este arquivo? @README.md`
  - **Detalhes:**
    - Se um caminho para um único arquivo for fornecido, o conteúdo desse arquivo será lido.
    - Se um caminho para um diretório for fornecido, o comando tentará ler o conteúdo dos arquivos dentro desse diretório e de seus subdiretórios.
    - Espaços nos caminhos devem ser escapados com uma barra invertida (ex.: `@Meus\ Documentos/arquivo.txt`).
    - Internamente, o comando usa a ferramenta `read_many_files`. O conteúdo é buscado e então inserido na sua consulta antes de ser enviada ao modelo.
    - **Filtragem com base no Git:** Por padrão, arquivos ignorados pelo Git (como `node_modules/`, `dist/`, `.env`, `.git/`) são excluídos. Esse comportamento pode ser alterado por meio das configurações `context.fileFiltering`.
    - **Tipos de arquivo:** O comando é voltado para arquivos de texto. Embora possa tentar ler qualquer arquivo, arquivos binários ou muito grandes podem ser ignorados ou truncados pela ferramenta `read_many_files` subjacente para garantir desempenho e relevância. A ferramenta indica se arquivos foram ignorados.
  - **Saída:** O CLI mostrará uma mensagem de chamada da ferramenta indicando que `read_many_files` foi usada, juntamente com uma mensagem detalhando o status e os caminhos processados.

- **`@` (Símbolo @ sozinho)**
  - **Descrição:** Se você digitar apenas o símbolo `@` sem um caminho, a consulta será passada como está para o modelo. Isso pode ser útil caso você esteja falando especificamente _sobre_ o símbolo `@` no seu prompt.

### Tratamento de erros para comandos `@`

- Se o caminho especificado após `@` não for encontrado ou for inválido, uma mensagem de erro será exibida, e a query pode não ser enviada ao modelo, ou será enviada sem o conteúdo do arquivo.
- Se a tool `read_many_files` encontrar um erro (por exemplo, problemas de permissão), isso também será reportado.

## Modo shell e comandos diretos (`!`)

O prefixo `!` permite que você interaja diretamente com o shell do seu sistema a partir do Qwen Code.

- **`!<shell_command>`**
  - **Descrição:** Executa o `<shell_command>` informado usando `bash` no Linux/macOS ou `cmd.exe` no Windows. Qualquer saída ou erro do comando é exibido no terminal.
  - **Exemplos:**
    - `!ls -la` (executa `ls -la` e retorna ao Qwen Code)
    - `!git status` (executa `git status` e retorna ao Qwen Code)

- **`!` (Alternar modo shell)**
  - **Descrição:** Digitar `!` sozinho alterna o modo shell.
    - **Entrando no modo shell:**
      - Quando ativo, o modo shell usa uma coloração diferente e um "Indicador de Modo Shell".
      - No modo shell, o texto digitado é interpretado diretamente como um comando shell.
    - **Saindo do modo shell:**
      - Ao sair, a interface volta à aparência padrão e o comportamento normal do Qwen Code é retomado.

- **Cuidado com todos os usos de `!`:** Comandos executados no modo shell têm as mesmas permissões e impacto como se fossem executados diretamente no seu terminal.

- **Variável de ambiente:** Quando um comando é executado via `!` ou no modo shell, a variável de ambiente `QWEN_CODE=1` é definida no ambiente do subprocesso. Isso permite que scripts ou ferramentas detectem se estão sendo executados a partir da CLI.