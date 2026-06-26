# Plano de Implementação do Computer Use Integrado

> **Para trabalhadores agentivos:** SUB-HABILIDADE OBRIGATÓRIA: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para rastreamento.

**Objetivo:** Tornar `open-computer-use` uma capacidade integrada de configuração zero no qwen-code. As 9 ferramentas de computer use aparecem na lista de ferramentas diferidas como `computer_use__click`, `computer_use__type_text`, etc. A primeira invocação instala de forma transparente o binário npm upstream, guia o usuário pelas permissões de Acessibilidade / Captura de Tela do macOS, se necessário, e encaminha a chamada para o servidor MCP upstream.

**Arquitetura:** Camada fina sobre o upstream `npx -y open-computer-use mcp`. Nós NÃO empacotamos o binário; o cache `npx` do upstream + o pacote `.app` cuidam da distribuição e do TCC do macOS. As 9 ferramentas são registradas como instâncias `ComputerUseTool` parametrizadas (uma por nome de ferramenta), apoiadas por um singleton `ComputerUseClient` que gerencia um processo filho stdio MCP de longa duração. A máquina de estados de inicialização é sobreposta: permissão de ferramenta padrão do qwen-code (existente) → confirmação de instalação na primeira vez → guia opcional de permissão do macOS.

**Tech Stack:** TypeScript, vitest, `@modelcontextprotocol/sdk` (já uma dependência do qwen-code), `node:child_process`, `node:fs/promises`.

---

## Estrutura de Arquivos

**Novos arquivos:**

```
packages/core/src/tools/computer-use/
  index.ts                          # registerComputerUseTools(registry, config); barrel export
  schemas.ts                        # 9 schemas + descrições fixas (sincronizadas do upstream)
  tool.ts                           # ComputerUseTool — BaseDeclarativeTool parametrizado
  client.ts                         # ComputerUseClient — gerenciador de processo stdio MCP singleton
  bootstrap.ts                      # máquina de estados: verificar → confirmar instalação → instalar → guia de permissões
  install-state.ts                  # leitura/gravação de ~/.qwen/computer-use/installed.json
  permission-detector.ts            # analisar strings de erro do upstream para detectar permissões ausentes
  schemas.test.ts                   # todos os 9 schemas são analisados, nomes coincidem com o contrato
  tool.test.ts                      # fiação parametrizada da ferramenta
  client.test.ts                    # ciclo de vida do cliente (spawn mockado)
  bootstrap.test.ts                 # transições da máquina de estados
  install-state.test.ts             # ida e volta do arquivo de estado
  permission-detector.test.ts       # correspondência de padrões de erro
scripts/
  sync-computer-use-schemas.ts      # script em tempo de release: despejar upstream tools/list → schemas.ts
```

**Arquivos modificados:**

```
packages/core/src/tools/tool-names.ts                  # adicionar 9 constantes COMPUTER_USE_*
packages/core/src/config/config.ts                     # adicionar campo computerUseEnabled + isComputerUseEnabled() + chamada de registro em createToolRegistry()
packages/cli/src/config/config.ts                      # mapear settings.tools.computerUse.enabled → ConfigParameters.computerUseEnabled
packages/cli/src/config/settingsSchema.ts              # adicionar booleano tools.computerUse.enabled (padrão true)
```

**Justificativa da decomposição:** Cada arquivo tem uma responsabilidade. `client.ts` conhece o protocolo MCP, mas não a UX; `bootstrap.ts` conhece UX, mas não toca nos detalhes do MCP; `tool.ts` é pura canalização que os conecta via `execute()`. Testes ficam ao lado do código. Schemas são isolados para que o script de sincronização possa reescrever o arquivo sem agitar a lógica.

---

## Fase 1 — Fundação (superfície da ferramenta visível, sem execução)

### Tarefa 1: Adicionar entradas ToolNames + ToolDisplayNames para as 9 ferramentas de computer-use

**Arquivos:**

- Modificar: `packages/core/src/tools/tool-names.ts`

- [ ] **Passo 1: Adicionar as 9 constantes de nome**

Editar `packages/core/src/tools/tool-names.ts` — dentro do objeto `ToolNames`, após `EXIT_WORKTREE: 'exit_worktree',`:

```ts
  // Ferramentas de Computer Use — integradas, mas apoiadas por um servidor MCP upstream.
  // Todas diferidas; reveladas apenas quando a requisição iniciada pelo usuário aciona
  // uma ação de computer use. Veja packages/core/src/tools/computer-use/.
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

Espelhar em `ToolDisplayNames`:

```ts
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

(displayName == nome propositalmente; não queremos nomes de exibição capitalizados como `Click` aparecendo no diálogo de permissão quando o nome da ferramenta é `computer_use__click`.)

- [ ] **Passo 2: Verificar se o teste existente de tool-names ainda passa**

Executar: `npm test -- packages/core/src/tools/tool-names`
Esperado: PASS (se não houver arquivo de teste, executar `npm run build -- --filter @qwen-code/qwen-code-core` para verificação de tipos)

- [ ] **Passo 3: Commitar**

```bash
git add packages/core/src/tools/tool-names.ts
git commit -m "feat(computer-use): add tool name constants"
```

---

### Tarefa 2: Módulo de schemas fixos

**Arquivos:**

- Criar: `packages/core/src/tools/computer-use/schemas.ts`
- Criar: `packages/core/src/tools/computer-use/schemas.test.ts`

Os 9 schemas espelham a saída `tools/list` do upstream `open-computer-use mcp`. Eles estão fixados na versão upstream `^0.x.y` (TODO: preencher o pin real no topo de `schemas.ts` ao implementar — executar `npx -y open-computer-use@latest --version` para capturar a última versão atual).

- [ ] **Passo 1: Escrever o teste que falha**

