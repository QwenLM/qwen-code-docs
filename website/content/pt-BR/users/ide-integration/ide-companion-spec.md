# Plugin Companion Qwen Code: Especificação da Interface

> Última Atualização: 15 de setembro de 2025

Este documento define o contrato para construção de um plugin companion que habilite o modo IDE do Qwen Code. Para o VS Code, esses recursos (diff nativo, reconhecimento de contexto) são fornecidos pela extensão oficial ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Esta especificação destina-se a contribuidores que desejam trazer funcionalidades semelhantes para outros editores como IDEs JetBrains, Sublime Text, etc.

## I. A Interface de Comunicação

O Qwen Code e o plugin da IDE se comunicam através de um canal de comunicação local.

### 1. Camada de Transporte: MCP sobre HTTP

O plugin **DEVE** executar um servidor HTTP local que implemente o **Model Context Protocol (MCP)**.

- **Protocolo:** O servidor deve ser um servidor MCP válido. Recomendamos usar um SDK MCP existente para sua linguagem de escolha, se disponível.
- **Endpoint:** O servidor deve expor um único endpoint (por exemplo, `/mcp`) para toda a comunicação MCP.
- **Porta:** O servidor **DEVE** escutar em uma porta atribuída dinamicamente (ou seja, escutar na porta `0`).

### 2. Mecanismo de Descoberta: O Arquivo de Porta

Para que o Qwen Code se conecte, ele precisa descobrir em qual instância do IDE está sendo executado e qual porta seu servidor está usando. O plugin **DEVE** facilitar isso criando um "arquivo de descoberta".

- **Como a CLI Encontra o Arquivo:** A CLI determina o ID do Processo (PID) do IDE em que está sendo executada percorrendo a árvore de processos. Em seguida, procura por um arquivo de descoberta que contenha esse PID em seu nome.
- **Localização do Arquivo:** O arquivo deve ser criado em um diretório específico: `os.tmpdir()/qwen/ide/`. Seu plugin deve criar esse diretório caso ele não exista.
- **Convenção de Nomenclatura do Arquivo:** O nome do arquivo é fundamental e **DEVE** seguir o padrão:
  `qwen-code-ide-server-${PID}-${PORT}.json`
  - `${PID}`: O ID do processo do processo pai do IDE. Seu plugin deve determinar esse PID e incluí-lo no nome do arquivo.
  - `${PORT}`: A porta na qual seu servidor MCP está escutando.
- **Conteúdo do Arquivo e Validação do Workspace:** O arquivo **DEVE** conter um objeto JSON com a seguinte estrutura:

  ```json
  {
    "port": 12345,
    "workspacePath": "/caminho/para/projeto1:/caminho/para/projeto2",
    "authToken": "um-token-muito-secreto",
    "ideInfo": {
      "name": "vscode",
      "displayName": "VS Code"
    }
  }
  ```
  - `port` (número, obrigatório): A porta do servidor MCP.
  - `workspacePath` (string, obrigatório): Uma lista de todos os caminhos raiz dos workspaces abertos, delimitados pelo separador de caminho específico do sistema operacional (`:` para Linux/macOS, `;` para Windows). A CLI usa esse caminho para garantir que está sendo executada na mesma pasta do projeto que está aberta no IDE. Se o diretório de trabalho atual da CLI não for um subdiretório de `workspacePath`, a conexão será rejeitada. Seu plugin **DEVE** fornecer o(s) caminho(s) correto(s) e absoluto(s) para a raiz do(s) workspace(s) aberto(s).
  - `authToken` (string, obrigatório): Um token secreto para proteger a conexão. A CLI incluirá esse token em um cabeçalho `Authorization: Bearer <token>` em todas as requisições.
  - `ideInfo` (objeto, obrigatório): Informações sobre o IDE.
    - `name` (string, obrigatório): Um identificador curto e em letras minúsculas para o IDE (ex.: `vscode`, `jetbrains`).
    - `displayName` (string, obrigatório): Um nome amigável para o usuário do IDE (ex.: `VS Code`, `JetBrains IDE`).

- **Autenticação:** Para proteger a conexão, o plugin **DEVE** gerar um token secreto único e incluí-lo no arquivo de descoberta. A CLI então incluirá esse token no cabeçalho `Authorization` para todas as requisições ao servidor MCP (ex.: `Authorization: Bearer um-token-muito-secreto`). Seu servidor **DEVE** validar esse token em cada requisição e rejeitar qualquer uma que seja não autorizada.
- **Desempate com Variáveis de Ambiente (Recomendado):** Para a experiência mais confiável possível, seu plugin **DEVERIA** tanto criar o arquivo de descoberta quanto definir a variável de ambiente `QWEN_CODE_IDE_SERVER_PORT` no terminal integrado. O arquivo serve como o mecanismo primário de descoberta, mas a variável de ambiente é crucial para desempate. Se um usuário tiver várias janelas do IDE abertas para o mesmo workspace, a CLI usará a variável `QWEN_CODE_IDE_SERVER_PORT` para identificar e conectar ao servidor da janela correta.

## II. A Interface de Contexto

Para permitir a conscientização de contexto, o plugin **PODE** fornecer ao CLI informações em tempo real sobre a atividade do usuário na IDE.

### Notificação `ide/contextUpdate`

