# Modo Headless

O modo headless permite executar o Qwen Code programaticamente a partir de scripts de linha de comando e ferramentas de automação, sem nenhuma interface interativa. Isso é ideal para scripting, automação, pipelines de CI/CD e construção de ferramentas com IA.

## Visão Geral

O modo headless fornece uma interface headless para o Qwen Code que:

- Aceita prompts via argumentos de linha de comando ou stdin
- Retorna saída estruturada (texto ou JSON)
- Suporta redirecionamento de arquivos e piping
- Habilita fluxos de trabalho de automação e scripting
- Fornece códigos de saída consistentes para tratamento de erros
- Pode retomar sessões anteriores com escopo no projeto atual para automação em múltiplas etapas

## Uso Básico

### Prompts Diretos

Use a flag `--prompt` (ou `-p`) para executar no modo headless:

```bash
qwen --prompt "What is machine learning?"
```

### Entrada via Stdin

Envie a entrada via pipe para o Qwen Code pelo seu terminal:

```bash
echo "Explain this code" | qwen
```

### Combinando com Entrada de Arquivo

Leia de arquivos e processe com o Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Retomar Sessões Anteriores (Headless)

Reutilize o contexto de conversas do projeto atual em scripts headless:

```bash
# Continua a sessão mais recente deste projeto e executa um novo prompt
qwen --continue -p "Run the tests again and summarize failures"

# Retoma um ID de sessão específico diretamente (sem UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Os dados da sessão são JSONL com escopo no projeto, localizados em `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaura o histórico de conversas, saídas de ferramentas e checkpoints de compressão de chat antes de enviar o novo prompt.

## Personalizar o Prompt da Sessão Principal

Você pode alterar o prompt do sistema da sessão principal para uma única execução na CLI sem editar arquivos de memória compartilhada.

### Substituir o Prompt do Sistema Integrado

Use `--system-prompt` para substituir o prompt da sessão principal integrado do Qwen Code para a execução atual:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Adicionar Instruções Extras

Use `--append-system-prompt` para manter o prompt integrado e adicionar instruções extras para esta execução:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Você pode combinar ambas as flags quando quiser um prompt base personalizado mais uma instrução extra específica para a execução:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` se aplica apenas à sessão principal da execução atual.
> - Arquivos de memória e contexto carregados, como `QWEN.md`, ainda são anexados após o `--system-prompt`.
> - `--append-system-prompt` é aplicado após o prompt integrado e a memória carregada, e pode ser usado junto com `--system-prompt`.

## Formatos de Saída

O Qwen Code suporta múltiplos formatos de saída para diferentes casos de uso:

### Saída de Texto (Padrão)

Saída padrão legível por humanos:

```bash
qwen -p "What is the capital of France?"
```

Formato da resposta:

```
The capital of France is Paris.
```

### Saída JSON

Retorna dados estruturados como um array JSON. Todas as mensagens são armazenadas em buffer e geradas juntas quando a sessão é concluída. Este formato é ideal para processamento programático e scripts de automação.

A saída JSON é um array de objetos de mensagem. A saída inclui vários tipos de mensagens: mensagens do sistema (inicialização da sessão), mensagens do assistente (respostas da IA) e mensagens de resultado (resumo da execução).

#### Exemplo de Uso

```bash
qwen -p "What is the capital of France?" --output-format json
```

Saída (no final da execução):

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Saída Stream-JSON

O formato Stream-JSON emite mensagens JSON imediatamente à medida que ocorrem durante a execução, permitindo o monitoramento em tempo real. Este formato usa JSON delimitado por linha, onde cada mensagem é um objeto JSON completo em uma única linha.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Saída (streaming à medida que os eventos ocorrem):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Quando combinado com `--include-partial-messages`, eventos de stream adicionais são emitidos em tempo real (message_start, content_block_delta, etc.) para atualizações de UI em tempo real.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Formato de Entrada

O parâmetro `--input-format` controla como o Qwen Code consome a entrada do stdin:

- **`text`** (padrão): Entrada de texto padrão do stdin ou argumentos de linha de comando
- **`stream-json`**: Protocolo de mensagens JSON via stdin para comunicação bidirecional

> **Nota:** O modo de entrada stream-json está atualmente em construção e é destinado à integração com SDK. Requer que `--output-format stream-json` seja definido.

### Redirecionamento de Arquivo

Salve a saída em arquivos ou faça o pipe para outros comandos:

```bash
# Salva em arquivo
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Anexa ao arquivo
qwen -p "Add more details" >> docker-explanation.txt

# Faz pipe para outras ferramentas
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Saída Stream-JSON para processamento em tempo real
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Opções de Configuração

Principais opções de linha de comando para uso headless:

| Option                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                    | Example                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Executar no modo headless                                                                                                                                                                                                                                                                                                                                                                                                      | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Especificar formato de saída (text, json, stream-json)                                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Especificar formato de entrada (text, stream-json)                                                                                                                                                                                                                                                                                                                                                                             | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Incluir mensagens parciais na saída stream-json                                                                                                                                                                                                                                                                                                                                                                                | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Substituir o prompt do sistema da sessão principal para esta execução                                                                                                                                                                                                                                                                                                                                                          | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Adicionar instruções extras ao prompt do sistema da sessão principal para esta execução                                                                                                                                                                                                                                                                                                                                        | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Habilitar o modo de depuração                                                                                                                                                                                                                                                                                                                                                                                                  | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | Desativar todas as personalizações — arquivos de contexto, hooks, extensões, skills, servidores MCP, subagentes personalizados (apenas subagentes integrados são carregados), regras de permissão, substituições de modo de aprovação originadas de configurações, recursos de memória e configurações de sandbox — para isolar problemas; as flags da CLI `--yolo` e `--approval-mode` ainda têm efeito. Consulte [Troubleshooting](../support/troubleshooting). Também pode ser definido via `QWEN_CODE_SAFE_MODE=true`. | `qwen -p "query" --safe-mode`                                            |
| `--all-files`, `-a`          | Incluir todos os arquivos no contexto                                                                                                                                                                                                                                                                                                                                                                                          | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Incluir diretórios adicionais                                                                                                                                                                                                                                                                                                                                                                                                  | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Aprovar automaticamente todas as ações                                                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Definir o modo de aprovação                                                                                                                                                                                                                                                                                                                                                                                                    | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Retomar a sessão mais recente para este projeto                                                                                                                                                                                                                                                                                                                                                                                | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Retomar uma sessão específica (ou escolher interativamente)                                                                                                                                                                                                                                                                                                                                                                    | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | Limitar o número de turnos de usuário/modelo/ferramenta na execução                                                                                                                                                                                                                                                                                                                                                            | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Orçamento de tempo real (wall-clock); aceita `90` (s), `30s`, `5m`, `1h`, `1.5h`                                                                                                                                                                                                                                                                                                                                               | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Orçamento cumulativo de chamadas de ferramentas para a execução                                                                                                                                                                                                                                                                                                                                                                | `qwen -p "..." --max-tool-calls 50`                                      |

Para detalhes completos sobre todas as opções de configuração disponíveis, arquivos de configurações e variáveis de ambiente, consulte o [Guia de Configuração](../configuration/settings).

## Segurança em execuções não supervisionadas

Execuções headless / de CI combinadas com `--yolo` (ou `--approval-mode=yolo`) aprovam automaticamente cada chamada de ferramenta, incluindo `shell`, `write` e `edit`. **`--yolo` não habilita um sandbox** — essas ferramentas são executadas no nível de privilégio do processo host. Quando o Qwen Code detecta essa combinação sem um sandbox configurado, ele imprime um aviso de uma linha no stderr na inicialização. Suprima o aviso com `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` depois de avaliar os trade-offs.

### Orçamentos no nível da execução

O Qwen Code pode abortar uma execução não supervisionada quando ultrapassa um dos seguintes limites. Cada um é `-1` (ilimitado) por padrão; definir qualquer um deles é suficiente para limitar comportamentos descontrolados. Eles são aplicados cooperativamente contra o mesmo `AbortController` que já carrega o SIGINT, então um aborto por orçamento emite um `FatalBudgetExceededError` estruturado (código de saída **55**) — distinto do código de saída de limite de turnos 53 e do 130 do SIGINT, para que os scripts de CI possam ramificar com base no motivo.

| Flag                  | Settings key               | What it bounds                                                                                                                                                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | Duração em tempo real (wall-clock) de toda a execução. A flag aceita `90` (s), `30s`, `5m`, `1h`, `1.5h` (unidades fracionárias suportadas). Mínimo de 1s — valores abaixo de um segundo são rejeitados como erros de digitação. A configuração é em segundos.               |
| `--max-tool-calls`    | `model.maxToolCalls`       | Chamadas de ferramentas de nível superior cumulativas despachadas pelo loop de execução principal (conta sucessos _e_ falhas — o modelo ainda consome tokens em erros). Consulte "Escopo" abaixo para isenções de subagente / saída estruturada. |
| `--max-session-turns` | `model.maxSessionTurns`    | Número de turnos de usuário/modelo/ferramenta; pré-existente. Sai com o código 53 em caso de excesso (distinto da saída por orçamento 55).                                                                                                  |

#### Escopo

