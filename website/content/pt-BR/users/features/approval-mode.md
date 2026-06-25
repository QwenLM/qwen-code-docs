# Modo de Aprovação

O Qwen Code oferece cinco modos de permissão distintos que permitem controlar de forma flexível como a IA interage com seu código e sistema, com base na complexidade da tarefa e no nível de risco.

## Comparação dos Modos de Permissão

| Modo                     | Edição de Arquivos            | Comandos Shell              | Melhor Para                                                                                          | Nível de Risco |
| ------------------------ | ----------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| **Plan**​                | ❌ Apenas análise somente leitura | ❌ Não executados          | • Exploração de código <br>• Planejamento de alterações complexas <br>• Revisão segura de código      | Mínimo         |
| **Ask Permissions**​     | ✅ Aprovação manual necessária | ✅ Aprovação manual necessária | • Codebases novas/não familiares <br>• Sistemas críticos <br>• Colaboração em equipe <br>• Aprendizado e ensino | Baixo        |
| **Auto-Edit**​           | ✅ Aprovado automaticamente    | ❌ Aprovação manual necessária | • Tarefas diárias de desenvolvimento <br>• Refatoração e melhorias de código <br>• Automação segura | Médio          |
| **Auto**​                | ✅ Avaliado pelo classificador | ✅ Avaliado pelo classificador | • Sessões autônomas longas <br>• Quando Auto-Edit é muito cauteloso e YOLO é muito arriscado          | Médio          |
| **YOLO**​                | ✅ Aprovado automaticamente    | ✅ Aprovado automaticamente  | • Projetos pessoais de confiança <br>• Scripts automatizados/CI/CD <br>• Tarefas de processamento em lote | Máximo      |

> [!NOTE]
>
> O modo anteriormente chamado **Default** foi renomeado para **Ask Permissions** para descrever melhor seu comportamento. O valor de configuração subjacente (`tools.approvalMode: "default"`) e o comando `/approval-mode default` permanecem inalterados para compatibilidade reversa.

### Guia de Referência Rápida

- **Inicie no Modo Plan**: Ótimo para entender antes de fazer alterações
- **Trabalhe no Modo Ask Permissions**: A escolha equilibrada para a maioria do trabalho de desenvolvimento
- **Mude para Auto-Edit**: Quando você está fazendo muitas alterações seguras de código
- **Experimente o Modo Auto**: Quando você quer menos interrupções, mas ainda deseja segurança em comandos shell e chamadas de rede — um classificador LLM avalia cada chamada
- **Use YOLO com moderação**: Apenas para automação confiável em ambientes controlados

> [!tip]
>
> Você pode alternar rapidamente entre os modos durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows). A barra de status do terminal mostra seu modo atual, para que você saiba sempre quais permissões o Qwen Code possui.

> A ordem do ciclo é: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Use o Modo Plan para análise segura de código

O Modo Plan instrui o Qwen Code a criar um plano analisando a base de código com operações **somente leitura**, perfeito para explorar bases de código, planejar mudanças complexas ou revisar código com segurança.

### Quando usar o Modo Plan

- **Implementação de múltiplas etapas**: Quando sua funcionalidade exige edições em muitos arquivos
- **Exploração de código**: Quando você deseja pesquisar a base de código a fundo antes de alterar algo
- **Desenvolvimento interativo**: Quando você deseja iterar sobre a direção com o Qwen Code

### Como usar o Modo Plan

**Ative o Modo Plan durante uma sessão**

Você pode alternar para o Modo Plan durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão.

Se você estiver no Modo Normal, **Shift+Tab** (ou **Tab** no Windows) primeiro alterna para o Modo `auto-edits`, indicado por `⏵⏵ accept edits on` na parte inferior do terminal. Um **Shift+Tab** subsequente (ou **Tab** no Windows) alternará para o Modo Plan, indicado por `⏸ plan mode`.

**Use o comando `/plan`**

