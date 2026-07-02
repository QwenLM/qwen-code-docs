# Configuração do Qwen Code

> [!tip]
>
> **Autenticação / API keys:** A autenticação (API Key, Alibaba Cloud Coding Plan) e variáveis de ambiente relacionadas à autenticação (como `OPENAI_API_KEY`) estão documentadas em **[Authentication](../configuration/auth)**.

> [!note]
>
> **Nota sobre o novo formato de configuração**: O formato do arquivo `settings.json` foi atualizado para uma nova estrutura mais organizada. O formato antigo será migrado automaticamente.
> O Qwen Code oferece várias maneiras de configurar seu comportamento, incluindo variáveis de ambiente, argumentos de linha de comando e arquivos de configurações. Este documento descreve os diferentes métodos de configuração e as configurações disponíveis.

## Camadas de configuração

A configuração é aplicada na seguinte ordem de precedência (números menores são substituídos por números maiores):

| Nível | Fonte de configuração | Descrição |
| ----- | --------------------- | --------- |
| 1     | Valores padrão        | Padrões embutidos no aplicativo |
| 2     | Arquivo de padrões do sistema | Configurações padrão de todo o sistema que podem ser substituídas por outros arquivos de configuração |
| 3     | Arquivo de configurações do usuário | Configurações globais para o usuário atual |
| 4     | Arquivo de configurações do projeto | Configurações específicas do projeto |
| 5     | Arquivo de configurações do sistema | Configurações de todo o sistema que substituem todos os outros arquivos de configuração |
| 6     | Variáveis de ambiente | Variáveis de todo o sistema ou específicas da sessão, potencialmente carregadas de arquivos `.env` |
| 7     | Argumentos de linha de comando | Valores passados ao iniciar a CLI |

## Arquivos de configuração

O Qwen Code usa arquivos de configuração JSON para configuração persistente. Existem quatro locais para esses arquivos:

| Tipo de arquivo | Localização | Escopo |
| --------------- | ----------- | ------ |
| Arquivo de padrões do sistema | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>O caminho pode ser substituído usando a variável de ambiente `QWEN_CODE_SYSTEM_DEFAULTS_PATH`. | Fornece uma camada base de configurações padrão de todo o sistema. Essas configurações têm a menor precedência e destinam-se a ser substituídas por configurações de usuário, projeto ou substituições do sistema. |
| Arquivo de configurações do usuário | `~/.qwen/settings.json` (onde `~` é o seu diretório home). | Aplica-se a todas as sessões do Qwen Code para o usuário atual. |
| Arquivo de configurações do projeto | `.qwen/settings.json` dentro do diretório raiz do seu projeto. | Aplica-se apenas ao executar o Qwen Code a partir desse projeto específico. As configurações do projeto substituem as configurações do usuário. |
| Arquivo de configurações do sistema | Linux: `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>O caminho pode ser substituído usando a variável de ambiente `QWEN_CODE_SYSTEM_SETTINGS_PATH`. | Aplica-se a todas as sessões do Qwen Code no sistema, para todos os usuários. As configurações do sistema substituem as configurações de usuário e de projeto. Pode ser útil para administradores de sistemas em empresas terem controle sobre as configurações do Qwen Code dos usuários. |

> [!note]
>
> **Nota sobre variáveis de ambiente nas configurações:** Valores de string nos seus arquivos `settings.json` podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`. Essas variáveis serão resolvidas automaticamente quando as configurações forem carregadas. Por exemplo, se você tiver uma variável de ambiente `MY_API_TOKEN`, poderá usá-la no `settings.json` assim: `"apiKey": "$MY_API_TOKEN"`.

### O diretório `.qwen` no seu projeto

Além do arquivo de configurações do projeto, o diretório `.qwen` de um projeto pode conter outros arquivos específicos do projeto relacionados à operação do Qwen Code, como:

- [Perfis de sandbox personalizados](../features/sandbox) (por exemplo, `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).
- [Agent Skills](../features/skills) em `.qwen/skills/` (cada skill é um diretório contendo um `SKILL.md`).

### Migração de configuração

O Qwen Code migra automaticamente as configurações legadas para o novo formato. Os arquivos de configuração antigos são copiados antes da migração. As seguintes configurações foram renomeadas de nomenclatura negativa (`disable*`) para positiva (`enable*`):

| Configuração antiga | Nova configuração | Observações |
| ------------------- | ----------------- | ----------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate` | Consolidado em uma única configuração |
| `disableLoadingPhrases` | `ui.accessibility.enableLoadingPhrases` | |
| `disableFuzzySearch` | `context.fileFiltering.enableFuzzySearch` | |
| `disableCacheControl` | `model.generationConfig.enableCacheControl` | |

> [!note]
>
> **Inversão de valores booleanos:** Ao migrar, os valores booleanos são invertidos (por exemplo, `disableAutoUpdate: true` se torna `enableAutoUpdate: false`).

#### Política de consolidação para `disableAutoUpdate` e `disableUpdateNag`

Quando ambas as configurações legadas estão presentes com valores diferentes, a migração segue esta política: se **qualquer uma** das opções `disableAutoUpdate` **ou** `disableUpdateNag` for `true`, então `enableAutoUpdate` se torna `false`:

| `disableAutoUpdate` | `disableUpdateNag` | `enableAutoUpdate` migrado |
| ------------------- | ------------------ | -------------------------- |
| `false`             | `false`            | `true`                     |
| `false`             | `true`             | `false`                    |
| `true`              | `false`            | `false`                    |
| `true`              | `true`             | `false`                    |

### Configurações disponíveis no `settings.json`

As configurações são organizadas em categorias. A maioria das configurações deve ser colocada dentro do objeto de categoria de nível superior correspondente no seu arquivo `settings.json`. Algumas configurações de nível superior, como `proxy` e `plansDirectory`, permanecem como chaves raiz diretas para compatibilidade.

#### general

| Configuração | Tipo | Descrição | Padrão |
| ------------ | ---- | --------- | ------ |
| `general.preferredEditor` | string | O editor preferido para abrir arquivos. | `undefined` |
| `general.vimMode` | boolean | Ativa os atalhos de teclado do Vim. | `false` |
| `general.enableAutoUpdate` | boolean | Ativa a verificação e instalação automática de atualizações na inicialização. | `true` |
| `general.showSessionRecap` | boolean | Exibe automaticamente um resumo de uma linha de "onde você parou" ao retornar ao terminal após um período ausente. Desativado por padrão. Use `/recap` para acionar manualmente, independentemente desta configuração. | `false` |
| `general.sessionRecapAwayThresholdMinutes` | number | Minutos que o terminal deve ficar desfocado antes que um resumo automático seja acionado ao receber o foco. Usado apenas quando `showSessionRecap` está ativado. | `5` |
| `general.gitCoAuthor.commit` | boolean | Adiciona um rodapé Co-authored-by às mensagens de commit do git E anexa uma nota de git de atribuição de IA por arquivo (`refs/notes/ai-attribution`) para commits feitos através do Qwen Code. Desativar ignora ambos. | `true` |
| `general.gitCoAuthor.pr` | boolean | Adiciona uma linha de atribuição do Qwen Code às descrições de pull request ao executar `gh pr create`. | `true` |
| `general.defaultFileEncoding` | string | Codificação padrão para novos arquivos. Use `"utf-8"` (padrão) para UTF-8 sem BOM, ou `"utf-8-bom"` para UTF-8 com BOM. Altere isso apenas se o seu projeto exigir especificamente o BOM. | `"utf-8"` |
| `general.cleanupPeriodDays` | number | Dias para reter os backups de sessão de `~/.qwen/file-history/` usados por `/rewind`. Backups mais antigos que isso são removidos por uma tarefa em segundo plano que é executada no máximo uma vez por dia. `0` = retenção mínima (~1 hora): mantém as sessões acessadas na última hora mais a atualmente ativa. As alterações entram em vigor após a reinicialização. | `30` |
| `general.language` | enum | Idioma da interface do usuário. Use `"auto"` para detectar a partir das configurações do sistema, ou um código de idioma (por exemplo, `"zh-CN"`, `"fr"`). Códigos personalizados podem ser adicionados colocando arquivos de localidade JS em `~/.qwen/locales/`. Veja [i18n](../features/language). Requer reinicialização. | `"auto"` |
| `general.outputLanguage` | string | Idioma para a saída do modelo. Use `"auto"` para detectar a partir das configurações do sistema ou defina um idioma específico. Requer reinicialização. | `"auto"` |
| `general.dynamicCommandTranslation` | boolean | Ativa a tradução por IA das descrições de comandos slash dinâmicos. Quando desativado, os comandos dinâmicos mantêm suas descrições originais e ignoram as chamadas do modelo de tradução. | `false` |
| `general.terminalBell` | boolean | Toca um som de campainha do terminal quando uma resposta é concluída ou precisa de aprovação. | `true` |
| `general.preventSystemSleep` | boolean | Impede que o sistema entre em suspensão enquanto o Qwen Code está transmitindo uma resposta do modelo ou executando ferramentas. O tempo de ociosidade do prompt e os prompts de permissão não inibem a suspensão. Lido uma vez na inicialização, portanto, as alterações entram em vigor após a reinicialização. | `true` |
| `general.chatRecording` | boolean | Salva o histórico de chat no disco. Desativar isso também impede que `--continue` e `--resume` funcionem. Requer reinicialização. | `true` |

#### output

| Configuração | Tipo | Descrição | Padrão | Valores possíveis |
| ------------ | ---- | --------- | ------ | ----------------- |
| `output.format` | string | O formato da saída da CLI. | `"text"` | `"text"`, `"json"` |
| `output.showTimestamps` | boolean | Mostra um timestamp `[HH:MM:SS]` antes de cada resposta do assistente. | `false` | |

#### ui

| Configuração | Tipo | Descrição | Padrão |
| ------------ | ---- | --------- | ------ |
| `ui.theme` | string | O tema de cores para a UI. Veja [Themes](../configuration/themes) para as opções disponíveis. | `"Qwen Dark"` |
| `ui.customThemes` | object | Definições de temas personalizados. | `{}` |
| `ui.statusLine` | object | Configuração personalizada da linha de status. Suporta as opções `command`, `refreshInterval`, `respectUserColors` e `hideContextIndicator`. Veja [Status Line](../features/status-line). | `undefined` |
| `ui.hideWindowTitle` | boolean | Oculta a barra de título da janela. | `false` |
| `ui.hideTips` | boolean | Oculta todas as dicas (inicial e pós-resposta) na UI. Veja [Contextual Tips](../features/tips). | `false` |
| `ui.hideBanner` | boolean | Oculta o logo ASCII inicial e o painel de informações. As dicas e a entrada de chat ainda são renderizadas, a menos que `ui.hideTips` também esteja definido. | `false` |
| `ui.customBannerTitle` | string | Substitui o título padrão `>_ Qwen Code` no painel de informações do banner. O sufixo de versão `(vX.Y.Z)` é sempre anexado; as linhas de autenticação, modelo e caminho não são afetadas. Sanitizado; limitado a 80 caracteres. | `""` |
| `ui.customBannerSubtitle` | string | Linha de subtítulo opcional renderizada entre o título do banner e a linha de autenticação/modelo, no lugar da linha espaçadora em branco. Sanitizado; limitado a 160 caracteres. Vazio (padrão) mantém o espaçador em branco original. | `""` |
| `ui.customAsciiArt` | string \| object | Substitui o logo ASCII do QWEN no banner. Aceita uma string inline (usada para ambos os níveis de largura), `{ "path": "./brand.txt" }` (caminhos relativos são resolvidos em relação ao diretório do arquivo de configuração proprietário; lido uma vez na inicialização com `O_NOFOLLOW` no POSIX, limitado a 64 KB), ou `{ "small": ..., "large": ... }` para seleção consciente da largura. Sanitizado; limitado a 200 linhas × 200 colunas por nível. | `undefined` |
| `ui.showLineNumbers` | boolean | Mostra números de linha em blocos de código na saída da CLI. | `true` |
| `ui.renderMode` | string | Modo de exibição padrão do Markdown. Use `"render"` para visualizações visuais ricas ou `"raw"` para mostrar o Markdown orientado a fonte por padrão. Alterne durante uma sessão com `Alt/Option+M`; no macOS, o terminal deve enviar Option como Meta. Veja [Markdown Rendering](../features/markdown-rendering). | `"render"` |
| `ui.showCitations` | boolean | Mostra citações para texto gerado no chat. | `false` |
| `ui.history.collapseOnResume` | boolean | Se o histórico deve ser recolhido por padrão ao retomar uma sessão. Pode ser alternado via `/history collapse-on-resume` e `/history expand-on-resume`. | `false` |
| `ui.history.collapsePreviewCount` | number | Número de turnos de usuário mais recentes a serem mantidos visíveis quando `ui.history.collapseOnResume` está ativado. `0` recolhe todo o histórico restaurado por padrão; `-1` mostra todo o histórico restaurado. | `0` |
| `ui.compactMode` | boolean | Oculta a saída da ferramenta e o pensamento para uma visualização mais limpa. Alterne com `Ctrl+O` durante uma sessão ou através da caixa de diálogo Configurações. Os prompts de aprovação de ferramentas nunca são ocultos, mesmo no modo compacto. A configuração persiste entre as sessões. | `false` |
| `ui.shellOutputMaxLines` | number | Número máximo de linhas de saída do shell mostradas inline. Defina como `0` para desativar o limite e mostrar a saída completa. As linhas ocultas são exibidas através do indicador `+N lines`. Erros, comandos iniciados pelo usuário com prefixo `!`, confirmação de ferramentas e shells incorporados em foco sempre mostram a saída completa. | `5` |
| `ui.enableWelcomeBack` | boolean | Mostra a caixa de diálogo de boas-vindas ao retornar a um projeto com histórico de conversas. Quando ativado, o Qwen Code detectará automaticamente se você está retornando a um projeto com um resumo de projeto gerado anteriormente (`.qwen/PROJECT_SUMMARY.md`) e mostrará uma caixa de diálogo permitindo que você continue sua conversa anterior ou comece do zero. Se você escolher **Start new chat session**, essa escolha será lembrada para o projeto atual até que o resumo do projeto mude. Este recurso integra-se com o comando `/summary` e a caixa de diálogo de confirmação de saída. | `true` |
| `ui.accessibility.enableLoadingPhrases` | boolean | Ativa as frases de carregamento (desative para acessibilidade). | `true` |
| `ui.accessibility.screenReader` | boolean | Ativa o modo de leitor de tela, que ajusta a TUI para melhor compatibilidade com leitores de tela. | `false` |
| `ui.customWittyPhrases` | array of strings | Uma lista de frases personalizadas para exibir durante os estados de carregamento. Quando fornecida, a CLI alternará entre essas frases em vez das padrão. | `[]` |
| `ui.showResponseTokensPerSecond` | boolean | Mostra uma estimativa ao vivo de tokens/seg ao lado do contador de tokens de resposta enquanto o modelo está transmitindo. Esta é uma dica de velocidade de geração, não uma ETA ou porcentagem de conclusão. Entra em vigor na próxima sessão. | `false` |
| `ui.enableFollowupSuggestions` | boolean | Ativa as [sugestões de acompanhamento](../features/followup-suggestions) que preveem o que você deseja digitar a seguir após a resposta do modelo. As sugestões aparecem como texto de espaço reservado e são aceitas com Tab, Enter ou Seta para a direita (que preenchem a entrada — elas não enviam automaticamente). Ativado por padrão; defina como `false` para desativar. | `true` |
| `ui.enableCacheSharing` | boolean | Usa consultas bifurcadas com reconhecimento de cache para geração de sugestões. Reduz o custo em provedores que suportam cache de prefixo (experimental). | `true` |
| `ui.enableSpeculation` | boolean | Executa especulativamente as sugestões aceitas antes do envio. Os resultados aparecem instantaneamente quando você aceita (experimental). | `false` |
| `ui.showStatusInTitle` | boolean | Mostra o nome e o status da sessão do Qwen Code no título da janela do terminal. | `true` |
| `ui.disableWorkflowKeywordTrigger` | boolean | Quando `true`, mencionar a palavra `workflow` em um prompt não direciona mais suavemente o turno para a ferramenta Workflow (e o indicador `workflow active` no Rodapé é suprimido). Aplica-se apenas quando os workflows estão ativados. | `false` |
| `ui.enableUserFeedback` | boolean | Mostra uma caixa de diálogo de feedback opcional após as conversas para ajudar a melhorar o desempenho do Qwen. | `true` |
| `ui.compactInline` | boolean | Exibição compacta da ferramenta dentro de cada grupo em vez de mesclar entre grupos. Requer que `ui.compactMode` esteja ativado. Requer reinicialização. | `false` |
| `ui.useTerminalBuffer` | boolean | Renderiza o histórico de conversas em uma viewport rolável no aplicativo em vez do buffer de rolagem do terminal. Recomendado se você notar cintilação, tempestade de rolagem ou congelamento da interface em sessões longas. Role com `Shift+↑/↓` (linha), `PgUp`/`PgDn` (página), `Ctrl+Home/End` (início/fim) ou a roda do mouse. Não usa o buffer de rolagem do terminal host enquanto estiver ativado; segure `Shift` (ou `Option` no macOS) enquanto arrasta para a seleção nativa de texto. | `false` |
| `ui.hideBuiltinWorktreeIndicator` | boolean | Oculta a linha integrada `⎇ worktree-<branch> (<slug>)` no Rodapé. O estado do worktree ainda é passado para scripts de linha de status personalizados via payload stdin. Mantenha o padrão, a menos que sua linha de status personalizada renderize o próprio worktree. | `false` |
#### ide

| Setting            | Type    | Description                                          | Default |
| ------------------ | ------- | ---------------------------------------------------- | ------- |
| `ide.enabled`      | boolean | Ativa o modo de integração com a IDE.                | `false` |
| `ide.hasSeenNudge` | boolean | Indica se o usuário viu o aviso de integração com a IDE. | `false` |

#### privacy

| Setting                          | Type    | Description                            | Default |
| -------------------------------- | ------- | -------------------------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | Ativa a coleta de estatísticas de uso. | `true`  |

#### model

| Setting                                            | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Default     |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | O modelo Qwen a ser usado nas conversas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `undefined` |
| `model.baseUrl`                                    | string  | Persistido automaticamente pelo seletor de modelos para desambiguar quando várias entradas de `modelProviders` compartilham o mesmo ID de modelo. Não deve ser definido manualmente — use o seletor `/model` ou uma entrada de `modelProviders` em vez disso; um valor editado manualmente e desatualizado pode rotear silenciosamente as solicitações para um provedor diferente com o mesmo ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `undefined` |
| `model.sessionTokenLimit`                          | number  | Contagem máxima de tokens de prompt registrados permitida antes de enviar a próxima mensagem. `-1` significa ilimitado; `0` também é tratado como ilimitado (diferente de `model.maxToolCalls`, onde `0` não permite nenhuma chamada). Quando a contagem de prompts registrados excede o limite, o próximo envio é descartado (a sessão não é abortada).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `-1`        |
| `model.maxSessionTurns`                            | number  | Número máximo de turnos de usuário/modelo/ferramenta a serem mantidos em uma sessão. -1 significa ilimitado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `-1`        |
| `model.maxWallTimeSeconds`                         | number  | Orçamento de tempo de relógio (wall-clock) para execuções headless / não supervisionadas, em segundos. `-1` significa ilimitado. Pode ser substituído por invocação via `--max-wall-time`, que requer uma duração positiva (`90`, `30s`, `5m`, `1h`, `1.5h`); o mínimo é 1 segundo — valores sub-segundo (`500ms`, `0.5`) são rejeitados como erros de digitação. Omita a flag para voltar a esta configuração. Aborta com o código de saída 55 quando excedido.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `-1`        |
| `model.maxToolCalls`                               | number  | Orçamento cumulativo de chamadas de ferramentas para uma execução (conta cada ferramenta executada, com sucesso ou falha; `structured_output` sob `--json-schema` é isento). `-1` significa ilimitado; `0` significa "nenhuma chamada de ferramenta permitida". Limitado a 1.000.000 para evitar erros de digitação. Pode ser substituído via `--max-tool-calls`. Aborta com o código de saída 55 quando excedido.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `-1`        |
| `model.generationConfig`                           | object  | Substituições avançadas passadas para o gerador de conteúdo subjacente. Suporta controles de solicitação como `timeout`, `maxRetries`, `enableCacheControl`, `splitToolMedia` (padrão `true`; divide a mídia retornada pela ferramenta — incluindo imagens lidas pelo `read_file` integrado — em uma mensagem de usuário de acompanhamento em vez da mensagem `role: "tool"` que viola a especificação, para que servidores estritamente compatíveis com OpenAI como doubao / new-api / LM Studio possam vê-la; defina como `false` para restaurar o comportamento legado de incorporação na ferramenta), `toolResultContentFormat` (padrão `"parts"`; defina como `"string"` apenas para runtimes legados compatíveis com OpenAI cujos modelos de ferramenta ignoram partes de conteúdo de texto), `contextWindowSize` (substitui o tamanho da janela de contexto do modelo), `modalities` (substitui as modalidades de entrada detectadas automaticamente), `customHeaders` (cabeçalhos HTTP personalizados para solicitações de API) e `extra_body` (parâmetros de corpo adicionais apenas para solicitações de API compatíveis com OpenAI), junto com ajustes finos em `samplingParams` (por exemplo, `temperature`, `top_p`, `max_tokens`). Deixe não definido para confiar nos padrões do provedor. | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | **REMOVIDO.** Substituído por `context.autoCompactThreshold` (veja a seção `#### context` abaixo). A auto-compactação agora usa uma escada de limite de três níveis (aviso / automático / rígido) calculada internamente a partir da janela de contexto do modelo através da função `computeThresholds()`. A configuração antiga é ignorada silenciosamente (sem aviso de inicialização). Veja o PR #4345 / `docs/design/auto-compaction-threshold-redesign.md` para a justificativa do redesign.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `N/A`       |
| `model.chatCompression.maxRecentFilesToRetain`     | number  | Número de arquivos tocados mais recentemente cujo conteúdo atual é restaurado (incorporado se pequeno, caso contrário referenciado por caminho) no histórico após a auto-compactação. `0` não restaura nenhum. Substituição via variável de ambiente: `QWEN_COMPACT_MAX_RECENT_FILES`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `5`         |
| `model.chatCompression.maxRecentImagesToRetain`    | number  | Número de imagens mais recentes (capturas de tela de ferramentas / colagens do usuário) restauradas no histórico após a auto-compactação. `0` não restaura nenhuma. Substituição via variável de ambiente: `QWEN_COMPACT_MAX_RECENT_IMAGES`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `3`         |
| `model.chatCompression.enableScreenshotTrigger`    | boolean | Quando `true`, a auto-compactação também é acionada assim que o número de imagens retornadas pela ferramenta acumuladas no histórico atinge `screenshotTriggerThreshold`, independentemente do uso de tokens — voltado para sessões de uso do computador onde capturas de tela frequentes diluem a atenção do modelo. Conta apenas imagens retornadas dentro dos resultados da ferramenta, não imagens coladas pelo usuário. Substituição via variável de ambiente: `QWEN_COMPACT_SCREENSHOT_TRIGGER` (`1`/`true`/`0`/`false`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `true`      |
| `model.chatCompression.screenshotTriggerThreshold` | number  | Contagem de imagens retornadas pela ferramenta no qual ou acima do qual o gatilho de captura de tela é acionado (apenas quando `enableScreenshotTrigger`). A compactação redefine a contagem — as imagens sobreviventes são reincorporadas como partes de nível superior, que o gatilho não conta — portanto, não será acionado novamente imediatamente. Substituição via variável de ambiente: `QWEN_COMPACT_SCREENSHOT_THRESHOLD`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `50`        |
| `model.skipNextSpeakerCheck`                       | boolean | Ignora a verificação do próximo falante.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `true`      |
| `model.skipLoopDetection`                          | boolean | Desativa as verificações de detecção de loop de streaming. O padrão é `true` (a detecção de loop é ignorada) para evitar falsos positivos interrompendo fluxos de trabalho legítimos. Defina como `false` para reativar a detecção de loop de streaming — útil como uma salvaguarda em execuções headless / não interativas onde repetições travadas podem, de outra forma, desperdiçar o orçamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `true`      |
| `model.skipStartupContext`                         | boolean | Ignora o envio do contexto do espaço de trabalho de inicialização (resumo do ambiente e confirmação) no início de cada sessão. Ative isso se você preferir fornecer o contexto manualmente ou quiser economizar tokens na inicialização.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `false`     |
| `model.enableOpenAILogging`                        | boolean | Ativa o registro de chamadas da API OpenAI para depuração e análise. Quando ativado, as solicitações e respostas da API são registradas em arquivos JSON.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `false`     |
| `model.openAILoggingDir`                           | string  | Caminho de diretório personalizado para logs da API OpenAI. Se não especificado, o padrão é `logs/openai` no diretório de trabalho atual. Suporta caminhos absolutos, caminhos relativos (resolvidos a partir do diretório de trabalho atual) e expansão de `~` (diretório home).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |
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
      "toolResultContentFormat": "parts",
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

**max_tokens (limite de tokens de saída):**

Quando nem `samplingParams.max_tokens` nem `QWEN_CODE_MAX_OUTPUT_TOKENS` está definido, o Qwen Code geralmente usa o limite de saída declarado do modelo selecionado como o limite de saída padrão da requisição. Se a resposta ainda atingir esse limite, o Qwen Code pode tentar novamente com um limite maior (usando um piso de 64K) e então recuperar nos turnos de continuação.

Para provedores compatíveis com OpenAI, `samplingParams` também é um escape hatch para o formato da requisição: quando definido, suas chaves são passadas literalmente e o Qwen Code não sintetiza um padrão para `max_tokens`. Use isso para parâmetros específicos do provedor, como `max_completion_tokens`.

Para forçar um limite de saída fixo, defina `samplingParams.max_tokens` nas suas configurações ou use a variável de ambiente `QWEN_CODE_MAX_OUTPUT_TOKENS`. Limites explícitos desativam a escalação automática de tokens de saída.

**toolResultContentFormat:**

Controla como resultados de ferramentas apenas de texto são serializados em requisições compatíveis com OpenAI. O padrão `"parts"` mantém o formato padrão de array de partes de conteúdo. Defina como `"string"` apenas para runtimes legados compatíveis com OpenAI cujos templates de ferramentas ignoram partes de conteúdo de texto, como templates mais antigos do GLM-5.1 vLLM/SGLang. Mídia retornada por ferramentas ainda é controlada por `splitToolMedia`.

**contextWindowSize:**

Substitui o tamanho padrão da janela de contexto para o modelo selecionado. O Qwen Code determina a janela de contexto usando padrões integrados com base na correspondência do nome do modelo, com um valor de fallback constante. Use esta configuração quando o limite de contexto efetivo de um provedor diferir do padrão do Qwen Code. Este valor define a capacidade máxima de contexto assumida do modelo, não um limite de tokens por requisição.

Quando o modelo selecionado é definido em `modelProviders`, defina
`contextWindowSize` no `generationConfig` dessa entrada do provedor em vez do
`model.generationConfig` de nível superior. As entradas de modelo do provedor são seladas, então
as configurações de geração de nível superior não preenchem os campos ausentes do provedor.

**modalities:**

Substitui as modalidades de entrada detectadas automaticamente para o modelo selecionado. O Qwen Code detecta automaticamente as modalidades suportadas (imagem, PDF, áudio, vídeo) com base na correspondência de padrões do nome do modelo. Use esta configuração quando a detecção automática estiver incorreta — por exemplo, para habilitar `pdf` para um modelo que o suporta, mas não é reconhecido. Formato: `{ "image": true, "pdf": true, "audio": true, "video": true }`. Omita uma chave ou defina-a como `false` para tipos não suportados.

**customHeaders:**

Permite adicionar cabeçalhos HTTP personalizados a todas as requisições da API. Isso é útil para rastreamento de requisições, monitoramento, roteamento de gateway de API ou quando diferentes modelos exigem cabeçalhos diferentes. Para modelos de provedor, defina `customHeaders` em `modelProviders[].generationConfig.customHeaders`. Para modelos de runtime sem uma entrada de provedor correspondente, defina-o em `model.generationConfig.customHeaders`. Não ocorre mesclagem entre os dois níveis.

O campo `extra_body` permite adicionar parâmetros personalizados ao corpo da requisição enviado para a API. Isso é útil para opções específicas do provedor que não são cobertas pelos campos de configuração padrão. **Nota: Este campo é suportado apenas para provedores compatíveis com OpenAI (`openai`, `qwen-oauth`). Ele é ignorado para provedores Anthropic e Gemini.** Para modelos de provedor, defina `extra_body` em `modelProviders[].generationConfig.extra_body`. Para modelos de runtime sem uma entrada de provedor correspondente, defina-o em `model.generationConfig.extra_body`.

**Exemplos de model.openAILoggingDir:**

- `"~/qwen-logs"` - Registra logs no diretório `~/qwen-logs`
- `"./custom-logs"` - Registra logs em `./custom-logs` relativo ao diretório atual
- `"/tmp/openai-logs"` - Registra logs no caminho absoluto `/tmp/openai-logs`

#### fastModel

| Configuração | Tipo   | Descrição                                                                                                                                                                                                                                                      | Padrão |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `fastModel` | string | Modelo usado para gerar [sugestões de prompt](../features/followup-suggestions) e execução especulativa. Deixe vazio para usar o modelo principal. Um modelo menor/mais rápido (por exemplo, `qwen3-coder-flash`) reduz a latência e o custo. Também pode ser definido via `/model --fast`. | `""`    |

#### visionModel

| Configuração       | Tipo   | Descrição                                                                                                                                                                                                                        | Padrão |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `visionModel` | string | Modelo com capacidade de imagem usado como ponte de visão: quando um modelo principal apenas de texto recebe uma imagem, ela é transcrita por este modelo primeiro. Deixe vazio para selecionar automaticamente um modelo de visão do mesmo provedor. Também pode ser definido via `/model --vision`. | `""`    |

#### voiceModel

| Configuração      | Tipo   | Descrição                                                                                                                                             | Padrão |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `voiceModel` | string | Modelo usado para transcrição de voz. Deixe vazio para manter o ditado de voz desativado até que um modelo de voz seja selecionado. Também pode ser definido via `/model --voice`. | `""`    |

#### context

| Configuração                                                     | Tipo                       | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                       | Padrão                         |
| ----------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `context.fileName`                                          | string ou array de strings | O nome do(s) arquivo(s) de contexto.                                                                                                                                                                                                                                                                                                                                                                                                  | `undefined`                     |
| `context.autoCompactThreshold`                              | number                     | Fração da janela de contexto na qual a auto-compactação é acionada. Deve ser maior que 0 e no máximo 1. O padrão é `0.7` (70%). Para janelas de contexto grandes (>110K tokens), o ramo absoluto do sistema de limite de três níveis domina, então valores abaixo de ~0.7 podem não ter efeito visível. Limites personalizados afetam principalmente modelos de janela pequena (≤128K). Substitui o antigo `model.chatCompression.contextPercentageThreshold`. | `undefined` (usa 0.7 interno) |
| `context.importFormat`                                      | string                     | O formato a ser usado ao importar memória.                                                                                                                                                                                                                                                                                                                                                                                          | `undefined`                     |
| `context.includeDirectories`                                | array                      | Diretórios adicionais para incluir no contexto do workspace. Especifica um array de caminhos absolutos ou relativos adicionais para incluir no contexto do workspace. Diretórios ausentes serão ignorados com um aviso por padrão. Caminhos podem usar `~` para se referir ao diretório home do usuário. Esta configuração pode ser combinada com a flag de linha de comando `--include-directories`.                                                             | `[]`                            |
| `context.loadFromIncludeDirectories`                        | boolean                    | Controla o comportamento do comando `/memory refresh`. Se definido como `true`, os arquivos `QWEN.md` devem ser carregados de todos os diretórios adicionados. Se definido como `false`, o `QWEN.md` deve ser carregado apenas do diretório atual.                                                                                                                                                                                                    | `false`                         |
| `context.fileFiltering.respectGitIgnore`                    | boolean                    | Respeitar arquivos .gitignore ao pesquisar.                                                                                                                                                                                                                                                                                                                                                                                          | `true`                          |
| `context.fileFiltering.respectQwenIgnore`                   | boolean                    | Respeitar arquivos .qwenignore e arquivos de ignore personalizados configurados ao pesquisar.                                                                                                                                                                                                                                                                                                                                                            | `true`                          |
| `context.fileFiltering.customIgnoreFiles`                   | array                      | Arquivos de ignore relativos à raiz do projeto para usar em vez dos arquivos de compatibilidade padrão (`.agentignore`, `.aiignore`) quando `respectQwenIgnore` estiver habilitado. `.qwenignore` é sempre incluído.                                                                                                                                                                                                                                         | `[".agentignore", ".aiignore"]` |
| `context.fileFiltering.enableRecursiveFileSearch`           | boolean                    | Se deve habilitar a pesquisa recursiva por nomes de arquivos na árvore atual ao completar prefixos `@` no prompt.                                                                                                                                                                                                                                                                                                          | `true`                          |
| `context.fileFiltering.enableFuzzySearch`                   | boolean                    | Quando `true`, habilita recursos de pesquisa fuzzy ao procurar arquivos. Defina como `false` para melhorar o desempenho em projetos com um grande número de arquivos.                                                                                                                                                                                                                                                                          | `true`                          |
| `context.clearContextOnIdle.toolResultsThresholdMinutes`    | number                     | Minutos de inatividade antes de limpar o conteúdo antigo dos resultados de ferramentas. Use `-1` para desativar o gatilho de inatividade.                                                                                                                                                                                                                                                                                                                              | `60`                            |
| `context.clearContextOnIdle.toolResultsNumToKeep`           | integer                    | Número inteiro de resultados de ferramentas compactáveis mais recentes a serem preservados ao limpar. Valores abaixo de 1 são arredondados para 1.                                                                                                                                                                                                                                                                                                                | `5`                             |
| `context.clearContextOnIdle.toolResultsTotalCharsThreshold` | number                     | Total de caracteres de saída de resultados de ferramentas compactáveis permitidos no histórico antes de limpar os resultados mais antigos. Use `-1` para desativar o gatilho de tamanho. Este é um limite flexível: resultados de ferramentas recentes protegidos podem manter o total acima dele.                                                                                                                                                                                                     | `500000`                        |

#### Solução de Problemas de Desempenho na Pesquisa de Arquivos

Se você estiver enfrentando problemas de desempenho na pesquisa de arquivos (por exemplo, com conclusões `@`), especialmente em projetos com um número muito grande de arquivos, aqui estão algumas coisas que você pode tentar em ordem de recomendação:

1. **Use um arquivo de ignore:** Crie um `.qwenignore` ou um arquivo de ignore personalizado configurado na raiz do seu projeto para excluir diretórios que contêm um grande número de arquivos que você não precisa referenciar (por exemplo, artefatos de build, logs, `node_modules`). Reduzir o número total de arquivos rastreados é a maneira mais eficaz de melhorar o desempenho.
2. **Desative a Pesquisa Fuzzy:** Se ignorar arquivos não for suficiente, você pode desativar a pesquisa fuzzy definindo `enableFuzzySearch` como `false` no seu arquivo `settings.json`. Isso usará um algoritmo de correspondência mais simples e não fuzzy, que pode ser mais rápido.
3. **Desative a Pesquisa Recursiva de Arquivos:** Como último recurso, você pode desativar completamente a pesquisa recursiva de arquivos definindo `enableRecursiveFileSearch` como `false`. Esta será a opção mais rápida, pois evita uma varredura recursiva do seu projeto. No entanto, isso significa que você precisará digitar o caminho completo para os arquivos ao usar conclusões `@`.

#### tools

| Configuração                               | Tipo              | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Padrão     | Notas                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                       | boolean ou string | Ambiente de execução sandbox (pode ser um booleano ou uma string de caminho).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.sandboxImage`                  | string            | URI da imagem sandbox usada pelo Docker/Podman quando `--sandbox-image` e `QWEN_SANDBOX_IMAGE` não estão definidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.shell.enableInteractiveShell`  | boolean           | Use `node-pty` para uma experiência de shell interativa. O fallback para `child_process` ainda se aplica.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `true`      |                                                                                                                                                                                                                                                                                                                             |
| `tools.core`                          | array de strings  | **Depreciado.** Será removido na próxima versão. Use `permissions.allow` + `permissions.deny` em vez disso. Restringe as ferramentas integradas a uma lista de permissões. Todas as ferramentas que não estão na lista são desativadas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.exclude`                       | array de strings  | **Depreciado.** Use `permissions.deny` em vez disso. Nomes de ferramentas para excluir da descoberta. Migrado automaticamente para o formato `permissions` no primeiro carregamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.allowed`                       | array de strings  | **Depreciado.** Use `permissions.allow` em vez disso. Nomes de ferramentas que ignoram o diálogo de confirmação. Migrado automaticamente para o formato `permissions` no primeiro carregamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.approvalMode`                  | string            | Define o modo de aprovação padrão para o uso de ferramentas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `default`   | Valores possíveis: `plan` (apenas analisar, não modificar arquivos ou executar comandos), `default` (exigir aprovação antes de edições de arquivos ou execução de comandos de shell), `auto-edit` (aprovar edições de arquivos automaticamente), `auto` (classificador LLM aprova automaticamente ações seguras, bloqueia ações arriscadas), `yolo` (aprovar automaticamente todas as chamadas de ferramentas) |
| `tools.discoveryCommand`              | string            | Comando a ser executado para descoberta de ferramentas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.callCommand`                   | string            | Define um comando de shell personalizado para chamar uma ferramenta específica que foi descoberta usando `tools.discoveryCommand`. O comando de shell deve atender aos seguintes critérios: Deve receber o `name` da função (exatamente como na [declaração da função](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) como primeiro argumento de linha de comando. Deve ler os argumentos da função como JSON no `stdin`, de forma análoga a [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall). Deve retornar a saída da função como JSON no `stdout`, de forma análoga a [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse). | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.useRipgrep`                    | boolean           | Use ripgrep para pesquisa de conteúdo de arquivo em vez da implementação de fallback. Fornece desempenho de pesquisa mais rápido.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`      |                                                                                                                                                                                                                                                                                                                             |
| `tools.useBuiltinRipgrep`             | boolean           | Use o binário ripgrep incluído. Quando definido como `false`, o comando `rg` do nível do sistema será usado em vez disso. Esta configuração só é efetiva quando `tools.useRipgrep` é `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `true`      |                                                                                                                                                                                                                                                                                                                             |
| `tools.truncateToolOutputThreshold`   | number            | Trunca a saída da ferramenta se for maior que este número de caracteres. Aplica-se às ferramentas Shell, Grep, Glob, ReadFile e ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `25000`     | Requer reinicialização: Sim                                                                                                                                                                                                                                                                                                       |
| `tools.truncateToolOutputLines`       | number            | Máximo de linhas ou entradas mantidas ao truncar a saída da ferramenta. Aplica-se às ferramentas Shell, Grep, Glob, ReadFile e ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `1000`      | Requer reinicialização: Sim                                                                                                                                                                                                                                                                                                       |
| `tools.computerUse.enabled`           | boolean           | Habilita as ferramentas integradas de Computer Use (automação de desktop nativa cua-driver). Quando `true` (padrão), as ferramentas `computer_use__*` são registradas como integradas diferidas; a primeira invocação baixa o binário cua-driver fixado e assinado em `~/.qwen/computer-use/` e percorre as permissões de Acessibilidade / Gravação de Tela do macOS.                                                                                                                                                                                                                                                                                                                                                                                                       | `true`      | Requer reinicialização: Sim                                                                                                                                                                                                                                                                                                       |
| `tools.computerUse.maxImageDimension` | number            | Limite de pixels na borda mais longa aplicado às capturas de tela do cua-driver (via `max_image_dimension` do `set_config`). `-1` (padrão) mantém o padrão integrado do cua-driver (1568); `0` desativa o redimensionamento (resolução total); um valor positivo limita a borda mais longa. Limites menores reduzem o custo de tokens de visão às custas de detalhes finos.                                                                                                                                                                                                                                                                                                                                                                                                                                     | `-1`        | Requer reinicialização: Sim. Substituição por variável de ambiente: `QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION` (um inteiro não negativo; tem precedência sobre esta configuração)                                                                                                                                                                                   |
| `tools.toolSearch.enabled`            | boolean           | Carrega ferramentas MCP sob demanda via ToolSearch para reduzir o tamanho do prompt. Desative isso para modelos que dependem de cache KV baseado em prefixo (por exemplo, DeepSeek) para manter o prefixo do prompt estável e maximizar as taxas de acerto do cache.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `true`      | Requer reinicialização: Sim                                                                                                                                                                                                                                                                                                       |
> [!note]
>
> **Migrando de `tools.core` / `tools.exclude` / `tools.allowed`:** Essas configurações legadas estão **obsoletas** e são migradas automaticamente para o novo formato `permissions` no primeiro carregamento. Prefira configurar `permissions.allow` / `permissions.deny` diretamente. Use `/permissions` para gerenciar regras de forma interativa.

#### memory

| Setting                          | Type    | Description                                                                                                                                                                                           | Default |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `memory.enableManagedAutoMemory` | boolean | Habilita a extração em segundo plano de memórias a partir das conversas.                                                                                                                                          | `true`  |
| `memory.enableManagedAutoDream`  | boolean | Habilita a consolidação automática (deduplicação e limpeza) das memórias coletadas.                                                                                                                     | `true`  |
| `memory.enableAutoSkill`         | boolean | Habilita a revisão em segundo plano para skills reutilizáveis do projeto após sessões com uso intensivo de ferramentas.                                                                                                                       | `true`  |
| `memory.autoSkillConfirm`        | boolean | Pede confirmação antes que skills geradas automaticamente sejam adicionadas à biblioteca de skills. Quando desativado, as auto-skills são salvas imediatamente.                                                                        | `true`  |
| `memory.enableTeamMemory`        | boolean | Habilita uma camada de memória do projeto compartilhada com colaboradores por meio do diretório `.qwen/team-memory/` rastreado pelo git. As escritas nele são verificadas em busca de secrets e podem ser revisadas no diff do git.                            | `false` |
| `memory.enableTeamMemorySync`    | boolean | Quando a memória da equipe está habilitada, faz commit, pull com fast-forward e push automaticamente do diretório `.qwen/team-memory/` no início da sessão para que os colaboradores permaneçam sincronizados. Requer um upstream do git configurado. | `false` |

Consulte [Memory](../features/memory) para detalhes sobre como a auto-memory funciona e como usar os comandos `/memory`, `/remember` e `/dream`.

#### permissions

O sistema de permissões fornece controle detalhado sobre quais ferramentas podem ser executadas, quais requerem confirmação e quais são bloqueadas.

**Prioridade de decisão (da maior para a menor): `deny` > `ask` > `allow` > _(padrão/modo interativo)_**

A primeira regra correspondente vence. As regras usam o formato `"ToolName"` ou `"ToolName(specifier)"`.

| Setting             | Type             | Description                                                                                                      | Default     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | Regras para chamadas de ferramentas aprovadas automaticamente (sem necessidade de confirmação). Mescladas em todos os escopos (usuário + projeto + sistema). | `undefined` |
| `permissions.ask`   | array of strings | Regras para chamadas de ferramentas que sempre requerem confirmação do usuário. Tem prioridade sobre `allow`.                         | `undefined` |
| `permissions.deny`  | array of strings | Regras para chamadas de ferramentas bloqueadas. Maior prioridade — substitui tanto `allow` quanto `ask`.                               | `undefined` |

**Aliases de nomes de ferramentas (qualquer um destes funciona nas regras):**

| Alias                 | Canonical tool      | Notes                     |
| --------------------- | ------------------- | ------------------------- |
| `Bash`, `Shell`       | `run_shell_command` |                           |
| `Read`, `ReadFile`    | `read_file`         | Meta-categoria — veja abaixo |
| `Edit`, `EditFile`    | `edit`              | Meta-categoria — veja abaixo |
| `Write`, `WriteFile`  | `write_file`        |                           |
| `NotebookEdit`        | `notebook_edit`     |                           |
| `NotebookEditTool`    | `notebook_edit`     |                           |
| `Grep`, `SearchFiles` | `grep_search`       |                           |
| `Glob`, `FindFiles`   | `glob`              |                           |
| `ListFiles`           | `list_directory`    |                           |
| `WebFetch`            | `web_fetch`         |                           |
| `Agent`               | `task`              |                           |
| `Skill`               | `skill`             |                           |

**Meta-categorias:**

Alguns nomes de regras cobrem automaticamente várias ferramentas:

| Rule name | Tools covered                                        |
| --------- | ---------------------------------------------------- |
| `Read`    | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit`    | `edit`, `write_file`, `notebook_edit`                |

> [!important]
> `Read(/path/**)` corresponde a **todas as quatro** ferramentas de leitura (leitura de arquivo, grep, glob e listagem de diretório).
> Para restringir apenas a leitura de arquivos, use `ReadFile(/path/**)` ou `read_file(/path/**)`.

**Exemplos de sintaxe de regras:**

| Rule                          | Meaning                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `"Bash"`                      | Todos os comandos de shell                                             |
| `"Bash(git *)"`               | Comandos de shell que começam com `git` (limite de palavra: NÃO `gitk`) |
| `"Bash(git push *)"`          | Comandos de shell como `git push origin main`                     |
| `"Bash(npm run *)"`           | Qualquer script `npm run`                                           |
| `"Read"`                      | Todas as operações de leitura de arquivo (read, grep, glob, list)              |
| `"Read(./secrets/**)"`        | Lê qualquer arquivo em `./secrets/` recursivamente                   |
| `"Edit(/src/**/*.ts)"`        | Edita arquivos TypeScript sob a raiz do projeto `/src/`               |
| `"WebFetch(api.example.com)"` | Faz fetch de `api.example.com` e todos os seus subdomínios            |
| `"mcp__puppeteer"`            | Todas as ferramentas do servidor MCP puppeteer                        |

**Prefixos de padrão de caminho:**

| Prefix | Meaning                               | Example             |
| ------ | ------------------------------------- | ------------------- |
| `//`   | Caminho absoluto a partir da raiz do sistema de arquivos    | `//etc/passwd`      |
| `~/`   | Relativo ao diretório home            | `~/Documents/*.pdf` |
| `/`    | Relativo à raiz do projeto              | `/src/**/*.ts`      |
| `./`   | Relativo ao diretório de trabalho atual | `./secrets/**`      |
| (none) | Igual a `./`                          | `secrets/**`        |

**Prevenção de bypass de comandos shell:**

As regras de permissão para `Read`, `Edit` e `WebFetch` também são aplicadas quando o agente executa comandos shell equivalentes. Por exemplo, se `Read(./.env)` estiver em `deny`, o agente não poderá contorná-lo via `cat .env` em um comando shell. Os comandos shell suportados incluem `cat`, `grep`, `curl`, `wget`, `cp`, `mv`, `rm`, `chmod` e muitos outros. Comandos desconhecidos/seguros (por exemplo, `git`) não são afetados pelas regras de arquivo/rede.

**Migrando das configurações legadas:**

| Legacy setting  | Equivalent `permissions` rule   | Notes                                                        |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow`             | Migrado automaticamente no primeiro carregamento                                  |
| `tools.exclude` | `permissions.deny`              | Migrado automaticamente no primeiro carregamento                                  |
| `tools.core`    | `permissions.allow` (allowlist) | Migrado automaticamente; ferramentas não listadas são desabilitadas no nível do registro |

**Configuração de exemplo:**

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

#### slashCommands

Controla quais slash commands estão disponíveis na CLI. Útil para restringir
a superfície de comandos em implantações multi-tenant ou corporativas.

| Setting                  | Type             | Description                                                                                                                                                                                                                                                                                                                 | Default     |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `slashCommands.disabled` | array of strings | Nomes de slash commands para ocultar e recusar a execução. Correspondência sem distinção entre maiúsculas e minúsculas com o nome final do comando (para comandos de extensão, esta é a forma desambiguada, por exemplo, `myext.deploy`). **Mesclado como uma união entre os escopos**, então as configurações do workspace podem adicionar, mas não remover entradas definidas nas configurações de usuário ou sistema. | `undefined` |

A mesma denylist também pode ser fornecida via flag da CLI
`--disabled-slash-commands` (separada por vírgulas ou repetida) e a variável
de ambiente `QWEN_DISABLED_SLASH_COMMANDS`; os valores das três fontes são unidos.

**Exemplo — restringir comandos integrados para uma implantação em sandbox:**

```json
{
  "slashCommands": {
    "disabled": ["auth", "mcp", "extensions", "ide", "quit"]
  }
}
```

Com esses valores em um `settings.json` de nível de sistema (`/etc/qwen-code/settings.json`
ou `QWEN_CODE_SYSTEM_SETTINGS_PATH`), os usuários não podem reduzir a denylist a partir
de seu próprio escopo, e os comandos desabilitados não aparecerão no autocomplete nem
serão executados quando digitados.

> [!note]
> Esta configuração apenas controla o acesso aos slash commands (por exemplo, `/auth`, `/mcp`). Ela não
> afeta as permissões de ferramentas — veja `permissions.deny` para isso. Também não
> intercepta atalhos de teclado como `Ctrl+C` ou `Esc`.

#### mcp

| Setting             | Type             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                 | Default     |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | Comando para iniciar um servidor MCP.                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `mcp.allowed`       | array of strings | Uma allowlist de servidores MCP permitidos. Permite especificar uma lista de nomes de servidores MCP que devem ser disponibilizados para o modelo. Isso pode ser usado para restringir o conjunto de servidores MCP aos quais conectar. Suporta padrões glob (`*` corresponde a qualquer sequência, `?` corresponde a um único caractere — por exemplo, `"*puppeteer*"`); entradas sem caracteres glob são correspondidas exatamente. Note que isso será ignorado se `--allowed-mcp-server-names` estiver definido. | `undefined` |
| `mcp.excluded`      | array of strings | Uma denylist de servidores MCP para excluir. Um servidor listado tanto em `mcp.excluded` quanto em `mcp.allowed` é excluído. Suporta padrões glob (`*`, `?`) da mesma forma que `mcp.allowed`. Note que isso será ignorado se `--allowed-mcp-server-names` estiver definido.                                                                                                                                                                                         | `undefined` |

> [!note]
>
> **Nota de segurança para servidores MCP:** Essas configurações usam correspondência simples de strings nos nomes dos servidores MCP, que podem ser modificados. Se você é um administrador de sistema procurando impedir que os usuários contornem isso, considere configurar os `mcpServers` no nível das configurações do sistema para que o usuário não consiga configurar seus próprios servidores MCP. Isso não deve ser usado como um mecanismo de segurança à prova de falhas.

#### lsp

> [!warning]
> **Recurso experimental**: O suporte a LSP é atualmente experimental e está desabilitado por padrão. Habilite-o usando a flag de linha de comando `--experimental-lsp`.

O Language Server Protocol (LSP) fornece recursos de inteligência de código como ir para definição, buscar referências e diagnósticos.

A configuração do servidor LSP é feita por meio de arquivos `.lsp.json` no diretório raiz do seu projeto, e não pelo `settings.json`. Consulte a [documentação do LSP](../features/lsp) para detalhes de configuração e exemplos.

#### security

| Setting                        | Type    | Description                                                                                                                                                 | Default     |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | Configuração para rastrear se a confiança de pasta está habilitada.                                                                                                           | `false`     |
| `security.auth.selectedType`   | string  | O tipo de autenticação atualmente selecionado.                                                                                                                 | `undefined` |
| `security.auth.enforcedType`   | string  | O tipo de autenticação obrigatório (útil para empresas).                                                                                                            | `undefined` |
| `security.auth.useExternal`    | boolean | Se deve usar um fluxo de autenticação externo.                                                                                                             | `undefined` |
| `security.auth.apiKey`         | string  | **Obsoleto.** API key para autenticação compatível com OpenAI. Migre para `modelProviders` com `envKey` em vez disso — veja [Model Providers](./model-providers). | `undefined` |
| `security.auth.baseUrl`        | string  | **Obsoleto.** URL base para a API compatível com OpenAI. Migre para `modelProviders` em vez disso — veja [Model Providers](./model-providers).                     | `undefined` |

#### advanced

| Setting                        | Type             | Description                                                                                                                                                                                                                                                                                                                              | Default                  |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | Configura automaticamente os limites de memória do Node.js.                                                                                                                                                                                                                                                                                           | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | A ordem de resolução de DNS.                                                                                                                                                                                                                                                                                                                | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | Variáveis de ambiente para excluir do contexto do projeto. Especifica variáveis de ambiente que devem ser excluídas de serem carregadas a partir de arquivos `.env` do projeto. Isso impede que variáveis de ambiente específicas do projeto (como `DEBUG=true`) interfiram no comportamento da CLI. Variáveis de arquivos `.qwen/.env` nunca são excluídas.       | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | Configuração para o comando de relatório de bug. Substitui a URL padrão para o comando `/bug`. Propriedades: `urlTemplate` (string): Uma URL que pode conter os placeholders `{title}` e `{info}`. Exemplo: `"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                          | `undefined`              |
| `plansDirectory`               | string           | Diretório personalizado para arquivos aprovados do Plan Mode. Caminhos relativos são resolvidos a partir da raiz do projeto, e o caminho resolvido deve permanecer dentro da raiz do projeto. Se não estiver definido, os arquivos de plano são armazenados em `~/.qwen/plans`. **Requer reinicialização.** Se o diretório estiver dentro da raiz do projeto, adicione-o ao `.gitignore` para evitar o commit de arquivos de plano. | `undefined`              |

#### experimental

> [!warning]
>
> **Recursos experimentais.** Esses interruptores controlam capacidades em desenvolvimento e podem ser alterados ou removidos em versões futuras.

| Setting                             | Type    | Description                                                                                                                                                                                                                                                                                          | Default |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `experimental.cron`                 | boolean | Habilita ferramentas de cron/loop na sessão (`cron_create`, `cron_list`, `cron_delete`) para que o modelo possa criar prompts recorrentes. Pode ser desabilitado via variável de ambiente `QWEN_CODE_DISABLE_CRON=1`. Requer reinicialização.                                                                                  | `true`  |
| `experimental.agentTeam`            | boolean | Habilita ferramentas de colaboração de equipe de agentes (`team_create`, `task_create`, `task_update`, `send_message`, etc.) para coordenação multi-agente. Também pode ser habilitado via `QWEN_CODE_ENABLE_AGENT_TEAM=1`. Requer reinicialização.                                                                                   | `false` |
| `experimental.artifact`             | boolean | Habilita a ferramenta Artifact, permitindo que o modelo publique uma página HTML autossuficiente e a abra no navegador. Apenas para sessões interativas e não-SDK. Alterne via `QWEN_CODE_ENABLE_ARTIFACT=1` / `QWEN_CODE_DISABLE_ARTIFACT=1`. Requer reinicialização.                                                          | `false` |
| `experimental.emitToolUseSummaries` | boolean | Gera um rótulo curto baseado em LLM após a conclusão de cada lote de chamadas de ferramentas. Veja [Tool-Use Summaries](../features/tool-use-summaries). Requer que um modelo rápido esteja configurado (`fastModel`); caso contrário, é ignorado silenciosamente. Pode ser substituído por sessão com `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` ou `=1`. | `true`  |
#### mcpServers

Configura conexões com um ou mais servidores do Model-Context Protocol (MCP) para descobrir e usar ferramentas personalizadas. O Qwen Code tenta se conectar a cada servidor MCP configurado para descobrir as ferramentas disponíveis. Se vários servidores MCP expuserem uma ferramenta com o mesmo nome, os nomes das ferramentas serão prefixados com o alias do servidor que você definiu na configuração (por exemplo, `serverAlias__actualToolName`) para evitar conflitos. Observe que o sistema pode remover certas propriedades de esquema das definições de ferramentas MCP para compatibilidade. Pelo menos um de `command`, `url` ou `httpUrl` deve ser fornecido. Se múltiplos forem especificados, a ordem de precedência é `httpUrl`, depois `url` e, por fim, `command`.

| Property                                | Type             | Description                                                                                                                                                                                                                                                        | Optional |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`      | string           | O comando para executar e iniciar o servidor MCP via I/O padrão.                                                                                                                                                                                                   | Sim      |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | Argumentos a serem passados para o comando.                                                                                                                                                                                                                        | Sim      |
| `mcpServers.<SERVER_NAME>.env`          | object           | Variáveis de ambiente a serem definidas para o processo do servidor.                                                                                                                                                                                               | Sim      |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | O diretório de trabalho no qual iniciar o servidor.                                                                                                                                                                                                                | Sim      |
| `mcpServers.<SERVER_NAME>.url`          | string           | A URL de um servidor MCP que usa Server-Sent Events (SSE) para comunicação.                                                                                                                                                                                        | Sim      |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | A URL de um servidor MCP que usa HTTP transmissível (streamable HTTP) para comunicação.                                                                                                                                                                            | Sim      |
| `mcpServers.<SERVER_NAME>.headers`      | object           | Um mapa de cabeçalhos HTTP a serem enviados com requisições para `url` ou `httpUrl`.                                                                                                                                                                               | Sim      |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | Tempo limite em milissegundos para requisições a este servidor MCP.                                                                                                                                                                                                | Sim      |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | Confiar neste servidor e ignorar todas as confirmações de chamada de ferramenta.                                                                                                                                                                                   | Sim      |
| `mcpServers.<SERVER_NAME>.description`  | string           | Uma breve descrição do servidor, que pode ser usada para fins de exibição.                                                                                                                                                                                         | Sim      |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis neste servidor (comportamento de lista de permissões). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão.                                        | Sim      |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | Lista de nomes de ferramentas a serem excluídas deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída. | Sim      |

#### telemetry

Configura o registro de logs e a coleta de métricas para o Qwen Code. Para mais informações, consulte [telemetry](../../developers/development/telemetry.md).

| Setting                                     | Type    | Description                                                                                                                                                                                                                                                                              | Default   |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `telemetry.enabled`                         | boolean | Se a telemetria está habilitada ou não.                                                                                                                                                                                                                                                  |           |
| `telemetry.target`                          | string  | Rótulo informativo para o destino da telemetria (`local` ou `gcp`). Não controla o roteamento do exportador; defina `telemetry.otlpEndpoint` ou `telemetry.outfile` para configurar para onde os dados são enviados.                                                                                           |           |
| `telemetry.otlpEndpoint`                    | string  | O endpoint para o OTLP Exporter.                                                                                                                                                                                                                                                         |           |
| `telemetry.otlpProtocol`                    | string  | O protocolo para o OTLP Exporter (`grpc` ou `http`).                                                                                                                                                                                                                                     |           |
| `telemetry.logPrompts`                      | boolean | Se o conteúdo dos prompts do usuário deve ser incluído nos logs ou não.                                                                                                                                                                                                                  |           |
| `telemetry.includeSensitiveSpanAttributes`  | boolean | Quando habilitado, anexa prompts de usuário, prompts de sistema, entradas/saídas de ferramentas e respostas do modelo textuais aos atributos nativos de span do OTel (além dos spans da ponte de log-para-span). ⚠️ Transmite dados sensíveis — conteúdos de arquivos, comandos de shell, histórico de conversas — para o seu backend OTLP. | `false`   |
| `telemetry.sensitiveSpanAttributeMaxLength` | number  | Comprimento máximo de string JavaScript para cada payload de conteúdo de atributo nativo de span do OTel sensível. Deve estar entre `1` e `104857600` (100 MiB). Defina um valor menor se o seu coletor ou backend rejeitar atributos grandes.                                                  | `1048576` |
| `telemetry.outfile`                         | string  | Caminho para gravar a telemetria em um arquivo. Quando definido, substitui a exportação OTLP.                                                                                                                                                                                            |           |

### Example `settings.json`

Aqui está um exemplo de um arquivo `settings.json` com a estrutura aninhada, nova a partir da v0.3.0:

```
{
  "proxy": "http://localhost:7890",
  "plansDirectory": "./.qwen/plans",
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of 'em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1",
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
    "logPrompts": true,
    "includeSensitiveSpanAttributes": false,
    "sensitiveSpanAttributeMaxLength": 1048576
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "enableOpenAILogging": false,
    "openAILoggingDir": "~/qwen-logs",
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

## Shell History

A CLI mantém um histórico dos comandos de shell que você executa. Para evitar conflitos entre diferentes projetos, este histórico é armazenado em um diretório específico do projeto dentro da pasta home do seu usuário.

- **Localização:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` é um identificador único gerado a partir do caminho raiz do seu projeto.
  - O histórico é armazenado em um arquivo chamado `shell_history`.

## Environment Variables & `.env` Files

Variáveis de ambiente são uma forma comum de configurar aplicações, especialmente para informações sensíveis (como tokens) ou para configurações que podem mudar entre ambientes.

O Qwen Code pode carregar automaticamente variáveis de ambiente a partir de arquivos `.env`.
Para variáveis relacionadas à autenticação (como `OPENAI_*`) e a abordagem recomendada com `.qwen/.env`, consulte **[Authentication](../configuration/auth)**.

> [!tip]
>
> **Exclusão de Variáveis de Ambiente:** Algumas variáveis de ambiente (como `DEBUG` e `DEBUG_MODE`) são excluídas automaticamente dos arquivos `.env` do projeto por padrão para evitar interferências no comportamento da CLI. Variáveis de arquivos `.qwen/.env` nunca são excluídas. Você pode personalizar esse comportamento usando a configuração `advanced.excludedEnvVars` no seu arquivo `settings.json`.

### Environment Variables Table

| Variable                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_HOME`                                          | Personaliza o diretório de configuração global (padrão: `~/.qwen`). Aceita um caminho absoluto ou relativo (caminhos relativos são resolvidos a partir do diretório de trabalho atual). O `~` inicial é expandido para o diretório home do usuário.                                                                                                                                                             | Armazena credenciais, configurações, memória, skills e outros estados globais. Quando definido, os diretórios `.qwen/` no nível do projeto não são afetados. Uma string vazia é tratada como não definida.                                                                                                                                                                                                                                                                        |
| `QWEN_RUNTIME_DIR`                                   | Substitui o diretório de saída de runtime (conversas, logs, todos). Quando não definido, o padrão é o diretório `QWEN_HOME`.                                                                                                                                                                                                                                                                                     | Use isso para separar dados efêmeros de runtime da configuração persistente. Útil quando `QWEN_HOME` está em um sistema de arquivos compartilhado/lento.                                                                                                                                                                                                                                                                                                                           |
| `QWEN_TELEMETRY_ENABLED`                             | Defina como `true` ou `1` para habilitar a telemetria. Qualquer outro valor é tratado como desabilitado.                                                                                                                                                                                                                                                                                                         | Substitui a configuração `telemetry.enabled`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `QWEN_TELEMETRY_TARGET`                              | Define um rótulo informativo para o destino da telemetria (`local` ou `gcp`). Não controla o roteamento; use `QWEN_TELEMETRY_OTLP_ENDPOINT` ou `QWEN_TELEMETRY_OUTFILE` para configurar para onde os dados são enviados.                                                                                                                                                                                         | Substitui a configuração `telemetry.target`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | Define o endpoint OTLP para telemetria.                                                                                                                                                                                                                                                                                                                                                                          | Substitui a configuração `telemetry.otlpEndpoint`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | Define o protocolo OTLP (`grpc` ou `http`).                                                                                                                                                                                                                                                                                                                                                                      | Substitui a configuração `telemetry.otlpProtocol`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `QWEN_TELEMETRY_LOG_PROMPTS`                         | Defina como `true` ou `1` para habilitar ou desabilitar o registro de prompts do usuário. Qualquer outro valor é tratado como desabilitado.                                                                                                                                                                                                                                                                      | Substitui a configuração `telemetry.logPrompts`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | Defina como `true` ou `1` para anexar prompts de usuário, prompts de sistema, I/O de ferramentas e respostas do modelo textuais aos atributos nativos de span do OTel (e manter `prompt` / `function_args` / `response_text` nos spans da ponte de log-para-span). Qualquer outro valor o desabilita.                                                                                                                | Substitui a configuração `telemetry.includeSensitiveSpanAttributes`. ⚠️ Transmite dados sensíveis para o seu backend OTLP.                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | Define o comprimento máximo de string JavaScript para cada payload de conteúdo de atributo nativo de span do OTel sensível. Deve ser um inteiro positivo não maior que `104857600` (100 MiB).                                                                                                                                                                                                                    | Substitui a configuração `telemetry.sensitiveSpanAttributeMaxLength`. O padrão é `1048576` (1 MiB); diminua o valor se o seu coletor ou backend rejeitar atributos de span grandes.                                                                                                                                                                                                                                                                                                |
| `QWEN_TELEMETRY_OUTFILE`                             | Define o caminho do arquivo para gravar a telemetria. Quando definido, substitui a exportação OTLP.                                                                                                                                                                                                                                                                                                                | Substitui a configuração `telemetry.outfile`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `QWEN_SANDBOX`                                       | Alternativa para a configuração `sandbox` no `settings.json`.                                                                                                                                                                                                                                                                                                                                                    | Aceita `true`, `false`, `docker`, `podman` ou uma string de comando personalizada.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `QWEN_SANDBOX_IMAGE`                                 | Substitui a seleção de imagem do sandbox para Docker/Podman.                                                                                                                                                                                                                                                                                                                                                     | Tem precedência sobre `tools.sandboxImage`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SEATBELT_PROFILE`                                   | (Específico do macOS) Alterna o perfil do Seatbelt (`sandbox-exec`) no macOS.                                                                                                                                                                                                                                                                                                                                    | `permissive-open`: (Padrão) Restringe gravações na pasta do projeto (e algumas outras pastas, veja `packages/cli/src/utils/sandbox-macos-permissive-open.sb`), mas permite outras operações. `strict`: Usa um perfil estrito que recusa operações por padrão. `<profile_name>`: Usa um perfil personalizado. Para definir um perfil personalizado, crie um arquivo chamado `sandbox-macos-<profile_name>.sb` no diretório `.qwen/` do seu projeto (por exemplo, `my-project/.qwen/sandbox-macos-custom.sb`). |
| `DEBUG` or `DEBUG_MODE`                              | (frequentemente usado por bibliotecas subjacentes ou pela própria CLI) Defina como `true` ou `1` para habilitar o registro de debug detalhado, o que pode ser útil para solução de problemas.                                                                                                                                                                                                                    | **Nota:** Essas variáveis são excluídas automaticamente dos arquivos `.env` do projeto por padrão para evitar interferências no comportamento da CLI. Use arquivos `.qwen/.env` se precisar definir isso especificamente para o Qwen Code.                                                                                                                                                                                                                                          |
| `NO_COLOR`                                           | Defina com qualquer valor para desabilitar toda a saída colorida na CLI.                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `FORCE_HYPERLINK`                                    | Substitui a detecção de links clicáveis OSC 8 no renderizador de markdown. Defina como `1` (ou qualquer inteiro diferente de zero, ou string vazia) para forçar a ativação; defina como `0` ou um valor não numérico como `false` / `off` para forçar a desativação. Respeita as opções de exclusão `NO_COLOR` / `QWEN_DISABLE_HYPERLINKS` acima dele.                                                                 | Use isso para ativar o OSC 8 dentro do `tmux` / GNU `screen` (a detecção automática recusa por padrão porque as capacidades do terminal host estão ocultas atrás do multiplexador). Requer `set -g allow-passthrough on` no tmux 3.3+. Também ativa o Hyper, que não é detectado automaticamente.                                                                                                                                                                                   |
| `QWEN_DISABLE_HYPERLINKS`                            | Defina como `1` para desabilitar fortemente os hyperlinks clicáveis OSC 8 no renderizador de markdown, mesmo em terminais que são detectados automaticamente como compatíveis.                                                                                                                                                                                                                                   | Útil quando um terminal anuncia suporte, mas falha com URLs longas, ou ao canalizar a saída através de um intermediário que corrompe sequências de escape. O renderizador volta para a renderização simples de `label (url)`.                                                                                                                                                                                                                                                       |
| `CLI_TITLE`                                          | Defina como uma string para personalizar o título da CLI.                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`                               | Especifica o endpoint para o servidor de assistência de código.                                                                                                                                                                                                                                                                                                                                                  | Isso é útil para desenvolvimento e testes.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_CODE_MAX_OUTPUT_TOKENS`                        | Substitui o limite padrão máximo de tokens de saída por resposta. Quando não definido, o Qwen Code usa o limite de saída declarado pelo modelo e, se uma resposta for truncada, escala automaticamente (piso de 64K) e se recupera entre os turnos. Defina isso com um valor específico (por exemplo, `16000`) para usar um limite fixo — útil para backends auto-hospedados com capacidade restrita que desejam uma reserva de slots por requisição menor. | Tem precedência sobre o padrão do limite do modelo, mas é substituído por `samplingParams.max_tokens` nas configurações. Desabilita a escala automática quando definido. Exemplo: `export QWEN_CODE_MAX_OUTPUT_TOKENS=16000`                                                                                                                                                                                                                                                        |
| `QWEN_CODE_UNATTENDED_RETRY`                         | Defina como `true` ou `1` para habilitar o modo de retry persistente. Quando habilitado, erros transitórios de capacidade da API (HTTP 429 Rate Limit e 529 Overloaded) são repetidos indefinidamente com backoff exponencial (limitado a 5 minutos por retry) e keepalives de heartbeat a cada 30 segundos no stderr.                                                                                             | Projetado para pipelines de CI/CD e automação em background, onde tarefas de longa duração devem sobreviver a interrupções temporárias da API. Deve ser definido explicitamente — `CI=true` sozinho **não** ativa este modo. Veja [Headless Mode](../features/headless#persistent-retry-mode) para detalhes. Exemplo: `export QWEN_CODE_UNATTENDED_RETRY=1`                                                                                                                          |
| `QWEN_CODE_PROFILE_STARTUP`                          | Defina como `1` para habilitar a análise de desempenho de inicialização. Grava um relatório de tempo em JSON em `~/.qwen/startup-perf/` com durações por fase.                                                                                                                                                                                                                                                    | Ativo apenas dentro do processo filho do sandbox (ou com `QWEN_CODE_PROFILE_STARTUP_OUTER=1`). Zero overhead quando não definido. Exemplo: `export QWEN_CODE_PROFILE_STARTUP=1`                                                                                                                                                                                                                                                                                                     |
| `QWEN_CODE_PROFILE_STARTUP_OUTER`                    | Defina como `1` junto com `QWEN_CODE_PROFILE_STARTUP=1` para também coletar um perfil de inicialização no processo externo (pré-sandbox). Os relatórios do processo externo recebem um prefixo de nome de arquivo `outer-` para mantê-los distintos do relatório do processo filho do sandbox.                                                                                                                                               | Desativado por padrão — apenas o processo filho do sandbox coleta, para evitar relatórios duplicados. Útil para desenvolvimento local onde a CLI não é reiniciada em um sandbox.                                                                                                                                                                                                                                                                                                   |
| `QWEN_CODE_PROFILE_STARTUP_NO_HEAP`                  | Defina como `1` junto com `QWEN_CODE_PROFILE_STARTUP=1` para pular os snapshots de `process.memoryUsage()` por checkpoint. Útil para medir o próprio overhead de Heisenberg do profiler.                                                                                                                                                                                                                           | Desativado por padrão. Os snapshots de heap custam ~50 µs cada (bem abaixo de 1% da inicialização total), então a maioria dos usuários deve deixar isso como está.                                                                                                                                                                                                                                                                                                                 |
| `QWEN_CODE_LEGACY_MCP_BLOCKING`                      | Defina como `1` para restaurar o comportamento pré-MCP progressivo onde `Config.initialize()` espera sincronamente pelo handshake de descoberta de cada servidor MCP configurado antes de retornar.                                                                                                                                                                                                                | Desativado por padrão. O qwen-code moderno permite que os servidores MCP fiquem online em background enquanto a UI já está interativa; o modelo vê cada lote de novas ferramentas dentro de ~16 ms após o servidor estabilizar. Esta flag é mantida como uma saída de rollback para >= 1 release. Exemplo: `export QWEN_CODE_LEGACY_MCP_BLOCKING=1`                                                                                                                                |
Quando ambos os arquivos `.env` no nível do usuário definem a mesma variável, o arquivo
específico do Qwen tem precedência: `<QWEN_HOME>/.env` (ou `~/.qwen/.env` quando `QWEN_HOME` não está definido) é
carregado antes de `~/.env`, e os valores de ambiente existentes não são sobrescritos.

## Argumentos da Linha de Comando

Argumentos passados diretamente ao executar a CLI podem sobrescrever outras configurações para aquela sessão específica.

Para a seleção da imagem do sandbox, a precedência é:
`--sandbox-image` > `QWEN_SANDBOX_IMAGE` > `tools.sandboxImage` > imagem padrão integrada.

### Tabela de Argumentos da Linha de Comando

| Argumento | Alias | Descrição | Valores Possíveis | Observações |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model` | `-m` | Especifica o modelo Qwen a ser usado nesta sessão. | Nome do modelo | Exemplo: `npm start -- --model qwen3-coder-plus` |
| `--prompt` | `-p` | Usado para passar um prompt diretamente para o comando. Isso invoca o Qwen Code em modo não interativo. | Seu texto de prompt | Para exemplos de scripts, use a flag `--output-format json` para obter uma saída estruturada. |
| `--prompt-interactive` | `-i` | Inicia uma sessão interativa com o prompt fornecido como entrada inicial. | Seu texto de prompt | O prompt é processado dentro da sessão interativa, não antes dela. Não pode ser usado ao canalizar a entrada do stdin. Exemplo: `qwen -i "explain this code"` |
| `--system-prompt` | | Sobrescreve o prompt do sistema da sessão principal integrado para esta execução. | Seu texto de prompt | Arquivos de contexto carregados, como `QWEN.md`, ainda são anexados após esta sobrescrita. Pode ser combinado com `--append-system-prompt`. |
| `--append-system-prompt` | | Anexa instruções extras ao prompt do sistema da sessão principal para esta execução. | Seu texto de prompt | Aplicado após o prompt integrado e os arquivos de contexto carregados. Pode ser combinado com `--system-prompt`. Veja [Modo Headless](../features/headless) para exemplos. |
| `--output-format` | `-o` | Especifica o formato da saída da CLI para o modo não interativo. | `text`, `json`, `stream-json` | `text`: (Padrão) A saída padrão legível por humanos. `json`: Uma saída JSON legível por máquinas emitida no final da execução. `stream-json`: Mensagens JSON em streaming emitidas conforme ocorrem durante a execução. Para saída estruturada e scripts, use a flag `--output-format json` ou `--output-format stream-json`. Veja [Modo Headless](../features/headless) para informações detalhadas. |
| `--input-format` | | Especifica o formato consumido a partir da entrada padrão. | `text`, `stream-json` | `text`: (Padrão) Entrada de texto padrão do stdin ou argumentos da linha de comando. `stream-json`: Protocolo de mensagens JSON via stdin para comunicação bidirecional. Requisito: `--input-format stream-json` requer que `--output-format stream-json` seja definido. Ao usar `stream-json`, o stdin é reservado para mensagens do protocolo. Veja [Modo Headless](../features/headless) para informações detalhadas. |
| `--include-partial-messages` | | Inclui mensagens parciais do assistente ao usar o formato de saída `stream-json`. Quando habilitado, emite eventos de stream (message_start, content_block_delta, etc.) conforme ocorrem durante o streaming. | | Padrão: `false`. Requisito: Requer que `--output-format stream-json` seja definido. Veja [Modo Headless](../features/headless) para informações detalhadas sobre eventos de stream. |
| `--sandbox` | `-s` | Habilita o modo sandbox para esta sessão. | | |
| `--sandbox-image` | | Define o URI da imagem do sandbox. | | |
| `--debug` | `-d` | Habilita o modo de depuração para esta sessão, fornecendo uma saída mais detalhada. | | |
| `--all-files` | `-a` | Se definido, inclui recursivamente todos os arquivos no diretório atual como contexto para o prompt. | | |
| `--help` | `-h` | Exibe informações de ajuda sobre os argumentos da linha de comando. | | |
| `--show-memory-usage` | | Exibe o uso atual de memória. | | |
| `--yolo` | | Habilita o modo YOLO, que aprova automaticamente todas as chamadas de ferramentas. | | |
| `--approval-mode` | | Define o modo de aprovação para chamadas de ferramentas. | `plan`, `default`, `auto-edit`, `auto`, `yolo` | Modos suportados: `plan`: Apenas analisar—não modificar arquivos ou executar comandos. `default`: Exigir aprovação para edições de arquivos ou comandos shell (comportamento padrão). `auto-edit`: Aprovar automaticamente ferramentas de edição (`edit`, `write_file`, `notebook_edit`) enquanto solicita para as outras. `auto`: O classificador LLM aprova automaticamente ações seguras e bloqueia as arriscadas. `yolo`: Aprovar automaticamente todas as chamadas de ferramentas (equivalente a `--yolo`). Não pode ser usado junto com `--yolo`. Use `--approval-mode=yolo` em vez de `--yolo` para a nova abordagem unificada. Exemplo: `qwen --approval-mode auto-edit`<br>Veja mais sobre [Modo de Aprovação](../features/approval-mode). |
| `--allowed-tools` | | Uma lista separada por vírgulas de nomes de ferramentas que ignorarão a caixa de diálogo de confirmação. | Nomes de ferramentas | Exemplo: `qwen --allowed-tools "Shell(git status)"` |
| `--disabled-slash-commands` | | Nomes de comandos slash para ocultar/desabilitar (separados por vírgula ou repetidos). Unido com a configuração `slashCommands.disabled` e a variável de ambiente `QWEN_DISABLED_SLASH_COMMANDS`. Correspondência sem distinção entre maiúsculas e minúsculas com o nome final do comando. | Nomes de comandos | Exemplo: `qwen --disabled-slash-commands "auth,mcp,extensions"` |
| `--telemetry` | | Habilita a [telemetria](../../developers/development/telemetry.md). | | |
| `--telemetry-target` | | Define o destino da telemetria. | | Veja a [telemetria](../../developers/development/telemetry.md) para mais informações. |
| `--telemetry-otlp-endpoint` | | Define o endpoint OTLP para telemetria. | | Veja a [telemetria](../../developers/development/telemetry.md) para mais informações. |
| `--telemetry-otlp-protocol` | | Define o protocolo OTLP para telemetria (`grpc` ou `http`). | | O padrão é `grpc`. Veja a [telemetria](../../developers/development/telemetry.md) para mais informações. |
| `--telemetry-log-prompts` | | Habilita o registro de prompts para telemetria. | | Veja a [telemetria](../../developers/development/telemetry.md) para mais informações. |
| `--acp` | | Habilita o modo ACP (Agent Client Protocol). Útil para integrações de IDE/editor como o [Zed](../integration-zed). | | Estável. Substitui a flag obsoleta `--experimental-acp`. |
| `--experimental-lsp` | | Habilita o recurso experimental de [LSP (Language Server Protocol)](../features/lsp) para inteligência de código (ir para definição, encontrar referências, diagnósticos, etc.). | | Experimental. Requer que os language servers estejam instalados. |
| `--extensions` | `-e` | Especifica uma lista de extensões a serem usadas na sessão. | Nomes de extensões | Se não fornecido, todas as extensões disponíveis são usadas. Use o termo especial `qwen -e none` para desabilitar todas as extensões. Exemplo: `qwen -e my-extension -e my-other-extension` |
| `--list-extensions` | `-l` | Lista todas as extensões disponíveis e sai. | | |
| `--proxy` | | Define o proxy para a CLI. | URL do proxy | Exemplo: `--proxy http://localhost:7890`. |
| `--include-directories` | | Inclui diretórios adicionais no workspace para suporte a múltiplos diretórios. | Caminhos de diretórios | Pode ser especificado várias vezes ou como valores separados por vírgula. No máximo, 5 diretórios podem ser adicionados. Exemplo: `--include-directories /path/to/project1,/path/to/project2` ou `--include-directories /path/to/project1 --include-directories /path/to/project2` |
| `--screen-reader` | | Habilita o modo de leitor de tela, que ajusta a TUI para melhor compatibilidade com leitores de tela. | | |
| `--version` | | Exibe a versão da CLI. | | |
| `--openai-logging` | | Habilita o registro de chamadas da API da OpenAI para depuração e análise. | | Esta flag sobrescreve a configuração `enableOpenAILogging` em `settings.json`. |
| `--openai-logging-dir` | | Define um caminho de diretório personalizado para os logs da API da OpenAI. | Caminho do diretório | Esta flag sobrescreve a configuração `openAILoggingDir` em `settings.json`. Suporta caminhos absolutos, caminhos relativos e expansão de `~`. Exemplo: `qwen --openai-logging-dir "~/qwen-logs" --openai-logging` |
## Arquivos de Contexto (Contexto Instrucional Hierárquico)

Embora não sejam estritamente uma configuração para o _comportamento_ da CLI, os arquivos de contexto (cujo padrão é `QWEN.md`, mas configurável via setting `context.fileName`) são cruciais para configurar o _contexto instrucional_ (também chamado de "memória"). Esse recurso poderoso permite que você forneça instruções específicas do projeto, guias de estilo de código ou qualquer informação de contexto relevante para a IA, tornando suas respostas mais personalizadas e precisas para as suas necessidades. A CLI inclui elementos de UI, como um indicador no rodapé mostrando o número de arquivos de contexto carregados, para mantê-lo informado sobre o contexto ativo.

- **Propósito:** Esses arquivos Markdown contêm instruções, diretrizes ou contexto que você deseja que o modelo Qwen conheça durante suas interações. O sistema é projetado para gerenciar esse contexto instrucional de forma hierárquica.

### Exemplo de Conteúdo de Arquivo de Contexto (ex.: `QWEN.md`)

Aqui está um exemplo conceitual do que um arquivo de contexto na raiz de um projeto TypeScript pode conter:

```
# Project: My Awesome TypeScript Library

## General Instructions:
- When generating new TypeScript code, please follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.
- All code should be compatible with TypeScript 5.0 and Node.js 22+.

## Coding Style:
- Use 2 spaces for indentation.
- Interface names should be prefixed with `I` (e.g., `IUserService`).
- Private class members should be prefixed with an underscore (`_`).
- Always use strict equality (`===` and `!==`).

## Specific Component: `src/api/client.ts`
- This file handles all outbound API requests.
- When adding new API call functions, ensure they include robust error handling and logging.
- Use the existing `fetchWithRetry` utility for all GET requests.

## Regarding Dependencies:
- Avoid introducing new external dependencies unless absolutely necessary.
- If a new dependency is required, please state the reason.
```

Este exemplo demonstra como você pode fornecer contexto geral do projeto, convenções de código específicas e até mesmo notas sobre arquivos ou componentes particulares. Quanto mais relevantes e precisos forem seus arquivos de contexto, melhor a IA poderá ajudá-lo. Arquivos de contexto específicos do projeto são altamente recomendados para estabelecer convenções e contexto.

- **Carregamento Hierárquico e Precedência:** A CLI implementa um sistema de memória hierárquico carregando arquivos de contexto (ex.: `QWEN.md`) de vários locais. O conteúdo de arquivos mais abaixo nesta lista (mais específicos) geralmente substitui ou complementa o conteúdo de arquivos mais acima (mais gerais). A ordem exata de concatenação e o contexto final podem ser inspecionados no diálogo `/memory`. A ordem de carregamento típica é:
  1. **Arquivo de Contexto Global:**
     - Localização: `~/.qwen/<configured-context-filename>` (ex.: `~/.qwen/QWEN.md` no diretório home do seu usuário).
     - Escopo: Fornece instruções padrão para todos os seus projetos.
  2. **Arquivos de Contexto da Raiz do Projeto e Ancestrais:**
     - Localização: A CLI procura o arquivo de contexto configurado no diretório de trabalho atual e, em seguida, em cada diretório pai até a raiz do projeto (identificada por uma pasta `.git`) ou o seu diretório home.
     - Escopo: Fornece contexto relevante para todo o projeto ou uma parte significativa dele.
- **Concatenação e Indicação na UI:** O conteúdo de todos os arquivos de contexto encontrados é concatenado (com separadores indicando sua origem e caminho) e fornecido como parte do prompt do sistema. O rodapé da CLI exibe a contagem de arquivos de contexto carregados, dando a você um indicador visual rápido sobre o contexto instrucional ativo.
- **Importando Conteúdo:** Você pode modularizar seus arquivos de contexto importando outros arquivos Markdown usando a sintaxe `@path/to/file.md`. Para mais detalhes, consulte a [documentação de Memory](../features/memory.md).
- **Comandos para Gerenciamento de Memória:**
  - Use `/memory` para abrir o diálogo de gerenciamento de memória.
  - Atualize a memória a partir do diálogo para reescanear e recarregar os arquivos de contexto de todos os locais configurados.
  - Consulte a [documentação de Commands](../features/commands.md) para detalhes completos sobre o comando `/memory`.

Ao compreender e utilizar essas camadas de configuração e a natureza hierárquica dos arquivos de contexto, você pode gerenciar efetivamente a memória da IA e personalizar as respostas do Qwen Code para suas necessidades e projetos específicos.

## Sandbox

O Qwen Code pode executar operações potencialmente inseguras (como comandos de shell e modificações de arquivos) dentro de um ambiente isolado (sandbox) para proteger o seu sistema.

O [Sandbox](../features/sandbox) é desabilitado por padrão, mas você pode habilitá-lo de algumas formas:

- Usando a flag `--sandbox` ou `-s`.
- Definindo a variável de ambiente `QWEN_SANDBOX`.
- Definindo `tools.sandbox` nas configurações.

> ⚠️ **`--yolo` _não_ habilita automaticamente um sandbox.** O modo YOLO apenas aprova automaticamente as chamadas de ferramentas; o sandbox ainda precisa ser ativado via `--sandbox`, `QWEN_SANDBOX` ou `tools.sandbox`. Em execuções headless / não interativas com `--yolo` (ou `--approval-mode=yolo`) e sem sandbox, o modelo pode executar ferramentas de shell, escrita e edição no nível de privilégio do processo atual — o Qwen Code imprime um aviso no stderr nesse caso. Suprima com `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` depois de revisar os prós e contras.

Por padrão, ele usa uma imagem Docker pré-construída `qwen-code-sandbox`.

Para necessidades de sandbox específicas do projeto, você pode criar um Dockerfile personalizado em `.qwen/sandbox.Dockerfile` no diretório raiz do seu projeto. Este Dockerfile pode ser baseado na imagem base do sandbox:

```
FROM qwen-code-sandbox
# Add your custom dependencies or configurations here
# For example:
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

Quando `.qwen/sandbox.Dockerfile` existe, você pode usar a variável de ambiente `BUILD_SANDBOX` ao executar o Qwen Code para construir automaticamente a imagem de sandbox personalizada:

```
BUILD_SANDBOX=1 qwen -s
```

## Estatísticas de Uso

Para nos ajudar a melhorar o Qwen Code, coletamos estatísticas de uso anonimizadas. Esses dados nos ajudam a entender como a CLI é usada, identificar problemas comuns e priorizar novos recursos.

**O que coletamos:**

- **Chamadas de Ferramentas:** Registramos os nomes das ferramentas que são chamadas, se elas têm sucesso ou falham, e quanto tempo levam para executar. Não coletamos os argumentos passados para as ferramentas nem nenhum dado retornado por elas.
- **Requisições de API:** Registramos o modelo usado para cada requisição, a duração da requisição e se ela foi bem-sucedida. Não coletamos o conteúdo dos prompts ou respostas.
- **Informações da Sessão:** Coletamos informações sobre a configuração da CLI, como as ferramentas habilitadas e o modo de aprovação.

**O que NÃO coletamos:**

- **Informações de Identificação Pessoal (PII):** Não coletamos nenhuma informação pessoal, como seu nome, endereço de e-mail ou API keys.
- **Conteúdo de Prompts e Respostas:** Não registramos o conteúdo dos seus prompts ou as respostas do modelo.
- **Conteúdo de Arquivos:** Não registramos o conteúdo de nenhum arquivo que seja lido ou escrito pela CLI.

**Como desativar:**

Você pode desativar a coleta de estatísticas de uso a qualquer momento definindo a propriedade `usageStatisticsEnabled` como `false` na categoria `privacy` do seu arquivo `settings.json`:

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> Quando as estatísticas de uso estão habilitadas, os eventos são enviados para um endpoint de coleta RUM da Alibaba Cloud.