- **`--max-tool-calls` conta apenas despachos de nível superior.** Quando o modelo chama a ferramenta `agent`, o despacho conta como **1**; as chamadas de ferramentas internas realizadas pelo subagente gerado **não** são contadas. Um modelo que canaliza o trabalho através de subagentes pode realizar um trabalho interno ilimitado sob um pequeno orçamento de nível superior. Combine com `--exclude-tools agent` se precisar de um limite mais restrito.
- **`structured_output` é isento de `--max-tool-calls`.** Sob `--json-schema`, a chamada terminal `structured_output` do modelo é o contrato de "terminei", não um trabalho real — não conta contra `--max-tool-calls` para que uma conclusão no limite do orçamento não seja abortada como um falso positivo. A isenção é incondicional (incluindo validações Ajv com falha), então um modelo preso em um loop de repetição de saída malformada NÃO é limitado por `--max-tool-calls`; combine com `--max-session-turns` ou `--max-wall-time` para limitar as repetições.
- **`structured_output` NÃO é isento de `--max-session-turns`.** Esse contador é pré-existente e incrementa a cada turno, incluindo o contrato terminal. Dimensione `--max-session-turns` para `N+1` se quiser permitir `N` turnos de trabalho real sob `--json-schema`.
- **Single-shot vs `--input-format stream-json`:** no modo de entrada stream-json, o daemon redefine os contadores de orçamento no início de cada mensagem do usuário; o orçamento é por mensagem, não por processo.
- **Sessões `qwen serve` / ACP:** o caminho da sessão ACP do daemon atualmente NÃO consulta `--max-wall-time` / `--max-tool-calls` do settings.json. Esses orçamentos se aplicam apenas a execuções single-shot `qwen -p` e a sessões `--input-format stream-json`. (`qwen serve` emite o aviso de YOLO-sem-sandbox na inicialização se `tools.approvalMode: 'yolo'` estiver definido nas configurações.)
### Combinações recomendadas

- **Ambiente confiável e isolado (runner de CI efêmero, contêiner):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Defina um orçamento de turnos e um orçamento de tempo total de execução para que um agente travado não consuma rapidamente seus minutos de CI, e capture `--output-format json` para uso pós-execução / auditoria de chamadas de ferramentas.
- **Máquina local ou infraestrutura compartilhada:** passe também `--sandbox` (ou defina `QWEN_SANDBOX=1`) para que as ferramentas de shell / write / edit sejam executadas dentro da imagem do sandbox.
- **CI de longa duração com retry-on-rate-limit:** combine `QWEN_CODE_UNATTENDED_RETRY=1` com `--max-wall-time`. A variável de ambiente de retry mantém a execução ativa após respostas transitórias 429 / 529; o orçamento de tempo total garante que um provedor com falha persistente não possa estender o job indefinidamente.
- **Auditoria / exploração limitada:** para tarefas somente leitura, `--max-tool-calls 25` limita o quão agressivamente o modelo pode usar grep / read. Combine com `--exclude-tools shell,write,edit` para tornar o limite significativo.

## Exemplos

### Revisão de código

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Gerar mensagens de commit

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentação da API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Análise de código em lote

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### Revisão de código de PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Análise de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Geração de release notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Rastreamento de uso de modelos e ferramentas

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Modo de Retry Persistente

Quando o Qwen Code é executado em pipelines de CI/CD ou como um daemon em background, uma breve falha na API (limitação de taxa ou sobrecarga) não deve interromper uma tarefa de várias horas. O **modo de retry persistente** faz com que o Qwen Code tente novamente erros transitórios de API indefinidamente até que o serviço seja recuperado.

### Como funciona

- **Apenas erros transitórios**: HTTP 429 (Rate Limit) e 529 (Overloaded) são submetidos a retry indefinidamente. Outros erros (400, 500, etc.) ainda falham normalmente.
- **Exponential backoff com limite**: Os atrasos de retry crescem exponencialmente, mas são limitados a **5 minutos** por retry.
- **Heartbeat keepalive**: Durante longas esperas, uma linha de status é impressa no stderr a cada **30 segundos** para evitar que os runners de CI encerrem o processo por inatividade.
- **Degradação graciosa**: Erros não transitórios e o modo interativo não são afetados.

### Ativação

Defina a variável de ambiente `QWEN_CODE_UNATTENDED_RETRY` como `true` ou `1` (correspondência estrita, diferencia maiúsculas de minúsculas):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> O retry persistente requer uma **adesão explícita**. Apenas `CI=true` **não** o ativa — transformar silenciosamente um job de CI de falha rápida em um job de espera infinita seria perigoso. Sempre defina `QWEN_CODE_UNATTENDED_RETRY` explicitamente na configuração do seu pipeline.

### Exemplos

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### Processamento em lote noturno

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### Daemon em background

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Monitoramento

Durante o retry persistente, mensagens de heartbeat são impressas no **stderr**:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Essas mensagens mantêm os runners de CI ativos e permitem que você monitore o progresso. Elas não aparecem no stdout, portanto, a saída JSON canalizada para outras ferramentas permanece limpa.

## Recursos

- [Configuração da CLI](../configuration/settings#command-line-arguments) - Guia completo de configuração
- [Autenticação](../configuration/auth.md) - Configurar autenticação
- [Comandos](../features/commands) - Referência de comandos interativos
- [Tutoriais](../quickstart) - Guias de automação passo a passo