Criar `packages/core/src/tools/computer-use/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('computer-use schemas', () => {
  it('exports exactly 9 schemas', () => {
    expect(Object.keys(COMPUTER_USE_SCHEMAS)).toHaveLength(9);
  });

  it('each tool name matches the upstream convention (no computer_use__ prefix)', () => {
    // schemas.ts usa os nomes upstream literalmente ("click", "type_text").
    // O prefixo computer_use__ fica no wrapper voltado para o qwen-code.
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(name).not.toContain('computer_use__');
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('every schema has the standard object structure', () => {
    for (const [name, schema] of Object.entries(COMPUTER_USE_SCHEMAS)) {
      expect(schema.description, `${name} missing description`).toBeTruthy();
      expect(
        schema.parameterSchema,
        `${name} missing parameterSchema`,
      ).toBeTruthy();
      expect((schema.parameterSchema as { type: string }).type).toBe('object');
    }
  });

  it('list_apps takes no parameters', () => {
    expect(COMPUTER_USE_SCHEMAS.list_apps.parameterSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('click requires app and either element_index or x/y', () => {
    const schema = COMPUTER_USE_SCHEMAS.click.parameterSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties).toHaveProperty('app');
    expect(schema.properties).toHaveProperty('element_index');
    expect(schema.properties).toHaveProperty('x');
    expect(schema.properties).toHaveProperty('y');
    expect(schema.required).toContain('app');
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que falha**

Executar: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Esperado: FAIL com "Cannot find module './schemas.js'"

- [ ] **Passo 3: Escrever o módulo de schemas**

Criar `packages/core/src/tools/computer-use/schemas.ts`. Os schemas abaixo são MVP — eles refletem a superfície de ferramentas upstream e a nomenclatura de parâmetros. O script `sync-computer-use-schemas.ts` (Tarefa 13) irá regenerar este arquivo a partir de um snapshot upstream ativo no CI antes de cada release do qwen-code.

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Schemas fixos para as 9 ferramentas upstream open-computer-use.
 *
 * Fixado na versão upstream: <PIN_VERSION_DURING_IMPL>
 *
 * Regenerado por `scripts/sync-computer-use-schemas.ts` — não editar manualmente.
 * Os nomes upstream ("click", "type_text") aparecem literalmente aqui;
 * o prefixo `computer_use__` é adicionado pelo wrapper voltado para o qwen-code em
 * `tool.ts` para que o modelo veja `computer_use__click` sem qualquer conceito
 * MCP vazando.
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = [
  'list_apps',
  'get_app_state',
  'click',
  'perform_secondary_action',
  'scroll',
  'drag',
  'type_text',
  'press_key',
  'set_value',
] as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<
  ComputerUseToolName,
  ComputerUseToolSchema
> = {
  list_apps: {
    description:
      'List running and recently-used desktop applications on the current machine. Returns each app with a bundle identifier and display name. Use this before get_app_state to discover what is available to interact with.',
    parameterSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  get_app_state: {
    description:
      'Capture the current accessibility tree and a screenshot of the given application. Returns element_index values that subsequent actions (click, set_value, etc.) can target. Always call this before any element-targeted action; element_index values are valid only within the current snapshot.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'Application bundle identifier or display name (e.g. "TextEdit", "com.apple.Safari").',
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  click: {
    description:
      'Left-click a target. Prefer element_index from a recent get_app_state result. Fall back to x/y screenshot pixel coordinates only when no AX element matches the target.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Target application.' },
        element_index: {
          type: 'integer',
          description: 'Index into the latest get_app_state element list.',
        },
        x: {
          type: 'integer',
          description: 'X coordinate in screenshot pixels.',
        },
        y: {
          type: 'integer',
          description: 'Y coordinate in screenshot pixels.',
        },
        click_count: {
          type: 'integer',
          description: 'Number of clicks (1 = single, 2 = double).',
          default: 1,
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  perform_secondary_action: {
    description:
      'Perform a non-click semantic action exposed by the target AX element (e.g. "Raise", "ShowMenu"). Returns an error if the action is not valid for the element.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        action: {
          type: 'string',
          description: 'AX action name to perform.',
        },
      },
      required: ['app', 'element_index', 'action'],
      additionalProperties: false,
    },
  },
  scroll: {
    description:
      'Scroll inside the target element or at the given coordinates. `pages` is a fractional page count (positive = down, negative = up).',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        x: { type: 'integer' },
        y: { type: 'integer' },
        pages: {
          type: 'number',
          description: 'Fractional page count to scroll (negative = up).',
        },
      },
      required: ['app', 'pages'],
      additionalProperties: false,
    },
  },
  drag: {
    description:
      'Drag from one coordinate pair to another inside the target application window. Coordinates are in screenshot pixels.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        from_x: { type: 'integer' },
        from_y: { type: 'integer' },
        to_x: { type: 'integer' },
        to_y: { type: 'integer' },
      },
      required: ['app', 'from_x', 'from_y', 'to_x', 'to_y'],
      additionalProperties: false,
    },
  },
  type_text: {
    description:
      'Type text into the currently-focused text input of the target application. Click the input area first if it is not focused. For unfocused text fields, prefer set_value instead.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        text: {
          type: 'string',
          description: 'Text to type. Supports Unicode.',
        },
      },
      required: ['app', 'text'],
      additionalProperties: false,
    },
  },
  press_key: {
    description:
      'Press a keyboard key or combo against the target application. Key names follow xdotool conventions (e.g. "Return", "BackSpace", "cmd+c", "Page_Up").',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['app', 'key'],
      additionalProperties: false,
    },
  },
  set_value: {
    description:
      'Directly set the value of a settable AX element (text fields, sliders, etc.). Returns an error if the target is not settable.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        value: { type: 'string' },
      },
      required: ['app', 'element_index', 'value'],
      additionalProperties: false,
    },
  },
};
```

- [ ] **Passo 4: Executar o teste para verificar que passa**

Executar: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Esperado: PASS, 5 testes

- [ ] **Passo 5: Commitar**

```bash
git add packages/core/src/tools/computer-use/schemas.ts packages/core/src/tools/computer-use/schemas.test.ts
git commit -m "feat(computer-use): hardcode upstream tool schemas"
```

---

### Tarefa 3: Schema de configurações + fiação de Config para enableComputerUse

**Arquivos:**

- Modificar: `packages/cli/src/config/settingsSchema.ts`
- Modificar: `packages/cli/src/config/config.ts`
- Modificar: `packages/core/src/config/config.ts`