O comando `/plan` fornece um atalho rápido para entrar e sair do Modo Plan:

Solicitações regulares de planejamento não alternam modos por si só. Se você deseja o fluxo de trabalho somente leitura do Modo Plan, use `/plan`, o atalho de teclado ou defina o modo de aprovação como `plan` explicitamente.

```bash
/plan                          # Enter plan mode
/plan refactor the auth module # Enter plan mode and start planning
/plan exit                     # Exit plan mode, restore previous mode
```

Ao sair do Modo Plan com `/plan exit`, seu modo de aprovação anterior é automaticamente restaurado (por exemplo, se você estava no Auto-Edit antes de entrar no Modo Plan, retornará ao Auto-Edit).

**Inicie uma nova sessão no Modo Plan**

Para iniciar uma nova sessão no Modo Plan, use o comando `/approval-mode` e selecione `plan`

```bash
/approval-mode
```

**Execute consultas "headless" no Modo Plan**

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
E quanto à compatibilidade reversa?
Como devemos lidar com a migração do banco de dados?
```
### Configurar o Modo Plano como padrão

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Use o Modo de Permissão de Pergunta para Interação Controlada

O Modo de Permissão de Pergunta é a forma padrão de trabalhar com o Qwen Code. Neste modo, você mantém controle total sobre todas as operações potencialmente arriscadas - o Qwen Code solicitará sua aprovação antes de fazer qualquer alteração em arquivos ou executar comandos no shell.

### Quando usar o Modo de Permissão de Pergunta

- **Novo em uma base de código**: Quando estiver explorando um projeto desconhecido e quiser ser extremamente cauteloso
- **Sistemas críticos**: Ao trabalhar em código de produção, infraestrutura ou dados sensíveis
- **Aprendizado e ensino**: Quando quiser entender cada etapa que o Qwen Code está executando
- **Colaboração em equipe**: Quando várias pessoas estão trabalhando na mesma base de código
- **Operações complexas**: Quando as alterações envolvem vários arquivos ou lógica complexa

### Como usar o Modo de Permissão de Pergunta

**Ativar o Modo de Permissão de Pergunta durante uma sessão**

Você pode alternar para o Modo de Permissão de Pergunta durante uma sessão usando **Shift+Tab**​ (ou **Tab** no Windows) para percorrer os modos de permissão. Se você estiver em qualquer outro modo, pressionar **Shift+Tab** (ou **Tab** no Windows) eventualmente retornará ao Modo de Permissão de Pergunta, indicado pela ausência de qualquer indicador de modo na parte inferior do terminal.

**Iniciar uma nova sessão no Modo de Permissão de Pergunta**

O Modo de Permissão de Pergunta é o modo inicial ao iniciar o Qwen Code. Se você alterou os modos e deseja retornar ao Modo de Permissão de Pergunta, use:

```
/approval-mode default
```

**Executar consultas "headless" no Modo de Permissão de Pergunta**

Ao executar comandos headless, o Modo de Permissão de Pergunta é o comportamento padrão. Você pode especificá-lo explicitamente com:

```
qwen --prompt "Analise este código em busca de possíveis bugs"
```

### Exemplo: Implementando um recurso com segurança

```
/approval-mode default
```

```
Preciso adicionar fotos de perfil de usuário à nossa aplicação. As fotos devem ser armazenadas em um bucket S3 e as URLs salvas no banco de dados.
```

O Qwen Code analisará sua base de código e proporá um plano. Em seguida, solicitará aprovação antes de:

1. Criar novos arquivos (controllers, models, migrations)
2. Modificar arquivos existentes (adicionar novas colunas, atualizar APIs)
3. Executar qualquer comando no shell (migrations de banco de dados, instalação de dependências)

Você pode revisar cada alteração proposta e aprová-la ou rejeitá-la individualmente.

### Configurar o Modo de Permissão de Pergunta como padrão

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Modo de Edições Automáticas

O Modo de Edições Automáticas instrui o Qwen Code a aprovar automaticamente edições de arquivos, enquanto exige aprovação manual para comandos no shell, ideal para acelerar fluxos de trabalho de desenvolvimento mantendo a segurança do sistema.

As ferramentas de edição com aprovação automática incluem `edit`, `write_file` e `notebook_edit`.

### Quando usar o Modo de Aceitação Automática de Edições

- **Desenvolvimento diário**: Ideal para a maioria das tarefas de codificação
- **Automação segura**: Permite que a IA modifique código enquanto previne a execução acidental de comandos perigosos
- **Colaboração em equipe**: Use em projetos compartilhados para evitar impactos não intencionais em outros

### Como alternar para este modo

```
# Alternar via comando
/approval-mode auto-edit

