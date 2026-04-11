# Configuração do Qwen Code

> [!tip]
>
> **Autenticação / API keys:** A autenticação (Qwen OAuth, Alibaba Cloud Coding Plan ou API Key) e as variáveis de ambiente relacionadas à autenticação (como `OPENAI_API_KEY`) estão documentadas em **[Autenticação](../configuration/auth)**.

> [!note]
>
> **Nota sobre o novo formato de configuração**: O formato do arquivo `settings.json` foi atualizado para uma estrutura nova e mais organizada. O formato antigo será migrado automaticamente.
O Qwen Code oferece várias maneiras de configurar seu comportamento, incluindo variáveis de ambiente, argumentos de linha de comando e arquivos de configuração. Este documento descreve os diferentes métodos de configuração e as opções disponíveis.

## Camadas de configuração

A configuração é aplicada na seguinte ordem de precedência (números menores são substituídos por números maiores):

| Nível | Fonte de Configuração   | Descrição                                                                     |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1     | Valores padrão         | Padrões codificados diretamente no aplicativo                                       |
| 2     | Arquivo de padrões do sistema   | Configurações padrão para todo o sistema que podem ser substituídas por outros arquivos de configuração     |
| 3     | Arquivo de configurações do usuário     | Configurações globais para o usuário atual                                            |
| 4     | Arquivo de configurações do projeto  | Configurações específicas do projeto                                                       |
| 5     | Arquivo de configurações do sistema   | Configurações para todo o sistema que substituem todos os outros arquivos de configuração                     |
| 6     | Variáveis de ambiente  | Variáveis para todo o sistema ou específicas da sessão, potencialmente carregadas de arquivos `.env` |
| 7     | Argumentos de linha de comando | Valores passados ao iniciar a CLI                                            |

## Arquivos de configuração

O Qwen Code usa arquivos de configuração JSON para configurações persistentes. Existem quatro locais para esses arquivos:

| Tipo de Arquivo             | Localização                                                                                                                                                                                                                                                                        | Escopo                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo de padrões do sistema  | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>O caminho pode ser substituído usando a variável de ambiente `QWEN_CODE_SYSTEM_DEFAULTS_PATH`. | Fornece uma camada base de configurações padrão para todo o sistema. Essas configurações têm a menor precedência e devem ser substituídas por configurações de usuário, projeto ou substituições do sistema.                                         |
| Arquivo de configurações do usuário    | `~/.qwen/settings.json` (onde `~` é seu diretório home).                                                                                                                                                                                                                     | Aplica-se a todas as sessões do Qwen Code para o usuário atual.                                                                                                                                                                   |
| Arquivo de configurações do projeto | `.qwen/settings.json` dentro do diretório raiz do seu projeto.                                                                                                                                                                                                                     | Aplica-se apenas ao executar o Qwen Code a partir desse projeto específico. As configurações do projeto substituem as configurações do usuário.                                                                                                                  |
| Arquivo de configurações do sistema  | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>O caminho pode ser substituído usando a variável de ambiente `QWEN_CODE_SYSTEM_SETTINGS_PATH`.                    | Aplica-se a todas as sessões do Qwen Code no sistema, para todos os usuários. As configurações do sistema substituem as configurações de usuário e projeto. Podem ser úteis para administradores de sistema em empresas que desejam controlar as configurações do Qwen Code dos usuários. |

> [!note]
>
> **Nota sobre variáveis de ambiente nas configurações:** Valores de string dentro dos seus arquivos `settings.json` podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`. Essas variáveis serão resolvidas automaticamente quando as configurações forem carregadas. Por exemplo, se você tiver uma variável de ambiente `MY_API_TOKEN`, poderá usá-la no `settings.json` assim: `"apiKey": "$MY_API_TOKEN"`.

### O diretório `.qwen` no seu projeto

Além de um arquivo de configuração do projeto, o diretório `.qwen` de um projeto pode conter outros arquivos específicos do projeto relacionados à operação do Qwen Code, como:

- [Perfis de sandbox personalizados](../features/sandbox) (ex.: `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).
- [Skills de Agente](../features/skills) em `.qwen/skills/` (cada Skill é um diretório contendo um `SKILL.md`).

### Migração de configuração

O Qwen Code migra automaticamente configurações legadas para o novo formato. Os arquivos de configuração antigos são salvos como backup antes da migração. As seguintes configurações foram renomeadas de nomenclatura negativa (`disable*`) para positiva (`enable*`):

