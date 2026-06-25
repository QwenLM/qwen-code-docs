# Suporte ao Protocolo de Servidor de Linguagem (LSP)

O Qwen Code oferece suporte nativo ao Protocolo de Servidor de Linguagem (LSP), permitindo recursos avançados de inteligência de código como ir para definição, encontrar referências, diagnósticos e ações de código. Essa integração permite que o agente de IA entenda seu código mais profundamente e forneça assistência mais precisa.

## Visão Geral

O suporte a LSP no Qwen Code funciona conectando-se a servidores de linguagem que entendem seu código. Depois de configurar os servidores via `.lsp.json` (ou extensões), o Qwen Code pode iniciá-los e usá-los para:

- Navegar para definições de símbolos
- Encontrar todas as referências a um símbolo
- Obter informações ao passar o mouse (documentação, informações de tipo)
- Visualizar mensagens de diagnóstico (erros, avisos)
- Acessar ações de código (correções rápidas, refatorações)
- Analisar hierarquias de chamada

## Início Rápido

O LSP é um recurso experimental no Qwen Code. Para ativá-lo, use a flag de linha de comando `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

Os servidores LSP são orientados por configuração. Você deve defini-los em `.lsp.json` (ou por meio de extensões) para que o Qwen Code os inicie.

### Pré-requisitos

Você precisa ter o servidor de linguagem para sua linguagem de programação instalado:

| Linguagem           | Servidor de Linguagem   | Comando de Instalação                                                              |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                             |
| Python              | pylsp                   | `pip install python-lsp-server`                                                    |
| Go                  | gopls                   | `go install golang.org/x/tools/gopls@latest`                                       |
| Rust                | rust-analyzer           | [Guia de instalação](https://rust-analyzer.github.io/manual.html#installation)     |
| C/C++               | clangd                  | Instale o LLVM/clangd através do seu gerenciador de pacotes                        |
| Java                | jdtls                   | Instale o JDTLS e um JDK                                                           |

## Configuração

### Arquivo .lsp.json

Você pode configurar servidores de linguagem usando um arquivo `.lsp.json` na raiz do seu projeto. Cada chave de nível superior é um identificador de linguagem, e seu valor é o objeto de configuração do servidor.

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

### Configuração de C/C++ (clangd)

Dependências:

- clangd (LLVM) deve estar instalado e disponível no PATH.
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

### Configuração de Java (jdtls)

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

| Opção    | Tipo   | Descrição                                                                                                                                       |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Comando para iniciar o servidor LSP. Suporta nomes de comando simples resolvidos via `PATH` (ex.: `clangd`) e caminhos absolutos (ex.: `/opt/llvm/bin/clangd`) |

#### Campos Opcionais

| Opção                  | Tipo     | Padrão   | Descrição                                                                                      |
| ---------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------- |
| `args`                 | string[] | `[]`     | Argumentos de linha de comando                                                                 |
| `transport`            | string   | `"stdio"`| Tipo de transporte: `stdio`, `tcp` ou `socket`                                                  |
| `env`                  | object   | -        | Variáveis de ambiente                                                                          |
| `initializationOptions`| object   | -        | Opções de inicialização do LSP                                                                 |
| `settings`             | object   | -        | Configurações do servidor via `workspace/didChangeConfiguration`                               |
| `extensionToLanguage`  | object   | -        | Mapeia extensões de arquivo para identificadores de linguagem                                  |
| `workspaceFolder`      | string   | -        | Sobrescrever pasta do workspace (deve estar dentro da raiz do projeto)                         |
| `startupTimeout`       | number   | `10000`  | Tempo limite de inicialização em milissegundos                                                  |
| `shutdownTimeout`      | number   | `5000`   | Tempo limite de desligamento em milissegundos                                                   |
| `restartOnCrash`       | boolean  | `false`  | Reiniciar automaticamente em caso de falha                                                     |
| `maxRestarts`          | number   | `3`      | Número máximo de tentativas de reinicialização                                                 |
| `trustRequired`        | boolean  | `true`   | Exigir workspace confiável                                                                     |
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

O Qwen Code expõe a funcionalidade LSP através da ferramenta unificada `lsp`. Aqui estão as operações disponíveis:

Operações baseadas em localização (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` e `prepareCallHierarchy`) exigem uma posição exata com `filePath` + `line` + `character`. Se você não souber a posição exata, use `workspaceSymbol` ou `documentSymbol` primeiro para localizar o símbolo.

### Navegação de Código

#### Ir para Definição

Encontra onde um símbolo é definido.

```
Operation: goToDefinition
Parameters:
  - filePath: Caminho para o arquivo
  - line: Número da linha (base 1)
  - character: Número da coluna (base 1)
```

#### Encontrar Referências

Encontra todas as referências a um símbolo.

