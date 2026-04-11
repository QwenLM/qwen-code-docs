# Sugestões de Continuação

O Qwen Code pode prever o que você deseja digitar a seguir e exibir a previsão como ghost text na área de entrada. Esse recurso utiliza uma chamada de LLM para analisar o contexto da conversa e gerar uma sugestão natural para o próximo passo.

Esse recurso funciona de ponta a ponta na CLI. Na WebUI, o hook e a infraestrutura de UI estão disponíveis, mas as aplicações host precisam acionar a geração de sugestões e conectar o estado de continuação para que as sugestões sejam exibidas.

## Como Funciona

Após o Qwen Code concluir a resposta, uma sugestão aparece como texto esmaecido na área de entrada após um breve atraso (~300ms). Por exemplo, após corrigir um bug, você pode ver:

```
> run the tests
```

A sugestão é gerada enviando o histórico da conversa para o modelo, que prevê o que você digitaria naturalmente a seguir. Se a resposta contiver uma dica explícita (por exemplo, `Tip: type post comments to publish findings`), a ação sugerida é extraída automaticamente.

## Aceitando Sugestões

| Tecla         | Ação                                           |
| ------------- | ------------------------------------------------ |
| `Tab`         | Aceita a sugestão e a preenche na entrada |
| `Enter`       | Aceita a sugestão e a envia imediatamente  |
| `Right Arrow` | Aceita a sugestão e a preenche na entrada |
| Qualquer digitação    | Descarta a sugestão e permite digitar normalmente         |

## Quando as Sugestões Aparecem

As sugestões são geradas quando todas as condições a seguir são atendidas:

- O modelo concluiu a resposta (não durante o streaming)
- Ocorreram pelo menos 2 turnos do modelo na conversa
- Não há erros na resposta mais recente
- Não há diálogos de confirmação pendentes (ex.: confirmação de shell, permissões)
- O modo de aprovação não está definido como `plan`
- O recurso está ativado nas configurações (ativado por padrão)

As sugestões não aparecerão no modo não interativo (ex.: modo headless/SDK).

As sugestões são descartadas automaticamente quando:

- Você começa a digitar
- Um novo turno do modelo começa
- A sugestão é aceita

## Modelo Rápido

Por padrão, as sugestões usam o mesmo modelo da sua conversa principal. Para sugestões mais rápidas e baratas, configure um modelo rápido dedicado:

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

O modo de pensamento/razão (thinking/reasoning) é desativado automaticamente para todas as tarefas em segundo plano (geração de sugestões e especulação), independentemente da configuração de pensamento do seu modelo principal. Isso evita o desperdício de tokens com raciocínio interno que não é necessário para essas tarefas.

## Configuração

Essas configurações podem ser definidas no `settings.json`:

| Setting                        | Type    | Default | Description                                                        |
| ------------------------------ | ------- | ------- | ------------------------------------------------------------------ |
| `ui.enableFollowupSuggestions` | boolean | `true`  | Ativa ou desativa sugestões de continuação                             |
| `ui.enableCacheSharing`        | boolean | `true`  | Usa consultas bifurcadas com otimização de cache para reduzir custos (experimental)       |
| `ui.enableSpeculation`         | boolean | `false` | Executa sugestões de forma especulativa antes do envio (experimental) |
| `fastModel`                    | string  | `""`    | Modelo para sugestões de prompt e execução especulativa             |

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

O uso do modelo de sugestões aparece na saída de `/stats`, mostrando os tokens consumidos pelo modelo rápido para a geração de sugestões.

O modelo rápido também é exibido na saída de `/about` em "Fast Model".

## Qualidade das Sugestões

As sugestões passam por filtros de qualidade para garantir que sejam úteis:

- Deve ter de 2 a 12 palavras (CJK: 2 a 30 caracteres), com menos de 100 caracteres no total
- Não pode ser avaliativa ("looks good", "thanks")
- Não pode usar voz de IA ("Let me...", "I'll...")
- Não pode conter múltiplas frases ou formatação (markdown, quebras de linha)
- Não pode ser metacomentário ("nothing to suggest", "silence")
- Não pode ser mensagens de erro ou rótulos prefixados ("Suggestion: ...")
- Sugestões de uma única palavra são permitidas apenas para comandos comuns (yes, commit, push, etc.)
- Comandos slash (ex.: `/commit`) são sempre permitidos como sugestões de uma única palavra