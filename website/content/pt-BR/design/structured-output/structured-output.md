# Saída Estruturada (`--json-schema`) — Design

Este documento captura as decisões de implementação por trás da funcionalidade headless `--json-schema`. O uso voltado para o usuário final está em [`docs/users/features/structured-output.md`](../../users/features/structured-output.md).

## Objetivo

Em execuções headless (`qwen -p`, stdin via pipe ou prompt posicional), permitir que quem chamar restrinja a resposta final do modelo a um JSON Schema fornecido pelo usuário e exiba o payload validado como saída legível por máquina que scripts e ferramentas downstream possam consumir diretamente. A prosa incidental do modelo durante o planejamento é permitida, mas a execução deve terminar com um payload que esteja em conformidade com o schema, não com texto livre.

## Abordagem: ferramenta sintética cujo schema de parâmetros É o schema do usuário

Quando `--json-schema` é definido, `Config.createToolRegistry` registra uma ferramenta sintética `structured_output` ([`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)). Seu `parametersJsonSchema` é exatamente o schema passado pelo usuário; seu `execute()` retorna uma mensagem de parada `llmContent`. A infraestrutura de chamada de ferramentas já valida argumentos contra `parametersJsonSchema` no lado do cliente (via Ajv em `BaseDeclarativeTool.build()`), então "o modelo retornou uma resposta em conformidade com o schema" reduz-se a "o modelo chamou com sucesso `structured_output`."

Três propriedades decorrem disso automaticamente:

1. **Sem caminho de validação personalizado.** A validação `validateToolParams` baseada em Ajv já é executada dentro de `BaseDeclarativeTool.build()` e rejeita argumentos não conformes antes que `execute()` seja chamado.
2. **Comportamento de repetição padrão.** Uma falha de validação é apresentada ao modelo como um erro de chamada de ferramenta, da mesma forma que ocorre com erros de argumentos de qualquer outra ferramenta. O modelo vê a mensagem Ajv e pode corrigir na próxima rodada.
3. **Independente de provedor.** Gemini, OpenAI e Anthropic serializam os schemas de parâmetros de ferramentas da mesma forma (através da abstração `DeclarativeTool`); a ferramenta sintética se conecta a todos os três.

A ferramenta é registrada com `alwaysLoad: true` para que a infraestrutura de carregamento sob demanda do ToolSearch (introduzida no #3589 — mantém a superfície de ferramentas exposta pequena ao adiar ferramentas raramente usadas para trás de uma chamada de busca, montando seus schemas completos apenas quando o modelo as solicita) nunca a esconda do modelo. Sem essa flag, o modelo não saberia que o contrato terminal existe.

## Pipeline de validação em tempo de análise

`resolveJsonSchemaArg(raw)` em [`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) executa quatro verificações antes que o schema chegue a `Config.createToolRegistry`:

1. **Resolução de origem.** Aceita um literal JSON inline ou `@caminho/para/arquivo`. A forma `@caminho` usa `stat` no caminho resolvido primeiro, recusa arquivos não regulares (FIFOs, dispositivos de caractere, diretórios), limita o tamanho a 4 MiB e, em caso de falha na análise JSON, emite um erro genérico (sem prefixo do conteúdo do arquivo em stderr).
2. **Forma JSON.** O resultado analisado deve ser um objeto não array — primitivos, booleanos e arrays são rejeitados com uma mensagem clara.
3. **Raiz aceita objetos** — [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts). APIs de chamada de função sempre passam objetos como argumentos de ferramenta; um schema raiz como `{type: "array"}` registraria uma ferramenta inutilizável. A análise lida com `type`, `const`, `enum`, `anyOf`, `oneOf`, `allOf`, `not`, `if`/`then`/`else` e `$ref` na raiz.
4. **Compilação Ajv estrita** — [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts). Uma instância Ajv dedicada com `strictSchema: true` revela erros de digitação como `propertees` que o validador em tempo de execução mais permissivo engoliria silenciosamente.

### Limites de `schemaRootAcceptsObject`

A análise é intencionalmente de melhor esforço. Ela captura os casos inequívocos de "isso nunca pode aceitar um objeto" e adia qualquer coisa que precise de análise de satisfabilidade do schema completo para o Ajv em tempo de execução.

**Decidido em tempo de análise:**

| Padrão                                                     | Resultado                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `type` presente, não inclui `"object"`                     | rejeitar                                                         |
| `type: ["object", "null"]` etc.                            | aceitar                                                          |
| `const`: valor que não é objeto                            | rejeitar                                                         |
| `enum`: nenhum membro do tipo objeto (incl. vazio)         | rejeitar                                                         |
| `anyOf`/`oneOf`: array vazio                               | rejeitar                                                         |
| `anyOf`/`oneOf`: nenhum ramo admite objeto                 | rejeitar                                                         |
| `allOf`: qualquer ramo é `false` ou rejeita objeto         | rejeitar                                                         |
| `$ref` na raiz (com ou sem `type` irmão)                   | rejeitar                                                         |
| `not`: apenas `{type: "object"}` (sem palavras-chave de restrição) | rejeitar                                                  |
| `not`: `{type: "object", required: […], …}` etc.           | aceitar (palavras-chave de restrição deixam alguns objetos satisfazíveis; adiar) |
| `if: true` + `then` rejeita objeto                         | rejeitar                                                         |
| `if: false` + `else` rejeita objeto                        | rejeitar                                                         |

**Adiado para o Ajv em tempo de execução:**

- `$ref` dentro de ramos `anyOf`/`oneOf`/`allOf` (opaco — a resolução local de `$ref` precisaria de detecção de ciclos, escapes de JSON Pointer e tratamento de `$defs` vs `definitions`; o custo supera o benefício para uma verificação de melhor esforço em tempo de análise).
- `if` cujo valor é um schema de objeto (decidível apenas contra um valor candidato).
- Padrões negados de `anyOf`/`oneOf`/`const` mais complexos que `not.type`.
- Exposição arbitrária a ReDoS via `pattern` (fornecido pelo usuário; o modelo de ameaça é restrito porque a flag é um argumento de CLI, não uma entrada de rede).

O caminho de saída `maxSessionTurns` anexa uma dica específica de `--json-schema` apontando os usuários para o sintoma comum de execução travada (o modelo nunca chamou `structured_output`) e suas duas causas prováveis (ferramenta negada via permissões / schema insatisfazível), para que a queda em tempo de execução tenha diagnósticos visíveis ao usuário.

## Tempo de execução: despacho de rodadas

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts) lida com o despacho em tempo de execução. Os detalhes específicos da saída estruturada:

### Pré-varredura + supressão de irmãos

Quando o modelo emite `structured_output` junto com outras ferramentas na mesma rodada do assistente, a chamada sintética é o contrato terminal. A pré-varredura em `processToolCallBatch` filtra `requestsToExecute` para **apenas** chamadas `structured_output`, de modo que ferramentas irmãs com efeitos colaterais (`write_file`, `run_shell_command`, `edit`, …) nunca sejam executadas.

Exemplos de lotes (quando `--json-schema` está ativo):

| Modelo emite                                              | Comportamento                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                   | `write_file` é pulado. `structured_output` valida, a execução termina.                                                                                                                                                                                                                                              |
| `[structured_output(args-ruins), structured_output(bom)]` | O primeiro falha na validação Ajv; o segundo tem sucesso. A execução termina com os argumentos da segunda chamada.                                                                                                                                                                                                  |
| `[structured_output(args-ruins), write_file(…)]`          | `structured_output(ruim)` falha. `write_file` também é pulado (foi suprimido de antemão). O modelo vê ambos: a mensagem de erro Ajv para a chamada estruturada e um `tool_result` sintetizado `"Pulado: …"` para a chamada com efeito colateral. Na próxima rodada, o modelo pode reemitir ambas ou corrigir apenas a chamada estruturada. |
| `[outra_ferramenta_a, outra_ferramenta_b]` (sem `structured_output`) | A pré-varredura é inerte. Ambas as ferramentas rodam normalmente; a execução NÃO termina.                                                                                                                                                                                                                           |

O corpo sintetizado "Pulado:" tem duas variantes:

- **Caminho de sucesso** (uma chamada estruturada capturou o contrato nesta rodada): `"Pulado: o contrato structured_output desta rodada teve precedência como saída terminal."` — breve, porque a sessão termina imediatamente e nenhum consumidor (modelo ou SDK) age sobre ele.
- **Caminho de repetição** (nenhuma chamada estruturada capturada, o modelo ganha outra rodada): adiciona `"Reemita esta chamada em uma rodada separada, se necessário."` — este é o único caso acionável pelo modelo.

### Paridade rodada principal / rodada de drenagem

`processToolCallBatch(batchRequests, setModelOverride)` é definido dentro de `runNonInteractive` e chamado a partir de:

- O loop da rodada principal (topo da função).
- `drainOneItem` (loop de resposta de notificação de tarefa em segundo plano / cron).

A rodada de drenagem é importante porque `structured_output` está registrada para toda a sessão, então uma tarefa cron ou uma resposta de notificação PODE também disparar a ferramenta. O helper trata ambos os pontos de chamada de forma idêntica no momento da invocação; a única diferença específica do ponto de chamada é em qual variável `modelOverride` escrever — passada como um setter.

O **fluxo de término pós-helper** difere entre os dois pontos: o caminho da rodada principal chama diretamente `return emitStructuredSuccess()`, enquanto o caminho da rodada de drenagem requer um término de dois saltos (`processToolCallBatch` captura o resultado no `structuredSubmission` com escopo de closure; `drainLocalQueue` verifica para parar o loop de drenagem; então o loop de retenção verifica para sair e chamar `emitStructuredSuccess`). Ambos convergem no mesmo bloco terminal, mas a indireção extra no caminho de drenagem é estrutural — sem ela, o loop de drenagem continuaria processando itens enfileirados após o resultado estruturado ser capturado.

### Bloco terminal de sucesso estruturado

`emitStructuredSuccess()` (também definido dentro de `runNonInteractive`) é o caminho compartilhado de "recebemos uma chamada válida, desligue":

