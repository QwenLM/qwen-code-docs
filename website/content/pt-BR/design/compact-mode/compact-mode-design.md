# Design do Modo Compacto: Análise Competitiva e Otimização

> Alternância de modo compacto/verbose com Ctrl+O — análise competitiva com o Claude Code, revisão da implementação atual e recomendações de otimização.
>
> Documentação do usuário: [Settings — ui.compactMode](../../users/configuration/settings.md).

## 1. Resumo Executivo

O Qwen Code e o Claude Code oferecem um atalho Ctrl+O para alternar entre as visualizações compacta e detalhada da saída das ferramentas, mas a **filosofia de design, o estado padrão e o modelo de interação diferem fundamentalmente**. Este documento apresenta uma comparação detalhada em nível de código-fonte, identifica lacunas de UX e propõe otimizações para o Qwen Code.

| Dimensão            | Claude Code                                 | Qwen Code                                     |
| -------------------- | ------------------------------------------- | --------------------------------------------- |
| Modo padrão         | Compacto (verbose=false)                     | Verbose (compactMode=false)                   |
| Semântica da alternância     | Visualização temporária de detalhes                   | Troca de preferência persistente                  |
| Persistência          | Apenas na sessão, reseta ao reiniciar             | Persistido no settings.json                    |
| Escopo                | Troca global de tela (prompt ↔ transcript) | Alternância de renderização por componente                |
| Snapshot congelado      | Nenhum (sem conceito)                           | Nenhum (removido)                                |
| Dica de expansão por ferramenta | Sim ("ctrl+o to expand")                    | Sim ("Press Ctrl+O to show full tool output") |

## 2. Análise da Implementação do Claude Code

### 2.1 Arquitetura

