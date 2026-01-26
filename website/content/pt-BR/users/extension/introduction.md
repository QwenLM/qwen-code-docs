# Extensões Qwen Code

O pacote de extensões Qwen Code empacota prompts, servidores MCP, subagentes, habilidades e comandos personalizados em um formato familiar e amigável ao usuário. Com as extensões, você pode expandir as capacidades do Qwen Code e compartilhar essas capacidades com outras pessoas. Elas são projetadas para serem facilmente instaláveis e compartilháveis.

Extensões e plugins da [Galeria de Extensões Gemini CLI](https://geminicli.com/extensions/) e do [Claude Code Marketplace](https://claudemarketplaces.com/) podem ser instalados diretamente no Qwen Code. Essa compatibilidade entre plataformas oferece acesso a um rico ecossistema de extensões e plugins, expandindo drasticamente as capacidades do Qwen Code sem exigir que os autores das extensões mantenham versões separadas.

## Gerenciamento de extensões

Oferecemos um conjunto de ferramentas de gerenciamento de extensões usando tanto os comandos CLI `qwen extensions` quanto os comandos de barra `/extensions` dentro do CLI interativo.

### Gerenciamento de Extensões em Tempo de Execução (Comandos com Barra)

Você pode gerenciar extensões em tempo de execução dentro da CLI interativa usando os comandos com barra `/extensions`. Esses comandos suportam recarga dinâmica, ou seja, as alterações entram em vigor imediatamente sem reiniciar a aplicação.

| Comando                                                | Descrição                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `/extensions` ou `/extensions list`                    | Lista todas as extensões instaladas com seu status                        |
| `/extensions install <fonte>`                          | Instala uma extensão a partir de uma URL git, caminho local ou marketplace|
| `/extensions uninstall <nome>`                         | Desinstala uma extensão                                                   |
| `/extensions enable <nome> --scope <user\|workspace>`  | Habilita uma extensão                                                     |
| `/extensions disable <nome> --scope <user\|workspace>` | Desabilita uma extensão                                                   |
| `/extensions update <nome>`                            | Atualiza uma extensão específica                                          |
| `/extensions update --all`                             | Atualiza todas as extensões com atualizações disponíveis                  |
| `/extensions detail <nome>`                            | Mostra detalhes de uma extensão                                           |
| `/extensions explore [fonte]`                          | Abre a página de origem das extensões (Gemini ou ClaudeCode) no navegador |

### Gerenciamento de Extensões via CLI

Você também pode gerenciar extensões usando os comandos da CLI `qwen extensions`. Observe que as alterações feitas por meio de comandos da CLI serão refletidas nas sessões ativas da CLI ao reiniciar.

### Instalando uma extensão

Você pode instalar uma extensão usando `qwen extensions install` a partir de várias fontes:

#### A partir do Claude Code Marketplace

O Qwen Code também suporta plugins do [Claude Code Marketplace](https://claudemarketplaces.com/). Instale a partir de um marketplace e escolha um plugin:

```bash
qwen extensions install <nome-do-marketplace>

# ou
qwen extensions install <url-do-github-do-marketplace>
```

Se você quiser instalar um plugin específico, pode usar o formato com o nome do plugin:

```bash
qwen extensions install <nome-do-marketplace>:<nome-do-plugin>
```

# ou
qwen extensions install <url-do-marketplace-no-github>:<nome-do-plugin>
```

Por exemplo, para instalar o plugin `prompts.chat` do marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts):

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat

# ou
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Os plugins do Claude são automaticamente convertidos para o formato Qwen Code durante a instalação:

- `claude-plugin.json` é convertido para `qwen-extension.json`
- As configurações de agente são convertidas para o formato de subagente Qwen
- As configurações de habilidade são convertidas para o formato de habilidade Qwen
- Os mapeamentos de ferramentas são tratados automaticamente

Você pode navegar rapidamente pelas extensões disponíveis em diferentes marketplaces usando o comando `/extensions explore`:

```bash

# Abrir o marketplace de Extensões do Gemini CLI
/extensions explore Gemini

# Abrir o marketplace do Claude Code
/extensions explore ClaudeCode
```

Este comando abre o respectivo marketplace em seu navegador padrão, permitindo que você descubra novas extensões para aprimorar sua experiência com o Qwen Code.

> **Compatibilidade entre Plataformas**: Isso permite que você aproveite os ricos ecossistemas de extensões tanto do Gemini CLI quanto do Claude Code, expandindo dramaticamente a funcionalidade disponível para os usuários do Qwen Code.

#### A partir das Extensões do Gemini CLI

O Qwen Code oferece suporte total às extensões da [Galeria de Extensões do Gemini CLI](https://geminicli.com/extensions/). Basta instalá-las usando a URL do git:

```bash
qwen extensions install <url-do-github-da-extensão-gemini-cli>

# ou
qwen extensions install <proprietário>/<repositório>
```

As extensões do Gemini são automaticamente convertidas para o formato do Qwen Code durante a instalação:

- `gemini-extension.json` é convertido para `qwen-extension.json`
- Arquivos de comando em TOML são automaticamente migrados para o formato Markdown
- Servidores MCP, arquivos de contexto e configurações são preservados

#### A partir de um repositório Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Isso instalará a extensão do servidor MCP do github.

#### A partir de um caminho local

```bash
qwen extensions install /path/to/your/extension
```

Observe que criamos uma cópia da extensão instalada, então você precisará executar `qwen extensions update` para obter as alterações tanto das extensões definidas localmente quanto das que estão no GitHub.

### Desinstalando uma extensão

Para desinstalar, execute `qwen extensions uninstall nome-da-extensão`, então, no caso do exemplo de instalação:

```
qwen extensions uninstall qwen-cli-security
```

### Desativando uma extensão

Por padrão, as extensões estão ativadas em todos os espaços de trabalho. Você pode desativar uma extensão completamente ou apenas para um espaço de trabalho específico.

Por exemplo, `qwen extensions disable extension-name` irá desativar a extensão no nível do usuário, então ela será desativada em todos os lugares. `qwen extensions disable extension-name --scope=workspace` irá desativar a extensão apenas no espaço de trabalho atual.

### Ativando uma extensão

Você pode ativar extensões usando `qwen extensions enable extension-name`. Você também pode ativar uma extensão para um espaço de trabalho específico usando `qwen extensions enable extension-name --scope=workspace` dentro desse espaço de trabalho.

Isso é útil se você tiver uma extensão desativada no nível superior e quiser ativá-la apenas em locais específicos.

### Atualizando uma extensão

Para extensões instaladas a partir de um caminho local ou de um repositório git, você pode atualizar explicitamente para a versão mais recente (conforme refletido no campo `version` do arquivo `qwen-extension.json`) com o comando `qwen extensions update nome-da-extensão`.

Você pode atualizar todas as extensões com:

```
qwen extensions update --all
```

## Como funciona

Na inicialização, o Qwen Code procura por extensões em `<home>/.qwen/extensions`

As extensões existem como um diretório que contém um arquivo `qwen-extension.json`. Por exemplo:

`<home>/.qwen/extensions/minha-extensao/qwen-extension.json`

### `qwen-extension.json`

O arquivo `qwen-extension.json` contém a configuração para a extensão. O arquivo possui a seguinte estrutura:

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
  "commands": "comandos",
  "skills": "habilidades",
  "agents": "agentes",
  "settings": [
    {
      "name": "Chave de API",
      "description": "Sua chave de API para o serviço",
      "envVar": "MINHA_CHAVE_API",
      "sensitive": true
    }
  ]
}
```

- `name`: O nome da extensão. Isso é usado para identificar exclusivamente a extensão e para resolução de conflitos quando comandos de extensão têm o mesmo nome que comandos de usuário ou projeto. O nome deve ser em letras minúsculas ou números e usar hífens em vez de sublinhados ou espaços. É assim que os usuários se referirão à sua extensão na CLI. Observe que esperamos que este nome corresponda ao nome do diretório da extensão.
- `version`: A versão da extensão.
- `mcpServers`: Um mapa de servidores MCP a serem configurados. A chave é o nome do servidor e o valor é a configuração do servidor. Esses servidores serão carregados na inicialização, assim como servidores MCP configurados em um [arquivo `settings.json`](./cli/configuration.md). Se tanto uma extensão quanto um arquivo `settings.json` configurarem um servidor MCP com o mesmo nome, o servidor definido no arquivo `settings.json` terá precedência.
  - Observe que todas as opções de configuração do servidor MCP são suportadas, exceto `trust`.
- `contextFileName`: O nome do arquivo que contém o contexto para a extensão. Isso será usado para carregar o contexto do diretório da extensão. Se esta propriedade não for usada, mas um arquivo `QWEN.md` estiver presente no seu diretório de extensão, então esse arquivo será carregado.
- `commands`: O diretório contendo comandos personalizados (padrão: `comandos`). Comandos são arquivos `.md` que definem prompts.
- `skills`: O diretório contendo habilidades personalizadas (padrão: `habilidades`). Habilidades são descobertas automaticamente e ficam disponíveis através do comando `/skills`.
- `agents`: O diretório contendo subagentes personalizados (padrão: `agentes`). Subagentes são arquivos `.yaml` ou `.md` que definem assistentes de IA especializados.
- `settings`: Uma matriz de configurações que a extensão requer. Durante a instalação, os usuários serão solicitados a fornecer valores para essas configurações. Os valores são armazenados com segurança e passados aos servidores MCP como variáveis de ambiente.
  - Cada configuração tem as seguintes propriedades:
    - `name`: Nome de exibição para a configuração
    - `description`: Uma descrição do uso desta configuração
    - `envVar`: O nome da variável de ambiente que será definida
    - `sensitive`: Booleano indicando se o valor deve ser ocultado (por exemplo, chaves de API, senhas)

### Gerenciando Configurações de Extensões

As extensões podem exigir configuração por meio de definições (como chaves de API ou credenciais). Essas configurações podem ser gerenciadas usando o comando da CLI `qwen extensions settings`:

**Definir um valor de configuração:**

```bash
qwen extensions settings set <nome-da-extensão> <nome-da-configuração> [--scope user|workspace]
```

**Listar todas as configurações de uma extensão:**

```bash
qwen extensions settings list <nome-da-extensão>
```

**Visualizar valores atuais (usuário e workspace):**

```bash
qwen extensions settings show <nome-da-extensão> <nome-da-configuração>
```

**Remover um valor de configuração:**

```bash
qwen extensions settings unset <nome-da-extensão> <nome-da-configuração> [--scope user|workspace]
```

As configurações podem ser definidas em dois níveis:

- **Nível de usuário** (padrão): As configurações se aplicam a todos os projetos (`~/.qwen/.env`)
- **Nível de workspace**: As configurações se aplicam apenas ao projeto atual (`.qwen/.env`)

As configurações do workspace têm precedência sobre as configurações do usuário. Configurações sensíveis são armazenadas com segurança e nunca exibidas em texto simples.

Quando o Qwen Code é iniciado, ele carrega todas as extensões e mescla suas configurações. Se houver quaisquer conflitos, a configuração do workspace terá precedência.

### Comandos personalizados

Extensões podem fornecer [comandos personalizados](./cli/commands.md#custom-commands) colocando arquivos Markdown em um subdiretório `commands/` dentro do diretório da extensão. Esses comandos seguem o mesmo formato que os comandos personalizados de usuário e projeto e utilizam convenções padrão de nomenclatura.

> **Observação:** O formato de comando foi atualizado de TOML para Markdown. Arquivos TOML estão obsoletos, mas ainda são suportados. Você pode migrar comandos TOML existentes usando o prompt de migração automática que aparece quando arquivos TOML são detectados.

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

- `/deploy` - Aparece como `[gcp] Comando personalizado de deploy.md` na ajuda
- `/gcs:sync` - Aparece como `[gcp] Comando personalizado de sync.md` na ajuda

### Habilidades personalizadas

Extensões podem fornecer habilidades personalizadas colocando arquivos de habilidade em um subdiretório `skills/` dentro do diretório da extensão. Cada habilidade deve ter um arquivo `SKILL.md` com frontmatter YAML definindo o nome e a descrição da habilidade.

**Exemplo**

```
.qwen/extensions/minha-extensao/
├── qwen-extension.json
└── skills/
    └── processador-pdf/
        └── SKILL.md
```

A habilidade estará disponível através do comando `/skills` quando a extensão estiver ativa.

### Subagentes personalizados

Extensões podem fornecer subagentes personalizados colocando arquivos de configuração de agente em um subdiretório `agents/` dentro do diretório da extensão. Agentes são definidos usando arquivos YAML ou Markdown.

**Exemplo**

```
.qwen/extensions/minha-extensao/
├── qwen-extension.json
└── agents/
    └── especialista-testes.yaml
```

Subagentes de extensão aparecem na caixa de diálogo do gerenciador de subagentes na seção "Agentes de Extensão".

### Resolução de conflitos

Comandos de extensão têm a precedência mais baixa. Quando ocorre um conflito com comandos do usuário ou do projeto:

1. **Sem conflito**: O comando da extensão usa seu nome natural (por exemplo, `/deploy`)
2. **Com conflito**: O comando da extensão é renomeado com o prefixo da extensão (por exemplo, `/gcp.deploy`)

Por exemplo, se tanto um usuário quanto a extensão `gcp` definirem um comando `deploy`:

- `/deploy` - Executa o comando deploy do usuário
- `/gcp.deploy` - Executa o comando deploy da extensão (marcado com a tag `[gcp]`)

## Variáveis

As extensões do Qwen Code permitem substituição de variáveis em `qwen-extension.json`. Isso pode ser útil se, por exemplo, você precisar do diretório atual para executar um servidor MCP usando `"cwd": "${extensionPath}${/}run.ts"`.

**Variáveis suportadas:**

| variável                   | descrição                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | O caminho completo da extensão no sistema de arquivos do usuário, por exemplo, '/Users/username/.qwen/extensions/exemplo-extensao'. Isso não irá desfazer links simbólicos. |
| `${workspacePath}`         | O caminho completo do workspace atual.                                                                                                                      |
| `${/} ou ${pathSeparator}` | O separador de caminho (diferente por sistema operacional).                                                                                                 |