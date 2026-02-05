# Configuração do Qwen Code

> [!tip]
>
> **Autenticação / Chaves de API:** Autenticação (Qwen OAuth vs API compatível com OpenAI) e variáveis de ambiente relacionadas à autenticação (como `OPENAI_API_KEY`) estão documentadas em **[Autenticação](../configuration/auth)**.

> [!note]
>
> **Observação sobre o Novo Formato de Configuração**: O formato do arquivo `settings.json` foi atualizado para uma nova estrutura mais organizada. O formato antigo será migrado automaticamente.
> O Qwen Code oferece várias maneiras de configurar seu comportamento, incluindo variáveis de ambiente, argumentos de linha de comando e arquivos de configurações. Este documento descreve os diferentes métodos de configuração e as opções disponíveis.

## Camadas de configuração

A configuração é aplicada na seguinte ordem de precedência (números menores são substituídos por números maiores):

| Nível | Fonte da Configuração  | Descrição                                                                       |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1     | Valores padrão         | Padrões codificados dentro do aplicativo                                        |
| 2     | Arquivo de padrões do sistema | Configurações padrão em todo o sistema que podem ser substituídas por outros arquivos de configuração |
| 3     | Arquivo de configurações do usuário | Configurações globais para o usuário atual                                    |
| 4     | Arquivo de configurações do projeto | Configurações específicas do projeto                                           |
| 5     | Arquivo de configurações do sistema | Configurações em todo o sistema que substituem todos os outros arquivos de configuração |
| 6     | Variáveis de ambiente  | Variáveis em todo o sistema ou específicas da sessão, potencialmente carregadas de arquivos `.env` |
| 7     | Argumentos de linha de comando | Valores passados ao iniciar o CLI                                             |

## Arquivos de configurações

O Qwen Code usa arquivos de configurações JSON para persistência de configurações. Existem quatro locais para esses arquivos:

| Tipo de arquivo         | Localização                                                                                                                                                                                                                                                                      | Escopo                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquivo padrão do sistema | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>O caminho pode ser substituído usando a variável de ambiente `QWEN_CODE_SYSTEM_DEFAULTS_PATH`. | Fornece uma camada base de configurações padrão em todo o sistema. Essas configurações têm a menor precedência e devem ser substituídas por configurações de usuário, projeto ou substituições do sistema.                      |
| Arquivo de configurações do usuário | `~/.qwen/settings.json` (onde `~` é seu diretório pessoal).                                                                                                                                                                                                                       | Aplica-se a todas as sessões do Qwen Code para o usuário atual.                                                                                                                                                          |
| Arquivo de configurações do projeto | `.qwen/settings.json` dentro do diretório raiz do seu projeto.                                                                                                                                                                                                                   | Aplica-se somente ao executar o Qwen Code a partir desse projeto específico. As configurações do projeto substituem as configurações do usuário.                                                                           |
| Arquivo de configurações do sistema | Linux: `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>O caminho pode ser substituído usando a variável de ambiente `QWEN_CODE_SYSTEM_SETTINGS_PATH`.                    | Aplica-se a todas as sessões do Qwen Code no sistema, para todos os usuários. As configurações do sistema substituem as configurações do usuário e do projeto. Pode ser útil para administradores de sistema em empresas que desejam controlar as configurações do Qwen Code dos usuários. |

> [!note]
>
> **Observação sobre variáveis de ambiente nas configurações:** Valores de string nos seus arquivos `settings.json` podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`. Essas variáveis serão resolvidas automaticamente quando as configurações forem carregadas. Por exemplo, se você tiver uma variável de ambiente `MY_API_TOKEN`, poderá usá-la no `settings.json` assim: `"apiKey": "$MY_API_TOKEN"`.

### O diretório `.qwen` em seu projeto

Além de um arquivo de configurações do projeto, o diretório `.qwen` de um projeto pode conter outros arquivos específicos do projeto relacionados ao funcionamento do Qwen Code, tais como:

- [Perfis personalizados de sandbox](../features/sandbox) (por exemplo, `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).
- [Habilidades de Agentes](../features/skills) (experimental) sob `.qwen/skills/` (cada Habilidade é um diretório contendo um `SKILL.md`).

### Migração de configuração

O Qwen Code migra automaticamente as configurações antigas para o novo formato. Os arquivos de configurações antigos são copiados antes da migração. As seguintes configurações foram renomeadas de nomes negativos (`disable*`) para positivos (`enable*`):

| Configuração Antiga                      | Nova Configuração                           | Observações                        |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate`                  | Consolidado em uma única opção     |
| `disableLoadingPhrases`                  | `ui.accessibility.enableLoadingPhrases`     |                                    |
| `disableFuzzySearch`                     | `context.fileFiltering.enableFuzzySearch`   |                                    |
| `disableCacheControl`                    | `model.generationConfig.enableCacheControl` |                                    |

> [!note]
>
> **Inversão de valores booleanos:** Durante a migração, os valores booleanos são invertidos (por exemplo, `disableAutoUpdate: true` se torna `enableAutoUpdate: false`).

#### Política de consolidação para `disableAutoUpdate` e `disableUpdateNag`

Quando ambas as configurações legadas estiverem presentes com valores diferentes, a migração segue esta política: se **qualquer uma** entre `disableAutoUpdate` **ou** `disableUpdateNag` for `true`, então `enableAutoUpdate` se torna `false`:

| `disableAutoUpdate` | `disableUpdateNag` | `enableAutoUpdate` migrado |
| ------------------- | ------------------ | -------------------------- |
| `false`             | `false`            | `true`                     |
| `false`             | `true`             | `false`                    |
| `true`              | `false`            | `false`                    |
| `true`              | `true`             | `false`                    |

### Configurações disponíveis em `settings.json`

As configurações são organizadas em categorias. Todas as configurações devem ser colocadas dentro do objeto da categoria de nível superior correspondente em seu arquivo `settings.json`.

#### geral

| Configuração                    | Tipo    | Descrição                                                                                                                                                                         | Padrão      |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor`       | string  | O editor preferido para abrir arquivos.                                                                                                                                           | `undefined` |
| `general.vimMode`               | boolean | Habilitar atalhos de teclado do Vim.                                                                                                                                              | `false`     |
| `general.enableAutoUpdate`      | boolean | Habilitar verificações e instalações automáticas de atualizações na inicialização.                                                                                                | `true`      |
| `general.gitCoAuthor`           | boolean | Adicionar automaticamente um trailer "Co-authored-by" às mensagens de commit do git quando os commits são feitos através do Qwen Code.                                            | `true`      |
| `general.checkpointing.enabled` | boolean | Habilitar ponto de verificação da sessão para recuperação.                                                                                                                        | `false`     |
| `general.defaultFileEncoding`   | string  | Codificação padrão para novos arquivos. Use `"utf-8"` (padrão) para UTF-8 sem BOM ou `"utf-8-bom"` para UTF-8 com BOM. Altere isso somente se seu projeto exigir especificamente BOM. | `"utf-8"`   |

#### output

| Configuração    | Tipo   | Descrição                          | Padrão   | Valores Possíveis  |
| --------------- | ------ | ---------------------------------- | -------- | ------------------ |
| `output.format` | string | O formato da saída do CLI.         | `"text"` | `"text"`, `"json"` |

#### ui

| Configuração                            | Tipo             | Descrição                                                                                                                                                                                                                                                                                                                                                                    | Padrão      |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `ui.theme`                              | string           | O tema de cores para a interface. Veja [Temas](../configuration/themes) para opções disponíveis.                                                                                                                                                                                                                                                                               | `undefined` |
| `ui.customThemes`                       | objeto           | Definições de temas personalizados.                                                                                                                                                                                                                                                                                                                                          | `{}`        |
| `ui.hideWindowTitle`                    | booleano         | Oculta a barra de título da janela.                                                                                                                                                                                                                                                                                                                                          | `false`     |
| `ui.hideTips`                           | booleano         | Oculta dicas úteis na interface.                                                                                                                                                                                                                                                                                                                                             | `false`     |
| `ui.hideBanner`                         | booleano         | Oculta o banner do aplicativo.                                                                                                                                                                                                                                                                                                                                               | `false`     |
| `ui.hideFooter`                         | booleano         | Oculta o rodapé da interface.                                                                                                                                                                                                                                                                                                                                                | `false`     |
| `ui.showMemoryUsage`                    | booleano         | Exibe informações de uso de memória na interface.                                                                                                                                                                                                                                                                                                                            | `false`     |
| `ui.showLineNumbers`                    | booleano         | Mostra números de linha nos blocos de código na saída do CLI.                                                                                                                                                                                                                                                                                                                  | `true`      |
| `ui.showCitations`                      | booleano         | Mostra citações para texto gerado no chat.                                                                                                                                                                                                                                                                                                                                   | `true`      |
| `enableWelcomeBack`                     | booleano         | Mostra diálogo de boas-vindas ao retornar a um projeto com histórico de conversa. Quando ativado, o Qwen Code detectará automaticamente se você está retornando a um projeto com um resumo de projeto previamente gerado (`.qwen/PROJECT_SUMMARY.md`) e mostrará um diálogo permitindo continuar sua conversa anterior ou começar do zero. | `true`      |
| `ui.accessibility.enableLoadingPhrases` | booleano         | Habilita frases de carregamento (desative para acessibilidade).                                                                                                                                                                                                                                                                                                              | `true`      |
| `ui.accessibility.screenReader`         | booleano         | Ativa o modo leitor de tela, que ajusta a interface para melhor compatibilidade com leitores de tela.                                                                                                                                                                                                                                                                        | `false`     |
| `ui.customWittyPhrases`                 | array de strings | Uma lista de frases personalizadas para exibir durante estados de carregamento. Quando fornecido, o CLI percorrerá essas frases em vez das padrão.                                                                                                                                                                                                                            | `[]`        |

#### ide

| Configuração       | Tipo    | Descrição                                              | Padrão  |
| ------------------ | ------- | ------------------------------------------------------ | ------- |
| `ide.enabled`      | boolean | Habilita o modo de integração com IDE.                 | `false` |
| `ide.hasSeenNudge` | boolean | Indica se o usuário já viu a sugestão de integração IDE. | `false` |

#### privacidade

| Configuração                     | Tipo    | Descrição                                | Padrão |
| -------------------------------- | ------- | ---------------------------------------- | ------ |
| `privacy.usageStatisticsEnabled` | boolean | Habilita a coleta de estatísticas de uso. | `true` |

#### model

| Configuração                                         | Tipo    | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Padrão      |
| ---------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                         | string  | O modelo Qwen a ser usado para conversas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `undefined` |
| `model.maxSessionTurns`                              | número  | Número máximo de turnos de usuário/modelo/ferramenta para manter em uma sessão. -1 significa ilimitado.                                                                                                                                                                                                                                                                                                                                                                                                         | `-1`        |
| `model.summarizeToolOutput`                          | objeto  | Habilita ou desabilita a sumarização da saída da ferramenta. Você pode especificar o orçamento de tokens para a sumarização usando a configuração `tokenBudget`. Nota: Atualmente apenas a ferramenta `run_shell_command` é suportada. Por exemplo `{"run_shell_command": {"tokenBudget": 2000}}`                                                                                                                                                                                                                     | `undefined` |
| `model.generationConfig`                             | objeto  | Substituições avançadas passadas para o gerador de conteúdo subjacente. Suporta controles de requisição como `timeout`, `maxRetries`, `enableCacheControl`, `contextWindowSize` (substitui o tamanho da janela de contexto do modelo), `customHeaders` (cabeçalhos HTTP personalizados para requisições de API), e `extra_body` (parâmetros adicionais no corpo para requisições de API compatíveis com OpenAI apenas), juntamente com ajustes finos sob `samplingParams` (por exemplo `temperature`, `top_p`, `max_tokens`). Deixe não definido para confiar nos padrões do provedor. | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | número  | Define o limite para compressão do histórico de chat como uma porcentagem do limite total de tokens do modelo. Este é um valor entre 0 e 1 que se aplica tanto à compressão automática quanto ao comando manual `/compress`. Por exemplo, um valor de `0.6` acionará a compressão quando o histórico de chat exceder 60% do limite de tokens. Use `0` para desativar completamente a compressão.                                                                                                                                                               | `0.7`       |
| `model.skipNextSpeakerCheck`                         | boolean | Pula a verificação do próximo palestrante.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `false`     |
| `model.skipLoopDetection`                            | boolean | Desativa verificações de detecção de loop. A detecção de loop previne loops infinitos nas respostas de IA, mas pode gerar falsos positivos que interrompem fluxos de trabalho legítimos. Habilite esta opção se você experimentar interrupções frequentes de detecção de loop falsa.                                                                                                                                                                                                                                                    | `false`     |
| `model.skipStartupContext`                           | boolean | Pula o envio do contexto inicial do workspace (resumo do ambiente e reconhecimento) no início de cada sessão. Habilite isso se você preferir fornecer contexto manualmente ou quiser economizar tokens na inicialização.                                                                                                                                                                                                                                                                                             | `false`     |
| `model.enableOpenAILogging`                          | boolean | Habilita o registro de chamadas da API OpenAI para depuração e análise. Quando habilitado, requisições e respostas da API são registradas em arquivos JSON.                                                                                                                                                                                                                                                                                                                                                  | `false`     |
| `model.openAILoggingDir`                             | string  | Caminho personalizado para diretório de logs da API OpenAI. Se não especificado, o padrão é `logs/openai` no diretório de trabalho atual. Suporta caminhos absolutos, caminhos relativos (resolvidos a partir do diretório atual) e expansão `~` (diretório home).                                                                                                                                                                                                                                                            | `undefined` |

**Exemplo model.generationConfig:**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "contextWindowSize": 128000,
      "enableCacheControl": true,
      "customHeaders": {
        "X-Request-ID": "req-123",
        "X-User-ID": "user-456"
      },
      "extra_body": {
        "enable_thinking": true
      },
      "samplingParams": {
        "temperature": 0.2,
        "top_p": 0.8,
        "max_tokens": 1024
      }
    }
  }
}
```

**contextWindowSize:**

Substitui o tamanho padrão da janela de contexto para o modelo selecionado. O Qwen Code determina a janela de contexto usando padrões internos baseados em correspondência de nome de modelo, com um valor constante como fallback. Use esta configuração quando o limite efetivo de contexto de um provedor diferir do padrão do Qwen Code. Este valor define a capacidade máxima de contexto assumida pelo modelo, não um limite de tokens por requisição.

**customHeaders:**

Permite adicionar cabeçalhos HTTP personalizados a todas as requisições de API. Isso é útil para rastreamento de requisições, monitoramento, roteamento via gateway de API ou quando diferentes modelos exigem cabeçalhos diferentes. Se `customHeaders` estiver definido em `modelProviders[].generationConfig.customHeaders`, será usado diretamente; caso contrário, serão usados os cabeçalhos de `model.generationConfig.customHeaders`. Não ocorre mesclagem entre os dois níveis.

O campo `extra_body` permite adicionar parâmetros personalizados ao corpo da requisição enviado para a API. Isso é útil para opções específicas do provedor que não são cobertas pelos campos de configuração padrão. **Nota: Este campo é suportado apenas para provedores compatíveis com OpenAI (`openai`, `qwen-oauth`). É ignorado para provedores Anthropic e Gemini.** Se `extra_body` estiver definido em `modelProviders[].generationConfig.extra_body`, será usado diretamente; caso contrário, serão usados os valores de `model.generationConfig.extra_body`.

**exemplos model.openAILoggingDir:**

- `"~/qwen-logs"` - Registra no diretório `~/qwen-logs`
- `"./custom-logs"` - Registra em `./custom-logs` relativo ao diretório atual
- `"/tmp/openai-logs"` - Registra no caminho absoluto `/tmp/openai-logs`

#### modelProviders

Use `modelProviders` para declarar listas de modelos curadas por tipo de autenticação que o seletor `/model` pode alternar. As chaves devem ser tipos de autenticação válidos (`openai`, `anthropic`, `gemini`, `vertex-ai`, etc.). Cada entrada requer um `id` e **deve incluir `envKey`**, com opções opcionais de `name`, `description`, `baseUrl` e `generationConfig`. As credenciais nunca são persistidas nas configurações; o tempo de execução as lê de `process.env[envKey]`. Os modelos OAuth da Qwen permanecem codificados e não podem ser substituídos.

##### Exemplo

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "customHeaders": {
            "X-Model-Version": "v1.0",
            "X-Request-Priority": "high"
          },
          "extra_body": {
            "enable_thinking": true
          },
          "samplingParams": { "temperature": 0.2 }
        }
      }
    ],
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ],
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ]
  }
}
```

> [!note]
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini, Vertex AI, etc., devem ser definidos via `modelProviders`. O comando `/auth` intencionalmente lista apenas os fluxos OAuth embutidos do Qwen e OpenAI.

##### Camadas de resolução e atomicidade

Os valores efetivos de auth/modelo/credencial são escolhidos por campo usando a seguinte precedência (a primeira presente vence). Você pode combinar `--auth-type` com `--model` para apontar diretamente para uma entrada de provedor; essas flags da CLI são executadas antes das outras camadas.

| Camada (mais alta → mais baixa) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Substituições programáticas      | `/auth `                            | entrada `/auth`                                 | entrada `/auth`                                     | entrada `/auth`                                      | —                      | —                                 |
| Seleção de provedor de modelo    | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Argumentos da CLI                | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou equivalentes específicos do provedor) | `--openaiBaseUrl` (ou equivalentes específicos do provedor) | —                      | —                                 |
| Variáveis de ambiente            | —                                   | Mapeamento específico do provedor (ex: `OPENAI_MODEL`) | Mapeamento específico do provedor (ex: `OPENAI_API_KEY`) | Mapeamento específico do provedor (ex: `OPENAI_BASE_URL`) | —                      | —                                 |
| Configurações (`settings.json`)  | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Padrão / computado               | Retorna para `AuthType.QWEN_OAUTH`  | Padrão embutido (OpenAI ⇒ `qwen3-coder-plus`)   | —                                                   | —                                                    | —                      | `Config.getProxy()` se configurado |

\*Quando presentes, as flags de autenticação da CLI substituem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de autenticação. Qwen OAuth e OpenAI são os únicos tipos de autenticação exibidos sem configuração adicional.

Valores provenientes do provedor de modelo são aplicados atomicamente: assim que um modelo de provedor está ativo, todos os campos que ele define são protegidos contra camadas inferiores até que você limpe manualmente as credenciais via `/auth`. A `generationConfig` final é a projeção entre todas as camadas—camadas inferiores apenas preenchem lacunas deixadas pelas superiores, e a camada de provedor permanece intransponível.

A estratégia de mesclagem para `modelProviders` é SUBSTITUIR: todo o `modelProviders` das configurações do projeto substituirá a seção correspondente nas configurações do usuário, em vez de mesclar os dois.

##### Camadas de configuração de geração

Precedência por campo para `generationConfig`:

1. Substituições programáticas (por exemplo, alterações em tempo de execução em `/model`, `/auth`)
2. `modelProviders[authType][].generationConfig`
3. `settings.model.generationConfig`
4. Padrões do gerador de conteúdo (`getDefaultGenerationConfig` para OpenAI, `getParameterValue` para Gemini, etc.)

`samplingParams`, `customHeaders` e `extra_body` são tratados atomicamente; os valores do provedor substituem o objeto inteiro. Se `modelProviders[].generationConfig` definir esses campos, eles serão usados diretamente; caso contrário, serão utilizados os valores de `model.generationConfig`. Não ocorre mesclagem entre os níveis de configuração do provedor e global. Os padrões do gerador de conteúdo são aplicados por último, de forma que cada provedor mantenha sua linha de base ajustada.

##### Persistência de seleção e recomendações

> [!important]
> Defina `modelProviders` no escopo do usuário em `~/.qwen/settings.json` sempre que possível e evite persistir substituições de credenciais em qualquer escopo. Manter o catálogo de provedores nas configurações do usuário evita conflitos de mesclagem/substituição entre os escopos de projeto e usuário e garante que atualizações de `/auth` e `/model` sejam sempre gravadas em um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já define `modelProviders`; caso contrário, recorrem ao escopo do usuário. Isso mantém os arquivos de workspace/usuário sincronizados com o catálogo de provedores ativo.
- Sem `modelProviders`, o resolvedor mistura camadas CLI/env/configurações, o que é adequado para configurações de único provedor, mas trabalhoso ao alternar frequentemente. Defina catálogos de provedores sempre que fluxos de trabalho com múltiplos modelos forem comuns, para que as alternâncias permaneçam atômicas, atribuídas por fonte e depuráveis.

#### contexto

| Configuração                                        | Tipo                       | Descrição                                                                                                                                                                                                                                                                                                                                                             | Padrão      |
| --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName`                                  | string ou array de strings | O nome do(s) arquivo(s) de contexto.                                                                                                                                                                                                                                                                                                                                  | `undefined` |
| `context.importFormat`                              | string                     | O formato a ser usado ao importar memória.                                                                                                                                                                                                                                                                                                                            | `undefined` |
| `context.includeDirectories`                        | array                      | Diretórios adicionais para incluir no contexto do workspace. Especifica um array de caminhos absolutos ou relativos adicionais para incluir no contexto do workspace. Diretórios ausentes serão ignorados com um aviso por padrão. Caminhos podem usar `~` para se referir ao diretório home do usuário. Esta configuração pode ser combinada com a flag de linha de comando `--include-directories`. | `[]`        |
| `context.loadFromIncludeDirectories`                | boolean                    | Controla o comportamento do comando `/memory refresh`. Se definido como `true`, os arquivos `QWEN.md` devem ser carregados de todos os diretórios que forem adicionados. Se definido como `false`, o `QWEN.md` deve ser carregado apenas do diretório atual.                                                                                                    | `false`     |
| `context.fileFiltering.respectGitIgnore`            | boolean                    | Respeitar arquivos .gitignore durante a busca.                                                                                                                                                                                                                                                                                                                        | `true`      |
| `context.fileFiltering.respectQwenIgnore`           | boolean                    | Respeitar arquivos .qwenignore durante a busca.                                                                                                                                                                                                                                                                                                                       | `true`      |
| `context.fileFiltering.enableRecursiveFileSearch`   | boolean                    | Se deve habilitar a busca recursiva por nomes de arquivos na árvore atual ao completar prefixos `@` no prompt.                                                                                                                                                                                                                                                      | `true`      |
| `context.fileFiltering.enableFuzzySearch`           | boolean                    | Quando `true`, habilita recursos de busca difusa ao procurar por arquivos. Defina como `false` para melhorar o desempenho em projetos com um grande número de arquivos.                                                                                                                                                                                               | `true`      |

