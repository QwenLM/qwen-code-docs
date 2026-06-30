# Linha de status

> Exibe informações personalizadas no rodapé.

A linha de status exibe informações conscientes da sessão — nome do modelo, uso de tokens, branch do git e mais — na seção esquerda do rodapé. Existem dois modos de configuração:

- **Modo predefinido** — escolha entre itens de dados integrados por meio de um diálogo interativo ou configuração JSON. Não é necessário scripting.
- **Modo comando** — execute um comando shell que recebe um contexto JSON estruturado via stdin. Flexibilidade total para formatação personalizada.

```
Linha de status de linha única (modo de aprovação padrão — 1 linha):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← linha de status
└─────────────────────────────────────────────────────────────────┘

Linha de status multilinha (até 2 linhas — 2 linhas):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← linha de status 1
│  ████████░░░░░░░░░░ 34% context                                │  ← linha de status 2
└─────────────────────────────────────────────────────────────────┘

Linha de status multilinha + modo não padrão (máximo de 3 linhas):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← linha de status 1
│  ████████░░░░░░░░░░ 34% context                                │  ← linha de status 2
│  auto-accept edits (shift + tab to cycle)                       │  ← indicador de modo
└─────────────────────────────────────────────────────────────────┘
```

Quando configurada, a linha de status substitui a dica padrão "? for shortcuts". Mensagens de alta prioridade (prompts de saída Ctrl+C/D, Esc, modo INSERT do vim) substituem temporariamente a linha de status. O texto da linha de status é truncado para caber na largura disponível.

## Configuração rápida

A maneira mais fácil de configurar uma linha de status é o comando `/statusline`. Ele abre um diálogo interativo onde você pode selecionar itens predefinidos, alternar cores do tema e ver uma pré-visualização ao vivo:

```
/statusline
```

Isso abre o configurador do modo predefinido. Use as setas para navegar, espaço para alternar itens e enter para confirmar. Sua seleção é salva nas configurações automaticamente.

Você também pode dar instruções específicas para o `/statusline` para que ele gere uma configuração do modo comando:

```
/statusline show model name and context usage percentage
```

---

## Modo predefinido

O modo predefinido fornece um conjunto de itens de dados integrados que você pode escolher e combinar — sem comandos shell, sem `jq`, sem scripting. Os itens são renderizados como `item1 | item2 | item3` em uma única linha.

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

| Campo                  | Tipo       | Obrigatório | Descrição                                                                                                |
| ---------------------- | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | Sim         | Deve ser `"preset"`                                                                                        |
| `items`                | string[]   | Sim         | Lista ordenada de IDs de itens predefinidos para exibir (veja a tabela abaixo). Os itens são unidos com `\|` como separador. |
| `useThemeColors`       | boolean    | Não         | Aplica a cor do `/theme` ativo ao texto da linha de status. O padrão é `true`.                             |
| `hideContextIndicator` | boolean    | Não         | Oculta o indicador de uso de contexto integrado na seção direita do rodapé. O padrão é `false`.            |

### Itens predefinidos disponíveis

| ID do Item             | Padrão | Descrição                                                        |
| ---------------------- | ------ | ---------------------------------------------------------------- |
| `model-with-reasoning` | Sim    | Nome do modelo atual com nível de raciocínio (ex.: `qwen-3-235b high`) |
| `model`                |        | Nome do modelo atual sem nível de raciocínio                     |
| `git-branch`           | Sim    | Nome da branch atual do Git (oculto quando não estiver em um repositório git) |
| `context-remaining`    | Sim    | Porcentagem da janela de contexto restante (ex.: `Context 65.7% left`) |
| `total-input-tokens`   |        | Tokens de entrada cumulativos usados na sessão (ex.: `30.0k total in`) |
| `total-output-tokens`  |        | Tokens de saída cumulativos usados na sessão (ex.: `5.0k total out`) |
| `current-dir`          | Sim    | Diretório de trabalho atual                                      |
| `project-name`         |        | Nome do projeto (basename do diretório de trabalho)              |
| `pull-request-number`  |        | Número do PR aberto para a branch atual (requer a CLI `gh`)      |
| `branch-changes`       |        | Estatísticas de alteração de arquivos da sessão (ex.: `+120 -30`) |
| `context-used`         | Sim    | Porcentagem da janela de contexto usada (ex.: `Context 34.3% used`) |
| `run-state`            |        | Estado compacto da sessão (`Ready`, `Working` ou `Confirm`)      |
| `qwen-version`         |        | Versão do Qwen Code (ex.: `v0.14.1`)                             |
| `context-window-size`  |        | Tamanho total da janela de contexto (ex.: `131.1k window`)       |
| `used-tokens`          |        | Contagem atual de tokens do prompt (ex.: `45.0k used`)           |
| `session-id`           |        | Identificador da sessão atual                                    |

