# Modo Headless

O modo headless permite que você execute o Qwen Code programaticamente a partir de scripts de linha de comando
e ferramentas de automação sem nenhuma interface UI interativa. Isso é ideal para
scripting, automação, pipelines CI/CD e construção de ferramentas com IA.

## Visão Geral

O modo headless fornece uma interface headless para o Qwen Code que:

- Aceita prompts via argumentos de linha de comando ou stdin
- Retorna saída estruturada (texto ou JSON)
- Suporta redirecionamento de arquivos e piping
- Habilita fluxos de trabalho de automação e scripting
- Fornece códigos de saída consistentes para tratamento de erros
- Pode retomar sessões anteriores com escopo para o projeto atual para automação multi-etapas

## Uso Básico

### Prompts Diretos

Use a flag `--prompt` (ou `-p`) para executar no modo headless:

```bash
qwen --prompt "O que é aprendizado de máquina?"
```

### Entrada Stdin

Passe entrada para o Qwen Code a partir do seu terminal:

```bash
echo "Explique este código" | qwen
```

### Combinação com Entrada de Arquivo

Leia de arquivos e processe com o Qwen Code:

```bash
cat README.md | qwen --prompt "Resuma esta documentação"
```

### Retomar Sessões Anteriores (Sem Interface)

Reutilize o contexto da conversa do projeto atual em scripts headless:

```bash

# Continue a sessão mais recente para este projeto e execute um novo prompt
qwen --continue -p "Execute os testes novamente e resuma as falhas"

# Retome um ID de sessão específico diretamente (sem interface)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Aplique o refatoramento de acompanhamento"
```

> [!note]
>
> - Os dados da sessão estão no escopo do projeto em JSONL sob `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restaura o histórico da conversa, saídas de ferramentas e pontos de verificação de compressão do chat antes de enviar o novo prompt.

## Formatos de Saída

O Qwen Code suporta múltiplos formatos de saída para diferentes casos de uso:

### Saída de Texto (Padrão)

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

A saída JSON é um array de objetos de mensagem. A saída inclui múltiplos tipos de mensagem: mensagens do sistema (inicialização da sessão), mensagens do assistente (respostas da IA) e mensagens de resultado (resumo da execução).

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

O formato stream-JSON emite mensagens JSON imediatamente conforme elas ocorrem durante a execução, permitindo monitoramento em tempo real. Este formato utiliza JSON delimitado por linhas, onde cada mensagem é um objeto JSON completo em uma única linha.

```bash
qwen -p "Explique TypeScript" --output-format stream-json
```

Saída (transmitindo conforme os eventos ocorrem):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

Quando combinado com `--include-partial-messages`, eventos adicionais de stream são emitidos em tempo real (message_start, content_block_delta, etc.) para atualizações de interface em tempo real.

```bash
qwen -p "Escreva um script Python" --output-format stream-json --include-partial-messages
```

### Formato de Entrada

O parâmetro `--input-format` controla como o Qwen Code consome entrada da entrada padrão:

- **`text`** (padrão): Entrada de texto padrão da stdin ou argumentos de linha de comando
- **`stream-json`**: Protocolo de mensagem JSON via stdin para comunicação bidirecional

> **Nota:** O modo de entrada stream-json está atualmente em construção e é destinado à integração com SDK. Requer que `--output-format stream-json` seja definido.

### Redirecionamento de Arquivos

Salve a saída em arquivos ou redirecione para outros comandos:

```bash

# Salvar em arquivo
qwen -p "Explique Docker" > docker-explanation.txt
qwen -p "Explique Docker" --output-format json > docker-explanation.json

# Acrescentar ao arquivo
qwen -p "Adicione mais detalhes" >> docker-explanation.txt

# Redirecionar para outras ferramentas
qwen -p "O que é Kubernetes?" --output-format json | jq '.response'
qwen -p "Explique microservices" | wc -w
qwen -p "Liste linguagens de programação" | grep -i "python"
```

# Saída Stream-JSON para processamento em tempo real
qwen -p "Explique o Docker" --output-format stream-json | jq '.type'
qwen -p "Escreva código" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Opções de Configuração

Principais opções de linha de comando para uso headless:

| Opção                        | Descrição                                               | Exemplo                                                                  |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Executar em modo headless                               | `qwen -p "consulta"`                                                     |
| `--output-format`, `-o`      | Especificar formato de saída (text, json, stream-json)  | `qwen -p "consulta" --output-format json`                                |
| `--input-format`             | Especificar formato de entrada (text, stream-json)      | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Incluir mensagens parciais na saída stream-json         | `qwen -p "consulta" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Habilitar modo de depuração                             | `qwen -p "consulta" --debug`                                             |
| `--all-files`, `-a`          | Incluir todos os arquivos no contexto                   | `qwen -p "consulta" --all-files`                                         |
| `--include-directories`      | Incluir diretórios adicionais                           | `qwen -p "consulta" --include-directories src,docs`                      |
| `--yolo`, `-y`               | Aprovar automaticamente todas as ações                  | `qwen -p "consulta" --yolo`                                              |
| `--approval-mode`            | Definir modo de aprovação                               | `qwen -p "consulta" --approval-mode auto_edit`                           |
| `--continue`                 | Retomar a sessão mais recente para este projeto         | `qwen --continue -p "Retomar de onde paramos"`                           |
| `--resume [sessionId]`       | Retomar uma sessão específica (ou escolher interativamente) | `qwen --resume 123e... -p "Finalizar o refatoramento"`               |
| `--experimental-skills`      | Habilitar Skills experimentais (registra a ferramenta `skill`) | `qwen --experimental-skills -p "Quais Skills estão disponíveis?"`   |

Para detalhes completos sobre todas as opções de configuração disponíveis, arquivos de configurações e variáveis de ambiente, consulte o [Guia de Configuração](../configuration/settings).

## Exemplos

### Revisão de código

```bash
cat src/auth.py | qwen -p "Revise este código de autenticação quanto a problemas de segurança" > security-review.txt
```

### Gerar mensagens de commit

```bash
result=$(git diff --cached | qwen -p "Escreva uma mensagem de commit concisa para estas alterações" --output-format json)
echo "$result" | jq -r '.response'
```

### Documentação de API

```bash
result=$(cat api/routes.js | qwen -p "Gere a especificação OpenAPI para estas rotas" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Análise de código em lote

```bash
for file in src/*.py; do
    echo "Analisando $file..."
    result=$(cat "$file" | qwen -p "Encontre possíveis bugs e sugira melhorias" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Análise concluída para $(basename "$file")" >> reports/progress.log
done
```

### Revisão de código PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Revise estas alterações em busca de bugs, problemas de segurança e qualidade de código" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Análise de logs

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analise estes erros e sugira causa raiz e correções" > error-analysis.txt
```

### Geração de notas de release

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Gere notas de release a partir destes commits" --output-format json)
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
echo "$(date): $total_tokens tokens, $tool_calls chamadas de ferramentas ($tools_used) usadas com modelos: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Tendências recentes de uso:"
tail -5 usage.log
```

## Recursos

- [Configuração da CLI](../configuration/settings#command-line-arguments) - Guia completo de configuração
- [Autenticação](../configuration/settings#environment-variables-for-api-access) - Configurar autenticação
- [Comandos](../features/commands) - Referência de comandos interativos
- [Tutoriais](../quickstart) - Guias de automação passo a passo