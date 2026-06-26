# Sugestões de Acompanhamento

O Qwen Code pode prever o que você deseja digitar em seguida e exibir como texto de placeholder na área de entrada. Esse recurso utiliza uma chamada de LLM para analisar o contexto da conversa e gerar uma sugestão natural de próximo passo.

Este recurso funciona de ponta a ponta na CLI. Na WebUI, o hook e a infraestrutura da UI estão disponíveis, mas as aplicações host precisam acionar a geração de sugestões e conectar o estado de followup para que as sugestões apareçam.

## Como Funciona

Depois que o Qwen Code termina de responder, uma sugestão aparece como texto de placeholder esmaecido na área de entrada após um breve atraso (~300ms). Por exemplo, após corrigir um bug, você pode ver:

```
> executar os testes
```

A sugestão é gerada enviando o histórico da conversa para o modelo, que prevê o que você digitaria naturalmente em seguida. Se a resposta contiver uma dica explícita (ex.: `Dica: digite post comments para publicar descobertas`), a ação sugerida é extraída automaticamente.

## Aceitando Sugestões

| Tecla          | Ação                                               |
| -------------- | -------------------------------------------------- |
| `Tab`          | Aceitar a sugestão e preenchê-la na entrada        |
| `Enter`        | Aceitar a sugestão e preenchê-la na entrada        |
| `Seta Direita` | Aceitar a sugestão e preenchê-la na entrada        |
| Qualquer tecla | Descartar a sugestão e digitar normalmente         |

`Enter` preenche a entrada em vez de enviar, então aceitar um comando de barra sugerido (ex.: `/clear`) nunca é executado automaticamente — você o envia com um segundo `Enter`.

## Quando as Sugestões Aparecem

As sugestões são geradas quando todas as seguintes condições são atendidas:

- O modelo concluiu sua resposta (não durante o streaming)
- Pelo menos 2 turnos do modelo ocorreram na conversa
- Não há erros na resposta mais recente
- Nenhum diálogo de confirmação está pendente (ex.: confirmação de shell, permissões)
- O modo de aprovação não está definido como `plan`
- O recurso está ativado (ativado por padrão — defina `ui.enableFollowupSuggestions` como `false` para desligá-lo)

As sugestões não aparecerão no modo não interativo (ex.: modo headless/SDK).

As sugestões são automaticamente descartadas quando:

- Você começa a digitar
- Um novo turno do modelo começa
- A sugestão é aceita

## Modelo Rápido

Por padrão, as sugestões usam o mesmo modelo da sua conversa principal. Para sugestões de menor latência, configure um modelo rápido dedicado:

### Via comando

```
/model --fast qwen3-coder-flash
```

Ou use `/model --fast` (sem um nome de modelo) para abrir um diálogo de seleção.

### Via settings.json

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

O modelo rápido é usado para sugestões de prompt e execução especulativa. Quando não configurado, o modelo da conversa principal é usado como fallback.

> **Nota de custo:** Um modelo rápido reduz a latência, mas nem sempre reduz o custo. A geração de sugestões reutiliza o cache de prefixo da sua conversa (via `ui.enableCacheSharing`, ativado por padrão) — mas um cache de prefixo é por modelo. Apontar `fastModel` para um modelo diferente bifurca para um cache separado, de modo que todo o histórico da conversa é recobrado como entrada não armazenada em cache no modelo rápido. Em conversas longas, o padrão (modelo principal + cache compartilhado) pode ser **mais barato** do que um modelo rápido, pois a maior parte do histórico é cobrada à taxa de cache com desconto. Defina `fastModel` quando a latência for mais importante que o custo por turno.

O modo de raciocínio/pensamento é automaticamente desativado para todas as tarefas em segundo plano (geração de sugestões e especulação), independentemente da configuração de pensamento do seu modelo principal. Isso evita desperdiçar tokens com raciocínio interno que não é necessário para essas tarefas.

## Configuração

Essas configurações podem ser definidas em `settings.json`:

| Configuração                     | Tipo    | Padrão  | Descrição                                                         |
| -------------------------------- | ------- | ------- | ----------------------------------------------------------------- |
| `ui.enableFollowupSuggestions`   | boolean | `true`  | Ativa ou desativa sugestões de acompanhamento                     |
| `ui.enableCacheSharing`          | boolean | `true`  | Usa consultas bifurcadas cientes de cache para reduzir custo (experimental) |
| `ui.enableSpeculation`           | boolean | `false` | Executa sugestões especulativamente antes do envio (experimental) |
| `fastModel`                      | string  | `""`    | Modelo para sugestões de prompt e execução especulativa           |

### Exemplo

```json
{
  "fastModel": "qwen3-coder-flash",
  "ui": {
    "enableFollowupSuggestions": true,
    "enableCacheSharing": true
  }
}
```

## Monitoramento

O uso do modelo de sugestão aparece na saída de `/stats`, mostrando os tokens consumidos pelo modelo rápido para geração de sugestões.

O modelo rápido também é exibido na saída de `/about` sob "Fast Model".

## Qualidade das Sugestões

As sugestões passam por filtros de qualidade para garantir que sejam úteis:

- Devem ter de 2 a 12 palavras (CJK: 2 a 30 caracteres), no máximo 100 caracteres no total
- Não podem ser avaliativas ("parece bom", "obrigado")
- Não podem usar voz de IA ("Deixe-me...", "Eu vou...")
- Não podem ter várias frases ou conter formatação (markdown, quebras de linha)
- Não podem ser metacomentários ("nada a sugerir", "silêncio")
- Não podem ser mensagens de erro ou rótulos prefixados ("Sugestão: ...")
- Sugestões de uma única palavra são permitidas apenas para comandos comuns (yes, commit, push, etc.)
- Comandos de barra (ex.: `/commit`) são sempre permitidos como sugestões de uma única palavra
