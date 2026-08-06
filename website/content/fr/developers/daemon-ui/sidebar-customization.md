---
title: "WebShell Sidebar — Guide de personnalisation"
description: "Personnalisation de la sidebar WebShell dans le démon qwen-code."
---

# WebShell Sidebar — Guide de personnalisation

Le `WebShellSidebar` est la liste de sessions et le panneau de navigation rendus à l'intérieur
du composant `App` du web-shell. Ce document associe chaque zone visuelle à sa
capacité de personnalisation actuelle et identifie les zones sans point d'injection externe.

## Activer la sidebar

La sidebar est **désactivée par défaut**. Passez la prop `sidebar` pour l'activer :

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // activation simple
  // ou avec des options fines :
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## Vue d'ensemble de la disposition

```
┌─────────────────────────────────────┐
│ ① Branding (topRow)                 │  ✅ personnalisable
├─────────────────────────────────────┤
│ ② Navigation principale             │  ✅ personnalisable
│    [＋ Nouvelle tâche] [🧩 Plugins] │
│    [📅 Planifiées] [🎯 Objectifs]   │
│    [rendu personnalisé...]           │
├─────────────────────────────────────┤
│ ③ En-tête de projet                 │  ✅ afficher/masquer
│    📁 Projects ▼ [🔍] [＋]          │
│    Entrées de la liste de sessions...│
│    📦 Sessions archivées            │
├─────────────────────────────────────┤
│ ④ Barre d'actions du footer         │  ✅ personnalisable
│    [⚙ Paramètres] v0.19 [☀] [▦] [◧]│
├─────────────────────────────────────┤
│ ⑤ Poignée de redimensionnement      │  ❌ non personnalisable
└─────────────────────────────────────┘
```

## Zones personnalisables

### ① Branding — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // remplacer toute la ligne de branding
  hideWhenCompact?: boolean; // masquer quand la sidebar est réduite (par défaut : true)
}
```

| Valeur                           | Effet                                             |
| -------------------------------- | ------------------------------------------------- |
| `undefined` (par défaut)         | Logo Qwen + texte "Qwen Code"                     |
| `false`                          | Ligne de branding entièrement masquée             |
| `{ render: () => <MyHeader /> }` | Remplacement complet par du contenu personnalisé  |
| `{ hideWhenCompact: false }`     | Garder le branding visible en mode icônes réduites|

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

### ② Navigation principale — `primaryNav`

```ts
type WebShellSidebarPrimaryNavItem =
  | 'newTask' // ✏️ Bouton Nouvelle tâche
  | 'plugins' // 🧩 Bouton Plugins
  | 'scheduledTasks' // 📅 Bouton Tâches planifiées
  | 'goals'; // 🎯 Bouton Objectifs

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // quels boutons intégrés afficher (par défaut : tous)
  render?: () => ReactNode; // contenu personnalisé supplémentaire après les boutons intégrés
}
```

La zone de navigation principale contient des boutons intégrés contrôlés par `items` :

- Tous les boutons sont affichés par défaut quand `items` n'est pas spécifié
- Seuls les boutons listés sont affichés quand `items` est fourni
- Du contenu personnalisé peut être ajouté via `render()` après les boutons intégrés

| Valeur                                       | Effet                                    |
| -------------------------------------------- | ---------------------------------------- |
| `undefined` (par défaut)                     | Tous les boutons intégrés affichés       |
| `{ items: ['plugins'] }`                     | Uniquement le bouton Plugins             |
| `{ items: ['plugins', 'scheduledTasks'] }`   | Plugins + Tâches planifiées              |
| `{ items: [], render: () => ... }`           | Masquer tout, uniquement du contenu personnalisé |

```tsx
sidebar={{
  primaryNav: {
    items: ['plugins', 'scheduledTasks'],  // masquer newTask et goals
    render: () => (
      <button onClick={() => console.log('custom action')}>
        🔗 Data Sync
      </button>
    ),
  },
}}
```

### ④ Footer — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ Panneau Paramètres
  | 'version' // étiquette de version (par ex. "v0.19.10")
  | 'theme' // ☀/🌙 bascule clair/sombre
  | 'sessionsOverview' // ▦ panneau de vue d'ensemble des sessions (grands écrans uniquement)
  | 'splitView' // ◧ vue partagée (grands écrans uniquement)
  | 'daemonStatus' // 📊 panneau de statut du démon
  | 'collapse'; // ◁/▷ bascule réduire/développer

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // quels éléments intégrés afficher (par défaut : tous)
  render?: () => ReactNode; // contenu personnalisé rendu à gauche, avant les éléments intégrés
}
```

