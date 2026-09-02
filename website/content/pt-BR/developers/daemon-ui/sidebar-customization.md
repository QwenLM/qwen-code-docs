# WebShell Sidebar — Guia de Personalização

O `WebShellSidebar` é o painel de navegação e lista de sessões renderizado
dentro do componente `App` do web-shell. Este documento mapeia cada área
visual para sua capacidade atual de personalização e identifica áreas sem
ponto de injeção externo.

## Ativando a sidebar

A sidebar está **desativada por padrão**. Passe a prop `sidebar` para ativar:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // simple enable
  // or with fine-grained options:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## Visão geral do layout

```
┌─────────────────────────────────────┐
│ ① Branding (topRow)                 │  ✅ customizable
├─────────────────────────────────────┤
│ ② Primary navigation                │  ✅ customizable
│    [＋ New task]  [🧩 Plugins]      │
│    [📅 Scheduled] [🎯 Goals]        │
│    [custom render...]               │
├─────────────────────────────────────┤
│ ③ Project header                    │  ✅ show/hide
│    📁 Projects ▼ [🔍] [＋]          │
│    Session list entries...          │
│    📦 Archived sessions             │
├─────────────────────────────────────┤
│ ④ Footer action bar                 │  ✅ customizable
│    [⚙ Settings] v0.19 [☀] [▦] [◧] │
├─────────────────────────────────────┤
│ ⑤ Resize handle                     │  ❌ not customizable
└─────────────────────────────────────┘
```

## Áreas personalizáveis

### ① Branding — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // replace the entire branding row
  hideWhenCompact?: boolean; // hide when sidebar is collapsed (default: true)
}
```

| Valor                              | Efeito                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| `undefined` (padrão)               | Logo do Qwen + texto "Qwen Code"                             |
| `false`                            | Linha de branding oculta completamente                       |
| `{ render: () => <MyHeader /> }`   | Substituição completa com conteúdo personalizado             |
| `{ hideWhenCompact: false }`       | Manter branding visível no modo icon-rail recolhido          |

```tsx
sidebar={{
  branding: {
    render: () => (
      <div style={{ display: 'flex', gap: 8 }}>
        <img src="/my-logo.svg" alt="" width={24} />
        <span>My App</span>
      </div>
    ),
  },
}}
```

### ② Navegação Primária — `primaryNav`

```ts
type WebShellSidebarPrimaryNavItem =
  | 'newTask' // ✏️ New Task button
  | 'plugins' // 🧩 Plugins button
  | 'scheduledTasks' // 📅 Scheduled Tasks button
  | 'goals'; // 🎯 Goals button

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // which built-in buttons to show (default: all)
  render?: () => ReactNode; // additional custom content after built-in buttons
}
```

A área de navegação primária contém botões integrados controlados por `items`:

- Todos os botões são exibidos por padrão quando `items` não é especificado
- Apenas os botões listados são exibidos quando `items` é fornecido
- Conteúdo personalizado pode ser adicionado via `render()` após os botões integrados

| Valor                                        | Efeito                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `undefined` (padrão)                         | Todos os botões integrados exibidos                 |
| `{ items: ['plugins'] }`                     | Apenas o botão Plugins                              |
| `{ items: ['plugins', 'scheduledTasks'] }`   | Plugins + Scheduled Tasks                           |
| `{ items: [], render: () => ... }`           | Oculta todos os integrados, apenas conteúdo custom  |

```tsx
sidebar={{
  primaryNav: {
    items: ['plugins', 'scheduledTasks'],  // hide newTask and goals
    render: () => (
      <button onClick={() => console.log('custom action')}>
        🔗 Data Sync
      </button>
    ),
  },
}}
```

### ④ Rodapé — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ Settings panel
  | 'version' // version label (e.g. "v0.19.10")
  | 'theme' // ☀/🌙 light/dark toggle
  | 'sessionsOverview' // ▦ session overview panel
  | 'splitView' // ◧ split view (large screens only)
  | 'daemonStatus' // 📊 daemon status panel
  | 'collapse'; // ◁/▷ collapse/expand toggle

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // which built-in items to show (default: all)
  render?: () => ReactNode; // custom content rendered on the left side, before built-in items
}
```

