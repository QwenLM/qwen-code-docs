# Qwen Code Companion Plugin: Especificação da Interface

> Última Atualização: 15 de setembro de 2025

Este documento define o contrato para construir um plugin complementar que habilite o modo IDE do Qwen Code. No VS Code, esses recursos (diffing nativo, reconhecimento de contexto) são fornecidos pela extensão oficial ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Esta especificação é destinada a contribuidores que desejam trazer funcionalidades semelhantes para outros editores, como IDEs da JetBrains, Sublime Text, etc.

## I. A Interface de Comunicação

O Qwen Code e o plugin da IDE se comunicam através de um canal de comunicação local.

### 1. Camada de Transporte: MCP sobre HTTP

O plugin **DEVE** executar um servidor HTTP local que implementa o **Model Context Protocol (MCP)**.

- **Protocolo:** O servidor deve ser um servidor MCP válido. Recomendamos usar um SDK MCP existente para sua linguagem de preferência, se disponível.
- **Endpoint:** O servidor deve expor um único endpoint (por exemplo, `/mcp`) para toda a comunicação MCP.
- **Porta:** O servidor **DEVE** escutar em uma porta atribuída dinamicamente (ou seja, escutar na porta `0`).

### 2. Mecanismo de Descoberta: O Arquivo de Porta

Para que o Qwen Code consiga se conectar, ele precisa descobrir em qual instância do IDE está rodando e em qual porta seu servidor está escutando. O plugin **DEVE** facilitar isso criando um "arquivo de descoberta".

- **Como o CLI Encontra o Arquivo:** O CLI determina o Process ID (PID) do IDE em que está rodando percorrendo a árvore de processos. Em seguida, ele procura por um arquivo de descoberta que contenha esse PID no nome.
- **Localização do Arquivo:** O arquivo deve ser criado em um diretório específico: `os.tmpdir()/qwen/ide/`. Seu plugin deve criar esse diretório caso ele não exista.
- **Convenção de Nomenclatura do Arquivo:** O nome do arquivo é crítico e **DEVE** seguir o padrão:
  `qwen-code-ide-server-${PID}-${PORT}.json`
  - `${PID}`: O ID do processo do IDE pai. Seu plugin deve determinar esse PID e incluí-lo no nome do arquivo.
  - `${PORT}`: A porta em que seu servidor MCP está escutando.
- **Conteúdo do Arquivo & Validação do Workspace:** O arquivo **DEVE** conter um objeto JSON com a seguinte estrutura:

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ideInfo": {
      "name": "vscode",
      "displayName": "VS Code"
    }
  }
  ```
  - `port` (número, obrigatório): A porta do servidor MCP.
  - `workspacePath` (string, obrigatório): Uma lista com todos os caminhos raiz dos workspaces abertos, delimitados pelo separador de caminhos específico do sistema operacional (`:` para Linux/macOS, `;` para Windows). O CLI usa esse caminho para garantir que está rodando na mesma pasta do projeto que está aberta no IDE. Se o diretório atual do CLI não for um subdiretório de `workspacePath`, a conexão será rejeitada. Seu plugin **DEVE** fornecer os caminhos absolutos corretos para a raiz dos workspaces abertos.
  - `authToken` (string, obrigatório): Um token secreto para proteger a conexão. O CLI incluirá esse token em um header `Authorization: Bearer <token>` em todas as requisições.
  - `ideInfo` (objeto, obrigatório): Informações sobre o IDE.
    - `name` (string, obrigatório): Um identificador curto e em letras minúsculas para o IDE (ex.: `vscode`, `jetbrains`).
    - `displayName` (string, obrigatório): Um nome amigável para o IDE (ex.: `VS Code`, `JetBrains IDE`).

- **Autenticação:** Para proteger a conexão, o plugin **DEVE** gerar um token secreto único e incluí-lo no arquivo de descoberta. O CLI então incluirá esse token no header `Authorization` para todas as requisições ao servidor MCP (ex.: `Authorization: Bearer a-very-secret-token`). Seu servidor **DEVE** validar esse token em cada requisição e rejeitar qualquer uma que não seja autorizada.
- **Resolução de Conflitos com Variáveis de Ambiente (Recomendado):** Para uma experiência mais confiável, seu plugin **DEVERIA** tanto criar o arquivo de descoberta quanto definir a variável de ambiente `QWEN_CODE_IDE_SERVER_PORT` no terminal integrado. O arquivo serve como o mecanismo primário de descoberta, mas a variável de ambiente é crucial para resolver empates. Se o usuário tiver várias janelas do IDE abertas para o mesmo workspace, o CLI usa a variável `QWEN_CODE_IDE_SERVER_PORT` para identificar e conectar ao servidor da janela correta.

## II. A Interface de Contexto

Para habilitar a consciência de contexto, o plugin **PODE** fornecer ao CLI informações em tempo real sobre a atividade do usuário na IDE.

### Notificação `ide/contextUpdate`

O plugin **PODE** enviar uma notificação `ide/contextUpdate` para o CLI sempre que o contexto do usuário mudar.

- **Eventos de disparo:** Essa notificação deve ser enviada (com um debounce recomendado de 50ms) quando:
  - Um arquivo é aberto, fechado ou recebe foco.
  - A posição do cursor ou a seleção de texto do usuário muda no arquivo ativo.
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
      // Número da linha (base 1)
      line: number;
      // Número do caractere (base 1)
      character: number;
    };
    // O texto atualmente selecionado pelo usuário
    selectedText?: string;
  }
  ```

  **Nota:** A lista `openFiles` deve incluir apenas arquivos que existem no disco. Arquivos virtuais (ex.: arquivos não salvos sem caminho, páginas de configurações do editor) **DEVEM** ser excluídos.

