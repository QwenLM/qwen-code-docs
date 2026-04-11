# Extensões do Qwen Code

As extensões do Qwen Code agrupam prompts, servidores MCP, subagentes, skills e comandos personalizados em um formato familiar e fácil de usar. Com as extensões, você pode expandir os recursos do Qwen Code e compartilhá-los com outras pessoas. Elas são projetadas para serem facilmente instaladas e compartilhadas.

Extensões e plugins da [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) e do [Claude Code Marketplace](https://claudemarketplaces.com/) podem ser instalados diretamente no Qwen Code. Essa compatibilidade entre plataformas oferece acesso a um ecossistema rico de extensões e plugins, expandindo drasticamente os recursos do Qwen Code sem exigir que os autores mantenham versões separadas.

## Gerenciamento de extensões

Oferecemos um conjunto de ferramentas de gerenciamento de extensões usando tanto os comandos CLI `qwen extensions` quanto os comandos de barra `/extensions` na CLI interativa.

### Gerenciamento de extensões em tempo de execução (comandos de barra)

Você pode gerenciar extensões em tempo de execução na CLI interativa usando os comandos de barra `/extensions`. Esses comandos suportam hot-reloading, o que significa que as alterações entram em vigor imediatamente sem a necessidade de reiniciar o aplicativo.

| Command                               | Description                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `/extensions` or `/extensions manage` | Gerenciar todas as extensões instaladas                                      |
| `/extensions install <source>`        | Instalar uma extensão a partir de uma URL git, caminho local, pacote npm ou marketplace |
| `/extensions explore [source]`        | Abrir a página de origem das extensões (Gemini ou ClaudeCode) no seu navegador            |

### Gerenciamento de extensões via CLI

Você também pode gerenciar extensões usando os comandos CLI `qwen extensions`. Observe que as alterações feitas via comandos CLI serão refletidas nas sessões CLI ativas após a reinicialização.

### Instalando uma extensão

Você pode instalar uma extensão usando `qwen extensions install` a partir de várias fontes:

#### Pelo Claude Code Marketplace

O Qwen Code também suporta plugins do [Claude Code Marketplace](https://claudemarketplaces.com/). Instale a partir de um marketplace e escolha um plugin:

```bash
qwen extensions install <marketplace-name>
# or
qwen extensions install <marketplace-github-url>
```

Se quiser instalar um plugin específico, você pode usar o formato com o nome do plugin:

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# or
qwen extensions install <marketplace-github-url>:<plugin-name>
```

Por exemplo, para instalar o plugin `prompts.chat` do marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts):

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Os plugins do Claude são convertidos automaticamente para o formato do Qwen Code durante a instalação:

- `claude-plugin.json` é convertido para `qwen-extension.json`
- As configurações de agent são convertidas para o formato de subagent do Qwen
- As configurações de skill são convertidas para o formato de skill do Qwen
- Os mapeamentos de tool são tratados automaticamente

Você pode navegar rapidamente pelas extensões disponíveis em diferentes marketplaces usando o comando `/extensions explore`:

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

Este comando abre o respectivo marketplace no seu navegador padrão, permitindo que você descubra novas extensões para aprimorar sua experiência com o Qwen Code.

> **Compatibilidade entre plataformas**: Isso permite que você aproveite os ricos ecossistemas de extensões do Gemini CLI e do Claude Code, expandindo drasticamente a funcionalidade disponível para os usuários do Qwen Code.

#### Pelas extensões do Gemini CLI

O Qwen Code suporta totalmente extensões da [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/). Basta instalá-las usando a URL git:

```bash
qwen extensions install <gemini-cli-extension-github-url>
# or
qwen extensions install <owner>/<repo>
```

As extensões do Gemini são convertidas automaticamente para o formato do Qwen Code durante a instalação:

- `gemini-extension.json` é convertido para `qwen-extension.json`
- Os arquivos de comando TOML são migrados automaticamente para o formato Markdown
- Servidores MCP, arquivos de contexto e configurações são preservados

#### Pelo npm Registry

O Qwen Code suporta a instalação de extensões de registros npm usando nomes de pacotes com escopo (scoped). Isso é ideal para equipes com registros privados que já possuem infraestrutura de autenticação, versionamento e publicação configurada.

```bash
# Install the latest version
qwen extensions install @scope/my-extension

# Install a specific version
qwen extensions install @scope/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

Apenas pacotes com escopo (`@scope/package-name`) são suportados para evitar ambiguidade com o formato abreviado `owner/repo` do GitHub.

A **resolução de registro** segue esta prioridade:

1. Flag CLI `--registry` (substituição explícita)
2. Registro com escopo no `.npmrc` (ex.: `@scope:registry=https://...`)
3. Registro padrão no `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

A **autenticação** é tratada automaticamente por meio da variável de ambiente `NPM_TOKEN` ou das entradas `_authToken` específicas do registro no seu arquivo `.npmrc`.

> **Nota:** As extensões npm devem incluir um arquivo `qwen-extension.json` na raiz do pacote, seguindo o mesmo formato de qualquer outra extensão do Qwen Code. Consulte [Lançamento de extensões](./extension-releasing.md#releasing-through-npm-registry) para detalhes sobre empacotamento.

#### Pelo repositório Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Isso instalará a extensão do servidor MCP do GitHub.

#### Pelo caminho local

```bash
qwen extensions install /path/to/your/extension
```

Observe que criamos uma cópia da extensão instalada, então você precisará executar `qwen extensions update` para buscar alterações tanto das extensões definidas localmente quanto das que estão no GitHub.

### Desinstalando uma extensão

Para desinstalar, execute `qwen extensions uninstall extension-name`. Por exemplo, no caso da instalação anterior:

```
qwen extensions uninstall qwen-cli-security
```

### Desabilitando uma extensão

Por padrão, as extensões estão habilitadas em todos os workspaces. Você pode desabilitar uma extensão completamente ou para um workspace específico.

Por exemplo, `qwen extensions disable extension-name` desabilitará a extensão no nível do usuário, ou seja, em todos os lugares. `qwen extensions disable extension-name --scope=workspace` desabilitará a extensão apenas no workspace atual.

### Habilitando uma extensão

Você pode habilitar extensões usando `qwen extensions enable extension-name`. Também é possível habilitar uma extensão para um workspace específico usando `qwen extensions enable extension-name --scope=workspace` de dentro desse workspace.

Isso é útil se você tiver uma extensão desabilitada no nível global e quiser habilitá-la apenas em locais específicos.

### Atualizando uma extensão

Para extensões instaladas a partir de um caminho local, repositório git ou registro npm, você pode atualizar explicitamente para a versão mais recente com `qwen extensions update extension-name`. Para extensões npm instaladas sem um pin de versão (ex.: `@scope/pkg`), as atualizações verificam a dist-tag `latest`. Para aquelas instaladas com uma dist-tag específica (ex.: `@scope/pkg@beta`), as atualizações acompanham essa tag. Extensões fixadas em uma versão exata (ex.: `@scope/pkg@1.2.0`) são sempre consideradas atualizadas.

Você pode atualizar todas as extensões com:

```
qwen extensions update --all
```

## Como funciona

Na inicialização, o Qwen Code procura extensões em `<home>/.qwen/extensions`

As extensões existem como um diretório que contém um arquivo `qwen-extension.json`. Por exemplo:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

O arquivo `qwen-extension.json` contém a configuração da extensão. O arquivo possui a seguinte estrutura:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: O nome da extensão. É usado para identificar exclusivamente a extensão e para resolução de conflitos quando comandos de extensão têm o mesmo nome que comandos do usuário ou do projeto. O nome deve conter apenas letras minúsculas ou números e usar hífens em vez de underscores ou espaços. É assim que os usuários se referirão à sua extensão na CLI. Observe que esperamos que este nome corresponda ao nome do diretório da extensão.
- `version`: A versão da extensão.
- `mcpServers`: Um mapa de servidores MCP para configurar. A chave é o nome do servidor e o valor é a configuração do servidor. Esses servidores serão carregados na inicialização, assim como os servidores MCP configurados em um [arquivo `settings.json`](./cli/configuration.md). Se uma extensão e um arquivo `settings.json` configurarem um servidor MCP com o mesmo nome, o servidor definido no arquivo `settings.json` terá precedência.
  - Observe que todas as opções de configuração de servidor MCP são suportadas, exceto `trust`.
- `channels`: Um mapa de adaptadores de canal personalizados. A chave é o nome do tipo de canal e o valor possui um `entry` (caminho para o ponto de entrada JS compilado) e um `displayName` opcional. O ponto de entrada deve exportar um objeto `plugin` que esteja em conformidade com a interface `ChannelPlugin`. Consulte [Channel Plugins](../features/channels/plugins) para um guia completo.
- `contextFileName`: O nome do arquivo que contém o contexto da extensão. Ele será usado para carregar o contexto do diretório da extensão. Se essa propriedade não for usada, mas um arquivo `QWEN.md` estiver presente no diretório da extensão, esse arquivo será carregado.
- `commands`: O diretório que contém comandos personalizados (padrão: `commands`). Comandos são arquivos `.md` que definem prompts.
- `skills`: O diretório que contém skills personalizadas (padrão: `skills`). As skills são descobertas automaticamente e ficam disponíveis por meio do comando `/skills`.
- `agents`: O diretório que contém subagentes personalizados (padrão: `agents`). Subagentes são arquivos `.yaml` ou `.md` que definem assistentes de IA especializados.
- `settings`: Um array de configurações que a extensão requer. Durante a instalação, os usuários serão solicitados a fornecer valores para essas configurações. Os valores são armazenados com segurança e passados para os servidores MCP como variáveis de ambiente.
  - Cada configuração possui as seguintes propriedades:
    - `name`: Nome de exibição da configuração
    - `description`: Uma descrição de para que essa configuração é usada
    - `envVar`: O nome da variável de ambiente que será definida
    - `sensitive`: Booleano que indica se o valor deve ser ocultado (ex.: chaves de API, senhas)

### Gerenciando configurações de extensões

As extensões podem exigir configuração por meio de settings (como chaves de API ou credenciais). Essas configurações podem ser gerenciadas usando o comando CLI `qwen extensions settings`:

**Definir um valor de configuração:**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**Listar todas as configurações de uma extensão:**

```bash
qwen extensions settings list <extension-name>
```

**Visualizar valores atuais (usuário e workspace):**

```bash
qwen extensions settings show <extension-name> <setting-name>
```

**Remover um valor de configuração:**

```bash
qwen extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

As configurações podem ser definidas em dois níveis:

- **Nível do usuário** (padrão): As configurações se aplicam a todos os projetos (`~/.qwen/.env`)
- **Nível do workspace**: As configurações se aplicam apenas ao projeto atual (`.qwen/.env`)

As configurações de workspace têm precedência sobre as configurações de usuário. Configurações sensíveis são armazenadas com segurança e nunca são exibidas em texto simples.

Quando o Qwen Code é iniciado, ele carrega todas as extensões e mescla suas configurações. Se houver conflitos, a configuração do workspace terá precedência.

### Comandos personalizados

As extensões podem fornecer [comandos personalizados](./cli/commands.md#custom-commands) colocando arquivos Markdown em um subdiretório `commands/` dentro do diretório da extensão. Esses comandos seguem o mesmo formato dos comandos personalizados de usuário e projeto e usam convenções de nomenclatura padrão.

> **Nota:** O formato de comando foi atualizado de TOML para Markdown. Arquivos TOML estão obsoletos, mas ainda são suportados. Você pode migrar comandos TOML existentes usando o prompt de migração automática que aparece quando arquivos TOML são detectados.

**Exemplo**

Uma extensão chamada `gcp` com a seguinte estrutura:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

Forneceria estes comandos:

- `/deploy` - Exibido como `[gcp] Custom command from deploy.md` na ajuda
- `/gcs:sync` - Exibido como `[gcp] Custom command from sync.md` na ajuda

### Skills personalizadas

As extensões podem fornecer skills personalizadas colocando arquivos de skill em um subdiretório `skills/` dentro do diretório da extensão. Cada skill deve ter um arquivo `SKILL.md` com frontmatter YAML definindo o nome e a descrição da skill.

**Exemplo**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

A skill ficará disponível por meio do comando `/skills` quando a extensão estiver ativa.

### Subagentes personalizados

As extensões podem fornecer subagentes personalizados colocando arquivos de configuração de agent em um subdiretório `agents/` dentro do diretório da extensão. Os agents são definidos usando arquivos YAML ou Markdown.

**Exemplo**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Os subagentes de extensão aparecem na caixa de diálogo do gerenciador de subagentes na seção "Extension Agents".

### Resolução de conflitos

Os comandos de extensão têm a menor precedência. Quando ocorre um conflito com comandos de usuário ou projeto:

1. **Sem conflito**: O comando de extensão usa seu nome natural (ex.: `/deploy`)
2. **Com conflito**: O comando de extensão é renomeado com o prefixo da extensão (ex.: `/gcp.deploy`)

Por exemplo, se um usuário e a extensão `gcp` definirem um comando `deploy`:

- `/deploy` - Executa o comando deploy do usuário
- `/gcp.deploy` - Executa o comando deploy da extensão (marcado com a tag `[gcp]`)

## Variáveis

As extensões do Qwen Code permitem substituição de variáveis no `qwen-extension.json`. Isso pode ser útil se, por exemplo, você precisar do diretório atual para executar um servidor MCP usando `"cwd": "${extensionPath}${/}run.ts"`.

**Variáveis suportadas:**

| variable                   | description                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | O caminho completo da extensão no sistema de arquivos do usuário, ex.: '/Users/username/.qwen/extensions/example-extension'. Isso não resolverá symlinks. |
| `${workspacePath}`         | O caminho completo do workspace atual.                                                                                                            |
| `${/} or ${pathSeparator}` | O separador de caminho (varia conforme o SO).                                                                                                                          |