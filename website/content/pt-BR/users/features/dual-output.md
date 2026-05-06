# Dual Output

O Dual Output é um modo sidecar para a TUI interativa: enquanto o Qwen Code continua renderizando normalmente no `stdout`, ele emite simultaneamente um fluxo de eventos JSON estruturado para um canal separado, permitindo que um programa externo — uma extensão de IDE, um frontend web, um pipeline de CI, um script de automação — observe e direcione a sessão.

Ele também fornece um canal reverso: um programa externo pode gravar comandos JSONL em um arquivo que a TUI monitora, permitindo enviar prompts e responder a solicitações de permissão de ferramentas como se um humano estivesse no teclado.

O Dual Output é totalmente opcional. Quando as flags abaixo estão ausentes, a TUI se comporta exatamente como antes, sem I/O extra e sem alterações de comportamento.

## Casos de uso

O Dual Output é um primitivo de infraestrutura de baixo nível. Estas são as integrações concretas que ele viabiliza:

### Sincronização em tempo real de modo duplo Terminal + Chat

O caso de uso principal. Uma ChatUI web ou desktop hospeda a TUI dentro de um PTY e renderiza uma visualização paralela da conversa, impulsionada pelo fluxo de eventos estruturado:

- O usuário pode digitar em qualquer superfície — a TUI (para power-users nativos do terminal) ou a UI web (para UX mais rica, links compartilháveis, mobile). Ambas as visualizações permanecem sincronizadas porque cada mensagem flui pelos mesmos eventos JSON.
- Os prompts de aprovação de ferramentas aparecem em ambos os lugares; quem aprovar primeiro vence.
- O histórico da sessão é capturado literalmente do `--json-file`, então o lado do servidor possui um transcript canônico legível por máquina, sem parsing de ANSI.

### Extensões de IDE (VS Code / JetBrains / Cursor / Neovim)

Incorpore o Qwen Code dentro da IDE. A TUI é executada no painel de terminal integrado do editor para quem quiser, enquanto a extensão consome eventos `--json-fd` / `--json-file` para gerenciar:

- Sobreposições de diff inline quando o agent toca em arquivos.
- Um painel lateral webview com markdown formatado, chamadas de ferramentas com syntax highlighting e citações clicáveis.
- Indicadores na barra de status (thinking / responding / awaiting approval).
- Gravações programáticas de `confirmation_response` quando o usuário clica em um botão de aprovação nativo da IDE.

### Frontends de Chat baseados em navegador

Um servidor Node/Bun executa a TUI em um PTY para seus semânticos de renderização, mas expõe um canal WebSocket para o navegador. Eventos em `--json-file` são encaminhados ao cliente; mensagens digitadas no navegador são injetadas via `--input-file`. Sem parsing de ANSI em nenhum dos lados.

### Observadores de CI / automação

Um job de CI executa o Qwen Code com um prompt de tarefa. O humano vê a TUI no log do job; o sistema de CI monitora `--json-file` para:

- Falhar o job se um evento `result` reportar um erro.
- Enviar contagens de `token usage` / `duration_ms` / `tool_use` para métricas.
- Arquivar o transcript completo como um artifact de build.

### Orquestração multiagente

Um agent supervisor executa múltiplos workers TUI, cada um com seu próprio par de arquivos de evento/entrada. Ele monitora o progresso, injeta prompts de acompanhamento e aplica políticas globais de orçamento/segurança aprovando ou negando chamadas de ferramentas em todos os workers.

### Gravação, auditoria e reprodução de sessão

Duplique cada sessão da TUI para um arquivo comum com `--json-file`. Posteriormente:

- Auditorias de compliance podem reconstruir exatamente o que foi executado.
- Testes de regressão automatizados podem comparar execuções entre versões de modelo.
- Uma ferramenta de replay pode reemitir eventos pelo mesmo protocolo para alimentar dashboards de visualização.

### Dashboards de observabilidade

Envie `--json-file` para o Loki / OTEL / qualquer pipeline que aceite JSONL. Extraia `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` como métricas de primeira classe no Grafana. Sem necessidade de regex para parsing de logs.

### Testes e QA

Testes de integração executam o Qwen Code em modo headless, o controlam com scripts `--input-file` e fazem asserções sobre eventos `--json-file`. Diferente de fazer parsing do ANSI do stdout, as asserções permanecem estáveis entre refatorações de UI.

## Flags

