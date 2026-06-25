# Saída Estruturada (`--json-schema`)

Force a resposta final do modelo a se conformar a um JSON Schema fornecido por você. O Qwen Code registra uma ferramenta sintética terminal que o modelo é obrigado a chamar, analisa os argumentos da chamada de acordo com seu esquema, e expõe o payload validado no stdout (ou no envelope de resultado JSON / stream-json). A primeira chamada válida encerra a execução.

Funciona apenas sem interface gráfica (headless) — funciona com `qwen -p`, com prompt posicional, ou com prompt recebido via stdin.

## Início rápido

```bash
qwen --prompt "Summarize the changes in HEAD with risk_level" \
  --json-schema '{
    "type": "object",
    "properties": {
      "summary":    { "type": "string" },
      "risk_level": { "type": "string", "enum": ["low", "medium", "high"] }
    },
    "required": ["summary", "risk_level"],
    "additionalProperties": false
  }'
```

Saída no stdout (padrão `--output-format text`):

```json
{ "summary": "…", "risk_level": "low" }
```

A linha é exatamente o payload convertido em JSON + quebra de linha — sem envelope, sem registro de evento. Pode ser enviado diretamente para `jq` ou outro consumidor.

No modo **texto**, o stdout é reservado para o payload JSON em caso de sucesso e fica vazio em caso de falha; mensagens de erro e linhas de log vão para o stderr. Isso torna seguros os padrões de captura como `$(qwen --json-schema …) || exit 1` no modo texto — as falhas vão para o stderr, não se misturam na variável capturada. A prosa incidental do modelo durante o planejamento **não** é espelhada no stderr também — o modo texto a descarta; use `--output-format json` ou `stream-json` se precisar vê-la.

Em `--output-format json` e `stream-json`, a mensagem de resultado de falha é emitida no **stdout** junto com o caminho de sucesso (como o elemento final do array JSON, ou a linha `result` de término no fluxo JSONL). Nem todos os modos de falha emitem um resultado para o stdout — max-session-turns (código de saída 53) e interrupções de sinal (código de saída 130) saem apenas com saída no stderr. Verifique o código de saída primeiro; `is_error` no objeto de resultado desambigua dentro do subconjunto de falhas que produzem um evento de resultado.

> **Esquema vazio:** Passar `{}` produz `{}` (um objeto JSON vazio) no stdout. O modelo chama `structured_output` sem argumentos; o caminho de normalização de argumentos upstream transforma a chamada de função vazia em um payload de objeto vazio, que passa na validação contra o esquema vazio e é emitido literalmente.

## Fornecendo o esquema

Duas formas equivalentes:

```bash
# Inline JSON literal
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# Read from a file
qwen -p "…" --json-schema @./schemas/summary.json
```

A forma `@path` expande `~`, normaliza o caminho e lê o arquivo com codificação `utf8`.

> **Nota sobre latência:** Execuções bem-sucedidas incorrem em um retardo de desligamento **limitado a ~500 ms** enquanto agentes de segundo plano em andamento descarregam suas notificações finais antes que o resultado seja emitido. O retardo termina cedo se não houver tarefas de segundo plano pendentes, então execuções simples mal percebem; pipelines em lote que disparam centenas de invocações de `--json-schema` contra agentes ocupados devem levar em conta esse limite superior.

> **Nota de segurança:** Esquemas podem conter expressões regulares fornecidas pelo usuário em palavras-chave `pattern`. O Ajv as compila com o motor de regex ECMAScript, que é vulnerável a retrocesso catastrófico. Como os argumentos da ferramenta são sempre objetos, a palavra-chave `pattern` só é acionada dentro de propriedades de string — um esquema malicioso como `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}` pode travar a CLI quando o modelo fornece um valor correspondente moderadamente longo. Execute `--json-schema` apenas com esquemas de fontes confiáveis.

Validação em tempo de análise:

- O arquivo deve ser um arquivo regular (sem FIFOs, dispositivos de caractere ou diretórios).
- O tamanho do arquivo é limitado a 4 MiB. Esquemas JSON do mundo real estão bem abaixo disso; arquivos com vários MiB quase sempre indicam um erro de caminho incorreto.
- O esquema deve ser JSON válido. Para entrada `@path`, o erro de análise é genérico ("o conteúdo de `<path>` não é JSON válido") em vez de ecoar o detalhe do SyntaxError, para que um processo de wrapper que exiba o stderr não possa ler um prefixo do conteúdo do arquivo de volta a partir do erro.
- O esquema deve compilar sob a configuração estrita do Ajv — erros de digitação como `propertees` são detectados, mas padrões válidos pela especificação (por exemplo, `required` sem listar todas as chaves em `properties`) são aceitos.
- A raiz do esquema deve aceitar valores do tipo objeto. As APIs de chamada de função (Gemini, OpenAI, Anthropic) exigem que os argumentos da ferramenta sejam objetos JSON, portanto uma raiz não-objeto registraria uma ferramenta inutilizável.

A verificação de aceitação da raiz percorre `type`, `const`, `enum`, `anyOf`, `oneOf`, `allOf`, `not`, e `if`/`then`/`else` (melhor esforço para os casos decidíveis). Em caso de dúvida, delega ao Ajv em tempo de execução.

> **A raiz `$ref` é rejeitada** pela verificação em tempo de análise. Se seu esquema reutilizar uma definição via `$ref`, envolva-a em `allOf`:
>
> ```jsonc
> // Rejected:
> { "$ref": "#/$defs/MyObj", "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
>
> // Accepted (root accepts objects via the allOf branch):
> { "allOf": [{ "$ref": "#/$defs/MyObj" }], "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
> ```
>
> `$ref` dentro de `anyOf` / `oneOf` / `allOf` é delegado ao Ajv em tempo de execução, portanto a forma encapsulada passa na verificação de aceitação da raiz.
## Formato de saída por formato

| `--output-format` | O que vai para stdout                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (padrão)   | `JSON.stringify(payload) + "\n"` — uma linha, o objeto validado.                                                                                                                                                        |
| `json`            | Um único **array** JSON de objetos de mensagem (o registro completo de eventos). O elemento final é a mensagem `type: "result"`, que carrega tanto `result` (`JSON.stringify(payload)`) quanto `structured_result` (o objeto bruto). |
| `stream-json`     | Cada evento em sua própria linha como JSONL. A linha `result` final carrega `result` (stringificado) e `structured_result` (objeto bruto).                                                                                |

Em ambos os formatos JSON, prefira ler `structured_result` em vez de `result`
quando você deseja o objeto; `result` é a forma stringificada fornecida para
consumidores que sempre esperam uma string nesse campo. Para `--output-format
json`, leia o último elemento do array e extraia `structured_result`
de lá (por exemplo, `jq '.[-1].structured_result'`); para `stream-json`,
leia a última linha `type: "result"` no fluxo.

## Restrições

