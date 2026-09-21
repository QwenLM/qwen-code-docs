# Custo do Contexto Residente

Toda requisição que uma sessão envia carrega o mesmo prefixo antes de qualquer conversa: o prompt do sistema, o schema de cada ferramenta declarada, seus arquivos de contexto (`QWEN.md`) e a listagem de skills. Você paga por esse prefixo em **cada turno**, inclusive nos turnos que apenas respondem a uma pergunta. Esta página trata de medir esse custo e reduzi-lo.

[Token caching](./token-caching.md) reduz o _preço_ do prefixo. Esta página reduz o _prefixo_. As duas coisas se compõem — um prefixo menor também é mais barato quando cacheado.

## Veja pelo que você está pagando

```
/context detail
```

`/context` exibe o detalhamento por categoria; `detail` adiciona linhas por item — cada ferramenta nativa, cada ferramenta MCP, cada arquivo de contexto, cada skill listada — para que você possa ver qual entrada individual é a mais cara. Consulte no **primeiro turno** de uma sessão, onde a conversa ainda está vazia e tudo que você vê é prefixo.

As categorias são o que `/context` reporta, mais duas linhas de contabilidade: `startupContext` (o bloco de ambiente enviado como primeiro turno do usuário) e um residual explícito para o que as categorias não atribuem, de modo que as partes sempre somam o total.

## Use o custo ocioso, não a porcentagem da janela

Uma porcentagem da janela de contexto não é uma meta que você possa manter, porque o denominador é arbitrário. A mesma configuração aparece como 6,5% em um modelo de contexto 1M e 37% em um de 128k — texto idêntico, custo idêntico, número completamente diferente. Use em vez disso:

> **Custo ocioso** — os tokens de entrada de uma sessão que faz uma pergunta e não chama nenhuma ferramenta.

Ele é independente do modelo e da janela, e você não pode melhorá-lo movendo texto de um schema de ferramenta para um arquivo de contexto. Uma segunda leitura útil é **quantos turnos a conversa leva para superar o prefixo**: um prefixo que leva 20 turnos para ser amortizado nunca é amortizado em uma sessão de 5 turnos.

## As alavancas, em ordem de retorno

### 1. Desligue recursos que você não usa

Cada recurso que registra uma ferramenta paga pelo schema dessa ferramenta em cada requisição. As maiores entradas nativas individuais são as que pertencem a recursos opcionais, então uma implantação que não usa workflows, goals, tarefas agendadas ou as ferramentas de review economiza mais desligando esses recursos do que com qualquer quantidade de edição de prompt. Isso também remove a ferramenta dos subagentes, o que a próxima alavanca nem sempre faz.

### 2. Mantenha a superfície de ferramentas eager apenas no que você realmente usa

`tools.eager` é uma allowlist de ferramentas nativas cujos schemas permanecem na requisição inicial. Todo o resto se torna **deferred**: ainda registrado, ainda listado em `/tools`, ainda chamável — o modelo carrega com `tool_search` quando precisar.

```jsonc
{
  "tools": {
    "eager": [
      "read_file",
      "write_file",
      "edit",
      "glob",
      "grep_search",
      "run_shell_command",
      "skill",
    ],
  },
}
```

Quatro coisas para saber antes de usar:

- **Não é uma desativação.** Uma ferramenta rebaixada continua acessível. Se você queria remover uma ferramenta, use uma regra `permissions.deny` de ferramenta inteira ou `tools.disabled`.
- **Algumas ferramentas são isentas** e mantêm seu comportamento normal de carregamento independentemente da lista: `tool_search`, `structured_output`, as ferramentas do ciclo de vida do plan mode (`enter_plan_mode`, `exit_plan_mode`, `ask_user_question`), `task_stop`, ferramentas MCP (`mcp__*`) e ferramentas Computer Use (`computer_use__*`). `task_stop` e a família Computer Use já são sob demanda por padrão, então restringi-las não economizaria nada; ferramentas MCP são regidas por `tools.toolSearch.*` e pelos filtros `includeTools` / `excludeTools` por servidor, e a única maneira de remover uma das três primeiras é `permissions.deny`.
- **`permissions.allow` não economiza nada.** É puramente auto-aprovação: nunca rebaixa, esconde ou remove uma ferramenta. Nem os modos de aprovação.
- **Precisa que `tool_search` esteja ativo.** Se o ToolSearch não estiver registrado — `tools.toolSearch.enabled: false`, uma regra de deny para `tool_search`, ou o opt-out automático para modelos DeepSeek — a allowlist ainda retém os schemas, mas nada pode recarregá-los, e as ferramentas rebaixadas ficam inacessíveis naquela sessão.

`tools.visible` é a saída de emergência para uma ferramenta que você quer declarada de antemão, mesmo que ela seja deferred por padrão.

