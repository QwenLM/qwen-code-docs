# Dual Output

Dual Output é um modo *sidecar* para a TUI interativa: enquanto o Qwen Code continua renderizando normalmente no `stdout`, ele emite concorrentemente um stream estruturado de eventos JSON para um canal separado, permitindo que um programa externo — uma extensão de IDE, um frontend web, um pipeline de CI, um script de automação — observe e direcione a sessão.

Ele também oferece um canal reverso: um programa externo pode escrever comandos JSONL em um arquivo que a TUI monitora, permitindo que ele envie *prompts* e responda a solicitações de permissão de ferramentas como se um humano estivesse no teclado.

Dual Output é totalmente opcional. Quando as flags abaixo estão ausentes, a TUI se comporta exatamente como antes, sem E/S extra e sem mudanças comportamentais.

## Casos de uso

Dual Output é um primitivo de baixo nível. Estas são integrações concretas que ele possibilita:

### Sincronização em tempo real no modo dual (Terminal + Chat)

O caso de uso principal. Um ChatUI web ou desktop hospeda a TUI dentro de um PTY e renderiza uma visão paralela da conversação orientada pelo stream de eventos estruturados:

- O usuário pode digitar em qualquer superfície — na TUI (para usuários avançados do terminal) ou na interface web (para UX mais rica, links compartilháveis, mobile). Ambas as visualizações permanecem sincronizadas porque toda mensagem passa pelos mesmos eventos JSON.
- *Prompts* de aprovação de ferramentas aparecem em ambos os lugares; quem aprovar primeiro vence.
- O histórico da sessão é capturado literalmente a partir de `--json-file`, então o lado servidor tem uma transcrição canônica legível por máquina sem precisar interpretar ANSI.

### Extensões de IDE (VS Code / JetBrains / Cursor / Neovim)

Embuta o Qwen Code dentro da IDE. A TUI executa no painel do terminal integrado do editor para usuários que preferirem, enquanto a extensão consome os eventos de `--json-fd` / `--json-file` para gerar:

- Sobreposições de *diff* inline quando o agente modifica arquivos.
- Um painel lateral *webview* com markdown formatado, chamadas de ferramentas com destaque de sintaxe e citações clicáveis.
- Indicadores na barra de status (pensando / respondendo / aguardando aprovação).
- Escrita programática de `confirmation_response` quando o usuário clica em um botão de aprovação nativo da IDE.

### Frontends de Chat baseados em navegador

Um servidor Node/Bun inicia a TUI em um PTY para sua semântica de renderização, mas expõe um canal WebSocket para o navegador. Eventos em `--json-file` são encaminhados para o cliente; mensagens do usuário digitadas no navegador são injetadas via `--input-file`. Não há necessidade de interpretação ANSI em nenhum dos lados.

### Observadores de CI / automação

Um job de CI executa o Qwen Code com um *prompt* de tarefa. O humano vê a TUI no log do job; o sistema de CI monitora `--json-file` para:

- Falhar o job se um evento `result` reportar um erro.
- Enviar contagens de `token usage` / `duration_ms` / `tool_use` para métricas.
- Arquivar a transcrição completa como um artefato de build.

### Orquestração multi-agente

Um agente supervisor inicia múltiplos workers da TUI, cada um com seu próprio par de arquivos de evento/entrada. Ele monitora o progresso, injeta *prompts* de acompanhamento e aplica políticas globais de orçamento/segurança aprovando ou negando chamadas de ferramentas em todos os workers.

### Gravação, auditoria e reprodução de sessão

Redirecione cada sessão da TUI para um arquivo regular com `--json-file`. Posteriormente:

- Auditorias de conformidade podem reconstruir exatamente o que foi executado.
- Testes de regressão automatizados podem comparar execuções entre versões do modelo.
- Uma ferramenta de reprodução pode reemitir eventos através do mesmo protocolo para alimentar painéis de visualização.

### Painéis de observabilidade

Envie `--json-file` para Loki / OTEL / qualquer pipeline que aceite JSONL. Extraia `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` como métricas de primeira classe no Grafana. Sem necessidade de regex para interpretação de logs.

### Teste e QA

Testes de integração iniciam o Qwen Code sem cabeça, controlam-no com scripts `--input-file` e fazem asserções sobre eventos de `--json-file`. Ao contrário da interpretação de ANSI em stdout, as asserções são estáveis independentemente de reformulações da interface.

## Flags

