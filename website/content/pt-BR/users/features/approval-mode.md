# Modo de Aprovação

O Qwen Code oferece cinco modos de permissão distintos que permitem controlar flexivelmente como a IA interage com seu código e sistema, com base na complexidade da tarefa e no nível de risco.

## Comparação dos Modos de Permissão

| Modo                 | Edição de Arquivos            | Comandos Shell               | Melhor Para                                                                                            | Nível de Risco |
| -------------------- | ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| **Plan**​            | ❌ Apenas análise somente leitura | ❌ Não executados             | • Exploração de código <br>• Planejamento de mudanças complexas <br>• Revisão de código segura          | Mais Baixo     |
| **Ask Permissions**​ | ✅ Aprovação manual necessária | ✅ Aprovação manual necessária | • Codebases novos/não familiares <br>• Sistemas críticos <br>• Colaboração em equipe <br>• Aprendizado e ensino | Baixo          |
| **Auto-Edit**​       | ✅ Aprovado automaticamente    | ❌ Aprovação manual necessária | • Tarefas diárias de desenvolvimento <br>• Refatoração e melhorias de código <br>• Automação segura      | Médio          |
| **Auto**​            | ✅ Avaliado por classificador  | ✅ Avaliado por classificador  | • Sessões autônomas longas <br>• Quando Auto-Edit é muito cauteloso, mas YOLO é muito arriscado           | Médio          |
| **YOLO**​            | ✅ Aprovado automaticamente    | ✅ Aprovado automaticamente    | • Projetos pessoais confiáveis <br>• Scripts automatizados/CI/CD <br>• Tarefas de processamento em lote   | Mais Alto      |

> [!NOTE]
>
> O modo anteriormente chamado **Default** foi renomeado para **Ask Permissions** para descrever melhor seu comportamento. O valor de configuração subjacente (`tools.approvalMode: "default"`) e o comando `/approval-mode default` permanecem inalterados para compatibilidade com versões anteriores.

### Guia de Referência Rápida

- **Comece no Modo Plan**: Ótimo para entender antes de fazer alterações
- **Trabalhe no Modo Ask Permissions**: A escolha equilibrada para a maioria do trabalho de desenvolvimento
- **Mude para Auto-Edit**: Quando você estiver fazendo muitas alterações seguras de código
- **Experimente o Modo Auto**: Quando você quiser menos interrupções, mas ainda desejar segurança em comandos shell e chamadas de rede — um classificador LLM avalia cada chamada
- **Use YOLO com moderação**: Apenas para automação confiável em ambientes controlados

> [!tip]
>
> Você pode alternar rapidamente entre os modos durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows). A barra de status do terminal mostra seu modo atual, para que você sempre saiba quais permissões o Qwen Code possui.

> A ordem de ciclo é: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Use o Modo Plan para análise segura de código

O Modo Plan instrui o Qwen Code a criar um plano analisando o codebase com operações **somente leitura**, perfeito para explorar codebases, planejar mudanças complexas ou revisar código com segurança.

### Quando usar o Modo Plan

- **Implementação com múltiplas etapas**: Quando sua funcionalidade requer edições em muitos arquivos
- **Exploração de código**: Quando você quiser pesquisar o codebase minuciosamente antes de alterar qualquer coisa
- **Desenvolvimento interativo**: Quando você quiser iterar na direção com o Qwen Code

### Como usar o Modo Plan

**Ative o Modo Plan durante uma sessão**

Você pode alternar para o Modo Plan durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão.

Se você estiver no Modo Normal, o **Shift+Tab** (ou **Tab** no Windows) primeiro alterna para o Modo `auto-edits`, indicado por `⏵⏵ accept edits on` na parte inferior do terminal. Um **Shift+Tab** subsequente (ou **Tab** no Windows) alternará para o Modo Plan, indicado por `⏸ plan mode`.

**Use o comando `/plan`**

O comando `/plan` fornece um atalho rápido para entrar e sair do Modo Plan:

Solicitações de planejamento regulares não alternam modos por si só. Se você quiser o fluxo de trabalho do Modo Plan somente leitura, use `/plan`, o atalho de teclado ou defina o modo de aprovação como `plan` explicitamente.

```bash
/plan                          # Entra no modo plan
/plan refactor the auth module # Entra no modo plan e inicia o planejamento
/plan exit                     # Sai do modo plan, restaura o modo anterior
```

Ao sair do Modo Plan com `/plan exit`, seu modo de aprovação anterior é restaurado automaticamente (por exemplo, se você estava no Auto-Edit antes de entrar no Modo Plan, retornará ao Auto-Edit).

**Inicie uma nova sessão no Modo Plan**

