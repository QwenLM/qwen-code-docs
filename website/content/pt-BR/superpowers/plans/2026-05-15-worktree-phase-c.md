# Plano de Implementação da Fase C do Worktree

> **Para workers agentivos:** HABILIDADE SECUNDÁRIA OBRIGATÓRIA: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para rastreamento.

**Objetivo:** Adicionar persistência de sessão, inicialização de hooksPath, exibição de status no Footer e diálogo de saída ao worktree, permitindo que ele seja restaurado após `--resume` e que o usuário saiba sempre em qual ambiente isolado está.

**Arquitetura:** Novo arquivo sidecar `WorktreeSession` em JSON (coexistindo com o arquivo de sessão JSONL), gravado pelo `EnterWorktree` e limpo pelo `ExitWorktree`; a camada CLI observa mudanças no arquivo via hook `useWorktreeSession` e sincroniza com `UIState.activeWorktree`; o Footer lê esse campo e renderiza a linha do worktree; o `WorktreeExitDialog` intercepta um segundo Ctrl+C quando um worktree ativo for detectado.

**Stack Tecnológica:** TypeScript, React (Ink), Node.js `fs.watch`, `simple-git`, Vitest

---

## Estrutura de Arquivos

| Operação | Arquivo                                                       | Descrição                                                                 |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Novo     | `packages/core/src/services/worktreeSessionService.ts`       | Interface WorktreeSession + funções de leitura/escrita/limpeza            |
| Novo     | `packages/core/src/services/worktreeSessionService.test.ts`  | Testes unitários                                                          |
| Modificar| `packages/core/src/services/sessionService.ts`               | Novo método público `getWorktreeSessionPath()`                            |
| Modificar| `packages/core/src/services/gitWorktreeService.ts`           | Configuração de `core.hooksPath` após `createUserWorktree()` / `createAgentWorktree()` |
| Modificar| `packages/core/src/services/gitWorktreeService.test.ts`      | Testes de hooksPath                                                       |
| Modificar| `packages/core/src/tools/enter-worktree.ts`                  | Grava WorktreeSession após criação do worktree                            |
| Modificar| `packages/core/src/tools/enter-worktree.test.ts`             | Teste de gravação da sessão                                               |
| Modificar| `packages/core/src/tools/exit-worktree.ts`                   | Limpa WorktreeSession após saída do worktree                              |
| Modificar| `packages/core/src/tools/exit-worktree.test.ts`              | Teste de limpeza da sessão                                                |
| Novo     | `packages/cli/src/ui/hooks/useWorktreeSession.ts`            | Observa o arquivo sidecar e retorna o WorktreeSession atual               |
| Modificar| `packages/cli/src/ui/contexts/UIStateContext.tsx`            | Novo campo `activeWorktree`                                               |
| Modificar| `packages/cli/src/ui/AppContainer.tsx`                       | Sincroniza `activeWorktree`, injeta contexto de resume, intercepta saída  |
| Modificar| `packages/cli/src/ui/hooks/useStatusLine.ts`                 | `StatusLineCommandInput` com novo campo `worktree`                        |
| Modificar| `packages/cli/src/ui/components/Footer.tsx`                  | Exibição da linha do worktree                                             |
| Novo     | `packages/cli/src/ui/components/WorktreeExitDialog.tsx`      | Diálogo de confirmação de saída                                           |
| Novo     | `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx` | Teste do componente                                                       |
| Modificar| `packages/cli/src/ui/components/DialogManager.tsx`           | Registro do WorktreeExitDialog                                            |

---

## Tarefa 1: Armazenamento Sidecar do WorktreeSession

**Arquivos:**

- Criar: `packages/core/src/services/worktreeSessionService.ts`
- Criar: `packages/core/src/services/worktreeSessionService.test.ts`
- Modificar: `packages/core/src/services/sessionService.ts`

- [ ] **Passo 1: Criar `worktreeSessionService.ts`**

```typescript
// packages/core/src/services/worktreeSessionService.ts
import * as fs from 'node:fs/promises';
import { isNodeError } from '../utils/errors.js';

export interface WorktreeSession {
  slug: string;
  worktreePath: string;
  worktreeBranch: string;
  originalCwd: string;
  originalBranch: string;
  /** SHA do commit HEAD no momento da criação do worktree. Usado pelo WorktreeExitDialog para contar novos commits. */
  originalHeadCommit: string;
}

export async function readWorktreeSession(
  filePath: string,
): Promise<WorktreeSession | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as WorktreeSession;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(require('node:path').dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

export async function clearWorktreeSession(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
}
```

- [ ] **Passo 2: Escrever testes que falham**

