# Modo de Aprovação

O Qwen Code oferece cinco modos de permissão distintos que permitem controlar de forma flexível como a IA interage com seu código e sistema com base na complexidade e no nível de risco da tarefa.

## Comparação dos Modos de Permissão

| Modo                 | Edição de Arquivos          | Comandos Shell              | Ideal para                                                                                             | Nível de Risco |
| -------------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| **Plan**             | ❌ Apenas análise somente leitura | ❌ Não executados             | • Exploração de código <br>• Planejamento de mudanças complexas <br>• Revisão segura de código         | Mais baixo     |
| **Ask Permissions**  | ✅ Aprovação manual necessária | ✅ Aprovação manual necessária | • Bases de código novas/desconhecidas <br>• Sistemas críticos <br>• Colaboração em equipe <br>• Aprendizado e ensino | Baixo          |
| **Auto-Edit**        | ✅ Aprovado automaticamente | ❌ Aprovação manual necessária | • Tarefas de desenvolvimento diárias <br>• Refatoração e melhorias de código <br>• Automação segura    | Médio          |
| **Auto**             | ✅ Avaliado por classificador | ✅ Avaliado por classificador | • Sessões autônomas longas <br>• Quando o Auto-Edit é cauteloso demais, mas o YOLO é arriscado demais  | Médio          |
| **YOLO**             | ✅ Aprovado automaticamente | ✅ Aprovado automaticamente | • Projetos pessoais confiáveis <br>• Scripts automatizados/CI/CD <br>• Tarefas de processamento em lote | Mais alto      |

> [!NOTE]
>
> O modo anteriormente chamado de **Default** foi renomeado para **Ask Permissions** para descrever melhor seu comportamento. O valor de configuração subjacente (`tools.approvalMode: "default"`) e o comando `/approval-mode default` permanecem inalterados para compatibilidade com versões anteriores.

### Guia de Referência Rápida

- **Comece no modo Plan**: Ótimo para entender antes de fazer alterações
- **Trabalhe no modo Ask Permissions**: A escolha equilibrada para a maioria dos trabalhos de desenvolvimento
- **Mude para o Auto-Edit**: Quando você estiver fazendo muitas alterações seguras no código
- **Experimente o modo Auto**: Quando quiser menos interrupções, mas ainda quiser segurança em comandos shell e chamadas de rede — um classificador LLM avalia cada chamada
- **Use o YOLO com moderação**: Apenas para automação confiável em ambientes controlados

> [!tip]
>
> Você pode alternar rapidamente entre os modos durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows). A barra de status do terminal mostra o modo atual, para que você sempre saiba quais permissões o Qwen Code tem.

> A ordem de alternância é: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Use o modo Plan para análise segura de código

O modo Plan instrui o Qwen Code a criar um plano analisando a base de código com operações **somente leitura**, perfeito para explorar bases de código, planejar mudanças complexas ou revisar código com segurança.

### Quando usar o modo Plan

- **Implementação em várias etapas**: Quando seu recurso requer edições em muitos arquivos
- **Exploração de código**: Quando você quer pesquisar a base de código detalhadamente antes de alterar qualquer coisa
- **Desenvolvimento interativo**: Quando você quer iterar sobre a direção com o Qwen Code

### Como usar o modo Plan

**Ative o modo Plan durante uma sessão**

Você pode alternar para o modo Plan durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão.

Se você estiver no modo Normal, **Shift+Tab** (ou **Tab** no Windows) primeiro muda para o modo `auto-edits`, indicado por `⏵⏵ accept edits on` na parte inferior do terminal. Um **Shift+Tab** (ou **Tab** no Windows) subsequente mudará para o modo Plan, indicado por `⏸ plan mode`.

**Use o comando `/plan`**

O comando `/plan` fornece um atalho rápido para entrar e sair do modo Plan:

Solicitações de planejamento regulares não mudam o modo por si só. Se você quiser o fluxo de trabalho do modo Plan somente leitura, use `/plan`, o atalho de teclado ou defina o modo de aprovação explicitamente como `plan`.

```bash
/plan                          # Enter plan mode
/plan refactor the auth module # Enter plan mode and start planning
/plan exit                     # Exit plan mode, restore previous mode
```

Quando você sai do modo Plan com `/plan exit`, seu modo de aprovação anterior é restaurado automaticamente (por exemplo, se você estava no Auto-Edit antes de entrar no modo Plan, retornará ao Auto-Edit).

**Inicie uma nova sessão no modo Plan**

Para iniciar uma nova sessão no modo Plan, use `/approval-mode` e selecione `plan`

```bash
/approval-mode
```

**Execute consultas "headless" no modo Plan**