| Valor                                          | Efeito                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `undefined` (padrão)                           | Todos os itens exibidos                                                     |
| `false`                                        | Rodapé oculto; o drawer mobile mantém apenas seu controle de fechamento     |
| `{ items: ['settings', 'theme', 'collapse'] }` | Apenas os itens listados; o drawer mobile sempre mantém seu controle de fechamento |

O rodapé se adapta automaticamente a larguras reduzidas: os rótulos são
ocultos e a versão é removida abaixo de certos limites.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimal footer
}}
```

Conteúdo personalizado via `render()` aparece no lado esquerdo do rodapé,
antes dos itens integrados:

```tsx
sidebar={{
  footer: {
    items: ['collapse'],
    render: () => (
      <button onClick={() => openHelpCenter()}>
        ❓ Help
      </button>
    ),
  },
}}
```

**Nota:** `'scheduledTasks'` e `'goals'` foram movidos para a área de
navegação primária (②) e são exibidos por padrão. São controlados por
`primaryNav.items` em vez de `footer.items`.

### Outras opções de nível superior

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // show/hide sidebar (default: true when passed)
  defaultCollapsed?: boolean; // initial collapsed state (persisted in localStorage)
  showCompactToggle?: boolean; // show the collapse button in the chat area (default: true)
  showSessionSourceSwitch?: boolean; // show the Tasks/Channels switch (default: true)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // hide "Projects" header row (default: false = shown)
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### Session source switch — `showSessionSourceSwitch`

Defina `showSessionSourceSwitch` como `false` quando um host incorporado deve exibir apenas
sessões de tarefas comuns:

```tsx
sidebar={{
  showSessionSourceSwitch: false,
}}
```

Isso remove o switch Tasks/Channels e fixa toda consulta de sessão ativa, arquivada,
primária e secundária em `sourceType: "default"`. Omitir a opção mantém
o switch atual e o acesso a sessões de canal inalterado.

### ③ Cabeçalho do Projeto — `hideProjectHeader`

Controla a visibilidade da linha de cabeçalho "Projects" (a linha com o
toggle de recolhimento, ícone de busca e botão de adicionar workspace).
O padrão é `false` (exibido).

```tsx
sidebar={{
  hideProjectHeader: true,  // hide the "项目 ▼ [🔍] [＋]" row
}}
```

Quando oculto, as entradas da lista de sessões e as sessões arquivadas
continuarão sendo exibidas — a linha de cabeçalho com seus botões de ação
e a barra de busca de sessões são removidas.

### Ações de Linha da Sessão — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (dropdown sub-menu)
  | 'rename' // ✏️ Rename (dropdown menu)
  | 'group' // 📁 Group/Move to folder (dropdown menu)
  | 'export' // 📤 Export chat history (dropdown menu)
  | 'delete' // 🗑 Delete session (dropdown menu)
  | 'pin' // 📌 Pin/Unpin (inline button)
  | 'archive'; // 📦 Archive (dropdown menu)

/** Subset with working inline (hover-button) handlers. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // which actions to show (default: all)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // which items appear as inline buttons (default: ['pin'])
}
```

Controla quais botões de ação aparecem nas linhas de sessão:

- **`items`**: Controle mestre para todas as ações (inline e dropdown). Se um item não está em `items`, ele é oculto em todos os lugares.
- **`inlineItems`**: Controla quais itens aparecem como **botões inline** (ao passar o mouse). O padrão é `['pin']`. Apenas itens com handlers inline funcionais podem ser usados: `'pin'`, `'rename'`, `'export'`, `'delete'`. `'details'`, `'group'` e `'archive'` são apenas dropdown.

