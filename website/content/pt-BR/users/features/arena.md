# Agent Arena

> Despache múltiplos modelos de IA simultaneamente para executar a mesma tarefa, compare suas soluções lado a lado e selecione o melhor resultado para aplicar ao seu workspace.

> [!warning]
> O Agent Arena é experimental. Ele possui [limitações conhecidas](#limitations) em relação a modos de exibição e gerenciamento de sessão.

O Agent Arena permite que você coloque vários modelos de IA uns contra os outros na mesma tarefa. Cada modelo é executado como um agente completamente independente em sua própria Git worktree isolada, de modo que as operações de arquivo nunca interferem. Quando todos os agentes terminam, você compara os resultados e seleciona um vencedor para mesclar de volta ao seu workspace principal.

Diferentemente dos [subagentes](./sub-agents.md), que delegam subtarefas focadas dentro de uma única sessão, os agentes do Arena são instâncias completas de agentes de alto nível — cada um com seu próprio modelo, janela de contexto e acesso total a ferramentas.

Esta página cobre:

- [Quando usar o Agent Arena](#when-to-use-agent-arena)
- [Iniciar uma sessão de arena](#start-an-arena-session)
- [Interagir com os agentes](#interact-with-agents), incluindo modos de exibição e navegação
- [Comparar resultados e selecionar um vencedor](#compare-results-and-select-a-winner)
- [Melhores práticas](#best-practices)

## Quando usar o Agent Arena

O Agent Arena é mais eficaz quando você deseja **avaliar ou comparar** como diferentes modelos abordam o mesmo problema. Os casos de uso mais fortes são:

- **Benchmarking de modelos**: Avalie as capacidades de diferentes modelos em tarefas reais no seu código real, não em benchmarks sintéticos
- **Seleção best-of-N**: Obtenha múltiplas soluções independentes e escolha a melhor implementação
- **Explorar abordagens**: Veja como diferentes modelos raciocinam e resolvem o mesmo problema — útil para aprendizado e entendimento
- **Redução de riscos**: Para mudanças críticas, valide que múltiplos modelos convergem para uma abordagem semelhante antes de commitar

O Agent Arena utiliza significativamente mais tokens do que uma sessão única (cada agente tem sua própria janela de contexto e chamadas de modelo). Ele funciona melhor quando o valor da comparação justifica o custo. Para tarefas rotineiras em que você confia no seu modelo padrão, uma sessão única é mais eficiente.

## Iniciar uma sessão de arena

Use o comando de barra `/arena` para iniciar uma sessão. Especifique os modelos que você deseja que compitam e a tarefa:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refatorar o módulo de autenticação para usar tokens JWT"
```

Se você omitir `--models`, uma caixa de diálogo interativa de seleção de modelos aparece, permitindo que você escolha entre seus provedores configurados.

### O que acontece quando você inicia

1. **Configuração da worktree**: O Qwen Code cria Git worktrees isoladas para cada agente em `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Cada worktree espelha exatamente o estado atual do seu diretório de trabalho — incluindo mudanças staged, unstaged e arquivos não rastreados.
2. **Criação de agentes**: Cada agente inicia em sua própria worktree com acesso total a ferramentas e o modelo configurado. Os agentes são lançados sequencialmente, mas executam em paralelo.
3. **Execução**: Todos os agentes trabalham na tarefa de forma independente, sem estado compartilhado ou comunicação. Você pode monitorar o progresso e interagir com qualquer um deles.
4. **Conclusão**: Quando todos os agentes terminam (ou falham), você entra na fase de comparação de resultados.

## Interagir com os agentes

### Modos de exibição

O Agent Arena atualmente suporta o **modo em processo**, no qual todos os agentes são executados de forma assíncrona dentro do mesmo processo do terminal. Uma barra de abas na parte inferior do terminal permite que você alterne entre os agentes.

> [!note]
> **Modos de exibição em painéis divididos estão planejados para o futuro.** Pretendemos oferecer suporte a layouts baseados em tmux e iTerm2 com painéis divididos, onde cada agente tem seu próprio painel de terminal para visualização lado a lado verdadeira. Atualmente, apenas a troca de abas em processo está disponível.

### Navegar entre agentes

No modo em processo, use atalhos de teclado para alternar entre as visualizações dos agentes:

| Atalho   | Ação                                |
| :------- | :---------------------------------- |
| `Right`  | Alternar para a próxima aba do agente |
| `Left`   | Alternar para a aba anterior do agente |
| `Up`     | Focar na caixa de entrada            |
| `Down`   | Focar na barra de abas do agente     |

A barra de abas mostra o status atual de cada agente:

| Indicador | Significado                |
| :-------- | :------------------------- |
| `●`       | Executando ou ocioso        |
| `✓`       | Concluído com sucesso       |
| `✗`       | Falhou                     |
| `○`       | Cancelado                  |

### Interagir com agentes individuais

Ao visualizar a aba de um agente, você pode:

- **Enviar mensagens** — digite na área de entrada para dar instruções adicionais ao agente
- **Aprovar chamadas de ferramenta** — se um agente solicitar aprovação de ferramenta, a caixa de diálogo de confirmação aparece em sua aba
- **Ver histórico completo** — role pela conversa completa do agente, incluindo saída do modelo, chamadas de ferramenta e resultados

Cada agente é uma sessão completa e independente. Tudo que você pode fazer com o agente principal, você pode fazer com um agente da arena.

## Comparar resultados e selecionar um vencedor

Quando todos os agentes concluem, o Arena entra na fase de comparação de resultados. Você verá:
- **Resumo de status**: Quais agentes tiveram sucesso, falharam ou foram cancelados
- **Métricas de execução**: Duração, rodadas de raciocínio, uso de tokens e contagens de chamadas de ferramentas para cada agente
- **Resumo da comparação da Arena**: Arquivos alterados em comum vs. por apenas um agente, contagens de linhas alteradas, eficiência de tokens e um resumo de alto nível da abordagem gerado a partir do diff, métricas e histórico de conversação de cada agente

Uma caixa de diálogo de seleção apresenta os agentes bem-sucedidos. Escolha um para aplicar suas alterações ao seu workspace principal, ou descarte todos os resultados. Pressione `p` para alternar uma prévia rápida para o agente destacado, ou `d` para alternar o diff detalhado desse agente antes de selecionar um vencedor.

### O que acontece quando você seleciona um vencedor

1. As alterações do agente vencedor são extraídas como um diff contra a linha de base
2. O diff é aplicado ao seu diretório de trabalho principal
3. Todas as worktrees e branches temporárias são limpas automaticamente

Se você quiser inspecionar o caminho completo de raciocínio antes de decidir, o histórico completo de conversação de cada agente ainda está disponível através da barra de abas enquanto a caixa de diálogo de seleção estiver ativa.

## Configuração

O comportamento da Arena pode ser personalizado em [settings.json](../configuration/settings.md):

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Configuração               | Descrição                              | Padrão          |
| :------------------------- | :------------------------------------- | :-------------- |
| `arena.worktreeBaseDir`    | Diretório base para as worktrees da Arena | `~/.qwen/arena` |
| `arena.maxRoundsPerAgent`  | Número máximo de rodadas de raciocínio por agente | `50`            |
| `arena.timeoutSeconds`     | Tempo limite para cada agente em segundos | `600`           |

## Melhores práticas

### Escolha modelos que se complementam

A Arena é mais valiosa quando você compara modelos com pontos fortes significativamente diferentes. Por exemplo:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Otimize a camada de consulta ao banco de dados"
```

Comparar três versões da mesma família de modelos produz menos insight do que comparar entre provedores.

### Mantenha as tarefas autocontidas

Os agentes da Arena trabalham de forma independente, sem comunicação. As tarefas devem ser totalmente descritíveis no prompt sem exigir idas e vindas:

**Bom**: "Refatore o módulo de pagamento para usar o padrão strategy. Atualize todos os testes."

**Menos eficaz**: "Vamos discutir como melhorar o módulo de pagamento" — isso se beneficia de conversação, que é mais adequada para uma única sessão.

### Limite o número de agentes

Até 5 agentes podem ser executados simultaneamente. Na prática, 2-3 agentes fornecem o melhor equilíbrio entre valor de comparação e custo de recursos. Mais agentes significam:

- Custos mais altos de tokens (cada agente tem sua própria janela de contexto)
- Maior tempo total de execução
- Mais resultados para comparar

Comece com 2-3 e aumente apenas quando o valor da comparação justificar.

### Use a Arena para decisões de alto impacto

A Arena brilha quando os riscos justificam a execução de vários modelos:

- Escolher uma arquitetura para um novo módulo
- Selecionar uma abordagem para uma refatoração complexa
- Validar uma correção crítica de bug de vários ângulos

Para alterações rotineiras, como renomear uma variável ou atualizar um arquivo de configuração, uma única sessão é mais rápida e barata.

## Solução de problemas

### Agentes falhando ao iniciar

- Verifique se cada modelo em `--models` está configurado corretamente com credenciais de API válidas
- Verifique se seu diretório de trabalho é um repositório Git (worktrees exigem Git)
- Certifique-se de que você tem acesso de escrita ao diretório base de worktrees (`~/.qwen/arena/` por padrão)

### Falha na criação da worktree

- Execute `git worktree list` para verificar worktrees obsoletas de sessões anteriores
- Limpe worktrees obsoletas com `git worktree prune`
- Certifique-se de que sua versão do Git suporta worktrees (`git --version`, requer Git 2.5+)

### Agente demorando muito

- Aumente o tempo limite: defina `arena.timeoutSeconds` nas configurações
- Reduza a complexidade da tarefa — as tarefas da Arena devem ser focadas e bem definidas
- Diminua `arena.maxRoundsPerAgent` se os agentes estiverem gastando muitas rodadas

### Falha ao aplicar o vencedor

- Verifique se há alterações não commitadas no seu diretório de trabalho principal que possam conflitar
- O diff é aplicado como um patch — conflitos de merge são possíveis se o seu diretório de trabalho mudou durante a sessão

## Limitações

Agent Arena é experimental. Limitações atuais:

- **Apenas modo in-process**: A exibição em painéis divididos via tmux ou iTerm2 ainda não está disponível. Todos os agentes são executados dentro de uma única janela de terminal com alternância de abas.
- **Sem prévia de diff antes da seleção**: Você pode visualizar o histórico de conversação de cada agente, mas não há um visualizador de diff unificado para comparar soluções lado a lado antes de escolher um vencedor.
- **Sem retenção de worktrees**: As worktrees são sempre limpas após a seleção. Não há opção de preservá-las para inspeção posterior.
- **Sem retomada de sessão**: Sessões da Arena não podem ser retomadas após a saída. Se você fechar o terminal no meio da sessão, as worktrees permanecem no disco e devem ser limpas manualmente com `git worktree prune`.
- **Máximo de 5 agentes**: O limite fixo de 5 agentes concorrentes não pode ser alterado.
- **Repositório Git obrigatório**: A Arena requer um repositório Git para isolamento de worktrees. Não pode ser usada em diretórios que não sejam Git.
## Comparação com outros modos multi-agente

Agent Arena é um dos vários modos multi-agente planejados no Qwen Code. **Agent Team** e **Agent Swarm** ainda não foram implementados — a tabela abaixo descreve seu design pretendido para referência.

|                   | **Agent Arena**                                        | **Agent Team** (planejado)                           | **Agent Swarm** (planejado)                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------- | :------------------------------------------------------- |
| **Objetivo**          | Competitivo: Encontrar a melhor solução para a _mesma_ tarefa | Colaborativo: Abordar _diferentes_ aspectos juntos | Paralelo em lote: Criar dinamicamente workers para tarefas em massa |
| **Agentes**        | Modelos pré-configurados competem independentemente            | Colegas de equipe colaboram com papéis atribuídos          | Workers criados dinamicamente, destruídos após conclusão      |
| **Comunicação** | Nenhuma comunicação entre agentes                           | Mensagens diretas ponto a ponto                      | Unidirecional: resultados agregados pelo pai                    |
| **Isolamento**     | Completo: Git worktrees separados                           | Sessões independentes com lista de tarefas compartilhada         | Contexto efêmero leve por worker                 |
| **Saída**        | Uma solução selecionada aplicada ao workspace             | Resultados sintetizados de múltiplas perspectivas     | Resultados agregados do processamento paralelo              |
| **Melhor para**      | Benchmarking, escolha entre abordagens de modelo        | Pesquisa, colaboração complexa, trabalho entre camadas  | Operações em lote, processamento de dados, tarefas map-reduce      |

## Próximos passos

Explore abordagens relacionadas para trabalho paralelo e delegado:

- **Delegação leve**: [Subagents](./sub-agents.md) lidam com subtarefas focadas dentro da sua sessão — melhor quando você não precisa de comparação de modelos
- **Sessões paralelas manuais**: Execute várias sessões do Qwen Code você mesmo em terminais separados com [Git worktrees](https://git-scm.com/docs/git-worktree) para controle manual total