| Configuração Antiga                              | Nova Configuração                                 | Notas                              |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate`                  | Consolidado em uma única configuração |
| `disableLoadingPhrases`                  | `ui.accessibility.enableLoadingPhrases`     |                                    |
| `disableFuzzySearch`                     | `context.fileFiltering.enableFuzzySearch`   |                                    |
| `disableCacheControl`                    | `model.generationConfig.enableCacheControl` |                                    |

> [!note]
>
> **Inversão de valores booleanos:** Durante a migração, os valores booleanos são invertidos (ex.: `disableAutoUpdate: true` se torna `enableAutoUpdate: false`).

#### Política de consolidação para `disableAutoUpdate` e `disableUpdateNag`

Quando ambas as configurações legadas estão presentes com valores diferentes, a migração segue esta política: se **qualquer uma** (`disableAutoUpdate` **ou** `disableUpdateNag`) for `true`, então `enableAutoUpdate` se torna `false`:

| `disableAutoUpdate` | `disableUpdateNag` | `enableAutoUpdate` migrado |
| ------------------- | ------------------ | --------------------------- |
| `false`             | `false`            | `true`                      |
| `false`             | `true`             | `false`                     |
| `true`              | `false`            | `false`                     |
| `true`              | `true`             | `false`                     |

### Configurações disponíveis no `settings.json`

As configurações são organizadas em categorias. Todas as configurações devem ser colocadas dentro do objeto de categoria de nível superior correspondente no seu arquivo `settings.json`.

#### general

| Configuração                         | Tipo    | Descrição                                                                                                                                                                     | Padrão     |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor`       | string  | O editor preferido para abrir arquivos.                                                                                                                                          | `undefined` |
| `general.vimMode`               | boolean | Ativa os atalhos de teclado do Vim.                                                                                                                                                         | `false`     |
| `general.enableAutoUpdate`      | boolean | Ativa verificações e instalações automáticas de atualizações na inicialização.                                                                                                                    | `true`      |
| `general.gitCoAuthor`           | boolean | Adiciona automaticamente um trailer `Co-authored-by` às mensagens de commit do git quando os commits são feitos pelo Qwen Code.                                                                      | `true`      |
| `general.checkpointing.enabled` | boolean | Ativa o checkpoint de sessão para recuperação.                                                                                                                                      | `false`     |
| `general.defaultFileEncoding`   | string  | Codificação padrão para novos arquivos. Use `"utf-8"` (padrão) para UTF-8 sem BOM, ou `"utf-8-bom"` para UTF-8 com BOM. Altere apenas se o seu projeto exigir especificamente BOM. | `"utf-8"`   |

#### output

| Configuração         | Tipo   | Descrição                   | Padrão  | Valores Possíveis    |
| --------------- | ------ | ----------------------------- | -------- | ------------------ |
| `output.format` | string | O formato da saída da CLI. | `"text"` | `"text"`, `"json"` |

#### ui

| Configuração                                 | Tipo             | Descrição                                                                                                                                                                                                                                                                                                                                                                                                         | Padrão     |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ui.theme`                              | string           | O tema de cores para a UI. Consulte [Temas](../configuration/themes) para ver as opções disponíveis.                                                                                                                                                                                                                                                                                                                            | `undefined` |
| `ui.customThemes`                       | object           | Definições de temas personalizados.                                                                                                                                                                                                                                                                                                                                                                                           | `{}`        |
| `ui.statusLine`                         | object           | Configuração personalizada da linha de status. Um comando shell cuja saída é exibida na seção esquerda do rodapé. Consulte [Linha de Status](../features/status-line).                                                                                                                                                                                                                                                                   | `undefined` |
| `ui.hideWindowTitle`                    | boolean          | Oculta a barra de título da janela.                                                                                                                                                                                                                                                                                                                                                                                          | `false`     |
| `ui.hideTips`                           | boolean          | Oculta dicas úteis na UI.                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.hideBanner`                         | boolean          | Oculta o banner do aplicativo.                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.hideFooter`                         | boolean          | Oculta o rodapé da UI.                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.showMemoryUsage`                    | boolean          | Exibe informações de uso de memória na UI.                                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `ui.showLineNumbers`                    | boolean          | Exibe números de linha em blocos de código na saída da CLI.                                                                                                                                                                                                                                                                                                                                                                 | `true`      |
| `ui.showCitations`                      | boolean          | Exibe citações para texto gerado no chat.                                                                                                                                                                                                                                                                                                                                                                      | `true`      |
| `ui.compactMode`                        | boolean          | Oculta a saída de ferramentas e o pensamento para uma visualização mais limpa. Alterne com `Ctrl+O` durante uma sessão. Quando ativado, um indicador `compact` aparece no rodapé. A configuração persiste entre sessões.                                                                                                                                                                                                                           | `false`     |
| `enableWelcomeBack`                     | boolean          | Exibe um diálogo de boas-vindas ao retornar a um projeto com histórico de conversa. Quando ativado, o Qwen Code detectará automaticamente se você está retornando a um projeto com um resumo gerado anteriormente (`.qwen/PROJECT_SUMMARY.md`) e mostrará um diálogo permitindo continuar a conversa anterior ou começar do zero. Este recurso integra-se ao comando `/summary` e ao diálogo de confirmação de saída. | `true`      |
| `ui.accessibility.enableLoadingPhrases` | boolean          | Ativa frases de carregamento (desative para acessibilidade).                                                                                                                                                                                                                                                                                                                                                                 | `true`      |
| `ui.accessibility.screenReader`         | boolean          | Ativa o modo de leitor de tela, que ajusta a TUI para melhor compatibilidade com leitores de tela.                                                                                                                                                                                                                                                                                                                     | `false`     |
| `ui.customWittyPhrases`                 | array of strings | Uma lista de frases personalizadas para exibir durante estados de carregamento. Quando fornecida, a CLI alternará entre essas frases em vez das padrão.                                                                                                                                                                                                                                                                     | `[]`        |
| `ui.enableFollowupSuggestions`          | boolean          | Ativa [sugestões de acompanhamento](../features/followup-suggestions) que preveem o que você deseja digitar a seguir após a resposta do modelo. As sugestões aparecem como texto fantasma e podem ser aceitas com Tab, Enter ou Seta para a Direita.                                                                                                                                                                                             | `true`      |
| `ui.enableCacheSharing`                 | boolean          | Usa consultas bifurcadas com conhecimento de cache para geração de sugestões. Reduz custos em provedores que suportam cache de prefixo (experimental).                                                                                                                                                                                                                                                                                     | `true`      |
| `ui.enableSpeculation`                  | boolean          | Executa especulativamente sugestões aceitas antes do envio. Os resultados aparecem instantaneamente ao aceitar (experimental).                                                                                                                                                                                                                                                                                              | `false`     |

