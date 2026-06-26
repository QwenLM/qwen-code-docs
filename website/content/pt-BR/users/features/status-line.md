# Linha de Status

> Exiba informações personalizadas no rodapé.

A linha de status mostra informações sensíveis à sessão — nome do modelo, uso de tokens, branch Git e mais — na seção esquerda do rodapé. Existem dois modos de configuração:

- **Modo predefinido** — escolha entre itens de dados internos via um diálogo interativo ou configuração JSON. Nenhum script necessário.
- **Modo comando** — execute um comando shell que recebe um contexto JSON estruturado via stdin. Flexibilidade total para formatação personalizada.

```
Linha de status única (modo de aprovação padrão — 1 linha):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← linha de status
└─────────────────────────────────────────────────────────────────┘

Linha de status múltipla (até 2 linhas — 2 linhas):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← linha de status 1
│  ████████░░░░░░░░░░ 34% context                                │  ← linha de status 2
└─────────────────────────────────────────────────────────────────┘

Linha de status múltipla + modo não padrão (máx. 3 linhas):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← linha de status 1
│  ████████░░░░░░░░░░ 34% context                                │  ← linha de status 2
│  auto-accept edits (shift + tab to cycle)                       │  ← indicador de modo
└─────────────────────────────────────────────────────────────────┘
```

Quando configurada, a linha de status substitui a dica padrão "? para atalhos". Mensagens de alta prioridade (prompts Ctrl+C/D para sair, Esc, modo vim INSERT) substituem temporariamente a linha de status. O texto da linha de status é truncado para caber na largura disponível.

## Configuração rápida

A maneira mais fácil de configurar uma linha de status é o comando `/statusline`. Ele abre um diálogo interativo onde você pode selecionar itens predefinidos, alternar cores do tema e ver uma prévia ao vivo:

```
/statusline
```

Isso abre o configurador do modo predefinido. Use as setas do teclado para navegar, espaço para alternar itens e Enter para confirmar. Sua seleção é salva automaticamente nas configurações.

Você também pode dar instruções específicas ao `/statusline` para que ele gere uma configuração de modo comando:

```
/statusline show model name and context usage percentage
```

---

## Modo predefinido

O modo predefinido fornece um conjunto de itens de dados internos que você pode escolher e combinar — sem comandos shell, sem `jq`, sem scripts. Os itens são renderizados como `item1 | item2 | item3` em uma única linha.

### Configuração

Adicione um objeto `statusLine` sob a chave `ui` em `~/.qwen/settings.json`:

```json
{
  "ui": {
    "statusLine": {
      "type": "preset",
      "items": [
        "model-with-reasoning",
        "git-branch",
        "context-remaining",
        "current-dir",
        "context-used"
      ],
      "useThemeColors": true
    }
  }
}
```

| Campo                 | Tipo       | Obrigatório | Descrição                                                                                                             |
| --------------------- | ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `type`                | `"preset"` | Sim         | Deve ser `"preset"`                                                                                                    |
| `items`               | string[]   | Sim         | Lista ordenada de IDs de itens predefinidos a exibir (veja tabela abaixo). Os itens são unidos com `\|` como separador. |
| `useThemeColors`      | boolean    | Não         | Aplica a cor ativa do `/theme` ao texto da linha de status. Padrão: `true`.                                           |
| `hideContextIndicator`| boolean    | Não         | Oculta o indicador interno de uso de contexto na seção direita do rodapé. Padrão: `false`.                             |

### Itens predefinidos disponíveis

| ID do item              | Padrão | Descrição                                                               |
| ----------------------- | ------ | ----------------------------------------------------------------------- |
| `model-with-reasoning`  | Sim    | Nome do modelo atual com nível de raciocínio (ex.: `qwen-3-235b high`)  |
| `model`                 |        | Nome do modelo atual sem nível de raciocínio                            |
| `git-branch`            | Sim    | Nome da branch Git atual (oculto quando não está em um repositório git) |
| `context-remaining`     | Sim    | Percentual restante da janela de contexto (ex.: `Context 65.7% left`)   |
| `total-input-tokens`    |        | Tokens de entrada acumulados na sessão (ex.: `30.0k total in`)          |
| `total-output-tokens`   |        | Tokens de saída acumulados na sessão (ex.: `5.0k total out`)            |
| `current-dir`           | Sim    | Diretório de trabalho atual                                              |
| `project-name`          |        | Nome do projeto (nome base do diretório de trabalho)                     |
| `pull-request-number`   |        | Número do PR aberto para a branch atual (requer CLI `gh`)               |
| `branch-changes`        |        | Estatísticas de alterações de arquivos na sessão (ex.: `+120 -30`)      |
| `context-used`          | Sim    | Percentual da janela de contexto utilizado (ex.: `Context 34.3% used`)  |
| `run-state`             |        | Estado compacto da sessão (`Ready`, `Working` ou `Confirm`)             |
| `qwen-version`          |        | Versão do Qwen Code (ex.: `v0.14.1`)                                    |
| `context-window-size`   |        | Tamanho total da janela de contexto (ex.: `131.1k window`)              |
| `used-tokens`           |        | Contagem de tokens do prompt atual (ex.: `45.0k used`)                  |
| `session-id`            |        | Identificador da sessão atual                                            |