```typescript
// packages/core/src/services/worktreeSessionService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './worktreeSessionService.js';

const sample: WorktreeSession = {
  slug: 'my-feature',
  worktreePath: '/repo/.qwen/worktrees/my-feature',
  worktreeBranch: 'worktree-my-feature',
  originalCwd: '/repo',
  originalBranch: 'main',
};

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-session-test-'));
  filePath = path.join(tmpDir, 'test.worktree.json');
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('readWorktreeSession', () => {
  it('retorna null quando o arquivo não existe', async () => {
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('lê o que foi escrito', async () => {
    await fs.writeFile(filePath, JSON.stringify(sample), 'utf-8');
    expect(await readWorktreeSession(filePath)).toEqual(sample);
  });
});

describe('writeWorktreeSession', () => {
  it('escreve um arquivo JSON legível', async () => {
    await writeWorktreeSession(filePath, sample);
    const raw = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(sample);
  });

  it('sobrescreve arquivo existente', async () => {
    await writeWorktreeSession(filePath, sample);
    const updated = { ...sample, slug: 'updated' };
    await writeWorktreeSession(filePath, updated);
    expect(await readWorktreeSession(filePath)).toEqual(updated);
  });
});

describe('clearWorktreeSession', () => {
  it('exclui o arquivo', async () => {
    await writeWorktreeSession(filePath, sample);
    await clearWorktreeSession(filePath);
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('não faz nada quando o arquivo não existe', async () => {
    await expect(clearWorktreeSession(filePath)).resolves.not.toThrow();
  });
});
```

- [ ] **Passo 3: Executar testes para confirmar falha**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Esperado: `FAIL` — módulo não existe.

- [ ] **Passo 4: Corrigir a chamada `require` em `writeWorktreeSession`**

Em `worktreeSessionService.ts`, usamos `path.dirname`, então é necessário importar `node:path` no topo do arquivo:

```typescript
// Substituir "require('node:path').dirname(filePath)" pela importação correta
import * as path from 'node:path';

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}
```

- [ ] **Passo 5: Executar testes para confirmar aprovação**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Esperado: `PASS` — 6 testes passaram.

- [ ] **Passo 6: Adicionar `getWorktreeSessionPath()` no `SessionService`**

Em `packages/core/src/services/sessionService.ts`, localizar o método `private getChatsDir()` (aproximadamente linha 180) e, logo após, adicionar:

```typescript
getWorktreeSessionPath(sessionId: string): string {
  return path.join(this.getChatsDir(), `${sessionId}.worktree.json`);
}
```

- [ ] **Passo 7: Verificação de tipos**

```bash
cd packages/core
npm run typecheck
```

Esperado: nenhum erro.

- [ ] **Passo 8: Commit**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/services/worktreeSessionService.test.ts \
        packages/core/src/services/sessionService.ts
git commit -m "feat(worktree): add WorktreeSession sidecar storage"
```

---

## Tarefa 2: Configuração de hooksPath pós-criação

**Arquivos:**

- Modificar: `packages/core/src/services/gitWorktreeService.ts:1133-1158` (`createUserWorktree`)
- Modificar: `packages/core/src/services/gitWorktreeService.test.ts`

- [ ] **Passo 1: Escrever teste que falha**

No arquivo `gitWorktreeService.test.ts`, localizar o grupo de testes `createUserWorktree` e adicionar:

```typescript
it('configura core.hooksPath para o repositório principal após a criação', async () => {
  const result = await service.createUserWorktree('hooks-test');
  expect(result.success).toBe(true);

  const worktreePath = result.worktree!.path;
  const worktreeGit = simpleGit(worktreePath);
  const hooksPath = await worktreeGit.raw([
    'config',
    '--local',
    'core.hooksPath',
  ]);
  // Deve apontar para .git/hooks do repositório principal
  expect(hooksPath.trim()).toContain('.git/hooks');
});
```

- [ ] **Passo 2: Executar teste para confirmar falha**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configura core.hooksPath"
```

Esperado: `FAIL` — hooksPath está vazio.

- [ ] **Passo 3: Adicionar configuração de hooksPath em `createUserWorktree`**

Em `gitWorktreeService.ts`, localizar a chamada `git worktree add` dentro de `createUserWorktree` (aproximadamente linha 1140) e, antes de `return { success: true, worktree }`, adicionar:

```typescript
// Configurar hooksPath para que commits dentro deste worktree executem
// os hooks do repositório principal. Prioridade: .husky/ (comum) → .git/hooks (fallback).
// Espelha a lógica de performPostCreationSetup() do claude-code.
try {
  const huskyPath = path.join(this.sourceRepoPath, '.husky');
  const gitHooksPath = path.join(this.sourceRepoPath, '.git', 'hooks');
  let hooksPath: string | null = null;
  for (const candidate of [huskyPath, gitHooksPath]) {
    try {
      await fs.stat(candidate);
      hooksPath = candidate;
      break;
    } catch {
      // Não encontrado — tentar próximo.
    }
  }
  if (hooksPath) {
    const worktreeGit = simpleGit(worktreePath);
    // Pular o subprocesso se core.hooksPath já estiver definido com o mesmo valor
    // (~14ms de overhead de spawn, conforme comentário do claude-code sobre parseGitConfigValue).
    let existing = '';
    try {
      existing = (
        await worktreeGit.raw(['config', '--local', 'core.hooksPath'])
      ).trim();
    } catch {
      // Chave não definida — string vazia significa "prosseguir".
    }
    if (existing !== hooksPath) {
      await worktreeGit.raw(['config', 'core.hooksPath', hooksPath]);
    }
  }
} catch (hookError) {
  debugLogger.warn(
    `createUserWorktree: falha ao definir core.hooksPath: ${hookError}`,
  );
  // Não fatal: worktree é utilizável, apenas sem hooks herdados.
}
```

`this.sourceRepoPath` é um campo privado atribuído no construtor do `GitWorktreeService` (`this.sourceRepoPath = path.resolve(sourceRepoPath)`, aproximadamente linha 224). É necessário confirmar que `import * as fs from 'node:fs/promises'` já existe no topo do arquivo.

- [ ] **Passo 4: Fazer a mesma modificação em `createAgentWorktree`**

Localizar o método `createAgentWorktree` e adicionar o mesmo bloco de código de hooksPath após a chamada `git worktree add` (código completo igual ao Passo 3, com `slug` vindo dos parâmetros do agent worktree).

- [ ] **Passo 5: Executar testes para confirmar aprovação**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configura core.hooksPath"
```

Esperado: `PASS`.

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/services/gitWorktreeService.ts \
        packages/core/src/services/gitWorktreeService.test.ts
git commit -m "feat(worktree): configure core.hooksPath after worktree creation"
```

---

## Tarefa 3: EnterWorktreeTool grava WorktreeSession

**Arquivos:**

- Modificar: `packages/core/src/tools/enter-worktree.ts`
- Modificar: `packages/core/src/tools/enter-worktree.test.ts`

- [ ] **Passo 1: Escrever teste que falha**

No arquivo `enter-worktree.test.ts`, após os casos de criação bem-sucedida, adicionar:

```typescript
import { readWorktreeSession } from '../services/worktreeSessionService.js';

it('grava WorktreeSession sidecar após criar worktree', async () => {
  // Arrange: usar a configuração de teste existente que cria um repositório git real
  // e invoca a ferramenta (copiar do teste "custom name" existente)
  const result = await invokeTool(tool, { name: 'session-test' });
  expect(result.error).toBeUndefined();

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  const session = await readWorktreeSession(sessionPath);

  expect(session).not.toBeNull();
  expect(session!.slug).toBe('session-test');
  expect(session!.worktreePath).toContain('session-test');
  expect(session!.worktreeBranch).toBe('worktree-session-test');
  expect(session!.originalCwd).toBeTruthy();
  expect(session!.originalBranch).toBeTruthy();
  expect(session!.originalHeadCommit).toMatch(/^[0-9a-f]{7,40}$/);
});
```

- [ ] **Passo 2: Executar teste para confirmar falha**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts -t "grava WorktreeSession"
```

Esperado: `FAIL` — arquivo de sessão é nulo.

- [ ] **Passo 3: Modificar `enter-worktree.ts` para gravar a sessão após criação bem-sucedida**

Adicionar import no topo de `enter-worktree.ts`:

```typescript
import { writeWorktreeSession } from '../services/worktreeSessionService.js';
```

No método `execute()`, depois de obter o `baseBranch` e antes da chamada `createUserWorktree()`, capturar o commit HEAD atual:

```typescript
// Capturar HEAD antes do branch — WorktreeExitDialog usa isso para contar
// novos commits criados dentro do worktree (espelha abordagem do claude-code).
let originalHeadCommit = '';
try {
  originalHeadCommit = await service.getHeadCommit();
} catch {
  // Não fatal.
}
```

Ao mesmo tempo, adicionar um método público em `GitWorktreeService` (`gitWorktreeService.ts`, próximo a `getCurrentBranch()`):

```typescript
async getHeadCommit(): Promise<string> {
  try {
    return (await this.git.raw(['rev-parse', '--short', 'HEAD'])).trim();
  } catch {
    return '';
  }
}
```

Após a chamada `writeWorktreeSessionMarker(...)`, adicionar:

```typescript
// Persistir sessão do worktree para que --resume possa restaurar o contexto.
try {
  await writeWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
    {
      slug,
      worktreePath: result.worktree.path,
      worktreeBranch: result.worktree.branch,
      originalCwd: projectRoot,
      originalBranch: baseBranch ?? 'HEAD',
      originalHeadCommit,
    },
  );
} catch (error) {
  debugLogger.warn(`enter_worktree: falha ao gravar estado da sessão: ${error}`);
}
```

- [ ] **Passo 4: Executar testes para confirmar aprovação**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts
```