### Como o CLI Usa Esse Contexto

Após receber o objeto `IdeContext`, o CLI executa várias etapas de normalização e truncamento antes de enviar as informações para o modelo.

- **Ordenação de Arquivos:** O CLI usa o campo `timestamp` para determinar quais arquivos foram usados mais recentemente. Ele ordena a lista `openFiles` com base nesse valor. Portanto, seu plugin **PRECISA** fornecer um timestamp Unix preciso referente ao momento em que o arquivo foi focado pela última vez.
- **Arquivo Ativo:** O CLI considera apenas o arquivo mais recente (após a ordenação) como o arquivo "ativo". Ele ignorará o sinalizador `isActive` nos demais arquivos e limpará seus campos `cursor` e `selectedText`. Seu plugin deve focar em definir `isActive: true` e fornecer detalhes de cursor/seleção apenas para o arquivo atualmente em foco.
- **Truncamento:** Para gerenciar os limites de tokens, o CLI trunca tanto a lista de arquivos (para 10 arquivos) quanto o `selectedText` (para 16KB).

Embora o CLI faça o truncamento final, é altamente recomendável que seu plugin também limite a quantidade de contexto enviado.

## III. A Interface de Diffing

Para permitir modificações interativas no código, o plugin **PODE** expor uma interface de diffing. Isso permite que o CLI solicite que o IDE abra uma visualização de diff, mostrando as alterações propostas em um arquivo. O usuário pode então revisar, editar e, por fim, aceitar ou rejeitar essas alterações diretamente dentro do IDE.

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

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** imediatamente retornar um `CallToolResult` para confirmar o recebimento da requisição e informar se a visualização de diff foi aberta com sucesso.
  - Em caso de sucesso: Se a visualização de diff foi aberta com sucesso, a resposta **DEVE** conter conteúdo vazio (ou seja, `content: []`).
  - Em caso de falha: Se um erro impediu a abertura da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

  O resultado real do diff (aceitação ou rejeição) é comunicado de forma assíncrona por meio de notificações.

### Ferramenta `closeDiff`

O plugin **DEVE** registrar uma ferramenta `closeDiff` no seu servidor MCP.

- **Descrição:** Esta ferramenta instrui a IDE a fechar uma visualização de diff aberta para um arquivo específico.
- **Requisição (`CloseDiffRequest`):** A ferramenta é invocada através de uma requisição `tools/call`. O campo `arguments` dentro dos `params` da requisição **DEVE** ser um objeto do tipo `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // O caminho absoluto para o arquivo cuja visualização de diff deve ser fechada.
    filePath: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar um `CallToolResult`.
  - Em caso de sucesso: Se a visualização de diff foi fechada com sucesso, a resposta **DEVE** incluir um único bloco **TextContent** no array `content` contendo o conteúdo final do arquivo antes de fechar.
  - Em caso de falha: Se um erro impediu o fechamento da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

### Notificação `ide/diffAccepted`

Quando o usuário aceita as alterações em uma visualização de diff (por exemplo, clicando em um botão "Apply" ou "Save"), o plugin **DEVE** enviar uma notificação `ide/diffAccepted` para o CLI.

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

Quando o usuário rejeita as alterações (por exemplo, fechando a visualização de diff sem aceitar), o plugin **DEVE** enviar uma notificação `ide/diffRejected` para o CLI.

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
- **Na Desativação (desligamento da IDE/plugin desabilitado):**
  1.  Parar o servidor MCP.
  2.  Excluir o arquivo de descoberta.