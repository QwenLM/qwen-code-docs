# Status de Implementação da Sugestão de Prompt

> Rastreia o status de implementação do recurso de sugestão de prompt (NES) em todos os pacotes.

## Módulo Principal (`packages/core/src/followup/`)

| Component                | Status  | Lines | Description                                                   |
| ------------------------ | ------- | ----- | ------------------------------------------------------------- |
| `followupState.ts`       | ✅ Done | ~230  | Controlador independente de framework com timer/debounce      |
| `suggestionGenerator.ts` | ✅ Done | ~260  | Geração via LLM + 12 regras de filtro + suporte a forked query|
| `forkedQuery.ts`         | ✅ Done | ~240  | CacheSafeParams + createForkedChat + runForkedQuery           |
| `overlayFs.ts`           | ✅ Done | ~140  | Sistema de arquivos overlay com copy-on-write                 |
| `speculationToolGate.ts` | ✅ Done | ~150  | Aplicação de limites de ferramentas com parser AST de shell   |
| `speculation.ts`         | ✅ Done | ~540  | Motor de speculation com sugestão em pipeline + substituição de modelo |

## Integração com CLI (`packages/cli/`)

| Component                    | Status  | Description                                                |
| ---------------------------- | ------- | ---------------------------------------------------------- |
| `AppContainer.tsx`           | ✅ Done | Geração de sugestões, ciclo de vida da speculation, renderização de UI |
| `InputPrompt.tsx`            | ✅ Done | Aceitação via Tab/Enter/Seta Direita, dispensar + abortar  |
| `Composer.tsx`               | ✅ Done | Passagem de props                                          |
| `UIStateContext.tsx`         | ✅ Done | promptSuggestion + dismissPromptSuggestion                 |
| `useFollowupSuggestions.tsx` | ✅ Done | React hook com telemetria + rastreamento de teclas         |
| `settingsSchema.ts`          | ✅ Done | 3 feature flags + configuração fastModel                   |
| `settings.schema.json`       | ✅ Done | Schema de configurações do VSCode                          |

## Integração com WebUI (`packages/webui/`)

| Component                   | Status  | Description                                 |
| --------------------------- | ------- | ------------------------------------------- |
| `InputForm.tsx`             | ✅ Done | Tab/Enter/Seta Direita + submit com explicitText |
| `useFollowupSuggestions.ts` | ✅ Done | React hook com suporte a onOutcome          |
| `followup.ts`               | ✅ Done | Ponto de entrada de subpath                 |
| `components.css`            | ✅ Done | Estilização de ghost text                   |
| `vite.config.followup.ts`   | ✅ Done | Configuração de build separada              |

## Telemetria (`packages/core/src/telemetry/`)

| Component               | Status  | Description          |
| ----------------------- | ------- | -------------------- |
| `PromptSuggestionEvent` | ✅ Done | 10 campos            |
| `SpeculationEvent`      | ✅ Done | 7 campos             |
| `logPromptSuggestion()` | ✅ Done | Logger OpenTelemetry |
| `logSpeculation()`      | ✅ Done | Logger OpenTelemetry |

## Cobertura de Testes

| Test File                     | Tests | Description                                                     |
| ----------------------------- | ----- | --------------------------------------------------------------- |
| `followupState.test.ts`       | 14    | Timer do controller, debounce, callback de aceitação, onOutcome, clear |
| `suggestionGenerator.test.ts` | 16    | Todas as 12 regras de filtro + edge cases + falsos positivos    |
| `overlayFs.test.ts`           | 15    | Escrita COW, resolução de leitura, apply, cleanup, path traversal |
| `speculationToolGate.test.ts` | 27    | Categorias de ferramentas, modo de aprovação, AST de shell, reescrita de path |
| `forkedQuery.test.ts`         | 6     | Save/get/clear de parâmetros de cache, deep clone, detecção de versão |
| `speculation.test.ts`         | 7     | Edge cases do ensureToolResultPairing                           |
| `smoke.test.ts`               | 21    | E2E cross-module: filter + overlay + toolGate + cache + pairing |
| `InputPrompt.test.tsx`        | 4     | Tab, Enter+submit, Seta Direita, completion guard               |

## Histórico de Auditoria

| Round           | Issues Found | Issues Fixed                                             |
| --------------- | ------------ | -------------------------------------------------------- |
| R1-R4           | 10           | 10 (rule engine → LLM, simplificação de estado)          |
| R5-R6           | 2            | 2 (conflito de keybinding do Enter, telemetria da Seta Direita) |
| R7-R8           | 3            | 3 (telemetria WebUI, dead type, cobertura de testes)     |
| R9              | 0            | — (convergência)                                         |
| R10-R11         | 1            | 1 (dependência do historyManager)                        |
| R12-R13         | 1            | 1 (word boundaries em regex avaliativa)                  |
| Phase 1+2 R1-R4 | 20+          | 20+ (bypass de permissão, segurança do overlay, race conditions) |
| **Total**       | **37+**      | **37+**                                                  |

## Alinhamento com Claude Code

| Feature                          | Alignment | Notes                                 |
| -------------------------------- | --------- | ------------------------------------- |
| Prompt text                      | 100%      | Idêntico (apenas nome da marca)       |
| 12 filter rules                  | 100%+     | Melhoria nos word boundaries \b       |
| UI interaction (Tab/Enter/Right) | 100%      |                                       |
| Guard conditions                 | 100%      | 13 verificações                       |
| Telemetry                        | 100%      | 10+7 campos                           |
| Cache sharing                    | ✅        | DashScope cache_control               |
| Speculation                      | ✅        | Overlay COW + tool gating             |
| Pipelined suggestion             | ✅        | Gerada após a conclusão da speculation|
| State management                 | 100%+     | Padrão controller, Object.freeze      |