# Saída Estruturada (`--json-schema`) — Design

Este documento documenta as decisões de implementação por trás do recurso
headless `--json-schema`. O uso voltado para o usuário está em
[`docs/users/features/structured-output.md`](../../users/features/structured-output.md).

## Objetivo

Em execuções headless (`qwen -p`, stdin por pipe ou prompt posicional),
permita que o chamador restrinja a resposta final do modelo a um esquema
JSON fornecido pelo usuário e exiba a carga validada como saída legível
por máquina que scripts e ferramentas downstream podem consumir
diretamente. A prosa incidental do modelo durante o planejamento é
permitida, mas a execução deve terminar com uma carga que esteja em
conformidade com o esquema, não com texto de formato livre.

## Abordagem: ferramenta sintética cujo esquema de parâmetro É o esquema do usuário

Quando `--json-schema` é definido, `Config.createToolRegistry` registra
uma ferramenta sintética `structured_output`
([`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)).
Seu `parametersJsonSchema` é exatamente o esquema que o usuário passou;
seu `execute()` retorna uma mensagem de parada `llmContent`. A
infraestrutura de chamada de ferramenta já valida argumentos contra
`parametersJsonSchema` no lado do cliente (via Ajv em
`BaseDeclarativeTool.build()`), então "o modelo retornou uma resposta
conforme o esquema" se reduz a "o modelo chamou `structured_output` com
sucesso."

Três propriedades decorrem disso automaticamente:

1. **Nenhum caminho de validação personalizado.** A validação de
   parâmetros com suporte do Ajv já é executada dentro de
   `BaseDeclarativeTool.build()` e rejeita argumentos não conformes
   antes que `execute()` seja acionado.
2. **Comportamento de repetição padrão.** Uma falha de validação é
   apresentada ao modelo como um erro de chamada de ferramenta, da mesma
   forma que qualquer outro erro de argumento de ferramenta. O modelo vê
   a mensagem do Ajv e pode corrigir na próxima rodada.
3. **Independente de provedor.** Gemini, OpenAI e Anthropic serializam
   esquemas de parâmetros de ferramenta da mesma forma (via abstração
   `DeclarativeTool`); a ferramenta sintética se conecta a todos os
   três.

A ferramenta é registrada com `alwaysLoad: true` para que a
infraestrutura de carregamento sob demanda do ToolSearch (introduzida no
#3589 — mantém a superfície exposta da ferramenta pequena adiando
ferramentas raramente usadas para trás de uma chamada de pesquisa,
montando seus esquemas completos apenas quando o modelo as solicita)
nunca a oculte do modelo. Sem essa flag, o modelo não saberia que o
contrato terminal existe.

## Pipeline de validação em tempo de análise

`resolveJsonSchemaArg(raw)` em
[`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts)
executa quatro verificações antes que o esquema atinja
`Config.createToolRegistry`:

1. **Resolução da fonte.** Aceita um literal JSON inline ou
   `@caminho/para/arquivo`. A forma `@path` faz `stat` no caminho
   resolvido primeiro, recusa arquivos não regulares (FIFOs, dispositivos
   de caracteres, diretórios), limita o tamanho a 4 MiB e, em caso de
   falha de análise JSON, emite um erro genérico (sem prefixo de
   conteúdo do arquivo no stderr).
2. **Forma JSON.** O resultado analisado deve ser um objeto não array —
   primitivos, booleanos e arrays são rejeitados com uma mensagem clara.
3. **Raiz aceita objetos** —
   [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts).
   APIs de chamada de função sempre passam objetos como argumentos de
   ferramenta; um esquema raiz como `{type: "array"}` registraria uma
   ferramenta inutilizável. A verificação percorre `type`, `const`,
   `enum`, `anyOf`, `oneOf`, `allOf`, `not`, `if` / `then` / `else` e
   `$ref` raiz.
4. **Compilação estrita do Ajv** —
   [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts).
   Uma instância dedicada do Ajv com `strictSchema: true` revela erros
   de digitação como `propertees` que o validador de tempo de execução
   tolerante engoliria silenciosamente.

### Limites de `schemaRootAcceptsObject`

A verificação é intencionalmente de melhor esforço. Ela captura os casos
inequívocos de "isso nunca pode aceitar um objeto" e adia qualquer coisa
que precise de análise de satisfabilidade de esquema completo para o Ajv
em tempo de execução.

**Decidido em tempo de análise:**

| Padrão                                                               | Resultado                              |
| -------------------------------------------------------------------- | -------------------------------------- |
| `type` presente, não inclui `"object"`                               | rejeitar                               |
| `type: ["object", "null"]` etc.                                      | aceitar                                |
| `const`: valor não objeto                                            | rejeitar                               |
| `enum`: nenhum membro objeto (incluindo vazio)                       | rejeitar                               |
| `anyOf`/`oneOf`: array vazio                                         | rejeitar                               |
| `anyOf`/`oneOf`: nenhum ramo admite objeto                           | rejeitar                               |
| `allOf`: qualquer ramo é `false` ou rejeita objeto                   | rejeitar                               |
| `$ref` raiz (com ou sem `type` irmão)                                | rejeitar                               |
| `not`: simples `{type: "object"}` (sem palavras-chave de restrição)  | rejeitar                               |
| `not`: `{type: "object", required: […], …}` etc.                     | aceitar (palavras-chave de restrição deixam alguns objetos satisfazíveis; adiar) |
| `if: true` + `then` rejeita objeto                                   | rejeitar                               |
| `if: false` + `else` rejeita objeto                                  | rejeitar                               |
**Diferido para o Ajv em tempo de execução:**

- `$ref` dentro de ramificações `anyOf` / `oneOf` / `allOf` (opaco — a resolução local de `$ref` exigiria detecção de ciclos, escapes de JSON Pointer e tratamento de `$defs` vs `definitions`; o custo supera o benefício para uma verificação de melhor esforço em tempo de análise).
- `if` cujo valor é um esquema de objeto (decidível apenas contra um valor candidato).
- Padrões negados de `anyOf` / `oneOf` / `const` mais complexos que `not.type`.
- Exposição arbitrária a ReDoS via `pattern` (fornecido pelo usuário; o modelo de ameaça é restrito porque a flag é um argumento de CLI, não uma entrada de rede).

O caminho de saída `maxSessionTurns` anexa uma dica específica de `--json-schema` apontando os usuários para o sintoma comum de execução travada (modelo nunca chamou `structured_output`) e suas duas causas prováveis (ferramenta negada via permissões / esquema insatisfatível) para que a queda para o runtime tenha diagnósticos visíveis ao usuário.

## Runtime: despacho de turnos

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts)
lida com o despacho em tempo de execução. As especificidades da saída estruturada:

### Pré-varredura + supressão de ferramentas irmãs

Quando o modelo emite `structured_output` juntamente com outras ferramentas no mesmo turno do assistente, a chamada sintética é o contrato terminal. A pré-varredura em `processToolCallBatch` filtra `requestsToExecute` para conter **apenas** chamadas `structured_output`, de modo que ferramentas irmãs com efeitos colaterais (`write_file`, `run_shell_command`, `edit`, …) nunca são executadas.

Exemplos de lotes (quando `--json-schema` está ativo):

| Modelo emite                                              | Comportamento                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                  | `write_file` é ignorado. `structured_output` valida, a execução termina.                                                                                                                                                                                                                                                |
| `[structured_output(bad-args), structured_output(good)]` | O primeiro falha na validação do Ajv; o segundo tem sucesso. A execução termina com os argumentos da segunda chamada.                                                                                                                                                                                               |
| `[structured_output(bad-args), write_file(…)]`           | `structured_output(bad)` falha. `write_file` também é ignorado (foi suprimido de antemão). O modelo vê ambos: a mensagem de erro do Ajv para a chamada estruturada e um `tool_result` sintetizado `"Ignorado: …"` para a chamada de efeito colateral. No próximo turno, o modelo pode reemitir ambos ou corrigir apenas a chamada estruturada. |
| `[other_tool_a, other_tool_b]` (sem `structured_output`)  | A pré-varredura é inerte. Ambas as ferramentas são executadas normalmente; a execução NÃO termina.                                                                                                                                                                                                                                               |

O corpo sintetizado "Ignorado:" tem duas variantes:

- **Caminho de sucesso** (uma chamada estruturada capturou o contrato neste turno): `"Skipped: neste turno, o contrato structured_output teve precedência como saída terminal."` — curto, porque a sessão é encerrada imediatamente e nenhum consumidor (modelo ou SDK) age sobre ele.
- **Caminho de repetição** (nenhuma chamada estruturada capturada, o modelo recebe outro turno): adiciona `"Reemita esta chamada em um turno separado, se necessário."` — este é o único caso acionável pelo modelo.

### Paridade entre turno principal / turno de drenagem

`processToolCallBatch(batchRequests, setModelOverride)` é definido dentro de `runNonInteractive` e é chamado a partir de:

- O loop do turno principal (topo da função).
- `drainOneItem` (loop de resposta a notificações de tarefa em segundo plano / cron-prompt).

O turno de drenagem é importante porque `structured_output` é registrado para toda a sessão, portanto um job cron ou uma resposta a notificação PODE também disparar a ferramenta. O auxiliar trata ambos os pontos de chamada de forma idêntica no momento da invocação; a única ligação específica do ponto de chamada é qual variável `modelOverride` deve ser atualizada — passada como um setter.

O **fluxo de término pós-auxiliar** difere entre os dois pontos: o caminho do turno principal chama diretamente `return emitStructuredSuccess()`, enquanto o caminho do turno de drenagem requer um término em dois saltos (`processToolCallBatch` captura o resultado na variável `structuredSubmission` do escopo de fechamento; `drainLocalQueue` verifica isso para parar o loop de drenagem, depois o loop de retenção verifica para sair e chamar `emitStructuredSuccess`). Ambos convergem no mesmo bloco terminal, mas a indireção extra no caminho de drenagem é essencial — sem ela, o loop de drenagem continuaria processando itens na fila após o resultado estruturado ser capturado.
### Bloco terminal de sucesso estruturado

`emitStructuredSuccess()` (também definida dentro de `runNonInteractive`) é o caminho compartilhado de "recebemos uma chamada válida, vamos encerrar":