Itens marcados como **Padrão** são pré-selecionados quando você abre o diálogo `/statusline` pela primeira vez.

`total-input-tokens` e `total-output-tokens` são totais da sessão. Eles somam o uso de tokens entre as interações, então os tokens de entrada podem crescer rapidamente porque cada nova requisição do modelo inclui o contexto da conversa atual novamente. Use `used-tokens` quando quiser o tamanho do prompt atual em vez do gasto cumulativo da sessão.

### Saída de exemplo

Com os itens padrão, a linha de status se parece com:

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### Personalizando pelo diálogo

Executar `/statusline` abre um diálogo interativo de seleção múltipla:

```
┌ Configurar Linha de Status ─────────────────────────────────────┐
│ Selecione quais itens exibir na linha de status.                │
│                                                                 │
│ Digite para pesquisar                                           │
│ >                                                               │
│                                                                 │
│ [x] Usar cores do tema        Aplicar cores do /theme ativo     │
│ ───────────────────────                                         │
│ [x] model-with-reasoning    Nome do modelo atual com raciocínio │
│ [ ] model-only              Nome do modelo atual sem raciocínio │
│ [x] git-branch              Branch atual do Git quando disponível│
│ [x] context-remaining       Porcentagem de contexto restante    │
│ ...                                                             │
│                                                                 │
│ Pré-visualização                                                │
│ qwen-3-235b high | main | Context 65.7% left                   │
│                                                                 │
│ Use cima/baixo para navegar, espaço para selecionar, enter para confirmar│
└─────────────────────────────────────────────────────────────────┘
```

- Digite para filtrar itens por nome ou descrição
- Uma pré-visualização ao vivo é atualizada conforme você alterna os itens
- Pressione enter para salvar a configuração

---

## Modo comando

O modo comando executa um comando shell cuja saída padrão (stdout) é exibida na linha de status. O comando recebe um contexto JSON estruturado via stdin para uma saída consciente da sessão.

### Pré-requisitos

