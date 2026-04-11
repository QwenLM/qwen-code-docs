# Suporte ao Language Server Protocol (LSP)

O Qwen Code oferece suporte nativo ao Language Server Protocol (LSP), permitindo recursos avançados de inteligência de código, como ir para a definição, encontrar referências, diagnósticos e ações de código. Essa integração permite que o agente de IA compreenda seu código de forma mais profunda e forneça assistência mais precisa.

## Visão Geral

O suporte a LSP no Qwen Code funciona conectando-se a servidores de linguagem que compreendem seu código. Após configurar os servidores via `.lsp.json` (ou extensões), o Qwen Code pode iniciá-los e usá-los para:

- Navegar para definições de símbolos
- Encontrar todas as referências a um símbolo
- Obter informações ao passar o mouse (documentação, informações de tipo)
- Visualizar mensagens de diagnóstico (erros, avisos)
- Acessar ações de código (correções rápidas, refatorações)
- Analisar hierarquias de chamadas

## Início Rápido

O LSP é um recurso experimental no Qwen Code. Para ativá-lo, use a flag de linha de comando `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

Os servidores LSP são baseados em configuração. Você deve defini-los no `.lsp.json` (ou via extensões) para que o Qwen Code os inicie.

### Pré-requisitos

Você precisa ter o servidor de linguagem para sua linguagem de programação instalado:

| Linguagem             | Servidor de Linguagem      | Comando de Instalação                                                          |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Guia de instalação](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | Instale o LLVM/clangd pelo gerenciador de pacotes do seu sistema               |
| Java                  | jdtls                      | Instale o JDTLS e um JDK                                                       |

## Configuração

### Arquivo .lsp.json

Você pode configurar servidores de linguagem usando um arquivo `.lsp.json` na raiz do seu projeto. Isso usa o formato com chaves de linguagem descrito na [referência de configuração de LSP para plugins do Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers).

**Formato básico:**

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

### Configuração para C/C++ (clangd)

Dependências:

- O clangd (LLVM) deve estar instalado e disponível no PATH.
- Um banco de dados de compilação (`compile_commands.json`) ou `compile_flags.txt` é necessário para resultados precisos.

Exemplo:

```json
{
  "cpp": {
    "command": "clangd",
    "args": [
      "--background-index",
      "--clang-tidy",
      "--header-insertion=iwyu",
      "--completion-style=detailed"
    ]
  }
}
```

### Configuração para Java (jdtls)

Dependências:

- JDK instalado e disponível no PATH (`java`).
- JDTLS instalado e disponível no PATH (`jdtls`).

Exemplo:

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### Opções de Configuração

#### Campos Obrigatórios

| Opção     | Tipo   | Descrição                                           |
| --------- | ------ | --------------------------------------------------- |
| `command` | string | Comando para iniciar o servidor LSP (deve estar no PATH) |

#### Campos Opcionais

| Opção                   | Tipo     | Padrão    | Descrição                                               |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| `args`                  | string[] | `[]`      | Argumentos de linha de comando                          |
| `transport`             | string   | `"stdio"` | Tipo de transporte: `stdio`, `tcp` ou `socket`          |
| `env`                   | object   | -         | Variáveis de ambiente                                   |
| `initializationOptions` | object   | -         | Opções de inicialização do LSP                          |
| `settings`              | object   | -         | Configurações do servidor via `workspace/didChangeConfiguration` |
| `extensionToLanguage`   | object   | -         | Mapeia extensões de arquivo para identificadores de linguagem |
| `workspaceFolder`       | string   | -         | Substitui a pasta do workspace (deve estar dentro da raiz do projeto) |
| `startupTimeout`        | number   | `10000`   | Tempo limite de inicialização em milissegundos          |
| `shutdownTimeout`       | number   | `5000`    | Tempo limite de desligamento em milissegundos           |
| `restartOnCrash`        | boolean  | `false`   | Reinicialização automática em caso de falha             |
| `maxRestarts`           | number   | `3`       | Número máximo de tentativas de reinicialização          |
| `trustRequired`         | boolean  | `true`    | Exige workspace confiável                               |

### Transporte TCP/Socket

Para servidores que usam transporte TCP ou socket Unix:

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": {
      "host": "127.0.0.1",
      "port": 9999
    },
    "extensionToLanguage": {
      ".custom": "custom"
    }
  }
}
```

## Operações LSP Disponíveis

O Qwen Code expõe a funcionalidade LSP por meio da ferramenta unificada `lsp`. Aqui estão as operações disponíveis:

### Navegação de Código

#### Ir para a Definição

Encontra onde um símbolo é definido.

```
Operation: goToDefinition
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Encontrar Referências

Encontra todas as referências a um símbolo.

```
Operation: findReferences
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
  - includeDeclaration: Include the declaration itself (optional)
```

#### Ir para a Implementação

Encontra implementações de uma interface ou método abstrato.

```
Operation: goToImplementation
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

### Informações de Símbolo

#### Hover

Obtém documentação e informações de tipo para um símbolo.

```
Operation: hover
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Símbolos do Documento

Obtém todos os símbolos em um documento.

```
Operation: documentSymbol
Parameters:
  - filePath: Path to the file
