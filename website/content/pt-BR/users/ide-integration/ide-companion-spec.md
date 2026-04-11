# Qwen Code Companion Plugin: Especificação de Interface

> Última atualização: 15 de setembro de 2025

Este documento define o contrato para a criação de um plugin companion que habilita o modo IDE do Qwen Code. Para o VS Code, esses recursos (diff nativo, consciência de contexto) são fornecidos pela extensão oficial ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Esta especificação é destinada a contribuidores que desejam trazer funcionalidades semelhantes para outros editores, como JetBrains IDEs, Sublime Text, etc.

## I. A Interface de Comunicação

O Qwen Code e o plugin da IDE se comunicam por meio de um canal de comunicação local.

### 1. Camada de Transporte: MCP sobre HTTP

O plugin **DEVE** executar um servidor HTTP local que implemente o **Model Context Protocol (MCP)**.

- **Protocolo:** O servidor deve ser um servidor MCP válido. Recomendamos o uso de um SDK MCP existente para a linguagem de sua preferência, se disponível.
- **Endpoint:** O servidor deve expor um único endpoint (por exemplo, `/mcp`) para toda a comunicação MCP.
- **Porta:** O servidor **DEVE** escutar em uma porta atribuída dinamicamente (ou seja, escutar na porta `0`).

### 2. Mecanismo de Descoberta: O Arquivo de Lock

Para que o Qwen Code se conecte, ele precisa descobrir qual porta seu servidor está usando. O plugin **DEVE** facilitar isso criando um "arquivo de lock" e definindo a variável de ambiente da porta.

- **Como a CLI encontra o arquivo:** A CLI lê a porta a partir de `QWEN_CODE_IDE_SERVER_PORT` e, em seguida, lê `~/.qwen/ide/<PORT>.lock`. (Existem fallbacks legados para extensões mais antigas; veja a nota abaixo.)
- **Localização do arquivo:** O arquivo deve ser criado em um diretório específico: `~/.qwen/ide/`. Seu plugin deve criar esse diretório se ele não existir.
- **Convenção de nomenclatura do arquivo:** O nome do arquivo é crítico e **DEVE** seguir o padrão:
  `<PORT>.lock`
  - `<PORT>`: A porta em que seu servidor MCP está escutando.
- **Conteúdo do arquivo e validação do workspace:** O arquivo **DEVE** conter um objeto JSON com a seguinte estrutura:

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (number, required): A porta do servidor MCP.
  - `workspacePath` (string, required): Uma lista de todos os caminhos raiz dos workspaces abertos, delimitada pelo separador de caminho específico do SO (`:` para Linux/macOS, `;` para Windows). A CLI usa esse caminho para garantir que está sendo executada na mesma pasta do projeto que está aberta na IDE. Se o diretório de trabalho atual da CLI não for um subdiretório de `workspacePath`, a conexão será rejeitada. Seu plugin **DEVE** fornecer o(s) caminho(s) absoluto(s) correto(s) para a raiz do(s) workspace(s) aberto(s).
  - `authToken` (string, required): Um token secreto para proteger a conexão. A CLI incluirá esse token em um cabeçalho `Authorization: Bearer <token>` em todas as requisições.
  - `ppid` (number, required): O ID do processo pai do processo da IDE.
  - `ideName` (string, required): Um nome amigável para a IDE (por exemplo, `VS Code`, `JetBrains IDE`).

- **Autenticação:** Para proteger a conexão, o plugin **DEVE** gerar um token secreto e único e incluí-lo no arquivo de descoberta. A CLI então incluirá esse token no cabeçalho `Authorization` para todas as requisições ao servidor MCP (por exemplo, `Authorization: Bearer a-very-secret-token`). Seu servidor **DEVE** validar esse token em cada requisição e rejeitar qualquer uma que não esteja autorizada.
- **Variáveis de ambiente (obrigatórias):** Seu plugin **DEVE** definir `QWEN_CODE_IDE_SERVER_PORT` no terminal integrado para que a CLI possa localizar o arquivo `<PORT>.lock` correto.

**Nota de legado:** Para extensões anteriores à v0.5.1, o Qwen Code pode fazer fallback para a leitura de arquivos JSON no diretório temporário do sistema nomeados `qwen-code-ide-server-<PID>.json` ou `qwen-code-ide-server-<PORT>.json`. Novas integrações não devem depender desses arquivos legados.

## II. A Interface de Contexto

Para habilitar a consciência de contexto, o plugin **PODE** fornecer à CLI informações em tempo real sobre a atividade do usuário na IDE.

### Notificação `ide/contextUpdate`

O plugin **PODE** enviar uma [notificação](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) `ide/contextUpdate` para a CLI sempre que o contexto do usuário for alterado.

- **Eventos de disparo:** Essa notificação deve ser enviada (com um debounce recomendado de 50ms) quando:
  - Um arquivo for aberto, fechado ou receber foco.
  - A posição do cursor ou a seleção de texto do usuário for alterada no arquivo ativo.
