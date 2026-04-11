# Modo de Aprovação

O Qwen Code oferece quatro modos de permissão distintos que permitem controlar de forma flexível como a IA interage com seu código e sistema, com base na complexidade da tarefa e no nível de risco.

## Comparação dos Modos de Permissão

| Mode           | File Editing                | Shell Commands              | Best For                                                                                               | Risk Level |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**​      | ❌ Apenas análise somente leitura  | ❌ Não executados             | • Exploração de código <br>• Planejamento de alterações complexas <br>• Revisão de código segura                               | Mais baixo     |
| **Default**​   | ✅ Aprovação manual necessária | ✅ Aprovação manual necessária | • Codebases novos/desconhecidos <br>• Sistemas críticos <br>• Colaboração em equipe <br>• Aprendizado e ensino | Baixo        |
| **Auto-Edit**​ | ✅ Aprovado automaticamente            | ❌ Aprovação manual necessária | • Tarefas de desenvolvimento diário <br>• Refatoração e melhorias de código <br>• Automação segura                | Médio     |
| **YOLO**​      | ✅ Aprovado automaticamente            | ✅ Aprovado automaticamente            | • Projetos pessoais confiáveis <br>• Scripts automatizados/CI/CD <br>• Tarefas de processamento em lote                 | Mais alto    |

### Guia de Referência Rápida

- **Comece no Modo Plan**: Ideal para entender o contexto antes de fazer alterações
- **Trabalhe no Modo Default**: A escolha equilibrada para a maioria das tarefas de desenvolvimento
- **Mude para Auto-Edit**: Quando estiver fazendo muitas alterações seguras no código
- **Use YOLO com moderação**: Apenas para automação confiável em ambientes controlados

> [!tip]
>
> Você pode alternar rapidamente entre os modos durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows). A barra de status do terminal mostra o modo atual, para que você sempre saiba quais permissões o Qwen Code possui.

## 1. Use o Modo Plan para análise segura de código

O Modo Plan instrui o Qwen Code a criar um plano analisando o codebase com operações **somente leitura**, perfeito para explorar codebases, planejar alterações complexas ou revisar código com segurança.

### Quando usar o Modo Plan

- **Implementação em várias etapas**: Quando seu recurso exige edições em muitos arquivos
- **Exploração de código**: Quando você quer pesquisar o codebase a fundo antes de alterar qualquer coisa
- **Desenvolvimento interativo**: Quando você quer iterar sobre a direção junto com o Qwen Code

### Como usar o Modo Plan

**Ativar o Modo Plan durante uma sessão**

Você pode alternar para o Modo Plan durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão.

Se você estiver no Modo Normal, **Shift+Tab** (ou **Tab** no Windows) primeiro alterna para o modo `auto-edits`, indicado por `⏵⏵ accept edits on` na parte inferior do terminal. Um novo **Shift+Tab** (ou **Tab** no Windows) alternará para o Modo Plan, indicado por `⏸ plan mode`.

**Use o comando `/plan`**

O comando `/plan` oferece um atalho rápido para entrar e sair do Modo Plan:

```bash
/plan                          # Entrar no modo plan
/plan refactor the auth module # Entrar no modo plan e iniciar o planejamento
/plan exit                     # Sair do modo plan, restaurar o modo anterior
```

Ao sair do Modo Plan com `/plan exit`, seu modo de aprovação anterior é restaurado automaticamente (por exemplo, se você estava no Auto-Edit antes de entrar no Modo Plan, retornará ao Auto-Edit).

**Iniciar uma nova sessão no Modo Plan**

Para iniciar uma nova sessão no Modo Plan, use `/approval-mode` e selecione `plan`

```bash
/approval-mode
```

**Executar consultas "headless" no Modo Plan**

Você também pode executar uma consulta no Modo Plan diretamente com `-p` ou `prompt`:

```bash
qwen --prompt "What is machine learning?"
```

### Exemplo: Planejando uma refatoração complexa

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

O Qwen Code entra no Modo Plan e analisa a implementação atual para criar um plano abrangente. Refine com perguntas de acompanhamento:

```
What about backward compatibility?
How should we handle database migration?
```

### Configurar o Modo Plan como padrão

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Use o Modo Default para Interação Controlada

O Modo Default é a forma padrão de trabalhar com o Qwen Code. Neste modo, você mantém controle total sobre todas as operações potencialmente arriscadas — o Qwen Code solicitará sua aprovação antes de fazer qualquer alteração em arquivos ou executar comandos de shell.

### Quando usar o Modo Default

- **Novo em um codebase**: Quando você está explorando um projeto desconhecido e quer ser extra cauteloso
- **Sistemas críticos**: Ao trabalhar com código de produção, infraestrutura ou dados sensíveis
- **Aprendizado e ensino**: Quando você quer entender cada etapa que o Qwen Code está executando
- **Colaboração em equipe**: Quando várias pessoas estão trabalhando no mesmo codebase
- **Operações complexas**: Quando as alterações envolvem múltiplos arquivos ou lógica complexa

### Como usar o Modo Default

**Ativar o Modo Default durante uma sessão**