```

#### Pesquisa de Símbolos no Workspace

Pesquisa símbolos em todo o workspace.

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### Hierarquia de Chamadas

#### Preparar Hierarquia de Chamadas

Obtém o item da hierarquia de chamadas em uma posição.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Chamadas de Entrada

Encontra todas as funções que chamam a função fornecida.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### Chamadas de Saída

Encontra todas as funções chamadas pela função fornecida.

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

### Diagnósticos

#### Diagnósticos de Arquivo

Obtém mensagens de diagnóstico (erros, avisos) para um arquivo.

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### Diagnósticos do Workspace

Obtém todas as mensagens de diagnóstico em todo o workspace.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### Ações de Código

#### Obter Ações de Código

Obtém ações de código disponíveis (correções rápidas, refatorações) em um local.

```
Operation: codeActions
Parameters:
  - filePath: Path to the file
  - line: Start line number (1-based)
  - character: Start column number (1-based)
  - endLine: End line number (optional, defaults to line)
  - endCharacter: End column (optional, defaults to character)
  - diagnostics: Diagnostics to get actions for (optional)
  - codeActionKinds: Filter by action kind (optional)
```

Tipos de ação de código:

- `quickfix` - Correções rápidas para erros/avisos
- `refactor` - Operações de refatoração
- `refactor.extract` - Extrair para função/variável
- `refactor.inline` - Embutir função/variável
- `source` - Ações de código-fonte
- `source.organizeImports` - Organizar imports
- `source.fixAll` - Corrigir todos os problemas com correção automática

## Segurança

Por padrão, os servidores LSP são iniciados apenas em workspaces confiáveis. Isso ocorre porque os servidores de linguagem são executados com as permissões do seu usuário e podem executar código.

### Controles de Confiança

- **Workspace Confiável**: Os servidores LSP são iniciados se configurados
- **Workspace Não Confiável**: Os servidores LSP não serão iniciados, a menos que `trustRequired: false` esteja definido na configuração do servidor

Para marcar um workspace como confiável, use o comando `/trust` ou configure pastas confiáveis nas configurações.

### Substituição de Confiança por Servidor

Você pode substituir os requisitos de confiança para servidores específicos em suas configurações:

```json
{
  "safe-server": {
    "command": "safe-language-server",
    "args": ["--stdio"],
    "trustRequired": false,
    "extensionToLanguage": {
      ".safe": "safe"
    }
  }
}
```

## Solução de Problemas

### O Servidor Não Inicia

1. **Verifique se o servidor está instalado**: Execute o comando manualmente para confirmar
2. **Verifique o PATH**: Certifique-se de que o binário do servidor está no PATH do sistema
3. **Verifique a confiança do workspace**: O workspace deve ser confiável para o LSP
4. **Verifique os logs**: Procure mensagens de erro na saída do console
5. **Verifique a flag --experimental-lsp**: Certifique-se de usar a flag ao iniciar o Qwen Code

### Desempenho Lento

1. **Projetos grandes**: Considere excluir `node_modules` e outros diretórios grandes
2. **Tempo limite do servidor**: Aumente o `startupTimeout` na configuração do servidor para servidores lentos

### Nenhum Resultado

1. **Servidor não está pronto**: O servidor ainda pode estar indexando
2. **Arquivo não salvo**: Salve seu arquivo para que o servidor detecte as alterações
3. **Linguagem incorreta**: Verifique se o servidor correto está em execução para sua linguagem

### Depuração

Ative o log de depuração para ver a comunicação LSP:

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Ou consulte o guia de depuração do LSP em `packages/cli/LSP_DEBUGGING_GUIDE.md`.

## Compatibilidade com Claude Code

O Qwen Code oferece suporte a arquivos de configuração `.lsp.json` no estilo do Claude Code, no formato com chaves de linguagem definido na [referência de plugins do Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers). Se você está migrando do Claude Code, use o layout com a linguagem como chave na sua configuração.

### Formato de Configuração

O formato recomendado segue a especificação do Claude Code:

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

Os plugins LSP do Claude Code também podem fornecer `lspServers` no `plugin.json` (ou em um `.lsp.json` referenciado). O Qwen Code carrega essas configurações quando a extensão está ativada, e elas devem usar o mesmo formato com chaves de linguagem.

## Melhores Práticas

1. **Instale servidores de linguagem globalmente**: Isso garante que estejam disponíveis em todos os projetos
2. **Use configurações específicas do projeto**: Configure as opções do servidor por projeto quando necessário via `.lsp.json`
3. **Mantenha os servidores atualizados**: Atualize seus servidores de linguagem regularmente para obter os melhores resultados
4. **Confie com sabedoria**: Confie apenas em workspaces de fontes confiáveis

## Perguntas Frequentes (FAQ)

### P: Como ativo o LSP?

Use a flag `--experimental-lsp` ao iniciar o Qwen Code:

```bash
qwen --experimental-lsp
```

### P: Como sei quais servidores de linguagem estão em execução?

Use o comando `/lsp status` para ver todos os servidores de linguagem configurados e em execução.

### P: Posso usar vários servidores de linguagem para o mesmo tipo de arquivo?

Sim, mas apenas um será usado para cada operação. O primeiro servidor que retornar resultados será o utilizado.

### P: O LSP funciona no modo sandbox?

Os servidores LSP são executados fora do sandbox para acessar seu código. Eles estão sujeitos aos controles de confiança do workspace.