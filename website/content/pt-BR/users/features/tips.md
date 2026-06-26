# Dicas Contextuais

O Qwen Code inclui um sistema de dicas contextuais que ajuda você a descobrir recursos e ficar ciente do estado da sessão.

## Dicas de Inicialização

Cada vez que você inicia o Qwen Code, uma dica é exibida na área do cabeçalho. As dicas são selecionadas primeiro por prioridade e depois rotacionadas entre as sessões usando agendamento LRU (least-recently-used, ou menos recentemente usado) entre dicas da mesma prioridade, para que você veja uma dica diferente a cada vez.

Novos usuários veem dicas focadas na integração durante as primeiras sessões:

| Sessões | Exemplos de dicas                          |
| ------- | ------------------------------------------ |
| < 5     | Comandos de barra (`/`), Autocomplete de Tab |
| < 10    | Contexto do projeto `QWEN.md`, `--continue` / `--resume` |
| < 15    | Comandos Shell com prefixo `!`             |

Depois disso, as dicas alternam entre recursos gerais como `/compress`, `/approval-mode`, `/insight`, `/btw`, e mais.

## Dicas Pós-Resposta

Durante uma conversa, o Qwen Code monitora o uso da janela de contexto e mostra dicas quando uma ação pode ser necessária:

| Uso do contexto | Condição                      | Dica                                               |
| --------------- | ----------------------------- | -------------------------------------------------- |
| 50-80%          | Após alguns prompts na sessão | Sugere `/compress` para liberar contexto           |
| 80-95%          | —                             | Avisa que o contexto está ficando cheio             |
| >= 95%          | —                             | Urgente: execute `/compress` agora ou `/new` para continuar |

Dicas pós-resposta têm períodos de espera por dica para evitar repetição.

## Histórico de Dicas

O histórico de exibição de dicas é persistido em `~/.qwen/tip_history.json`. Este arquivo rastreia:

- Contagem de sessões (usada para seleção de dicas para novos usuários)
- Quais dicas foram mostradas e quando (usado para rotação LRU e período de espera)

Você pode excluir este arquivo com segurança para redefinir o histórico de dicas.

## Desabilitando Dicas

Para ocultar todas as dicas (tanto de inicialização quanto pós-resposta), defina `ui.hideTips` como `true` em `~/.qwen/settings.json`:

```json
{
  "ui": {
    "hideTips": true
  }
}
```

Você também pode alternar isso na caixa de diálogo de configurações através do comando `/settings`.

As dicas também são ocultadas automaticamente quando o modo leitor de tela está ativado.