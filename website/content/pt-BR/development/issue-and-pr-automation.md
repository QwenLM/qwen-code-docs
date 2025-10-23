# Processos de Automação e Triagem

Este documento fornece uma visão detalhada dos processos automatizados que utilizamos para gerenciar e triar issues e pull requests. Nosso objetivo é fornecer feedback rápido e garantir que as contribuições sejam revisadas e integradas de forma eficiente. Entender essa automação ajudará você, como contribuidor, a saber o que esperar e como interagir da melhor forma com os bots do nosso repositório.

## Princípio Orientador: Issues e Pull Requests

Antes de tudo, quase todo Pull Request (PR) deve estar vinculado a uma Issue correspondente. A issue descreve o "o que" e o "porquê" (o bug ou feature), enquanto o PR é o "como" (a implementação). Essa separação nos ajuda a acompanhar o trabalho, priorizar features e manter um contexto histórico claro. Nossa automação foi construída em torno desse princípio.

---

## Workflows de Automação Detalhados

A seguir está uma descrição dos workflows de automação específicos que são executados em nosso repositório.

### 1. Ao abrir uma Issue: `Automated Issue Triage`

Este é o primeiro bot com o qual você irá interagir ao criar uma issue. Seu trabalho é realizar uma análise inicial e aplicar as labels corretas.

- **Arquivo de Workflow**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Quando é executado**: Imediatamente após a criação ou reabertura de uma issue.
- **O que ele faz**:
  - Utiliza um modelo Qwen para analisar o título e o corpo da issue com base em um conjunto detalhado de diretrizes.
  - **Aplica uma label `area/*`**: Categoriza a issue em uma área funcional do projeto (ex.: `area/ux`, `area/models`, `area/platform`).
  - **Aplica uma label `kind/*`**: Identifica o tipo da issue (ex.: `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Aplica uma label `priority/*`**: Atribui uma prioridade de P0 (crítico) a P3 (baixo), com base no impacto descrito.
  - **Pode aplicar `status/need-information`**: Caso a issue não contenha detalhes essenciais (como logs ou passos para reproduzir), ela será sinalizada para solicitar mais informações.
  - **Pode aplicar `status/need-retesting`**: Se a issue mencionar uma versão do CLI que esteja seis versões ou mais desatualizada, ela será sinalizada para reteste em uma versão atual.
- **O que você deve fazer**:
  - Preencha o template da issue da forma mais completa possível. Quanto mais detalhes você fornecer, mais precisa será a triagem.
  - Se a label `status/need-information` for adicionada, por favor, inclua os detalhes solicitados em um comentário.

### 2. Quando você abre um Pull Request: `Continuous Integration (CI)`

Esse workflow garante que todas as mudanças atendam aos nossos padrões de qualidade antes de serem mergeadas.

- **Arquivo do Workflow**: `.github/workflows/ci.yml`
- **Quando é executado**: Em todo push feito para um pull request.
- **O que ele faz**:
  - **Lint**: Verifica se seu código segue as regras de formatação e estilo do projeto.
  - **Test**: Executa nossa suíte completa de testes automatizados em macOS, Windows e Linux, e em múltiplas versões do Node.js. Essa é a parte mais demorada do processo de CI.
  - **Post Coverage Comment**: Após todos os testes passarem com sucesso, um bot postará um comentário no seu PR. Esse comentário mostra um resumo de quão bem suas alterações estão cobertas por testes.
- **O que você deve fazer**:
  - Garantir que todas as verificações do CI passem. Um checkmark verde ✅ aparecerá ao lado do seu commit quando tudo estiver OK.
  - Se alguma verificação falhar (um "X" vermelho ❌), clique no link "Details" ao lado da falha para visualizar os logs, identificar o problema e enviar uma correção.

### 3. Triagem Contínua de Pull Requests: `Auditoria de PR e Sincronização de Labels`

Este workflow é executado periodicamente para garantir que todos os PRs abertos estejam corretamente vinculados a issues e possuam labels consistentes.

- **Arquivo do Workflow**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Quando ele é executado**: A cada 15 minutos em todos os pull requests abertos.
- **O que ele faz**:
  - **Verifica se há uma issue vinculada**: O bot analisa a descrição do seu PR procurando por palavras-chave que o vinculem a uma issue (ex.: `Fixes #123`, `Closes #456`).
  - **Adiciona `status/need-issue`**: Se nenhuma issue vinculada for encontrada, o bot adicionará a label `status/need-issue` ao seu PR. Este é um sinal claro de que uma issue precisa ser criada e vinculada.
  - **Sincroniza as labels**: Caso uma issue _esteja_ vinculada, o bot garante que as labels do PR correspondam exatamente às labels da issue. Ele adicionará quaisquer labels faltantes e removerá aquelas que não pertencem, além de remover a label `status/need-issue`, caso ela esteja presente.
- **O que você deve fazer**:
  - **Sempre vincule seu PR a uma issue.** Esta é a etapa mais importante. Adicione uma linha como `Resolves #<número-da-issue>` na descrição do seu PR.
  - Isso garantirá que seu PR seja categorizado corretamente e prossiga com fluidez pelo processo de revisão.

### 4. Triagem Contínua de Issues: `Scheduled Issue Triage`

Este é um workflow de fallback para garantir que nenhuma issue seja perdida no processo de triagem.

- **Arquivo do Workflow**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Quando ele é executado**: A cada hora em todas as issues abertas.
- **O que ele faz**:
  - Ele procura ativamente por issues que não possuem nenhuma label ou ainda têm a label `status/need-triage`.
  - Em seguida, aciona a mesma análise poderosa baseada no QwenCode usada pelo bot de triagem inicial para aplicar as labels corretas.
- **O que você deve fazer**:
  - Normalmente, você não precisa fazer nada. Este workflow serve como uma rede de segurança para garantir que toda issue seja eventualmente categorizada, mesmo que a triagem inicial falhe.

### 5. Automação de Releases

Este workflow cuida do processo de empacotamento e publicação de novas versões do Qwen Code.

- **Arquivo do Workflow**: `.github/workflows/release.yml`
- **Quando ele é executado**: Em um agendamento diário para releases "nightly", e manualmente para releases oficiais de patch/minor.
- **O que ele faz**:
  - Faz o build automático do projeto, incrementa os números de versão e publica os pacotes no npm.
  - Cria um release correspondente no GitHub com notas de release geradas automaticamente.
- **O que você deve fazer**:
  - Como contribuidor, você não precisa fazer nada neste processo. Você pode ter confiança de que assim que seu PR for mergeado na branch `main`, suas alterações serão incluídas na próxima release nightly.

Esperamos que esta visão detalhada seja útil. Se você tiver alguma dúvida sobre nossa automação ou processos, não hesite em perguntar!