# Plano de Implementação de Exibição de Ferramentas do Agente

> **Para o Claude:** HABILIDADE SUBSIDIÁRIA OBRIGATÓRIA: Use superpowers:executing-plans para implementar este plano tarefa por tarefa.

**Objetivo:** Adicionar uma exibição dedicada na UI do VSCode/web para execuções de ferramentas do Agente, de modo que progresso, resumos e falhas de subagentes sejam renderizados a partir do `rawOutput` estruturado, em vez de recorrer ao cartão genérico de ferramenta.

**Arquitetura:** Preservar o `rawOutput` do ACP através do pipeline de sessão/atualização do VSCode para `ToolCallData`, e então deixar que o roteador compartilhado da web UI detecte payloads `task_execution` e renderize um componente dedicado `AgentToolCall`. Manter a alteração compartilhada em `packages/webui` para que o VSCode e o `ChatViewer` permaneçam alinhados.

**Stack Tecnológico:** TypeScript, React, Vitest, componentes de tool-call compartilhados `@qwen-code/webui`.

### Tarefa 1: Fixar o comportamento atual do fluxo de dados (falhando)

**Arquivos:**

- Modificar: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Criar: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Passo 1: Escrever os testes que falham**

- Adicionar um teste no session handler que verifica se `tool_call_update` repassa o `rawOutput` quando o ACP envia um payload `task_execution`.
- Adicionar um teste no hook que verifica se `useToolCalls` armazena e atualiza o `rawOutput` para uma chamada de ferramenta do agente.

**Passo 2: Executar o teste para verificar que ele falha**

Execute: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Esperado: falhas porque `rawOutput` não é preservado no pipeline atual do handler/hook.

### Tarefa 2: Fixar o comportamento atual do renderizador (falhando)

**Arquivos:**

- Criar: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Passo 1: Escrever o teste que falha**

- Renderizar a chamada de ferramenta roteada com `kind: 'other'` mais `rawOutput.type === 'task_execution'`.
- Verificar que a descrição da tarefa, a ferramenta filha ativa, o resumo e o motivo da falha são renderizados a partir de uma exibição dedicada do agente, em vez de uma saída de texto genérica.

**Passo 2: Executar o teste para verificar que ele falha**

Execute: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Esperado: falha porque o roteador só usa `kind` como chave e não existe componente dedicado ao agente.

### Tarefa 3: Preservar a saída estruturada do agente de ponta a ponta

**Arquivos:**

- Modificar: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Modificar: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Modificar: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Modificar: `packages/webui/src/components/toolcalls/shared/types.ts`

**Passo 1: Implementar as mudanças mínimas no modelo de dados**

- Adicionar `rawOutput` opcional aos tipos de chamada de ferramenta da sessão/webview do VSCode.
- Repassar `rawOutput` em `QwenSessionUpdateHandler`.
- Armazenar/mesclar `rawOutput` em `useToolCalls`.
- Expor `rawOutput` nos tipos de dados de chamada de ferramenta da web UI compartilhada.

**Passo 2: Executar os testes focados**

Execute: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Esperado: passar.

### Tarefa 4: Adicionar a UI compartilhada da chamada de ferramenta do agente

**Arquivos:**

- Criar: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Modificar: `packages/webui/src/components/toolcalls/index.ts`
- Modificar: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Modificar: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Passo 1: Implementar o renderizador mínimo**

- Adicionar uma verificação para `rawOutput.type === 'task_execution'`.
- Renderizar a descrição da tarefa como cabeçalho.
- Mostrar nome do agente + status, ferramentas filhas em execução no momento, resumo de conclusão e motivo de falha/cancelamento.
- Manter o layout compatível com vários cartões de agente em paralelo, renderizando cada chamada de ferramenta de forma independente.

**Passo 2: Executar o teste focado do renderizador**

Execute: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Esperado: passar.

### Tarefa 5: Verificar a superfície integrada

**Arquivos:**

- Modificar: `packages/webui/src/index.ts`

**Passo 1: Exportar o novo componente compartilhado, se necessário**

- Reexportar qualquer novo componente/tipo necessário para o VSCode ou `ChatViewer`.

**Passo 2: Executar a verificação do pacote**

Execute: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Execute: `npm run check-types --workspace=packages/vscode-ide-companion`
Execute: `npm run typecheck --workspace=packages/webui`

Esperado: todos os testes direcionados e as verificações de tipo passam.