| Flag                  | Tipo             | Propósito                                                                                                                                                          |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-fd <n>`       | número, `n >= 3` | Escreve eventos JSON estruturados no descritor de arquivo `n`. O chamador deve fornecer este fd via configuração `stdio` do *spawn* ou redirecionamento de shell. |
| `--json-file <path>`  | caminho          | Escreve eventos JSON estruturados em um arquivo. O caminho pode ser um arquivo regular, um FIFO (*pipe* nomeado) ou `/dev/fd/N`.                                    |
| `--input-file <path>` | caminho          | Monitora este arquivo em busca de comandos JSONL escritos por um programa externo.                                                                                 |

`--json-fd` e `--json-file` são mutuamente exclusivos. Os fds 0, 1 e 2 são rejeitados para evitar corromper a saída da própria TUI.

## Por que duas flags de saída? (`--json-fd` vs `--json-file`)

À primeira vista, `--json-fd` parece suficiente — o chamador inicia o Qwen Code com um descritor de arquivo extra, a TUI escreve eventos nele, pronto. Na prática, a passagem de fd se quebra no cenário de incorporação mais importante: executar a TUI dentro de um pseudo-terminal (PTY). É por isso que este recurso também expõe uma alternativa baseada em caminho.

### Quando `--json-fd` funciona

`child_process.spawn` puro com um array `stdio`:

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

O spawn do Node suporta entradas `stdio` arbitrárias; o fd 3 é herdado pelo filho, que pode escrever diretamente nele. Zero-cópia, zero-buffer, zero sistema de arquivos — o caminho mais rápido.

### Por que `--json-fd` **não** funciona sob PTY

Wrappers PTY como [`node-pty`](https://github.com/microsoft/node-pty) e [`bun-pty`](https://github.com/oven-sh/bun) são como qualquer incorporador sério (extensões de IDE, terminais web, multiplexadores tipo tmux) hospeda uma TUI interativa. Eles não podem encaminhar fds extras para o filho, por três razões que se reforçam:

1. **Superfície da API.** `node-pty.spawn(file, args, options)` aceita `cwd`, `env`, `cols`, `rows`, `encoding`, etc. — mas **nenhum array `stdio`**. Simplesmente não há lugar na API para dizer "também anexe este fd como fd 3 no filho". `bun-pty` expõe a mesma forma.
2. **Semântica de `forkpty(3)`.** Internamente, os wrappers PTY chamam `forkpty(3)` (ou o equivalente `posix_openpt` + `login_tty`). Essa chamada de sistema aloca um par mestre/escravo de pseudo-terminal e redireciona os fds 0/1/2 do filho para o lado escravo, de modo que o filho pense que está conectado a um terminal real. Quaisquer fds acima de 2 no pai são fechados por `login_tty`, que chama `close(fd)` para `fd >= 3` antes de `exec`. Fds extras são ativamente limpos, não herdados.
3. **Efeito colateral do terminal de controle.** Mesmo que você conseguisse passar um fd extra, ele não seria um terminal, então o renderizador da TUI do filho (que escreve sequências de escape assumindo um TTY no fd 1) ainda precisaria do escravo para sua saída. Você acabaria com dois transportes independentes de qualquer maneira.

Em resumo: no momento em que um incorporador precisa de um TTY real para renderização da TUI — o que é toda extensão de IDE, todo terminal web, todo aplicativo de chat desktop — a herança de fd está fora de questão.

### `--json-file` preenche a lacuna

Um caminho de arquivo é passado como um argumento CLI comum, então sobrevive a qualquer modelo de *spawn*:

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

O filho abre o arquivo por conta própria e escreve eventos lá; o incorporador monitora o mesmo caminho com `fs.watch` + leituras incrementais. Três coisas a notar:

- **Arquivo regular**, FIFO (*pipe* nomeado) ou `/dev/fd/N` funcionam. FIFO é a opção de menor latência quando ambos os lados estão no mesmo host.
- A ponte abre FIFOs com `O_NONBLOCK` e recai para modo bloqueante em `ENXIO` (sem leitor ainda), portanto a inicialização do PTY nunca trava esperando um consumidor.
- Para isolamento de múltiplas sessões, use caminhos por sessão sob `$XDG_RUNTIME_DIR` ou um diretório `mkdtemp` com modo `0700`.

### Qual flag devo usar?

| Estilo de incorporação                              | Use                  |
| --------------------------------------------------- | -------------------- |
| `child_process.spawn` com stdio padrão              | `--json-fd`          |
| `node-pty` / `bun-pty` / qualquer host PTY          | `--json-file`        |
| Redirecionamento de shell / teste manual de pipeline | qualquer             |
| Coleta de logs de CI (arquivo regular, lido após saída) | `--json-file`        |
| Menor latência possível no mesmo host               | `--json-file` + FIFO |

A regra geral: **se você precisa que a TUI renderize corretamente, você precisa de um PTY, o que significa que você precisa de `--json-file`.** `--json-fd` é para incorporadores mais simples que não se importam com a fidelidade da TUI — tipicamente wrappers programáticos que descartam stdout de qualquer maneira.

## Início rápido

Execute o Qwen Code com ambos os canais habilitados usando arquivos regulares:

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

Em um segundo terminal, monitore o stream de eventos:

```bash
tail -f /tmp/qwen-events.jsonl
```

Em um terceiro terminal, envie um *prompt* para a TUI em execução:

```bash
echo '{"type":"submit","text":"Explique este repositório"}' >> /tmp/qwen-input.jsonl
```

O *prompt* aparece na TUI exatamente como se o usuário o tivesse digitado, e a resposta em streaming é espelhada em `/tmp/qwen-events.jsonl`.

### Usando FIFOs (*pipes* nomeados) para saída de eventos

FIFOs oferecem latência menor do que arquivos regulares (sem E/S de disco) e funcionam bem quando ambos os lados estão no mesmo host. A ponte abre FIFOs com `O_RDWR | O_NONBLOCK`, portanto **não bloqueia** mesmo que nenhum leitor esteja conectado ainda — os eventos são armazenados em buffer no buffer do *pipe* do kernel até que um leitor se conecte.

> **Nota:** `--input-file` requer um arquivo regular (não um FIFO) porque o observador depende de `stat.size` para detectar novos dados, que é sempre 0 para FIFOs.

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# A TUI inicia imediatamente — não é necessário iniciar um leitor primeiro.

# Em um segundo terminal, conecte-se quando estiver pronto:
cat /tmp/qwen-events.jsonl
```

