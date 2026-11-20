# WebShell Sidebar — Guia de Personalização

O `WebShellSidebar` é o painel de navegação e lista de sessões renderizado
dentro do componente `App` do web-shell. Este documento mapeia cada área
visual para sua capacidade atual de personalização e identifica áreas sem
ponto de injeção externo.

## Ativando a sidebar

A sidebar tem como padrão **apenas Home**: uma coluna de sessão de 300px com um controle de recolhimento na parte inferior. Omitir `sidebar`, passar `true` ou passar `{}` usa este padrão. Passe `sidebar={false}` ou `{ enabled: false }` para ocultá-la.

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // padrão apenas Home
  // or with fine-grained options:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## Visão geral do layout

Hosts apenas-Home mostram branding, Nova sessão, workspaces, sessões arquivadas e o controle de recolhimento em uma coluna. Configurar outra entrada primária disponível ou ação de rodapé adiciona um trilho de ícones de 56px ao lado da coluna secundária padrão de 300px. As entradas primárias ficam no trilho; ações de rodapé e versão ficam em Mais. Renderizadores personalizados permanecem na coluna larga Home. Não há opção pública de layout.

**Mudança incompatível:** anteriormente, um `sidebar` omitido ocultava a sidebar, e listas omitidas de itens de navegação/rodapé expunham todos os integrados quando a sidebar estava habilitada. Hosts agora devem passar `sidebar={false}` para manter o padrão oculto anterior, ou listar explicitamente as entradas que precisam. O Web Shell autônomo configura explicitamente seu menu completo. `branding.hideWhenCompact` agora tem padrão `false`; defina como `true` para preservar uma marca oculta no drawer compacto.

## Áreas personalizáveis

### ① Branding — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // replace the entire branding row
  hideWhenCompact?: boolean; // hide branding in the compact drawer (default: false)
}
```

| Valor                              | Efeito                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| `undefined` (padrão)               | Marca resolvida: prop `brand` → daemon `GET /brand` → logo integrado do Qwen + texto "Qwen Code" |
| `false`                            | Linha de branding oculta completamente                       |
| `{ render: () => <MyHeader /> }`   | Substituição completa com conteúdo personalizado             |
| `{ hideWhenCompact: false }`     | Manter branding visível no drawer compacto (o padrão)                                  |

A linha padrão é orientada por dados, não fixa: um daemon que serve uma
configuração `ui.brand` renomeia o texto e troca a marca, e um host de
embedding pode sobrescrever ambos com a prop `brand` do componente shell
(`onBrandResolved` reporta o resultado para o chrome do próprio host).
`branding.render` continua sendo o override de maior precedência — vence
a prop e o valor resolvido pelo daemon, exatamente como antes.

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
  | 'newTask' // ✏️ New session button
  | 'plugins' // 🧩 Plugins button
  | 'channels' // Channel sessions and settings
  | 'live' // Live sessions and settings; requires showLive
  | 'workflows' // Requires workflow support
  | 'managed' // Requires a managed-agent provider
  | 'scheduledTasks' // 📅 Scheduled Tasks button
  | 'goals'; // 🎯 Goals button

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // which built-in buttons to show (default: ['newTask'])
  render?: () => ReactNode; // additional custom content after built-in buttons
}
```

A área de navegação primária contém botões integrados controlados por `items`:

- Apenas Nova sessão é mostrada quando `items` não é especificado; Home sempre existe
- Apenas os botões listados são exibidos quando `items` é fornecido
- Conteúdo personalizado pode ser adicionado via `render()` após os botões integrados