#### ide

| Configuração            | Tipo    | Descrição                                          | Padrão |
| ------------------ | ------- | ---------------------------------------------------- | ------- |
| `ide.enabled`      | boolean | Ativa o modo de integração com IDE.                         | `false` |
| `ide.hasSeenNudge` | boolean | Indica se o usuário já viu o aviso de integração com IDE. | `false` |

#### privacy

| Configuração                          | Tipo    | Descrição                            | Padrão |
| -------------------------------- | ------- | -------------------------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | Ativa a coleta de estatísticas de uso. | `true`  |

#### model

| Configuração                                            | Tipo    | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Padrão     |
| -------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | O modelo Qwen a ser usado para conversas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `model.maxSessionTurns`                            | number  | Número máximo de turnos de usuário/modelo/ferramenta a manter em uma sessão. -1 significa ilimitado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `-1`        |
| `model.generationConfig`                           | object  | Substituições avançadas passadas ao gerador de conteúdo subjacente. Suporta controles de solicitação como `timeout`, `maxRetries`, `enableCacheControl`, `contextWindowSize` (substitui o tamanho da janela de contexto do modelo), `modalities` (substitui as modalidades de entrada detectadas automaticamente), `customHeaders` (cabeçalhos HTTP personalizados para solicitações de API) e `extra_body` (parâmetros adicionais de corpo apenas para solicitações de API compatíveis com OpenAI), junto com ajustes finos em `samplingParams` (por exemplo, `temperature`, `top_p`, `max_tokens`). Deixe não definido para usar os padrões do provedor. | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | Define o limite para compressão do histórico de chat como uma porcentagem do limite total de tokens do modelo. Este é um valor entre 0 e 1 que se aplica tanto à compressão automática quanto ao comando manual `/compress`. Por exemplo, um valor de `0.6` acionará a compressão quando o histórico de chat exceder 60% do limite de tokens. Use `0` para desativar a compressão completamente.                                                                                                                                                                                               | `0.7`       |
| `model.skipNextSpeakerCheck`                       | boolean | Ignora a verificação do próximo orador.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `model.skipLoopDetection`                          | boolean | Desativa as verificações de detecção de loop. A detecção de loop evita loops infinitos nas respostas da IA, mas pode gerar falsos positivos que interrompem fluxos de trabalho legítimos. Ative esta opção se você enfrentar interrupções frequentes por falsos positivos na detecção de loop.                                                                                                                                                                                                                                                                                                              | `false`     |
| `model.skipStartupContext`                         | boolean | Ignora o envio do contexto de workspace na inicialização (resumo do ambiente e reconhecimento) no início de cada sessão. Ative se preferir fornecer o contexto manualmente ou quiser economizar tokens na inicialização.                                                                                                                                                                                                                                                                                                                                                     | `false`     |
| `model.enableOpenAILogging`                        | boolean | Ativa o registro de chamadas de API OpenAI para depuração e análise. Quando ativado, as solicitações e respostas da API são registradas em arquivos JSON.                                                                                                                                                                                                                                                                                                                                                                                                                                   | `false`     |
| `model.openAILoggingDir`                           | string  | Caminho de diretório personalizado para logs da API OpenAI. Se não especificado, o padrão é `logs/openai` no diretório de trabalho atual. Suporta caminhos absolutos, caminhos relativos (resolvidos a partir do diretório de trabalho atual) e expansão `~` (diretório home).                                                                                                                                                                                                                                                                                                                      | `undefined` |