#### Solução de Problemas de Desempenho na Pesquisa de Arquivos

Se você estiver enfrentando problemas de desempenho com a pesquisa de arquivos (por exemplo, com preenchimentos automáticos `@`), especialmente em projetos com um número muito grande de arquivos, aqui estão algumas coisas que você pode tentar, por ordem de recomendação:

1. **Use `.qwenignore`:** Crie um arquivo `.qwenignore` na raiz do seu projeto para excluir diretórios que contenham um grande número de arquivos dos quais você não precisa fazer referência (por exemplo, artefatos de compilação, logs, `node_modules`). Reduzir o número total de arquivos percorridos é a maneira mais eficaz de melhorar o desempenho.
2. **Desative a Pesquisa Difusa:** Se ignorar arquivos não for suficiente, você pode desativar a pesquisa difusa definindo `enableFuzzySearch` como `false` no seu arquivo `settings.json`. Isso usará um algoritmo de correspondência mais simples e não difuso, que pode ser mais rápido.
3. **Desative a Pesquisa Recursiva de Arquivos:** Como último recurso, você pode desativar completamente a pesquisa recursiva de arquivos definindo `enableRecursiveFileSearch` como `false`. Esta será a opção mais rápida, pois evita uma varredura recursiva do seu projeto. No entanto, isso significa que você precisará digitar o caminho completo dos arquivos ao usar preenchimentos automáticos `@`.