- O [`jq`](https://jqlang.github.io/jq/) é recomendado para analisar a entrada JSON (instale via `brew install jq`, `apt install jq`, etc.)
- Comandos simples que não precisam de dados JSON (ex.: `git branch --show-current`) funcionam sem o `jq`

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

| Campo                  | Tipo        | Obrigatório | Descrição                                                                                                                       |
| ---------------------- | ----------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | Sim         | Deve ser `"command"`                                                                                                              |
| `command`              | string      | Sim         | Comando shell para executar. Recebe JSON via stdin, o stdout é exibido (até 2 linhas).                                            |
| `refreshInterval`      | number      | Não         | Reexecuta o comando a cada N segundos (mínimo 1). Útil para dados que mudam sem um evento de estado do Agent (relógio, cota, uptime). |
| `respectUserColors`    | boolean     | Não         | Preserva códigos de cores ANSI na saída do comando em vez de aplicar o estilo de rodapé esmaecido. O padrão é `false`.            |
| `hideContextIndicator` | boolean     | Não         | Oculta o indicador de uso de contexto integrado na seção direita do rodapé. O padrão é `false`.                                   |

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

| Campo                                 | Tipo             | Descrição                                                                        |
| ------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `session_id`                          | string           | Identificador único da sessão                                                    |
| `version`                             | string           | Versão do Qwen Code                                                              |
| `model.display_name`                  | string           | Nome do modelo atual                                                             |
| `context_window.context_window_size`  | number           | Tamanho total da janela de contexto em tokens                                    |
| `context_window.used_percentage`      | number           | Uso da janela de contexto como porcentagem (0–100)                               |
| `context_window.remaining_percentage` | number           | Janela de contexto restante como porcentagem (0–100)                             |
| `context_window.current_usage`        | number           | Contagem de tokens da última chamada de API (tamanho do contexto atual)          |
| `context_window.total_input_tokens`   | number           | Total de tokens de entrada consumidos nesta sessão                               |
| `context_window.total_output_tokens`  | number           | Total de tokens de saída consumidos nesta sessão                                 |
| `workspace.current_dir`               | string           | Diretório de trabalho atual                                                      |
| `git`                                 | object \| absent | Presente apenas dentro de um repositório git.                                    |
| `git.branch`                          | string           | Nome da branch atual                                                             |
| `worktree`                            | object \| absent | Presente apenas quando dentro de um worktree ativo (criado por `enter_worktree`).|
| `worktree.name`                       | string           | Nome slug do worktree                                                            |
| `worktree.path`                       | string           | Caminho absoluto para o diretório do worktree                                    |
| `worktree.branch`                     | string           | Branch com checkout no worktree                                                  |
| `worktree.original_cwd`               | string           | Diretório de trabalho antes de entrar no worktree                                |
| `worktree.original_branch`            | string           | Branch que estava ativa antes de entrar no worktree                              |
| `metrics.models.<id>.api`             | object           | Estatísticas de API por modelo: `total_requests`, `total_errors`, `total_latency_ms` |
| `metrics.models.<id>.tokens`          | object           | Uso de tokens por modelo: `prompt`, `completion`, `total`, `cached`, `thoughts`  |
| `metrics.files`                       | object           | Estatísticas de alteração de arquivos: `total_lines_added`, `total_lines_removed`|
| `vim`                                 | object \| absent | Presente apenas quando o modo vim está habilitado. Contém `mode` (`"INSERT"` ou `"NORMAL"`). |

> **Importante:** o stdin só pode ser lido uma vez. Sempre armazene-o em uma variável primeiro: `input=$(cat)`.

### Exemplos

#### Uso de modelo e tokens

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

#### Branch do Git + diretório

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

> Nota: O campo `git.branch` é fornecido diretamente na entrada JSON — não há necessidade de chamar o `git` no shell.

#### Estatísticas de alteração de arquivos

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

#### Relógio ao vivo e branch do git

Use `refreshInterval` quando a linha de status exibir dados que mudam sem um evento do Agent (ex.: o relógio, uptime ou contadores de limite de taxa):

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

- **Gatilhos de atualização**: A linha de status é atualizada quando o modelo muda, uma nova mensagem é enviada (a contagem de tokens muda), o modo vim é alternado, a branch do git muda, chamadas de ferramentas são concluídas ou ocorrem alterações em arquivos. As atualizações sofrem debounce (300ms).
- **Saída**: Até 2 linhas. Cada linha é renderizada como uma linha separada na seção esquerda do rodapé. Linhas que excedem a largura disponível são truncadas.
- **Hot reload**: Alterações em `ui.statusLine` nas configurações têm efeito imediato — não é necessário reiniciar.
- **Remoção**: Exclua a chave `ui.statusLine` das configurações para desativar. A dica "? for shortcuts" retorna.

**Apenas modo comando:**

- **Timeout**: Comandos que levam mais de 5 segundos são encerrados. A linha de status é limpa em caso de falha.
- **Atualização**: Defina `refreshInterval` (segundos) para reexecutar o comando adicionalmente em um temporizador — útil para dados que mudam sem um evento do Agent (relógio, limites de taxa, status de build).
- **Shell**: Comandos são executados via `/bin/sh` no macOS/Linux. No Windows, o `cmd.exe` é usado por padrão — envolva comandos POSIX com `bash -c "..."` ou aponte para um script bash (ex.: `bash ~/.qwen/statusline-command.sh`).

**Apenas modo predefinido:**

- **Sem dependências externas**: Os itens predefinidos são computados internamente — sem comandos shell, sem `jq`, sem timeouts.
- **Integração com tema**: Quando `useThemeColors` é `true` (padrão), o texto da linha de status usa a cor do `/theme` ativo. Quando `false`, o estilo de rodapé esmaecido é aplicado.
- **Busca de PR**: O item `pull-request-number` executa `gh pr view` em segundo plano (timeout de 2s). Ele só é acionado quando a branch muda, não em cada atualização.

## Solução de problemas

| Problema                     | Causa                          | Solução                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linha de status não exibida  | Configuração no caminho errado | Deve estar sob `ui.statusLine`, não `statusLine` no nível raiz                                                                                                                                                                                                                                                                                                                                           |
| Saída vazia (modo comando)   | Comando falha silenciosamente  | Teste manualmente: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| Dados desatualizados (modo comando) | Nenhum gatilho disparado | Envie uma mensagem ou troque de modelo para acionar uma atualização — ou defina `refreshInterval` para reexecutar o comando em um temporizador                                                                                                                                                                                                                                                           |
| Comando muito lento          | Script complexo                | Otimize o script ou mova o trabalho pesado para um cache em segundo plano                                                                                                                                                                                                                                                                                                                                |
| Itens predefinidos ausentes  | Itens condicionais não têm dados | `git-branch` é oculto fora de repositórios git; `context-used` é oculto quando o uso é 0; `branch-changes` é oculto quando nenhum arquivo foi alterado. Isso é esperado — os itens aparecem assim que seus dados estão disponíveis                                                                                                                                                                     |
| Número do PR não exibido     | CLI `gh` não instalada         | Instale o [GitHub CLI](https://cli.github.com/) e autentique-se com `gh auth login`. A busca é executada com um timeout de 2s                                                                                                                                                                                                                                                                          |