# Ou usar atalho de teclado
Shift+Tab (ou Tab no Windows) # Alternar a partir de outros modos
```

### Exemplo de Fluxo de Trabalho

1. Você pede ao Qwen Code para refatorar uma função
2. A IA analisa o código e propõe alterações
3. **Automaticamente**​ aplica todas as alterações em arquivos sem confirmação
4. Se testes precisarem ser executados, será **solicitada aprovação**​ para executar `npm test`

## 4. Modo Automático - Aprovação Orientada por Classificador

O Modo Automático fica entre o Auto-Edit e o YOLO. Um classificador LLM avalia cada
comando no shell, chamada de rede e edição fora do espaço de trabalho e aprova automaticamente
aqueles que julga seguros, enquanto bloqueia os arriscados. A maioria das operações
somente leitura e edições dentro do espaço de trabalho ignoram o classificador para agilidade.

Consulte [auto-mode.md](./auto-mode.md) para a referência completa (configuração
de dicas, solução de problemas, FAQ).

### Quando usar o Modo Automático

- **Sessões autônomas longas**: Quando o Modo de Permissão de Pergunta interrompe com muita frequência, mas
  o YOLO é arriscado demais.
- **Projetos confiáveis**: Bases de código internas onde o agente deve continuar
  avançando, mas você ainda quer uma salvaguarda para comandos no shell destrutivos e
  chamadas de rede de saída.
- **Execuções headless / agendadas**: Onde o Auto-Edit não é suficiente (o agente
  também precisa executar comandos no shell), mas você quer segurança contra `rm -rf /`,
  `curl ... | sh`, exfiltração de credenciais, etc.

### Como usar o Modo Automático

**Ativar o Modo Automático durante uma sessão**

Pressione **Shift+Tab** (ou **Tab** no Windows) para percorrer até o Modo Automático. A
barra de status mostra o modo ativo.

**Usar o comando `/approval-mode`**

```
/approval-mode auto
```

Na primeira vez que você entrar no Modo Automático, uma mensagem informativa explica como ele
funciona. O aviso não aparece novamente.

**Iniciar uma nova sessão no Modo Automático**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### O que o Modo Automático aprova automaticamente vs bloqueia

O classificador tende a bloquear quando está incerto. Padrões:
- **Aprovado automaticamente**: comandos somente leitura (ls, cat, git status, grep, find),
  instalação de pacotes no diretório de trabalho, comandos de build/teste, edições de arquivos dentro do
  workspace, operações apenas locais.
- **Bloqueado**: destruição irreversível (rm -rf /, fdisk, mkfs),
  execução de código externo (curl | sh, eval de conteúdo remoto),
  exfiltração de credenciais, persistência não autorizada (edições no .bashrc,
  crontab), enfraquecimento de segurança, force-push para main/master.

Você pode personalizar o julgamento do classificador por meio de dicas em linguagem natural no
settings.json. Veja [auto-mode.md](./auto-mode.md#configuring-hints).

### Safety guardrails

- **Regras rígidas permanecem em vigor**: regras `permissions.deny` bloqueiam ações
  antes que o classificador seja executado.
- **Regras de permissão excessivamente amplas são removidas no Modo Automático**: por exemplo,
  `permissions.allow: ["Bash"]` (permitir todos os comandos de shell) derrota o
  classificador; entrar no Modo Automático desabilita temporariamente essas regras para que o
  classificador possa fazer seu trabalho. As regras são restauradas quando você sai do Modo
  Automático. As configurações no disco nunca são modificadas.
- **Falha fechada**: quando a API do classificador está inacessível, a ação é
  bloqueada em vez de permitida. Após duas chamadas consecutivas indisponíveis,
  a próxima chamada de ferramenta retorna à aprovação manual.
- **Proteção contra loop**: após três bloqueios consecutivos de política, a próxima chamada
  também retorna à aprovação manual para que o agente não fique preso em um ciclo
  em uma abordagem sem saída.

### Example

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

O Qwen Code faz as edições de arquivo (edições no workspace ignoram o classificador),
executa `npm test` (classificador julga seguro) e exibe um bloqueio se ele
tentar algo arriscado como `rm -rf /Users/me/.aws`. Você pode revisar o
motivo inline e decidir se deve mudar para o Modo Perguntar Permissões para essa etapa.

### Configure o Modo Automático como padrão

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": ["Running pytest, mypy, and ruff on this Python repo"],
        "deny": ["Any network call to intranet.example.com"],
      },
      "environment": ["Open-source monorepo; commits are signed"],
    },
  },
}
```