#### ferramentas

| Configuração                         | Tipo              | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Padrão      | Notas                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                      | boolean ou string | Ambiente de execução sandbox (pode ser um boolean ou uma string de caminho).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.shell.enableInteractiveShell` | boolean           | Usa `node-pty` para uma experiência interativa de shell. O fallback para `child_process` ainda se aplica.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `false`     |                                                                                                                                                                                                                                                      |
| `tools.core`                         | array de strings  | Isso pode ser usado para restringir o conjunto de ferramentas embutidas com uma lista de permissões. Você também pode especificar restrições específicas por comando para ferramentas que suportam isso, como a ferramenta `run_shell_command`. Por exemplo, `"tools.core": ["run_shell_command(ls -l)"]` permitirá apenas que o comando `ls -l` seja executado.                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.exclude`                      | array de strings  | Nomes de ferramentas a serem excluídas da descoberta. Você também pode especificar restrições específicas por comando para ferramentas que suportam isso, como a ferramenta `run_shell_command`. Por exemplo, `"tools.exclude": ["run_shell_command(rm -rf)"]` bloqueará o comando `rm -rf`. **Nota de Segurança:** Restrições específicas por comando em `tools.exclude` para `run_shell_command` são baseadas em correspondência simples de strings e podem ser facilmente contornadas. Este recurso **não é um mecanismo de segurança** e não deve ser confiado para executar código não confiável com segurança. Recomenda-se usar `tools.core` para selecionar explicitamente os comandos que podem ser executados. | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.allowed`                      | array de strings  | Uma lista de nomes de ferramentas que irá ignorar o diálogo de confirmação. Isso é útil para ferramentas nas quais você confia e usa com frequência. Por exemplo, `["run_shell_command(git)", "run_shell_command(npm test)"]` irá pular o diálogo de confirmação para executar quaisquer comandos `git` e `npm test`.                                                                                                                                                                                                                                                                                                                                                                                                      | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.approvalMode`                 | string            | Define o modo padrão de aprovação para uso de ferramentas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `default`   | Valores possíveis: `plan` (analisar apenas, não modificar arquivos ou executar comandos), `default` (requer aprovação antes de edições de arquivo ou execução de comandos shell), `auto-edit` (aprovar automaticamente edições de arquivo), `yolo` (aprovar automaticamente todas as chamadas de ferramenta) |
| `tools.discoveryCommand`             | string            | Comando a ser executado para descoberta de ferramentas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.callCommand`                  | string            | Define um comando shell personalizado para chamar uma ferramenta específica que foi descoberta usando `tools.discoveryCommand`. O comando shell deve atender aos seguintes critérios: Deve receber o nome da função (exatamente como na [declaração de função](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) como primeiro argumento da linha de comando. Deve ler os argumentos da função como JSON em `stdin`, análogo ao [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall). Deve retornar a saída da função como JSON em `stdout`, análogo ao [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse). | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.useRipgrep`                   | boolean           | Usa ripgrep para busca de conteúdo de arquivo em vez da implementação de fallback. Fornece desempenho de busca mais rápido.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `true`      |                                                                                                                                                                                                                                                      |
| `tools.useBuiltinRipgrep`            | boolean           | Usa o binário ripgrep embutido. Quando definido como `false`, o comando `rg` do sistema será usado em seu lugar. Esta configuração só é eficaz quando `tools.useRipgrep` é `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `true`      |                                                                                                                                                                                                                                                      |
| `tools.enableToolOutputTruncation`   | boolean           | Habilita truncamento de saídas grandes de ferramentas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `true`      | Requer reinicialização: Sim                                                                                                                                                                                                                         |
| `tools.truncateToolOutputThreshold`  | número            | Trunca a saída da ferramenta se ela for maior que esta quantidade de caracteres. Aplica-se às ferramentas Shell, Grep, Glob, ReadFile e ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `25000`     | Requer reinicialização: Sim                                                                                                                                                                                                                         |
| `tools.truncateToolOutputLines`      | número            | Máximo de linhas ou entradas mantidas ao truncar a saída da ferramenta. Aplica-se às ferramentas Shell, Grep, Glob, ReadFile e ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `1000`      | Requer reinicialização: Sim                                                                                                                                                                                                                         |

#### mcp

| Configuração        | Tipo             | Descrição                                                                                                                                                                                                                                                                  | Padrão      |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | Comando para iniciar um servidor MCP.                                                                                                                                                                                                                                      | `undefined` |
| `mcp.allowed`       | array de strings | Uma lista de permissão de servidores MCP permitidos. Permite especificar uma lista de nomes de servidores MCP que devem estar disponíveis para o modelo. Isso pode ser usado para restringir o conjunto de servidores MCP aos quais se conectar. Observe que isso será ignorado se `--allowed-mcp-server-names` estiver definido. | `undefined` |
| `mcp.excluded`      | array de strings | Uma lista de negação de servidores MCP a serem excluídos. Um servidor listado tanto em `mcp.excluded` quanto em `mcp.allowed` será excluído. Observe que isso será ignorado se `--allowed-mcp-server-names` estiver definido.                                                                                           | `undefined` |

> [!note]
>
> **Nota de segurança para servidores MCP:** Essas configurações usam correspondência simples de strings nos nomes dos servidores MCP, os quais podem ser modificados. Se você é um administrador de sistema e deseja impedir que usuários contornem essa restrição, considere configurar os `mcpServers` no nível de configurações do sistema, de forma que o usuário não consiga configurar nenhum servidor MCP por conta própria. Isso não deve ser usado como um mecanismo de segurança infalível.

#### lsp

> [!warning]
> **Funcionalidade Experimental**: O suporte ao LSP está atualmente em fase experimental e desabilitado por padrão. Habilite-o usando a flag de linha de comando `--experimental-lsp`.

O Protocolo do Servidor de Linguagem (LSP) fornece recursos de inteligência de código como ir para definição, localizar referências e diagnósticos.

A configuração do servidor LSP é feita através de arquivos `.lsp.json` no diretório raiz do seu projeto, e não pelo `settings.json`. Consulte a [documentação do LSP](../features/lsp) para detalhes e exemplos de configuração.

#### segurança

| Configuração                   | Tipo    | Descrição                                                | Padrão      |
| ------------------------------ | ------- | -------------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | Configuração para rastrear se a confiança de pasta está habilitada. | `false`     |
| `security.auth.selectedType`   | string  | O tipo de autenticação atualmente selecionado.           | `undefined` |
| `security.auth.enforcedType`   | string  | O tipo de autenticação exigido (útil para empresas).     | `undefined` |
| `security.auth.useExternal`    | boolean | Se deve usar um fluxo de autenticação externo.           | `undefined` |

#### avançado

| Configuração                   | Tipo             | Descrição                                                                                                                                                                                                                                                                                                                                                      | Padrão                   |
| ------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | booleano         | Configura automaticamente os limites de memória do Node.js.                                                                                                                                                                                                                                                                                                  | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | A ordem de resolução de DNS.                                                                                                                                                                                                                                                                                                                                 | `undefined`              |
| `advanced.excludedEnvVars`     | array de strings | Variáveis de ambiente a serem excluídas do contexto do projeto. Especifica variáveis de ambiente que não devem ser carregadas dos arquivos `.env` do projeto. Isso evita que variáveis de ambiente específicas do projeto (como `DEBUG=true`) interfiram no comportamento da CLI. Variáveis dos arquivos `.qwen/.env` nunca são excluídas. | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | objeto           | Configuração para o comando de relatório de bugs. Substitui a URL padrão para o comando `/bug`. Propriedades: `urlTemplate` (string): Uma URL que pode conter os placeholders `{title}` e `{info}`. Exemplo: `"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`       | `undefined`              |
| `advanced.tavilyApiKey`        | string           | Chave de API para o serviço de busca web Tavily. Usada para habilitar a funcionalidade da ferramenta `web_search`.                                                                                                                                                                                                                                           | `undefined`              |

