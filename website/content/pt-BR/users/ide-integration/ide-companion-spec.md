# Plugin Qwen Code Companion: Especificação da Interface

> Última Atualização: 15 de setembro de 2025

Este documento define o contrato para construção de um plugin companheiro que habilita o modo IDE do Qwen Code. Para o VS Code, esses recursos (diff nativo, consciência de contexto) são fornecidos pela extensão oficial ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Esta especificação destina-se a colaboradores que desejam trazer funcionalidades semelhantes para outros editores, como IDEs JetBrains, Sublime Text, etc.

## I. A Interface de Comunicação

O Qwen Code e o plugin da IDE se comunicam por meio de um canal de comunicação local.

### 1. Camada de Transporte: MCP sobre HTTP

O plugin **DEVE** executar um servidor HTTP local que implemente o **Protocolo de Contexto do Modelo (MCP)**.

- **Protocolo:** O servidor deve ser um servidor MCP válido. Recomendamos o uso de um SDK MCP existente para sua linguagem de escolha, se disponível.
- **Endpoint:** O servidor deve expor um único endpoint (por exemplo, `/mcp`) para toda a comunicação MCP.
- **Porta:** O servidor **DEVE** escutar em uma porta atribuída dinamicamente (ou seja, escutar na porta `0`).

### 2. Mecanismo de Descoberta: O Arquivo de Bloqueio

Para que o Qwen Code se conecte, ele precisa descobrir em qual porta seu servidor está usando. O plugin **DEVE** facilitar isso criando um "arquivo de bloqueio" e definindo a variável de ambiente da porta.

- **Como a CLI Encontra o Arquivo:** A CLI lê a porta de `QWEN_CODE_IDE_SERVER_PORT`, então lê `~/.qwen/ide/<PORT>.lock`. (Existem fallbacks legados para extensões mais antigas; veja a nota abaixo.)
- **Localização do Arquivo:** O arquivo deve ser criado em um diretório específico: `~/.qwen/ide/`. Seu plugin deve criar este diretório se ele não existir.
- **Convenção de Nomenclatura de Arquivos:** O nome do arquivo é crítico e **DEVE** seguir o padrão:
  `<PORT>.lock`
  - `<PORT>`: A porta em que seu servidor MCP está escutando.
- **Conteúdo do Arquivo & Validação do Workspace:** O arquivo **DEVE** conter um objeto JSON com a seguinte estrutura:

  ```json
  {
    "port": 12345,
    "workspacePath": "/caminho/para/projeto1:/caminho/para/projeto2",
    "authToken": "um-token-muito-secreto",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (número, obrigatório): A porta do servidor MCP.
  - `workspacePath` (string, obrigatório): Uma lista de todos os caminhos raiz dos workspaces abertos, delimitados pelo separador de caminho específico do sistema operacional (`:` para Linux/macOS, `;` para Windows). A CLI usa este caminho para garantir que esteja executando na mesma pasta de projeto que está aberta na IDE. Se o diretório de trabalho atual da CLI não for um subdiretório de `workspacePath`, a conexão será rejeitada. Seu plugin **DEVE** fornecer o(s) caminho(s) absoluto(s) correto(s) para a raiz do(s) workspace(s) aberto(s).
  - `authToken` (string, obrigatório): Um token secreto para proteger a conexão. A CLI incluirá este token em um cabeçalho `Authorization: Bearer <token>` em todas as requisições.
  - `ppid` (número, obrigatório): O ID do processo pai do processo da IDE.
  - `ideName` (string, obrigatório): Um nome amigável para a IDE (ex: `VS Code`, `IDE JetBrains`).

- **Autenticação:** Para proteger a conexão, o plugin **DEVE** gerar um token único e secreto e incluí-lo no arquivo de descoberta. A CLI então incluirá este token no cabeçalho `Authorization` para todas as requisições ao servidor MCP (ex: `Authorization: Bearer um-token-muito-secreto`). Seu servidor **DEVE** validar este token em cada requisição e rejeitar quaisquer requisições não autorizadas.
- **Variáveis de Ambiente (Obrigatórias):** Seu plugin **DEVE** definir `QWEN_CODE_IDE_SERVER_PORT` no terminal integrado para que a CLI possa localizar o arquivo `<PORT>.lock` correto.

**Nota sobre legado:** Para extensões mais antigas que v0.5.1, o Qwen Code pode recorrer à leitura de arquivos JSON no diretório temporário do sistema nomeados `qwen-code-ide-server-<PID>.json` ou `qwen-code-ide-server-<PORT>.json`. Novas integrações não devem depender desses arquivos legados.

## II. A Interface de Contexto

Para habilitar a percepção de contexto, o plugin **PODE** fornecer à CLI informações em tempo real sobre a atividade do usuário no IDE.

### Notificação `ide/contextUpdate`

O plugin **PODE** enviar uma notificação `ide/contextUpdate` para a CLI sempre que o contexto do usuário mudar.

- **Eventos Gatilhos:** Esta notificação deve ser enviada (com debounce recomendado de 50ms) quando:
  - Um arquivo é aberto, fechado ou focalizado.
  - A posição do cursor do usuário ou a seleção de texto muda no arquivo ativo.
- **Payload (`IdeContext`):** Os parâmetros da notificação **DEVEM** ser um objeto `IdeContext`:

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Caminho absoluto para o arquivo
    path: string;
    // Timestamp Unix da última vez que foi focalizado (para ordenação)
    timestamp: number;
    // Verdadeiro se este é o arquivo atualmente focalizado
    isActive?: boolean;
    cursor?: {
      // Número da linha baseado em 1
      line: number;
      // Número do caractere baseado em 1
      character: number;
    };
    // O texto atualmente selecionado pelo usuário
    selectedText?: string;
  }
  ```

  **Nota:** A lista `openFiles` deve incluir apenas arquivos que existem no disco. Arquivos virtuais (por exemplo, arquivos não salvos sem caminho, páginas de configurações do editor) **DEVEM** ser excluídos.

