# Intégration du skill de graphiques Markdown

Statut : accepté

## Contrat d'intégration

Qwen Code WebShell possède le côté rendu du contrat :

- `@qwen-code/web-shell` inclut le renderer `markdown-chart` et le runtime
  ECharts.
- Les hôtes installent le
  [skill `markdown-chart` canonique](https://github.com/datafe/markdown-chart/tree/main/skills/markdown-chart)
  afin que le modèle émette des blocs de graphique affichables.
- Le core de Qwen Code n'embarque ni n'injecte le skill. Un projet peut
  l'installer dans `.qwen/skills/markdown-chart/SKILL.md` ; l'installation de
  skill au niveau utilisateur est aussi prise en charge.

Pour la sortie normale `data.kind="inline"` produite par le skill, l'hôte
WebShell n'a besoin d'aucun code spécifique aux graphiques :

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
/>;
```

## Données référencées

Si l'hôte expose de véritables jeux de données contrôlés au skill et autorise
`data.kind="ref"`, il fournit `resolveDataRef` via un registre personnalisé :

```tsx
import {
  createMarkdownChartRegistry,
  WebShellWithProviders,
} from '@qwen-code/web-shell';

const chartRegistry = createMarkdownChartRegistry({
  resolveDataRef: async (ref, context) =>
    loadControlledChartDataset(ref, context),
});
const markdown = { chart: { registry: chartRegistry } };

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={markdown}
/>;
```

Le renderer ne récupère jamais une ref ni ne lit un chemin local par
lui-même. `resolveDataRef` est la limite possédée par l'hôte, d'une référence
visible par le modèle vers un jeu de données fiable. Le registre par défaut
accepte les refs normalisées `artifact://` et `session-file://`, parse le
bloc comme du JSON, valide l'option, puis passe la ref normalisée plus le
format et les dimensions déclarés au résolveur. Les attentes du résolveur
sont bornées à 30 secondes. Gardez les surcharges `markdown`, `chart` et
`labels` référentiellement stables tant que des graphiques sont montés.

## Comportement de streaming

L'adaptateur React partagé distingue une clôture de graphique fermée de la
clôture de queue active non terminée :

- Un bloc `markdown-chart` fermé s'affiche immédiatement et reste monté
  pendant que le texte de réponse ultérieur streame, y compris lorsque la
  clôture est dans un blockquote.
- Seule la clôture de graphique active non terminée affiche l'état de
  chargement.

## Périmètre

- Le skill définit le contrat de sortie du modèle ; il ne charge pas le
  renderer.
- WebShell définit le contrat de rendu ; il n'installe pas automatiquement le
  skill.
- Aucun changement de négociation de capacité du démon, d'ACP ou du client
  n'est requis.
- Aucun accès réseau ou système de fichiers automatique n'est introduit.
