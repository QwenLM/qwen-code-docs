# Status de Implementação da Prompt Suggestion

> Acompanha o status de implementação da funcionalidade de prompt suggestion (NES) em todos os pacotes.

## Módulo Principal (`packages/core/src/followup/`)

| Componente                    | Status  | Linhas | Descrição                                                      |
| ----------------------------- | ------- | ------ | -------------------------------------------------------------- |
| `followupState.ts`            | ✅ Feito | ~230   | Controlador independente de framework com timer/debounce        |
| `suggestionGenerator.ts`      | ✅ Feito | ~260   | Geração LLM + 12 regras de filtro + suporte a consultas bifurcadas |
| `forkedQuery.ts`              | ✅ Feito | ~240   | CacheSafeParams + createForkedChat + runForkedQuery            |
| `overlayFs.ts`                | ✅ Feito | ~140   | Sistema de arquivos overlay copy-on-write                      |
| `speculationToolGate.ts`      | ✅ Feito | ~150   | Imposição de limites de ferramenta com analisador de shell AST |
| `speculation.ts`              | ✅ Feito | ~540   | Motor de especulação com sugestão em pipeline + substituição de modelo |

## Integração CLI (`packages/cli/`)

| Componente                       | Status  | Descrição                                                      |
| -------------------------------- | ------- | -------------------------------------------------------------- |
| `AppContainer.tsx`               | ✅ Feito | Geração de sugestão, ciclo de vida da especulação, renderização da UI |
| `InputPrompt.tsx`                | ✅ Feito | Aceitação via Tab/Enter/Seta Direita, descarte + abortar       |
| `Composer.tsx`                   | ✅ Feito | Encadeamento de props                                          |
| `UIStateContext.tsx`             | ✅ Feito | promptSuggestion + dismissPromptSuggestion                     |
| `useFollowupSuggestions.tsx`     | ✅ Feito | Hook React com telemetria + rastreamento de pressionamento de teclas |
| `settingsSchema.ts`              | ✅ Feito | 3 flags de funcionalidade + configuração fastModel             |
| `settings.schema.json`           | ✅ Feito | Esquema de configurações do VSCode                             |

## Integração WebUI (`packages/webui/`)

| Componente                      | Status  | Descrição                                                      |
| ------------------------------- | ------- | -------------------------------------------------------------- |
| `InputForm.tsx`                 | ✅ Feito | Tab/Enter/Seta Direita + envio explicitText                    |
| `useFollowupSuggestions.ts`     | ✅ Feito | Hook React com suporte a onOutcome                             |
| `followup.ts`                   | ✅ Feito | Entrada de subcaminho                                          |
| `components.css`                | ✅ Feito | Estilização de texto fantasma                                  |
| `vite.config.followup.ts`       | ✅ Feito | Configuração de build separada                                 |

## Telemetria (`packages/core/src/telemetry/`)

| Componente                | Status  | Descrição           |
| ------------------------- | ------- | ------------------- |
| `PromptSuggestionEvent`   | ✅ Feito | 10 campos           |
| `SpeculationEvent`        | ✅ Feito | 7 campos            |
| `logPromptSuggestion()`   | ✅ Feito | Logger OpenTelemetry |
| `logSpeculation()`        | ✅ Feito | Logger OpenTelemetry |

## Cobertura de Testes

| Arquivo de Teste                 | Testes | Descrição                                                     |
| -------------------------------- | ------ | ------------------------------------------------------------- |
| `followupState.test.ts`          | 14     | Timer do controlador, debounce, callback de aceitação, onOutcome, limpeza |
| `suggestionGenerator.test.ts`    | 16     | Todas as 12 regras de filtro + casos extremos + falsos positivos |
| `overlayFs.test.ts`              | 15     | Escrita COW, resolução de leitura, aplicação, limpeza, travessia de caminho |
| `speculationToolGate.test.ts`    | 27     | Categorias de ferramenta, modo de aprovação, shell AST, reescrita de caminho |
| `forkedQuery.test.ts`            | 6      | Parâmetros de cache save/get/clear, deep clone, detecção de versão |
| `speculation.test.ts`            | 7      | Casos extremos do ensureToolResultPairing                     |
| `smoke.test.ts`                  | 21     | E2E entre módulos: filtro + overlay + toolGate + cache + pareamento |
| `InputPrompt.test.tsx`           | 4      | Tab, Enter+enviar, Seta Direita, proteção de conclusão       |

## Histórico de Auditoria

| Rodada          | Problemas Encontrados | Problemas Corrigidos                                |
| --------------- | --------------------- | --------------------------------------------------- |
| R1-R4           | 10                    | 10 (rule engine → LLM, simplificação de estado)     |
| R5-R6           | 2                     | 2 (conflito de keybinding Enter, telemetria Seta Direita) |
| R7-R8           | 3                     | 3 (telemetria WebUI, tipo morto, cobertura de testes) |
| R9              | 0                     | — (convergência)                                     |
| R10-R11         | 1                     | 1 (dep do historyManager)                            |
| R12-R13         | 1                     | 1 (limites de palavra regex avaliativos)             |
| Fase 1+2 R1-R4  | 20+                   | 20+ (bypass de permissão, segurança overlay, condições de corrida) |
| **Total**       | **37+**               | **37+**                                              |

## Alinhamento com Claude Code

| Funcionalidade                   | Alinhamento | Notas                                    |
| -------------------------------- | ----------- | ---------------------------------------- |
| Texto do prompt                  | 100%        | Idêntico (apenas nome da marca)          |
| 12 regras de filtro              | 100%+       | Melhoria nos limites de palavras \b      |
| Interação UI (Tab/Enter/Seta)    | 100%        |                                          |
| Condições de guarda              | 100%        | 13 verificações                          |
| Telemetria                       | 100%        | 10+7 campos                              |
| Compartilhamento de cache        | ✅          | DashScope cache_control                  |
| Especulação                      | ✅          | Overlay COW + controle de ferramentas    |
| Sugestão em pipeline             | ✅          | Gerado após a especulação ser concluída  |
| Gerenciamento de estado          | 100%+       | Padrão controller, Object.freeze         |