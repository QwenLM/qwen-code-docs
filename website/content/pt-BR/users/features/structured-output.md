# Saída Estruturada (`--json-schema`)

Restringe a resposta final do modelo ao esquema JSON que você fornece. O Qwen
Code registra uma ferramenta terminal sintética que o modelo é obrigado a chamar,
analisa os argumentos da chamada com base no seu esquema e expõe
a carga validada no stdout (ou no envelope de resultado JSON / stream-json).
A primeira chamada válida encerra a execução.

Funciona apenas em modo sem interface (headless) — com `qwen -p`, um prompt posicional, ou um prompt
enviado via stdin.

## Início rápido

```bash
qwen --prompt "Resuma as alterações no HEAD com risk_level" \
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

A linha é exatamente a carga em JSON stringified + nova linha — sem
envelope, sem log de eventos. Envie direto para `jq` ou outro consumidor.

No modo **text**, o stdout é reservado para a carga JSON em caso de sucesso
e fica vazio em caso de falha; mensagens de erro e linhas de log vão para o stderr.
Isso torna padrões de captura como `$(qwen --json-schema …) || exit 1` seguros
no modo text — as falhas vão para o stderr, não se misturam na variável capturada.
A prosa incidental do modelo durante o planejamento **não** é
espelhada no stderr — o modo text a descarta; use
`--output-format json` ou `stream-json` se precisar vê-la.

Nos modos `--output-format json` e `stream-json`, a mensagem de resultado de falha
é emitida no **stdout** junto com o caminho de sucesso (como o
último elemento do array JSON, ou a linha `result` final no
fluxo JSONL). Nem todos os modos de falha emitem um resultado no stdout —
limite de turnos da sessão (código de saída 53) e interrupções de sinal (código de saída 130) saem apenas com
saída no stderr. Verifique o código de saída primeiro; `is_error` no
objeto de resultado desambigua dentro do subconjunto de falhas que de fato
produzem um evento de resultado.

> **Esquema vazio:** Passar `{}` produz `{}` (um objeto JSON vazio)
> no stdout. O modelo chama `structured_output` sem argumentos;
> o caminho de normalização de argumentos upstream transforma a chamada de função vazia
> em uma carga de objeto vazio, que passa na validação contra o
> esquema vazio e é emitido diretamente.

## Fornecendo o esquema

Duas formas equivalentes:

```bash
# Literal JSON inline
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# Lido de um arquivo
qwen -p "…" --json-schema @./schemas/summary.json
```

A forma `@path` expande `~`, normaliza o caminho e lê o arquivo
com codificação `utf8`.

> **Nota sobre latência:** Execuções bem-sucedidas incorrem em um atraso de desligamento **limitado
> a ~500 ms** enquanto agentes de fundo em andamento descarregam suas notificações finais
> antes que o resultado seja emitido. O atraso sai cedo
> se não houver tarefas de fundo pendentes, então execuções simples quase não o percebem;
> pipelines em lote que distribuem centenas de invocações `--json-schema`
> contra agentes ocupados devem considerar esse limite superior.

> **Nota de segurança:** Esquemas podem conter expressões regulares fornecidas pelo usuário
> em palavras-chave `pattern`. O Ajv compila estas com o
> mecanismo ECMAScript de regex, que é vulnerável a
> retrocesso catastrófico. Como os argumentos de ferramentas são sempre objetos,
> a palavra-chave `pattern` só dispara dentro de propriedades string — um
> esquema malicioso como
> `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}`
> pode travar a CLI quando o modelo fornece um valor correspondente moderadamente longo.
> Use `--json-schema` apenas com esquemas de fontes confiáveis.

Validação em tempo de análise:

- O arquivo deve ser um arquivo regular (sem FIFOs, dispositivos de caractere ou
  diretórios).
- O tamanho do arquivo é limitado a 4 MiB. Esquemas JSON do mundo real estão bem abaixo
  disso; arquivos com vários MiB quase sempre indicam um erro de caminho.
- O esquema deve ser JSON válido. Para entrada `@path`, o erro de análise é
  genérico ("o conteúdo de `<caminho>` não é JSON válido") em vez de
  ecoar o detalhe do SyntaxError, para que um processo wrapper que coleta stderr
  não possa ler um prefixo do conteúdo do arquivo a partir do erro.
- O esquema deve compilar sob a configuração estrita do Ajv —
  erros de digitação como `propertees` são apontados, mas padrões
  válidos na especificação (ex.: `required` sem listar todas as chaves em `properties`) são
  aceitos.
- A raiz do esquema deve aceitar valores do tipo objeto. As APIs
  de function-calling (Gemini, OpenAI, Anthropic) todas exigem que os argumentos da ferramenta sejam
  objetos JSON, então uma raiz que não seja objeto registraria uma ferramenta inutilizável.

A verificação de aceitação da raiz percorre `type`, `const`, `enum`, `anyOf`,
`oneOf`, `allOf`, `not` e `if`/`then`/`else` (melhor esforço para os
casos decidíveis). Em caso de dúvida, delega ao Ajv em tempo de execução.

> **`$ref` na raiz é rejeitado** pela verificação em tempo de análise. Se seu esquema
> reutilizar uma definição via `$ref`, envolva-a em `allOf`:
>
> ```jsonc
> // Rejeitado:
> { "$ref": "#/$defs/MeuObj", "$defs": { "MeuObj": { "type": "object", "properties": { "nome": { "type": "string" } } } } }
>
> // Aceito (a raiz aceita objetos através do ramo allOf):
> { "allOf": [{ "$ref": "#/$defs/MeuObj" }], "$defs": { "MeuObj": { "type": "object", "properties": { "nome": { "type": "string" } } } } }
> ```
>
> `$ref` dentro de `anyOf` / `oneOf` / `allOf` é delegado ao Ajv em
> tempo de execução, então a forma encapsulada passa na verificação de aceitação da raiz.

## Formato da saída por formato

| `--output-format` | O que vai para o stdout                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (padrão)   | `JSON.stringify(carga) + "\n"` — uma linha, o objeto validado.                                                                                                                                                                            |
| `json`            | Um único **array** JSON de objetos de mensagem (o log completo de eventos). O elemento final é a mensagem `type: "result"`, que carrega tanto `result` (`JSON.stringify(carga)`) quanto `structured_result` (o objeto bruto). |
| `stream-json`     | Cada evento em sua própria linha como JSONL. A linha `result` final carrega `result` (stringificado) e `structured_result` (objeto bruto).                                                                               |

Em ambos os formatos JSON, prefira ler `structured_result` em vez de `result`
quando quiser o objeto; `result` é a forma stringificada fornecida para
consumidores que sempre esperam uma string nesse campo. Para `--output-format
json`, leia o último elemento do array e extraia `structured_result`
de lá (ex.: `jq '.[-1].structured_result'`); para `stream-json`,
leia a linha final `type: "result"` no fluxo.

## Restrições

| Combinação                                             | Comportamento                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-i` / `--prompt-interactive`        | Rejeitado em tempo de análise. A mensagem "sessão encerra agora" da ferramenta sintética não tem terminador no loop TUI.                                                                                                                  |
| `--json-schema` + `--input-format stream-json`         | Rejeitado em tempo de análise. O contrato terminal de única execução é incompatível com o protocolo de entrada stream-json de longa duração.                                                                                              |
| `--json-schema` + `--acp` / `--experimental-acp`       | Rejeitado em tempo de análise. O ACP executa seu próprio loop de turnos que não honra o contrato terminal da ferramenta sintética.                                                                                                        |
| `--json-schema` sem prompt e sem stdin por pipe        | Rejeitado em tempo de análise. O modo headless precisa de um prompt — passe `-p`, um argumento posicional ou envie um por pipe.                                                                                                           |
| `--bare` + `--json-schema`                             | Suportado. A ferramenta sintética é registrada junto com as três básicas (`read_file`, `edit`, `run_shell_command`).                                                                                                                      |
| `--json-schema` dentro de um subagente                 | Ferramenta **não** é registrada. Apenas os turnos principal/drain da execução de nível superior honram o contrato terminal; um subagente chamando a ferramenta receberia "sessão encerra agora" e continuaria executando porque seu loop não tem terminador. |

