# Primeiros Passos com Extensões do Qwen Code

Este guia mostrará como criar sua primeira extensão do Qwen Code. Você aprenderá a configurar uma nova extensão, adicionar uma ferramenta personalizada por meio de um servidor MCP, criar um comando personalizado e fornecer contexto ao modelo com um arquivo `QWEN.md`.

## Pré-requisitos

Antes de começar, certifique-se de ter o Qwen Code instalado e um conhecimento básico de Node.js e TypeScript.

## Etapa 1: Criar uma Nova Extensão

A maneira mais fácil de começar é usando um dos modelos integrados. Usaremos o exemplo `mcp-server` como base.

Execute o seguinte comando para criar um novo diretório chamado `my-first-extension` com os arquivos do modelo:

```bash
qwen extensions new my-first-extension mcp-server
```

Isso criará um novo diretório com a seguinte estrutura:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Etapa 2: Entender os Arquivos da Extensão

Vamos analisar os arquivos principais da sua nova extensão.

### `qwen-extension.json`

Este é o arquivo de manifesto da sua extensão. Ele informa ao Qwen Code como carregar e usar sua extensão.

```json
{
  "name": "my-first-extension",
  "version": "1.0.0",
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["${extensionPath}${/}dist${/}example.js"],
      "cwd": "${extensionPath}"
    }
  }
}
```

- `name`: O nome exclusivo da sua extensão.
- `version`: A versão da sua extensão.
- `mcpServers`: Esta seção define um ou mais servidores do Model Context Protocol (MCP). Os servidores MCP são a maneira de adicionar novas ferramentas para o modelo usar.
  - `command`, `args`, `cwd`: Esses campos especificam como iniciar seu servidor. Observe o uso da variável `${extensionPath}`, que o Qwen Code substitui pelo caminho absoluto do diretório de instalação da sua extensão. Isso permite que sua extensão funcione independentemente de onde esteja instalada.

### `example.ts`

Este arquivo contém o código-fonte do seu servidor MCP. É um servidor Node.js simples que usa o `@modelcontextprotocol/sdk`.

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

// Registers a new tool named 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Fetches a list of posts from a public API.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const apiResponse = await fetch(
      'https://jsonplaceholder.typicode.com/posts',
    );
    const posts = await apiResponse.json();
    const response = { posts: posts.slice(0, 5) };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  },
);

// ... (prompt registration omitted for brevity)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Este servidor define uma única ferramenta chamada `fetch_posts` que busca dados de uma API pública.

### `package.json` e `tsconfig.json`

Estes são arquivos de configuração padrão para um projeto TypeScript. O arquivo `package.json` define as dependências e um script `build`, e o `tsconfig.json` configura o compilador TypeScript.

## Etapa 3: Compilar e Vincular Sua Extensão

Antes de usar a extensão, você precisa compilar o código TypeScript e vincular a extensão à sua instalação do Qwen Code para desenvolvimento local.

1.  **Instalar dependências:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Compilar o servidor:**

    ```bash
    npm run build
    ```

    Isso compilará `example.ts` em `dist/example.js`, que é o arquivo referenciado no seu `qwen-extension.json`.

3.  **Vincular a extensão:**

    O comando `link` cria um link simbólico do diretório de extensões do Qwen Code para seu diretório de desenvolvimento. Isso significa que qualquer alteração feita será refletida imediatamente, sem necessidade de reinstalar.

    ```bash
    qwen extensions link .
    ```

Agora, reinicie sua sessão do Qwen Code. A nova ferramenta `fetch_posts` estará disponível. Você pode testá-la pedindo: "fetch posts".

## Etapa 4: Adicionar um Comando Personalizado

Comandos personalizados oferecem uma maneira de criar atalhos para prompts complexos. Vamos adicionar um comando que busca um padrão no seu código.

1.  Crie um diretório `commands` e um subdiretório para o grupo do seu comando:

    ```bash
    mkdir -p commands/fs
    ```

