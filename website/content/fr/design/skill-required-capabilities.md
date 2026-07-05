# Conception des capacités requises pour les skills

Statut : note de conception ; cette PR poursuit avec l'Option B et laisse
`required-capabilities` comme proposition future.

## Contexte

Web Shell peut rendre des blocs de code délimités personnalisés via son moteur de rendu markdown. La proposition du moteur de rendu de graphiques utilise un bloc de code délimité `echarts-fulldata` afin que le modèle puisse retourner une option ECharts complète et une charge utile de dataset que Web Shell rend sous forme de graphique interactif.

Ce contrat de sortie n'est utile que dans les clients capables de le rendre. Dans la CLI, les clients ACP, ou toute autre surface sans moteur de rendu correspondant, la même réponse apparaîtrait comme un grand bloc de code au lieu d'un graphique.

La proposition initiale du skill de graphique intégré s'appuyait sur des instructions textuelles pour indiquer au modèle que le format est destiné à Web Shell. C'est une protection souple. Si le skill est exposé dans une session non-Web-Shell, le modèle peut toujours choisir un format de sortie que le client ne peut pas rendre.

Pour la PR actuelle, Qwen Code conserve le point d'extension du moteur de rendu dans Web Shell mais n'intègre pas `qwencode-viz` dans le core. Le package Web Shell inclut un template de skill copiable et non chargé automatiquement, et les hôtes doivent installer ou injecter ce skill uniquement lorsqu'ils enregistrent également un moteur de rendu `echarts-fulldata`.

## Problème

Qwen Code a besoin d'un moyen clair de décider si un skill spécifique à un hôte doit être montré au modèle et aux utilisateurs.

Pour `qwencode-viz`, la question concrète est :

- Le core doit-il prendre en charge un champ de métadonnées de skill générique `required-capabilities` ?
- Ou `qwencode-viz` ne doit-il pas être un skill intégré au core, et plutôt être fourni uniquement par les clients Web Shell qui l'installent ou l'injectent ?

## Objectifs

- Empêcher l'exposition des skills spécifiques à un moteur de rendu lorsque le client actuel ne peut pas satisfaire leur contrat de sortie.
- Maintenir la cohérence des rappels de skills au démarrage, de l'activation explicite des skills, de la découverte des commandes slash et de la validation des skills.
- Éviter de coder en dur `qwencode-viz` comme un cas particulier.
- Préserver le comportement existant des skills lorsqu'aucune exigence de capacité n'est déclarée.
- Garder la conception extensible pour les futures capacités de l'hôte, et pas seulement pour ECharts.

## Non-objectifs

- Implémenter le moteur de rendu ECharts lui-même.
- Refondre toute la négociation des capacités client/serveur.
- Modifier la sémantique du frontmatter des skills existants.
- Résoudre les changements de capacité des sessions partagées multi-clients dans la première version.

## Mécanismes connexes actuels

La base de code possède déjà plusieurs contrôles de visibilité, mais aucun ne représente les capacités de rendu du client :

- `disable-model-invocation` : empêche un skill d'être auto-invoqué par le modèle.
- `user-invocable` : contrôle si un skill intégré est disponible en tant que commande.
- `paths` : limite la disponibilité des skills aux chemins d'espace de travail correspondants.
- `skills.disabled` : désactive les skills configurés.
- `allowedTools` : actuellement utilisé par le chargement des skills intégrés pour masquer les skills orientés cron lorsque les outils cron ne sont pas disponibles.
- `supportedModes` des commandes slash : filtre les commandes par mode d'exécution.
- Objets de capacité Daemon et ACP : décrivent le support du protocole ou du client, mais ne sont pas actuellement connectés à l'exposition des skills.

Il n'existe pas de frontmatter de skill `required-capabilities` ou équivalent. L'ajouter constituerait un nouveau contrat de skill.

## Option A : Ajouter `required-capabilities`

Ajouter un champ de frontmatter de skill générique :

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

Lorsque le client/la session actuel(le) n'annonce pas toutes les capacités listées, le skill est considéré comme indisponible.

### Nommage des capacités

Utiliser des capacités sous forme de chaînes de caractères avec espace de noms :

```text
markdown.codeBlock.echarts-fulldata
```

Cela garde le champ générique tout en rendant le contrat précis :

- `markdown` : la capacité appartient au markdown rendu.
- `codeBlock` : la capacité s'applique au rendu des blocs de code délimités.
- `echarts-fulldata` : la chaîne de langue/info spécifique supportée par le moteur de rendu.

De futurs exemples pourraient être :

