# Automação e Processos de Triagem

Este documento fornece uma visão detalhada dos processos automatizados que utilizamos para gerenciar e triar issues e pull requests. Nosso objetivo é fornecer feedback rápido e garantir que as contribuições sejam revisadas e integradas de forma eficiente. Compreender essa automação ajudará você, como contribuidor, a saber o que esperar e como interagir da melhor forma com os bots do nosso repositório.

## Princípio Orientador: Issues e Pull Requests

Antes de tudo, quase todo Pull Request (PR) deve estar vinculado a uma Issue correspondente. A issue descreve o "o quê" e o "porquê" (o bug ou recurso), enquanto o PR é o "como" (a implementação). Essa separação nos ajuda a acompanhar o trabalho, priorizar recursos e manter um contexto histórico claro. Nossa automação foi construída em torno desse princípio.

---

## Fluxos de Trabalho Automatizados Detalhados

A seguir está uma descrição dos fluxos de trabalho automatizados específicos que são executados em nosso repositório.

### 1. Ao abrir uma Issue: `Automated Issue Triage`

Este é o primeiro bot com o qual você interagirá ao criar uma issue. Seu trabalho é realizar uma análise inicial e aplicar os rótulos corretos.

- **Arquivo de Workflow**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Quando é executado**: Imediatamente após a criação ou reabertura de uma issue.
- **O que ele faz**:
  - Utiliza um modelo Qwen para analisar o título e o corpo da issue com base em um conjunto detalhado de diretrizes.
  - **Aplica um rótulo `area/*`**: Categoriza a issue em uma área funcional do projeto (por exemplo, `area/ux`, `area/models`, `area/platform`).
  - **Aplica um rótulo `kind/*`**: Identifica o tipo da issue (por exemplo, `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Aplica um rótulo `priority/*`**: Atribui uma prioridade de P0 (crítico) a P3 (baixo), com base no impacto descrito.
  - **Pode aplicar `status/need-information`**: Se a issue não contiver detalhes essenciais (como logs ou etapas de reprodução), ela será sinalizada para solicitar mais informações.
  - **Pode aplicar `status/need-retesting`**: Se a issue fizer referência a uma versão da CLI que esteja seis versões ou mais desatualizada, ela será sinalizada para reteste em uma versão atual.
- **O que você deve fazer**:
  - Preencha o modelo da issue da forma mais completa possível. Quanto mais detalhes você fornecer, mais precisa será a triagem.
  - Se o rótulo `status/need-information` for adicionado, forneça os detalhes solicitados em um comentário.

### 2. Quando você abre um Pull Request: `Integração Contínua (CI)`

Este workflow garante que todas as alterações atendam aos nossos padrões de qualidade antes de serem mescladas.

- **Arquivo do Workflow**: `.github/workflows/ci.yml`
- **Quando é executado**: Em cada push para um pull request.
- **O que ele faz**:
  - **Lint**: Verifica se seu código segue as regras de formatação e estilo do nosso projeto.
  - **Test**: Executa nossa suíte completa de testes automatizados em macOS, Windows e Linux, e em múltiplas versões do Node.js. Esta é a parte mais demorada do processo de CI.
  - **Post Coverage Comment**: Após todos os testes terem passado com sucesso, um bot publicará um comentário no seu PR. Este comentário fornece um resumo de quão bem suas alterações são cobertas por testes.
- **O que você deve fazer**:
  - Certifique-se de que todas as verificações do CI passem. Um visto verde ✅ aparecerá ao lado do seu commit quando tudo estiver correto.
  - Se uma verificação falhar (um "X" vermelho ❌), clique no link "Details" ao lado da verificação com falha para visualizar os logs, identificar o problema e enviar uma correção.

### 3. Triagem Contínua para Pull Requests: `Auditoria de PR e Sincronização de Labels`

Este workflow é executado periodicamente para garantir que todos os PRs abertos estejam corretamente vinculados a issues e possuam labels consistentes.

- **Arquivo do Workflow**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Quando ele é executado**: A cada 15 minutos em todos os pull requests abertos.
- **O que ele faz**:
  - **Verifica se há uma issue vinculada**: O bot examina a descrição do seu PR em busca de uma palavra-chave que o vincule a uma issue (por exemplo, `Fixes #123`, `Closes #456`).
  - **Adiciona `status/need-issue`**: Se nenhuma issue vinculada for encontrada, o bot adicionará a label `status/need-issue` ao seu PR. Este é um sinal claro de que uma issue precisa ser criada e vinculada.
  - **Sincroniza labels**: Se uma issue _estiver_ vinculada, o bot garante que as labels do PR correspondam perfeitamente às labels da issue. Ele adicionará quaisquer labels ausentes e removerá aquelas que não pertencem, além de remover a label `status/need-issue`, caso ela esteja presente.
- **O que você deve fazer**:
  - **Sempre vincule seu PR a uma issue.** Esta é a etapa mais importante. Adicione uma linha como `Resolves #<número-da-issue>` na descrição do seu PR.
  - Isso garantirá que seu PR seja categorizado corretamente e prossiga suavemente pelo processo de revisão.

### 4. Triagem Contínua de Problemas: `Triagem Agendada de Problemas`

Este é um fluxo de trabalho alternativo para garantir que nenhum problema seja ignorado pelo processo de triagem.

- **Arquivo do Fluxo de Trabalho**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Quando ele é executado**: A cada hora em todos os problemas em aberto.
- **O que ele faz**:
  - Ele procura ativamente por problemas que não possuem rótulos ou ainda têm o rótulo `status/need-triage`.
  - Em seguida, aciona a mesma análise poderosa baseada no QwenCode usada pelo bot de triagem inicial para aplicar os rótulos corretos.
- **O que você deve fazer**:
  - Normalmente, você não precisa fazer nada. Este fluxo de trabalho serve como uma rede de segurança para garantir que todos os problemas sejam eventualmente categorizados, mesmo que a triagem inicial falhe.

### 5. Automação de Releases

Este workflow cuida do processo de empacotamento e publicação de novas versões do Qwen Code.

- **Arquivo do Workflow**: `.github/workflows/release.yml`
- **Quando é executado**: Em um agendamento diário para releases "nightly", e manualmente para releases oficiais de patch/menor.
- **O que faz**:
  - Constrói automaticamente o projeto, incrementa os números de versão e publica os pacotes no npm.
  - Cria um release correspondente no GitHub com notas de release geradas automaticamente.
- **O que você deve fazer**:
  - Como contribuidor, você não precisa fazer nada neste processo. Você pode ter confiança de que, uma vez que seu PR seja mesclado na branch `main`, suas alterações serão incluídas na próxima release nightly.

Esperamos que esta visão detalhada seja útil. Se você tiver alguma dúvida sobre nossa automação ou processos, não hesite em perguntar!