| Flag                  | Type             | Purpose                                                                                                                                    |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`       | number, `n >= 3` | Grava eventos JSON estruturados no file descriptor `n`. O chamador deve fornecer este fd via configuração `stdio` do spawn ou redirecionamento de shell. |
| `--json-file <path>`  | path             | Grava eventos JSON estruturados em um arquivo. O caminho pode ser um arquivo comum, um FIFO (named pipe) ou `/dev/fd/N`.                               |
| `--input-file <path>` | path             | Monitora este arquivo para comandos JSONL gravados por um programa externo.                                                                         |

`--json-fd` e `--json-file` são mutuamente exclusivos. Os fds 0, 1 e 2 são rejeitados para evitar corromper a própria saída da TUI.

## Por que duas flags de saída? (`--json-fd` vs `--json-file`)

À primeira vista, `--json-fd` parece suficiente — o chamador executa o Qwen Code com um file descriptor extra, a TUI grava eventos nele, pronto. Na prática, o repasse de fd falha no cenário de incorporação mais importante: executar a TUI dentro de um pseudo-terminal (PTY). É por isso que este recurso também expõe uma alternativa baseada em caminho.

### Quando `--json-fd` funciona

`child_process.spawn` puro com um array `stdio`:

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

O spawn do Node suporta entradas `stdio` arbitrárias; o fd 3 é herdado pelo processo filho, que pode gravar nele diretamente. Zero-copy, zero-buffer, zero filesystem — o caminho mais rápido.

### Por que `--json-fd` **não** funciona sob PTY

Wrappers de PTY como [`node-pty`](https://github.com/microsoft/node-pty) e [`bun-pty`](https://github.com/oven-sh/bun) são como qualquer incorporador sério (extensões de IDE, terminais web, multiplexadores estilo tmux) hospeda uma TUI interativa. Eles não podem encaminhar fds extras para o processo filho, por três razões reforçadas:

1. **Superfície da API.** `node-pty.spawn(file, args, options)` aceita `cwd`, `env`, `cols`, `rows`, `encoding`, etc. — mas **nenhum array `stdio`**. Simplesmente não há lugar na API para dizer "anexe também este fd como fd 3 no filho". `bun-pty` expõe a mesma estrutura.
2. **Semântica do `forkpty(3)`.** Por baixo dos panos, wrappers de PTY chamam `forkpty(3)` (ou a dança equivalente `posix_openpt` + `login_tty`). Essa syscall aloca um par pseudo-terminal master/slave e redireciona os fds 0/1/2 do filho para o lado slave, fazendo o filho pensar que está conectado a um terminal real. Quaisquer fds acima de 2 no pai são fechados pelo `login_tty`, que chama `close(fd)` para `fd >= 3` antes do `exec`. Fds extras são ativamente apagados, não herdados.
3. **Efeito colateral do terminal de controle.** Mesmo que você hackeasse um fd extra, ele não seria um terminal, então o renderizador de TUI do filho (que grava sequências de escape assumindo um TTY no fd 1) ainda precisaria do slave para sua saída. Você acabaria com dois transportes independentes de qualquer forma.

Em resumo: no momento em que um incorporador precisa de um TTY real para renderização de TUI — o que é toda extensão de IDE, todo terminal web, todo app de chat desktop — a herança de fd sai da mesa.

### `--json-file` preenche a lacuna

Um caminho de arquivo é passado como um argumento CLI comum, então ele sobrevive a qualquer modelo de spawn:

```ts
import { spawn } from 'node-pty';

const pty = spawn(
  'qwen',
  [
    '--json-file',
    '/tmp/qwen-events.jsonl',
    '--input-file',
    '/tmp/qwen-input.jsonl',
  ],
  { cols: 120, rows: 40 },
);
```

O processo filho abre o arquivo por conta própria e grava eventos lá; o incorporador monitora o mesmo caminho com `fs.watch` + leituras incrementais. Três pontos a observar:

- **Arquivo comum**, FIFO (named pipe) ou `/dev/fd/N` funcionam. FIFO é a opção de menor latência quando ambos os lados estão no mesmo host.
- A bridge abre FIFOs com `O_NONBLOCK` e faz fallback para modo bloqueante em `ENXIO` (nenhum leitor ainda), então a startup do PTY nunca trava esperando um consumidor.
- Para isolamento de multi-sessão, use caminhos por sessão sob `$XDG_RUNTIME_DIR` ou um diretório criado com `mkdtemp` com permissão `0700`.

### Qual flag devo usar?

| Estilo de incorporação                                   | Use                  |
| ------------------------------------------------- | -------------------- |
| `child_process.spawn` com stdio padrão            | `--json-fd`          |
| `node-pty` / `bun-pty` / qualquer host PTY             | `--json-file`        |
| Redirecionamento de shell / teste manual de pipeline       | qualquer               |
| Coleta de log de CI (arquivo comum, leitura após saída) | `--json-file`        |
| Menor latência possível no mesmo host              | `--json-file` + FIFO |

A regra geral: **se você precisa que a TUI renderize corretamente, você precisa de um PTY, o que significa que você precisa de `--json-file`.** `--json-fd` é para incorporadores mais simples que não se importam com a fidelidade da TUI — tipicamente wrappers programáticos que descartam o stdout de qualquer forma.

## Início rápido

Execute o Qwen Code com todos os três canais habilitados:

```bash
mkfifo /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

