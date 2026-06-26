# Design da Interface de Detecção de Inatividade do Daemon

## Contexto

### Problema

O Qwen Daemon será implantado em várias máquinas como um serviço de longa duração. Quando o Daemon fica muito tempo sem executar tarefas, continuar ocupando recursos da máquina é um desperdício. Um escalonador externo (K8s HPA / Scaler personalizado) precisa de um sinal confiável para determinar se o Daemon está ocioso, a fim de realizar a redução e recuperação.

### Situação Atual

Interfaces disponíveis atualmente:

| Interface                      | Informação Retornada                             | Limitação                                                                                 |
| ------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /health?deep=true`        | `{ sessions, pendingPermissions }`               | Apenas número de sessões, não distingue "com sessão mas ociosa" de "com sessão trabalhando" |
| `GET /workspace/:cwd/sessions` | `hasActivePrompt` + `clientCount` de cada sessão | Requer uma requisição extra e sem informação de dimensão temporal (há quanto tempo inativa?) |

**Lacunas principais**:

1. Não há uma métrica agregada de "se há prompt ativo"
2. Não há "último horário de atividade", o sistema externo precisa manter sua própria máquina de estados para calcular o tempo ocioso
3. Não há exposição do número de conexões SSE (o `activeSseCount` já é mantido internamente, mas não é retornado em `/health`)
4. Não há exposição do estado de atividade do canal (subprocesso agent)

## Objetivos do Design

Fornecer uma interface que permita **determinar a inatividade com uma única chamada HTTP**, atendendo:

- O escalonador externo pode decidir se pode recuperar com um único GET
- Suporte à dimensão temporal (há quanto tempo está ocioso), evitando que o externo mantenha estado
- Compatibilidade retroativa com o comportamento existente de `/health`
- Zero dependências extras, utilizando estado interno já existente

## Proposta

### Aprimorar a resposta de `GET /health?deep=true`

Adicionar campos na resposta existente de `/health?deep=true`:

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- Campos existentes (inalterados) ---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- Novos campos ---
  "activePrompts": 1, // Número de sessões executando um prompt
  "connectedClients": 3, // Conexões SSE ativas
  "channelAlive": true, // Se o subprocesso agent está vivo
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // Último horário de atividade (ISO 8601)
  "idleSinceMs": 120000, // Milissegundos desde a última atividade
}
```

### Definição dos Campos

| Campo               | Tipo             | Significado                                                                                 |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `activePrompts`     | `number`         | Contagem de sessões com `promptActive === true` atualmente                                  |
| `connectedClients`  | `number`         | Número de conexões SSE ativas (já existe `activeSseCount`)                                  |
| `channelAlive`      | `boolean`        | Se o subprocesso agent está vivo (já existe `bridge.isChannelLive()`)                       |
| `lastActivityAt`    | `string \| null` | Timestamp ISO do último início ou fim de prompt; `null` se nunca houve prompt desde a inicialização |
| `idleSinceMs`       | `number \| null` | `Date.now() - lastActivityAt`; `null` se não houver registro de atividade                   |

### Definição de "Atividade"

Os eventos a seguir são considerados "atividade" e atualizam `lastActivityAt`:

- Início da execução de um prompt (`promptActive` muda de false → true)
- Conclusão/falha de um prompt (`promptActive` muda de true → false)
- Criação de nova sessão (`spawnOrAttach` bem-sucedido)
- Restauração/carregamento de sessão (`loadSession` / `resumeSession` bem-sucedido)

**Não** são considerados atividade (para evitar falsos positivos):

- Conexão/desconexão SSE
- Heartbeat
- A própria requisição `/health`
- Requisições/respostas de permissão

### Regra de Determinação de Inatividade (para referência do escalonador externo)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Condição sugerida para recuperação: inativo por mais que o limite (padrão 5 minutos)"""
    if health["activePrompts"] > 0:
        return False  # Há tarefa em execução
    if health["connectedClients"] > 0:
        return False  # Há clientes conectados
    if health["idleSinceMs"] is None:
        # Nunca houve atividade — pode ser um daemon recém-iniciado e frio
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Alterações de Código Envolvidas

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

Adicionar na interface `AcpSessionBridge`:

```typescript
/** Número de sessões executando um prompt */
get activePromptCount(): number;

/** Último timestamp de atividade (epoch ms), null se nunca houve atividade */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

Dentro da função fábrica `createAcpSessionBridge`:

```typescript
// Novo rastreamento de estado
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

