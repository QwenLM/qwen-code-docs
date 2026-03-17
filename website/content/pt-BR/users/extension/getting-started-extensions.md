# Começando com as Extensões do Qwen Code

Este guia orientará você na criação da sua primeira extensão do Qwen Code. Você aprenderá como configurar uma nova extensão, adicionar uma ferramenta personalizada por meio de um servidor MCP, criar um comando personalizado e fornecer contexto ao modelo com um arquivo `QWEN.md`.

## Pré-requisitos

Antes de começar, certifique-se de que o Qwen Code está instalado e de que você possui conhecimentos básicos de Node.js e TypeScript.

## Etapa 1: Criar uma Nova Extensão

A maneira mais fácil de começar é usando um dos modelos embutidos. Usaremos o exemplo `mcp-server` como base.

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

## Etapa 2: Entenda os arquivos da extensão

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
- `mcpServers`: Esta seção define um ou mais servidores do Model Context Protocol (MCP). Servidores MCP são a forma de adicionar novas ferramentas que o modelo pode utilizar.
  - `command`, `args`, `cwd`: Esses campos especificam como iniciar seu servidor. Observe o uso da variável `${extensionPath}`, que o Qwen Code substitui pelo caminho absoluto até o diretório de instalação da sua extensão. Isso permite que sua extensão funcione independentemente de onde for instalada.

### `example.ts`

Este arquivo contém o código-fonte do seu servidor MCP. Trata-se de um servidor Node.js simples que utiliza o `@modelcontextprotocol/sdk`.

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

// ... (registro de prompts omitido por brevidade)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Esse servidor define uma única ferramenta chamada `fetch_posts`, que busca dados de uma API pública.

### `package.json` e `tsconfig.json`

Esses são arquivos de configuração padrão para um projeto TypeScript. O arquivo `package.json` define as dependências e um script `build`, enquanto o `tsconfig.json` configura o compilador TypeScript.

## Etapa 3: Compile e vincule sua extensão

Antes de usar a extensão, você precisa compilar o código TypeScript e vinculá-la à sua instalação do Qwen Code para desenvolvimento local.

1.  **Instale as dependências:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Compile o servidor:**

    ```bash
    npm run build
    ```

    Isso compilará `example.ts` em `dist/example.js`, que é o arquivo referenciado no seu `qwen-extension.json`.

3.  **Vincule a extensão:**

    O comando `link` cria um link simbólico do diretório de extensões do Qwen Code até seu diretório de desenvolvimento. Isso significa que quaisquer alterações feitas serão refletidas imediatamente, sem necessidade de reinstalar.

    ```bash
    qwen extensions link .
    ```

Agora, reinicie sua sessão do Qwen Code. A nova ferramenta `fetch_posts` estará disponível. Você pode testá-la perguntando: “buscar posts”.

## Etapa 4: Adicionar um Comando Personalizado

Comandos personalizados oferecem uma maneira de criar atalhos para prompts complexos. Vamos adicionar um comando que procure um padrão no seu código.

1.  Crie um diretório `commands` e um subdiretório para o seu grupo de comandos:

    ```bash
    mkdir -p commands/fs
    ```

2.  Crie um arquivo chamado `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Procurar um padrão no código e resumir os resultados
    ---

    Por favor, resuma os resultados da busca pelo padrão `{{args}}`.

    Resultados da busca:
    !{grep -r {{args}} .}
    ```

    Esse comando, `/fs:grep-code`, receberá um argumento, executará o comando de shell `grep` com ele e redirecionará os resultados para um prompt de resumo.

> **Observação:** Comandos usam o formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade com versões anteriores.

Após salvar o arquivo, reinicie o Qwen Code. Agora você pode executar `/fs:grep-code "algum padrão"` para usar seu novo comando.

## Etapa 5: Adicionar Habilidades e Subagentes Personalizados (Opcional)

Extensões também podem fornecer habilidades e subagentes personalizados para ampliar as capacidades do Qwen Code.

### Adicionar uma Habilidade Personalizada

Habilidades são funcionalidades invocadas pelo modelo que a IA pode usar automaticamente quando relevantes.

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
    - Sugestões de melhorias

    ## Exemplos

    - "Analise a complexidade desta função"
    - "Quais são as dependências deste módulo?"
    ```

### Adicionando um Subagente Personalizado

Subagentes são assistentes de IA especializados em tarefas específicas.

1.  Crie um diretório `agents`:

    ```bash
    mkdir -p agents
    ```

2.  Crie um arquivo `agents/refactoring-expert.md`:

    ```markdown
    ---
    name: refactoring-expert
    description: Especializado em refatoração de código, melhorando a estrutura e a manutenibilidade do código
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Você é um especialista em refatoração focado na melhoria da qualidade do código.

    Sua especialidade inclui:

    - Identificar cheiros de código e anti-padrões
    - Aplicar os princípios SOLID
    - Melhorar a legibilidade e a manutenibilidade do código
    - Realizar refatorações seguras com risco mínimo

    Para cada tarefa de refatoração:

    1. Analise a estrutura atual do código
    2. Identifique áreas que precisam de melhoria
    3. Proponha etapas de refatoração
    4. Implemente as alterações de forma incremental
    5. Verifique se a funcionalidade foi preservada
    ```

Após reiniciar o Qwen Code, suas habilidades personalizadas estarão disponíveis via `/skills` e os subagentes via `/agents manage`.

## Etapa 6: Adicionar um arquivo `QWEN.md` personalizado

Você pode fornecer contexto persistente ao modelo adicionando um arquivo `QWEN.md` à sua extensão. Isso é útil para fornecer instruções ao modelo sobre como se comportar ou informações sobre as ferramentas da sua extensão. Observe que você nem sempre precisará disso em extensões criadas para expor comandos e prompts.

1.  Crie um arquivo chamado `QWEN.md` na raiz do diretório da sua extensão:

    ```markdown
    # Instruções da Minha Primeira Extensão

    Você é um assistente especializado em desenvolvimento. Quando o usuário solicitar a busca de posts, use a ferramenta `fetch_posts`. Seja conciso nas suas respostas.
    ```

2.  Atualize seu arquivo `qwen-extension.json` para informar à CLI que deve carregar esse arquivo:

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

Reinicie a CLI novamente. Agora, o modelo terá acesso ao contexto definido no seu arquivo `QWEN.md` em todas as sessões nas quais a extensão estiver ativa.

## Etapa 7: Publicando sua extensão

Assim que você estiver satisfeito com sua extensão, poderá compartilhá-la com outras pessoas. As duas formas principais de publicar extensões são por meio de um repositório Git ou por meio de *GitHub Releases*. Usar um repositório Git público é o método mais simples.

Para instruções detalhadas sobre ambos os métodos, consulte o [Guia de Publicação de Extensões](extension-releasing.md).

## Conclusão

Você criou com sucesso uma extensão do Qwen Code! Você aprendeu como:

- Inicializar uma nova extensão a partir de um modelo.
- Adicionar ferramentas personalizadas com um servidor MCP.
- Criar comandos personalizados convenientes.
- Adicionar habilidades personalizadas e subagentes.
- Fornecer contexto persistente ao modelo.
- Vincular sua extensão para desenvolvimento local.

A partir daqui, você pode explorar recursos mais avançados e incorporar novas funcionalidades poderosas ao Qwen Code.