- `markdown.codeBlock.vega-lite`
- `markdown.codeBlock.mermaid-interactive`
- `artifact.openUrl`

### Métadonnées des skills

Ajouter `requiredCapabilities?: string[]` à la configuration du skill après l'analyse de la clé de frontmatter `required-capabilities`.

Les deux chemins d'analyse des skills doivent comprendre ce champ :

- `packages/core/src/skills/skill-load.ts`
- `packages/core/src/skills/skill-manager.ts`

Le champ doit être optionnel. Absent ou vide signifie que le skill n'a aucune exigence de capacité client.

### Source des capacités au runtime

Ajouter les capacités client/session à la configuration du runtime :

```ts
interface ConfigParameters {
  clientCapabilitiesProvider?: () => ReadonlySet<string>;
}
```

Exposer un helper sur `Config`, par exemple :

```ts
config.getClientCapabilities(): ReadonlySet<string>
```

Puis centraliser la vérification :

```ts
function skillMeetsRequiredCapabilities(skill: Skill, config: Config): boolean {
  return skill.config.requiredCapabilities.every((capability) =>
    config.getClientCapabilities().has(capability),
  );
}
```

### Points de filtrage

Le filtre de capacité doit être appliqué avant que les skills ne soient exposés au modèle ou à l'utilisateur :

- `collectAvailableSkillEntries` dans `packages/core/src/tools/skill-utils.ts` doit ignorer les skills dont les capacités requises sont manquantes. Cela maintient l'alignement des rappels de skills au démarrage, des rappels delta, de la validation de `SkillTool` et de l'activation invocable par le modèle.
- `BundledSkillLoader` doit ignorer les skills intégrés indisponibles lors de la création des commandes destinées à l'utilisateur.
- `SkillCommandLoader` doit ignorer les skills du système de fichiers indisponibles lors de la création des commandes destinées à l'utilisateur.

L'invariant important est qu'un skill masqué pour le modèle ne doit pas continuer à apparaître comme une commande invocable, sauf si le projet supporte intentionnellement un override manuel.

### Enregistrement dans Web Shell

Web Shell doit annoncer explicitement le support du moteur de rendu plutôt que de s'appuyer sur la présence d'un callback `renderCodeBlock` opaque.

Par exemple :

```tsx
<WebShell
  customization={{
    markdown: {
      renderableCodeBlockLanguages: ['echarts-fulldata'],
      renderCodeBlock(info) {
        // render custom blocks
      },
    },
  }}
/>
```

Le client Web Shell peut mapper cela à :

```text
markdown.codeBlock.echarts-fulldata
```

Cela rend la déclaration de capacité stable même si le callback du moteur de rendu contient une logique personnalisée, des fallbacks ou plusieurs langages supportés.

### Propagation Daemon et ACP

Pour les sessions hébergées ou basées sur un daemon, l'ensemble des capacités du client doit atteindre le core avant que les skills ne soient chargés ou listés. Une version minimale peut transmettre les capacités lors de la création d'une session :

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

Le bridge daemon, le SDK et le flux de création de session ACP peuvent stocker cela comme une configuration à l'échelle de la session.

Pour la première version, les capacités peuvent être à l'échelle de la session. Si plusieurs clients s'attachent à la même session, le comportement doit être documenté comme utilisant les capacités du moment de la création de la session.

### Avantages

- Conserve `qwencode-viz` comme un unique skill intégré canonique.
- Empêche les contrats de sortie spécifiques à l'hôte de fuiter dans les clients non supportés.
- Crée un mécanisme réutilisable pour les futurs skills spécifiques à un moteur de rendu ou à un hôte.
- Rend la dépendance explicite et testable.

### Inconvénients

- Ajoute un nouveau champ de métadonnées de skill transversal.
- Nécessite le câblage des capacités client/session à travers les surfaces Web Shell, daemon, SDK et ACP.
- Nécessite une documentation attentive pour le comportement des sessions partagées.
- Pourrait représenter plus de mécanisme que nécessaire si `qwencode-viz` est le seul skill prévu dont l'accès est conditionné par une capacité.

## Option B : Skill fourni par le client

Ne pas ajouter de champ générique `required-capabilities`. À la place, éviter d'intégrer `qwencode-viz` dans le core. Le client Web Shell, ou tout client supportant le moteur de rendu, fournit le skill lui-même.

Modèles de distribution possibles :

- L'hôte Web Shell installe `.qwen/skills/qwencode-viz/SKILL.md`.
- Le package Web Shell fournit un template de skill optionnel et non chargé automatiquement qu'un hôte peut copier ou installer lorsque le rendu de graphiques est activé.
- L'intégration Web Shell fournit un package de skill d'extension.
- L'intégration Web Shell injecte des instructions de modèle équivalentes uniquement lorsque son moteur de rendu de graphiques est activé.

