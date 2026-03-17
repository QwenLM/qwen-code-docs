# Extensões do Qwen Code

O pacote de extensões do Qwen Code agrupa prompts, servidores MCP, subagentes, habilidades e comandos personalizados em um formato familiar e fácil de usar. Com as extensões, você pode ampliar as capacidades do Qwen Code e compartilhá-las com outras pessoas. Elas foram projetadas para serem facilmente instaláveis e compartilháveis.

Extensões e plugins da [Galeria de Extensões do Gemini CLI](https://geminicli.com/extensions/) e do [Mercado de Extensões do Claude Code](https://claudemarketplaces.com/) podem ser instalados diretamente no Qwen Code. Essa compatibilidade entre plataformas oferece acesso a um rico ecossistema de extensões e plugins, expandindo drasticamente as capacidades do Qwen Code sem exigir que os autores das extensões mantenham versões separadas.

## Gerenciamento de extensões

Oferecemos um conjunto de ferramentas de gerenciamento de extensões usando tanto os comandos da CLI `qwen extensions` quanto os comandos com barra `/extensions` dentro da CLI interativa.

### Gerenciamento de Extensões em Tempo de Execução (Comandos com Barra)

Você pode gerenciar extensões em tempo de execução na CLI interativa usando comandos com barra (`/extensions`). Esses comandos suportam recarga dinâmica (*hot-reloading*), ou seja, as alterações entram em vigor imediatamente, sem a necessidade de reiniciar a aplicação.

| Comando                                   | Descrição                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `/extensions` ou `/extensions manage`     | Gerenciar todas as extensões instaladas                                   |
| `/extensions install <origem>`            | Instalar uma extensão a partir de uma URL Git, caminho local ou marketplace |
| `/extensions explore [origem]`          | Abrir a página de origem da extensão (Gemini ou ClaudeCode) no seu navegador |

### Gerenciamento de Extensões via CLI

Você também pode gerenciar extensões usando os comandos da CLI `qwen extensions`. Observe que as alterações feitas por meio dos comandos da CLI serão refletidas nas sessões ativas da CLI após a reinicialização.

### Instalando uma extensão

Você pode instalar uma extensão usando `qwen extensions install` a partir de várias fontes:

#### Da Claude Code Marketplace

O Qwen Code também oferece suporte a plugins da [Claude Code Marketplace](https://claudemarketplaces.com/). Instale um plugin a partir de uma marketplace:

```bash
qwen extensions install <nome-da-marketplace>

# ou
qwen extensions install <url-do-github-da-marketplace>
```

Se você quiser instalar um plugin específico, pode usar o formato com o nome do plugin:

```bash
qwen extensions install <nome-da-marketplace>:<nome-do-plugin>
# ou
qwen extensions install <url-do-github-do-marketplace>:<nome-do-plugin>
```

Por exemplo, para instalar o plugin `prompts.chat` do marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts):

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat

# ou
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Plugins do Claude são automaticamente convertidos para o formato Qwen Code durante a instalação:

- `claude-plugin.json` é convertido para `qwen-extension.json`
- Configurações de agente são convertidas para o formato de subagente Qwen
- Configurações de habilidade são convertidas para o formato de habilidade Qwen
- Mapeamentos de ferramentas são tratados automaticamente

Você pode navegar rapidamente pelas extensões disponíveis em diferentes marketplaces usando o comando `/extensions explore`:

```bash
# Abrir o marketplace de extensões Gemini CLI
/extensions explore Gemini

# Abrir a loja de extensões do Claude Code
/extensions explore ClaudeCode
```

Este comando abre a respectiva loja no seu navegador padrão, permitindo que você descubra novas extensões para aprimorar sua experiência com o Qwen Code.

> **Compatibilidade entre plataformas**: Isso permite que você aproveite os ricos ecossistemas de extensões tanto do Gemini CLI quanto do Claude Code, expandindo drasticamente a funcionalidade disponível para os usuários do Qwen Code.

#### A partir das extensões do Gemini CLI

O Qwen Code oferece suporte completo às extensões da [Galeria de Extensões do Gemini CLI](https://geminicli.com/extensions/). Basta instalá-las usando a URL do repositório no GitHub:

```bash
qwen extensions install <url-do-github-da-extensão-do-gemini-cli>

# ou
qwen extensions install <dono>/<repositório>
```

As extensões do Gemini são automaticamente convertidas para o formato do Qwen Code durante a instalação:

- `gemini-extension.json` é convertido para `qwen-extension.json`  
- Arquivos de comandos em TOML são migrados automaticamente para o formato Markdown  
- Servidores MCP, arquivos de contexto e configurações são preservados

#### De um repositório Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Isso instalará a extensão do servidor MCP do GitHub.

#### De um caminho local

```bash
qwen extensions install /caminho/para/sua/extensão
```

Observe que criamos uma cópia da extensão instalada; portanto, você precisará executar `qwen extensions update` para aplicar alterações tanto em extensões definidas localmente quanto nas disponíveis no GitHub.

### Desinstalando uma extensão

Para desinstalar, execute `qwen extensions uninstall nome-da-extensão`. Assim, no caso do exemplo de instalação:

```
qwen extensions uninstall qwen-cli-security
```

### Desabilitando uma extensão

Por padrão, as extensões estão habilitadas em todos os espaços de trabalho. Você pode desabilitar uma extensão inteiramente ou apenas para um espaço de trabalho específico.

Por exemplo, `qwen extensions disable extension-name` desabilita a extensão no nível do usuário, desabilitando-a em todos os lugares. Já `qwen extensions disable extension-name --scope=workspace` desabilita a extensão apenas no espaço de trabalho atual.

### Habilitando uma extensão

Você pode habilitar extensões usando `qwen extensions enable extension-name`. Também é possível habilitar uma extensão para um espaço de trabalho específico usando `qwen extensions enable extension-name --scope=workspace` a partir desse espaço de trabalho.

Isso é útil se você tiver uma extensão desabilitada no nível superior e quiser habilitá-la apenas em locais específicos.

### Atualizando uma extensão

Para extensões instaladas a partir de um caminho local ou de um repositório Git, você pode atualizar explicitamente para a versão mais recente (conforme indicado no campo `version` do arquivo `qwen-extension.json`) usando o comando `qwen extensions update nome-da-extensao`.

Você pode atualizar todas as extensões com:

```
qwen extensions update --all
```

## Como funciona

Na inicialização, o Qwen Code procura por extensões em `<home>/.qwen/extensions`.

As extensões existem como diretórios que contêm um arquivo `qwen-extension.json`. Por exemplo:

`<home>/.qwen/extensions/minha-extensao/qwen-extension.json`

### `qwen-extension.json`

O arquivo `qwen-extension.json` contém a configuração da extensão. O arquivo tem a seguinte estrutura:

```json
{
  "name": "minha-extensao",
  "version": "1.0.0",
  "mcpServers": {
    "meu-servidor": {
      "command": "node meu-servidor.js"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "Chave de API",
      "description": "Sua chave de API para o serviço",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: O nome da extensão. Esse nome é usado para identificar exclusivamente a extensão e para resolver conflitos quando comandos de extensões tiverem o mesmo nome que comandos de usuário ou de projeto. O nome deve conter apenas letras minúsculas, números e hífens (não sublinhados nem espaços). É assim que os usuários farão referência à sua extensão na CLI. Observe que esperamos que esse nome corresponda ao nome do diretório da extensão.
- `version`: A versão da extensão.
- `mcpServers`: Um mapeamento de servidores MCP a serem configurados. A chave é o nome do servidor e o valor é a configuração do servidor. Esses servidores serão carregados na inicialização, exatamente como servidores MCP configurados em um [`arquivo settings.json`](./cli/configuration.md). Se tanto uma extensão quanto um arquivo `settings.json` configurarem um servidor MCP com o mesmo nome, prevalecerá o servidor definido no arquivo `settings.json`.
  - Observe que todas as opções de configuração de servidor MCP são suportadas, exceto `trust`.
- `contextFileName`: O nome do arquivo que contém o contexto da extensão. Esse arquivo será usado para carregar o contexto a partir do diretório da extensão. Se essa propriedade não for usada, mas houver um arquivo `QWEN.md` presente no diretório da sua extensão, então esse arquivo será carregado.
- `commands`: O diretório que contém comandos personalizados (padrão: `commands`). Comandos são arquivos `.md` que definem *prompts*.
- `skills`: O diretório que contém habilidades personalizadas (padrão: `skills`). As habilidades são descobertas automaticamente e ficam disponíveis por meio do comando `/skills`.
- `agents`: O diretório que contém subagentes personalizados (padrão: `agents`). Subagentes são arquivos `.yaml` ou `.md` que definem assistentes de IA especializados.
- `settings`: Um array de configurações exigidas pela extensão. Ao instalar, os usuários serão solicitados a fornecer valores para essas configurações. Os valores são armazenados com segurança e repassados aos servidores MCP como variáveis de ambiente.
  - Cada configuração possui as seguintes propriedades:
    - `name`: Nome exibido para a configuração
    - `description`: Uma descrição do propósito dessa configuração
    - `envVar`: O nome da variável de ambiente que será definida
    - `sensitive`: Valor booleano que indica se o valor deve ser ocultado (por exemplo, chaves de API, senhas)

### Gerenciando as Configurações das Extensões

As extensões podem exigir configuração por meio de definições (como chaves de API ou credenciais). Essas configurações podem ser gerenciadas usando o comando da CLI `qwen extensions settings`:

**Definir um valor de configuração:**

```bash
qwen extensions settings set <nome-da-extensão> <nome-da-configuração> [--scope user|workspace]
```

**Listar todas as configurações de uma extensão:**

```bash
qwen extensions settings list <nome-da-extensão>
```

**Visualizar os valores atuais (usuário e workspace):**

```bash
qwen extensions settings show <nome-da-extensão> <nome-da-configuração>
```

**Remover um valor de configuração:**

```bash
qwen extensions settings unset <nome-da-extensão> <nome-da-configuração> [--scope user|workspace]
```

As configurações podem ser definidas em dois níveis:

- **Nível de usuário** (padrão): as configurações são aplicadas em todos os projetos (`~/.qwen/.env`)
- **Nível de workspace**: as configurações são aplicadas apenas ao projeto atual (`.qwen/.env`)

As configurações de workspace têm precedência sobre as configurações de usuário. Configurações sensíveis são armazenadas com segurança e nunca exibidas em texto simples.

Quando o Qwen Code é iniciado, ele carrega todas as extensões e mescla suas configurações. Caso haja conflitos, a configuração do workspace tem precedência.

### Comandos personalizados

Extensões podem fornecer [comandos personalizados](./cli/commands.md#custom-commands) ao colocar arquivos Markdown em um subdiretório `commands/` dentro do diretório da extensão. Esses comandos seguem o mesmo formato dos comandos personalizados de usuário e de projeto e usam convenções padrão de nomenclatura.

> **Observação:** O formato dos comandos foi atualizado de TOML para Markdown. Arquivos TOML estão obsoletos, mas ainda são compatíveis. Você pode migrar comandos TOML existentes usando o prompt automático de migração que aparece quando arquivos TOML são detectados.

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

- `/deploy` — Exibido como `[gcp] Comando personalizado de deploy.md` na ajuda  
- `/gcs:sync` — Exibido como `[gcp] Comando personalizado de sync.md` na ajuda

### Skills personalizados

Extensões podem fornecer skills personalizados colocando arquivos de skill em um subdiretório `skills/` dentro do diretório da extensão. Cada skill deve ter um arquivo `SKILL.md` com frontmatter YAML definindo o nome e a descrição da skill.

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

Extensões podem fornecer subagentes personalizados colocando arquivos de configuração de agente em um subdiretório `agents/` dentro do diretório da extensão. Os agentes são definidos usando arquivos YAML ou Markdown.

**Exemplo**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Os subagentes de extensão aparecem na caixa de diálogo do gerenciador de subagentes, na seção "Agentes de extensão".

### Resolução de conflitos

Comandos de extensão têm a menor precedência. Quando ocorre um conflito com comandos do usuário ou do projeto:

1. **Sem conflito**: o comando da extensão usa seu nome natural (por exemplo, `/deploy`)
2. **Com conflito**: o comando da extensão é renomeado com o prefixo da extensão (por exemplo, `/gcp.deploy`)

Por exemplo, se tanto um usuário quanto a extensão `gcp` definirem um comando `deploy`:

- `/deploy` — Executa o comando `deploy` do usuário  
- `/gcp.deploy` — Executa o comando `deploy` da extensão (marcado com a tag `[gcp]`)

## Variáveis

As extensões do Qwen Code permitem a substituição de variáveis em `qwen-extension.json`. Isso pode ser útil, por exemplo, se você precisar do diretório atual para executar um servidor MCP usando `"cwd": "${extensionPath}${/}run.ts"`.

**Variáveis suportadas:**

| variável                   | descrição                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | O caminho completo da extensão no sistema de arquivos do usuário, por exemplo, `/Users/username/.qwen/extensions/example-extension`. Não resolve links simbólicos. |
| `${workspacePath}`         | O caminho completo do workspace atual.                                                                                                                        |
| `${/} ou ${pathSeparator}` | O separador de caminhos (varia conforme o sistema operacional).                                                                                              |