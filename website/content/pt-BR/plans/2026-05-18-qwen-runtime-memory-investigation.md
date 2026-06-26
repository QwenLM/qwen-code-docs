# Plano de Investigação de Memória do Runtime do Qwen Code

Data: 2026-05-18

## Contexto

Benchmarks locais mostram que o Qwen Code utiliza significativamente mais RSS da árvore de processos do que o Claude Code para tarefas CLI não interativas de formato similar. A matriz de cinco casos mais recente registrou picos do Qwen Code em torno de `0,83-1,04 GiB`, enquanto o Claude Code permaneceu em torno de `0,27-0,36 GiB`.

Este documento propõe uma direção preliminar de investigação e otimização. Não pretende afirmar uma causa raiz definitiva ainda. O objetivo imediato é tornar a lacuna de memória revisável, reprodutível e explicável com diagnósticos internos.

## Progresso até o Momento

A investigação atingiu o estágio de evidências e direcionamento:

- Uma matriz local reproduzível foi construída para cargas de trabalho de revisão de PRs pequenos, navegação de código e diffs sintéticos.
- O Qwen Code foi comparado entre vários modelos.
- O Qwen Code e o Claude Code foram comparados nas mesmas formas de tarefa quando endpoints de modelo equivalentes estavam disponíveis.
- A lacuna observada de RSS é consistente o suficiente para justificar diagnósticos de runtime mais aprofundados.
- Trabalhos upstream relacionados foram mapeados para que este esforço possa se basear no `/doctor memory` existente e nos acompanhamentos de diagnóstico de memória.

A investigação ainda não atingiu o estágio final de causa raiz porque o RSS de processos externos não pode mostrar se a memória retida é heap V8, memória nativa, módulos carregados, histórico ativo, resultados de ferramentas ou estado de montagem de requisições.

## Evidências Atuais

O relatório de benchmark complementar é:

- `docs/e2e-tests/2026-05-18-qwen-memory-benchmark-report.md`

As principais evidências são:

- A lacuna de RSS entre Qwen e Claude foi reproduzida em cargas de trabalho de revisão de PRs pequenos, navegação de código e diffs sintéticos.
- A lacuna foi reproduzida tanto com `pai/glm-5` quanto com `qwen3.6-plus`.
- O Qwen Code usou mais tokens que o Claude Code em cada célula da matriz testada.
- O tamanho grande de diff não produziu um aumento linear claro de memória, o que sugere que os caminhos de saída de linha de base e limitada/truncada são mais importantes do que os bytes brutos do diff isoladamente.

## Trabalho Relacionado

Já existe trabalho upstream relevante:

| Item    | Status                | Papel no trabalho de memória                                                                                      |
| ------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `#4180` | PR mesclado           | Adiciona diagnósticos básicos de `/doctor memory`. Esta é a primeira fatia de instrumentação.                     |
| `#4181` | issue aberta, sem PR  | Adiciona interpretação e classificação de pressão para `/doctor memory`.                                          |
| `#4182` | issue aberta, sem PR  | Adiciona saída estruturada de `/doctor memory --json` e estatísticas seguras de escala de sessão.                  |
| `#4183` | issue aberta, sem PR  | Adiciona snapshots de heap opcionais e diagnósticos de timeline de memória com limites.                           |
| `#4184` | issue aberta, sem PR  | Adiciona diagnósticos de retenção de resultados de ferramentas grandes e projeta mitigação de offload/preview.    |
| `#4127` | PR aberto, conflitante| Adiciona redes de segurança de pressão de heap para prevenção de OOM em sessões longas. Mitigação útil, insuficiente para atribuição. |
| `#4168` | PR aberto             | Redesenha limites de autocompactação. Útil para pressão de contexto, insuficiente para análise de footprint em tempo de tarefa.        |
| `#4172` | PR aberto             | Desacopla a recuperação automática de memória do caminho principal de requisição. Útil para latência/blocking, não é prova direta de RSS. |
| `#4188` | PR mesclado           | Limita caches de build/teste para prevenir OOM em execuções de teste paralelas. Importante, mas separado dos benchmarks de runtime. |

Esta investigação deve construir sobre essa direção em vez de esperar que todos os issues de acompanhamento sejam implementados.