O plugin **PODE** enviar uma notificação `ide/contextUpdate` [notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) para a CLI sempre que o contexto do usuário mudar.

- **Eventos de Acionamento:** Esta notificação deve ser enviada (com um debounce recomendado de 50ms) quando:
  - Um arquivo é aberto, fechado ou recebe foco.
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
    // Timestamp Unix da última vez que recebeu foco (para ordenação)
    timestamp: number;
    // Verdadeiro se este é o arquivo atualmente em foco
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

- **Ordenação de Arquivos:** A CLI usa o campo `timestamp` para determinar os arquivos mais recentemente usados. Ela ordena a lista `openFiles` com base nesse valor. Portanto, seu plugin **DEVE** fornecer um timestamp Unix preciso para quando um arquivo foi focado pela última vez.
- **Arquivo Ativo:** A CLI considera apenas o arquivo mais recente (após a ordenação) como o arquivo "ativo". Ela irá ignorar o sinalizador `isActive` em todos os outros arquivos e limpar seus campos `cursor` e `selectedText`. Seu plugin deve focar em definir `isActive: true` e fornecer detalhes do cursor/seleção apenas para o arquivo atualmente em foco.
- **Truncamento:** Para gerenciar limites de tokens, a CLI trunca tanto a lista de arquivos (para 10 arquivos) quanto o `selectedText` (para 16KB).

Embora a CLI lide com o truncamento final, é altamente recomendável que seu plugin também limite a quantidade de contexto que envia.

## III. A Interface de Diff

Para permitir modificações interativas no código, o plugin **PODE** expor uma interface de diff. Isso permite que a CLI solicite que a IDE abra uma visualização de diff, mostrando as alterações propostas em um arquivo. O usuário pode então revisar, editar e, por fim, aceitar ou rejeitar essas alterações diretamente na IDE.

### Ferramenta `openDiff`

O plugin **DEVE** registrar uma ferramenta `openDiff` no seu servidor MCP.

- **Descrição:** Esta ferramenta instrui a IDE a abrir uma visualização de diff modificável para um arquivo específico.
- **Requisição (`OpenDiffRequest`):** A ferramenta é invocada através de uma requisição `tools/call`. O campo `arguments` dentro dos `params` da requisição **DEVE** ser um objeto `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // O caminho absoluto para o arquivo que será comparado.
    filePath: string;
    // O novo conteúdo proposto para o arquivo.
    newContent: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** imediatamente retornar um `CallToolResult` para reconhecer a requisição e informar se a visualização de diff foi aberta com sucesso.
  - Em caso de sucesso: Se a visualização de diff foi aberta com sucesso, a resposta **DEVE** conter conteúdo vazio (ou seja, `content: []`).
  - Em caso de falha: Se um erro impediu a abertura da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

  O resultado real do diff (aceitação ou rejeição) é comunicado de forma assíncrona por meio de notificações.

### Ferramenta `closeDiff`

O plugin **DEVE** registrar uma ferramenta `closeDiff` no seu servidor MCP.

- **Descrição:** Esta ferramenta instrui a IDE a fechar uma visualização de diff aberta para um arquivo específico.
- **Requisição (`CloseDiffRequest`):** A ferramenta é invocada através de uma requisição `tools/call`. O campo `arguments` dentro dos `params` da requisição **DEVE** ser um objeto `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // O caminho absoluto para o arquivo cuja visualização de diff deve ser fechada.
    filePath: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar um `CallToolResult`.
  - Em caso de sucesso: Se a visualização de diff foi fechada com sucesso, a resposta **DEVE** incluir um único bloco **TextContent** no array de conteúdo contendo o conteúdo final do arquivo antes de fechar.
  - Em caso de falha: Se um erro impediu o fechamento da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

### Notificação `ide/diffAccepted`

Quando o usuário aceita as alterações em uma visualização de diff (por exemplo, ao clicar em um botão "Aplicar" ou "Salvar"), o plugin **DEVE** enviar uma notificação `ide/diffAccepted` para a CLI.

- **Payload:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo e o conteúdo final do arquivo. O conteúdo pode ser diferente do `newContent` original caso o usuário tenha feito edições manuais na visualização de diff.

  ```typescript
  {
    // O caminho absoluto para o arquivo que foi comparado.
    filePath: string;
    // O conteúdo completo do arquivo após a aceitação.
    content: string;
  }
  ```

### Notificação `ide/diffRejected`

Quando o usuário rejeita as alterações (por exemplo, ao fechar a visualização de diff sem aceitar), o plugin **DEVE** enviar uma notificação `ide/diffRejected` para a CLI.

- **Payload:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo do diff rejeitado.

  ```typescript
  {
    // O caminho absoluto para o arquivo que foi comparado.
    filePath: string;
  }
  ```

## IV. A Interface do Ciclo de Vida

O plugin **DEVE** gerenciar seus recursos e o arquivo de descoberta corretamente com base no ciclo de vida da IDE.

- **Na Ativação (inicialização da IDE/plugin habilitado):**
  1.  Iniciar o servidor MCP.
  2.  Criar o arquivo de descoberta.
- **Na Desativação (desligamento da IDE/plugin desabilitado):**
  1.  Parar o servidor MCP.
  2.  Excluir o arquivo de descoberta.