# Modo daemon (`qwen serve`)

Execute o Qwen Code como um daemon HTTP local para que múltiplos clientes (plugins de IDE, UIs web, scripts de CI, CLIs personalizadas) compartilhem uma única sessão de agente via HTTP + Server-Sent Events, em vez de cada um gerar seu próprio subprocesso.

> **🚧 v0.16-alpha**: o `qwen serve` chega pela primeira vez ao npm na v0.16-alpha como **chat / codificação apenas de texto** com **deploy apenas local**. Anexos de imagem / arquivo no caminho do prompt, deploy em contêiner (Docker / k8s / nginx reverse-proxy) e hardening remoto / multi-daemon chegarão em um patch de acompanhamento quando um piloto empresarial for confirmado. Consulte [limites conhecidos da v0.16-alpha](#v016-alpha-known-limits) para a lista completa de itens adiados.

> **Status:** Estágio 1 (experimental). A superfície do protocolo está travada na tabela de rotas §04 da issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803). O Estágio 1.5 (flag `qwen --serve` — o TUI hospeda o mesmo servidor HTTP) e o Estágio 2 (refatoração in-process + polimento de `mDNS`/OpenAPI/WebSocket/Prometheus) estão imediatamente na sequência.
>
> **Transparência de escopo:** O Estágio 1 é dimensionado para **desenvolvedores criando protótipos de clientes contra a superfície do protocolo** e para **colaboração local de usuário único / equipes pequenas**. Cargas de trabalho de nível de produção com múltiplos clientes / longa duração / rede instável (companheiros móveis, bots de IM atingindo 1000+ chats) precisam das garantias do Estágio 1.5+ que não estão nesta release. Consulte [Garantias de runtime do Estágio 1.5+](#stage-15-runtime-guarantees) para a lista completa de lacunas e a #3803 para o roadmap de convergência.

## O que ele oferece

- **UI Web Shell integrada** — `qwen serve` serve o Web Shell baseado em navegador em sua raiz (`http://127.0.0.1:4170/`) pronto para uso; execute `qwen serve --open` para abri-lo automaticamente no seu navegador. Ele é servido na mesma origem da API, então não é necessária uma segunda porta ou reverse proxy. Passe `--no-web` para um daemon apenas de API.
- **Até um filho ACP primário mais um filho sob demanda por secundário confiável, muitos clientes** — a produção tenta pré-aquecer a bridge primária e tenta novamente no primeiro uso após falha; runtimes secundários confiáveis iniciam seu próprio filho sob demanda, enquanto secundários não confiáveis nunca iniciam um. Sob o padrão `sessionScope: 'single'`, clientes direcionados ao mesmo workspace compartilham uma sessão ACP e colaboram na mesma conversa, nos mesmos diffs de arquivo e nos mesmos prompts de permissão.
- **Streaming seguro para reconexão** — SSE com reconexão `Last-Event-ID` permite que um cliente caia e retome exatamente de onde parou (dentro da janela de replay do ring).
- **Transcrições paginadas persistidas** — `GET /session/:id/transcript` retorna a transcrição ativa completa em disco como páginas de replay sem anexar um cliente ou alterar a janela de replay SSE ao vivo.
- **Permissões para o primeiro a responder** — quando o agente pede permissão para executar uma ferramenta, todos os clientes conectados veem a solicitação; qualquer cliente que responder primeiro vence.
- **Um daemon, um ou mais workspaces** — repita `--workspace` para registrar runtimes de workspace isolados sob um listener. O primeiro workspace é o primário e permanece o padrão para requisições que omitem `cwd`.
- **Canais experimentais gerenciados pelo daemon** — inicie com `qwen serve --channel <name>`, ou inicie sem um canal e selecione um depois com `qwen channel set`. Os workers são processos separados pertencentes ao ciclo de vida do daemon. A seleção pode ser consultada, substituída, recarregada e parada sem reiniciar o daemon.
- **Controle remoto de runtime** — altere o modo de aprovação de uma sessão (`POST /session/:id/approval-mode`), alterne uma ferramenta (`POST /workspace/tools/:name/enable`) ou skill carregado (`POST /workspace/skills/:name/enable`) por workspace, crie um `QWEN.md` vazio (`POST /workspace/init`, apenas mecânico — NÃO chama o modelo; para preenchimento por IA, faça um follow-up com `POST /session/:id/prompt`), reinicie um único servidor MCP com uma verificação prévia de budget (`POST /workspace/mcp/:server/restart`), ou adicione/remova servidores MCP em runtime sem reiniciar o daemon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Tudo com strict-gate — configure `--token` primeiro.
- **Resumo da sessão** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) follow-up) — busque um resumo de uma frase de "onde eu parei" de uma sessão ativa (`POST /session/:id/recap`). Envolve o `generateSessionRecap` do core como uma side-query contra o modelo rápido; não polui nem o histórico principal do chat nem o stream SSE. Non-strict gate (mesma postura que `/prompt`); helper do SDK `client.recapSession(sessionId)`.
  - **Limite conhecido — amplificação de custo de tokens:** a rota é um endpoint de custo puro (cada chamada é uma side-query de LLM, sem benefício de estado) e o daemon não tem rate limit por rota na v1. Em um loopback padrão sem token, um cliente local com bug ou malicioso pode fazer spam para queimar tokens. Configure `--token` (e opcionalmente `--require-auth`) em hosts de dev compartilhados antes de expor o daemon.
  - **Segurança de resumo concorrente:** duas chamadas `/recap` simultâneas na mesma sessão executam duas side-queries independentes. `generateSessionRecap` lê um snapshot do histórico do chat via `GeminiClient.getChat().getHistory()` e o alimenta para uma chamada separada de `BaseLlmClient.generateText` (via `runSideQuery`); ele nunca anexa ou muta o `GeminiChat` da sessão. Seguro para chamar de múltiplos clientes sem coordenação.

## Limites conhecidos da v0.16-alpha

A primeira release no npm do `qwen serve` (v0.16-alpha) é intencionalmente restrita — chat / codificação apenas de texto para desenvolvedores executando o daemon em sua própria máquina. A lista abaixo torna a superfície adiada explícita para que os adotantes possam planejar em torno dela; tudo aqui está no roadmap de patch da v0.16.x ou em uma release de follow-up de curto prazo.

**Superfície do produto — apenas texto:**