Se nenhum leitor nunca se conectar, a ponte se desativa automaticamente assim que o buffer interno excede 1 MB. A TUI continua executando normalmente.

## Esquema do evento de saída

Os eventos são emitidos como JSON Lines (um objeto por linha). O esquema é o mesmo usado pelo modo não interativo `--output-format=stream-json`, com `includePartialMessages` sempre ativado.

O primeiro evento no canal é sempre `system` / `session_start`, emitido quando a ponte é construída. Use-o para correlacionar o canal com um ID de sessão antes que qualquer outro evento chegue.

```jsonc
// Ciclo de vida da sessão
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/caminho/para/cwd" }
}

// Eventos de streaming para uma rodada de assistente em andamento
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Olá" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Mensagens concluídas
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Plano de controle de permissão (apenas quando uma ferramenta precisa de aprovação)
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

`control_response` é emitido independentemente de a decisão ter sido tomada na TUI (IU de aprovação nativa) ou por um `confirmation_response` externo (veja abaixo). De qualquer forma, todos os observadores veem o resultado final.

## Esquema do comando de entrada

Duas formas de comando são aceitas em `--input-file`:

```jsonc
// Envia uma mensagem de usuário para a fila de prompts
{ "type": "submit", "text": "O que esta função faz?" }

// Responde a uma control_request pendente
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Comportamento:

- Comandos `submit` são enfileirados. Se a TUI estiver ocupada respondendo, eles são repetidos automaticamente na próxima vez que a TUI retornar ao estado ocioso.
- Comandos `confirmation_response` são despachados imediatamente e nunca enfileirados, porque uma chamada de ferramenta está bloqueando e a resposta deve alcançar o manipulador `onConfirm` subjacente sem esperar por qualquer `submit` anterior.
- Qualquer lado que aprovar uma ferramenta primeiro vence; a resposta tardia do outro lado é descartada sem danos.
- Linhas que falham ao serem interpretadas como JSON são registradas e ignoradas — elas não param o observador.

## Notas sobre latência

O arquivo de entrada é observado com `fs.watchFile` em um intervalo de polling de 500 ms, portanto a latência de ida e volta no pior caso para um `submit` remoto é de cerca de meio segundo. Isso é intencional: polling é portável entre plataformas e sistemas de arquivos (incluindo macOS / montagens de rede) e corresponde ao ritmo típico de humano-no-loop que o recurso visa. O canal de saída não tem polling — os eventos são escritos sincronamente à medida que a TUI os emite.

## Modos de falha

- **Bad fd.** Se o fd passado para `--json-fd` não estiver aberto ou for um de 0/1/2, a TUI imprime um aviso em `stderr` e continua sem a saída dupla ativada.
- **Bad path.** Se o arquivo passado para `--json-file` não puder ser aberto, a TUI imprime um aviso e continua sem saída dupla.
- **Desconexão do consumidor.** Se o leitor do outro lado do canal desaparecer (`EPIPE`), a ponte se desativa silenciosamente e a TUI continua executando. Sem nova tentativa.
- **Estouro do buffer FIFO.** Ao escrever em um FIFO sem leitor anexado, os eventos são armazenados em buffer no *pipe* do kernel (~64 KB no Linux) e no WriteStream do Node.js. Quando o *pipe* está cheio ou o buffer interno excede 1 MB, a ponte se desativa e fecha o fd. Nenhum `session_end` é emitido neste caso — os consumidores devem tratar um stream fechado sem `session_end` como uma terminação anormal. A TUI continua executando normalmente.
- **Exceção do adaptador.** Qualquer exceção lançada durante a emissão de um evento é capturada, registrada e desativa a ponte. A TUI nunca é quebrada por uma falha de saída dupla.

