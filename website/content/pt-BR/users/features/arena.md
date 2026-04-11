# Agent Arena

> Dispare vários modelos de IA simultaneamente para executar a mesma tarefa, compare as soluções lado a lado e selecione o melhor resultado para aplicar ao seu workspace.

> [!warning]
> O Agent Arena é experimental. Ele possui [limitações conhecidas](#limitations) em relação aos modos de exibição e ao gerenciamento de sessões.

O Agent Arena permite colocar vários modelos de IA para competir na mesma tarefa. Cada modelo é executado como um agente totalmente independente em seu próprio Git worktree isolado, garantindo que operações em arquivos nunca interfiram entre si. Quando todos os agentes terminam, você compara os resultados e seleciona um vencedor para fazer o merge de volta ao seu workspace principal.

Diferente dos [subagents](/users/features/sub-agents), que delegam subtarefas focadas dentro de uma única sessão, os agentes do Arena são instâncias completas e de nível superior — cada um com seu próprio modelo, janela de contexto e acesso total às ferramentas.

Esta página aborda:

- [Quando usar o Agent Arena](#when-to-use-agent-arena)
- [Como iniciar uma sessão de arena](#start-an-arena-session)
- [Como interagir com os agentes](#interact-with-agents), incluindo modos de exibição e navegação
- [Como comparar resultados e selecionar um vencedor](#compare-results-and-select-a-winner)
- [Boas práticas](#best-practices)

## Quando usar o Agent Arena

O Agent Arena é mais eficaz quando você deseja **avaliar ou comparar** como diferentes modelos abordam o mesmo problema. Os casos de uso mais fortes são:

- **Benchmarking de modelos**: Avalie as capacidades de diferentes modelos em tarefas reais no seu codebase, e não em benchmarks sintéticos
- **Seleção Best-of-N**: Obtenha várias soluções independentes e escolha a melhor implementação
- **Exploração de abordagens**: Veja como diferentes modelos raciocinam e resolvem o mesmo problema — útil para aprendizado e insights
- **Redução de riscos**: Para alterações críticas, valide se vários modelos convergem para uma abordagem semelhante antes de fazer o commit

O Agent Arena consome significativamente mais tokens do que uma sessão única (cada agente tem sua própria janela de contexto e chamadas de modelo). Ele funciona melhor quando o valor da comparação justifica o custo. Para tarefas rotineiras em que você confia no seu modelo padrão, uma sessão única é mais eficiente.

## Como iniciar uma sessão de arena

Use o comando slash `/arena` para iniciar uma sessão. Especifique os modelos que você quer que compitam e a tarefa:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactor the authentication module to use JWT tokens"
```

Se você omitir `--models`, uma caixa de diálogo interativa de seleção de modelos aparecerá, permitindo que você escolha entre seus provedores configurados.

### O que acontece ao iniciar

1. **Configuração do worktree**: O Qwen Code cria Git worktrees isolados para cada agente em `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Cada worktree espelha exatamente o estado do seu diretório de trabalho atual — incluindo alterações staged, unstaged e arquivos untracked.
2. **Criação dos agentes**: Cada agente inicia em seu próprio worktree com acesso total às ferramentas e seu modelo configurado. Os agentes são lançados sequencialmente, mas executam em paralelo.
3. **Execução**: Todos os agentes trabalham na tarefa de forma independente, sem estado ou comunicação compartilhados. Você pode monitorar o progresso e interagir com qualquer um deles.
4. **Conclusão**: Quando todos os agentes terminam (ou falham), você entra na fase de comparação de resultados.

## Como interagir com os agentes

### Modos de exibição

O Agent Arena atualmente suporta o **modo in-process**, onde todos os agentes executam de forma assíncrona no mesmo processo do terminal. Uma barra de abas na parte inferior do terminal permite alternar entre os agentes.

> [!note]
> **Modos de exibição em painéis divididos estão planejados para o futuro.** Pretendemos oferecer suporte a layouts de painéis divididos baseados em tmux e iTerm2, onde cada agente terá seu próprio painel de terminal para visualização lado a lado real. Atualmente, apenas a alternância de abas in-process está disponível.

### Navegar entre agentes

No modo in-process, use atalhos de teclado para alternar entre as visualizações dos agentes:

| Shortcut | Action                            |
| :------- | :-------------------------------- |
| `Right`  | Alterna para a próxima aba de agente      |
| `Left`   | Alterna para a aba de agente anterior  |
| `Up`     | Move o foco para a caixa de entrada     |
| `Down`   | Move o foco para a barra de abas do agente |

A barra de abas mostra o status atual de cada agente:

| Indicator | Meaning                |
| :-------- | :--------------------- |
| `●`       | Em execução ou ocioso        |
| `✓`       | Concluído com sucesso |
| `✗`       | Falhou                 |
| `○`       | Cancelado              |

### Interagir com agentes individuais

Ao visualizar a aba de um agente, você pode:

- **Enviar mensagens** — digite na área de entrada para dar instruções adicionais ao agente
- **Aprovar chamadas de ferramentas** — se um agente solicitar aprovação de ferramenta, a caixa de diálogo de confirmação aparecerá em sua aba
- **Visualizar histórico completo** — role pela conversa completa do agente, incluindo saída do modelo, chamadas de ferramentas e resultados

Cada agente é uma sessão completa e independente. Tudo o que você pode fazer com o agente principal, você pode fazer com um agente do Arena.

## Como comparar resultados e selecionar um vencedor

Quando todos os agentes concluem, o Arena entra na fase de comparação de resultados. Você verá:

- **Resumo de status**: Quais agentes tiveram sucesso, falharam ou foram cancelados
- **Métricas de execução**: Duração, rodadas de raciocínio, uso de tokens e contagem de chamadas de ferramentas para cada agente

Uma caixa de diálogo de seleção apresenta os agentes bem-sucedidos. Escolha um para aplicar suas alterações ao seu workspace principal ou descarte todos os resultados.

### O que acontece ao selecionar um vencedor

1. As alterações do agente vencedor são extraídas como um diff em relação à baseline
2. O diff é aplicado ao seu diretório de trabalho principal
3. Todos os worktrees e branches temporários são limpos automaticamente

Se você quiser inspecionar os resultados antes de decidir, o histórico completo de conversa de cada agente estará disponível pela barra de abas enquanto a caixa de diálogo de seleção estiver ativa.

## Configuração

O comportamento do Arena pode ser personalizado no [settings.json](/users/configuration/settings):

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Setting                   | Description                        | Default         |
| :------------------------ | :--------------------------------- | :-------------- |
| `arena.worktreeBaseDir`   | Diretório base para os worktrees do Arena | `~/.qwen/arena` |
| `arena.maxRoundsPerAgent` | Número máximo de rodadas de raciocínio por agente | `50`            |
| `arena.timeoutSeconds`    | Timeout para cada agente em segundos  | `600`           |

## Boas práticas

### Escolha modelos que se complementam

O Arena é mais valioso quando você compara modelos com pontos fortes significativamente diferentes. Por exemplo:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimize the database query layer"
```

Comparar três versões da mesma família de modelos gera menos insights do que comparar entre provedores.

### Mantenha as tarefas autocontidas

Os agentes do Arena trabalham de forma independente, sem comunicação. As tarefas devem ser totalmente descritas no prompt, sem exigir ida e volta:

**Bom**: "Refatore o módulo de pagamento para usar o padrão strategy. Atualize todos os testes."

**Menos eficaz**: "Vamos discutir como melhorar o módulo de pagamento" — isso se beneficia de conversa, o que é mais adequado para uma sessão única.

### Limite o número de agentes

Até 5 agentes podem executar simultaneamente. Na prática, 2 a 3 agentes oferecem o melhor equilíbrio entre valor de comparação e custo de recursos. Mais agentes significam:

- Custos mais altos de tokens (cada agente tem sua própria janela de contexto)
- Tempo total de execução mais longo
- Mais resultados para comparar

Comece com 2 ou 3 e aumente a escala apenas quando o valor da comparação justificar.

### Use o Arena para decisões de alto impacto

O Arena se destaca quando a importância justifica a execução de vários modelos:

- Escolher uma arquitetura para um novo módulo
- Selecionar uma abordagem para um refactor complexo
- Validar uma correção crítica de bug sob múltiplas perspectivas

Para alterações rotineiras, como renomear uma variável ou atualizar um arquivo de configuração, uma sessão única é mais rápida e barata.

## Solução de problemas

### Agentes falham ao iniciar

- Verifique se cada modelo em `--models` está configurado corretamente com credenciais de API válidas
- Verifique se seu diretório de trabalho é um repositório Git (worktrees exigem Git)
- Garanta que você tem permissão de escrita no diretório base do worktree (`~/.qwen/arena/` por padrão)

### Falha na criação do worktree

- Execute `git worktree list` para verificar worktrees obsoletos de sessões anteriores
- Limpe worktrees obsoletos com `git worktree prune`
- Verifique se sua versão do Git suporta worktrees (`git --version`, requer Git 2.5+)

### Agente demora muito

- Aumente o timeout: defina `arena.timeoutSeconds` nas configurações
- Reduza a complexidade da tarefa — as tarefas do Arena devem ser focadas e bem definidas
- Diminua `arena.maxRoundsPerAgent` se os agentes estiverem gastando muitas rodadas

### Falha ao aplicar o vencedor

- Verifique se há alterações não commitadas no seu diretório de trabalho principal que possam causar conflito
- O diff é aplicado como um patch — conflitos de merge são possíveis se seu diretório de trabalho foi alterado durante a sessão

## Limitações

O Agent Arena é experimental. Limitações atuais:

- **Apenas modo in-process**: A exibição em painéis divididos via tmux ou iTerm2 ainda não está disponível. Todos os agentes executam em uma única janela de terminal com alternância de abas.
- **Sem preview de diff antes da seleção**: Você pode visualizar o histórico de conversa de cada agente, mas não há um visualizador de diff unificado para comparar soluções lado a lado antes de escolher um vencedor.
- **Sem retenção de worktrees**: Os worktrees são sempre limpos após a seleção. Não há opção para preservá-los para inspeção posterior.
- **Sem retomada de sessão**: As sessões do Arena não podem ser retomadas após o encerramento. Se você fechar o terminal no meio da sessão, os worktrees permanecerão no disco e deverão ser limpos manualmente via `git worktree prune`.
- **Máximo de 5 agentes**: O limite rígido de 5 agentes concorrentes não pode ser alterado.
- **Repositório Git obrigatório**: O Arena exige um repositório Git para isolamento via worktree. Ele não pode ser usado em diretórios sem Git.

## Comparação com outros modos multiagente

O Agent Arena é um dos vários modos multiagente planejados no Qwen Code. **Agent Team** e **Agent Swarm** ainda não foram implementados — a tabela abaixo descreve o design pretendido deles para referência.

|                   | **Agent Arena**                                        | **Agent Team** (planejado)                           | **Agent Swarm** (planejado)                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------- | :------------------------------------------------------- |
| **Goal**          | Competitivo: Encontrar a melhor solução para a _mesma_ tarefa | Colaborativo: Abordar _diferentes_ aspectos em conjunto | Paralelo em lote: Criar workers dinamicamente para tarefas em massa |
| **Agents**        | Modelos pré-configurados competem de forma independente            | Colegas de equipe colaboram com funções atribuídas          | Workers criados sob demanda, destruídos após a conclusão      |
| **Communication** | Sem comunicação entre agentes                           | Mensagens diretas peer-to-peer                      | Unidirecional: resultados agregados pelo pai                    |
| **Isolation**     | Completa: Git worktrees separados                           | Sessões independentes com lista de tarefas compartilhada         | Contexto efêmero e leve por worker                 |
| **Output**        | Uma solução selecionada aplicada ao workspace             | Resultados sintetizados a partir de múltiplas perspectivas     | Resultados agregados do processamento paralelo              |
| **Best for**      | Benchmarking, escolha entre abordagens de modelos        | Pesquisa, colaboração complexa, trabalho cross-layer  | Operações em lote, processamento de dados, tarefas map-reduce      |

## Próximos passos

Explore abordagens relacionadas para trabalho paralelo e delegado:

- **Delegação leve**: [Subagents](/users/features/sub-agents) lidam com subtarefas focadas dentro da sua sessão — melhor quando você não precisa de comparação de modelos
- **Sessões paralelas manuais**: Execute várias sessões do Qwen Code por conta própria em terminais separados com [Git worktrees](https://git-scm.com/docs/git-worktree) para controle manual completo