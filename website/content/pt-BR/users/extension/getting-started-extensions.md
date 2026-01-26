# Primeiros Passos com Extensões Qwen Code

Este guia irá acompanhá-lo na criação da sua primeira extensão Qwen Code. Você aprenderá como configurar uma nova extensão, adicionar uma ferramenta personalizada através de um servidor MCP, criar um comando personalizado e fornecer contexto ao modelo com um arquivo `QWEN.md`.

## Pré-requisitos

Antes de começar, certifique-se de ter o Qwen Code instalado e um conhecimento básico de Node.js e TypeScript.

## Etapa 1: Criar uma Nova Extensão

A maneira mais fácil de começar é usando um dos modelos integrados. Usaremos o exemplo `mcp-server` como nossa base.

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

## Passo 2: Compreender os Arquivos da Extensão

Vamos analisar os arquivos principais em sua nova extensão.

### `qwen-extension.json`

Este é o arquivo de manifesto para sua extensão. Ele informa ao Qwen Code como carregar e usar sua extensão.

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

- `name`: O nome exclusivo para sua extensão.
- `version`: A versão da sua extensão.
- `mcpServers`: Esta seção define um ou mais servidores Model Context Protocol (MCP). Servidores MCP são como você pode adicionar novas ferramentas para que o modelo utilize.
  - `command`, `args`, `cwd`: Esses campos especificam como iniciar seu servidor. Observe o uso da variável `${extensionPath}`, que o Qwen Code substitui pelo caminho absoluto para o diretório de instalação da sua extensão. Isso permite que sua extensão funcione independentemente de onde esteja instalada.

### `example.ts`

Este arquivo contém o código-fonte para seu servidor MCP. É um servidor Node.js simples que utiliza o `@modelcontextprotocol/sdk`.

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

// Registra uma nova ferramenta chamada 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Busca uma lista de posts de uma API pública.',
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

// ... (registro de prompt omitido por concisão)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Este servidor define uma única ferramenta chamada `fetch_posts` que busca dados de uma API pública.

### `package.json` e `tsconfig.json`

Esses são arquivos de configuração padrão para um projeto TypeScript. O arquivo `package.json` define dependências e um script de `build`, e o `tsconfig.json` configura o compilador TypeScript.

## Passo 3: Compilar e Vincular sua Extensão

Antes de poder usar a extensão, você precisa compilar o código TypeScript e vincular a extensão à sua instalação do Qwen Code para desenvolvimento local.

1.  **Instale as dependências:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Compile o servidor:**

    ```bash
    npm run build
    ```

    Isso irá compilar `example.ts` em `dist/example.js`, que é o arquivo referenciado no seu `qwen-extension.json`.

3.  **Vincule a extensão:**

    O comando `link` cria um link simbólico do diretório de extensões do Qwen Code para o seu diretório de desenvolvimento. Isso significa que quaisquer alterações que você fizer serão refletidas imediatamente, sem necessidade de reinstalar.

    ```bash
    qwen extensions link .
    ```

Agora, reinicie sua sessão do Qwen Code. A nova ferramenta `fetch_posts` estará disponível. Você pode testá-la fazendo a pergunta: "fetch posts".

## Passo 4: Adicionar um Comando Personalizado

Comandos personalizados oferecem uma maneira de criar atalhos para prompts complexos. Vamos adicionar um comando que busca por um padrão em seu código.

1.  Crie um diretório `commands` e um subdiretório para o seu grupo de comandos:

    ```bash
    mkdir -p commands/fs
    ```

2.  Crie um arquivo chamado `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Busca por um padrão no código e resume os resultados
    ---

    Por favor, resuma os resultados para o padrão `{{args}}`.

    Resultados da Busca:
    !{grep -r {{args}} .}
    ```

    Este comando, `/fs:grep-code`, receberá um argumento, executará o comando shell `grep` com ele e encaminhará os resultados para um prompt de resumo.

> **Observação:** Comandos utilizam formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade com versões anteriores.

Após salvar o arquivo, reinicie o Qwen Code. Agora você pode executar `/fs:grep-code "algum padrão"` para usar seu novo comando.