Você pode alternar para o Modo Default durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão. Se estiver em qualquer outro modo, pressionar **Shift+Tab** (ou **Tab** no Windows) eventualmente retornará ao Modo Default, indicado pela ausência de qualquer indicador de modo na parte inferior do terminal.

**Iniciar uma nova sessão no Modo Default**

O Modo Default é o modo inicial ao iniciar o Qwen Code. Se você alterou os modos e deseja retornar ao Modo Default, use:

```
/approval-mode default
```

**Executar consultas "headless" no Modo Default**

Ao executar comandos headless, o Modo Default é o comportamento padrão. Você pode especificá-lo explicitamente com:

```
qwen --prompt "Analyze this code for potential bugs"
```

### Exemplo: Implementando um recurso com segurança

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

O Qwen Code analisará seu codebase e proporá um plano. Em seguida, solicitará aprovação antes de:

1. Criar novos arquivos (controllers, models, migrations)
2. Modificar arquivos existentes (adicionar novas colunas, atualizar APIs)
3. Executar qualquer comando de shell (migrations de banco de dados, instalação de dependências)

Você pode revisar cada alteração proposta e aprová-la ou rejeitá-la individualmente.

### Configurar o Modo Default como padrão

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Modo Auto-Edit

O Modo Auto-Edit instrui o Qwen Code a aprovar automaticamente edições em arquivos, enquanto exige aprovação manual para comandos de shell. É ideal para acelerar fluxos de trabalho de desenvolvimento mantendo a segurança do sistema.

### Quando usar o Modo Auto-Edit

- **Desenvolvimento diário**: Ideal para a maioria das tarefas de codificação
- **Automação segura**: Permite que a IA modifique o código enquanto previne a execução acidental de comandos perigosos
- **Colaboração em equipe**: Use em projetos compartilhados para evitar impactos não intencionais em outros membros

### Como alternar para este modo

```
# Alternar via comando
/approval-mode auto-edit

# Ou usar atalho de teclado
Shift+Tab (ou Tab no Windows) # Alternar de outros modos
```

### Exemplo de Fluxo de Trabalho

1. Você pede ao Qwen Code para refatorar uma função
2. A IA analisa o código e propõe alterações
3. **Aplica automaticamente** todas as alterações nos arquivos sem confirmação
4. Se os testes precisarem ser executados, ele **solicitará aprovação** para executar `npm test`

## 4. Modo YOLO - Automação Completa

O Modo YOLO concede ao Qwen Code as permissões mais altas, aprovando automaticamente todas as chamadas de ferramentas, incluindo edição de arquivos e comandos de shell.

### Quando usar o Modo YOLO

- **Scripts automatizados**: Execução de tarefas automatizadas predefinidas
- **Pipelines CI/CD**: Execução automatizada em ambientes controlados
- **Projetos pessoais**: Iteração rápida em ambientes totalmente confiáveis
- **Processamento em lote**: Tarefas que exigem cadeias de comandos em várias etapas

> [!warning]
>
> **Use o Modo YOLO com cautela**: A IA pode executar qualquer comando com as permissões do seu terminal. Certifique-se de que:
>
> 1. Você confia no codebase atual
> 2. Você entende todas as ações que a IA executará
> 3. Arquivos importantes estão em backup ou commitados no controle de versão

### Como ativar o Modo YOLO

```
# Ativar temporariamente (apenas na sessão atual)
/approval-mode yolo

# Definir como padrão do projeto
/approval-mode yolo --project

# Definir como padrão global do usuário
/approval-mode yolo --user
```

### Exemplo de Configuração

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "yolo",
"confirmShellCommands": false,
"confirmFileEdits": false
  }
}
```

### Exemplo de Fluxo de Trabalho Automatizado

```bash
# Tarefa de refatoração totalmente automatizada
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Sem intervenção humana, a IA irá:
# 1. Executar comandos de teste (aprovado automaticamente)
# 2. Corrigir casos de teste com falha (editar arquivos automaticamente)
# 3. Executar git commit (aprovado automaticamente)
```

## Alternância de Modos e Configuração

### Alternância via Atalho de Teclado

Durante uma sessão do Qwen Code, use **Shift+Tab** (ou **Tab** no Windows) para percorrer rapidamente os quatro modos:

```
Default Mode → Auto-Edit Mode → YOLO Mode → Plan Mode → Default Mode
```

### Configuração Persistente

```
// Nível do projeto: ./.qwen/settings.json
// Nível do usuário: ~/.qwen/settings.json
{
  "permissions": {
"defaultMode": "auto-edit",  // ou "plan" ou "yolo"
"confirmShellCommands": true,
"confirmFileEdits": true
  }
}
```

### Recomendações de Uso dos Modos

1. **Novo no codebase**: Comece com o **Modo Plan** para exploração segura
2. **Tarefas de desenvolvimento diário**: Use **Auto-Edit** (modo padrão), eficiente e seguro
3. **Scripts automatizados**: Use o **Modo YOLO** em ambientes controlados para automação completa
4. **Refatoração complexa**: Use o **Modo Plan** primeiro para um planejamento detalhado e, em seguida, alterne para o modo adequado para execução