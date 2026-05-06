# Plano de Implementação da Exibição de Ferramentas do Agent

> **Para o Claude:** SUB-SKILL OBRIGATÓRIA: Use superpowers:executing-plans para implementar este plano tarefa por tarefa.

**Objetivo:** Adicionar uma exibição dedicada na UI do VSCode/web para execuções de ferramentas do Agent, de modo que o progresso, os resumos e as falhas dos subagents sejam renderizados a partir do `rawOutput` estruturado, em vez de recorrer ao card genérico de ferramentas.

**Arquitetura:** Preservar o `rawOutput` do ACP através do pipeline de sessão/atualização do VSCode até o `ToolCallData`, permitindo que o roteador compartilhado da web UI detecte payloads `task_execution` e renderize um componente dedicado `AgentToolCall`. Manter a alteração compartilhada em `packages/webui` para que o VSCode e o `ChatViewer` permaneçam alinhados.

**Stack Tecnológica:** TypeScript, React, Vitest, componentes compartilhados de chamadas de ferramentas do `@qwen-code/webui`.

### Tarefa 1: Validar o comportamento de fluxo de dados com falha

**Arquivos:**

- Modificar: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Criar: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Etapa 1: Escrever os testes com falha**

- Adicionar um teste no manipulador de sessão que verifique se `tool_call_update` encaminha o `rawOutput` quando o ACP envia um payload `task_execution`.
- Adicionar um teste no hook que verifique se `useToolCalls` armazena e atualiza o `rawOutput` para uma chamada de ferramenta do agent.

**Etapa 2: Executar o teste para verificar a falha**

Executar: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Esperado: falhas, pois o `rawOutput` não é preservado no pipeline atual do manipulador/hook.

### Tarefa 2: Validar o comportamento do renderizador com falha

**Arquivos:**

- Criar: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Etapa 1: Escrever o teste com falha**

- Renderizar a chamada de ferramenta roteada com `kind: 'other'` e `rawOutput.type === 'task_execution'`.
- Verificar se a descrição da tarefa, a ferramenta filha ativa, o resumo e o motivo da falha são renderizados por uma exibição dedicada do agent, em vez da saída de texto genérica.

**Etapa 2: Executar o teste para verificar a falha**

Executar: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Esperado: falha, pois o roteador utiliza apenas `kind` como chave e não existe um componente dedicado para o agent.

### Tarefa 3: Preservar a saída estruturada do agent de ponta a ponta

**Arquivos:**

- Modificar: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Modificar: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Modificar: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Modificar: `packages/webui/src/components/toolcalls/shared/types.ts`

**Etapa 1: Implementar as alterações mínimas no modelo de dados**

- Adicionar `rawOutput` opcional aos tipos de chamada de ferramenta da sessão/webview do VSCode.
- Encaminhar o `rawOutput` no `QwenSessionUpdateHandler`.
- Armazenar/mesclar o `rawOutput` no `useToolCalls`.
- Expor o `rawOutput` nos tipos de dados de chamada de ferramenta compartilhados da web UI.

**Etapa 2: Executar os testes focados**

Executar: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Esperado: aprovação.

### Tarefa 4: Adicionar a UI compartilhada de chamada de ferramenta do agent

**Arquivos:**

- Criar: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Modificar: `packages/webui/src/components/toolcalls/index.ts`
- Modificar: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Modificar: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Etapa 1: Implementar o renderizador mínimo**

- Adicionar uma verificação (guard) para `rawOutput.type === 'task_execution'`.
- Renderizar a descrição da tarefa como cabeçalho.
- Exibir nome + status do agent, ferramentas filhas em execução, resumo de conclusão e motivo de falha/cancelamento.
- Manter o layout compatível com múltiplos cards de agents em paralelo, renderizando cada chamada de ferramenta de forma independente.

**Etapa 2: Executar o teste focado do renderizador**

Executar: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Esperado: aprovação.

### Tarefa 5: Verificar a superfície integrada

**Arquivos:**

- Modificar: `packages/webui/src/index.ts`

**Etapa 1: Exportar o novo componente compartilhado, se necessário**

- Reexportar quaisquer novos componentes/tipos necessários para o VSCode ou `ChatViewer`.

**Etapa 2: Executar a verificação do pacote**

Executar: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Executar: `npm run check-types --workspace=packages/vscode-ide-companion`
Executar: `npm run typecheck --workspace=packages/webui`

Esperado: aprovação de todos os testes e verificações de tipo direcionados.