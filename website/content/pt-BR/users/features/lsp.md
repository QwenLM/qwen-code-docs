# Suporte ao Protocolo de Servidor de Linguagem (LSP)

O Qwen Code oferece suporte nativo ao Protocolo de Servidor de Linguagem (LSP), habilitando recursos avançados de inteligência de código, como ir para a definição, encontrar referências, diagnósticos e ações de código. Essa integração permite que o agente de IA compreenda seu código de forma mais profunda e forneça assistência mais precisa.

## Visão geral

O suporte ao LSP no Qwen Code funciona conectando-se a servidores de linguagem que entendem seu código. Ao trabalhar com TypeScript, Python, Go ou outras linguagens compatíveis, o Qwen Code pode iniciar automaticamente o servidor de linguagem apropriado e usá-lo para:

- Navegar até as definições de símbolos  
- Encontrar todas as referências a um símbolo  
- Obter informações ao passar o cursor sobre elementos (documentação, informações de tipo)  
- Visualizar mensagens de diagnóstico (erros, avisos)  
- Acessar ações de código (correções rápidas, refatorações)  
- Analisar hierarquias de chamadas

## Início Rápido

O LSP é um recurso experimental no Qwen Code. Para ativá-lo, use a flag de linha de comando `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

Para a maioria das linguagens mais comuns, o Qwen Code detectará e iniciará automaticamente o servidor de linguagem apropriado, caso ele esteja instalado no seu sistema.

### Pré-requisitos

Você precisa ter o servidor de linguagem para sua linguagem de programação instalado:

| Linguagem             | Servidor de Linguagem      | Comando de Instalação                                                          |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Guia de instalação](https://rust-analyzer.github.io/manual.html#installation) |

## Configuração

### Arquivo `.lsp.json`

Você pode configurar servidores de linguagem usando um arquivo `.lsp.json` na raiz do seu projeto. Esse arquivo usa o formato indexado por linguagem descrito na [referência de configuração de servidores LSP do plugin Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers).

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

### Opções de configuração

#### Campos obrigatórios

| Opção                 | Tipo   | Descrição                                                    |
| --------------------- | ------ | ------------------------------------------------------------ |
| `command`             | string | Comando para iniciar o servidor LSP (deve estar no PATH)     |
| `extensionToLanguage` | objeto | Mapeia extensões de arquivos para identificadores de linguagem |

#### Campos Opcionais

| Opção                   | Tipo     | Padrão    | Descrição                                              |
| ----------------------- | -------- | --------- | ------------------------------------------------------ |
| `args`                  | string[] | `[]`      | Argumentos da linha de comando                         |
| `transport`             | string   | `"stdio"` | Tipo de transporte: `stdio` ou `socket`                |
| `env`                   | objeto   | -         | Variáveis de ambiente                                 |
| `initializationOptions` | objeto   | -         | Opções de inicialização do LSP                         |
| `settings`              | objeto   | -         | Configurações do servidor via `workspace/didChangeConfiguration` |
| `workspaceFolder`       | string   | -         | Substitui a pasta de workspace                         |
| `startupTimeout`        | número   | `10000`   | Tempo limite de inicialização em milissegundos         |
| `shutdownTimeout`       | número   | `5000`    | Tempo limite de desligamento em milissegundos          |
| `restartOnCrash`        | booleano | `false`   | Reinicia automaticamente em caso de falha             |
| `maxRestarts`           | número   | `3`       | Número máximo de tentativas de reinicialização        |
| `trustRequired`         | booleano | `true`    | Exige um workspace confiável                           |

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

## Operações LSP disponíveis

O Qwen Code expõe a funcionalidade LSP por meio da ferramenta unificada `lsp`. Abaixo estão as operações disponíveis:

### Navegação de código

#### Ir para a definição

Localiza onde um símbolo é definido.

```
Operação: goToDefinition
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

#### Localizar referências

Localiza todas as referências a um símbolo.

```
Operação: findReferences
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
  - includeDeclaration: Inclui a própria declaração (opcional)
```

#### Ir para a Implementação

Localize implementações de uma interface ou método abstrato.

```
Operação: goToImplementation
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

### Informações sobre Símbolos

#### Passar o Cursor Sobre

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

#### Pesquisa de Símbolos no Espaço de Trabalho

Pesquise símbolos em todo o espaço de trabalho.

```
Operação: workspaceSymbol
Parâmetros:
  - query: Cadeia de caracteres da consulta de pesquisa
  - limit: Número máximo de resultados (opcional)
```

### Hierarquia de Chamadas

#### Preparar Hierarquia de Chamadas

Obter o item da hierarquia de chamadas em uma posição.

```
Operação: prepareCallHierarchy
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

#### Chamadas Recebidas

Localizar todas as funções que chamam a função especificada.

```
Operação: incomingCalls
Parâmetros:
  - callHierarchyItem: Item obtido de prepareCallHierarchy
```

#### Chamadas Enviadas

Localizar todas as funções chamadas pela função especificada.

```
Operação: outgoingCalls
Parâmetros:
  - callHierarchyItem: Item obtido de prepareCallHierarchy
```

### Diagnósticos

#### Diagnósticos de Arquivo