Em um segundo terminal, monitore o fluxo de eventos:

```bash
cat /tmp/qwen-events.jsonl
```

Em um terceiro terminal, envie um prompt para a TUI em execução:

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

O prompt aparece na TUI exatamente como se o usuário o tivesse digitado, e a resposta em streaming é espelhada em `/tmp/qwen-events.jsonl`.

## Esquema de eventos de saída

Os eventos são emitidos como JSON Lines (um objeto por linha). O esquema é o mesmo usado pelo modo não interativo `--output-format=stream-json`, com `includePartialMessages` sempre habilitado.

O primeiro evento no canal é sempre `system` / `session_start`, emitido quando a bridge é construída. Use-o para correlacionar o canal com um session id antes que qualquer outro evento chegue.

```jsonc
// Session lifecycle
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Streaming events for an in-progress assistant turn
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Completed messages
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Permission control plane (only when a tool needs approval)
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "run_shell_command",
    "tool_use_id": "...",
    "input": { "command": "rm -rf /tmp/x" },
    "permission_suggestions": null,
    "blocked_path": null
  }
}
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "...",
    "response": { "allowed": true }
  }
}
```

`control_response` é emitido independentemente de a decisão ter sido feita na TUI (UI de aprovação nativa) ou por um `confirmation_response` externo (veja abaixo). De qualquer forma, todos os observadores veem o resultado final.

## Esquema de comandos de entrada

Dois formatos de comando são aceitos em `--input-file`:

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Comportamento:

- Comandos `submit` são enfileirados. Se a TUI estiver ocupada respondendo, eles são retryados automaticamente na próxima vez que a TUI retornar ao estado idle.
- Comandos `confirmation_response` são despachados imediatamente e nunca enfileirados, porque uma chamada de ferramenta é bloqueante e a resposta deve alcançar o handler `onConfirm` subjacente sem esperar por nenhum `submit` anterior.
- Qualquer lado que aprovar uma ferramenta primeiro vence; a resposta tardia do outro lado é descartada sem causar danos.
- Linhas que falham no parsing como JSON são registradas e ignoradas — elas não interrompem o watcher.

## Notas sobre latência

O arquivo de entrada é observado com `fs.watchFile` em um intervalo de polling de 500 ms, então a latência de ida e volta no pior caso para um `submit` remoto é de cerca de meio segundo. Isso é intencional: o polling é portátil entre plataformas e sistemas de arquivos (incluindo macOS / montagens de rede) e corresponde ao ritmo típico de humano-no-loop que o recurso visa. O canal de saída não tem polling — os eventos são gravados de forma síncrona conforme a TUI os emite.

## Modos de falha

- **Fd inválido.** Se o fd passado para `--json-fd` não estiver aberto ou for um de 0/1/2, a TUI imprime um aviso no `stderr` e continua sem o dual output habilitado.
- **Caminho inválido.** Se o arquivo passado para `--json-file` não puder ser aberto, a TUI imprime um aviso e continua sem o dual output.
- **Desconexão do consumidor.** Se o leitor do outro lado do canal desaparecer (`EPIPE`), a bridge se desabilita silenciosamente e a TUI continua rodando. Sem retry.
- **Exceção no adapter.** Qualquer exceção lançada durante a emissão de um evento é capturada, registrada e desabilita a bridge. A TUI nunca quebra por uma falha de dual output.

## Exemplo de spawn

Um processo pai de incorporação típico executa o Qwen Code com ambos os canais:

```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const eventsFd = openSync('/tmp/qwen-events.jsonl', 'w');
const child = spawn(
  'qwen',
  ['--json-fd', '3', '--input-file', '/tmp/qwen-input.jsonl'],
  { stdio: ['inherit', 'inherit', 'inherit', eventsFd] },
);
```

A TUI ainda controla o terminal do usuário no stdio 0/1/2, enquanto o incorporador lê eventos estruturados no arquivo que sustenta o fd 3 e envia comandos anexando linhas JSONL a `/tmp/qwen-input.jsonl`.

## Configuração baseada em settings

