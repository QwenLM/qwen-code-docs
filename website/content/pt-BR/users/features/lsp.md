# Suporte ao Protocolo de Servidor de Linguagem (LSP)

O Qwen Code oferece suporte nativo ao Protocolo de Servidor de Linguagem (LSP), permitindo funcionalidades avançadas de inteligência de código como ir para definição, localizar referências, diagnósticos e ações de código. Essa integração permite que o agente de IA entenda seu código de forma mais profunda e forneça assistência mais precisa.

## Visão Geral

O suporte LSP no Qwen Code funciona conectando-se a servidores de linguagem que entendem seu código. Depois de configurar servidores via `.lsp.json` (ou extensões), o Qwen Code pode iniciá-los e usá-los para:

- Navegar até definições de símbolos
- Localizar todas as referências a um símbolo
- Obter informações ao passar o mouse (documentação, informações de tipo)
- Visualizar mensagens de diagnóstico (erros, avisos)
- Acessar ações de código (correções rápidas, refatorações)
- Analisar hierarquias de chamada

## Início Rápido

O LSP é uma funcionalidade experimental no Qwen Code. Para ativá-lo, defina `tools.lspEnabled` no `settings.json` do usuário:

```json
{
  "tools": {
    "lspEnabled": true
  }
}
```

Hosts que aceitam flags de linha de comando podem usar `--experimental-lsp` em vez disso — os dois são equivalentes, e `QWEN_CODE_ENABLE_LSP=1` / `QWEN_CODE_DISABLE_LSP=1` sobrescrevem ambos (disable vence). Apenas o ambiente do operador ou um `.env` no escopo home pode definir essas duas variáveis; um `.env` de projeto ou um valor em `settings.env` é ignorado silenciosamente. A configuração é lida apenas na inicialização, portanto, alterá-la requer uma reinicialização; é respeitada a partir dos escopos user, system e system-defaults, nunca de um `.qwen/settings.json` de workspace, porque ativá-la permite que uma sessão inicie servidores de linguagem com suas próprias permissões. O LSP é recusado completamente no modo seguro (`--safe-mode` / `QWEN_CODE_SAFE_MODE=1`), modo bare, um host de agente somente leitura, um workspace SSH e um workspace provisório, porque esses modos não confiam no conteúdo do workspace que declara os servidores. Declarar servidores continua sendo uma decisão de workspace/extensão.

Os servidores LSP são orientados por configuração. Você deve defini-los no `.lsp.json` (ou via extensões) para que o Qwen Code os inicie.

### Pré-requisitos

Você precisa ter o servidor de linguagem para sua linguagem de programação instalado:

| Linguagem            | Servidor de Linguagem     | Comando de Instalação                                                             |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                            |
| Python               | pylsp                     | `pip install python-lsp-server`                                                   |
| Go                   | gopls                     | `go install golang.org/x/tools/gopls@latest`                                      |
| Rust                 | rust-analyzer             | [Guia de instalação](https://rust-analyzer.github.io/manual.html#installation)    |
| C/C++                | clangd                    | Instale LLVM/clangd através do seu gerenciador de pacotes                         |
| Java                 | jdtls                     | Instale o JDTLS e um JDK                                                          |
| C#                   | roslyn-language-server    | `dotnet tool install --global roslyn-language-server --prerelease` (.NET 10+)     |

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

### Configuração C/C++ (clangd)

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

### Configuração Java (jdtls)

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

### Configuração C# (Roslyn)

Dependências:

- Runtime .NET 10 ou posterior (`dotnet --version`).
- A ferramenta global `roslyn-language-server`:
  `dotnet tool install --global roslyn-language-server --prerelease`. Consulte o
  [README do Roslyn language server](https://github.com/dotnet/roslyn/blob/main/src/LanguageServer/roslyn-language-server/README.md)
  para pré-requisitos e opções atuais.

Exemplo:

```json
{
  "csharp": {
    "command": "roslyn-language-server",
    "args": ["--stdio", "--autoLoadProjects"],
    "extensionToLanguage": {
      ".cs": "csharp"
    }
  }
}
```

No Windows, a ferramenta global é instalada como um shim `cmd` em
`%USERPROFILE%\.dotnet\tools`. O Qwen Code inicia servidores sem shell, então um
`roslyn-language-server` puro é encontrado pelo `where`, mas falha ao spawnar. Use a
forma com shell nesse caso:

```json
{
  "csharp": {
    "command": "cmd",
    "args": ["/c", "roslyn-language-server", "--stdio", "--autoLoadProjects"],
    "extensionToLanguage": {
      ".cs": "csharp"
    }
  }
}
```

Um caminho absoluto para o executável real em
`%USERPROFILE%\.dotnet\tools\.store\roslyn-language-server\<versão>\...`
também funciona.

### Opções de Configuração

#### Campos Obrigatórios

| Opção      | Tipo   | Descrição                                                                                                                         |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `command`  | string | Comando para iniciar o servidor LSP. Aceita nomes de comandos resolvidos via `PATH` (ex.: `clangd`) e caminhos absolutos (ex.: `/opt/llvm/bin/clangd`) |

#### Campos Opcionais

| Opção                    | Tipo     | Padrão     | Descrição                                                     |
| ------------------------ | -------- | ---------- | ------------------------------------------------------------- |
| `args`                   | string[] | `[]`       | Argumentos de linha de comando                                |
| `transport`              | string   | `"stdio"`  | Tipo de transporte: `stdio`, `tcp` ou `socket`                |
| `env`                    | object   | -          | Variáveis de ambiente                                         |
| `initializationOptions`  | object   | -          | Opções de inicialização LSP                                   |
| `settings`               | object   | -          | Configurações do servidor via `workspace/didChangeConfiguration` |
| `extensionToLanguage`    | object   | -          | Mapeia extensões de arquivo para identificadores de linguagem |
| `workspaceFolder`        | string   | -          | Substituir a pasta do workspace (deve estar dentro da raiz do projeto) |
| `startupTimeout`         | number   | `10000`    | Tempo limite de inicialização em milissegundos                |
| `shutdownTimeout`        | number   | `5000`     | Tempo limite de encerramento em milissegundos                 |
| `restartOnCrash`         | boolean  | `false`    | Reinicialização automática em caso de falha                   |
| `maxRestarts`            | number   | `3`        | Número máximo de tentativas de reinicialização                |
| `trustRequired`          | boolean  | `true`     | Exigir workspace confiável                                    |

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

O Qwen Code expõe a funcionalidade LSP através da ferramenta unificada `lsp`. Aqui estão as operações disponíveis:

Operações baseadas em localização (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` e `prepareCallHierarchy`) exigem uma posição exata de `filePath` + `line` + `character`. Se você não souber a posição exata, use `workspaceSymbol` ou `documentSymbol` primeiro para localizar o símbolo.

### Navegação de Código

#### Ir para Definição

Encontra onde um símbolo é definido.

```
Operação: goToDefinition
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

#### Localizar Referências

Encontra todas as referências a um símbolo.

```
Operação: findReferences
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
  - includeDeclaration: Incluir a própria declaração (opcional)
```

#### Ir para Implementação

Encontra implementações de uma interface ou método abstrato.

```
Operação: goToImplementation
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

### Informações de Símbolo

#### Hover

Obtém documentação e informações de tipo para um símbolo.

```
Operação: hover
Parâmetros:
  - filePath: Caminho para o arquivo
  - line: Número da linha (baseado em 1)
  - character: Número da coluna (baseado em 1)
```

#### Símbolos do Documento

Obtém todos os símbolos de um documento.

```
Operação: documentSymbol
Parâmetros:
  - filePath: Caminho para o arquivo
```

#### Pesquisa de Símbolos no Workspace

Pesquisa símbolos em todo o workspace.

```
Operação: workspaceSymbol
Parâmetros:
  - query: String de consulta
  - limit: Resultados máximos (opcional)
```

### Hierarquia de Chamada

#### Preparar Hierarquia de Chamada

Obtém o item de hierarquia de chamada em uma posição.

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
  - callHierarchyItem: Item de prepareCallHierarchy
```

#### Chamadas Enviadas

Encontra todas as funções chamadas pela função fornecida.

```
Operação: outgoingCalls
Parâmetros:
  - callHierarchyItem: Item de prepareCallHierarchy
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
  - limit: Resultados máximos (opcional)
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
  - endLine: Número da linha final (opcional, padrão = line)
  - endCharacter: Coluna final (opcional, padrão = character)
  - diagnostics: Diagnósticos para obter ações (opcional)
  - codeActionKinds: Filtrar por tipo de ação (opcional)
```

Tipos de ação de código:

- `quickfix` - Correções rápidas para erros/avisos
- `refactor` - Operações de refatoração
- `refactor.extract` - Extrair para função/variável
- `refactor.inline` - Inline de função/variável
- `source` - Ações de código fonte
- `source.organizeImports` - Organizar imports
- `source.fixAll` - Corrigir todos os problemas corrigíveis automaticamente

## Segurança

Os servidores de linguagem são executados com as permissões do seu usuário e podem executar código. Servidores configurados pelo `.lsp.json` de um workspace exigem **confiança explícita na pasta**, incluindo suas sondas de disponibilidade de executáveis e recarregamentos a quente. Ative `security.folderTrust.enabled` nas configurações do usuário e confie no diretório, ou conceda confiança de workspace através do seu IDE. Desativar a confiança de pasta não autoriza configurações LSP do workspace, inclusive no modo YOLO.

### Controles de Confiança

- **Workspace Explicitamente Confiável**: Servidores LSP do workspace iniciam se configurados.
- **Sem Confiança Explícita**: Servidores do `.lsp.json` do workspace são ignorados. O repositório não pode sobrescrever isso definindo `trustRequired: false` ou declarando uma fonte de extensão.

Após ativar a confiança de pasta nas configurações do usuário, use o diálogo de confiança na inicialização ou `/trust` para confiar no diretório. Reinicie após alterar a decisão de confiança do CLI.

### Substituição de Confiança por Servidor

Extensões instaladas mantêm sua política de confiança existente. Uma extensão pode declarar `trustRequired: false` quando o host permite descoberta LSP em workspaces não confiáveis. Essa substituição é ignorada no `.lsp.json` do workspace:

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

1. **Verifique se o LSP está ativado**: Use a configuração `tools.lspEnabled` (escopo user, system ou system-defaults) ou a flag `--experimental-lsp`; `QWEN_CODE_ENABLE_LSP=1` / `QWEN_CODE_DISABLE_LSP=1` sobrescrevem ambos (disable vence). O modo seguro (`--safe-mode`, `QWEN_CODE_SAFE_MODE=1`) e `--bare` recusam o LSP, e `/lsp` não é registrado nesses casos
2. **Verifique se o servidor está instalado**: Execute o comando manualmente (ex.: `clangd --version`) para confirmar
3. **Verifique o comando**: O binário do servidor deve estar no `PATH` do sistema ou especificado como caminho absoluto (ex.: `/opt/llvm/bin/clangd`). Caminhos relativos que saem do workspace são bloqueados
4. **Verifique a confiança do workspace**: Um servidor declarado no workspace só inicia em uma pasta explicitamente confiável — ative `security.folderTrust.enabled` e confie na pasta com `/trust`, ou conecte um IDE que reporte o workspace como confiável. Um relatório de IDE de workspace não confiável (Modo Restrito do VS Code) também o ignora, e com a confiança de pasta desativada e sem confiança de IDE o servidor é ignorado em vez de admitido. A verificação do IDE é reavaliada quando o `.lsp.json` muda, e a ignorância aparece apenas no log do `--debug` como `requires trusted workspace, skipping`
5. **Verifique os logs**: Inicie o Qwen Code com `--debug` e então procure por entradas relacionadas ao LSP no log de depuração (veja a seção de Depuração abaixo)
6. **Verifique o processo**: Execute `ps aux | grep <nome-do-servidor>` para verificar se o processo do servidor está em execução

### Desempenho Lento

1. **Projetos grandes**: Considere excluir `node_modules` e outros diretórios grandes
2. **Timeout do servidor**: Aumente `startupTimeout` na configuração do servidor para servidores lentos

### Nenhum Resultado

1. **Servidor não pronto**: O servidor pode ainda estar indexando. Para projetos C/C++ com clangd, certifique-se de que `--background-index` está nos argumentos e que um `compile_commands.json` (ou `compile_flags.txt`) existe na raiz do projeto ou em um diretório pai. Use `--compile-commands-dir=<caminho>` se estiver em um subdiretório de build
2. **Arquivo não salvo**: Salve seu arquivo para que o servidor capte as alterações
3. **Linguagem errada**: Verifique se o servidor correto está em execução para sua linguagem
4. **Verifique o processo**: Execute `ps aux | grep <nome-do-servidor>` para verificar se o servidor está realmente em execução

### Depuração

O LSP não possui uma flag de depuração separada. Ative o LSP através da configuração (ou da flag), e então ative o modo de depuração normal do Qwen Code:

```bash
qwen --debug
```

Os logs de depuração são gravados no diretório de log de depuração da sessão. Para verificar entradas relacionadas ao LSP:

```bash
# Diretório de runtime padrão
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# Ou, sem ripgrep:
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# Se QWEN_RUNTIME_DIR estiver configurado
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

Entradas úteis incluem:

- `[LSP] ...`: Logs emitidos pelo serviço LSP nativo e gerenciador de servidores.
- `[CONFIG] Native LSP status after discovery: ...`: Configuração do servidor LSP descoberta para a sessão.
- `[CONFIG] Native LSP status after startup: ...`: Resultado da inicialização do servidor, incluindo contagens de prontos/falhas.
- `[STATUS] LSP status snapshot for /status: ...`: Instantâneo de status impresso ao executar `/status` no modo de depuração.

Você também pode executar `/status` no CLI para ver um breve resumo do LSP:

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

Mensagens de erro comuns a serem observadas:

```text
command path is unsafe        -> caminho relativo escapa do workspace; use caminho absoluto ou adicione ao PATH
command not found             -> binário do servidor não instalado ou não está no PATH
requires trusted workspace    -> execute /trust primeiro
LSP connection closed         -> servidor iniciou, mas saiu ou fechou stdio antes de responder à inicialização
```

Para falhas de inicialização do clangd, verifique o servidor diretamente a partir da raiz do projeto:

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
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

## Configuração de LSP por Extensão

As extensões podem fornecer configurações de servidor LSP através do campo `lspServers` em seu `plugin.json`. Isso pode ser um objeto inline ou um caminho para um arquivo `.lsp.json`. O Qwen Code carrega essas configurações quando a extensão está habilitada. O formato é o mesmo layout chaveado por linguagem usado nos arquivos `.lsp.json` do projeto.

## Melhores Práticas

1. **Instale servidores de linguagem globalmente**: Isso garante que estejam disponíveis em todos os projetos
2. **Use configurações específicas do projeto**: Configure opções do servidor por projeto quando necessário via `.lsp.json`
3. **Mantenha os servidores atualizados**: Atualize seus servidores de linguagem regularmente para obter melhores resultados
4. **Confie com sabedoria**: Confie apenas em workspaces de fontes confiáveis

## FAQ

### P: Como ativo o LSP?

Use a configuração `tools.lspEnabled` (escopo user, system ou system-defaults) ou a flag `--experimental-lsp`. `QWEN_CODE_ENABLE_LSP=1` e `QWEN_CODE_DISABLE_LSP=1` sobrescrevem ambos (disable vence); valores no escopo do workspace são ignorados.

```jsonc
// ~/.qwen/settings.json (user scope)
{ "tools": { "lspEnabled": true } }
```

### P: Como saber quais servidores de linguagem estão em execução?

Inicie o Qwen Code com LSP ativado (configuração ou flag) e modo de depuração ligado:

```bash
qwen --debug
```

Em seguida, execute `/status` para um resumo breve, `/lsp` para status por servidor, ou inspecione o log de depuração:

```bash
# Diretório de runtime padrão
rg "LSP|Native LSP|<nome-do-servidor>" ~/.qwen/debug/latest
# Ou:
grep -E "LSP|Native LSP|<nome-do-servidor>" ~/.qwen/debug/latest

# Se QWEN_RUNTIME_DIR estiver configurado
rg "LSP|Native LSP|<nome-do-servidor>" "$QWEN_RUNTIME_DIR/debug/latest"
```

O LSP usa o modo `--debug` normal do Qwen Code; não há uma flag de depuração separada para LSP.

### P: Posso usar vários servidores de linguagem para o mesmo tipo de arquivo?

Sim, mas apenas um será usado para cada operação. O primeiro servidor que retornar resultados vence.

### P: O LSP funciona no modo sandbox?

Os servidores LSP são executados fora do sandbox para acessar seu código. Eles estão sujeitos aos controles de confiança do workspace.