O Claude Code utiliza uma abordagem **baseada em tela** em vez de uma alternância de renderização em nível de componente:

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (padrão: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  alterna o modo da tela
     │  Handler    │  NÃO é uma flag de renderização
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → visualização compacta (padrão)
     │  screen='transcript'→ visualização detalhada
     └────────────────────┘
```

### 2.2 Arquivos de Código-Fonte Principais

| Componente        | Arquivo                                               | Lógica Principal                                               |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Handler de alternância   | `src/hooks/useGlobalKeybindings.tsx:90-132`        | Alterna `screen` entre `'prompt'` e `'transcript'` |
| Keybinding       | `src/keybindings/defaultBindings.ts:44`            | `app:toggleTranscript`                                  |
| Definição de estado | `src/state/AppStateStore.ts:472`                   | `verbose: false` (apenas na sessão)                         |
| Dica de expansão      | `src/components/CtrlOToExpand.tsx:29-46`           | Texto "(ctrl+o to expand)" por ferramenta                      |
| Filtro de mensagens   | `src/components/Messages.tsx:93-151`               | `filterForBriefTool()` para visualização compacta                 |
| Permissão       | `src/components/permissions/PermissionRequest.tsx` | Renderizado em camada de overlay, nunca oculto                 |

### 2.3 Decisões de Design

1. **O modo compacto é o padrão.** Os usuários veem uma interface limpa logo de início; os detalhes são ativados sob demanda.
2. **Escopo de sessão.** `verbose` reseta para `false` em cada nova sessão — o Claude Code assume que os usuários geralmente preferem a visualização compacta e só precisam de detalhes temporariamente.
3. **Alternância em nível de tela.** Ctrl+O não altera como os componentes são renderizados; ele troca toda a exibição entre uma tela "prompt" (compacta) e uma tela "transcript" (detalhada).
4. **Sem snapshot congelado.** Não existe o conceito de congelar snapshots. Ao alternar, a exibição é atualizada imediatamente com o estado atual.
5. **Diálogos de permissão são separados.** As aprovações de ferramentas são renderizadas em uma camada de overlay dedicada que nunca é afetada pela alternância verbose/compact.
6. **Dica por ferramenta.** O componente `CtrlOToExpand` exibe uma dica contextual em ferramentas individuais quando elas geram uma saída grande, sendo suprimido em sub-agentes.

### 2.4 Fluxo do Usuário

```
Início da sessão → modo compacto (padrão)
     │
     ├─ Saídas das ferramentas são resumidas em uma única linha
     ├─ Saída grande de ferramenta exibe a dica "(ctrl+o to expand)"
     │
     ├─ Usuário pressiona Ctrl+O
     │     └─→ Tela muda para transcript (visualização detalhada)
     │         └─ Usuário vê toda a saída da ferramenta, pensamento, etc.
     │
     ├─ Usuário pressiona Ctrl+O novamente
     │     └─→ Tela volta para prompt (compacto)
     │
     └─ Fim da sessão → verbose reseta para false
```

## 3. Análise da Implementação do Qwen Code

### 3.1 Arquitetura

O Qwen Code utiliza uma **flag de renderização em nível de componente** que cada componente da UI lê a partir do contexto:

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (padrão: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  alterna compactMode
     │  Handler    │  persiste nas configurações
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  Cada componente lê    │
     │  compactMode e         │
     │  decide como renderizar│
     └────────────────────────┘
           │
     ┌─────▼──────────────────────────────┐
     │  ToolGroupMessage                   │
     │    showCompact = compactMode        │
     │      && !hasConfirmingTool          │
     │      && !hasErrorTool               │
     │      && !isEmbeddedShellFocused     │
     │      && !isUserInitiated            │
     └────────────────────────────────────┘
```

### 3.2 Arquivos de Código-Fonte Principais

| Componente       | Arquivo                                  | Lógica Principal                                       |
| --------------- | ------------------------------------- | ----------------------------------------------- |
| Handler de alternância  | `AppContainer.tsx:1684-1690`          | Alterna `compactMode`, persiste nas configurações     |
| Contexto         | `CompactModeContext.tsx`              | `compactMode`, `setCompactMode`                 |
| Grupo de ferramentas      | `ToolGroupMessage.tsx:105-110`        | `showCompact` com 4 condições de expansão forçada    |
| Mensagem de ferramenta    | `ToolMessage.tsx:346-350`             | Oculta `displayRenderer` no modo compacto         |
| Exibição compacta | `CompactToolGroupDisplay.tsx:49-108`  | Resumo em uma linha com status + dica          |
| Confirmação    | `ToolConfirmationMessage.tsx:113-147` | Aprovação compacta simplificada com 3 opções            |
| Dicas            | `Tips.tsx:14-29`                      | Rotação de dicas de inicialização inclui dica do modo compacto |
| Sincronização de configurações   | `SettingsDialog.tsx:189-193`          | Sincroniza com CompactModeContext + refreshStatic   |
| MainContent     | `MainContent.tsx:60-76`               | Renderiza `pendingHistoryItems` em tempo real                |
| Pensamento        | `HistoryItemDisplay.tsx:123-133`      | Oculta `gemini_thought` no modo compacto          |

### 3.3 Decisões de Design

1. **O modo verbose é o padrão.** Os usuários veem toda a saída das ferramentas e o pensamento por padrão.
2. **Preferência persistente.** `compactMode` é salvo no `settings.json` e persiste entre sessões.
3. **Renderização em nível de componente.** Cada componente lê `compactMode` do contexto e ajusta sua própria renderização.
4. **Proteção de expansão forçada.** Quatro condições substituem o modo compacto para garantir que elementos críticos da UI estejam sempre visíveis (confirmações, erros, shell, ações iniciadas pelo usuário).
5. **Sem congelamento de snapshot.** A alternância sempre mostra a saída em tempo real — sem snapshots congelados.
6. **Sincronização com diálogo de configurações.** Alternar o modo compacto nas Configurações atualiza o estado do React imediatamente via `setCompactMode`.
7. **Descoberta não intrusiva.** O modo compacto é apresentado por meio da rotação de Dicas de inicialização, em vez de um indicador persistente no rodapé, evitando poluição visual na UI.

### 3.4 Fluxo do Usuário

```
Início da sessão → modo verbose (padrão)
     │
     ├─ Todas as saídas das ferramentas, pensamento e detalhes visíveis
     │
     ├─ Usuário pressiona Ctrl+O (ou alterna nas Configurações)
     │     └─→ compactMode = true, persistido
     │         ├─ Grupos de ferramentas mostram resumo em uma linha
     │         ├─ Conteúdo de pensamento/thought oculto
     │         └─ Confirmações, erros e shell permanecem expandidos
     │
     ├─ Usuário pressiona Ctrl+O novamente
     │     └─→ compactMode = false, persistido
     │         └─ Todos os detalhes visíveis novamente
     │
     └─ Próxima sessão → mesmo modo da última sessão
```

## 4. Análise Aprofundada das Principais Diferenças

### 4.1 Filosofia do Modo Padrão

| Aspecto               | Claude Code (padrão compacto)         | Qwen Code (padrão verbose)                   |
| -------------------- | ------------------------------------- | --------------------------------------------- |
| Primeira impressão     | Limpo, minimalista — sensação profissional    | Rico em informações — transparência total          |
| Curva de aprendizado       | Usuário precisa aprender Ctrl+O para ver detalhes | Usuário pode ver tudo imediatamente           |
| Público-alvo      | Usuários experientes que confiam na ferramenta  | Usuários que querem entender o que está acontecendo |
| Sobrecarga de informações | Evitada por padrão                    | Possível para novos usuários                        |
| Descoberta      | Dicas "(ctrl+o to expand)" por ferramenta   | Rotação de Dicas de inicialização + atalhos ? + /help   |

**Análise:** O padrão compacto do Claude Code funciona porque sua base de usuários é geralmente composta por desenvolvedores experientes que confiam na ferramenta e não precisam ver cada invocação. O padrão verbose do Qwen Code é adequado para seu estágio inicial, onde construir confiança do usuário por meio da transparência é importante.

### 4.2 Modelo de Persistência

| Aspecto           | Claude Code               | Qwen Code                  |
| ---------------- | ------------------------- | -------------------------- |
| Persistido?       | Não — apenas na sessão         | Sim — no settings.json     |
| Justificativa        | Verbose é uma visualização temporária | Modo é preferência do usuário    |
| Comportamento ao reiniciar | Sempre inicia compacto     | Inicia com o último modo usado |

**Análise:** O Claude Code trata a visualização de detalhes como uma necessidade momentânea — você olha e depois volta. O Qwen Code trata como uma preferência estável — alguns usuários sempre querem detalhes, outros sempre querem o modo compacto. Ambas são válidas; a abordagem do Qwen Code é mais flexível.

### 4.3 Proteção de Confirmações

| Aspecto                  | Claude Code                                 | Qwen Code                                            |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Mecanismo               | Camada de overlay/modal (estruturalmente separada) | Condições de expansão forçada em `showCompact`             |
| Cobertura                | Completa — aprovações nunca podem ser ocultas    | Completa — 4 condições cobrem todos os estados interativos |
| UI de confirmação compacta | N/A (overlay é sempre completo)                | `RadioButtonSelect` simplificado com 3 opções                |

**Análise:** A separação arquitetural do Claude Code (camada de overlay) é mais robusta. A abordagem de expansão forçada do Qwen Code é eficaz, mas exige que cada novo estado interativo seja adicionado explicitamente à lista de condições.

### 4.4 Abordagem de Renderização

| Aspecto       | Claude Code                         | Qwen Code                                  |
| ------------ | ----------------------------------- | ------------------------------------------ |
| Escopo da alternância | Nível de tela (prompt ↔ transcript) | Nível de componente (cada componente decide)   |
| Granularidade  | Tudo ou nada                      | Granularidade fina por componente                 |
| Flexibilidade  | Baixa — alternância global                 | Alta — componentes podem substituir             |
| Consistência  | Garantida                          | Depende da implementação de cada componente |

**Análise:** A abordagem em nível de componente do Qwen Code é mais flexível (ex.: expansão forçada para condições específicas), mas exige mais disciplina para manter a consistência. A abordagem em nível de tela do Claude Code é mais simples e garante comportamento consistente.

## 5. Recomendações de Otimização

### 5.1 [P0] Manter Verbose como Padrão — Nenhuma Alteração Necessária

O padrão verbose do Qwen Code é a escolha correta para seu estágio atual. Usuários novos na ferramenta precisam de transparência para construir confiança. Conforme o produto amadurece, considere tornar o modo compacto o padrão (como no Claude Code).

### 5.2 [P1] Expansão por Ferramenta para Saídas Grandes

O Claude Code exibe "(ctrl+o to expand)" em ferramentas individuais que geram saídas grandes. O Qwen Code atualmente possui apenas uma alternância global. Considere:

- Quando uma única ferramenta gera uma saída que excede N linhas, exiba uma dica de "expandir" por ferramenta no modo compacto.
- Escopo: melhoria futura, não é prioridade atual.

### 5.3 [P2] Considerar Substituição com Escopo de Sessão

Alguns usuários podem querer o modo compacto como padrão, mas ocasionalmente precisam do verbose para uma sessão específica. Considere oferecer suporte a ambos:

- `settings.json` → padrão persistente (comportamento atual)
- Ctrl+O durante a sessão → substituição temporária apenas para a sessão atual (comportamento do Claude Code)
- Ao reiniciar a sessão → reverter para o valor do `settings.json`

Isso oferece o melhor dos dois mundos aos usuários. A implementação exigiria separar o estado "padrão das configurações" do estado "substituição da sessão".

### 5.4 [P2] Separação Estrutural para Confirmações

Atualmente, a proteção de confirmações depende das condições `showCompact` no `ToolGroupMessage`. Considere uma abordagem mais robusta:

- Renderizar confirmações em uma camada separada (como a abordagem de overlay do Claude Code).
- Isso tornaria arquiteturalmente impossível que o modo compacto afetasse as confirmações.
- Prioridade mais baixa, já que a abordagem atual de expansão forçada funciona corretamente.

## 6. Status Atual da Implementação

Após as alterações na branch `feat/compact-mode-optimization`:

| Recurso                          | Status | Notas                                             |
| -------------------------------- | ------ | ------------------------------------------------- |
| Dica nas Dicas de inicialização                | Concluído   | Dica do modo compacto na rotação de Tips (não intrusiva) |
| Ctrl+O nos atalhos de teclado (?) | Concluído   | Adicionado ao componente KeyboardShortcuts              |
| Ctrl+O no /help                  | Concluído   | Adicionado ao componente Help                           |
| Sincronização do diálogo de configurações             | Concluído   | Sincroniza compactMode com CompactModeContext         |
| Sem congelamento de snapshot             | Concluído   | Alternância sempre mostra saída em tempo real                   |
| Proteção de confirmação          | Concluído   | Expansão forçada + guard WaitingForConfirmation       |
| Proteção do shell                 | Concluído   | Expansão forçada `!isEmbeddedShellFocused`            |
| Proteção de erros                 | Concluído   | Expansão forçada `!hasErrorTool`                      |
| Documentação do usuário atualizada                | Concluído   | settings.md, keyboard-shortcuts.md                |

## 7. Referência de Arquivos

### Qwen Code

| Arquivo                                                                  | Finalidade                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/cli/src/ui/AppContainer.tsx`                                | Handler de alternância, inicialização de estado, context provider |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                 | Definição do contexto                                     |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`        | Lógica de expansão forçada                                     |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`             | Ocultação de saída por ferramenta                                 |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Renderização da visualização compacta                                 |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | UI de confirmação compacta                                |
| `packages/cli/src/ui/components/MainContent.tsx`                      | Renderização de itens de histórico pendentes                        |
| `packages/cli/src/ui/components/Tips.tsx`                             | Dica de inicialização com dica do modo compacto                     |
| `packages/cli/src/ui/components/Help.tsx`                             | Entrada de atalho /help                                   |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`                | Entrada de atalho ?                                       |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                   | Sincronização de configurações                                          |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Ocultação de conteúdo de pensamento                                |
| `packages/cli/src/config/settingsSchema.ts`                           | Definição da configuração                                     |
| `packages/cli/src/config/keyBindings.ts`                              | Binding do Ctrl+O                                         |

### Claude Code (Referência)

| Arquivo                                               | Finalidade                           |
| -------------------------------------------------- | --------------------------------- |
| `src/hooks/useGlobalKeybindings.tsx`               | Handler de alternância                    |
| `src/state/AppStateStore.ts`                       | Definição de estado (verbose: false) |
| `src/components/CtrlOToExpand.tsx`                 | Dica de expansão por ferramenta              |
| `src/components/Messages.tsx`                      | Filtro de mensagens breves              |
| `src/screens/REPL.tsx`                             | Alternância de modo em nível de tela       |
| `src/components/permissions/PermissionRequest.tsx` | Confirmação baseada em overlay        |