## Modos de repetição e falha

> **Nota sobre custo.** Duas coisas multiplicam o gasto de tokens em uma execução
> `--json-schema`, ambas valendo a pena considerar no design:
>
> - **Esquema embutido em cada turno.** O esquema é enviado como o
>   bloco `parameters` da declaração de função `structured_output` em
>   toda requisição ao modelo, não apenas na primeira. Esquemas grandes (até o
>   limite de análise de 4 MiB) aumentam proporcionalmente os tokens de entrada por turno
>   para toda a execução.
> - **Cada repetição de validação é um turno completo do modelo.** Um esquema que o
>   modelo erra repetidamente é multiplicado por falha (requisição +
>   inferência + resposta). Mantenha os esquemas restritos o suficiente para guiar
>   o modelo e simples o suficiente para acertar na primeira tentativa;
>   aumente `--max-session-turns` quando repetições forem esperadas.

A sessão termina na primeira chamada válida. Até lá:

- **Argumentos falham na validação.** `structured_output` retorna um erro de resultado de ferramenta
  com a mensagem do Ajv, o modelo a vê no próximo turno,
  e pode corrigir os argumentos e chamar novamente.
- **Modelo chama uma ferramenta com efeito colateral no mesmo turno que
  `structured_output`.** A pré-verificação suprime a ferramenta irmã —
  ela nunca é executada, independentemente de a chamada estruturada eventualmente
  validar. Os dois caminhos divergem no que o modelo vê a seguir:
  - **Validação bem-sucedida:** a execução termina imediatamente, e o modelo
    nunca recebe outro turno — a ferramenta irmã suprimida é silenciosamente descartada.
  - **Validação falha:** o modelo recebe outro turno e vê
    um `tool_result` sintetizado "Ignorado:" para a chamada suprimida,
    para que possa reemiti-la em um **turno separado** (que
    não inclua `structured_output`).