A maior parte do trabalho restante é focada em instrumentação. Os issues de diagnóstico abertos foram projetados para tornar os relatórios de memória explicáveis antes de tentar uma correção no runtime. Os PRs de mitigação abertos podem reduzir caminhos específicos de OOM, mas ainda não explicam por que tarefas CLI curtas não interativas atingem picos repetidamente perto de `1 GiB`.

## Por que Este Rascunho Começa com Documentação

Este rascunho intencionalmente começa com evidências de benchmark e um plano de investigação em vez de incluir uma alteração de código no runtime.

Motivos:

1. O objetivo atual é tornar o problema de desempenho e a direção visíveis, não reivindicar uma correção no mesmo dia.
2. Adicionar instrumentação e otimização no mesmo PR dificultaria a revisão, pois misturaria medição, diagnóstico e mudanças de comportamento.
3. O benchmark existente já apoia a necessidade de diagnósticos mais profundos.
4. O próximo PR pode ser mais restrito e mais fácil de validar: apenas diagnósticos, depois reexecutar a mesma matriz e comparar métricas internas.

O próximo PR de implementação deve adicionar os contadores e pontos de timeline faltantes e, em seguida, reexecutar a matriz de benchmark. Somente após isso um PR de otimização direcionada deve tentar reduzir a memória.

## Inferência de Trabalho

Os dados atuais apontam mais para um problema de runtime/caminho do Qwen Code do que para um problema de provedor de modelo.

A inferência mais forte atualmente é:

> O Qwen Code parece ter um footprint de execução de tarefas CLI não interativas elevado, provavelmente amplificado pelo manuseio de contexto/resultados de ferramentas/sessão maiores. A área provável do problema é o runtime CLI e o caminho de dados do agente, não apenas o modelo selecionado.

Mais especificamente, as evidências apontam para longe de "muitas chamadas de ferramenta" como causa primária. As contagens de chamadas de ferramenta foram semelhantes entre os CLIs, e às vezes o Claude usou mais turnos ou chamadas de ferramenta enquanto mantinha RSS mais baixo. O problema mais plausível é que o Qwen Code inicializa ou retém estado mais pesado para a mesma tarefa CLI curta não interativa e, em seguida, amplifica esse footprint de execução com dados de contexto, resultados de ferramentas, saídas salvas ou histórico de sessão maiores.

Os buckets mais prováveis são:

1. **Custo de inicialização/execução de processo e módulo**: O Qwen Code pode inicializar mais runtime, ferramentas, infraestrutura de interface/sessão ou mecanismos de provedor do que o necessário para tarefas CLI não interativas.
2. **Montagem de histórico e contexto**: O Qwen Code pode reter ou construir contexto voltado ao modelo maior do que o Claude Code para a mesma forma de tarefa.
3. **Retenção de resultados de ferramentas**: resultados grandes ou repetidos de ferramentas podem ser retidos no histórico ativo, histórico de interface, gravação de chat ou caminhos de recuperação de saída salva.
4. **Amplificação de subagente e saída salva**: testes anteriores de PRs grandes mostraram recuperação de saída salva e atividade de subagente, o que pode adicionar pressão de memória e tokens.
5. **Processos filhos MCP**: o relatório de diagnóstico complementar revelou que servidores MCP (ex: chrome-devtools) contribuem com ~350 MiB para o RSS da árvore de processos. Isso infla os números absolutos, mas é uma sobrecarga constante não relacionada ao comprimento da sessão.
6. **Divisão entre memória nativa e heap JS**: o RSS externo não pode dizer se a pressão é do heap V8, buffers nativos, módulos carregados ou dados retidos.

Isso é deliberadamente colocado como inferência. O próximo passo é adicionar medições internas suficientes para confirmar ou descartar cada bucket.

## Escopo Proposto do PR de Rascunho

O primeiro PR de rascunho deve ser focado em evidências e diagnósticos:

1. Incluir o relatório de benchmark e o plano de investigação.
2. Adicionar ou estender a saída de diagnóstico local para que o Qwen Code possa reportar:
   - Estatísticas de heap V8 e espaço de heap.
   - Divisão entre RSS e heap.
   - Contagem de mensagens da sessão e tamanho retido aproximado.
   - Contagem de resultados de ferramentas, tamanho total retido e tamanho do maior resultado retido.
   - Contadores de truncamento e recuperação de saída salva.
   - Atividade de subagente/árvore de processos quando disponível.