Dans ce modèle, le skill n'est disponible que parce que le client de rendu a choisi de le fournir.

### Avantages

- Modification minimale du core.
- Pas de nouveau contrat de métadonnées de skill global.
- La disponibilité des capacités est naturellement détenue par le client qui implémente le moteur de rendu.
- Évite le câblage daemon ou ACP sauf si le client possède déjà un mécanisme d'injection de skills.

### Inconvénients

- Pas de skill intégré canonique à moins que tous les clients ne copient le même contenu.
- Plus de charge pour chaque intégrateur Web Shell.
- Les utilisateurs passant d'un client à l'autre pourraient constater une disponibilité incohérente des skills.
- Ne met pas en place de garde-fou général pour les futurs skills spécifiques à un hôte.
- Plus difficile à tester dans le core car la disponibilité dépend d'une installation ou d'une injection externe.

## Recommandation

Pour cette PR, utiliser l'Option B.

Cela laisse le système de skills du core inchangé et évite d'exposer les instructions `echarts-fulldata` dans les clients non supportés. Le hook du moteur de rendu Web Shell reste utile pour tout moteur de rendu de blocs appartenant à l'hôte, tandis que les instructions de modèle spécifiques aux graphiques deviennent un opt-in explicite de l'hôte.

À plus long terme, discuter de cela comme une décision de limite produit/API.

Choisir l'Option A si les mainteneurs s'attendent à ce que Qwen Code supporte davantage de contrats de sortie rendus par le client au fil du temps. Dans ce cas, `required-capabilities` est un petit contrat général qui maintient l'exposition des skills cohérente à travers la CLI, Web Shell, ACP et les futurs clients.

Choisir l'Option B si `qwencode-viz` est appelé à rester une extension exclusive à Web Shell et que les mainteneurs ne veulent pas que les skills du core dépendent des fonctionnalités de rendu du client. Dans ce cas, le skill intégré actuel doit être retiré du core et fourni par les clients Web Shell qui supportent `echarts-fulldata`.

Le défaut futur recommandé est l'Option A uniquement si les mainteneurs sont à l'aise pour faire des capacités client/session une partie intégrante du système de skills. Sinon, garder les skills de moteur de rendu de l'hôte sous la responsabilité du client.

## Questions ouvertes

- Les capacités doivent-elles être à l'échelle de la session, de la requête ou du client ?
- Les capacités manquantes doivent-elles masquer les commandes invocables par l'utilisateur, ou seulement masquer l'activation des skills invocables par le modèle ?
- Les noms des capacités doivent-elles être des chaînes de forme libre ou validées par rapport à un registre connu ?
- Les skills indisponibles doivent-ils être entièrement masqués de `/skills`, ou affichés comme désactivés avec une raison ?
- Doit-il y avoir un override manuel pour les utilisateurs qui souhaitent intentionnellement émettre des blocs bruts `echarts-fulldata` dans des clients non supportés ?
- Le nom du champ doit-il être `required-capabilities`, `requires-capabilities` ou `client-capabilities` ?

## Plan de validation

Si l'Option A est implémentée, ajouter des tests pour :

- L'analyse du frontmatter dans les deux chemins d'analyse des skills.
- `collectAvailableSkillEntries` masquant un skill lorsque des capacités sont manquantes.
- Le même skill apparaissant lorsque les capacités sont présentes.
- L'interaction avec `paths`, `skills.disabled` et `disable-model-invocation`.
- La visibilité des commandes `BundledSkillLoader` et `SkillCommandLoader`.
- Le mapping Web Shell des langages de blocs de code supportés vers les capacités du client.
- La création de session Daemon ou ACP préservant l'ensemble des capacités.
- Les tests d'intégration des skills intégrés existants, pour s'assurer que les skills sans `required-capabilities` restent inchangés.

## Migration

Les skills existants ne nécessitent aucune migration car le nouveau champ est optionnel.

Pour le chemin actuel de l'Option B, retirer le skill de graphique des skills intégrés au core. Le template du package Web Shell ne doit pas être chargé automatiquement par le core ; les hôtes y souscrivent en l'installant ou en l'injectant.

Si l'Option A est acceptée, ajouter :

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

à un futur `qwencode-viz` intégré.

Si l'Option B est acceptée, retirer le skill de graphique des skills intégrés au core et documenter comment les clients Web Shell peuvent l'installer ou l'injecter lorsqu'ils enregistrent un moteur de rendu `echarts-fulldata`.