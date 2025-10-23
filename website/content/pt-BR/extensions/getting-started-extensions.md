# Primeiros Passos com Extensões do Qwen Code

Este guia vai te ajudar a criar sua primeira extensão para o Qwen Code. Você vai aprender como configurar uma nova extensão, adicionar uma ferramenta customizada via um servidor MCP, criar um comando personalizado e fornecer contexto ao modelo com um arquivo `QWEN.md`.

## Pré-requisitos

Antes de começar, certifique-se de ter o Qwen Code instalado e de possuir um conhecimento básico de Node.js e TypeScript.

## Passo 1: Criar uma Nova Extensão

A forma mais fácil de começar é usando um dos templates embutidos. Vamos usar o exemplo `mcp-server` como base.

Execute o seguinte comando para criar um novo diretório chamado `my-first-extension` com os arquivos do template:

```bash
qwen extensions new my-first-extension mcp-server
```

Isso vai criar um novo diretório com a seguinte estrutura:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Passo 2: Entenda os Arquivos da Extensão

Vamos dar uma olhada nos arquivos principais da sua nova extensão.

### `qwen-extension.json`

Este é o arquivo de manifesto da sua extensão. Ele informa ao Qwen Code como carregar e usar a sua extensão.

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

- `name`: O nome único da sua extensão.
- `version`: A versão da sua extensão.
- `mcpServers`: Esta seção define um ou mais servidores Model Context Protocol (MCP). Servidores MCP são a forma como você pode adicionar novas ferramentas para o modelo utilizar.
  - `command`, `args`, `cwd`: Esses campos especificam como iniciar o seu servidor. Note o uso da variável `${extensionPath}`, que o Qwen Code substitui pelo caminho absoluto do diretório de instalação da sua extensão. Isso permite que sua extensão funcione independentemente do local onde foi instalada.

### `example.ts`

Este arquivo contém o código-fonte do seu servidor MCP. É um servidor simples em Node.js que utiliza o `@modelcontextprotocol/sdk`.

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

// Registra uma nova tool chamada 'fetch_posts'
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

// ... (registro de prompt omitido para brevidade)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Esse servidor define uma única tool chamada `fetch_posts`, que busca dados de uma API pública.

### `package.json` e `tsconfig.json`

Esses são arquivos de configuração padrão para um projeto TypeScript. O arquivo `package.json` define as dependências e um script `build`, e o `tsconfig.json` configura o compilador TypeScript.

## Passo 3: Compile e Vincule sua Extensão

Antes de usar a extensão, você precisa compilar o código TypeScript e vincular a extensão à sua instalação do Qwen Code para desenvolvimento local.

1.  **Instale as dependências:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Compile o servidor:**

    ```bash
    npm run build
    ```

    Isso vai compilar `example.ts` para `dist/example.js`, que é o arquivo referenciado no seu `qwen-extension.json`.

3.  **Vincule a extensão:**

    O comando `link` cria um link simbólico do diretório de extensões do Qwen Code para o seu diretório de desenvolvimento. Isso significa que qualquer alteração será refletida imediatamente sem precisar reinstalar.

    ```bash
    qwen extensions link .
    ```

Agora, reinicie sua sessão do Qwen Code. A nova ferramenta `fetch_posts` estará disponível. Você pode testá-la perguntando: "fetch posts".

## Passo 4: Adicione um Comando Customizado

Comandos customizados são uma forma de criar atalhos para prompts complexos. Vamos adicionar um comando que busca por um padrão no seu código.

1. Crie um diretório `commands` e um subdiretório para o grupo do seu comando:

   ```bash
   mkdir -p commands/fs
   ```

2. Crie um arquivo chamado `commands/fs/grep-code.toml`:

   ```toml
   prompt = """
   Please summarize the findings for the pattern `{{args}}`.

   Search Results:
   !{grep -r {{args}} .}
   """
   ```

   Esse comando, `/fs:grep-code`, vai receber um argumento, executar o comando shell `grep` com ele e passar os resultados para um prompt que fará um resumo.

Após salvar o arquivo, reinicie o Qwen Code. Agora você pode executar `/fs:grep-code "algum padrão"` para usar seu novo comando.

## Passo 5: Adicione um `QWEN.md` customizado

Você pode fornecer contexto persistente para o modelo adicionando um arquivo `QWEN.md` à sua extensão. Isso é útil para dar instruções ao modelo sobre como se comportar ou informações sobre as ferramentas da sua extensão. Note que nem sempre será necessário usar isso em extensões criadas apenas para expor comandos e prompts.

1. Crie um arquivo chamado `QWEN.md` na raiz do diretório da sua extensão:

   ```markdown
   # Instruções da Minha Primeira Extensão

   Você é um assistente desenvolvedor especialista. Quando o usuário pedir para buscar posts, use a ferramenta `fetch_posts`. Seja conciso nas suas respostas.
   ```

2. Atualize seu `qwen-extension.json` para informar ao CLI que ele deve carregar este arquivo:

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

Reinicie o CLI novamente. O modelo agora terá o contexto do seu arquivo `QWEN.md` em todas as sessões onde a extensão estiver ativa.

## Passo 6: Publicando sua Extensão

Quando estiver satisfeito com sua extensão, você pode compartilhá-la com outras pessoas. As duas formas principais de publicar extensões são por meio de um repositório Git ou através do GitHub Releases. Usar um repositório Git público é o método mais simples.

Para instruções detalhadas sobre ambos os métodos, consulte o [Guia de Publicação de Extensões](extension-releasing.md).

## Conclusão

Você criou com sucesso uma extensão para o Qwen Code! Você aprendeu como:

- Iniciar uma nova extensão a partir de um template.
- Adicionar ferramentas personalizadas com um servidor MCP.
- Criar comandos personalizados convenientes.
- Fornecer contexto persistente para o modelo.
- Vincular sua extensão para desenvolvimento local.

A partir daqui, você pode explorar recursos mais avançados e construir novas funcionalidades poderosas no Qwen Code.