- ✅ Prompts de texto e respostas de texto (chat, codificação, chamadas de ferramenta, integração MCP)
- ❌ **Anexos de imagem / arquivo no caminho do prompt** — o `MessageEmitter` atualmente renderiza apenas texto; o echo multimodal chega quando um target alpha com necessidades de imagem for confirmado (#4175 chiga0 #27 item P0)
- ❌ **Uploads em streaming** — mesmo gate do multimodal

**Superfície de deploy — apenas local:**

- ✅ Loopback (`127.0.0.1`, padrão) — sem auth necessária, adequado para workstations de dev
- ✅ Inicialização local via `systemd` / `launchd` / `nohup &` / `tmux` — veja [Modelos de inicialização local](./qwen-serve-deploy-local.md)
- ✅ Traga seu próprio bearer token via variável de ambiente `QWEN_SERVER_TOKEN` ([Autenticação](#authentication) para configuração)
- ❌ **Deploy em contêiner** — Docker / Compose / Kubernetes / nginx reverse-proxy com terminação TLS NÃO estão na v0.16-alpha. Adiado para a v0.16.x assim que um piloto empresarial for confirmado (caso contrário, apodreceria por falta de validação).
- ❌ **Coordenação multi-daemon em um host** — um daemon pode hospedar vários workspaces explicitamente registrados, mas daemons não coordenam entre si. Federação cross-host, token keying de caminho de instância e limpeza de tokens obsoletos são adiados para a v0.16.x.
- ✅ **Revocable Local Control pairing tokens** — `--local-control` gera um pairing token separado de LAN pertencente ao daemon. O armazenamento geral de tokens do daemon continua sendo BYO-token.

**Hardening — mínimo viável para usuário único local:**

- ✅ Gate de segurança no boot (recusa bind não-loopback sem um token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Gate de auth para rotas de mutação, roteamento de permissão com escopo de sessão (PRs da Wave 4)
- ✅ Guardrails de MCP + coordenação de permissão multi-cliente (F2 / F3)
- ✅ **Deadline absoluto do prompt + idle timeout do writer SSE** — opt-in via `--prompt-deadline-ms` e `--writer-idle-timeout-ms`; anunciado através de `prompt_absolute_deadline` e `writer_idle_timeout` quando habilitado.
- ✅ **Rate limiting HTTP** — opt-in via `--rate-limit` e thresholds por tier; anunciado através de `rate_limit` quando habilitado.
- ⏸️ **Métricas Prometheus + load test harness** — adiado para a instrumentação de escala F4 Phase-1 da v0.17 quando 30-50 sessões ativas se tornar um target real.
- ⏸️ **Flag CLI `--max-body-size`** — o daemon impõe `express.json({ limit: '10mb' })` por padrão, o que cobre confortavelmente prompts apenas de texto (as janelas de contexto do modelo estão bem abaixo de 10 MiB de caracteres). Ajustável via flag na v0.16.x.

Para a enumeração mais profunda do "o que não vamos corrigir no Estágio 1" (modelo de mutação de estado de sessão single-host + N sessões paralelas compartilhando um filho ACP `qwen --acp` dentro de cada runtime de workspace), consulte [Limites de escopo do Estágio 1](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) abaixo.

## Quickstart

### 1. Inicie o daemon (loopback, sem auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

O bind padrão é `127.0.0.1:4170`. A auth Bearer está **desligada** no loopback para que o desenvolvimento local "simplesmente funcione". O daemon registra o diretório de trabalho atual como seu workspace primário; use um `--workspace /path/to/dir` absoluto para sobrescrevê-lo, e repita a flag para registrar runtimes isolados adicionais.

**Abra a UI Web Shell.** Navegue até `http://127.0.0.1:4170/` (ou inicie o daemon com `qwen serve --open` para abri-lo automaticamente) para o terminal completo no navegador — chat, diffs, histórico de commits, chamadas de ferramenta e prompts de permissão. A UI é servida na raiz do daemon na mesma origem da API. O restante deste guia usa HTTP cru para que você possa criar scripts diretamente para a API.

### 2. Faça um sanity-check

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

O campo `workspaceCwd` expõe o workspace de compatibilidade primário para que os clientes possam omitir intencionalmente `cwd` em `POST /session`. Clientes atuais devem selecionar uma entrada confiável de `workspaces[]` e enviar o `cwd` dessa entrada ao direcionar um runtime explicitamente.
O campo `limits.maxPendingPromptsPerSession` anuncia o limite ativo de admissão de prompts por sessão; `null` significa que o limite está desativado. `limits.maxTotalSessions` anuncia o limite opcional de sessões novas em todo o daemon; `null` significa ilimitado.

### Execute canais a partir do daemon

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under daemon-owned workspace workers
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all

# Or start a token-protected daemon with no channel worker
QWEN_SERVER_TOKEN=secret qwen serve

# Enable or replace its runtime selection later
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# Inspect or stop daemon-managed channels
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

Este modo é experimental e gerenciado pelo daemon. Ele não substitui o comando standalone `qwen channel start`: sem `--daemon-url`, o comportamento existente de `qwen channel start`, `stop` e `status` permanece standalone. Com `qwen serve --channel`, o daemon reserva o lease do serviço de canal antes de ouvir e falha a inicialização se o worker inicial não puder ficar pronto. Sem `--channel`, ele não carrega nenhum runtime de canal e não reserva lease de serviço de canal até o primeiro PUT de runtime. Se um worker pronto posteriormente crashar, o daemon continua rodando, o relança sob uma política de restart limitada e relata seu estado (incluindo avisos `channel_worker_exited`) em `GET /daemon/status`.

O controle de runtime é exposto como `GET`, `PUT` e `DELETE /workspace/channel`; os helpers do SDK são `getChannelWorkerControl()`, `setChannelWorkerSelection()` e `stopChannelWorker()`. PUT/DELETE/reload usam o gate de mutação estrito, então o daemon deve ter um bearer token configurado. As seleções de runtime são deliberadamente efêmeras: PUT não edita as configurações nem as opções de boot, e um restart retorna à seleção `qwen serve --channel` (ou desativado quando essa flag é omitida). Seleções nomeadas são aparadas e deduplicadas na ordem de primeira ocorrência; a ordem é preservada porque o primeiro canal pode afetar a seleção compartilhada de modelo.

O daemon lê as configurações de cada canal (tokens, `proxy`, `model` por canal) quando seu worker inicia. Para reler as configurações sem alterar a seleção confirmada, chame `POST /workspace/channel/reload` (SDK `client.reloadChannelWorker()`, ou `qwen channel reload`). O reload re-resolve a propriedade do workspace e reinicia os workers selecionados através do mesmo caminho de reconcile seguro contra rollback. A capability `channel_control` está presente sempre que o controle de runtime está conectado; `channel_reload` está presente apenas enquanto o gerenciador está habilitado. Threads persistidas são restauradas do disco.

O `cwd` de cada canal selecionado deve resolver para um workspace registrado, e os canais são agrupados por esse workspace proprietário: um daemon de workspace único executa um worker (sem alterações); um daemon multi-workspace (`--workspace` repetido) executa um worker por workspace que possui um canal selecionado, cada um vinculado ao cwd, `QWEN_DAEMON_WORKSPACE` e overlay de env daquele workspace. Para hospedar um canal em um workspace não primário, defina-o no próprio `.qwen/settings.json` daquele workspace (sem `cwd` necessário) ou defina um `cwd` explícito igual ao caminho do workspace; um canal definido apenas no escopo de usuário/sistema sem `cwd` é ambíguo entre workspaces e causa um erro de boot. `--channel all` permanece apenas do primário (hospeda os canais do workspace primário) e não pode ser combinado com canais nomeados.

Substituir uma seleção faz preflight de configuração, propriedade e confiança antes de parar qualquer coisa. Mantém workers de workspace cuja seleção ordenada não mudou. Se um worker alterado não puder iniciar, o daemon para os novos workers e restaura a seleção antiga. Se o daemon não puder confirmar que um filho antigo saiu mesmo após SIGKILL, ele mantém o lease do PID e se recusa a criar um worker duplicado. Um worker ainda é considerado pronto quando pelo menos um adapter solicitado conecta; PUT então retorna `partial: true`, e `/daemon/status` relata `channel_worker_partial_connect` para os adapters ausentes.

Quando um adapter rejeita `connect()`, snapshots do worker atual podem incluir entradas `startupFailures` com o canal, `phase: "connect"`, um código opcional de adapter e uma mensagem com credenciais removidas. `qwen channel set`, `qwen channel reload` e `qwen channel status --daemon-url …` remotos imprimem essas razões. Se todo adapter falhar durante um set ou reload dinâmico, o comando recebe `502 channel_worker_start_failed`; as razões da resposta descrevem essa tentativa e seu `state` descreve o resultado após o rollback. A tentativa com falha não é retida por solicitações de status posteriores. No máximo 64 razões são retidas por inicialização de worker, e os códigos de adapter devem ser tratados como diagnósticos em vez de categorias estáveis. A inicialização inicial `qwen serve --channel …` ainda sai quando nenhum adapter conecta.

O daemon também expõe snapshots de runtime somente leitura para UIs de clientes e
operadores: `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /workspace/:id/session-info`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`, e
`GET /session/:id/tasks`, `GET /session/:id/lsp`, e
`GET /session/:id/transcript`.

`GET /workspace/:id/session-info` (e o gêmeo plural
`GET /workspaces/:workspace/session-info`) retorna contagens agregadas de sessões
para um workspace: `active` / `archived` / `total` persistidas, mais a contagem
`live` atual em memória quando o estado ao vivo está disponível. Workspaces secundários
não confiáveis registrados omitem `live` porque suas leituras de catálogo não
consultam a bridge ao vivo. A lista paginada `GET /workspace/:id/sessions`
não inclui um total, então esta é a superfície dedicada para "quantas sessões
existem?" — útil quando tarefas agendadas ou recorrentes deixam um armazenamento local grande.

> ⚠️ **Disk scan — não faça poll.** Este endpoint percorre arquivos JSONL de sessão
> locais sob o diretório de chats do workspace. As respostas sempre incluem
> `expensive: true` e `cost: "disk_scan"`. Chame-o com pouca frequência (refresh
> manual, ferramentas de operador, carga ocasional de UI) — nunca em um timer
> apertado ou em cada render da sidebar. Prefira `GET /workspace/:id/sessions`
> para navegar páginas e `GET /daemon/status` para contagens de sessão ao vivo
> em memória. Uma resposta com `truncated: true` significa que o scan atingiu
> seu limite de segurança ou não pôde classificar todo arquivo candidato, então
> as contagens persistidas são limites inferiores.

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` retorna o resumo ao vivo da bridge para uma única sessão:
`sessionId`, `workspaceCwd`, `createdAt`, `displayName` opcional, `clientCount`,
e `hasActivePrompt`. Ele responde `200` com o resumo quando o daemon mantém uma
sessão ativa com esse id, e `404` (corpo `{ "error": …, "sessionId": … }`)
caso contrário. Use-o para fazer poll se uma sessão conhecida ainda está rodando
(`hasActivePrompt`) ou quantos clientes estão conectados (`clientCount`) sem
buscar e escanear toda a lista de sessões paginada:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Esta é a visão crua da sessão ativa, então `clientCount` e `hasActivePrompt` correspondem
à entrada correspondente em `GET /workspace/:id/sessions` — mas as duas rotas
não são byte-identical. O endpoint de lista enriquece cada item com dados persistidos
do session-store: seu `createdAt` é o tempo do primeiro prompt persistido, e ele
adiciona `updatedAt` mais um `displayName` derivado do título armazenado ou do primeiro
prompt. `/status`, em vez disso, relata o próprio `createdAt` da sessão ativa, omite
`updatedAt` e retorna `displayName` apenas quando um é definido na sessão ativa.

`GET /session/:id/lsp` retorna o status estruturado de LSP por sessão. Inicie o
daemon com `--experimental-lsp` para habilitar o LSP nas sessões de agente geradas;
caso contrário, a rota retorna `enabled: false` sem servidores.

`GET /daemon/status` é o snapshot consolidado de troubleshooting. O padrão
`detail=summary` lê apenas o estado do daemon em memória (sessões, permissões,
contagens de transporte SSE/ACP, rejeições de rate limit, memória do processo, limites resolvidos)
e não inicia o filho ACP. Use `GET /daemon/status?detail=full` para
diagnósticos por sessão, detalhes de conexão ACP, contagens de auth device-flow e
seções de status do workspace quando você estiver investigando ativamente um problema.

`GET /workspace/mcp`, `GET /workspace/skills` e `GET /workspace/providers`
relatam o runtime ACP ativo e não iniciam o filho ACP quando ocioso; um
daemon ocioso retorna `initialized: false` com um snapshot vazio. Uma vez que uma
sessão está viva eles mudam para `initialized: true` e expõem o estado
real.

Para espelhar o painel `/skills` da CLI remotamente, chame `POST /workspace/skills/:name/enable` com `{ "enabled": true | false }` após verificar a capability `workspace_skill_toggle`. Para alterar várias Skills, verifique `workspace_skill_batch_toggle` e chame `POST /workspace/skills/enable` com `{ "skillNames": ["review", "deploy"], "enabled": false }`; sua resposta separa `results` bem-sucedidos de `errors` por target, persiste targets válidos juntos e atualiza as sessões ACP ativas uma vez. As rotas atualizam `skills.disabled` e `skills.enabled` do workspace conforme necessário e rejeitam targets desconhecidos, ocultos, de extensão inativa, travados por escopo superior e não confiáveis. Habilitar um skill `skills.defaultDisabled` escreve um opt-in canônico em `skills.enabled`; uma entrada `skills.disabled` rígida herdada de um escopo superior ainda não pode ser sobrescrita. Células de status de skill expõem `disabledReason` (`hard`, `default` ou `inactive_extension`) e um `lockedScope` opcional. Uma resposta `deferred` significa que a configuração foi salva enquanto nenhum filho ACP estava rodando; ela será aplicada quando o filho iniciar. `skills.disabled` desabilita tanto o uso manual quanto do modelo, ao contrário de `disable-model-invocation: true`, que mantém a invocação direta via `/skill-name` disponível.

`GET /workspace/env` e `GET /workspace/preflight` sempre respondem com
`initialized: true` independentemente do estado do ACP. `env` nunca consulta o ACP
(apenas informações do processo do daemon); `preflight` responde células de nível de daemon a partir de
`process.*` e emite placeholders `status: 'not_started'` para células de nível de ACP
quando o filho está ocioso.

`GET /workspace/env` relata o runtime, plataforma, sandbox,
proxy e a **presença** (nunca o valor) de variáveis de ambiente secretas na whitelist
tais como `OPENAI_API_KEY` do processo do daemon. URLs de proxy são despojadas de credenciais e reduzidas
para `host:port` antes de irem para a rede. A rota sempre responde diretamente do
processo do daemon e nunca gera um filho ACP.

`GET /workspace/preflight` retorna uma lista de verificações de prontidão. **Células de nível de daemon**
(versão do Node, entrada CLI, diretório do workspace, ripgrep, git, npm)
sempre renderizam. **Células de nível de ACP** (auth, descoberta de MCP, skills, providers,
registro de ferramentas, egress) requerem um filho ACP ativo — quando o daemon está ocioso
elas emitem placeholders `status: 'not_started'` em vez de gerar o ACP apenas
para preenchê-las. Falhas mapeiam para um enum `errorKind` fechado (`missing_binary`,
`auth_env_error`, `init_timeout`, `restore_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`) para que as UIs dos clientes possam renderizar remediações
estruturadas.

O daemon também expõe helpers de arquivo de workspace:

- `GET /file` lê arquivos de texto. Respostas de snapshot completo retornam um hash
  raw-byte `sha256:<hex>`; janelas de linhas finitas de arquivos acima de 256 KiB omitem-no.
- `GET /file/bytes` lê janelas de bytes crus limitados e retorna conteúdo em base64.
- `POST /file/write` cria ou substitui arquivos de texto.
- `POST /file/edit` aplica uma substituição de texto exata.

Write/edit são **rotas de mutação strict**: mesmo no loopback elas exigem um
bearer token configurado, caso contrário retornam `token_required`. Substituições
e edições exigem o `expectedHash` mais recente de um `GET /file` de snapshot completo
(ou um `GET /file/bytes` de janela completa). Uma janela parcial de arquivo grande não pode
ser usada como token de concorrência otimista. `create` nunca sobrescreve. Writes explícitos para caminhos ignorados
são permitidos, mas auditados. Writes binários, delete/move/mkdir e criação recursiva de pais
não fazem parte desta superfície.

### 3. Abra uma sessão

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` pode ser omitido — a rota faz fallback para o workspace primário do daemon. Postar um `cwd` que não canoniza para nenhum workspace registrado retorna `400 workspace_mismatch`.

Um segundo cliente postando em `/session` para o mesmo runtime de workspace resolvido recebe `"attached": true` sob o padrão `sessionScope: 'single'` — agora eles estão compartilhando a sessão de agente daquele runtime. Omitir `cwd` resolve para o primário; selecionar outro workspace registrado cria ou anexa à sessão padrão separada daquele runtime.

### 4. Inscreva-se no stream de eventos (em outro terminal primeiro)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

A linha `data:` é o **envelope de evento completo** — `{id?, v, type, data, originatorClientId?}` — JSON-stringified em uma única linha. O payload ACP (o bloco `sessionUpdate` neste exemplo) fica sob `data` dentro desse envelope. As linhas `id:` / `event:` de nível SSE são conveniência para clientes EventSource; os mesmos valores aparecem dentro do envelope JSON para que consumidores raw-`fetch` também os recebam.

Abra isso **antes** de enviar o prompt — o buffer de replay SSE mantém os
últimos 8000 eventos para que um assinante atrasado possa alcançar via `Last-Event-ID`,
mas para o caso simples de "observar um único prompt" é mais fácil se inscrever
primeiro e deixar fazer o stream ao vivo.

O stream emite `session_update` (chunks do LLM, chamadas de ferramenta, uso),
`permission_request` (ferramenta precisa de aprovação), `permission_resolved`
(alguém votou), `model_switched`, `model_switch_failed` e os frames
terminais `session_died` (filho do agente crashou — SSE então fecha) e
`client_evicted` (sua fila transbordou — SSE então fecha).

### 5. Envie um prompt (de volta no terminal original)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

O `curl -N` do passo 4 imprimirá os frames à medida que chegarem.

### Optional Todo Stop Guard

Clientes daemon de longa duração podem optar por uma continuação limitada quando a
cadeia de trabalho atual escreve com sucesso uma lista Todo de nível superior e então
para com itens ainda pendentes ou em progresso. Adicione isso ao `settings.json` e
reinicie o daemon:

```json
{
  "experimental": {
    "todoStopGuard": true
  }
}
```

O guarda adiciona no máximo duas chamadas consecutivas do modelo primário sem nova entrada
do usuário. Uma mensagem de usuário mid-turn é executada primeiro, e
retry/continue e resultados de background relacionados retêm o budget do estágio atual.
Cada chamada e o estado final de exaustão aparecem como eventos `session_update`
reproduzíveis com `_meta.source: "todo_stop_guard"`; os metadados incluem a tentativa
e a contagem de inacabados, mas nunca o texto do Todo. Um prompt completo na fila
também é executado primeiro, e as regras existentes de permissão/cancelamento permanecem
inalteradas.

Enquanto uma cadeia armada aguarda trabalho de background relacionado, fires de cron/loop
não relacionados e notificações de tarefas antigas são diferidas. Trabalho recorrente é limitado e
coalescido por tarefa até a cadeia produzir resultado.

A opção tem padrão `false`, requer reinicialização e é forçada como desligada no modo seguro,
modo bare e modo `plan` de Approval. É apenas em memória: carregar o estado
de Todo do disco ou reiniciar o daemon não a arma. Um novo prompt ordinário
deve executar com sucesso seu próprio `todo_write` de nível superior; retry/continue e
reanexação de cliente ao vivo mantêm a cadeia de trabalho atual em memória. Mudar com
sucesso o diretório de trabalho da sessão a limpa para que um Todo antigo não possa
retomar em um novo workspace.

## Autenticação

Para qualquer coisa além do loopback, você **deve** passar um bearer token:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

Os clientes então enviam `Authorization: Bearer $QWEN_SERVER_TOKEN` em cada requisição. `/health` é isento **apenas em binds de loopback** para que as sondas de liveness do k8s/Compose dentro do pod (onde o daemon escuta em `127.0.0.1`) não precisem de credenciais. Em binds não-loopback (`--hostname 0.0.0.0` etc.) `/health` exige o token como qualquer outra rota — caso contrário, um atacante pode sondar endereços arbitrários para confirmar a existência do daemon. Use `/capabilities` para verificar se seu token está correto de ponta a ponta (ele sempre exige auth):

> **Loopback com hardening (`--require-auth`).** O comportamento padrão de loopback sem token é adequado para um laptop de usuário único, mas inseguro em hosts de dev compartilhados, runners de CI ou workstations multi-tenant onde qualquer usuário local pode dar `curl 127.0.0.1:4170`. Passe `--require-auth` para tornar o bearer token obrigatório em todas as rotas — incluindo `/health` e `/capabilities` — mesmo quando vinculado a `127.0.0.1`. O boot falha sem um token. Com a flag ativada, um cliente **não autenticado** não pode ler `/capabilities` para descobrir que a auth é exigida; a superfície de descoberta é o próprio corpo da resposta 401. Uma vez autenticado, a tag `caps.features.require_auth` é uma confirmação pós-auth de que o deploy está com hardening (útil para UIs de auditoria / compliance):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

A comparação do token é constant-time (SHA-256 + `crypto.timingSafeEqual`); as respostas 401 são uniformes entre "header ausente", "scheme errado" e "token errado" para que um side-channel não possa distinguir.

## HTTPS / TLS (para acesso móvel / cross-device)

Por padrão, o daemon serve HTTP puro. Isso é fine no `localhost`, mas um celular ou tablet atingindo um IP de LAN (`https://192.168.x.x:4170`) **não** é um [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) sobre `http://` — então os navegadores bloqueiam `getUserMedia` (entrada de voz), WebRTC e outras APIs apenas de secure context. Passe `--tls-cert` + `--tls-key` para servir o Web Shell sobre HTTPS e desbloqueá-los:
```bash
# 1. Instale uma CA local e confie nela (uma única vez). O dispositivo móvel também
#    deve confiar nesta CA — o mkcert imprime onde o certificado raiz está.
mkcert -install

# 2. Gere um certificado para o IP LAN da sua máquina. Adicione localhost / 127.0.0.1
#    aos SANs também: com `--open`, o daemon reescreve a URL do navegador para
#    127.0.0.1, então um certificado restrito apenas ao IP LAN seria rejeitado com
#    ERR_CERT_COMMON_NAME_INVALID. (O mkcert nomeia a saída com base em todos os hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Inicie o daemon via HTTPS. Bindings fora do loopback ainda exigem um token,
#    e o Origin do navegador deve ser permitido via CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve escutando em https://0.0.0.0:4170
```

Notas:

- **Ambas as flags ou nenhuma** — a inicialização falha se apenas uma for fornecida (um certificado sem chave não consegue iniciar um listener HTTPS).
- **TLS é ortogonal à autenticação** — o HTTPS criptografa o transporte; o bearer token ainda controla o acesso a todas as rotas da API. Bindings fora do loopback exigem um token com ou sem TLS.
- **O escopo é apenas a terminação TLS** — sem geração automática, sem ACME / Let's Encrypt. Esta é uma conveniência para LAN / desenvolvimento; para implantações voltadas para a internet, termine o TLS em um reverse proxy (veja o modelo de ameaças abaixo).

## Flags da CLI

| Flag                                    | Padrão          | Propósito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | Porta TCP. `0` = porta efêmera atribuída pelo SO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--hostname <addr>`                     | `127.0.0.1`     | Interface de bind. Qualquer coisa além do loopback exige um token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--local-control`                       | `false`         | Compartilha o Web Shell em uma interface IPv4 privada selecionada com um pairing token revogável pertencente ao daemon, QR code no terminal, origin exato do navegador e inibição de suspensão de melhor esforço. Compõe com `--token`, `--allow-origin` e `--port 0`; conflita com `--no-web` e `--hostname` não padrão. Use `--local-control-address` quando houver múltiplos candidatos LAN disponíveis, e adicione `--tls-cert` + `--tls-key` para APIs de navegador de contexto seguro como entrada de voz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--local-control-address <ip>`         | —               | Qual endereço LAN IPv4 compartilhar quando o host tem mais de um candidato. Necessário apenas se `--local-control` reportar uma escolha ambígua. |
| `--token <str>`                         | —               | Bearer token. Faz fallback para a variável de ambiente `QWEN_SERVER_TOKEN` (com espaços em branco no início/fim removidos — útil para `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | Recusa iniciar sem um bearer token, mesmo no loopback. Reforça a segurança do padrão de desenvolvedor `127.0.0.1` para hosts de desenvolvimento compartilhados / runners de CI / workstations multi-tenant, onde qualquer usuário local pode acessar o listener. Inicializa apenas com `--token` ou `QWEN_SERVER_TOKEN` definido; também protege `/health` atrás do bearer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | Caminho para um arquivo de certificado PEM. Serve via **HTTPS** em vez de HTTP. Deve ser pareado com `--tls-key` (a inicialização falha se apenas um for fornecido). Desbloqueia APIs de navegador de contexto seguro — entrada de voz (`getUserMedia`), WebRTC — através de um IP LAN, que os navegadores normalmente bloqueiam em `http://` simples. Apenas terminação TLS; sem geração automática / ACME. Veja [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) abaixo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —               | Caminho para um arquivo de chave privada PEM. Deve ser pareado com `--tls-cert`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `32`            | Limite de sessões ao vivo simultâneas. Novas requisições `POST /session` que gerariam um novo processo filho retornam `503` (com `Retry-After: 5`) quando o limite é atingido; anexos a sessões existentes NÃO são contados. Defina como `0` para desativar. Dimensionado para uso de usuário único / equipes pequenas; aumente se a sua implantação tiver margem de RAM/FD (~30–50 MB por sessão).
| `--max-total-sessions <n>`              | derivado        | Limite opcional não negativo inteiro em todo o daemon para criação de sessões novas em todos os runtimes de workspace registrados. Aplica-se a novas sessões filhas, restauração de sessão e sessões criadas por branch/fork; anexar a uma sessão ao vivo existente não consome um slot. Defina como `0` para ilimitado. Quando omitido com vários workspaces de inicialização/restaurados, o daemon deriva um limite fixo do limite por workspace e da contagem de workspaces de inicialização; o registro dinâmico posterior não o recomputa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | Limite por sessão de prompts aceitos por `POST /session/:id/prompt` mas ainda não resolvidos, incluindo prompts na fila e o prompt ativo. O bridge rejeita o excesso de forma síncrona com `503`, `Retry-After: 5` e `code: "prompt_queue_full"` antes de retornar um `promptId`. Defina como `0` para desativar. `branchSession` serializa na mesma FIFO, mas não conta para este limite de prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | Diretório absoluto de workspace registrado por este daemon. Repita a flag para hospedar múltiplos workspaces em um processo; o primeiro é o primário e permanece o padrão quando uma requisição omite `cwd`. Valores relativos são rejeitados. Requisições de sessão cujo `cwd` canônico não está registrado retornam `400 workspace_mismatch`.
| `--memory-project-scope <mode>`         | `workspace`        | Modo de partição de memória do projeto. `workspace` (padrão) chaveia a memória pelo diretório exato de workspace registrado, então cada workspace do daemon obtém sua própria memória isolada; `git-root` é o modo de compatibilidade legado compartilhado por workspaces resolvidos para a mesma raiz Git. Sobrescreve `QWEN_CODE_MEMORY_PROJECT_SCOPE` quando fornecido; um valor de env em branco é tratado como não definido, enquanto um valor não vazio não reconhecido é ignorado com um aviso único e mantém o comportamento legado `git-root`. O novo padrão não migra a memória de projeto git-root existente — use um escopo `git-root` explícito para ler essas entradas durante a migração.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--channel <name\|all>`                 | —               | Worker de canal gerenciado pelo daemon (experimental). Repita a flag para selecionar múltiplos canais configurados, ou passe `all` para iniciar todos os canais configurados. `all` não pode ser combinado com canais nomeados. Os valores de `cwd` dos canais selecionados devem resolver para um workspace registrado; um daemon multi-workspace executa um worker por workspace proprietário. O worker é propriedade do `qwen serve`; pare o daemon para parar os canais gerenciados pelo serve.
| `--memory-budget-mb <n>`                | 50% do cgroup/host | Orçamento total de memória em MB para toda a árvore de processos do daemon. Quando não definido, derivado como 50% do limite do cgroup ou memória do host; de qualquer forma o valor efetivo é limitado pela memória disponível resolvida, e ambos os valores configurado e efetivo são reportados. Não altera como nenhum filho `qwen --acp` é dimensionado; o único consumidor hoje é o crescimento adaptativo do live-journal: um pool de crescimento em todo o daemon derivado como 5% do orçamento efetivo (limitado a `1024` MB; em hosts que reportam `insufficientMemory` o pool é 0 e o crescimento adaptativo está desabilitado) é compartilhado por toda bridge de workspace — veja `--max-journal-bytes`. Valores resolvidos aparecem sob `limits.memory` em `GET /daemon/status`, junto com contagens de filhos registrados e ao vivo e participações consultivas por filho sob `runtime.memory`. Um host pequeno demais para o mínimo reporta `insufficientMemory` em vez de ser forçado para cima; porque a fração derivada é 50%, qualquer host sob ~2 GB dispara isso. Passe um `--memory-budget-mb 1024` explícito em tal host para sobrescrever o valor derivado (a flag ainda requer pelo menos 1024 MB de memória disponível para limpar o aviso). Deve ser um inteiro em `[1024, 1048576]`. |
| `--memory-pressure-mode <mode>`         | `observe`          | Se o daemon transforma sua própria leitura de memória em um veredito. `observe` (padrão) reporta o nível de pressão sob `runtime.memory.pressure` em `GET /daemon/status` e levanta uma issue `daemon_memory_pressure` — um `warning`, então o `status` geral mantém `ok` — sempre que o nível sai de `normal`. `off` ainda reporta todos os valores, incluindo o nível, mas não levanta nenhuma issue, então o `status` geral não muda; use-o durante calibração ou se você alerta no status de nível superior. O nível é o pior de duas razões: RSS contra memória disponível (o que o OOM killer do cgroup observa) e heap V8 usado contra o teto de heap deste processo. Cobre apenas o processo raiz do daemon; compare com `runtime.memory.children.rssBytes` para os filhos. Nada remedia em nenhum dos modos. Um entre `off`, `observe`. |
| `--child-heap-mode <mode>`              | `observe`          | Se o daemon modela uma partição de heap por filho de `--memory-budget-mb`. `observe` (padrão) reporta o que aplicaria — `limits.memory.childHeap.perChildCeilingMb` e `maxConcurrentChildren` — e conta spawns que teriam excedido o limite. **Nada é aplicado**: nenhum filho é dimensionado pelo orçamento e nenhum spawn é recusado. `off` não modela nada, e diz isso na rede: `maxConcurrentChildren` e `perChildCeilingMb` são ambos `null` em vez de carregar uma partição que você desligou. Uma contagem de recusas de 0 **não** significa que a partição seria segura para aplicar: os filhos ainda rodam no teto muito maior derivado do host, então uma carga de trabalho que precise de mais old space do que o teto modelado parece perfeitamente saudável aqui. A aplicação da partição vem com a medição que pode responder isso. |
| `--max-connections <n>`                 | `256`           | Limite de conexões TCP no nível do listener (`server.maxConnections`). Limita a contagem de sockets brutos independentemente da contagem de sessões — clientes SSE lentos / fantasmas são rejeitados no momento do accept quando o limite é atingido. Aumente junto com `--max-sessions` se a sua implantação esperar muitos assinantes SSE por sessão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | Profundidade do ring de replay SSE por sessão (alvo do #3803 §02). Define o backlog disponível para `GET /session/:id/events` com `Last-Event-ID: N`. Maior = mais margem para reconexão ao custo de algumas centenas de KB de RAM extra por sessão. Clientes SDK também podem solicitar um limite de backlog maior por assinante em uma assinatura específica via `?maxQueued=N` (intervalo `[16, 2048]`, padrão 256). Daemons também emitem um frame SSE não terminal `slow_client_warning` ao atingir 75% de preenchimento da fila, para que os clientes possam drenar / reconectar antes de serem expulsos. Pre-flight `caps.features.slow_client_warning`.
| `--compacted-replay-max-bytes <n>`      | `4194304`       | Limite de bytes por sessão ao vivo para os eventos de replay retidos no snapshot limitado retornado por `POST /session/:id/load`. O limite se aplica a `compactedReplay`; o `liveJournal` atual em voo é limitado separadamente por `--max-journal-events` e `--max-journal-bytes` (limites base que o crescimento adaptativo pode aumentar — veja `--max-journal-bytes`). Valores devem ser inteiros seguros positivos; valores inválidos falham no boot, e o teto rígido é 256 MiB. Quando replay retido mais antigo é descartado, o snapshot começa com `history_truncated`. Isso não limita a transcrição em disco.
| `--max-journal-events <n>`              | `10000`         | Limite base por sessão de entradas de replay retidas no `liveJournal` em voo para o turno atual inacabado. Chunks consecutivos compatíveis de texto ou pensamento compartilham uma entrada, com no máximo 256 eventos de origem por entrada; outras fronteiras de evento são preservadas. Quando excedido, o daemon primeiro tenta crescimento adaptativo (veja `--max-journal-bytes`); se nenhuma margem for concedida ou a concessão não cobrir o excesso, as entradas mais antigas são descartadas e um marcador `history_truncated` é prepended. As contagens `truncatedEvents` e `retainedEvents` do marcador descrevem eventos de origem. Deve ser um inteiro seguro positivo. Fixar esta flag (ou `--max-journal-bytes`) desabilita o crescimento adaptativo.
| `--max-journal-bytes <n>`               | `8388608`       | Limite base por sessão de bytes no `liveJournal` em voo, contabilizado a partir dos eventos de origem serializados mesmo quando chunks compatíveis compartilham uma entrada de replay. Quando um turno ultrapassa o limite, o crescimento adaptativo eleva os limites da sessão em direção ao dobro (até um teto rígido por sessão de 256 MiB, limitado pela margem restante do pool) enquanto o crescimento concedido entre todas as sessões ativas do daemon cabe em um pool de crescimento compartilhado dimensionado em 5% do orçamento de memória efetivo do daemon — o valor de `--memory-budget-mb` quando passado, limitado pela memória disponível resolvida, caso contrário 50% da memória autodetectada (veja `--memory-budget-mb`) — limitado a `1024` MB; em hosts que reportam `insufficientMemory` o pool é 0 e o crescimento adaptativo está desabilitado. O crescimento acontece sob demanda, e apenas até onde o pool permite; quando é recusado, o pool está exaurido, ou uma concessão não cobre o excesso, as entradas mais antigas são descartadas inteiras (pelo menos uma entrada é sempre mantida), então a cauda retida pode ser muito menor que o limite. Fixar esta flag (ou `--max-journal-events`) desabilita o crescimento adaptativo. Deve ser um inteiro seguro positivo. Padrão: 8 MiB.                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`               | —               | Limite inteiro positivo de clientes MCP ativos. Quando `mcp_workspace_pool` é anunciado, o limite e transportes são compartilhados por runtime de workspace; quando a tag está ausente, o gerenciador legado por sessão o aplica. Combine com `--mcp-budget-mode`. Quando não definido, não há aplicação baseada em contabilidade (mas `GET /workspace/mcp` ainda reporta `clientCount`). Distinto do `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code, que controla a concorrência de inicialização, não a contagem total de clientes ao vivo. Pre-flight `caps.features.mcp_guardrails` e `caps.features.mcp_workspace_pool`.
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Como `--mcp-client-budget` é aplicado. `warn` (padrão quando o budget é definido): sem recusa, o `budgets[0].status` do snapshot muda para `warning` em ≥75% do budget. `enforce`: conexões além do limite são recusadas, a célula por servidor mostra `disabledReason: 'budget'`, determinístico pela ordem de declaração de `mcpServers`. `off` (padrão quando o budget não é definido): observabilidade pura. A inicialização rejeita `enforce` sem um budget.
| `--external-tool-guard-mode <m>`        | `off`           | Política de pré-execução externa ACP gerenciada. `off` não faz chamadas de provider e não anuncia capability. `required` falha a inicialização a menos que um provider compatível complete o handshake v1, então falha toda invocação de ferramenta de nível superior suportada de forma fechada a menos que sua única requisição prepare seja permitida.
| `--external-tool-guard-endpoint <url>`  | —               | URL HTTP(S) de loopback only-origin usada no modo `required`, por exemplo `http://127.0.0.1:8787`. Paths, credenciais de URL, redirects, hosts não-loopback e roteamento proxy não são aceitos.
| `--external-tool-guard-timeout-ms <n>`  | `3000`          | Inteiro `100..30000`; aplica-se independentemente ao handshake de inicialização e a cada requisição prepare.
| `--http-bridge`                         | `true`          | Modo Stage 1: a produção tenta pré-aquecer um filho `qwen --acp` primário para compatibilidade e tenta novamente no primeiro uso após falha, enquanto cada secundário confiável pode iniciar um filho sob demanda. Sessões direcionadas a um runtime são multiplexadas no filho via ACP `newSession()`; secundários não confiáveis não podem iniciar ACP. O Stage 2 nativo in-process fica disponível posteriormente.
| `--initialize-timeout-ms <n>`           | `10000`         | Timeout de requisição do filho ACP, incluindo o handshake `initialize` (ms). Deve ser um inteiro positivo até `2147483647`. Valores acima do teto do timer JS (`2^31-1`) são rejeitados no boot porque o Node os comprime silenciosamente para 1 ms. Deploys em contêineres frios que precisam de margem extra para inicialização do filho podem aumentar isso; o mesmo valor rege `newSession`, polls de status de workspace e outros deadlines de ext-method ACP.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--session-restore-timeout-ms <n>`      | `60000`         | Deadline de load/resume de sessão ACP em milissegundos. Deve ser um inteiro positivo até `2147483647`; `0` é inválido. Se omitido, o padrão é 60 segundos, elevado para um `--initialize-timeout-ms` fornecido explicitamente quando esse valor for maior; um timeout de initialize mais curto nunca reduz o orçamento de restore. O SDK e o WebUI adicionam 10 e 15 segundos de margem do cliente. Um timeout retorna `504 session_restore_timeout` recuperável; não implica que o daemon em si saiu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Allowlist cross-origin para clientes webui do navegador. Repetível. Cada valor é `*` (qualquer origin — a inicialização recusa se nenhum bearer token estiver configurado; `--require-auth` no loopback é recomendado para que `/health` também seja protegido por bearer, já que é pré-auth no loopback por padrão; os assets estáticos do Web Shell permanecem pré-auth em todo modo, então passe `--no-web` para removê-los) ou um origin de URL canônico (`<scheme>://<host>[:<port>]`, sem barra final / path / userinfo / query). **Wildcards de subdomínio (`https://*.example.com`) são intencionalmente não suportados** — liste cada subdomínio explicitamente, ou use `*` com um token configurado (e `--require-auth` para endurecimento total). Origins correspondentes recebem headers de resposta CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, methods, headers, max-age e `Retry-After` exposto); origins não correspondentes ainda recebem um 403 com o mesmo envelope da barreira atual. `Origin: null` (iframes em sandbox, docs file://) é sempre rejeitado, mesmo sob `*`. Pre-flight via `caps.features.allow_origin`. Hits de self-origin no loopback não são afetados. |
| `--web` / `--no-web`                    | `true`          | Serve o SPA Web Shell compilado na raiz do daemon (`GET /`, `/assets/*` e navegações de documento `GET /session/<id>`). Esses entry points são registrados **antes** do portão de bearer-auth — um navegador não pode anexar um token a um sub-recurso `<script>` ou a uma navegação na barra de endereços, e o shell não carrega segredos. Toda rota de API permanece protegida por token independentemente, e o fallback de deep-link do SPA para todos os outros caminhos também fica atrás do portão bearer. Em bindings fora do loopback, um aviso de uma linha no stderr nota que a UI é acessível sem autenticação. Use `--no-web` para um daemon apenas de API. Sem efeito quando o build omite os assets do Web Shell (o daemon registra um breadcrumb e executa apenas a API).                                                                                                                                                                                                                                                                                                                                                         |
| `--open`                                | `false`         | Após o listener estar ativo, abre o Web Shell no seu navegador padrão na URL do daemon (com `#token=` anexado como um fragmento de URL quando um token está configurado — um fragmento nunca é enviado ao servidor, mantendo o token fora dos logs de acesso e headers Referer). No-op com `--no-web`, ou em ambientes headless / CI / SSH onde nenhum navegador está disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
> **Dimensionando os controles de carga.** `--max-sessions` é o limite de sessões novas por workspace. `--max-total-sessions`, quando definido, é o limite de sessões novas em todo o daemon.
> Três outras camadas também limitam a carga — ao dimensionar para um deployment de alta concorrência, ajuste-as em conjunto:
>
> - **nível do listener**: `--max-connections` / `server.maxConnections=256` limita as conexões TCP brutas (back-pressure de clientes lentos).
> - **assinantes por sessão**: o EventBus limita os assinantes SSE a 64 por sessão por padrão; o 65º cliente recebe um `stream_error` terminal e é fechado.
> - **admissões de prompt por sessão**: `--max-pending-prompts-per-session=5` limita os prompts na fila + ativos aceitos para uma sessão. O excesso recebe `503` com `Retry-After: 5`.
> - **sessões novas em todo o daemon**: `--max-total-sessions=N` limita a criação de sessões novas em todo o daemon. O excesso recebe o mesmo formato `session_limit_exceeded` com `scope: "total"`.
> - **backlog por assinante**: uma fila de 256 frames por cliente SSE; um cliente acima da capacidade recebe um frame terminal `client_evicted` e é fechado (um consumidor lento não pode travar o daemon).
>
> Esses limites interagem: cada runtime é limitado por `--max-sessions`, enquanto `--max-total-sessions` limita seu agregado. O teto efetivo de sessões é o menor entre qualquer limite finito em todo o daemon e o agregado por runtime (trate esse agregado como ilimitado se o limite por workspace for ilimitado). Se nenhum for finito, não há teto finito de sessões. Um teto finito × 64 assinantes × 256 frames é o pior caso de memória em trânsito na camada do EventBus; multiplicar por `--max-pending-prompts-per-session` limita o trabalho de prompts aceitos na camada de admissão. O dimensionamento padrão assume carga de usuário único / equipe pequena; aumente progressivamente (e monitore o RSS) para deployments maiores.

> **Guardrails do cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Um workspace que declara 30 servidores MCP em `mcpServers` iniciará 30 clientes sem limite upstream, a menos que você defina um. `--mcp-client-budget=N` limita a contagem de clientes MCP ativos; `--mcp-budget-mode={enforce,warn,off}` escolhe o comportamento. O padrão é `warn` quando um orçamento é definido (o snapshot exibe o aviso, mas nenhum cliente é recusado — útil para medir o fanout no mundo real antes de ativar a aplicação). Servidores recusados no modo `enforce` recebem `disabledReason: 'budget'` em sua célula por servidor, e a célula `budgets[0]` mostra `status: 'error'` + `errorKind: 'budget_exhausted'`. A reserva de slot é por nome de servidor e sobrevive a reconexões / timeouts de descoberta — um servidor recusado não pode tomar o slot de um servidor saudável.
>
> **O escopo atual é orientado por capability.** Quando `mcp_workspace_pool` está presente, todas as sessões em um runtime de workspace compartilham seu pool de transporte MCP e controlador de budget; `GET /workspace/mcp` emite `scope: 'workspace'`. Um segundo workspace tem um pool e budget independentes. Quando a tag está ausente (incluindo `QWEN_SERVE_NO_MCP_POOL=1`), o daemon usa o `McpClientManager` legado por sessão e emite `scope: 'session'`; nesse fallback, N sessões podem cada consumir o limite configurado.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Isso **não** é o mesmo que o `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code (que controla a concorrência de inicialização); eles são ortogonais. Clientes devem fazer branch em `mcp_workspace_pool`, não assumir um escopo apenas pela versão do protocolo.
>
> **Eventos de push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Clientes SDK inscritos em `GET /session/:id/events` recebem frames tipados quando os limites do orçamento são cruzados — `mcp_budget_warning` (sintético, dispara uma vez por cruzamento ascendente de 75% com rearme por histerese em 37,5%, anunciado via `mcp_guardrail_events`) e `mcp_child_refused_batch` (coalescido uma vez por passagem de descoberta no modo `enforce`; tamanho 1 da recusa de lazy-spawn do `readResource`). O snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após reconexão; os eventos são bordas de mudança. Útil para dashboards em tempo real sem polling.

> **Caveats do escopo de memória do projeto.**
>
> - **Daemon vs. CLI standalone.** A flag ou o ambiente de inicialização do daemon define
>   um escopo congelado para cada runtime pertencente àquele daemon. Um `.env` do workspace
>   ou `settings.env` não pode sobrescrevê-lo para um workspace registrado. Um
>   TUI `qwen` standalone ainda usa o escopo git-root por padrão; para manter ambos os entry
>   points consistentes, exporte `QWEN_CODE_MEMORY_PROJECT_SCOPE` no shell ou
>   no ambiente do serviço que os inicializa.
> - **Colisões de nome de diretório.** A chave de armazenamento é derivada por
>   `sanitizeCwd`, que substitui cada caractere não alfanumérico por
>   `-`. Diretórios irmãos que diferem apenas na pontuação (ex.:
>   `feature_1` e `feature-1`) mapeiam para o mesmo diretório de memória mesmo
>   sob escopo `workspace`. Evite tal nomenclatura ao confiar no isolamento
>   de workspace.
> - **Normalização difere entre flag e env var.** A variável de ambiente
>   é aparada e lowercased (`"  Workspace  "` funciona); a flag CLI é
>   comparada case-sensitively pelo `choices` do yargs (`--memory-project-scope
>   Workspace` é rejeitado). Use valores em lowercase ao copiar entre os dois.

### Guard de relocação Git integrado do daemon

Cada sessão ACP gerenciada pelo daemon aplica um guard de pré-execução integrado para comandos shell do modelo, independente de `--external-tool-guard-mode` e sem nenhuma advertisement de capability. O daemon é dono do workspace vinculado e do diretório de trabalho efetivo atual da sessão; ambos são fornecidos a partir de estado de sessão confiável e nunca aceitos do filho ACP.

O guard inspeciona as ferramentas que executam uma linha de comando shell — `run_shell_command` e `monitor` — e nega um comando Git mutante antes da execução quando sua localização de repositório resolve fora do diretório de trabalho efetivo da sessão. A relocação é reconhecida para formas literais de `git -C <path>`, `git --git-dir[=]<path>`, `git --work-tree[=]<path>`, atribuições iniciais de `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` (também quando feitas através de `export`/`declare`/`readonly`, que as mantêm no ambiente de cada comando posterior na cadeia), flags de wrapper que mudam diretório (`env -C`, `sudo -D`) e builtins `cd`, `pushd` ou `popd` anteriormente na mesma cadeia de comandos. Prefixos de wrapper comuns (`sh -c`, `bash -c`, `eval`, `sudo`, `nohup`, `timeout`, `exec`, `command`, `builtin`, `env`, binários `git` qualificados por caminho e sintaxe shell `{ …; }` / `! …`) são desempacotados para que a mesma política se aplique à invocação Git interna, e corpos de substituição `$(…)` ou backtick são analisados como comandos próprios.

Um sub-agente fixado em seu próprio worktree é contido nesse worktree em vez do diretório da sessão; uma chamada shell cujo diretório de execução o daemon não consegue localizar é negada.

Targets relativos resolvem a partir do diretório inicial efetivo do comando (`arguments.directory` quando presente, caso contrário o diretório de trabalho efetivo atual da sessão) após resolução canônica de caminho, incluindo redirects gitfile `.git`, symlinks e diretórios administrativos por worktree. Um target relocado que não pode ser totalmente resolvido antes da execução — um target dinâmico (`$VAR`, backticks, `~`, globs), um caminho que ainda não existe ou uma indireção ilegível — é negado para subcomandos mutantes ou não classificáveis. Um target relocado que não pode ser resolvido é negado qualquer que seja o subcomando — incluindo os read-only. Comandos relocados cujo subcomando é um de um pequeno conjunto verificado read-only (`rev-parse`, `cat-file`) permanecem permitidos após a resolução do target, a menos que o comando carregue config `-c` de execução de comando, ou carregue uma flag `--output`, `--textconv` ou `--filters`: aqueles escrevem um arquivo ou executam os drivers configurados do repositório target. Comandos sem relocação reconhecida mantêm seu comportamento existente. Negações são finais e são reportadas ao modelo como `Daemon shell guard denied a mutating Git command…` para uma localização de repositório resolvida, dinâmica ou irresolúvel, e como `Daemon shell guard denied a shell command…` quando o comando não pôde ser parseado, seu payload não pôde ser resolvido ou um programa não reconhecido pode executar um comando Git relocado.

O guard é confiável contra relocação Git escrita nas formas literais acima — o comando direcionado incorretamente para o qual este controle existe — e é **best-effort, não um boundary**, contra texto shell escrito para derrotá-lo: construções que escondem a relocação de um leitor estático podem passar, e novas continuarão sendo encontradas. Não conceda a um daemon confiança mais ampla com base nele. Ele não interpreta arquivos de script, não rastreia valores de variáveis de ambiente entre comandos nem analisa corpos heredoc (texto no formato Git dentro de um heredoc pode ser negado mesmo que o shell nunca o execute). `/fork` e workspace memory remember/dream com suporte de agente permanecem disponíveis sob o guard integrado; eles só são restritos enquanto o modo de provider externo abaixo estiver ativo. Um guard de ferramenta externo opcional permanece como política adicional e recebe a mesma requisição apenas após a política integrada permití-la.

### Required external Tool Guard

Este opt-in é para deploys ACP gerenciados que precisam de uma decisão externa de permitir/negar
no limite final do executor de ferramentas. Ele está completamente escuro a menos que
`--external-tool-guard-mode=required` esteja presente:

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

O provider deve expor `POST /v1/handshake` e `POST /v1/prepare`, exigir
`Authorization: Bearer <token>`, retornar JSON, ecoar o nonce fornecido ou
ID de requisição e usar versão de protocolo `1`. O token deve ser não-vazio, no máximo
8192 code units UTF-16 e não conter caracteres de controle. Requisições são limitadas
a 1 MiB, respostas a 64 KiB e razões opcionais de negação a 500 code units UTF-16
sem caracteres de controle. Uma resposta prepare bem-sucedida é:

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

Uma negação usa `allowed:false` e pode adicionar um `reason` curto. Para cada invocação
de ferramenta de nível superior suportada que passa as gates existentes de permissão e `PreToolUse`
e alcança o limite final de execução, o Qwen Code envia uma requisição prepare e nunca a
re-tenta. Uma negação anterior de permissão/hook não envia requisição prepare.
Timeout, cancelamento, falha de transporte, respostas malformadas ou incompatíveis e negação
explícita impedem o executor de rodar. Cada canal ACP gerado também deve
reconhecer que instalou o callback required; um reconhecimento ausente ou incompatível
rejeita o canal antes da criação da sessão.
A requisição do provider carrega `sessionId`, `promptId`, `toolCallId`,
`toolName` canônico e `arguments` finais; `toolCallId` é um rótulo de correlação, não uma
identidade de autenticação ou chave de idempotência independente.

Argumentos finais podem conter dados sensíveis da aplicação. Trate-os como tal
nos logs do provider e armazenamento de auditoria.

Hooks `PreToolUse` rodam antes desta decisão final do executor. O modo Required Guard
não autoriza nem faz sandbox do comportamento de hooks; deploys que precisam de um limite
em torno de todo efeito colateral possível devem desabilitar hooks ou governar suas
implementações separadamente.

Ações de comando slash também rodam antes do agendamento de modelo/ferramentas e não são
invocações do Guard. Alguns built-ins podem alterar diretamente arquivos ou configurações. Um deploy
gerenciado que precisa de um limite de todos os efeitos deve rejeitar entrada de comando slash
ou desabilitar todo comando não aprovado através de `slashCommands.disabled` ou
`--disabled-slash-commands`.

O escopo gerenciado v1 é ferramentas de nível superior invocadas por um prompt gerenciado ativo
em foreground. `agent`, `workflow`, `create_sub_session`, `send_message`,
`/fork` direto e controles de memória de workspace remember/dream com suporte de agente
são rejeitados enquanto o modo required está ativo. Um shell de background de nível superior
ou início de monitor ainda é uma invocação guardada e seus argumentos finais cheam ao
provider, mas este recurso não autoriza continuamente o processo nem adiciona um
protocolo de auditoria de conclusão de processo; uma política que requer conclusão em foreground
deve negar essas formas. Chamadas MCP guardadas também desabilitam reconexão/replay
automático após erro de transporte. Após um handshake de inicialização bem-sucedido,
`/capabilities` anuncia `external_tool_guard`; sua ausência significa que clientes não devem
assumir aplicação.

Este recurso não autoriza chamadas explícitas de gerenciamento REST/ACP do daemon;
elas continuam usando a autenticação e contratos de rota existentes do daemon. Também não
torna uma ferramenta permitida ou comando shell determinístico nem faz sandbox de seus
internos; deploys gerenciados devem combinar a decisão do provider com sua política
de ferramentas normal e limite de isolamento.

## Modelo de ameaça de deployment padrão

- **Apenas 127.0.0.1** — bind de loopback, sem necessidade de autenticação.
- **`--hostname 0.0.0.0` requer um token** — a inicialização é recusada sem um.
- **`LOOPBACK_BINDS` inclui IPv6** — `::1` e `[::1]` contam como loopback para a regra de sem-token.
- **Allowlist do cabeçalho Host** — em binds de **loopback**, o daemon verifica se `Host:` corresponde a `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` (case-insensitive conforme RFC 7230 §5.4) para se defender contra DNS rebinding. **Binds fora de loopback (`--hostname 0.0.0.0`) ignoram intencionalmente a allowlist de Host** — o operador escolheu a superfície de ataque, então o portão do bearer-token é a única camada de autenticação; reverse proxies / SNI / client cert pinning são responsabilidade do operador, não do daemon. Se você precisar de isolamento baseado em Host em um bind fora de loopback, termine o TLS + verifique o Host em um proxy frontal.
- **CORS nega qualquer Origin de navegador por padrão** — retorna JSON `403`. Passe **`--allow-origin <pattern>`** (repetível, T2.4 #4514) para permitir origins de navegadores específicos. Cada valor é o literal `*` (qualquer origin — a inicialização recusa se nenhum bearer token estiver configurado; `--require-auth` em loopback é recomendado para hardening completo, já que `/health` permanece pré-auth no loopback por padrão — note que os assets estáticos do Web Shell (`/`, `/assets/*`, navegações de documento `/session/:id`) são montados antes do bearer em todo modo e permanecem pré-auth mesmo sob `--require-auth`, então use `--no-web` quando a superfície residual de navegador importa) ou uma origin de URL canônica (`<scheme>://<host>[:<port>]`, sem barra final / path / userinfo). Origins correspondentes recebem cabeçalhos de resposta CORS adequados (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, além de métodos / cabeçalhos / max-age padrão e `Retry-After` exposto); origins não correspondentes ainda recebem um 403 com o mesmo envelope do muro padrão. `caps.features.allow_origin` é anunciado condicionalmente para que clientes SDK / webui possam fazer pre-flight para saber se o daemon honra requisições cross-origin antes de emiti-las. Exemplo: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Hits de self-origin no loopback (ex: a UI Web Shell) não são afetados — um shim separado de remoção de Origin os trata independentemente do `--allow-origin`. **Webuis de navegador sem `--allow-origin` configurado** ainda recorrem às mesmas opções do Stage 1 de antes: empacote como um shell nativo (Electron/Tauri) para que nenhum cabeçalho `Origin` seja enviado, ou coloque o daemon atrás de um reverse proxy de mesma origem.
- **Automação de navegador via Chrome extension é separada do framing.** `qwen serve --allow-origin chrome-extension://<id>` permite que a extensão faça framing do Web Shell e conecte ao daemon. Ferramentas de console/rede/screenshot/clique requerem um comando adaptador CDP MCP externo: `QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`. O pacote principal da CLI não inclui um adaptador de automação de navegador; clientes podem verificar `caps.features.includes('browser_automation_mcp')` antes de apresentar essas ferramentas como disponíveis.
- **O processo filho `qwen --acp` gerado recebe o ambiente efetivo do seu runtime proprietário.** O daemon congela uma base de process-env, aplica o overlay de settings/env-file daquele workspace a um snapshot local de runtime, e nunca escreve o overlay de volta em `process.env`; chaves com o mesmo nome em outro runtime não fazem crossover. `QWEN_SERVER_TOKEN` é limpo antes do spawn porque o agente não precisa do bearer do daemon. Variáveis que afetam o loader (`NODE_OPTIONS`, `npm_config_node_options` e os redirects de arquivo de config do npm, `NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`, definições de função exportadas do bash `BASH_FUNC_*`) também nunca são passadas para subprocessos de sessão — o daemon as limpa de seu próprio `process.env` e da base de ambiente congelada com a qual os filhos que hospedam sessões são gerados (a base as mantém apenas sob o harness `DEV=true`, cujas entradas `.ts` ainda precisam do loader tsx), e as fontes `.env` / `settings.json` `env` as rejeitam (veja [configurações](./configuration/settings.md)); isso se aplica a toda sessão que o daemon hospeda. Credenciais base como `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*` e `DASHSCOPE_API_KEY` são repassadas, a menos que o overlay do runtime as altere. **Isso é intencional, não é uma sandbox.** O agente é executado com o mesmo UID e tem acesso a ferramentas de shell, então qualquer coisa em `~/.bashrc`, `~/.aws/credentials` ou `~/.npmrc` é acessível por injeção de prompt de qualquer maneira. O isolamento de ambiente entre runtimes não é um limite de segurança do sistema operacional; não execute `qwen serve` sob uma identidade que possua credenciais com as quais você não confiaria no agente.
- **Leituras de texto do agente são locais ao filho e seguem as regras de permissão normais da CLI, não o limite do workspace filesystem.** `read_file` direto pode alcançar caminhos de texto do host fora de todo workspace registrado: caminhos externos usam confirmação por padrão, e regras de permissão ou modos de aprovação podem aprová-los automaticamente. Leituras aprovadas usam os limites configuráveis de saída da CLI em vez dos limites de saída retornada, snapshot completo e scan de texto grande do workspace filesystem. Isso se aplica a todo consumidor compartilhado de leitura de texto, então as pré-leituras realizadas por operações de write, edit, notebook, sed e artifact perdem esses limites junto com a auditoria de leitura, rejeição de symlink e proteções TOCTOU do lado da leitura do workspace filesystem — veja [o documento de design](../design/daemon-local-text-reads.md) para a lista exata. Como um payload de confirmação é construído lendo o arquivo, um diff fora do workspace é distribuído para **todo** assinante SSE anexado antes que alguém o aprove — na CLI interativa, esse conteúdo é visto apenas pela pessoa no terminal. Trate clientes autenticados do daemon como o mesmo principal de segurança. Rotas HTTP de filesystem permanecem com escopo de workspace e o comportamento da ferramenta de descoberta do agente não é alterado.
- **Escritas finais aprovadas de ferramentas de texto integradas têm uma rota estreita no mesmo host.** `write_file`, `edit`, `notebook_edit` e o editor sed simulado da ferramenta shell anexam proveniência interna apenas depois que a política de permissão existente permite a execução. Sua escrita final de texto ACP pode, portanto, ter como alvo um caminho absoluto fora do workspace proprietário sem uma segunda confirmação; regras de permissão, AUTO/AUTO_EDIT e YOLO se comportam como na CLI, enquanto rejeição, Plan, recusa de Hook/Guard e cancelamento pré-execução não enviam a escrita final. O cancelamento após uma ferramenta já ter entrado em uma operação de filesystem não cancelável mantém o comportamento existente dessa ferramenta. Targets do workspace ainda usam WFS. Targets externos usam um writer de host do daemon com o mesmo snapshot de confiança, limite de 5 MiB codificado, rejeição de symlink folha, lock de caminho canônico, rename atômico, preservação de modo, modo de arquivo novo `0600`, guarda de geração e auditoria de filesystem. Escritas HTTP, escritas ACP genéricas ou não marcadas, integrações injetadas de bridge/registro de workspace/factory e redirecionamentos shell arbitrários não recebem esta exceção. Veja [o design de escrita externa](../design/daemon-external-tool-text-writes.md).
- **Filas SSE limitadas por assinante** — um cliente lento que transborda sua fila recebe um frame terminal `client_evicted` e é fechado; um consumidor travado não pode travar o daemon.
- **Limite de admissão de prompt por sessão** — o padrão é 5 prompts aceitos mas não resolvidos por sessão. Um cliente com bug não pode enfileirar promises de prompt ilimitadas ou esperas temporárias de SSE para uma sessão.
- **Desligamento gracioso** — SIGINT/SIGTERM drena os processos filhos do agente antes de fechar o listener (prazo de 10s por filho).

> ⚠️ **Lacuna conhecida do Stage 1 — permissões são globais do daemon, não por sessão (BUy4H).** `pendingPermissions` vive no escopo do daemon; qualquer cliente segurando o bearer token pode votar em qualquer `requestId` de qualquer sessão que ele possa ver (e os eventos SSE `permission_request` carregam o requestId em seu payload). Isso é aceitável sob o modelo de confiança de usuário único / equipe pequena, onde todo cliente autenticado é o mesmo humano ou colaboradores em quem eles confiam. O Stage 1.5 migrará para `POST /session/:id/permission/:requestId` + mapa pendente com escopo de sessão + identidade por cliente (must-have #3 da revisão downstream); até lá, não execute `qwen serve` atrás de um bearer compartilhado com partes não confiáveis.
>
> ⚠️ **Lacuna conhecida do Stage 1 — corpo do `POST /session/:id/prompt` limitado a 10 MB (BUy4L).** Prompts multimodais contendo imagens / PDFs / áudio que excedam 10 MB falharão no momento do parse do corpo antes que a lógica da rota seja executada (sem streaming, sem abort no meio do upload). Solução alternativa: reduza o conteúdo no lado do cliente, ou passe uma referência de caminho e deixe o agente ler o arquivo via `readTextFile`. O Stage 1.5 aceitará `multipart/form-data` ou codificação em chunks em `/prompt` para que prompts grandes não atinjam um limite rígido.
>
> ⚠️ **Lacuna conhecida do Stage 1 — conexões SSE fantasmas atrás de NAT.** O
> daemon detecta clientes mortos via back-pressure TCP em heartbeats
> (intervalo de 15s). Um cliente que desaparece SEM um TCP RST (ex: uma
> caixa NAT descartando fluxos ociosos silenciosamente) mantém o socket
> em nível de kernel "vivo" até que as sondas de keepalive do Node atinjam o timeout — tipicamente ~2 horas
> nos padrões do Linux. Em deployments `--hostname 0.0.0.0` atrás de tais
> NATs, conexões SSE fantasmas podem se acumular e eventualmente atingir o
> teto de 256 `server.maxConnections`.
>
> Defina [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)
> para fechar a lacuna com um prazo de ociosidade explícito em nível de aplicação:
> quando nenhuma escrita for liberada com sucesso por `n` ms, o daemon emite
> um frame terminal `client_evicted` com
> `reason: 'writer_idle_timeout'` e fecha o stream. A flag está
> desativada por padrão para preservar o contrato legado — operadores em
> redes que engolem RSTs devem escolher um valor bem acima do intervalo de heartbeat de 15s
> (ex: `60000`–`300000`) para que conexões ociosas legítimas
> não sejam expulsas enquanto writers genuinamente travados são
> coletados prontamente. Faça pre-flight de `caps.features.includes('writer_idle_timeout')`
> do seu SDK para confirmar se o daemon o suporta.

### Prazos e timeout de ociosidade do writer

A issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 traz duas flags opt-in que fecham as lacunas de execução longa / deployment remoto que o heartbeat de 15s + AbortSignal não cobrem. Ambas estão desativadas por padrão — fluxos de trabalho de loopback de usuário único permanecem inalterados bit a bit.

| Flag                           | Env var                             | Padrão | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | não definido   | Limite de relógio no lado do servidor para um único `POST /session/:id/prompt`. Na expiração, o daemon aborta o AbortController do prompt e retorna HTTP `504` com `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Um campo `deadlineMs` no corpo da requisição por prompt pode ENCURTAR o prazo efetivo abaixo da flag, mas nunca estendê-lo. Tag de capacidade (condicional): `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | não definido   | Prazo de ociosidade por conexão SSE. Quando nenhuma escrita for LIBERADA COM SUCESSO por `n` ms — nem um evento real nem o heartbeat de 15s — o daemon emite um frame terminal `client_evicted` com `data.reason = 'writer_idle_timeout'` (espelhado em `data.errorKind`) e fecha o stream. **Escolha um valor confortavelmente acima do heartbeat de 15s** (ex: `30000`–`300000`) para que streams ociosos legítimos não sejam expulsos; valores `< 15000` EXPULSARÃO conexões ociosas saudáveis antes do primeiro heartbeat disparar (intencional apenas para testes / sessões de desenvolvimento de curta duração). Tag de capacidade (condicional): `writer_idle_timeout`. |

Ambas as flags aceitam um inteiro positivo em milissegundos; `0`, `NaN`, valores não inteiros ou negativos são rejeitados na inicialização com uma mensagem de erro clara. A flag CLI vence a env var; o campo `ServeOptions` explícito (chamadores incorporados) vence a env. Consumidores de SDK devem fazer pre-flight da tag de capacidade correspondente antes de confiar em qualquer comportamento — daemons anteriores a este PR omitem ambas as tags e o campo `deadlineMs` da requisição é descartado silenciosamente.

### Modo de arquivo novo para escritas de texto do agente

As escritas de texto do agente (`write_file`, `edit`, `notebook_edit` e o editor sed simulado da ferramenta shell) são publicadas através do writer atômico do daemon, que preserva o modo de um target existente e — para arquivos **novos** — usa como padrão o `0600` apenas para o proprietário, ignorando o umask do processo do daemon. Esse padrão fail-closed é intencional: um arquivo recém-criado pelo agente nunca é legível por grupo/outros acidentalmente, não importa quão permissivo seja o umask do supervisor.

Operadores cuja convenção de deployment é baseada em umask (ex: uma unit do systemd com `UMask=0002`, repositórios com grupo compartilhado) podem optar por novos arquivos no tratamento POSIX padrão com:

| Env var                    | Valores             | Padrão  | O que faz                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE` | `owner` \| `system` | `owner` | `system` cria arquivos NOVOS em `0o666 & ~umask`, então arquivos criados pelo agente seguem o umask do processo do daemon como qualquer outro processo na máquina. `owner` mantém o padrão `0600` independente de umask. Os valores são case-insensitive; o literal `0600` é aceito como um alias para `owner` (nenhum outro modo octal é suportado), e qualquer outro valor é rejeitado com um aviso no stderr e o padrão `0600` é mantido. |

Escopo e limites:

- Aplica-se a arquivos NOVOS criados pelas rotas de escrita de texto (targets de workspace, o host writer externo no mesmo host e escritas de texto HTTP). Arquivos existentes sempre mantêm seu modo em disco — editar um segredo `0600` o mantém `0600`, um executável mantém `+x`.
- Uploads binários (`POST /file/upload`) sempre criam com `0600` independentemente desta configuração.
- O daemon lê a variável na construção do workspace-filesystem; reinicie o daemon após alterá-la.

## Deploy multi-sessão e multi-workspace

Passe `--workspace` mais de uma vez para registrar vários workspaces não sobrepostos em um processo `qwen serve`. O primeiro caminho é o primário. Cada workspace registrado possui um limite de runtime isolado, enquanto o listener em todo o daemon, a política de autenticação e o limite de sessões totais são compartilhados. A produção tenta pré-aquecer o filho ACP primário para compatibilidade e tenta novamente no primeiro uso após falha; secundários confiáveis iniciam seu próprio filho sob demanda, e secundários não confiáveis não iniciam ACP. Requisições podem selecionar um workspace registrado por `cwd` canônico; requisições que omitem `cwd` usam o workspace primário. Use um daemon por usuário ou principal de segurança; a confiança de workspace é um gate de execução, não um ACL.

Um workspace secundário não confiável é visível no Web Shell como `untrusted` e `read-only`. Ele pode ser expandido para inspecionar o catálogo de sessões persistidas, mas ainda não pode ser selecionado ou aberto no Web Shell, retomado, usado para criar sessões ou exportado completamente. A API REST segue a política existente de leitura de sistema de arquivos limitada e também expõe seu catálogo de grupos de sessão persistidos e, quando `workspace_persisted_transcript` é anunciado, sua transcrição persistida ativa através do pager qualificado por workspace limitado. Essas leituras não incluem estado de runtime ao vivo nem iniciam um filho ACP. A exportação qualificada por workspace completa requer um workspace confiável e a capability separada `workspace_session_export`. Confie no workspace e reinicie o daemon antes de usar recursos de execução, mutação ou exportação. Um primário não confiável permanece desabilitado no Web Shell.

Use processos de daemon separados quando precisar de um limite menor de falha ou segurança, bearer tokens independentes, cotas, limites de auditoria, isolamento do sistema operacional ou supervisão independente de recursos. O modo multi-workspace é destinado a um operador hospedando vários repos; não é um limite de isolamento multi-tenant. Um único token de daemon autoriza toda rota que o daemon expõe, incluindo o catálogo read-only permitido para todos os workspaces registrados.

> **Assine ANTES de postar `modelServiceId` no attach.** Quando um cliente `POST /session` com um `modelServiceId` e o workspace já tem uma sessão rodando um modelo diferente, o daemon emite uma chamada interna `setSessionModel` — falhas NÃO são propagadas como erro HTTP (a sessão permanece operacional em seu modelo atual). O sinal de falha visível é um evento `model_switch_failed` no stream SSE da sessão. Se você chamar `POST /session` e só DEPOIS abrir `GET /session/:id/events`, perderá o evento de falha e continuará silenciosamente falando com o modelo errado. Abra o stream SSE primeiro, ou passe `Last-Event-ID: 0` na assinatura para fazer replay do evento mais antigo disponível do ring.

Para lidar com múltiplos **usuários ou principais de segurança** (cada um com token independente, cota, log de auditoria, sandbox ou limite de falha de processo) ou para escalar além do alcance de um processo (budget de cold-start, contagem de FD, RSS), gere um daemon por principal atrás de um orquestrador externo. Cada tal daemon ainda pode hospedar vários workspaces para aquele principal. O orquestrador (multi-tenancy / OIDC / Quota / Audit / k8s) está **fora do escopo** do projeto qwen-code — consulte a issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" para os ponteiros de design.

## Carregando e retomando uma sessão persistida

O daemon expõe o fluxo `session/load` e de retomada do ACP sobre HTTP, mais um pager de transcrição read-only separado:

| Rota                                                  | Quando usar                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`                              | O cliente **não** tem histórico local útil renderizado (reconexão a frio, picker-then-open). Para uma sessão ao vivo, o daemon retorna e injeta a janela atual de snapshot de replay limitado; se replay mais antigo foi descartado, o snapshot começa com `history_truncated`. Tag de capacidade: `session_load`. |
| `POST /session/:id/resume`                            | O cliente já tem os turnos na tela e só precisa do handle do lado do daemon de volta. O contexto do modelo é restaurado no lado do agente sem repetição de UI — o stream SSE permanece limpo. Tag de capacidade: `session_resume` (`unstable_session_resume` permanece como um alias depreciado para clientes mais antigos). |
| `GET /session/:id/transcript`                         | O cliente precisa da transcrição persistida ativa completa. Retorna frames de replay sem id em páginas de cursor e não chama `/load`, não anexa um cliente, não semeia o EventBus ao vivo, não cria uma sessão ao vivo nem altera a janela de replay ao vivo. Tag de capacidade: `session_transcript`.                    |
| `GET /workspaces/:workspace/session/:id/transcript`   | O cliente precisa de uma transcrição persistida ativa de um workspace selecionado sem iniciar ACP ou carregar configurações do workspace. Workspaces secundários não confiáveis registrados podem usar este caminho read-only. Tag de capacidade: `workspace_persisted_transcript`.                                            |
| `GET /workspaces/:workspace/session/:id/export`       | O cliente precisa de um anexo completo `html`, `md`, `json` ou `jsonl` de um workspace confiável selecionado. Lê o armazenamento persistido ativo sem iniciar ACP ou fazer fallback para o primário. Tag de capacidade: `workspace_session_export`.                                                         |
| `GET /workspaces/:workspace/session/:id/archive/export` | O cliente precisa dos mesmos formatos de anexo do armazenamento persistido arquivado em um workspace confiável selecionado. Não desarquiva, não inicia ACP nem faz fallback para uma sessão ativa ou primária. Tag de capacidade: `workspace_archived_session_export`.                                                |

O SDK TypeScript expõe ambos como fábricas estáticas em `DaemonSessionClient`:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay the bounded snapshot window through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

Faça pre-flight de `caps.features.session_load`, `caps.features.session_resume` ou `caps.features.session_transcript` antes de chamar a rota correspondente — daemons mais antigos retornam `404`. `unstable_session_resume` ainda é anunciado como um alias de compatibilidade depreciado. Requisições concorrentes da mesma ação para o mesmo id são coalescidas; corridas de ações cruzadas (um `load` competindo com um `resume`) e spawns com id fornecido pelo chamador competindo com um restore recebem `409 restore_in_progress` com `Retry-After: 5`. Um restore que excede `limits.sessionRestoreTimeoutMs` recebe `504 session_restore_timeout` recuperável com um `Retry-After` derivado do budget (limitado a 5-120s); a requisição do filho ainda em execução permanece isolada até a limpeza resolver, e retentativas do mesmo id durante essa janela recebem `409 restore_in_progress` com `reason: awaiting_abandoned_cleanup` e um `Retry-After` derivado do budget limitado a 5-120 segundos em vez de um delay fixo de 5 segundos. Se a limpeza for incerta, ou o restore abandonado ainda não tiver resolvido um budget completo de restore após seu deadline, trabalho de sessão nova temporariamente recebe `503 acp_channel_unavailable` com `reason: restore_cleanup_failed` ou `restore_settlement_overdue`, enquanto sessões já ativas permanecem utilizáveis. Veja a [referência do protocolo](../developers/qwen-serve-protocol.md) para o envelope de erro completo.

Para replay persistido completo, pagine com `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` ou a rota REST bruta:

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

Para um workspace registrado, use `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` ou `/workspaces/:workspace/session/:id/transcript`. O método qualificado por workspace sempre usa REST nativo mesmo quando o cliente SDK tem um transporte ACP substituível. Seus cursores são apenas do tempo de vida do daemon e devem ser reiniciados da página um após um restart do daemon.

Para um anexo completo de um workspace registrado confiável, faça pre-flight de `workspace_session_export` e chame `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` ou a rota bruta `/workspaces/:workspace/session/:id/export`. Não infira suporte de `session_export` ou `workspace_qualified_rest_core`: daemons mais antigos podem anunciar ambos enquanto mantêm exportação apenas do primário. A ação de exportação atual do Web Shell permanece apenas do primário; use o SDK ou a rota REST para outro workspace.

Para um anexo arquivado, faça pre-flight de `workspace_archived_session_export` e chame `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` ou `/workspaces/:workspace/session/:id/archive/export`. Este caminho lê o armazenamento arquivado no lugar e retorna `409 session_not_archived` para um id apenas ativo; não desarquiva a sessão. O Web Shell expõe a mesma exportação para linhas arquivadas em workspaces primários e secundários confiáveis quando a capability está presente.

`limit` conta registros de chat ativos, não frames de replay emitidos; um registro pode produzir vários eventos `session_update`. A primeira resposta congela o tamanho do snapshot JSONL e retorna `nextCursor` enquanto `hasMore` é true. Páginas posteriores ignoram acréscimos após a página 1, mas retornam `409` se o arquivo for deletado, truncado, substituído, arquivado ou de outra forma conflitar com o cursor congelado. Snapshots muito grandes retornam `413 transcript_too_large` antes da indexação para que o daemon não escaneie arquivos de transcrição ilimitados no caminho da requisição.

Para paginação repetida através da rota singular legada, defina `--channel-idle-timeout-ms` com um valor positivo. Com o padrão `0`, o filho ACP de um workspace ocioso — e o cache de índice de transcrição em processo que ele mantém — é coletado após cada página, então cada página re-gera o filho e reconstrói o índice re-escaneando todo o prefixo congelado (`O(snapshotSize)` por página). Um timeout positivo mantém o filho vivo durante a caminhada do cursor para que reutilize seu índice de transcrição em cache e config de replay. A rota persistida qualificada por workspace nunca inicia um filho ACP e não é afetada por este timeout.

Nota: a repetição de histórico da sessão ao vivo é limitada duas vezes: pelo ring SSE para reconexões `Last-Event-ID` e por `--compacted-replay-max-bytes` para o snapshot retornado por `POST /session/:id/load`. Históricos longos com turnos verbosos podem exceder qualquer limite. O daemon expõe truncamento de snapshot com `history_truncated`; use `/transcript` quando precisar do histórico persistido ativo completo.

## Modelo de durabilidade

**As sessões ainda são efêmeras no Stage 1 entre reinicializações do daemon**, mas sessões persistidas em disco podem ser recarregadas:

- Um crash de processo filho publica `session_died` e remove a sessão ativa dos mapas do daemon. A sessão persistida em disco **pode** ser recarregada via `POST /session/:id/load` se um novo processo filho do agente puder ser gerado.
- Uma reinicialização do daemon perde todas as sessões ativas em andamento. As sessões persistidas permanecem em disco e podem ser carregadas em um novo processo daemon, sujeitas às mesmas regras de vinculação de workspace.
- Desconexões longas do cliente (>5 min em um turno verboso) podem ultrapassar o ring de repetição SSE (padrão de 8000 frames) — a reconexão `Last-Event-ID` dispara `state_resync_required`. Para clientes móveis / de rede instável, planeje reabrir o SSE em quedas longas ou chame `POST /session/:id/load` para recuperar o snapshot de replay limitado atual; não assuma que aquela rota retorna a transcrição completa.
- Operações de arquivo (`writeTextFile`) são atômicas entre crashes (write-then-rename); elas não são atômicas entre reinicializações do daemon no sentido de repetição — a escrita do arquivo ocorreu ou não.

Se sua integração precisar de durabilidade cross-restart no lado do servidor além do que `session/load` cobre (ex: filas de retry gerenciadas pelo servidor), você ainda precisará de recuperação de estado em nível de aplicação. Não mantenha estado de execução longa e sensível a reinicializações dentro da sessão do daemon.

## Garantias de runtime do Stage 1.5+

O contrato do Stage 1 é dimensionado para prototipação. Conforme a [revisão de consumidor downstream #3889 chiga0](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), o seguinte **não** está no Stage 1 — integrações de nível de produção precisam do Stage 1.5+ antes de depender deles:
**Impedimentos para uso downstream sério:**

1. **`loadSession` / `unstable_resumeSession` via HTTP** — sem isso, nenhuma integração sobrevive a um crash do processo filho ou reinício do daemon, e qualquer orquestrador coordenando o daemon também não consegue recuperar o estado.
2. **Identidade persistente do cliente (pair tokens + revogação por cliente)** — o Stage 1 usa um único bearer compartilhado; um token vazado revoga todos, e `originatorClientId` é autodeclarado pelo cliente em vez de ser carimbado pelo daemon a partir da identidade autenticada.

**Linha de base de confiabilidade:**

3. ~~**Caminho de heartbeat iniciado pelo cliente**~~ — entregue via PR [#4175](https://github.com/QwenLM/qwen-code/issues/4175) 9. `POST /session/:id/heartbeat` registra timestamps de última visualização no daemon (tag de capacidade `client_heartbeat`); os helpers do SDK são `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Evento `permission_already_resolved`** quando um voto perde a corrida de first-responder — atualmente, as UIs precisam inferir o estado a partir de um `404`.
5. ~~**Ring de replay maior**~~ — aumentado para 8000. **Ring configurável por sessão** ainda em aberto — workloads de mobile / turnos com muitas mensagens podem precisar de overrides por sessão.
6. **Evento `slow_client_warning` antes de `client_evicted`** — backpressure suave para que clientes lentos e bem-comportados possam se auto-limitar (reduzir profundidade de renderização, descartar chunks) antes de serem encerrados.

**Ergonomia de integração:**

7. **`POST /session/:id/_meta` para contexto no estilo IM** — key-value por sessão anexado aos prompts subsequentes (chat id, sender, thread id) substitui a improvisação por canal.
8. **Negociação real de recursos em `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` para que os clientes possam detectar drift em vez de cair no "unknown frame, ignore".
9. **Documentação de durabilidade de primeira classe** (esta seção) — já entregue acima.

O roadmap completo de convergência é acompanhado na issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

## Limites do escopo do Stage 1 — o que não corrigiremos no Stage 1.5

Duas escolhas estruturais são objetivos explícitos fora do escopo (non-goals) para o roadmap principal do Stage 1 / 1.5 / 2. Se o seu caso de uso depende de qualquer uma delas, planeje contorná-las em vez de esperar por nós.

### O estado da sessão é apenas de mutação local (conforme [revisão LaZzyMan #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

O plano do Stage 1.5 descreve a TUI como um assinante de EventBus in-process. Na prática, **a UI da TUI é estritamente maior que o protocolo de rede (wire protocol)**:

- **UI apenas local** — os ~15 componentes de diálogo do Ink (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) e os slash commands `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) renderizam JSX específico do terminal. Clientes remotos via HTTP/SSE não podem renderizar Ink de forma equivalente, e esses fluxos não emitem nenhum evento de rede.
- **Mutações de estado de sessão sem eventos de rede** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (escrevendo em `CLAUDE.md`) todos alteram o comportamento do agente, mas apenas `/model` atualmente publica um evento (`model_switched`).

**Escolha do Stage 1 — opção (A) da revisão**: não promover essas mutações para eventos de rede. Os dois modos de implantação têm consequências diferentes.

#### Modo 1 — `qwen serve` headless (este PR)

Nenhum shell TUI é executado dentro do daemon. Os slash commands listados acima **não existem** neste modo — não há UI de terminal para executá-los. O estado da sessão é, portanto:

- **Congelado no boot** para `approval-mode` / `memory` / `agents` / allowlist de `tools` / `auth` — todos carregados das configurações + disco quando o processo filho `qwen --acp` do daemon inicia; imutável durante o tempo de vida da sessão. Servidores MCP definidos nas configurações também são congelados no boot, mas **servidores adicionados em runtime** (via `POST /workspace/mcp/servers`) podem ser adicionados ou removidos sem reiniciar.
- **Mutável via HTTP** através de `POST /session/:id/model` (publica `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publica `mcp_server_added` / `mcp_server_removed`), e votos de permissão (`POST /permission/:requestId`).

**Consequência:** clientes remotos no modo headless veem o **estado completo da sessão**. Nenhuma TUI oculta estado adicional; nenhum drift é possível. Se você quiser alterar o `approval-mode`, reinicie o daemon com as novas configurações. Servidores MCP agora podem ser adicionados/removidos em runtime através das rotas de mutação (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — veja [Gerenciamento de servidor MCP em runtime](#runtime-mcp-server-management-issue-4514).

#### Modo 2 — TUI co-hospedada `qwen --serve` do Stage 1.5 (não está neste PR)

Quando o Stage 1.5 trouxer o `qwen --serve` (o processo TUI co-hospeda o mesmo servidor HTTP), a TUI **existirá** junto com os clientes remotos. Um operador local digitando `/approval-mode yolo` ou `/mcp add-server` muta o estado da sessão, e os clientes remotos via HTTP não têm nenhum evento para observar a mudança.

Neste modo, a TUI é um **"super-cliente"** — ela observa a mesma conversa do agente que os clientes remotos veem, E pode mutar o estado da sessão que os clientes remotos não conseguem. A assimetria é:

- ✅ Tanto a TUI quanto os clientes remotos veem as mesmas mensagens do agente, chamadas de ferramentas, diffs de arquivos e prompts de permissão.
- ❌ Apenas a TUI vê / muta approval-mode / memory / lista de servidores MCP / agents / allowlist de tools / estado de auth.

**Consequência no Modo 2:** se uma UI de cliente remoto tentar espelhar as configurações da sessão, ela pode sofrer drift após qualquer slash command da TUI. Clientes remotos devem **recarregar o estado ao anexar / reconectar** (use `Last-Event-ID: 0` para fazer replay do evento mais antigo do ring para coisas como `model_switched`); eles NÃO devem depender de eventos incrementais para mutações do lado da TUI.

#### Por que (A) e não (B) (promover mutações para a família de eventos `session_state_changed`)

(B) é a resposta mais ambiciosa, mas trava o Stage 1.5 em uma superfície de rede substancialmente maior que também deve passar limpa pela refatoração in-process planejada. Preferimos caminhar com o escopo menor de forma honesta. O trabalho de taxonomia de eventos de estado de sessão — enumerar quais fluxos da TUI são apenas locais por design vs. quais poderiam plausivelmente ser promovidos para a rede sob uma futura extensão opcional no estilo (B) — vai para a issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803), não para o código do Stage 1.5.

### N sessões paralelas compartilham um processo filho `qwen --acp` por runtime de workspace

Múltiplas sessões no mesmo workspace confiável **compartilham o processo filho `qwen --acp` daquele runtime** através do suporte nativo multi-sessão do agente (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). A bridge chama `connection.newSession({cwd, mcpServers})` para cada sessão — o agente as armazena em seu mapa de sessões e faz o demultiplexing do `sessionId` por chamada. A produção pode ter até um filho primário (pré-aquecimento tentado por padrão) mais um filho sob demanda por secundário confiável; secundários não confiáveis não possuem nenhum.

Custo concreto com N=5 sessões no mesmo workspace:

| Recurso                              | Por sessão                                                  | Com N=5                                                          |
| ------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Processo Node do Daemon              | um                                                          | **30–50 MB** (um daemon)                                        |
| Processo filho `qwen --acp`          | compartilhado                                               | **60–100 MB** (um filho)                                        |
| Processos filhos de servidor MCP     | pool de workspace quando anunciado; caso contrário por sessão | compartilhados por entradas de pool correspondentes, ou até 3×N no fallback legado |
| `FileReadCache` (heap do processo filho) | compartilhado                                            | parseado uma vez                                                 |
| Parse de memória `CLAUDE.md` / hierarquia | compartilhado                                           | parseado uma vez                                                 |
| Estado de refresh-token OAuth        | compartilhado                                               | **um caminho de refresh**                                       |
| Fatos aprendidos de Auto-memory      | compartilhado                                               | uma base de conhecimento por processo filho                      |
| Cold start                           | apenas o primeiro                                           | <200 ms após a primeira sessão                                  |

Cada runtime de workspace ativo mantém **um limite de bridge**. A produção tenta pré-aquecer o canal primário e tenta novamente no primeiro uso após falha; um secundário confiável abre seu canal e filho sob demanda, enquanto um secundário não confiável nunca o faz. Um canal permanece ativo enquanto pelo menos uma sessão estiver ao vivo. Após o último `killSession`, o runtime mata seu filho imediatamente por padrão ou após a graça de idle do canal configurada; um crash no nível do canal também o derruba sem selecionar outro runtime.

**Processos filhos de servidor MCP** usam o pool de transporte com escopo de workspace quando `mcp_workspace_pool` é anunciado: entradas correspondentes `(runtime de workspace, nome do servidor, fingerprint de config)` têm refcount compartilhado entre sessões. Se a capability está ausente, o gerenciador legado por sessão os gera independentemente.

**Agentes pares (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) todos fazem multi-sessão em processo único.** O qwen-code os acompanha na camada do agente; a bridge do Stage 1 neste PR torna a mesma arquitetura visível via HTTP.

## Fazendo login em um daemon remoto (issue #4175 PR 21)

Quando o daemon é executado em um pod remoto (sem display compartilhado com você), um cliente pode disparar um fluxo de dispositivo OAuth via HTTP. O daemon faz o polling do IdP ele mesmo; seu trabalho é apenas abrir uma URL em qualquer dispositivo que tenha um navegador.

> [!note]
>
> O tier gratuito do Qwen OAuth foi descontinuado em 15/04/2026. Os exemplos `qwen-oauth`
> abaixo documentam o formato do protocolo de fluxo de dispositivo e o identificador legado
> do provedor; novas configurações devem usar um provedor de auth atualmente suportado.

```bash
# 1. Inicia um fluxo. O daemon contata o IdP, retorna um código + URL.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. Acesse a URL no seu celular / notebook, insira o código do usuário.
# 3. Faça polling para conclusão (ou assine o SSE para o evento auth_device_flow_authorized):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → transições de status: pending → authorized
```

O SDK TypeScript encapsula ambas as etapas em um único helper:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Abra ${flow.verificationUri}\nCódigo: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**O daemon nunca abre um navegador em seu nome.** Mesmo quando executado localmente, o daemon permanece passivo — ele retorna a URL e deixa o SDK / usuário escolher onde abri-la. Isso é intencional: um daemon em um pod headless que chamasse `xdg-open` falharia silenciosamente, mascarando a superfície de auth real. Espelhe a UX de "Pressione Enter para abrir o navegador" do `gh auth login` no seu cliente.

**`--require-auth` e conveniência de desenvolvimento.** As rotas de fluxo de dispositivo usam o gate de mutação estrito (PR 15), o que significa que o padrão de loopback sem token retorna `401 token_required`. Localmente, a maneira mais simples de contornar isso durante o desenvolvimento é `qwen serve --token=dev-token`; você não precisa de `--require-auth` a menos que esteja endurecendo o padrão de loopback.

**Limitação entre daemons.** `oauth_creds.json` é compartilhado pelo daemon (`~/.qwen/oauth_creds.json`), então um login bem-sucedido no daemon A é automaticamente utilizado pelo próximo refresh de token do daemon B — mas os clientes SDK do daemon B não receberão o evento `auth_device_flow_authorized` (os eventos são por daemon).

**Take-over entre clientes.** Dois clientes SDK no mesmo daemon que ambos fazem `POST /workspace/auth/device-flow` para o mesmo provedor obtêm o singleton por provedor: a primeira chamada inicia uma nova requisição ao IdP e retorna `attached: false`; a segunda chamada retorna a entrada existente em andamento com `attached: true`. O take-over é registrado no audit trail (sob o `X-Qwen-Client-Id` do segundo cliente), mas NÃO emite um evento separado — ambos os clientes eventualmente observam o MESMO `auth_device_flow_authorized` assim que o usuário termina a página do IdP. Se a sua UI distingue "eu iniciei isso" de "fluxo de outra pessoa que eu entrei", faça o branch no campo `attached` retornado por `start()`.

## Arquivo de log do daemon

O `qwen serve` adiciona registros de diagnóstico através de reinicializações normais no caminho ativo estável:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

Cada registro de arquivo inclui um `runId` aleatório por início e o PID do daemon. Um proprietário estável bem-sucedido também atualiza `debug/daemon/latest` para `daemon.log` em plataformas que suportam symlinks. No macOS/Linux, siga a rotação com:

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

Em outras plataformas, configure o visualizador para reabrir o pathname após ser substituído. Um visualizador que mantém apenas o handle de arquivo antigo permanecerá no arquivo após a rotação.

O log captura mensagens de ciclo de vida, erros de rota (com contexto `route=` e `sessionId=`), stderr do processo filho ACP e — quando `QWEN_SERVE_DEBUG=1` está definido — breadcrumbs extras da bridge. Linhas que vão para o stderr hoje ainda vão para o stderr; o log em arquivo é **aditivo**, não um substituto.

O arquivo ativo rotaciona antes de exceder 10 MiB. Cada família retém quatro arquivos em `archive/`, e cada registro de arquivo é limitado a 256 KiB. A fila em memória aceita no máximo 4 MiB de payload de arquivo não resolvido. Pressão de fila, falhas de rotação ou falhas de sistema de arquivos podem portanto descartar cópias de arquivo; `GET /daemon/status?detail=full` expõe saúde do logger, problemas e contadores de registros/bytes descartados.

Apenas um daemon pode possuir a família estável em um namespace de log. Um daemon concorrente escreve em `debug/daemon/runs/run-<runId>/daemon.log`; o banner de inicialização e o status completo contêm o caminho autoritativo. `runs/recent-fallback` é um localizador de melhor esforço para uma família fallback recente e pode apontar para uma que ainda está ativa. Um namespace saudável converge para aproximadamente 100 MiB: cerca de 50 MiB para estável mais uma família fallback inativa. Famílias fallback ativas ou ainda não obsoletas são retidas, então daemons concorrentes ou tempestades de crash/restart podem temporariamente usar mais.

Um diretório de runtime é um namespace de propriedade e retenção. Use valores distintos de `QWEN_RUNTIME_DIR` quando daemons precisam de histórico independente. Novos diretórios de log do daemon são privados para o usuário (`0700`) e novos arquivos usam `0600` em POSIX. Não há expiração baseada em idade.

### Desativando

Defina `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) para pular o log em arquivo completamente. A saída do stderr não é afetada.

### Relação com logs de debug de sessão

Logs de debug com escopo de sessão (`~/.qwen/debug/<sessionId>.txt` e o symlink `~/.qwen/debug/latest`) são independentes. O log do daemon fica em um subdiretório irmão `daemon/`; a semântica de debug por sessão não é alterada por este recurso.

### Rotação externa

Não aponte uma regra externa de logrotate para o `daemon.log` ativo. O daemon é o único escritor e rotacionador suportado; renomeação, deleção ou truncamento externo invalida seu modelo de tamanho. Copiar ou enviar registros sem mutar a família é seguro. Arquivos antigos `serve-<pid>.log` e `serve-<pid>-<workspaceHash>.log` são deixados intactos e não são contados pela nova política de retenção.

## Gerenciamento de servidor MCP em runtime (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

Adicione ou remova servidores MCP em runtime sem reiniciar o daemon. As entradas em runtime vivem em um overlay efêmero que **sobrescreve (shadows)** servidores definidos nas configurações com o mesmo nome; a config subjacente `settings.json` / `mcpServers` nunca é alterada.

**Pré-voo:** verifique `caps.features` para `mcp_server_runtime_mutation` antes de chamar qualquer uma das rotas. Daemons mais antigos sem esta tag retornam `404`.

### `POST /workspace/mcp/servers` — adicionar um servidor MCP em runtime

Com gate estrito (bearer token obrigatório). Conecta o servidor imediatamente através do `McpClientManager` ativo e descobre suas ferramentas.

Requisição:

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` deve ser alfanumérico mais `_` e `-` (máximo de 256 caracteres). `config` é o mesmo objeto de configuração de servidor MCP usado nas entradas `mcpServers` do `settings.json` (campos dependentes de transporte: `command`/`args` para stdio, `url` para SSE/HTTP). Campos sensíveis à segurança (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) são removidos pelo daemon e ignorados.

Resposta (200) — sucesso:

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — uma entrada em runtime com o mesmo nome já existia e o fingerprint da config difere; conexão antiga derrubada, nova estabelecida. Quando o fingerprint corresponde (re-adicionar idempotente), `replaced` é `false`.
- `shadowedSettings: true` — um servidor definido nas configurações com o mesmo nome existe; a entrada em runtime agora o sobrescreve. A entrada das configurações não é alterada e reaparece se a entrada em runtime for removida posteriormente.
- `toolCount` — número de ferramentas descobertas no servidor recém-conectado.

Resposta (200) — recusa suave (modo de aviso de orçamento):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Retornada quando `--mcp-budget-mode=warn` e adicionar o servidor excederia o `--mcp-client-budget` configurado. O servidor NÃO é conectado. Os chamadores devem expor a pressão do orçamento ao usuário.

Erros:

| Status | Código                    | Quando                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]`                      |
| `400`  | `missing_required_field`  | `config` ausente ou não é um objeto não nulo                                                          |
| `400`  | `invalid_client_id`       | Header `X-Qwen-Client-Id` presente, mas não registrado para este workspace                            |
| `400`  | `invalid_config`          | Formato da config rejeitado pelo validador de transporte MCP                                               |
| `401`  | `token_required`          | Nenhum bearer token configurado (gate estrito)                                                           |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` e o orçamento está cheio                                                     |
| `502`  | `mcp_server_spawn_failed` | Processo do servidor saiu ou atingiu timeout durante a conexão; o body carrega `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable` | Nenhum processo filho ACP ativo (nenhuma sessão foi criada ainda)                                                |

### `DELETE /workspace/mcp/servers/:name` — remover um servidor MCP em runtime

Com gate estrito. Desconecta o servidor e o remove do overlay em runtime. Idempotente — remover um nome que nunca foi adicionado retorna uma resposta de skip (não um erro).

O parâmetro de path `:name` é o nome do servidor codificado para URL.

Resposta (200) — sucesso:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — a entrada em runtime removida estava sobrescrevendo um servidor definido nas configurações com o mesmo nome. Essa entrada das configurações agora não está mais sobrescrita e será usada na próxima descoberta/reinício.

Resposta (200) — skip idempotente:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Retornada quando o nome não estava no overlay em runtime (ele ainda pode existir nas configurações — entradas de configurações não podem ser removidas via esta rota).

Erros:

| Status | Código                    | Quando                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`       | Header `X-Qwen-Client-Id` presente, mas não registrado para este workspace       |
| `401`  | `token_required`          | Nenhum bearer token configurado (gate estrito)                                      |
| `503`  | `acp_channel_unavailable` | Nenhum processo filho ACP ativo                                                             |

### Semântica de shadow (sobrescrita)

As entradas em runtime formam um overlay efêmero sobre os servidores MCP definidos nas configurações:

- **Adicionar** um servidor em runtime com o mesmo nome de uma entrada das configurações o **sobrescreve (shadows)** — a config em runtime tem precedência. A entrada original das configurações não é modificada.
- **Remover** um servidor em runtime que estava sobrescrevendo uma entrada das configurações **remove a sobrescrita (un-shadows)** — a config definida nas configurações torna-se ativa novamente na próxima conexão.
- **Reiniciar o daemon** perde todas as entradas em runtime. Apenas os servidores definidos nas configurações sobrevivem aos reinícios. Servidores em runtime têm escopo de tempo de vida da sessão.
- **`GET /workspace/mcp`** reporta a visão mesclada — tanto servidores definidos nas configurações quanto em runtime aparecem no array `servers[]`. Não há distinção no nível da rede entre as duas origens no snapshot hoje.

### Eventos

Ambas as rotas emitem eventos SSE com **escopo de workspace** (todos os buses de sessão ativos os recebem):

| Evento               | Emitido quando                | Campos do payload                                                                         |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` tem sucesso (não skip)   | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` tem sucesso (não skip) | `name`, `wasShadowingSettings`, `originatorClientId`                                   |
Respostas ignoradas (`budget_warning_only`, `not_present`) NÃO emitem eventos.

Eventos relacionados ao orçamento da superfície existente `mcp_guardrail_events` (`mcp_budget_warning`, `mcp_child_refused_batch`) também são disparados quando adições em tempo de execução excedem o limite do orçamento.

## Próximos passos

- **Configurando um daemon de longa duração?** [Modelos de inicialização local (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) para a v0.16-alpha (apenas local).
- **Criar um cliente?** Veja o [guia de início rápido do DaemonClient em TypeScript](../developers/examples/daemon-client-quickstart.md) e a [referência do protocolo HTTP](../developers/qwen-serve-protocol.md).
- **Lendo o código-fonte?** O código da bridge fica em `packages/cli/src/serve/`; o cliente do SDK em `packages/sdk-typescript/src/daemon/`.
- **Acompanhando o roadmap?** O progresso do Stage 1.5 / Stage 2 é acompanhado na issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).