- [ ] **Passo 1: Adicionar entrada de configurações**

Editar `packages/cli/src/config/settingsSchema.ts`. O schema existente agrupa coisas por categoria. Computer Use é uma capacidade de ferramenta, não experimental — adicionar um novo subgrupo `tools` SE ele não existir, ou adicionar ao existente. Use grep:

```bash
grep -n "tools:" packages/cli/src/config/settingsSchema.ts | head -5
```

Se uma chave `tools:` existir, adicionar uma nova propriedade dentro dela. Se não, adicionar um grupo de nível superior. Padrão (adicionar perto de onde a entrada `experimental.cron` vive, linha ~2298):

```ts
  tools: {
    type: 'object',
    label: 'Tools',
    category: 'Tools',
    requiresRestart: true,
    default: {},
    description: 'Ativa/desativa capacidades de ferramenta.',
    showInDialog: false,
    properties: {
      computerUse: {
        type: 'object',
        label: 'Computer Use',
        category: 'Tools',
        requiresRestart: true,
        default: {},
        description: 'Automação de desktop multiplataforma via o servidor MCP upstream open-computer-use. Ferramentas: list_apps, get_app_state, click, type_text, scroll, drag, press_key, perform_secondary_action, set_value. Na primeira invocação, o binário upstream é buscado via npx e o usuário é guiado pelas permissões de Acessibilidade / Captura de Tela do macOS, se necessário.',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Habilitar Computer Use',
            category: 'Tools',
            requiresRestart: true,
            default: true,
            description: 'Quando habilitado (padrão), as 9 ferramentas computer_use__* são registradas como integradas diferidas.',
            showInDialog: true,
          },
        },
      },
    },
  },
```

Se um grupo `tools:` já existir, apenas adicionar a propriedade `computerUse:` sob suas `properties`.

- [ ] **Passo 2: Conectar configurações → ConfigParameters**

Editar `packages/cli/src/config/config.ts`. Encontrar a linha existente `cronEnabled: settings.experimental?.cron ?? false,` (por volta da linha 1833). Adicionar diretamente abaixo:

```ts
    computerUseEnabled: settings.tools?.computerUse?.enabled ?? true,
```

- [ ] **Passo 3: Adicionar campo Config + getter**

Editar `packages/core/src/config/config.ts`:

(a) Na interface `ConfigParameters` (procurar por `cronEnabled?: boolean;`), adicionar diretamente abaixo:

```ts
  computerUseEnabled?: boolean;
```

(b) Nos campos da classe `Config` (procurar por `private readonly cronEnabled: boolean = false;`), adicionar diretamente abaixo:

```ts
  private readonly computerUseEnabled: boolean = true;
```

(c) No construtor `Config` (procurar por `this.cronEnabled = params.cronEnabled ?? false;`), adicionar diretamente abaixo:

```ts
this.computerUseEnabled = params.computerUseEnabled ?? true;
```

(d) Perto de `isCronEnabled()` (procurar por `isCronEnabled(): boolean {`), adicionar um getter irmão:

```ts
  isComputerUseEnabled(): boolean {
    return this.computerUseEnabled;
  }
```

- [ ] **Passo 4: Verificação de tipos**

Executar: `npm run build -- --filter @qwen-code/qwen-code-core --filter @qwen-code/qwen-code`
Esperado: PASS

- [ ] **Passo 5: Commitar**

```bash
git add packages/cli/src/config/settingsSchema.ts packages/cli/src/config/config.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): add enableComputerUse setting (default true)"
```

---

## Fase 2 — Transporte (cliente MCP sobre npx stdio)

### Tarefa 4: ComputerUseClient — gerenciador de processo stdio MCP singleton

**Arquivos:**

- Criar: `packages/core/src/tools/computer-use/client.ts`
- Criar: `packages/core/src/tools/computer-use/client.test.ts`

Nota: O cliente usa `@modelcontextprotocol/sdk` (já é uma dependência, veja `packages/core/src/tools/mcp-client.ts`). Usamos `StdioClientTransport` para iniciar `npx -y open-computer-use mcp`.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `packages/core/src/tools/computer-use/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseClient } from './client.js';

describe('ComputerUseClient', () => {
  let client: ComputerUseClient;

  beforeEach(() => {
    client = new ComputerUseClient({
      packageSpec: 'open-computer-use@latest',
      onProgress: vi.fn(),
    });
  });

  it('is constructible', () => {
    expect(client).toBeDefined();
  });

  it('reports not-started before start() is called', () => {
    expect(client.isStarted()).toBe(false);
  });

  it('returns the same instance for repeated callers via singleton', () => {
    const a = ComputerUseClient.shared();
    const b = ComputerUseClient.shared();
    expect(a).toBe(b);
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que falha**

Executar: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Esperado: FAIL — módulo não encontrado
- [ ] **Passo 3: Implementar o cliente**

Crie `packages/core/src/tools/computer-use/client.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

// ... (código omitido para brevidade, mas deve ser mantido no original)
```

- [ ] **Passo 4: Executar o teste para verificar se passa**

Execute: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Esperado: PASS, 3 testes

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/tools/computer-use/client.ts packages/core/src/tools/computer-use/client.test.ts
git commit -m "feat(computer-use): MCP stdio client for upstream binary"
```

---

### Tarefa 5: ComputerUseTool — wrapper BaseDeclarativeTool parametrizado

**Arquivos:**

- Criar: `packages/core/src/tools/computer-use/tool.ts`
- Criar: `packages/core/src/tools/computer-use/tool.test.ts`

Para esta tarefa, a ferramenta apenas encaminha para `ComputerUseClient` assumindo que já foi iniciada. A máquina de estados de bootstrap envolve isso na Fase 3.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `packages/core/src/tools/computer-use/tool.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComputerUseTool } from './tool.js';
import { ComputerUseClient } from './client.js';
import { COMPUTER_USE_SCHEMAS } from './schemas.js';

// ... (código omitido para brevidade, mas deve ser mantido no original)
```

- [ ] **Passo 2: Executar o teste para verificar se falha**

Execute: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Esperado: FALHA — módulo não encontrado