- **Modelo emite texto simples em vez de chamar
  `structured_output`.** Código de saída `1`. A mensagem de erro inclui
  a contagem de turnos e uma prévia truncada da saída do modelo para que
  você possa ver o que ele realmente disse.
- **Execução atinge `maxSessionTurns`.** Código de saída `53`. Saída padrão
  "Atingido número máximo de turnos da sessão", mais uma dica
  específica de `--json-schema` que aponta para as três causas comuns de execução travada: modelo nunca chamou
  a ferramenta, `structured_output` negado por regras de permissão,
  ou esquema insatisfazível.
- **Execução é interrompida (SIGINT / Ctrl-C).** Código de saída `130`. O
  resultado estruturado normalmente não é emitido, mas o loop
  de atraso de desligamento não consulta o sinal de aborto, então um SIGINT que
  chega após uma chamada bem-sucedida ter sido capturada, mas antes
  do resultado chegar ao stdout, ainda pode chegar ao stdout.
  Trate o código de saída como a fonte da verdade.

## Privacidade

Os argumentos que você envia através de `structured_output` SÃO a carga
estruturada — já emitida no stdout. Para evitar persistir a mesma carga
uma segunda vez em superfícies do dispositivo que podem ser exportadas da
máquina, os argumentos são redigidos com o placeholder
`{ __redacted: 'carga do structured_output (veja resultado no stdout)' }` em:

- O caminho de telemetria `ToolCallEvent` (exportações OTLP, QwenLogger,
  stream de telemetria da interface, espelho de evento da gravação de chat na interface).
- O JSONL de gravação de chat no disco em
  `~/.qwen/projects/<cwd-santizado>/chats/<sessionId>.jsonl` (realimentado
  no contexto do modelo em `--continue` / `--resume`), incluindo cada
  repetição de falha de validação.

As métricas de chamada de ferramenta (duração, sucesso, decisão) e os metadados
dos eventos ao redor são preservados.

> **O esquema é enviado ao provedor do modelo.** A redação cobre
> os _argumentos da chamada_ apenas nas superfícies locais. O próprio esquema viaja
> em toda requisição ao modelo como o bloco `parameters` da declaração
> de função `structured_output` — portanto, quaisquer valores literais que você colocar
> dentro dele (`enum`, `const`, `default`, `examples`, `description`,
> `$comment`, etc.) chegam ao provedor em texto claro, assim como o texto do prompt.
> Os esquemas devem descrever forma e restrições; trate-os como públicos
> em relação ao provedor e mantenha segredos, registros de clientes e outras
> cargas sensíveis fora do corpo do esquema.

