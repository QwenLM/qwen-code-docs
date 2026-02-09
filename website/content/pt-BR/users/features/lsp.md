# Suporte ao Protocolo de Servidor de Linguagem (LSP)

O Qwen Code oferece suporte nativo ao Protocolo de Servidor de Linguagem (LSP), habilitando recursos avançados de inteligência de código como ir para definição, encontrar referências, diagnósticos e ações de código. Essa integração permite que o agente de IA compreenda seu código de forma mais profunda e forneça assistência mais precisa.

## Visão Geral

O suporte a LSP no Qwen Code funciona conectando-se a servidores de linguagem que entendem seu código. Quando você trabalha com TypeScript, Python, Go ou outras linguagens suportadas, o Qwen Code pode iniciar automaticamente o servidor de linguagem apropriado e utilizá-lo para:

- Navegar até definições de símbolos
- Encontrar todas as referências a um símbolo
- Obter informações ao passar o mouse (documentação, informações de tipo)
- Visualizar mensagens de diagnóstico (erros, avisos)
- Acessar ações de código (correções rápidas, refatorações)
- Analisar hierarquias de chamadas

## Início Rápido

LSP é um recurso experimental no Qwen Code. Para habilitá-lo, utilize a flag de linha de comando `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

Para a maioria das linguagens comuns, o Qwen Code detectará e iniciará automaticamente o servidor de linguagem apropriado, caso esteja instalado em seu sistema.

### Pré-requisitos

Você precisa ter o servidor de linguagem para sua linguagem de programação instalado:

| Linguagem             | Servidor de Linguagem      | Comando de Instalação                                                          |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Guia de instalação](https://rust-analyzer.github.io/manual.html#installation) |

## Configuração

### Arquivo .lsp.json

Você pode configurar servidores de linguagem usando um arquivo `.lsp.json` na raiz do seu projeto. Isso utiliza o formato com chave de linguagem descrito na [referência de configuração de LSP do plugin Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers).

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

### Opções de Configuração

#### Campos Obrigatórios

| Opção                 | Tipo   | Descrição                                         |
| --------------------- | ------ | ------------------------------------------------- |
| `command`             | string | Comando para iniciar o servidor LSP (deve estar no PATH) |
| `extensionToLanguage` | object | Mapeia extensões de arquivos para identificadores de linguagem |

#### Campos Opcionais

| Opção                   | Tipo     | Padrão    | Descrição                                              |
| ----------------------- | -------- | --------- | ------------------------------------------------------ |
| `args`                  | string[] | `[]`      | Argumentos de linha de comando                         |
| `transport`             | string   | `"stdio"` | Tipo de transporte: `stdio` ou `socket`                |
| `env`                   | object   | -         | Variáveis de ambiente                                  |
| `initializationOptions` | object   | -         | Opções de inicialização do LSP                         |
| `settings`              | object   | -         | Configurações do servidor via `workspace/didChangeConfiguration` |
| `workspaceFolder`       | string   | -         | Substituir pasta de workspace                          |
| `startupTimeout`        | number   | `10000`   | Tempo limite de inicialização em milissegundos         |
| `shutdownTimeout`       | number   | `5000`    | Tempo limite de desligamento em milissegundos          |
| `restartOnCrash`        | boolean  | `false`   | Reiniciar automaticamente em caso de falha             |
| `maxRestarts`           | number   | `3`       | Número máximo de tentativas de reinício                |
| `trustRequired`         | boolean  | `true`    | Requer workspace confiável                             |

### Transporte TCP/Socket

Para servidores que utilizam transporte TCP ou socket Unix:

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

O Qwen Code expõe funcionalidades LSP através da ferramenta unificada `lsp`. Aqui estão as operações disponíveis:

### Navegação de Código

#### Ir para Definição

Encontre onde um símbolo é definido.

```
Operação: goToDefinition
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

#### Localizar Referências

Encontre todas as referências a um símbolo.

```
Operação: findReferences
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
  - includeDeclaration: Incluir a própria declaração (opcional)
```

#### Ir para Implementação

Encontre implementações de uma interface ou método abstrato.

```
Operação: goToImplementation
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

### Informações de Símbolo

#### Hover

Obtenha documentação e informações de tipo para um símbolo.

```
Operação: hover
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

#### Símbolos do Documento

Obtenha todos os símbolos em um documento.

```
Operação: documentSymbol
Parâmetros:
  - filePath: Caminho para o arquivo
```

#### Pesquisa de Símbolos na Área de Trabalho

Pesquise por símbolos em toda a área de trabalho.

```
Operação: workspaceSymbol
Parâmetros:
  - query: String de consulta de pesquisa
  - limit: Resultados máximos (opcional)
```

### Hierarquia de Chamadas

#### Preparar Hierarquia de Chamadas

Obtém o item da hierarquia de chamadas em uma posição.

```
Operação: prepareCallHierarchy
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

#### Chamadas Recebidas

Encontra todas as funções que chamam a função fornecida.

```
Operação: incomingCalls
Parâmetros:
  - callHierarchyItem: Item proveniente de prepareCallHierarchy
