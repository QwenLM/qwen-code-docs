# Provider Externo de Tool Guard para ACP Gerenciado

Status: design de implementação
Issue de acompanhamento: https://github.com/QwenLM/qwen-code/issues/8102
Depende de: https://github.com/QwenLM/qwen-code/pull/8032

## Problema e escopo

O Qwen Code já suporta regras de permissão e hooks, mas esses mecanismos não
dão a um deployment gerenciado de `qwen serve` uma decisão obrigatória,
externa e verificável por máquina imediatamente antes de cada executor de
ferramenta. O PR #8032 adiciona esse callback de limite de executor. Esta
mudança conecta o callback a um pequeno provider externo para deployments
gerenciados de ACP.

O escopo é intencionalmente uma decisão:

> Dada a identidade de sessão e prompt de posse do runtime, o rótulo de
> correlação de chamada de ferramenta aceito pelo runtime, o nome canônico da
> ferramenta e os argumentos finais, esta invocação pode executar agora?

Esta mudança não adiciona um protocolo de tarefa, callback de resultado,
serviço de observador/replay, substituição geral de hooks ou uma camada de
autorização para APIs explícitas de controle/gerenciamento do daemon. Também
não torna determinística a implementação de uma ferramenta permitida nem faz
sandbox do comportamento de um comando que o provider escolheu permitir.

## Contrato de segurança

- A ativação é apenas no início do processo: `off` (padrão) ou `required`.
- Em `off`, nenhum provider é construído, nenhum RPC de provider é feito e
  nenhuma capability é anunciada. Com nenhuma das novas entradas presente, o
  comportamento do CLI standalone / ACP comum é inalterado. A variável de
  ambiente reservada do token ainda é removida dos ambientes de execução
  descendentes se definida.
- Em `required`, a inicialização do daemon executa um handshake autenticado e
  versionado. Configuração ausente ou inválida e um provider indisponível ou
  incompatível fazem a inicialização do daemon falhar.
- Toda invocação de nível superior suportada que passa dos gates de permissão
  e `PreToolUse` existentes e chega ao limite final de execução executa
  exatamente uma requisição `prepare` limitada. Uma negação anterior de
  permissão/hook não executa nenhuma requisição ao provider. Não há retry.
  Timeout, cancelamento, falha de transporte, resposta malformada, divergência
  de identidade ou negação explícita impedem o executor de rodar.
- A ordem herdada do PR #8032 é tratamento de permissão, hooks `PreToolUse`,
  então este Guard, então o executor alvo. O Guard autoriza apenas o executor
  da ferramenta alvo; ele não autoriza nem faz sandbox de comportamento de
  hooks. Deployments gerenciados que exigem um limite de todos os efeitos
  devem desabilitar hooks ou confiar neles e governá-los independentemente.
- Ações de comando slash são resolvidas antes do agendamento de
  modelo/ferramenta e não são invocações do Tool Guard. Alguns embutidos
  podem mutar diretamente arquivos ou configurações. Exceto pelas entradas de
  agente aninhado explicitamente rejeitadas abaixo, esta mudança não
  classifica comandos slash; hosts gerenciados devem rejeitar entrada de
  comando slash ou desabilitar comandos não aprovados com
  `slashCommands.disabled` / `--disabled-slash-commands`.
- As credenciais do provider permanecem no processo `qwen serve`. Nunca são
  copiadas para o ambiente do filho ACP, worker de canal, subprocesso de
  ferramenta, servidor MCP, hook ou subagente. O CLI captura e remove o token
  ambiente antes que os snapshots de ambiente do runtime sejam congelados.
- A requisição de guard filho-para-pai usa o canal ACP privado existente. A
  bridge a aceita apenas para uma sessão de posse daquele canal e apenas
  quando seu ID de prompt é igual ao ID de prompt ativo da bridge.
- Todo canal ACP deve reconhecer `required-v1` na sua resposta de initialize,
  provando que o filho consumiu o marcador privado e instalou o callback de
  executor. Um reconhecimento ausente ou divergente rejeita o canal antes que
  qualquer Session possa ser criada.
- O ACP gerenciado não inicia o runtime de sugestão-especulação interativo.
  Se um embedding independentemente alcançar o caminho de especulação do PR
  #8032, o mesmo callback ainda é exigido antes do apply.
