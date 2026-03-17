# Modo sem Interface Gráfica (Headless)

O modo sem interface gráfica permite executar o Qwen Code programaticamente a partir de scripts de linha de comando e ferramentas de automação, sem nenhuma interface interativa. Isso é ideal para scripts, automação, pipelines de CI/CD e construção de ferramentas impulsionadas por IA.

## Visão Geral

O modo headless fornece uma interface sem interface gráfica para o Qwen Code que:

- Aceita prompts por meio de argumentos da linha de comando ou da entrada padrão (stdin)
- Retorna saída estruturada (texto ou JSON)
- Suporta redirecionamento de arquivos e *piping*
- Habilita fluxos de trabalho de automação e script
- Fornece códigos de saída consistentes para tratamento de erros
- Pode retomar sessões anteriores limitadas ao projeto atual, para automação em várias etapas

## Uso Básico

### Prompts Diretos

Use a flag `--prompt` (ou `-p`) para executar no modo headless:

```bash
qwen --prompt "O que é aprendizado de máquina?"
```

### Entrada via Stdin

Redirecione entrada para o Qwen Code diretamente do seu terminal:

```bash
echo "Explique este código" | qwen
```

### Combinação com Entrada de Arquivo

Leia de arquivos e processe com o Qwen Code:

```bash
cat README.md | qwen --prompt "Resuma esta documentação"
```

### Retomar Sessões Anteriores (Sem Interface Gráfica)

Reutilize o contexto da conversa do projeto atual em scripts sem interface gráfica:

```bash

# Continue a sessão mais recente deste projeto e execute um novo prompt
qwen --continue -p "Execute novamente os testes e resuma as falhas"

# Retome diretamente uma sessão específica pelo ID (sem interface gráfica)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Aplique a refatoração subsequente"
```

> [!note]
>
> - Os dados das sessões são armazenados em formato JSONL, por projeto, em `~/.qwen/projects/<cwd-sanitizada>/chats`.
> - Restaura o histórico da conversa, as saídas das ferramentas e os pontos de verificação de compactação do chat antes de enviar o novo prompt.

## Formatos de Saída

O Qwen Code suporta múltiplos formatos de saída para diferentes casos de uso:

### Saída de Texto (Padrão)

Saída legível por humanos:

```bash
qwen -p "Qual é a capital da França?"
```

Formato da resposta:

```
A capital da França é Paris.
```

### Saída em JSON

Retorna dados estruturados como um array JSON. Todas as mensagens são armazenadas em buffer e emitidas juntas ao final da sessão. Esse formato é ideal para processamento programático e scripts de automação.

A saída em JSON é um array de objetos de mensagem. A saída inclui vários tipos de mensagem: mensagens do sistema (inicialização da sessão), mensagens do assistente (respostas da IA) e mensagens de resultado (resumo da execução).

#### Exemplo de Uso

```bash
qwen -p "Qual é a capital da França?" --output-format json
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
          "text": "A capital da França é Paris."
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
    "result": "A capital da França é Paris.",
    "usage": {...}
  }
]
```

### Saída Stream-JSON

O formato Stream-JSON emite mensagens JSON imediatamente conforme ocorrem durante a execução, permitindo monitoramento em tempo real. Esse formato usa JSON delimitado por linhas, em que cada mensagem é um objeto JSON completo em uma única linha.

```bash
qwen -p "Explique TypeScript" --output-format stream-json
```

Saída (transmitida em tempo real conforme os eventos ocorrem):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Quando combinado com `--include-partial-messages`, eventos adicionais de transmissão são emitidos em tempo real (como `message_start`, `content_block_delta`, etc.) para atualizações em tempo real da interface do usuário.

```bash
qwen -p "Escreva um script Python" --output-format stream-json --include-partial-messages
```

### Formato de Entrada

O parâmetro `--input-format` controla como o Qwen Code consome entrada da entrada padrão (stdin):

- **`text`** (padrão): Entrada de texto padrão da stdin ou de argumentos da linha de comando  
- **`stream-json`**: Protocolo de mensagens JSON via stdin para comunicação bidirecional