### Como a CLI Usa Este Contexto

Após receber o objeto `IdeContext`, a CLI executa várias etapas de normalização e truncamento antes de enviar as informações para o modelo.

- **Ordenação de Arquivos:** A CLI usa o campo `timestamp` para determinar os arquivos usados mais recentemente. Ela ordena a lista `openFiles` com base nesse valor. Portanto, seu plugin **DEVE** fornecer um timestamp Unix preciso para quando um arquivo foi focado pela última vez.
- **Arquivo Ativo:** A CLI considera apenas o arquivo mais recente (após a ordenação) como o arquivo "ativo". Ela ignorará a flag `isActive` em todos os outros arquivos e limpará seus campos `cursor` e `selectedText`. Seu plugin deve focar em definir `isActive: true` e fornecer detalhes do cursor/seleção apenas para o arquivo atualmente focado.
- **Truncamento:** Para gerenciar os limites de tokens, a CLI trunca tanto a lista de arquivos (para 10 arquivos) quanto o `selectedText` (para 16KB).

Embora a CLI lide com o truncamento final, é altamente recomendável que seu plugin também limite a quantidade de contexto que envia.

## III. A Interface de Diferenciação

Para permitir modificações interativas de código, o plugin **PODE** expor uma interface de diferenciação. Isso permite que a CLI solicite que o IDE abra uma visualização de diferenças, mostrando as alterações propostas em um arquivo. O usuário pode então revisar, editar e, por fim, aceitar ou rejeitar essas alterações diretamente dentro do IDE.

### Ferramenta `openDiff`

O plugin **DEVE** registrar uma ferramenta `openDiff` em seu servidor MCP.

- **Descrição:** Esta ferramenta instrui a IDE a abrir uma visualização de diff modificável para um arquivo específico.
- **Requisição (`OpenDiffRequest`):** A ferramenta é invocada por meio de uma requisição `tools/call`. O campo `arguments` dentro dos `params` da requisição **DEVE** ser um objeto `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // O caminho absoluto para o arquivo a ser comparado.
    filePath: string;
    // O conteúdo proposto para o novo arquivo.
    newContent: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar imediatamente um `CallToolResult` para confirmar a requisição e informar se a visualização de diff foi aberta com sucesso.
  - Em caso de Sucesso: Se a visualização de diff foi aberta com sucesso, a resposta **DEVE** conter conteúdo vazio (ou seja, `content: []`).
  - Em caso de Falha: Se um erro impediu a abertura da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

  O resultado real do diff (aceitação ou rejeição) é comunicado de forma assíncrona por meio de notificações.

### Ferramenta `closeDiff`

O plugin **DEVE** registrar uma ferramenta `closeDiff` em seu servidor MCP.

- **Descrição:** Esta ferramenta instrui o IDE a fechar uma visualização de diff aberta para um arquivo específico.
- **Requisição (`CloseDiffRequest`):** A ferramenta é invocada por meio de uma requisição `tools/call`. O campo `arguments` dentro dos `params` da requisição **DEVE** ser um objeto `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // O caminho absoluto para o arquivo cuja visualização de diff deve ser fechada.
    filePath: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar um `CallToolResult`.
  - Em caso de sucesso: Se a visualização de diff foi fechada com sucesso, a resposta **DEVE** incluir um único bloco **TextContent** no array de conteúdo contendo o conteúdo final do arquivo antes do fechamento.
  - Em caso de falha: Se um erro impediu o fechamento da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

### Notificação `ide/diffAccepted`

Quando o usuário aceita as alterações em uma visualização de diff (por exemplo, clicando em um botão "Aplicar" ou "Salvar"), o plugin **DEVE** enviar uma notificação `ide/diffAccepted` para a CLI.

- **Payload:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo e o conteúdo final do arquivo. O conteúdo pode diferir do `newContent` original se o usuário tiver feito edições manuais na visualização de diff.

  ```typescript
  {
    // O caminho absoluto para o arquivo que foi comparado.
    filePath: string;
    // O conteúdo completo do arquivo após a aceitação.
    content: string;
  }
  ```

### Notificação `ide/diffRejected`

Quando o usuário rejeita as alterações (por exemplo, fechando a visualização de diff sem aceitar), o plugin **DEVE** enviar uma notificação `ide/diffRejected` para a CLI.

- **Payload:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo do diff rejeitado.

  ```typescript
  {
    // O caminho absoluto para o arquivo que foi comparado.
    filePath: string;
  }
  ```

## IV. A Interface de Ciclo de Vida

O plugin **DEVE** gerenciar seus recursos e o arquivo de descoberta corretamente com base no ciclo de vida da IDE.

- **Na Ativação (inicialização da IDE/plugin habilitado):**
  1.  Iniciar o servidor MCP.
  2.  Criar o arquivo de descoberta.
- **Na Desativação (encerramento da IDE/plugin desabilitado):**
  1.  Parar o servidor MCP.
  2.  Excluir o arquivo de descoberta.