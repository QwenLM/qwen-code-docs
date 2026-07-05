# Coordenação de canal lateral do daemon — Design (A1 / A2 / A4 / A5)

> Tem como alvo o branch `daemon_mode_b_main` (conforme a estratégia de branching #4175). Autor: 秦奇. Data: 2026-05-25. Revisado: 2026-05-27 (v13 — zombie-gap doc, contrato `reconciliation_failed`, especificação `availableCommands`, §7 atomic-coupling, §8 bounded-call-count).
> **Apenas documentação / design-first.** A4 implementado + aprovado (#4539); A1 implementado (#4546).
>
> Fonte: auditoria de sincronização em tempo real entre clientes (2026-05-24) + revisão pós-merge do PR #4484 (os follow-ups da **série A**). Os follow-ups de correção de bugs/limpeza da mesma revisão são enviados separadamente (PR #4510) e estão **fora do escopo aqui**.

## Changelog

### v12 (2026-05-27) — nona rodada de revisão (assinatura do helper + guarda estrutural)

- **O helper `publishModelSwitched` agora aceita `originatorClientId` (Crítico).** Tanto o bridge roundtrip (`bridge.ts:1172`, `:2883`) quanto o `applyModelServiceId` passam o `originatorClientId` para cada evento `model_switched`. A assinatura `publishModelSwitched(entry, modelId)` da v11 omitia isso — forçando os implementadores a descartar a atribuição silenciosamente ou contornar o helper. Corrigido: a assinatura agora é `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })`. O bridge roundtrip e o `applyModelServiceId` passam o `originatorClientId` resolvido; a promoção do demux e a correção de reconciliação não passam nenhum.
- **A regra de não-recursão agora tem aplicação estrutural.** A v11 dependia da disciplina do grafo de chamadas (contratual — "não flua através do hook `.finally`"). A v12 adiciona uma flag por sessão `reconciliationInFlight: boolean` definida como `true` antes da leitura assíncrona e limpa depois. Se o `.finally` de roundtrip-settle for disparado enquanto a flag já estiver `true`, ele registra no log e pula. Isso torna a não-recursão um invariante, independentemente de refatorações futuras.
- **Formato do log de observabilidade estendido com contadores de geração.** O formato agora é `[reconcile] session=<id> trigger=… baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=…`. Renomeado `published` → `baseline` (no caminho de falha, nenhum `model_switched` foi publicado, então "published" era enganoso). A frase sobre não-recursão foi removida da linha de observabilidade (coberta pelo parágrafo dedicado acima — um único ponto de manutenção).
- **Modos de falha do invariante de leitura fresca corrigidos.** O cenário "stale-but-equal" era autosscontraditório; substituído por modos de falha duais precisos: (1) resposta obsoleta correspondendo a `entry.currentModelId` → "converged" falso (divergência real não detectada); (2) resposta obsoleta divergindo de `entry.currentModelId` → "corrective" falso sobrescrevendo um valor mais novo.
- **Ordenação de eventos do consumidor no caminho de falha documentada.** No caminho de falha, os consumidores podem ver `model_switch_failed` → `model_switched(A)` (o modelo com tempo esgotado foi realmente aplicado). A §2.2 observa essa ordenação e recomenda que os consumidores tratem o `model_switched` como sempre autoritativo, independentemente dos eventos de falha precedentes.
- **Plano de testes da §8 estendido:** (1) regra de não-recursão: assertiva de que `getSessionContextStatus` é chamado exatamente uma vez por reconciliação, sem um segundo `.finally` agendado após a correção; (2) caso `converged` no caminho de falha (o agente NÃO aplicou o modelo com tempo esgotado → `action=converged`); (3) assertiva de correção de generation-skip nos valores `gen_before`/`gen_after`.
- **Resultados da reconciliação da §2.2: terminologia alinhada** — o bullet _converged_ usa `entry.currentModelId` (o modelo atual do bus), consistente com a linguagem do contrato da v11.

### v11 (2026-05-27) — oitava rodada de revisão (endurecimento do contrato de reconciliação)

- **Linha de base da reconciliação no caminho de falha esclarecida (Crítico).** No caminho de falha (`model_switch_failed`), nenhum `model_switched` foi publicado — o bus e o `entry.currentModelId` retêm o valor pré-roundtrip. A reconciliação compara a leitura autoritativa com `entry.currentModelId` (não "o modelo publicado" de forma genérica). Adicionada linguagem explícita + uma expansão de subcenário _failure-path trigger_ na §8.
- **Helper `publishModelSwitched` — mecanismo de aplicação para o invariante de geração (Crítico).** Um único helper `publishModelSwitched(entry, modelId)` atomicamente (em um turno síncrono): (1) atualiza `entry.currentModelId`, (2) incrementa `entry.modelPublishGeneration`, (3) publica `model_switched` no bus. **Todos os quatro sites de publicação** (bridge roundtrip, `applyModelServiceId`, promoção do demux, correção de reconciliação) roteiam através dele. Nenhum outro caminho de código pode publicar `model_switched` diretamente. Invariante de teste: após cada caminho de código, assertiva de que a geração avançou exatamente em 1.
- **Invariante de leitura fresca documentado (Crítico).** A leitura `getSessionContextStatus` usada pela reconciliação DEVE retornar um valor fresco de ponto no tempo — DEVE contornar qualquer cache de resposta, deduplicação de requisição ou coalescência em andamento. Adicionado ao contrato da §2.2. (Na prática: `extMethod` é uma chamada JSON-RPC fresca a cada invocação — não existe cache de middleware hoje — mas o contrato agora é explícito.)
- **A correção NÃO DEVE reacionar a reconciliação (Crítico).** A correção de reconciliação é um `publishModelSwitched` local e **não** agenda uma reconciliação subsequente. A implementação deve garantir que o caminho de correção não flua através do hook `.finally` de roundtrip-settle. Adicionado à observabilidade da §2.2 + regra de não-recursão explícita.
- **Bullet de teste da §8 para assertiva de geração estendido:** cada site de publicação de `model_switched` (incluindo a correção de reconciliação) atualiza `entry.currentModelId` E incrementa `entry.modelPublishGeneration`; assertiva de que a geração avançou exatamente em 1 após cada um.

### v10 (2026-05-27) — sétima rodada de revisão (TOCTOU de reconciliação + retry + testes)

- **TOCTOU de reconciliação (Crítico) → guarda de geração de publicação.** Mesmo a leitura autoritativa da v9 tem uma janela: após o settle, um `/model C` concorrente in-session pode promover `model_switched(C)` enquanto a leitura assíncrona está em andamento; a leitura (emitida anteriormente) retorna o valor pré-C B; a reconciliação então emite `model_switched(B)`, sobrescrevendo C. **Correção:** adicionar um `modelPublishGeneration` por sessão, incrementado em cada publicação de `model_switched` (bridge / promoção do demux / correção de reconciliação). A reconciliação captura a geração **antes** da leitura assíncrona e **pula a correção se a geração avançou** durante a leitura (uma publicação autoritativa mais nova já foi aplicada). A reconciliação também é disparada em **ambos** os caminhos de sucesso e falha (`.finally` no roundtrip), já que o caso de timeout/falha é exatamente quando ela é mais necessária.
- **Erro de leitura não é terminal silenciosamente → retry limitado + evento.** Uma falha transitória de `getSessionContextStatus` deixaria o bus permanentemente divergente. Adicionar 1–2 retries limitados (backoff curto); se todos falharem, emitir um evento de bus `reconciliation_failed` para que os clientes possam alertar / puxar, e registrar no log `action=read-error`.
- **Enumeração de sites de publicação da §2.3 agora inclui a correção de reconciliação** (ela deve atualizar `entry.currentModelId` + incrementar a geração, caso contrário o cache diverge do bus após uma correção).
- **Teste de staleness da §8 corrigido** — ele contradizia a v9 (esperava um drop baseado em valor de A quando cache=B, mas o dedup da v9 derruba apenas o dup de _valor igual_). Substituído por: (1) drop de dup redundante (`current_model_update(A)` quando o cache já é A), (2) corrida de timeout tratada pela reconciliação (A≠B promove, reconciliação converge). Além de um teste `reconciliation-skips-on-newer-promotion`.
- **§10 Q3 elevado:** rotear o `/model` in-session através do `modelChangeQueue` (serializar na fonte) é o design de longo prazo livre de corridas; a pilha suppress/dedup/reconcile é a solução intermediária até lá.

### v9 (2026-05-27) — correção do mecanismo de reconciliação/staleness (encontrado no planejamento de hardening do A1)

- **A "reconciliação lê o cache da §2.3" da v8 era insuficiente.** O cache é atualizado apenas nos sites de publicação, mas uma mudança in-session concorrente que o demux descarta (janela de supressão) nunca é publicada — então o cache não pode observá-la. A reconciliação lendo o cache veria o valor recém-publicado da bridge, julgaria "sem divergência" e falharia em corrigir → exatamente o bug de divergência permanente que ela existe para prevenir.
- **Correção (§2.2): a reconciliação faz uma leitura autoritativa pós-settle.** Após o roundtrip do modelo da bridge ser resolvido (settle), a bridge lê o modelo atual **verdadeiro** do agente via `getSessionContextStatus` (`bridge.ts:2784`, `extMethod` assíncrono) e emite um `model_switched` corretivo se diferir do que foi publicado. Este é o backstop de agente-como-fonte-da-verdade. É assíncrono, mas roda **pós-settle (não no demux)**, então o contrato de bloco síncrono da §5 não se aplica — essa restrição é apenas para os caminhos de leitura de snapshot/staleness.
- **Verificação de staleness (item 4 da §2) reformulada como best-effort + reconciliação como o backstop autoritativo.** A comparação de valores sozinha não consegue distinguir uma notificação tardia obsoleta de uma nova troca para o mesmo id (um problema de ordenação distribuída). Então o demux descarta apenas o caso inequívoco (um `current_model_update` cujo `currentModelId` já é igual a `entry.currentModelId` — um dup redundante); a corrida de timeout (uma mudança anterior com tempo esgotado sempre corresponde a um roundtrip de bridge resolvido) é capturada autoritativamente pela reconciliação da §2.2. Nenhum contador de sequência do lado do agente é necessário.
- **Papel do cache da §2.3 reduzido:** fonte síncrona para o snapshot do A5 e dedup best-effort do demux — NÃO a fonte da verdade para reconciliação (essa é a leitura autoritativa). O cache permanece correto para o A5 porque, após a reconciliação, o último valor publicado É a verdade do agente.

### v8 (2026-05-26) — sexta rodada de revisão (1×Crítico no A5 + sugestões)

- **Cache de estado da bridge (§2.3, novo) — o mecanismo unificador.** A verificação de staleness (item 4 da §2), a reconciliação da §2.2 E o contrato de snapshot síncrono do A5 precisavam do "modelo/modo atual do agente", mas a bridge não tinha um acessor síncrono (apenas uma leitura de status `extMethod` assíncrona, que reabre a corrida). Adicionar `currentModelId` / `currentApprovalMode` / `availableCommands` ao `SessionEntry`, atualizados **sincronamente em cada site de publicação** (`model_switched` em `bridge.ts:2883`/`:1172`, `approval_mode_changed` em `:2979`, as promoções do demux) e semeados a partir da resposta ACP de `createSession`/`loadSession`. Todos os três mecanismos agora leem esses campos síncronos — satisfazendo o contrato de bloco único síncrono da §5 por construção.
- **Isso também remove o problema do esquema ACP `previousModeId` do A2:** o `CurrentModeUpdate` do ACP tem apenas `currentModeId` (sem campo `previousModeId` — mesma restrição de união externa que a v7 encontrou para o A1). A bridge não precisa mais que o agente envie `previous`: ela deriva isso do `entry.currentApprovalMode` em cache (o valor _antes_ desta mudança). O mesmo para o A1. Então nenhuma notificação carrega um campo `previous*`.
- **Item 2 da §1.1 teve a staleness removida** — dividido em 2a (A1 `extNotification`) / 2b (A2 `sessionUpdate`); a v7 havia corrigido §2/§2.1/§6/§7, mas perdeu a §1.1.
- **§2.1: `scope` dobrado no payload promovido de `approval_mode_changed`** (`{sessionId, previous, next, persisted, scope}`); esclarecida sua relação com `persisted`.
- **Observabilidade da reconciliação da §2.2** — `[reconcile] session=… published=… actual=… action=corrected|converged|read-error` + tratamento explícito de `read-error`.
- **Nome do método `extNotification` fixado** em `qwen/notify/session/model-update` (corresponde ao #4546) + nota de que a guarda de early-return deve se tornar um dispatch.
- **Aplicação da remoção de dual-emit** — `TODO(dual-emit-removal)` no site + uma issue de rastreamento na §7.
- Corrigida a §0 ("dois pontos de inserção do demux"), a cross-ref §3.4→§3-ponto-4, e expandida a §8 com cenários de staleness-drop / reconciliation-corrective / cross-axis-non-suppression / dual-emit / extNotification-transport.

### v7 (2026-05-26) — correção de viabilidade no início da implementação (transporte do A1)

- **O A1 não pode usar um `sessionUpdate` `current_model_update` — esse tipo não existe no ACP.** Verificado no início da implementação: `SessionUpdate` é o tipo externo `@agentclientprotocol/sdk`; `acp.d.ts` define `current_mode_update` (2 correspondências), mas **`current_model_update` (0 correspondências)**. Você não pode adicionar uma variante à união especificada externamente. O "adicionar um `sessionUpdate` `current_model_update`" das v1–v6 (e a "Alternativa" da §2 que rejeitou o `extNotification` por simetria) estava errado.
- **Transporte do A1 corrigido: o agente emite a mudança de modelo in-session via `BridgeClient.extNotification()`** (`bridgeClient.ts:491`, o canal lateral agente→bridge existente usado hoje para guardrails do MCP) — NÃO um `sessionUpdate`. O demux do A1, portanto, fica em **`extNotification()`**, enquanto o `current_mode_update` do A2 (um `sessionUpdate` real do ACP) é demuxado em **`sessionUpdate()`**. A1 e A2 usam transportes + pontos de inserção diferentes — uma nova assimetria, agora documentada.
- Efeito líquido no restante do design: as regras de demux (mapeamento de payload, supressão por tipo, verificação de staleness, drop-when-suppressed, observabilidade) permanecem inalteradas em essência; apenas o ponto de inserção do A1 muda de `sessionUpdate()` para `extNotification()`, e o A1 não precisa de nenhuma mudança na especificação do ACP.
- **É por isso que o design-first importa:** o bloqueio surgiu na primeira linha da implementação do A1; alterar o transporte no documento é barato, um cast na união externa `SessionUpdate` teria sido uma mentira de tipo latente.
### v6 (2026-05-26) — quinta rodada de revisão (wenshao 2×Crítico + 4×Sugestões)

- **Timeout-race + mudança intermediária (Crítico):** "o evento posterior é autoritativo" estava errado quando uma mudança B intervém — um `current_model_update(A)` tardio e obsoleto seria promovido após `model_switched(B)`. Substituído por uma **verificação de obsolescência (staleness check)**: o demux promove um `current_model_update` apenas se o seu `currentModelId` for igual ao modelo atual real do agente no momento da promoção; notificações obsoletas são descartadas. §2 item 4 / §2.1.
- **`previousModeId` tornado OBRIGATÓRIO (Crítico):** o normalizador do SDK `normalizeApprovalModeChanged` (`normalizer.ts:754`) requer `previous` ou descarta o evento via `fallbackDebug`. Um `previousModeId` opcional consumiria silenciosamente as mudanças de modo de aprovação durante a sessão. §3.
- **Supressão agora é por tipo de mudança, não por sessão:** um roundtrip de modelo não deve suprimir um `current_mode_update` durante a sessão (e vice-versa). §2.1.
- **Payload do `current_model_update`:** removido o `authType?` indefinido (dados mortos — `model_switched` é `{sessionId,modelId}`); `previousModelId` permanece opcional (o normalizador de `model_switched` precisa apenas de `modelId`). §2.
- Corrigidos dois erros de texto/referência cruzada que escreviam `current_mode_update` (A2) onde se pretendia `current_model_update` (A1). §2 wire/compat, §6.

### v5 (2026-05-26) — quarta rodada de revisão (wenshao 2×Crítico + 8×Sugestões)

- **Deriva de `/model` concorrente durante a sessão (Crítico) → regra de reconciliação.** O "descartar-quando-suprimido" pode descartar um `/model B` durante a sessão que é disparado durante um roundtrip de `setSessionModel(A)` da bridge (o `/model` durante a sessão ignora o `modelChangeQueue`), deixando o bus em A enquanto a sessão executa B. Adicionado §2.2: ao estabilizar o roundtrip, a bridge **reconcilia** — relê o modelo atual do agente e emite um `model_switched` corretivo se divergir do que foi publicado.
- **Lockstep do IDE-companion (Crítico) → transição de emissão dupla em uma release.** A promoção não pode ocorrer atomicamente (canais de distribuição daemon vs Marketplace), e o dispatch upstream (`daemonIdeConnection.ts`, `DaemonChannelBridge.ts`) descarta tipos de eventos desconhecidos antes que cheguem ao handler. Adicionada uma **janela de transição de emissão dupla** (publicar AMBOS o `session_update` genérico e o evento nomeado promovido por uma release) e enumerados os sites de dispatch upstream como afetados (§2.1, §6).
- **Mapeamento do payload de `model_switched` especificado** — `currentModelId → modelId`, envelope `sessionId → data.sessionId`; sem isso, o validador do SDK (`events.ts:1910`, que requer `modelId` não vazio) descarta todos os eventos promovidos (A1 não funcional). §2.1.
- **Observabilidade do demux obrigatória** — log estruturado em cada ponto de decisão (promovido / descartado / suprimido / genérico). §2.1.
- **Correção do `replay_complete`** — ele **existe** sim (`eventBus.ts:444`, entregue pelo #4484 merged); o "zero correspondências" do revisor foi em uma árvore obsoleta. A fase 2 do A5 depende do novo frame `session_snapshot`, não da introdução do `replay_complete`. §5/§7.
- **O first-attach não sintetiza mais `replay_complete{0}`** (isso ampliaria o contrato desse evento para consumidores "replaying→live" existentes) — o snapshot é autodelimitado no first-attach. §5.
- **Captura na emissão reforçada** — leituras de campos do snapshot + publicação DEVEM ser um bloco síncrono único (sem `await` entre eles), caso contrário a janela de sobrescrita obsoleta é reaberta. §5.
- **Modelo de migração de helper + Q3 resolvido** (mantido o bypass do extMethod — §1.1 se mantém); teste de distinção A4 adicionado (feito no #4539). §3, §8, §9.

### v4 (2026-05-26) — terceira rodada de revisão (wenshao 2×Crítico + 9×Sugestões, Copilot 5×)

- **Ponto de inserção do demux corrigido** — o encaminhamento genérico `sessionUpdate → session_update` está em `packages/acp-bridge/src/bridgeClient.ts:397` (`BridgeClient.sessionUpdate()`), **não** em `bridge.ts:352` (esse é o prompt-echo). O hook de demux do §2.1 fica em `bridgeClient.ts`. Adicionada uma **terceira regra de demux**: uma promoção bloqueada por um roundtrip em andamento é **descartada**, não publicada como `session_update` genérico (caso contrário, o evento autoritativo da bridge + o wrapper genérico gerariam sinal duplo).
- **`approvalModeQueue` ainda não existe** — será entregue no PR #4510. A janela de supressão do A2 depende de um rastreador em andamento por sessão, então o A2 agora é marcado como um **pré-requisito rígido do #4510** (§3, §7), não um "coordenar" flexível.
- **O caminho HTTP do A2 não emite notificação do agente** (ele ignora `Session.setMode` via extMethod) → a bridge é a **única** emissora ali; "suprimir-durante-roundtrip" aplica-se apenas ao caminho do **modelo**. §1.1 / §9 corrigidos.
- **O demux do Passo 2 cobre apenas `current_model_update`.** A promoção de `current_mode_update` é adiada para o passo 3 (precisa de `previousModeId`); até lá, continua fluindo como `session_update` genérico (sem regressão).
- **Sobrescrita obsoleta do snapshot A5 corrigida** — captura o snapshot **no momento da emissão (após `replay_complete`)**, não no momento da assinatura, para que um delta ao vivo entregue durante o replay não seja sobrescrito por um snapshot obsoleto. Ordenação do first-attach definida.
- **Não é "aditivo em todos os lugares"** — promover `current_mode_update` é uma mudança em lockstep; `packages/vscode-ide-companion/.../qwenSessionUpdateHandler.ts:177` é um consumidor afetado nomeado.
- **Ponto de captura de `previousModeId` especificado**; generalização de helper detalhada; descrição do persist-scope corrigida (`getPersistScopeForModelSelection` → workspace ou user); enumeração de segurança concluída (`resolveTrustedClientId`); plano de teste + âncoras corrigidos.

### v3 (2026-05-26) — segunda rodada

Reestruturado para o modelo de bridge autoritativa (§1.1, não emissor único); três sites de publicação do A1 + exceção de `model_switch_failed` + timeout-race; decisão explícita de workspace-mirror do A1; `previousModeId`; A4 expõe ambos os campos do SDK; snapshot A5 após `replay_complete`; testes expandidos.

### v2 (2026-05-26) — primeira rodada

Assimetria A1/A2; contrato de demux do §2.1; tabela do §9; `pendingPermissionIds` do A5 removido; higiene de âncoras; `voterClientId` opcional.

---

## 0. Escopo e não-objetivos

Quatro lacunas de coordenação de estado por canal lateral, onde uma mudança de estado de sessão em um caminho é invisível para outros clientes conectados (ou sessões pares):

| #      | Resumo                                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | A troca de modelo durante a sessão (`/model`, plan-mode) nunca chega ao bus.                                                                                |
| **A2** | A mudança de modo de aprovação durante a sessão (`setMode`) não emite evento; o caminho HTTP usa um ponto de entrada de agente diferente; visibilidade de workspace-vs-persist pouco clara. |
| **A4** | `permission_resolved.originatorClientId` carrega o _votante_, enquanto `permission_request.originatorClientId` carrega o _originador do prompt_ — ambíguo.  |
| **A5** | Um cliente conectando via `Last-Event-ID` obtém ring replay + live tail, mas nenhum snapshot do modelo atual / modo de aprovação / comandos; precisa emitir pulls extras. |

Não-objetivos: eco de conteúdo de usuário multimodal (PR #4353 §D), a correção de race do A3 (PR #4510), anti-falsificação de clientId (A6), o transporte streamable-HTTP (#4472).

**Convenção de âncoras:** caminhos completos a partir da raiz do repositório.

- **`packages/acp-bridge/src/bridgeClient.ts`** — o cliente ACP→bus; `sessionUpdate()` e `extNotification()` encaminham notificações do agente para o EventBus (os **dois** pontos de inserção do demux — A2 em `sessionUpdate()`, A1 em `extNotification()`; veja §2.1).
- **`packages/acp-bridge/src/bridge.ts`** — o orquestrador de 3923 LOC (métodos de controle HTTP, sites de publicação). `packages/cli/src/serve/httpAcpBridge.ts` é um shim de re-exportação de 101 LOC — não é um alvo de âncora.
- **`packages/acp-bridge/src/permissionMediator.ts`** — votação/resolução de permissões.
- **`packages/cli/src/acp-integration/acpAgent.ts`** / **`.../session/Session.ts`** — agente + sessão.

---

## 1. Contexto — o invariante de coordenação do canal lateral

O daemon transmite deltas de _transcript_ e mudanças de _controle_ iniciadas por rota HTTP (`model_switched`, `approval_mode_changed`). A lacuna: **a mesma mudança lógica tem dois caminhos de entrada e apenas o HTTP transmite** para mudanças de slash/plan-mode.

`current_mode_update` existe hoje (`Session.ts:1645`; helper `sendCurrentModeUpdateNotification` em `Session.ts:1625`), mas está conectado apenas a caminhos de confirmação de ferramenta — `exit_plan_mode` (`Session.ts:2160`) e edit-tool `ProceedAlways` (`Session.ts:2168`) — não ao `Session.setMode`/`setModel` genérico. Não existe o tipo `current_model_update`. Ambos fluem para o bus hoje via `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`) como um **`session_update` genérico** sem demux de subtipo.

### 1.1 Modelo de coordenação (a decisão estrutural)

O "agente é o emissor único; a bridge descarta sua publicação" da v1 foi **rejeitado** — a bridge é dona da serialização (`modelChangeQueue`), tratamento de timeout, `model_switch_failed` e a distinção persist/workspace. Modelo adotado:

1. **A bridge permanece como a emissora autoritativa para as mudanças que ela conduz** (HTTP `setSessionModel`/`setSessionApprovalMode`, `applyModelServiceId` no momento do attach) — lógica de serialização/timeout/falha/persist inalterada.
2. **Mudanças durante a sessão que ignoram a bridge** ganham uma nova notificação de agente que a bridge faz o demux (§2.1), via **transportes diferentes** (v7):
   - **2a. A1 (modelo):** `Session.setModel` emite `current_model_update` pelo canal lateral **`extNotification`** agente→bridge (NÃO é um `sessionUpdate` — aquela união ACP não tem variante de modelo). `BridgeClient.extNotification()` faz o demux → `model_switched`.
   - **2b. A2 (modo de aprovação):** `Session.setMode` emite `current_mode_update` como um **`sessionUpdate`** ACP real. `BridgeClient.sessionUpdate()` faz o demux → `approval_mode_changed`.
3. **Suprimir-durante-roundtrip — apenas no caminho do modelo.** O caminho HTTP do **modelo** flui através de `Session.setModel` (`acpAgent.ts:935`), então a notificação do agente SERÁ disparada lá, além da publicação da bridge; o demux suprime a promoção enquanto um roundtrip de modelo da bridge estiver em andamento. O caminho HTTP do **modo de aprovação** **não** flui através de `Session.setMode` (ele usa o extMethod, `acpAgent.ts:2228`), então nenhuma notificação de agente é disparada lá — a bridge é a única emissora e não há nada a suprimir. A supressão só faz sentido para o caminho do modelo.

---

## 2. A1 — troca de modelo durante a sessão no bus

### Problema

`Session.setModel` (`Session.ts:1580`) → `config.switchModel()` (`:1601`), sem `sessionUpdate`. `model_switched` é publicado a partir de três sites no lado da bridge: `bridge.ts:2883` (`setSessionModel`), `bridge.ts:1172` (`applyModelServiceId`), e nenhum para durante a sessão — a lacuna.

### Design proposto

1. **Transporte: `extNotification`, não um sessionUpdate (v7).** `current_model_update` **não** é uma variante de ACP `SessionUpdate`. Portanto, `Session.setModel`, após `switchModel` ser resolvido (**apenas em caso de sucesso**), emite através do canal lateral **`extNotification`** agente→bridge com o **nome de método totalmente qualificado `qwen/notify/session/model-update`** (seguindo a convenção existente `qwen/notify/session/*`; impl no #4546) e payload `{ v:1, sessionId, currentModelId }`. Sem `previousModelId` / `authType` (a bridge deriva `previous` do seu cache de estado §2.3; `model_switched` é `{sessionId,modelId}`). **Nota de implementação:** a guarda de retorno antecipado atual de `BridgeClient.extNotification()` (`if (method !== 'qwen/notify/session/mcp-budget-event') return;`) deve se tornar um dispatch de método para que o handler de model-update seja alcançável (feito no #4546).
2. **`BridgeClient.extNotification()` (`bridgeClient.ts:491`) faz o demux** da notificação `current_model_update` → `model_switched` (§2.1), **apenas quando nenhum roundtrip de modelo da bridge estiver em andamento** para aquela sessão. (O `current_mode_update` do A2 continua sendo um sessionUpdate real, com demux em `sessionUpdate()` — veja §2.1.)
3. **`model_switch_failed` permanece apenas na bridge** — `Session.setModel` lança exceção sem notificação; a bridge continua publicando-o em ambos os caminhos de falha.
4. **Timeout-race (descarte de demux no melhor esforço + retaguarda de reconciliação autoritativa — v9).** O `withTimeout` da bridge (`bridge.ts:2844-2849`) pode rejeitar (publicando `model_switch_failed(A)`) enquanto a chamada ACP de A continua rodando (FIXME `bridge.ts:2836-2840`). Se uma mudança B então for bem-sucedida (`model_switched(B)`) e a chamada de A finalmente completar, o `current_model_update(A)` tardio de A não deve fazer de A o estado final aparente. **Apenas a comparação de valores não pode decidir** isso (um `A` obsoleto tardio e uma troca recente para `A` parecem idênticos — um problema de ordenação distribuída). Então: o demux faz uma **deduplicação no melhor esforço** (descarta um `current_model_update` cujo `currentModelId` já é igual a `entry.currentModelId` — uma operação nula redundante), e a **correção autoritativa vem da reconciliação do §2.2**: uma mudança anterior com timeout sempre corresponde a um _roundtrip de bridge estabilizado_, o que dispara uma leitura autoritativa pós-estabilização que republica o modelo verdadeiro do agente. Nenhum contador de sequência do lado do agente é necessário.
**Brecha residual — roundtrip zumbi (v13).** A reconciliação cobre a _primeira_ resolução (o timeout), mas uma chamada ACP zumbi que é concluída **após** a reconciliação já ter disparado `action=converged` NÃO é coberta: o agente aplica o modelo com timeout tardiamente → emite `current_model_update(A)` → o demux promove (nenhum roundtrip em andamento, não é um duplicado) → o bus reverte silenciosamente para A, contradizendo a troca bem-sucedida do usuário para B. A correção de longo prazo é um sinal de cancelamento ACP (o FIXME existente em `bridge.ts:2836-2840`). Até lá, esta é uma **race condition residual conhecida** sob a condição restrita: o timeout dispara, a reconciliação converge (o agente ainda não aplicou), o usuário troca com sucesso para B, e ENTÃO o zumbi é concluído. A probabilidade é baixa (exige que o agente demore mais que o timeout + leitura de reconciliação + uma troca bem-sucedida subsequente), mas não é zero. Documente isso aqui em vez de afirmar que a reconciliação elimina totalmente a race condition de timeout.

### 2.1 Contrato do Demux (dois pontos de inserção)

O demux possui **dois pontos de inserção** porque A1 e A2 usam transportes diferentes (v7):

- **A1 — `BridgeClient.extNotification()` (`bridgeClient.ts:491`):** a notificação `current_model_update` → `model_switched`.
- **A2 — `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`):** o sessionUpdate `current_mode_update` → `approval_mode_changed`. Este método hoje publica cada notificação literalmente como `{ type: 'session_update', data: params }`; o demux é adicionado aqui.

As regras abaixo se aplicam em qualquer ponto de inserção onde o subtipo chegar:

- **Tabela de promoção:** `current_model_update → model_switched`; `current_mode_update → approval_mode_changed` (com escopo de sessão; adiado para a etapa 3, veja §7).
- **Mapeamento de payload (ambos os subtipos devem ser especificados, caso contrário a validação do SDK os descarta):**
  - `current_model_update → model_switched`: mapeie `currentModelId → data.modelId` e eleve o envelope/`params.sessionId` para `data.sessionId`. O validador do SDK exige um `data.modelId` não vazio (`events.ts:1910`); uma promoção literal (que mantém `currentModelId`) falharia na validação e seria descartada silenciosamente — **A1 não funcional**. Portanto, a promoção é um mapeamento de campos, não apenas uma renomeação.
  - `current_mode_update → approval_mode_changed`: construa o payload completo `{ sessionId, previous, next, persisted: false, scope: 'session' }`. `next` = o `currentModeId` da notificação; **`previous` é obtido do cache de estado da bridge** `entry.currentApprovalMode` (o valor antes desta alteração — §2.3), então o agente **não** envia `previousModeId` (o ACP `CurrentModeUpdate` não possui esse campo de qualquer forma). Uma alteração in-session nunca é persistida no workspace, daí `persisted:false`, `scope:'session'`. `scope` é **aditivo** em `DaemonApprovalModeChangedData` e ortogonal a `persisted`: `scope` indica qual bus (esta sessão vs. sessões pares) o evento tem como alvo; `persisted` indica se ele também gravou configurações do workspace. O próprio caminho HTTP `persist:true` da bridge emite o espelho `scope:'workspace', persisted:true` (`bridge.ts:3007`).
- **Supressão durante roundtrip (por tipo de alteração, não por sessão):** promova um `current_model_update` apenas quando nenhum roundtrip de **modelo** conduzido pela bridge estiver em andamento para aquela sessão; promova um `current_mode_update` apenas quando nenhum roundtrip de **modo de aprovação** conduzido pela bridge estiver em andamento. Um roundtrip de modelo NÃO deve suprimir um `current_mode_update` in-session (e vice-versa) — a supressão entre atributos descartaria silenciosamente a alteração do outro eixo.
- **Deduplicação de melhor esforço (modelo):** o demux descarta um `current_model_update` cujo `currentModelId` já seja igual a `entry.currentModelId` (§2.3) — uma operação nula redundante. Ele **não** tenta distinguir valores obsoletos de recentes (impossível apenas pelo valor); o backstop autorizado para a race condition de timeout/concorrente é a reconciliação do §2.2 (item 4 do §2).
- **Descarte quando suprimido (terceira regra):** quando um subtipo _promovível_ NÃO é promovido (suprimido ou obsoleto), **descarte-o completamente** — **não** recorra à publicação do `session_update` genérico. A bridge já está publicando o evento nomeado autorizado; emitir o wrapper genérico também geraria um sinal duplo. (O drift residual concorrente in-session é tratado pela reconciliação do §2.2.)
- **Supressão de wrapper genérico:** um subtipo promovido publica apenas o evento nomeado — **exceto durante a janela de transição de emissão dupla (abaixo)**.
- **Transição de emissão dupla (lockstep do IDE-companion, veja §6):** como o daemon e o IDE companion do VS Code são lançados em canais diferentes e não podem alternar atomicamente, o PRIMEIRO lançamento da promoção de `current_mode_update` publica **ambos** o `approval_mode_changed` promovido E o `session_update{sessionUpdate:'current_mode_update'}` genérico legado por um ciclo de lançamento. O `case 'current_mode_update'` existente do IDE companion continua funcionando; assim que seu handler `approval_mode_changed` for lançado, a próxima versão remove a emissão dupla. `current_model_update` é totalmente novo (sem consumidor legado), então é promovido diretamente sem emissão dupla. **A remoção é forçada, não deixada para a memória:** um comentário `TODO(dual-emit-removal)` no site de publicação de emissão dupla referencia esta seção, e a etapa 3 do §7 carrega uma issue de rastreamento com uma versão alvo — para que o wrapper genérico redundante não se torne permanentemente silencioso (e nenhum novo consumidor deve ser construído sobre ele).
- **Observabilidade (obrigatória, não opcional):** emita um log estruturado em cada decisão do demux — `[demux] session=<id> type=<sub> action=promoted|dropped|suppressed|generic reason=<why>`. `BridgeClient.sessionUpdate()` não tem nenhum log hoje; o caso `dropped` especialmente deve ser visível para que o oncall possa distinguir "o agente não emitiu" / "o demux descartou" / "SSE perdido".
- **Subtipos desconhecidos:** inalterados (`session_update` genérico).

### 2.2 Reconciliação pós-roundtrip (drift concorrente in-session)

Suprimir + descartar assume que o roundtrip da bridge e o agente descrevem a **mesma** alteração. Isso falha sob uma alteração in-session concorrente, porque `/model` in-session chama `Session.setModel` **diretamente e NÃO entra em `modelChangeQueue`**:

1. Bridge `setSessionModel(A)` inicia → janela de supressão abre.
2. Usuário digita `/model B` no terminal → `Session.setModel(B)` (ignora a fila) → agente emite `current_model_update(B)`.
3. Demux **descarta** B (janela de supressão aberta).
4. Bridge publica o `model_switched(A)` autorizado; **o bus mostra A, a sessão executa B — nada reconcilia.**

**Contrato (v9/v10/v11 — leitura autorizada, protegida por geração, não recursiva):** a reconciliação é disparada quando um roundtrip de modelo da bridge é resolvido — em **ambos** os caminhos de sucesso e falha (um `.finally` no roundtrip, já que o caso de timeout/falha é exatamente quando o bus tem maior probabilidade de estar divergente). Ele lê o modelo atual **verdadeiro** do agente via `getSessionContextStatus` (`bridge.ts:2784`, `extMethod` assíncrono) e, se divergir do modelo atual do bus (`entry.currentModelId` — no caminho de falha, este é o valor **pré-roundtrip**, já que `model_switch_failed` não atualiza o cache), emite um `model_switched` corretivo via `publishModelSwitched`. **Por que não o cache do §2.3 _como verdade_:** o cache é atualizado apenas nos sites de publicação, então não pode observar uma alteração in-session concorrente que o demux **descartou** — lê-lo concluiria falsamente "sem divergência". O agente é a única fonte de verdade. A leitura é assíncrona, mas executada **pós-resolução, fora do demux**, então a restrição de bloco síncrono do §5 não se aplica. (A longo prazo: rotear `/model` in-session através de `modelChangeQueue` — §10 Q3 — para tornar isso livre de race conditions na origem.) A mesma reconciliação se aplica a A2 assim que `approvalModeQueue` existir.

**Invariante de leitura fresca (v11/v12):** a leitura `getSessionContextStatus` usada pela reconciliação DEVE retornar um valor fresco de ponto no tempo do processo do agente — DEVE ignorar qualquer cache de resposta, deduplicação de requisição ou coalescência em andamento. Sem isso, uma resposta em cache que por acaso corresponda a `entry.currentModelId` produz um "convergido" falso (divergência real perdida — o agente pode ter avançado), e uma resposta em cache que diverge de `entry.currentModelId` produz um "corretivo" falso que define o bus para um valor obsoleto em vez do modelo atual verdadeiro do agente. Na prática: `extMethod` é uma chamada JSON-RPC `requestSessionStatus` fresca em cada invocação — não existe middleware ou cache no nível de transporte hoje. A invariante é contratual: qualquer camada de cache futura DEVE isentar as leituras de reconciliação.

**Proteção de geração (v10 — fecha o TOCTOU da janela de leitura):** entre a resolução e o retorno da leitura assíncrona, um `/model C` in-session concorrente pode promover `model_switched(C)`; a leitura em andamento (emitida antes de C) retorna o valor pré-C e a reconciliação sobrescreveria C. Correção: um `modelPublishGeneration` por sessão é incrementado em **cada** publicação de `model_switched` (bridge / promoção do demux / corretivo de reconciliação) — exclusivamente via o helper `publishModelSwitched` (v11). A reconciliação captura a geração **antes** da leitura e **ignora o corretivo se ela avançou** durante a leitura — uma publicação autorizada mais recente já chegou, então o bus está atual.

**Helper `publishModelSwitched` (v11/v12 — mecanismo de imposição):** uma única função `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })` que atomicamente (um turno síncrono): (1) define `entry.currentModelId = modelId`, (2) incrementa `entry.modelPublishGeneration`, (3) publica `model_switched` no bus (com `originatorClientId` se fornecido). **Todos** os sites de publicação de `model_switched` — sucesso de roundtrip da bridge, `applyModelServiceId`, promoção do demux, corretivo de reconciliação — DEVEM rotear através deste helper. O roundtrip da bridge e `applyModelServiceId` passam o `originatorClientId` resolvido; a promoção do demux e o corretivo de reconciliação não passam nenhum (nenhum cliente único conduziu a alteração). `events.publish({type:'model_switched', ...})` direto é proibido fora do helper. Isso torna impossível perder um incremento de geração ou descartar silenciosamente a atribuição do cliente, e uma invariante de teste pode afirmar: após qualquer caminho de código que produza um `model_switched`, a geração avançou exatamente em 1.

**Regra de não recursão (v11/v12 — imposta estruturalmente):** o corretivo de reconciliação chama `publishModelSwitched` (uma publicação de bus local) e **NÃO** agenda uma reconciliação subsequente. Se um implementador refatorar `publishModelSwitched` através de um wrapper que também anexa reconciliação `.finally`, o resultado é um loop corretivo infinito (reconciliar → ler → publicar → reconciliar → …). Cada corretivo incrementa a geração, mas cada nova reconciliação lê o agente e pode encontrar divergência (o corretivo atualiza o _bus_, não o _agente_). **Proteção estrutural (v12):** uma flag `reconciliationInFlight: boolean` por sessão é definida como `true` antes da leitura assíncrona e limpa depois (no `.finally`). O `.finally` de resolução de roundtrip verifica esta flag antes de agendar a reconciliação; se for `true`, ele registra `[reconcile] session=<id> action=skipped-reentrant` e retorna. Isso torna a não recursão invariante sob refatoração — não pode ser derrotada pela reorganização do grafo de chamadas. O próprio helper `publishModelSwitched` não tem efeitos colaterais além dos itens (1)–(3).

**Erro de leitura: tentativa limitada e então expor.** Uma falha transitória de `getSessionContextStatus` não deve deixar o bus permanentemente divergente com apenas uma linha de log. Tente novamente 1–2x com backoff curto; se todas falharem, emita um evento de bus `reconciliation_failed` e registre `action=read-error`.

- **Payload (v13):** `reconciliation_failed { sessionId: string, error: string, retryCount: number, trigger: 'roundtrip-settled' | 'failed' }`. O `error` distingue "processo do agente travou" de "timeout JSON-RPC" para a UX do consumidor e diagnósticos de oncall.
- **Contrato do consumidor:** consultivo — os clientes PODEM exibir um aviso transitório e PODEM acionar seu próprio pull de `getSessionContextStatus` para auto-recuperação. Nenhum handler obrigatório; na ausência de consumidores, o estado do bus permanece como o último publicado (obsoleto, mas não terminal).
- **Log por tentativa:** cada tentativa de retry emite sua própria linha de log: `[reconcile] session=<id> attempt=<n>/<max> error=<msg>`, para que o oncall possa distinguir falhas transitórias de sustentadas sem precisar do evento agregado final.
**Ordenação de eventos do consumidor no caminho de falha (v12).** No caminho de falha (timeout/erro), os consumidores podem observar `model_switch_failed` seguido (após reconciliação assíncrona) por `model_switched(A)` para o próprio modelo que "falhou" — isso acontece quando o agente realmente aplicou o modelo apesar do timeout da bridge. Este é o comportamento correto: a correção da reconciliação é autoritativa. Os consumidores DEVEM tratar `model_switched` como sempre autoritativo, independentemente dos eventos de falha precedentes (descarte quaisquer toasts de erro para o modelo com falha). A §8 inclui um teste que afirma essa ordenação completa de eventos visível para o consumidor.

**Observabilidade:** `[reconcile] session=<id> trigger=roundtrip-settled|failed baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=corrected|converged|skipped-newer-gen|skipped-reentrant|read-error`.

### 2.3 Cache de estado da bridge (fonte síncrona do modelo/modo/comandos "atuais")

A verificação de obsolescência (stale check) (item 4 da §2), a reconciliação da §2.2 e o snapshot do A5 (§5) precisam do modelo / modo de aprovação / comandos **atuais** da sessão. A bridge não possuía um acessor síncrono — apenas `getSessionContextStatus` (`bridge.ts:2784` → `requestSessionStatus`, um roundtrip assíncrono de `extMethod`), e um `await` ali reabre exatamente a janela TOCTOU que esses mecanismos fecham. Portanto:

- Adicionar ao `SessionEntry`: `currentModelId?: string`, `currentApprovalMode?: ApprovalMode`, `availableCommands?: AvailableCommand[]`.
- **Atualizar de forma síncrona em cada site de publicação**, no mesmo turno síncrono da publicação (sem `await` entre a leitura do antigo e a escrita do novo): todas as publicações de `model_switched` passam pelo helper `publishModelSwitched` da §2.2 (que atualiza atomicamente `entry.currentModelId` + incrementa `entry.modelPublishGeneration` + publica no bus); `approval_mode_changed` (`:2979` / `:3007`) atualiza `entry.currentApprovalMode`; `availableCommands` é atualizado em `BridgeClient.sessionUpdate()` quando recebe um `available_commands_update` genérico de sessionUpdate — o handler define `entry.availableCommands = payload.commands` de forma síncrona **antes** da publicação de encaminhamento genérico. O helper garante que nenhum site de publicação possa perder uma atualização de cache ou de geração.
- **Especificações de `availableCommands` (v13):** o tipo é `AvailableCommand[]` (compatível com `status.ts`). Ao contrário de modelo/modo, este campo **não possui um evento de bus promovido nomeado** e **não possui reconciliação** — é um cache passivo, atualizado pelo caminho genérico de `session_update`. Se o implementador perder o hook, o snapshot do A5 servirá comandos obsoletos/indefinidos sem nenhum mecanismo de fallback. O caminho de gatilho é explicitamente `BridgeClient.sessionUpdate()` → verificar `params.type === 'available_commands_update'` → atualizar cache → encaminhar como `session_update` genérico.
- **Semear (Seed)** a partir da resposta ACP de `createSession` / `loadSession` quando a entrada é criada (modelo/modo inicial), antes que qualquer alteração ocorra.
- **Consumidores (leituras síncronas de campos):**
  - **Snapshot do A5 (§5):** lê todos os três campos em um bloco síncrono — o propósito principal do cache.
  - **Deduplicação best-effort do demux (§2.1):** descarta um `current_model_update` cujo `currentModelId` já seja igual a `entry.currentModelId`.
  - **Derivação de `previous` (A1/A2):** o demux preenche `approval_mode_changed.previous` a partir de `entry.currentApprovalMode` _capturado antes_ de aplicar o novo valor — assim **o agente nunca envia `previousModeId` / `previousModelId`** (contornando o fato de o schema `CurrentModeUpdate` do ACP não ter o campo `previousModeId`).
- **NÃO é um consumidor: reconciliação da §2.2.** A reconciliação precisa do modelo _verdadeiro_ do agente, o que o cache não pode fornecer (ele nunca vê notificações suprimidas e descartadas); a reconciliação usa a leitura autoritativa de `getSessionContextStatus` em vez disso (§2.2, v9). O cache reflete apenas o que foi _publicado_.

Isso torna o cache uma fonte síncrona de primeira classe para o snapshot + dedup + `previous`, sem invadir o caminho de verdade da reconciliação.

### Espelho do workspace (decisão explícita)

`Session.setModel` tem como padrão `persistDefault:true` (`Session.ts:1610`) e escreve `model.name` via `getPersistScopeForModelSelection(this.settings)` (`Session.ts:1611`) — **escopo de workspace para um workspace confiável que possui `modelProviders`, caso contrário, escopo de usuário**. De qualquer forma, **a fase 1 do A1 faz apenas broadcast no escopo da sessão**; justificativa: sessões pares pegam o padrão persistido na próxima inicialização, e não há nenhum bloqueio entre sessões relevante para a segurança como no modo de aprovação. Um espelho de workspace para modelo persistido é um acompanhamento explícito e adiado (§10), não omitido silenciosamente.

### Risco

Double-broadcast (mitigado pela §1.1 + as três regras da §2.1); perda de eventos de falha (exceção do item 3). Testes na §8.

---

## 3. A2 — alteração do modo de aprovação na sessão (assimétrico; bloqueado no #4510)

### Problema

1. **Alteração silenciosa na sessão.** `Session.setMode` (`Session.ts:1561`) → `config.setApprovalMode()` (`:1573`), sem notificação.
2. **HTTP contorna `Session.setMode`.** `setSessionApprovalMode` aciona o extMethod `qwen/control/session/approval_mode` (`acpAgent.ts:2200`) → `config.setApprovalMode()` diretamente (`acpAgent.ts:2228`). A emissão na sessão sozinha não cobre o HTTP, e o HTTP não emite nenhuma notificação para o agente.
3. **Payload + persist.** `approval_mode_changed` precisa de `{previous,next,persisted}` (`bridge.ts:2979` com escopo de sessão, `:3007` com escopo de workspace). `current_mode_update` carrega apenas `currentModeId`; o agente não tem o conceito de `persist`.
4. **Sem primitiva de serialização ainda.** `approvalModeQueue` **não existe** no codebase hoje; o caminho HTTP do modo de aprovação (`bridge.ts:2893-3020`) executa extMethod + publicação inline sem fila por sessão (ao contrário da fila `modelChangeQueue` do caminho do modelo). A janela de supressão/corrida é, portanto, ilimitada até que o #4510 a implemente.

### Design proposto

**Escopo de sessão — emissões na sessão; a bridge continua sendo a única emissora para HTTP:**

1. Emitir `current_mode_update` a partir de `Session.setMode` (cobre ACP `setSessionMode`, `acpAgent.ts:922` e `/approval-mode` na sessão).
2. O caminho HTTP do extMethod mantém a publicação de `approval_mode_changed` com escopo de sessão da **bridge** (`bridge.ts:2979`) e **não** emite notificação para o agente (ele contorna `Session.setMode`) — a bridge é a única emissora; nada a ser suprimido.
3. **`previous` vem do cache de estado da bridge — o agente NÃO envia `previousModeId`.** O normalizador do SDK `normalizeApprovalModeChanged` (`normalizer.ts:754`) requer `previous`, então o `approval_mode_changed` promovido deve carregá-lo. Mas o `CurrentModeUpdate` do ACP tem apenas `currentModeId` (sem o campo `previousModeId` — a mesma restrição de união externa que a v7 encontrou para o A1; não se pode adicionar um campo obrigatório ao tipo especificado). Resolução: o **demux preenche `previous` a partir de `entry.currentApprovalMode`** (o valor em cache antes desta alteração, §2.3), e atualiza o cache para `currentModeId` no mesmo turno síncrono. O `current_mode_update` do agente mantém a forma inalterada do ACP (`{currentModeId}`), e a bridge sempre produz um `{previous,next}` completo — sem descarte no SDK, sem alteração no schema do ACP.
4. **Generalização do helper (modelo de migração especificado):** `sendCurrentModeUpdateNotification` (`Session.ts:1625`) hoje deriva `newModeId` de um `ToolConfirmationOutcome` (apenas `auto-edit`/`default`/atual). Generalize-o para aceitar um `currentModeId` explícito, para que `Session.setMode` possa emitir para qualquer `ApprovalMode` (`plan`/`yolo`/`auto`/…). Os dois chamadores existentes de confirmação de ferramenta (`Session.ts:2160`, `:2168`) mantêm seu ponto de entrada `ToolConfirmationOutcome` (que pré-computa `currentModeId` e então delega) — NÃO é uma remoção flag-day; depreciação rastreada separadamente. Nenhum chamador precisa computar `previous` (a bridge o deriva, item 3).

**Escopo de workspace (persist) continua sendo apenas da bridge:**

5. O persist + broadcast de workspace (`bridge.ts:3007`) continua sendo uma publicação no nível da bridge condicionada à flag `persist` da bridge; `persisted:true` aparece apenas no evento de workspace. Adicione um discriminador `scope: 'session' | 'workspace'`.

### Pré-requisito obrigatório (bloqueia o A2)

O A2 está **bloqueado até que o PR #4510 implemente a `approvalModeQueue`** (ou um rastreador equivalente por sessão para roundtrips de modo de aprovação em andamento). Sem ela, a janela de supressão/coordenação é ilimitada. Concretamente (a divergência que isso previne): a bridge inicia `setSessionApprovalMode('default')`; enquanto isso, `/approval-mode yolo` na sessão é disparado; se a promoção for suprimida por toda a janela ilimitada, a notificação `yolo` é descartada e nunca é re-disparada → o bus mostra `default` enquanto o modo real é `yolo` (relevante para a segurança). A janela limitada da `approvalModeQueue` é a mitigação.

### Caso extremo de emissão dupla

`/approval-mode` durante um diálogo aberto de confirmação de ferramenta pode disparar dois `current_mode_update` em milissegundos (o `setMode` do usuário + o handler `ProceedAlways` da ferramenta). Aceitável (converge); opcionalmente, pule a emissão quando o modo resultante for igual ao atual. Documentado, não bloqueado.

### Risco / compatibilidade

Aditivo no wire (reuso de `current_mode_update` + `previousModeId` + `scope`), mas **não** aditivo no SDK para o tipo promovido (ver §6). Rigorosamente bloqueado no #4510.

---

## 4. A4 — semântica de originator/voter do `permission_resolved`

### Problema

`permission_request.originatorClientId` = originador do prompt. `permission_resolved.originatorClientId` = votante — a emissão em `permissionMediator.ts:1125` carimba `originatorClientId` a partir de `resolverClientId` no spread em `permissionMediator.ts:1135-1137` (o clientId confiável do votante, compatibilidade O8 pré-F3). Os consumidores devem tratar `permission_resolved` como um caso especial.

### Design proposto (aditivo no wire e no SDK)

- **Wire:** emite `voterClientId` junto com `originatorClientId` (mesmo valor). Ambos **opcionais** — resoluções sem votante (expiração do timer, sessão fechada, votante loopback sem `X-Qwen-Client-Id`) não carregam nenhum dos dois, como hoje.
- **Evento tipado do SDK:** expõe **ambos** `originatorClientId` (inalterado — sem renomeação, sem quebra) **e** um novo `voterClientId` opcional; o campo antigo é documentado como um alias depreciado para uma versão major futura.
- O originador do prompt permanece disponível correlacionando com o `permission_request` correspondente.

### Wire / compatibilidade

Aditivo em ambas as camadas — nenhum consumidor quebra. Espelha o aliasing do D4 (PR #4510).

---

## 5. A5 — snapshot do side-channel no momento do attach

### Problema

Um attach com `Last-Event-ID` obtém replay + live tail, mas nenhum snapshot atual do side-channel. Hoje ele puxa `qwen/status/session/context` (`packages/acp-bridge/src/status.ts:96`), supported-commands, `POST /load`.

### Design proposto

Opt-in via `?snapshot=1`; emite um frame sintético **`session_snapshot`** após o replay:

```
session_snapshot { approvalMode, model, availableCommands? }
```

- **`replay_complete` já existe** (`eventBus.ts:444`, entregue pelo #4484 merged) — a fase 2 do A5 introduz apenas o novo frame `session_snapshot`, não o `replay_complete`.
- **Ordenação do resume: replay → `replay_complete` → `session_snapshot`.** O snapshot é a palavra final autoritativa.
- **Captura no momento da emissão a partir do cache de estado da bridge da §2.3, em um único bloco síncrono.** Isso é viável precisamente porque a §2.3 adiciona `entry.currentModelId` / `currentApprovalMode` / `availableCommands` como campos síncronos (mantidos atualizados em cada publicação + semeados na criação da sessão). O snapshot lê esses três campos e publica em um turno síncrono — sem `await` no meio, sem roundtrip assíncrono de status `extMethod` — para que uma mutação concorrente não possa se intercalar. (A "captura no subscribe (T0), emissão após replay" da v3 tinha um bug de sobrescrita obsoleta: um `model_switched` ao vivo entregue durante o replay seria sobrescrito pelo snapshot T0 aplicado por último; a captura na emissão a partir do cache ao vivo corrige isso.) Sem a §2.3 não há fonte síncrona para o estado "atual" e este contrato seria inimplementável — o que era o Crítico da v8.
- **Ordenação do first-attach** (sem `Last-Event-ID`): `replay_complete` NÃO é forçado (nenhum replay ocorreu), e o design **não** sintetiza um `replay_complete{replayedCount:0}` — fazer isso ampliaria o contrato "replaying→live" desse evento para os consumidores existentes. Em vez disso, o `session_snapshot` é **autodelimitante no first-attach**: ele é emitido como o primeiro frame, antes do live tail; os consumidores tratam um `session_snapshot` como "baseline estabelecida". (O resume mantém a ordem replay → `replay_complete` → snapshot acima.)
- **`pendingPermissionIds` excluído** (Segurança, abaixo).
- SDK: o evento tipado `session.snapshot` semeia os campos do side-channel do reducer de view-state, aplicados por último (no resume) / primeiro (no first-attach).
### Subcontrato `?snapshot=1`

Primeiro attach: desativado, a menos que `?snapshot=1`. Reconexão: opt-in (mais útil). Alternar entre reconexões: legal + idempotente (cada inscrição é independente). Atomicidade: melhor esforço (best-effort) — captura no momento da emissão + deltas ao vivo subsequentes são reconciliados; o teste do reducer cobre uma mutação em corrida.

### Segurança: por que não há `pendingPermissionIds`

Incluir IDs pendentes permitiria que um cliente votasse em uma solicitação cujo contexto ele nunca recebeu. `respondToSessionPermission` valida a existência da sessão, o estado de `requestId`/pendente, o **registro do clientId** (`resolveTrustedClientId` em relação a `entry.clientIds`, `bridge.ts:2271`) e a legalidade da opção — mas **não** se o votante observou o `permission_request` original. O atacante, portanto, é um colaborador de sessão registrado (já autenticado via bearer + com clientId registrado), não um cliente anônimo — mais restrito que "qualquer cliente novo", mas a brecha é real: ele poderia aprovar uma operação destrutiva para a qual não tem contexto. Clientes que legitimamente precisam de permissões pendentes as aprendem através do replay (o contexto completo é transmitido). Remover o campo também torna a corrida snapshot/resolução irrelevante.

### Wire / compatibilidade

Aditivo, opt-in. Um SDK antigo expõe o frame desconhecido como um evento de UI `debug` (ruidoso, não quebra) — mais um motivo para mantê-lo como opt-in.

### Alternativas

Fase 1: documentar apenas o contrato de pull (pull após `replay_complete`); adiar o frame.

---

## 6. Aspectos transversais

- **Modelo de autoridade do bridge (§1.1)**: o bridge é dono dos eventos para as alterações que ele conduz; alterações in-session adicionam uma notificação que o bridge faz o demux — A1 via `extNotification()` (`bridgeClient.ts:491`), A2 via `sessionUpdate()` (`bridgeClient.ts:397`); suprimir + descartar-quando-suprimido previnem sinal duplo. A supressão é significativa apenas para o caminho do modelo; o modo de aprovação HTTP não tem notificação de agente.
- **Demux (§2.1) é um pré-requisito rígido**; A2 adicionalmente **bloqueado no #4510** (`approvalModeQueue`).
- **NÃO é aditivo em todos os lugares; tratado por uma transição dual-emit.** Promover `current_mode_update` → `approval_mode_changed` altera o tipo de evento observado. O daemon e o companion da IDE do VS Code são distribuídos em **canais diferentes** (auto-atualização da CLI vs Marketplace), então a mudança não pode ser atômica. **Cadeia de consumidores afetada (todos devem ganhar um caminho para `approval_mode_changed`):**
  - `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts:177` (`case 'current_mode_update'`) — o handler folha;
  - o dispatch upstream que roteia eventos do daemon para ele — `daemonIdeConnection.ts` e `DaemonChannelBridge.ts` fazem switch em `event.type` e descartam tipos não reconhecidos via `default`, então mesmo um handler folha atualizado nunca recebe um `approval_mode_changed` puro até que estes sejam estendidos.
  - **Mitigação (§2.1 dual-emit):** a primeira release emite TANTO o `session_update{current_mode_update}` genérico legado QUANTO o `approval_mode_changed` promovido; o companion da IDE continua funcionando no frame legado; assim que seu caminho para `approval_mode_changed` for distribuído, a próxima release remove o dual-emit. A4 (`voterClientId`) e A5 (frame opt-in) SÃO aditivos (nenhuma transição necessária).
- **Eventos de falha permanecem apenas no bridge** (`model_switch_failed`).
- **O drift concurrent-in-session** é limitado pela reconciliação post-roundtrip da §2.2.
- **Atualizações do reducer do SDK** (nomenclatura, para evitar a confusão A1/A2): A1 introduz **`current_model_update`** → `model.changed`; A2 promove **`current_mode_update`** → `approval_mode_changed`; A4 adiciona `voterClientId` opcional; A5 popula o estado do side-channel a partir de `session.snapshot`.

---

## 7. Sequenciamento

1. **A4** — wire aditivo + alias do SDK. Menor, desbloqueado.
2. **A1 — `current_model_update` via `extNotification`** (distribuído como core #4546) — `Session.setModel` emite o `extNotification`; o demux em `BridgeClient.extNotification()` (`bridgeClient.ts:491`) o promove para `model_switched`. Caminho core + supressão por tipo + observabilidade feitos no #4546; **o cache de estado da §2.3 + verificação de staleness + reconciliação da §2.2 são o follow-up do A1** (eles precisam dos campos do cache).
   - **2b. Cache de estado do bridge da §2.3** — adicionar `currentModelId`/`currentApprovalMode`/`availableCommands` ao `SessionEntry`, atualizado em cada publish + populado na criação. Pré-requisito para o follow-up de staleness/reconciliação do A1 E para o A5.
   - **2c. Acoplamento atômico:** a reconciliação e o guard de `modelPublishGeneration` são um único entregável atômico; distribuir a reconciliação sem o guard cria uma regressão de sobrescrita (clobber) (uma promoção concorrente durante a leitura assíncrona de `getSessionContextStatus` escreveria um valor obsoleto de volta). Ambos devem entrar no mesmo PR.
3. **A2 — BLOQUEADO no PR #4510** (`approvalModeQueue`). Adiciona a promoção de `current_mode_update` (`previous` derivado do cache da §2.3 — sem `previousModeId` no wire), emissão de `Session.setMode`, generalização do helper, `scope`, publish de workspace do bridge retido, a **transição dual-emit** + atualizações do companion da IDE + dispatch upstream.
   - **3b. Remoção do dual-emit** — rastreado por uma issue no GitHub com uma release alvo; o site de publish do dual-emit carrega `TODO(dual-emit-removal)` referenciando a §2.1. Feche a issue quando a próxima release remover o dual-emit.
   - **3c. Reconciliação post-roundtrip do A2** — mesmo contrato da §2.2, lendo o modo de aprovação real do agente; adiciona o helper `approvalModePublishGeneration` e `publishApprovalModeChanged`. Deve entrar junto com a promoção do A2 (mesma justificativa da 2c — reconciliação sem o guard de geração é pior que nenhuma reconciliação).
4. **A5** — docs do contrato de pull da fase 1; `session_snapshot` opt-in da fase 2 (captura na emissão em um bloco síncrono; após `replay_complete` na retomada, primeiro frame autodelimitado no primeiro attach). `replay_complete` já existe (#4484); apenas `session_snapshot` é novo.

Cada um entra como seu próprio PR de implementação após a aprovação deste design.

---

## 8. Plano de testes

- **Demux/§1.1:** `current_model_update` promovido publica `model_switched` e suprime o wrapper genérico; uma notificação durante um roundtrip de modelo do bridge em andamento é **descartada** (não é publicada genericamente, não é promovida); uma notificação in-session É promovida; subtipo desconhecido continua genérico.
- **A1:** `/model` in-session E plan-mode publicam exatamente um `model_switched` cada; `POST /model` HTTP e `applyModelServiceId` no momento do attach publicam exatamente um cada (sem duplicação); `setModel` com falha (in-session + HTTP) não emite `model_switched`, HTTP ainda emite `model_switch_failed`; um `model_switched` após um `model_switch_failed` por timeout é entregue (autoritativo-mais recente).
- **A2:** `setMode` in-session publica um `approval_mode_changed{scope:'session',persisted:false}` com escopo de sessão; `POST /approval-mode` HTTP publica um (bridge, único emissor, sem duplicação); não persistido NÃO faz broadcast para o workspace; persistido adiciona um evento `scope:'workspace',persisted:true`; `setMode` com falha não emite nada; a divergência de janela ilimitada é prevenida assim que o `approvalModeQueue` entrar.
- **A4:** **caso de distinção** — o cliente A envia o prompt (então `permission_request.originatorClientId === A`), um cliente B DIFERENTE dá o voto de resolução (então `permission_resolved.voterClientId === B`), asserção de que os dois diferem (a desambiguação para a qual o A4 existe, não apenas o valor do mesmo cliente); resolução por timer/sem-clientId não carrega nenhum dos campos; o SDK expõe ambos; o fallback de daemon antigo expõe o votante via `originatorClientId`. (Feito no PR #4539.)
- **A5:** a retomada com `?snapshot=1` produz `session_snapshot` (mode/model/commands, sem pendingPermissionIds) após `replay_complete`; o primeiro attach produz `session_snapshot` como o primeiro frame com **nenhum** `replay_complete` sintético; attach SEM a flag NÃO produz snapshot; alternar a flag entre reconexões é idempotente; um `model_switched` entregue durante o replay NÃO é sobrescrito pelo snapshot (captura síncrona no momento da emissão).
- **Dedup de melhor esforço (§2.1):** um `current_model_update(A)` chegando quando `entry.currentModelId` **já é A** é **descartado** (no-op redundante). Um `current_model_update(A)` quando o cache é B (A≠B), sem roundtrip em andamento, **é promovido** (o demux NÃO distingue valor de obsoleto vs novo — esse é o trabalho da reconciliação). _(Corrigido de um cenário v8 que esperava incorretamente um descarte baseado em valor.)_
- **Reconciliação (§2.2, autoritativa + guardada por geração):**
  - _corretiva:_ `setSessionModel(A)` do bridge em andamento → `/model B` in-session concorrente descartado (suprimir) → bridge publica `model_switched(A)` → `getSessionContextStatus` post-settle (mockado → B) → `model_switched(B)` corretivo; o bus converge para B (e o corretivo atualiza o cache + geração).
  - _convergida:_ leitura de status é igual a `entry.currentModelId` (o modelo atual do bus) → sem corretivo (`action=converged`).
  - _generation-skip (TOCTOU):_ uma promoção entra durante a leitura assíncrona (a geração avança) → a reconciliação **pula** o corretivo mesmo que sua leitura esteja obsoleta (`action=skipped-newer-gen`).
  - _gatilho do caminho de falha:_ um roundtrip com timeout (`model_switch_failed`) ainda dispara a reconciliação; a base de comparação é `entry.currentModelId` (o valor pré-roundtrip, já que `model_switch_failed` NÃO atualiza o cache); se o agente realmente aplicou o modelo A com timeout (a leitura retorna A) e `entry.currentModelId` ainda é o valor antigo B, a reconciliação emite `model_switched(A)` corretivo via `publishModelSwitched` → o bus converge para A.
  - _read-error:_ a leitura de status falha em todas as tentativas → emite `reconciliation_failed { sessionId, error, retryCount, trigger }` com o payload correto; logs por tentativa emitidos (`attempt=1/<max>`, `attempt=2/<max>`); sem corretivo.
- **Não-supressão entre eixos (§2.1):** um roundtrip de **modelo** do bridge em andamento NÃO suprime um `current_mode_update` in-session (ele É promovido), e vice-versa.
- **Cache de estado do bridge (§2.3):** cada site de publish de `model_switched` roteia através de `publishModelSwitched` que atualiza `entry.currentModelId` E incrementa `entry.modelPublishGeneration`; asserção de que a geração avançou exatamente 1 após cada um (incluindo o corretivo de reconciliação). As leituras de snapshot/dedup/guard de geração veem o valor mais recente de forma síncrona; cache populado na criação da sessão.
- **Transição dual-emit (§2.1/§6):** durante a janela, tanto `approval_mode_changed` QUANTO `session_update{current_mode_update}` são emitidos; após a remoção, apenas `approval_mode_changed`.
- **Transporte extNotification (v7):** `current_model_update` chega via `extNotification()` (não `sessionUpdate()`) e é promovido para `model_switched`.
- **Migração de compatibilidade (§2.1):** um reducer do SDK que anteriormente recebia `current_mode_update` como `session_update` genérico atinge o estado idêntico uma vez que é promovido para `approval_mode_changed`.
- **Regressão de helper (ponto 4 da §3):** chamadores de `exit_plan_mode` e `ProceedAlways` ainda produzem payloads corretos de `current_mode_update` após o helper ser generalizado.
- **Borda de emissão dupla (§3):** `/approval-mode` concorrente + `ProceedAlways` ambos emitem; o reducer converge.
- **Guard estrutural de não-recursão (§2.2):** enquanto a reconciliação está em andamento (`reconciliationInFlight === true`), uma promoção concorrente que dispararia a reconciliação é **pulada** (`action=skipped-reentrant`); a flag é resetada após a reconciliação em andamento se resolver, independentemente do resultado. Adicionalmente: após um `model_switched` corretivo de reconciliação ser disparado, asserção de que `getSessionContextStatus` é invocado **exatamente uma vez** para o evento de resolução disparador — o publish corretivo NÃO reentra no caminho de reconciliação (contagem de chamadas limitada).
- **Caminho de falha convergido (§2.2):** `model_switch_failed` dispara → reconciliação lê `getSessionContextStatus` → retorna `entry.currentModelId` (inalterado) → nenhum corretivo emitido (`action=converged`); estado do bus inalterado.
- **Valores do contador de geração (§2.3):** após uma sequência de promoção → reconciliação → corretivo, `entry.modelPublishGeneration` é igual a `gen_before + 2` (um para a promoção inicial, um para o corretivo); `gen_before`/`gen_after` logados na observabilidade correspondem aos valores do contador na entrada/saída da reconciliação.
---

## 9. Decisões resolvidas (propriedade do emitter)

| Entrada                                              | caminho do agent                                                                   | através de `Session.*`?          | emitter com escopo de sessão                                                            | publicação no workspace                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `POST /session/:id/model`                          | `unstable_setSessionModel` (`acpAgent.ts:925`) → `session.setModel` (`:935`) | ✅                            | **bridge** (`bridge.ts:2883`); notificação do agent **suprimida durante o roundtrip** | n/a                                        |
| anexar `applyModelServiceId`                       | mesmo caminho                                                                    | ✅                            | **bridge** (`bridge.ts:1172`); suprimido durante o roundtrip                        | n/a                                        |
| `/model` in-session, plan-mode                     | `Session.setModel` diretamente                                                  | ✅                            | **agent** `current_model_update` → demux                                          | n/a (adiado)                             |
| `POST /session/:id/approval-mode`                  | extMethod (`acpAgent.ts:2200`) → `config.setApprovalMode` (`:2228`)          | ❌ contorna `Session.setMode` | **bridge** (`bridge.ts:2979`); **sem notificação do agent** (nada a suprimir)    | bridge, condicionado a `persist` (`bridge.ts:3007`) |
| ACP `setSessionMode` / `/approval-mode` in-session | `acpAgent.ts:922` → `Session.setMode`                                        | ✅                            | **agent** `current_mode_update` → demux                                           | n/a                                        |

`model_switch_failed` é exclusivo do bridge em todos os caminhos.

**Resolvido: A2 mantém o bypass do extMethod (NÃO roteie o caminho HTTP approval-mode através de `Session.setMode`).** Esta era uma questão em aberto; é estrutural (se invertida, o caminho HTTP dispararia uma notificação do agent e o "sem notificação do agent, nada a suprimir" da §1.1 se tornaria incorreto, produzindo um double-emit). Decisão: manter o bypass — o bridge continua sendo o único emitter para o HTTP approval-mode, sem necessidade de lógica de supressão ali. Revisitar isso exigiria adicionar lógica de supressão + a dependência da `approvalModeQueue` a esse caminho, portanto, está explicitamente fora do escopo.

## 10. Questões em aberto

1. **Espelho de workspace A1:** entregar o espelho de workspace do modelo persistido adiado, ou deixar o modelo com escopo de sessão permanentemente? (O escopo de persistência em si é workspace ou usuário conforme `getPersistScopeForModelSelection`.)
2. **Padrão A5:** manter `?snapshot=1` como opt-in versus always-on para reconexões.
3. **Reconciliação vs serialize-at-source (A1) — o alvo livre de race conditions.** A stack de suppress + best-effort-dedup + authoritative-reconciliation + generation-guard existe apenas porque o `/model` in-session contorna a `modelChangeQueue` e entra em race condition com mudanças dirigidas pelo bridge. Rotear as mudanças de modelo in-session através da **mesma** `modelChangeQueue` (para que todas as mudanças de modelo serializem e publiquem em ordem) elimina a maquinaria de suppress/dedup/reconcile e cada TOCTOU que ela gerou — é o design correto de longo prazo. Está adiado apenas porque exige que o handler in-session (`Session.setModel` → agent) coordene com a fila da entrada do bridge através da fronteira do ACP, o que é uma mudança maior. Até lá, a stack v10 é a mitigação temporária com o comportamento de race residual documentado acima. **Recomenda-se agendar o refactor serialize-at-source em vez de reforçar a reconciliação indefinidamente.**