**Exemplo de model.generationConfig:**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "contextWindowSize": 128000,
      "modalities": {
        "image": true
      },
      "enableCacheControl": true,
      "customHeaders": {
        "X-Client-Request-ID": "req-123"
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

**max_tokens (tokens de saída adaptativos):**

Quando `samplingParams.max_tokens` não está definido, o Qwen Code usa uma estratégia adaptativa de tokens de saída para otimizar o uso de recursos da GPU:

1. As solicitações começam com um limite padrão de **8K** tokens de saída
2. Se a resposta for truncada (o modelo atinge o limite), o Qwen Code tenta novamente automaticamente com **64K** tokens
3. A saída parcial é descartada e substituída pela resposta completa da nova tentativa

Isso é transparente para os usuários — você pode ver brevemente um indicador de nova tentativa se a escalação ocorrer. Como 99% das respostas têm menos de 5K tokens, a nova tentativa acontece raramente (<1% das solicitações).

Para substituir esse comportamento, defina `samplingParams.max_tokens` nas suas configurações ou use a variável de ambiente `QWEN_CODE_MAX_OUTPUT_TOKENS`.

**contextWindowSize:**

Substitui o tamanho padrão da janela de contexto para o modelo selecionado. O Qwen Code determina a janela de contexto usando padrões internos com base na correspondência do nome do modelo, com um valor de fallback constante. Use esta configuração quando o limite de contexto efetivo de um provedor diferir do padrão do Qwen Code. Este valor define a capacidade máxima de contexto assumida pelo modelo, não um limite de tokens por solicitação.

**modalities:**

Substitui as modalidades de entrada detectadas automaticamente para o modelo selecionado. O Qwen Code detecta automaticamente as modalidades suportadas (imagem, PDF, áudio, vídeo) com base na correspondência de padrão do nome do modelo. Use esta configuração quando a detecção automática estiver incorreta — por exemplo, para ativar `pdf` para um modelo que o suporta, mas não é reconhecido. Formato: `{ "image": true, "pdf": true, "audio": true, "video": true }`. Omita uma chave ou defina como `false` para tipos não suportados.

**customHeaders:**

Permite adicionar cabeçalhos HTTP personalizados a todas as solicitações de API. Isso é útil para rastreamento de solicitações, monitoramento, roteamento de gateway de API ou quando diferentes modelos exigem cabeçalhos diferentes. Se `customHeaders` estiver definido em `modelProviders[].generationConfig.customHeaders`, ele será usado diretamente; caso contrário, os cabeçalhos de `model.generationConfig.customHeaders` serão usados. Não ocorre mesclagem entre os dois níveis.

O campo `extra_body` permite adicionar parâmetros personalizados ao corpo da solicitação enviada à API. Isso é útil para opções específicas do provedor que não são cobertas pelos campos de configuração padrão. **Nota: Este campo é suportado apenas para provedores compatíveis com OpenAI (`openai`, `qwen-oauth`). É ignorado para provedores Anthropic e Gemini.** Se `extra_body` estiver definido em `modelProviders[].generationConfig.extra_body`, ele será usado diretamente; caso contrário, os valores de `model.generationConfig.extra_body` serão usados.

**Exemplos de model.openAILoggingDir:**

- `"~/qwen-logs"` - Registra no diretório `~/qwen-logs`
- `"./custom-logs"` - Registra em `./custom-logs` relativo ao diretório atual
- `"/tmp/openai-logs"` - Registra no caminho absoluto `/tmp/openai-logs`

#### fastModel

| Configuração     | Tipo   | Descrição                                                                                                                                                                                                                                                      | Padrão |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `fastModel` | string | Modelo usado para gerar [sugestões de prompt](../features/followup-suggestions) e execução especulativa. Deixe vazio para usar o modelo principal. Um modelo menor/mais rápido (ex.: `qwen3-coder-flash`) reduz latência e custo. Também pode ser definido via `/model --fast`. | `""`    |

#### context

| Configuração                                           | Tipo                       | Descrição                                                                                                                                                                                                                                                                                                                                                           | Padrão     |
| ------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName`                                | string or array of strings | O nome do(s) arquivo(s) de contexto.                                                                                                                                                                                                                                                                                                                                      | `undefined` |
| `context.importFormat`                            | string                     | O formato a ser usado ao importar memória.                                                                                                                                                                                                                                                                                                                              | `undefined` |
| `context.includeDirectories`                      | array                      | Diretórios adicionais para incluir no contexto do workspace. Especifica um array de caminhos absolutos ou relativos adicionais para incluir no contexto do workspace. Diretórios ausentes serão ignorados com um aviso por padrão. Os caminhos podem usar `~` para se referir ao diretório home do usuário. Esta configuração pode ser combinada com o sinalizador de linha de comando `--include-directories`. | `[]`        |
| `context.loadFromIncludeDirectories`              | boolean                    | Controla o comportamento do comando `/memory refresh`. Se definido como `true`, os arquivos `QWEN.md` devem ser carregados de todos os diretórios adicionados. Se definido como `false`, `QWEN.md` deve ser carregado apenas do diretório atual.                                                                                                                                        | `false`     |
| `context.fileFiltering.respectGitIgnore`          | boolean                    | Respeita arquivos .gitignore durante a busca.                                                                                                                                                                                                                                                                                                                              | `true`      |
| `context.fileFiltering.respectQwenIgnore`         | boolean                    | Respeita arquivos .qwenignore durante a busca.                                                                                                                                                                                                                                                                                                                             | `true`      |
| `context.fileFiltering.enableRecursiveFileSearch` | boolean                    | Se deve ativar a busca recursiva por nomes de arquivos na árvore atual ao completar prefixos `@` no prompt.                                                                                                                                                                                                                                              | `true`      |
| `context.fileFiltering.enableFuzzySearch`         | boolean                    | Quando `true`, ativa recursos de busca fuzzy ao procurar arquivos. Defina como `false` para melhorar o desempenho em projetos com um grande número de arquivos.                                                                                                                                                                                                              | `true`      |
| `context.gapThresholdMinutes`                     | number                     | Minutos de inatividade após os quais os blocos de pensamento retidos são limpos para liberar tokens de contexto. Alinha-se com o TTL típico do cache de prompt do provedor. Defina um valor maior se o seu provedor tiver um TTL de cache mais longo.                                                                                                                                                                     | `5`         |

#### Solução de problemas de desempenho na busca de arquivos

Se você estiver enfrentando problemas de desempenho na busca de arquivos (ex.: com conclusões `@`), especialmente em projetos com um número muito grande de arquivos, aqui estão algumas coisas que você pode tentar, em ordem de recomendação:

1. **Use `.qwenignore`:** Crie um arquivo `.qwenignore` na raiz do seu projeto para excluir diretórios que contêm um grande número de arquivos que você não precisa referenciar (ex.: artefatos de build, logs, `node_modules`). Reduzir o número total de arquivos indexados é a maneira mais eficaz de melhorar o desempenho.
2. **Desative a Busca Fuzzy:** Se ignorar arquivos não for suficiente, você pode desativar a busca fuzzy definindo `enableFuzzySearch` como `false` no seu arquivo `settings.json`. Isso usará um algoritmo de correspondência mais simples e não fuzzy, que pode ser mais rápido.
3. **Desative a Busca Recursiva de Arquivos:** Como último recurso, você pode desativar completamente a busca recursiva de arquivos definindo `enableRecursiveFileSearch` como `false`. Esta será a opção mais rápida, pois evita uma varredura recursiva do seu projeto. No entanto, significa que você precisará digitar o caminho completo dos arquivos ao usar conclusões `@`.

#### tools

| Configuração                              | Tipo              | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Padrão     | Notas                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                      | boolean or string | Ambiente de execução de sandbox (pode ser um booleano ou uma string de caminho).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.shell.enableInteractiveShell` | boolean           | Usa `node-pty` para uma experiência de shell interativo. O fallback para `child_process` ainda se aplica.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |                                                                                                                                                                                                                                                      |
| `tools.core`                         | array of strings  | **Obsoleto.** Será removido na próxima versão. Use `permissions.allow` + `permissions.deny` em vez disso. Restringe as ferramentas integradas a uma lista de permissões. Todas as ferramentas não na lista são desativadas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.exclude`                      | array of strings  | **Obsoleto.** Use `permissions.deny` em vez disso. Nomes de ferramentas a excluir da descoberta. Migrado automaticamente para o formato `permissions` no primeiro carregamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.allowed`                      | array of strings  | **Obsoleto.** Use `permissions.allow` em vez disso. Nomes de ferramentas que ignoram o diálogo de confirmação. Migrado automaticamente para o formato `permissions` no primeiro carregamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.approvalMode`                 | string            | Define o modo de aprovação padrão para o uso de ferramentas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `default`   | Valores possíveis: `plan` (apenas analisar, não modificar arquivos ou executar comandos), `default` (exige aprovação antes de edições de arquivo ou comandos shell), `auto-edit` (aprova automaticamente edições de arquivo), `yolo` (aprova automaticamente todas as chamadas de ferramenta) |
| `tools.discoveryCommand`             | string            | Comando a ser executado para descoberta de ferramentas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.callCommand`                  | string            | Define um comando shell personalizado para chamar uma ferramenta específica descoberta usando `tools.discoveryCommand`. O comando shell deve atender aos seguintes critérios: Deve receber o `name` da função (exatamente como na [declaração de função](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) como primeiro argumento de linha de comando. Deve ler os argumentos da função como JSON no `stdin`, análogo a [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall). Deve retornar a saída da função como JSON no `stdout`, análogo a [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse). | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.useRipgrep`                   | boolean           | Usa ripgrep para busca de conteúdo de arquivos em vez da implementação de fallback. Fornece desempenho de busca mais rápido.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`      |                                                                                                                                                                                                                                                      |
| `tools.useBuiltinRipgrep`            | boolean           | Usa o binário ripgrep incluído. Quando definido como `false`, o comando `rg` em nível de sistema será usado. Esta configuração só é efetiva quando `tools.useRipgrep` é `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `true`      |                                                                                                                                                                                                                                                      |
| `tools.truncateToolOutputThreshold`  | number            | Trunca a saída da ferramenta se for maior que este número de caracteres. Aplica-se às ferramentas Shell, Grep, Glob, ReadFile e ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `25000`     | Requer reinicialização: Sim                                                                                                                                                                                                                                |
| `tools.truncateToolOutputLines`      | number            | Número máximo de linhas ou entradas mantidas ao truncar a saída da ferramenta. Aplica-se às ferramentas Shell, Grep, Glob, ReadFile e ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `1000`      | Requer reinicialização: Sim                                                                                                                                                                                                                                |

> [!note]
>
> **Migrando de `tools.core` / `tools.exclude` / `tools.allowed`:** Essas configurações legadas estão **obsoletas** e são migradas automaticamente para o novo formato `permissions` no primeiro carregamento. Prefira configurar `permissions.allow` / `permissions.deny` diretamente. Use `/permissions` para gerenciar regras interativamente.

#### permissions

O sistema de permissões fornece controle granular sobre quais ferramentas podem ser executadas, quais exigem confirmação e quais são bloqueadas.

**Prioridade de decisão (maior primeiro): `deny` > `ask` > `allow` > _(padrão/modo interativo)_**

A primeira regra correspondente vence. As regras usam o formato `"ToolName"` ou `"ToolName(specifier)"`.

| Configuração             | Tipo             | Descrição                                                                                                      | Padrão     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | Regras para chamadas de ferramentas aprovadas automaticamente (sem necessidade de confirmação). Mescladas em todos os escopos (usuário + projeto + sistema). | `undefined` |
| `permissions.ask`   | array of strings | Regras para chamadas de ferramentas que sempre exigem confirmação do usuário. Tem prioridade sobre `allow`.                         | `undefined` |
| `permissions.deny`  | array of strings | Regras para chamadas de ferramentas bloqueadas. Maior prioridade — substitui tanto `allow` quanto `ask`.                               | `undefined` |

**Aliases de nome de ferramenta (qualquer um destes funciona nas regras):**

| Alias                 | Ferramenta canônica      | Notas                     |
| --------------------- | ------------------- | ------------------------- |
| `Bash`, `Shell`       | `run_shell_command` |                           |
| `Read`, `ReadFile`    | `read_file`         | Meta-categoria — veja abaixo |
| `Edit`, `EditFile`    | `edit`              | Meta-categoria — veja abaixo |
| `Write`, `WriteFile`  | `write_file`        |                           |
| `Grep`, `SearchFiles` | `grep_search`       |                           |
| `Glob`, `FindFiles`   | `glob`              |                           |
| `ListFiles`           | `list_directory`    |                           |
| `WebFetch`            | `web_fetch`         |                           |
| `Agent`               | `task`              |                           |
| `Skill`               | `skill`             |                           |

**Meta-categorias:**

Alguns nomes de regras cobrem automaticamente várias ferramentas:

| Nome da regra | Ferramentas cobertas                                        |
| --------- | ---------------------------------------------------- |
| `Read`    | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit`    | `edit`, `write_file`                                 |

> [!important]
> `Read(/path/**)` corresponde a **todas as quatro** ferramentas de leitura (leitura de arquivo, grep, glob e listagem de diretório).
> Para restringir apenas a leitura de arquivos, use `ReadFile(/path/**)` ou `read_file(/path/**)`.

**Exemplos de sintaxe de regras:**

| Regra                          | Significado                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `"Bash"`                      | Todos os comandos shell                                             |
| `"Bash(git *)"`               | Comandos shell que começam com `git` (limite de palavra: NÃO `gitk`) |
| `"Bash(git push *)"`          | Comandos shell como `git push origin main`                     |
| `"Bash(npm run *)"`           | Qualquer script `npm run`                                           |
| `"Read"`                      | Todas as operações de leitura de arquivo (read, grep, glob, list)              |
| `"Read(./secrets/**)"`        | Lê qualquer arquivo em `./secrets/` recursivamente                   |
| `"Edit(/src/**/*.ts)"`        | Edita arquivos TypeScript sob a raiz do projeto `/src/`               |
| `"WebFetch(api.example.com)"` | Busca de `api.example.com` e todos os seus subdomínios            |
| `"mcp__puppeteer"`            | Todas as ferramentas do servidor MCP puppeteer                        |

**Prefixos de padrão de caminho:**

| Prefixo | Significado                               | Exemplo             |
| ------ | ------------------------------------- | ------------------- |
| `//`   | Caminho absoluto a partir da raiz do sistema de arquivos    | `//etc/passwd`      |
| `~/`   | Relativo ao diretório home            | `~/Documents/*.pdf` |
| `/`    | Relativo à raiz do projeto              | `/src/**/*.ts`      |
| `./`   | Relativo ao diretório de trabalho atual | `./secrets/**`      |
| (nenhum) | Igual a `./`                          | `secrets/**`        |

**Prevenção de bypass de comando shell:**

As regras de permissão para `Read`, `Edit` e `WebFetch` também são aplicadas quando o agente executa comandos shell equivalentes. Por exemplo, se `Read(./.env)` estiver em `deny`, o agente não pode ignorá-lo via `cat .env` em um comando shell. Comandos shell suportados incluem `cat`, `grep`, `curl`, `wget`, `cp`, `mv`, `rm`, `chmod` e muitos outros. Comandos desconhecidos/seguros (ex.: `git`) não são afetados pelas regras de arquivo/rede.

**Migrando de configurações legadas:**

| Configuração legada  | Regra `permissions` equivalente   | Notas                                                        |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow`             | Migrado automaticamente no primeiro carregamento                                  |
| `tools.exclude` | `permissions.deny`              | Migrado automaticamente no primeiro carregamento                                  |
| `tools.core`    | `permissions.allow` (lista de permissão) | Migrado automaticamente; ferramentas não listadas são desativadas no nível do registro |

**Exemplo de configuração:**

```json
{
  "permissions": {
    "allow": ["Bash(git *)", "Bash(npm run *)", "Read(//Users/alice/code/**)"],
    "ask": ["Bash(git push *)", "Edit"],
    "deny": ["Bash(rm -rf *)", "Read(.env)", "WebFetch(malicious.com)"]
  }
}
```

> [!tip]
> Use `/permissions` na CLI interativa para visualizar, adicionar e remover regras sem editar o `settings.json` diretamente.

#### mcp

| Configuração             | Tipo             | Descrição                                                                                                                                                                                                                                                                  | Padrão     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | Comando para iniciar um servidor MCP.                                                                                                                                                                                                                                              | `undefined` |
| `mcp.allowed`       | array of strings | Uma lista de permissão de servidores MCP a permitir. Permite especificar uma lista de nomes de servidores MCP que devem ser disponibilizados ao modelo. Isso pode ser usado para restringir o conjunto de servidores MCP para conexão. Observe que isso será ignorado se `--allowed-mcp-server-names` estiver definido. | `undefined` |
| `mcp.excluded`      | array of strings | Uma lista de bloqueio de servidores MCP a excluir. Um servidor listado em ambos `mcp.excluded` e `mcp.allowed` é excluído. Observe que isso será ignorado se `--allowed-mcp-server-names` estiver definido.                                                                                           | `undefined` |

> [!note]
>
> **Nota de segurança para servidores MCP:** Essas configurações usam correspondência simples de string nos nomes dos servidores MCP, que podem ser modificados. Se você é um administrador de sistema buscando impedir que os usuários contornem isso, considere configurar o `mcpServers` no nível das configurações do sistema para que o usuário não possa configurar seus próprios servidores MCP. Isso não deve ser usado como um mecanismo de segurança à prova de falhas.

#### lsp

> [!warning]
> **Recurso Experimental**: O suporte a LSP é atualmente experimental e desativado por padrão. Ative-o usando o sinalizador de linha de comando `--experimental-lsp`.

O Language Server Protocol (LSP) fornece recursos de inteligência de código como ir para definição, encontrar referências e diagnósticos.

A configuração do servidor LSP é feita através de arquivos `.lsp.json` no diretório raiz do seu projeto, não através do `settings.json`. Consulte a [documentação do LSP](../features/lsp) para detalhes e exemplos de configuração.

#### security

| Configuração                        | Tipo    | Descrição                                       | Padrão     |
| ------------------------------ | ------- | ------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | Configuração para rastrear se a confiança de pasta está ativada. | `false`     |
| `security.auth.selectedType`   | string  | O tipo de autenticação atualmente selecionado.       | `undefined` |
| `security.auth.enforcedType`   | string  | O tipo de autenticação obrigatório (útil para empresas).  | `undefined` |
| `security.auth.useExternal`    | boolean | Se deve usar um fluxo de autenticação externo.   | `undefined` |

#### advanced

| Configuração                        | Tipo             | Descrição                                                                                                                                                                                                                                                                                                                        | Padrão                  |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | Configura automaticamente os limites de memória do Node.js.                                                                                                                                                                                                                                                                                     | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | A ordem de resolução DNS.                                                                                                                                                                                                                                                                                                          | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | Variáveis de ambiente a excluir do contexto do projeto. Especifica variáveis de ambiente que devem ser excluídas do carregamento a partir de arquivos `.env` do projeto. Isso impede que variáveis de ambiente específicas do projeto (como `DEBUG=true`) interfiram no comportamento da CLI. Variáveis de arquivos `.qwen/.env` nunca são excluídas. | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | Configuração para o comando de relatório de bug. Substitui a URL padrão para o comando `/bug`. Propriedades: `urlTemplate` (string): Uma URL que pode conter os placeholders `{title}` e `{info}`. Exemplo: `"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                    | `undefined`              |
| `advanced.tavilyApiKey`        | string           | API key para o serviço de busca web Tavily. Usado para ativar a funcionalidade da ferramenta `web_search`.                                                                                                                                                                                                                                         | `undefined`              |

> [!note]
>
> **Nota sobre advanced.tavilyApiKey:** Este é um formato de configuração legado. Para usuários do Qwen OAuth, o provedor DashScope está disponível automaticamente sem nenhuma configuração. Para outros tipos de autenticação, configure os provedores Tavily ou Google usando o novo formato de configuração `webSearch`.

#### mcpServers

Configura conexões com um ou mais servidores Model-Context Protocol (MCP) para descobrir e usar ferramentas personalizadas. O Qwen Code tenta se conectar a cada servidor MCP configurado para descobrir ferramentas disponíveis. Se vários servidores MCP expuserem uma ferramenta com o mesmo nome, os nomes das ferramentas serão prefixados com o alias do servidor que você definiu na configuração (ex.: `serverAlias__actualToolName`) para evitar conflitos. Observe que o sistema pode remover certas propriedades de schema das definições de ferramentas MCP para compatibilidade. Pelo menos um de `command`, `url` ou `httpUrl` deve ser fornecido. Se vários forem especificados, a ordem de precedência é `httpUrl`, depois `url`, depois `command`.

| Propriedade                                | Tipo             | Descrição                                                                                                                                                                                                                                                        | Opcional |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`      | string           | O comando a executar para iniciar o servidor MCP via I/O padrão.                                                                                                                                                                                                   | Sim      |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | Argumentos a passar para o comando.                                                                                                                                                                                                                                  | Sim      |
| `mcpServers.<SERVER_NAME>.env`          | object           | Variáveis de ambiente a definir para o processo do servidor.                                                                                                                                                                                                               | Sim      |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | O diretório de trabalho no qual iniciar o servidor.                                                                                                                                                                                                                | Sim      |
| `mcpServers.<SERVER_NAME>.url`          | string           | A URL de um servidor MCP que usa Server-Sent Events (SSE) para comunicação.                                                                                                                                                                                     | Sim      |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | A URL de um servidor MCP que usa HTTP streamable para comunicação.                                                                                                                                                                                              | Sim      |
| `mcpServers.<SERVER_NAME>.headers`      | object           | Um mapa de cabeçalhos HTTP para enviar com solicitações para `url` ou `httpUrl`.                                                                                                                                                                                                 | Sim      |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | Timeout em milissegundos para solicitações a este servidor MCP.                                                                                                                                                                                                           | Sim      |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | Confie neste servidor e ignore todas as confirma