| Valeur                                         | Effet                         |
| ---------------------------------------------- | ----------------------------- |
| `undefined` (par défaut)                       | Tous les éléments affichés    |
| `false`                                        | Footer entièrement masqué     |
| `{ items: ['settings', 'theme', 'collapse'] }` | Seuls les éléments listés     |

Le footer s'adapte automatiquement aux largeurs réduites : les étiquettes sont masquées et la version
est supprimée sous certains seuils.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // footer minimal
}}
```

Le contenu personnalisé via `render()` apparaît à gauche du footer, avant
les éléments intégrés :

```tsx
sidebar={{
  footer: {
    items: ['collapse'],
    render: () => (
      <button onClick={() => openHelpCenter()}>
        ❓ Aide
      </button>
    ),
  },
}}
```

**Note :** `'scheduledTasks'` et `'goals'` ont été déplacés vers la zone de navigation
principale (②) et sont affichés par défaut. Ils sont contrôlés par `primaryNav.items` au lieu de
`footer.items`.

### Autres options de niveau supérieur

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // afficher/masquer la sidebar (par défaut : true quand passé)
  defaultCollapsed?: boolean; // état réduit initial (persisté dans localStorage)
  showCompactToggle?: boolean; // afficher le bouton de réduction dans la zone de chat (par défaut : true)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // masquer la ligne d'en-tête "Projects" (par défaut : false = affiché)
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### ③ En-tête de projet — `hideProjectHeader`

Contrôle la visibilité de la ligne d'en-tête "Projects" (la ligne avec le bouton
de réduction, l'icône de recherche et le bouton d'ajout de workspace). Par défaut `false` (affiché).

```tsx
sidebar={{
  hideProjectHeader: true,  // masquer la ligne "Projects ▼ [🔍] [＋]"
}}
```

Lorsqu'il est masqué, les entrées de la liste de sessions et les sessions archivées sont toujours affichées —
la ligne d'en-tête avec ses boutons d'action et la barre de recherche de sessions sont supprimés.

### Actions sur les lignes de session — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Détails (sous-menu déroulant)
  | 'rename' // ✏️ Renommer (menu déroulant)
  | 'group' // 📁 Grouper/Déplacer vers un dossier (menu déroulant)
  | 'export' // 📤 Exporter l'historique du chat (menu déroulant)
  | 'delete' // 🗑 Supprimer la session (menu déroulant)
  | 'pin' // 📌 Épingler/Désépingler (bouton inline)
  | 'archive'; // 📦 Archiver (bouton inline)

/** Sous-ensemble avec des gestionnaires inline (bouton au survol) fonctionnels. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'archive'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // quelles actions afficher (par défaut : toutes)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // quels éléments apparaissent comme boutons inline (par défaut : ['pin', 'archive'])
}
```

Contrôle quels boutons d'action apparaissent sur les lignes de session :

- **`items`** : Contrôle principal de toutes les actions (inline et déroulant). Si un élément n'est pas dans `items`, il est masqué partout.
- **`inlineItems`** : Contrôle quels éléments apparaissent comme **boutons inline** (au survol). Par défaut `['pin', 'archive']`. Seuls les éléments avec des gestionnaires inline fonctionnels peuvent être utilisés : `'pin'`, `'archive'`, `'rename'`, `'export'`, `'delete'`. `'details'` et `'group'` sont uniquement en déroulant.

