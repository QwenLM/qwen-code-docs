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

Cada ferramenta declarada ao modelo adiciona seu schema a cada requisição. Desligar recursos opcionais com ferramentas residentes grandes pode, portanto, economizar tokens de requisição. Ferramentas deferred, por outro lado, contribuem com entradas curtas de catálogo e o custo de descoberta ou invocação posterior. Desabilitar um recurso também remove suas ferramentas dos subagentes, o que a próxima alavanca nem sempre faz.

### 2. Mantenha a superfície de ferramentas eager apenas no que você realmente usa

`tools.eager` é uma allowlist de ferramentas nativas cujos schemas permanecem na requisição inicial. Todo o resto se torna **deferred**: ainda registrado, ainda listado em `/tools`, ainda chamável — o modelo o alcança através da ponte `tool_search` → `tool_call` quando precisa.

Meça a allowlist em relação à base correta. Ferramentas que são sob demanda por seu _próprio_ padrão já estão ausentes da primeira requisição, e desde que `tools.toolSearch.threshold` passou a ter padrão `0` nada as pré-carrega de volta, então a economia de uma allowlist é apenas os schemas das ferramentas eager-por-padrão que ela retém — não toda a superfície nativa. Faça uma nova leitura de `/context` na versão que você realmente executa antes de atribuir um número à sua lista.

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
- **Algumas ferramentas são isentas** e mantêm seu comportamento normal de carregamento independentemente da lista: `tool_search` e `tool_call` (as duas metades da ponte que alcança uma ferramenta retida), `structured_output`, as ferramentas do ciclo de vida do plan mode (`enter_plan_mode`, `exit_plan_mode`, `ask_user_question`), `task_stop`, ferramentas MCP (`mcp__*`) e ferramentas Computer Use (`computer_use__*`). `task_stop` e a família Computer Use já são sob demanda por padrão, então restringi-las não economizaria nada; ferramentas MCP são regidas por `tools.toolSearch.*` e pelos filtros `includeTools` / `excludeTools` por servidor; e nada em `tools.eager` pode remover uma das demais: isso requer uma regra `permissions.deny` de ferramenta inteira, uma entrada `tools.disabled` ou `--exclude-tools` — e para o par da ponte, `tools.toolSearch.enabled: false` remove ambas as metades de uma vez. Remover uma metade da ponte não é uma saída neutra da allowlist: toda ferramenta deferred ordinária (todas as ferramentas MCP, a família Computer Use deferred) é então forçada a ser declarada em cada requisição, enquanto uma ferramenta retida não é oferecida ao modelo e não pode ser recarregada através da ponte — ela permanece registrada, então uma chamada direta por nome ainda passa pela aprovação normal.
- **`permissions.allow` não economiza nada.** É puramente auto-aprovação: nunca rebaixa, esconde ou remove uma ferramenta. Nem os modos de aprovação.
- **Precisa das duas metades da ponte.** Uma ferramenta retida é consultada com `tool_search` e invocada através de `tool_call`; `tool_search` sozinho pode ler um schema que não pode chamar. Se qualquer uma estiver desregistrada — `tools.toolSearch.enabled: false` nega ambas; uma regra de deny para `tool_search`/`tool_call`, uma entrada `--exclude-tools` ou uma entrada `tools.disabled` remove uma — a allowlist ainda retém os schemas, nada pode recarregá-los, e as ferramentas rebaixadas não são oferecidas ao modelo naquela sessão (um aviso é registrado); elas permanecem registradas, então uma chamada direta por nome ainda passa pela aprovação normal. Ferramentas deferred ordinárias voltam a ser declaradas eager nesse caso; ferramentas que você rebaixou com `tools.eager` não.

`tools.visible` é a saída de emergência para uma ferramenta que você quer declarada de antemão, mesmo que ela seja deferred por padrão.

A coordenação de Agent e Goal (`agent`, `list_agents`, `get_goal`, `update_goal` e `propose_goal`) é deferred por padrão; nenhuma configuração de `tools.eager` é necessária. O modelo vê entradas curtas de descoberta em vez dos schemas completos. Seu primeiro uso precisa de descoberta através da ponte, então compare o custo da tarefa inteira e o sucesso da delegação/conclusão de Goal, além da primeira requisição. Essas são ferramentas deferred ordinárias: `tools.visible`, pré-carregamento e o fallback eager de ponte incompleta descrito acima ainda se aplicam. O pré-carregamento é tudo-ou-nada sobre todo o pool de candidatos deferred, e essas cinco declarações são grandes, então um `tools.toolSearch.threshold` que costumava revelar todas as ferramentas deferred no início da sessão pode agora não revelar nenhuma. Faça uma nova leitura de `/context` após alterar qualquer um dos dois.

### 3. Mova a orientação de cenário dos arquivos de contexto para skills