Chamar `touchActivity()` nos seguintes locais:

- `entry.promptActive = true` (linha ~2528) — início do prompt
- `entry.promptActive = false` (linhas ~2551, 2559) — fim do prompt
- Após `doSpawn` criar sessão com sucesso (próximo à linha ~1906)
- Após `restoreSession` com sucesso

Expor no objeto retornado:

```typescript
get activePromptCount() {
  let count = 0;
  for (const entry of byId.values()) {
    if (entry.promptActive) count++;
  }
  return count;
},

get lastActivityAt() {
  return lastActivityTimestamp;
},
```

### 3. `packages/cli/src/serve/server.ts`

Modificar o ramo `deep` no `healthHandler` (linha ~803):

```typescript
const healthHandler = (req: Request, res: Response): void => {
  const deepQuery = req.query['deep'];
  const deep = deepQuery === '1' || deepQuery === 'true' || deepQuery === '';
  if (!deep) {
    res.status(200).json({ status: 'ok' });
    return;
  }
  try {
    const lastActivityAt = bridge.lastActivityAt;
    const now = Date.now();
    res.status(200).json({
      status: 'ok',
      // Existente
      sessions: bridge.sessionCount,
      pendingPermissions: bridge.pendingPermissionCount,
      // Novos
      activePrompts: bridge.activePromptCount,
      connectedClients: getActiveSseCount(),
      channelAlive: bridge.isChannelLive(),
      lastActivityAt:
        lastActivityAt !== null ? new Date(lastActivityAt).toISOString() : null,
      idleSinceMs: lastActivityAt !== null ? now - lastActivityAt : null,
    });
  } catch (err) {
    writeStderrLine(
      `qwen serve: /health deep probe failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(503).json({ status: 'degraded' });
  }
};
```
### 4. `packages/cli/src/serve/server.test.ts`

Novos casos de teste:

- Correção dos novos campos retornados por `/health?deep=true`
- Quando não há sessão, `activePrompts === 0`, `idleSinceMs === null`
- Durante a execução de um prompt, `activePrompts > 0` e `idleSinceMs` é continuamente atualizado
- Após a conclusão de um prompt, `idleSinceMs` começa a aumentar

### 5. `packages/acp-bridge/src/bridge.test.ts`

Novos casos de teste:

- Mudanças no valor de `activePromptCount` ao longo do ciclo de vida de um prompt
- `lastActivityAt` é atualizado após cada evento de atividade
- Quando múltiplas sessões estão em paralelo, `activePromptCount` é acumulado corretamente

## Lista de alterações de arquivos

| Arquivo                                    | Tipo de alteração            | Descrição                                                     |
| ------------------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`   | Extensão de interface        | Adicionadas propriedades `activePromptCount` e `lastActivityAt` |
| `packages/acp-bridge/src/bridge.ts`        | Implementação de lógica      | Adicionado rastreamento `lastActivityTimestamp` + getter      |
| `packages/cli/src/serve/server.ts`         | Extensão de resposta HTTP    | Adicionados novos campos a `/health?deep=true`                |
| `packages/cli/src/serve/server.test.ts`    | Teste                        | Nova cobertura de campos do endpoint health                   |
| `packages/acp-bridge/src/bridge.test.ts`   | Teste                        | Nova cobertura de propriedades do bridge                      |

## Compatibilidade

- **Retrocompatível**: novos campos são adicionados, nenhum campo existente é modificado/removido
- **`GET /health` (não deep)**: comportamento inalterado, ainda retorna apenas `{ "status": "ok" }`
- **OTel Gauge**: o `registerDaemonGaugeCallbacks` existente pode opcionalmente adicionar posteriormente um gauge `activePrompts`, mas isso está fora do escopo atual

## Extensões futuras (fora do escopo atual)

1. **Desligamento automático**: o daemon possui um parâmetro `--auto-shutdown-idle-ms` interno, que sai após tempo ocioso excedido (adequado para cenários systemd/K8s Pod)
2. **Exposição de métricas OTel**: registrar `activePrompts` e `idleSinceMs` como gauges no meter OTel
3. **Callback Webhook**: enviar eventos proativamente para sistemas externos quando o limite de ociosidade for excedido