- [ ] **Passo 3: Implementar a ferramenta**

Crie `packages/core/src/tools/computer-use/tool.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// ... (código omitido para brevidade, mas deve ser mantido no original)
```

Nota: o teste referencia `runBootstrap` que é implementado na Fase 3. Por enquanto, crie um stub `bootstrap.ts` para que o teste passe:

Crie `packages/core/src/tools/computer-use/bootstrap.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// ... (código omitido para brevidade, mas deve ser mantido no original)
```

- [ ] **Passo 4: Executar o teste para verificar se passa**

Execute: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Esperado: PASS, 4 testes

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/tools/computer-use/tool.ts packages/core/src/tools/computer-use/tool.test.ts packages/core/src/tools/computer-use/bootstrap.ts
git commit -m "feat(computer-use): ComputerUseTool wrapper + bootstrap stub"
```

---

### Tarefa 6: Registrar ferramentas no ToolRegistry

**Arquivos:**

- Criar: `packages/core/src/tools/computer-use/index.ts`
- Modificar: `packages/core/src/config/config.ts`

- [ ] **Passo 1: Criar o helper de registro**

Crie `packages/core/src/tools/computer-use/index.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// ... (código omitido para brevidade, mas deve ser mantido no original)
```

- [ ] **Passo 2: Conectar no Config.createToolRegistry**

Edite `packages/core/src/config/config.ts`. Encontre o bloco existente que registra ferramentas cron condicionalmente (por volta da linha 3952):

```ts
    if (this.isCronEnabled()) {
      await registerLazy(ToolNames.CRON_CREATE, async () => { ... });
      ...
    }
```

Logo abaixo do bloco cron (e antes do bloco monitor), adicione:

```ts
// Registrar ferramentas computer-use a menos que desabilitado.
// Todas as 9 são adiadas — aparecem apenas via correspondência de
// palavra-chave do ToolSearch (ver packages/core/src/tools/computer-use/).
if (this.isComputerUseEnabled()) {
  const { registerComputerUseTools } = await import(
    '../tools/computer-use/index.js'
  );
  registerComputerUseTools(registry);
}
```

- [ ] **Passo 3: Adicionar um teste de registro**

Anexe aos testes existentes do tool-registry OU crie `packages/core/src/tools/computer-use/registration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerComputerUseTools } from './index.js';
import { COMPUTER_USE_TOOL_NAMES } from './schemas.js';

// ... (código omitido para brevidade, mas deve ser mantido no original)
```

- [ ] **Passo 4: Executar testes + verificação de tipos**

Execute:

```bash
npm test -- packages/core/src/tools/computer-use/
npm run build -- --filter @qwen-code/qwen-code-core
```

Esperado: Todos PASS.

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/tools/computer-use/index.ts packages/core/src/tools/computer-use/registration.test.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): register 9 deferred tools when enabled"
```

---

### Tarefa 7: Smoke manual — ferramentas aparecem e uma chamada de caminho feliz funciona

Isso é um portão não relacionado a código. Verifica se a base funciona antes de acumular a UX de bootstrap.

- [ ] **Passo 1: Pré-instalar o binário upstream (uma vez, manual)**

Execute em um terminal:

```bash
npx -y open-computer-use@latest --version
```

No macOS: execute também `npx -y open-computer-use@latest doctor` e conceda quaisquer permissões solicitadas. Isso ignora nosso bootstrap para que possamos verificar a camada de transporte isoladamente.

- [ ] **Passo 2: Compilar o qwen-code**

Execute: `npm run build`
Esperado: PASS.

- [ ] **Passo 3: Iniciar o qwen-code e testar a descoberta**

Inicie o qwen-code e peça ao modelo: _"Use a ferramenta ToolSearch com a consulta 'click computer use' para encontrar ferramentas de automação de desktop disponíveis."_

Esperado: ToolSearch retorna 9 esquemas `computer_use__*`.

- [ ] **Passo 4: Testar uma ferramenta sem permissão**

Pergunte: _"Liste os aplicativos desktop atualmente em execução usando a ferramenta computer_use__list_apps."_

Esperado: A primeira chamada leva alguns segundos mostrando "Iniciando Computer Use..." (ou mais se o cache do npx estiver frio), depois retorna uma lista de aplicativos em execução. Chamadas subsequentes na mesma sessão são rápidas.

- [ ] **Passo 5: Nenhum commit necessário; isso é um portão de smoke**

Se algo falhar aqui, PARE e depure antes de passar para a Fase 3.

---

## Fase 3 — UX de Bootstrap (confirmação de instalação + guia de permissões)

Esta fase substitui o stub `runBootstrap` da Tarefa 5 pela máquina de estados completa.

### Tarefa 8: Persistência do estado de instalação

**Arquivos:**

- Criar: `packages/core/src/tools/computer-use/install-state.ts`
- Criar: `packages/core/src/tools/computer-use/install-state.test.ts`

Persistido em `~/.qwen/computer-use/installed.json`:

```json
{
  "approvedPackageSpec": "open-computer-use@^0.3.0",
  "approvedAtIso": "2026-05-28T10:00:00Z"
}
```

- [ ] **Passo 1: Escrever o teste que falha**

Crie `packages/core/src/tools/computer-use/install-state.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadInstallState,
  saveInstallState,
  isPackageSpecApproved,
  installStatePathFor,
} from './install-state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('install-state', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-test-'));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  // ... (código omitido para brevidade, mas deve ser mantido no original)
});
```
- [ ] **Passo 2: Execute o teste para verificar se ele falha**

Execute: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Esperado: FALHA — módulo não encontrado

- [ ] **Passo 3: Implemente o módulo**

