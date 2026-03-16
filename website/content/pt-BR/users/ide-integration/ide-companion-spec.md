# Plugin do Qwen Code Companion: Especificação de Interface

> Última atualização: 15 de setembro de 2025

Este documento define o contrato para a construção de um plugin companion que habilite o modo IDE do Qwen Code. No VS Code, esses recursos (diferenciação nativa, consciência de contexto) são fornecidos pela extensão oficial ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Esta especificação destina-se a colaboradores que desejam trazer funcionalidades semelhantes a outros editores, como as IDEs da JetBrains, Sublime Text, etc.

## I. Interface de Comunicação

O Qwen Code e o plugin da IDE se comunicam por meio de um canal de comunicação local.

### 1. Camada de Transporte: MCP sobre HTTP

O plug-in **DEVE** executar um servidor HTTP local que implemente o **Model Context Protocol (MCP)**.

- **Protocolo:** O servidor deve ser um servidor MCP válido. Recomendamos usar um SDK MCP existente para a linguagem de sua escolha, se disponível.
- **Endpoint:** O servidor deve expor um único endpoint (por exemplo, `/mcp`) para toda a comunicação MCP.
- **Porta:** O servidor **DEVE** escutar em uma porta atribuída dinamicamente (ou seja, escutar na porta `0`).

### 2. Mecanismo de Descoberta: O Arquivo de Bloqueio

Para que o Qwen Code se conecte, ele precisa descobrir em qual porta seu servidor está sendo executado. O plugin **DEVE** facilitar essa descoberta criando um "arquivo de bloqueio" e definindo a variável de ambiente da porta.

- **Como a CLI localiza o arquivo:** A CLI lê a porta da variável `QWEN_CODE_IDE_SERVER_PORT` e, em seguida, lê o arquivo `~/.qwen/ide/<PORT>.lock`. (Existem alternativas legadas para extensões mais antigas; veja a nota abaixo.)
- **Localização do arquivo:** O arquivo deve ser criado em um diretório específico: `~/.qwen/ide/`. Seu plugin deve criar esse diretório caso ele ainda não exista.
- **Convenção de nomenclatura do arquivo:** O nome do arquivo é crítico e **DEVE** seguir o padrão:
  `<PORT>.lock`
  - `<PORT>`: A porta na qual seu servidor MCP está escutando.
- **Conteúdo do arquivo e validação do workspace:** O arquivo **DEVE** conter um objeto JSON com a seguinte estrutura:

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
  - `workspacePath` (string, obrigatório): Uma lista de todos os caminhos raiz dos workspaces abertos, separados pelo delimitador de caminho específico do sistema operacional (`:` no Linux/macOS, `;` no Windows). A CLI usa esse caminho para garantir que está sendo executada na mesma pasta de projeto que está aberta no IDE. Se o diretório de trabalho atual da CLI não for um subdiretório de `workspacePath`, a conexão será rejeitada. Seu plugin **DEVE** fornecer o(s) caminho(s) absoluto(s) correto(s) para a raiz do(s) workspace(s) aberto(s).
  - `authToken` (string, obrigatório): Um token secreto para proteger a conexão. A CLI incluirá esse token no cabeçalho `Authorization: Bearer <token>` em todas as requisições.
  - `ppid` (número, obrigatório): O ID do processo pai do processo do IDE.
  - `ideName` (string, obrigatório): Um nome amigável para o IDE (por exemplo, `VS Code`, `JetBrains IDE`).

- **Autenticação:** Para proteger a conexão, o plugin **DEVE** gerar um token único e secreto e incluí-lo no arquivo de descoberta. A CLI, então, incluirá esse token no cabeçalho `Authorization` para todas as requisições ao servidor MCP (por exemplo, `Authorization: Bearer um-token-muito-secreto`). Seu servidor **DEVE** validar esse token em cada requisição e rejeitar qualquer requisição não autorizada.
- **Variáveis de ambiente (obrigatórias):** Seu plugin **DEVE** definir `QWEN_CODE_IDE_SERVER_PORT` no terminal integrado para que a CLI consiga localizar o arquivo `<PORT>.lock` correto.

**Nota sobre versões legadas:** Para extensões anteriores à versão 0.5.1, o Qwen Code pode recorrer à leitura de arquivos JSON no diretório temporário do sistema com os nomes `qwen-code-ide-server-<PID>.json` ou `qwen-code-ide-server-<PORT>.json`. Novas integrações não devem depender desses arquivos legados.

## II. A Interface de Contexto

Para habilitar a consciência de contexto, o plugin **PODE** fornecer à CLI informações em tempo real sobre a atividade do usuário no IDE.

### Notificação `ide/contextUpdate`

O plugin **PODE** enviar uma notificação `ide/contextUpdate` ([notificação](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)) para a CLI sempre que o contexto do usuário for alterado.

- **Eventos acionadores:** Essa notificação deve ser enviada (com um *debounce* recomendado de 50 ms) quando:
  - Um arquivo for aberto, fechado ou receber foco.
  - A posição do cursor ou a seleção de texto do usuário mudar no arquivo ativo.
