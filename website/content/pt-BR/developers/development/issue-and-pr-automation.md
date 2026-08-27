# Processos de Automação e Triagem

Este documento fornece uma visão geral detalhada dos processos automatizados que usamos para gerenciar e fazer a triagem de issues e pull requests. Nosso objetivo é fornecer feedback rápido e garantir que as contribuições sejam revisadas e integradas de forma eficiente. Entender essa automação ajudará você, como contribuidor, a saber o que esperar e como interagir melhor com os bots do nosso repositório.

## Princípio Orientador: Issues e Pull Requests

Antes de mais nada, quase todo Pull Request (PR) deve estar vinculado a uma Issue correspondente. A issue descreve o "o quê" e o "porquê" (o bug ou funcionalidade), enquanto o PR é o "como" (a implementação). Essa separação nos ajuda a rastrear o trabalho, priorizar funcionalidades e manter um contexto histórico claro. Nossa automação é construída em torno desse princípio.

---

## Fluxos de Automação Detalhados

Aqui está uma descrição dos fluxos de automação específicos que são executados em nosso repositório.

### 1. Ao abrir uma Issue: `Qwen Triage`

Este é o primeiro bot com o qual você interagirá ao criar uma issue. Sua função é realizar uma análise inicial e aplicar os rótulos (labels) corretos.

- **Arquivo do Workflow**: `.github/workflows/qwen-triage.yml`
- **Quando é executado**: Imediatamente após uma issue ser criada, editada ou reaberta, ou quando um mantenedor solicita a triagem manualmente.
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
  - Mantenedores podem comentar `@qwen-code /triage` para executar a triagem novamente.

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

### 3. Automação de Release

Este workflow lida com o processo de empacotamento e publicação de novas versões do Qwen Code.

- **Arquivo do Workflow**: `.github/workflows/release.yml`
- **Quando é executado**: Em uma programação diária para lançamentos "noturnos" (nightly), e manualmente para lançamentos oficiais de patch/minor.
- **O que faz**:
  - Constrói automaticamente o projeto, incrementa os números de versão e publica os pacotes no npm.
  - Cria um lançamento correspondente no GitHub com notas de lançamento geradas.
- **O que você deve fazer**:
  - Como contribuidor, você não precisa fazer nada para este processo. Pode ficar tranquilo que, uma vez que seu PR for mesclado no branch `main`, suas alterações serão incluídas no próximo lançamento noturno.

Esperamos que esta visão geral detalhada seja útil. Se você tiver alguma dúvida sobre nossa automação ou processos, não hesite em perguntar!