Esperado: todos passam, sem regressão.

- [ ] **Passo 5: Verificação de tipos**

```bash
cd packages/core && npm run typecheck
```

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/tools/enter-worktree.ts \
        packages/core/src/tools/enter-worktree.test.ts
git commit -m "feat(worktree): persist WorktreeSession in EnterWorktreeTool"
```

---

## Tarefa 4: ExitWorktreeTool limpa WorktreeSession

**Arquivos:**

- Modificar: `packages/core/src/tools/exit-worktree.ts`
- Modificar: `packages/core/src/tools/exit-worktree.test.ts`

- [ ] **Passo 1: Escrever teste que falha**

No arquivo `exit-worktree.test.ts`, adicionar dois casos (keep e remove devem limpar a sessão):

```typescript
import {
  writeWorktreeSession,
  readWorktreeSession,
} from '../services/worktreeSessionService.js';

async function seedSession(cfg: Config, slug: string) {
  await writeWorktreeSession(
    cfg.getSessionService().getWorktreeSessionPath(cfg.getSessionId()),
    {
      slug,
      worktreePath: `/repo/.qwen/worktrees/${slug}`,
      worktreeBranch: `worktree-${slug}`,
      originalCwd: '/repo',
      originalBranch: 'main',
    },
  );
}

it('limpa WorktreeSession após keep', async () => {
  await seedSession(config, 'exit-keep-test');
  // Criar o worktree primeiro para que exit_worktree possa encontrá-lo
  await config.getWorktreeService().createUserWorktree('exit-keep-test');
  await invokeTool(tool, { name: 'exit-keep-test', action: 'keep' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});

it('limpa WorktreeSession após remove', async () => {
  await seedSession(config, 'exit-remove-test');
  await config.getWorktreeService().createUserWorktree('exit-remove-test');
  await invokeTool(tool, { name: 'exit-remove-test', action: 'remove' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});
```

- [ ] **Passo 2: Executar testes para confirmar falha**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts -t "limpa WorktreeSession"
```

Esperado: `FAIL`.

- [ ] **Passo 3: Modificar `exit-worktree.ts`**

Adicionar import no topo:

```typescript
import { clearWorktreeSession } from '../services/worktreeSessionService.js';
```

Localizar o caminho de retorno para `action === 'keep'` (aproximadamente linhas 184-196) e, antes de `return { llmContent: ..., returnDisplay: ... }`, adicionar:

```typescript
try {
  await clearWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
  );
} catch (error) {
  debugLogger.warn(`exit_worktree: falha ao limpar estado da sessão: ${error}`);
}
```

Localizar o caminho de retorno bem-sucedido para `action === 'remove'` (após chamada `removeUserWorktree`) e adicionar o mesmo bloco de `clearWorktreeSession`.

- [ ] **Passo 4: Executar testes para confirmar aprovação**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts
```

Esperado: todos passam.

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/tools/exit-worktree.ts \
        packages/core/src/tools/exit-worktree.test.ts
git commit -m "feat(worktree): clear WorktreeSession in ExitWorktreeTool"
```

---

## Tarefa 5: Hook useWorktreeSession + UIState.activeWorktree

**Arquivos:**

- Criar: `packages/cli/src/ui/hooks/useWorktreeSession.ts`
- Modificar: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Modificar: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Passo 1: Adicionar campo `activeWorktree` em `UIStateContext.tsx`**

Localizar a interface `UIState` (aproximadamente linha 85) e, próximo a `branchName: string | undefined;`, adicionar:

```typescript
activeWorktree: {
  slug: string;
  branch: string;
  path: string;
  originalCwd: string;
  originalBranch: string;
  originalHeadCommit: string;
} | null;
```

Localizar o valor inicial do UIState (geralmente no provider do UIState em `AppContainer.tsx` ou no defaultValue do `createContext`) e adicionar `activeWorktree: null`.

- [ ] **Passo 2: Criar `useWorktreeSession.ts`**

```typescript
// packages/cli/src/ui/hooks/useWorktreeSession.ts
import { useState, useEffect } from 'react';
import * as fs from 'node:fs';
import {
  readWorktreeSession,
  type WorktreeSession,
} from '@qwen-code/qwen-code-core';
import { useConfig } from '../contexts/ConfigContext.js';

export function useWorktreeSession(): WorktreeSession | null {
  const config = useConfig();
  const [session, setSession] = useState<WorktreeSession | null>(null);

  useEffect(() => {
    const sessionService = config.getSessionService();
    const sessionId = config.getSessionId();
    const filePath = sessionService.getWorktreeSessionPath(sessionId);

    let watcher: fs.FSWatcher | undefined;

    const load = async () => {
      try {
        const ws = await readWorktreeSession(filePath);
        setSession(ws);
      } catch {
        setSession(null);
      }
    };

    void load();

    try {
      watcher = fs.watch(filePath, () => void load());
    } catch {
      // Arquivo ainda não existe — watcher será configurado no próximo evento de escrita via load()
    }

    return () => {
      watcher?.close();
    };
  }, [config]);

  return session;
}
```
**Atenção:** `readWorktreeSession` e `WorktreeSession` precisam ser exportados de `@qwen-code/qwen-code-core`. É necessário adicionar a exportação em `packages/core/src/index.ts`:

```typescript
export {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './services/worktreeSessionService.js';
```

- [ ] **Passo 3: Usar hook para sincronizar `activeWorktree` no `AppContainer.tsx`**

Adicione o import no topo do `AppContainer.tsx`:

```typescript
import { useWorktreeSession } from './hooks/useWorktreeSession.js';
```

Dentro do corpo da função `AppContainer` (próximo ao uso de `branchName`), adicione:

```typescript
const worktreeSession = useWorktreeSession();
```

No valor passado para `UIStateContext.Provider`, adicione:

```typescript
activeWorktree: worktreeSession
  ? {
      slug: worktreeSession.slug,
      branch: worktreeSession.worktreeBranch,
      path: worktreeSession.worktreePath,
      originalCwd: worktreeSession.originalCwd,
      originalBranch: worktreeSession.originalBranch,
      originalHeadCommit: worktreeSession.originalHeadCommit,
    }
  : null,
```

- [ ] **Passo 4: Type check**

```bash
npm run typecheck
```

Execute a partir da raiz do repositório (verificação entre workspaces). Esperado: nenhum erro.

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/index.ts \
        packages/cli/src/ui/hooks/useWorktreeSession.ts \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add useWorktreeSession hook and UIState.activeWorktree"
```

---

## Tarefa 6: Campo `worktree` no StatusLineCommandInput + Linha de worktree no Footer

**Arquivos:**

- Modificar: `packages/cli/src/ui/hooks/useStatusLine.ts`
- Modificar: `packages/cli/src/ui/components/Footer.tsx`

- [ ] **Passo 1: Adicionar campo `worktree` no `useStatusLine.ts`**

Localize a interface `StatusLineCommandInput` (aproximadamente linha 21). Após o campo `git?: { branch: string }`, adicione:

```typescript
worktree?: {
  /** slug do worktree (nome curto, ex: "my-feature") */
  name: string;
  /** caminho físico do worktree */
  path: string;
  /** nome do branch git (ex: "worktree-my-feature") */
  branch: string;
  /** diretório de trabalho antes de entrar no worktree */
  original_cwd: string;
  /** branch antes de entrar no worktree */
  original_branch: string;
};
```

Mantenha os nomes dos campos consistentes com o claude-code, para que os usuários possam reutilizar scripts de statusline entre qwen-code e claude-code.

Localize o local onde o objeto `input: StatusLineCommandInput` é construído no callback `doUpdate` (aproximadamente linha 225). Após `...(ui.branchName && { git: { branch: ui.branchName } })`, adicione:

```typescript
...(uiStateRef.current.activeWorktree && {
  worktree: {
    name: uiStateRef.current.activeWorktree.slug,
    path: uiStateRef.current.activeWorktree.path,
    branch: uiStateRef.current.activeWorktree.branch,
    original_cwd: uiStateRef.current.activeWorktree.originalCwd,
    original_branch: uiStateRef.current.activeWorktree.originalBranch,
  },
}),
```

**Nota:** `UIState.activeWorktree` também precisa incluir os campos `originalCwd` e `originalBranch` (adicione no mapeamento do AppContainer da Tarefa 5).

- [ ] **Passo 2: Adicionar linha de exibição interna de worktree no `Footer.tsx`**

No topo do `Footer.tsx`, importe `useUIState` (já deve existir).

Localize a área de renderização de `statusLineLines` (aproximadamente linhas 140-148):

```tsx
{
  statusLineLines.length > 0 &&
    !uiState.ctrlCPressedOnce &&
    !uiState.ctrlDPressedOnce &&
    statusLineLines.map((line, i) => (
      <Text key={`status-line-${i}`} dimColor wrap="truncate">
        {line}
      </Text>
    ));
}
```

Antes dela, insira a linha de worktree (exibida quando `activeWorktree` não é nulo e não há statusline do usuário):

```tsx
{
  uiState.activeWorktree &&
    !uiState.ctrlCPressedOnce &&
    !uiState.ctrlDPressedOnce &&
    statusLineLines.length === 0 && (
      <Text dimColor wrap="truncate">
        {`⎇ ${uiState.activeWorktree.branch} (${uiState.activeWorktree.slug})`}
      </Text>
    );
}
```

- [ ] **Passo 3: Type check + Build**

```bash
npm run typecheck && npm run build
```

Esperado: nenhum erro.

- [ ] **Passo 4: Commit**

```bash
git add packages/cli/src/ui/hooks/useStatusLine.ts \
        packages/cli/src/ui/components/Footer.tsx
git commit -m "feat(worktree): show active worktree in Footer and StatusLine payload"
```

---

## Tarefa 7: Injeção de contexto de worktree no `--resume`

**Arquivos:**

- Modificar: `packages/cli/src/ui/AppContainer.tsx:459-489`

- [ ] **Passo 1: Injetar mensagem de contexto de worktree no caminho de resume**

No `AppContainer.tsx`, localize o caminho de resume (aproximadamente linhas 459-489):

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);
  // ...
}
```

Modifique para:

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);

  // Se existe uma sessão de worktree ativa, injeta um lembrete de contexto
  // para que o modelo saiba imediatamente que deve continuar usando o caminho do worktree.
  const ws = await readWorktreeSession(
    config.getSessionService().getWorktreeSessionPath(config.getSessionId()),
  );
  if (ws) {
    // Verifica se o diretório do worktree ainda existe antes de tratá-lo como ativo.
    const worktreeAlive = await fs
      .stat(ws.worktreePath)
      .then((s) => s.isDirectory())
      .catch(() => false);

    if (worktreeAlive) {
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text:
            `[Resumed] Active worktree: "${ws.slug}" at ${ws.worktreePath} ` +
            `(branch: ${ws.worktreeBranch}). Continue using this path for all file operations.`,
        },
        Date.now(),
      );
    } else {
      // Sidecar obsoleto — worktree foi excluído externamente, limpe.
      await clearWorktreeSession(
        config
          .getSessionService()
          .getWorktreeSessionPath(config.getSessionId()),
      );
    }
  }

  // ... resto do código de resume existente (agentes de background, nome da sessão)
}
```

No topo do arquivo, adicione os imports:

```typescript
import {
  readWorktreeSession,
  clearWorktreeSession,
} from '@qwen-code/qwen-code-core';
import * as fs from 'node:fs/promises';
```

(`fs` pode já estar importado; verifique e mescle.)

- [ ] **Passo 2: Type check**

```bash
npm run typecheck
```

- [ ] **Passo 3: Commit**

```bash
git add packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): inject context message on --resume when worktree is active"
```

---

## Tarefa 8: WorktreeExitDialog

**Arquivos:**

- Criar: `packages/cli/src/ui/components/WorktreeExitDialog.tsx`
- Criar: `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx`
- Modificar: `packages/cli/src/ui/components/DialogManager.tsx`
- Modificar: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Modificar: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Passo 1: Adicionar estado do dialog no `AppContainer.tsx`**

Estados de dialog como `showWelcomeBackDialog` são retornados pelos hooks para o AppContainer e depois passados via objeto de valor do Provider do UIState. Siga o mesmo padrão para o WorktreeExitDialog:

No corpo da função `AppContainer.tsx`, adicione:

```typescript
const [showWorktreeExitDialog, setShowWorktreeExitDialog] = useState(false);
```

No objeto de valor do Provider do UIState, adicione:

```typescript
showWorktreeExitDialog,
```

Na interface `UIState`, adicione (próximo a outros campos de dialog):

```typescript
showWorktreeExitDialog: boolean;
```

- [ ] **Passo 2: Escrever teste do componente (que irá falhar)**

```typescript
// packages/cli/src/ui/components/WorktreeExitDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