1. `registry.abortAll()` aborta agentes em segundo plano em andamento — o contrato de saída estruturada é de disparo único e não deve causar condição de corrida com `task_notification` na emissão terminal.
2. Retenção limitada (`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms) para que os manipuladores de cancelamento natural dos agentes recém-abortados tenham a chance de emitir sua `task_notification` terminal e depositá-la em `localQueue`. A guarda do laço é `Date.now() < deadline && registry.hasUnfinalizedTasks()`, então a espera termina imediatamente quando não há nada em andamento (caminho típico) e nunca bloqueia por mais que o limite. O teto de 500 ms é de melhor esforço — eventos `task_started` órfãos continuam possíveis sob carga se o manipulador de aborto de um agente específico exceder o orçamento. O laço **não** consulta o sinal de aborto: um SIGINT recebido durante a retenção ou durante o caminho de emissão que se segue não interromperá o resultado já capturado. Sem a retenção, consumidores de stream-json veriam rotineiramente eventos `task_started` sem o `task_notification` correspondente.
3. `flushQueuedNotificationsToSdk(localQueue)` esvazia tudo que ainda está na fila.
4. `finalizeOneShotMonitors()` (idempotente — seguro chamar duas vezes; o caminho de descarte do turno já a invocou).
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`.

### Caminhos de falha

| Causa                                                                           | Código de saída | Saída                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelo emite apenas texto puro                                                  | 1               | Erro com contagem de turnos + `Output preview` truncado.                                                                                                                                                                                                                                  |
| Modelo nunca chama `structured_output` por `maxSessionTurns` turnos             | 53              | `Reached max session turns` + dica `--json-schema` apontando para o sintoma comum de execução travada e suas duas causas prováveis.                                                                                                                                                        |
| A validação falha repetidamente                                                 | (eventualmente 53 via max-turns) | Cada falha é exibida ao modelo no próximo turno com a mensagem Ajv.                                                                                                                                                                                                                       |
| Aborto / SIGINT                                                                 | 130             | Caminho de cancelamento. Um resultado estruturado normalmente não é emitido, mas o laço de retenção de `emitStructuredSuccess()` não consulta o sinal de aborto — um SIGINT que chega após a captura mas antes/durante a emissão para stdout ainda pode liberar o resultado. O código de saída é o sinal confiável. |

## Envelope de saída

O pipeline do adaptador em
[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts)
trata a presença de `structuredResult` (verificada via `'structuredResult' in options`,
não `!== undefined`, para que o contrato seja preservado mesmo quando o modelo
chamou `structured_output` sem argumentos sob um esquema vazio):

- `result` é forçado a `JSON.stringify(payload)` — sobrescrevendo qualquer
  resumo em texto livre que o adaptador tenha acumulado.
- Um campo de nível superior `structured_result` carrega o objeto bruto para
  consumidores que não queiram reanalisar a forma stringificada.
- Cargas `undefined` são normalizadas para `null` (renderizadas como o literal JSON
  `null` em ambos os campos) para que o campo não possa desaparecer silenciosamente.
  Na prática, esse fallback raramente é alcançado: a montante, em `turn.ts`,
  aplica-se `(fnCall.args || {})` antes de armazenar a submissão, então uma
  chamada sem argumentos contra um esquema vazio resulta em `{}` e é renderizada como
  `{}` no stdout, não `null`. O passo `?? null` é defesa em profundidade
  para o caso estritamente `undefined`.

O modo TEXT escreve apenas o campo `result` + nova linha no stdout (qualquer
prosa incidental do assistente acumulada durante a execução é descartada — não é
espelhada no stderr). O modo JSON emite o log completo de eventos como um
array JSON; `structured_result` fica no elemento final do tipo `type: "result"`
desse array, não na raiz do documento. O modo stream-json emite cada mensagem
em sua própria linha como JSONL; a linha `result` final carrega `structured_result`.
## Privacidade: ocultação entre superfícies

Os argumentos enviados via `structured_output` **são** a carga estruturada.
No caminho de sucesso eles já estão no stdout; em repetições de falha de validação
podem nunca chegar ao stdout. De qualquer forma, persisti-los
em superfícies duráveis do dispositivo (ou exportá-los para fora do dispositivo
através de telemetria) é duplicação que vaza a carga para
armazenamento de maior duração do que o solicitado pelo usuário. A regra de ocultação é
portanto "nunca persistir argumentos desta ferramenta sintética, independentemente do
resultado", não apenas "deduplicar o que já está no stdout."

Duas superfícies precisam ocultar, e ambas compartilham a mesma constante de
placeholder
[`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts):

- `ToolCallEvent.function_args` (telemetria) — cobre exportações OTLP,
  QwenLogger, ui-telemetry, e o espelho de evento da UI de gravação de chat.
- `redactStructuredOutputArgsForRecording` (usado por
  `recordAssistantTurn` em `geminiChat.ts`) — cobre o JSONL de gravação
  de chat no disco em
  `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`.
  Repetições de falha de validação também chegam aqui — os argumentos de cada repetição
  também recebem o mesmo placeholder.

A constante compartilhada evita divergência entre as duas superfícies. Métricas da
chamada de ferramenta (duração, sucesso, decisão) são preservadas.

Hooks (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) são intencionalmente
**não** ocultados — eles recebem o `tool_input` bruto
porque o contrato do hook é "ver o que a ferramenta vê." Isso está
documentado na seção de Privacidade da documentação do usuário como um aviso "Hooks veem argumentos brutos"
para que operadores possam filtrar por `tool_name` ou adicionar ocultação
no lado do hook antes de executar `--json-schema` contra dados sensíveis.

A ocultação é intencionalmente limitada a superfícies de persistência **no dispositivo**
(exportações de telemetria + JSONL de gravação de chat). O esquema
em si ainda viaja para o provedor do modelo em cada requisição como o
bloco `parameters` da declaração de função `structured_output` — nenhuma
ocultação no lado do provedor é possível, já que o modelo precisa do
esquema para satisfazer o contrato de chamada de ferramenta. A seção de Privacidade
da documentação do usuário adverte os usuários a manter cargas de `enum` / `const` / `default` /
`examples` / `description` livres de segredos pela mesma razão.

## Controle de permissões

`structured_output` é deliberadamente excluído de
`PermissionManager.CORE_TOOLS` (o conjunto de ferramentas sujeitas à verificação
de lista de permissões `--core-tools`) — assim como as outras ferramentas
sintéticas (`agent`, `exit_plan_mode`, `ask_user_question`, `task_stop`,
`send_message`). Ferramentas descobertas dinamicamente (`skill`, MCP) são uma
categoria de exclusão separada que também ignora a lista de permissões por razões
não relacionadas. A ferramenta sintética existe apenas quando `--json-schema`
está definido; adicioná-la à mecânica da lista de permissões significaria que
`--core-tools read_file --json-schema X` silenciosamente descarta o contrato
terminal.

Regras explícitas de `permissions.deny` e configurações `--exclude-tools` ainda
se aplicam via `PermissionManager.evaluate` → `isToolEnabled`. Ambas usam
o mesmo mecanismo de negação e ambas impedem o registro — a declaração
da ferramenta é removida do registro, então o modelo nunca vê
a ferramenta. O resultado típico é que o modelo responde em texto puro
(saída 1). Se o modelo percorre outras ferramentas sem produzir
texto, eventualmente atinge `maxSessionTurns` (saída 53) e a
dica `--json-schema` em `handleMaxTurnsExceededError` informa ao usuário
onde procurar.

**Interação `--bare`.** O modo bare ignora a ponte de configurações → config da CLI:
`packages/cli/src/config/config.ts` monta
`mergedDeny` como `[...(bareMode ? [] : settings.permissions.deny), ...]`,
então negações no nível de configurações (e `tools.exclude`) são descartadas sob
`--bare`. `--exclude-tools` no nível de argumentos é incondicionalmente anexado
a `mergedDeny`, então ainda se aplica. A ferramenta sintética é
registrada independentemente de tudo isso (orientada por `jsonSchema`, não pela
lista de negação), então uma negação apenas de configurações de `structured_output`
silenciosamente não faz nada sob `--bare` enquanto a ferramenta permanece chamável.

## Contextos de subagentes

`Config.createToolRegistry` aceita uma opção `forSubAgent: true` que
suprime o registro sintético. Substituições de subagente reutilizam o Config pai
através de delegação de protótipo (`createApprovalModeOverride` /
`buildSubagentContextOverride` → `Object.create(base)`), e
`this.jsonSchema` se propaga através da cadeia de protótipos. Sem a
flag, a ferramenta sintética seria registrada também no registro do subagente,
e um subagente chamando-a receberia o `llmContent` "a sessão termina agora"
— mas apenas os loops principal / de drenagem de `runNonInteractive`
detectam isso como terminal, então o subagente continuaria executando e queimaria tokens
em uma ferramenta cujo contrato seu loop não pode honrar.

> **Nota para mantenedores.** Esta supressão depende do único caminho de chamada
> através de `createToolRegistry(forSubAgent: true)`. Qualquer mecanismo futuro
> de criação de subagente que ignore este caminho vazará a ferramenta
> sintética no registro do subagente e reintroduzirá o modo de falha
> de queimar-tokens-para-sempre. O complemento à prova de falhas seria
> uma proteção em tempo de execução dentro de `syntheticOutput.execute()` que retorna
> um `fatalError` (ou não faz nada) quando invocada de um contexto de subagente. Implemente
> uma se um segundo caminho de vazamento aparecer.
## Guarda de ferramenta sombra MCP

`tool-registry.ts:registerTool` verifica o mapa lazy `factories` quanto a
colisões de nome, não apenas o mapa imediato `tools`. Se um servidor MCP
descobrir uma ferramenta literalmente chamada `structured_output`, o
caminho de qualificação automática que existe para colisões de ferramentas
imediatas também é acionado para colisões de factory: a ferramenta MCP é
renomeada para `mcp__<server>__structured_output` e a factory sintética
mantém o nome simples. Sem essa guarda, um servidor MCP poderia sequestrar
silenciosamente o contrato de saída estruturada.

## Superfície de compatibilidade

| Combinação                                                     | Status                | Justificativa                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p` (ou stdin, ou posicional)               | Suportado             | Caminho headless primário.                                                                                                                                    |
| `--json-schema` + `--output-format text` (padrão)              | Suportado             | `JSON.stringify(payload)` + nova linha.                                                                                                                       |
| `--json-schema` + `--output-format json` / `stream-json`       | Suportado             | O campo `structured_result` carrega o objeto bruto.                                                                                                           |
| `--json-schema` + `--bare`                                     | Suportado             | `--bare` restringe o registro a `read_file`, `edit`, `run_shell_command`; a ferramenta sintética é registrada junto a esse conjunto mínimo.                   |
| `--json-schema` + `-i`                                         | Rejeitado no parsing  | A TUI não possui contrato de terminal para a ferramenta sintética.                                                                                            |
| `--json-schema` + `--input-format stream-json`                 | Rejeitado no parsing  | Contrato de uso único vs. protocolo de longa duração.                                                                                                         |
| `--json-schema` + `--acp` / `--experimental-acp`               | Rejeitado no parsing  | O loop ACP é independente.                                                                                                                                    |
| `--json-schema` + `--prompt-interactive`                       | Rejeitado no parsing  | Mesmo que `-i`.                                                                                                                                               |
| `--json-schema` + sem prompt + sem stdin por pipe              | Rejeitado no parsing  | Modo headless requer um prompt.                                                                                                                               |

## Alternativas consideradas

**Indução de resposta com conhecimento do esquema (sem ferramenta sintética).**
Solicitar ao modelo que "responda com JSON correspondendo a este esquema" por
meio do prompt de sistema e interpretar a mensagem final do assistente.
Rejeitado porque o modelo não tem garantia sintática — a saída pode estar
delimitada, prefixada com conversa fiada ou alucinar campos. A validação de
chamada de ferramenta é imposta pela camada de chamada de função antes de
`execute()`, o que nos dá uma guarda sintática e semântica rígida.

**`response_format: {type: "json_schema", …}` da OpenAI.** Específico de
provedor; exigiria implementações paralelas para Gemini e Anthropic. A
abordagem de ferramenta sintética é independente de provedor.

**Reordenar structured_output para o início do lote em vez de filtrar.**
Permite que irmãos com efeitos colaterais sejam executados se a chamada
estruturada falhar na validação. Rejeitado porque o contrato do
`--json-schema` é "produzir saída estruturada" — se o modelo está nesse modo,
efeitos colaterais irmãos provavelmente são um erro. Suprimi-los completamente
é mais seguro; o modelo vê um `tool_result` "Pulado:" e pode reenviá-los em
uma rodada separada.

**Resolução local de `$ref` dentro de `schemaRootAcceptsObject`.**
Capturaria esquemas como `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}`
no momento do parsing. Rejeitado por enquanto porque o custo (detecção de
ciclos, sintaxe JSON Pointer, `$defs` vs `definitions`, ponteiros parciais,
refs remotas) supera o benefício; a dica `maxSessionTurns` já aponta os
usuários para "esquema é insatisfatível" como causa provável.

## Trabalhos pendentes

- A validação de resposta com conhecimento de esquema pode ganhar uma guarda
  ReDoS baseada em `pattern` se usuários reais encontrarem padrões de
  retrocesso catastrófico em argumentos `--json-schema`.
- Adições de protocolo SDK (SDKs Python / TypeScript / Java expondo um campo
  tipado `structured_result`) — acompanhar separadamente;
  [PR #4001](https://github.com/QwenLM/qwen-code/pull/4001) (fechado sem merge
  em 2026-05-11) cobria esse escopo antes do trabalho cli/core chegar e foi
  substituído.
## Índice de arquivos

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`,
  `schemaRootAcceptsObject`, regras de mutex do yargs `.check`.
- `packages/cli/src/gemini.tsx` — guarda da TUI, plumbing do código de saída.
- `packages/cli/src/nonInteractiveCli.ts` —
  `processToolCallBatch`, `emitStructuredSuccess`,
  `suppressedOutputBody`, caminho de falha em texto simples.
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` —
  `structuredResult` → envelope `result` + `structured_result`.
- `packages/core/src/config/config.ts` — registro com
  `registerStructuredOutputIfRequested`, ignorar `forSubAgent`.
- `packages/core/src/tools/syntheticOutput.ts` — ferramenta sintética +
  placeholder `STRUCTURED_OUTPUT_REDACTED_ARGS`.
- `packages/core/src/tools/tool-registry.ts` — renomeação por colisão de fábrica
  para ferramentas sombra do MCP.
- `packages/core/src/telemetry/types.ts` — ocultação de `function_args`.
- `packages/core/src/core/geminiChat.ts` —
  `redactStructuredOutputArgsForRecording`.
- `packages/core/src/utils/schemaValidator.ts` — `compileStrict`
  com instância estrita do Ajv.
- `packages/cli/src/utils/errors.ts` —
  dica `--json-schema` de `handleMaxTurnsExceededError`.
