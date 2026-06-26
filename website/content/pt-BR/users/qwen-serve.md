# Modo daemon (`qwen serve`)

Execute o Qwen Code como um daemon HTTP local para que múltiplos clientes (plugins de IDE, interfaces web, scripts de CI, CLIs customizados) compartilhem uma sessão de agente via HTTP + Server-Sent Events em vez de cada um criar seu próprio subprocesso.

> **🚧 v0.16-alpha**: `qwen serve` chega ao npm pela primeira vez na v0.16-alpha como **chat / codificação somente texto** com **implantação somente local**. Anexos de imagem/arquivo no caminho do prompt, implantação em contêiner (Docker / k8s / nginx reverse-proxy) e endurecimento remoto / multi-daemon serão incluídos em um patch de acompanhamento quando um piloto empresarial for comprometido. Consulte [limitações conhecidas da v0.16-alpha](#limitações-conhecidas-da-v016-alpha) para a lista completa de itens adiados.

> **Status:** Estágio 1 (experimental). A superfície do protocolo está fixada na tabela de rotas §04 da issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803). O Estágio 1.5 (flag `qwen --serve` — TUI coabita o mesmo servidor HTTP) e o Estágio 2 (refatoração em processo + polimento `mDNS`/OpenAPI/WebSocket/Prometheus) vêm imediatamente a seguir.
>
> **Honestidade de escopo:** O Estágio 1 é dimensionado para **desenvolvedores prototipando clientes contra a superfície do protocolo** e para **colaboração local de um único usuário / pequena equipe**. Cargas de trabalho de nível de produção com múltiplos clientes / execução longa / rede instável (companheiros móveis, bots de IM alcançando 1000+ chats) precisam das garantias do Estágio 1.5+ que não estão nesta versão. Consulte [Garantias de runtime do Estágio 1.5+](#garantias-de-runtime-do-estágio-15) para a lista completa de lacunas e #3803 para o roadmap de convergência.

## O que ele oferece

- **Interface Web Shell incorporada** — `qwen serve` serve a Web Shell baseada em navegador em sua raiz (`http://127.0.0.1:4170/`) pronta para uso; execute `qwen serve --open` para abri-la automaticamente no seu navegador. Ela é servida na mesma origem da API, então não é necessária uma segunda porta ou proxy reverso. Use `--no-web` para um daemon somente API.
- **Um processo de agente, muitos clientes** — sob o `sessionScope: 'single'` padrão, todo cliente que se conecta ao daemon compartilha uma sessão ACP. Colaboração ao vivo entre clientes na mesma conversa, nos mesmos diffs de arquivo, nos mesmos prompts de permissão.
- **Streaming seguro para reconexão** — SSE com reconexão via `Last-Event-ID` permite que um cliente caia e retome exatamente de onde parou (dentro da janela de repetição do anel).
- **Permissões de primeiro respondedor** — quando o agente pede permissão para executar uma ferramenta, todo cliente conectado vê a solicitação; qualquer cliente que responder primeiro vence.
- **Um daemon, um workspace** — cada processo `qwen serve` se liga exatamente a um workspace na inicialização (conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Implantações multi-workspace executam um daemon por workspace em portas separadas (ou atrás de um orquestrador).
- **Controle de runtime remoto** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — altere o modo de aprovação de uma sessão (`POST /session/:id/approval-mode`), ative/desative uma ferramenta por workspace (`POST /workspace/tools/:name/enable`), crie um `QWEN.md` vazio (`POST /workspace/init`, apenas mecânico — NÃO chama o modelo; para preenchimento por IA, siga com `POST /session/:id/prompt`), reinicie um servidor MCP específico com uma verificação prévia de orçamento (`POST /workspace/mcp/:server/restart`), ou adicione/remova servidores MCP em tempo de execução sem reiniciar o daemon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Todos estritamente protegidos — configure `--token` primeiro.
- **Resumo da sessão** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) follow-up) — busque um resumo de uma frase "onde eu parei" de uma sessão ativa (`POST /session/:id/recap`). Embrulha o `generateSessionRecap` do core como uma consulta lateral contra o modelo rápido; não polui o histórico principal do chat nem o stream SSE. Portão não estrito (mesma postura que `/prompt`); helper SDK `client.recapSession(sessionId)`.
  - **Limitação conhecida — amplificação de custo de tokens:** a rota é um endpoint de custo puro (cada chamada é uma consulta lateral LLM, sem benefício de estado) e o daemon não tem limite de taxa por rota na v1. Em um loopback sem token padrão, um cliente local defeituoso ou malicioso pode enviar spam para queimar tokens. Configure `--token` (e opcionalmente `--require-auth`) em hosts de desenvolvimento compartilhados antes de expor o daemon.
  - **Segurança de resumo simultâneo:** duas chamadas `/recap` simultâneas na mesma sessão executam duas consultas laterais independentes. `generateSessionRecap` lê um snapshot do histórico do chat via `GeminiClient.getChat().getHistory()` e o alimenta em uma chamada separada `BaseLlmClient.generateText` (via `runSideQuery`); nunca anexa ou altera o `GeminiChat` da sessão. Seguro chamar de múltiplos clientes sem coordenação.

## Limitações conhecidas da v0.16-alpha

O primeiro lançamento npm do `qwen serve` (v0.16-alpha) é intencionalmente estreito — chat / codificação somente texto para desenvolvedores executando o daemon em suas próprias máquinas. A lista abaixo torna explícita a superfície adiada para que adotantes possam planejar em torno disso; tudo aqui está no roadmap de patches da v0.16.x ou em um lançamento de acompanhamento de curto prazo.

**Superfície do produto — somente texto:**

