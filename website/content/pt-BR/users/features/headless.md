# Modo Headless

O modo headless permite executar o Qwen Code de forma programática a partir de scripts de linha de comando e ferramentas de automação, sem nenhuma interface interativa. Isso é ideal para scripting, automação, pipelines de CI/CD e criação de ferramentas com IA.

## Visão Geral

O modo headless fornece uma interface para o Qwen Code que:

- Aceita prompts via argumentos de linha de comando ou stdin
- Retorna saída estruturada (texto ou JSON)
- Suporta redirecionamento de arquivos e piping
- Permite fluxos de trabalho de automação e scripting
- Fornece códigos de saída consistentes para tratamento de erros
- Pode retomar sessões anteriores com escopo no projeto atual para automação em múltiplas etapas

## Uso Básico

### Prompts Diretos

Use a flag `--prompt` (ou `-p`) para executar no modo headless:

```bash
qwen --prompt "What is machine learning?"
```

### Entrada via Stdin

Envie entrada para o Qwen Code a partir do seu terminal:

```bash
echo "Explain this code" | qwen
```

### Combinando com Entrada de Arquivo

Leia arquivos e processe com o Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Retomar Sessões Anteriores (Headless)

Reutilize o contexto de conversa do projeto atual em scripts headless:

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Os dados da sessão são JSONL com escopo de projeto em `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaura o histórico de conversas, saídas de ferramentas e checkpoints de compressão de chat antes de enviar o novo prompt.

## Personalizar o Prompt Principal da Sessão

Você pode alterar o prompt de sistema da sessão principal para uma única execução via CLI sem editar arquivos de memória compartilhada.

### Substituir o Prompt de Sistema Integrado

Use `--system-prompt` para substituir o prompt de sessão principal integrado do Qwen Code na execução atual:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Anexar Instruções Extras

Use `--append-system-prompt` para manter o prompt integrado e adicionar instruções extras para esta execução:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Você pode combinar ambas as flags quando quiser um prompt base personalizado mais uma instrução específica para a execução:

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

### Saída em JSON

Retorna dados estruturados como um array JSON. Todas as mensagens são armazenadas em buffer e exibidas juntas quando a sessão é concluída. Este formato é ideal para processamento programático e scripts de automação.

A saída JSON é um array de objetos de mensagem. A saída inclui vários tipos de mensagem: mensagens do sistema (inicialização da sessão), mensagens do assistente (respostas da IA) e mensagens de resultado (resumo da execução).

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

Quando combinado com `--include-partial-messages`, eventos de stream adicionais são emitidos em tempo real (`message_start`, `content_block_delta`, etc.) para atualizações de UI em tempo real.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Formato de Entrada

O parâmetro `--input-format` controla como o Qwen Code consome a entrada da entrada padrão:

- **`text`** (padrão): Entrada de texto padrão via stdin ou argumentos de linha de comando
- **`stream-json`**: Protocolo de mensagens JSON via stdin para comunicação bidirecional

> **Nota:** O modo de entrada stream-json está atualmente em desenvolvimento e destina-se à integração com SDK. É necessário definir `--output-format stream-json`.

### Redirecionamento de Arquivo

Salve a saída em arquivos ou faça pipe para outros comandos:

```bash
# Save to file
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Append to file
qwen -p "Add more details" >> docker-explanation.txt

# Pipe to other tools
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON output for real-time processing
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Opções de Configuração

Principais opções de linha de comando para uso headless:

| Option                       | Description                                                              | Example                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Executa no modo headless                                                 | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Especifica o formato de saída (text, json, stream-json)                  | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Especifica o formato de entrada (text, stream-json)                      | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Inclui mensagens parciais na saída stream-json                           | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Substitui o prompt de sistema da sessão principal para esta execução     | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Anexa instruções extras ao prompt de sistema da sessão principal para esta execução | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Ativa o modo debug                                                       | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Inclui todos os arquivos no contexto                                     | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Inclui diretórios adicionais                                             | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Aprova automaticamente todas as ações                                    | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Define o modo de aprovação                                               | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Retoma a sessão mais recente para este projeto                           | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Retoma uma sessão específica (ou escolhe interativamente)                | `qwen --resume 123e... -p "Finish the refactor"`                         |

Para detalhes completos sobre todas as opções de configuração disponíveis, arquivos de configuração e variáveis de ambiente, consulte o [Guia de Configuração](../configuration/settings).

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

### Documentação de API

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

### Geração de notas de versão

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Rastreamento de uso de modelo e ferramentas

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

Quando o Qwen Code é executado em pipelines de CI/CD ou como um daemon em segundo plano, uma breve indisponibilidade da API (limitação de taxa ou sobrecarga) não deve interromper uma tarefa de várias horas. O **modo de retentativa persistente** faz com que o Qwen Code retente erros transitórios da API indefinidamente até que o serviço se recupere.

### Como funciona

- **Apenas erros transitórios**: HTTP 429 (Rate Limit) e 529 (Overloaded) são retentados indefinidamente. Outros erros (400, 500, etc.) ainda falham normalmente.
- **Backoff exponencial com limite**: Os atrasos de retentativa crescem exponencialmente, mas são limitados a **5 minutos** por retentativa.
- **Keepalive de heartbeat**: Durante esperas longas, uma linha de status é impressa no stderr a cada **30 segundos** para evitar que os runners de CI encerrem o processo por inatividade.
- **Degradação graciosa**: Erros não transitórios e o modo interativo permanecem completamente inalterados.

### Ativação

Defina a variável de ambiente `QWEN_CODE_UNATTENDED_RETRY` como `true` ou `1` (correspondência estrita, case-sensitive):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> A retentativa persistente requer um **opt-in explícito**. `CI=true` sozinho **não** a ativa — transformar silenciosamente um job de CI com falha rápida em um job de espera infinita seria perigoso. Sempre defina `QWEN_CODE_UNATTENDED_RETRY` explicitamente na configuração do seu pipeline.

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

Essas mensagens mantêm os runners de CI ativos e permitem monitorar o progresso. Elas não aparecem no stdout, então a saída JSON enviada para outras ferramentas permanece limpa.

## Recursos

- [Configuração da CLI](../configuration/settings#command-line-arguments) - Guia completo de configuração
- [Autenticação](../configuration/settings#environment-variables-for-api-access) - Configurar autenticação
- [Comandos](../features/commands) - Referência de comandos interativos
- [Tutoriais](../quickstart) - Guias de automação passo a passo