Um arquivo de contexto é concatenado em cada requisição de cada sessão a qual se aplica, sem filtragem por relevância. Uma [skill](./skills.md) é listada apenas pelo nome e descrição — em uma amostra medida, 84 skills tinham média de cerca de 55 tokens cada — e carrega seu corpo quando invocada, e uma skill [com gate por `paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths) nem sequer é listada até que um arquivo correspondente seja tocado.

Mantenha em um arquivo de contexto apenas o que é sempre verdade — identidade, vocabulário, uma restrição rígida — e coloque "ao fazer X, faça Y" em uma skill ou em uma [regra com gate por `paths:`](./rules.md). `/context detail` nomeia cada arquivo de contexto e, para o arquivo de uma [extensão](../extension/getting-started-extensions.md), nomeia a extensão que o possui.

### 4. O prompt do sistema, por último

O prompt base já é a menor das categorias residentes, e cerca de um terço dele é texto de segurança e permissão que não deve ser editado. Sua orientação de ferramentas com gate segue o conjunto declarado, com uma exceção para o Agent alcançável pela ponte; outras ferramentas nomeadas por essas entradas ainda precisam de declarações. Reduzir sua superfície de ferramentas pode, portanto, encolher essa orientação também. Substituí-lo integralmente com `--system-prompt` é possível e é a mudança de maior risco nesta página; se fizer isso, faça diff do prompt upstream em cada upgrade.

## Armadilhas

- **Subagentes também recebem as ferramentas deferred.** Um subagente que não declara uma lista explícita de ferramentas recebe o schema de toda ferramenta registrada, incluindo as deferred, e não passa pelo ToolSearch. `tools.eager` e `permissions.deny` são os únicos controles que o alcançam; o threshold de preload não.
- **Os agentes de memória em background precisam de suas listas completas de ferramentas, e as duas listas diferem.** O worker Dream do projeto precisa de seis ferramentas (`read_file`, `grep_search`, `glob`, `run_shell_command`, `write_file`, `edit`); a extração automática precisa de cinco — o mesmo conjunto sem `run_shell_command`, que ela nega por design. Negar uma ferramenta que qualquer um dos agentes realmente possui o degrada silenciosamente em vez de gerar erro. Portanto, não negue `run_shell_command` globalmente apenas para remover sua declaração: o Dream ainda precisa dela.
- **Tokens podem se mover em vez de desaparecer.** Remova `grep_search` e `glob` e o modelo pode buscar `grep` e `find` pelo shell, cuja saída vai para a conversa. Nova saída adiciona tokens de entrada quando enviada pela primeira vez; histórico inalterado contendo-a pode atingir o cache de prefixo do provedor em requisições posteriores. Avalie uma mudança pelo total de tokens de entrada por tarefa, input cacheado e não cacheado reportado pelo provedor, e a fatura real, não apenas pelo prefixo.
- **Sessões retomadas reenviam o que precisam.** Uma ferramenta rebaixada que aparece no histórico de uma sessão retomada recebe seu schema de volta automaticamente; uma ferramenta negada não.
- **Alcançar uma ferramenta retida não reescreve mais o prefixo — mas costumava reescrever, e conselhos antigos assumem que sim.** A descoberta passa pela ponte `tool_search` → `tool_call`, que mantém a lista de ferramentas declaradas byte-estável, então o prefixo do cache de prompt sobrevive a uma descoberta no meio da sessão; o custo é uma ida e volta extra antes do primeiro uso de uma ferramenta retida. É por isso que `tools.toolSearch.threshold` agora tem padrão `0`: carregar o conjunto deferred a cada turno não é mais o lado mais barato da troca. Aumente o threshold apenas para recuperar aquela ida e volta para ferramentas deferred _ordinárias_ (ferramentas MCP e as nativas sob demanda) em uma sessão que certamente precisará delas — ele nunca pré-carrega uma ferramenta que você rebaixou com `tools.eager`; essas permanecem atrás da ponte em qualquer threshold. O pré-carregamento também é executado no início da sessão, e os servidores MCP geralmente conectam depois, então um lançamento fresco não declara nenhuma ferramenta MCP independentemente do threshold; elas alcançam o pré-carregamento no próximo início de sessão (no CLI, após `/clear`), ou imediatamente sob `QWEN_CODE_LEGACY_MCP_BLOCKING=1`.
- **Modelos com cache de prefixo costumavam inverter essa troca; para deferral, não invertem mais.** Para um modelo cujo desconto depende de um prefixo inalterado, manter a lista de declarações idêntica já importou mais do que mantê-la pequena — é por isso que algumas implantações desativavam o ToolSearch manualmente. Alcançar uma ferramenta retida agora mantém essa lista byte-estável, então essa razão particular expirou — com uma exceção, declarada na própria descrição do `tool_search`: uma atualização do conjunto de ferramentas ainda pode re-declarar uma ferramenta retida quando o histórico ao vivo contém uma chamada direta a ela, e isso move o prefixo. A estabilidade do prefixo ainda argumenta contra qualquer outra coisa que reescreva o prefixo no meio da sessão, como editar um arquivo de contexto entre turnos.
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