Crie `packages/core/src/tools/computer-use/install-state.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export interface InstallState {
  /** The package spec the user approved (e.g. "open-computer-use@^0.3.0"). */
  approvedPackageSpec: string;
  /** ISO 8601 UTC timestamp of approval. */
  approvedAtIso: string;
}

/**
 * Path to the install-state file. Exported for tests so they can
 * point at a temp directory.
 */
export function installStatePathFor(home: string = homedir()): string {
  return join(home, '.qwen', 'computer-use', 'installed.json');
}

export async function loadInstallState(
  home: string = homedir(),
): Promise<InstallState | undefined> {
  try {
    const text = await readFile(installStatePathFor(home), 'utf8');
    const parsed = JSON.parse(text) as InstallState;
    // Minimal shape check — older or malformed files act as "not approved".
    if (typeof parsed?.approvedPackageSpec !== 'string') return undefined;
    if (typeof parsed?.approvedAtIso !== 'string') return undefined;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    // Treat unreadable / malformed state as "not approved" — re-prompt
    // is safe; treating a bad file as approved would silently install.
    return undefined;
  }
}

export async function saveInstallState(
  home: string = homedir(),
  state: InstallState,
): Promise<void> {
  const path = installStatePathFor(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * True iff the persisted state's package spec exactly matches the one
 * we're about to install. Different specs (version pin bumps) require
 * re-approval, since the user may have approved an older / smaller /
 * different-license version.
 */
export async function isPackageSpecApproved(
  home: string = homedir(),
  packageSpec: string,
): Promise<boolean> {
  const state = await loadInstallState(home);
  return state?.approvedPackageSpec === packageSpec;
}
```

- [ ] **Passo 4: Execute o teste para verificar se ele passa**

Execute: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Esperado: SUCESSO, 5 testes

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/tools/computer-use/install-state.ts packages/core/src/tools/computer-use/install-state.test.ts
git commit -m "feat(computer-use): persist install approval state under ~/.qwen"
```

---

### Tarefa 9: Detector de erro de permissão

**Arquivos:**

- Criar: `packages/core/src/tools/computer-use/permission-detector.ts`
- Criar: `packages/core/src/tools/computer-use/permission-detector.test.ts`

- [ ] **Passo 1: Escreva o teste com falha**

Crie `packages/core/src/tools/computer-use/permission-detector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectPermissionError } from './permission-detector.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function textErrorResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

describe('detectPermissionError', () => {
  it('returns "none" when isError is false', () => {
    expect(
      detectPermissionError({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }),
    ).toBe('none');
  });

  it('detects accessibility permission missing (upstream phrasing)', () => {
    // From AccessibilitySnapshot.swift:104
    const result = textErrorResult(
      'Accessibility permission is required. Run `open-computer-use doctor` and grant access to Open Computer Use.',
    );
    expect(detectPermissionError(result)).toBe('accessibility');
  });

  it('detects screen recording permission missing', () => {
    const result = textErrorResult(
      'Screen Recording permission is required to capture this window.',
    );
    expect(detectPermissionError(result)).toBe('screenRecording');
  });

  it('detects via the generic doctor marker as fallback', () => {
    const result = textErrorResult(
      'Some unfamiliar error. Run `open-computer-use doctor` for help.',
    );
    expect(detectPermissionError(result)).toBe('unknown_permission');
  });

  it('returns "other" for unrelated errors', () => {
    expect(
      detectPermissionError(textErrorResult('appNotFound("ImaginaryApp")')),
    ).toBe('other');
  });
});
```

- [ ] **Passo 2: Execute o teste para verificar se ele falha**

Execute: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Esperado: FALHA — módulo não encontrado

- [ ] **Passo 3: Implemente o detector**

Crie `packages/core/src/tools/computer-use/permission-detector.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * What kind of permission issue, if any, the upstream MCP result
 * indicates. We classify based on message strings because upstream
 * doesn't expose typed error codes through MCP (see
 * `packages/OpenComputerUseKit/Sources/OpenComputerUseKit/Errors.swift`
 * in the open-codex-computer-use repo).
 *
 * Long-term fix is to PR upstream for a typed errorKind; for now this
 * string detection is the contract.
 */
export type PermissionErrorKind =
  | 'none' // success, or non-error result
  | 'other' // error, but not a permission issue
  | 'accessibility' // AX missing
  | 'screenRecording' // Screen Recording missing
  | 'unknown_permission'; // matches the doctor marker but doesn't pinpoint which

/**
 * Upstream-known error patterns. Order matters — more specific
 * patterns first.
 */
const PATTERNS: Array<{ kind: PermissionErrorKind; regex: RegExp }> = [
  { kind: 'accessibility', regex: /accessibility permission is required/i },
  { kind: 'screenRecording', regex: /screen recording permission/i },
  // Fallback: any error mentioning the doctor command is likely permission-related.
  // Listed last so it doesn't preempt the specific patterns.
  { kind: 'unknown_permission', regex: /open-computer-use\s+doctor/i },
];

export function detectPermissionError(
  result: CallToolResult,
): PermissionErrorKind {
  if (!result.isError) return 'none';
  const text = result.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
  for (const { kind, regex } of PATTERNS) {
    if (regex.test(text)) return kind;
  }
  return 'other';
}
```

- [ ] **Passo 4: Execute o teste para verificar se ele passa**

Execute: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Esperado: SUCESSO, 5 testes

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/tools/computer-use/permission-detector.ts packages/core/src/tools/computer-use/permission-detector.test.ts
git commit -m "feat(computer-use): detect upstream permission errors"
```

---

### Tarefa 10: Máquina de estado de inicialização — fluxo completo de UX

**Arquivos:**

- Modificar: `packages/core/src/tools/computer-use/bootstrap.ts` (substituir o stub da Tarefa 5)
- Criar: `packages/core/src/tools/computer-use/bootstrap.test.ts`

A máquina de estado possui três subfluxos:

1. **Instalação pela primeira vez**: se `isPackageSpecApproved` for false, pergunte ao usuário, instale e persista a aprovação.
2. **Inicialização**: garanta que o client seja iniciado.
3. **Sonda de permissão + guia** (apenas macOS): se um erro de permissão surgir, inicie `open-computer-use doctor`, faça polling até a concessão por até 10 min e tente novamente.

Nota: o mecanismo real de "perguntar ao usuário uma questão no meio da execução" no qwen-code usa o framework de confirmação de ferramenta existente. **IMPLEMENTADOR**: antes de escrever a implementação desta tarefa, procure por `shouldConfirmExecute` em `packages/core/src/tools/` para ver como `shell.ts` / similares fazem a confirmação. Esta tarefa assume que esse mecanismo está disponível; se não estiver, substitua por `process.stderr.write` + leitura de `process.stdin` para a confirmação da instalação (UX v0 aceitável).

