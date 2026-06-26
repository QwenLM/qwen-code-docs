# Design do Modo Compacto: Análise Competitiva e Otimização

> Alternância de modo compacto/verboso com Ctrl+O — análise competitiva com o Claude Code, revisão da implementação atual e recomendações de otimização.
>
> Documentação do usuário: [Configurações — ui.compactMode](../../users/configuration/settings.md).

## 1. Resumo Executivo

O Qwen Code e o Claude Code oferecem um atalho Ctrl+O para alternar entre visualizações compacta e detalhada das saídas das ferramentas, mas a **filosofia de design, estado padrão e modelo de interação diferem fundamentalmente**. Este documento fornece uma comparação profunda em nível de código-fonte, identifica lacunas de UX e propõe otimizações para o Qwen Code.

| Dimensão             | Claude Code                                 | Qwen Code                                     |
| -------------------- | ------------------------------------------- | --------------------------------------------- |
| Modo padrão          | Compacto (verbose=false)                    | Verboso (compactMode=false)                   |
| Semântica da alternância | Visualização temporária de detalhes        | Alternância de preferência persistente        |
| Persistência         | Apenas na sessão, reinicia ao reabrir       | Persistido em settings.json                   |
| Escopo               | Alternância de tela global (prompt ↔ transcript) | Alternância de renderização por componente    |
| Snapshot congelado   | Nenhum (sem conceito)                       | Nenhum (removido)                             |
| Dica de expansão por ferramenta | Sim ("ctrl+o to expand")          | Sim ("Pressione Ctrl+O para ver a saída completa da ferramenta") |

## 2. Análise da Implementação do Claude Code

### 2.1 Arquitetura

