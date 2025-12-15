O Qwen Code oferece três modos de permissão distintos que permitem controlar de forma flexível como a IA interage com seu código e sistema com base na complexidade da tarefa e no nível de risco.

## Comparação de Modos de Permissão

| Modo           | Edição de Arquivos          | Comandos Shell              | Indicado para                                                                                          | Nível de Risco |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| **Plan**​      | ❌ Apenas análise somente leitura | ❌ Não executado            | • Exploração de código <br>• Planejamento de mudanças complexas <br>• Revisão segura de código         | Mais baixo     |
| **Default**​   | ✅ Requer aprovação manual    | ✅ Requer aprovação manual    | • Bases de código novas/desconhecidas <br>• Sistemas críticos <br>• Colaboração em equipe <br>• Aprendizado e ensino | Baixo          |
| **Auto-Edit**​ | ✅ Aprovado automaticamente   | ❌ Requer aprovação manual    | • Tarefas diárias de desenvolvimento <br>• Refatoração e melhorias de código <br>• Automação segura     | Médio          |
| **YOLO**​      | ✅ Aprovado automaticamente   | ✅ Aprovado automaticamente   | • Projetos pessoais confiáveis <br>• Scripts automatizados/CI/CD <br>• Tarefas de processamento em lote | Mais alto      |

### Guia de Referência Rápida

- **Iniciar no Modo Plano**: Ótimo para entender antes de fazer alterações
- **Trabalhar no Modo Padrão**: A escolha equilibrada para a maioria das tarefas de desenvolvimento
- **Alternar para Auto-Edição**: Quando você está fazendo muitas alterações seguras no código
- **Usar YOLO com moderação**: Apenas para automação confiável em ambientes controlados

> [!tip]
>
> Você pode alternar rapidamente entre os modos durante uma sessão usando **Shift+Tab**. A barra de status do terminal mostra seu modo atual, então você sempre sabe quais permissões o Qwen Code tem.

## 1. Usar o Modo Plano para análise segura de código

O Modo Plano instrui o Qwen Code a criar um plano analisando a base de código com operações **somente leitura**, perfeito para explorar bases de código, planejar alterações complexas ou revisar código com segurança.

### Quando usar o Modo Plano

- **Implementação em várias etapas**: Quando seu recurso requer fazer edições em muitos arquivos
- **Exploração de código**: Quando você deseja pesquisar a base de código completamente antes de alterar qualquer coisa
- **Desenvolvimento interativo**: Quando você deseja iterar na direção com o Qwen Code

### Como usar o Modo Plano

**Ativar o Modo Plano durante uma sessão**

Você pode alternar para o Modo Plano durante uma sessão usando **Shift+Tab** para percorrer os modos de permissão.

Se você estiver no Modo Normal, **Shift+Tab** primeiro alterna para o modo `auto-edits`, indicado por `⏵⏵ accept edits on` na parte inferior do terminal. Um **Shift+Tab** subsequente mudará para o Modo Plano, indicado por `⏸ plan mode`.

**Iniciar uma nova sessão no Modo Plano**

Para iniciar uma nova sessão no Modo Plano, use o `/approval-mode` e selecione `plan`

```bash
/approval-mode
```

**Executar consultas "headless" no Modo Plano**

Você também pode executar uma consulta diretamente no Modo Plano com `-p` ou `prompt`:

```bash
qwen --prompt "O que é aprendizado de máquina?"
```

### Exemplo: Planejando uma refatoração complexa

```bash
/approval-mode plan
```

```
Preciso refatorar nosso sistema de autenticação para usar OAuth2. Crie um plano de migração detalhado.
```

O Qwen Code analisa a implementação atual e cria um plano abrangente. Refine com acompanhamentos:

```
E a compatibilidade retroativa?
Como devemos lidar com a migração do banco de dados?
```

### Configurar o Modo Plano como padrão

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Usar o Modo Padrão para Interação Controlada

O Modo Padrão é a forma padrão de trabalhar com o Qwen Code. Neste modo, você mantém controle total sobre todas as operações potencialmente arriscadas - o Qwen Code pedirá sua aprovação antes de fazer qualquer alteração em arquivos ou executar comandos shell.

### Quando usar o Modo Padrão

- **Novo em uma base de código**: Quando você está explorando um projeto desconhecido e quer ser extremamente cauteloso
- **Sistemas críticos**: Quando estiver trabalhando em código de produção, infraestrutura ou dados sensíveis
- **Aprendizado e ensino**: Quando quiser entender cada passo que o Qwen Code está executando
- **Colaboração em equipe**: Quando várias pessoas estão trabalhando na mesma base de código
- **Operações complexas**: Quando as alterações envolverem vários arquivos ou lógica complexa

### Como usar o Modo Padrão

