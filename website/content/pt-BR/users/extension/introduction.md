# Extensões do Qwen Code

As extensões do Qwen Code empacotam prompts, servidores MCP, subagentes, habilidades e comandos personalizados em um formato familiar e amigável. Com as extensões, você pode expandir as capacidades do Qwen Code e compartilhá-las com outras pessoas. Elas são projetadas para serem facilmente instaláveis e compartilháveis.

Extensões e plugins da [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) e do [Claude Code Marketplace](https://claudemarketplaces.com/) podem ser instalados diretamente no Qwen Code. Essa compatibilidade entre plataformas oferece acesso a um rico ecossistema de extensões e plugins, expandindo dramaticamente as capacidades do Qwen Code sem exigir que os autores das extensões mantenham versões separadas.

## Gerenciamento de extensões

Oferecemos um conjunto de ferramentas de gerenciamento de extensões usando tanto comandos CLI `qwen extensions` quanto comandos de barra `/extensions` dentro do CLI interativo.

### Gerenciamento de extensões em tempo de execução (comandos de barra)

Você pode gerenciar extensões em tempo de execução dentro do CLI interativo usando comandos de barra `/extensions`. Esses comandos suportam recarga a quente, ou seja, as alterações entram em vigor imediatamente sem precisar reiniciar a aplicação.

| Comando                               | Descrição                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/extensions` ou `/extensions manage` | Gerencia todas as extensões instaladas                                                                          |
| `/extensions install <source>`        | Instala uma extensão a partir de uma URL git, caminho local ou arquivo, URL de arquivo, pacote npm ou marketplace |
| `/extensions explore [source]`        | Abre a página de origem das extensões (Gemini ou ClaudeCode) no seu navegador                                   |

#### O gerenciador interativo de extensões

Executar `/extensions` (ou `/extensions manage`) abre um gerenciador interativo com três abas. Pressione `Tab` ou as setas `←`/`→` para alternar entre elas.

- **Discover** — navegue pelos plugins das suas fontes de marketplace configuradas. Digite para pesquisar, `Enter` para ver os detalhes de um plugin e instalá-lo (será solicitado que você escolha um escopo de instalação). Pressione `Ctrl+R` para atualizar a listagem e `Esc` para voltar.
- **Installed** — suas extensões instaladas, agrupadas por escopo (**User level**, **Project level** e favoritos). Use `↑`/`↓` para navegar, `Space` para ativar/desativar uma extensão, `f` para favoritar e `Enter` para abrir seus detalhes. Servidores MCP fornecidos por uma extensão aparecem aninhados sob a extensão pai com status de conexão ao vivo; você pode ativar ou desativar cada servidor individualmente a partir daí.
- **Sources** — gerencie as fontes de marketplace que alimentam a aba Discover. Use `↑`/`↓` para navegar, `Enter` para selecionar uma fonte e `d` para removê-la. Essas são as mesmas fontes gerenciadas pelos comandos CLI `qwen extensions sources` descritos abaixo.

As alterações feitas aqui são recarregadas a quente imediatamente, sem reiniciar o Qwen Code.

### Gerenciamento de extensões via CLI

Você também pode gerenciar extensões usando comandos CLI `qwen extensions`. Observe que as alterações feitas via comandos CLI serão refletidas nas sessões ativas do CLI ao reiniciar.

### Instalando uma extensão

Você pode instalar uma extensão usando `qwen extensions install` de várias fontes:

#### Do Claude Code Marketplace

O Qwen Code também suporta plugins do [Claude Code Marketplace](https://claudemarketplaces.com/). Instale a partir de um marketplace e escolha um plugin:

```bash
qwen extensions install <nome-do-marketplace>
# ou
qwen extensions install <url-github-do-marketplace>
```

Se você quiser instalar um plugin específico, pode usar o formato com o nome do plugin:

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

Os plugins do Claude são convertidos automaticamente para o formato do Qwen Code durante a instalação:

- `claude-plugin.json` é convertido para `qwen-extension.json`
- Configurações de agente são convertidas para o formato de subagente do Qwen
- Configurações de habilidade são convertidas para o formato de habilidade do Qwen
- Mapeamentos de ferramentas são tratados automaticamente

Você pode navegar rapidamente pelas extensões disponíveis em diferentes marketplaces usando o comando `/extensions explore`:

```bash
# Abrir o marketplace de extensões do Gemini CLI
/extensions explore Gemini

# Abrir o marketplace do Claude Code
/extensions explore ClaudeCode
```

Este comando abre o respectivo marketplace no seu navegador padrão, permitindo que você descubra novas extensões para melhorar sua experiência com o Qwen Code.

> **Compatibilidade entre plataformas**: Isso permite que você aproveite os ricos ecossistemas de extensões tanto do Gemini CLI quanto do Claude Code, expandindo drasticamente a funcionalidade disponível para os usuários do Qwen Code.

#### Das extensões do Gemini CLI

O Qwen Code suporta totalmente extensões da [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/). Basta instalá-las usando a URL git:

```bash
qwen extensions install <url-github-da-extensao-gemini-cli>
# ou
qwen extensions install <proprietario>/<repositorio>
```

As extensões do Gemini são convertidas automaticamente para o formato do Qwen Code durante a instalação:

- `gemini-extension.json` é convertido para `qwen-extension.json`
- Arquivos de comando TOML são migrados automaticamente para o formato Markdown
- Servidores MCP, arquivos de contexto e configurações são preservados

#### Do registro npm

O Qwen Code suporta a instalação de extensões de registros npm usando nomes de pacotes com escopo. Isso é ideal para equipes com registros privados que já possuem infraestrutura de autenticação, versionamento e publicação.

```bash
# Instalar a versão mais recente
qwen extensions install @escopo/minha-extensao

# Instalar uma versão específica
qwen extensions install @escopo/minha-extensao@1.2.0

# Instalar de um registro personalizado
qwen extensions install @escopo/minha-extensao --registry https://seu-registro.com
```

Apenas pacotes com escopo (`@escopo/nome-pacote`) são suportados para evitar ambiguidade com o formato abreviado `owner/repo` do GitHub.

**A resolução do registro** segue esta prioridade:

1. Flag CLI `--registry` (sobrescrita explícita)
2. Registro com escopo do `.npmrc` (ex.: `@escopo:registry=https://...`)
3. Registro padrão do `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

**A autenticação** é tratada automaticamente via variável de ambiente `NPM_TOKEN` ou entradas `_authToken` específicas do registro no seu arquivo `.npmrc`.

> **Observação:** Extensões npm devem incluir um arquivo `qwen-extension.json` na raiz do pacote, seguindo o mesmo formato de qualquer outra extensão do Qwen Code. Consulte [Liberação de Extensões](./extension-releasing.md#liberando-atraves-do-registro-npm) para detalhes de empacotamento.

#### De um repositório Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Isso instalará a extensão do servidor MCP do github.

#### De um caminho local

```bash
qwen extensions install /caminho/para/sua/extensao
```

Arquivos `.zip` e `.tar.gz` locais também são suportados:

```bash
qwen extensions install /caminho/para/sua/extensao.zip
qwen extensions install /caminho/para/sua/extensao.tar.gz
```

O arquivo deve conter uma extensão completa em sua raiz, ou um único diretório de nível superior contendo a extensão.

Observe que criamos uma cópia da extensão instalada, portanto, você precisará executar `qwen extensions update` para receber alterações de extensões definidas localmente e aquelas no GitHub.

#### De uma URL de arquivo

```bash
qwen extensions install https://exemplo.com/sua/extensao.zip
qwen extensions install https://exemplo.com/sua/extensao.tar.gz
```

URLs de arquivo podem ser atualizadas posteriormente, desde que a URL continue apontando para um arquivo mais recente da mesma extensão.

#### Escolhendo um escopo de instalação

Por padrão, uma extensão instalada é ativada globalmente (escopo do usuário). Use `--scope project` para ativá-la apenas no workspace atual:

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` é aceito como um alias de `--scope project`. Isso corresponde à escolha de escopo oferecida ao instalar a partir da aba Discover do `/extensions manage`.

### Gerenciando fontes de marketplace

As fontes de marketplace (marketplaces de plugins Claude) alimentam a aba Discover no `/extensions manage`. Você também pode gerenciá-las a partir do CLI:

```bash
# Adicionar um marketplace (owner/repo, URL git, URL https para marketplace.json ou caminho local)
qwen extensions sources add <source>

# Listar marketplaces configurados
qwen extensions sources list

# Recarregar a listagem de plugins de um marketplace
qwen extensions sources update <name>

# Remover um marketplace
qwen extensions sources remove <name>
```

### Desinstalando uma extensão

Para desinstalar, execute `qwen extensions uninstall nome-da-extensao`. Então, no caso do exemplo de instalação:

```
qwen extensions uninstall qwen-cli-security
```

### Desativando uma extensão

Por padrão, as extensões são ativadas em todos os workspaces. Você pode desativar uma extensão completamente ou para um workspace específico.

Por exemplo, `qwen extensions disable nome-da-extensao` desativará a extensão no nível do usuário, então ela será desativada em todos os lugares. `qwen extensions disable nome-da-extensao --scope=workspace` desativará a extensão apenas no workspace atual.

### Ativando uma extensão

Você pode ativar extensões usando `qwen extensions enable nome-da-extensao`. Você também pode ativar uma extensão para um workspace específico usando `qwen extensions enable nome-da-extensao --scope=workspace` a partir desse workspace.

Isso é útil se você tiver uma extensão desativada no nível superior e ativada apenas em lugares específicos.

### Atualizando uma extensão

Para extensões instaladas a partir de um caminho local, arquivo, URL de arquivo, repositório git ou registro npm, você pode atualizar explicitamente para a versão mais recente com `qwen extensions update nome-da-extensao`. Para extensões npm instaladas sem uma versão fixa (ex.: `@escopo/pkg`), as atualizações verificam a dist-tag `latest`. Para aquelas instaladas com uma dist-tag específica (ex.: `@escopo/pkg@beta`), as atualizações seguem essa tag. Extensões fixadas em uma versão exata (ex.: `@escopo/pkg@1.2.0`) são sempre consideradas atualizadas.

Você pode atualizar todas as extensões com:

```
qwen extensions update --all
```

## Como funciona

Na inicialização, o Qwen Code procura por extensões em `<home>/.qwen/extensions`

As extensões existem como um diretório que contém um arquivo `qwen-extension.json`. Por exemplo:

`<home>/.qwen/extensions/minha-extensao/qwen-extension.json`

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

- `name`: O nome da extensão. Isso é usado para identificar exclusivamente a extensão e para resolução de conflitos quando comandos de extensão têm o mesmo nome que comandos de usuário ou projeto. O nome deve ser em letras minúsculas ou números e usar hífens em vez de underscores ou espaços. É assim que os usuários se referirão à sua extensão no CLI. Observe que esperamos que este nome corresponda ao nome do diretório da extensão.
- `version`: A versão da extensão.
- `mcpServers`: Um mapa de servidores MCP para configurar. A chave é o nome do servidor e o valor é a configuração do servidor. Esses servidores serão carregados na inicialização, assim como os servidores MCP configurados em um arquivo [`settings.json`](../configuration/settings.md). Se tanto uma extensão quanto um arquivo `settings.json` configurarem um servidor MCP com o mesmo nome, o servidor definido no arquivo `settings.json` terá precedência.
  - Observe que todas as opções de configuração do servidor MCP são suportadas, exceto `trust`.
- `channels`: Um mapa de adaptadores de canal personalizados. A chave é o nome do tipo de canal e o valor tem um `entry` (caminho para o ponto de entrada JS compilado) e um `displayName` opcional. O ponto de entrada deve exportar um objeto `plugin` em conformidade com a interface `ChannelPlugin`. Consulte [Plugins de Canal](../features/channels/plugins) para um guia completo.
- `contextFileName`: O nome do arquivo que contém o contexto da extensão. Isso será usado para carregar o contexto do diretório da extensão. Se esta propriedade não for usada, mas um arquivo `QWEN.md` estiver presente no diretório da sua extensão, esse arquivo será carregado.
- `commands`: O diretório que contém comandos personalizados (padrão: `commands`). Comandos são arquivos `.md` que definem prompts.
- `skills`: O diretório que contém habilidades personalizadas (padrão: `skills`). As habilidades são descobertas automaticamente e ficam disponíveis através do comando `/skills`.
- `agents`: O diretório que contém subagentes personalizados (padrão: `agents`). Subagentes são arquivos `.yaml` ou `.md` que definem assistentes de IA especializados.
- `settings`: Um array de configurações que a extensão requer. Ao instalar, os usuários serão solicitados a fornecer valores para essas configurações. Os valores são armazenados de forma segura e passados para servidores MCP como variáveis de ambiente.
  - Cada configuração tem as seguintes propriedades:
    - `name`: Nome de exibição da configuração
    - `description`: Uma descrição de para que esta configuração é usada
    - `envVar`: O nome da variável de ambiente que será definida
    - `sensitive`: Booleano indicando se o valor deve ser ocultado (ex.: chaves de API, senhas)

### Gerenciando configurações de extensões

As extensões podem exigir configuração através de configurações (como chaves de API ou credenciais). Essas configurações podem ser gerenciadas usando o comando CLI `qwen extensions settings`:

**Definir um valor de configuração:**

```bash
qwen extensions settings set <nome-extensao> <nome-configuracao> [--scope user|workspace]
```

**Listar todas as configurações e valores atuais de uma extensão:**

```bash
qwen extensions settings list <nome-extensao>
```

As configurações podem ser definidas em dois níveis:

- **Nível de usuário** (padrão): As configurações se aplicam a todos os projetos (`~/.qwen/.env`)
- **Nível de workspace**: As configurações se aplicam apenas ao projeto atual (`.qwen/.env`)

As configurações de workspace têm precedência sobre as configurações de usuário. Configurações sensíveis são armazenadas de forma segura e nunca exibidas em texto simples.

Quando o Qwen Code é iniciado, ele carrega todas as extensões e mescla suas configurações. Se houver conflitos, a configuração do workspace terá precedência.

### Comandos personalizados

As extensões podem fornecer [comandos personalizados](../features/commands.md#4-comandos-personalizados) colocando arquivos Markdown em um subdiretório `commands/` dentro do diretório da extensão. Esses comandos seguem o mesmo formato dos comandos personalizados de usuário e projeto e usam convenções de nomenclatura padrão.

> **Observação:** O formato do comando foi atualizado de TOML para Markdown. Arquivos TOML estão obsoletos, mas ainda são suportados. Você pode migrar comandos TOML existentes usando o prompt de migração automática que aparece quando arquivos TOML são detectados.

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

- `/deploy` - Mostra como `[gcp] Comando personalizado de deploy.md` na ajuda
- `/gcs:sync` - Mostra como `[gcp] Comando personalizado de sync.md` na ajuda

### Habilidades personalizadas

As extensões podem fornecer habilidades personalizadas colocando arquivos de habilidade em um subdiretório `skills/` dentro do diretório da extensão. Cada habilidade deve ter um arquivo `SKILL.md` com frontmatter YAML definindo o nome e a descrição da habilidade.

**Exemplo**

```
.qwen/extensions/minha-extensao/
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
.qwen/extensions/minha-extensao/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Os subagentes de extensão aparecem no diálogo do gerenciador de subagentes na seção "Extension Agents".

### Resolução de conflitos

Os comandos de extensão têm a menor precedência. Quando ocorre um conflito com comandos de usuário ou projeto:

1. **Sem conflito**: O comando da extensão usa seu nome natural (ex.: `/deploy`)
2. **Com conflito**: O comando da extensão é renomeado com o prefixo da extensão (ex.: `/gcp.deploy`)

Por exemplo, se tanto um usuário quanto a extensão `gcp` definirem um comando `deploy`:

- `/deploy` - Executa o comando deploy do usuário
- `/gcp.deploy` - Executa o comando deploy da extensão (marcado com a tag `[gcp]`)

## Variáveis

As extensões do Qwen Code permitem substituição de variáveis em `qwen-extension.json`. Isso pode ser útil se, por exemplo, você precisar do diretório atual para executar um servidor MCP usando `"cwd": "${extensionPath}${/}run.ts"`.

**Variáveis suportadas:**

| variável                   | descrição                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `${extensionPath}`         | O caminho totalmente qualificado da extensão no sistema de arquivos do usuário, ex.: '/Users/username/.qwen/extensions/example-extension'. Não desfará symlinks. |
| `${workspacePath}`         | O caminho totalmente qualificado do workspace atual.                                                                                             |
| `${/} ou ${pathSeparator}` | O separador de caminho (difere por SO).                                                                                                          |