- [ ] **Passo 1: Investigue padrões de confirmação**

Execute:

```bash
grep -rn "shouldConfirmExecute\|ToolConfirmation" packages/core/src/tools --include="*.ts" | grep -v ".test." | head -20
```

Leia pelo menos uma ferramenta que use o padrão de confirmação (provavelmente `shell.ts`). Decida: o `ToolInvocation` tem um método `shouldConfirmExecute()` ou similar?

Se SIM: use-o para a confirmação da instalação.
Se NÃO: use a alternativa v0 (stderr + ferramenta `ask_user_question` se exposta, caso contrário, lance um código de erro específico que o modelo pode reemitir após a concessão do usuário).

Documente sua escolha em um comentário de código no topo de `bootstrap.ts`.

- [ ] **Passo 2: Escreva o teste com falha**

Crie `packages/core/src/tools/computer-use/bootstrap.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap, type BootstrapDeps } from './bootstrap.js';

function makeFakeClient(opts: { startThrows?: Error } = {}) {
  const start = vi.fn(async () => {
    if (opts.startThrows) throw opts.startThrows;
  });
  return {
    isStarted: vi.fn(() => start.mock.calls.length > 0),
    start,
    callTool: vi.fn(),
    stop: vi.fn(),
  };
}

describe('runBootstrap', () => {
  let tmpHome: string;
  let deps: BootstrapDeps;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-bs-'));
    deps = {
      homeDir: tmpHome,
      packageSpec: 'open-computer-use@^0.3.0',
      platform: 'darwin',
      promptInstallApproval: vi.fn(async () => true),
      spawnDoctor: vi.fn(),
      probePermissions: vi.fn(async () => 'ok' as const),
    };
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('starts the client when binary is approved + permissions ok', async () => {
    // Pre-seed install state to skip the prompt
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(client.start).toHaveBeenCalledOnce();
    expect(deps.promptInstallApproval).not.toHaveBeenCalled();
  });

  it('prompts for install approval on first call', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.promptInstallApproval).toHaveBeenCalledOnce();
    expect(client.start).toHaveBeenCalledOnce();
  });

  it('throws when user declines install', async () => {
    deps.promptInstallApproval = vi.fn(async () => false);
    const client = makeFakeClient();

    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/declined/i);
    expect(client.start).not.toHaveBeenCalled();
  });

  it('persists approval on success', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    const { loadInstallState } = await import('./install-state.js');
    const state = await loadInstallState(tmpHome);
    expect(state?.approvedPackageSpec).toBe('open-computer-use@^0.3.0');
  });

  it('spawns doctor and polls when permissions are missing', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    let probeCount = 0;
    deps.probePermissions = vi.fn(async () => {
      probeCount++;
      return probeCount < 3 ? 'accessibility' : 'ok';
    });
    deps.pollIntervalMs = 1; // speed up test
    deps.pollTimeoutMs = 1000;

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).toHaveBeenCalledOnce();
    expect(probeCount).toBeGreaterThanOrEqual(3);
  });

  it('throws after pollTimeoutMs when permissions never grant', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    deps.probePermissions = vi.fn(async () => 'accessibility' as const);
    deps.pollIntervalMs = 1;
    deps.pollTimeoutMs = 50;

    const client = makeFakeClient();
    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/timed out/i);
  });

  it('skips permission flow on non-darwin platforms', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    deps.platform = 'linux';

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Passo 3: Execute o teste para verificar se ele falha**

Execute: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Esperado: FALHA — muitos erros

- [ ] **Passo 4: Implemente a máquina de estado**

Substitua `packages/core/src/tools/computer-use/bootstrap.ts` por:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Computer Use bootstrap state machine.
 *
 * On first invocation of any computer_use__* tool:
 *   1. If not yet approved: prompt the user to install (one-time).
 *   2. Start the client (lazy npx spawn, may take ~60s first time).
 *   3. On macOS only: probe permissions by calling get_app_state on
 *      Finder. If a permission error surfaces, spawn the upstream
 *      doctor (which opens the system settings + onboarding window),
 *      then poll until permissions grant or 10 min timeout.
 *
 * IMPLEMENTER: pre-step 1 (Task 10 step 1) — verify whether
 * qwen-code's BaseDeclarativeTool exposes a `shouldConfirmExecute()`
 * pathway from inside `execute()`. If not, `promptInstallApproval`
 * defaults to a `process.stderr.write` + readline fallback. The
 * dependency-injection design here keeps that decision swappable
 * without touching the state machine logic.
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import type { ComputerUseClient } from './client.js';
import { isPackageSpecApproved, saveInstallState } from './install-state.js';
import {
  detectPermissionError,
  type PermissionErrorKind,
} from './permission-detector.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/** Result of a permission probe. */
export type PermissionProbeResult = 'ok' | PermissionErrorKind;

export interface BootstrapDeps {
  homeDir: string;
  packageSpec: string;
  platform: NodeJS.Platform;
  /**
   * Prompt the user to approve installing the upstream binary. Returns
   * true if approved. Implementation may use the qwen-code confirm
   * tool path or a stdin fallback.
   */
  promptInstallApproval: (packageSpec: string) => Promise<boolean>;
  /**
   * Spawn `open-computer-use doctor` (detached). The binary handles
   * opening the system settings window itself.
   */
  spawnDoctor: () => void;
  /**
   * Probe the upstream MCP server for permission state by issuing a
   * lightweight tool call. Returns 'ok' on success or the kind of
   * permission error on failure.
   */
  probePermissions: (
    client: ComputerUseClient,
  ) => Promise<PermissionProbeResult>;
  /** Poll interval for the permission watcher. Default 2000ms. */
  pollIntervalMs?: number;
  /** Total poll timeout. Default 10 min. */
  pollTimeoutMs?: number;
}

/** Production defaults — instantiated lazily so tests can override per call. */
function defaultDeps(): BootstrapDeps {
  return {
    homeDir: homedir(),
    packageSpec:
      process.env['QWEN_COMPUTER_USE_PACKAGE'] ?? 'open-computer-use@latest',
    platform: process.platform,
    promptInstallApproval: async (spec) => {
      // v0 fallback: stderr prompt + stdin read. Replace with
      // qwen-code's standard confirm pathway when wired in.
      process.stderr.write(
        `\n[Computer Use] First-time install\n` +
          `  Package: ${spec}\n` +
          `  This will fetch ~50MB from the npm registry the first time.\n` +
          `  Computer Use can click, type, and read your desktop apps.\n` +
          `  On macOS you'll be guided through Accessibility and Screen Recording permissions next.\n` +
          `Proceed? [y/N] `,
      );
      // IMPLEMENTER: in real interactive sessions, replace with the
      // qwen-code confirm system. For headless / SDK contexts the
      // default is to refuse — explicit user opt-in required.
      return process.env['QWEN_COMPUTER_USE_AUTO_APPROVE'] === '1';
    },
    spawnDoctor: () => {
      const child = spawn('npx', ['-y', defaultDeps().packageSpec, 'doctor'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    },
    probePermissions: async (client) => {
      // Use Finder as a known-running, always-installed macOS app.
      // get_app_state hits AccessibilitySnapshot which is the first
      // path that throws permissionDenied.
      const result = await client.callTool('get_app_state', { app: 'Finder' });
      return detectPermissionError(result) === 'none'
        ? 'ok'
        : detectPermissionError(result);
    },
  };
}