Você também pode executar uma consulta no modo Plan diretamente com `-p` ou `prompt`:

```bash
qwen --prompt "What is machine learning?"
```

### Exemplo: Planejando uma refatoração complexa

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

O Qwen Code entra no modo Plan e analisa a implementação atual para criar um plano abrangente. Refine com acompanhamentos:

```
What about backward compatibility?
How should we handle database migration?
```

### Configure o modo Plan como padrão

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Use o modo Ask Permissions para interação controlada

O modo Ask Permissions é a maneira padrão de trabalhar com o Qwen Code. Neste modo, você mantém o controle total sobre todas as operações potencialmente arriscadas - o Qwen Code solicitará sua aprovação antes de fazer qualquer alteração em arquivos ou executar comandos shell.

### Quando usar o modo Ask Permissions

- **Novo em uma base de código**: Quando você está explorando um projeto desconhecido e quer ser extra cauteloso
- **Sistemas críticos**: Ao trabalhar com código de produção, infraestrutura ou dados sensíveis
- **Aprendizado e ensino**: Quando você quer entender cada passo que o Qwen Code está dando
- **Colaboração em equipe**: Quando várias pessoas estão trabalhando na mesma base de código
- **Operações complexas**: Quando as mudanças envolvem múltiplos arquivos ou lógica complexa

### Como usar o modo Ask Permissions

**Ative o modo Ask Permissions durante uma sessão**

Você pode alternar para o modo Ask Permissions durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão. Se você estiver em qualquer outro modo, pressionar **Shift+Tab** (ou **Tab** no Windows) eventualmente voltará ao modo Ask Permissions, indicado pela ausência de qualquer indicador de modo na parte inferior do terminal.

**Inicie uma nova sessão no modo Ask Permissions**

O modo Ask Permissions é o modo inicial quando você inicia o Qwen Code. Se você mudou de modo e quer voltar para o modo Ask Permissions, use:

```
/approval-mode default
```

**Execute consultas "headless" no modo Ask Permissions**

Ao executar comandos headless, o modo Ask Permissions é o comportamento padrão. Você pode especificá-lo explicitamente com:

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

O Qwen Code analisará sua base de código e proporá um plano. Ele então solicitará aprovação antes de:

1. Criar novos arquivos (controllers, models, migrations)
2. Modificar arquivos existentes (adicionando novas colunas, atualizando APIs)
3. Executar quaisquer comandos shell (migrações de banco de dados, instalação de dependências)

Você pode revisar cada alteração proposta e aprová-la ou rejeitá-la individualmente.

### Configure o modo Ask Permissions como padrão

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Modo Auto-Edit

O modo Auto-Edit instrui o Qwen Code a aprovar automaticamente as edições de arquivos, enquanto exige aprovação manual para comandos shell, sendo ideal para acelerar fluxos de trabalho de desenvolvimento mantendo a segurança do sistema.

As ferramentas de edição aprovadas automaticamente incluem `edit`, `write_file` e `notebook_edit`.

### Quando usar o modo Auto-Edit

- **Desenvolvimento diário**: Ideal para a maioria das tarefas de codificação
- **Automação segura**: Permite que a IA modifique o código enquanto previne a execução acidental de comandos perigosos
- **Colaboração em equipe**: Use em projetos compartilhados para evitar impactos não intencionais em outros

### Como alternar para este modo

```
# Switch via command
/approval-mode auto-edit

# Or use keyboard shortcut
Shift+Tab (or Tab on Windows) # Switch from other modes
```

### Exemplo de Fluxo de Trabalho

1. Você pede ao Qwen Code para refatorar uma função
2. A IA analisa o código e propõe alterações
3. Aplica **automaticamente** todas as alterações de arquivos sem confirmação
4. Se os testes precisarem ser executados, ele **solicitará aprovação** para executar `npm test`

## 4. Modo Auto - Aprovação Orientada por Classificador

O modo Auto fica entre o Auto-Edit e o YOLO. Um classificador LLM avalia cada comando shell, chamada de rede e edição fora do workspace, aprovando automaticamente aqueles que considera seguros e bloqueando os arriscados. A maioria das operações somente leitura e edições dentro do workspace ignoram o classificador para ganhar velocidade.

Veja [auto-mode.md](./auto-mode.md) para a referência completa (configuração de hints, solução de problemas, FAQ).

### Quando usar o modo Auto

