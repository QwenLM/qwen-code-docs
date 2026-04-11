# Linha de status

> Exiba informações personalizadas no rodapé usando um comando shell.

A linha de status permite executar um comando shell cuja saída é exibida na seção esquerda do rodapé. O comando recebe um contexto JSON estruturado via stdin, permitindo mostrar informações conscientes da sessão, como o modelo atual, uso de tokens, branch do git ou qualquer outra coisa que você possa scriptar.

```
With status line (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

With status line + non-default mode (2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

Quando configurada, a linha de status substitui a dica padrão "? for shortcuts". Mensagens de alta prioridade (prompts de saída Ctrl+C/D, Esc, modo INSERT do vim) substituem temporariamente a linha de status. O texto da linha de status é truncado para caber na largura disponível.

## Pré-requisitos

- O [`jq`](https://jqlang.github.io/jq/) é recomendado para processar o input JSON (instale via `brew install jq`, `apt install jq`, etc.)
- Comandos simples que não precisam de dados JSON (ex.: `git branch --show-current`) funcionam sem o `jq`

## Configuração rápida

A maneira mais fácil de configurar uma linha de status é usando o comando `/statusline`. Ele inicia um agente de configuração que lê a configuração PS1 do seu shell e gera uma linha de status correspondente:

```
/statusline
```

Você também pode fornecer instruções específicas:

```
/statusline show model name and context usage percentage
```

## Configuração manual

Adicione um objeto `statusLine` sob a chave `ui` em `~/.qwen/settings.json`:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

| Campo     | Tipo        | Obrigatório | Descrição                                                                           |
| --------- | ----------- | ----------- | ------------------------------------------------------------------------------------- |
| `type`    | `"command"` | Sim      | Deve ser `"command"`                                                                   |
| `command` | string      | Sim      | Comando shell a ser executado. Recebe JSON via stdin; a primeira linha do stdout é exibida. |

## Input JSON

O comando recebe um objeto JSON via stdin com os seguintes campos:

```json
{
  "session_id": "abc-123",
  "version": "0.14.1",
  "model": {
    "display_name": "qwen-3-235b"
  },
  "context_window": {
    "context_window_size": 131072,
    "used_percentage": 34.3,
    "remaining_percentage": 65.7,
    "current_usage": 45000,
    "total_input_tokens": 30000,
    "total_output_tokens": 5000
  },
  "workspace": {
    "current_dir": "/home/user/project"
  },
  "git": {
    "branch": "main"
  },
  "metrics": {
    "models": {
      "qwen-3-235b": {
        "api": {
          "total_requests": 10,
          "total_errors": 0,
          "total_latency_ms": 5000
        },
        "tokens": {
          "prompt": 30000,
          "completion": 5000,
          "total": 35000,
          "cached": 10000,
          "thoughts": 2000
        }
      }
    },
    "files": {
      "total_lines_added": 120,
      "total_lines_removed": 30
    }
  },
  "vim": {
    "mode": "INSERT"
  }
}
```

| Campo                                 | Tipo             | Descrição                                                                        |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | Identificador único da sessão                                                    |
| `version`                             | string           | Versão do Qwen Code                                                              |
| `model.display_name`                  | string           | Nome do modelo atual                                                             |
| `context_window.context_window_size`  | number           | Tamanho total da janela de contexto em tokens                                    |
| `context_window.used_percentage`      | number           | Uso da janela de contexto em porcentagem (0–100)                                 |
| `context_window.remaining_percentage` | number           | Janela de contexto restante em porcentagem (0–100)                               |
| `context_window.current_usage`        | number           | Contagem de tokens da última chamada de API (tamanho atual do contexto)          |
| `context_window.total_input_tokens`   | number           | Total de tokens de input consumidos nesta sessão                                 |
| `context_window.total_output_tokens`  | number           | Total de tokens de output consumidos nesta sessão                                |
| `workspace.current_dir`               | string           | Diretório de trabalho atual                                                      |
| `git`                                 | object \| ausente | Presente apenas dentro de um repositório git.                                    |
| `git.branch`                          | string           | Nome da branch atual                                                             |
| `metrics.models.<id>.api`             | object           | Estatísticas de API por modelo: `total_requests`, `total_errors`, `total_latency_ms` |
| `metrics.models.<id>.tokens`          | object           | Uso de tokens por modelo: `prompt`, `completion`, `total`, `cached`, `thoughts`  |
| `metrics.files`                       | object           | Estatísticas de alteração de arquivos: `total_lines_added`, `total_lines_removed`|
| `vim`                                 | object \| ausente | Presente apenas quando o modo vim está ativado. Contém `mode` (`"INSERT"` ou `"NORMAL"`). |

> **Importante:** o stdin só pode ser lido uma vez. Sempre armazene-o primeiro em uma variável: `input=$(cat)`.

## Exemplos

### Modelo e uso de tokens

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

Saída: `qwen-3-235b  ctx:34%`

### Branch do git + diretório

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // empty'); dir=$(basename \"$(echo \"$input\" | jq -r '.workspace.current_dir')\"); echo \"$dir${branch:+ ($branch)}\""
    }
  }
}
```

