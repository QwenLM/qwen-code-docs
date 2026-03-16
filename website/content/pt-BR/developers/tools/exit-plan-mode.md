# Ferramenta de Saída do Modo de Plano (`exit_plan_mode`)

Este documento descreve a ferramenta `exit_plan_mode` para o Qwen Code.

## Descrição

Use `exit_plan_mode` quando você estiver no modo de plano e tiver concluído a apresentação do seu plano de implementação. Essa ferramenta solicita ao usuário que aprove ou rejeite o plano e faz a transição do modo de planejamento para o modo de implementação.

A ferramenta foi projetada especificamente para tarefas que exigem o planejamento dos passos de implementação antes da escrita do código. Ela NÃO deve ser usada em tarefas de pesquisa ou coleta de informações.

### Argumentos

`exit_plan_mode` aceita um único argumento:

- `plan` (string, obrigatório): O plano de implementação que você deseja apresentar ao usuário para aprovação. Esse plano deve ser conciso e formatado em Markdown, descrevendo os passos de implementação.

## Como usar `exit_plan_mode` com o Qwen Code

A ferramenta Exit Plan Mode faz parte do fluxo de trabalho de planejamento do Qwen Code. Quando você está no modo de planejamento (geralmente após explorar uma base de código e projetar uma abordagem de implementação), usa essa ferramenta para:

1. Apresentar seu plano de implementação ao usuário
2. Solicitar aprovação para prosseguir com a implementação
3. Transicionar do modo de planejamento para o modo de implementação com base na resposta do usuário

A ferramenta solicitará ao usuário seu plano e fornecerá as seguintes opções:

- **Prosseguir Uma Vez**: Aprovar o plano apenas para esta sessão
- **Prosseguir Sempre**: Aprovar o plano e habilitar aprovação automática para futuras operações de edição
- **Cancelar**: Rejeitar o plano e permanecer no modo de planejamento

Uso:

```
exit_plan_mode(plan="Seu plano detalhado de implementação aqui...")
```

## Quando Usar Esta Ferramenta

Use `exit_plan_mode` quando:

1. **Tarefas de implementação**: Você está planejando as etapas de implementação para uma tarefa de programação  
2. **Conclusão do plano**: Você terminou de explorar e projetar sua abordagem de implementação  
3. **Necessidade de aprovação do usuário**: Você precisa da confirmação do usuário antes de prosseguir com as alterações no código  
4. **Tarefas de escrita de código**: A tarefa envolve escrever, modificar ou refatorar código  

### Exemplos de uso apropriado:

- "Me ajude a implementar autenticação de usuários" → Use após planejar a implementação do sistema de autenticação  
- "Adicione um novo endpoint de API para gerenciamento de usuários" → Use após projetar a estrutura do endpoint  
- "Refatore a camada de banco de dados para usar TypeORM" → Use após planejar a abordagem de refatoração

## Quando NÃO usar esta ferramenta

NÃO use `exit_plan_mode` para:

1. **Tarefas de pesquisa**: Tarefas focadas em compreender ou explorar código existente  
2. **Coleta de informações**: Quando você estiver pesquisando, lendo ou analisando sem implementar  
3. **Tarefas de documentação**: Quando criar documentação sem alterações no código  
4. **Tarefas de análise**: Quando fornecer explicações ou revisões sem implementação  

### Exemplos de uso inadequado:

- "Pesquisar e compreender a implementação do modo vim na base de código" → Não use (tarefa de pesquisa)  
- "Explique como funciona o sistema de autenticação" → Não use (tarefa de análise)  
- "Encontre todos os comentários TODO no projeto" → Não use (coleta de informações)  

## Exemplos de `exit_plan_mode`

### Exemplo de planejamento de implementação