Obter mensagens de diagnóstico (erros, avisos) para um arquivo.

```
Operação: diagnostics
Parâmetros:
  - filePath: Caminho para o arquivo
```

#### Diagnósticos do Espaço de Trabalho

Obter todas as mensagens de diagnóstico no espaço de trabalho.

```
Operação: workspaceDiagnostics
Parâmetros:
  - limit: Número máximo de resultados (opcional)
```

### Ações de Código

#### Obter Ações de Código

Obtém as ações de código disponíveis (correções rápidas, refatorações) em uma localização.

```
Operação: codeActions
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha inicial (baseado em 1)
  - character: Número da coluna inicial (baseado em 1)
  - endLine: Número da linha final (opcional, padrão é o valor de `line`)
  - endCharacter: Número da coluna final (opcional, padrão é o valor de `character`)
  - diagnostics: Diagnósticos para os quais obter ações (opcional)
  - codeActionKinds: Filtrar por tipo de ação (opcional)
```

Tipos de ações de código:

- `quickfix` — Correções rápidas para erros/avisos  
- `refactor` — Operações de refatoração  
- `refactor.extract` — Extrair para função/variável  
- `refactor.inline` — Inserir função/variável no local de uso  
- `source` — Ações relacionadas ao código-fonte  
- `source.organizeImports` — Organizar importações  
- `source.fixAll` — Corrigir todos os problemas passíveis de correção automática  

## Segurança

Servidores LSP são iniciados apenas em áreas de trabalho confiáveis por padrão. Isso ocorre porque servidores de linguagem são executados com as permissões do seu usuário e podem executar código.

### Controles de Confiança

- **Área de Trabalho Confiável**: Servidores LSP iniciam automaticamente  
- **Área de Trabalho Não Confiável**: Servidores LSP não serão iniciados, a menos que `trustRequired: false` esteja definido na configuração do servidor  

Para marcar uma área de trabalho como confiável, use o comando `/trust` ou configure pastas confiáveis nas configurações.

### Substituição de Confiança por Servidor

Você pode substituir os requisitos de confiança para servidores específicos em suas respectivas configurações:

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

### Servidor não está iniciando

1. **Verifique se o servidor está instalado**: Execute o comando manualmente para verificar  
2. **Verifique o PATH**: Certifique-se de que o binário do servidor está no seu PATH do sistema  
3. **Verifique a confiança do workspace**: O workspace deve ser confiável para o LSP  
4. **Verifique os logs**: Procure mensagens de erro na saída do console  
5. **Verifique a flag `--experimental-lsp`**: Certifique-se de que está usando essa flag ao iniciar o Qwen Code  

### Desempenho lento

1. **Projetos grandes**: Considere excluir `node_modules` e outros diretórios grandes  
2. **Tempo limite do servidor**: Aumente `startupTimeout` na configuração do servidor para servidores lentos  

### Nenhum resultado

1. **Servidor não está pronto**: O servidor pode ainda estar indexando  
2. **Arquivo não salvo**: Salve seu arquivo para que o servidor detecte as alterações  
3. **Linguagem incorreta**: Verifique se o servidor correto está em execução para sua linguagem

### Depuração

Habilite o registro de depuração para visualizar a comunicação com o LSP:

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Ou consulte o guia de depuração do LSP em `packages/cli/LSP_DEBUGGING_GUIDE.md`.

## Compatibilidade com o Claude Code

O Qwen Code suporta arquivos de configuração `.lsp.json` no estilo do Claude Code, no formato com chaves baseadas em linguagem definido na [referência de plugins do Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers). Se você estiver migrando do Claude Code, utilize o layout com linguagem como chave na sua configuração.

### Formato de configuração

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

Plugins LSP do Claude Code também podem fornecer `lspServers` em `plugin.json` (ou em um arquivo `.lsp.json` referenciado). O Qwen Code carrega essas configurações quando a extensão está habilitada, e elas devem usar o mesmo formato com chaves baseadas em linguagem.

## Melhores Práticas

1. **Instale servidores de linguagem globalmente**: Isso garante que eles estejam disponíveis em todos os projetos  
2. **Use configurações específicas por projeto**: Configure as opções do servidor por projeto, quando necessário, usando o arquivo `.lsp.json`  
3. **Mantenha os servidores atualizados**: Atualize seus servidores de linguagem regularmente para obter os melhores resultados  
4. **Conceda confiança com sabedoria**: Conceda confiança apenas a áreas de trabalho provenientes de fontes confiáveis  

## Perguntas Frequentes (FAQ)

### P: Como habilito o LSP?

Use a flag `--experimental-lsp` ao iniciar o Qwen Code:

```bash
qwen --experimental-lsp
```

### P: Como saber quais servidores de linguagem estão em execução?

Use o comando `/lsp status` para visualizar todos os servidores de linguagem configurados e em execução.

### P: Posso usar múltiplos servidores de linguagem para o mesmo tipo de arquivo?

Sim, mas apenas um será utilizado para cada operação. O primeiro servidor que retornar resultados é o que será usado.

### P: O LSP funciona no modo sandbox?

Os servidores LSP são executados fora do sandbox para acessar seu código. Eles estão sujeitos aos controles de confiança da área de trabalho.