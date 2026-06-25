# Modo Daemon (`qwen serve`)

Execute o Qwen Code como um daemon HTTP local para que vários clientes (plugins de IDE, interfaces web, scripts de CI, CLIs personalizados) compartilhem uma sessão de agente via HTTP + Server-Sent Events, em vez de cada um gerar seu próprio subprocesso.

> **🚧 v0.16-alpha**: o `qwen serve` chega ao npm pela primeira vez na v0.16-alpha como **chat / codificação apenas com texto** com **implantação local apenas**. Anexos de imagem / arquivo no caminho do prompt, implantação conteinerizada (Docker / k8s / reverse-proxy nginx) e robustez remota / multi-daemon chegam em um patch de acompanhamento quando um piloto empresarial estiver comprometido. Veja [limitações conhecidas da v0.16-alpha](#limitações-conhecidas-da-v016-alpha) para a lista completa de itens adiados.

> **Status:** Estágio 1 (experimental). A superfície do protocolo está fixa na tabela de rotas §04 da issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803). O Estágio 1.5 (flag `qwen --serve` — o TUI coabita o mesmo servidor HTTP) e o Estágio 2 (refatoração in-process + polimento mDNS/OpenAPI/WebSocket/Prometheus) estão imediatamente a jusante.
>
> **Sinceridade sobre o escopo:** O Estágio 1 tem tamanho para **desenvolvedores prototipando clientes contra a superfície do protocolo** e para **colaboração local de usuário único / pequena equipe**. Cargas de trabalho de produção com múltiplos clientes / longa duração / rede instável (aplicativos companions para mobile, IMs alcançando 1000+ chats) precisam de garantias do Estágio 1.5+ que não estão nesta versão. Veja [Garantias de runtime do Estágio 1.5+](#garantias-de-runtime-do-estágio-15) para a lista completa de lacunas e #3803 para o roteiro de convergência.

## O que ele oferece

- **Interface Web Shell embutida** — `qwen serve` serve o Web Shell baseado em navegador em sua raiz (`http://127.0.0.1:4170/`) pronto para uso; execute `qwen serve --open` para abri-lo automaticamente no navegador. Ele é servido na mesma origem da API, então não é necessário uma segunda porta ou reverse-proxy. Passe `--no-web` para um daemon apenas de API.
- **Um processo de agente, muitos clientes** — sob o padrão `sessionScope: 'single'`, todo cliente conectado ao daemon compartilha uma sessão ACP. Colaboração ao vivo entre clientes na mesma conversa, nos mesmos diffs de arquivo, nos mesmos prompts de permissão.
- **Streaming à prova de reconexão** — SSE com reconexão `Last-Event-ID` permite que um cliente caia e retome exatamente de onde parou (dentro da janela de repetição do anel).
- **Permissões de primeiro respondedor** — quando o agente pede permissão para executar uma ferramenta, todos os clientes conectados veem a solicitação; aquele que responder primeiro vence.
- **Um daemon, um workspace** — cada processo `qwen serve` vincula-se exatamente a um workspace na inicialização (por [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Implantações com múltiplos workspaces executam um daemon por workspace em portas separadas (ou atrás de um orquestrador).
- **Controle de runtime remoto** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — altere o modo de aprovação de uma sessão (`POST /session/:id/approval-mode`), ative/desative uma ferramenta por workspace (`POST /workspace/tools/:name/enable`), crie um `QWEN.md` vazio (`POST /workspace/init`, apenas mecânico — NÃO chama o modelo; para preenchimento por IA, siga com `POST /session/:id/prompt`), reinicie um único servidor MCP com verificação de orçamento (`POST /workspace/mcp/:server/restart`), ou adicione/remova servidores MCP em tempo de execução sem reiniciar o daemon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Todos protegidos por gate estrito — configure `--token` primeiro.
- **Recapitulação de sessão** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) follow-up) — busque um resumo de uma frase "onde eu parei" de uma sessão ativa (`POST /session/:id/recap`). Encapsula o `generateSessionRecap` do core como uma consulta lateral contra o modelo rápido; não polui o histórico principal do chat nem o stream SSE. Gate não estrito (mesma postura que `/prompt`); helper do SDK `client.recapSession(sessionId)`.
  - **Limitação conhecida — amplificação de custo de tokens:** a rota é um endpoint puramente de custo (cada chamada é uma consulta lateral ao LLM, sem benefício de estado) e o daemon não tem limite de taxa por rota na v1. Em um loopback padrão sem token, um cliente local bugado ou malicioso pode enviar spam para queimar tokens. Configure `--token` (e opcionalmente `--require-auth`) em hosts de desenvolvimento compartilhados antes de expor o daemon.
  - **Segurança de recapitulação concorrente:** duas chamadas `/recap` simultâneas na mesma sessão executam duas consultas laterais independentes. `generateSessionRecap` lê um snapshot do histórico do chat via `GeminiClient.getChat().getHistory()` e o alimenta para uma chamada `BaseLlmClient.generateText` separada (via `runSideQuery`); nunca anexa ou modifica o `GeminiChat` da sessão. Seguro para chamar de vários clientes sem coordenação.

## Limitações conhecidas da v0.16-alpha

O primeiro lançamento npm do `qwen serve` (v0.16-alpha) é intencionalmente restrito — chat / codificação apenas com texto para desenvolvedores executando o daemon em sua própria máquina. A lista abaixo torna explícita a superfície adiada para que adotantes possam planejar em torno disso; tudo aqui está no roadmap de patches v0.16.x ou em um lançamento de acompanhamento de curto prazo.

**Superfície do produto — apenas texto:**

- ✅ Prompts de texto e respostas de texto (chat, codificação, chamadas de ferramenta, integração MCP)
- ❌ **Anexos de imagem / arquivo no caminho do prompt** — `MessageEmitter` atualmente só renderiza texto; o eco multimodal chega quando um alvo alpha com necessidade de imagens estiver comprometido (#4175 chiga0 #27 item P0)
- ❌ **Uploads em streaming** — mesmo gate que multimodal
**Superfície de implantação — apenas local:**

- ✅ Loopback (`127.0.0.1`, padrão) — sem autenticação necessária, adequado para estações de trabalho de desenvolvimento
- ✅ Inicialização local via `systemd` / `launchd` / `nohup &` / `tmux` — veja [Modelos de inicialização local](./qwen-serve-deploy-local.md)
- ✅ Token bearer próprio via variável de ambiente `QWEN_SERVER_TOKEN` ([Autenticação](#authentication) para configurar)
- ❌ **Implantação containerizada** — Docker / Compose / Kubernetes / nginx reverse-proxy com terminação TLS NÃO na v0.16-alpha. Adiado para v0.16.x assim que um piloto empresarial for comprometido (caso contrário, apodreceria por ninguém validar).
- ❌ **Coordenação multi-daemon em um host** — `1 daemon = 1 workspace × N sessões` é aplicado. Federação entre hosts, chaveamento de token por caminho de instância e limpeza de tokens obsoletos adiados para v0.16.x.
- ❌ **Tokens de daemon gerados automaticamente** — alfa é BYO-token (a um `openssl rand -hex 32` de distância). Infraestrutura de geração automática + armazenamento de tokens adiada para v0.16.x.

**Reforço — mínimo viável para usuário único local:**

- ✅ Portão de segurança na inicialização (recusa bind não-loopback sem um token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Portão de autenticação para rotas de mutação, roteamento de permissão por escopo de sessão (PRs da Onda 4)
- ✅ Guardrails MCP + coordenação de permissão multi-cliente (F2 / F3)
- ✅ **Prazo absoluto de prompt + tempo limite de inatividade do writer SSE** — opt-in via `--prompt-deadline-ms` e `--writer-idle-timeout-ms`; divulgado através de `prompt_absolute_deadline` e `writer_idle_timeout` quando ativado.
- ✅ **Limitação de taxa HTTP** — opt-in via `--rate-limit` e limites por camada; divulgado através de `rate_limit` quando ativado.
- ⏸️ **Métricas Prometheus + estrutura de teste de carga** — adiado para instrumentação de escala F4 Fase 1 da v0.17 quando 30-50 sessões ativas se tornarem um alvo real.
- ⏸️ **Flag CLI `--max-body-size`** — o daemon aplica `express.json({ limit: '10mb' })` por padrão, o que cobre confortavelmente prompts apenas de texto (as janelas de contexto do modelo estão bem abaixo de 10 MiB de caracteres). Ajustável via flag na v0.16.x.

Para a enumeração mais detalhada do "o que não corrigiremos no Estágio 1" (modelo de mutação de estado de sessão em único host + N sessões paralelas compartilhando um filho ACP), veja [Limites de escopo do Estágio 1](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) abaixo.

## Quickstart

### 1. Iniciar o daemon (loopback, sem autenticação)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

O bind padrão é `127.0.0.1:4170`. A autenticação bearer está **desativada** no loopback para que o desenvolvimento local "simplesmente funcione". O daemon faz bind no diretório de trabalho atual; use `--workspace /path/to/dir` para substituir.

**Abra a interface Web Shell.** Navegue até `http://127.0.0.1:4170/` (ou inicie o daemon com `qwen serve --open` para abri-lo automaticamente) para o terminal completo do navegador — chat, diffs, chamadas de ferramentas e prompts de permissão. A interface é servida na raiz do daemon na mesma origem que a API. O restante deste guia usa HTTP bruto para que você possa usar scripts diretamente contra a API.

### 2. Verifique a sanidade

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

O campo `workspaceCwd` expõe o workspace vinculado para que os clientes possam fazer uma verificação prévia e omitir `cwd` em `POST /session`. O campo `limits.maxPendingPromptsPerSession` anuncia o limite ativo de admissão de prompts por sessão; `null` significa que o limite está desabilitado.

O daemon também expõe snapshots de runtime somente leitura para UIs de clientes e operadores:
`GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /session/:id/context`, `GET /session/:id/supported-commands`, e
`GET /session/:id/tasks`, e `GET /session/:id/lsp`.

`GET /session/:id/lsp` retorna o status LSP estruturado por sessão. Inicie o
daemon com `--experimental-lsp` para habilitar LSP nas sessões de agente geradas;
caso contrário, a rota retorna `enabled: false` sem servidores.

`GET /daemon/status` é o snapshot consolidado de solução de problemas. O padrão
`detail=summary` lê apenas o estado do daemon em memória (sessões, permissões,
contagens de transporte SSE/ACP, rejeições de limite de taxa, memória do processo, limites resolvidos)
e não inicia o filho ACP. Use `GET /daemon/status?detail=full` para
diagnósticos por sessão, detalhes de conexão ACP, contagens de fluxo de autenticação de dispositivo e
seções de status do workspace quando você estiver investigando ativamente um problema.

`GET /workspace/mcp`, `GET /workspace/skills` e `GET /workspace/providers`
reportam o runtime ACP ativo e não iniciam o filho ACP quando ociosos; um
daemon ocioso retorna `initialized: false` com um snapshot vazio. Assim que uma
sessão está ativa, eles mudam para `initialized: true` e expõem o estado real.
`GET /workspace/env` e `GET /workspace/preflight` sempre respondem com
`initialized: true` independentemente do estado do ACP. `env` nunca consulta o ACP
(apenas informações do processo do daemon); `preflight` responde com células de nível do daemon a partir de
`process.*` e emite placeholders `status: 'not_started'` para células de nível do ACP
quando o filho está ocioso.

`GET /workspace/env` reporta o tempo de execução do processo do daemon, plataforma, sandbox,
proxy e a **presença** (nunca o valor) de variáveis de ambiente secretas permitidas
como `OPENAI_API_KEY`. URLs de proxy são removidas de credenciais e reduzidas
a `host:porta` antes de irem para a rede. A rota sempre responde diretamente do processo do daemon
e nunca gera um filho do ACP.

`GET /workspace/preflight` retorna uma lista de verificações de prontidão. **Células de nível do daemon**
(versão do Node, entrada da CLI, diretório do workspace, ripgrep, git, npm)
sempre são renderizadas. **Células de nível do ACP** (auth, descoberta de MCP, skills, providers,
registro de ferramentas, egress) exigem um filho do ACP ativo — quando o daemon está ocioso
elas emitem placeholders `status: 'not_started'` em vez de gerar o ACP apenas para
preenchê-las. Falhas mapeiam para um enum fechado `errorKind` (`missing_binary`,
`auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`) para que as UIs do cliente possam renderizar soluções
estruturadas.

O daemon também expõe auxiliares de arquivo do workspace:

- `GET /file` lê arquivos de texto e retorna um hash `sha256:<hex>` de bytes brutos.
- `GET /file/bytes` lê janelas de bytes brutos delimitadas e retorna conteúdo base64.
- `POST /file/write` cria ou substitui arquivos de texto.
- `POST /file/edit` aplica uma substituição de texto exata.

Write/edit são **rotas de mutação estritas**: mesmo em loopback elas exigem um
bearer token configurado, caso contrário retornam `token_required`. Substituições
e edições exigem o `expectedHash` mais recente de `GET /file` (ou de um
`GET /file/bytes` de janela completa). `create` nunca sobrescreve. Gravações explícitas em caminhos ignorados
são permitidas, mas auditadas. Gravações binárias, delete/move/mkdir, e criação recursiva de diretórios pai
não fazem parte desta superfície.

### 3. Abrir uma sessão

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` pode ser omitido — a rota usa como fallback o workspace vinculado do daemon. Enviar um `cwd` que não corresponde ao workspace vinculado retorna `400 workspace_mismatch` (o daemon está vinculado a exatamente um workspace; inicie um daemon separado para outro).

Um segundo cliente enviando para `/session` (qualquer `cwd` correspondente ou nenhum) recebe `"attached": true` — eles agora estão compartilhando o agente.

### 4. Assinar o fluxo de eventos (em outro terminal primeiro)

```bash
SESSION_ID="<do passo 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

A linha `data:` é o **envelope completo do evento** — `{id?, v, type, data, originatorClientId?}` — JSON-stringificado em uma única linha. A carga útil do ACP (o bloco `sessionUpdate` neste exemplo) fica sob `data` dentro desse envelope. As linhas `id:` / `event:` do SSE são conveniência para clientes EventSource; os mesmos valores aparecem dentro do envelope JSON para que consumidores que usam `fetch` bruto também os obtenham.

Abra este **antes** de enviar o prompt — o buffer de replay do SSE mantém os
últimos 8000 eventos, então um assinante tardio pode se atualizar via
`Last-Event-ID`, mas para o caso simples de "assistir a um único prompt" é mais fácil
assinar primeiro e deixar fluir ao vivo.

O fluxo emite `session_update` (chunks de LLM, chamadas de ferramenta, uso),
`permission_request` (ferramenta precisa de aprovação), `permission_resolved`
(alguém votou), `model_switched`, `model_switch_failed`, e os quadros terminais
`session_died` (agente filho quebrou — SSE então fecha) e
`client_evicted` (sua fila estourou — SSE então fecha).

### 5. Enviar um prompt (de volta no terminal original)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"O que src/main.ts faz?"}]}'
# → {"stopReason":"end_turn"}
```

O `curl -N` do passo 4 imprimirá os quadros à medida que chegarem.

## Autenticação

Para qualquer coisa além de loopback, você **deve** passar um bearer token:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → a inicialização recusa sem QWEN_SERVER_TOKEN
```

Os clientes então enviam `Authorization: Bearer $QWEN_SERVER_TOKEN` em cada requisição. `/health` é isento **apenas em binds de loopback** para que probes de liveness do k8s/Compose dentro do pod (onde o daemon escuta em `127.0.0.1`) não precisem de credenciais. Em binds que não são de loopback (`--hostname 0.0.0.0` etc.) `/health` exige o token como qualquer outra rota — caso contrário, um atacante pode sondar endereços arbitrários para confirmar a existência do daemon. Use `/capabilities` para verificar se seu token está correto de ponta a ponta (sempre exige autenticação):
> **Loopback reforçado (`--require-auth`).** O comportamento padrão do loopback sem token é adequado para uso em um notebook pessoal, mas é inseguro em hosts de desenvolvimento compartilhados, runners de CI ou estações de trabalho multi-inquilino onde qualquer usuário local pode executar `curl 127.0.0.1:4170`. Use `--require-auth` para tornar o token de portador obrigatório em todas as rotas — incluindo `/health` e `/capabilities` — mesmo quando vinculado a `127.0.0.1`. A inicialização falha sem um token. Com essa flag ativada, um cliente **não autenticado** não consegue ler `/capabilities` para descobrir que a autenticação é necessária; a superfície de descoberta é o próprio corpo da resposta 401. Uma vez autenticado, a tag `caps.features.require_auth` é uma confirmação pós-autenticação de que a implantação está reforçada (útil para auditoria / UIs de conformidade):

```bash
qwen serve --require-auth --token "$(openssl rand -hex 32)"
# → /health, /capabilities, /session, … todos exigem Authorization: Bearer …
curl http://127.0.0.1:4170/health
# → 401
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
# → 13   (ou qualquer índice — não nulo após autenticar significa que a tag está presente)
```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Token errado → 401
```

A comparação do token é em tempo constante (SHA-256 + `crypto.timingSafeEqual`); respostas 401 são uniformes entre "cabeçalho ausente", "esquema errado" e "token errado", de modo que um canal lateral não consegue distinguir.

## Flags da CLI

| Flag                                    | Padrão          | Finalidade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | Porta TCP. `0` = porta efêmera atribuída pelo SO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--hostname <addr>`                     | `127.0.0.1`     | Interface de vínculo. Qualquer coisa além de loopback exige um token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--token <str>`                         | —               | Token de portador. Retorna para a variável de ambiente `QWEN_SERVER_TOKEN` (com espaços em branco iniciais/finais removidos — útil para `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--require-auth`                        | `false`         | Recusa iniciar sem um token de portador, mesmo em loopback. Reforça o padrão de desenvolvedor `127.0.0.1` para hosts de desenvolvimento compartilhados / runners de CI / estações de trabalho multi-inquilino onde qualquer usuário local pode acessar o listener. Inicializa apenas com `--token` ou `QWEN_SERVER_TOKEN` definido; também protege `/health` com o token de portador.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-sessions <n>`                    | `20`            | Limite de sessões simultâneas ativas. Novas requisições `POST /session` que gerariam um filho novo retornam `503` (com `Retry-After: 5`) quando o limite é atingido; anexos a sessões existentes NÃO são contados. Defina como `0` para desabilitar. Dimensionado para uso individual / pequenas equipes; aumente se sua implantação tiver capacidade de RAM/FD (~30–50 MB por sessão).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--max-pending-prompts-per-session <n>` | `5`             | Limite por sessão de prompts aceitos por `POST /session/:id/prompt` mas ainda não finalizados, incluindo prompts enfileirados e o prompt ativo. A ponte rejeita o excesso de forma síncrona com `503`, `Retry-After: 5` e `code: "prompt_queue_full"` antes de retornar um `promptId`. Defina como `0` para desabilitar. `branchSession` serializa na mesma FIFO mas não conta para esse limite de prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | Caminho absoluto do workspace ao qual este daemon está vinculado (conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 — 1 daemon = 1 workspace). Requisições `POST /session` com `cwd` incompatível retornam `400 workspace_mismatch`. Para implantações multi-workspace, execute um `qwen serve` por workspace em portas separadas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--max-connections <n>`                 | `256`           | Limite de conexões TCP no nível do listener (`server.maxConnections`). Limita a contagem bruta de sockets independentemente do número de sessões — clientes SSE lentos / fantasmas são rejeitados no momento da aceitação quando o limite é atingido. Aumente junto com `--max-sessions` se sua implantação esperar muitos assinantes SSE por sessão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | Profundidade do anel de replay SSE por sessão (#3803 §02 target). Define o backlog disponível para `GET /session/:id/events` com `Last-Event-ID: N`. Maior = mais margem para reconexão ao custo de algumas centenas de KB extras de RAM por sessão. Clientes SDK podem adicionalmente solicitar um limite de backlog maior por assinante em uma assinatura específica via `?maxQueued=N` (intervalo `[16, 2048]`, padrão 256). Daemons também emitem um frame SSE não terminal `slow_client_warning` quando a fila atinge 75% de capacidade, para que os clientes possam drenar / reconectar antes de serem removidos. Pré-voo `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                                                                                              |
| `--mcp-client-budget <n>`               | —               | Limite inteiro positivo de clientes MCP ativos **por sessão ACP** (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1; PR 23 gradua isso para por workspace via o pool MCP compartilhado). Combine com `--mcp-budget-mode`. Quando não definido, nenhuma aplicação baseada em contabilidade (mas `GET /workspace/mcp` ainda reporta `clientCount`). Distinto de `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code que controla a concorrência de inicialização, não o número total de clientes. Pré-voo `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Como `--mcp-client-budget` é aplicado. `warn` (padrão quando um orçamento é definido): sem recusa, o status `budgets[0].status` muda para `warning` em ≥75% do orçamento. `enforce`: conexões além do limite são recusadas, a célula por servidor mostra `disabledReason: 'budget'`, determinístico pela ordem de declaração `mcpServers`. `off` (padrão quando orçamento não definido): pura observabilidade. A inicialização rejeita `enforce` sem um orçamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--http-bridge`                         | `true`          | Modo Estágio 1: um filho `qwen --acp` por daemon (vinculado a um workspace na inicialização, conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02); N sessões multiplexadas nesse filho via ACP `newSession()`. O modo nativo de Estágio 2 em processo estará disponível posteriormente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Lista de permissões de origens cruzadas para clientes webui de navegador. Repetível. Cada valor é `*` (qualquer origem — a inicialização recusa se nenhum token de portador estiver configurado; `--require-auth` em loopback é recomendado para que `/health` e `/demo` também sejam protegidos por token de portador, já que ambos são pré-autenticação em loopback por padrão) ou uma origem URL canônica (`<scheme>://<host>[:<port>]`, sem barra final / caminho / userinfo / query). **Wildcards de subdomínio (`https://*.example.com`) são intencionalmente não suportados** — liste cada subdomínio explicitamente, ou use `*` com um token configurado (e `--require-auth` para reforço total). Origens correspondidas recebem cabeçalhos de resposta CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, métodos, cabeçalhos, max-age e `Retry-After` exposto); origens não correspondidas ainda recebem um 403 com o mesmo envelope da barreira atual. `Origin: null` (iframes em sandbox, documentos file://) é sempre rejeitado, mesmo sob `*`. Pré-voo via `caps.features.allow_origin`. Acessos de auto-origem em loopback não são afetados. |
| `--web` / `--no-web`                    | `true`          | Servir o SPA Web Shell compilado na raiz do daemon (`GET /`, `/assets/*` e fallback de deep-link do SPA). O shell estático é registrado **antes** da barreira de token de portador — um navegador não pode anexar um token a um subrecurso `<script>` ou a uma navegação por barra de endereço, o shell não carrega segredos, e toda rota da API permanece protegida por token independentemente. Em binds não-loopback, um aviso de uma linha em stderr informa que a UI está acessível sem autenticação. Use `--no-web` para um daemon somente API. Nenhum efeito quando a compilação omite os ativos do Web Shell (o daemon registra uma breadcrumb e executa apenas API).                                                                                                                                                                                                                                                                                                                                                                                          |
| `--open`                                | `false`         | Após o listener estar ativo, abrir o Web Shell no navegador padrão na URL do daemon (com `#token=` anexado como fragmento de URL quando um token está configurado — um fragmento nunca é enviado ao servidor, mantendo o token fora dos logs de acesso e cabeçalhos Referer). Sem efeito com `--no-web`, ou em ambientes headless / CI / SSH onde nenhum navegador está disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
> **Ajustando os botões de carga.** `--max-sessions` é o limite **de novos processos-filho**.
> Três outras camadas também limitam a carga — ao dimensionar para uma implantação de alta concorrência,
> ajuste-as em conjunto:
>
> - **nível do listener**: `--max-connections` / `server.maxConnections=256`
>   limita conexões TCP brutas (contrapressão de cliente lento).
> - **assinantes por sessão**: o EventBus limita assinantes SSE a
>   64 por sessão por padrão; o 65º cliente recebe um
>   `stream_error` terminal e é fechado.
> - **admissões de prompts por sessão**:
>   `--max-pending-prompts-per-session=5` limita prompts enfileirados + ativos
>   aceitos para uma sessão. Excedente recebe `503` com `Retry-After: 5`.
> - **backlog por assinante**: uma fila de 256 quadros por cliente SSE; um
>   cliente acima da capacidade recebe um quadro terminal `client_evicted` e é
>   fechado (um consumidor lento não pode travar o daemon).
>
> Esses limites interagem: `--max-sessions × 64 assinantes × 256 quadros`
> é o pior caso de memória em voo na camada EventBus, enquanto
> `--max-sessions × --max-pending-prompts-per-session` limita o trabalho de prompt aceito
> na camada de admissão. O dimensionamento padrão assume carga de usuário único /
> pequena equipe; aumente progressivamente (e monitore RSS) para implantações
> multi-inquilino.

> **Salvaguardas do cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Um workspace que declara 30 servidores MCP em `mcpServers` iniciará 30 clientes sem limite upstream, a menos que você defina um. `--mcp-client-budget=N` limita a contagem de clientes MCP ativos; `--mcp-budget-mode={enforce,warn,off}` escolhe o comportamento. O padrão é `warn` quando um orçamento é definido (o snapshot exibe o aviso, mas nenhum cliente é recusado — útil para medir o fanout real antes de ativar a aplicação). Servidores recusados no modo `enforce` recebem `disabledReason: 'budget'` em sua célula por servidor, e a célula `budgets[0]` mostra `status: 'error'` + `errorKind: 'budget_exhausted'`. A reserva de slot é por nome do servidor e sobrevive a reconexões / timeouts de descoberta — um servidor recusado não pode ocupar um slot de um servidor saudável.
>
> ⚠️ **Escopo v1: por sessão, não por workspace.** Cada sessão ACP dentro do daemon tem seu próprio `Config`/`McpClientManager` (criado via `newSessionConfig` por sessão). O orçamento limita clientes MCP ativos **por sessão**, não agregados em todas as sessões no workspace. O snapshot em `GET /workspace/mcp` reflete a visão da sessão de bootstrap (a célula carrega `scope: 'session'` para honestidade). Se você executar 5 sessões ACP concorrentes com `--mcp-client-budget=10`, você pode ter até 50 clientes MCP ativos no daemon — o limite é por sessão. **Wave 5 PR 23 (pool MCP compartilhado)** introduz um gerenciador com escopo de workspace e eleva isso para uma verdadeira aplicação por workspace.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Isso **não** é o mesmo que `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code (que controla a concorrência de inicialização); eles são ortogonais. O PR 23 adicionará um pool MCP compartilhado real (uma célula `scope: 'workspace'` em `budgets[]` junto com a célula por sessão); o PR 14 v1 é o contador em processo + aplicação suave no gerenciador por sessão existente.
>
> **Eventos push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Clientes SDK inscritos em `GET /session/:id/events` recebem quadros tipados quando os limites de orçamento são ultrapassados — `mcp_budget_warning` (sintético, dispara uma vez por cruzamento ascendente de 75% com rearranjo de histerese em 37,5%, anunciado via `mcp_guardrail_events`) e `mcp_child_refused_batch` (coalescido uma vez por passagem de descoberta no modo `enforce`; comprimento 1 a partir de recusa de spawn preguiçoso de `readResource`). O snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado pós-reconexão; eventos são arestas de mudança. Útil ao criar dashboards em tempo real sem polling.

## Modelo de ameaça de implantação padrão

- **Apenas 127.0.0.1** — bind de loopback, sem autenticação necessária.
- **`--hostname 0.0.0.0` requer um token** — a inicialização recusa sem um.
- **`LOOPBACK_BINDS` inclui IPv6** — `::1` e `[::1]` contam como loopback para a regra de sem token.
- **Lista de permissão de cabeçalho Host** — em binds de **loopback** o daemon verifica se `Host:` corresponde a `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` (case-insensitive por RFC 7230 §5.4) para se defender contra DNS rebinding. **Binds não-loopback (`--hostname 0.0.0.0`) intencionalmente ignoram a lista de permissão de Host** — o operador escolheu a superfície de ataque, então a porta do bearer token é a única camada de autenticação; proxies reversos / SNI / pinning de certificado do cliente são responsabilidade do operador, não do daemon. Se você precisar de isolamento baseado em Host em um bind não-loopback, termine TLS + verifique Host em um proxy de borda.
- **CORS nega qualquer Origin de navegador por padrão** — retorna JSON `403`. Passe **`--allow-origin <pattern>`** (repetível, T2.4 #4514) para permitir origins de navegador específicos. Cada valor é o literal `*` (qualquer origin — a inicialização recusa se nenhum token bearer estiver configurado; `--require-auth` em loopback é recomendado para endurecimento completo, pois `/health` e `/demo` permanecem pré-autenticação em loopback por padrão) ou uma origin URL canônica (`<scheme>://<host>[:<port>]`, sem barra final / caminho / userinfo). Origins correspondidos recebem cabeçalhos de resposta CORS adequados (`Access-Control-Allow-Origin: <eco>`, `Vary: Origin`, além de métodos / cabeçalhos / max-age padrão e `Retry-After` exposto); origins não correspondidos ainda recebem um 403 com o mesmo envelope da parede padrão. `caps.features.allow_origin` é anunciado condicionalmente para que clientes SDK / webui possam verificar antes se o daemon honra acessos cross-origin antes de emiti-los. Exemplo: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Acessos de self-origin em loopback (por exemplo, a página `/demo`) não são afetados — um shim separado de remoção de Origin lida com eles independentemente de `--allow-origin`. **Webuis de navegador sem `--allow-origin` configurado** ainda recorrem às mesmas opções Estágio 1 de antes: empacotar como shell nativo (Electron/Tauri) para que nenhum cabeçalho `Origin` seja enviado, ou colocar o daemon atrás de um proxy reverso de mesma origem.
- **O filho gerado `qwen --acp` herda o ambiente do daemon** com uma limpeza explícita: `QWEN_SERVER_TOKEN` é removido antes do filho iniciar (o próprio bearer do daemon; o agente não precisa dele). Todo o resto — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / seu `modelProviders[].envKey` personalizado / etc. — passa, porque o agente precisa legitimamente deles para autenticar no LLM. **Isso é intencional, não é uma sandbox.** O agente executa como o mesmo UID com acesso a ferramentas shell, então qualquer coisa em `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` é acessível por injeção de prompt independentemente. O repasse de env não é a fronteira de segurança; o usuário como raiz de confiança é. Não execute `qwen serve` sob uma identidade que tenha credenciais residentes no ambiente que você não confiaria ao agente.
- **Filas SSE limitadas por assinante** — um cliente lento que excede sua fila recebe um quadro terminal `client_evicted` e é fechado; um consumidor travado não pode travar o daemon.
- **Limite de admissão de prompts por sessão** — padrão de 5 prompts aceitos mas não liquidados por sessão. Um cliente com bug não pode enfileirar promessas de prompt ilimitadas ou esperas SSE temporárias para uma sessão.
- **Desligamento gracioso** — SIGINT/SIGTERM drena os filhos do agente antes de fechar o listener (prazo de 10s por filho).
> ⚠️ **Gap conhecido do Estágio 1 — permissões são globais ao daemon, não por sessão (BUy4H).** `pendingPermissions` vive no escopo do daemon; qualquer cliente que possua o bearer token pode votar em qualquer `requestId` para qualquer sessão que consiga ver (e eventos SSE `permission_request` carregam o requestId no payload). Isso é aceitável sob o modelo de confiança de único usuário / time pequeno, onde cada cliente autenticado é o mesmo humano ou colaboradores de confiança. O Estágio 1.5 moverá para `POST /session/:id/permission/:requestId` + mapa pendente com escopo de sessão + identidade por cliente (obrigatório #3 da revisão downstream); até lá, não execute `qwen serve` atrás de um bearer compartilhado com partes não confiáveis.
>
> ⚠️ **Gap conhecido do Estágio 1 — corpo de `POST /session/:id/prompt` limitado a 10 MB (BUy4L).** Prompts multimodais contendo imagens/PDFs/áudio que excedam 10 MB falharão no momento da análise do corpo antes da lógica da rota ser executada (sem streaming, sem aborto durante o upload). Solução alternativa: reduza o conteúdo no lado do cliente, ou passe uma referência de caminho e deixe o agente ler o arquivo via `readTextFile`. O Estágio 1.5 aceitará `multipart/form-data` ou codificação chunked em `/prompt` para que prompts grandes não atinjam um limite abrupto.
>
> ⚠️ **Gap conhecido do Estágio 1 — conexões SSE fantasmas atrás de NAT.** O
> daemon detecta clientes mortos via back-pressure TCP em heartbeats
> (intervalo de 15s). Um cliente que desaparece SEM um RST TCP (ex.: uma
> caixa NAT descartando silenciosamente fluxos ociosos) mantém o socket
> no nível do kernel "vivo" até que as sondas keepalive do Node expirem —
> tipicamente ~2 horas nos defaults do Linux. Em implantações
> `--hostname 0.0.0.0` atrás desses NATs, conexões SSE fantasmas podem
> se acumular e eventualmente atingir o limite de 256
> `server.maxConnections`.
>
> Defina [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)
> para fechar a lacuna com um prazo explícito de inatividade em nível de aplicação:
> quando nenhuma escrita é descarregada com sucesso por `n` ms, o daemon emite
> um frame terminal `client_evicted` com
> `reason: 'writer_idle_timeout'` e fecha o stream. A flag está
> desligada por padrão para preservar o contrato legado — operadores em
> redes que engolem RSTs devem escolher um valor bem acima do intervalo de
> 15s do heartbeat (ex.: `60000`–`300000`) para que conexões ociosas legítimas
> não sejam ejetadas enquanto escritoras realmente travadas são
> removidas prontamente. Verifique `caps.features.includes('writer_idle_timeout')`
> a partir do seu SDK para confirmar que o daemon o suporta.

### Deadlines e writer idle timeout

A issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 entrega duas flags opt-in que fecham as lacunas de longa execução / implantação remota que o heartbeat de 15s + AbortSignal não cobrem. Ambas estão desligadas por padrão — fluxos de loopback de único usuário permanecem inalterados bit a bit.

| Flag                           | Env var                             | Default | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | não definido | Limite de tempo absoluto no lado do servidor para um único `POST /session/:id/prompt`. Ao expirar, o daemon aborta o AbortController do prompt e retorna HTTP `504` com `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Um campo `deadlineMs` no corpo da requisição por prompt pode ENCURTAR o prazo efetivo abaixo da flag, mas nunca estendê-lo. Tag de capacidade (condicional): `prompt_absolute_deadline`.                                                                                                                                                                        |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | não definido | Prazo de inatividade por conexão SSE. Quando nenhuma escrita é descarregada com SUCESSO por `n` ms — nem um evento real nem o heartbeat de 15s — o daemon emite um frame terminal `client_evicted` com `data.reason = 'writer_idle_timeout'` (espelhado em `data.errorKind`) e fecha o stream. **Escolha um valor confortavelmente acima do heartbeat de 15s** (ex.: `30000`–`300000`) para que streams ociosos legítimos não sejam ejetados; valores `< 15000` IRÃO ejetar conexões ociosas saudáveis antes do primeiro heartbeat disparar (intencional apenas para testes / sessões de desenvolvimento curtas). Tag de capacidade (condicional): `writer_idle_timeout`. |
Ambas as flags aceitam um número inteiro positivo em milissegundos; valores `0`, `NaN`, não inteiros ou negativos são rejeitados na inicialização com uma mensagem de erro clara. A flag de CLI tem precedência sobre a variável de ambiente; o campo explícito `ServeOptions` (para chamadores incorporados) tem precedência sobre a variável de ambiente. Consumidores do SDK devem verificar previamente a tag de capacidade correspondente antes de confiar em qualquer um dos comportamentos — daemons anteriores a este PR omitem ambas as tags e o campo `deadlineMs` da requisição é silenciosamente descartado.

## Implantação multi-sessão e multi-workspace

Conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, cada processo `qwen serve` associa-se a **um workspace** na inicialização. Dentro desse workspace, ele multiplexa N sessões em um único filho `qwen --acp` através do mapa de sessão nativo do agente — as sessões compartilham o processo filho / estado OAuth / cache de leitura de arquivos / parse de memória hierárquica.

Para hospedar **vários workspaces** (um usuário, vários repositórios; ou vários usuários no mesmo host), execute **vários processos daemon** — um por workspace, cada um em sua própria porta, supervisionado por systemd / docker-compose / k8s / um orquestrador de referência `qwen-coordinator`. A compensação é intencional: um workspace por filho significa que `loadSettings(cwd)` / OAuth / escopo do servidor MCP permanecem alinhados com o diretório vinculado e não se desviam entre requisições.

> **Inscreva-se ANTES de postar `modelServiceId` no attach.** Quando um cliente faz `POST /session` com um `modelServiceId` e o workspace já possui uma sessão executando um modelo diferente, o daemon emite uma chamada interna `setSessionModel` — falhas NÃO são propagadas como um erro HTTP (a sessão permanece operacional no modelo atual). O sinal visível de falha é um evento `model_switch_failed` no stream SSE da sessão. Se você chamar `POST /session` e só DEPOIS abrir `GET /session/:id/events`, você perderá o evento de falha e continuará falando com o modelo errado silenciosamente. Abra o stream SSE primeiro, ou passe `Last-Event-ID: 0` ao assinar para reproduzir o evento mais antigo disponível no ring.

Para lidar com vários **usuários** (cada um com sua própria cota, log de auditoria, sandbox) ou escalar além do alcance de um único processo (orçamento de cold-start, contagem de FDs, RSS), crie um daemon por workspace por usuário atrás de um orquestrador externo. Esse orquestrador (multi-inquilino / OIDC / Cota / Auditoria / k8s) está **fora do escopo** do projeto qwen-code — consulte a issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" para os ponteiros de design.

## Carregando e retomando uma sessão persistida

O daemon expõe o fluxo `session/load` e resume da ACP via HTTP por meio de duas rotas:

| Rota                          | Use quando                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /session/:id/load`      | O cliente **não** possui histórico renderizado (reconexão a frio, seletor-e-depois-abrir). O daemon reproduz cada turno persistido através do SSE para que os assinantes vejam a transcrição completa. Tag de capacidade: `session_load`.                                                         |
| `POST /session/:id/resume`    | O cliente já possui os turnos na tela e precisa apenas do manipulador do lado do daemon de volta. O contexto do modelo é restaurado no lado do agente sem repetição da IU — o stream SSE permanece limpo. Tag de capacidade: `session_resume` (`unstable_session_resume` permanece como um alias obsoleto para clientes mais antigos). |

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

Verifique previamente `caps.features.session_load` / `caps.features.session_resume` antes de chamar — daemons antigos retornam `404`. `unstable_session_resume` ainda é anunciado como um alias de compatibilidade obsoleto. Requisições concorrentes da mesma ação para o mesmo id se coalescem; corridas de ações cruzadas (um `load` competindo com um `resume`) obtêm `409 restore_in_progress` com `Retry-After: 5`. Consulte a [referência do protocolo](../developers/qwen-serve-protocol.md) para o envelope de erro completo.

Nota: a reprodução do histórico é limitada pelo anel SSE (padrão 8000 quadros). Históricos longos com turnos prolixos podem exceder isso — os quadros mais antigos são descartados silenciosamente. Para sessões muito longas, prefira `resume` e dependa da IU persistida local do cliente.
## Modelo de durabilidade

**As sessões ainda são efêmeras no Stage 1 em reinicializações do daemon**, mas sessões persistidas em disco podem ser recarregadas:

- Uma falha de processo filho publica `session_died` e remove a sessão ativa dos mapas do daemon. A sessão persistida em disco **pode** ser recarregada via `POST /session/:id/load` se um novo agente filho puder ser gerado.
- Uma reinicialização do daemon perde todas as sessões ativas em andamento. As sessões persistidas permanecem no disco e podem ser carregadas contra um novo processo do daemon, sujeitas às mesmas regras de vinculação de espaço de trabalho.
- Desconexões longas do cliente (>5 min em uma conversa intensa) podem exceder o anel de repetição SSE (padrão 8000 quadros) — a reconexão `Last-Event-ID` tem sucesso, mas o estado pode ficar incoerente. Para clientes móveis / com rede instável, planeje reabrir SSE em quedas longas ou chame `POST /session/:id/load` para reproduzir a partir do disco.
- Operações de arquivo (`writeTextFile`) são atômicas entre falhas (escrever-depois-renomear); elas não são atômicas entre reinicializações do daemon no sentido de reprodução — a escrita do arquivo ocorreu ou não.

Se sua integração precisar de durabilidade do lado do servidor entre reinicializações além do que `session/load` cobre (por exemplo, filas de repetição gerenciadas pelo servidor), você ainda precisa de recuperação de estado em nível de aplicação. Não mantenha estado sensível a reinicializações e de longa duração dentro da sessão do daemon.

## Garantias de runtime do Stage 1.5+

O contrato do Stage 1 é dimensionado para prototipagem. Conforme [análise do consumidor downstream #3889 chiga0](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), os itens a seguir **não** estão no Stage 1 — integrações de nível de produção precisam do Stage 1.5+ antes de confiar neles:

**Impedimentos para uso sério downstream:**

1. **`loadSession` / `unstable_resumeSession` via HTTP** — sem isso, nenhuma integração pode sobreviver a uma falha de filho ou reinicialização do daemon, e qualquer orquestrador coordenando o daemon também não pode recuperar o estado.
2. **Identidade persistente do cliente (tokens de par + revogação por cliente)** — O Stage 1 usa um bearer compartilhado; um token vazado revoga todos, e `originatorClientId` é autodeclarado pelo cliente, em vez de carimbado pelo daemon a partir de identidade autenticada.

**Linha de base de confiabilidade:**

3. ~~**Caminho de heartbeat iniciado pelo cliente**~~ — enviado via [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9. `POST /session/:id/heartbeat` registra carimbos de data/hora da última visualização no daemon (tag de capacidade `client_heartbeat`); os auxiliares do SDK são `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Evento `permission_already_resolved`** quando um voto perde a corrida de primeiro respondente — atualmente, as UIs precisam inferir o estado a partir de um 404.
5. ~~**Anel de repetição maior**~~ — aumentado para 8000. **Anel configurável por sessão** ainda em aberto — cargas de trabalho móveis / com turnos intensos podem precisar de substituições por sessão.
6. **Evento `slow_client_warning` antes de `client_evicted`** — contrapressão suave para que clientes lentos bem-comportados possam se auto-regularem (reduzir profundidade de renderização, descartar blocos) antes de serem encerrados.

**Ergonomia de integração:**

7. **`POST /session/:id/_meta` para contexto estilo IM** — chave-valor por sessão anexada a prompts subsequentes (id do chat, remetente, id da thread) substitui a improvisação por canal.
8. **Negociação real de recursos `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` para que os clientes possam detectar desvios em vez de cair em "quadro desconhecido, ignorar".
9. **Documentação de durabilidade de primeira classe (esta seção)** — já enviada acima.

O roteiro completo de convergência é rastreado em [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

## Limites de escopo do Stage 1 — o que não corrigiremos no Stage 1.5

Duas escolhas estruturais são explicitamente não objetivos para o roteiro principal do Stage 1 / 1.5 / 2. Se seu caso de uso depende de qualquer uma delas, planeje em torno delas em vez de esperar por nós.

### O estado da sessão é apenas de mutação local (por [revisão LaZzyMan #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

O plano do Stage 1.5 descreve o TUI como um assinante do EventBus no processo. Na prática, **a interface TUI é estritamente maior que o protocolo de conexão**:

- **Interface local apenas** — os ~15 componentes de diálogo Ink (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) e os comandos de barra `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) renderizam Ink JSX específico do terminal. Clientes remotos via HTTP/SSE não podem renderizar Ink de forma equivalente, e esses fluxos não emitem evento de protocolo.
- **Mutações de estado da sessão sem eventos de protocolo** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (escrevendo `CLAUDE.md`) todos alteram o comportamento do agente, mas apenas `/model` atualmente publica um evento (`model_switched`).

**Escolha do Stage 1 — opção (A) da revisão**: não promover essas mutações a eventos de protocolo. Os dois modos de implantação têm consequências diferentes.

#### Modo 1 — `qwen serve` headless (este PR)

Nenhum shell TUI é executado dentro do daemon. Os comandos de barra listados acima **não existem** neste modo — não há interface de terminal para emiti-los. O estado da sessão, portanto,
- **Congelado na inicialização** para `approval-mode` / `memory` / `agents` / `tools` (lista de permissão) / `auth` — tudo carregado das configurações e do disco quando o filho `qwen --acp` do daemon é iniciado; imutável durante a vida útil da sessão. Servidores MCP definidos nas configurações também são congelados na inicialização, mas **servidores adicionados em tempo de execução** (via `POST /workspace/mcp/servers`) podem ser adicionados ou removidos sem reinicialização.
- **Mutável via HTTP** através de `POST /session/:id/model` (publica `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publica `mcp_server_added` / `mcp_server_removed`), e votos de permissão (`POST /permission/:requestId`).

**Consequência:** clientes remotos em modo headless veem o **estado completo da sessão**. Nenhuma TUI esconde estado adicional; nenhuma divergência é possível. Se quiser alterar `approval-mode`, reinicie o daemon com novas configurações. Servidores MCP agora podem ser adicionados/removidos em tempo de execução através das rotas de mutação (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — veja [Gerenciamento de servidores MCP em tempo de execução](#runtime-mcp-server-management-issue-4514).

#### Modo 2 — Etapa 1.5 `qwen --serve` TUI co-hospedada (não neste PR)

Quando a Etapa 1.5 implementar `qwen --serve` (processo TUI co-hospeda o mesmo servidor HTTP), a TUI **existirá** junto com clientes remotos. Um operador local digitando `/approval-mode yolo` ou `/mcp add-server` modifica o estado da sessão, e clientes remotos via HTTP não têm nenhum evento para observar a mudança.

Neste modo, a TUI é um "super-cliente" — ela observa a mesma conversa do agente que os clientes remotos veem, E pode modificar o estado da sessão que os clientes remotos não conseguem. A assimetria é:

- ✅ Tanto a TUI quanto os clientes remotos veem as mesmas mensagens do agente, chamadas de ferramentas, diffs de arquivos, solicitações de permissão.
- ❌ Apenas a TUI vê/modifica o estado de `approval-mode` / memória / lista de servidores MCP / agentes / lista de permissão de ferramentas / auth.

**Consequência no Modo 2:** se a interface de um cliente remoto tenta espelhar as configurações da sessão, ela pode divergir após qualquer comando com barra da TUI. Clientes remotos devem **reobter o estado ao anexar/reconectar** (use `Last-Event-ID: 0` para reproduzir o evento mais antigo do anel para coisas como `model_switched`); eles NÃO devem confiar em eventos incrementais para mutações do lado da TUI.

#### Por que (A) e não (B) (promover mutações para a família de eventos `session_state_changed`)

(B) é a resposta mais ambiciosa, mas prende a Etapa 1.5 a uma superfície de wire substancialmente maior que também deve passar limpa pela refatoração intraprocesso planejada. Preferimos trilhar o escopo menor honestamente. O trabalho de taxonomia de eventos de estado da sessão — enumerar quais fluxos da TUI são locais por design vs. poderiam plausivelmente migrar para wire sob uma futura extensão opt-in do tipo (B) — vai para [#3803](https://github.com/QwenLM/qwen-code/issues/3803), não para o código da Etapa 1.5.

### N sessões paralelas compartilham um único filho `qwen --acp`

Múltiplas sessões no mesmo workspace **compartilham um único processo filho `qwen --acp`** através do suporte nativo a múltiplas sessões do agente (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). O bridge chama `connection.newSession({cwd, mcpServers})` para cada sessão — o agente as armazena em seu mapa de sessões e demultiplexa o sessionId por chamada.

Custo concreto para N=5 sessões no mesmo workspace:

| Recurso                             | Por sessão | Em N=5                       |
| ----------------------------------- | ---------- | ---------------------------- |
| Processo Node do daemon             | um         | **30–50 MB** (um daemon)     |
| Filho `qwen --acp`                  | compartilhado | **60–100 MB** (um filho) |
| Filhos de servidores MCP            | por sessão | 3×N se as configurações diferirem |
| `FileReadCache` (heap do filho)     | compartilhado | analisado uma vez          |
| Parse de memória `CLAUDE.md` / hierarquia | compartilhado | analisado uma vez          |
| Estado do token de atualização OAuth | compartilhado | **um caminho de atualização** |
| Fatos aprendidos da memória automática | compartilhado | uma base de conhecimento por filho |
| Inicialização a frio                | apenas na primeira | <200 ms após a primeira sessão |

O bridge mantém **um canal por daemon** (um daemon por workspace, conforme §02). O canal permanece ativo enquanto pelo menos uma sessão estiver ativa; o último `killSession` (ou uma falha no nível do canal) encerra o filho.

**Filhos de servidores MCP** ainda são por sessão atualmente — a configuração de cada sessão pode especificar servidores diferentes, então eles são gerados de forma independente. Acompanhamento da Etapa 1.5: refatorar contagem de referências para filhos de servidores MCP por `(workspace, config-hash)` para que configurações idênticas sejam compartilhadas. Não está no escopo deste PR.

**Agentes pares (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) todos fazem múltiplas sessões em um único processo.** qwen-code os iguala na camada do agente; o bridge da Etapa 1 neste PR torna a mesma arquitetura visível via HTTP.

## Fazer login em um daemon remoto (issue #4175 PR 21)

Quando o daemon executa em um pod remoto (sem compartilhar uma tela com você), um cliente pode
acionar um fluxo OAuth device code via HTTP. O daemon faz polling no IdP por conta própria; sua função
é apenas abrir uma URL em qualquer dispositivo que tenha um navegador.
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

O SDK TypeScript encapsula ambas as etapas em um único auxiliar:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**O daemon nunca abre um navegador em seu nome.** Mesmo quando executado localmente, o daemon permanece passivo — ele retorna a URL e deixa o SDK/usuário escolher onde abri-la. Isso é intencional: um daemon em um pod headless que chamasse `xdg-open` silenciosamente falharia, mascarando a superfície real de autenticação. Espelhe a UX de "Pressione Enter para abrir o navegador" do `gh auth login` em seu cliente.

**`--require-auth` e conveniência de desenvolvimento.** As rotas de device-flow usam o strict mutation gate (PR 15), o que significa que um loopback sem token padrão retorna `401 token_required`. Localmente, a maneira mais simples de contornar isso durante o desenvolvimento é `qwen serve --token=dev-token`; você não precisa de `--require-auth` a menos que esteja reforçando o padrão de loopback.

**Limitação entre daemons.** `oauth_creds.json` é compartilhado entre daemons (`~/.qwen/oauth_creds.json`), então um login bem-sucedido no daemon A é automaticamente captado pela próxima atualização de token do daemon B — mas os clientes do SDK do daemon B não receberão o evento `auth_device_flow_authorized` (eventos são por daemon).

**Assunção entre clientes.** Dois clientes do SDK no mesmo daemon que ambos façam `POST /workspace/auth/device-flow` para o mesmo provedor obtêm o singleton por provedor: a primeira chamada inicia uma nova requisição ao IdP e retorna `attached: false`; a segunda chamada retorna a entrada já em andamento com `attached: true`. A assunção é registrada no audit trail (sob o `X-Qwen-Client-Id` do segundo cliente), mas NÃO emite um evento separado — ambos os clientes eventualmente observam o MESMO `auth_device_flow_authorized` assim que o usuário finaliza a página do IdP. Se sua UI distingue "Eu iniciei isso" de "fluxo de outra pessoa que entrei", use o campo `attached` retornado por `start()`.

## Arquivo de log do daemon

`qwen serve` escreve um log diagnóstico por processo em:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Um link simbólico `latest` no mesmo diretório sempre aponta para o log do processo atual, então `tail -f ~/.qwen/debug/daemon/latest` seguirá qualquer daemon que estiver em execução.

O log captura mensagens de ciclo de vida, erros de rota (com contexto `route=` e `sessionId=`), stderr de filhos ACP e — quando `QWEN_SERVE_DEBUG=1` está definido — migalhas extras da bridge. Linhas que vão para stderr hoje ainda vão para stderr; o log em arquivo é **aditivo**, não uma substituição.

### Desabilitando

Defina `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) para pular completamente a gravação de log em arquivo. A saída stderr não é afetada.

### Relação com logs de depuração de sessão

Logs de depuração com escopo de sessão (`~/.qwen/debug/<sessionId>.txt` e o link simbólico `~/.qwen/debug/latest`) são independentes. O log do daemon reside em um subdiretório `daemon/` irmão; a semântica de depuração por sessão não é alterada por este recurso.

### Sem rotação

O log do daemon anexa indefinidamente. Faça a rotação manualmente se ficar grande. Uma melhoria futura pode adicionar rotação automática; acompanhe via follow-ups de [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

## Gerenciamento de servidores MCP em tempo de execução (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

Adicione ou remova servidores MCP em tempo de execução sem reiniciar o daemon. As entradas em tempo de execução vivem em uma sobreposição efêmera que **sombreia** servidores definidos nas configurações com o mesmo nome; a configuração subjacente `settings.json` / `mcpServers` nunca é alterada.

**Pré-verificação:** verifique `caps.features` por `mcp_server_runtime_mutation` antes de chamar qualquer uma das rotas. Daemons mais antigos sem essa tag retornam `404`.

### `POST /workspace/mcp/servers` — adicionar um servidor MCP em tempo de execução
Com acesso estrito (token bearer obrigatório). Conecta o servidor imediatamente via `McpClientManager` ativo e descobre suas ferramentas.

Requisição:

```json
{
  "name": "meu-servidor",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` deve ser alfanumérico, mais `_` e `-` (máximo de 256 caracteres). `config` é o mesmo objeto de configuração de servidor MCP usado nas entradas `mcpServers` do `settings.json` (campos dependentes do transporte: `command`/`args` para stdio, `url` para SSE/HTTP). Campos sensíveis à segurança (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) são removidos pelo daemon e ignorados.

Resposta (200) — sucesso:

```json
{
  "name": "meu-servidor",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — uma entrada em tempo de execução com o mesmo nome já existia e a impressão digital (fingerprint) da configuração difere; a conexão antiga foi derrubada e uma nova estabelecida. Quando a impressão digital coincide (readição idempotente), `replaced` é `false`.
- `shadowedSettings: true` — existe um servidor definido nas configurações (settings) com o mesmo nome; a entrada em tempo de execução agora o sombreia. A entrada de configurações não é alterada e reaparece se a entrada em tempo de execução for removida posteriormente.
- `toolCount` — número de ferramentas descobertas no servidor recém-conectado.

Resposta (200) — recusa suave (modo de aviso de orçamento):

```json
{
  "name": "meu-servidor",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Retornado quando `--mcp-budget-mode=warn` e adicionar o servidor excederia o `--mcp-client-budget` configurado. O servidor NÃO é conectado. Os chamadores devem sinalizar ao usuário a pressão orçamentária.

Erros:

| Status | Código                      | Quando                                                                                                 |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `400`  | `invalid_server_name`       | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]`                        |
| `400`  | `missing_required_field`    | `config` ausente ou não é um objeto não nulo                                                          |
| `400`  | `invalid_client_id`         | Cabeçalho `X-Qwen-Client-Id` presente mas não registrado para este workspace                          |
| `400`  | `invalid_config`            | Forma do config rejeitada pelo validador de transporte MCP                                            |
| `401`  | `token_required`            | Nenhum token bearer configurado (portão estrito)                                                      |
| `409`  | `mcp_budget_would_exceed`   | `--mcp-budget-mode=enforce` e o orçamento está cheio                                                  |
| `502`  | `mcp_server_spawn_failed`   | O processo do servidor saiu ou expirou durante a conexão; o corpo carrega `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable`   | Nenhum filho ACP ativo (nenhuma sessão foi criada ainda)                                              |

### `DELETE /workspace/mcp/servers/:name` — remover um servidor MCP em tempo de execução

Acesso restrito. Desconecta o servidor e o remove da sobreposição em tempo de execução. Idempotente — remover um nome que nunca foi adicionado retorna uma resposta de pulo (skip) (não um erro).

O parâmetro de caminho `:name` é o nome do servidor codificado em URL.

Resposta (200) — sucesso:

```json
{
  "name": "meu-servidor",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — a entrada de tempo de execução removida estava sombreando um servidor definido nas configurações com o mesmo nome. Essa entrada de configurações agora não está mais sombreada e será usada na próxima descoberta/reinício.

Resposta (200) — pulo idempotente:

```json
{
  "name": "fantasma",
  "skipped": true,
  "reason": "not_present"
}
```

Retornado quando o nome não estava na sobreposição de tempo de execução (pode ainda existir nas configurações — entradas de configurações não podem ser removidas por esta rota).

Erros:

| Status | Código                      | Quando                                                                                   |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`       | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]`          |
| `400`  | `invalid_client_id`         | Cabeçalho `X-Qwen-Client-Id` presente mas não registrado para este workspace            |
| `401`  | `token_required`            | Nenhum token bearer configurado (portão estrito)                                         |
| `503`  | `acp_channel_unavailable`   | Nenhum filho ACP ativo                                                                   |

### Semântica de sombreamento (shadow)

Entradas de tempo de execução formam uma sobreposição efêmera sobre servidores MCP definidos nas configurações:

- **Adicionar** um servidor de tempo de execução com o mesmo nome de uma entrada de configurações o **sombreia** — a configuração de tempo de execução tem precedência. A entrada original das configurações não é modificada.
- **Remover** um servidor de tempo de execução que estava sombreando uma entrada de configurações **remove o sombreamento** — a configuração definida nas configurações se torna ativa novamente na próxima conexão.
- **Reinício do daemon** perde todas as entradas de tempo de execução. Apenas servidores definidos nas configurações sobrevivem a reinícios. Servidores de tempo de execução são limitados ao ciclo de vida da sessão.
- **`GET /workspace/mcp`** informa a visão mesclada — servidores definidos nas configurações e em tempo de execução aparecem no array `servers[]`. Não há distinção no nível de transmissão (wire) entre as duas origens na visão atual.
### Eventos

Ambas as rotas emitem eventos SSE com **escopo de workspace** (todos os barramentos de sessão ativos os recebem):

| Evento               | Emitido quando                        | Campos do payload                                                                         |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `mcp_server_added`   | A requisição `POST` é bem-sucedida (não ignorada) | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | A requisição `DELETE` é bem-sucedida (não ignorada) | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

Respostas ignoradas (`budget_warning_only`, `not_present`) NÃO emitem eventos.

Eventos relacionados a orçamento da superfície existente `mcp_guardrail_events` (`mcp_budget_warning`, `mcp_child_refused_batch`) também são disparados quando adições em tempo de execução ultrapassam o limite de orçamento.

## Próximos passos

- **Configurando um daemon de longa duração?** [Modelos de inicialização local (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) para v0.16-alpha (apenas local).
- **Criando um cliente?** Consulte o [Guia rápido TypeScript do DaemonClient](../developers/examples/daemon-client-quickstart.md) e a [Referência do protocolo HTTP](../developers/qwen-serve-protocol.md).
- **Lendo o código-fonte?** O código da Bridge está em `packages/cli/src/serve/`; o SDK do cliente em `packages/sdk-typescript/src/daemon/`.
- **Acompanhando o roadmap?** O progresso do Stage 1.5 / Stage 2 é monitorado na issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).
