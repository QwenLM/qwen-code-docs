# Modo Headless

O modo headless permite que você execute o Qwen Code programaticamente por meio de scripts de linha de comando e ferramentas de automação sem qualquer interface interativa. Isso é ideal para scripting, automação, pipelines de CI/CD e construção de ferramentas com inteligência artificial.

- [Modo Headless](#modo-headless)
  - [Visão Geral](#visão-geral)
  - [Uso Básico](#uso-básico)
    - [Prompts Diretos](#prompts-diretos)
    - [Entrada via Stdin](#entrada-via-stdin)
    - [Combinando com Entrada de Arquivo](#combinando-com-entrada-de-arquivo)
  - [Formatos de Saída](#formatos-de-saída)
    - [Saída em Texto (Padrão)](#saída-em-texto-padrão)
    - [Saída em JSON](#saída-em-json)
      - [Exemplo de Uso](#exemplo-de-uso)
    - [Saída Stream-JSON](#saída-stream-json)
    - [Formato de Entrada](#formato-de-entrada)
    - [Redirecionamento de Arquivo](#redirecionamento-de-arquivo)
  - [Opções de Configuração](#opções-de-configuração)
  - [Exemplos](#exemplos)
    - [Revisão de código](#revisão-de-código)
    - [Gerar mensagens de commit](#gerar-mensagens-de-commit)
    - [Documentação da API](#documentação-da-api)
    - [Análise de código em lote](#análise-de-código-em-lote)
    - [Revisão de código de PR](#revisão-de-código-de-pr)
    - [Análise de logs](#análise-de-logs)
    - [Geração de notas de release](#geração-de-notas-de-release)
    - [Rastreamento de uso de modelos e ferramentas](#rastreamento-de-uso-de-modelos-e-ferramentas)
  - [Recursos](#recursos)

## Visão Geral

O modo headless fornece uma interface headless para o Qwen Code que:

- Aceita prompts via argumentos de linha de comando ou stdin
- Retorna saída estruturada (texto ou JSON)
- Suporta redirecionamento de arquivos e piping
- Permite automação e fluxos de trabalho com scripts
- Fornece códigos de saída consistentes para tratamento de erros

## Uso Básico

### Prompts Diretos

Use a flag `--prompt` (ou `-p`) para executar no modo headless:

```bash
qwen --prompt "O que é machine learning?"
```

### Entrada via Stdin

Envie entrada para o Qwen Code a partir do seu terminal:

```bash
echo "Explique este código" | qwen
```

### Combinando com Entrada de Arquivo

Leia arquivos e processe-os com o Qwen Code:

```bash
cat README.md | qwen --prompt "Resuma esta documentação"
```

## Formatos de Saída

O Qwen Code suporta múltiplos formatos de saída para diferentes casos de uso:

### Saída em Texto (Padrão)

Saída padrão legível por humanos:

```bash
qwen -p "Qual é a capital da França?"
```

Formato da resposta:

```
A capital da França é Paris.
```

### Saída JSON

Retorna dados estruturados como um array JSON. Todas as mensagens são armazenadas em buffer e exibidas juntas quando a sessão é concluída. Este formato é ideal para processamento programático e scripts de automação.

A saída JSON é um array de objetos de mensagem. A saída inclui vários tipos de mensagens: mensagens do sistema (inicialização da sessão), mensagens do assistente (respostas da IA) e mensagens de resultado (resumo da execução).

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

O formato Stream-JSON emite mensagens JSON imediatamente conforme elas ocorrem durante a execução, permitindo monitoramento em tempo real. Esse formato utiliza JSON delimitado por linhas, onde cada mensagem é um objeto JSON completo em uma única linha.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Saída (transmitida conforme os eventos ocorrem):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Quando combinado com `--include-partial-messages`, eventos adicionais de stream são emitidos em tempo real (message_start, content_block_delta, etc.) para atualizações em tempo real na interface do usuário.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Formato de Entrada

O parâmetro `--input-format` controla como o Qwen Code consome a entrada padrão:

- **`text`** (padrão): Entrada de texto padrão via stdin ou argumentos de linha de comando
- **`stream-json`**: Protocolo de mensagens JSON via stdin para comunicação bidirecional

> **Nota:** O modo de entrada `stream-json` está em construção e é destinado à integração com SDKs. Requer que `--output-format stream-json` também seja definido.

### Redirecionamento de Arquivo

Salve a saída em arquivos ou envie para outros comandos:

```bash

# Salvar em arquivo
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Adicionar ao final do arquivo
qwen -p "Add more details" >> docker-explanation.txt

# Enviar para outras ferramentas
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"
```

# Saída Stream-JSON para processamento em tempo real
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Opções de Configuração

Principais opções de linha de comando para uso headless:

| Opção                        | Descrição                                          | Exemplo                                                                      |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--prompt`, `-p`             | Executar em modo headless                          | `qwen -p "query"`                                                            |
| `--output-format`, `-o`      | Especificar formato de saída (text, json, stream-json) | `qwen -p "query" --output-format json`                                       |
| `--input-format`             | Especificar formato de entrada (text, stream-json)  | `qwen --input-format text --output-format stream-json`                       |
| `--include-partial-messages` | Incluir mensagens parciais na saída stream-json    | `qwen -p "query" --output-format stream-json --include-partial-messages`     |
| `--debug`, `-d`              | Ativar modo debug                                  | `qwen -p "query" --debug`                                                    |
| `--all-files`, `-a`          | Incluir todos os arquivos no contexto              | `qwen -p "query" --all-files`                                                |
| `--include-directories`      | Incluir diretórios adicionais                      | `qwen -p "query" --include-directories src,docs`                             |
| `--yolo`, `-y`               | Aprovar automaticamente todas as ações             | `qwen -p "query" --yolo`                                                     |
| `--approval-mode`            | Definir modo de aprovação                          | `qwen -p "query" --approval-mode auto_edit`                                  |

Para detalhes completos sobre todas as opções de configuração disponíveis, arquivos de configuração e variáveis de ambiente, consulte o [Guia de Configuração](./cli/configuration.md).

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

### Revisão de código PR

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

## Recursos

- [Configuração do CLI](./cli/configuration.md) - Guia completo de configuração
- [Autenticação](./cli/authentication.md) - Configuração de autenticação
- [Comandos](./cli/commands.md) - Referência interativa de comandos
- [Tutoriais](./cli/tutorials.md) - Guias passo a passo para automação