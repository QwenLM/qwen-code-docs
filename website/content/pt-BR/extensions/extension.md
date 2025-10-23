# Extensões do Qwen Code

As extensões do Qwen Code empacotam prompts, servidores MCP e comandos personalizados em um formato familiar e fácil de usar. Com as extensões, você pode expandir as capacidades do Qwen Code e compartilhar essas funcionalidades com outras pessoas. Elas são projetadas para serem facilmente instaláveis e compartilháveis.

## Gerenciamento de extensões

Oferecemos um conjunto de ferramentas de gerenciamento de extensões usando os comandos `qwen extensions`.

Observe que esses comandos não são suportados diretamente no CLI, embora você possa listar as extensões instaladas usando o subcomando `/extensions list`.

Observe que todos esses comandos só serão refletidos nas sessões ativas do CLI após reiniciar.

### Instalando uma extensão

Você pode instalar uma extensão usando `qwen extensions install` com uma URL do GitHub ou um caminho local.

Note que criamos uma cópia da extensão instalada, então você precisará rodar `qwen extensions update` para puxar as mudanças tanto de extensões locais quanto das hospedadas no GitHub.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Isso vai instalar a extensão Qwen Code Security, que oferece suporte para o comando `/security:analyze`.

### Desinstalando uma extensão

Para desinstalar, rode `qwen extensions uninstall nome-da-extensão`, então, no caso do exemplo de instalação:

```
qwen extensions uninstall qwen-cli-security
```

### Desabilitando uma extensão

As extensões são, por padrão, habilitadas em todos os workspaces. Você pode desabilitar uma extensão completamente ou para um workspace específico.

Por exemplo, `qwen extensions disable extension-name` vai desabilitar a extensão no nível do usuário, então ela será desabilitada em todos os lugares. Já `qwen extensions disable extension-name --scope=workspace` vai desabilitar a extensão apenas no workspace atual.

### Habilitando uma extensão

Você pode habilitar extensões usando `qwen extensions enable extension-name`. Também é possível habilitar uma extensão para um workspace específico usando `qwen extensions enable extension-name --scope=workspace` dentro desse workspace.

Isso é útil quando você tem uma extensão desabilitada globalmente e só quer habilitá-la em alguns lugares específicos.

### Atualizando uma extensão

Para extensões instaladas a partir de um caminho local ou um repositório git, você pode explicitamente atualizar para a versão mais recente (conforme refletido no campo `version` do arquivo `qwen-extension.json`) com o comando:

```
qwen extensions update nome-da-extensao
```

Você pode atualizar todas as extensões com:

```
qwen extensions update --all
```

## Criação de extensões

Oferecemos comandos para facilitar o desenvolvimento de extensões.

### Criar uma extensão boilerplate

Disponibilizamos vários exemplos de extensões: `context`, `custom-commands`, `exclude-tools` e `mcp-server`. Você pode visualizar esses exemplos [aqui](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples).

Para copiar um desses exemplos para um diretório de desenvolvimento usando o tipo desejado, execute:

```
qwen extensions new caminho/para/diretorio custom-commands
```

### Vincular uma extensão local

O comando `qwen extensions link` cria um link simbólico do diretório de instalação da extensão para o caminho de desenvolvimento.

Isso é útil para que você não precise executar `qwen extensions update` toda vez que fizer alterações que deseja testar.

```
qwen extensions link path/to/directory
```

## Como funciona

Na inicialização, o Qwen Code procura por extensões em `<home>/.qwen/extensions`

As extensões existem como um diretório que contém um arquivo `qwen-extension.json`. Por exemplo:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

O arquivo `qwen-extension.json` contém a configuração da extensão. O arquivo tem a seguinte estrutura:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "QWEN.md",
  "excludeTools": ["run_shell_command"]
}
```

- `name`: O nome da extensão. É usado para identificar exclusivamente a extensão e resolver conflitos quando comandos da extensão têm o mesmo nome que comandos do usuário ou do projeto. O nome deve ser em letras minúsculas ou números, usando hífens em vez de sublinhados ou espaços. Assim é como os usuários irão se referir à sua extensão no CLI. Note que esperamos que esse nome corresponda ao nome do diretório da extensão.
- `version`: A versão da extensão.
- `mcpServers`: Um mapa dos servidores MCP a serem configurados. A chave é o nome do servidor, e o valor é a configuração do servidor. Esses servidores serão carregados na inicialização, assim como os servidores MCP configurados em um arquivo [`settings.json`](./cli/configuration.md). Se tanto uma extensão quanto um arquivo `settings.json` configurarem um servidor MCP com o mesmo nome, o servidor definido no arquivo `settings.json` terá precedência.
  - Observe que todas as opções de configuração do servidor MCP são suportadas, exceto `trust`.
- `contextFileName`: O nome do arquivo que contém o contexto da extensão. Ele será usado para carregar o contexto a partir do diretório da extensão. Se essa propriedade não for usada, mas um arquivo `QWEN.md` estiver presente no diretório da extensão, então esse arquivo será carregado.
- `excludeTools`: Uma lista de nomes de ferramentas a serem excluídas do modelo. Você também pode especificar restrições específicas por comando para ferramentas compatíveis, como a ferramenta `run_shell_command`. Por exemplo, `"excludeTools": ["run_shell_command(rm -rf)"]` bloqueará o comando `rm -rf`. Note que isso difere da funcionalidade `excludeTools` do servidor MCP, que pode ser listada na configuração do servidor MCP.

Quando o Qwen Code inicia, ele carrega todas as extensões e mescla suas configurações. Se houver algum conflito, a configuração do workspace terá precedência.

### Comandos customizados

As extensões podem fornecer [comandos customizados](./cli/commands.md#custom-commands) colocando arquivos TOML em um subdiretório `commands/` dentro do diretório da extensão. Esses comandos seguem o mesmo formato dos comandos customizados de usuário e projeto e utilizam convenções de nomenclatura padrão.

**Exemplo**

Uma extensão chamada `gcp` com a seguinte estrutura:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

Forneceria esses comandos:

- `/deploy` - Aparece como `[gcp] Custom command from deploy.toml` na ajuda
- `/gcs:sync` - Aparece como `[gcp] Custom command from sync.toml` na ajuda

### Resolução de conflitos

Os comandos de extensão têm a menor precedência. Quando ocorre um conflito com comandos do usuário ou do projeto:

1. **Sem conflito**: O comando da extensão usa seu nome natural (ex.: `/deploy`)
2. **Com conflito**: O comando da extensão é renomeado com o prefixo da extensão (ex.: `/gcp.deploy`)

Por exemplo, se tanto um usuário quanto a extensão `gcp` definirem um comando `deploy`:

- `/deploy` - Executa o comando deploy do usuário
- `/gcp.deploy` - Executa o comando deploy da extensão (marcado com a tag `[gcp]`)

## Variáveis

As extensões do Qwen Code permitem substituição de variáveis no arquivo `qwen-extension.json`. Isso pode ser útil, por exemplo, quando você precisa do diretório atual para executar um servidor MCP usando `"cwd": "${extensionPath}${/}run.ts"`.

**Variáveis suportadas:**

| variável                   | descrição                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | O caminho completo da extensão no sistema de arquivos do usuário, por exemplo, '/Users/username/.qwen/extensions/example-extension'. Não resolve symlinks.   |
| `${workspacePath}`         | O caminho completo do workspace atual.                                                                                                                        |
| `${/} or ${pathSeparator}` | O separador de caminhos (varia conforme o sistema operacional).                                                                                               |