> **Hooks veem argumentos brutos.** A redação descrita acima se aplica apenas
> à telemetria e à gravação de chat. Os hooks `PreToolUse`, `PostToolUse` e
> `PostToolUseFailure` (incluindo hooks HTTP que podem encaminhar
> cargas para fora do dispositivo) recebem o `tool_input` não redigido
> para `structured_output`, já que o contrato do hook é "ver o que a ferramenta vê."
> Se você opera hooks catch-all do tipo auditoria, desabilite-os
> para `structured_output` (filtre por `tool_name`) ou adicione
> redação no lado do hook antes de executar `--json-schema` com
> dados sensíveis.

## Retomada de sessão (`--continue` / `--resume`)

`--json-schema` é uma flag por execução, não uma propriedade por sessão. A
ferramenta sintética é registrada quando a CLI analisa seus argumentos, então:

- Repasse `--json-schema` em todo `--continue` / `--resume` ao qual você deseja
  que o contrato terminal se aplique. O mesmo esquema da execução
  original é o padrão seguro — uma troca de esquema no meio da sessão é permitida, mas
  muda o contrato ao qual o modelo está sendo submetido.
- Se você usar `--continue` sem `--json-schema`, a execução retomada é uma
  sessão headless comum: `structured_output` simplesmente não
  existe como ferramenta, e o modelo responderá em texto livre.
- O placeholder `__redacted` na gravação de chat retomada não
  afeta a capacidade de retomada na prática. Uma chamada `structured_output`
  bem-sucedida termina a sessão imediatamente, então os únicos argumentos redigidos
  que uma execução retomada poderia ver são de tentativas falhas. O modelo
  ainda tem o erro de validação Ajv de cada tentativa no `tool_result`
  gravado e o esquema de parâmetros ativo (re-registrado a partir de `--json-schema`),
  o que é suficiente para repetir.

## Controle de permissão

`structured_output` intencionalmente ignora a lista de permissões `--core-tools`:
a ferramenta só existe quando `--json-schema` é definido, então excluí-la
deixaria a execução sem contrato terminal.

Regras explícitas de `permissions.deny` e configurações de `--exclude-tools`
SURTEM efeito — ambas usam o mesmo mecanismo de negação e ambas impedem
que `structured_output` seja registrada, então o modelo nunca vê
a declaração da ferramenta. O resultado típico é que o modelo responde em
texto simples (código de saída 1). Se o modelo fizer um loop por outras ferramentas sem
nunca produzir texto, eventualmente atingirá `maxSessionTurns`
(código de saída 53) e a dica `--json-schema` na mensagem de erro informa
onde procurar.

> **Ressalva do `--bare`.** O modo bare ignora a maioria das entradas derivadas de configurações,
> incluindo `permissions.deny` e `tools.exclude` no nível de configurações. A
> ferramenta sintética permanece registrada, então uma negação via configurações apenas
> de `structured_output` será silenciosamente ignorada no modo `--bare`. A nível de argv,
> `--exclude-tools structured_output` ainda se aplica no modo bare — use
> a flag em vez de configurações se precisar restringir uma execução bare.

## Conflito com ferramentas MCP

Se um servidor MCP registrar uma ferramenta literalmente chamada `structured_output`,
a verificação de colisão do registro de ferramentas renomeia a ferramenta MCP para
`mcp__<nome-do-servidor>__structured_output` para que a ferramenta sintética mantenha o
nome simples. O esquema fornecido pelo usuário é sempre o que o modelo vê.

## Exemplo: controlando uma execução de múltiplas etapas com base na saída estruturada

```bash
RESULT=$(qwen --prompt "Audite este diff e avalie seu risco." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "Diff de alto risco; pausando pipeline." >&2
  exit 2
fi
```

## Veja também

- [Modo Headless](headless.md) — o fluxo baseado em `-p` no qual `--json-schema`
  se baseia.
- [Saída Dupla](dual-output.md) — grava um sidecar de eventos JSON
  junto com a TUI (uma abordagem diferente para saída legível por máquina;
  não requer `--json-schema`).