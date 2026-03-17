# Modo de Aprovação

O Qwen Code oferece três modos distintos de permissão que permitem controlar com flexibilidade como a IA interage com seu código e sistema, com base na complexidade da tarefa e no nível de risco.

## Comparação de Modos de Permissão

| Modo         | Edição de Arquivos          | Comandos Shell              | Ideal Para                                                                                             | Nível de Risco |
| ------------ | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| **Plano**    | ❌ Apenas análise somente leitura | ❌ Não executados           | • Exploração de código <br>• Planejamento de alterações complexas <br>• Revisão de código segura     | Mais Baixo     |
| **Padrão**   | ✅ Requer aprovação manual  | ✅ Requer aprovação manual  | • Codebases novos ou desconhecidos <br>• Sistemas críticos <br>• Colaboração em equipe <br>• Aprendizado e ensino | Baixo          |
| **Edição Automática** | ✅ Aprovado automaticamente | ❌ Requer aprovação manual  | • Tarefas diárias de desenvolvimento <br>• Refatoração e melhorias de código <br>• Automação segura | Médio          |
| **YOLO**     | ✅ Aprovado automaticamente | ✅ Aprovado automaticamente | • Projetos pessoais confiáveis <br>• Scripts automatizados/CI/CD <br>• Tarefas de processamento em lote | Mais Alto      |

### Guia de Referência Rápida

- **Comece no Modo Planejamento**: Ótimo para entender antes de fazer alterações  
- **Trabalhe no Modo Padrão**: A escolha equilibrada para a maior parte do trabalho de desenvolvimento  
- **Mude para Edição Automática**: Quando estiver fazendo muitas alterações seguras no código  
- **Use o modo YOLO com moderação**: Apenas para automação confiável em ambientes controlados  

> [!tip]  
>  
> Você pode alternar rapidamente entre os modos durante uma sessão usando **Shift+Tab** (ou **Tab**, no Windows). A barra de status do terminal mostra seu modo atual, portanto você sempre saberá quais permissões o Qwen Code possui.  

## 1. Use o Modo Planejamento para análise segura de código  

O Modo Planejamento instrui o Qwen Code a criar um plano analisando a base de código com operações **somente leitura**, ideal para explorar bases de código, planejar alterações complexas ou revisar código com segurança.

### Quando usar o Modo Plano

- **Implementação em várias etapas**: Quando sua funcionalidade exigir edições em muitos arquivos  
- **Exploração de código**: Quando você quiser pesquisar minuciosamente a base de código antes de fazer qualquer alteração  
- **Desenvolvimento interativo**: Quando você quiser iterar na direção com o Qwen Code

### Como usar o Modo Planejamento

**Ativar o Modo Planejamento durante uma sessão**

Você pode alternar para o Modo Planejamento durante uma sessão usando **Shift+Tab** (ou **Tab**, no Windows) para percorrer os modos de permissão.

Se você estiver no Modo Normal, **Shift+Tab** (ou **Tab**, no Windows) primeiro alterna para o modo `auto-edits`, indicado por `⏵⏵ aceitar edições em` na parte inferior do terminal. Um segundo pressionamento de **Shift+Tab** (ou **Tab**, no Windows) alternará para o Modo Planejamento, indicado por `⏸ modo planejamento`.

**Iniciar uma nova sessão no Modo Planejamento**

Para iniciar uma nova sessão no Modo Planejamento, use o comando `/approval-mode` e, em seguida, selecione `plan`.

```bash
/approval-mode
```

**Executar consultas "headless" no Modo Planejamento**

Você também pode executar uma consulta diretamente no Modo Planejamento usando a flag `-p` ou a opção `prompt`:

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

O Qwen Code analisa a implementação atual e cria um plano abrangente. Refine-o com perguntas complementares:

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

## 2. Usar o modo padrão para interações controladas

O modo padrão é a forma habitual de trabalhar com o Qwen Code. Nesse modo, você mantém controle total sobre todas as operações potencialmente arriscadas: o Qwen Code solicitará sua aprovação antes de realizar quaisquer alterações em arquivos ou executar comandos no shell.

### Quando usar o Modo Padrão

- **Novo em uma base de código**: Quando você está explorando um projeto desconhecido e deseja ser extremamente cauteloso  
- **Sistemas críticos**: Ao trabalhar em código de produção, infraestrutura ou dados sensíveis  
- **Aprendizado e ensino**: Quando você quer entender cada etapa executada pelo Qwen Code  
- **Colaboração em equipe**: Quando várias pessoas estão trabalhando na mesma base de código  
- **Operações complexas**: Quando as alterações envolvem vários arquivos ou lógica complexa

### Como usar o Modo Padrão

**Ativar o Modo Padrão durante uma sessão**

Você pode alternar para o Modo Padrão durante uma sessão usando **Shift+Tab** (ou apenas **Tab** no Windows) para percorrer os modos de permissão. Se você estiver em qualquer outro modo, pressionar **Shift+Tab** (ou **Tab** no Windows) eventualmente retornará ao Modo Padrão, indicado pela ausência de qualquer indicador de modo na parte inferior do terminal.