Os itens marcados como **Padrão** são pré-selecionados quando você abre o diálogo `/statusline` pela primeira vez.

`total-input-tokens` e `total-output-tokens` são totais da sessão. Eles acumulam o uso de tokens ao longo das interações, então os tokens de entrada podem crescer rapidamente porque cada nova requisição ao modelo inclui novamente o contexto atual da conversa. Use `used-tokens` quando quiser o tamanho do prompt atual em vez do gasto acumulado na sessão.

### Exemplo de saída

Com os itens padrão, a linha de status fica assim:

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### Personalização via diálogo

Executar `/statusline` abre um diálogo interativo de múltipla escolha:

```
┌ Configure Status Line ────────────────────────────────────────┐
│ Select which items to display in the status line.             │
│                                                               │
│ Type to search                                                │
│ >                                                             │
│                                                               │
│ [x] Use theme colors        Apply colors from the active /theme│
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Current model name with reasoning │
│ [ ] model-only              Current model name without reason │
│ [x] git-branch              Current Git branch when available │
│ [x] context-remaining       Percentage of context remaining   │
│ ...                                                           │
│                                                               │
│ Preview                                                       │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ Use up/down to navigate, space to select, enter to confirm    │
└───────────────────────────────────────────────────────────────┘
```

- Digite para filtrar itens por nome ou descrição
- Uma prévia ao vivo é atualizada conforme você alterna itens
- Pressione Enter para salvar a configuração

---

## Modo comando

O modo comando executa um comando shell cuja saída padrão é exibida na linha de status. O comando recebe um contexto JSON estruturado via stdin para uma saída ciente da sessão.

### Pré-requisitos