describe('WorktreeExitDialog', () => {
  it('exibe estado de loading inicialmente', () => {
    const { lastFrame } = render(
      <WorktreeExitDialog
        slug="my-feature"
        branch="worktree-my-feature"
        worktreePath="/tmp/repo/.qwen/worktrees/my-feature"
        originalHeadCommit="abc1234"
        onKeep={vi.fn()}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Deve mostrar o spinner de loading imediatamente antes do git status resolver
    expect(lastFrame()).toContain('Checking');
  });

  it('renderiza slug, branch e opções após o loading (sem alterações)', async () => {
    // Use vi.mock para simular execFileNoThrow / execFile para que git status retorne vazio
    // e rev-list retorne "0". Veja os testes de dialog existentes para o padrão de mock.
    // Após o efeito assíncrono resolver:
    //   - mostra "my-feature" e "worktree-my-feature"
    //   - mostra as opções Keep e Remove
    //   - mostra "no uncommitted changes" ou similar
  });
});
```

- [ ] **Passo 3: Executar teste para confirmar falha**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Esperado: `FAIL` — módulo não existe.

- [ ] **Passo 4: Criar `WorktreeExitDialog.tsx`**

Siga o padrão de `RadioSelect` do `WelcomeBackDialog.tsx`, adicionando verificação de estado sujo no mount (alinhado com a lógica `loadChanges` do `WorktreeExitDialog.tsx` do claude-code):

```tsx
// packages/cli/src/ui/components/WorktreeExitDialog.tsx
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { execa } from 'execa';
import { RadioSelect } from '../shared/RadioSelect.js';
import type { RadioSelectItem } from '../shared/RadioSelect.js';
import { theme } from '../semantic-colors.js';

interface WorktreeExitDialogProps {
  slug: string;
  branch: string;
  worktreePath: string;
  originalHeadCommit: string;
  onKeep: () => void;
  onRemove: () => void;
  onCancel: () => void;
}

type Choice = 'keep' | 'remove' | 'cancel';

export const WorktreeExitDialog: React.FC<WorktreeExitDialogProps> = ({
  slug,
  branch,
  worktreePath,
  originalHeadCommit,
  onKeep,
  onRemove,
  onCancel,
}) => {
  const [loading, setLoading] = useState(true);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [selected, setSelected] = useState<Choice>('keep');

  useEffect(() => {
    async function loadDirtyState() {
      try {
        // Mudanças não commitadas (tracked + untracked)
        const { stdout: statusOut } = await execa(
          'git',
          ['status', '--porcelain'],
          { cwd: worktreePath },
        );
        const files = statusOut.split('\n').filter((l) => l.trim().length > 0);
        setChangedFiles(files);

        // Novos commits desde que o worktree foi criado
        if (originalHeadCommit) {
          const { stdout: countOut } = await execa(
            'git',
            ['rev-list', '--count', `${originalHeadCommit}..HEAD`],
            { cwd: worktreePath },
          );
          setCommitCount(parseInt(countOut.trim(), 10) || 0);
        }
      } catch {
        // Se git falhar, mostra o dialog sem contagens.
      } finally {
        setLoading(false);
      }
    }
    void loadDirtyState();
  }, [worktreePath, originalHeadCommit]);

  const options: Array<RadioSelectItem<Choice>> = [
    {
      key: 'keep',
      label: 'Keep worktree (exit without deleting)',
      value: 'keep',
    },
    {
      key: 'remove',
      label:
        changedFiles.length > 0 || commitCount > 0
          ? `Remove worktree and branch (discards ${commitCount} commit(s), ${changedFiles.length} file(s))`
          : 'Remove worktree and branch',
      value: 'remove',
    },
    { key: 'cancel', label: 'Cancel (stay in session)', value: 'cancel' },
  ];

  if (loading) {
    return (
      <Box marginY={1} paddingX={2}>
        <Text color={theme.text.secondary}>Checking worktree status…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1} paddingX={2}>
      <Text color={theme.status.warning}>
        {`Active worktree: "${slug}" (${branch})`}
      </Text>
      {(changedFiles.length > 0 || commitCount > 0) && (
        <Box flexDirection="column" marginBottom={1}>
          {commitCount > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${commitCount} new commit(s) on ${branch}`}
            </Text>
          )}
          {changedFiles.length > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${changedFiles.length} uncommitted file(s)`}
            </Text>
          )}
        </Box>
      )}
      <Text color={theme.text.secondary}>What would you like to do?</Text>
      <RadioSelect
        items={options}
        selectedValue={selected}
        onSelect={(value) => {
          if (value === 'keep') onKeep();
          else if (value === 'remove') onRemove();
          else onCancel();
        }}
        onChange={setSelected}
      />
    </Box>
  );
};
```

**Nota:** `execa` já é uma dependência do projeto (ou use `execFileNoThrow`, veja a abordagem do claude-code). Verifique `packages/cli/package.json` para confirmar a ferramenta exec disponível; se não houver `execa`, use um wrapper para `execFile` nativo do Node.js.

- [ ] **Passo 5: Executar teste para confirmar que passa**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Esperado: teste do estado de loading passa.

- [ ] **Passo 6: Registrar no `DialogManager.tsx`**

Localize o último bloco de renderização de dialog no `DialogManager`, adicione:

```tsx
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