O Claude Code usa uma abordagem **baseada em tela** em vez de uma alternância de renderização em nível de componente:

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (default: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  alterna o modo de tela
     │  Handler    │  NÃO é uma flag de renderização
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → visualização compacta (padrão)
     │  screen='transcript'→ visualização detalhada
     └────────────────────┘
```

### 2.2 Principais Arquivos de Código-Fonte

| Componente        | Arquivo                                               | Lógica Chave                                             |
| ----------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Manipulador da alternância | `src/hooks/useGlobalKeybindings.tsx:90-132`      | Alterna `screen` entre `'prompt'` e `'transcript'`       |
| Atalho de teclado | `src/keybindings/defaultBindings.ts:44`              | `app:toggleTranscript`                                    |
| Definição de estado | `src/state/AppStateStore.ts:472`                   | `verbose: false` (apenas na sessão)                       |
| Dica de expansão  | `src/components/CtrlOToExpand.tsx:29-46`             | Texto "(ctrl+o to expand)" por ferramenta                 |
| Filtro de mensagens | `src/components/Messages.tsx:93-151`               | `filterForBriefTool()` para visualização compacta         |
| Permissão         | `src/components/permissions/PermissionRequest.tsx`   | Renderizado em camada sobreposta, nunca ocultado          |

### 2.3 Decisões de Design

1. **Compacto é o padrão.** Os usuários veem uma interface limpa pronta para uso; os detalhes são opcionais.
2. **Escopo da sessão.** `verbose` volta para `false` em cada nova sessão — o Claude Code assume que os usuários geralmente preferem a visualização compacta e só precisam de detalhes temporariamente.
3. **Alternância em nível de tela.** Ctrl+O não altera como os componentes renderizam; ele alterna a exibição inteira entre uma tela "prompt" (compacta) e uma tela "transcript" (detalhada).
4. **Sem snapshot congelado.** Não existe o conceito de congelamento de snapshot. Ao alternar, a exibição é atualizada imediatamente com o estado atual.
5. **Diálogos de permissão são separados.** As aprovações de ferramentas são renderizadas em uma camada de sobreposição dedicada que nunca é afetada pela alternância verboso/compacto.
6. **Dica por ferramenta.** O componente `CtrlOToExpand` mostra uma dica contextual em ferramentas individuais quando produzem saída grande, suprimida em subagentes.

### 2.4 Fluxo do Usuário

```
Início da sessão → modo compacto (padrão)
     │
     ├─ Saídas das ferramentas são resumidas em uma única linha
     ├─ Saída grande da ferramenta mostra dica "(ctrl+o to expand)"
     │
     ├─ Usuário pressiona Ctrl+O
     │     └─→ Tela alterna para transcript (visualização detalhada)
     │         └─ Usuário vê toda a saída da ferramenta, pensamento, etc.
     │
     ├─ Usuário pressiona Ctrl+O novamente
     │     └─→ Tela alterna de volta para prompt (compacta)
     │
     └─ Sessão termina → verbose volta para false
```

## 3. Análise da Implementação do Qwen Code

### 3.1 Arquitetura

O Qwen Code usa uma **flag de renderização em nível de componente** que cada componente de UI lê do contexto:

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (default: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  alterna compactMode
     │  Handler    │  persiste em settings
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  Cada componente lê    │
     │  compactMode e         │
     │  decide como renderizar │
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

### 3.2 Principais Arquivos de Código-Fonte

| Componente       | Arquivo                                  | Lógica Chave                                        |
| ---------------- | ---------------------------------------- | --------------------------------------------------- |
| Manipulador da alternância | `AppContainer.tsx:1684-1690`       | Alterna `compactMode`, persiste em settings         |
| Contexto         | `CompactModeContext.tsx`                 | `compactMode`, `setCompactMode`                     |
| Grupo de ferramentas | `ToolGroupMessage.tsx:105-110`        | `showCompact` com 4 condições de força de expansão  |
| Mensagem de ferramenta | `ToolMessage.tsx:346-350`            | Oculta `displayRenderer` no modo compacto           |
| Exibição compacta | `CompactToolGroupDisplay.tsx:49-108`    | Resumo em linha única com status + dica             |
| Confirmação       | `ToolConfirmationMessage.tsx:113-147`   | Aprovação compacta simplificada com 3 opções        |
| Dicas             | `Tips.tsx:14-29`                        | Rotação de dicas iniciais inclui dica do modo compacto |
| Sincronização de configurações | `SettingsDialog.tsx:189-193`   | Sincroniza com CompactModeContext + refreshStatic    |
| MainContent       | `MainContent.tsx:60-76`                 | Renderiza live pendingHistoryItems                   |
| Pensamento        | `HistoryItemDisplay.tsx:123-133`        | Oculta `gemini_thought` no modo compacto            |

### 3.3 Decisões de Design

1. **Verboso é o padrão.** Os usuários veem toda a saída das ferramentas e pensamentos por padrão.
2. **Preferência persistente.** `compactMode` é salvo em `settings.json` e sobrevive entre sessões.
3. **Renderização em nível de componente.** Cada componente lê `compactMode` do contexto e ajusta sua própria renderização.
4. **Proteção de força de expansão.** Quatro condições substituem o modo compacto para garantir que elementos críticos da UI estejam sempre visíveis (confirmações, erros, shell, iniciado pelo usuário).
5. **Sem congelamento de snapshot.** A alternância sempre mostra saída ao vivo — sem snapshots congelados.
6. **Sincronização com diálogo de configurações.** Alternar o modo compacto a partir das Configurações atualiza o estado React imediatamente via `setCompactMode`.
7. **Descoberta não intrusiva.** O modo compacto é introduzido através da rotação de dicas iniciais em vez de um indicador persistente no rodapé, evitando poluição visual.

### 3.4 Fluxo do Usuário

```
Início da sessão → modo verboso (padrão)
     │
     ├─ Todas as saídas de ferramentas, pensamentos, detalhes visíveis
     │
     ├─ Usuário pressiona Ctrl+O (ou alterna em Configurações)
     │     └─→ compactMode = true, persistido
     │         ├─ Grupos de ferramentas mostram resumo em linha única
     │         ├─ Conteúdo de pensamento/thought oculto
     │         └─ Confirmações, erros, shell ainda expandidos
     │
     ├─ Usuário pressiona Ctrl+O novamente
     │     └─→ compactMode = false, persistido
     │         └─ Todos os detalhes visíveis novamente
     │
     └─ Próxima sessão → mesmo modo da última sessão
```

## 4. Principais Diferenças em Detalhes

### 4.1 Filosofia do Modo Padrão

| Aspecto            | Claude Code (padrão compacto)           | Qwen Code (padrão verboso)                   |
| ------------------ | --------------------------------------- | -------------------------------------------- |
| Primeira impressão | Limpo, mínimo — sensação profissional   | Rico em informações — transparência total    |
| Curva de aprendizado | Usuário precisa aprender Ctrl+O para ver detalhes | Usuário pode ver tudo imediatamente |
| Público-alvo      | Usuários experientes que confiam na ferramenta | Usuários que querem entender o que está acontecendo |
| Sobrecarga de informações | Evitada por padrão               | Possível para novos usuários                |
| Descoberta        | Dicas "(ctrl+o to expand)" por ferramenta | Rotação de dicas iniciais + ? atalhos + /help |

**Análise:** O padrão compacto do Claude Code funciona porque sua base de usuários é geralmente composta por desenvolvedores experientes que confiam na ferramenta e não precisam ver cada invocação de ferramenta. O padrão verboso do Qwen Code é apropriado para seu estágio inicial, onde construir confiança do usuário através de transparência é importante.

### 4.2 Modelo de Persistência

| Aspecto         | Claude Code               | Qwen Code                  |
| --------------- | ------------------------- | -------------------------- |
| Persistido?     | Não — apenas na sessão    | Sim — em settings.json     |
| Justificativa   | Verboso é visão temporária | Modo é preferência do usuário |
| Comportamento ao reiniciar | Sempre inicia compacto | Inicia com o último modo usado |

**Análise:** O Claude Code trata a visualização de detalhes como uma necessidade momentânea — você olha e depois volta. O Qwen Code trata como uma preferência estável — alguns usuários sempre querem detalhes, outros sempre querem compacto. Ambas são válidas; a abordagem do Qwen Code é mais flexível.

### 4.3 Proteção de Confirmação

| Aspecto              | Claude Code                                 | Qwen Code                                            |
| -------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Mecanismo            | Camada de sobreposição/modal (estruturalmente separada) | Condições de força de expansão em `showCompact`   |
| Cobertura            | Completa — aprovações nunca podem ser ocultadas | Completa — 4 condições cobrem todos os estados interativos |
| UI de confirmação compacta | N/A (sobreposição é sempre completa)   | RadioButtonSelect simplificado com 3 opções          |

**Análise:** A separação arquitetural do Claude Code (camada de sobreposição) é mais robusta. A abordagem de força de expansão do Qwen Code é eficaz, mas exige que cada novo estado interativo seja explicitamente adicionado à lista de condições.

### 4.4 Abordagem de Renderização

| Aspecto   | Claude Code                         | Qwen Code                                  |
| --------- | ----------------------------------- | ------------------------------------------ |
| Escopo da alternância | Nível de tela (prompt ↔ transcript) | Nível de componente (cada componente decide) |
| Granularidade | Tudo ou nada                    | Granularidade fina por componente           |
| Flexibilidade | Baixa — alternância global       | Alta — componentes podem sobrescrever       |
| Consistência | Garantida                        | Depende da implementação de cada componente |

**Análise:** A abordagem em nível de componente do Qwen Code é mais flexível (por exemplo, força de expansão para condições específicas), mas exige mais disciplina para manter a consistência. A abordagem em nível de tela do Claude Code é mais simples e garante comportamento consistente.

## 5. Recomendações de Otimização

### 5.1 [P0] Manter Verboso como Padrão — Nenhuma Alteração Necessária

O padrão verboso do Qwen Code é a escolha certa para seu estágio atual. Usuários novos na ferramenta precisam de transparência para construir confiança. Conforme o produto amadurecer, considere tornar o compacto o padrão (como o Claude Code).

### 5.2 [P1] Expansão por Ferramenta para Saídas Grandes

O Claude Code mostra "(ctrl+o to expand)" em ferramentas individuais que produzem saída grande. O Qwen Code atualmente só tem uma alternância global. Considere:

- Quando uma única ferramenta produz saída excedendo N linhas, mostrar uma dica "expandir" por ferramenta no modo compacto.
- Escopo: melhoria futura, não prioridade atual.

### 5.3 [P2] Considerar Substituição com Escopo de Sessão

Alguns usuários podem querer o modo compacto como padrão, mas ocasionalmente precisar do verboso para uma sessão específica. Considere suportar ambos:

- `settings.json` → padrão persistente (comportamento atual)
- Ctrl+O durante a sessão → substituição temporária apenas para a sessão atual (comportamento do Claude Code)
- Ao reiniciar a sessão → reverter para o valor de settings.json

Isso dá aos usuários o melhor dos dois mundos. A implementação exigiria separar o estado de "padrão das configurações" do estado de "substituição da sessão".

### 5.4 [P2] Separação Estrutural para Confirmações

Atualmente, a proteção de confirmação depende das condições de `showCompact` em `ToolGroupMessage`. Considere uma abordagem mais robusta:

- Renderizar confirmações em uma camada separada (como a abordagem de sobreposição do Claude Code).
- Isso tornaria arquiteturalmente impossível para o modo compacto afetar confirmações.
- Prioridade menor, já que a abordagem atual de força de expansão funciona corretamente.

## 6. Situação Atual da Implementação

Após as alterações da branch `feat/compact-mode-optimization`:

| Funcionalidade                 | Status | Observações                                         |
| ------------------------------ | ------ | --------------------------------------------------- |
| Dica nas dicas iniciais        | Feito  | Dica do modo compacto na rotação de dicas (não intrusiva) |
| Ctrl+O nos atalhos de teclado (?) | Feito | Adicionado ao componente KeyboardShortcuts         |
| Ctrl+O no /help                | Feito  | Adicionado ao componente Help                       |
| Sincronização com diálogo de configurações | Feito | Sincroniza compactMode com CompactModeContext |
| Sem congelamento de snapshot   | Feito  | Alternância sempre mostra saída ao vivo             |
| Proteção de confirmação        | Feito  | Força de expansão + guarda WaitingForConfirmation   |
| Proteção de shell              | Feito  | Força de expansão `!isEmbeddedShellFocused`          |
| Proteção de erro               | Feito  | Força de expansão `!hasErrorTool`                    |
| Documentação do usuário atualizada | Feito | settings.md, keyboard-shortcuts.md                 |

## 7. Referência de Arquivos

### Qwen Code

| Arquivo                                                               | Finalidade                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/cli/src/ui/AppContainer.tsx`                                | Manipulador da alternância, inicialização de estado, provedor de contexto |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                 | Definição do contexto                                      |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`        | Lógica de força de expansão                                |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`             | Ocultação de saída por ferramenta                          |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Renderização da visualização compacta                      |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | UI de confirmação compacta                                 |
| `packages/cli/src/ui/components/MainContent.tsx`                      | Renderização de itens de histórico pendentes               |
| `packages/cli/src/ui/components/Tips.tsx`                             | Dica inicial com modo compacto                             |
| `packages/cli/src/ui/components/Help.tsx`                             | Entrada de atalho /help                                    |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`                | Entrada de atalho ?                                        |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                   | Sincronização de configurações                             |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Ocultação de conteúdo de pensamento                        |
| `packages/cli/src/config/settingsSchema.ts`                           | Definição da configuração                                  |
| `packages/cli/src/config/keyBindings.ts`                              | Atalho Ctrl+O                                              |

### Claude Code (Referência)

| Arquivo                                               | Finalidade                        |
| ----------------------------------------------------- | --------------------------------- |
| `src/hooks/useGlobalKeybindings.tsx`                  | Manipulador da alternância        |
| `src/state/AppStateStore.ts`                          | Definição de estado (verbose: false) |
| `src/components/CtrlOToExpand.tsx`                    | Dica de expansão por ferramenta   |
| `src/components/Messages.tsx`                         | Filtro de mensagens breves        |
| `src/screens/REPL.tsx`                                | Alternância de modo em nível de tela |
| `src/components/permissions/PermissionRequest.tsx`    | Confirmação baseada em sobreposição |