- O V1 suporta apenas invocações de ferramenta de nível superior feitas
  durante um Prompt gerenciado ativo de primeiro plano. `agent`, `workflow`,
  `create_sub_session`, `send_message`, o ponto de entrada direto `/fork` e
  os controles de lembrar/dream de memória de workspace apoiados por agente
  são rejeitados antes que possam iniciar, retomar ou delegar para um
  AgentCore/Session independente. Turnos automáticos/cron e agentes em
  background restaurados não carregam contexto ativo de Prompt gerenciado,
  então suas ferramentas guardadas falham de forma fechada (fail closed).
- Uma invocação de shell de nível superior com `is_background=true`, ou uma
  invocação de `monitor`, ainda é uma invocação guardada: o provider vê seus
  argumentos finais e pode negá-la. O Guard não autoriza continuamente o
  processo lançado nem adiciona um novo protocolo de auditoria de conclusão
  de processo. Políticas gerenciadas que exigem conclusão em primeiro plano
  devem negar esses formatos de argumento/ferramenta.
- Um erro de transporte de MCP guardado é tratado como um resultado ambíguo e
  não é reconectado/reproduzido automaticamente. A permissão anterior não
  pode autorizar uma segunda tentativa de execução.
- Eventos existentes de ciclo de vida de ferramenta `session/update` do ACP
  permanecem como a fonte de observação de execução. A requisição do provider
  e esses eventos se correlacionam por `sessionId`, `promptId` e
  `toolCallId`.

A força de identidade é deliberadamente explícita:

- `sessionId` é gerado e de posse da Session do daemon/ACP;
- `promptId` é gerado pelo daemon e re-vinculado depois que metadata do
  chamador é removida;
- `toolCallId` é um rótulo de correlação aceito pelo runtime. Pode ter origem
  na chamada de ferramenta do modelo, então não é um sujeito de autenticação
  nem uma chave de idempotência independente;
- `requestId` é gerado pelo `qwen serve` para o único RPC do provider. É o
  identificador de operação de decisão do provider, mas os eventos de ciclo
  de vida existentes se correlacionam usando a tupla completa
  `(sessionId, promptId, toolCallId)`.

## Configuração

```bash
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

Regras:

- `--external-tool-guard-mode` aceita `off|required` e o padrão é `off`.
- `required` exige um endpoint HTTP(S) loopback apenas por origem e um token
  não vazio de no máximo 8192 unidades de código UTF-16 sem caracteres de
  controle em `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN`.
- Userinfo do endpoint, query, fragment e caminhos fora da raiz são
  rejeitados.
- `localhost` é fixado pelo cliente em `127.0.0.1` (com SNI `localhost` para
  HTTPS); nunca é resolvido por DNS ambiente ou configuração de proxy.
- Timeout é um inteiro de 100 a 30000 ms. O padrão é 3000 ms.
- Endpoint e token sem `mode=required` não ativam um provider. O token
  reservado ainda é consumido e removido em vez de exposto às ferramentas.

## Fluxo de dados em runtime

```mermaid
sequenceDiagram
    participant Host as "DataAgent / operator"
    participant Serve as "qwen serve"
    participant Guard as "External Guard"
    participant ACP as "private qwen --acp"
    participant Exec as "Tool executor"

    Host->>Serve: "start with mode=required"
    Serve->>Guard: "POST /v1/handshake (Bearer token)"
    Guard-->>Serve: "version + nonce + prepare capability"
    Serve->>ACP: "spawn; private ACP capability + required marker"
    ACP-->>Serve: "initialize acknowledgement: required-v1"
    Host->>Serve: "prompt"
    Serve->>ACP: "prompt + runtime-owned sessionId/promptId"
    ACP->>ACP: "permission + PreToolUse gates"
    ACP->>Serve: "private extMethod prepare(sessionId,promptId,toolCallId,name,args)"
    Serve->>Serve: "verify owned session + active prompt"
    Serve->>Guard: "POST /v1/prepare (exactly once)"
    Guard-->>Serve: "allow or deny"
    Serve-->>ACP: "decision"
    alt "allow"
        ACP->>Exec: "execute final invocation"
        ACP-->>Serve: "existing tool_call_update terminal event"
    else "deny / unknown / timeout / cancel"
        ACP-->>Serve: "existing EXECUTION_DENIED/cancelled terminal event"
    end