```
Operation: findReferences
Parameters:
  - filePath: Caminho para o arquivo
  - line: Número da linha (base 1)
  - character: Número da coluna (base 1)
  - includeDeclaration: Incluir a própria declaração (opcional)
```

#### Ir para Implementação

Encontra implementações de uma interface ou método abstrato.

```
Operation: goToImplementation
Parameters:
  - filePath: Caminho para o arquivo
  - line: Número da linha (base 1)
  - character: Número da coluna (base 1)
```

### Informações sobre Símbolos

#### Hover (Suspenso)

Obtém documentação e informações de tipo para um símbolo.

```
Operation: hover
Parameters:
  - filePath: Caminho para o arquivo
  - line: Número da linha (base 1)
  - character: Número da coluna (base 1)
```

#### Símbolos do Documento

Obtém todos os símbolos em um documento.

```
Operation: documentSymbol
Parameters:
  - filePath: Caminho para o arquivo
```

#### Pesquisa de Símbolos no Workspace

Pesquisa símbolos em todo o workspace.

```
Operation: workspaceSymbol
Parameters:
  - query: String de consulta de pesquisa
  - limit: Resultados máximos (opcional)
```

### Hierarquia de Chamadas

#### Preparar Hierarquia de Chamadas

Obtém o item de hierarquia de chamadas em uma posição.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Caminho para o arquivo
  - line: Número da linha (base 1)
  - character: Número da coluna (base 1)
```

#### Chamadas Recebidas

Encontra todas as funções que chamam a função fornecida.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item de prepareCallHierarchy
```

#### Chamadas Enviadas

Encontra todas as funções chamadas pela função fornecida.

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Item de prepareCallHierarchy
```

### Diagnósticos

#### Diagnósticos do Arquivo

Obtém mensagens de diagnóstico (erros, avisos) para um arquivo.

```
Operation: diagnostics
Parameters:
  - filePath: Caminho para o arquivo
```

#### Diagnósticos do Workspace

Obtém todas as mensagens de diagnóstico em todo o workspace.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Resultados máximos (opcional)
```

### Ações de Código

#### Obter Ações de Código

Obtém ações de código disponíveis (correções rápidas, refatorações) em uma localização.

```
Operation: codeActions
Parameters:
  - filePath: Caminho para o arquivo
  - line: Número da linha inicial (base 1)
  - character: Número da coluna inicial (base 1)
  - endLine: Número da linha final (opcional, padrão é line)
  - endCharacter: Coluna final (opcional, padrão é character)
  - diagnostics: Diagnósticos para obter ações (opcional)
  - codeActionKinds: Filtrar por tipo de ação (opcional)
```

Tipos de ação de código:

- `quickfix` – Correções rápidas para erros/avisos
- `refactor` – Operações de refatoração
- `refactor.extract` – Extrair para função/variável
- `refactor.inline` – Inline de função/variável
- `source` – Ações de código fonte
- `source.organizeImports` – Organizar imports
- `source.fixAll` – Corrigir todos os problemas corrigíveis automaticamente

## Segurança

Servidores LSP são iniciados apenas em workspaces confiáveis por padrão. Isso porque os servidores de linguagem são executados com suas permissões de usuário e podem executar código.

### Controles de Confiança

- **Workspace Confiável**: Servidores LSP iniciam se configurados
- **Workspace Não Confiável**: Servidores LSP não iniciam a menos que `trustRequired: false` seja definido na configuração do servidor

Para marcar um workspace como confiável, use o comando `/trust`.

### Sobrescrita de Confiança por Servidor

Você pode sobrescrever os requisitos de confiança para servidores específicos em sua configuração:

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

### Servidor Não Inicia

1. **Verifique a flag `--experimental-lsp`**: Certifique-se de estar usando a flag ao iniciar o Qwen Code
2. **Verifique se o servidor está instalado**: Execute o comando manualmente (ex.: `clangd --version`) para confirmar
3. **Verifique o comando**: O binário do servidor deve estar no `PATH` do sistema, ou especificado como caminho absoluto (ex.: `/opt/llvm/bin/clangd`). Caminhos relativos que escapam do workspace são bloqueados
4. **Verifique a confiança do workspace**: O workspace deve ser confiável para LSP (use `/trust`)
5. **Verifique os logs**: Inicie o Qwen Code com `--debug` e procure por entradas relacionadas a LSP no log de depuração (veja a seção Depuração abaixo)
6. **Verifique o processo**: Execute `ps aux | grep <nome-do-servidor>` para confirmar que o processo do servidor está rodando
### Desempenho Lento

1. **Projetos grandes**: Considere excluir `node_modules` e outros diretórios grandes
2. **Timeout do servidor**: Aumente `startupTimeout` na configuração do servidor para servidores lentos

### Nenhum Resultado