## 5. Modo YOLO - Automação Total

O Modo YOLO concede ao Qwen Code as maiores permissões, aprovando automaticamente todas as chamadas de ferramentas, incluindo edição de arquivos e comandos de shell.

### Quando usar o Modo YOLO

- **Scripts automatizados**: Execução de tarefas automatizadas predefinidas
- **Pipelines CI/CD**: Execução automatizada em ambientes controlados
- **Projetos pessoais**: Iteração rápida em ambientes totalmente confiáveis
- **Processamento em lote**: Tarefas que exigem cadeias de comandos de várias etapas

> [!warning]
>
> **Use o Modo YOLO com cautela**: a IA pode executar qualquer comando com suas permissões de terminal. Garanta:
>
> 1. Que você confia no repositório atual
> 2. Que você entende todas as ações que a IA realizará
> 3. Que arquivos importantes estão com backup ou commitados no controle de versão

### Como habilitar o Modo YOLO

```
# Temporarily enable (current session only)
/approval-mode yolo

# Set as project default
/approval-mode yolo --project

# Set as user global default
/approval-mode yolo --user
```

### Exemplo de Configuração

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "yolo"
  }
}
```

### Exemplo de Fluxo de Trabalho Automatizado

```bash
# Fully automated refactoring task
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Without human intervention, AI will:
# 1. Run test commands (auto-approved)
# 2. Fix failed test cases (auto-edit files)
# 3. Execute git commit (auto-approved)
```

Sem intervenção humana, a IA irá:
1. Executar comandos de teste (aprovado automaticamente)
2. Corrigir casos de teste com falha (edição automática de arquivos)
3. Executar git commit (aprovado automaticamente)

## Troca de Modo e Configuração

### Troca por Atalho de Teclado

Durante uma sessão do Qwen Code, use **Shift+Tab**​ (ou **Tab** no Windows) para alternar rapidamente entre os cinco modos:

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### Configuração Persistente

```
// Project-level: ./.qwen/settings.json
// User-level: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // or "plan", "default", "auto", "yolo"
  }
}
```

### Recomendações de Uso dos Modos

1. **Novo no repositório**: Comece com **Plan Mode** para exploração segura
2. **Tarefas diárias de desenvolvimento**: Use **Auto-Accept Edits** (modo padrão), eficiente e seguro
3. **Scripts automatizados**: Use **YOLO Mode** em ambientes controlados para automação total
4. **Refatoração complexa**: Use **Plan Mode** primeiro para planejamento detalhado, depois mude para o modo apropriado para execução