> [!note]
>
> **Observação sobre advanced.tavilyApiKey:** Este é um formato de configuração legado. Para usuários Qwen OAuth, o provedor DashScope está disponível automaticamente sem nenhuma configuração. Para outros tipos de autenticação, configure os provedores Tavily ou Google usando o novo formato de configuração `webSearch`.

#### experimental

| Configuração              | Tipo    | Descrição                           | Padrão  |
| ------------------------- | ------- | ----------------------------------- | ------- |
| `experimental.skills`     | boolean | Habilitar recursos experimentais de Agente | `false` |

#### mcpServers

Configura conexões com um ou mais servidores Model-Context Protocol (MCP) para descobrir e usar ferramentas personalizadas. O Qwen Code tenta se conectar a cada servidor MCP configurado para descobrir ferramentas disponíveis. Se vários servidores MCP exporem uma ferramenta com o mesmo nome, os nomes das ferramentas serão prefixados com o alias do servidor que você definiu na configuração (por exemplo, `serverAlias__actualToolName`) para evitar conflitos. Observe que o sistema pode remover certas propriedades de esquema das definições de ferramentas MCP por compatibilidade. Pelo menos um dos campos `command`, `url` ou `httpUrl` deve ser fornecido. Se múltiplos forem especificados, a ordem de precedência é `httpUrl`, depois `url`, e então `command`.

