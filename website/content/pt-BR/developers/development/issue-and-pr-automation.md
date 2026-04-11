# Processos de Automação e Triagem

Este documento fornece uma visão detalhada dos processos automatizados que usamos para gerenciar e fazer a triagem de issues e pull requests. Nosso objetivo é fornecer feedback rápido e garantir que as contribuições sejam revisadas e integradas com eficiência. Entender essa automação ajudará você, como contribuidor, a saber o que esperar e como interagir da melhor forma com os bots do nosso repositório.

## Princípio Norteador: Issues e Pull Requests

Antes de tudo, quase todo Pull Request (PR) deve estar vinculado a uma Issue correspondente. A issue descreve o "o quê" e o "porquê" (o bug ou a funcionalidade), enquanto o PR é o "como" (a implementação). Essa separação nos ajuda a acompanhar o trabalho, priorizar funcionalidades e manter um contexto histórico claro. Nossa automação é construída em torno desse princípio.

---

## Fluxos de Automação Detalhados

Abaixo está um detalhamento dos fluxos de automação específicos que são executados no nosso repositório.

### 1. Quando você abre uma Issue: `Automated Issue Triage`

Este é o primeiro bot com o qual você interagirá ao criar uma issue. A função dele é realizar uma análise inicial e aplicar as labels corretas.

- **Arquivo do Workflow**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Quando é executado**: Imediatamente após a criação ou reabertura de uma issue.
- **O que ele faz**:
  - Utiliza um modelo Qwen para analisar o título e o corpo da issue com base em um conjunto detalhado de diretrizes.
  - **Aplica uma label `area/*`**: Categoriza a issue em uma área funcional do projeto (ex.: `area/ux`, `area/models`, `area/platform`).
  - **Aplica uma label `kind/*`**: Identifica o tipo da issue (ex.: `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Aplica uma label `priority/*`**: Atribui uma prioridade de P0 (crítica) a P3 (baixa) com base no impacto descrito.
  - **Pode aplicar `status/need-information`**: Se a issue não tiver detalhes críticos (como logs ou passos para reprodução), ela será sinalizada para solicitar mais informações.
  - **Pode aplicar `status/need-retesting`**: Se a issue fizer referência a uma versão da CLI com mais de seis versões de diferença, ela será sinalizada para reteste em uma versão atual.
- **O que você deve fazer**:
  - Preencha o template da issue da forma mais completa possível. Quanto mais detalhes você fornecer, mais precisa será a triagem.
  - Se a label `status/need-information` for adicionada, forneça os detalhes solicitados em um comentário.

### 2. Quando você abre um Pull Request: `Continuous Integration (CI)`

Este workflow garante que todas as alterações atendam aos nossos padrões de qualidade antes de serem mescladas.

- **Arquivo do Workflow**: `.github/workflows/ci.yml`
- **Quando é executado**: A cada push em um pull request.
- **O que ele faz**:
  - **Lint**: Verifica se o seu código segue as regras de formatação e estilo do projeto.
  - **Test**: Executa nossa suíte completa de testes automatizados no macOS, Windows e Linux, e em várias versões do Node.js. Esta é a parte mais demorada do processo de CI.
  - **Post Coverage Comment**: Após todos os testes passarem com sucesso, um bot publicará um comentário no seu PR. Esse comentário fornece um resumo de quão bem suas alterações estão cobertas por testes.
- **O que você deve fazer**:
  - Garanta que todas as verificações de CI passem. Um check verde ✅ aparecerá ao lado do seu commit quando tudo estiver correto.
  - Se uma verificação falhar (um "X" vermelho ❌), clique no link "Details" ao lado da verificação com falha para visualizar os logs, identificar o problema e enviar uma correção.

### 3. Triagem Contínua para Pull Requests: `PR Auditing and Label Sync`

Este workflow é executado periodicamente para garantir que todos os PRs abertos estejam corretamente vinculados a issues e tenham labels consistentes.

- **Arquivo do Workflow**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Quando é executado**: A cada 15 minutos em todos os pull requests abertos.
- **O que ele faz**:
  - **Verifica se há uma issue vinculada**: O bot verifica a descrição do seu PR em busca de uma palavra-chave que o vincule a uma issue (ex.: `Fixes #123`, `Closes #456`).
  - **Adiciona `status/need-issue`**: Se nenhuma issue vinculada for encontrada, o bot adicionará a label `status/need-issue` ao seu PR. Isso é um sinal claro de que uma issue precisa ser criada e vinculada.
  - **Sincroniza labels**: Se uma issue _estiver_ vinculada, o bot garante que as labels do PR correspondam exatamente às labels da issue. Ele adicionará quaisquer labels faltantes e removerá as que não pertencem, além de remover a label `status/need-issue` se ela estiver presente.
- **O que você deve fazer**:
  - **Sempre vincule seu PR a uma issue.** Esta é a etapa mais importante. Adicione uma linha como `Resolves #<issue-number>` à descrição do seu PR.
  - Isso garantirá que seu PR seja categorizado corretamente e avance pelo processo de revisão sem problemas.

### 4. Triagem Contínua para Issues: `Scheduled Issue Triage`

Este é um workflow de fallback para garantir que nenhuma issue seja ignorada pelo processo de triagem.

- **Arquivo do Workflow**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Quando é executado**: A cada hora em todas as issues abertas.
- **O que ele faz**:
  - Busca ativamente issues que não possuem nenhuma label ou que ainda possuem a label `status/need-triage`.
  - Em seguida, aciona a mesma análise poderosa baseada no Qwen Code do bot de triagem inicial para aplicar as labels corretas.
- **O que você deve fazer**:
  - Geralmente, você não precisa fazer nada. Este workflow é uma rede de segurança para garantir que toda issue seja eventualmente categorizada, mesmo que a triagem inicial falhe.

### 5. Automação de Release

Este workflow gerencia o processo de empacotamento e publicação de novas versões do Qwen Code.

- **Arquivo do Workflow**: `.github/workflows/release.yml`
- **Quando é executado**: Em uma agenda diária para releases "nightly" e manualmente para releases oficiais de patch/minor.
- **O que ele faz**:
  - Compila o projeto automaticamente, atualiza os números de versão e publica os pacotes no npm.
  - Cria um release correspondente no GitHub com notas de versão geradas automaticamente.
- **O que você deve fazer**:
  - Como contribuidor, você não precisa fazer nada para este processo. Pode ter certeza de que, assim que seu PR for mesclado na branch `main`, suas alterações serão incluídas no próximo release nightly.

Esperamos que esta visão detalhada seja útil. Se você tiver alguma dúvida sobre nossa automação ou processos, não hesite em perguntar!