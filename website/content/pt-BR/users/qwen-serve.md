# Modo daemon (`qwen serve`)

Execute o Qwen Code como um daemon HTTP local para que múltiplos clientes (plugins de IDE, UIs web, scripts de CI, CLIs personalizadas) compartilhem uma única sessão de agente via HTTP + Server-Sent Events, em vez de cada um gerar seu próprio subprocesso.

> **🚧 v0.16-alpha**: o `qwen serve` chega pela primeira vez ao npm na v0.16-alpha como **chat / codificação apenas de texto** com **deploy apenas local**. Anexos de imagem / arquivo no caminho do prompt, deploy em contêiner (Docker / k8s / nginx reverse-proxy) e hardening remoto / multi-daemon chegarão em um patch de acompanhamento quando um piloto empresarial for confirmado. Consulte [limites conhecidos da v0.16-alpha](#v016-alpha-known-limits) para a lista completa de itens adiados.

> **Status:** Estágio 1 (experimental). A superfície do protocolo está travada na tabela de rotas §04 da issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803). O Estágio 1.5 (flag `qwen --serve` — o TUI hospeda o mesmo servidor HTTP) e o Estágio 2 (refatoração in-process + polimento de `mDNS`/OpenAPI/WebSocket/Prometheus) estão imediatamente na sequência.
>
> **Transparência de escopo:** O Estágio 1 é dimensionado para **desenvolvedores criando protótipos de clientes contra a superfície do protocolo** e para **colaboração local de usuário único / equipes pequenas**. Cargas de trabalho de nível de produção com múltiplos clientes / longa duração / rede instável (companheiros móveis, bots de IM atingindo 1000+ chats) precisam das garantias do Estágio 1.5+ que não estão nesta release. Consulte [Garantias de runtime do Estágio 1.5+](#stage-15-runtime-guarantees) para a lista completa de lacunas e a #3803 para o roadmap de convergência.

## O que ele oferece

- **UI Web Shell integrada** — `qwen serve` serve o Web Shell baseado em navegador em sua raiz (`http://127.0.0.1:4170/`) pronto para uso; execute `qwen serve --open` para abri-lo automaticamente no seu navegador. Ele é servido na mesma origem da API, então não é necessária uma segunda porta ou reverse proxy. Passe `--no-web` para um daemon apenas de API.
- **Um processo de agente, muitos clientes** — sob o padrão `sessionScope: 'single'`, cada cliente conectando ao daemon compartilha uma sessão ACP. Colaboração ao vivo entre clientes na mesma conversa, nos mesmos diffs de arquivo, nos mesmos prompts de permissão.
- **Streaming seguro para reconexão** — SSE com reconexão `Last-Event-ID` permite que um cliente caia e retome exatamente de onde parou (dentro da janela de replay do ring).
- **Permissões para o primeiro a responder** — quando o agente pede permissão para executar uma ferramenta, todos os clientes conectados veem a solicitação; qualquer cliente que responder primeiro vence.
- **Um daemon, um workspace** — cada processo `qwen serve` se vincula a exatamente um workspace na inicialização (conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Deploys multi-workspace executam um daemon por workspace em portas separadas (ou atrás de um orquestrador).
- **Canais experimentais gerenciados pelo daemon** — `qwen serve --channel <name>` inicia um worker de canal pertencente ao ciclo de vida do daemon. O worker é um processo separado, conecta-se de volta ao daemon através do SDK e relata seu estado em `GET /daemon/status`.
- **Controle remoto de runtime** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — altere o modo de aprovação de uma sessão (`POST /session/:id/approval-mode`), alterne uma ferramenta por workspace (`POST /workspace/tools/:name/enable`), crie um `QWEN.md` vazio (`POST /workspace/init`, apenas mecânico — NÃO chama o modelo; para preenchimento por IA, faça um follow-up com `POST /session/:id/prompt`), reinicie um único servidor MCP com uma verificação prévia de budget (`POST /workspace/mcp/:server/restart`), ou adicione/remova servidores MCP em runtime sem reiniciar o daemon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Tudo com strict-gate — configure `--token` primeiro.
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
- ❌ **Coordenação multi-daemon em um host** — `1 daemon = 1 workspace × N sessões` é imposto. Federação cross-host, token keying de caminho de instância e limpeza de tokens obsoletos são adiados para a v0.16.x.
- ❌ **Tokens de daemon gerados automaticamente** — o alpha é BYO-token (a um `openssl rand -hex 32` de distância). Infraestrutura de auto-gen + token-store é adiada para a v0.16.x.

**Hardening — mínimo viável para usuário único local:**

- ✅ Gate de segurança no boot (recusa bind não-loopback sem um token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Gate de auth para rotas de mutação, roteamento de permissão com escopo de sessão (PRs da Wave 4)
- ✅ Guardrails de MCP + coordenação de permissão multi-cliente (F2 / F3)
- ✅ **Deadline absoluto do prompt + idle timeout do writer SSE** — opt-in via `--prompt-deadline-ms` e `--writer-idle-timeout-ms`; anunciado através de `prompt_absolute_deadline` e `writer_idle_timeout` quando habilitado.
- ✅ **Rate limiting HTTP** — opt-in via `--rate-limit` e thresholds por tier; anunciado através de `rate_limit` quando habilitado.
- ⏸️ **Métricas Prometheus + load test harness** — adiado para a instrumentação de escala F4 Phase-1 da v0.17 quando 30-50 sessões ativas se tornar um target real.
- ⏸️ **Flag CLI `--max-body-size`** — o daemon impõe `express.json({ limit: '10mb' })` por padrão, o que cobre confortavelmente prompts apenas de texto (as janelas de contexto do modelo estão bem abaixo de 10 MiB de caracteres). Ajustável via flag na v0.16.x.

Para a enumeração mais profunda do "o que não vamos corrigir no Estágio 1" (modelo de mutação de estado de sessão single-host + N sessões paralelas compartilhando um filho ACP), consulte [Limites de escopo do Estágio 1](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) abaixo.

## Quickstart

### 1. Inicie o daemon (loopback, sem auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

O bind padrão é `127.0.0.1:4170`. A auth Bearer está **desligada** no loopback para que o desenvolvimento local "simplesmente funcione". O daemon se vincula ao diretório de trabalho atual; use `--workspace /path/to/dir` para sobrescrever.

**Abra a UI Web Shell.** Navegue até `http://127.0.0.1:4170/` (ou inicie o daemon com `qwen serve --open` para abri-lo automaticamente) para o terminal completo no navegador — chat, diffs, chamadas de ferramenta e prompts de permissão. A UI é servida na raiz do daemon na mesma origem da API. O restante deste guia usa HTTP cru para que você possa criar scripts diretamente para a API.

### 2. Faça um sanity-check

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

O campo `workspaceCwd` expõe o workspace vinculado para que os clientes possam fazer um pre-flight check e omitir `cwd` no `POST /session`.
O campo `limits.maxPendingPromptsPerSession` anuncia o limite ativo de admissão de prompts por sessão; `null` significa que o limite está desativado.

### Execute canais a partir do daemon

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under one daemon-owned worker
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all
```

Este modo é experimental e gerenciado pelo daemon. Ele não substitui o comando standalone `qwen channel start`: canais standalone ainda usam o serviço `AcpBridge` com suporte ACP. Com `qwen serve --channel`, o daemon lança um processo worker de canal após o runtime HTTP estar pronto. Se o worker sair após a inicialização, o daemon continua rodando e `GET /daemon/status` relata um aviso `channel_worker_exited`. O restart automático do worker é adiado.

O daemon está vinculado a um workspace, então o `cwd` de cada canal selecionado deve resolver para o workspace do daemon. `--channel all` não pode ser combinado com canais nomeados.

O daemon também expõe snapshots de runtime somente leitura para UIs de clientes e
operadores: `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`, e
`GET /session/:id/tasks`, e `GET /session/:id/lsp`.

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
`auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`) para que as UIs dos clientes possam renderizar remediações
estruturadas.

O daemon também expõe helpers de arquivo de workspace:

- `GET /file` lê arquivos de texto e retorna um hash raw-byte `sha256:<hex>`.
- `GET /file/bytes` lê janelas de bytes crus limitados e retorna conteúdo em base64.
- `POST /file/write` cria ou substitui arquivos de texto.
- `POST /file/edit` aplica uma substituição de texto exata.

Write/edit são **rotas de mutação strict**: mesmo no loopback elas exigem um
bearer token configurado, caso contrário retornam `token_required`. Substituições
e edições exigem o `expectedHash` mais recente de `GET /file` (ou um
`GET /file/bytes` de janela completa). `create` nunca sobrescreve. Writes explícitos para caminhos ignorados
são permitidos, mas auditados. Writes binários, delete/move/mkdir e criação recursiva de pais
não fazem parte desta superfície.

### 3. Abra uma sessão

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` pode ser omitido — a rota faz fallback para o workspace vinculado do daemon. Postar um `cwd` que não corresponde ao workspace vinculado retorna `400 workspace_mismatch` (o daemon está vinculado a exatamente um workspace; inicie um daemon separado para um diferente).

Um segundo cliente postando em `/session` (qualquer `cwd` correspondente ou nenhum) recebe `"attached": true` — agora eles estão compartilhando o agente.

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

## Autenticação

Para qualquer coisa além do loopback, você **deve** passar um bearer token:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

Os clientes então enviam `Authorization: Bearer $QWEN_SERVER_TOKEN` em cada requisição. `/health` é isento **apenas em binds de loopback** para que as sondas de liveness do k8s/Compose dentro do pod (onde o daemon escuta em `127.0.0.1`) não precisem de credenciais. Em binds não-loopback (`--hostname 0.0.0.0` etc.) `/health` exige o token como qualquer outra rota — caso contrário, um atacante pode sondar endereços arbitrários para confirmar a existência do daemon. Use `/capabilities` para verificar se seu token está correto de ponta a ponta (ele sempre exige auth):

> **Loopback com hardening (`--require-auth`).** O comportamento padrão de loopback sem token é fine para um laptop de usuário único, mas inseguro em hosts de dev compartilhados, runners de CI ou workstations multi-tenant onde qualquer usuário local pode dar `curl 127.0.0.1:4170`. Passe `--require-auth` para tornar o bearer token obrigatório em todas as rotas — incluindo `/health` e `/capabilities` — mesmo quando vinculado a `127.0.0.1`. O boot falha sem um token. Com a flag ativada, um cliente **não autenticado** não pode ler `/capabilities` para descobrir que a auth é exigida; a superfície de descoberta é o próprio corpo da resposta 401. Uma vez autenticado, a tag `caps.features.require_auth` é uma confirmação pós-auth de que o deploy está com hardening (útil para UIs de auditoria / compliance):
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
| `--token <str>`                         | —               | Bearer token. Faz fallback para a variável de ambiente `QWEN_SERVER_TOKEN` (com espaços em branco no início/fim removidos — útil para `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | Recusa iniciar sem um bearer token, mesmo no loopback. Reforça a segurança do padrão de desenvolvedor `127.0.0.1` para hosts de desenvolvimento compartilhados / runners de CI / workstations multi-tenant, onde qualquer usuário local pode acessar o listener. Inicializa apenas com `--token` ou `QWEN_SERVER_TOKEN` definido; também protege `/health` atrás do bearer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | Caminho para um arquivo de certificado PEM. Serve via **HTTPS** em vez de HTTP. Deve ser pareado com `--tls-key` (a inicialização falha se apenas um for fornecido). Desbloqueia APIs de navegador de contexto seguro — entrada de voz (`getUserMedia`), WebRTC — através de um IP LAN, que os navegadores normalmente bloqueiam em `http://` simples. Apenas terminação TLS; sem geração automática / ACME. Veja [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) abaixo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —               | Caminho para um arquivo de chave privada PEM. Deve ser pareado com `--tls-cert`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `20`            | Limite de sessões ativas simultâneas. Novas requisições `POST /session` que gerariam um novo processo filho retornam `503` (com `Retry-After: 5`) quando o limite é atingido; anexos a sessões existentes NÃO são contados. Defina como `0` para desativar. Dimensionado para uso de usuário único / equipes pequenas; aumente se a sua implantação tiver margem de RAM/FD (~30–50 MB por sessão).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | Limite por sessão de prompts aceitos por `POST /session/:id/prompt` mas ainda não resolvidos, incluindo prompts na fila e o prompt ativo. O bridge rejeita o excesso de forma síncrona com `503`, `Retry-After: 5` e `code: "prompt_queue_full"` antes de retornar um `promptId`. Defina como `0` para desativar. `branchSession` serializa na mesma FIFO, mas não conta para este limite de prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | Caminho absoluto do workspace ao qual este daemon se vincula (conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 — 1 daemon = 1 workspace). Requisições `POST /session` com um `cwd` incompatível retornam `400 workspace_mismatch`. Para implantações com múltiplos workspaces, execute um `qwen serve` por workspace em portas separadas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--channel <name\|all>`                 | —               | Worker de canal gerenciado pelo daemon (experimental). Repita a flag para selecionar múltiplos canais configurados, ou passe `all` para iniciar todos os canais configurados. `all` não pode ser combinado com canais nomeados. Os valores de `cwd` dos canais selecionados devem resolver para o workspace do daemon. O worker é propriedade do `qwen serve`; pare o daemon para parar os canais gerenciados pelo serve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--max-connections <n>`                 | `256`           | Limite de conexões TCP no nível do listener (`server.maxConnections`). Limita a contagem de sockets brutos independentemente da contagem de sessões — clientes SSE lentos / fantasmas são rejeitados no momento do accept quando o limite é atingido. Aumente junto com `--max-sessions` se a sua implantação esperar muitos assinantes SSE por sessão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | Profundidade do ring de replay SSE por sessão (alvo do #3803 §02). Define o backlog disponível para `GET /session/:id/events` com `Last-Event-ID: N`. Maior = mais margem para reconexão ao custo de algumas centenas de KB de RAM extra por sessão. Clientes SDK também podem solicitar um limite de backlog maior por assinante em uma assinatura específica via `?maxQueued=N` (intervalo `[16, 2048]`, padrão 256). Daemons também emitem um frame SSE não terminal `slow_client_warning` ao atingir 75% de preenchimento da fila, para que os clientes possam drenar / reconectar antes de serem expulsos. Pre-flight `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`               | —               | Limite inteiro positivo de clientes MCP ativos **por sessão ACP** (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1; PR 23 promove isso para por workspace via o pool MCP compartilhado). Combine com `--mcp-budget-mode`. Quando não definido, não há aplicação baseada em contabilidade (mas `GET /workspace/mcp` ainda reporta `clientCount`). Distinto do `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code, que controla a concorrência de inicialização, não a contagem total de clientes. Pre-flight `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Como `--mcp-client-budget` é aplicado. `warn` (padrão quando o budget é definido): sem recusa, o `budgets[0].status` do snapshot muda para `warning` em ≥75% do budget. `enforce`: conexões além do limite são recusadas, a célula por servidor mostra `disabledReason: 'budget'`, determinístico pela ordem de declaração de `mcpServers`. `off` (padrão quando o budget não é definido): observabilidade pura. A inicialização rejeita `enforce` sem um budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--http-bridge`                         | `true`          | Modo Stage 1: um processo filho `qwen --acp` por daemon (vinculado a um workspace na inicialização, conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02); N sessões são multiplexadas nesse processo filho via ACP `newSession()`. O Stage 2 nativo in-process fica disponível posteriormente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Allowlist cross-origin para clientes webui do navegador. Repetível. Cada valor é `*` (qualquer origin — a inicialização recusa se nenhum bearer token estiver configurado; `--require-auth` no loopback é recomendado para que `/health` e `/demo` também sejam protegidos por bearer, já que ambos são pré-auth no loopback por padrão) ou um origin de URL canônico (`<scheme>://<host>[:<port>]`, sem barra final / path / userinfo / query). **Wildcards de subdomínio (`https://*.example.com`) são intencionalmente não suportados** — liste cada subdomínio explicitamente, ou use `*` com um token configurado (e `--require-auth` para endurecimento total). Origins correspondentes recebem headers de resposta CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, methods, headers, max-age e `Retry-After` exposto); origins não correspondentes ainda recebem um 403 com o mesmo envelope da barreira atual. `Origin: null` (iframes em sandbox, docs file://) é sempre rejeitado, mesmo sob `*`. Pre-flight via `caps.features.allow_origin`. Hits de self-origin no loopback não são afetados. |
| `--web` / `--no-web`                    | `true`          | Serve o SPA Web Shell compilado na raiz do daemon (`GET /`, `/assets/*` e fallback de deep-link do SPA). O shell estático é registrado **antes** do portão de bearer-auth — um navegador não pode anexar um token a um sub-recurso `<script>` ou a uma navegação na barra de endereços, o shell não carrega segredos e toda rota de API permanece protegida por token independentemente. Em bindings fora do loopback, um aviso de uma linha no stderr nota que a UI é acessível sem autenticação. Use `--no-web` para um daemon apenas de API. Sem efeito quando o build omite os assets do Web Shell (o daemon registra um breadcrumb e executa apenas a API).                                                                                                                                                                                                                                                                                                                                                         |
| `--open`                                | `false`         | Após o listener estar ativo, abre o Web Shell no seu navegador padrão na URL do daemon (com `#token=` anexado como um fragmento de URL quando um token está configurado — um fragmento nunca é enviado ao servidor, mantendo o token fora dos logs de acesso e headers Referer). No-op com `--no-web`, ou em ambientes headless / CI / SSH onde nenhum navegador está disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
> **Dimensionando os controles de carga.** `--max-sessions` é o limite de **novos processos filhos**.
> Três outras camadas também limitam a carga — ao dimensionar para um deployment de alta concorrência, ajuste-as em conjunto:
>
> - **nível do listener**: `--max-connections` / `server.maxConnections=256` limita as conexões TCP brutas (back-pressure de clientes lentos).
> - **assinantes por sessão**: o EventBus limita os assinantes SSE a 64 por sessão por padrão; o 65º cliente recebe um `stream_error` terminal e é fechado.
> - **admissões de prompt por sessão**: `--max-pending-prompts-per-session=5` limita os prompts na fila + ativos aceitos para uma sessão. O excesso recebe `503` com `Retry-After: 5`.
> - **backlog por assinante**: uma fila de 256 frames por cliente SSE; um cliente acima da capacidade recebe um frame terminal `client_evicted` e é fechado (um consumidor lento não pode travar o daemon).
>
> Esses limites interagem: `--max-sessions × 64 assinantes × 256 frames` é o pior caso de memória em trânsito na camada do EventBus, enquanto `--max-sessions × --max-pending-prompts-per-session` limita o trabalho de prompts aceitos na camada de admissão. O dimensionamento padrão assume carga de usuário único / equipe pequena; aumente progressivamente (e monitore o RSS) para deployments multi-tenant.

> **Guardrails do cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Um workspace que declara 30 servidores MCP em `mcpServers` iniciará 30 clientes sem limite upstream, a menos que você defina um. `--mcp-client-budget=N` limita a contagem de clientes MCP ativos; `--mcp-budget-mode={enforce,warn,off}` escolhe o comportamento. O padrão é `warn` quando um orçamento é definido (o snapshot exibe o aviso, mas nenhum cliente é recusado — útil para medir o fanout no mundo real antes de ativar a aplicação). Servidores recusados no modo `enforce` recebem `disabledReason: 'budget'` em sua célula por servidor, e a célula `budgets[0]` mostra `status: 'error'` + `errorKind: 'budget_exhausted'`. A reserva de slot é por nome de servidor e sobrevive a reconexões / timeouts de descoberta — um servidor recusado não pode tomar o slot de um servidor saudável.
>
> ⚠️ **Escopo v1: por sessão, não por workspace.** Cada sessão ACP dentro do daemon tem seu próprio `Config`/`McpClientManager` (criado via `newSessionConfig` por sessão). O orçamento limita os clientes MCP ativos **por sessão**, não agregados em todas as sessões do workspace. O snapshot em `GET /workspace/mcp` reflete a visão da sessão de bootstrap (a célula carrega `scope: 'session'` para transparência). Se você executar 5 sessões ACP concorrentes com `--mcp-client-budget=10`, poderá ter até 50 clientes MCP ativos em todo o daemon — o limite se mantém por sessão. **Wave 5 PR 23 (shared MCP pool)** introduz um gerenciador com escopo de workspace e promove isso para uma aplicação real por workspace.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Isso **não** é o mesmo que o `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code (que controla a concorrência de inicialização); eles são ortogonais. O PR 23 adicionará um pool MCP compartilhado real (uma célula `scope: 'workspace'` em `budgets[]` ao lado da célula por sessão); o PR 14 v1 é o contador em processo + aplicação flexível (soft enforcement) no gerenciador por sessão existente.
>
> **Eventos de push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Clientes SDK inscritos em `GET /session/:id/events` recebem frames tipados quando os limites do orçamento são cruzados — `mcp_budget_warning` (sintético, dispara uma vez por cruzamento ascendente de 75% com rearme por histerese em 37,5%, anunciado via `mcp_guardrail_events`) e `mcp_child_refused_batch` (coalescido uma vez por passagem de descoberta no modo `enforce`; tamanho 1 da recusa de lazy-spawn do `readResource`). O snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após reconexão; os eventos são bordas de mudança. Útil para dashboards em tempo real sem polling.

## Modelo de ameaça de deployment padrão

- **Apenas 127.0.0.1** — bind de loopback, sem necessidade de autenticação.
- **`--hostname 0.0.0.0` requer um token** — a inicialização é recusada sem um.
- **`LOOPBACK_BINDS` inclui IPv6** — `::1` e `[::1]` contam como loopback para a regra de sem-token.
- **Allowlist do cabeçalho Host** — em binds de **loopback**, o daemon verifica se `Host:` corresponde a `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` (case-insensitive conforme RFC 7230 §5.4) para se defender contra DNS rebinding. **Binds fora de loopback (`--hostname 0.0.0.0`) ignoram intencionalmente a allowlist de Host** — o operador escolheu a superfície de ataque, então o portão do bearer-token é a única camada de autenticação; reverse proxies / SNI / client cert pinning são responsabilidade do operador, não do daemon. Se você precisar de isolamento baseado em Host em um bind fora de loopback, termine o TLS + verifique o Host em um proxy frontal.
- **CORS nega qualquer Origin de navegador por padrão** — retorna JSON `403`. Passe **`--allow-origin <pattern>`** (repetível, T2.4 #4514) para permitir origins de navegadores específicos. Cada valor é o literal `*` (qualquer origin — a inicialização recusa se nenhum bearer token estiver configurado; `--require-auth` em loopback é recomendado para hardening completo, já que `/health` e `/demo` permanecem pré-autenticação em loopback por padrão) ou uma origin de URL canônica (`<scheme>://<host>[:<port>]`, sem barra final / path / userinfo). Origins correspondentes recebem cabeçalhos de resposta CORS adequados (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, além de métodos / cabeçalhos / max-age padrão e `Retry-After` exposto); origins não correspondentes ainda recebem um 403 com o mesmo envelope do muro padrão. `caps.features.allow_origin` é anunciado condicionalmente para que clientes SDK / webui possam fazer pre-flight para saber se o daemon honra requisições cross-origin antes de emiti-las. Exemplo: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Requisições de self-origin de loopback (ex: a página `/demo`) não são afetadas — um shim separado de remoção de Origin as trata independentemente do `--allow-origin`. **Webuis de navegador sem `--allow-origin` configurado** ainda recorrem às mesmas opções do Stage 1 de antes: empacote como um shell nativo (Electron/Tauri) para que nenhum cabeçalho `Origin` seja enviado, ou coloque o daemon atrás de um reverse proxy de mesma origem.
- **O processo filho `qwen --acp` gerado herda o ambiente do daemon** com uma limpeza explícita: `QWEN_SERVER_TOKEN` é removido antes do filho iniciar (o próprio bearer do daemon; o agente não precisa dele). Todo o resto — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / seu `modelProviders[].envKey` personalizado / etc. — é repassado, porque o agente legitimamente precisa deles para se autenticar no LLM. **Isso é intencional, não é uma sandbox.** O agente é executado com o mesmo UID e tem acesso a ferramentas de shell, então qualquer coisa em `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` é acessível por injeção de prompt de qualquer maneira. O repasse de ambiente não é o limite de segurança; o usuário-como-raiz-de-confiança é. Não execute `qwen serve` sob uma identidade que possua credenciais residentes no ambiente com as quais você não confiaria no agente.
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

## Deployment multi-sessão e multi-workspace

Conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, cada processo `qwen serve` se vincula a **um workspace** na inicialização. Dentro desse workspace, ele multiplexa N sessões em um único processo filho `qwen --acp` através do mapa de sessões nativo do agente — as sessões compartilham o processo do filho / estado OAuth / cache de leitura de arquivo / parse de memória hierárquica.

Para hospedar **múltiplos workspaces** (um usuário, vários repositórios; ou vários usuários no mesmo host), execute **múltiplos processos daemon** — um por workspace, cada um em sua própria porta, supervisionados por systemd / docker-compose / k8s / um orquestrador de referência `qwen-coordinator`. A compensação é intencional: um workspace por filho significa que `loadSettings(cwd)` / OAuth / escopo do servidor MCP permanecem alinhados com o diretório vinculado e não divergem entre as requisições.

> **Inscreva-se ANTES de postar `modelServiceId` no attach.** Quando um cliente faz `POST /session` com um `modelServiceId` e o workspace já tem uma sessão executando um modelo diferente, o daemon emite uma chamada interna `setSessionModel` — falhas NÃO são propagadas como um erro HTTP (a sessão continua operacional em seu modelo atual). O sinal de falha visível é um evento `model_switch_failed` no stream SSE da sessão. Se você chamar `POST /session` e SOMENTE DEPOIS abrir `GET /session/:id/events`, você perderá o evento de falha e continuará falando silenciosamente com o modelo errado. Abra o stream SSE primeiro, ou passe `Last-Event-ID: 0` na inscrição para repetir o evento mais antigo disponível no ring.

Para lidar com múltiplos **usuários** (cada um com sua própria cota, log de auditoria, sandbox) ou para escalar além do alcance de um único processo (orçamento de cold-start, contagem de FD, RSS), gere um daemon por workspace por usuário atrás de um orquestrador externo. Esse orquestrador (multi-tenancy / OIDC / Quota / Audit / k8s) está **fora do escopo** do projeto qwen-code — veja a issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" para as diretrizes de design.

## Carregando e retomando uma sessão persistida

O daemon expõe o fluxo `session/load` e de retomada do ACP sobre HTTP via duas rotas:

| Rota                      | Quando usar                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | O cliente **não** tem histórico renderizado (reconexão a frio, picker-then-open). O daemon repete cada turno persistido através do SSE para que os assinantes vejam a transcrição completa. Tag de capacidade: `session_load`.                                                                                        |
| `POST /session/:id/resume` | O cliente já tem os turnos na tela e só precisa do handle do lado do daemon de volta. O contexto do modelo é restaurado no lado do agente sem repetição de UI — o stream SSE permanece limpo. Tag de capacidade: `session_resume` (`unstable_session_resume` permanece como um alias depreciado para clientes mais antigos). |

O SDK TypeScript expõe ambos como fábricas estáticas em `DaemonSessionClient`:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay history through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

Faça pre-flight de `caps.features.session_load` / `caps.features.session_resume` antes de chamar — daemons mais antigos retornam `404`. `unstable_session_resume` ainda é anunciado como um alias de compatibilidade depreciado. Requisições concorrentes da mesma ação para o mesmo id são coalescidas; corridas de ações cruzadas (um `load` competindo com um `resume`) recebem `409 restore_in_progress` com `Retry-After: 5`. Veja a [referência do protocolo](../developers/qwen-serve-protocol.md) para o envelope de erro completo.

Nota: a repetição de histórico é limitada pelo ring SSE (padrão de 8000 frames). Históricos longos com turnos verbosos podem exceder isso — os frames mais antigos são descartados silenciosamente. Para sessões muito longas, prefira `resume` e confie na UI persistida local do cliente.

## Modelo de durabilidade

**As sessões ainda são efêmeras no Stage 1 entre reinicializações do daemon**, mas sessões persistidas em disco podem ser recarregadas:

- Um crash de processo filho publica `session_died` e remove a sessão ativa dos mapas do daemon. A sessão persistida em disco **pode** ser recarregada via `POST /session/:id/load` se um novo processo filho do agente puder ser gerado.
- Uma reinicialização do daemon perde todas as sessões ativas em andamento. As sessões persistidas permanecem em disco e podem ser carregadas em um novo processo daemon, sujeitas às mesmas regras de vinculação de workspace.
- Desconexões longas do cliente (>5 min em um turno verboso) podem ultrapassar o ring de repetição SSE (padrão de 8000 frames) — a reconexão com `Last-Event-ID` é bem-sucedida, mas o estado pode ficar incoerente. Para clientes móveis / de rede instável, planeje reabrir o SSE em quedas longas ou chame `POST /session/:id/load` para repetir a partir do disco.
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

### N sessões paralelas compartilham um processo filho `qwen --acp`

Múltiplas sessões no mesmo workspace **compartilham um processo filho `qwen --acp`** através do suporte nativo multi-sessão do agente (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). A bridge chama `connection.newSession({cwd, mcpServers})` para cada sessão — o agente as armazena em seu mapa de sessões e faz o demultiplexing do `sessionId` por chamada.

Custo concreto com N=5 sessões no mesmo workspace:

| Recurso                              | Por sessão  | Com N=5                      |
| ------------------------------------ | ----------- | ---------------------------- |
| Processo Node do Daemon              | um          | **30–50 MB** (um daemon)     |
| Processo filho `qwen --acp`          | compartilhado | **60–100 MB** (um processo filho) |
| Processos filhos de servidor MCP     | por sessão  | 3×N se as configs diferirem  |
| `FileReadCache` (heap do processo filho) | compartilhado | parseado uma vez             |
| Parse de memória `CLAUDE.md` / hierarquia | compartilhado | parseado uma vez             |
| Estado de refresh-token OAuth        | compartilhado | **um caminho de refresh**    |
| Fatos aprendidos de Auto-memory      | compartilhado | uma base de conhecimento por processo filho |
| Cold start                           | apenas o primeiro | <200 ms após a primeira sessão |

A bridge mantém **um canal por daemon** (um daemon por workspace, conforme §02). O canal permanece ativo enquanto pelo menos uma sessão estiver ativa; o último `killSession` (ou um crash no nível do canal) encerra o processo filho.

**Processos filhos de servidor MCP** ainda são por sessão hoje — a config de cada sessão pode especificar servidores diferentes, então eles são spawnados independentemente. Follow-up do Stage 1.5: fazer refcount dos processos filhos de servidor MCP por `(workspace, config-hash)` para que configs idênticas compartilhem. Fora do escopo deste PR.

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

O `qwen serve` grava um log de diagnóstico por processo em:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Um symlink `latest` no mesmo diretório sempre aponta para o log do processo atual, então `tail -f ~/.qwen/debug/daemon/latest` seguirá qualquer daemon que esteja em execução.

O log captura mensagens de ciclo de vida, erros de rota (com contexto `route=` e `sessionId=`), stderr do processo filho ACP e — quando `QWEN_SERVE_DEBUG=1` está definido — breadcrumbs extras da bridge. Linhas que vão para o stderr hoje ainda vão para o stderr; o log em arquivo é **aditivo**, não um substituto.

### Desativando

Defina `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) para pular o log em arquivo completamente. A saída do stderr não é afetada.

### Relação com logs de debug de sessão

Logs de debug com escopo de sessão (`~/.qwen/debug/<sessionId>.txt` e o symlink `~/.qwen/debug/latest`) são independentes. O log do daemon fica em um subdiretório irmão `daemon/`; a semântica de debug por sessão não é alterada por este recurso.

### Sem rotação

O log do daemon é adicionado indefinidamente. Faça a rotação manualmente se ficar muito grande. Uma melhoria futura pode adicionar rotação automática; acompanhe através dos follow-ups da issue [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

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