> **Observação:** O modo de entrada `stream-json` está atualmente em desenvolvimento e destina-se à integração com SDKs. Exige que `--output-format stream-json` também seja definido.

### Redirecionamento de Arquivos

Salve a saída em arquivos ou redirecione-a para outros comandos:

```bash

# Salvar em arquivo
qwen -p "Explique o Docker" > docker-explanation.txt
qwen -p "Explique o Docker" --output-format json > docker-explanation.json

# Acrescentar ao arquivo
qwen -p "Adicione mais detalhes" >> docker-explanation.txt

# Redirecionar para outras ferramentas
qwen -p "O que é Kubernetes?" --output-format json | jq '.response'
qwen -p "Explique microsserviços" | wc -w
qwen -p "Liste linguagens de programação" | grep -i "python"

# Saída Stream-JSON para processamento em tempo real
qwen -p "Explique o Docker" --output-format stream-json | jq '.type'
qwen -p "Escreva um código" --output-format stream-json --include-partial-messages | jq '.event.type'

## Opções de Configuração

Principais opções de linha de comando para uso sem interface gráfica:

| Opção                        | Descrição                                           | Exemplo                                                                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Executar em modo sem interface gráfica              | `qwen -p "consulta"`                                                     |
| `--output-format`, `-o`      | Especificar o formato de saída (text, json, stream-json) | `qwen -p "consulta" --output-format json`                                |
| `--input-format`             | Especificar o formato de entrada (text, stream-json)    | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Incluir mensagens parciais na saída stream-json   | `qwen -p "consulta" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Habilitar o modo de depuração                       | `qwen -p "consulta" --debug`                                             |
| `--all-files`, `-a`          | Incluir todos os arquivos no contexto               | `qwen -p "consulta" --all-files`                                        |
| `--include-directories`      | Incluir diretórios adicionais                       | `qwen -p "consulta" --include-directories src,docs`                      |
| `--yolo`, `-y`               | Aprovar automaticamente todas as ações              | `qwen -p "consulta" --yolo`                                              |
| `--approval-mode`            | Definir o modo de aprovação                         | `qwen -p "consulta" --approval-mode auto_edit`                           |
| `--continue`                 | Retomar a sessão mais recente deste projeto         | `qwen --continue -p "Retomar de onde paramos"`                           |
| `--resume [sessionId]`       | Retomar uma sessão específica (ou escolher interativamente) | `qwen --resume 123e... -p "Concluir a refatoração"`                      |

Para obter detalhes completos sobre todas as opções de configuração disponíveis, arquivos de configuração e variáveis de ambiente, consulte o [Guia de Configuração](../configuration/settings).

## Exemplos

### Revisão de código

```bash
cat src/auth.py | qwen -p "Revise este código de autenticação quanto a problemas de segurança" > security-review.txt
```

### Gerar mensagens de commit

```bash
result=$(git diff --cached | qwen -p "Escreva uma mensagem de commit concisa para essas alterações" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentação de API

```bash
result=$(cat api/routes.js | qwen -p "Gere uma especificação OpenAPI para essas rotas" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Análise em lote de código

```bash
for file in src/*.py; do
    echo "Analisando $file..."
    result=$(cat "$file" | qwen -p "Identifique possíveis bugs e sugira melhorias" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Análise concluída para $(basename "$file")" >> reports/progress.log
done
```

### Revisão de código de PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Revise essas alterações em busca de bugs, problemas de segurança e qualidade de código" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Análise de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analise esses erros e sugira a causa raiz e as correções" > error-analysis.txt
```

### Geração de notas de versão

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Gere notas de versão a partir desses commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Acompanhamento de uso de modelos e ferramentas

```bash
result=$(qwen -p "Explique este esquema de banco de dados" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls chamadas de ferramentas ($tools_used) usadas com os modelos: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Tendências recentes de uso:"
tail -5 usage.log
```

## Recursos

- [Configuração da CLI](../configuration/settings#command-line-arguments) — Guia completo de configuração  
- [Autenticação](../configuration/settings#environment-variables-for-api-access) — Configuração da autenticação  
- [Comandos](../features/commands) — Referência interativa de comandos  
- [Tutoriais](../quickstart) — Guias passo a passo para automação