## Exemplo de *spawn*

Um processo pai típico de incorporação inicia o Qwen Code com ambos os canais:

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

A TUI ainda possui o terminal do usuário no stdio 0/1/2, enquanto o incorporador lê eventos estruturados no arquivo que sustenta o fd 3 e envia comandos anexando linhas JSONL a `/tmp/qwen-input.jsonl`.

## Configuração baseada em configurações

Para incorporadores de longa duração, muitas vezes é inconveniente passar flags CLI em cada inicialização. Os mesmos canais podem ser configurados em `settings.json` sob a chave de nível superior `dualOutput`:

```jsonc
// ~/.qwen/settings.json  (nível de usuário)
// ou <workspace>/.qwen/settings.json  (nível de workspace)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Regras de precedência:

- A flag CLI **vence** sobre as configurações. Passar `--json-file /foo` na linha de comando sobrescreve `dualOutput.jsonFile` nas configurações.
- `--json-fd` não tem equivalente em configurações — a passagem de fd é uma questão de momento de *spawn* que não pode ser declarada estaticamente.
- Se nem a flag nem a configuração estiverem presentes, a saída dupla permanece desativada (idêntico ao padrão atual).

A flag `requiresRestart: true` significa que as alterações só entram em vigor na próxima inicialização do Qwen Code, já que a ponte é construída uma vez durante a inicialização.

## Demonstrações executáveis

Cada script abaixo está pronto para copiar e colar. Comece com POC 1 para verificar se a build tem saída dupla; POC 4 é o análogo mais próximo de uma integração real com extensão de IDE.

### POC 1 — observe o stream de eventos

Veja todos os eventos estruturados que a TUI emite enquanto um humano a usa normalmente:

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...então converse normalmente; o terminal A mostra session_start,
# o ciclo de vida user/assistant/result/control_request em tempo real.
```

Primeira linha esperada no terminal A:

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — injete *prompts* de fora

Controle a TUI a partir de um segundo terminal sem tocar no teclado do primeiro:

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — a TUI responde como se você tivesse digitado
echo '{"type":"submit","text":"liste os arquivos no diretório atual"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — ponte remota de permissão de ferramenta

Aprove ou negue chamadas de ferramenta a partir de um processo separado:

```bash
# Terminal A — observe control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Peça ao Qwen para fazer algo que precise de aprovação, por exemplo
# "execute `ls -la /tmp`". Um control_request aparecerá no terminal A.
# Copie o request_id, então em um terceiro terminal:
echo '{"type":"confirmation_response","request_id":"<cole-o-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# O prompt de confirmação da TUI é dispensado e a ferramenta é executada.
```

Se você responder com um `request_id` desconhecido, a ponte emite um `control_response` com `subtype: "error"` no canal de saída para que seu consumidor possa registrá-lo ou tentar novamente:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "request_id desconhecido (já resolvido, cancelado ou nunca emitido)"
  }
}
```

### POC 4 — incorporador Node (tipo IDE)

A forma mais realista: um processo pai inicia o Qwen Code, monitora eventos e injeta *prompts* em sua própria programação.

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

// Monitora o canal de saída. Em produção você usaria um
// tail com deslocamento de bytes adequado; este aqui re-streams de 0 por brevidade.
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
    // Detecta recurso antes de usar uma capacidade
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] plano de controle de permissão disponível');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] rodada do assistente encerrada, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] sessão encerrada limpa');
  }
});

// Após 2s, injeta um prompt como se o usuário o tivesse digitado
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'olá do incorporador' }) + '\n',
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

### POC 5 — handshake de capacidade e detecção de recursos

Versões antigas do Qwen Code não emitirão `protocol_version`. Trate o campo
como opcional e faça a detecção do recurso:

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

### POC 6 — session_end como sinal de encerramento limpo

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

Se o TUI falhar antes de `session_end`, o fluxo de saída será fechado
(`EPIPE` na próxima escrita); os embedders devem tratar ambos os caminhos.

### POC 7 — testes de falha (provar que os flags nunca quebram o TUI)

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

## Relação com Claude Code

Claude Code expõe um formato de evento stream-json semelhante via
`--print --output-format stream-json`, mas apenas no modo não interativo
— ele não tem equivalente para executar o TUI e um canal sidecar
estruturado simultaneamente. O Dual Output preenche essa lacuna.