```

#### Chamadas Enviadas

Encontra todas as funções chamadas pela função fornecida.

```
Operação: outgoingCalls
Parâmetros:
  - callHierarchyItem: Item proveniente de prepareCallHierarchy
```

### Diagnósticos

#### Diagnósticos de Arquivo

Obtém mensagens de diagnóstico (erros, avisos) para um arquivo.

```
Operação: diagnostics
Parâmetros:
  - filePath: Caminho para o arquivo
```

#### Diagnósticos do Workspace

Obtém todas as mensagens de diagnóstico em todo o workspace.

```
Operação: workspaceDiagnostics
Parâmetros:
  - limit: Máximo de resultados (opcional)
```

### Ações de Código

#### Obter Ações de Código

Obtém as ações de código disponíveis (correções rápidas, refatorações) em uma localização.

```
Operação: codeActions
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha inicial (baseada em 1)
  - character: Número da coluna inicial (baseada em 1)
  - endLine: Número da linha final (opcional, padrão é a linha inicial)
  - endCharacter: Coluna final (opcional, padrão é a coluna inicial)
  - diagnostics: Diagnósticos para os quais obter ações (opcional)
  - codeActionKinds: Filtrar por tipo de ação (opcional)
```

Tipos de ações de código:

- `quickfix` - Correções rápidas para erros/avisos
- `refactor` - Operações de refatoração
- `refactor.extract` - Extrair para função/variável
- `refactor.inline` - Incorporar função/variável
- `source` - Ações de código-fonte
- `source.organizeImports` - Organizar importações
- `source.fixAll` - Corrigir todos os problemas que podem ser corrigidos automaticamente

## Segurança

Servidores LSP são iniciados apenas em espaços de trabalho confiáveis por padrão. Isso ocorre porque os servidores de linguagem executam com suas permissões de usuário e podem executar código.

### Controles de Confiança

- **Área de Trabalho Confiável**: Servidores LSP iniciam automaticamente
- **Área de Trabalho Não Confiável**: Servidores LSP não iniciarão a menos que `trustRequired: false` esteja definido na configuração do servidor

Para marcar uma área de trabalho como confiável, utilize o comando `/trust` ou configure pastas confiáveis nas configurações.

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

### Servidor Não Iniciando

1. **Verifique se o servidor está instalado**: Execute o comando manualmente para verificar
2. **Verifique o PATH**: Certifique-se de que o binário do servidor esteja no seu PATH do sistema
3. **Verifique a confiança do espaço de trabalho**: O espaço de trabalho deve ser confiável para o LSP
4. **Verifique os logs**: Procure por mensagens de erro na saída do console
5. **Verifique a flag --experimental-lsp**: Certifique-se de estar usando a flag ao iniciar o Qwen Code

### Desempenho Lento

1. **Projetos grandes**: Considere excluir `node_modules` e outros diretórios grandes
2. **Tempo limite do servidor**: Aumente `startupTimeout` na configuração do servidor para servidores lentos

### Nenhum Resultado

1. **Servidor não está pronto**: O servidor pode ainda estar indexando
2. **Arquivo não salvo**: Salve seu arquivo para que o servidor detecte as alterações
3. **Idioma errado**: Verifique se o servidor correto está sendo executado para sua linguagem

### Depuração

Habilite o log de depuração para ver a comunicação LSP:

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Ou consulte o guia de depuração LSP em `packages/cli/LSP_DEBUGGING_GUIDE.md`.

## Compatibilidade com Claude Code

O Qwen Code suporta arquivos de configuração `.lsp.json` no estilo Claude Code no formato com chave por linguagem definido na [referência de plugins do Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers). Se você estiver migrando do Claude Code, utilize o layout com linguagem como chave em sua configuração.

### Formato da Configuração

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

Plugins LSP do Claude Code também podem fornecer `lspServers` no `plugin.json` (ou em um `.lsp.json` referenciado). O Qwen Code carrega essas configurações quando a extensão é habilitada, e elas devem utilizar o mesmo formato com chave por linguagem.

## Melhores Práticas

1. **Instale servidores de linguagem globalmente**: Isso garante que eles estejam disponíveis em todos os projetos
2. **Use configurações específicas por projeto**: Configure as opções do servidor por projeto conforme necessário usando `.lsp.json`
3. **Mantenha os servidores atualizados**: Atualize seus servidores de linguagem regularmente para obter melhores resultados
4. **Conceda confiança com sabedoria**: Apenas confie em espaços de trabalho provenientes de fontes confiáveis

## Perguntas Frequentes

### P: Como faço para habilitar o LSP?

Use a flag `--experimental-lsp` ao iniciar o Qwen Code:

```bash
qwen --experimental-lsp
```

### P: Como sei quais servidores de linguagem estão em execução?

Use o comando `/lsp status` para ver todos os servidores de linguagem configurados e em execução.

### P: Posso usar múltiplos servidores de linguagem para o mesmo tipo de arquivo?

Sim, mas apenas um será usado para cada operação. O primeiro servidor que retornar resultados é o vencedor.

### P: O LSP funciona no modo sandbox?

Os servidores LSP são executados fora do sandbox para acessar seu código. Eles estão sujeitos aos controles de confiança do espaço de trabalho.