# Ferramenta Modo de Saída do Plano (`exit_plan_mode`)

Este documento descreve a ferramenta `exit_plan_mode` para o Qwen Code.

## Descrição

Use `exit_plan_mode` quando estiver no modo de plano e tiver terminado de apresentar seu plano de implementação. Esta ferramenta solicita que o usuário aprove ou rejeite o plano e faz a transição do modo de planejamento para o modo de implementação.

A ferramenta é projetada especificamente para tarefas que exigem planejamento de etapas de implementação antes de escrever código. Ela **não** deve ser usada para tarefas de pesquisa ou coleta de informações.

### Argumentos

`exit_plan_mode` recebe um argumento:

- `plan` (string, obrigatório): O plano de implementação que você deseja apresentar ao usuário para aprovação. Deve ser um plano conciso, formatado em Markdown, descrevendo as etapas de implementação.

## Como usar `exit_plan_mode` com o Qwen Code

A ferramenta Modo de Saída do Plano faz parte do fluxo de trabalho de planejamento do Qwen Code. Quando você estiver no modo de plano (normalmente após explorar uma base de código e projetar uma abordagem de implementação), você usa esta ferramenta para:

1. Apresentar seu plano de implementação ao usuário
2. Solicitar aprovação para prosseguir com a implementação
3. Transicionar do modo de plano para o modo de implementação com base na resposta do usuário

A ferramenta exibirá seu plano ao usuário e fornecerá opções para:

- **Prosseguir Uma Vez**: Aprova o plano apenas para esta sessão
- **Prosseguir Sempre**: Aprova o plano e ativa a aprovação automática para futuras operações de edição
- **Cancelar**: Rejeita o plano e permanece no modo de planejamento

Uso:

```
exit_plan_mode(plan="Seu plano de implementação detalhado aqui...")
```

## Quando Usar Esta Ferramenta

Use `exit_plan_mode` quando:

1. **Tarefas de implementação**: Você está planejando as etapas de implementação para uma tarefa de codificação
2. **Conclusão do plano**: Você terminou de explorar e projetar sua abordagem de implementação
3. **Aprovação do usuário necessária**: Você precisa da confirmação do usuário antes de prosseguir com alterações no código
4. **Tarefas de escrita de código**: A tarefa envolve escrever, modificar ou refatorar código

### Exemplos de uso apropriado:

- "Help me implement user authentication" → Use após planejar a implementação do sistema de autenticação
- "Add a new API endpoint for user management" → Use após projetar a estrutura do endpoint
- "Refactor the database layer to use TypeORM" → Use após planejar a abordagem de refatoração

## Quando NÃO Usar Esta Ferramenta

**Não** use `exit_plan_mode` para:

1. **Tarefas de pesquisa**: Tarefas focadas em entender ou explorar código existente
2. **Coleta de informações**: Quando você está pesquisando, lendo ou analisando sem implementar
3. **Tarefas de documentação**: Quando está criando documentação sem alterações de código
4. **Tarefas de análise**: Quando está fornecendo explicações ou revisões sem implementação

### Exemplos de uso inadequado:

- "Search for and understand the implementation of vim mode in the codebase" → Não usar (tarefa de pesquisa)
- "Explain how the authentication system works" → Não usar (tarefa de análise)
- "Find all TODO comments in the project" → Não usar (coleta de informações)

## Exemplos de `exit_plan_mode`

### Exemplo de planejamento de implementação

```
exit_plan_mode(plan="## Plano de Implementação para o Dashboard do Usuário

### 1. Criar Componentes do Dashboard
- Criar `UserDashboard.tsx` com layout principal do dashboard
- Adicionar `DashboardStats.tsx` para exibir estatísticas do usuário
- Implementar `ActivityFeed.tsx` para atividades recentes do usuário

### 2. Adicionar Integração com API
- Criar `dashboardApi.ts` para busca de dados do dashboard
- Adicionar endpoints para estatísticas do usuário e dados de atividade
- Implementar tratamento de erros e estados de carregamento

### 3. Atualizar Roteamento
- Adicionar rota do dashboard em `App.tsx`
- Atualizar componente de navegação com link para o dashboard
- Adicionar proteção de rota para usuários autenticados

### 4. Testes e Documentação
- Escrever testes unitários para os componentes do dashboard
- Adicionar testes de integração para chamadas de API
- Atualizar documentação do usuário com os recursos do dashboard

Esta implementação levará aproximadamente 4-6 horas e exigirá alterações em 8-10 arquivos.")
```

### Exemplo de plano de refatoração

```
exit_plan_mode(plan="## Plano de Refatoração da Camada de Banco de Dados

### Fase 1: Configuração e Setup
- Instalar e configurar dependências do TypeORM
- Criar configuração de conexão com o banco de dados
- Definir entidades para os modelos existentes

### Fase 2: Migração
- Criar scripts de migração para dados existentes
- Implementar novo padrão de repositórios usando TypeORM
- Substituir consultas SQL brutas pelo construtor de consultas do TypeORM

### Fase 3: Testes e Validação
- Atualizar todos os testes de banco de dados para usar TypeORM
- Validar integridade dos dados após a migração
- Testes de desempenho para garantir que não haja regressões

Esta refatoração modernizará nossa camada de banco de dados mantendo a compatibilidade com versões anteriores.")
```

## Tratamento da Resposta do Usuário

Após chamar `exit_plan_mode`, o usuário pode responder de várias formas:

- **Prosseguir Uma Vez**: O plano é aprovado para implementação imediata com as configurações de confirmação padrão
- **Prosseguir Sempre**: O plano é aprovado e a aprovação automática é ativada para operações de edição subsequentes
- **Cancelar**: O plano é rejeitado e o sistema permanece no modo de plano para continuar o planejamento

A ferramenta ajusta automaticamente o modo de aprovação com base na escolha do usuário, simplificando o processo de implementação de acordo com as preferências do usuário.

## Notas Importantes

- **Apenas modo de plano**: Esta ferramenta deve ser usada somente quando você estiver atualmente no modo de plano
- **Foco em implementação**: Use apenas para tarefas que envolvem escrever ou modificar código
- **Planos concisos**: Mantenha os planos focados e concisos — busque clareza em vez de detalhamento excessivo
- **Suporte a Markdown**: Os planos suportam formatação Markdown para melhor legibilidade
- **Uso único**: A ferramenta deve ser usada uma vez por sessão de planejamento quando estiver pronto para prosseguir
- **Controle do usuário**: A decisão final de prosseguir sempre cabe ao usuário

## Integração com o Fluxo de Trabalho de Planejamento

A ferramenta Modo de Saída do Plano faz parte de um fluxo de trabalho de planejamento maior:

1. **Entrar no Modo de Plano**: O usuário solicita ou o sistema determina que o planejamento é necessário
2. **Fase de Exploração**: Analisar a base de código, entender os requisitos, explorar opções
3. **Projeto do Plano**: Criar estratégia de implementação baseada na exploração
4. **Apresentação do Plano**: Usar `exit_plan_mode` para apresentar o plano ao usuário
5. **Fase de Implementação**: Após a aprovação, prosseguir com a implementação planejada

Esse fluxo garante abordagens de implementação bem pensadas e dá aos usuários controle sobre alterações significativas no código.