| Propriedade                             | Tipo             | Descrição                                                                                                                                                                                                                                                        | Opcional |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<NOME_DO_SERVIDOR>.command` | string           | O comando a ser executado para iniciar o servidor MCP via E/S padrão.                                                                                                                                                                                             | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.args`    | array de strings | Argumentos a serem passados ao comando.                                                                                                                                                                                                                            | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.env`     | objeto           | Variáveis de ambiente a serem definidas para o processo do servidor.                                                                                                                                                                                               | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.cwd`     | string           | O diretório de trabalho no qual iniciar o servidor.                                                                                                                                                                                                                | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.url`     | string           | A URL de um servidor MCP que usa Server-Sent Events (SSE) para comunicação.                                                                                                                                                                                        | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.httpUrl` | string           | A URL de um servidor MCP que usa HTTP transmissível para comunicação.                                                                                                                                                                                              | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.headers` | objeto           | Um mapa de cabeçalhos HTTP a serem enviados com requisições para `url` ou `httpUrl`.                                                                                                                                                                              | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.timeout` | número           | Tempo limite em milissegundos para requisições a este servidor MCP.                                                                                                                                                                                                | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.trust`   | booleano         | Confiar neste servidor e ignorar todas as confirmações de chamada de ferramenta.                                                                                                                                                                                   | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.description` | string         | Uma breve descrição do servidor, que pode ser usada para fins de exibição.                                                                                                                                                                                          | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.includeTools` | array de strings | Lista de nomes de ferramentas a incluir deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis deste servidor (comportamento de lista branca). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão. | Sim      |
| `mcpServers.<NOME_DO_SERVIDOR>.excludeTools` | array de strings | Lista de nomes de ferramentas a excluir deste servidor MCP. Ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída. | Sim      |

#### telemetria

Configura o registro de logs e coleta de métricas para o Qwen Code. Para mais informações, consulte [telemetria](/developers/development/telemetry).

| Configuração             | Tipo    | Descrição                                                                      | Padrão  |
| ------------------------ | ------- | ------------------------------------------------------------------------------ | ------- |
| `telemetry.enabled`      | boolean | Se a telemetria está ou não habilitada.                                        |         |
| `telemetry.target`       | string  | O destino para a telemetria coletada. Valores suportados são `local` e `gcp`.  |         |
| `telemetry.otlpEndpoint` | string  | O endpoint para o Exportador OTLP.                                             |         |
| `telemetry.otlpProtocol` | string  | O protocolo para o Exportador OTLP (`grpc` ou `http`).                         |         |
| `telemetry.logPrompts`   | boolean | Se deve ou não incluir o conteúdo dos prompts do usuário nos logs.             |         |
| `telemetry.outfile`      | string  | O arquivo para gravar a telemetria quando `target` é `local`.                  |         |
| `telemetry.useCollector` | boolean | Se deve usar um coletor OTLP externo.                                          |         |

### Exemplo de `settings.json`

Aqui está um exemplo de arquivo `settings.json` com a estrutura aninhada, nova a partir da versão v0.3.0:

```
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideTips": false,
    "customWittyPhrases": [
      "Você esquece milhares de coisas todos os dias. Certifique-se de que esta seja uma delas",
      "Conectando ao AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "enableOpenAILogging": false,
    "openAILoggingDir": "~/qwen-logs",
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Histórico do Shell

A CLI mantém um histórico dos comandos do shell que você executa. Para evitar conflitos entre diferentes projetos, esse histórico é armazenado em um diretório específico do projeto dentro da pasta inicial do seu usuário.

- **Localização:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` é um identificador único gerado a partir do caminho raiz do seu projeto.
  - O histórico é armazenado em um arquivo chamado `shell_history`.

## Variáveis de Ambiente e Arquivos `.env`

Variáveis de ambiente são uma maneira comum de configurar aplicações, especialmente para informações sensíveis (como tokens) ou para configurações que podem mudar entre ambientes.

O Qwen Code pode carregar automaticamente variáveis de ambiente a partir de arquivos `.env`.
Para variáveis relacionadas à autenticação (como `OPENAI_*`) e para a abordagem recomendada de usar `.qwen/.env`, consulte **[Autenticação](../configuration/auth)**.

> [!tip]
>
> **Exclusão de Variáveis de Ambiente:** Algumas variáveis de ambiente (como `DEBUG` e `DEBUG_MODE`) são automaticamente excluídas dos arquivos `.env` do projeto por padrão para evitar interferência no comportamento da CLI. Variáveis provenientes de arquivos `.qwen/.env` nunca são excluídas. Você pode personalizar esse comportamento usando a configuração `advanced.excludedEnvVars` em seu arquivo `settings.json`.

### Tabela de Variáveis de Ambiente

| Variável                         | Descrição                                                                                                                                            | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_TELEMETRY_ENABLED`       | Defina como `true` ou `1` para habilitar telemetria. Qualquer outro valor é tratado como desabilitando-a.                                                                  | Substitui a configuração `telemetry.enabled`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GEMINI_TELEMETRY_TARGET`        | Define o destino da telemetria (`local` ou `gcp`).                                                                                                          | Substitui a configuração `telemetry.target`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GEMINI_TELEMETRY_OTLP_ENDPOINT` | Define o endpoint OTLP para telemetria.                                                                                                                  | Substitui a configuração `telemetry.otlpEndpoint`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_TELEMETRY_OTLP_PROTOCOL` | Define o protocolo OTLP (`grpc` ou `http`).                                                                                                             | Substitui a configuração `telemetry.otlpProtocol`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_TELEMETRY_LOG_PROMPTS`   | Defina como `true` ou `1` para habilitar ou desabilitar o registro de prompts do usuário. Qualquer outro valor é tratado como desabilitando-o.                                         | Substitui a configuração `telemetry.logPrompts`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GEMINI_TELEMETRY_OUTFILE`       | Define o caminho do arquivo para gravar telemetria quando o destino é `local`.                                                                                   | Substitui a configuração `telemetry.outfile`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GEMINI_TELEMETRY_USE_COLLECTOR` | Defina como `true` ou `1` para habilitar ou desabilitar o uso de um coletor OTLP externo. Qualquer outro valor é tratado como desabilitando-o.                                | Substitui a configuração `telemetry.useCollector`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_SANDBOX`                 | Alternativa à configuração `sandbox` em `settings.json`.                                                                                               | Aceita `true`, `false`, `docker`, `podman` ou uma string de comando personalizado.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SEATBELT_PROFILE`               | (específico do macOS) Alterna o perfil do Seatbelt (`sandbox-exec`) no macOS.                                                                              | `permissive-open`: (Padrão) Restringe gravações na pasta do projeto (e algumas outras pastas, veja `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) mas permite outras operações. `strict`: Usa um perfil restrito que nega operações por padrão. `<nome_do_perfil>`: Usa um perfil personalizado. Para definir um perfil personalizado, crie um arquivo chamado `sandbox-macos-<nome_do_perfil>.sb` no diretório `.qwen/` do seu projeto (ex: `meu-projeto/.qwen/sandbox-macos-personalizado.sb`). |
| `DEBUG` ou `DEBUG_MODE`          | (muitas vezes usado por bibliotecas subjacentes ou pelo próprio CLI) Defina como `true` ou `1` para habilitar registro detalhado de depuração, o que pode ser útil para solução de problemas. | **Nota:** Essas variáveis são automaticamente excluídas dos arquivos `.env` do projeto por padrão para evitar interferência no comportamento do CLI. Use arquivos `.qwen/.env` se você precisar definir essas variáveis especificamente para o Qwen Code.                                                                                                                                                                                                                                                               |
| `NO_COLOR`                       | Defina qualquer valor para desabilitar toda saída colorida no CLI.                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CLI_TITLE`                      | Defina uma string para personalizar o título do CLI.                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`           | Especifica o endpoint para o servidor de assistência de código.                                                                                                     | Isso é útil para desenvolvimento e testes.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `TAVILY_API_KEY`                 | Sua chave de API para o serviço de busca web Tavily.                                                                                                        | Usada para habilitar a funcionalidade da ferramenta `web_search`. Exemplo: `export TAVILY_API_KEY="tvly-sua-chave-de-api-aqui"`                                                                                                                                                                                                                                                                                                                                                                      |

## Argumentos de Linha de Comando

Argumentos passados diretamente ao executar a CLI podem substituir outras configurações para aquela sessão específica.

### Tabela de Argumentos de Linha de Comando

| Argumento                    | Apelido | Descrição                                                                                                                                                                               | Valores Possíveis                      | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | Especifica o modelo Qwen a ser usado nesta sessão.                                                                                                                                      | Nome do modelo                         | Exemplo: `npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--prompt`                   | `-p`  | Usado para passar um prompt diretamente para o comando. Isso invoca o Qwen Code em modo não interativo.                                                                                 | Seu texto de prompt                    | Para exemplos de script, use a flag `--output-format json` para obter saída estruturada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--prompt-interactive`       | `-i`  | Inicia uma sessão interativa com o prompt fornecido como entrada inicial.                                                                                                               | Seu texto de prompt                    | O prompt é processado dentro da sessão interativa, não antes dela. Não pode ser usado ao redirecionar entrada do stdin. Exemplo: `qwen -i "explique este código"`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--output-format`            | `-o`  | Especifica o formato da saída da CLI para modo não interativo.                                                                                                                          | `text`, `json`, `stream-json`          | `text`: (Padrão) A saída padrão legível por humanos. `json`: Uma saída JSON legível por máquina emitida no final da execução. `stream-json`: Mensagens JSON em streaming emitidas conforme ocorrem durante a execução. Para saída estruturada e scripts, use a flag `--output-format json` ou `--output-format stream-json`. Veja [Modo Headless](../features/headless) para informações detalhadas.                                                                                                                                                                     |
| `--input-format`             |       | Especifica o formato consumido da entrada padrão.                                                                                                                                       | `text`, `stream-json`                  | `text`: (Padrão) Entrada de texto padrão do stdin ou argumentos de linha de comando. `stream-json`: Protocolo de mensagem JSON via stdin para comunicação bidirecional. Requisito: `--input-format stream-json` requer que `--output-format stream-json` seja definido. Ao usar `stream-json`, o stdin é reservado para mensagens de protocolo. Veja [Modo Headless](../features/headless) para informações detalhadas.                                                                                                                                                                  |
| `--include-partial-messages` |       | Inclui mensagens parciais do assistente ao usar o formato de saída `stream-json`. Quando ativado, emite eventos de stream (message_start, content_block_delta, etc.) conforme ocorrem durante o streaming. |                                        | Padrão: `false`. Requisito: Requer que `--output-format stream-json` seja definido. Veja [Modo Headless](../features/headless) para informações detalhadas sobre eventos de stream.                                                                                                                                                                                                                                                                                                                                                                                        |
| `--sandbox`                  | `-s`  | Ativa o modo sandbox para esta sessão.                                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--sandbox-image`            |       | Define o URI da imagem do sandbox.                                                                                                                                                      |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--debug`                    | `-d`  | Ativa o modo debug para esta sessão, fornecendo saída mais verbosa.                                                                                                                     |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--all-files`                | `-a`  | Se definido, inclui recursivamente todos os arquivos dentro do diretório atual como contexto para o prompt.                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--help`                     | `-h`  | Exibe informações de ajuda sobre argumentos de linha de comando.                                                                                                                        |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--show-memory-usage`        |       | Exibe o uso atual de memória.                                                                                                                                                           |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--yolo`                     |       | Ativa o modo YOLO, que aprova automaticamente todas as chamadas de ferramentas.                                                                                                         |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--approval-mode`            |       | Define o modo de aprovação para chamadas de ferramentas.                                                                                                                                | `plan`, `default`, `auto-edit`, `yolo` | Modos suportados: `plan`: Analisar apenas—não modificar arquivos ou executar comandos. `default`: Requer aprovação para edições de arquivos ou comandos shell (comportamento padrão). `auto-edit`: Aprova automaticamente ferramentas de edição (edit, write_file) enquanto solicita aprovação para outras. `yolo`: Aprova automaticamente todas as chamadas de ferramentas (equivalente a `--yolo`). Não pode ser usado junto com `--yolo`. Use `--approval-mode=yolo` em vez de `--yolo` para a nova abordagem unificada. Exemplo: `qwen --approval-mode auto-edit`<br>Veja mais sobre [Modo de Aprovação](../features/approval-mode). |
| `--allowed-tools`            |       | Uma lista separada por vírgulas de nomes de ferramentas que irão ignorar o diálogo de confirmação.                                                                                       | Nomes de ferramentas                   | Exemplo: `qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--telemetry`                |       | Ativa [telemetria](/developers/development/telemetry).                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-target`         |       | Define o destino da telemetria.                                                                                                                                                         |                                        | Veja [telemetria](/developers/development/telemetry) para mais informações.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--telemetry-otlp-endpoint`  |       | Define o endpoint OTLP para telemetria.                                                                                                                                                 |                                        | Veja [telemetria](../../developers/development/telemetry) para mais informações.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--telemetry-otlp-protocol`  |       | Define o protocolo OTLP para telemetria (`grpc` ou `http`).                                                                                                                             |                                        | Padrão para `grpc`. Veja [telemetria](../../developers/development/telemetry) para mais informações.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--telemetry-log-prompts`    |       | Ativa o registro de prompts para telemetria.                                                                                                                                            |                                        | Veja [telemetria](../../developers/development/telemetry) para mais informações.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--checkpointing`            |       | Ativa [checkpointing](../features/checkpointing).                                                                                                                                       |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--acp`                      |       | Ativa o modo ACP (Agent Client Protocol). Útil para integrações com IDE/editores como [Zed](../integration-zed).                                                                         |                                        | Estável. Substitui a flag obsoleta `--experimental-acp`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--experimental-skills`      |       | Ativa [Habilidades de Agente](../features/skills) experimentais (registra a ferramenta `skill` e carrega Habilidades de `.qwen/skills/` e `~/.qwen/skills/`).                            |                                        | Experimental.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--experimental-lsp`         |       | Ativa o recurso experimental [LSP (Protocolo de Servidor de Linguagem)](../features/lsp) para inteligência de código (ir para definição, encontrar referências, diagnósticos, etc.). |                                        | Experimental. Requer que servidores de linguagem estejam instalados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--extensions`               | `-e`  | Especifica uma lista de extensões a serem usadas para a sessão.                                                                                                                         | Nomes de extensões                     | Se não fornecido, todas as extensões disponíveis são usadas. Use o termo especial `qwen -e none` para desativar todas as extensões. Exemplo: `qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                                                        |
| `--list-extensions`          | `-l`  | Lista todas as extensões disponíveis e sai.                                                                                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--proxy`                    |       | Define o proxy para a CLI.                                                                                                                                                              | URL do proxy                           | Exemplo: `--proxy http://localhost:7890`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--include-directories`      |       | Inclui diretórios adicionais no workspace para suporte multi-diretório.                                                                                                                 | Caminhos de diretórios                 | Pode ser especificado várias vezes ou como valores separados por vírgula. Máximo de 5 diretórios podem ser adicionados. Exemplo: `--include-directories /path/to/project1,/path/to/project2` ou `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                                                                  |
| `--screen-reader`            |       | Ativa o modo leitor de tela, que ajusta a interface para melhor compatibilidade com leitores de tela.                                                                                    |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--version`                  |       | Exibe a versão da CLI.                                                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--openai-logging`           |       | Ativa o registro de chamadas da API OpenAI para depuração e análise.                                                                                                                    |                                        | Esta flag substitui a configuração `enableOpenAILogging` em `settings.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--openai-logging-dir`       |       | Define um caminho personalizado de diretório para logs da API OpenAI.                                                                                                                   | Caminho do diretório                   | Esta flag substitui a configuração `openAILoggingDir` em `settings.json`. Suporta caminhos absolutos, relativos e expansão de `~`. Exemplo: `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                                          |
| `--tavily-api-key`           |       | Define a chave da API Tavily para funcionalidade de busca na web para esta sessão.                                                                                                      | Chave da API                           | Exemplo: `qwen --tavily-api-key tvly-your-api-key-here`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Arquivos de Contexto (Contexto Instrucional Hierárquico)

Embora não sejam estritamente uma configuração para o comportamento da CLI, os arquivos de contexto (cujo nome padrão é `QWEN.md`, mas pode ser configurado através da opção `context.fileName`) são cruciais para configurar o _contexto instrucional_ (também chamado de "memória"). Este recurso poderoso permite que você forneça instruções específicas do projeto, guias de estilo de codificação ou qualquer informação relevante ao modelo de IA, tornando suas respostas mais adaptadas e precisas às suas necessidades. A CLI inclui elementos de interface, como um indicador no rodapé mostrando o número de arquivos de contexto carregados, para mantê-lo informado sobre o contexto ativo.

- **Finalidade:** Esses arquivos Markdown contêm instruções, diretrizes ou contexto que você deseja que o modelo Qwen tenha em mente durante suas interações. O sistema foi projetado para gerenciar esse contexto instrucional de forma hierárquica.

### Exemplo de Conteúdo de Arquivo de Contexto (por exemplo, `QWEN.md`)

Aqui está um exemplo conceitual do que um arquivo de contexto na raiz de um projeto TypeScript pode conter:

```

# Projeto: Minha Biblioteca TypeScript Incrível

## Instruções Gerais:
- Ao gerar novo código TypeScript, siga o estilo de codificação existente.
- Garanta que todas as novas funções e classes tenham comentários JSDoc.
- Prefira paradigmas de programação funcional quando apropriado.
- Todo o código deve ser compatível com TypeScript 5.0 e Node.js 20+.

## Estilo de Codificação:
- Use 2 espaços para indentação.
- Nomes de interfaces devem ter o prefixo `I` (por exemplo, `IUserService`).
- Membros privados de classes devem ter o prefixo sublinhado (`_`).
- Sempre utilize igualdade estrita (`===` e `!==`).

## Componente Específico: `src/api/client.ts`
- Este arquivo lida com todas as requisições de API de saída.
- Ao adicionar novas funções de chamada de API, garanta que elas incluam tratamento robusto de erros e logging.
- Utilize o utilitário existente `fetchWithRetry` para todas as requisições GET.
```

## Sobre Dependências:
- Evite introduzir novas dependências externas a menos que sejam absolutamente necessárias.
- Se uma nova dependência for necessária, por favor justifique o motivo.
```

Este exemplo demonstra como você pode fornecer contexto geral do projeto, convenções específicas de codificação e até notas sobre arquivos ou componentes particulares. Quanto mais relevantes e precisos forem seus arquivos de contexto, melhor a IA poderá ajudá-lo. Arquivos de contexto específicos do projeto são altamente encorajados para estabelecer convenções e contexto.

- **Carregamento Hierárquico e Precedência:** A CLI implementa um sistema hierárquico de memória ao carregar arquivos de contexto (ex: `QWEN.md`) de diversos locais. O conteúdo de arquivos mais abaixo nesta lista (mais específicos) normalmente substitui ou complementa o conteúdo de arquivos acima (mais gerais). A ordem exata de concatenação e o contexto final podem ser inspecionados usando o comando `/memory show`. A ordem típica de carregamento é:
  1. **Arquivo de Contexto Global:**
     - Localização: `~/.qwen/<nome-do-arquivo-de-contexto-configurado>` (ex: `~/.qwen/QWEN.md` no seu diretório home de usuário).
     - Escopo: Fornece instruções padrão para todos os seus projetos.
  2. **Arquivos de Contexto da Raiz do Projeto & Ancestrais:**
     - Localização: A CLI busca pelo arquivo de contexto configurado no diretório de trabalho atual e então em cada diretório pai até chegar à raiz do projeto (identificada por uma pasta `.git`) ou ao seu diretório home.
     - Escopo: Fornece contexto relevante para todo o projeto ou uma parte significativa dele.
- **Concatenação & Indicação na UI:** Os conteúdos de todos os arquivos de contexto encontrados são concatenados (com separadores indicando sua origem e caminho) e fornecidos como parte do prompt do sistema. O rodapé da CLI exibe a contagem dos arquivos de contexto carregados, fornecendo uma dica visual rápida sobre o contexto instrucional ativo.
- **Importação de Conteúdo:** Você pode modularizar seus arquivos de contexto importando outros arquivos Markdown usando a sintaxe `@caminho/para/arquivo.md`. Para mais detalhes, veja a [documentação do Processador de Importação de Memória](../configuration/memory).
- **Comandos para Gerenciamento de Memória:**
  - Use `/memory refresh` para forçar uma nova varredura e recarregamento de todos os arquivos de contexto de todos os locais configurados. Isso atualiza o contexto instrucional da IA.
  - Use `/memory show` para exibir o contexto instrucional combinado atualmente carregado, permitindo que você verifique a hierarquia e o conteúdo sendo usado pela IA.
  - Veja a [documentação de Comandos](../features/commands) para detalhes completos sobre o comando `/memory` e seus sub-comandos (`show` e `refresh`).

Ao compreender e utilizar estas camadas de configuração e a natureza hierárquica dos arquivos de contexto, você pode gerenciar efetivamente a memória da IA e adaptar as respostas do Qwen Code às suas necessidades e projetos específicos.

## Sandbox

O Qwen Code pode executar operações potencialmente inseguras (como comandos de shell e modificações de arquivos) dentro de um ambiente sandbox para proteger seu sistema.

O [Sandbox](../features/sandbox) está desabilitado por padrão, mas você pode habilitá-lo de algumas formas:

- Usando a flag `--sandbox` ou `-s`.
- Configurando a variável de ambiente `GEMINI_SANDBOX`.
- O sandbox é habilitado por padrão ao usar `--yolo` ou `--approval-mode=yolo`.

Por padrão, ele usa uma imagem Docker pré-construída `qwen-code-sandbox`.

Para necessidades específicas de sandbox por projeto, você pode criar um Dockerfile personalizado em `.qwen/sandbox.Dockerfile` no diretório raiz do seu projeto. Este Dockerfile pode ser baseado na imagem base do sandbox:

```
FROM qwen-code-sandbox

# Adicione suas dependências ou configurações personalizadas aqui

# Por exemplo:

# RUN apt-get update && apt-get install -y algum-pacote

# COPY ./my-config /app/my-config
```

Quando `.qwen/sandbox.Dockerfile` existe, você pode usar a variável de ambiente `BUILD_SANDBOX` ao executar o Qwen Code para construir automaticamente a imagem personalizada do sandbox:

```
BUILD_SANDBOX=1 qwen -s
```

## Estatísticas de Uso

Para nos ajudar a melhorar o Qwen Code, coletamos estatísticas de uso anônimas. Esses dados nos ajudam a entender como a CLI é utilizada, identificar problemas comuns e priorizar novos recursos.

**O que coletamos:**

- **Chamadas de Ferramentas:** Registramos os nomes das ferramentas chamadas, se elas tiveram sucesso ou falharam e quanto tempo levaram para ser executadas. Não coletamos os argumentos passados às ferramentas nem nenhum dado retornado por elas.
- **Solicitações de API:** Registramos o modelo utilizado em cada solicitação, a duração da solicitação e se ela foi bem-sucedida. Não coletamos o conteúdo dos prompts ou respostas.
- **Informações da Sessão:** Coletamos informações sobre a configuração da CLI, como as ferramentas habilitadas e o modo de aprovação.

**O que NÃO coletamos:**

- **Informações Pessoalmente Identificáveis (PII):** Não coletamos nenhuma informação pessoal, como seu nome, endereço de e-mail ou chaves de API.
- **Conteúdo de Prompts e Respostas:** Não registramos o conteúdo dos seus prompts ou as respostas do modelo.
- **Conteúdo de Arquivos:** Não registramos o conteúdo de quaisquer arquivos lidos ou escritos pela CLI.

**Como desativar:**

Você pode optar por não participar da coleta de estatísticas de uso a qualquer momento definindo a propriedade `usageStatisticsEnabled` como `false` na categoria `privacy` do seu arquivo `settings.json`:

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> Quando as estatísticas de uso estão ativadas, os eventos são enviados a um endpoint de coleta do Alibaba Cloud RUM.