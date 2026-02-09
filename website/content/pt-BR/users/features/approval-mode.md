# Modo de Aprovação

O Qwen Code oferece três modos de permissão distintos que permitem controlar com flexibilidade como a IA interage com seu código e sistema, com base na complexidade da tarefa e no nível de risco.

## Comparação de Modos de Permissão

| Modo           | Edição de Arquivos          | Comandos Shell              | Melhor Para                                                                                            | Nível de Risco |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| **Plan**       | ❌ Somente análise somente leitura | ❌ Não executado             | • Exploração de código <br>• Planejamento de mudanças complexas <br>• Revisão de código segura         | Mais baixo    |
| **Default**    | ✅ Aprovação manual necessária | ✅ Aprovação manual necessária | • Bases de código novas/desconhecidas <br>• Sistemas críticos <br>• Colaboração em equipe <br>• Aprendizado e ensino | Baixo         |
| **Auto-Edit**  | ✅ Aprovado automaticamente | ❌ Aprovação manual necessária | • Tarefas diárias de desenvolvimento <br>• Refatoração e melhorias de código <br>• Automação segura     | Médio          |
| **YOLO**       | ✅ Aprovado automaticamente | ✅ Aprovado automaticamente | • Projetos pessoais confiáveis <br>• Scripts automatizados/CI/CD <br>• Tarefas de processamento em lote | Mais alto     |

### Guia de Referência Rápida

- **Comece no Modo Planejamento**: Ótimo para entender antes de fazer alterações
- **Trabalhe no Modo Padrão**: A escolha equilibrada para a maioria do trabalho de desenvolvimento
- **Mude para Auto-Edição**: Quando você estiver fazendo muitas alterações de código seguras
- **Use YOLO com moderação**: Apenas para automação confiável em ambientes controlados

> [!tip]
>
> Você pode alternar rapidamente entre os modos durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows). A barra de status do terminal mostra seu modo atual, então você sempre saberá quais permissões o Qwen Code tem.

## 1. Use o Modo Planejamento para análise de código segura

O Modo Planejamento instrui o Qwen Code a criar um plano analisando a base de código com operações **somente leitura**, perfeito para explorar bases de código, planejar alterações complexas ou revisar código com segurança.

### Quando usar o Modo de Plano

- **Implementação multi-etapas**: Quando seu recurso exigir edições em muitos arquivos
- **Exploração de código**: Quando você quiser pesquisar profundamente a base de código antes de fazer qualquer alteração
- **Desenvolvimento interativo**: Quando você quiser iterar na direção com o Qwen Code

### Como usar o Modo Plano

**Ativar o Modo Plano durante uma sessão**

Você pode alternar para o Modo Plano durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão.

Se você estiver no Modo Normal, **Shift+Tab** (ou **Tab** no Windows) primeiro alterna para o modo `auto-edits`, indicado por `⏵⏵ aceitar edições ativado` na parte inferior do terminal. Um subsequente **Shift+Tab** (ou **Tab** no Windows) alternará para o Modo Plano, indicado por `⏸ modo plano`.

**Iniciar uma nova sessão no Modo Plano**