| Combinação                                         | Comportamento                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-i` / `--prompt-interactive`    | Rejeitado no momento da análise. A mensagem "session ends now" da ferramenta sintética não tem terminador no loop da TUI.                                                                                                            |
| `--json-schema` + `--input-format stream-json`     | Rejeitado no momento da análise. O contrato terminal de uso único é incompatível com o protocolo de entrada stream-json de longa duração.                                                                                             |
| `--json-schema` + `--acp` / `--experimental-acp`   | Rejeitado no momento da análise. O ACP executa seu próprio loop de turnos que não respeita o contrato terminal da ferramenta sintética.                                                                                              |
| `--json-schema` sem prompt e sem stdin pipeado     | Rejeitado no momento da análise. O modo headless precisa de um prompt — passe `-p`, um argumento posicional, ou envie via pipe.                                                                                                      |
| `--bare` + `--json-schema`                         | Suportado. A ferramenta sintética é registrada junto com as três básicas (`read_file`, `edit`, `run_shell_command`).                                                                                                                |
| `--json-schema` dentro de um subagente             | A ferramenta NÃO é registrada. Apenas os turnos principal / drenagem da execução de nível superior respeitam o contrato terminal; um subagente chamando a ferramenta receberia "session ends now" e continuaria executando porque seu loop não tem terminador. |

## Modos de repetição e falha

> [!note] **Nota sobre custo.** Duas coisas multiplicam o gasto de tokens em uma execução
> `--json-schema`, ambas vale a pena projetar:
>
> - **Esquema embutido em cada turno.** O esquema é enviado como o bloco `parameters` da declaração da
>   função `structured_output` em todas as requisições do modelo, não apenas na primeira. Esquemas grandes (até o limite de
>   análise de 4 MiB) aumentam proporcionalmente os tokens de entrada por turno
>   para toda a execução.
> - **Cada repetição de validação é um turno completo do modelo.** Um esquema que o
>   modelo erra repetidamente é multiplicado por cada falha (requisição +
>   inferência + resposta). Mantenha os esquemas restritos o suficiente para guiar
>   o modelo e simples o suficiente para acertar na primeira tentativa; aumente
>   `--max-session-turns` quando repetições forem esperadas.

A sessão termina na primeira chamada válida. Até lá:

- **Argumentos falham na validação.** `structured_output` retorna um erro de resultado de ferramenta
  com a mensagem do Ajv, o modelo a vê no próximo turno e
  pode corrigir os argumentos e chamar novamente.
- **Modelo chama uma ferramenta com efeito colateral no mesmo turno que
  `structured_output`.** A pré-verificação suprime a irmã — ela
  nunca executa, independentemente de a chamada estruturada eventualmente
  validar. Os dois caminhos divergem no que o modelo vê em seguida:
  - **Validação bem-sucedida:** a execução termina imediatamente, e o modelo
    nunca recebe outro turno — a chamada irmã suprimida é
    silenciosamente descartada.
  - **Validação falha:** o modelo recebe outro turno e vê um
    `tool_result` sintetizado "Skipped:" para a chamada suprimida,
    para que possa reemitir essa chamada em um **turno separado** (um
    que não inclua `structured_output`).
- **Modelo emite texto simples em vez de chamar
  `structured_output`.** Código de saída `1`. A mensagem de erro inclui
  a contagem de turnos e uma prévia truncada da saída do modelo para
  que você veja o que ele realmente disse.
- **Execução atinge `maxSessionTurns`.** Código de saída `53`. Saída
  padrão "Reached max session turns", mais uma dica específica de `--json-schema`
  que aponta para as três causas comuns de execução travada: modelo nunca
  chamou a ferramenta, `structured_output` foi negado por regras de permissão,
  ou o esquema é insatisfazível.
- **Execução é interrompida (SIGINT / Ctrl-C).** Código de saída `130`. O
  resultado estruturado normalmente não é emitido, mas o loop de retenção de desligamento
  não verifica o sinal de aborto, então um SIGINT que
  chega após uma chamada bem-sucedida ter sido capturada, mas antes de o
  resultado chegar ao stdout, ainda pode cair no stdout. Trate o
  código de saída como a fonte da verdade.
## Privacidade

Os argumentos que você envia através de `structured_output` SÃO a carga útil estruturada — já emitida no stdout. Para evitar persistir a mesma carga útil uma segunda vez em superfícies locais do dispositivo que podem ser exportadas da máquina, os argumentos são redigidos com o marcador `{ __redacted: 'structured_output payload (see stdout result)' }` em:

- O caminho de telemetria `ToolCallEvent` (exportações OTLP, QwenLogger, fluxo ui-telemetry, espelho de evento de gravação de chat na interface).
- O arquivo JSONL de gravação de chat no disco em `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` (realimentado no contexto do modelo em `--continue` / `--resume`), incluindo cada tentativa de validação com falha.

Métricas de chamada de ferramenta (duração, sucesso, decisão) e metadados de evento circundantes são preservados.

> **O esquema é enviado ao provedor do modelo.** A redação cobre apenas os _argumentos da chamada_ em superfícies locais. O próprio esquema é transportado em cada requisição ao modelo como o bloco `parameters` da declaração de função `structured_output` — portanto, quaisquer valores literais que você colocar dentro dele (`enum`, `const`, `default`, `examples`, `description`, `$comment`, etc.) chegam ao provedor em texto claro, assim como o texto do prompt. Esquemas devem descrever forma e restrições; trate-os como públicos para o provedor e mantenha segredos, registros de clientes e outras cargas sensíveis fora do corpo do esquema.

> **Hooks veem argumentos brutos.** A redação descrita acima se aplica apenas à telemetria e à gravação de chat. Os hooks `PreToolUse`, `PostToolUse` e `PostToolUseFailure` (incluindo hooks HTTP que podem encaminhar cargas para fora do dispositivo) recebem o `tool_input` não redigido para `structured_output`, pois o contrato do hook é "ver o que a ferramenta vê". Se você opera hooks abrangentes do tipo auditoria, desabilite-os para `structured_output` (filtre por `tool_name`) ou adicione redação do lado do hook antes de executar `--json-schema` em dados sensíveis.

## Retomada de sessão (`--continue` / `--resume`)

`--json-schema` é uma opção por execução, não uma propriedade por sessão. A ferramenta sintética é registrada quando o CLI analisa seus argumentos, portanto:

- Re-passe `--json-schema` em cada `--continue` / `--resume` em que você deseja que o contrato do terminal se aplique. O mesmo esquema da execução original é o padrão seguro — uma troca de esquema no meio da sessão é permitida, mas altera o contrato ao qual o modelo está sendo responsabilizado.
- Se você executar `--continue` sem `--json-schema`, a sessão retomada é uma sessão headless comum: `structured_output` simplesmente não existe como ferramenta, e o modelo responderá em texto livre.
- O marcador `__redacted` na gravação de chat retomada não afeta a capacidade de retomada na prática. Uma chamada bem-sucedida de `structured_output` encerra a sessão imediatamente, então os únicos argumentos redigidos que uma execução retomada poderia ver são de tentativas fracassadas. O modelo ainda tem o erro de validação Ajv de cada tentativa no `tool_result` registrado e no esquema de parâmetros ativo (re-registrado a partir de `--json-schema`), o que é suficiente para tentar novamente.

## Bloqueio de permissão

`structured_output` deliberadamente ignora a lista de permissões `--core-tools`: a ferramenta só existe quando `--json-schema` está definido, então excluí-la deixaria a execução sem contrato de terminal.

Regras explícitas de `permissions.deny` e configurações `--exclude-tools` TÊM efeito — ambas usam o mesmo mecanismo de negação e ambas impedem que `structured_output` seja registrada, então o modelo nunca vê a declaração da ferramenta. O resultado típico é que o modelo responde em texto simples (saída 1). Se o modelo fica em loop por outras ferramentas sem nunca produzir texto, eventualmente atinge `maxSessionTurns` (saída 53) e a dica `--json-schema` na mensagem de erro indica onde procurar.

> **Ressalva do `--bare`.** O modo bare ignora a maioria das entradas derivadas de configurações, incluindo `permissions.deny` e `tools.exclude` no nível de configurações. A ferramenta sintética permanece registrada, portanto uma negação apenas nas configurações de `structured_output` será silenciosamente ignorada no modo `--bare`. A opção `--exclude-tools structured_output` no nível de argumentos ainda se aplica no modo bare — use a opção de linha de comando em vez de configurações se precisar bloquear uma execução bare.

## Conflito com ferramentas MCP

Se um servidor MCP registrar uma ferramenta literalmente chamada `structured_output`, a verificação de colisão do registro de ferramentas renomeia a ferramenta MCP para `mcp__<server-name>__structured_output` para que a ferramenta sintética mantenha o nome simples. O esquema fornecido pelo usuário é sempre o que o modelo vê.

## Exemplo: controlando uma execução multi-etapas com a saída estruturada

```bash
RESULT=$(qwen --prompt "Audit this diff and rate its risk." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "High-risk diff; pausing pipeline." >&2
  exit 2
fi
```

## Veja também

- [Modo Headless](headless.md) — o fluxo baseado em `-p` que `--json-schema` amplia.
- [Saída Dupla](dual-output.md) — registra um sidecar de eventos JSON junto com a TUI (uma abordagem diferente para saída legível por máquina; não requer `--json-schema`).