**Iniciar uma nova sessão no Modo Padrão**

O Modo Padrão é o modo inicial ao iniciar o Qwen Code. Se você alterou o modo e deseja retornar ao Modo Padrão, use:

```
/approval-mode default
```

**Executar consultas "headless" no Modo Padrão**

Ao executar comandos headless, o comportamento padrão é o Modo Padrão. Você pode especificá-lo explicitamente com:

```
qwen --prompt "Analise este código quanto a possíveis bugs"
```

### Exemplo: Implementando uma funcionalidade com segurança

```
/approval-mode default
```

```
Preciso adicionar fotos de perfil de usuários à nossa aplicação. As fotos devem ser armazenadas em um bucket S3 e as URLs salvas no banco de dados.
```

O Qwen Code analisará sua base de código e proporá um plano. Em seguida, solicitará sua aprovação antes de:

1. Criar novos arquivos (controladores, modelos, migrações)
2. Modificar arquivos existentes (adicionar novas colunas, atualizar APIs)
3. Executar quaisquer comandos de shell (migrações de banco de dados, instalação de dependências)

Você pode revisar cada alteração proposta e aprová-la ou rejeitá-la individualmente.

### Configurar o modo padrão como padrão

```bash
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "default"
  }
}
```

## 3. Modo de Edições Automáticas

O Modo de Edições Automáticas instrui o Qwen Code a aprovar automaticamente edições de arquivos, mas exigir aprovação manual para comandos de shell — ideal para acelerar fluxos de desenvolvimento mantendo a segurança do sistema.

### Quando usar o Modo de Edições Automáticas

- **Desenvolvimento diário**: Ideal para a maioria das tarefas de programação  
- **Automação segura**: Permite que a IA modifique código, mas impede a execução acidental de comandos perigosos  
- **Colaboração em equipe**: Use em projetos compartilhados para evitar impactos não intencionais em outros membros  

### Como alternar para este modo  

```  
# Alternar via comando  
/approval-mode auto-edit  

# Ou use o atalho de teclado  
Shift+Tab (ou Tab no Windows) # Alternar de outros modos  
```  

### Exemplo de fluxo de trabalho  

1. Você pede ao Qwen Code para refatorar uma função  
2. A IA analisa o código e propõe alterações  
3. **Aplica automaticamente** todas as alterações nos arquivos, sem confirmação  
4. Se for necessário executar testes, ela **solicitará aprovação** para rodar `npm test`  

## 4. Modo YOLO — Automação total  

O Modo YOLO concede ao Qwen Code as maiores permissões, aprovando automaticamente todas as chamadas de ferramentas, incluindo edições de arquivos e comandos de terminal.

### Quando usar o Modo YOLO

- **Scripts automatizados**: Execução de tarefas automatizadas predefinidas  
- **Pipelines CI/CD**: Execução automatizada em ambientes controlados  
- **Projetos pessoais**: Iteração rápida em ambientes totalmente confiáveis  
- **Processamento em lote**: Tarefas que exigem cadeias de comandos em várias etapas  

> [!warning]  
>   
> **Use o Modo YOLO com cautela**: a IA pode executar qualquer comando com as permissões do seu terminal. Certifique-se de:  
>   
> 1. Confiar na base de código atual  
> 2. Compreender todas as ações que a IA executará  
> 3. Ter feito backup dos arquivos importantes ou ter commitado-os no controle de versão  

### Como habilitar o Modo YOLO  

```  

# Habilitar temporariamente (apenas na sessão atual)  
/approval-mode yolo  

# Definir como padrão para o projeto  
/approval-mode yolo --project  

# Definir como padrão global para o usuário  
/approval-mode yolo --user  
```  

### Exemplo de configuração  

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

### Exemplo de fluxo de trabalho automatizado  

```

# Tarefa de refatoração totalmente automatizada  
qwen --prompt "Executar a suíte de testes, corrigir todos os testes com falha e, em seguida, confirmar as alterações"

# Sem intervenção humana, a IA realizará:

# 1. Executar comandos de teste (aprovação automática)

# 2. Corrigir casos de teste com falha (edição automática de arquivos)

# 3. Executar o commit do Git (aprovação automática)  
```

## Alternância de modos e configuração

### Alternância por atalho de teclado

Durante uma sessão do Qwen Code, use **Shift+Tab** (ou **Tab**, no Windows) para alternar rapidamente entre os três modos:

```
Modo Padrão → Modo de Edição Automática → Modo YOLO → Modo de Planejamento → Modo Padrão
```

### Configuração persistente

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

### Recomendações de Uso dos Modos

1. **Novo no código-fonte**: Comece com o **Modo Planejamento** para explorar com segurança  
2. **Tarefas diárias de desenvolvimento**: Use **Edições Automáticas Aceitas** (modo padrão), eficiente e seguro  
3. **Scripts automatizados**: Use o **Modo YOLO** em ambientes controlados para automação completa  
4. **Refatorações complexas**: Use primeiro o **Modo Planejamento** para planejamento detalhado, depois mude para o modo apropriado para execução