| Valor                                      | Efeito                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| `undefined` (padrão)                      | Home com Nova sessão                                 |
| `{ items: ['plugins'] }`                   | Home e Plugins; sem botão Nova sessão               |
| `{ items: ['plugins', 'scheduledTasks'] }` | Home + Plugins + Scheduled Tasks                      |
| `{ items: [], render: () => ... }`         | Home com conteúdo personalizado; sem botões primários integrados |

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
  | 'update' // Update action when supported
  | 'localFiles' // Local-files bridge when available
  | 'desktopRelay' // Use this computer through the existing desktop relay
  | 'workspacesOverview' // Workspace management when unlocked
  | 'version' // version label (e.g. "v0.19.10")
  | 'theme' // ☀/🌙 light/dark toggle
  | 'sessionsOverview' // ▦ session overview panel
  | 'splitView' // ◧ split view (shell containers at least 1024px wide)
  | 'daemonStatus' // 📊 daemon status panel
  | 'collapse'; // ◁/▷ collapse/expand toggle

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // which built-in items to show (default: ['collapse'])
  render?: () => ReactNode; // custom content in the Home footer
}
```

| Valor                                          | Efeito                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `undefined` (padrão)                          | Apenas recolhimento/expansão                                                      |
| `false`                                        | Rodapé oculto; o drawer mobile mantém apenas seu controle de fechamento             |
| `{ items: ['settings', 'theme', 'collapse'] }` | Apenas os itens listados são mostrados; o drawer mobile sempre mantém seu controle de fechamento |

No layout em trilho, ações de rodapé e versão aparecem em Mais; apenas o controle de recolhimento/expansão permanece na base do trilho. O modo apenas-Home mantém o comportamento existente de rodapé compacto.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimal footer
}}
```

Conteúdo personalizado via `render()` aparece no rodapé largo Home:

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
navegação primária (②) e requerem configuração explícita em hosts incorporados. São controlados por `primaryNav.items` em vez de
`footer.items`.

### Outras opções de nível superior

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // show/hide sidebar (default: true, including when sidebar is omitted)
  defaultCollapsed?: boolean; // initial collapsed state (persisted in localStorage)
  showCompactToggle?: boolean; // show the collapse button in the chat area (default: true)
  showSessionSourceSwitch?: boolean; // show the Tasks/Channels switch (default: true)
  showLive?: boolean; // show daemon-owned Live conversations (default: false)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // hide "Workspaces" header row (default: false = shown)
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

Isso remove o switch Tasks/Channels e fixa toda consulta de sessão ativa, arquivada, primária
e secundária em `sourceType: "default"`. Omitir a opção mantém
o acesso a sessões de canal. Quando uma entrada dedicada de trilho Canais está disponível, ela substitui as abas de origem; caso contrário, as abas permanecem.

### Live conversations — `showLive`

As conversas ao vivo ficam ocultas dos hosts incorporados por padrão. Ative essa opção quando o
host deve expor o grupo Live gerenciado pelo daemon:

Versões anteriores exibiam esse grupo sem uma opção explícita, então hosts
que dependem dele devem definir `showLive: true` ao atualizar.

```tsx
sidebar={{
  showLive: true,
  primaryNav: { items: ['newTask', 'live'] },
}}
```

Sem a entrada primária `live`, `showLive: true` mantém o grupo Live existente em Home e configurações em Experimental. Com a entrada, Live abre sua própria coluna de sessão e página de configurações.

### ③ Cabeçalho do Workspace — `hideProjectHeader`

Controla a visibilidade da linha de cabeçalho "Workspaces" (a linha com o
toggle de recolhimento, ícone de busca e botão de adicionar workspace). O padrão é `false` (exibido).