- **Sessões autônomas longas**: Quando o modo Ask Permissions interrompe com muita frequência, mas o YOLO é arriscado demais.
- **Projetos confiáveis**: Bases de código internas onde o agente deve continuar trabalhando, mas você ainda quer uma barreira de segurança para comandos shell destrutivos e chamadas de rede de saída.
- **Execuções headless / agendadas**: Onde o Auto-Edit não é suficiente (o agente precisa executar comandos shell também), mas você quer segurança contra `rm -rf /`, `curl ... | sh`, exfiltração de credenciais, etc.

### Como usar o modo Auto

**Ative o modo Auto durante uma sessão**

Pressione **Shift+Tab** (ou **Tab** no Windows) para alternar para o modo Auto. A barra de status mostra o modo ativo.

**Use o comando `/approval-mode`**

```
/approval-mode auto
```

Na primeira vez que você entrar no modo Auto, uma mensagem informativa explica como ele funciona. O aviso não aparece novamente.

**Inicie uma nova sessão no modo Auto**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### O que o modo Auto aprova automaticamente vs. bloqueia

O classificador tende a bloquear quando há incerteza. Padrões:

- **Aprovados automaticamente**: comandos somente leitura (ls, cat, git status, grep, find), instalação de pacotes no cwd, comandos de build/test, edições de arquivos dentro do workspace, operações apenas locais.
- **Bloqueados**: destruição irreversível (rm -rf /, fdisk, mkfs), execução de código externo (curl | sh, eval de conteúdo remoto), exfiltração de credenciais, persistência não autorizada (edições no .bashrc, crontab), enfraquecimento de segurança, force-push para main/master.

Você pode personalizar o julgamento do classificador via hints em linguagem natural no settings.json. Veja [auto-mode.md](./auto-mode.md#configuring-hints).

### Barreiras de segurança

- **Regras rígidas permanecem em vigor**: as regras `permissions.deny` bloqueiam ações antes que o classificador seja executado.
- **Regras de permissão muito amplas são removidas no modo Auto**: por exemplo, `permissions.allow: ["Bash"]` (permitir todos os comandos shell) anula o classificador; entrar no modo Auto desativa temporariamente essas regras para que o classificador possa fazer seu trabalho. As regras são restauradas quando você sai do modo Auto. As configurações no disco nunca são modificadas.
- **Fail-closed**: quando a API do classificador está inacessível, a ação é bloqueada em vez de permitida. Após duas chamadas consecutivas indisponíveis, a próxima chamada de ferramenta volta para a aprovação manual.
- **Proteção contra loop**: após três bloqueios consecutivos por política, a próxima chamada também volta para a aprovação manual para que o agente não fique preso em um ciclo de uma abordagem sem saída.

### Exemplo

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

O Qwen Code faz as edições de arquivos (edições no workspace ignoram o classificador), executa `npm test` (o classificador considera seguro) e apresenta um bloqueio se tentar algo arriscado como `rm -rf /Users/me/.aws`. Você pode revisar o motivo inline e decidir se deve mudar para o modo Ask Permissions para essa etapa.

### Configure o modo Auto como padrão

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
      // Optional: route ALL shell commands (including read-only ones like
      // ls, cat) through the classifier for defense-in-depth.
      // "classifyAllShell": true,
    },
  },
}
```

## 5. Modo YOLO - Automação Total

O modo YOLO concede ao Qwen Code as permissões mais altas, aprovando automaticamente todas as chamadas de ferramentas, incluindo edição de arquivos e comandos shell.

### Quando usar o modo YOLO

- **Scripts automatizados**: Executando tarefas automatizadas predefinidas
- **Pipelines de CI/CD**: Execução automatizada em ambientes controlados
- **Projetos pessoais**: Iteração rápida em ambientes totalmente confiáveis
- **Processamento em lote**: Tarefas que requerem cadeias de comandos em várias etapas

> [!warning]
>
> **Use o modo YOLO com cautela**: A IA pode executar qualquer comando com as permissões do seu terminal. Certifique-se de que:
>
> 1. Você confia na base de código atual
> 2. Você entende todas as ações que a IA irá realizar
> 3. Arquivos importantes estão salvos em backup ou commitados no controle de versão

### Como habilitar o modo YOLO

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

## Alternância de Modos e Configuração

### Alternância por Atalho de Teclado

Durante uma sessão do Qwen Code, use **Shift+Tab** (ou **Tab** no Windows) para alternar rapidamente entre os cinco modos:

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

1. **Novo na base de código**: Comece com o **modo Plan** para exploração segura
2. **Tarefas de desenvolvimento diárias**: Use o **modo Auto-Edit** (modo padrão), eficiente e seguro
3. **Scripts automatizados**: Use o **modo YOLO** em ambientes controlados para automação total
4. **Refatoração complexa**: Use o **modo Plan** primeiro para um planejamento detalhado, depois mude para o modo apropriado para execução