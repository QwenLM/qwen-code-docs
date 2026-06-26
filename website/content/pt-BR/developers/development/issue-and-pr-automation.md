# Processos de Automação e Triagem

Este documento fornece uma visão geral detalhada dos processos automatizados que usamos para gerenciar e fazer a triagem de issues e pull requests. Nosso objetivo é fornecer feedback rápido e garantir que as contribuições sejam revisadas e integradas de forma eficiente. Entender essa automação ajudará você, como contribuidor, a saber o que esperar e como interagir melhor com os bots do nosso repositório.

## Princípio Orientador: Issues e Pull Requests

Antes de mais nada, quase todo Pull Request (PR) deve estar vinculado a uma Issue correspondente. A issue descreve o "o quê" e o "porquê" (o bug ou funcionalidade), enquanto o PR é o "como" (a implementação). Essa separação nos ajuda a rastrear o trabalho, priorizar funcionalidades e manter um contexto histórico claro. Nossa automação é construída em torno desse princípio.

---

## Fluxos de Automação Detalhados

Aqui está uma descrição dos fluxos de automação específicos que são executados em nosso repositório.

### 1. Ao abrir uma Issue: `Triagem Automatizada de Issues`

Este é o primeiro bot com o qual você interagirá ao criar uma issue. Sua função é realizar uma análise inicial e aplicar os rótulos (labels) corretos.

- **Arquivo do Workflow**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Quando é executado**: Imediatamente após uma issue ser criada ou reaberta.
- **O que faz**:
  - Usa um modelo Qwen para analisar o título e o corpo da issue com base em um conjunto detalhado de diretrizes.
  - **Aplica um rótulo `area/*`**: Categoriza a issue em uma área funcional do projeto (ex.: `area/ux`, `area/models`, `area/platform`).
  - **Aplica um rótulo `kind/*`**: Identifica o tipo de issue (ex.: `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Aplica um rótulo `priority/*`**: Atribui uma prioridade de P0 (crítica) a P3 (baixa) com base no impacto descrito.
  - **Pode aplicar `status/need-information`**: Se a issue não tiver detalhes críticos (como logs ou passos para reproduzir), ela será sinalizada para solicitar mais informações.
  - **Pode aplicar `status/need-retesting`**: Se a issue fizer referência a uma versão da CLI com mais de seis versões de diferença, ela será sinalizada para ser testada novamente em uma versão atual.
- **O que você deve fazer**:
  - Preencha o template da issue da forma mais completa possível. Quanto mais detalhes você fornecer, mais precisa será a triagem.
  - Se o rótulo `status/need-information` for adicionado, forneça as informações solicitadas em um comentário.

### 2. Ao abrir um Pull Request: `Integração Contínua (CI)`

Este workflow garante que todas as alterações atendam aos nossos padrões de qualidade antes de serem mescladas.

- **Arquivo do Workflow**: `.github/workflows/ci.yml`
- **Quando é executado**: Em cada push para um pull request.
- **O que faz**:
  - **Lint**: Verifica se seu código segue as regras de formatação e estilo do nosso projeto.
  - **Teste**: Executa nossa suíte completa de testes automatizados em macOS, Windows e Linux, e em várias versões do Node.js. Esta é a parte mais demorada do processo de CI.
  - **Postar Comentário de Cobertura**: Após todos os testes serem aprovados com sucesso, um bot publica um comentário no seu PR. Este comentário fornece um resumo de quão bem suas alterações são cobertas pelos testes.
- **O que você deve fazer**:
  - Garanta que todas as verificações de CI passem. Um visto verde ✅ aparecerá ao lado do seu commit quando tudo estiver bem-sucedido.
  - Se uma verificação falhar (um "X" vermelho ❌), clique no link "Detalhes" ao lado da verificação com falha para visualizar os logs, identificar o problema e enviar uma correção.

### 3. Triagem Contínua para Pull Requests: `Auditoria de PR e Sincronização de Rótulos`

Este workflow é executado periodicamente para garantir que todos os PRs abertos estejam corretamente vinculados a issues e tenham rótulos consistentes.

- **Arquivo do Workflow**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Quando é executado**: A cada 15 minutos em todos os pull requests abertos.
- **O que faz**:
  - **Verifica se há uma issue vinculada**: O bot examina a descrição do seu PR em busca de uma palavra-chave que o vincule a uma issue (ex.: `Fixes #123`, `Closes #456`).
  - **Adiciona `status/need-issue`**: Se nenhuma issue vinculada for encontrada, o bot adicionará o rótulo `status/need-issue` ao seu PR. Este é um sinal claro de que uma issue precisa ser criada e vinculada.
  - **Sincroniza rótulos**: Se uma issue _estiver_ vinculada, o bot garante que os rótulos do PR correspondam exatamente aos rótulos da issue. Ele adicionará quaisquer rótulos ausentes e removerá aqueles que não pertencem, e também removerá o rótulo `status/need-issue` se ele estiver presente.
- **O que você deve fazer**:
  - **Sempre vincule seu PR a uma issue.** Este é o passo mais importante. Adicione uma linha como `Resolves #<número-da-issue>` à descrição do seu PR.
  - Isso garantirá que seu PR seja categorizado corretamente e progrida no processo de revisão de forma suave.

### 4. Triagem Contínua para Issues: `Triagem Programada de Issues`

Este é um workflow de fallback para garantir que nenhuma issue passe despercebida pelo processo de triagem.

- **Arquivo do Workflow**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Quando é executado**: A cada hora em todas as issues abertas.
- **O que faz**:
  - Ele procura ativamente por issues que não tenham nenhum rótulo ou que ainda tenham o rótulo `status/need-triage`.
  - Em seguida, aciona a mesma análise poderosa baseada no QwenCode do bot de triagem inicial para aplicar os rótulos corretos.
- **O que você deve fazer**:
  - Você normalmente não precisa fazer nada. Este workflow é uma rede de segurança para garantir que toda issue seja eventualmente categorizada, mesmo se a triagem inicial falhar.

### 5. Automação de Lançamento (Release)

Este workflow lida com o processo de empacotamento e publicação de novas versões do Qwen Code.

- **Arquivo do Workflow**: `.github/workflows/release.yml`
- **Quando é executado**: Em uma programação diária para lançamentos "noturnos" (nightly), e manualmente para lançamentos oficiais de patch/minor.
- **O que faz**:
  - Constrói automaticamente o projeto, incrementa os números de versão e publica os pacotes no npm.
  - Cria um lançamento correspondente no GitHub com notas de lançamento geradas.
- **O que você deve fazer**:
  - Como contribuidor, você não precisa fazer nada para este processo. Pode ficar tranquilo que, uma vez que seu PR for mesclado no branch `main`, suas alterações serão incluídas no próximo lançamento noturno.

Esperamos que esta visão geral detalhada seja útil. Se você tiver alguma dúvida sobre nossa automação ou processos, não hesite em perguntar!