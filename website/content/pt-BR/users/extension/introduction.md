# Extensões do Qwen Code

As extensões do Qwen Code empacotam prompts, servidores MCP, subagentes, habilidades e comandos personalizados em um formato familiar e fácil de usar. Com as extensões, você pode expandir as capacidades do Qwen Code e compartilhar essas capacidades com outras pessoas. Elas são projetadas para serem facilmente instaláveis e compartilháveis.

Extensões e plugins da [Galeria de Extensões do Gemini CLI](https://geminicli.com/extensions/) e do [Marketplace do Claude Code](https://claudemarketplaces.com/) podem ser instalados diretamente no Qwen Code. Essa compatibilidade entre plataformas oferece acesso a um ecossistema rico de extensões e plugins, expandindo drasticamente as capacidades do Qwen Code sem exigir que os autores de extensões mantenham versões separadas.

## Gerenciamento de extensões

Oferecemos um conjunto de ferramentas de gerenciamento de extensões usando tanto comandos CLI `qwen extensions` quanto comandos de barra `/extensions` dentro do CLI interativo.

### Gerenciamento de Extensões em Tempo de Execução (Comandos de Barra)

Você pode gerenciar extensões em tempo de execução dentro do CLI interativo usando comandos de barra `/extensions`. Esses comandos suportam recarga a quente, ou seja, as alterações entram em vigor imediatamente sem a necessidade de reiniciar a aplicação.

| Comando                               | Descrição                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/extensions` ou `/extensions manage` | Gerenciar todas as extensões instaladas                                                                                   |
| `/extensions install <source>`        | Instalar uma extensão a partir de uma URL git, caminho local ou arquivo, URL de arquivo, pacote npm ou marketplace        |
| `/extensions explore [source]`        | Abrir a página de origem das extensões (Gemini ou ClaudeCode) no seu navegador                                             |

#### O gerenciador interativo de extensões

Executar `/extensions` (ou `/extensions manage`) abre um gerenciador interativo com três abas. Pressione `Tab` ou as setas `←`/`→` para alternar entre elas.

- **Discover** — navegue pelos plugins de suas fontes de marketplace configuradas. Digite para pesquisar, `Enter` para ver os detalhes de um plugin e instale-o (você será solicitado a escolher um escopo de instalação). Pressione `Ctrl+R` para recarregar a listagem e `Esc` para voltar.
- **Installed** — suas extensões instaladas, agrupadas por escopo (**User level**, **Project level** e favoritos). Use `↑`/`↓` para navegar, `Space` para ativar/desativar uma extensão, `f` para favoritá-la e `Enter` para abrir seus detalhes. Servidores MCP incluídos por uma extensão aparecem aninhados abaixo da extensão pai com status de conexão em tempo real; você pode ativar ou desativar cada servidor individualmente a partir daí.
- **Sources** — gerencie as fontes de marketplace que alimentam a aba Discover. Use `↑`/`↓` para navegar, `Enter` para selecionar uma fonte e `d` para removê-la. Essas são as mesmas fontes gerenciadas pelos comandos CLI `qwen extensions sources` descritos abaixo.

As alterações feitas aqui são recarregadas a quente imediatamente, sem precisar reiniciar o Qwen Code.

### Gerenciamento de Extensões via CLI

Você também pode gerenciar extensões usando comandos CLI `qwen extensions`. Observe que as alterações feitas via comandos CLI serão refletidas nas sessões CLI ativas após a reinicialização.

### Instalando uma extensão

Você pode instalar uma extensão usando `qwen extensions install` a partir de várias fontes:

#### Do Marketplace do Claude Code

O Qwen Code também suporta plugins do [Marketplace do Claude Code](https://claudemarketplaces.com/). Instale a partir de um marketplace e escolha um plugin:

```bash
qwen extensions install <nome-do-marketplace>
# ou
qwen extensions install <url-github-do-marketplace>
```

Se você quiser instalar um plugin específico, use o formato com o nome do plugin:

```bash
qwen extensions install <nome-do-marketplace>:<nome-do-plugin>
# ou
qwen extensions install <url-github-do-marketplace>:<nome-do-plugin>
```

Por exemplo, para instalar o plugin `prompts.chat` do marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts):

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# ou
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Os plugins do Claude são automaticamente convertidos para o formato do Qwen Code durante a instalação:

- `claude-plugin.json` é convertido para `qwen-extension.json`
- Configurações de agente são convertidas para o formato de subagente do Qwen
- Configurações de habilidade são convertidas para o formato de habilidade do Qwen
- Mapeamentos de ferramentas são tratados automaticamente

Você pode navegar rapidamente pelas extensões disponíveis em diferentes marketplaces usando o comando `/extensions explore`:

```bash
# Abrir marketplace de extensões do Gemini CLI
/extensions explore Gemini

# Abrir marketplace do Claude Code
/extensions explore ClaudeCode
```

Este comando abre o respectivo marketplace no seu navegador padrão, permitindo descobrir novas extensões para melhorar sua experiência com o Qwen Code.

> **Compatibilidade entre Plataformas**: Isso permite que você aproveite os ricos ecossistemas de extensões tanto do Gemini CLI quanto do Claude Code, expandindo drasticamente a funcionalidade disponível para os usuários do Qwen Code.
#### Das Extensões do Gemini CLI

O Qwen Code suporta totalmente extensões da [Galeria de Extensões do Gemini CLI](https://geminicli.com/extensions/). Basta instalá-las usando a URL do git:

```bash
qwen extensions install <gemini-cli-extension-github-url>
# ou
qwen extensions install <owner>/<repo>
```

As extensões do Gemini são automaticamente convertidas para o formato do Qwen Code durante a instalação:

- `gemini-extension.json` é convertido para `qwen-extension.json`
- Arquivos de comando TOML são automaticamente migrados para o formato Markdown
- Servidores MCP, arquivos de contexto e configurações são preservados

#### Do Registro npm

O Qwen Code suporta instalar extensões de registros npm usando nomes de pacotes com escopo. Isso é ideal para times que já possuem infraestrutura de autenticação, versionamento e publicação em registros privados.

```bash
# Instalar a versão mais recente
qwen extensions install @scope/my-extension

# Instalar uma versão específica
qwen extensions install @scope/my-extension@1.2.0

# Instalar de um registro personalizado
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

Apenas pacotes com escopo (`@scope/package-name`) são suportados para evitar ambiguidades com o formato abreviado `owner/repo` do GitHub.

**Resolução de registro** segue esta prioridade:

1. Flag `--registry` da CLI (sobrescrita explícita)
2. Registro com escopo do `.npmrc` (ex.: `@scope:registry=https://...`)
3. Registro padrão do `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

**Autenticação** é tratada automaticamente via variável de ambiente `NPM_TOKEN` ou entradas `_authToken` específicas do registro no arquivo `.npmrc`.

> **Nota:** extensões npm devem incluir um arquivo `qwen-extension.json` na raiz do pacote, seguindo o mesmo formato de qualquer outra extensão do Qwen Code. Veja [Lançamento de Extensões](./extension-releasing.md#releasing-through-npm-registry) para detalhes de empacotamento.

#### De um Repositório Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Isso instalará a extensão do servidor MCP do GitHub.

#### De um Caminho Local

```bash
qwen extensions install /path/to/your/extension
```

Arquivos locais `.zip` e `.tar.gz` também são suportados:

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

O arquivo deve conter uma extensão completa em sua raiz, ou um único diretório de nível superior contendo a extensão.

Observe que criamos uma cópia da extensão instalada, portanto você precisará executar `qwen extensions update` para trazer alterações de extensões definidas localmente e aquelas do GitHub.

#### De uma URL de Arquivo

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

URLs de arquivo podem ser atualizadas posteriormente, desde que a URL continue apontando para um arquivo mais recente da mesma extensão.

#### Escolhendo um escopo de instalação

Por padrão, uma extensão instalada é habilitada globalmente (escopo de usuário). Use `--scope project` para habilitá-la apenas no espaço de trabalho atual:

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` é aceito como um alias para `--scope project`. Isso corresponde à escolha de escopo oferecida ao instalar pela aba Descobrir em `/extensions manage`.

### Gerenciando fontes de marketplace

As fontes de marketplace (marketplaces de plugins do Claude) alimentam a aba Descobrir em `/extensions manage`. Você pode gerenciá-las também via CLI:

```bash
# Adicionar um marketplace (owner/repo, URL git, URL https para marketplace.json, ou caminho local)
qwen extensions sources add <source>

# Listar marketplaces configurados
qwen extensions sources list

# Recarregar a listagem de plugins de um marketplace
qwen extensions sources update <name>

# Remover um marketplace
qwen extensions sources remove <name>
```

### Desinstalando uma extensão

Para desinstalar, execute `qwen extensions uninstall nome-da-extensão`, portanto, no caso do exemplo de instalação:

```
qwen extensions uninstall qwen-cli-security
```

### Desabilitando uma extensão

As extensões são, por padrão, habilitadas em todos os espaços de trabalho. Você pode desabilitar uma extensão completamente ou para um espaço de trabalho específico.

Por exemplo, `qwen extensions disable nome-da-extensão` desabilitará a extensão no nível do usuário, então ela será desabilitada em todos os lugares. `qwen extensions disable nome-da-extensão --scope=workspace` desabilitará a extensão apenas no espaço de trabalho atual.

### Habilitando uma extensão

Você pode habilitar extensões usando `qwen extensions enable nome-da-extensão`. Você também pode habilitar uma extensão para um espaço de trabalho específico usando `qwen extensions enable nome-da-extensão --scope=workspace` dentro daquele espaço de trabalho.

Isso é útil se você tem uma extensão desabilitada no nível superior e só habilitada em lugares específicos.

### Atualizando uma extensão

Para extensões instaladas de um caminho local ou arquivo, uma URL de arquivo, um repositório git ou um registro npm, você pode explicitamente atualizar para a versão mais recente com `qwen extensions update nome-da-extensão`. Para extensões npm instaladas sem um pino de versão (ex.: `@scope/pkg`), as atualizações verificam a dist-tag `latest`. Para aquelas instaladas com uma dist-tag específica (ex.: `@scope/pkg@beta`), as atualizações seguem essa tag. Extensões fixadas em uma versão exata (ex.: `@scope/pkg@1.2.0`) são sempre consideradas atualizadas.
Você pode atualizar todas as extensões com:

```
qwen extensions update --all
```

## Como funciona

Na inicialização, o Qwen Code procura por extensões em `<home>/.qwen/extensions`

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
      "description": "Sua chave de API para o serviço",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: O nome da extensão. É usado para identificar exclusivamente a extensão e para resolução de conflitos quando comandos da extensão têm o mesmo nome que comandos do usuário ou do projeto. O nome deve ser em minúsculas ou números e usar traços em vez de sublinhados ou espaços. É assim que os usuários se referirão à sua extensão na CLI. Observe que esperamos que este nome corresponda ao nome do diretório da extensão.
- `version`: A versão da extensão.
- `mcpServers`: Um mapa de servidores MCP para configurar. A chave é o nome do servidor, e o valor é a configuração do servidor. Esses servidores serão carregados na inicialização, assim como os servidores MCP configurados em um arquivo [`settings.json`](../configuration/settings.md). Se tanto uma extensão quanto um arquivo `settings.json` configurarem um servidor MCP com o mesmo nome, o servidor definido no `settings.json` terá precedência.
  - Observe que todas as opções de configuração do servidor MCP são suportadas, exceto `trust`.
- `channels`: Um mapa de adaptadores de canal personalizados. A chave é o nome do tipo de canal, e o valor tem um `entry` (caminho para o ponto de entrada JS compilado) e opcionalmente `displayName`. O ponto de entrada deve exportar um objeto `plugin` em conformidade com a interface `ChannelPlugin`. Consulte [Plugins de Canal](../features/channels/plugins) para um guia completo.
- `contextFileName`: O nome do arquivo que contém o contexto da extensão. Será usado para carregar o contexto do diretório da extensão. Se esta propriedade não for usada, mas um arquivo `QWEN.md` estiver presente no diretório da extensão, esse arquivo será carregado.
- `commands`: O diretório contendo comandos personalizados (padrão: `commands`). Comandos são arquivos `.md` que definem prompts.
- `skills`: O diretório contendo habilidades personalizadas (padrão: `skills`). As habilidades são descobertas automaticamente e ficam disponíveis através do comando `/skills`.
- `agents`: O diretório contendo subagentes personalizados (padrão: `agents`). Subagentes são arquivos `.yaml` ou `.md` que definem assistentes de IA especializados.
- `settings`: Um array de configurações que a extensão exige. Durante a instalação, os usuários serão solicitados a fornecer valores para essas configurações. Os valores são armazenados de forma segura e passados para os servidores MCP como variáveis de ambiente.
  - Cada configuração possui as seguintes propriedades:
    - `name`: Nome de exibição da configuração
    - `description`: Uma descrição de para que serve esta configuração
    - `envVar`: O nome da variável de ambiente que será definida
    - `sensitive`: Booleano indicando se o valor deve ser ocultado (ex.: chaves de API, senhas)

### Gerenciando Configurações da Extensão

As extensões podem exigir configurações através de ajustes (como chaves de API ou credenciais). Essas configurações podem ser gerenciadas usando o comando CLI `qwen extensions settings`:

**Definir um valor de configuração:**

```bash
qwen extensions settings set <nome-da-extensão> <nome-da-configuração> [--scope user|workspace]
```

**Listar todas as configurações e valores atuais para uma extensão:**

```bash
qwen extensions settings list <nome-da-extensão>
```

As configurações podem ser definidas em dois níveis:

- **Nível do usuário** (padrão): As configurações se aplicam a todos os projetos (`~/.qwen/.env`)
- **Nível do workspace**: As configurações se aplicam apenas ao projeto atual (`.qwen/.env`)

As configurações do workspace têm precedência sobre as do usuário. Configurações sensíveis são armazenadas de forma segura e nunca exibidas em texto simples.

Quando o Qwen Code inicia, ele carrega todas as extensões e mescla suas configurações. Se houver conflitos, a configuração do workspace tem precedência.

### Comandos personalizados

As extensões podem fornecer [comandos personalizados](../features/commands.md#4-custom-commands) colocando arquivos Markdown em um subdiretório `commands/` dentro do diretório da extensão. Esses comandos seguem o mesmo formato dos comandos personalizados do usuário e do projeto e usam convenções de nomenclatura padrão.

> **Nota:** O formato do comando foi atualizado de TOML para Markdown. Arquivos TOML estão obsoletos, mas ainda são suportados. Você pode migrar comandos TOML existentes usando o prompt de migração automática que aparece quando arquivos TOML são detectados.
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

Forneceria os seguintes comandos:

- `/deploy` - Exibido como `[gcp] Custom command from deploy.md` na ajuda
- `/gcs:sync` - Exibido como `[gcp] Custom command from sync.md` na ajuda

### Habilidades personalizadas

As extensões podem fornecer habilidades personalizadas colocando arquivos de habilidade em um subdiretório `skills/` dentro do diretório da extensão. Cada habilidade deve ter um arquivo `SKILL.md` com frontmatter YAML definindo o nome e a descrição da habilidade.

**Exemplo**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

A habilidade estará disponível através do comando `/skills` quando a extensão estiver ativa.

### Subagentes personalizados

As extensões podem fornecer subagentes personalizados colocando arquivos de configuração de agente em um subdiretório `agents/` dentro do diretório da extensão. Os agentes são definidos usando arquivos YAML ou Markdown.

**Exemplo**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Os subagentes de extensão aparecem na caixa de diálogo do gerenciador de subagentes na seção "Agentes de Extensão".

### Resolução de conflitos

Os comandos de extensão têm a precedência mais baixa. Quando ocorre um conflito com comandos de usuário ou de projeto:

1. **Sem conflito**: O comando da extensão usa seu nome natural (ex.: `/deploy`)
2. **Com conflito**: O comando da extensão é renomeado com o prefixo da extensão (ex.: `/gcp.deploy`)

Por exemplo, se tanto um usuário quanto a extensão `gcp` definirem um comando `deploy`:

- `/deploy` - Executa o comando deploy do usuário
- `/gcp.deploy` - Executa o comando deploy da extensão (marcado com a tag `[gcp]`)

## Variáveis

As extensões do Qwen Code permitem substituição de variáveis em `qwen-extension.json`. Isso pode ser útil se, por exemplo, você precisar do diretório atual para executar um servidor MCP usando `"cwd": "${extensionPath}${/}run.ts"`.

**Variáveis suportadas:**

| variável                   | descrição                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | O caminho totalmente qualificado da extensão no sistema de arquivos do usuário, ex.: '/Users/username/.qwen/extensions/example-extension'. Isso não desempacotará links simbólicos. |
| `${workspacePath}`         | O caminho totalmente qualificado do workspace atual.                                                                                                            |
| `${/} ou ${pathSeparator}` | O separador de caminhos (difere por SO).                                                                                                                          |