Para iniciar uma nova sessão no Modo Plan, use `/approval-mode` e selecione `plan`

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

O Qwen Code entra no Modo Plan e analisa a implementação atual para criar um plano abrangente. Refine com acompanhamentos:

```
What about backward compatibility?
How should we handle database migration?
```

### Configure o Modo Plan como padrão

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Use o Modo Ask Permissions para Interação Controlada

O Modo Ask Permissions é a maneira padrão de trabalhar com o Qwen Code. Neste modo, você mantém o controle total sobre todas as operações potencialmente arriscadas — o Qwen Code solicitará sua aprovação antes de fazer qualquer alteração em arquivos ou executar comandos shell.

### Quando usar o Modo Ask Permissions

- **Novo em um codebase**: Quando você está explorando um projeto não familiar e quer ser extremamente cauteloso
- **Sistemas críticos**: Ao trabalhar em código de produção, infraestrutura ou dados sensíveis
- **Aprendizado e ensino**: Quando você quer entender cada etapa que o Qwen Code está executando
- **Colaboração em equipe**: Quando várias pessoas estão trabalhando no mesmo codebase
- **Operações complexas**: Quando as alterações envolvem vários arquivos ou lógica complexa

### Como usar o Modo Ask Permissions

**Ative o Modo Ask Permissions durante uma sessão**

Você pode alternar para o Modo Ask Permissions durante uma sessão usando **Shift+Tab**​ (ou **Tab** no Windows) para percorrer os modos de permissão. Se você estiver em qualquer outro modo, pressionar **Shift+Tab** (ou **Tab** no Windows) eventualmente retornará ao Modo Ask Permissions, indicado pela ausência de qualquer indicador de modo na parte inferior do terminal.

**Inicie uma nova sessão no Modo Ask Permissions**

O Modo Ask Permissions é o modo inicial quando você inicia o Qwen Code. Se você mudou de modo e deseja retornar ao Modo Ask Permissions, use:

```
/approval-mode default
```

**Execute consultas "headless" no Modo Ask Permissions**

Ao executar comandos headless, o Modo Ask Permissions é o comportamento padrão. Você pode especificá-lo explicitamente com:

```
qwen --prompt "Analyze this code for potential bugs"
```

### Exemplo: Implementando uma funcionalidade com segurança

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

O Qwen Code analisará seu codebase e proporá um plano. Em seguida, ele solicitará aprovação antes de:

1. Criar novos arquivos (controllers, models, migrations)
2. Modificar arquivos existentes (adicionar novas colunas, atualizar APIs)
3. Executar qualquer comando shell (migrations de banco de dados, instalação de dependências)

Você pode revisar cada alteração proposta e aprová-la ou rejeitá-la individualmente.

### Configure o Modo Ask Permissions como padrão

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Modo Auto Edits

O Modo Auto-Edit instrui o Qwen Code a aprovar automaticamente edições de arquivos, enquanto requer aprovação manual para comandos shell, ideal para acelerar fluxos de trabalho de desenvolvimento, mantendo a segurança do sistema.

Ferramentas de edição aprovadas automaticamente incluem `edit`, `write_file` e `notebook_edit`.

### Quando usar o Modo Auto-Accept Edits

- **Desenvolvimento diário**: Ideal para a maioria das tarefas de codificação
- **Automação segura**: Permite que a IA modifique código, evitando a execução acidental de comandos perigosos
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
3. **Automaticamente**​ aplica todas as alterações de arquivo sem confirmação
4. Se precisar executar testes, **solicitará aprovação** para executar `npm test`

## 4. Modo Auto - Aprovação Orientada por Classificador

O Modo Auto fica entre o Auto-Edit e o YOLO. Um classificador LLM avalia cada
comando shell, chamada de rede e edição fora do workspace, e aprova automaticamente
os que julga seguros, bloqueando os arriscados. A maioria das operações somente leitura
e edições dentro do workspace ignoram o classificador para ganhar velocidade.

Consulte [auto-mode.md](./auto-mode.md) para a referência completa (configuração de
dicas, solução de problemas, FAQ).

### Quando usar o Modo Auto

- **Sessões autônomas longas**: Quando o Modo Ask Permissions interrompe com muita frequência, mas
  o YOLO é muito arriscado.
- **Projetos confiáveis**: Codebases internos onde o agente deve continuar
  se movendo, mas você ainda quer uma barreira de segurança em comandos shell destrutivos e
  chamadas de rede de saída.
- **Execuções headless / agendadas**: Onde o Auto-Edit não é suficiente (o agente
  também precisa executar comandos shell), mas você quer segurança em `rm -rf /`,
  `curl ... | sh`, exfiltração de credenciais, etc.

