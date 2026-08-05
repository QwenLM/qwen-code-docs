# Seleção de grau de modelo de subagente

## Objetivo

Permitir que o modelo escolha um grau de modelo definido pelo usuário ao
iniciar um subagente comum, sem expor IDs de modelo específicos de provedor
no schema da ferramenta Agent.

```json
{
  "agents": {
    "modelGrades": {
      "small": "fast",
      "high": "qwen-max"
    },
    "allowedGrades": ["small", "high"]
  }
}
```

A ferramenta Agent anuncia `model: "small" | "high"` e resolve o grau
selecionado imediatamente após carregar a configuração do subagente.

## Resolução

O seletor de modelo efetivo usa esta prioridade:

1. Um modelo explícito, diferente de `inherit`, de um agente não embutido
2. Um grau permitido mapeado por `agents.modelGrades`
3. A configuração do modelo embutido do Explore
4. O modelo pai herdado

Graus desconhecidos ou não permitidos são rejeitados. Forks rejeitam o
parâmetro porque devem herdar o modelo e o cache de prompt do pai. Teammates
de equipe nomeados também o rejeitam porque seu override de modelo de backend
aceita IDs de modelo concretos em vez de seletores de grau.

Apenas nomes de grau configurados e permitidos são incluídos no schema
dinâmico da ferramenta. Seletores de modelo concretos permanecem privados
nas configurações do usuário.

## Verificação

- Schema de configurações e encaminhamento de configuração do CLI para o core
- Resolução de grau, filtragem por allowlist e prioridade de agente
  personalizado
- Schema dinâmico da ferramenta Agent sem IDs de modelo concretos
- Despacho comum em primeiro plano e em segundo plano usando o modelo
  resolvido
- Validação de fork