```tsx
sidebar={{
  hideProjectHeader: true,  // hide the "工作区 ▼ [🔍] [＋]" row
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
  | 'bindPr' // 🔗 Bind a GitHub PR (dropdown menu)
  | 'group' // 📁 Group/Move to folder (dropdown menu)
  | 'export' // 📤 Export chat history (dropdown menu)
  | 'delete' // 🗑 Delete session (dropdown menu)
  | 'pin' // 📌 Pin/Unpin (inline button)
  | 'archive' // 📦 Archive (dropdown menu)
  | 'split'; // ◫ Add to Split View (dropdown menu)

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
- **`inlineItems`**: Controla quais itens aparecem como **botões inline** (ao passar o mouse) nas linhas de sessão padrão. O padrão é `['pin']`. Apenas itens com handlers inline funcionais podem ser usados: `'pin'`, `'rename'`, `'export'`, `'delete'`. `'details'`, `'bindPr'`, `'group'`, `'archive'` e `'split'` são apenas dropdown em linhas padrão.
- **Condição integrada do `bindPr`**: mostrado apenas quando a sessão suporta mutação de metadados — a sessão atual em um workspace primário ou bloqueado, ou qualquer outra sessão com a capability `workspace_session_metadata` (mais `workspace_qualified_rest_core` quando essa sessão está em um workspace secundário bloqueado ou restrito) — e a linha não é uma sessão autônoma (incluindo linhas de recentes) — rotas de metadados autônomas aceitam apenas um nome de exibição. É independente do item `rename`: um host pode permitir `bindPr` sem `rename`.

Linhas arquivadas em Configurações usam conversa Exportar e Restaurar como botões inline, com Renomear e Excluir em Mais. Suas ações ainda seguem `items` e restrições de disponibilidade integradas; `inlineItems` não altera este layout. Os estilos existentes revelam estes botões ao passar o mouse ou foco do teclado e os mantêm visíveis em dispositivos touch.

**Prioridade de visibilidade em linhas padrão**: Tanto `items` E a condição integrada do item E `inlineItems` devem ser atendidos para que o botão inline apareça. Por exemplo, `delete` como inline requer que `items` inclua `'delete'` E `inlineItems` inclua `'delete'`.

| Valor                                   | Efeito                             |
| --------------------------------------- | ---------------------------------- |
| `undefined` (padrão)                   | Todas as ações mostradas, pin como inline   |
| `{ inlineItems: ['pin', 'delete'] }`    | Pin + delete como botões inline     |
| `{ inlineItems: [] }`                   | Sem botões inline em linhas padrão |
| `{ inlineItems: ['rename', 'export'] }` | Rename + export como botões inline  |

O trigger do dropdown (⋮) é automaticamente oculto quando nenhum item de
dropdown está habilitado. Os botões inline só são exibidos quando tanto sua
condição de capability quanto `items` os incluem. Archive fica desabilitado
na sessão atual e em qualquer sessão com um turno em execução, porque o daemon
fecha a sessão ao vivo ao arquivá-la.

`'split'` é habilitado por padrão como os outros itens, mas só tem efeito
quando o host conecta `onAddSessionToSplitView`. A sidebar também lê sua
prop `splitSessionIds` para capacidade: uma sessão que já está aberta no
split renderiza o item desabilitado com um título explicativo, assim como o
caso de limite de painéis e a sessão atual enquanto o split está fechado.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // which actions to show (master control)
    inlineItems: ['pin', 'delete'],  // pin + delete as inline buttons
  },
}}
```

## Áreas não personalizáveis

### Workspaces (dentro da lista de sessões)

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
| Diálogo de adicionar workspace  | `AddWorkspaceDialog` integrado                                     |

### ⑤ Resize handle

- Handle de arrasto na borda direita para redimensionar a largura da sidebar
- A largura é persistida no localStorage como a largura total da sidebar. Os padrões são 300px apenas-Home e 356px com o trilho. Larguras restauradas são limitadas a pelo menos 220px apenas-Home ou 276px com o trilho; valores antigos não são cegamente aumentados em 56px. Arrastar abaixo do limite de recolhimento ainda recolhe a sidebar.
- O breakpoint de dock do painel de ambiente ignora os 56px do trilho (a área de mensagem cede a eles), então o painel continua dockando nas mesmas larguras de janela que uma sidebar apenas-Home — por exemplo, uma janela de 1440px.
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
| Recolhido | Apenas-Home: faixa existente de 56px e sessões ao passar o mouse; com trilho: apenas o trilho primário de 56px                             |
| Mobile    | Drawer usa 70% do seu contêiner, dentro dos limites de largura, com backdrop e um controle de fechamento na base da coluna proprietária |

O estado de recolhimento é persistido no `localStorage` sob a chave
`qwen-code-web-shell-sidebar-collapsed`.

A largura redimensionada do desktop é restaurada apenas em layouts expandidos. Abrir ou
fechar o drawer mobile não sobrescreve essa largura nem a preferência
persistida de recolhimento do desktop.

A sidebar, seu drawer compacto e o chrome de boas-vindas do chat vazio seguem a largura do contêiner do shell (compacto em 760px); o conteúdo das mensagens do chat mantém breakpoints baseados na viewport. A disponibilidade de split usa 1024px e o espaço de split-sidebar usa 1200px. O recolhimento por teclado move o foco para fora da coluna secundária oculta para o controle do trilho.

## Localizações do código-fonte

| Componente          | Arquivo                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`          |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`      |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`         |
| Estilos da sidebar  | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`   |
| Integração no App   | `packages/web-shell/client/App.tsx` (buscar `WebShellSidebar`)              |
| Entry point (dev)   | `packages/web-shell/client/main.tsx` (listas explícitas de itens primários e de rodapé) |