### 3. Mova a orientação de cenário dos arquivos de contexto para skills

Um arquivo de contexto é concatenado em cada requisição de cada sessão a qual se aplica, sem filtragem por relevância. Uma [skill](./skills.md) é listada apenas pelo nome e descrição — em uma amostra medida, 84 skills tinham média de cerca de 55 tokens cada — e carrega seu corpo quando invocada, e uma skill [com gate por `paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths) nem sequer é listada até que um arquivo correspondente seja tocado.

Mantenha em um arquivo de contexto apenas o que é sempre verdade — identidade, vocabulário, uma restrição rígida — e coloque "ao fazer X, faça Y" em uma skill ou em uma [regra com gate por `paths:`](./rules.md). `/context detail` nomeia cada arquivo de contexto e, para o arquivo de uma [extensão](../extension/getting-started-extensions.md), nomeia a extensão que o possui.

### 4. O prompt do sistema, por último

O prompt base já é a menor das categorias residentes, e cerca de um terço dele é texto de segurança e permissão que não deve ser editado. Ele também agora descreve apenas as ferramentas que a sessão realmente declarou, então reduzir sua superfície de ferramentas o diminui um pouco de graça. Substituí-lo integralmente com `--system-prompt` é possível e é a mudança de maior risco nesta página; se fizer isso, faça diff do prompt upstream em cada upgrade.

## Armadilhas

- **Subagentes também recebem as ferramentas deferred.** Um subagente que não declara uma lista explícita de ferramentas recebe o schema de toda ferramenta registrada, incluindo as deferred, e não passa pelo ToolSearch. `tools.eager` e `permissions.deny` são os únicos controles que o alcançam; o threshold de preload não.
- **O agente de memória em background precisa de seis ferramentas** (`read_file`, `grep_search`, `glob`, `run_shell_command`, `write_file`, `edit`). Negar uma o degrada silenciosamente em vez de gerar erro.
- **Tokens podem se mover em vez de desaparecer.** Remova `grep_search` e `glob` e o modelo pode buscar `grep` e `find` pelo shell, cuja saída vai para a conversa. Nova saída adiciona tokens de entrada quando enviada pela primeira vez; histórico inalterado contendo-a pode atingir o cache de prefixo do provedor em requisições posteriores. Avalie uma mudança pelo total de tokens de entrada por tarefa, input cacheado e não cacheado reportado pelo provedor, e a fatura real, não apenas pelo prefixo.
- **Sessões retomadas reenviam o que precisam.** Uma ferramenta rebaixada que aparece no histórico de uma sessão retomada recebe seu schema de volta automaticamente; uma ferramenta negada não.
- **Uma ferramenta deferred revelada no meio da sessão invalida o cache de prefixo.** Declarações de função ficam no início absoluto do prefixo, então uma revelação o reescreve e todo o prompt é recalculado para aquele turno. Pré-carregar o conjunto deferred (`tools.toolSearch.threshold`) evita isso ao custo de carregar esses schemas em cada turno; `threshold: 0` só vale se a sessão genuinamente nunca precisar deles.
- **Modelos com cache de prefixo invertem a troca.** Para modelos cujo desconto depende de um prefixo estável, manter o prefixo idêntico vale mais do que torná-lo pequeno; modelos DeepSeek fazem opt-out do ToolSearch automaticamente por esse motivo.
- **Escopos vazam.** Configurações se aplicam a todo cliente que as lê (CLI, Web Shell, serve), então uma superfície de ferramentas por implantação precisa de seu próprio escopo de configurações.

## Verifique a economia

1. Anote o custo ocioso antes da mudança: uma sessão nova, uma pergunta trivial, `/context` no primeiro turno.
2. Aplique uma alavanca por vez e repita, reiniciando a sessão — a maioria dessas configurações é lida na inicialização.
3. Confirme que a capability sobreviveu, no seu próprio conjunto de tarefas: taxa de sucesso de chamadas de ferramenta, com que frequência `tool_search` precisa ser chamado, e resultados das tarefas. Uma ferramenta rebaixada que o modelo nunca pensa em procurar não falha de forma visível; simplesmente deixa de ser usada.
4. Verifique a fatura, não apenas o prefixo — veja a armadilha sobre tokens migrando para a conversa.

## Veja também

- [Token Caching](./token-caching.md) — o que o cache faz com o preço do que resta.
- [Rules](./rules.md) — contexto condicional por `paths:`, incluindo o que uma extensão pode contribuir.
- [Skills](./skills.md) — divulgação progressiva e gate por `paths:`.
- [Settings reference](../configuration/settings.md) — a semântica exata de `tools.eager`, `tools.visible`, `tools.disabled`, `tools.toolSearch.*`, `permissions.deny`.