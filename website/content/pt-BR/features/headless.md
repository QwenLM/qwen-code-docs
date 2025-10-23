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
      - [Schema da Resposta](#schema-da-resposta)
      - [Exemplo de Uso](#exemplo-de-uso)
    - [Redirecionamento para Arquivo](#redirecionamento-para-arquivo)
  - [Opções de Configuração](#opções-de-configuração)
  - [Exemplos](#exemplos)
    - [Revisão de código](#revisão-de-código)
    - [Gerar mensagens de commit](#gerar-mensagens-de-commit)
    - [Documentação de API](#documentação-de-api)
    - [Análise de código em lote](#análise-de-código-em-lote)
    - [Revisão de código](#revisão-de-código-1)
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

## Formatos de Saída

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

Retorna dados estruturados incluindo response, statistics e metadata. Este
formato é ideal para processamento programático e scripts de automação.

#### Response Schema

A saída em JSON segue esta estrutura de alto nível:

```json
{
  "response": "string", // O conteúdo principal gerado pela IA respondendo ao seu prompt
  "stats": {
    // Métricas de uso e dados de desempenho
    "models": {
      // Estatísticas de uso da API e tokens por modelo
      "[model-name]": {
        "api": {
          /* contagem de requisições, erros, latência */
        },
        "tokens": {
          /* contagem de prompt, resposta, em cache, total */
        }
      }
    },
    "tools": {
      // Estatísticas de execução das tools
      "totalCalls": "number",
      "totalSuccess": "number",
      "totalFail": "number",
      "totalDurationMs": "number",
      "totalDecisions": {
        /* contagem de accept, reject, modify, auto_accept */
      },
      "byName": {
        /* estatísticas detalhadas por tool */
      }
    },
    "files": {
      // Estatísticas de modificações em arquivos
      "totalLinesAdded": "number",
      "totalLinesRemoved": "number"
    }
  },
  "error": {
    // Presente apenas quando ocorrer um erro
    "type": "string", // Tipo do erro (ex.: "ApiError", "AuthError")
    "message": "string", // Descrição do erro legível por humanos
    "code": "number" // Código opcional do erro
  }
}
```

#### Exemplo de Uso

```bash
qwen -p "Qual é a capital da França?" --output-format json
```

Resposta:

```json
{
  "response": "A capital da França é Paris.",
  "stats": {
    "models": {
      "qwen3-coder-plus": {
        "api": {
          "totalRequests": 2,
          "totalErrors": 0,
          "totalLatencyMs": 5053
        },
        "tokens": {
          "prompt": 24939,
          "candidates": 20,
          "total": 25113,
          "cached": 21263,
          "thoughts": 154,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 1,
      "totalSuccess": 1,
      "totalFail": 0,
      "totalDurationMs": 1881,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 1
      },
      "byName": {
        "google_web_search": {
          "count": 1,
          "success": 1,
          "fail": 0,
          "durationMs": 1881,
          "decisions": {
            "accept": 0,
            "reject": 0,
            "modify": 0,
            "auto_accept": 1
          }
        }
      }
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

### Redirecionamento de Arquivos

Salve a saída em arquivos ou encadeie com outros comandos:

```bash

# Salvar em arquivo
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Adicionar ao final do arquivo
qwen -p "Add more details" >> docker-explanation.txt

# Encadear com outras ferramentas
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"
```

## Opções de Configuração

Principais opções de linha de comando para uso headless:

| Opção                   | Descrição                          | Exemplo                                           |
| ----------------------- | ---------------------------------- | ------------------------------------------------- |
| `--prompt`, `-p`        | Executar em modo headless          | `qwen -p "query"`                                 |
| `--output-format`       | Especificar formato de saída (text, json) | `qwen -p "query" --output-format json`            |
| `--model`, `-m`         | Especificar o modelo Qwen          | `qwen -p "query" -m qwen3-coder-plus`             |
| `--debug`, `-d`         | Ativar modo de debug               | `qwen -p "query" --debug`                         |
| `--all-files`, `-a`     | Incluir todos os arquivos no contexto | `qwen -p "query" --all-files`                     |
| `--include-directories` | Incluir diretórios adicionais      | `qwen -p "query" --include-directories src,docs`  |
| `--yolo`, `-y`          | Aprovar automaticamente todas as ações | `qwen -p "query" --yolo`                          |
| `--approval-mode`       | Definir modo de aprovação          | `qwen -p "query" --approval-mode auto_edit`       |

Para detalhes completos sobre todas as opções de configuração disponíveis, arquivos de configuração e variáveis de ambiente, consulte o [Guia de Configuração](./cli/configuration.md).

## Exemplos

#### Revisão de código

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

#### Gerar mensagens de commit

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

#### Documentação de API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

#### Análise de código em lote

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

#### Revisão de código

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

#### Análise de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

#### Geração de release notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

#### Rastreamento de uso de modelos e ferramentas

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