Saída: `my-project (main)`

> Nota: O campo `git.branch` é fornecido diretamente no input JSON — não é necessário chamar o `git` no shell.

### Estatísticas de alteração de arquivos

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); added=$(echo \"$input\" | jq -r '.metrics.files.total_lines_added'); removed=$(echo \"$input\" | jq -r '.metrics.files.total_lines_removed'); echo \"+$added/-$removed lines\""
    }
  }
}
```

Saída: `+120/-30 lines`

### Arquivo de script para comandos complexos

Para comandos mais longos, salve um arquivo de script em `~/.qwen/statusline-command.sh`:

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
pct=$(echo "$input" | jq -r '.context_window.used_percentage')
branch=$(echo "$input" | jq -r '.git.branch // empty')
added=$(echo "$input" | jq -r '.metrics.files.total_lines_added')
removed=$(echo "$input" | jq -r '.metrics.files.total_lines_removed')

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$branch" ] && parts+=("($branch)")
[ "$pct" != "0" ] 2>/dev/null && parts+=("ctx:${pct}%")
([ "$added" -gt 0 ] || [ "$removed" -gt 0 ]) 2>/dev/null && parts+=("+${added}/-${removed}")

echo "${parts[*]}"
```

Em seguida, referencie-o nas configurações:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "bash ~/.qwen/statusline-command.sh"
    }
  }
}
```

## Comportamento

- **Gatilhos de atualização**: A linha de status é atualizada quando o modelo muda, uma nova mensagem é enviada (contagem de tokens muda), o modo vim é alternado, a branch do git muda, chamadas de ferramenta são concluídas ou ocorrem alterações em arquivos. As atualizações possuem debounce (300ms).
- **Timeout**: Comandos que levam mais de 5 segundos são encerrados. A linha de status é limpa em caso de falha.
- **Output**: Apenas a primeira linha do stdout é utilizada. O texto é renderizado com cores atenuadas na seção esquerda do rodapé e truncado se exceder a largura disponível.
- **Hot reload**: Alterações em `ui.statusLine` nas configurações entram em vigor imediatamente — não é necessário reiniciar.
- **Shell**: Comandos são executados via `/bin/sh` no macOS/Linux. No Windows, `cmd.exe` é usado por padrão — envolva comandos POSIX com `bash -c "..."` ou aponte para um script bash (ex.: `bash ~/.qwen/statusline-command.sh`).
- **Remoção**: Exclua a chave `ui.statusLine` das configurações para desativar. A dica "? for shortcuts" retorna.

## Solução de problemas

| Problema                 | Causa                  | Solução                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linha de status não aparece | Configuração no caminho errado   | Deve estar sob `ui.statusLine`, não em `statusLine` no nível raiz                                                                                                                                                                                                                                                                                                                                             |
| Saída vazia            | Comando falha silenciosamente | Teste manualmente: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'seu_comando'` |
| Dados desatualizados              | Nenhum gatilho disparado       | Envie uma mensagem ou alterne de modelo para disparar uma atualização                                                                                                                                                                                                                                                                                                                                                   |
| Comando muito lento        | Script complexo         | Otimize o script ou mova o processamento pesado para um cache em segundo plano                                                                                                                                                                                                                                                                                                                                           |