### Como usar o Modo Auto

**Ative o Modo Auto durante uma sessão**

Pressione **Shift+Tab** (ou **Tab** no Windows) para percorrer até o Modo Auto. A
barra de status mostra o modo ativo.

**Use o comando `/approval-mode`**

```
/approval-mode auto
```

Na primeira vez que você entrar no Modo Auto, uma mensagem informativa explica como ele
funciona. O aviso não aparece novamente.

**Inicie uma nova sessão no Modo Auto**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### O que o Modo Auto aprova automaticamente vs bloqueia

O classificador tende a bloquear quando está incerto. Padrões:

- **Aprovado automaticamente**: comandos somente leitura (ls, cat, git status, grep, find),
  instalação de pacotes no diretório atual, comandos de build/teste, edições de arquivos dentro do
  workspace, operações apenas locais.
- **Bloqueado**: destruição irreversível (rm -rf /, fdisk, mkfs),
  execução de código externo (curl | sh, eval de conteúdo remoto),
  exfiltração de credenciais, persistência não autorizada (edições no .bashrc,
  crontab), enfraquecimento de segurança, force-push para main/master.

Você pode personalizar o julgamento do classificador por meio de dicas em linguagem natural
no settings.json. Consulte [auto-mode.md](./auto-mode.md#configuring-hints).

### Salvaguardas de segurança

- **Regras rígidas permanecem em vigor**: as regras `permissions.deny` bloqueiam ações
  antes mesmo da execução do classificador.
- **Regras de permissão muito amplas são removidas enquanto estiver no Modo Auto**:
  por exemplo, `permissions.allow: ["Bash"]` (permitir todos os comandos shell) anula o
  classificador; entrar no Modo Auto desativa temporariamente tais regras para que o
  classificador possa fazer seu trabalho. As regras são restauradas ao sair do Modo
  Auto. Configurações no disco nunca são modificadas.
- **Bloqueio por falha**: quando a API do classificador está inacessível, a ação é
  bloqueada em vez de permitida. Após duas chamadas indisponíveis consecutivas,
  a próxima chamada de ferramenta recai para aprovação manual.
- **Proteção contra loop**: após três bloqueios consecutivos de política, a próxima chamada
  também recai para aprovação manual para que o agente não fique preso em ciclo
  em uma abordagem sem saída.

### Exemplo

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

O Qwen Code faz as edições de arquivo (edições dentro do workspace ignoram o classificador),
executa `npm test` (classificador julga seguro) e exibe um bloqueio se ele tentar
algo arriscado como `rm -rf /Users/me/.aws`. Você pode revisar o motivo
inline e decidir se alterna para o Modo Ask Permissions para essa etapa.

### Configure o Modo Auto como padrão

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

O Modo YOLO concede ao Qwen Code as permissões mais altas, aprovando automaticamente todas as chamadas de ferramentas, incluindo edição de arquivos e comandos shell.

### Quando usar o Modo YOLO

- **Scripts automatizados**: Execução de tarefas automatizadas predefinidas
- **Pipelines de CI/CD**: Execução automatizada em ambientes controlados
- **Projetos pessoais**: Iteração rápida em ambientes totalmente confiáveis
- **Processamento em lote**: Tarefas que exigem cadeias de comandos de várias etapas

> [!warning]
>
> **Use o Modo YOLO com cautela**: A IA pode executar qualquer comando com suas permissões de terminal. Certifique-se de que:
>
> 1. Você confia no codebase atual
> 2. Você entende todas as ações que a IA executará
> 3. Arquivos importantes estão com backup ou commitados no controle de versão

### Como habilitar o Modo YOLO

```
# Habilitar temporariamente (apenas na sessão atual)
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
  "tools": {
    "approvalMode": "yolo"
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

## Alternância de Modo e Configuração

### Atalho de Teclado para Alternância

Durante uma sessão do Qwen Code, use **Shift+Tab**​ (ou **Tab** no Windows) para percorrer rapidamente os cinco modos:

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### Configuração Persistente

```
// Nível do projeto: ./.qwen/settings.json
// Nível do usuário: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // ou "plan", "default", "auto", "yolo"
  }
}
```

### Recomendações de Uso do Modo

1. **Novo no codebase**: Comece com o **Modo Plan** para exploração segura
2. **Tarefas diárias de desenvolvimento**: Use **Auto-Accept Edits** (modo padrão), eficiente e seguro
3. **Scripts automatizados**: Use o **Modo YOLO** em ambientes controlados para automação total
4. **Refatoração complexa**: Use o **Modo Plan** primeiro para planejamento detalhado, depois alterne para o modo apropriado para execução