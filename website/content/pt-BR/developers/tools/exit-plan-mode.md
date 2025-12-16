# Ferramenta de Saída do Modo de Planejamento (`exit_plan_mode`)

Este documento descreve a ferramenta `exit_plan_mode` para o Qwen Code.

## Descrição

Use `exit_plan_mode` quando você estiver no modo de planejamento e tiver terminado de apresentar seu plano de implementação. Esta ferramenta solicita ao usuário que aprove ou rejeite o plano e faz a transição do modo de planejamento para o modo de implementação.

A ferramenta foi especificamente projetada para tarefas que exigem o planejamento das etapas de implementação antes da escrita do código. Ela NÃO deve ser usada para tarefas de pesquisa ou coleta de informações.

### Argumentos

`exit_plan_mode` recebe um argumento:

- `plan` (string, obrigatório): O plano de implementação que você deseja apresentar ao usuário para aprovação. Este deve ser um plano conciso, formatado em markdown, descrevendo as etapas de implementação.

## Como usar `exit_plan_mode` com Qwen Code

A ferramenta Exit Plan Mode faz parte do fluxo de trabalho de planejamento do Qwen Code. Quando você está no modo de planejamento (geralmente após explorar uma base de código e projetar uma abordagem de implementação), você usa esta ferramenta para:

1. Apresentar seu plano de implementação ao usuário
2. Solicitar aprovação para prosseguir com a implementação
3. Transicionar do modo de planejamento para o modo de implementação com base na resposta do usuário

A ferramenta solicitará ao usuário seu plano e fornecerá opções para:

- **Prosseguir Uma Vez**: Aprovar o plano apenas para esta sessão
- **Prosseguir Sempre**: Aprovar o plano e habilitar a aprovação automática para operações de edição futuras
- **Cancelar**: Rejeitar o plano e permanecer no modo de planejamento

Uso:

```
exit_plan_mode(plan="Seu plano de implementação detalhado aqui...")
```

## Quando Usar Esta Ferramenta

Use `exit_plan_mode` quando:

1. **Tarefas de implementação**: Você está planejando os passos de implementação para uma tarefa de codificação
2. **Conclusão do plano**: Você terminou de explorar e projetar sua abordagem de implementação
3. **Aprovação do usuário necessária**: Você precisa da confirmação do usuário antes de prosseguir com as alterações de código
4. **Tarefas de escrita de código**: A tarefa envolve escrever, modificar ou refatorar código

### Exemplos de uso apropriado:

- "Ajude-me a implementar autenticação de usuário" → Use após planejar a implementação do sistema de autenticação
- "Adicione um novo endpoint de API para gerenciamento de usuários" → Use após projetar a estrutura do endpoint
- "Refatore a camada de banco de dados para usar TypeORM" → Use após planejar a abordagem de refatoração

## Quando NÃO Usar Esta Ferramenta

NÃO use `exit_plan_mode` para:

1. **Tarefas de pesquisa**: Tarefas focadas em entender ou explorar código existente
2. **Coleta de informações**: Quando você está pesquisando, lendo ou analisando sem implementar
3. **Tarefas de documentação**: Quando criando documentação sem alterações de código
4. **Tarefas de análise**: Quando fornecendo explicações ou revisões sem implementação

### Exemplos de uso inadequado:

- "Pesquisar e entender a implementação do modo vim na base de código" → Não use (tarefa de pesquisa)
- "Explicar como o sistema de autenticação funciona" → Não use (tarefa de análise)
- "Encontrar todos os comentários TODO no projeto" → Não use (coleta de informações)

## Exemplos de `exit_plan_mode`

### Exemplo de planejamento de implementação

```
exit_plan_mode(plan="## Plano de Implementação para o Painel do Usuário

### 1. Criar Componentes do Dashboard
- Criar `UserDashboard.tsx` com o layout principal do dashboard
- Adicionar `DashboardStats.tsx` para exibir estatísticas do usuário
- Implementar `ActivityFeed.tsx` para atividades recentes do usuário

### 2. Adicionar Integração com API
- Criar `dashboardApi.ts` para buscar dados do dashboard
- Adicionar endpoints para estatísticas do usuário e dados de atividade
- Implementar tratamento de erros e estados de carregamento

### 3. Atualizar Roteamento
- Adicionar rota do dashboard em `App.tsx`
- Atualizar componente de navegação com link para o dashboard
- Adicionar proteção de rota para usuários autenticados

### 4. Testes e Documentação
- Escrever testes unitários para os componentes do dashboard
- Adicionar testes de integração para chamadas da API
- Atualizar documentação do usuário com funcionalidades do dashboard

Esta implementação levará aproximadamente 4-6 horas e requer alterações em 8-10 arquivos.")
```

### Exemplo de plano de refatoração

```
exit_plan_mode(plan="## Plano de Refatoração da Camada de Banco de Dados

### Fase 1: Configuração e Instalação
- Instalar e configurar dependências do TypeORM
- Criar configuração de conexão com o banco de dados
- Configurar definições de entidades para modelos existentes

### Fase 2: Migração
- Criar scripts de migração para dados existentes
- Implementar novo padrão de repositório usando TypeORM
- Substituir consultas SQL brutas pelo construtor de consultas do TypeORM

### Fase 3: Testes e Validação
- Atualizar todos os testes de banco de dados para usar TypeORM
- Validar integridade dos dados após a migração
- Testes de performance para garantir que não houve regressões

Esta refatoração modernizará nossa camada de banco de dados mantendo compatibilidade retroativa.")```

## Tratamento de Resposta do Usuário

Após chamar `exit_plan_mode`, o usuário pode responder de várias maneiras:

- **Prosseguir Uma Vez**: O plano é aprovado para implementação imediata com configurações de confirmação padrão
- **Prosseguir Sempre**: O plano é aprovado e a aprovação automática é habilitada para operações de edição subsequentes
- **Cancelar**: O plano é rejeitado, e o sistema permanece no modo de planejamento para planejamento adicional

A ferramenta ajusta automaticamente o modo de aprovação com base na escolha do usuário, agilizando o processo de implementação de acordo com as preferências do usuário.

## Notas Importantes

- **Apenas no modo de planejamento**: Esta ferramenta deve ser usada apenas quando você estiver atualmente no modo de planejamento
- **Foco na implementação**: Use apenas para tarefas que envolvam escrever ou modificar código
- **Planos concisos**: Mantenha os planos focados e concisos - busque clareza em vez de detalhes exaustivos
- **Suporte a Markdown**: Os planos suportam formatação Markdown para melhor legibilidade
- **Uso único**: A ferramenta deve ser usada uma vez por sessão de planejamento quando estiver pronto para prosseguir
- **Controle do usuário**: A decisão final de prosseguir sempre cabe ao usuário

## Integração com o Fluxo de Planejamento

A ferramenta Exit Plan Mode faz parte de um fluxo de planejamento maior:

1. **Entrar no Modo de Planejamento**: O usuário solicita ou o sistema determina que o planejamento é necessário
2. **Fase de Exploração**: Analisar a base de código, entender os requisitos, explorar opções
3. **Design do Plano**: Criar uma estratégia de implementação baseada na exploração
4. **Apresentação do Plano**: Usar `exit_plan_mode` para apresentar o plano ao usuário
5. **Fase de Implementação**: Após aprovação, prosseguir com a implementação planejada

Este fluxo garante abordagens de implementação bem pensadas e dá aos usuários controle sobre mudanças significativas no código.