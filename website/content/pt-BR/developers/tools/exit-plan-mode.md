# Ferramenta Exit Plan Mode (`exit_plan_mode`)

Este documento descreve a ferramenta `exit_plan_mode` para o Qwen Code.

## Descrição

Use `exit_plan_mode` quando estiver no modo de planejamento e tiver finalizado a apresentação do seu plano de implementação. Esta ferramenta solicita ao usuário que aprove ou rejeite o plano e faz a transição do modo de planejamento para o modo de implementação.

A ferramenta foi projetada especificamente para tarefas que exigem o planejamento das etapas de implementação antes da escrita do código. Ela NÃO deve ser usada para tarefas de pesquisa ou coleta de informações.

### Argumentos

`exit_plan_mode` aceita um argumento:

- `plan` (string, obrigatório): O plano de implementação que você deseja apresentar ao usuário para aprovação. Deve ser um plano conciso, formatado em Markdown, descrevendo as etapas de implementação.

## Como usar `exit_plan_mode` com o Qwen Code

A ferramenta Exit Plan Mode faz parte do fluxo de trabalho de planejamento do Qwen Code. Quando você está no modo de planejamento (geralmente após explorar uma base de código e projetar uma abordagem de implementação), use esta ferramenta para:

1. Apresentar seu plano de implementação ao usuário
2. Solicitar aprovação para prosseguir com a implementação
3. Fazer a transição do modo de planejamento para o modo de implementação com base na resposta do usuário

A ferramenta apresentará o plano ao usuário e fornecerá as seguintes opções:

- **Proceed Once**: Aprovar o plano apenas para esta sessão
- **Proceed Always**: Aprovar o plano e habilitar a aprovação automática para futuras operações de edição
- **Cancel**: Rejeitar o plano e permanecer no modo de planejamento

Uso:

```
exit_plan_mode(plan="Your detailed implementation plan here...")
```

## Quando usar esta ferramenta

Use `exit_plan_mode` quando:

1. **Tarefas de implementação**: Você está planejando as etapas de implementação para uma tarefa de codificação
2. **Conclusão do plano**: Você finalizou a exploração e o projeto da sua abordagem de implementação
3. **Aprovação do usuário necessária**: Você precisa da confirmação do usuário antes de prosseguir com alterações no código
4. **Tarefas de escrita de código**: A tarefa envolve escrever, modificar ou refatorar código

### Exemplos de uso adequado:

- "Help me implement user authentication" → Use após planejar a implementação do sistema de autenticação
- "Add a new API endpoint for user management" → Use após projetar a estrutura do endpoint
- "Refactor the database layer to use TypeORM" → Use após planejar a abordagem de refatoração

## Quando NÃO usar esta ferramenta

NÃO use `exit_plan_mode` para:

1. **Tarefas de pesquisa**: Tarefas focadas em entender ou explorar código existente
2. **Coleta de informações**: Quando você está pesquisando, lendo ou analisando sem implementar
3. **Tarefas de documentação**: Ao criar documentação sem alterações no código
4. **Tarefas de análise**: Ao fornecer explicações ou revisões sem implementação

### Exemplos de uso inadequado:

- "Search for and understand the implementation of vim mode in the codebase" → Não use (tarefa de pesquisa)
- "Explain how the authentication system works" → Não use (tarefa de análise)
- "Find all TODO comments in the project" → Não use (coleta de informações)

## Exemplos de `exit_plan_mode`

### Exemplo de planejamento de implementação

```
exit_plan_mode(plan="## Implementation Plan for User Dashboard

### 1. Create Dashboard Components
- Create `UserDashboard.tsx` with main dashboard layout
- Add `DashboardStats.tsx` for displaying user statistics
- Implement `ActivityFeed.tsx` for recent user activities

### 2. Add API Integration
- Create `dashboardApi.ts` for dashboard data fetching
- Add endpoints for user stats and activity data
- Implement error handling and loading states

### 3. Update Routing
- Add dashboard route in `App.tsx`
- Update navigation component with dashboard link
- Add route protection for authenticated users

### 4. Testing and Documentation
- Write unit tests for dashboard components
- Add integration tests for API calls
- Update user documentation with dashboard features

This implementation will take approximately 4-6 hours and requires changes to 8-10 files.")
```

### Exemplo de plano de refatoração

```
exit_plan_mode(plan="## Database Layer Refactoring Plan

### Phase 1: Setup and Configuration
- Install and configure TypeORM dependencies
- Create database connection configuration
- Set up entity definitions for existing models

### Phase 2: Migration
- Create migration scripts for existing data
- Implement new repository pattern using TypeORM
- Replace raw SQL queries with TypeORM query builder

### Phase 3: Testing and Validation
- Update all database tests to use TypeORM
- Validate data integrity after migration
- Performance testing to ensure no regressions

This refactoring will modernize our database layer while maintaining backward compatibility.")
```

## Tratamento de resposta do usuário

Após chamar `exit_plan_mode`, o usuário pode responder de várias formas:

- **Proceed Once**: O plano é aprovado para implementação imediata com as configurações padrão de confirmação
- **Proceed Always**: O plano é aprovado e a aprovação automática é habilitada para operações de edição subsequentes
- **Cancel**: O plano é rejeitado e o sistema permanece no modo de planejamento para ajustes adicionais

A ferramenta ajusta automaticamente o modo de aprovação com base na escolha do usuário, otimizando o processo de implementação de acordo com as preferências dele.

## Notas importantes

- **Apenas no modo de planejamento**: Esta ferramenta só deve ser usada quando você estiver atualmente no modo de planejamento
- **Foco em implementação**: Use apenas para tarefas que envolvam escrever ou modificar código
- **Planos concisos**: Mantenha os planos focados e concisos - priorize a clareza em vez de detalhes exaustivos
- **Suporte a Markdown**: Os planos suportam formatação Markdown para melhor legibilidade
- **Uso único**: A ferramenta deve ser usada uma vez por sessão de planejamento, quando estiver pronto para prosseguir
- **Controle do usuário**: A decisão final de prosseguir sempre cabe ao usuário

## Integração com o fluxo de trabalho de planejamento

A ferramenta Exit Plan Mode faz parte de um fluxo de trabalho de planejamento mais amplo:

1. **Entrar no modo de planejamento**: O usuário solicita ou o sistema determina que o planejamento é necessário
2. **Fase de exploração**: Analisar a base de código, entender os requisitos e explorar opções
3. **Projeto do plano**: Criar a estratégia de implementação com base na exploração
4. **Apresentação do plano**: Usar `exit_plan_mode` para apresentar o plano ao usuário
5. **Fase de implementação**: Após a aprovação, prosseguir com a implementação planejada

Esse fluxo de trabalho garante abordagens de implementação bem pensadas e dá aos usuários controle sobre alterações significativas no código.