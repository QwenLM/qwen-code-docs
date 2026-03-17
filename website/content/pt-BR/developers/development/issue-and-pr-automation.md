# Processos de Automação e Triagem

Este documento fornece uma visão detalhada dos processos automatizados que utilizamos para gerenciar e triar problemas (*issues*) e *pull requests*. Nosso objetivo é fornecer feedback rápido e garantir que as contribuições sejam revisadas e integradas de forma eficiente. Compreender essa automação ajudará você, como colaborador, a saber o que esperar e como interagir da melhor forma possível com os robôs (*bots*) do nosso repositório.

## Princípio Orientador: Problemas (*Issues*) e *Pull Requests*

Antes de tudo, quase todo *Pull Request* (PR) deve estar vinculado a um problema (*issue*) correspondente. O problema descreve o “o quê” e o “por quê” (a falha ou a nova funcionalidade), enquanto o PR representa o “como” (a implementação). Essa separação nos ajuda a acompanhar o trabalho, priorizar funcionalidades e manter um contexto histórico claro. Nossa automação foi desenvolvida com base nesse princípio.

---

## Fluxos de Trabalho Automatizados Detalhados

A seguir, apresentamos uma descrição dos fluxos de trabalho automatizados específicos que são executados em nosso repositório.

### 1. Quando você abre uma issue: `Triagem Automatizada de Issues`

Este é o primeiro bot com o qual você interage ao criar uma issue. Sua função é realizar uma análise inicial e aplicar as etiquetas corretas.

- **Arquivo de fluxo de trabalho**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Quando é executado**: Imediatamente após a criação ou reabertura de uma issue.
- **O que faz**:
  - Usa um modelo Qwen para analisar o título e o corpo da issue com base em um conjunto detalhado de diretrizes.
  - **Aplica uma etiqueta `area/*`**: Categoriza a issue em uma área funcional do projeto (por exemplo, `area/ux`, `area/models`, `area/platform`).
  - **Aplica uma etiqueta `kind/*`**: Identifica o tipo de issue (por exemplo, `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Aplica uma etiqueta `priority/*`**: Atribui uma prioridade de P0 (crítica) a P3 (baixa), com base no impacto descrito.
  - **Pode aplicar `status/need-information`**: Se a issue não contiver detalhes essenciais (como logs ou etapas para reprodução), ela será marcada como necessitando de mais informações.
  - **Pode aplicar `status/need-retesting`**: Se a issue fizer referência a uma versão da CLI com mais de seis versões de antiguidade, ela será marcada para reteste em uma versão atual.
- **O que você deve fazer**:
  - Preencha o modelo de issue da forma mais completa possível. Quanto mais detalhes você fornecer, mais precisa será a triagem.
  - Se a etiqueta `status/need-information` for adicionada, forneça os detalhes solicitados em um comentário.

### 2. Quando você abre uma Pull Request: `Integração Contínua (CI)`

Esse fluxo de trabalho garante que todas as alterações atendam aos nossos padrões de qualidade antes de serem incorporadas.

- **Arquivo do fluxo de trabalho**: `.github/workflows/ci.yml`
- **Quando é executado**: A cada *push* em uma *pull request*.
- **O que faz**:
  - **Lint**: Verifica se seu código está em conformidade com as regras de formatação e estilo do projeto.
  - **Teste**: Executa toda a nossa suíte de testes automatizados nos sistemas operacionais macOS, Windows e Linux, além de várias versões do Node.js. Essa é a etapa mais demorada do processo de CI.
  - **Comentário pós-cobertura**: Após a conclusão bem-sucedida de todos os testes, um bot publica um comentário na sua *pull request*. Esse comentário fornece um resumo do grau de cobertura dos seus códigos pelos testes.
- **O que você deve fazer**:
  - Garantir que todas as verificações da CI passem. Um marcador verde ✅ aparecerá ao lado do seu *commit* quando tudo for concluído com sucesso.
  - Se alguma verificação falhar (um "X" vermelho ❌), clique no link "Detalhes" ao lado da verificação com falha para visualizar os logs, identificar o problema e enviar uma correção.

### 3. Triagem contínua de pull requests: `Auditoria de PR e sincronização de rótulos`

Esse fluxo de trabalho é executado periodicamente para garantir que todos os pull requests abertos estejam corretamente vinculados a issues e tenham rótulos consistentes.

- **Arquivo do fluxo de trabalho**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Quando é executado**: A cada 15 minutos, em todos os pull requests abertos.
- **O que faz**:
  - **Verifica se há uma issue vinculada**: O bot analisa a descrição do seu pull request em busca de uma palavra-chave que o vincule a uma issue (por exemplo, `Fixes #123`, `Closes #456`).
  - **Adiciona o rótulo `status/need-issue`**: Se nenhuma issue vinculada for encontrada, o bot adicionará o rótulo `status/need-issue` ao seu pull request. Esse é um sinal claro de que uma issue precisa ser criada e vinculada.
  - **Sincroniza os rótulos**: Se uma issue _estiver_ vinculada, o bot garante que os rótulos do pull request correspondam exatamente aos rótulos da issue. Ele adicionará quaisquer rótulos ausentes, removerá os que não pertencem e também removerá o rótulo `status/need-issue`, caso esteja presente.
- **O que você deve fazer**:
  - **Sempre vincule seu pull request a uma issue.** Este é o passo mais importante. Adicione uma linha como `Resolves #<número-da-issue>` à descrição do seu pull request.
  - Isso garantirá que seu pull request seja categorizado corretamente e avance sem problemas pelo processo de revisão.

### 4. Triagem contínua de problemas: `Triagem programada de problemas`

Este é um fluxo de trabalho alternativo para garantir que nenhum problema seja ignorado pelo processo de triagem.

- **Arquivo do fluxo de trabalho**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Quando é executado**: A cada hora, em todos os problemas abertos.
- **O que faz**:
  - Procura ativamente problemas que não tenham nenhuma etiqueta ou que ainda possuam a etiqueta `status/need-triage`.
  - Em seguida, aciona a mesma análise robusta baseada no QwenCode usada pelo bot de triagem inicial para aplicar as etiquetas corretas.
- **O que você deve fazer**:
  - Normalmente, não é necessário fazer nada. Esse fluxo de trabalho funciona como uma rede de segurança para garantir que todos os problemas sejam eventualmente categorizados, mesmo que a triagem inicial falhe.

### 5. Automação de Lançamento

Este fluxo de trabalho lida com o processo de empacotamento e publicação de novas versões do Qwen Code.

- **Arquivo do fluxo de trabalho**: `.github/workflows/release.yml`
- **Quando é executado**: Em uma agenda diária para lançamentos "noturnos" (*nightly*) e manualmente para lançamentos oficiais de correções (*patch*) ou menores (*minor*).
- **O que faz**:
  - Compila automaticamente o projeto, atualiza os números de versão e publica os pacotes no npm.
  - Cria um lançamento correspondente no GitHub com notas de lançamento geradas automaticamente.
- **O que você deve fazer**:
  - Como colaborador, não é necessário realizar nenhuma ação para esse processo. Você pode ter certeza de que, assim que sua *pull request* for mesclada na branch `main`, suas alterações serão incluídas no próximo lançamento noturno.

Esperamos que esta visão detalhada seja útil. Se tiver alguma dúvida sobre nossa automação ou processos, não hesite em perguntar!