# Primeiros Passos com Extensões do Qwen Code

Este guia vai te ajudar a criar sua primeira extensão do Qwen Code. Você aprenderá a configurar uma nova extensão, adicionar uma ferramenta personalizada via um servidor MCP, criar um comando personalizado e fornecer contexto ao modelo com um arquivo `QWEN.md`.

## Pré-requisitos

Antes de começar, certifique-se de ter o Qwen Code instalado e um conhecimento básico de Node.js e TypeScript.

## Passo 1: Criar uma Nova Extensão

A maneira mais fácil de começar é usando um dos templates embutidos. Usaremos o exemplo `mcp-server` como base.

Execute o seguinte comando para criar um novo diretório chamado `my-first-extension` com os arquivos do template:

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

## Passo 2: Entender os Arquivos da Extensão

Vamos dar uma olhada nos arquivos principais da sua nova extensão.

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

- `name`: O nome único da sua extensão.
- `version`: A versão da sua extensão.
- `mcpServers`: Esta seção define um ou mais servidores MCP (Model Context Protocol). Servidores MCP são a forma de adicionar novas ferramentas para o modelo usar.
  - `command`, `args`, `cwd`: Esses campos especificam como iniciar seu servidor. Observe o uso da variável `${extensionPath}`, que o Qwen Code substitui pelo caminho absoluto do diretório de instalação da sua extensão. Isso permite que sua extensão funcione independentemente de onde for instalada.

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

// ... (registro de prompt omitido por brevidade)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Este servidor define uma única ferramenta chamada `fetch_posts` que busca dados de uma API pública.

### `package.json` e `tsconfig.json`

Estes são arquivos de configuração padrão para um projeto TypeScript. O arquivo `package.json` define dependências e um script de `build`, e o `tsconfig.json` configura o compilador TypeScript.

## Passo 3: Compilar e Vincular Sua Extensão

Antes de usar a extensão, você precisa compilar o código TypeScript e vincular a extensão à sua instalação do Qwen Code para desenvolvimento local.

1.  **Instalar as dependências:**

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

    O comando `link` cria um link simbólico do diretório de extensões do Qwen Code para o seu diretório de desenvolvimento. Isso significa que qualquer alteração feita será refletida imediatamente sem necessidade de reinstalação.

    ```bash
    qwen extensions link .
    ```

Agora, reinicie sua sessão do Qwen Code. A nova ferramenta `fetch_posts` estará disponível. Você pode testá-la perguntando: "buscar posts".

## Passo 4: Adicionar um Comando Personalizado

Comandos personalizados fornecem uma maneira de criar atalhos para prompts complexos. Vamos adicionar um comando que busca um padrão no seu código.

1.  Crie um diretório `commands` e um subdiretório para o grupo do seu comando:

    ```bash
    mkdir -p commands/fs
    ```

2.  Crie um arquivo chamado `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Buscar um padrão no código e resumir resultados
    ---

    Por favor, resuma os resultados para o padrão `{{args}}`.

    Resultados da Busca:
    !{grep -r {{args}} .}
    ```

    Este comando, `/fs:grep-code`, receberá um argumento, executará o comando shell `grep` com ele e enviará os resultados para um prompt de sumarização.

> **Nota:** Comandos usam o formato Markdown com frontmatter YAML opcional. O formato TOML está obsoleto, mas ainda é suportado para compatibilidade reversa.

Após salvar o arquivo, reinicie o Qwen Code. Agora você pode executar `/fs:grep-code "algum padrão"` para usar seu novo comando.

## Passo 5: Adicionar Skills e Subagentes Personalizados (Opcional)

Extensões também podem fornecer skills e subagentes personalizados para estender as capacidades do Qwen Code.

### Adicionar uma Skill Personalizada

Skills são capacidades invocadas pelo modelo que a IA pode usar automaticamente quando relevante.

1.  Crie um diretório `skills` com um subdiretório para a skill:

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

    Ao analisar código, foque em:

    - Complexidade e manutenibilidade do código
    - Dependências e acoplamento
    - Potenciais problemas de performance
    - Sugestões de melhorias

    ## Exemplos

    - "Analise a complexidade desta função"
    - "Quais são as dependências deste módulo?"
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
    description: Especializado em refatoração de código, melhorando a estrutura e manutenibilidade
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Você é um especialista em refatoração focado em melhorar a qualidade do código.

    Sua expertise inclui:

    - Identificar code smells e anti-patterns
    - Aplicar princípios SOLID
    - Melhorar legibilidade e manutenibilidade do código
    - Refatoração segura com risco mínimo

    Para cada tarefa de refatoração:

    1. Analise a estrutura atual do código
    2. Identifique áreas para melhoria
    3. Proponha etapas de refatoração
    4. Implemente mudanças incrementalmente
    5. Verifique se a funcionalidade foi preservada
    ```

Após reiniciar o Qwen Code, suas skills personalizadas estarão disponíveis via `/skills` e subagentes via `/agents manage`.

## Passo 6: Adicionar um `QWEN.md` Personalizado

Você pode fornecer contexto persistente ao modelo adicionando um arquivo `QWEN.md` à sua extensão. Isso é útil para dar instruções sobre como o modelo deve se comportar ou informações sobre as ferramentas da sua extensão. Observe que nem sempre é necessário para extensões criadas para expor comandos e prompts.

1.  Crie um arquivo chamado `QWEN.md` na raiz do diretório da sua extensão:

    ```markdown
    # Instruções da Minha Primeira Extensão

    Você é um assistente desenvolvedor especialista. Quando o usuário pedir para buscar posts, use a ferramenta `fetch_posts`. Seja conciso em suas respostas.
    ```

2.  Atualize seu `qwen-extension.json` para instruir o CLI a carregar este arquivo:

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

## Passo 7: Publicando Sua Extensão

Depois que estiver satisfeito com sua extensão, você pode compartilhá-la com outras pessoas. As duas principais formas de publicar extensões são por meio de um repositório Git ou via GitHub Releases. Usar um repositório Git público é o método mais simples.

Para instruções detalhadas sobre ambos os métodos, consulte o [Guia de Publicação de Extensões](extension-releasing.md).

## Conclusão

Você criou com sucesso uma extensão do Qwen Code! Você aprendeu como:

- Iniciar uma nova extensão a partir de um template.
- Adicionar ferramentas personalizadas com um servidor MCP.
- Criar comandos personalizados convenientes.
- Adicionar skills e subagentes personalizados.
- Fornecer contexto persistente ao modelo.
- Vincular sua extensão para desenvolvimento local.

A partir daqui, você pode explorar recursos mais avançados e construir novas capacidades poderosas no Qwen Code.