- **Payload (`IdeContext`):** Os parâmetros da notificação **DEVEM** ser um objeto `IdeContext`:

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Absolute path to the file
    path: string;
    // Last focused Unix timestamp (for ordering)
    timestamp: number;
    // True if this is the currently focused file
    isActive?: boolean;
    cursor?: {
      // 1-based line number
      line: number;
      // 1-based character number
      character: number;
    };
    // The text currently selected by the user
    selectedText?: string;
  }
  ```

  **Nota:** A lista `openFiles` deve incluir apenas arquivos que existem no disco. Arquivos virtuais (por exemplo, arquivos não salvos sem um caminho, páginas de configurações do editor) **DEVEM** ser excluídos.

### Como a CLI usa esse contexto

Após receber o objeto `IdeContext`, a CLI executa várias etapas de normalização e truncamento antes de enviar as informações para o modelo.

- **Ordenação de arquivos:** A CLI usa o campo `timestamp` para determinar os arquivos usados mais recentemente. Ela ordena a lista `openFiles` com base nesse valor. Portanto, seu plugin **DEVE** fornecer um timestamp Unix preciso de quando um arquivo recebeu foco pela última vez.
- **Arquivo ativo:** A CLI considera apenas o arquivo mais recente (após a ordenação) como o arquivo "ativo". Ela ignorará a flag `isActive` em todos os outros arquivos e limpará seus campos `cursor` e `selectedText`. Seu plugin deve focar em definir `isActive: true` e fornecer detalhes de cursor/seleção apenas para o arquivo que está atualmente em foco.
- **Truncamento:** Para gerenciar os limites de tokens, a CLI trunca tanto a lista de arquivos (para 10 arquivos) quanto o `selectedText` (para 16KB).

Embora a CLI gerencie o truncamento final, é altamente recomendável que seu plugin também limite a quantidade de contexto que envia.

## III. A Interface de Diff

Para habilitar modificações de código interativas, o plugin **PODE** expor uma interface de diff. Isso permite que a CLI solicite que a IDE abra uma visualização de diff, mostrando as alterações propostas em um arquivo. O usuário pode então revisar, editar e, por fim, aceitar ou rejeitar essas alterações diretamente na IDE.

### Ferramenta `openDiff`

O plugin **DEVE** registrar uma ferramenta `openDiff` em seu servidor MCP.

- **Descrição:** Essa ferramenta instrui a IDE a abrir uma visualização de diff editável para um arquivo específico.
- **Requisição (`OpenDiffRequest`):** A ferramenta é invocada por meio de uma requisição `tools/call`. O campo `arguments` dentro do `params` da requisição **DEVE** ser um objeto `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // The absolute path to the file to be diffed.
    filePath: string;
    // The proposed new content for the file.
    newContent: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar imediatamente um `CallToolResult` para confirmar a requisição e informar se a visualização de diff foi aberta com sucesso.
  - Em caso de sucesso: Se a visualização de diff for aberta com sucesso, a resposta **DEVE** conter conteúdo vazio (ou seja, `content: []`).
  - Em caso de falha: Se um erro impedir a abertura da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

  O resultado real do diff (aceitação ou rejeição) é comunicado de forma assíncrona por meio de notificações.

### Ferramenta `closeDiff`

O plugin **DEVE** registrar uma ferramenta `closeDiff` em seu servidor MCP.

- **Descrição:** Essa ferramenta instrui a IDE a fechar uma visualização de diff aberta para um arquivo específico.
- **Requisição (`CloseDiffRequest`):** A ferramenta é invocada por meio de uma requisição `tools/call`. O campo `arguments` dentro do `params` da requisição **DEVE** ser um objeto `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // The absolute path to the file whose diff view should be closed.
    filePath: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar um `CallToolResult`.
  - Em caso de sucesso: Se a visualização de diff for fechada com sucesso, a resposta **DEVE** incluir um único bloco **TextContent** no array de conteúdo contendo o conteúdo final do arquivo antes do fechamento.
  - Em caso de falha: Se um erro impedir o fechamento da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

### Notificação `ide/diffAccepted`

Quando o usuário aceita as alterações em uma visualização de diff (por exemplo, clicando em um botão "Apply" ou "Save"), o plugin **DEVE** enviar uma notificação `ide/diffAccepted` para a CLI.

- **Payload:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo e o conteúdo final do arquivo. O conteúdo pode diferir do `newContent` original se o usuário fez edições manuais na visualização de diff.

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
    // The full content of the file after acceptance.
    content: string;
  }
  ```

### Notificação `ide/diffRejected`

Quando o usuário rejeita as alterações (por exemplo, fechando a visualização de diff sem aceitá-las), o plugin **DEVE** enviar uma notificação `ide/diffRejected` para a CLI.

- **Payload:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo do diff rejeitado.

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
  }
  ```

## IV. A Interface de Ciclo de Vida

O plugin **DEVE** gerenciar seus recursos e o arquivo de descoberta corretamente com base no ciclo de vida da IDE.

- **Na ativação (inicialização da IDE/plugin habilitado):**
  1.  Iniciar o servidor MCP.
  2.  Criar o arquivo de descoberta.
- **Na desativação (encerramento da IDE/plugin desabilitado):**
  1.  Parar o servidor MCP.
  2.  Excluir o arquivo de descoberta.