1. `registry.abortAll()` aborta agentes em segundo plano em andamento — o contrato de saída estruturada é de tiro único e não deve competir com `task_notification` na emissão terminal.
2. Retenção limitada (`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms) para que os manipuladores de cancelamento naturais de agentes recém-abortados tenham a chance de emitir sua `task_notification` terminal e colocá-la em `localQueue`. A guarda do loop é `Date.now() < deadline && registry.hasUnfinalizedTasks()`, então a espera termina imediatamente quando nada está em andamento (caminho típico) e nunca bloqueia por mais que o limite. O teto de 500 ms é de melhor esforço — eventos `task_started` órfãos permanecem possíveis sob carga se o manipulador de aborto de um agente específico exceder o orçamento. O loop **não** consulta o sinal de aborto: um SIGINT recebido durante a retenção ou durante o caminho de emissão subsequente não interromperá o resultado já capturado. Sem a retenção, consumidores de stream-json veriam rotineiramente eventos `task_started` sem o correspondente `task_notification`.
3. `flushQueuedNotificationsToSdk(localQueue)` drena tudo ainda enfileirado.
4. `finalizeOneShotMonitors()` (idempotente — seguro chamar duas vezes; o caminho da rodada de drenagem já o invocou).
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`.

### Caminhos de falha

| Causa                                                            | Código de saída                | Superfície                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelo emite apenas texto simples                                | 1                              | Erro com contagem de rodadas + `Pré-visualização da saída` truncada.                                                                                                                                                                                                                                |
| Modelo nunca chama `structured_output` em `maxSessionTurns` rodadas | 53                             | `Número máximo de rodadas da sessão atingido` + dica de `--json-schema` apontando para o sintoma comum de execução travada e suas duas causas prováveis.                                                                                                                                            |
| Validação falha repetidamente                                    | (eventualmente 53 via max-turns) | Cada falha é apresentada ao modelo na próxima rodada com a mensagem Ajv.                                                                                                                                                                                                                            |
| Abortar / SIGINT                                                 | 130                            | Caminho de cancelamento. Um resultado estruturado normalmente não é emitido, mas o loop de retenção de `emitStructuredSuccess()` não consulta o sinal de aborto — um SIGINT que chega após a captura, mas antes/durante a emissão em stdout, ainda pode liberar o resultado. O código de saída é o sinal confiável. |

## Invólucro de saída

O pipeline do adaptador em [`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts) trata a presença de `structuredResult` (rastreado via `'structuredResult' in options`, não `!== undefined`, para que o contrato seja preservado mesmo quando o modelo chamou `structured_output` sem argumentos sob um schema vazio):

- `result` é forçado a `JSON.stringify(payload)` — sobrescrevendo qualquer resumo em texto livre que o adaptador tenha acumulado.
- Um campo de nível superior `structured_result` carrega o objeto bruto para consumidores que não desejam reanalisar a forma serializada em string.
- Payloads `undefined` são normalizados para `null` (renderizados como o literal JSON `null` em ambos os campos) para que o campo não possa desaparecer silenciosamente. Na prática, esse fallback raramente é alcançado: upstream, `turn.ts` aplica `(fnCall.args || {})` antes de armazenar a submissão, então uma chamada sem argumentos contra um schema vazio cai como `{}` e é renderizada como `{}` em stdout, não `null`. O passo `?? null` é defesa em profundidade para o caso estritamente `undefined`.

O modo TEXTO escreve apenas o campo `result` + nova linha em stdout (qualquer prosa incidental do assistente acumulada durante a execução é descartada — não espelhada em stderr). O modo JSON emite o log completo de eventos como um array JSON; `structured_result` reside no elemento final do tipo `type: "result"` desse array, não na raiz do documento. O modo stream-json emite cada mensagem em sua própria linha como JSONL; a linha `result` final carrega `structured_result`.

## Privacidade: ocultação entre superfícies

Os argumentos submetidos via `structured_output` SÃO o payload estruturado. No caminho de sucesso eles já estão em stdout; em repetições de falha de validação eles podem nunca chegar ao stdout. De qualquer forma, persisti-los em superfícies duráveis no dispositivo (ou exportá-los fora do dispositivo por meio de telemetria) é duplicação que vaza o payload para armazenamento de vida mais longa do que o usuário solicitou. A regra de ocultação é, portanto, "nunca persista nenhum argumento desta ferramenta sintética, independentemente do resultado," não apenas "deduplicar o que já está em stdout."

Duas superfícies precisam ocultar, e ambas compartilham a mesma constante placeholder [`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts):

- `ToolCallEvent.function_args` (telemetria) — cobre exportações OTLP, QwenLogger, ui-telemetry e o espelho de eventos da interface de gravação de chat.
- `redactStructuredOutputArgsForRecording` (usado por `recordAssistantTurn` em `geminiChat.ts`) — cobre o JSONL de gravação de chat em disco em `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`. Repetições de falha de validação também caem aqui — os argumentos de cada repetição também recebem o mesmo placeholder.

A constante compartilhada evita divergências entre as duas superfícies. Métricas de chamada de ferramenta (duração, sucesso, decisão) são preservadas.

Hooks (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) são intencionalmente **não** ocultados — eles recebem o `tool_input` bruto porque o contrato do hook é "ver o que a ferramenta vê." Isso está documentado na seção de Privacidade da documentação do usuário como um aviso "Hooks veem argumentos brutos" para que operadores possam filtrar por `tool_name` ou adicionar ocultação no lado do hook antes de executar `--json-schema` contra dados sensíveis.

A ocultação é intencionalmente limitada a superfícies de persistência **no dispositivo** (exportações de telemetria + JSONL de gravação de chat). O schema em si ainda viaja para o provedor do modelo em toda requisição como o bloco `parameters` da declaração de função `structured_output` — nenhuma ocultação do lado do provedor é possível, já que o modelo precisa do schema para satisfazer o contrato de chamada de ferramenta. A seção de Privacidade da documentação do usuário alerta os usuários a manter payloads de `enum`/`const`/`default`/`examples`/`description` livres de segredos pelo mesmo motivo.

## Controle de permissões

`structured_output` é deliberadamente excluída de `PermissionManager.CORE_TOOLS` (o conjunto de ferramentas sujeitas à verificação de lista de permissões `--core-tools`) — junto com as outras ferramentas sintéticas (`agent`, `exit_plan_mode`, `ask_user_question`, `task_stop`, `send_message`). Ferramentas descobertas dinamicamente (`skill`, MCP) são uma categoria de exclusão separada que também ignora a lista de permissões por razões não relacionadas. A ferramenta sintética só existe quando `--json-schema` é definido; adicioná-la ao mecanismo de lista de permissões significaria que `--core-tools read_file --json-schema X` descartaria silenciosamente o contrato terminal.

Regras explícitas de `permissions.deny` e configurações de `--exclude-tools` ainda se aplicam via `PermissionManager.evaluate` → `isToolEnabled`. Ambos usam o mesmo mecanismo de negação e ambos impedem o registro — a declaração da ferramenta é removida do registro, então o modelo nunca vê a ferramenta. O resultado típico é que o modelo responde em texto simples (saída 1). Se o modelo percorrer outras ferramentas sem produzir texto, eventualmente atingirá `maxSessionTurns` (saída 53) e a dica de `--json-schema` em `handleMaxTurnsExceededError` informará ao usuário onde procurar.
**`--bare` interaction.** O modo bare ignora a ponte entre configurações e configuração da CLI: `packages/cli/src/config/config.ts` constrói `mergedDeny` como `[...(bareMode ? [] : settings.permissions.deny), ...]`, portanto negações no nível de configurações (e `tools.exclude`) são descartadas sob `--bare`. `--exclude-tools` no nível de argumentos é incondicionalmente adicionado a `mergedDeny`, então ainda se aplica. A ferramenta sintética é registrada independentemente disso (conduzida por `jsonSchema`, não pela lista de negação), portanto uma negação apenas em configurações de `structured_output` se torna silenciosamente inoperante sob `--bare` enquanto a ferramenta permanece chamável.

## Contextos de subagente

`Config.createToolRegistry` aceita uma opção `forSubAgent: true` que suprime o registro sintético. As substituições de subagente reutilizam o Config pai através de delegação de protótipo (`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`), e `this.jsonSchema` propaga através da cadeia de protótipos. Sem a flag, a ferramenta sintética também seria registrada no registro do subagente, e um subagente que a chamasse receberia o llmContent "session ends now" — mas apenas os loops principal/drain de `runNonInteractive` detectam isso como terminal, então o subagente continuaria executando e queimaria tokens em uma ferramenta cujo contrato seu loop não pode honrar.

> **Nota do mantenedor.** Essa supressão depende do único caminho de chamada através de `createToolRegistry(forSubAgent: true)`. Qualquer futuro mecanismo de criação de subagente que contorne esse caminho vazará a ferramenta sintética para o registro do subagente e reintroduzirá o modo de falha de queimar tokens para sempre. O complemento à prova de falhas seria uma proteção em tempo de execução dentro de `syntheticOutput.execute()` que retorna um `fatalError` (ou no-op) quando invocado de um contexto de subagente. Implemente um se um segundo caminho de vazamento aparecer.

## Proteção contra ferramenta sombra do MCP

`tool-registry.ts:registerTool` verifica o mapa preguiçoso `factories` para colisões de nome, não apenas o mapa imediato `tools`. Se um servidor MCP descobrir uma ferramenta literalmente chamada `structured_output`, o caminho de autoqualificação que existe para colisões de ferramentas imediatas é acionado também para colisões de fábricas: a ferramenta MCP é renomeada para `mcp__<server>__structured_output` e a fábrica sintética mantém o nome simples. Sem essa proteção, um servidor MCP poderia silenciosamente sequestrar o contrato de saída estruturada.

## Superfície de compatibilidade

| Combinação                                              | Status                 | Justificativa                                                                                                                                 |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p` (ou stdin, ou posicional)        | Suportado              | Caminho headless principal.                                                                                                                   |
| `--json-schema` + `--output-format text` (padrão)       | Suportado              | `JSON.stringify(payload)` + nova linha.                                                                                                       |
| `--json-schema` + `--output-format json` / `stream-json` | Suportado              | Campo `structured_result` carrega o objeto bruto.                                                                                             |
| `--json-schema` + `--bare`                               | Suportado              | `--bare` restringe o registro a `read_file`, `edit`, `run_shell_command`; a ferramenta sintética é registrada junto com esse conjunto mínimo. |
| `--json-schema` + `-i`                                   | Rejeitado no momento da análise | TUI não possui contrato terminal para a ferramenta sintética.                                                                                 |
| `--json-schema` + `--input-format stream-json`           | Rejeitado no momento da análise | Contrato de disparo único vs. protocolo de longa duração.                                                                                     |
| `--json-schema` + `--acp` / `--experimental-acp`         | Rejeitado no momento da análise | O loop ACP é independente.                                                                                                                    |
| `--json-schema` + `--prompt-interactive`                 | Rejeitado no momento da análise | Mesmo que `-i`.                                                                                                                               |
| `--json-schema` + sem prompt + sem stdin canalizado      | Rejeitado no momento da análise | Headless requer um prompt.                                                                                                                    |

## Alternativas consideradas

**Prompt de resposta ciente de esquema (sem ferramenta sintética).** Pedir ao modelo para "responder com JSON correspondente a este esquema" através do prompt do sistema e analisar a mensagem final do assistente. Rejeitado porque o modelo não tem garantia sintática — a saída pode ser delimitada, prefixada com conversa fiada, ou alucinar campos. A validação de chamada de ferramenta é imposta pela camada de chamada de função antes de `execute()`, o que nos dá uma proteção sintática + semântica rígida.

**`response_format: {type: "json_schema", …}` da OpenAI.** Específico de provedor; exigiria implementações paralelas para Gemini e Anthropic. A abordagem de ferramenta sintética é agnóstica em relação ao provedor.

**Reordenar structured_output para o início do lote em vez de filtrar.** Permite que irmãos com efeitos colaterais executem se a chamada estruturada falhar na validação. Rejeitado porque o contrato para `--json-schema` é "produzir saída estruturada" — se o modelo está nesse modo, efeitos colaterais de irmãos são provavelmente um erro. Suprimi-los completamente é mais seguro; o modelo vê um tool_result "Skipped:" e pode reenviá-los em uma rodada separada.

**Resolução local de `$ref` dentro de `schemaRootAcceptsObject`.** Capturaria esquemas como `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` no momento da análise. Rejeitado por enquanto porque o custo (detecção de ciclo, sintaxe JSON Pointer, `$defs` vs `definitions`, ponteiros parciais, refs remotas) supera o benefício; a dica `maxSessionTurns` já aponta os usuários para "esquema é insatisfazível" como uma causa provável.

## Trabalho em aberto

- A validação de resposta ciente de esquema poderia ganhar uma proteção ReDoS baseada em `pattern` se usuários reais encontrarem padrões de retrocesso catastrófico nos argumentos `--json-schema`.
- Adições ao protocolo SDK (SDKs Python / TypeScript / Java expondo um campo `structured_result` tipado) — acompanhar separadamente; [PR #4001](https://github.com/QwenLM/qwen-code/pull/4001) (fechado sem merge em 2026-05-11) cobria esse escopo antes do trabalho cli/core ser implementado e foi substituído.

## Índice de arquivos

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`, `schemaRootAcceptsObject`, regras de mutex yargs `.check`.
- `packages/cli/src/gemini.tsx` — proteção da TUI, tratamento de código de saída.
- `packages/cli/src/nonInteractiveCli.ts` — `processToolCallBatch`, `emitStructuredSuccess`, `suppressedOutputBody`, caminho de falha em texto simples.
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` — envelope `structuredResult` → `result` + `structured_result`.
- `packages/core/src/config/config.ts` — registro com `registerStructuredOutputIfRequested`, pulo `forSubAgent`.
- `packages/core/src/tools/syntheticOutput.ts` — ferramenta sintética + placeholder `STRUCTURED_OUTPUT_REDACTED_ARGS`.
- `packages/core/src/tools/tool-registry.ts` — renomeação por colisão de fábrica para ferramentas sombra do MCP.
- `packages/core/src/telemetry/types.ts` — redação de `function_args`.
- `packages/core/src/core/geminiChat.ts` — `redactStructuredOutputArgsForRecording`.
- `packages/core/src/utils/schemaValidator.ts` — `compileStrict` com instância Ajv estrita.
- `packages/cli/src/utils/errors.ts` — dica `--json-schema` de `handleMaxTurnsExceededError`.