**Priorité de visibilité** : `items` ET la condition intégrée de l'élément ET `inlineItems` doivent tous passer pour que le bouton inline s'affiche. Par exemple, `delete` en inline nécessite que `items` inclue `'delete'` ET que `inlineItems` inclue `'delete'`.

| Valeur                                   | Effet                                        |
| ---------------------------------------- | -------------------------------------------- |
| `undefined` (par défaut)                 | Toutes les actions, pin + archive en inline  |
| `{ inlineItems: ['pin', 'delete'] }`     | Pin + delete comme boutons inline            |
| `{ inlineItems: [] }`                    | Aucun bouton inline                          |
| `{ inlineItems: ['archive', 'export'] }` | Archive + export comme boutons inline        |

Le déclencheur du menu déroulant (⋮) est automatiquement masqué quand aucun élément
déroulant n'est activé. Les boutons inline (`pin`, `archive`) ne sont affichés que lorsque
leur condition de capacité et `items` les incluent tous les deux.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // quelles actions afficher (contrôle principal)
    inlineItems: ['pin', 'delete'],  // pin + delete comme boutons inline
  },
}}
```

## Zones non personnalisables

### Projects / Workspaces (dans la liste de sessions)

Lorsque la liste de sessions est visible, les sous-zones suivantes sont rendues mais
**non personnalisables individuellement** :

| Aspect                  | Détail                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| Source de données       | hook `useSessions()` → API du démon (endpoint `/sessions`)        |
| Tri de la liste         | Par date de création, décroissant                                 |
| Rendu des lignes        | `useCallback` interne `renderSessionRow` — non injectable         |
| Recherche / filtre      | Barre de recherche intégrée avec correspondance texte côté client |
| Groupes de sessions     | Composant `SessionGroupSection` avec 6 couleurs prédéfinies + hex personnalisé |
| Sections de workspace   | `WorkspaceSection` par workspace du démon, non remplaçable        |
| Dialogue d'ajout        | `AddWorkspaceDialog` intégré                                      |

### ⑤ Poignée de redimensionnement

- Poignée de drag sur le bord droit pour redimensionner la largeur de la sidebar
- La largeur est persistée dans localStorage
- Non configurable

## Props de comportement au runtime

Ces `WebShellProps` affectent indirectement le comportement de la sidebar :

| Prop                            | Effet                                    |
| ------------------------------- | ---------------------------------------- |
| `onNewSession`                  | Remplacer le gestionnaire de nouvelle session |
| `onLoadSession`                 | Remplacer la logique de chargement de session |
| `onSessionIdChange`             | Réagir aux changements de session        |
| `splitSessionIds`               | Contrôler les sessions en vue partagée de l'extérieur |
| `theme` / `onThemeChange`       | Contrôler / observer le thème            |
| `language` / `onLanguageChange` | Contrôler / observer la langue de l'UI   |

## États réduit et mobile

| État      | Comportement                                       |
| --------- | -------------------------------------------------- |
| Développé | Sidebar complète avec étiquettes textuelles         |
| Réduit    | Mode rail d'icônes (logo, icône stylo, icônes d'action uniquement) |
| Mobile    | tiroir glisse depuis la gauche avec overlay         |

L'état réduit est persisté dans `localStorage` sous la clé
`qwen-code-web-shell-sidebar-collapsed`.

## Emplacements des sources

| Composant           | Fichier                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`    |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Styles de la sidebar| `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| Intégration App     | `packages/web-shell/client/App.tsx` (chercher `WebShellSidebar`)          |
| Point d'entrée (dev)| `packages/web-shell/client/main.tsx` (`sidebar: true`)                    |