2.  Crie um arquivo chamado `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    Este comando, `/fs:grep-code`, receberá um argumento, executará o comando de shell `grep` com ele e enviará os resultados para um prompt de sumarização.

> **Nota:** Comandos usam o formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade com versões anteriores.

Após salvar o arquivo, reinicie o Qwen Code. Agora você pode executar `/fs:grep-code "algum padrão"` para usar seu novo comando.

## Etapa 5: Adicionar Skills e Subagentes Personalizados (Opcional)

As extensões também podem fornecer skills e subagentes personalizados para estender os recursos do Qwen Code.

### Adicionar uma Skill Personalizada

Skills são capacidades invocadas pelo modelo que a IA pode usar automaticamente quando relevantes.

1.  Crie um diretório `skills` com um subdiretório para a skill:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Crie um arquivo `skills/code-analyzer/SKILL.md`:

    ```markdown
    ---
    name: code-analyzer
    description: Analyzes code structure and provides insights about complexity, dependencies, and potential improvements
    ---

    # Code Analyzer

    ## Instructions

    When analyzing code, focus on:

    - Code complexity and maintainability
    - Dependencies and coupling
    - Potential performance issues
    - Suggestions for improvements

    ## Examples

    - "Analyze the complexity of this function"
    - "What are the dependencies of this module?"
    ```

### Adicionar um Subagente Personalizado

Subagentes são assistentes de IA especializados em tarefas específicas.

1.  Crie um diretório `agents`:

    ```bash
    mkdir -p agents
    ```

2.  Crie um arquivo `agents/refactoring-expert.md`:

    ```markdown
    ---
    name: refactoring-expert
    description: Specialized in code refactoring, improving code structure and maintainability
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    You are a refactoring specialist focused on improving code quality.

    Your expertise includes:

    - Identifying code smells and anti-patterns
    - Applying SOLID principles
    - Improving code readability and maintainability
    - Safe refactoring with minimal risk

    For each refactoring task:

    1. Analyze the current code structure
    2. Identify areas for improvement
    3. Propose refactoring steps
    4. Implement changes incrementally
    5. Verify functionality is preserved
    ```

Após reiniciar o Qwen Code, suas skills personalizadas estarão disponíveis via `/skills` e os subagentes via `/agents manage`.

## Etapa 6: Adicionar um `QWEN.md` Personalizado

Você pode fornecer contexto persistente ao modelo adicionando um arquivo `QWEN.md` à sua extensão. Isso é útil para dar instruções ao modelo sobre como se comportar ou informações sobre as ferramentas da sua extensão. Observe que você pode nem sempre precisar disso para extensões criadas para expor comandos e prompts.

1.  Crie um arquivo chamado `QWEN.md` na raiz do diretório da sua extensão:

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  Atualize seu `qwen-extension.json` para informar à CLI para carregar este arquivo:

    ```json
    {
      "name": "my-first-extension",
      "version": "1.0.0",
      "contextFileName": "QWEN.md",
      "mcpServers": {
        "nodeServer": {
          "command": "node",
          "args": ["${extensionPath}${/}dist${/}example.js"],
          "cwd": "${extensionPath}"
        }
      }
    }
    ```

Reinicie a CLI novamente. O modelo agora terá o contexto do seu arquivo `QWEN.md` em todas as sessões em que a extensão estiver ativa.

## Etapa 7: Publicar Sua Extensão

Quando estiver satisfeito com sua extensão, você pode compartilhá-la com outras pessoas. As duas principais formas de publicar extensões são por meio de um repositório Git ou via GitHub Releases. Usar um repositório Git público é o método mais simples.

Para instruções detalhadas sobre ambos os métodos, consulte o [Guia de Publicação de Extensões](extension-releasing.md).

## Conclusão

Você criou com sucesso uma extensão do Qwen Code! Você aprendeu a:

- Inicializar uma nova extensão a partir de um modelo.
- Adicionar ferramentas personalizadas com um servidor MCP.
- Criar comandos personalizados práticos.
- Adicionar skills e subagentes personalizados.
- Fornecer contexto persistente ao modelo.
- Vincular sua extensão para desenvolvimento local.

A partir daqui, você pode explorar recursos mais avançados e criar novos recursos poderosos no Qwen Code.