**Prioridade de visibilidade**: Tanto `items` quanto a condição integrada do item quanto `inlineItems` devem ser atendidos para que o botão inline apareça. Por exemplo, `delete` como inline requer que `items` inclua `'delete'` E `inlineItems` inclua `'delete'`.

| Valor                                      | Efeito                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| `undefined` (padrão)                       | Todas as ações exibidas, apenas pin como inline       |
| `{ inlineItems: ['pin', 'delete'] }`       | Pin + delete como botões inline                       |
| `{ inlineItems: [] }`                      | Nenhum botão inline                                   |
| `{ inlineItems: ['rename', 'export'] }`    | Rename + export como botões inline                    |

O trigger do dropdown (⋮) é automaticamente oculto quando nenhum item de
dropdown está habilitado. Os botões inline só são exibidos quando tanto sua
condição de capability quanto `items` os incluem. Archive fica desabilitado
na sessão atual e em qualquer sessão com um turno em execução, porque o
daemon encerra a sessão ao vivo ao arquivá-la.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // which actions to show (master control)
    inlineItems: ['pin', 'delete'],  // pin + delete as inline buttons
  },
}}
```

## Áreas não personalizáveis

### Projects / Workspaces (dentro da lista de sessões)

Quando a lista de sessões está visível, as seguintes subáreas são
renderizadas, mas **não são personalizáveis individualmente**:

| Aspecto                 | Detalhe                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| Fonte de dados          | Hook `useSessions()` → daemon API (endpoint `/sessions`)            |
| Ordenação da lista      | Por data de criação, descendente                                    |
| Renderização da linha   | `useCallback` interno `renderSessionRow` — não injetável            |
| Busca / filtro          | Barra de busca integrada com matching de texto no client            |
| Grupos de sessão        | Componente `SessionGroupSection` com 6 cores preset + hex custom    |
| Seções de workspace     | `WorkspaceSection` por workspace do daemon, não substituível        |
| Diálogo de workspace    | `AddWorkspaceDialog` integrado                                      |

### ⑤ Resize handle

- Handle de arrasto na borda direita para redimensionar a largura da sidebar
- A largura é persistida no localStorage
- Não é configurável

## Props de comportamento em runtime

Estas `WebShellProps` afetam o comportamento da sidebar indiretamente:

| Prop                            | Efeito                                        |
| ------------------------------- | --------------------------------------------- |
| `onNewSession`                  | Substitui o handler de nova sessão            |
| `onLoadSession`                 | Substitui a lógica de carregamento de sessão  |
| `onSessionIdChange`             | Reage a trocas de sessão                      |
| `splitSessionIds`               | Controla sessões do split view externamente   |
| `theme` / `onThemeChange`       | Controla / observa o tema                     |
| `language` / `onLanguageChange` | Controla / observa o idioma da UI             |

## Estados recolhido e mobile

| Estado      | Comportamento                                              |
| ----------- | ---------------------------------------------------------- |
| Expandido   | Sidebar completa com rótulos de texto                      |
| Recolhido   | Modo icon-rail (logo, ícone de caneta, ícones de ação)    |
| Mobile      | Drawer usa 70% do seu contêiner, dentro dos limites de largura, com controles de backdrop e fechamento no rodapé |

O estado de recolhimento é persistido no `localStorage` sob a chave
`qwen-code-web-shell-sidebar-collapsed`.

A largura redimensionada do desktop é restaurada apenas em layouts expandidos.
Abrir ou fechar o drawer mobile não sobrescreve essa largura nem a preferência
persistida de recolhimento do desktop.

## Localizações do código-fonte

| Componente          | Arquivo                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`          |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`      |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`         |
| Estilos da sidebar  | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`   |
| Integração no App   | `packages/web-shell/client/App.tsx` (buscar `WebShellSidebar`)              |
| Entry point (dev)   | `packages/web-shell/client/main.tsx` (`sidebar: true`)                      |