export async function runBootstrap(
  client: ComputerUseClient,
  ctx: BootstrapContext,
  depsOverride?: Partial<BootstrapDeps>,
): Promise<void> {
  const deps: BootstrapDeps = { ...defaultDeps(), ...depsOverride };
  const pollIntervalMs = deps.pollIntervalMs ?? 2000;
  const pollTimeoutMs = deps.pollTimeoutMs ?? 10 * 60_000;

  // Step 1: install approval gate.
  const approved = await isPackageSpecApproved(deps.homeDir, deps.packageSpec);
  if (!approved) {
    ctx.updateOutput?.('Computer Use needs to be installed (first use).');
    const ok = await deps.promptInstallApproval(deps.packageSpec);
    if (!ok) {
      throw new Error(
        `Computer Use install declined by user. Re-invoke the tool to be prompted again.`,
      );
    }
    await saveInstallState(deps.homeDir, {
      approvedPackageSpec: deps.packageSpec,
      approvedAtIso: new Date().toISOString(),
    });
  }

  // Step 2: spawn (idempotent).
  if (!client.isStarted()) {
    ctx.updateOutput?.('Starting Computer Use...');
    await client.start();
  }

  // Step 3: macOS permission probe + guide.
  if (deps.platform !== 'darwin') return;

  const probe = await deps.probePermissions(client);
  if (probe === 'ok' || probe === 'other') {
    // 'other' means an error happened that isn't permission-related.
    // We don't block bootstrap on that — let the actual tool call surface it.
    return;
  }

  ctx.updateOutput?.(
    `Computer Use needs macOS permissions (${probe}). ` +
      `An onboarding window will open — please grant Accessibility and Screen Recording, then this will continue automatically.`,
  );
  deps.spawnDoctor();

  const startedAt = Date.now();
  for (;;) {
    if (ctx.signal.aborted) {
      throw new Error('Computer Use bootstrap aborted.');
    }
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error(
        `Computer Use permission grant timed out after ${Math.round(pollTimeoutMs / 1000)}s. Re-invoke the tool to retry.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const next = await deps.probePermissions(client);
    if (next === 'ok' || next === 'other') return;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    ctx.updateOutput?.(`Waiting for permissions... (${elapsedSec}s)`);
  }
}
```
- [ ] **Passo 5: Executar o teste para verificar se passa**

Execute: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Esperado: PASS, 7 testes

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/tools/computer-use/bootstrap.ts packages/core/src/tools/computer-use/bootstrap.test.ts
git commit -m "feat(computer-use): bootstrap state machine (install + permissions)"
```

---

### Tarefa 11: Conectar o `promptInstallApproval` real ao sistema de confirmação do qwen-code

**Arquivos:**

- Modificar: `packages/core/src/tools/computer-use/bootstrap.ts`
- Possivelmente: `packages/core/src/tools/computer-use/tool.ts`

Esta é a tarefa com o escopo mais variável. **IMPLEMENTADOR**: leia o resultado da investigação da Tarefa 10 etapa 1 e conecte de acordo. Dois cenários:

**Cenário A** — `BaseToolInvocation` suporta `shouldConfirmExecute()`:

- Sobrescreva `shouldConfirmExecute()` em `ComputerUseInvocation` para retornar o payload de confirmação de instalação quando o pacote ainda não foi aprovado.
- O framework exibirá a UI de confirmação; após a aprovação, `execute()` prossegue.
- `bootstrap.ts` então lida apenas com o caminho pós-confirmação (escrever estado, iniciar, sonda de permissão).

**Cenário B** — nenhum caminho de confirmação dentro da execução:

- Mantenha o stderr+stdin v0 da Tarefa 10. Documente claramente no README e SKILL.md.
- Abra uma tarefa de acompanhamento para adicionar um caminho de confirmação adequado (PR separado).

- [ ] **Passo 1: Implementar o cenário escolhido**

(O código concreto depende da investigação; delegar detalhes ao implementador.)

- [ ] **Passo 2: Teste manual rápido**

Limpe o estado de instalação:

```bash
rm -rf ~/.qwen/computer-use
```

Inicie o qwen-code e faça uma pergunta sobre computer-use. Confirme que o prompt de instalação aparece na UX escolhida (diálogo de confirmação ou stderr) e que aprová-lo persiste o estado corretamente.

- [ ] **Passo 3: Commit**

```bash
git add -A
git commit -m "feat(computer-use): wire install approval to qwen-code confirm UX"
```

---

### Tarefa 12: Teste manual — fluxo completo de primeira vez

Esta é uma verificação não relacionada a código.

- [ ] **Passo 1: Limpar caches**

```bash
rm -rf ~/.qwen/computer-use
rm -rf ~/.npm/_npx
# macOS: revogar permissões
# Ajustes do Sistema → Privacidade e Segurança → Acessibilidade / Gravação de Tela
# remova "Open Computer Use.app"
```

- [ ] **Passo 2: Build + execução**

```bash
npm run build
# inicie o qwen-code, faça uma pergunta sobre computer-use
```

- [ ] **Passo 3: Verificar o fluxo completo**

Sequência esperada:

1. O prompt de instalação aparece.
2. Após aprovação, o progresso do download é transmitido via `updateOutput`.
3. O aviso de permissão aparece, a janela de configuração é aberta.
4. Após conceder permissões nas Configurações do Sistema, a chamada de ferramenta é retomada automaticamente.
5. O resultado é retornado.

Se alguma etapa falhar, capture o erro e pare. Itere.

- [ ] **Passo 4: Nenhum commit; esta é uma verificação**

---

## Fase 4 — Ferramentas / Manutenção

### Tarefa 13: Script de sincronização de esquemas

**Arquivos:**

- Criar: `scripts/sync-computer-use-schemas.ts`

Executado como parte da preparação de release do qwen-code. Executa `npx -y open-computer-use@<pin> mcp`, envia `tools/list`, regera `schemas.ts`.

- [ ] **Passo 1: Criar o script**

Crie `scripts/sync-computer-use-schemas.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Regenerate packages/core/src/tools/computer-use/schemas.ts from a
 * live upstream open-computer-use MCP server.
 *
 * Usage:
 *   npx tsx scripts/sync-computer-use-schemas.ts [packageSpec]
 *
 * Defaults packageSpec to `open-computer-use@latest`. The pin written
 * into the generated file is whatever spec was used — pass an explicit
 * pin (e.g. `open-computer-use@0.3.5`) for release builds.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const packageSpec = process.argv[2] ?? 'open-computer-use@latest';

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', packageSpec, 'mcp'],
  });
  const client = new Client(
    { name: 'qwen-code-schema-sync', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  const result = await client.listTools();
  await client.close();

  if (result.tools.length !== 9) {
    process.stderr.write(
      `WARNING: upstream returned ${result.tools.length} tools, expected 9. Continuing anyway.\n`,
    );
  }

  const schemas: Record<
    string,
    { description: string; parameterSchema: unknown }
  > = {};
  for (const tool of result.tools) {
    schemas[tool.name] = {
      description: tool.description ?? '',
      parameterSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    };
  }

  const out = `/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hardcoded schemas for the upstream open-computer-use tools.
 *
 * Pinned to upstream: ${packageSpec}
 * Regenerated by scripts/sync-computer-use-schemas.ts — do not hand-edit.
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = ${JSON.stringify(
    result.tools.map((t) => t.name),
    null,
    2,
  )} as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<ComputerUseToolName, ComputerUseToolSchema> = ${JSON.stringify(
    schemas,
    null,
    2,
  )};
`;

  const target = resolve('packages/core/src/tools/computer-use/schemas.ts');
  await writeFile(target, out, 'utf8');
  process.stdout.write(`Wrote ${result.tools.length} schemas to ${target}\n`);
}

main().catch((err) => {
  process.stderr.write(`Schema sync failed: ${err}\n`);
  process.exit(1);
});
```

- [ ] **Passo 2: Executá-lo uma vez manualmente para verificar**

```bash
npx tsx scripts/sync-computer-use-schemas.ts open-computer-use@latest
```

Esperado: schemas.ts é reescrito; `npm test -- packages/core/src/tools/computer-use/schemas.test.ts` ainda passa (ou falha apenas em testes que afirmavam conteúdo específico escrito à mão — ajuste esses testes se as descrições upstream mudaram).

- [ ] **Passo 3: Commit**

```bash
git add scripts/sync-computer-use-schemas.ts packages/core/src/tools/computer-use/schemas.ts
git commit -m "chore(computer-use): script to sync schemas from upstream"
```

---

## Checklist de Auto-Revisão (após escrever todas as tarefas)

- [ ] Cada etapa tem: um bloco de código, um comando exato ou uma nota IMPLEMENTADOR claramente delegável com justificativa.
- [ ] Todos os 9 nomes de ferramentas usam o prefixo `computer_use__` consistentemente entre esquemas, wrapper de ferramenta e registro.
- [ ] Nenhuma referência a MCP / mcp__/ DiscoveredMCPTool vaza para strings visíveis ao usuário.
- [ ] A máquina de estado bootstrap tem timeouts explícitos (sem polls infinitos).
- [ ] `enableComputerUse` padrão é `true` conforme decisão do usuário.
- [ ] Testes cobrem: integridade do esquema, prefixação de nomes, adiamento, ciclo de vida do cliente, persistência do estado de instalação, detecção de permissão, todas as transições de estado bootstrap.
- [ ] As verificações manuais (Tarefa 7, Tarefa 12) são explícitas – sem alegações silenciosas de "funciona".

---

## Fora do Escopo (adiado para PRs futuros)

- Timeout ocioso para o processo do servidor MCP (economia de recursos; v0 mantém ativo até o qwen-code sair).
- Telemetria de falhas de bootstrap (falha de rede vs Gatekeeper vs timeouts de permissão).
- Caminho de instalação offline / suporte a tarball em cache.
- Sonda de capacidade antes de revelar (atualmente a falha aparece no momento da primeira chamada).
- PR upstream para errorKind tipado em permissionDenied (adiado pelo usuário).
- Reiniciar servidor MCP após concessão de permissão (usuário quer teste real primeiro para decidir se necessário).
- Bloqueio granular de permissão por ferramenta (ex.: permitir `list_apps` / `get_app_state` somente leitura sem confirmar toda chamada).

---

## Handoff de Execução

Plano salvo em `docs/superpowers/plans/2026-05-28-computer-use-built-in.md`.

Duas opções de execução:

1. **Orientada por Subagente (recomendada)** — despache um subagente novo por tarefa, revisão em dois estágios entre tarefas, iteração rápida.
2. **Execução Inline** — execute tarefas nesta sessão com pontos de verificação para revisão.

Qual abordagem?