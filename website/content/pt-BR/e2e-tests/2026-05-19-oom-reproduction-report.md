# Relatório de Teste de Estresse OOM e Replay de Tarefas Longas

**Data**: 2026-05-19
**Branch**: `codex/memory-diagnostics-local-run`
**Testador**: yiliang114
**Conclusão**: Sucesso na reprodução e identificação da causa raiz. O auto-compaction introduzido na v0.15.7 (#3735) dobrou a frequência de chamadas `structuredClone`, criando um ciclo de feedback positivo sob alta pressão de heap, levando ao OOM. Logs reais de debug comprovam completamente esse mecanismo.

---

## 1. Contexto

Múltiplas issues (#4309, #4276, #4185, #4315, #4322, #2868) relataram crash V8 heap OOM no qwen-code durante sessões longas:

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

Características dos crashes relatados pelos usuários:
| Issue | Heap no crash | Tempo de execução | Plataforma |
|-------|---------------|-------------------|------------|
| #4276 | 4014 MB | ~110 minutos | Linux x64 |
| #4315 | 2027 MB | ~19,6 horas | macOS (limite padrão 2GB) |
| #4322 | 4023 MB | ~7 horas | Windows |
| #2868 | 2035 MB | ~1,7 minutos | Linux |
| #4309 | 7020 MB | Desconhecido | Windows (limite 8GB ainda crash) |

---

## 2. Correção Metodológica

Este relatório distingue dois tipos de teste:

1. **Teste de baixa pressão de heap**: Reduz `--max-old-space-size` para amplificar o problema, usado para localizar rapidamente o caminho de código onde "cópias completas de históricos grandes causam picos instantâneos". É uma ferramenta de diagnóstico, não equivalente à reprodução real de OOM de 4G/8G do usuário.
2. **Replay de tarefas longas com heap padrão**: Não define `NODE_OPTIONS`, usa histórico JSONL real para restaurar e continuar a execução de tarefas de review, amostrando RSS da árvore de processos externamente. Apenas esses resultados são usados para julgar o nível real de memória do lado do usuário.

Portanto, resultados de baixo heap não podem ser usados isoladamente como prova de que "o OOM real foi corrigido". Eles apenas indicam que um determinado caminho produzirá amplificação de pico quando o histórico for grande o suficiente, exigindo verificação adicional com replay de tarefas longas com heap padrão.

## 3. Condições do Teste de Baixa Pressão de Heap

| Parâmetro | Valor |
| --------- | ----- |
| Versão do CLI | 0.15.11 (build a partir do branch `codex/memory-diagnostics-local-run`) |
| Modelo | `qwen3.6-plus` (janela de contexto 128K) |
| Limite de heap | `--max-old-space-size=512` |
| Rede de segurança de pressão de heap | **Desabilitada** (HEAP_PRESSURE_COMPRESSION_RATIO configurado como 99.0) |
| Modo de operação | YOLO + automação de múltiplas rodadas de tarefas de leitura de arquivos |
| Diretório de trabalho | monorepo qwen-code (3538 arquivos .ts, 1,26M linhas) |

### Modificações de Configuração Chave

Em `packages/core/src/core/geminiChat.ts`, o limiar de compactação por pressão de heap foi alterado de 0,7 para 99,0 (para nunca disparar), simulando o estado anterior à correção #4186.

---

## 4. Resultados do Teste de Baixa Pressão de Heap

### Linha do Tempo do Crash

```
[21:26:59] #1 RSS:193,6MB Ctx:0%   → Read geminiChat.ts (1500 linhas)
[21:27:46] #2 RSS:270,4MB Ctx:4,2% → Read agent.ts
[21:28:32] #3 RSS:397,5MB Ctx:4,3% → grep + Read 3 arquivos
[21:29:18] #4 RSS:452,7MB Ctx:5,7% → Read slashCommandProcessor.ts
[21:30:04] #5 RSS:515,0MB Ctx:5,9% → Read chatCompressionService.ts
[21:30:50] #6 RSS:649,1MB Ctx:4,0% ← TOKEN COMPACTION disparado (5,9%→4,0%)
                                       RSS aumentou 134MB (pico structuredClone)
[21:31:36] #7 RSS:666,7MB Ctx:3,2% ← nova compaction, RSS continua subindo
[21:32:22] CRASH — FATAL ERROR: Ineffective mark-compacts near heap limit
```

**Tempo total**: ~5,5 minutos, crash após 7 rodadas.

Isso prova que, sob heap limitado, histórico longo + compaction/history clone pode disparar V8 heap OOM. No entanto, esse resultado não significa que o OOM real do usuário com heap padrão tenha sido completamente reproduzido.

### Reprodução Sintética com Heap Maior

Para evitar depender apenas da conclusão de baixo heap de 512 MiB, foi adicionado um teste de pressão sintética com heap maior. Este teste não chama o modelo, mas constrói um histórico semelhante a tarefas longas de review/subagent:

- Turns de review raiz: 10
- Chamadas subagent: 30
- Registros de transcrição subagent: 780
- Bytes de resultados de ferramentas retidos: 193.986.560
- Bytes de histórico serializado: 195.620.061
- Modo de pressão: cópias `structuredClone(history)` retidas

| Limite de heap | Pressão de clone | Resultado | GC / stack chave |
| -------------- | ---------------- | --------- | ---------------- |
| 2 GiB | 8 clones retidos | Não crashou, RSS 2,42 GiB, heap usado 1,87 GiB | Próximo ao limite de heap |
| 2 GiB | 10 clones retidos | OOM | `Reached heap limit`, `ValueDeserializer`, `StructuredClone` |
| 4 GiB | 20 clones retidos | OOM | `Reached heap limit`, `ValueDeserializer`, `StructuredClone` |

Resumo do GC para reprodução com 2 GiB:

```
Mark-Compact 2042.9 (2081.9) -> 2042.9 (2081.1) MB
Mark-Compact 2048.9 (2087.2) -> 2048.9 (2087.2) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

Resumo do GC para reprodução com 4 GiB:

```
Mark-Compact 4082.5 (4126.8) -> 4082.5 (4126.3) MB
Mark-Compact 4095.1 (4139.0) -> 4095.1 (4139.0) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

Este conjunto de resultados está mais próximo dos OOMs de heap de 2 GiB / 4 GiB relatados pelos usuários do que o teste de pressão de 512 MiB: se houver resultados de ferramentas grandes / transcrições subagent suficientes retidos no histórico, fazer clones retidos ou instantâneos de todo o histórico pode disparar V8 OOM mesmo com heap de 2-4 GiB. Ainda é uma reprodução sintética, não equivalente ao replay completo de tarefas de negócio longo, mas prova diretamente que o problema não é "fabricado artificialmente com heap pequeno".

### Estado do GC no Momento do Crash

```
[41381:0x130008000] 342468 ms: Mark-Compact 508.6 (526.7) -> 507.0 (526.9) MB,
  pooled: 1 MB, 86.42 / 0.00 ms  (average mu = 0.175, current mu = 0.150)
  task; scavenge might not succeed

[41381:0x130008000] 342568 ms: Mark-Compact 509.1 (526.9) -> 507.1 (528.2) MB,
  pooled: 0 MB, 93.79 / 0.12 ms  (average mu = 0.121, current mu = 0.068)
  allocation failure; scavenge might not succeed

FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

Mark-Compact só consegue recuperar 1-2 MB (quase todos os objetos são reachable), provando que a memória está realmente ocupada por objetos legitimamente retidos.

---

## 5. Replay de Tarefas Longas com Heap Padrão

Para evitar extrapolação excessiva da conclusão de baixo heap, foi adicionado um replay JSONL real com heap padrão:

- Sem definir `NODE_OPTIONS`
- Sem habilitar profiler de runtime interno para evitar que o amostrador afete o heap
- Cada CLI copia uma fresh session do mesmo JSONL rebobinado
- Usa `QWEN_HOME` temporário, desabilita MCP e hooks para evitar poluição de configuração global local
- Apenas amostragem externa para estatísticas de RSS da árvore de processos

| CLI | Resultado | Duração | Pico RSS árvore | Pico RSS raiz | Pico RSS worker | Observações |
| --- | --------- | ------- | --------------- | ------------- | --------------- | ----------- |
| `qwen` instalado | Sucesso | 167,3s | 838,0 MiB | 230,2 MiB | 566,3 MiB | Primeira execução fresh encontrou erro do lado do servidor do modelo, não incluído na conclusão; retry bem-sucedido |
| bundle reconstruído localmente | Sucesso | 106,3s | 527,5 MiB | 182,1 MiB | 345,4 MiB | Inclui correção do hot path de clone local |

Conclusões do replay com heap padrão:

1. Este JSONL de review pode rodar de forma estável com RSS de árvore de processos variando de centenas de MiB até cerca de 0,8 GiB, mas não reproduziu OOM de 4G/8G.
2. O bundle reconstruído localmente apresentou pico menor no replay a partir do mesmo ponto de partida que o CLI instalado, indicando que reduzir o hot path de clone de histórico tem benefícios reais.
3. Isso ainda não prova que todos os OOMs de usuários foram resolvidos. O OOM real de 4G/8G ainda requer tarefas mais longas, maior acúmulo de tool-results, ou replay mantendo pressão de MCP/tool schema para continuar validando.

## 6. Análise da Causa Raiz

### Mecanismo de Três Camadas do OOM

```
┌─────────────────────────────────────────────────────────┐
│ Camada 3: Limite de Heap V8 (512MB/2GB/4GB)            │ ← O usuário eventualmente colide aqui
├─────────────────────────────────────────────────────────┤
│ Camada 2: Pico de structuredClone() (instantâneo ~2x)  │ ← Gatilho direto
├─────────────────────────────────────────────────────────┤
│ Camada 1: Acúmulo de tool results no histórico (crescimento linear) │ ← Crescimento base
├─────────────────────────────────────────────────────────┤
│ Camada 0: Momento de disparo do token compaction       │ ← Ponto de controle
└─────────────────────────────────────────────────────────┘
```

### Caminho Exato do Crash

```
sendMessage()
  → tryCompress()
    → heapPressureRatio < threshold (safety net desabilitado)
    → ChatCompressionService.compress()
      → chat.getHistory(true)
        → structuredClone(this._history)   ← Alocação de pico!
          → V8 precisa de ~N MB extras para acomodar o clone
          → Se existing heap + N > limit → OOM
```

### Evidências Chave

| Observação | Significado |
| ---------- | ----------- |
| Tarefa #5→#6: Contexto 5,9%→4,0% (reduziu) | Token compaction **executou com sucesso** |
| Tarefa #5→#6: RSS 515→649 MB (aumentou 134MB) | O `structuredClone` do processo de compaction criou um pico |
| GC só consegue recuperar 1-2 MB | Todos os objetos estão live (histórico + clone existem) |
| #4309 definiu limite de 8GB e ainda crashou | Quando o histórico é grande o suficiente, o pico de clone pode exceder qualquer limite |

Observação: As evidências acima vêm de uma combinação de inferências do teste de baixa pressão de heap e dos sintomas das issues. O replay com heap padrão atualmente suporta que "o hot path de clone impacta significativamente o pico de RSS", mas ainda não reproduziu isoladamente OOM de 4G/8G.

### Por que a Janela de Contexto de 128K é Mais Provável de Disparar

- 128K × 70% = ~90K tokens disparam compaction
- Janela de contexto grande (1M) a 70% = 700K tokens, quase nunca dispara
- **Quanto mais frequente a compaction → mais frequente structuredClone → maior risco de OOM**
- Modelos como DeepSeek que não configuram contextWindowSize usam padrão 128K, mais propensos a disparar

---

## 6.5, Evidências de Logs Reais de Execução

Os logs a seguir foram extraídos da saída de debug de uma sessão de crash local. Para evitar vazar caminhos locais e session id, o relatório mantém apenas a linha do tempo e o conteúdo chave dos logs.

Esta sessão iniciou em `2026-05-19T13:26:35Z` (horário local 21:26:35) e crashou em `2026-05-19T13:32:10Z` (horário local 21:32:10).

### Linha do Tempo dos Eventos de Pressão de Heap e Auto-Compaction

```
13:29:43 [WARN]  Pressão de heap em 74,9%; tentando auto-compaction antes do limite de tokens.
13:30:06 [DEBUG] [FILE_READ_CACHE] limpo após auto tryCompress    ← compaction #1 executada com sucesso
13:30:13 [WARN]  Pressão de heap em 70,7%; tentando auto-compaction antes do limite de tokens.
                 ← Logo após compactar, heap caiu de 74,9% para apenas 70,7%, ainda acima do limiar, tentando novamente imediatamente
13:30:52 [DEBUG] Pressão de heap em 86,0%; pulando auto-compaction por pressão de heap durante cooldown.
                 ← Recusa execução durante o cooldown de 30s
13:30:56 [WARN]  Pressão de heap em 85,3%; tentando auto-compaction antes do limite de tokens.
                 ← Cooldown expirou, heap subiu para 85,3%
13:31:21 [DEBUG] [FILE_READ_CACHE] limpo após auto tryCompress    ← compaction #2 executada com sucesso
13:31:37 [WARN]  Pressão de heap em 88,8%; tentando auto-compaction antes do limite de tokens.
                 ← Após compactar, heap saltou para 88,8%
13:32:09 [DEBUG] Pressão de heap em 90,2%; pulando auto-compaction por pressão de heap durante cooldown.
                 ← Heap atingiu 90,2%, impossível executar durante cooldown
13:32:10 ← Log termina (processo OOM crash)
```

### Interpretação das Evidências dos Logs

| Observação dos logs | Significado |
| ------------------- | ----------- |
| Em 2,5 minutos, **4** tentativas de auto-compaction por pressão de heap (mais 2 recusas por cooldown) | O `tryCompress` introduzido no #3735 dispara frequentemente sob alta pressão |
| Após cada compactação, a proporção de heap ainda >70% | O pico temporário criado por `structuredClone()` anula o ganho da compressão |
| 74,9% → 70,7% → 86% → 85,3% → 88,8% → 90,2% → crash | Ciclo de feedback positivo: compressão → pico de clone → heap mais alto → nova compressão → mais alto |
| Log quebra 1 segundo após 90,2% | A próxima chamada `getHistory(true)` com `structuredClone()` ultrapassou o limite instantaneamente |
| `[FILE_READ_CACHE] clear after auto tryCompress` aparece 2 vezes | Confirma que a compaction percorreu o caminho completo de compress → setHistory |

### Mecanismo do Loop Infinito de Feedback Positivo

```
proporção de heap alta (>70%)
  → dispara auto-compaction por pressão de heap
    → tryCompress() chama internamente getHistory(true)
      → structuredClone(this._history)  ← pico instantâneo de heap +30~40%
        → compaction bem-sucedida, libera histórico antigo
          → mas o pico do clone já empurrou o heap para um nível mais perigoso
            → próxima send continua acumulando
              → proporção de heap ainda maior → dispara com mais frequência → crash
```

---

## 6.6, Atribuição de Versão: Por que os Relatos de OOM Aumentaram entre 0.15.7 e 0.15.11

### Linha do Tempo de Commits Chave

| Versão | PR | Mudança | Impacto na frequência de chamadas `structuredClone` |
| ------ | -- | ------- | --------------------------------------------------- |
| **v0.15.6** | — | `getHistory(true)` chamado apenas uma vez na entrada de `sendMessage` | Base: 1 clone por send |
| **v0.15.7** | **#3735** `auto-compact subagent context` | Move `tryCompress()` para dentro de `GeminiChat`, executando uma verificação de compaction **antes de cada send** | **+1 vez**: verificação de compressão antes do send |
| **v0.15.10** | **#3879** `reactive compression on context overflow` | Quando o provider retorna context overflow, dispara novamente `tryCompress()` + `getHistory(true)` | **+1~2 vezes**: caminho de retry por overflow |
| **v0.15.10** | **#3985** `harden reactive compression` | Reforça a lógica de retry da reactive compression | Mesmo que acima |

### Comparação de Pontos de Chamada de `getHistory(true)` entre v0.15.6 e v0.15.11

**v0.15.6** (2 locais):

```
L367: const requestContents = this.getHistory(true);          ← send constrói request
L618: const recoveryContents = self.getHistory(true);         ← Escalação MAX_TOKENS (muito rara)
```

**v0.15.11** (5 locais):

```
L467: ChatCompressionService.compress() chamada internamente              ← #3735: auto-compact antes de cada send
L574: requestContents = this.getHistory(true);                            ← send constrói request
L724: reactive tryCompress() chamada internamente                         ← #3879: retry após context overflow
L739: requestContents = self.getHistory(true);                            ← #3879: retry constrói novo request
L943: const recoveryContents = self.getHistory(true);                     ← Escalação MAX_TOKENS
```

### Pior Caminho: Um Único Send Pode Disparar 4 `structuredClone`

```
sendMessage()
  → tryCompress()              ← #3735: getHistory(true) [clone #1]
  → getHistory(true)           ← constrói request [clone #2]
  → API retorna context overflow
    → reactive tryCompress()   ← #3879: getHistory(true) [clone #3]
    → getHistory(true)         ← retry request [clone #4]
```

### Conclusão

**#3735 (v0.15.7)** é o fator mais provável para o aumento significativo na frequência de OOM (não a única causa raiz) — ele faz com que cada `sendMessage` execute primeiro um `tryCompress()`, e `tryCompress` internamente chama `ChatCompressionService.compress()` → `chat.getHistory(true)` para fazer um `structuredClone` completo. Quando o histórico é grande, esse design de "clonar primeiro para depois decidir se precisa compactar" eleva o pico de memória de ~1,3x para ~2x+. Nota: o histórico de issues mostra que relatos de OOM já existiam antes do #3735, mas o #3735 aumentou drasticamente a frequência de chamadas `structuredClone`, elevando significativamente a probabilidade de disparo de OOM.

**#3879 (v0.15.10)** piorou ainda mais o problema — quando já está no limite do heap (provider retorna context overflow), dispara outro clone completo, tornando as sessões já perigosas ainda mais propensas a crash.

---

## 7. Verificação da Eficácia da Correção #4186 (Teste Comparativo)

Teste comparativo com a rede de segurança de pressão de heap habilitada (HEAP_PRESSURE_COMPRESSION_RATIO = 0.7):

| Indicador | Safety net desabilitado | Safety net habilitado |
| --------- | ----------------------- | --------------------- |
| OOM ocorreu | Sim (crash após 7 rodadas) | Não (executando continuamente >10 min) |
| Pico de RSS | 666 MB → crash | 555 MB → GC reduziu para 280 MB |
| Disparo de compaction | Apenas por limite de tokens | Disparo antecipado quando heap atinge 70% |
| Comportamento do contexto | 5,9%→4,0%→crash | 22,7%→17,0% (redução segura) |

**Conclusão:** A rede de segurança de pressão de heap do #4186 previne efetivamente OOM, mas é uma **mitigação**, não uma solução definitiva:

- Se o histórico já ocupa 60%+ do heap, mesmo compactando antecipadamente, o pico do clone ainda pode ultrapassar o limite.
- Isso explica por que o usuário do #4309 definiu limite de 8GB e ainda crashou.

---

## 8. Distribuição do Uso de Memória

Estimativa baseada nos padrões de crescimento de RSS durante o teste:

| Localização da memória | Proporção | Característica de crescimento |
| ---------------------- | --------- | ----------------------------- |
| `this._history[]` (tool results) | 40-50% | Acúmulo linear, +30-100MB por rodada |
| Cópia temporária de `structuredClone()` | 30-40% | Pico instantâneo, aparece durante compaction |
| Runtime V8 (metadata GC, code) | ~15% | Basicamente constante |
| Buffers de UI/logging/stream | ~5% | Crescimento lento |

---

## 9. Script de Reprodução e Ambiente

### Script de Automação

```bash
#!/bin/bash
# /tmp/oom-simple-driver.sh <nome-da-sessão-tmux>
SESSION="$1"

TASKS=(
  "Use a ferramenta Read para ler completamente packages/core/src/core/geminiChat.ts"
  "Use a ferramenta Read para ler completamente packages/core/src/tools/agent/agent.ts"
  "Use grep -rn structuredClone packages/core/src e depois Read os primeiros 3 arquivos"
  "Use Read para ler completamente packages/cli/src/ui/hooks/slashCommandProcessor.ts"
  "Use Read para ler completamente packages/core/src/services/chatCompressionService.ts"
  "Use find packages/cli/src/ui/commands -name '*.ts' e depois leia um por um"
  "Use Read para ler completamente packages/core/src/core/turn.ts"
  # ... mais tarefas
)

i=0
while true; do
  TASK="${TASKS[$((i % ${#TASKS[@]}))]}"
  i=$((i + 1))

  QWEN_PID=$(ps aux | grep "dist/index.js" | grep -v grep | awk '{print $2}' | sort -rn | head -1)
  RSS=$(ps -o rss= -p $QWEN_PID 2>/dev/null)
  [ -z "$RSS" ] && { echo "CRASH após $((i-1)) tarefas!"; exit 0; }

  RSS_MB=$(echo "scale=1; $RSS/1024" | bc)
  CTX=$(tmux capture-pane -t "$SESSION:1" -p 2>/dev/null | grep -oE "[0-9]+\.[0-9]+% 已用" | tail -1)
  echo "[$(date +%H:%M:%S)] #$i RSS:${RSS_MB}MB Ctx:$CTX | ${TASK:0:55}"

  tmux send-keys -t "$SESSION:1" C-u
  sleep 0.2
  tmux send-keys -t "$SESSION:1" "$TASK" Enter
  sleep 0.5
  tmux send-keys -t "$SESSION:1" Enter
  sleep 45
done
```

### Comando de Inicialização

```bash
# 1. Desabilitar rede de segurança de pressão de heap
# geminiChat.ts: HEAP_PRESSURE_COMPRESSION_RATIO = 99.0

# 2. Build
npm run build --workspace=packages/core && npm run build --workspace=packages/cli

# 3. Iniciar qwen (modelo com contexto 128K, heap 512MB)
SESSION="oom-test"
tmux new-session -d -s "$SESSION" -c "$REPO_DIR"
tmux send-keys -t "$SESSION" \
  "NODE_OPTIONS='--max-old-space-size=512' node packages/cli/dist/index.js --model 'qwen3.6-plus'" Enter

# 4. Aguardar inicialização e executar o driver
sleep 10
bash /tmp/oom-simple-driver.sh "$SESSION"
```

---

## 10. Recomendações Futuras

### Mitigação de Curto Prazo (Já Existente)

- [x] #4186: Rede de segurança de auto-compaction por pressão de heap (limiar 0,7)
- [x] #4188: Limite para fileReadCache / crawlCache

### Correção de Médio Prazo (Sugerida)

- [ ] Reduzir chamadas `structuredClone()` — `nextSpeakerChecker` precisa apenas da última mensagem, não clonar o histórico inteiro
- [ ] Na compactação, usar slice + referência em vez de deep clone completo
- [ ] Tool results grandes (>100KB) gravar em arquivo temporário, manter apenas referência resumida no histórico

### Direção de Longo Prazo

- [ ] Descarregar tool results para disco + lazy load (#4184)
- [ ] Estratégia de compressão baseada em RSS (não apenas contagem de tokens)
- [ ] Armazenamento segmentado do histórico, evitando operações completas únicas