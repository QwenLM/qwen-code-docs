# Extensões Qwen Code

O pacote de extensões Qwen Code agrupa prompts, servidores MCP e comandos personalizados em um formato familiar e amigável. Com as extensões, você pode expandir as capacidades do Qwen Code e compartilhar essas capacidades com outras pessoas. Elas são projetadas para serem facilmente instaláveis e compartilháveis.

## Gerenciamento de extensões

Oferecemos um conjunto de ferramentas de gerenciamento de extensões usando os comandos `qwen extensions`.

Observe que esses comandos não são suportados dentro da CLI, embora você possa listar as extensões instaladas usando o subcomando `/extensions list`.

Observe que todos esses comandos serão refletidos apenas nas sessões ativas da CLI após reiniciar.

### Instalando uma extensão

Você pode instalar uma extensão usando `qwen extensions install` com uma URL do GitHub ou um caminho local.

Observe que criamos uma cópia da extensão instalada, então você precisará executar `qwen extensions update` para obter as alterações tanto de extensões definidas localmente quanto aquelas no GitHub.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Isso instalará a extensão Qwen Code Security, que oferece suporte ao comando `/security:analyze`.

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

## Criação de extensão

Oferecemos comandos para facilitar o desenvolvimento de extensões.

### Criar uma extensão modelo

Oferecemos vários exemplos de extensões: `context`, `custom-commands`, `exclude-tools` e `mcp-server`. Você pode visualizar esses exemplos [aqui](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples).

Para copiar um desses exemplos para um diretório de desenvolvimento usando o tipo de sua escolha, execute:

```
qwen extensions new caminho/para/o/diretorio custom-commands
```

### Vincular uma extensão local

O comando `qwen extensions link` criará um link simbólico do diretório de instalação da extensão para o caminho de desenvolvimento.

Isso é útil para que você não precise executar `qwen extensions update` toda vez que fizer alterações que deseja testar.

```
qwen extensions link caminho/para/diretorio
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
  "excludeTools": ["run_shell_command"]
}
```

- `name`: O nome da extensão. Isso é usado para identificar exclusivamente a extensão e para resolução de conflitos quando comandos de extensão têm o mesmo nome que comandos de usuário ou projeto. O nome deve ser em letras minúsculas ou números e usar hífens em vez de sublinhados ou espaços. É assim que os usuários se referirão à sua extensão na CLI. Observe que esperamos que este nome corresponda ao nome do diretório da extensão.
- `version`: A versão da extensão.
- `mcpServers`: Um mapa de servidores MCP para configurar. A chave é o nome do servidor e o valor é a configuração do servidor. Esses servidores serão carregados na inicialização, assim como servidores MCP configurados em um [arquivo `settings.json`](./cli/configuration.md). Se tanto uma extensão quanto um arquivo `settings.json` configurarem um servidor MCP com o mesmo nome, o servidor definido no arquivo `settings.json` terá precedência.
  - Observe que todas as opções de configuração do servidor MCP são suportadas, exceto `trust`.
- `contextFileName`: O nome do arquivo que contém o contexto para a extensão. Isso será usado para carregar o contexto do diretório da extensão. Se esta propriedade não for usada, mas um arquivo `QWEN.md` estiver presente no seu diretório de extensão, então esse arquivo será carregado.
- `excludeTools`: Um array de nomes de ferramentas a serem excluídas do modelo. Você também pode especificar restrições específicas por comando para ferramentas que as suportam, como a ferramenta `run_shell_command`. Por exemplo, `"excludeTools": ["run_shell_command(rm -rf)"]` bloqueará o comando `rm -rf`. Observe que isso difere da funcionalidade `excludeTools` do servidor MCP, que pode ser listada na configuração do servidor MCP. **Importante:** Ferramentas especificadas em `excludeTools` serão desativadas para todo o contexto da conversa e afetarão todas as consultas subsequentes na sessão atual.

Quando o Qwen Code inicia, ele carrega todas as extensões e mescla suas configurações. Se houver quaisquer conflitos, a configuração do workspace terá precedência.

### Comandos personalizados

Extensões podem fornecer [comandos personalizados](./cli/commands.md#custom-commands) colocando arquivos TOML em um subdiretório `commands/` dentro do diretório da extensão. Esses comandos seguem o mesmo formato que os comandos personalizados de usuário e projeto e utilizam convenções padrão de nomenclatura.

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

Forneceria estes comandos:

- `/deploy` - Aparece como `[gcp] Comando personalizado de deploy.toml` na ajuda
- `/gcs:sync` - Aparece como `[gcp] Comando personalizado de sync.toml` na ajuda

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