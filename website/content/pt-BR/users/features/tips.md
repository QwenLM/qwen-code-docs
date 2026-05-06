# Dicas Contextuais

O Qwen Code inclui um sistema de dicas contextuais que ajuda você a descobrir recursos e acompanhar o estado da sessão.

## Dicas de Inicialização

Sempre que você inicia o Qwen Code, uma dica é exibida no cabeçalho. A seleção das dicas segue a ordem de prioridade e, em seguida, elas são alternadas entre as sessões usando o agendamento LRU (least-recently-used) para dicas de mesma prioridade, garantindo que você veja uma dica diferente a cada vez.

Novos usuários veem dicas focadas em onboarding durante suas primeiras sessões:

| Sessões | Exemplos de dicas                                      |
| ------- | ------------------------------------------------------ |
| < 5     | Comandos slash (`/`), Autocompletar com Tab            |
| < 10    | Contexto do projeto `QWEN.md`, `--continue` / `--resume` |
| < 15    | Comandos de shell com prefixo `!`                      |

Após esse período, as dicas alternam entre recursos gerais como `/compress`, `/approval-mode`, `/insight`, `/btw` e outros.

## Dicas Pós-Resposta

Durante uma conversa, o Qwen Code monitora o uso da janela de contexto e exibe dicas quando uma ação pode ser necessária:

| Uso do contexto | Condição                          | Dica                                                |
| --------------- | --------------------------------- | --------------------------------------------------- |
| 50-80%          | Após alguns prompts na sessão     | Sugere `/compress` para liberar contexto            |
| 80-95%          | —                                 | Alerta que o contexto está ficando cheio            |
| >= 95%          | —                                 | Urgente: execute `/compress` agora ou `/new` para continuar |

As dicas pós-resposta possuem cooldowns individuais para evitar repetições.

## Histórico de Dicas

O histórico de exibição das dicas é armazenado em `~/.qwen/tip_history.json`. Esse arquivo rastreia:

- Contagem de sessões (usada para selecionar dicas para novos usuários)
- Quais dicas foram exibidas e quando (usado para rotação LRU e cooldown)

Você pode excluir esse arquivo com segurança para redefinir o histórico de dicas.

## Desativando Dicas

Para ocultar todas as dicas (tanto de inicialização quanto pós-resposta), defina `ui.hideTips` como `true` em `~/.qwen/settings.json`:

```json
{
  "ui": {
    "hideTips": true
  }
}
```

Você também pode alternar essa opção na janela de configurações usando o comando `/settings`.

As dicas também são ocultadas automaticamente quando o modo de leitor de tela está ativado.