3. Reexecutar a matriz existente contra:
   - versão publicada atual do Qwen Code,
   - `main` atual,
   - branch apenas de diagnósticos,
   - branch candidata de otimização.
4. Usar essas medições para escolher um alvo de otimização pequeno.

O primeiro PR deve evitar misturar várias otimizações não relacionadas. Deve permanecer apenas documentação ou adicionar código apenas de diagnósticos. Um PR separado deve conter a primeira redução de memória no runtime assim que a causa estiver mais clara.

## Direções de Otimização Candidatas

Estas são candidatas, não conclusões:

1. **Retenção limitada de saída de ferramentas**: armazenar saídas grandes fora do caminho principal e manter apenas preview, metadados e ponteiros de recuperação no histórico ativo.
2. **Carregamento preguiçoso não interativo**: evitar inicializar subsistemas apenas de TUI ou interativos durante a execução de tarefas CLI não interativas.
3. **Limites de histórico de sessão/interface**: degradar itens de histórico antigos ou pesados em entradas de transcrição compactas.
4. **Contabilização de montagem de contexto**: medir e limitar resultados grandes de ferramentas antes da construção da requisição ao modelo.
5. **Contabilização de subagente**: expor o ciclo de vida do subagente e o impacto na memória nos diagnósticos.

Claude Code e OpenAI Codex (agente CLI de codificação da OpenAI) devem ser usados como referências de design para separação de diagnóstico, retenção limitada de saída e carregamento preguiçoso de histórico. A implementação ainda deve seguir a arquitetura e os testes do próprio Qwen Code.

## Plano de Validação

A investigação deve manter a mesma matriz de benchmark para que os resultados antes/depois permaneçam comparáveis:

- revisão de PR pequeno
- navegação de código
- diff sintético de aproximadamente 100 KiB
- diff sintético de aproximadamente 1 MiB
- diff sintético de aproximadamente 5 MiB

Para cada execução, registrar:

- pico de RSS da árvore de processos
- pico de RSS do processo raiz
- pico de heap V8
- resumo de espaço de heap
- duração
- turnos
- contagem de tokens
- contagem de chamadas de ferramenta
- maior resultado de ferramenta retido
- tamanho total de resultados de ferramenta retidos
- contagens de itens de sessão/histórico
- contagem de subagentes

A condição mínima de sucesso para uma correção candidata não é apenas "RSS diminuiu". Também deve identificar qual métrica interna mudou e por quê.

## Próximo Candidato a PR

O próximo PR deve ser apenas de diagnósticos e evitar alterar o comportamento do runtime. Uma fatia minimal útil adicionaria:

- contabilização do tamanho de entrada da requisição ao modelo;
- contabilização do prompt do sistema e do tamanho do schema da ferramenta;
- contagem de mensagens retidas e tamanho aproximado de caracteres retidos;
- contagem de resultados de ferramentas retidos, tamanho total e tamanho do maior item;
- amostras do ciclo de vida em torno de inicialização, primeira montagem de requisição, execução de ferramenta, conclusão por streaming, compressão e resposta final;
- amostras de memória do processo que incluem RSS, heap usado, heap total, external e estatísticas de espaço de heap.

Após isso ser implementado localmente, reexecutar a mesma matriz de modelo Qwen e comparar:

- versão publicada do Qwen Code;
- `main` atual;
- branch apenas de diagnósticos;
- branch candidata de otimização.

## Não-Objetivos

Este rascunho não afirma que:

- toda pressão de memória é causada pela saída de ferramentas;
- um PR aberto existente resolverá o footprint observado em tempo de tarefa;
- diferenças de provedor de modelo são irrelevantes em todos os ambientes;
- medições locais de execução única são suficientes para alegações de desempenho em nível de release.

A alegação pretendida é mais restrita: o Qwen Code mostra uma lacuna de RSS local consistente nas cargas de trabalho testadas, e o projeto precisa de diagnósticos internos para explicar e reduzir essa lacuna.