Para incorporadores de longa duração, muitas vezes é inconveniente passar flags CLI por cada inicialização. Os mesmos canais podem ser configurados em `settings.json` sob a chave `dualOutput` de nível superior:

```jsonc
// ~/.qwen/settings.json  (user-level)
// or <workspace>/.qwen/settings.json  (workspace-level)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Regras de precedência:

- A flag CLI **vence** sobre as settings. Passar `--json-file /foo` na linha de comando sobrescreve `dualOutput.jsonFile` nas settings.
- `--json-fd` não tem equivalente nas settings — o repasse de fd é uma preocupação de tempo de spawn que não pode ser declarada estaticamente.
- Se nenhuma flag ou setting estiver presente, o dual output permanece desabilitado (idêntico ao padrão atual).

A flag `requiresRestart: true` significa que as alterações só entram em vigor na próxima inicialização do Qwen Code, já que a bridge é construída uma vez durante a startup.

## Demos executáveis

Cada script abaixo está pronto para copiar e colar. Comece com o POC&nbsp;1 para verificar se o build tem dual output; o POC&nbsp;4 é o análogo mais próximo de uma integração real com extensão de IDE.

### POC 1 — observe o fluxo de eventos

Monitore cada evento estruturado que a TUI emite enquanto um humano a usa normalmente:

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...then chat normally; terminal A shows session_start,
# user/assistant/result/control_request lifecycle in real time.
```

Primeira linha esperada no terminal A:

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — injete prompts de fora

Controle a TUI a partir de um segundo terminal sem tocar no teclado do primeiro:

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — the TUI responds as if you typed it
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — bridge remoto de permissão de ferramentas

Aprove ou negue chamadas de ferramentas a partir de um processo separado:

```bash
# Terminal A — observe control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Ask Qwen to do something that needs approval, e.g.
# "run `ls -la /tmp`". A control_request will appear in terminal A.
# Copy the request_id, then in a third terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# The TUI confirmation prompt dismisses and the tool executes.
```

Se você responder com um `request_id` desconhecido, a bridge emite um `control_response` com `subtype: "error"` no canal de saída para que seu consumidor possa registrá-lo ou fazer retry:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unknown request_id (already resolved, cancelled, or never issued)"
  }
}
```

### POC 4 — Incorporador Node (estilo IDE)

O formato mais realista: um processo pai executa o Qwen Code, monitora eventos e injeta prompts em seu próprio ritmo.

```ts
// demo-embedder.ts
import { spawn } from 'node:child_process';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const events = join(tmpdir(), `qwen-events-${process.pid}.jsonl`);
const input = join(tmpdir(), `qwen-input-${process.pid}.jsonl`);
writeFileSync(events, '');
writeFileSync(input, '');

const child = spawn('qwen', ['--json-file', events, '--input-file', input], {
  stdio: 'inherit',
});

// Tail the output channel. In production you'd use a proper
// byte-offset tail; this one re-streams from 0 for brevity.
const rl = createInterface({
  input: createReadStream(events, { encoding: 'utf8' }),
});
rl.on('line', (line) => {
  if (!line.trim()) return;
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    console.log('[embedder] handshake:', {
      protocol_version: ev.data.protocol_version,
      version: ev.data.version,
      supported_events: ev.data.supported_events,
    });
    // Feature-detect before using a capability
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] permission control-plane available');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] assistant turn ended, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session ended cleanly');
  }
});

// After 2s, inject a prompt as if the user typed it
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```

Execute com:

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI opens in the current terminal; the embedder logs
# handshake + turn-end + session_end events to the parent's stdout.
```

### POC 5 — Detecção de recursos do handshake de capacidade

Versões mais antigas do Qwen Code não emitirão `protocol_version`. Trate o campo como opcional e faça feature-detect:

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output is present but protocol < 1; ' +
          'falling back to best-effort behavior',
      );
    } else {
      console.log('qwen-code dual output protocol v' + v);
    }
  }
});
```

### POC 6 — session_end como sinal de término limpo

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

Se a TUI quebrar antes do `session_end`, o fluxo de saída fecha (`EPIPE` na próxima gravação); incorporadores devem lidar com ambos os caminhos.

### POC 7 — Testes de falha (prove que as flags nunca quebram a TUI)

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI still launches normally.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI still launches normally.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejects: "--json-fd and --json-file are mutually exclusive."
# Process exits before TUI starts.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr warning; TUI still launches.
```

## Relação com o Claude Code

O Claude Code expõe um formato de evento stream-json semelhante sob `--print --output-format stream-json`, mas apenas em modo não interativo — ele não tem equivalente para executar a TUI e um canal sidecar estruturado ao mesmo tempo. O Dual Output preenche essa lacuna.