1. **Servidor não pronto**: O servidor pode ainda estar indexando. Para projetos C/C++ com clangd, certifique-se de que `--background-index` esteja nos argumentos e que um `compile_commands.json` (ou `compile_flags.txt`) exista na raiz do projeto ou em um diretório pai. Use `--compile-commands-dir=<caminho>` se ele estiver em um subdiretório de build
2. **Arquivo não salvo**: Salve seu arquivo para que o servidor detecte as alterações
3. **Linguagem errada**: Verifique se o servidor correto está em execução para sua linguagem
4. **Verifique o processo**: Execute `ps aux | grep <nome-do-servidor>` para confirmar se o servidor está realmente rodando

### Depuração

O LSP não possui uma flag separada de depuração. Use o modo de depuração normal do Qwen Code junto com a flag de funcionalidade LSP:

```bash
qwen --experimental-lsp --debug
```

Os logs de depuração são gravados no diretório de log de depuração da sessão. Para verificar entradas relacionadas ao LSP:

```bash
# Diretório de tempo de execução padrão
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# Ou, sem ripgrep:
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# Se QWEN_RUNTIME_DIR estiver configurado
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

Entradas úteis incluem:

- `[LSP] ...`: Logs emitidos pelo serviço LSP nativo e pelo gerenciador de servidores.
- `[CONFIG] Native LSP status after discovery: ...`: Configuração do servidor LSP descoberta para a sessão.
- `[CONFIG] Native LSP status after startup: ...`: Resultado da inicialização do servidor, incluindo contagens de prontos/falhas.
- `[STATUS] LSP status snapshot for /status: ...`: Instantâneo do status impresso ao executar `/status` no modo de depuração.

Você também pode executar `/status` no CLI para ver um resumo curto do LSP:

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

Para detalhes por servidor, execute `/lsp`:

```text
**LSP Server Status**

| Server | Command | Languages | Status |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | READY |
| pyright | `pyright-langserver` | python | FAILED - startup failed |
```

Mensagens de erro comuns a serem procuradas:

```text
command path is unsafe        -> o caminho relativo escapa do workspace, use caminho absoluto ou adicione ao PATH
command not found             -> binário do servidor não instalado ou não está no PATH
requires trusted workspace    -> execute /trust primeiro
LSP connection closed         -> servidor iniciou mas saiu ou fechou stdio antes de responder ao initialize
```

Para falhas de inicialização do clangd, verifique o servidor diretamente a partir da raiz do projeto:

```bash
clangd --version
clangd --check=/caminho/para/arquivo.cpp --log=verbose
```

Projetos C/C++ geralmente devem fornecer um `compile_commands.json` ou `compile_flags.txt`. Se o banco de dados de compilação estiver em um diretório de build, passe-o para o clangd:

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # ou typescript-language-server, jdtls, etc.
```

## Configuração LSP para Extensões

Extensões podem fornecer configurações de servidor LSP através do campo `lspServers` em seu `plugin.json`. Pode ser um objeto inline ou um caminho para um arquivo `.lsp.json`. O Qwen Code carrega essas configurações quando a extensão está habilitada. O formato é o mesmo layout baseado em linguagem usado em arquivos `.lsp.json` de projetos.

## Melhores Práticas

1. **Instale servidores de linguagem globalmente**: Isso garante que eles estejam disponíveis em todos os projetos
2. **Use configurações específicas do projeto**: Configure opções do servidor por projeto quando necessário via `.lsp.json`
3. **Mantenha os servidores atualizados**: Atualize seus servidores de linguagem regularmente para melhores resultados
4. **Confie com sabedoria**: Confie apenas em workspaces de fontes confiáveis

## FAQ

### P: Como habilito o LSP?

Use a flag `--experimental-lsp` ao iniciar o Qwen Code:

```bash
qwen --experimental-lsp
```

### P: Como saber quais servidores de linguagem estão rodando?

Inicie o Qwen Code com LSP e modo de depuração habilitados:

```bash
qwen --experimental-lsp --debug
```

Em seguida, execute `/status` para um resumo curto, `/lsp` para status por servidor, ou inspecione o log de depuração:

```bash
# Diretório de tempo de execução padrão
rg "LSP|Native LSP|<nome-do-servidor>" ~/.qwen/debug/latest
# Ou:
grep -E "LSP|Native LSP|<nome-do-servidor>" ~/.qwen/debug/latest

# Se QWEN_RUNTIME_DIR estiver configurado
rg "LSP|Native LSP|<nome-do-servidor>" "$QWEN_RUNTIME_DIR/debug/latest"
```

O LSP usa o modo `--debug` normal do Qwen Code; não há uma flag separada de depuração para o LSP.

### P: Posso usar múltiplos servidores de linguagem para o mesmo tipo de arquivo?

Sim, mas apenas um será usado para cada operação. O primeiro servidor que retornar resultados vence.

### P: O LSP funciona no modo sandbox?

Servidores LSP rodam fora do sandbox para acessar seu código. Eles estão sujeitos aos controles de confiança do workspace.
