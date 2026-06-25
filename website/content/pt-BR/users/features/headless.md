# Modo Headless

O modo headless permite executar o Qwen Code programaticamente a partir de scripts de linha de comando e ferramentas de automação sem qualquer interface interativa. É ideal para scripts, automação, pipelines de CI/CD e criação de ferramentas baseadas em IA.

## Visão Geral

O modo headless fornece uma interface headless para o Qwen Code que:

- Aceita prompts via argumentos de linha de comando ou stdin
- Retorna saída estruturada (texto ou JSON)
- Suporta redirecionamento de arquivos e pipes
- Permite fluxos de automação e scripts
- Fornece códigos de saída consistentes para tratamento de erros
- Pode retomar sessões anteriores com escopo no projeto atual para automação de múltiplas etapas

## Uso Básico

### Prompts Diretos

Use a flag `--prompt` (ou `-p`) para executar em modo headless:

```bash
qwen --prompt "What is machine learning?"
```

### Entrada via stdin

Envie entrada para o Qwen Code pelo terminal:

```bash
echo "Explain this code" | qwen
```

### Combinando com entrada de arquivos

Leia de arquivos e processe com o Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Retomar Sessões Anteriores (Headless)

Reutilize o contexto da conversa do projeto atual em scripts headless:

```bash
# Continue a sessão mais recente deste projeto e execute um novo prompt
qwen --continue -p "Run the tests again and summarize failures"

# Retome um ID de sessão específico diretamente (sem interface)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Os dados da sessão são JSONL com escopo de projeto em `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaura o histórico da conversa, saídas de ferramentas e checkpoints de compressão de chat antes de enviar o novo prompt.

## Personalizar o Prompt da Sessão Principal

Você pode alterar o prompt de sistema da sessão principal para uma única execução da CLI sem editar arquivos de memória compartilhados.

### Substituir o Prompt de Sistema Integrado

Use `--system-prompt` para substituir o prompt integrado da sessão principal do Qwen Code na execução atual:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Anexar Instruções Extras

Use `--append-system-prompt` para manter o prompt integrado e adicionar instruções extras para esta execução:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Você pode combinar ambas as flags quando desejar um prompt base personalizado mais uma instrução extra específica para a execução:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` se aplica apenas à sessão principal da execução atual.
> - Arquivos de memória e contexto carregados, como `QWEN.md`, ainda são anexados após `--system-prompt`.
> - `--append-system-prompt` é aplicado após o prompt integrado e a memória carregada, e pode ser usado junto com `--system-prompt`.

## Formatos de Saída

O Qwen Code suporta múltiplos formatos de saída para diferentes casos de uso:

### Saída em Texto (Padrão)

Saída padrão legível por humanos:

```bash
qwen -p "What is the capital of France?"
```

Formato da resposta:

```
The capital of France is Paris.
```

### Saída JSON

Retorna dados estruturados como um array JSON. Todas as mensagens são armazenadas em buffer e exibidas juntas quando a sessão é concluída. Este formato é ideal para processamento programático e scripts de automação.

A saída JSON é um array de objetos de mensagem. A saída inclui múltiplos tipos de mensagem: mensagens de sistema (inicialização da sessão), mensagens de assistente (respostas da IA) e mensagens de resultado (resumo da execução).

#### Exemplo de Uso

```bash
qwen -p "What is the capital of France?" --output-format json
```

Saída (ao final da execução):

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

O formato Stream-JSON emite mensagens JSON imediatamente conforme ocorrem durante a execução, permitindo monitoramento em tempo real. Este formato usa JSON delimitado por linha, onde cada mensagem é um objeto JSON completo em uma única linha.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Saída (streaming conforme os eventos ocorrem):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```
Quando combinado com `--include-partial-messages`, eventos de stream adicionais são emitidos em tempo real (message_start, content_block_delta, etc.) para atualizações de UI em tempo real.

```bash
qwen -p "Escreva um script Python" --output-format stream-json --include-partial-messages
```

### Formato de Entrada

O parâmetro `--input-format` controla como o Qwen Code consome entrada da entrada padrão:

- **`text`** (padrão): Entrada de texto padrão via stdin ou argumentos de linha de comando
- **`stream-json`**: Protocolo de mensagens JSON via stdin para comunicação bidirecional

> **Nota:** O modo de entrada stream-json está atualmente em construção e é destinado para integração com SDK. Ele requer que `--output-format stream-json` esteja definido.

### Redirecionamento de Arquivo

Salve a saída em arquivos ou encadeie com outros comandos:

```bash
# Salvar em arquivo
qwen -p "Explique Docker" > explicacao-docker.txt
qwen -p "Explique Docker" --output-format json > explicacao-docker.json

# Anexar a arquivo
qwen -p "Adicione mais detalhes" >> explicacao-docker.txt

# Encadear com outras ferramentas
qwen -p "O que é Kubernetes?" --output-format json | jq '.response'
qwen -p "Explique microsserviços" | wc -w
qwen -p "Liste linguagens de programação" | grep -i "python"

# Saída Stream-JSON para processamento em tempo real
qwen -p "Explique Docker" --output-format stream-json | jq '.type'
qwen -p "Escreva código" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Opções de Configuração

Principais opções de linha de comando para uso headless:

| Opção                         | Descrição                                                                   | Exemplo                                                                  |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`              | Executar em modo headless                                                   | `qwen -p "consulta"`                                                     |
| `--output-format`, `-o`       | Especificar formato de saída (text, json, stream-json)                      | `qwen -p "consulta" --output-format json`                                |
| `--input-format`              | Especificar formato de entrada (text, stream-json)                          | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages`  | Incluir mensagens parciais na saída stream-json                             | `qwen -p "consulta" --output-format stream-json --include-partial-messages` |
| `--system-prompt`             | Substituir o prompt de sistema da sessão principal para esta execução       | `qwen -p "consulta" --system-prompt "Você é um revisor conciso."`        |
| `--append-system-prompt`      | Adicionar instruções extras ao prompt de sistema da sessão principal        | `qwen -p "consulta" --append-system-prompt "Concentre-se em descobertas concretas."` |
| `--debug`, `-d`               | Ativar modo de depuração                                                    | `qwen -p "consulta" --debug`                                             |
| `--all-files`, `-a`           | Incluir todos os arquivos no contexto                                       | `qwen -p "consulta" --all-files`                                         |
| `--include-directories`       | Incluir diretórios adicionais                                               | `qwen -p "consulta" --include-directories src,docs`                      |
| `--yolo`, `-y`                | Aprovar automaticamente todas as ações                                      | `qwen -p "consulta" --yolo`                                              |
| `--approval-mode`             | Definir modo de aprovação                                                   | `qwen -p "consulta" --approval-mode auto_edit`                           |
| `--continue`                  | Retomar a sessão mais recente para este projeto                             | `qwen --continue -p "Continuar de onde paramos"`                         |
| `--resume [sessionId]`        | Retomar uma sessão específica (ou escolher interativamente)                 | `qwen --resume 123e... -p "Finalizar a refatoração"`                     |
| `--max-session-turns`         | Limitar o número de turnos usuário/modelo/ferramenta na execução            | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`             | Orçamento de tempo real; aceita `90` (s), `30s`, `5m`, `1h`, `1.5h`         | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`            | Orçamento cumulativo de chamadas de ferramenta para a execução              | `qwen -p "..." --max-tool-calls 50`                                      |

Para detalhes completos sobre todas as opções de configuração disponíveis, arquivos de configuração e variáveis de ambiente, consulte o [Guia de Configuração](../configuration/settings).

## Segurança em execuções não monitoradas

Execuções headless / CI combinadas com `--yolo` (ou `--approval-mode=yolo`) aprovam automaticamente todas as chamadas de ferramenta, incluindo `shell`, `write` e `edit`. **`--yolo` não ativa um sandbox** — essas ferramentas executam no nível de privilégio do processo hospedeiro. Quando o Qwen Code detecta essa combinação sem um sandbox configurado, ele imprime um aviso de uma linha no stderr na inicialização. Suprima o aviso com `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` depois de revisar a compensação.
### Limites de execução

O Qwen Code pode abortar uma execução não supervisionada quando ela ultrapassa um dos seguintes limites. Cada um é `-1` (ilimitado) por padrão; definir qualquer um é suficiente para conter comportamentos descontrolados. Eles são aplicados de forma cooperativa contra o mesmo `AbortController` que já carrega o SIGINT, portanto um aborto por limite emite um `FatalBudgetExceededError` estruturado (código de saída **55**) — distinto do código de saída do limite de turnos 53 e do 130 do SIGINT, para que scripts de CI possam ramificar com base no motivo.

| Flag                  | Chave de configuração      | O que limita                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | Duração em tempo real de toda a execução. A flag aceita `90` (s), `30s`, `5m`, `1h`, `1.5h` (unidades fracionárias suportadas). Mínimo de 1s — valores abaixo de segundos são rejeitados como erros de digitação. A configuração é em segundos.                                             |
| `--max-tool-calls`    | `model.maxToolCalls`       | Chamadas de ferramenta de nível superior acumuladas despachadas pelo loop principal de execução (conta _sucessos e falhas_ — o modelo ainda consome tokens em erros). Veja "Escopo" abaixo para isenções de subagente / saída estruturada.                                                |
| `--max-session-turns` | `model.maxSessionTurns`    | Número de turnos de usuário/modelo/ferramenta; pré-existente. Sai com código 53 ao ser excedido (distinto do código de saída 55 de limite de orçamento).                                                                                                                                  |

#### Escopo

- **`--max-tool-calls` conta apenas despachos de nível superior.** Quando o modelo chama a ferramenta `agent`, o despacho conta como **1**; chamadas de ferramenta internas realizadas pelo subagente gerado **não** são contadas. Um modelo que canaliza trabalho através de subagentes pode fazer trabalho interno ilimitado sob um pequeno orçamento de nível superior. Combine com `--exclude-tools agent` se precisar de um limite mais restrito.
- **`structured_output` está isento de `--max-tool-calls`.** Sob `--json-schema`, a chamada terminal `structured_output` do modelo é o contrato "terminei", não trabalho real — ela não conta contra `--max-tool-calls` para que uma conclusão no limite do orçamento não seja abortada como um falso positivo. A isenção é incondicional (incluindo validações Ajv falhas), portanto um modelo preso em um loop de repetição de saída malformada **não** é limitado por `--max-tool-calls`; combine com `--max-session-turns` ou `--max-wall-time` para limitar repetições.
- **`structured_output` NÃO está isento de `--max-session-turns`.** Esse contador é pré-existente e incrementa a cada turno, incluindo o contrato terminal. Defina `--max-session-turns` como `N+1` se quiser permitir `N` turnos de trabalho real sob `--json-schema`.
- **Execução única vs `--input-format stream-json`:** no modo de entrada stream-json, o daemon redefine os contadores de orçamento no início de cada mensagem do usuário; o orçamento é por mensagem, não por processo.
- **`qwen serve` / sessões ACP:** o caminho de sessão ACP do daemon **não** consulta atualmente `--max-wall-time` / `--max-tool-calls` do settings.json. Esses orçamentos se aplicam apenas a execuções únicas `qwen -p` e a sessões `--input-format stream-json`. (`qwen serve` emite o aviso YOLO-sem-sandbox na inicialização se `tools.approvalMode: 'yolo'` estiver definido nas configurações.)

### Combinações recomendadas

- **Ambiente confiável e isolado (runner CI efêmero, contêiner):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Defina um orçamento de turnos e um orçamento de tempo real para que um agente travado não queime seus minutos de CI, e capture `--output-format json` para auditoria de uso/chamadas de ferramenta pós-execução.
- **Máquina local ou infraestrutura compartilhada:** também passe `--sandbox` (ou defina `QWEN_SANDBOX=1`) para que as ferramentas shell/write/edit sejam executadas dentro da imagem sandbox.
- **CI de longa duração com repetição em limite de taxa:** combine `QWEN_CODE_UNATTENDED_RETRY=1` com `--max-wall-time`. A variável de ambiente de repetição mantém a execução ativa além de respostas transitórias 429/529; o orçamento de tempo real garante que um provedor com falha persistente não possa estender o trabalho indefinidamente.
- **Auditoria/exploração limitada:** para tarefas somente leitura, `--max-tool-calls 25` limita o quão agressivamente o modelo pode usar grep/ler. Combine com `--exclude-tools shell,write,edit` para tornar o limite significativo.

## Exemplos

### Revisão de código

```bash
cat src/auth.py | qwen -p "Revise este código de autenticação em busca de problemas de segurança" > security-review.txt
```

### Gerar mensagens de commit

```bash
result=$(git diff --cached | qwen -p "Escreva uma mensagem de commit concisa para estas alterações" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentação de API

```bash
result=$(cat api/routes.js | qwen -p "Gere especificação OpenAPI para estas rotas" --output-format json)
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

### Revisão de código em PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Análise de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Geração de notas de versão

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Rastreamento de uso do modelo e ferramentas

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

## Modo de Retentativa Persistente

Quando o Qwen Code é executado em pipelines CI/CD ou como um daemon em segundo plano, uma breve interrupção da API (limitação de taxa ou sobrecarga) não deve interromper uma tarefa que levaria horas. O **modo de retentativa persistente** faz com que o Qwen Code tente novamente erros transitórios da API indefinidamente até que o serviço se recupere.

### Como funciona

- **Apenas erros transitórios**: HTTP 429 (Limite de Taxa) e 529 (Sobrecarregado) são repetidos indefinidamente. Outros erros (400, 500, etc.) ainda falham normalmente.
- **Backoff exponencial com limite**: Os atrasos das retentativas crescem exponencialmente, mas são limitados a **5 minutos** por retentativa.
- **Keepalive com heartbeat**: Durante longas esperas, uma linha de status é impressa no stderr a cada **30 segundos** para evitar que executores CI matem o processo por inatividade.
- **Degradação gradual**: Erros não transitórios e o modo interativo não são afetados.

### Ativação

Defina a variável de ambiente `QWEN_CODE_UNATTENDED_RETRY` como `true` ou `1` (correspondência estrita, sensível a maiúsculas/minúsculas):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> A retentativa persistente exige uma **aceitação explícita**. Apenas `CI=true` **não** a ativa — transformar silenciosamente um job CI de falha rápida em uma espera infinita seria perigoso. Sempre defina `QWEN_CODE_UNATTENDED_RETRY` explicitamente na configuração do seu pipeline.

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

#### Daemon em segundo plano

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Monitoramento

Durante a retentativa persistente, mensagens de heartbeat são impressas no **stderr**:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Essas mensagens mantêm os executores CI ativos e permitem acompanhar o progresso. Elas não aparecem no stdout, portanto a saída JSON canalizada para outras ferramentas permanece limpa.

## Recursos

- [Configuração da CLI](../configuration/settings#command-line-arguments) - Guia completo de configuração
- [Autenticação](../configuration/auth.md) - Configure a autenticação
- [Comandos](../features/commands) - Referência de comandos interativos
- [Tutoriais](../quickstart) - Guias passo a passo de automação