- ✅ Prompts de texto e respostas de texto (chat, codificação, chamadas de ferramenta, integração MCP)
- ❌ **Anexos de imagem/arquivo no caminho do prompt** — `MessageEmitter` atualmente apenas renderiza texto; o eco multimodal chega quando um alvo alpha com necessidades de imagem for comprometido (#4175 chiga0 #27 P0 item)
- ❌ **Uploads em streaming** — mesma proteção que multimodal

**Superfície de implantação — somente local:**

- ✅ Loopback (`127.0.0.1`, padrão) — sem autenticação necessária, adequado para workstations de desenvolvimento
- ✅ Inicialização local via `systemd` / `launchd` / `nohup &` / `tmux` — consulte [Modelos de inicialização local](./qwen-serve-deploy-local.md)
- ✅ Traga seu próprio token Bearer via variável de ambiente `QWEN_SERVER_TOKEN` ([Autenticação](#autenticação) para configuração)
- ❌ **Implantação em contêiner** — Docker / Compose / Kubernetes / nginx reverse-proxy com terminação TLS NÃO na v0.16-alpha. Adiado para v0.16.x assim que um piloto empresarial for comprometido (caso contrário, apodreceria por ninguém validar).
- ❌ **Coordenação multi-daemon em um único host** — `1 daemon = 1 workspace × N sessões` é aplicado. Federação entre hosts, chaveamento de token por caminho de instância e limpeza de tokens obsoletos adiados para v0.16.x.
- ❌ **Tokens de daemon gerados automaticamente** — alpha é traga seu próprio token (a um `openssl rand -hex 32` de distância). Infraestrutura de geração automática + armazenamento de tokens adiada para v0.16.x.

**Endurecimento — mínimo viável para um único usuário local:**

- ✅ Portão de segurança na inicialização (recusa bind não-loopback sem um token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Portão de autenticação em rotas de mutação, roteamento de permissão com escopo de sessão (PRs da Onda 4)
- ✅ Barreiras de proteção MCP + coordenação de permissão multi-cliente (F2 / F3)
- ✅ **Prazo absoluto do prompt + timeout ocioso do writer SSE** — opt-in via `--prompt-deadline-ms` e `--writer-idle-timeout-ms`; anunciado através de `prompt_absolute_deadline` e `writer_idle_timeout` quando ativado.
- ✅ **Limitação de taxa HTTP** — opt-in via `--rate-limit` e limites por nível; anunciado através de `rate_limit` quando ativado.
- ⏸️ **Métricas Prometheus + arcabouço de teste de carga** — adiado para v0.17 F4 Fase 1 instrumentação de escala quando 30-50 sessões ativas se tornarem um alvo real.
- ⏸️ **Flag CLI `--max-body-size`** — o daemon aplica `express.json({ limit: '10mb' })` por padrão, o que cobre confortavelmente prompts somente texto (janelas de contexto de modelo estão bem abaixo de 10 MiB de caracteres). Ajustável via flag na v0.16.x.

Para a enumeração mais profunda "o que não consertaremos no Estágio 1" (modelo de mutação de estado de sessão em host único + N sessões paralelas compartilhando um filho ACP), consulte [Limites de escopo do Estágio 1](#limites-de-escopo-do-estágio-1--o-que-não-consertaremos-no-estágio-15) abaixo.

## Início rápido

### 1. Iniciar o daemon (loopback, sem autenticação)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

O bind padrão é `127.0.0.1:4170`. A autenticação Bearer está **desligada** em loopback para que o desenvolvimento local "funcione de imediato". O daemon se liga ao diretório de trabalho atual; use `--workspace /path/to/dir` para sobrescrever.

**Abra a interface Web Shell.** Navegue para `http://127.0.0.1:4170/` (ou inicie o daemon com `qwen serve --open` para abri-lo automaticamente) para o terminal completo do navegador — chat, diffs, chamadas de ferramenta e prompts de permissão. A interface é servida na raiz do daemon na mesma origem da API. O restante deste guia usa HTTP bruto para que você possa escrever scripts contra a API diretamente.

### 2. Verificação de sanidade

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

O campo `workspaceCwd` exibe o workspace vinculado para que clientes possam verificar previamente e omitir `cwd` em `POST /session`.
O campo `limits.maxPendingPromptsPerSession` anuncia o limite ativo de admissão de prompts por sessão; `null` significa que o limite está desabilitado.

O daemon também expõe snapshots de runtime somente leitura para interfaces de cliente e
operadores: `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`, e
`GET /session/:id/tasks`, e `GET /session/:id/lsp`.

`GET /session/:id/status` retorna o resumo da bridge ao vivo para uma única sessão:
`sessionId`, `workspaceCwd`, `createdAt`, opcional `displayName`, `clientCount`,
e `hasActivePrompt`. Responde com `200` e o resumo quando o daemon possui uma
sessão ativa com aquele id, e `404` (corpo `{ "error": …, "sessionId": … }`)
caso contrário. Use para verificar se uma sessão conhecida ainda está em execução
(`hasActivePrompt`) ou quantos clientes estão anexados (`clientCount`) sem
buscar e escanear toda a lista paginada de sessões:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Esta é a visão bruta da sessão ao vivo, então `clientCount` e `hasActivePrompt` correspondem
à entrada correspondente em `GET /workspace/:id/sessions` — mas as duas rotas
não são byte-idênticas. O endpoint de lista enriquece cada item com dados
persistidos do armazenamento de sessão: seu `createdAt` é o horário do primeiro prompt persistido, e
adiciona `updatedAt` mais um `displayName` derivado do título armazenado ou do primeiro
prompt. `/status` em vez disso reporta o próprio `createdAt` da sessão ao vivo, omite
`updatedAt`, e retorna `displayName` apenas quando um foi definido na sessão ao vivo.

`GET /session/:id/lsp` retorna o status LSP estruturado por sessão. Inicie o
daemon com `--experimental-lsp` para habilitar LSP nas sessões do agente geradas;
caso contrário, a rota retorna `enabled: false` sem servidores.

`GET /daemon/status` é o snapshot consolidado de solução de problemas. O padrão
`detail=summary` lê apenas o estado do daemon em memória (sessões, permissões,
contagens de transporte SSE/ACP, rejeições por limite de taxa, memória do processo, limites resolvidos)
e não inicia o filho ACP. Use `GET /daemon/status?detail=full` para
diagnósticos por sessão, detalhes de conexão ACP, contagens de fluxo de dispositivo de autenticação
e seções de status do workspace quando você estiver investigando ativamente um problema.

`GET /workspace/mcp`, `GET /workspace/skills` e `GET /workspace/providers`
reportam o runtime ACP ao vivo e não iniciam o filho ACP quando ocioso; um
daemon ocioso retorna `initialized: false` com um snapshot vazio. Assim que uma
sessão está ativa, eles mudam para `initialized: true` e exibem o estado
real.

`GET /workspace/env` e `GET /workspace/preflight` sempre respondem com
`initialized: true` independentemente do estado ACP. `env` nunca consulta ACP
(apenas informações do processo do daemon); `preflight` responde com células de nível de daemon
de `process.*` e emite placeholders `status: 'not_started'` para células
de nível ACP quando o filho está ocioso.

`GET /workspace/env` reporta o runtime do processo do daemon, plataforma, sandbox,
proxy, e a **presença** (nunca o valor) de variáveis de ambiente secretas na lista branca
como `OPENAI_API_KEY`. URLs de proxy são limpas de credenciais e reduzidas
a `host:port` antes de irem para o fio. A rota sempre responde a partir do
processo do daemon diretamente e nunca gera um filho ACP.

`GET /workspace/preflight` retorna uma lista de verificações de prontidão. **Células de nível de daemon**
(versão do Node, ponto de entrada CLI, diretório do workspace, ripgrep, git, npm)
sempre renderizam. **Células de nível ACP** (autenticação, descoberta MCP, skills, provedores,
registro de ferramentas, egress) requerem um filho ACP ao vivo — quando o daemon está ocioso
elas emitem placeholders `status: 'not_started'` em vez de gerar ACP apenas para
preenchê-los. Falhas mapeiam para um enum fechado `errorKind` (`missing_binary`,
`auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`) para que interfaces de cliente possam renderizar
remediação estruturada.

O daemon também expõe helpers de arquivo do workspace:

- `GET /file` lê arquivos de texto e retorna um hash `sha256:<hex>` em bytes brutos.
- `GET /file/bytes` lê janelas limitadas de bytes brutos e retorna conteúdo base64.
- `POST /file/write` cria ou substitui arquivos de texto.
- `POST /file/edit` aplica uma substituição de texto exata.

Write/edit são **rotas de mutação estritas**: mesmo em loopback exigem um
token Bearer configurado, caso contrário retornam `token_required`. Substituições
e edições exigem o `expectedHash` mais recente de `GET /file` (ou uma janela completa
`GET /file/bytes`). `create` nunca sobrescreve. Escritas explícitas em caminhos ignorados
são permitidas, mas auditadas. Escritas binárias, delete/move/mkdir e criação recursiva
de pai não fazem parte desta superfície.

### 3. Abrir uma sessão

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` pode ser omitido — a rota recai para o workspace vinculado do daemon. Enviar um `cwd` que não corresponde ao workspace vinculado retorna `400 workspace_mismatch` (o daemon está vinculado exatamente a um workspace; inicie um daemon separado para um diferente).

Um segundo cliente enviando para `/session` (qualquer `cwd` correspondente ou nenhum) recebe `"attached": true` — eles agora estão compartilhando o agente.

### 4. Assinar o stream de eventos (primeiro em outro terminal)

```bash
SESSION_ID="<do passo 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

A linha `data:` é o **envelope de evento completo** — `{id?, v, type, data, originatorClientId?}` — JSON-stringified em uma única linha. O payload ACP (o bloco `sessionUpdate` neste exemplo) fica sob `data` dentro desse envelope. As linhas de conveniência `id:` / `event:` do nível SSE são para clientes EventSource; os mesmos valores aparecem dentro do envelope JSON para que consumidores `fetch` brutos também os obtenham.

Abra isso **antes** de enviar o prompt — o buffer de replay SSE mantém os
últimos 8000 eventos, então um assinante tardio pode recuperar via `Last-Event-ID`,
mas para o caso simples de "assistir um único prompt" é mais fácil assinar
primeiro e deixar fluir ao vivo.

O stream emite `session_update` (chunks LLM, chamadas de ferramenta, uso),
`permission_request` (ferramenta precisa de aprovação), `permission_resolved`
(algum votou), `model_switched`, `model_switch_failed`, e os frames
terminais `session_died` (filho do agente crashou — SSE então fecha) e
`client_evicted` (sua fila transbordou — SSE então fecha).

### 5. Enviar um prompt (de volta no terminal original)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"O que src/main.ts faz?"}]}'
# → {"stopReason":"end_turn"}
```

O `curl -N` do passo 4 imprimirá os frames à medida que chegarem.

## Autenticação

Para qualquer coisa além de loopback, você **deve** passar um token Bearer:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

Os clientes então enviam `Authorization: Bearer $QWEN_SERVER_TOKEN` em cada requisição. `/health` é isento **apenas em binds de loopback** para que probes de vivacidade do k8s/Compose dentro do pod (onde o daemon escuta em `127.0.0.1`) não precisem de credenciais. Em binds não-loopback (`--hostname 0.0.0.0` etc.) `/health` exige o token como qualquer outra rota — caso contrário, um atacante pode sondar endereços arbitrários para confirmar a existência do daemon. Use `/capabilities` para verificar se seu token está correto de ponta a ponta (sempre requer autenticação):

> **Loopback endurecido (`--require-auth`).** O comportamento padrão de loopback sem token é adequado para um laptop de usuário único, mas inseguro em hosts de desenvolvimento compartilhados, runners CI ou workstations multi-inquilino onde qualquer usuário local pode `curl 127.0.0.1:4170`. Use `--require-auth` para tornar o token Bearer obrigatório em todas as rotas — incluindo `/health` e `/capabilities` — mesmo quando vinculado a `127.0.0.1`. A inicialização falha sem um token. Com a flag ativada, um cliente **não autenticado** não pode ler `/capabilities` para descobrir que a autenticação é necessária; a superfície de descoberta é o próprio corpo da resposta 401. Uma vez autenticado, a tag `caps.features.require_auth` é uma confirmação pós-autenticação de que a implantação está endurecida (útil para auditoria / interfaces de conformidade):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (ou qualquer índice — não nulo após autenticar significa que a tag está presente)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Token errado → 401
```

A comparação do token é de tempo constante (SHA-256 + `crypto.timingSafeEqual`); as respostas 401 são uniformes entre "cabeçalho ausente", "esquema errado" e "token errado" para que um canal lateral não possa distinguir.

## Flags da CLI

| Flag | Padrão | Propósito |
| ---- | ------ | --------- |
| `--port <n>` | `4170` | Porta TCP. `0` = porta efêmera atribuída pelo SO. |
| `--hostname <addr>` | `127.0.0.1` | Interface de bind. Qualquer coisa além de loopback requer um token. |
| `--token <str>` | — | Token Bearer. Recai sobre a variável de ambiente `QWEN_SERVER_TOKEN` (com espaços em branco iniciais/finais removidos — útil para `$(cat token.txt)`). |
| `--require-auth` | `false` | Recusa iniciar sem um token Bearer, mesmo em loopback. Fortalece o padrão de desenvolvedor `127.0.0.1` para hosts de desenvolvimento compartilhados / runners CI / estações de trabalho multi-inquilino onde qualquer usuário local pode acessar o listener. Inicia apenas com `--token` ou `QWEN_SERVER_TOKEN` definido; também protege `/health` com o token. |
| `--max-sessions <n>` | `20` | Limite de sessões ativas simultâneas. Novas requisições `POST /session` que criariam um novo filho retornam `503` (com `Retry-After: 5`) quando o limite é atingido; anexos a sessões existentes NÃO são contados. Defina como `0` para desabilitar. Dimensionado para uso individual / pequena equipe; aumente se sua implantação tiver espaço de RAM/FD (~30–50 MB por sessão). |
| `--max-pending-prompts-per-session <n>` | `5` | Limite por sessão de prompts aceitos por `POST /session/:id/prompt` mas ainda não resolvidos, incluindo prompts na fila e o prompt ativo. A bridge rejeita excesso de forma síncrona com `503`, `Retry-After: 5`, e `code: "prompt_queue_full"` antes de retornar um `promptId`. Defina como `0` para desabilitar. `branchSession` serializa na mesma FIFO mas não conta para este limite. |
| `--workspace <path>` | `process.cwd()` | Caminho absoluto do workspace ao qual este daemon se liga (conforme #3803 §02 — 1 daemon = 1 workspace). Requisições `POST /session` com um `cwd` diferente retornam `400 workspace_mismatch`. Para implantações multi-workspace, execute um `qwen serve` por workspace em portas separadas. |
| `--max-connections <n>` | `256` | Limite de conexões TCP no nível do listener (`server.maxConnections`). Limita a contagem bruta de sockets independentemente da contagem de sessões — clientes SSE lentos/fantasmas são rejeitados no momento da aceitação quando cheio. Aumente junto com `--max-sessions` se sua implantação esperar muitos assinantes SSE por sessão. |
| `--event-ring-size <n>` | `8000` | Profundidade do anel de replay SSE por sessão (#3803 §02 alvo). Define o backlog disponível para `GET /session/:id/events` com `Last-Event-ID: N`. Maior = mais margem para reconexão ao custo de algumas centenas de KB extras de RAM por sessão. Clientes SDK podem adicionalmente solicitar um backlog maior por assinante em uma assinatura específica via `?maxQueued=N` (faixa `[16, 2048]`, padrão 256). Daemons também emitem um frame SSE não-terminal `slow_client_warning` a 75% da fila para que clientes possam drenar/reconectar antes de serem ejetados. Pré-voo `caps.features.slow_client_warning`. |
| `--mcp-client-budget <n>` | — | Limite inteiro positivo de clientes MCP ativos **por sessão ACP** (issue #4175 PR 14 v1; PR 23 gradua isso para por workspace através do pool MCP compartilhado). Combine com `--mcp-budget-mode`. Quando não definido, sem aplicação baseada em contabilidade (mas `GET /workspace/mcp` ainda relata `clientCount`). Distinto do `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code que controla a concorrência de inicialização, não a contagem total de clientes. Pré-voo `caps.features.mcp_guardrails`. |
| `--mcp-budget-mode <m>` | `warn` / `off` | Como `--mcp-client-budget` é aplicado. `warn` (padrão quando orçamento definido): nenhuma recusa, o `budgets[0].status` do snapshot muda para `warning` em ≥75% do orçamento. `enforce`: conexões além do limite são recusadas, célula por servidor mostra `disabledReason: 'budget'`, determinístico pela ordem de declaração `mcpServers`. `off` (padrão quando orçamento não definido): pura observabilidade. A inicialização rejeita `enforce` sem um orçamento. |
| `--http-bridge` | `true` | Modo Estágio 1: um filho `qwen --acp` por daemon (ligado a um workspace na inicialização, conforme #3803 §02); N sessões multiplexadas nesse filho via ACP `newSession()`. O Estágio 2 nativo em processo estará disponível posteriormente. |
| `--allow-origin <pat>` | — | T2.4 (#4514). Lista de permissões de origens cruzadas para clientes webui de navegador. Repetível. Cada valor é `*` (qualquer origem — a inicialização recusa se nenhum token Bearer estiver configurado; `--require-auth` em loopback é recomendado para que `/health` e `/demo` também sejam protegidos por token, já que ambos são pré-autenticados em loopback por padrão) ou uma origem de URL canônica (`<scheme>://<host>[:<port>]`, sem barra final / caminho / userinfo / query). **Wildcards de subdomínio (`https://*.example.com`) são intencionalmente não suportados** — liste cada subdomínio explicitamente, ou use `*` com um token configurado (e `--require-auth` para endurecimento completo). Origens correspondidas recebem cabeçalhos de resposta CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, métodos, cabeçalhos, max-age, e `Retry-After` exposto); origens não correspondidas ainda recebem um 403 com o mesmo envelope do firewall atual. `Origin: null` (iframes sandboxados, documentos file://) é sempre rejeitado, mesmo sob `*`. Pré-voo via `caps.features.allow_origin`. Acessos de origem própria em loopback não são afetados. |
| `--web` / `--no-web` | `true` | Serve a SPA Web Shell construída na raiz do daemon (`GET /`, `/assets/*`, e fallback deep-link SPA). O shell estático é registrado **antes** da barreira de autenticação Bearer — um navegador não pode anexar um token a um subrecurso `<script>` ou a uma navegação na barra de endereço, o shell não carrega segredos, e toda rota de API permanece protegida por token independentemente. Em binds não-loopback um aviso de stderr de uma linha nota que a IU está acessível sem autenticação. Use `--no-web` para um daemon somente API. Sem efeito quando a build omite os ativos da Web Shell (o daemon registra uma breadcrumb e executa somente API). |
| `--open` | `false` | Após o listener estar ativo, abre a Web Shell no navegador padrão na URL do daemon (com `#token=` anexado como fragmento de URL quando um token está configurado — um fragmento nunca é enviado ao servidor, mantendo o token fora de logs de acesso e cabeçalhos Referer). Sem efeito com `--no-web`, ou em ambientes headless / CI / SSH onde nenhum navegador está disponível. |
> **Dimensionando os controles de carga.** `--max-sessions` é o limite de **novos filhos**.
> Outras três camadas também limitam a carga — ao dimensionar para uma implantação
> de alta concorrência, ajuste-as em conjunto:
>
> - **Nível do listener**: `--max-connections` / `server.maxConnections=256`
>   limita conexões TCP brutas (contrapressão de clientes lentos).
> - **Inscrições por sessão**: o EventBus limita inscrições SSE em
>   64 por sessão por padrão; o 65º cliente recebe um
>   `stream_error` terminal e é fechado.
> - **Admissões de prompts por sessão**:
>   `--max-pending-prompts-per-session=5` limita prompts enfileirados + ativos
>   aceitos para uma sessão. O excesso recebe `503` com `Retry-After: 5`.
> - **Backlog por inscrito**: uma fila de 256 frames por cliente SSE; um
>   cliente acima da capacidade recebe um frame `client_evicted` terminal e é
>   fechado (um consumidor lento não pode travar o daemon).
>
> Esses limites interagem: `--max-sessions × 64 inscrições × 256 frames`
> é o pior caso de memória em trânsito na camada do EventBus, enquanto
> `--max-sessions × --max-pending-prompts-per-session` limita o trabalho de prompt
> aceito na camada de admissão. O dimensionamento padrão pressupõe carga de
> usuário único / pequena equipe; aumente progressivamente (e monitore o RSS) para
> implantações multi-inquilino.

> **Proteções para clientes MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Um workspace que declare 30 servidores MCP em `mcpServers` iniciará 30 clientes sem limite upstream a menos que você defina um. `--mcp-client-budget=N` limita a quantidade de clientes MCP ativos; `--mcp-budget-mode={enforce,warn,off}` escolhe o comportamento. O padrão é `warn` quando um orçamento é definido (o snapshot exibe o aviso mas nenhum cliente é recusado — útil para medir o fanout real antes de ativar a aplicação). Servidores recusados no modo `enforce` recebem `disabledReason: 'budget'` em sua célula por servidor, e a célula `budgets[0]` mostra `status: 'error'` + `errorKind: 'budget_exhausted'`. A reserva de slot é por nome de servidor e sobrevive a reconexões / timeouts de descoberta — um servidor recusado não pode tomar um slot de um servidor saudável.
>
> ⚠️ **Escopo v1: por sessão, não por workspace.** Cada sessão ACP dentro do daemon tem seu próprio `Config`/`McpClientManager` (criado via `newSessionConfig` por sessão). O orçamento limita clientes MCP ativos **por sessão**, não agregados em todas as sessões do workspace. O snapshot em `GET /workspace/mcp` reflete a visão da sessão de bootstrap (a célula carrega `scope: 'session'` para honestidade). Se você executar 5 sessões ACP concorrentes com `--mcp-client-budget=10`, pode ter até 50 clientes MCP ativos no daemon — o limite vale por sessão. **Wave 5 PR 23 (pool MCP compartilhado)** introduz um gerenciador com escopo de workspace e eleva isso para aplicação verdadeira por workspace.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # depois, quando a telemetria mostrar sua distribuição real:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Isso **não** é o mesmo que `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code (que controla a concorrência de inicialização); são ortogonais. O PR 23 adicionará um pool MCP compartilhado real (uma célula `scope: 'workspace'` em `budgets[]` junto com a célula por sessão); o PR 14 v1 é o contador em processo + aplicação suave no gerenciador por sessão existente.
>
> **Eventos push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Clientes SDK inscritos em `GET /session/:id/events` recebem frames tipados quando limites de orçamento são cruzados — `mcp_budget_warning` (sintético, dispara uma vez por cruzamento ascendente de 75% com rear de histerese em 37,5%, anunciado via `mcp_guardrail_events`) e `mcp_child_refused_batch` (coalescido uma vez por passagem de descoberta no modo `enforce`; comprimento 1 para recusa de spawn preguiçoso de `readResource`). O snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado pós-reconexão; eventos são arestas de mudança. Útil para painéis em tempo real sem polling.

## Modelo de ameaça de implantação padrão

- **Apenas 127.0.0.1** — bind loopback, sem necessidade de autenticação.
- **`--hostname 0.0.0.0` requer um token** — a inicialização recusa sem um.
- **`LOOPBACK_BINDS` inclui IPv6** — `::1` e `[::1]` contam como loopback para a regra sem token.
- **Lista de permissão do cabeçalho Host** — em binds **loopback** o daemon verifica se `Host:` corresponde a `localhost:porta` / `127.0.0.1:porta` / `[::1]:porta` / `host.docker.internal:porta` (insensível a maiúsculas/minúsculas conforme RFC 7230 §5.4) para se defender contra DNS rebinding. **Binds não loopback (`--hostname 0.0.0.0`) intencionalmente ignoram a lista de permissão do Host** — o operador escolheu a superfície de ataque, então a barreira do bearer token é a única camada de autenticação; proxies reversos / SNI / pinning de certificado do cliente são responsabilidade do operador, não do daemon. Se você precisar de isolamento baseado em Host em um bind não loopback, termine o TLS + verifique o Host em um proxy frontal.
- **CORS nega qualquer Origin de navegador por padrão** — retorna `403` JSON. Passe **`--allow-origin <padrão>`** (repetível, T2.4 #4514) para permitir origins específicas de navegador. Cada valor é ou o literal `*` (qualquer origin — a inicialização recusa se nenhum bearer token estiver configurado; `--require-auth` em loopback é recomendado para proteção completa, já que `/health` e `/demo` permanecem pré-autenticação em loopback por padrão) ou uma origin de URL canônica (`<esquema>://<host>[:<porta>]`, sem barra final / caminho / userinfo). Origins correspondidas recebem cabeçalhos de resposta CORS adequados (`Access-Control-Allow-Origin: <eco>`, `Vary: Origin`, mais métodos / cabeçalhos / max-age padrão e `Retry-After` exposto); origins não correspondidas ainda recebem um 403 com o mesmo envelope da barreira padrão. `caps.features.allow_origin` é anunciado condicionalmente para que clientes SDK / webui possam pré-verificar se o daemon honra requisições cross-origin antes de emiti-las. Exemplo: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Acessos de self-origin loopback (ex.: página `/demo`) não são afetados — um shim separado de remoção de Origin os trata independentemente de `--allow-origin`. **Webuis de navegador sem `--allow-origin` configurado** ainda recorrem às mesmas opções do Estágio 1 de antes: empacotar como um shell nativo (Electron/Tauri) para que nenhum cabeçalho `Origin` seja enviado, ou colocar um proxy reverso de mesma origem na frente do daemon.
- **O filho gerado `qwen --acp` herda o ambiente do daemon** com uma limpeza explícita: `QWEN_SERVER_TOKEN` é removido antes do filho iniciar (o bearer do próprio daemon; o agente não precisa dele). Todo o resto — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / seu `modelProviders[].envKey` personalizado / etc. — é passado adiante, porque o agente precisa legitimamente deles para autenticar no LLM. **Isso é intencional, não uma sandbox.** O agente executa como o mesmo UID com acesso a ferramentas de shell, então qualquer coisa em `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` é acessível por injeção de prompt independentemente. A passagem de env não é a fronteira de segurança; o usuário como raiz de confiança é. Não execute `qwen serve` sob uma identidade que tenha credenciais residentes em env que você não confiaria ao agente.
- **Filas SSE limitadas por inscrito** — um cliente lento que transborda sua fila recebe um frame terminal `client_evicted` e é fechado; um consumidor travado não pode travar o daemon.
- **Limite de admissão de prompts por sessão** — padrão de 5 prompts aceitos mas não resolvidos por sessão. Um cliente com bug não pode enfileirar promessas de prompt ilimitadas ou esperas SSE temporárias para uma sessão.
- **Desligamento gracioso** — SIGINT/SIGTERM drenam os filhos do agente antes de fechar o listener (prazo de 10s por filho).

> ⚠️ **Gap conhecido do Estágio 1 — permissões são globais ao daemon, não por sessão (BUy4H).** `pendingPermissions` vive no escopo do daemon; qualquer cliente com o bearer token pode votar em qualquer `requestId` para qualquer sessão que ele possa ver (e eventos SSE `permission_request` carregam o requestId no payload). Isso é aceitável sob o modelo de confiança de usuário único / pequena equipe onde cada cliente autenticado é o mesmo humano ou colaboradores em quem confiam. O Estágio 1.5 mudará para `POST /session/:id/permission/:requestId` + mapa pendente com escopo de sessão + identidade por cliente (must-have #3 da revisão downstream); até lá, não execute `qwen serve` atrás de um bearer compartilhado com partes não confiáveis.
>
> ⚠️ **Gap conhecido do Estágio 1 — corpo de `POST /session/:id/prompt` limitado a 10 MB (BUy4L).** Prompts multimodais contendo imagens / PDFs / áudio que excedam 10 MB falharão no momento da análise do corpo antes da lógica da rota (sem streaming, sem aborto no meio do upload). Solução alternativa: reduza o conteúdo no lado do cliente, ou passe uma referência de caminho e deixe o agente ler o arquivo via `readTextFile`. O Estágio 1.5 aceitará `multipart/form-data` ou codificação chunked em `/prompt` para que prompts grandes não encontrem um limite abrupto.
>
> ⚠️ **Gap conhecido do Estágio 1 — conexões SSE fantasmas atrás de NAT.** O
> daemon detecta clientes mortos via contrapressão TCP em heartbeats
> (intervalo de 15s). Um cliente que desaparece SEM um RST TCP (ex.: um
> roteador NAT descartando silenciosamente fluxos ociosos) mantém o socket
> em nível de kernel "vivo" até que as sondas keepalive do Node expirem —
> tipicamente ~2 horas nos padrões Linux. Em implantações com `--hostname 0.0.0.0` atrás de tais
> NATs, conexões SSE fantasmas podem se acumular e eventualmente atingir o
> teto de 256 `server.maxConnections`.
>
> Defina [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)
> para fechar o gap com um prazo de ociosidade explícito em nível de aplicação:
> quando nenhuma escrita foi liberada com sucesso por `n` ms, o daemon emite
> um frame terminal `client_evicted` com
> `reason: 'writer_idle_timeout'` e fecha o stream. A flag está
> desligada por padrão para preservar o contrato legado — operadores em
> redes que engolem RSTs devem escolher um valor bem acima do intervalo de heartbeat de 15s
> (ex.: `60000`–`300000`) para que conexões ociosas legítimas não sejam
> ejetadas enquanto escritores realmente travados sejam
> removidos prontamente. Pré-verifique `caps.features.includes('writer_idle_timeout')`
> do seu SDK para confirmar que o daemon suporta.

### Prazos e timeout de ociosidade do escritor

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 entrega duas flags opt-in que fecham os gaps de longa duração / implantação remota que o heartbeat de 15s + AbortSignal não cobrem. Ambas estão desligadas por padrão — fluxos de trabalho loopback de usuário único permanecem bit a bit inalterados.

| Flag                           | Env var                             | Padrão | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | não definido | Limite de relógio de parede no lado do servidor para um único `POST /session/:id/prompt`. Ao expirar, o daemon aborta o AbortController do prompt e retorna HTTP `504` com `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Um campo `deadlineMs` no corpo da requisição por prompt pode ENCURTAR o prazo efetivo abaixo do valor da flag, mas nunca estendê-lo. Tag de capacidade (condicional): `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | não definido | Prazo de ociosidade por conexão SSE. Quando nenhuma escrita foi liberada com SUCESSO por `n` ms — nem um evento real nem o heartbeat de 15s — o daemon emite um frame terminal `client_evicted` com `data.reason = 'writer_idle_timeout'` (espelhado em `data.errorKind`) e fecha o stream. **Escolha um valor confortavelmente acima do heartbeat de 15s** (ex.: `30000`–`300000`) para que streams ociosos legítimos não sejam ejetados; valores `< 15000` IRÃO ejetar conexões ociosas saudáveis antes do primeiro heartbeat disparar (intencional apenas para testes / sessões de desenvolvimento curtas). Tag de capacidade (condicional): `writer_idle_timeout`. |

Ambas as flags aceitam um inteiro positivo em milissegundos; `0`, `NaN`, valores não inteiros ou negativos são rejeitados na inicialização com uma mensagem de erro clara. A flag de CLI vence sobre a env var; o campo `ServeOptions` explícito (chamadores embutidos) vence sobre a env. Consumidores SDK devem pré-verificar a tag de capacidade correspondente antes de confiar em qualquer comportamento — daemons anteriores a este PR omitem ambas as tags e o campo `deadlineMs` da requisição é silenciosamente ignorado.

## Implantação multisessão e multi-workspace

Por [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, cada processo `qwen serve` vincula-se a **um workspace** na inicialização. Dentro desse workspace, ele multiplexa N sessões em um único filho `qwen --acp` via o mapa de sessões nativo do agente — sessões compartilham o processo filho / estado OAuth / cache de leitura de arquivos / análise de memória de hierarquia.

Para hospedar **vários workspaces** (um usuário, vários repositórios; ou vários usuários no mesmo host), execute **vários processos daemon** — um por workspace, cada um em sua própria porta, supervisionados por systemd / docker-compose / k8s / um orquestrador de referência `qwen-coordinator`. A troca é intencional: um workspace por filho significa que `loadSettings(cwd)` / OAuth / escopo do servidor MCP permanecem alinhados com o diretório vinculado e não se desviam entre requisições.

> **Inscreva-se ANTES de postar `modelServiceId` ao anexar.** Quando um cliente faz `POST /session` com um `modelServiceId` e o workspace já possui uma sessão executando um modelo diferente, o daemon emite uma chamada interna `setSessionModel` — falhas NÃO são propagadas como um erro HTTP (a sessão permanece operacional em seu modelo atual). O sinal visível de falha é um evento `model_switch_failed` no stream SSE da sessão. Se você chamar `POST /session` e só DEPOIS abrir `GET /session/:id/events`, você perderá o evento de falha e continuará falando silenciosamente com o modelo errado. Abra o stream SSE primeiro, ou passe `Last-Event-ID: 0` na inscrição para reproduzir o evento mais antigo disponível no ring.

Para lidar com vários **usuários** (cada um com sua própria cota, log de auditoria, sandbox) ou escalar além do alcance de um processo (orçamento de cold-start, contagem de descritores de arquivo, RSS), gere um daemon por workspace por usuário atrás de um orquestrador externo. Esse orquestrador (multi-inquilino / OIDC / Cota / Auditoria / k8s) está **fora do escopo** do projeto qwen-code — veja a issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "Arquitetura de Referência Externa" para as diretrizes de design.

## Carregando e retomando uma sessão persistida

O daemon expõe o fluxo `session/load` e retomada do ACP via HTTP por duas rotas:

| Rota                        | Use quando                                                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /session/:id/load`   | O cliente **não tem** histórico renderizado (reconexão a frio, seletor-depois-abrir). O daemon reproduz cada turno persistido via SSE para que os inscritos vejam a transcrição completa. Tag de capacidade: `session_load`.                                                                                        |
| `POST /session/:id/resume` | O cliente já tem os turnos na tela e precisa apenas do handle do lado do daemon de volta. O contexto do modelo é restaurado no lado do agente sem reprodução na interface — o stream SSE permanece limpo. Tag de capacidade: `session_resume` (`unstable_session_resume` permanece um alias depreciado para clientes antigos). |

O SDK TypeScript expõe ambas como factories estáticas em `DaemonSessionClient`:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Reconexão a frio — o daemon reproduzirá o histórico via SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Ou, se sua interface já tem o histórico, pule a reprodução:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // Primeiro os frames `session_update` reproduzidos (apenas load),
  // depois eventos ao vivo.
}
```

Pré-verifique `caps.features.session_load` / `caps.features.session_resume` antes de chamar — daemons antigos retornam `404`. `unstable_session_resume` ainda é anunciado como um alias de compatibilidade depreciado. Ações simultâneas da mesma requisição para o mesmo id coalescem; corridas de ações cruzadas (um `load` competindo com um `resume`) recebem `409 restore_in_progress` com `Retry-After: 5`. Veja a [referência do protocolo](../developers/qwen-serve-protocol.md) para o envelope de erro completo.

Nota: a reprodução do histórico é limitada pelo ring SSE (padrão 8000 frames). Históricos longos com turnos verbosos podem exceder isso — frames mais antigos são descartados silenciosamente. Para sessões muito longas, prefira `resume` e confie na interface local persistida do cliente.

## Modelo de durabilidade

**As sessões ainda são efêmeras no Estágio 1 após reinicializações do daemon**, mas sessões persistidas em disco podem ser recarregadas:

- Uma falha do processo filho publica `session_died` e remove a sessão ativa dos mapas do daemon. A sessão persistida em disco **pode** ser recarregada via `POST /session/:id/load` se um novo filho agente for spawnável.
- Uma reinicialização do daemon perde todas as sessões ativas em andamento. As sessões persistidas permanecem em disco e podem ser carregadas contra um novo processo daemon, sujeitas às mesmas regras de vinculação de workspace.
- Desconexões longas do cliente (>5 min em um turno verboso) podem exceder o ring de reprodução SSE (padrão 8000 frames) — a reconexão `Last-Event-ID` é bem-sucedida, mas o estado pode ser incoerente. Para clientes móveis / redes instáveis, planeje reabrir SSE em quedas longas ou chame `POST /session/:id/load` para reproduzir a partir do disco.
- Operações de arquivo (`writeTextFile`) são atômicas entre falhas (escrever-depois-renomear); elas não são atômicas entre reinicializações do daemon no sentido de reprodução — a escrita do arquivo ocorreu ou não.

Se sua integração precisar de durabilidade entre reinicializações no lado do servidor além do que `session/load` cobre (ex.: filas de retry gerenciadas pelo servidor), você ainda precisa de recuperação de estado em nível de aplicação. Não mantenha estado sensível a reinicializações e de longa execução dentro da sessão do daemon.

## Garantias de runtime do Estágio 1.5+

O contrato do Estágio 1 é dimensionado para prototipação. Por [#3889 revisão de consumidor downstream chiga0](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), os seguintes itens **não** estão no Estágio 1 — integrações de nível de produção precisam do Estágio 1.5+ antes de depender deles:
**Bloqueadores para uso downstream sério:**

1. **`loadSession` / `unstable_resumeSession` via HTTP** — sem isso, nenhuma integração pode sobreviver a uma falha do child ou reinicialização do daemon, e qualquer orquestrador coordenando o daemon também não pode recuperar o estado.
2. **Identidade persistente do cliente (pair tokens + revogação por cliente)** — O Stage 1 usa um bearer compartilhado; um token vazado revoga todos, e `originatorClientId` é autodeclarado pelo cliente em vez de carimbado pelo daemon a partir de uma identidade autenticada.

**Linha de base de confiabilidade:**

3. ~~**Rota de heartbeat iniciada pelo cliente**~~ — enviada via PR 9 do [#4175](https://github.com/QwenLM/qwen-code/issues/4175). `POST /session/:id/heartbeat` registra timestamps de última visualização no daemon (tag de capacidade `client_heartbeat`); os helpers do SDK são `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Evento `permission_already_resolved`** quando um voto perde a corrida de primeiro respondedor — atualmente as UIs precisam inferir o estado a partir de um `404`.
5. ~~**Anel de replay maior**~~ — aumentado para 8000. **Anel configurável por sessão** ainda em aberto — workloads mobile ou de turnos verbosos podem precisar de configurações por sessão.
6. **Evento `slow_client_warning` antes de `client_evicted`** — backpressure suave para que clientes lentos bem-comportados possam se autorregularem (reduzir profundidade de renderização, descartar chunks) antes de serem terminados.

**Ergonomia de integração:**

7. **`POST /session/:id/_meta` para contexto estilo IM** — key-value por sessão anexado aos prompts subsequentes (chat id, sender, thread id) substitui a improvisação por canal.
8. **Negociação real de recursos em `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` para que clientes possam detectar desvios em vez de cair em "unknown frame, ignore".
9. **Documentação de durabilidade de primeira classe** (esta seção) — já enviada acima.

O roadmap completo de convergência é rastreado em [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

## Limites do escopo do Stage 1 — o que não vamos corrigir no Stage 1.5

Duas escolhas estruturais são explicitamente não-objetivos para o roadmap principal do Stage 1 / 1.5 / 2. Se seu caso de uso depende de alguma delas, planeje-se ao redor delas em vez de esperar por nós.

### O estado da sessão é apenas de mutação local (por [revisão LaZzyMan #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

O plano do Stage 1.5 descreve TUI como um assinante do EventBus em processo. Na prática, **a UI do TUI é estritamente maior que o protocolo wire**:

- **UI apenas local** — os ~15 componentes de diálogo Ink (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) e os comandos slash `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) renderizam Ink JSX específico do terminal. Clientes remotos via HTTP/SSE não podem renderizar Ink equivalentemente, e esses fluxos não emitem evento wire.
- **Mutações de estado de sessão sem eventos wire** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (escrevendo `CLAUDE.md`) alteram o comportamento do agente, mas apenas `/model` atualmente publica um evento (`model_switched`).

**Escolha do Stage 1 — opção (A) da revisão**: não promover essas mutações para eventos wire. Os dois modos de implantação têm consequências diferentes.

#### Modo 1 — `qwen serve` headless (este PR)

Nenhum shell TUI roda dentro do daemon. Os comandos slash listados acima **não existem** neste modo — não há UI de terminal para emiti-los. Portanto, o estado da sessão é:

- **Congelado na inicialização** para `approval-mode` / `memory` / `agents` / `tools` allowlist / `auth` — todos carregados das configurações + disco quando o child `qwen --acp` do daemon inicia; imutável durante a vida da sessão. Servidores MCP definidos nas configurações também são congelados na inicialização, mas **servidores adicionados em runtime** (via `POST /workspace/mcp/servers`) podem ser adicionados ou removidos sem reinicialização.
- **Mutável via HTTP** através de `POST /session/:id/model` (publica `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publica `mcp_server_added` / `mcp_server_removed`), e votos de permissão (`POST /permission/:requestId`).

**Consequência:** clientes remotos no modo headless veem o **estado completo da sessão**. Nenhum TUI esconde estado adicional; nenhuma deriva é possível. Se você deseja alterar `approval-mode`, reinicie o daemon com novas configurações. Servidores MCP agora podem ser adicionados/removidos em runtime através das rotas de mutação (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — veja [Gerenciamento de servidores MCP em runtime](#runtime-mcp-server-management-issue-4514).

#### Modo 2 — Stage 1.5 `qwen --serve` com TUI co-hospedado (não neste PR)

Quando o Stage 1.5 implementar `qwen --serve` (processo TUI co-hospeda o mesmo servidor HTTP), o TUI **existe** junto com clientes remotos. Um operador local digitando `/approval-mode yolo` ou `/mcp add-server` altera o estado da sessão, e clientes remotos via HTTP não têm evento para observar a mudança.

Neste modo, o TUI é um **"super-cliente"** — ele observa a mesma conversa do agente que clientes remotos veem, E pode alterar o estado da sessão que clientes remotos não podem. A assimetria é:

- ✅ Tanto TUI quanto clientes remotos veem as mesmas mensagens do agente, chamadas de ferramenta, diffs de arquivo, prompts de permissão.
- ❌ Apenas o TUI vê/altera o modo de aprovação / memória / lista de servidores MCP / agentes / lista de permissão de ferramentas / estado de autenticação.

**Consequência no Modo 2:** se uma UI de cliente remoto tentar espelhar as configurações da sessão, pode haver deriva após qualquer comando slash do TUI. Clientes remotos devem **re-obter o estado ao anexar/reconectar** (use `Last-Event-ID: 0` para reproduzir o evento mais antigo do anel para coisas como `model_switched`); eles NÃO devem depender de eventos incrementais para mutações do lado do TUI.

#### Por que (A) e não (B) (promover mutações para família de eventos `session_state_changed`)

(B) é a resposta mais ambiciosa, mas prende o Stage 1.5 a uma superfície wire substancialmente maior que também deve passar limpa pela refatoração em processo planejada. Preferimos percorrer o escopo menor honestamente. O trabalho de taxonomia de eventos de estado de sessão — enumerando quais fluxos TUI são apenas locais por design vs. que poderiam plausivelmente evoluir para wire sob uma futura extensão opt-in do tipo (B) — é movido para [#3803](https://github.com/QwenLM/qwen-code/issues/3803), não para o código do Stage 1.5.

### N sessões paralelas compartilham um child `qwen --acp`

Múltiplas sessões no mesmo workspace **compartilham um processo child `qwen --acp`** através do suporte nativo a múltiplas sessões do agente (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). A bridge chama `connection.newSession({cwd, mcpServers})` para cada sessão — o agente as armazena em seu map de sessões e desmultiplexa por sessionId por chamada.

Custo concreto com N=5 sessões no mesmo workspace:

| Recurso                             | Por sessão | Em N=5                       |
| ----------------------------------- | ---------- | ---------------------------- |
| Processo Node do daemon             | um         | **30–50 MB** (um daemon)     |
| child `qwen --acp`                  | compartilhado | **60–100 MB** (um child)     |
| Children do servidor MCP            | por sessão | 3×N se as configurações diferirem |
| `FileReadCache` (heap in-child)     | compartilhado | analisado uma vez            |
| `CLAUDE.md` / análise de memória hierárquica | compartilhado | analisado uma vez            |
| Estado do token de atualização OAuth | compartilhado | **um caminho de refresh**    |
| Fatos aprendidos de memória automática | compartilhado | uma base de conhecimento por child |
| Cold start                          | apenas no primeiro | <200 ms após a primeira sessão |

A bridge mantém **um canal por daemon** (um daemon por workspace, por §02). O canal permanece ativo enquanto pelo menos uma sessão estiver ativa; o último `killSession` (ou uma falha no nível do canal) mata o child.

**Children do servidor MCP** ainda são por sessão hoje — a configuração de cada sessão pode especificar servidores diferentes, então eles são iniciados independentemente. Acompanhamento do Stage 1.5: refcount dos children do servidor MCP por `(workspace, config-hash)` para que configurações idênticas compartilhem. Não está no escopo deste PR.

**Agentes pares (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) todos fazem multi-sessão em um único processo.** qwen-code os iguala na camada do agente; a bridge do Stage 1 neste PR torna a mesma arquitetura visível via HTTP.

## Logando em um daemon remoto (issue #4175 PR 21)

Quando o daemon roda em um pod remoto (sem display compartilhado com você), um cliente pode disparar um fluxo de dispositivo OAuth via HTTP. O daemon faz polling no IdP por conta própria; seu trabalho é apenas abrir uma URL em qualquer dispositivo que tenha um navegador.

> [!note]
>
> O nível gratuito do Qwen OAuth foi descontinuado em 2026-04-15. Os exemplos `qwen-oauth` abaixo documentam o formato do protocolo device-flow e o identificador legado do provedor; novas configurações devem usar um provedor de autenticação atualmente suportado.

```bash
# 1. Start a flow. The daemon contacts the IdP, returns a code + URL.
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

# 2. Visit the URL on your phone / laptop, enter the user code.
# 3. Poll for completion (or subscribe to SSE for the auth_device_flow_authorized event):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
```

O SDK TypeScript encapsula ambas as etapas em um único helper:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**O daemon nunca abre um navegador em seu nome.** Mesmo quando executando localmente, o daemon permanece passivo — ele retorna a URL e deixa o SDK / usuário escolher onde abri-la. Isso é intencional: um daemon em um pod headless que chamasse `xdg-open` falharia silenciosamente, mascarando a superfície real de autenticação. Espelhe a UX "Pressione Enter para abrir o navegador" do `gh auth login` no seu cliente.

**`--require-auth` e conveniência de desenvolvimento.** As rotas de device-flow usam a gate de mutação estrita (PR 15), o que significa que um padrão loopback sem token retorna `401 token_required`. Localmente, a maneira mais simples de contornar isso durante o desenvolvimento é `qwen serve --token=dev-token`; você não precisa de `--require-auth` a menos que esteja endurecendo o padrão loopback.

**Limitação entre daemons.** `oauth_creds.json` é compartilhado entre daemons (`~/.qwen/oauth_creds.json`), então um login bem-sucedido no daemon A é automaticamente captado pela próxima atualização de token do daemon B — mas os clientes do SDK do daemon B não receberão o evento `auth_device_flow_authorized` (eventos são por daemon).

**Take-over entre clientes.** Dois clientes SDK no mesmo daemon que ambos fazem `POST /workspace/auth/device-flow` para o mesmo provedor obtêm o singleton por provedor: a primeira chamada inicia uma solicitação IdP nova e retorna `attached: false`; a segunda chamada retorna a entrada EXISTENTE em andamento com `attached: true`. O take-over é registrado na trilha de auditoria (sob o segundo cliente `X-Qwen-Client-Id`), mas NÃO emite um evento separado — ambos os clientes eventualmente observam o MESMO `auth_device_flow_authorized` assim que o usuário conclui a página IdP. Se sua UI distingue "eu iniciei isso" de "fluxo de outra pessoa que eu entrei", ramifique no campo `attached` retornado por `start()`.

## Arquivo de log do daemon

`qwen serve` escreve um log diagnóstico por processo em:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Um link simbólico `latest` no mesmo diretório sempre aponta para o log do processo atual, então `tail -f ~/.qwen/debug/daemon/latest` seguirá o daemon que estiver em execução.

O log captura mensagens de ciclo de vida, erros de rota (com contexto `route=` e `sessionId=`), stderr do child ACP e — quando `QWEN_SERVE_DEBUG=1` está configurado — migalhas extras da bridge. Linhas que vão para stderr hoje ainda vão para stderr; o log em arquivo é **aditivo**, não uma substituição.

### Desabilitando

Defina `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) para pular completamente a gravação de log em arquivo. A saída stderr não é afetada.

### Relação com logs de depuração de sessão

Logs de depuração com escopo de sessão (`~/.qwen/debug/<sessionId>.txt` e o link simbólico `~/.qwen/debug/latest`) são independentes. O log do daemon reside em um subdiretório `daemon/` irmão; a semântica de depuração por sessão permanece inalterada por este recurso.

### Sem rotação

O log do daemon é anexado indefinidamente. Faça rotação manualmente se ele crescer demais. Uma melhoria futura pode adicionar rotação automática; acompanhe via follow-ups em [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

## Gerenciamento de servidores MCP em runtime (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

Adicione ou remova servidores MCP em runtime sem reiniciar o daemon. As entradas de runtime residem em uma sobreposição efêmera que **sombreia** servidores definidos nas configurações com o mesmo nome; a configuração subjacente `settings.json` / `mcpServers` nunca é escrita.

**Pré-verificação:** verifique se `caps.features` contém `mcp_server_runtime_mutation` antes de chamar qualquer rota. Daemons mais antigos sem essa tag retornam `404`.

### `POST /workspace/mcp/servers` — adicionar um servidor MCP em runtime

Gate estrita (token bearer obrigatório). Conecta o servidor imediatamente via `McpClientManager` ativo e descobre suas ferramentas.

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

`name` deve ser alfanumérico mais `_` e `-` (máx. 256 caracteres). `config` é o mesmo objeto de configuração de servidor MCP usado em entradas `mcpServers` do `settings.json` (campos dependentes de transporte: `command`/`args` para stdio, `url` para SSE/HTTP). Campos sensíveis à segurança (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) são removidos pelo daemon e ignorados.

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

- `replaced: true` — uma entrada runtime com o mesmo nome já existia e a impressão digital da configuração difere; conexão antiga derrubada, nova estabelecida. Quando a impressão digital coincide (readição idempotente), `replaced` é `false`.
- `shadowedSettings: true` — um servidor definido nas configurações com o mesmo nome existe; a entrada runtime agora o sombreia. A entrada de configuração não é tocada e reemerge se a entrada runtime for removida posteriormente.
- `toolCount` — número de ferramentas descobertas no servidor recém-conectado.

Resposta (200) — recusa suave (modo de aviso de orçamento):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Retornada quando `--mcp-budget-mode=warn` e adicionar o servidor excederia o `--mcp-client-budget` configurado. O servidor NÃO é conectado. Os chamadores devem mostrar a pressão de orçamento ao usuário.

Erros:

| Status | Código                       | Quando                                                                                               |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`        | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]`                       |
| `400`  | `missing_required_field`     | `config` ausente ou não é um objeto não nulo                                                          |
| `400`  | `invalid_client_id`          | Cabeçalho `X-Qwen-Client-Id` presente, mas não registrado para este workspace                        |
| `400`  | `invalid_config`             | Forma da configuração rejeitada pelo validador de transporte MCP                                     |
| `401`  | `token_required`             | Nenhum token bearer configurado (gate estrita)                                                        |
| `409`  | `mcp_budget_would_exceed`    | `--mcp-budget-mode=enforce` e orçamento está cheio                                                   |
| `502`  | `mcp_server_spawn_failed`    | Processo do servidor saiu ou expirou durante a conexão; corpo carrega `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable`    | Nenhum child ACP ativo (nenhuma sessão foi criada ainda)                                             |

### `DELETE /workspace/mcp/servers/:name` — remover um servidor MCP em runtime

Gate estrita. Desconecta o servidor e o remove da sobreposição runtime. Idempotente — remover um nome que nunca foi adicionado retorna uma resposta de pulo (não um erro).

O parâmetro de caminho `:name` é o nome do servidor codificado em URL.

Resposta (200) — sucesso:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — a entrada runtime removida estava sombreando um servidor definido nas configurações com o mesmo nome. Essa entrada de configuração agora é desobscurecida e será usada na próxima descoberta/reinicialização.

Resposta (200) — pulo idempotente:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Retornada quando o nome não estava na sobreposição runtime (pode ainda existir nas configurações — entradas de configuração não podem ser removidas através desta rota).

Erros:

| Status | Código                       | Quando                                                                          |
| ------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`        | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`          | Cabeçalho `X-Qwen-Client-Id` presente, mas não registrado para este workspace   |
| `401`  | `token_required`             | Nenhum token bearer configurado (gate estrita)                                  |
| `503`  | `acp_channel_unavailable`    | Nenhum child ACP ativo                                                          |

### Semântica de sombreamento

Entradas runtime formam uma sobreposição efêmera sobre servidores MCP definidos nas configurações:

- **Adicionar** um servidor runtime com o mesmo nome de uma entrada de configuração o **sombreia** — a configuração runtime tem precedência. A entrada de configuração original não é modificada.
- **Remover** um servidor runtime que estava sombreando uma entrada de configuração o **desobscurece** — a configuração definida nas configurações torna-se ativa novamente na próxima conexão.
- **Reinicialização do daemon** perde todas as entradas runtime. Apenas servidores definidos nas configurações sobrevivem a reinicializações. Servidores runtime têm escopo de vida da sessão.
- **`GET /workspace/mcp`** relata a visão mesclada — tanto servidores das configurações quanto runtime aparecem no array `servers[]`. Não há distinção no nível wire entre as duas origens no snapshot atual.

### Eventos

Ambas as rotas emitem eventos SSE com **escopo de workspace** (todos os barramentos de sessão ativos os recebem):

| Evento              | Emitido quando                        | Campos do payload                                                                         |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` bem-sucedido (não pulado)      | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId`   |
| `mcp_server_removed` | `DELETE` bem-sucedido (não pulado)    | `name`, `wasShadowingSettings`, `originatorClientId`                                     |
Respostas ignoradas (`budget_warning_only`, `not_present`) NÃO emitem eventos.

Eventos relacionados a orçamento da superfície `mcp_guardrail_events` existente (`mcp_budget_warning`, `mcp_child_refused_batch`) também são disparados quando adições em tempo de execução ultrapassam o limite de orçamento.

## Próximos passos

- **Configurando um daemon de longa execução?** [Modelos de inicialização local (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) para v0.16-alpha (apenas local).
- **Construindo um cliente?** Veja o [quickstart do DaemonClient TypeScript](../developers/examples/daemon-client-quickstart.md) e a [referência do protocolo HTTP](../developers/qwen-serve-protocol.md).
- **Lendo o código-fonte?** O código da bridge está em `packages/cli/src/serve/`; o cliente SDK em `packages/sdk-typescript/src/daemon/`.
- **Acompanhando o roadmap?** O progresso dos Estágios 1.5 e 2 é acompanhado na issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).