```
exit_plan_mode(plan="## Plano de Implementação para o Painel de Usuário

### 1. Criar Componentes do Painel de Controle  
- Crie `UserDashboard.tsx` com o layout principal do painel de controle  
- Adicione `DashboardStats.tsx` para exibir as estatísticas do usuário  
- Implemente `ActivityFeed.tsx` para exibir as atividades recentes do usuário  

### 2. Adicionar Integração com API  
- Crie `dashboardApi.ts` para buscar dados do painel de controle  
- Adicione endpoints para estatísticas do usuário e dados de atividade  
- Implemente tratamento de erros e estados de carregamento  

### 3. Atualizar o Roteamento  
- Adicione a rota do painel de controle em `App.tsx`  
- Atualize o componente de navegação com o link para o painel de controle  
- Adicione proteção de rota para usuários autenticados  

### 4. Testes e Documentação  
- Escreva testes unitários para os componentes do painel de controle  
- Adicione testes de integração para chamadas à API  
- Atualize a documentação do usuário com as funcionalidades do painel de controle  

Essa implementação levará aproximadamente 4–6 horas e exigirá alterações em 8–10 arquivos.  
```

### Exemplo de plano de refatoração  

```
exit_plan_mode(plan="## Plano de Refatoração da Camada de Banco de Dados

### Fase 1: Configuração e Instalação
- Instalar e configurar as dependências do TypeORM
- Criar a configuração da conexão com o banco de dados
- Configurar definições de entidade para os modelos existentes

### Fase 2: Migração
- Criar scripts de migração para os dados existentes
- Implementar o novo padrão de repositório usando o TypeORM
- Substituir consultas SQL brutas pelo construtor de consultas do TypeORM

### Fase 3: Testes e Validação
- Atualizar todos os testes de banco de dados para usar o TypeORM
- Validar a integridade dos dados após a migração
- Testes de desempenho para garantir que não haja regressões

Essa refatoração modernizará nossa camada de banco de dados, mantendo ao mesmo tempo a compatibilidade com versões anteriores.

## Manipulação da Resposta do Usuário

Após chamar `exit_plan_mode`, o usuário pode responder de várias maneiras:

- **Prosseguir Uma Vez**: O plano é aprovado para implementação imediata com as configurações padrão de confirmação  
- **Prosseguir Sempre**: O plano é aprovado e a aprovação automática é ativada para operações de edição subsequentes  
- **Cancelar**: O plano é rejeitado e o sistema permanece no modo de planejamento para novas etapas de planejamento  

A ferramenta ajusta automaticamente o modo de aprovação com base na escolha do usuário, simplificando o processo de implementação de acordo com as preferências do usuário.

## Observações Importantes

- **Apenas no modo de planejamento**: Esta ferramenta deve ser usada somente quando você estiver atualmente no modo de planejamento  
- **Foco na implementação**: Use-a apenas para tarefas que envolvam escrever ou modificar código  
- **Planos concisos**: Mantenha os planos focados e sucintos — priorize a clareza em vez de detalhes excessivos  
- **Suporte a Markdown**: Os planos suportam formatação em Markdown para melhor legibilidade  
- **Uso único**: A ferramenta deve ser usada uma única vez por sessão de planejamento, quando estiver pronto para prosseguir  
- **Controle do usuário**: A decisão final sobre prosseguir sempre cabe ao usuário

## Integração com o Fluxo de Trabalho de Planejamento

A ferramenta Modo de Plano de Saída faz parte de um fluxo de trabalho de planejamento maior:

1. **Entrar no Modo de Plano**: O usuário solicita ou o sistema determina que o planejamento é necessário  
2. **Fase de Exploração**: Analisar a base de código, compreender os requisitos e explorar as opções  
3. **Elaboração do Plano**: Criar uma estratégia de implementação com base na exploração  
4. **Apresentação do Plano**: Usar `exit_plan_mode` para apresentar o plano ao usuário  
5. **Fase de Implementação**: Após aprovação, prosseguir com a implementação planejada  

Esse fluxo de trabalho garante abordagens de implementação bem pensadas e dá aos usuários controle sobre alterações significativas no código.