- [`jq`](https://jqlang.github.io/jq/) é recomendado para analisar a entrada JSON (instale via `brew install jq`, `apt install jq`, etc.)
- Comandos simples que não precisam de dados JSON (ex.: `git branch --show-current`) funcionam sem `jq`

### Configuração

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

| Campo                  | Tipo        | Obrigatório | Descrição                                                                                                                          |
| ---------------------- | ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | Sim         | Deve ser `"command"`                                                                                                               |
| `command`              | string      | Sim         | Comando shell a executar. Recebe JSON via stdin, stdout é exibido (até 2 linhas).                                                  |
| `refreshInterval`      | number      | Não         | Executa novamente o comando a cada N segundos (mínimo 1). Útil para dados que mudam sem um evento de estado do Agent (relógio, cota, uptime). |
| `respectUserColors`    | boolean     | Não         | Preserva códigos de cor ANSI na saída do comando em vez de aplicar estilo de rodapé escurecido. Padrão: `false`.                    |
| `hideContextIndicator` | boolean     | Não         | Oculta o indicador interno de uso de contexto na seção direita do rodapé. Padrão: `false`.                                          |

### Entrada JSON

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
  "worktree": {
    "name": "fix-auth",
    "path": "/home/user/project/.qwen/worktrees/fix-auth",
    "branch": "fix-auth",
    "original_cwd": "/home/user/project",
    "original_branch": "main"
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

| Campo                                | Tipo             | Descrição                                                                    |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------------------- |
| `session_id`                         | string           | Identificador único da sessão                                                |
| `version`                            | string           | Versão do Qwen Code                                                          |
| `model.display_name`                 | string           | Nome do modelo atual                                                         |
| `context_window.context_window_size` | number           | Tamanho total da janela de contexto em tokens                                |
| `context_window.used_percentage`     | number           | Percentual de uso da janela de contexto (0–100)                              |
| `context_window.remaining_percentage`| number           | Percentual restante da janela de contexto (0–100)                            |
| `context_window.current_usage`       | number           | Contagem de tokens da última chamada de API (tamanho atual do contexto)      |
| `context_window.total_input_tokens`  | number           | Total de tokens de entrada consumidos nesta sessão                           |
| `context_window.total_output_tokens` | number           | Total de tokens de saída consumidos nesta sessão                             |
| `workspace.current_dir`              | string           | Diretório de trabalho atual                                                  |
| `git`                                | object \| absent | Presente apenas dentro de um repositório git.                                 |
| `git.branch`                         | string           | Nome da branch atual                                                         |
| `worktree`                           | object \| absent | Presente apenas quando dentro de uma worktree ativa (criada por `enter_worktree`). |
| `worktree.name`                      | string           | Nome slug da worktree                                                        |
| `worktree.path`                      | string           | Caminho absoluto para o diretório da worktree                                |
| `worktree.branch`                    | string           | Branch checkoutada na worktree                                              |
| `worktree.original_cwd`              | string           | Diretório de trabalho antes de entrar na worktree                            |
| `worktree.original_branch`           | string           | Branch que estava ativa antes de entrar na worktree                          |
| `metrics.models.<id>.api`            | object           | Estatísticas de API por modelo: `total_requests`, `total_errors`, `total_latency_ms` |
| `metrics.models.<id>.tokens`         | object           | Uso de tokens por modelo: `prompt`, `completion`, `total`, `cached`, `thoughts`      |
| `metrics.files`                      | object           | Estatísticas de alterações de arquivos: `total_lines_added`, `total_lines_removed`   |
| `vim`                                | object \| absent | Presente apenas quando o modo vim está ativado. Contém `mode` (`"INSERT"` ou `"NORMAL"`). |

> **Importante:** o stdin só pode ser lido uma vez. Sempre armazene-o em uma variável primeiro: `input=$(cat)`.

### Exemplos

#### Modelo e uso de tokens

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

#### Branch Git + diretório

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

> Nota: O campo `git.branch` é fornecido diretamente na entrada JSON — não é necessário chamar `git` externamente.

#### Estatísticas de alterações de arquivos

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

#### Relógio ao vivo e branch Git

Use `refreshInterval` quando a linha de status exibir dados que mudam sem um evento do Agent (ex.: relógio, uptime ou contadores de limite de taxa):

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // \"no-git\"'); echo \"$(date +%H:%M:%S)  ($branch)\"",
      "refreshInterval": 1
    }
  }
}
```

Saída (atualizada a cada segundo): `14:32:07  (main)`

#### Arquivo de script para comandos complexos

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

**Ambos os modos:**

- **Gatilhos de atualização**: A linha de status é atualizada quando o modelo muda, uma nova mensagem é enviada (contagem de tokens muda), o modo vim é alternado, a branch Git muda, chamadas de ferramentas são concluídas ou ocorrem alterações em arquivos. As atualizações são debounced (300ms).
- **Saída**: Até 2 linhas. Cada linha é renderizada como uma linha separada na seção esquerda do rodapé. Linhas que excedem a largura disponível são truncadas.
- **Hot reload**: Alterações em `ui.statusLine` nas configurações entram em vigor imediatamente — nenhuma reinicialização necessária.
- **Remoção**: Exclua a chave `ui.statusLine` das configurações para desabilitar. A dica "? para atalhos" retorna.

**Apenas modo comando:**

- **Timeout**: Comandos que demoram mais de 5 segundos são finalizados. A linha de status é limpa em caso de falha.
- **Atualização**: Defina `refreshInterval` (segundos) para executar novamente o comando em um timer — útil para dados que mudam sem um evento do Agent (relógio, limites de taxa, status de build).
- **Shell**: Os comandos são executados via `/bin/sh` no macOS/Linux. No Windows, `cmd.exe` é usado por padrão — envolva comandos POSIX com `bash -c "..."` ou aponte para um script bash (ex.: `bash ~/.qwen/statusline-command.sh`).

**Apenas modo predefinido:**

- **Sem dependências externas**: Itens predefinidos são calculados internamente — sem comandos shell, sem `jq`, sem timeouts.
- **Integração com tema**: Quando `useThemeColors` é `true` (padrão), o texto da linha de status usa a cor ativa do `/theme`. Quando `false`, o estilo de rodapé escurecido é aplicado.
- **Consulta de PR**: O item `pull-request-number` executa `gh pr view` em segundo plano (timeout de 2s). Ele só é acionado quando a branch muda, não a cada atualização.

## Solução de problemas

| Problema                         | Causa                        | Correção                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linha de status não aparece      | Configuração no caminho errado| Deve estar sob `ui.statusLine`, não no nível raiz `statusLine`                                                                                                                                                                                                                                                                                                          |
| Saída vazia (modo comando)       | Comando falha silenciosamente | Teste manualmente: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'seu_comando'` |
| Dados desatualizados (modo comando)| Nenhum gatilho foi acionado | Envie uma mensagem ou altere modelos para acionar uma atualização — ou defina `refreshInterval` para reexecutar o comando em um timer                                                                                                                                                                                                                                   |
| Comando muito lento              | Script complexo              | Otimize o script ou mova o trabalho pesado para um cache em segundo plano                                                                                                                                                                                                                                                                                              |
| Itens predefinidos ausentes      | Itens condicionais sem dados | `git-branch` é ocultado fora de repositórios git; `context-used` é ocultado quando o uso é 0; `branch-changes` é ocultado quando nenhum arquivo foi alterado. Isso é esperado — os itens aparecem assim que seus dados estiverem disponíveis                                                                                                                             |
| Número do PR não aparece         | CLI `gh` não instalada       | Instale o [GitHub CLI](https://cli.github.com/) e autentique-se com `gh auth login`. A consulta é executada com timeout de 2s                                                                                                                                                                                                                                           |