```

## Contrato de wire

Todos os corpos usam JSON UTF-8 e `Content-Type: application/json`.
Requisições usam `Authorization: Bearer <token>`. Redirects não são seguidos.
Corpos de resposta são limitados antes do parsing de JSON. Uma requisição
serializada não pode exceder 1 MiB, uma resposta não pode exceder 64 KiB e
uma razão de negação não pode exceder 500 unidades de código UTF-16 nem
conter caracteres de controle.

Argumentos finais de ferramenta são dados de aplicação e podem conter código
fonte, caminhos, consultas ou credenciais fornecidas a uma ferramenta. O
provider deve tratá-los como sensíveis e não deve persisti-los
indiscriminadamente apenas porque o transporte é loopback.

Requisição de handshake:

```json
{
  "protocolVersion": 1,
  "nonce": "runtime-random-value",
  "client": "qwen-code"
}
```

Resposta de handshake:

```json
{
  "protocolVersion": 1,
  "nonce": "same-runtime-random-value",
  "capabilities": { "prepare": true }
}
```

Requisição prepare:

```json
{
  "protocolVersion": 1,
  "requestId": "runtime-random-value",
  "sessionId": "runtime-owned-session-id",
  "promptId": "runtime-owned-prompt-id",
  "toolCallId": "runtime-accepted-tool-call-correlation-id",
  "toolName": "canonical_tool_name",
  "arguments": { "final": "tool arguments" }
}
```

Resposta allow:

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": true
}
```