- **Carga útil (`IdeContext`):** Os parâmetros da notificação **DEVEM** ser um objeto `IdeContext`:

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
    // Último carimbo de tempo Unix em que o arquivo recebeu foco (para ordenação)
    timestamp: number;
    // Verdadeiro se este for o arquivo atualmente em foco
    isActive?: boolean;
    cursor?: {
      // Número da linha (baseado em 1)
      line: number;
      // Número do caractere (baseado em 1)
      character: number;
    };
    // Texto atualmente selecionado pelo usuário
    selectedText?: string;
  }
  ```

  **Observação:** A lista `openFiles` deve incluir apenas arquivos que existem no disco. Arquivos virtuais (por exemplo, arquivos não salvos sem caminho ou páginas de configurações do editor) **DEVEM** ser excluídos.

### Como a CLI usa esse contexto

Após receber o objeto `IdeContext`, a CLI executa várias etapas de normalização e truncamento antes de enviar as informações ao modelo.

- **Ordenação de arquivos:** A CLI usa o campo `timestamp` para determinar os arquivos mais recentemente utilizados. Ela ordena a lista `openFiles` com base nesse valor. Portanto, seu plugin **DEVE** fornecer um carimbo de data/hora Unix preciso do momento em que um arquivo foi focado pela última vez.
- **Arquivo ativo:** A CLI considera apenas o arquivo mais recente (após a ordenação) como o arquivo "ativo". Ela ignorará a flag `isActive` em todos os demais arquivos e limpará os campos `cursor` e `selectedText` desses arquivos. Seu plugin deve se concentrar em definir `isActive: true` e fornecer detalhes de cursor/seleção apenas para o arquivo atualmente focado.
- **Truncamento:** Para gerenciar os limites de tokens, a CLI trunca tanto a lista de arquivos (para 10 arquivos) quanto o `selectedText` (para 16 KB).

Embora a CLI realize o truncamento final, recomenda-se fortemente que seu plugin também limite a quantidade de contexto que envia.

## III. A Interface de Diferenciação

Para permitir modificações interativas de código, o plugin **PODE** expor uma interface de diferenciação. Isso permite que a CLI solicite que a IDE abra uma visualização de diferenças (diff), mostrando as alterações propostas em um arquivo. O usuário pode então revisar, editar e, por fim, aceitar ou rejeitar essas alterações diretamente dentro da IDE.

### Ferramenta `openDiff`

O plugin **DEVE** registrar uma ferramenta `openDiff` em seu servidor MCP.

- **Descrição:** Esta ferramenta instrui a IDE a abrir uma visualização de diff editável para um arquivo específico.
- **Solicitação (`OpenDiffRequest`):** A ferramenta é invocada por meio de uma solicitação `tools/call`. O campo `arguments` dentro de `params` da solicitação **DEVE** ser um objeto `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // O caminho absoluto para o arquivo que será comparado.
    filePath: string;
    // O novo conteúdo proposto para o arquivo.
    newContent: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar imediatamente um `CallToolResult` para confirmar a solicitação e informar se a visualização de diff foi aberta com sucesso.
  - Em caso de sucesso: Se a visualização de diff foi aberta com sucesso, a resposta **DEVE** conter conteúdo vazio (ou seja, `content: []`).
  - Em caso de falha: Se um erro impediu a abertura da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

  O resultado real do diff (aceitação ou rejeição) é comunicado de forma assíncrona por meio de notificações.

### Ferramenta `closeDiff`

O plugin **DEVE** registrar uma ferramenta `closeDiff` em seu servidor MCP.

- **Descrição:** Esta ferramenta instrui a IDE a fechar uma visualização de diff aberta para um arquivo específico.
- **Solicitação (`CloseDiffRequest`):** A ferramenta é invocada por meio de uma solicitação `tools/call`. O campo `arguments` dentro de `params` da solicitação **DEVE** ser um objeto `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // O caminho absoluto para o arquivo cuja visualização de diff deve ser fechada.
    filePath: string;
  }
  ```

- **Resposta (`CallToolResult`):** A ferramenta **DEVE** retornar um `CallToolResult`.
  - Em caso de sucesso: Se a visualização de diff foi fechada com sucesso, a resposta **DEVE** incluir um único bloco **TextContent** no array `content`, contendo o conteúdo final do arquivo antes do fechamento.
  - Em caso de falha: Se um erro impediu o fechamento da visualização de diff, a resposta **DEVE** ter `isError: true` e incluir um bloco `TextContent` no array `content` descrevendo o erro.

### Notificação `ide/diffAccepted`

Quando o usuário aceita as alterações em uma visualização de diff (por exemplo, clicando em um botão "Aplicar" ou "Salvar"), o plugin **DEVE** enviar uma notificação `ide/diffAccepted` para a CLI.

- **Carga útil:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo e o conteúdo final do arquivo. O conteúdo pode diferir do `newContent` original se o usuário tiver feito edições manuais na visualização de diff.

  ```typescript
  {
    // O caminho absoluto para o arquivo que foi comparado com diff.
    filePath: string;
    // O conteúdo completo do arquivo após a aceitação.
    content: string;
  }
  ```

### Notificação `ide/diffRejected`

Quando o usuário rejeita as alterações (por exemplo, fechando a visualização de diff sem aceitá-las), o plugin **DEVE** enviar uma notificação `ide/diffRejected` para a CLI.

- **Carga útil:** Os parâmetros da notificação **DEVEM** incluir o caminho do arquivo da comparação com diff que foi rejeitada.

  ```typescript
  {
    // O caminho absoluto para o arquivo que foi comparado com diff.
    filePath: string;
  }
  ```

## IV. A Interface de Ciclo de Vida

O plugin **DEVE** gerenciar corretamente seus recursos e o arquivo de descoberta com base no ciclo de vida da IDE.

- **Na Ativação (inicialização da IDE ou ativação do plugin):**
  1.  Iniciar o servidor MCP.
  2.  Criar o arquivo de descoberta.
- **Na Desativação (desligamento da IDE ou desativação do plugin):**
  1.  Parar o servidor MCP.
  2.  Excluir o arquivo de descoberta.