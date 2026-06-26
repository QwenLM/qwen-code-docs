# Design da interface de detecção de inatividade do Daemon

## Contexto

### Problema

O Qwen Daemon será implantado em várias máquinas como um serviço de longa duração. Quando o Daemon fica muito tempo sem executar tarefas, continuar ocupando recursos da máquina é um desperdício. Um escalonador externo (K8s HPA / Scaler customizado) precisa de um sinal confiável para determinar se o Daemon está ocioso, a fim de realizar a redução de escala e coleta.

### Situação atual

Interfaces atualmente disponíveis:

| Interface                           | Informação retornada                              | Limitação                                                                                  |
| ----------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /health?deep=true`             | `{ sessions, pendingPermissions }`                | Apenas quantidade de sessões, não distingue "tem sessão mas ocioso" de "tem sessão ativa"  |
| `GET /workspace/:cwd/sessions`      | `hasActivePrompt` + `clientCount` de cada sessão  | Requer uma requisição extra e não fornece dimensão temporal (há quanto tempo sem atividade?) |

**Lacunas principais**:

1. Ausência de uma métrica agregada de "prompt ativo"
2. Ausência de "último momento de atividade"; sistemas externos precisam manter sua própria máquina de estados para calcular o tempo ocioso
3. Ausência de exposição do número de conexões SSE (já mantido internamente como `activeSseCount`, mas não retornado em `/health`)
4. Ausência de exposição do estado ativo do canal (subprocesso agent)

## Objetivos de design

Fornecer uma interface que **determine a ociosidade com uma única chamada HTTP**, atendendo:

- Um escalonador externo pode decidir se pode ser coletado com um único GET
- Suporte para dimensão temporal (há quanto tempo ocioso), evitando que o externo mantenha estado
- Compatibilidade retroativa com o comportamento atual de `/health`
- Zero dependências adicionais, utilizando o estado interno já existente

## Solução

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
  "connectedClients": 3, // Número de conexões SSE ativas
  "channelAlive": true, // Se o subprocesso agent está vivo
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // Timestamp da última atividade (ISO 8601)
  "idleSinceMs": 120000, // Milissegundos desde a última atividade
}
```

### Definição dos campos

| Campo               | Tipo             | Semântica                                                                                        |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `activePrompts`     | `number`         | Contagem de sessões onde `promptActive === true`                                                  |
| `connectedClients`  | `number`         | Número atual de conexões SSE ativas (já existe `activeSseCount`)                                 |
| `channelAlive`      | `boolean`        | Se o subprocesso agent está vivo (já existe `bridge.isChannelLive()`)                            |
| `lastActivityAt`    | `string \| null` | Timestamp ISO do último início ou fim de prompt; `null` se nunca houve prompt desde a inicialização |
| `idleSinceMs`       | `number \| null` | `Date.now() - lastActivityAt`; `null` se não houver registro de atividade                        |

### Definição de "atividade"

Os seguintes eventos são considerados "atividade" e atualizam `lastActivityAt`:

- Início da execução de um prompt (`promptActive` muda de false → true)
- Conclusão/falha de um prompt (`promptActive` muda de true → false)
- Criação de nova sessão (`spawnOrAttach` bem-sucedido)
- Restauração/carregamento de sessão (`loadSession` / `resumeSession` bem-sucedido)

**Não** são considerados atividade (para evitar falsos positivos):

- Conexão/desconexão SSE
- Heartbeat
- A própria requisição `/health`
- Requisições/respostas de permissão

### Regra de determinação de ociosidade (para referência do escalonador externo)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Condição sugerida para coleta: ocioso por mais que o limiar (padrão 5 minutos)"""
    if health["activePrompts"] > 0:
        return False  # Há tarefas em execução
    if health["connectedClients"] > 0:
        return False  # Há clientes conectados
    if health["idleSinceMs"] is None:
        # Nunca houve atividade — pode ser um Daemon frio recém-iniciado
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Alterações de código envolvidas

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

Adicionar na interface `AcpSessionBridge`:

```typescript
/** Número de sessões executando um prompt */
get activePromptCount(): number;

/** Timestamp da última atividade (epoch ms), null se nunca houve atividade */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

Dentro da função de fábrica `createAcpSessionBridge`:

```typescript
// Novo rastreamento de estado
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

Chamar `touchActivity()` nos seguintes locais:

- `entry.promptActive = true` (~linha 2528) — início do prompt
- `entry.promptActive = false` (~linhas 2551, 2559) — fim do prompt
- Após `doSpawn` criar uma sessão com sucesso (~próximo à linha 1906)
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

Modificar o ramo `deep` em `healthHandler` (~linha 803):

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
      // Novo
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

Adicionar novos casos de teste cobrindo:

- Corretude dos novos campos em `/health?deep=true`
- `activePrompts === 0` e `idleSinceMs === null` quando não há sessões
- `activePrompts > 0` e `idleSinceMs` sendo atualizado continuamente durante execução de prompt
- `idleSinceMs` começando a aumentar após a conclusão do prompt

### 5. `packages/acp-bridge/src/bridge.test.ts`

Adicionar novos casos de teste cobrindo:

- Variação do valor de `activePromptCount` ao longo do ciclo de vida de um prompt
- `lastActivityAt` sendo atualizado após cada evento de atividade
- Acumulação correta de `activePromptCount` com múltiplas sessões paralelas

## Lista de alterações de arquivos

| Arquivo                                   | Tipo de alteração    | Descrição                                                    |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------ |
| `packages/acp-bridge/src/bridgeTypes.ts`  | Extensão de interface | Novas propriedades `activePromptCount` e `lastActivityAt`    |
| `packages/acp-bridge/src/bridge.ts`       | Implementação lógica | Novo rastreamento `lastActivityTimestamp` + getters          |
| `packages/cli/src/serve/server.ts`        | Extensão de resposta HTTP | `/health?deep=true` agora inclui novos campos                |
| `packages/cli/src/serve/server.test.ts`   | Testes               | Cobertura dos novos campos da interface de saúde             |
| `packages/acp-bridge/src/bridge.test.ts`  | Testes               | Cobertura das propriedades da bridge                         |

## Compatibilidade

- **Compatível com versões anteriores**: Novos campos são adicionais; nenhum campo existente é modificado ou removido
- **`GET /health` (não deep)**: Comportamento inalterado, ainda retorna apenas `{ "status": "ok" }`
- **OTel Gauge**: O já existente `registerDaemonGaugeCallbacks` pode opcionalmente adicionar a gauge `activePrompts` posteriormente, mas não está no escopo atual

## Extensões futuras (fora do escopo atual)

1. **Desligamento automático**: Parâmetro embutido `--auto-shutdown-idle-ms` no Daemon para encerrar após tempo ocioso (adequado para cenários systemd/K8s Pod)
2. **Exposição de métricas OTel**: Registrar `activePrompts` e `idleSinceMs` como gauges no meter OTel
3. **Callback Webhook**: Enviar evento ativamente para sistemas externos quando o limiar de ociosidade for excedido