Resposta deny:

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": false,
  "reason": "Safe user-visible policy reason"
}
```

Campos desconhecidos, versões/nonces/IDs de requisição errados, booleanos
inválidos, corpos acima do tamanho e razões de negação inseguras são falhas
de protocolo e, portanto, negam.

## Mapa de implementação no código-fonte

| Preocupação                                                                 | Ponto de implementação                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Flags do CLI, captura de token e remoção no bootstrap fora do serve          | `packages/cli/src/commands/serve.ts`, `packages/cli/src/cli.ts`                     |
| Opções embutidas públicas                                                    | `packages/cli/src/serve/types.ts`                                                   |
| Validação de configuração, cliente HTTP loopback, handshake, parsing de resposta | `packages/cli/src/serve/external-tool-guard-provider.ts`                        |
| Construção do provider, handshake de boot, capability e conexão da bridge     | `packages/cli/src/serve/run-qwen-serve.ts`                                          |
| Ext-method privado compartilhado e tipos de handler                           | `packages/acp-bridge/src/status.ts`, `bridgeOptions.ts`                             |
| Validação de sessão de posse / prompt ativo                                  | `packages/acp-bridge/src/bridgeClient.ts`                                           |
| Injeção da bridge                                                            | `packages/acp-bridge/src/bridge.ts`                                                 |
| Captura do marcador required privado, remoção de token e preservação de relançamento | `packages/cli/src/gemini.tsx`                                               |
| Injeção de Config por sessão e callback do filho                             | `packages/cli/src/acp-integration/acpAgent.ts`, `packages/cli/src/config/config.ts` |
| Reconhecimento obrigatório do filho e admissão no lado do pai                 | `packages/cli/src/acp-integration/acpAgent.ts`, `packages/acp-bridge/src/bridge.ts` |
| Contexto de runtime no limite do executor                                    | `packages/core/src/core/tool-invocation-guard.ts` e os três pontos de chamada do PR #8032 |
| Anúncio condicional de funcionalidade                                        | `packages/cli/src/serve/capabilities.ts`                                            |

## Compatibilidade e comportamento de falha

| Deployment                                              | Comportamento esperado                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `qwen` interativo/headless                              | Comportamento de execução existente inalterado quando as novas entradas estão ausentes |
| `qwen --acp` lançado por uma IDE                        | Sem provider; marcador privado ausente                             |
| `qwen serve` sem novas flags                            | Sem provider, sem capability, comportamento atual de preheat/retry  |
| `qwen serve`, endpoint/token presentes, mode omitido/off | Sem provider/capability; token reservado é removido dos filhos    |
| `qwen serve`, required, provider válido                 | Capability anunciada; toda ferramenta de nível superior suportada é guardada |
| `qwen serve`, required, configuração/handshake inválidos | O listener não inicia                                              |
| Required, filho não reconhece o Guard instalado         | O canal ACP é rejeitado antes da criação da Session                |
| Provider required falha durante um turno                | A invocação é negada; contagem de executores permanece zero        |
| Required, entrada aninhada/oculta de AgentCore não suportada | Rejeitada localmente antes da execução aninhada iniciar       |
| Required, resposta MCP perdida/conexão fechada          | Primeira tentativa falha; sem reconexão ou replay automáticos      |

A capability é `external_tool_guard` e é anunciada apenas quando o modo
required completou seu handshake de inicialização.

## Plano de verificação

Testes unitários e de contrato devem provar:

1. validação estrita de endpoint/configuração;
2. handshake autenticado, validação de nonce/versão/schema e limites de
   corpo;
3. allow, negação explícita, timeout, abort, falha de conexão e resposta
   malformada, sem retry;
4. BridgeClient rejeita sessão desconhecida e identidade de prompt obsoleta
   antes de chamar o provider;
5. padrão off não cria provider e não anuncia capability;
6. o token nunca entra no ambiente efetivo do filho ACP;
7. o marcador required sobrevive ao caminho existente de relançamento, mas é
   removido antes que ferramentas possam herdar o ambiente do processo ACP;
8. o modo required injeta o callback na Config de toda sessão ACP ao vivo;
9. todo canal ACP required deve reconhecer o callback instalado antes da
   criação da Session;
10. o ACP gerenciado não inicia especulação de sugestão, e um caminho de
    especulação invocado separadamente ainda exige o callback antes do apply;
11. controles aninhados/delegantes `agent`, `workflow`, `create_sub_session`,
    `send_message`, `/fork` direto e de memória de workspace apoiados por
    agente são rejeitados, enquanto turnos automáticos/em background sem o
    contexto de Prompt ativo falham de forma fechada;
12. um erro de conexão MCP guardado executa uma chamada e sem
    reconexão/replay;
13. um caso ponta a ponta de ACP gerenciado corresponde
    `sessionId/promptId/toolCallId` do provider aos eventos existentes de
    início/término e prova que a contagem de executor é um para allow e zero
    para deny/falha.

Rodar testes focados dos pacotes, build/typecheck/lint do repositório e a
suíte E2E do daemon. O relatório do PR registra comandos e resultados exatos.

## Não objetivos e acompanhamentos

- Transporte por socket de domínio Unix; v1 usa um endpoint HTTP(S) loopback
  apenas por origem.
- Replay de decisão no lado do provider ou reenvio idempotente; o Qwen Code
  não envia retries.
- Linhagem de execução aninhada/delegada (`agent`, `workflow`,
  `create_sub_session`, `send_message`, `/fork`), controles de memória de
  workspace apoiados por agente e um futuro protocolo de Guard ciente de
  tentativas. O V1 rejeita esses pontos de entrada de agente
  aninhados/ocultos em vez de alegar correlação não suportada.
- Reporte de resultado ou armazenamento de auditoria no Qwen Code. O provider
  e o DataAgent são donos dos seus registros de auditoria; o Qwen Code
  fornece chaves de correlação estáveis e eventos de ciclo de vida
  existentes.
- Autorização contínua ou um novo contrato de resultado terminal para um
  processo de shell/monitor em background após seu início guardado. Providers
  podem rejeitar essas invocações pelo nome final da ferramenta e argumentos.
- Uma Task API de negócio, aprovação de plano, grants ou política específica
  do DataAgent.
- Autorização ou sandbox de implementações de hooks. `PreToolUse` roda antes
  deste Guard de executor sob o contrato do PR #8032.
- Autorização de ações de comando slash. Elas rodam antes do agendador de
  ferramentas; hosts gerenciados que precisam de um limite de todos os
  efeitos devem rejeitar entrada de comando slash ou manter uma denylist de
  deployment estrita fora desta funcionalidade.
- Inspeção semântica ou sandbox de uma implementação de ferramenta ou comando
  de shell permitidos. O provider decide sobre o nome canônico e argumentos
  finais; um deployment gerenciado deve combinar essa decisão com sua política
  de ferramentas e limite de isolamento existentes.
- Autorização para operações explícitas de controle REST/ACP do daemon; essas
  permanecem governadas pela autenticação e contratos de API existentes do
  daemon.