Para iniciar uma nova sessão no Modo Plano, use `/approval-mode` e então selecione `plan`

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
Preciso refatorar nosso sistema de autenticação para usar OAuth2. Crie um plano detalhado de migração.
```

O Qwen Code analisa a implementação atual e cria um plano abrangente. Refine com perguntas adicionais:

```
E quanto à compatibilidade com versões anteriores?
Como devemos lidar com a migração do banco de dados?
```

### Configurar o modo de planejamento como padrão

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Usar o modo padrão para interação controlada

O modo padrão é a maneira usual de trabalhar com o Qwen Code. Nesse modo, você mantém controle total sobre todas as operações potencialmente arriscadas - o Qwen Code solicitará sua aprovação antes de fazer qualquer alteração nos arquivos ou executar comandos de shell.

### Quando usar o Modo Padrão

- **Novo em uma base de código**: Quando você está explorando um projeto desconhecido e deseja ser extra cuidadoso
- **Sistemas críticos**: Quando estiver trabalhando em código de produção, infraestrutura ou dados sensíveis
- **Aprendizado e ensino**: Quando quiser entender cada etapa que o Qwen Code está executando
- **Colaboração em equipe**: Quando várias pessoas estão trabalhando na mesma base de código
- **Operações complexas**: Quando as alterações envolvem múltiplos arquivos ou lógica complexa

### Como usar o Modo Padrão

**Ativar o Modo Padrão durante uma sessão**

Você pode alternar para o Modo Padrão durante uma sessão usando **Shift+Tab** (ou **Tab** no Windows) para percorrer os modos de permissão. Se você estiver em qualquer outro modo, pressionar **Shift+Tab** (ou **Tab** no Windows) eventualmente retornará ao Modo Padrão, indicado pela ausência de qualquer indicador de modo na parte inferior do terminal.

**Iniciar uma nova sessão no Modo Padrão**

O Modo Padrão é o modo inicial quando você inicia o Qwen Code. Se você tiver alterado os modos e quiser retornar ao Modo Padrão, utilize:

```
/approval-mode default
```

**Executar consultas "headless" no Modo Padrão**

Ao executar comandos headless, o Modo Padrão é o comportamento padrão. Você pode especificá-lo explicitamente com:

```
qwen --prompt "Analise este código quanto a possíveis bugs"
```

### Exemplo: Implementando uma funcionalidade com segurança

```
/approval-mode default
```

```
Preciso adicionar imagens de perfil de usuário ao nosso aplicativo. As imagens devem ser armazenadas em um bucket S3 e as URLs salvas no banco de dados.
```

O Qwen Code analisará sua base de código e proporá um plano. Em seguida, pedirá aprovação antes de:

1. Criar novos arquivos (controladores, modelos, migrações)
2. Modificar arquivos existentes (adicionando novas colunas, atualizando APIs)
3. Executar quaisquer comandos shell (migrações de banco de dados, instalação de dependências)

Você pode revisar cada alteração proposta e aprovar ou rejeitar individualmente.

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

O modo de Edição Automática instrui o Qwen Code a aprovar automaticamente edições de arquivos, exigindo aprovação manual apenas para comandos shell, ideal para acelerar fluxos de desenvolvimento mantendo a segurança do sistema.

### Quando usar o Modo de Aceitação Automática de Edições

- **Desenvolvimento diário**: Ideal para a maioria das tarefas de codificação
- **Automação segura**: Permite que a IA modifique código ao mesmo tempo que evita a execução acidental de comandos perigosos
- **Colaboração em equipe**: Use em projetos compartilhados para evitar impactos indesejados nos outros

### Como alternar para este modo

```

# Alternar via comando
/approval-mode auto-edit

# Ou usar atalho de teclado
Shift+Tab (ou Tab no Windows) # Alternar de outros modos
```

### Exemplo de fluxo de trabalho

1. Você pede ao Qwen Code para refatorar uma função
2. A IA analisa o código e propõe alterações
3. **Automaticamente**​ aplica todas as alterações de arquivos sem confirmação
4. Se testes precisarem ser executados, irá **solicitar aprovação**​ para executar `npm test`

## 4. Modo YOLO - Automação completa

O Modo YOLO concede ao Qwen Code as permissões mais altas, aprovando automaticamente todas as chamadas de ferramentas, incluindo edição de arquivos e comandos shell.

### Quando usar o Modo YOLO

- **Scripts automatizados**: Execução de tarefas automatizadas predefinidas
- **Pipelines CI/CD**: Execução automatizada em ambientes controlados
- **Projetos pessoais**: Iteração rápida em ambientes totalmente confiáveis
- **Processamento em lote**: Tarefas que exigem cadeias de comandos de múltiplas etapas

> [!warning]
>
> **Use o Modo YOLO com cautela**: A IA pode executar qualquer comando com as permissões do seu terminal. Garanta:
>
> 1. Que você confia na base de código atual
> 2. Que você entende todas as ações que a IA irá realizar
> 3. Que arquivos importantes estejam salvos ou commitados no controle de versão

### Como habilitar o Modo YOLO

```

# Habilitar temporariamente (somente na sessão atual)
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
qwen --prompt "Execute a suíte de testes, corrija todos os testes com falha e, em seguida, faça commit das alterações"

# Sem intervenção humana, a IA irá:

# 1. Executar comandos de teste (auto-aprovados)

# 2. Corrigir casos de teste com falha (edição automática de arquivos)

# 3. Executar git commit (auto-aprovado)
```

## Alternância e Configuração de Modo

### Alternância por Atalho de Teclado

Durante uma sessão do Qwen Code, use **Shift+Tab**​ (ou **Tab** no Windows) para alternar rapidamente entre os três modos:

```
Modo Padrão → Modo Auto-Editar → Modo YOLO → Modo Planejar → Modo Padrão
```

### Configuração Persistente

```
// Nível de projeto: ./.qwen/settings.json
// Nível de usuário: ~/.qwen/settings.json
{
  "permissions": {
    "defaultMode": "auto-edit",  // ou "plan" ou "yolo"
    "confirmShellCommands": true,
    "confirmFileEdits": true
  }
}
```

### Recomendações de Uso por Modo

1. **Novo na base de código**: Comece com o **Modo Planejamento** para exploração segura
2. **Tarefas diárias de desenvolvimento**: Use **Aceitar Automaticamente Edições** (modo padrão), eficiente e seguro
3. **Scripts automatizados**: Use o **Modo YOLO** em ambientes controlados para automação completa
4. **Refatoração complexa**: Use o **Modo Planejamento** primeiro para planejamento detalhado, depois mude para o modo apropriado para execução