**Ativar o Modo Padrão durante uma sessão**

Você pode alternar para o Modo Padrão durante uma sessão usando **Shift+Tab** para percorrer os modos de permissão. Se você estiver em qualquer outro modo, pressionar **Shift+Tab** eventualmente voltará ao Modo Padrão, indicado pela ausência de qualquer indicador de modo na parte inferior do terminal.

**Iniciar uma nova sessão no Modo Padrão**

O Modo Padrão é o modo inicial quando você inicia o Qwen Code. Se você tiver alterado os modos e quiser retornar ao Modo Padrão, use:

```
/approval-mode default
```

**Executar consultas "headless" no Modo Padrão**

Ao executar comandos headless, o Modo Padrão é o comportamento padrão. Você pode especificá-lo explicitamente com:

```
qwen --prompt "Analyze this code for potential bugs"
```

### Exemplo: Implementando um recurso com segurança

```
/approval-mode default
```

```
Preciso adicionar fotos de perfil de usuários ao nosso aplicativo. As fotos devem ser armazenadas em um bucket S3 e as URLs salvas no banco de dados.
```

O Qwen Code analisará sua base de código e proporá um plano. Em seguida, solicitará aprovação antes de:

1. Criar novos arquivos (controladores, modelos, migrações)
2. Modificar arquivos existentes (adicionando novas colunas, atualizando APIs)
3. Executar quaisquer comandos shell (migrações de banco de dados, instalação de dependências)

Você pode revisar cada alteração proposta e aprová-la ou rejeitá-la individualmente.

### Configurar o modo padrão como default

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Modo de Edição Automática

O Modo de Edição Automática instrui o Qwen Code a aprovar automaticamente as edições de arquivos, exigindo aprovação manual apenas para comandos shell, ideal para acelerar fluxos de trabalho de desenvolvimento mantendo a segurança do sistema.

### Quando usar o Modo de Aceitação Automática de Edições

- **Desenvolvimento diário**: Ideal para a maioria das tarefas de codificação
- **Automação segura**: Permite que a IA modifique o código enquanto evita a execução acidental de comandos perigosos
- **Colaboração em equipe**: Use em projetos compartilhados para evitar impactos não intencionais nos outros

### Como alternar para este modo

```

# Alternar via comando
/approval-mode auto-edit

# Ou use o atalho do teclado
Shift+Tab  # Alternar de outros modos
```

### Exemplo de Fluxo de Trabalho

1. Você pede ao Qwen Code para refatorar uma função
2. A IA analisa o código e propõe alterações
3. **Aplica automaticamente**​ todas as alterações de arquivo sem confirmação
4. Se for necessário executar testes, ele **solicitará aprovação**​ para executar `npm test`

## 4. Modo YOLO - Automação Completa

O Modo YOLO concede ao Qwen Code as mais altas permissões, aprovando automaticamente todas as chamadas de ferramentas, incluindo edição de arquivos e comandos shell.

### Quando usar o Modo YOLO

- **Scripts automatizados**: Execução de tarefas automáticas predefinidas
- **Pipelines CI/CD**: Execução automática em ambientes controlados
- **Projetos pessoais**: Iteração rápida em ambientes totalmente confiáveis
- **Processamento em lote**: Tarefas que requerem cadeias de comandos com várias etapas

> [!warning]
>
> **Use o Modo YOLO com cautela**: A IA pode executar qualquer comando com as permissões do seu terminal. Certifique-se de:
>
> 1. Confiar na base de código atual
> 2. Entender todas as ações que a IA irá realizar
> 3. Ter backups dos arquivos importantes ou tê-los commitados no controle de versão

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
qwen --prompt "Execute a suíte de testes, corrija todos os testes com falha e então faça o commit das alterações"

# Sem intervenção humana, a IA irá:

# 1. Executar comandos de teste (aprovado automaticamente)

# 2. Corrigir casos de teste com falha (editar arquivos automaticamente)

# 3. Executar git commit (aprovado automaticamente)
```

## Alternância de Modo e Configuração

### Alternância por Atalho de Teclado

Durante uma sessão do Qwen Code, use **Shift+Tab** para alternar rapidamente entre os três modos:

```
Modo Padrão → Modo de Edição Automática → Modo YOLO → Modo de Planejamento → Modo Padrão
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

1. **Novo no código-fonte**: Comece com o **Modo Planejamento** para explorar com segurança
2. **Tarefas diárias de desenvolvimento**: Use **Aceitar Edições Automaticamente** (modo padrão), eficiente e seguro
3. **Scripts automatizados**: Use o **Modo YOLO** em ambientes controlados para automação completa
4. **Refatoração complexa**: Use o **Modo Planejamento** primeiro para planejamento detalhado, depois mude para o modo apropriado para execução