// No JSX retornado pelo DialogManager, após o último dialog adicione:
{
  uiState.showWorktreeExitDialog && uiState.activeWorktree && (
    <WorktreeExitDialog
      slug={uiState.activeWorktree.slug}
      branch={uiState.activeWorktree.branch}
      worktreePath={uiState.activeWorktree.path}
      originalHeadCommit={uiState.activeWorktree.originalHeadCommit}
      onKeep={() => {
        setShowWorktreeExitDialog(false);
        handleSlashCommand('/quit');
      }}
      onRemove={async () => {
        setShowWorktreeExitDialog(false);
        // Remove o worktree diretamente via serviço (sem chamada de ferramenta).
        try {
          const svc = new GitWorktreeService(config.getTargetDir());
          await svc.removeUserWorktree(uiState.activeWorktree!.slug, {
            deleteBranch: true,
          });
          await clearWorktreeSession(
            config
              .getSessionService()
              .getWorktreeSessionPath(config.getSessionId()),
          );
        } catch {
          // Não fatal — saia de qualquer forma.
        }
        handleSlashCommand('/quit');
      }}
      onCancel={() => {
        setShowWorktreeExitDialog(false);
      }}
    />
  );
}
```

`setShowWorktreeExitDialog` vem do `useState` definido no Passo 1 no AppContainer; precisa ser passado via props ou diretamente no ponto de chamada do DialogManager (veja o padrão de outros dialogs).

- [ ] **Passo 7: Interceptar segundo Ctrl+C no `AppContainer.tsx`**

No callback `handleExit` (aproximadamente linha 2387), localize o branch onde `pressedOnce` é `true` e chama `handleSlashCommand('/quit')`:

```typescript
// Pressionamento duplo rápido: saída direta (preserva hábito do usuário)
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Sai diretamente
  handleSlashCommand('/quit');
  return;
}
```

Modifique para:

```typescript
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Se estiver dentro de um worktree, mostra o dialog de saída em vez de sair diretamente.
  if (worktreeSession) {
    setShowWorktreeExitDialog(true);
    return;
  }
  handleSlashCommand('/quit');
  return;
}
```

`worktreeSession` é o valor retornado por `useWorktreeSession()` no Passo 1 (já está no corpo do AppContainer). Adicione-o ao array de dependências do `useCallback` de `handleExit`. `setShowWorktreeExitDialog` vem do `useState` do Passo 1.

- [ ] **Passo 9: Type check + Testes completos**

```bash
npm run typecheck
cd packages/core && npx vitest run
cd packages/cli && npx vitest run
```

Esperado: tudo passa, sem regressões.

- [ ] **Passo 10: Build**

```bash
npm run build && npm run bundle
```

Esperado: `dist/cli.js` gerado sem erros.

- [ ] **Passo 11: Commit**

```bash
git add packages/cli/src/ui/components/WorktreeExitDialog.tsx \
        packages/cli/src/ui/components/WorktreeExitDialog.test.tsx \
        packages/cli/src/ui/components/DialogManager.tsx \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add WorktreeExitDialog — intercept Ctrl+C when worktree is active"
```

---

## Critérios de Aceitação

| Cenário                           | Comportamento Esperado                                        |
| --------------------------------- | ------------------------------------------------------------- |
| Após chamada `enter_worktree`     | `<sessionId>.worktree.json` existe, contendo slug / path / branch |
| Após chamada `exit_worktree`      | `<sessionId>.worktree.json` é removido                       |
| `--resume` com worktree ainda existente | Footer exibe linha de worktree; mensagem INFO informa o caminho |
| `--resume` com worktree já removido   | Arquivo sidecar é limpo, nenhuma linha de worktree é exibida |
| Primeiro Ctrl+C dentro do worktree | Exibe "Press Ctrl+C again to exit."                          |
| Segundo Ctrl+C dentro do worktree  | Exibe WorktreeExitDialog (keep / remove / cancel)            |
| Segundo Ctrl+C fora do worktree    | Sai diretamente (comportamento inalterado)                    |
| Commit dentro de um worktree novo  | `core.hooksPath` aponta para os hooks do repositório principal, pre-commit funciona |
| Script de statusline (stdin)      | JSON payload contém `worktree.slug` e `worktree.branch`      |