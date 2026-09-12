# Sugestões de Acompanhamento

O Qwen Code pode prever o que você deseja digitar em seguida e exibir como texto de placeholder na área de entrada. Esse recurso utiliza uma chamada de LLM para analisar o contexto da conversa e gerar uma sugestão natural para o próximo passo.

Esse recurso funciona de ponta a ponta tanto no CLI quanto na Web Shell. A geração é automática e ocorre no lado do servidor: após cada turno concluído corretamente (o motivo de parada `end_turn` do daemon — um turno `cancelled`, `refusal`, `max_tokens` ou `max_turn_requests` não recebe sugestão), o daemon emite a sugestão no stream da sessão (ativado por padrão; defina `ui.enableFollowupSuggestions` como `false` para desativar), e o composer da Web Shell já conecta o hook `useDaemonFollowupSuggestion`, então as sugestões são exibidas e aceitas sem necessidade de configuração adicional no host.

## Como Funciona

Após o Qwen Code terminar de responder, uma sugestão aparece como texto de placeholder atenuado na área de entrada após um breve atraso (~300ms). Por exemplo, após corrigir um bug, você pode ver:

```
> run the tests
```

A sugestão é gerada enviando o histórico da conversa ao modelo, que prevê o que você digitaria naturalmente a seguir. Se a resposta contiver uma dica explícita (por exemplo, `Tip: type post comments to publish findings`), a ação sugerida é extraída automaticamente.

## Aceitando Sugestões

| Tecla          | Ação                                            |
| -------------- | ----------------------------------------------- |
| `Tab`          | Aceitar a sugestão e preenchê-la na entrada      |
| `Enter`        | Aceitar a sugestão e preenchê-la na entrada      |
| `Right Arrow`  | Aceitar a sugestão e preenchê-la na entrada      |
| Qualquer digitação | Descartar a sugestão e digitar normalmente    |

`Enter` preenche a entrada em vez de enviar, portanto, aceitar um comando slash sugerido (ex.: `/clear`) nunca é executado automaticamente — você mesmo o envia com um segundo `Enter`.

## Quando as Sugestões Aparecem

O CLI interativo e o daemon decidem isso separadamente, e eles não aplicam as mesmas condições: o CLI controla a geração em seus próprios renderizadores, enquanto o daemon controla no lado do servidor para cada cliente conectado à sessão.

Ambos os lados requerem todas as seguintes condições:

- Pelo menos 2 turnos do modelo ocorreram na conversa
- O modo de aprovação não está definido como `plan`
- O recurso está habilitado (ativado por padrão — defina `ui.enableFollowupSuggestions` como `false` para desativá-lo)

O CLI interativo adicionalmente requer:

- A sessão é interativa — o CLI nunca gera sugestões em seu próprio modo não interativo ou SDK
- O modelo concluiu sua resposta (não durante o streaming)
- Não há erros na resposta mais recente
- Nenhum diálogo de confirmação está pendente (ex.: confirmação do shell, permissões)

O daemon adicionalmente requer:

- O turno terminou corretamente, ou seja, seu motivo de parada é `end_turn` — um turno cancelado, recusado ou truncado não recebe sugestão
- Os turnos automáticos não estão sendo retidos pelo todo stop guard, e nenhum prompt enfileirado está aguardando execução
- A entrada mais recente no histórico da conversa é uma resposta do modelo

Como a geração no lado do daemon ocorre para cada cliente conectado à sessão, ela também ocorre para clientes que não conseguem exibir o resultado. Um cliente assim — um consumidor headless ou SDK de uma sessão do daemon, que não é o modo não interativo do CLI mencionado acima — deve definir `ui.enableFollowupSuggestions` como `false` para evitar o custo de LLM por turno para uma saída que descarta.

As sugestões são descartadas automaticamente quando:

- Você começa a digitar
- Um novo turno do modelo começa
- A sugestão é aceita

## Modelo Rápido

Por padrão, as sugestões usam o mesmo modelo da sua conversa principal. Para sugestões com menor latência, configure um modelo rápido dedicado:

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

> **Nota de custo:** Um modelo rápido reduz a latência, mas nem sempre reduz o custo. A geração de sugestões reutiliza o cache de prefixo da sua conversa (via `ui.enableCacheSharing`, ativado por padrão) — mas um cache de prefixo é por modelo. Apontar `fastModel` para um modelo diferente bifurca para um cache separado, de modo que todo o histórico da conversa é re-faturado como entrada não cacheada no modelo rápido. Em conversas longas, o padrão (modelo principal + cache compartilhado) pode ser **mais barato** do que um modelo rápido, já que a maior parte do histórico é cobrada à taxa descontada de cache. Defina `fastModel` quando a latência importar mais que o custo por turno.

O modo thinking/reasoning é desabilitado automaticamente para todas as tarefas em segundo plano (geração de sugestões e especulação), independentemente da configuração de pensamento do seu modelo principal. Isso evita desperdiçar tokens com raciocínio interno que não é necessário para essas tarefas.

## Configuração

Estas configurações podem ser definidas em `settings.json`:

| Configuração                     | Tipo    | Padrão | Descrição                                                                         |
| -------------------------------- | ------- | ------ | --------------------------------------------------------------------------------- |
| `ui.enableFollowupSuggestions`   | boolean | `true` | Habilitar ou desabilitar sugestões de acompanhamento                              |
| `ui.enableCacheSharing`          | boolean | `true` | Usar consultas bifurcadas com cache para reduzir custo (experimental)             |
| `ui.enableSpeculation`           | boolean | `false` | Executar sugestões especulativamente antes do envio (experimental)                |
| `fastModel`                      | string  | `""`   | Modelo para sugestões de prompt e execução especulativa                           |

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

O modelo rápido também é mostrado na saída de `/about` em "Fast Model".

## Qualidade das Sugestões

As sugestões passam por filtros de qualidade para garantir que sejam úteis:

- Devem ter de 2 a 12 palavras (CJK: de 2 a 30 caracteres), no máximo 100 caracteres no total
- Não podem ser avaliativas ("parece bom", "obrigado")
- Não podem usar voz de IA ("Deixe-me...", "Eu vou...")
- Não podem ter múltiplas frases ou conter formatação (markdown, quebras de linha)
- Não podem ser metacomentários ("nada a sugerir", "silêncio")
- Não podem ser mensagens de erro ou rótulos prefixados ("Sugestão: ...")
- Sugestões de uma palavra só são permitidas para comandos comuns (yes, commit, push, etc.)
- Comandos slash (ex.: `/commit`) são sempre permitidos como sugestões de uma palavra