## Passo 5: Adicionar Habilidades e Subagentes Personalizados (Opcional)

Extensões também podem fornecer habilidades e subagentes personalizados para estender as capacidades do Qwen Code.

### Adicionando uma Habilidade Personalizada

Habilidades são capacidades invocadas pelo modelo que a IA pode usar automaticamente quando relevantes.

1.  Crie um diretório `skills` com um subdiretório para a habilidade:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Crie um arquivo `skills/code-analyzer/SKILL.md`:

    ```markdown
    ---
    name: code-analyzer
    description: Analisa a estrutura do código e fornece insights sobre complexidade, dependências e possíveis melhorias
    ---

    # Analisador de Código

    ## Instruções

    Ao analisar o código, concentre-se em:

    - Complexidade e manutenibilidade do código
    - Dependências e acoplamento
    - Possíveis problemas de desempenho
    - Sugestões para melhorias

    ## Exemplos

    - "Analise a complexidade desta função"
    - "Quais são as dependências deste módulo?"
    ```

### Adicionando um Subagente Personalizado

Subagentes são assistentes de IA especializados para tarefas específicas.

1.  Crie um diretório `agents`:

    ```bash
    mkdir -p agents
    ```

2.  Crie um arquivo `agents/refactoring-expert.md`:

    ```markdown
    ---
    name: refactoring-expert
    description: Especializado em refatoração de código, melhorando a estrutura e manutenibilidade do código
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Você é um especialista em refatoração focado na melhoria da qualidade do código.

    Sua especialidade inclui:

    - Identificação de code smells e anti-padrões
    - Aplicação dos princípios SOLID
    - Melhoria da legibilidade e manutenibilidade do código
    - Refatoração segura com risco mínimo

    Para cada tarefa de refatoração:

    1. Analise a estrutura atual do código
    2. Identifique áreas para melhoria
    3. Proponha etapas de refatoração
    4. Implemente as alterações de forma incremental
    5. Verifique se a funcionalidade foi preservada
    ```

Após reiniciar o Qwen Code, suas habilidades personalizadas estarão disponíveis através de `/skills` e os subagentes através de `/agents manage`.

## Passo 6: Adicione um `QWEN.md` personalizado

Você pode fornecer contexto persistente ao modelo adicionando um arquivo `QWEN.md` à sua extensão. Isso é útil para dar ao modelo instruções sobre como se comportar ou informações sobre as ferramentas da sua extensão. Observe que nem sempre será necessário usar isso em extensões criadas apenas para expor comandos e prompts.

1. Crie um arquivo chamado `QWEN.md` na raiz do diretório da sua extensão:

   ```markdown
   # Instruções da Minha Primeira Extensão

   Você é um assistente de desenvolvedor especialista. Quando o usuário pedir para buscar posts, utilize a ferramenta `fetch_posts`. Seja conciso em suas respostas.
   ```

2. Atualize seu `qwen-extension.json` para informar à CLI que deve carregar este arquivo:

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

Reinicie novamente a CLI. O modelo agora terá acesso ao contexto do seu arquivo `QWEN.md` em todas as sessões em que a extensão estiver ativa.

## Etapa 7: Publicando sua Extensão

Quando você estiver satisfeito com sua extensão, poderá compartilhá-la com outras pessoas. As duas formas principais de publicar extensões são através de um repositório Git ou por meio do GitHub Releases. O uso de um repositório Git público é o método mais simples.

Para obter instruções detalhadas sobre ambos os métodos, consulte o [Guia de Publicação de Extensões](extension-releasing.md).

## Conclusão

Você criou com sucesso uma extensão para o Qwen Code! Você aprendeu como:

- Iniciar uma nova extensão a partir de um modelo.
- Adicionar ferramentas personalizadas com um servidor MCP.
- Criar comandos personalizados convenientes.
- Adicionar habilidades e subagentes personalizados.
- Fornecer contexto persistente ao modelo.
- Associar sua extensão para desenvolvimento local.

A partir daqui, você pode explorar recursos mais avançados e construir novas capacidades poderosas no Qwen Code.