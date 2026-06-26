# Personnalisation de la conception de la zone de bannière

> Permettre aux utilisateurs de remplacer l'art ASCII QWEN, de remplacer le titre de marque et de masquer entièrement la bannière — sans leur permettre de supprimer les données opérationnelles (version, auth, modèle, répertoire de travail) qui rendent Qwen Code débogable et digne de confiance.

## Aperçu

Le CLI Qwen Code affiche une bannière au démarrage contenant un logo ASCII QWEN et un panneau d'informations bordé. Plusieurs cas d'utilisation réels souhaitent un certain contrôle sur cette surface :

- **Intégration de marque blanche / marque tierce** : les entreprises et les équipes qui intègrent Qwen Code dans leurs propres produits veulent afficher leur identité de marque plutôt que le « Qwen Code » par défaut.
- **Personnalisation** : les individus souhaitent faire correspondre la bannière du terminal à une norme d'équipe ou à leurs goûts personnels.
- **Distinction multi-tenant / multi-instance** : dans les environnements partagés, différentes équipes veulent un signal visuel rapide indiquant l'instance dans laquelle elles se trouvent.

La position de conception est simple : **les éléments de marque sont remplaçables ; les données opérationnelles ne le sont pas**. La personnalisation doit permettre aux utilisateurs de placer leur propre marque au premier plan, mais pas de supprimer les informations qui rendent une session débogable. Cette position guide chaque décision « ce qui peut changer vs ce qui est verrouillé » dans le reste de ce document.

Cela est suivi via [issue #3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Taxonomie des zones de la bannière

Aujourd'hui, la bannière est rendue par `Header` (monté depuis `AppHeader`) et se décompose dans les zones suivantes :

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo Column ─────┐  gap=2  ┌──── Info Panel (bordered) ──────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① Title:    >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   ART ART  ███  │         │  ② Subtitle: «blank, or override»   │  │
│   │  ███ QWEN ASCII ███  │         │  ③ Status:   Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ Path:     ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              region: AppHeader
                          │ Tips component renders below (governed by ui.hideTips) │
```

Les deux boîtes de haut niveau sont :

- **A. Colonne du logo** — un bloc d'art ASCII unique avec un dégradé. Provient aujourd'hui de `shortAsciiLogo` dans `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Panneau d'informations** — une boîte bordée contenant quatre lignes. La deuxième ligne est un espace visuel vide par défaut, éventuellement remplacée par un sous-titre fourni par l'appelant :
  - **B①** Titre : `>_ Qwen Code (vX.Y.Z)` — texte de marque + suffixe de version.
  - **B②** Sous-titre / espace : ligne d'un seul espace vide par défaut. Lorsque `ui.customBannerSubtitle` est défini, cette chaîne occupe cette ligne (par exemple, un fork peut utiliser `Built-in DataWorks Official Skills`).
  - **B③** Statut : `<type d'affichage auth> | <modèle> ( /model pour changer)`.
  - **B④** Chemin : un répertoire de travail raccourci avec tilde.

L'ensemble est enveloppé par `<AppHeader>`, qui conditionne déjà l'affichage de la bannière avec `showBanner = !config.getScreenReader()` (le mode lecteur d'écran revient à une sortie simple).

## Règles de personnalisation — ce qui peut changer, ce qui est verrouillé

| Zone                                      | Source actuelle                      | Catégorie de personnalisation          | Justification                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ----------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Colonne du logo**                    | `shortAsciiLogo` (`AsciiArt.ts`)    | **Remplaçable + masquable automatiquement** | Surface de marque pure. La marque blanche nécessite un contrôle total sur le visuel. Le repli existant « auto-masquage sur les terminaux étroits » est conservé.                                                                                                                                                                                                    |
| **B①. Titre — texte de marque** (`>_ Qwen Code`) | Codé en dur dans `Header.tsx`       | **Remplaçable**                        | Surface de marque. Le glyphe `>_` fait partie de la marque existante ; si un utilisateur souhaite le supprimer, il lui suffit de l'omettre de `customBannerTitle`.                                                                                                                                                                                                  |
| **B①. Titre — suffixe de version** (`(vX.Y.Z)`) | prop `version`                      | **Verrouillé**                         | Essentiel pour les rapports de bugs. Le masquer rendrait la question « quelle version utilisez-vous ? » uniquement accessible via `--version`, ce qui est un coût réel dans les flux de support. Nous échangeons une petite perte pour la marque blanche contre la traçabilité du support.                                                                           |
| **B②. Ligne de sous-titre / espace**       | vide par défaut                     | **Remplaçable**                        | Surface de marque / contexte pure. Utilisée par les forks de marque blanche pour étiqueter la build (par exemple « Built-in DataWorks Official Skills »). Nettoyée comme le titre ; une seule ligne — pas de sauts de ligne qui cassent la mise en page.                                                                                                              |
| **B③. Ligne de statut** (auth + modèle)   | props `formattedAuthType`, `model`  | **Verrouillé**                         | Signal opérationnel et de sécurité. Les utilisateurs doivent toujours voir quelle information d'identification est utilisée et quel modèle dépensera leurs jetons. La supprimer est un risque même pour les scénarios de marque blanche.                                                                                                                            |
| **B④. Ligne de chemin** (répertoire de travail) | prop `workingDirectory`             | **Verrouillé**                         | Opérationnel. « Dans quel répertoire suis-je ? » est une question constante ; la bannière en est la réponse canonique.                                                                                                                                                                                                                                                |
| **Bannière entière** (A + B)               | Montage de `<Header>` dans `AppHeader.tsx` | **Masquable**                          | Un simple `ui.hideBanner: true` ignore les deux zones — même forme que le filtre existant pour le lecteur d'écran. Les `<Tips>` continuent d'être régis indépendamment par `ui.hideTips`.                                                                                                                                                                            |
La matrice se traduit par quatre paramètres, pas plus :

| Paramètre                   | Défaut  | Effet                                                                                                                               | Région affectée |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `ui.hideBanner`             | `false` | Masque toute la bannière (régions A + B).                                                                                            | A + B           |
| `ui.customBannerTitle`      | non défini | Remplace le texte de la marque en B①. Le suffixe de version est toujours ajouté. Tronqué ; une chaîne vide signifie « utiliser la valeur par défaut ». | B① texte de marque |
| `ui.customBannerSubtitle`   | non défini | Remplace la ligne d'espacement vierge B② par un sous-titre sur une ligne. Nettoyé ; limité à 160 caractères ; vide signifie « conserver l'espacement vierge ». | B② espacement   |
| `ui.customAsciiArt`         | non défini | Remplace la région A. Trois formes acceptées (voir ci-dessous). Repli sur la valeur par défaut en cas d'erreur.                     | A               |

Ce qui n'est **pas** proposé, par conception :

- Aucun paramètre ne masque uniquement le suffixe de version.
- Aucun paramètre ne masque uniquement la ligne d'authentification/modèle.
- Aucun paramètre ne masque uniquement la ligne de chemin.
- Aucun paramètre ne modifie les couleurs du dégradé du logo (le thème prend cela en charge).
- Aucun paramètre ne réorganise ou ne restructure le panneau d'informations.

Si l'implémentation doit plus tard exposer l'un de ces éléments, cela devrait être de nouveaux champs avec leur propre justification — pas dérivés des trois champs ci-dessus.

## Guide de configuration utilisateur — comment modifier

### Limites en un coup d'œil

Quelques limites s'appliquent à chaque personnalisation de bannière. Gardez-les à l'esprit avant de créer un art à la main afin que le résolveur ne tronque ou ne rejette pas votre entrée.

| Quoi                             | Limite                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nombre de caractères du titre**        | **80 caractères max** (après nettoyage). Tout élément plus long est tronqué et un avertissement `[BANNER]` est enregistré. Les retours à la ligne et les caractères de contrôle sont supprimés avant que cette longueur ne soit comptée. |
| **Nombre de caractères du sous-titre**     | **160 caractères max** (après nettoyage). Même pipeline de nettoyage que le titre ; même avertissement `[BANNER]` en cas de troncature.                                                             |
| **Taille du bloc d'art ASCII**         | **200 lignes × 200 colonnes max** par niveau. Tout élément plus grand est tronqué pour s'adapter et un avertissement `[BANNER]` est enregistré.                                                              |
| **Taille du fichier d'art ASCII sur disque**  | **64 Ko max**. Les fichiers plus volumineux sont lus jusqu'à la limite ; le reste est ignoré.                                                                                                    |
| **Largeur d'art ASCII qui s'affiche** | Déterminée par les colonnes du terminal au démarrage, **pas** un nombre de caractères fixe. Voir « Quelle largeur le logo peut-il avoir ? » ci-dessous pour la formule et les chiffres par terminal.                     |

Il n'y a **pas de limite fixe de nombre de caractères sur l'art ASCII** — seulement les limites de colonnes/lignes ci-dessus et le budget de largeur par démarrage. Un nom de marque de 17 caractères qui s'afficherait confortablement dans une police peut nécessiter un empilement ou une police plus dense dans une autre ; le facteur limitant est la largeur visuelle, pas les lettres.

### Où se trouvent les paramètres

Les quatre paramètres se trouvent sous `ui` dans `settings.json`. Le niveau utilisateur (`~/.qwen/settings.json`) et le niveau espace de travail (`.qwen/settings.json` à la racine du projet) sont tous deux pris en charge avec la précédence de fusion standard (l'espace de travail remplace l'utilisateur, le système remplace l'espace de travail).

`customAsciiArt` est un cas particulier : plutôt que de traiter l'objet entier comme une valeur unique que la portée de précédence supérieure remplace, le résolveur parcourt les portées par niveau. Si les paramètres utilisateur définissent `{ small }` et les paramètres de l'espace de travail définissent `{ large }`, les deux contribuent — `small` de l'utilisateur, `large` de l'espace de travail. Cela maintient deux choses fonctionnant simultanément :

1. Chaque entrée `{ path }` est résolue par rapport au fichier qui l'a déclarée (`.qwen/` de l'espace de travail vs. `~/.qwen/` de l'utilisateur) ; la vue fusionnée seule perdrait ces informations de portée.
2. Les utilisateurs peuvent conserver un niveau `large` par défaut dans leurs paramètres personnels et ne remplacer que `small` par espace de travail, sans avoir à reformuler l'objet entier.

Lorsque le même niveau est défini dans plusieurs portées, la précédence normale s'applique (système > espace de travail > utilisateur). Définir `customAsciiArt` sur une simple chaîne ou `{ path }` dans n'importe quelle portée remplit toujours les deux niveaux dans cette portée.

### Masquer complètement la bannière

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

La sortie au démarrage ignore à la fois la colonne du logo et le panneau d'informations. Les astuces s'affichent toujours sauf si `ui.hideTips` est également `true`.
### Remplacer le titre de la marque

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

S'affiche sous forme `Acme CLI (vX.Y.Z)` dans le panneau d'informations. Le glyphe `>_` est supprimé lorsqu'un titre personnalisé est défini ; si vous voulez le récupérer, incluez-le vous-même : `"customBannerTitle": ">_ Acme CLI"`.

### Ajouter un sous-titre de marque

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Affiche le sous-titre sur sa propre ligne, dans la couleur de texte secondaire, à la place de l'espace vide qui se trouve normalement entre le titre et la ligne d'authentification/modèle :

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① titre
│ Built-in DataWorks Official Skills                      │  ← B② sous-titre
│ Qwen OAuth | qwen-coder ( /model to change)             │  ← B③ statut
│ ~/projects/example                                      │  ← B④ chemin
└─────────────────────────────────────────────────────────┘
```

Contraintes :

- Une seule ligne seulement. Les sauts de ligne et autres octets de contrôle sont supprimés / repliés en espaces pour qu'une erreur de collage ne casse pas la disposition du panneau d'informations.
- Sanitisé et limité à 160 caractères (plus large que la limite du titre car les slogans / lignes "propulsé par" sont souvent un peu longues).
- Laissez le champ non défini (ou définissez-le sur une chaîne vide / espace blanc) pour conserver la ligne d'espace vide existante — la rétrocompatibilité est la valeur par défaut.
- Le sous-titre ne modifie pas les lignes verrouillées ; l'authentification, le modèle et le répertoire de travail sont toujours visibles quel que soit l'état du sous-titre.

### Remplacer l'art ASCII — chaîne en ligne

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Utilisez `\n` pour intégrer les sauts de ligne dans la chaîne JSON. L'art est rendu avec le thème dégradé actif, tout comme le logo par défaut.

> **Vous n'avez pas d'art ASCII sous la main ?** Utilisez n'importe quel générateur externe et collez le résultat. La méthode la plus simple est `figlet` :
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` puis pointez
> `customAsciiArt: { "path": "./brand.txt" }` vers celui-ci. Le CLI ne rend pas le texte en art au moment de l'exécution — voir la section _Hors du champ_ pour savoir pourquoi.

### Remplacer l'art ASCII — fichier externe

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Évite l'échappement JSON d'une chaîne multiligne. Règles de résolution de chemin :

- **Paramètres de l'espace de travail** : les chemins relatifs sont résolus par rapport au répertoire `.qwen/` de l'espace de travail.
- **Paramètres utilisateur** : les chemins relatifs sont résolus par rapport à `~/.qwen/`.
- Les chemins absolus sont utilisés tels quels.
- Le fichier est lu **une fois au démarrage**, sanitisé et mis en cache. Modifier le fichier en cours de session ne réaffiche pas la bannière — redémarrez le CLI.

### Remplacer l'art ASCII — sensible à la largeur

```jsonc
{
  "ui": {
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

`large` est préféré lorsque le terminal est suffisamment large ; sinon `small` est utilisé ; sinon la colonne du logo est masquée (le repli existant à deux colonnes). Chaque niveau peut être une chaîne ou `{ path }`. Chaque niveau peut être omis : un niveau manquant passe simplement à l'étape suivante.

### Quelle largeur le logo peut-il avoir ? — le budget de taille

Il n'y a pas de limite stricte de nombre de caractères pour le titre ou l'art. Il existe un **budget de largeur** dicté par les colonnes du terminal et une limite absolue pour éviter qu'un fichier mal formé ne bloque la disposition :

| Paramètre                                       | Limite                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Colonnes du terminal au démarrage               | Quel que soit le rapport du terminal de l'utilisateur.                  |
| Marge extérieure du conteneur                   | 4 colonnes (2 à gauche + 2 à droite).                                  |
| Espace entre le logo et le panneau d'informations | 2 colonnes.                                                           |
| Largeur minimale du panneau d'informations       | 44 colonnes (40 chemin + bordure + remplissage).                         |
| **Largeur disponible du logo** (par niveau, au moment du rendu) | `terminalCols − 4 − 2 − 44 = terminalCols − 50`. |
| Limite absolue pour chaque niveau d'art (post-sanitisation) | 200 colonnes × 200 lignes. Tout dépassement est tronqué + avertissement `[BANNER]`. |
| Limite absolue pour `customBannerTitle` (post-sanitisation) | 80 caractères. Tout dépassement est tronqué + avertissement `[BANNER]`. |

Lecture du budget aux largeurs de terminal courantes :

| Colonnes du terminal | Largeur max du logo affichée | Ce que cela signifie en pratique                                                                 |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| 80                   | 30                           | La plupart des lettres figlet "ANSI Shadow" font environ 7 à 11 colonnes — 3 lettres max.        |
| 100                  | 50                           | Un mot court en ANSI Shadow (~6 lettres), ou deux mots courts empilés.                            |
| 120                  | 70                           | L'art de mots multilignes empilés tient confortablement.                                         |
| 200                  | 150                          | Les longues chaînes en ligne comme les noms complets de produits en ANSI Shadow tiennent.         |
Deux implications pratiques lors de la conception de votre art :

1. **Une marque en plusieurs mots ne s'affichera souvent pas comme une seule ligne ANSI Shadow sur la plupart des terminaux.** À environ 7–9 cols par lettre ANSI Shadow, même une marque de 12 caractères comme `Custom Agent` fait environ 95 cols d'art sur une seule ligne — déjà plus que ce qu'un terminal de 100 cols peut offrir à côté du panneau d'informations. Soit empilez les mots sur plusieurs lignes, choisissez une police figlet plus dense, ou utilisez une décoration textuelle compacte sur une seule ligne comme `▶ Custom Agent ◀`.
2. **Utilisez la forme `{ small, large }` sensible à la largeur** lorsqu'un seul niveau vous forcerait à choisir entre « superbe en large / meurt en étroit » et « correct en étroit / gaspille de l'espace en large ». L'exemple ci-dessous empile les mots pour un terminal ≥104 cols dans `large` et passe à une décoration sur une seule ligne de 16 cols dans `small`.

```jsonc
{
  "ui": {
    "customBannerTitle": "Custom Agent",
    "customAsciiArt": {
      "small": "▶ Custom Agent ◀",
      "large": { "path": "./banner-large.txt" },
    },
  },
}
```

Où `banner-large.txt` contient la sortie ANSI Shadow avec mots empilés (~54 cols × 12 lignes), par exemple générée par :

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Combinez les trois

```jsonc
{
  "ui": {
    "hideBanner": false,
    "customBannerTitle": "Acme CLI",
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

### Comment vérifier votre modification

1. Enregistrez `settings.json` et démarrez une nouvelle session `qwen` — la résolution de la bannière s'exécute une fois au démarrage.
2. Redimensionnez le terminal pour confirmer que les niveaux `small` / `large` s'échangent comme prévu, et que la colonne du logo disparaît dans les très petites largeurs.
3. Si quelque chose n'apparaît pas comme prévu, regardez `~/.qwen/debug/<sessionId>.txt` (le lien symbolique `latest.txt` pointe vers la session en cours) et cherchez `[BANNER]` — chaque échec logiciel enregistre une ligne d'avertissement avec la raison sous-jacente.

## Pipeline de résolution

```
   settings.json                              packages/cli/src/ui/components/
   ─────────────                              ──────────────────────────────
   {                                          AppHeader.tsx
     "ui": {                                    │
       "hideBanner": false,                     │  showBanner =
       "customBannerTitle": "Acme",             │      !screenReader
       "customBannerSubtitle": "Built-in …",    │   && !ui.hideBanner
       "customAsciiArt": …                      │
     }                                          │
   }                                            ▼
        │                              <Header
        ▼                                customAsciiArt={resolved.asciiArt}
   loadSettings()                        customBannerTitle={resolved.title}
   merge user / workspace                customBannerSubtitle={resolved.subtitle}
        │                                version=… model=… authType=…
        ▼                                workingDirectory=… />
   resolveCustomBanner(settings)                  │
   ┌─────────────────────────┐                    ▼
   │ 1. normalize to         │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. resolve each tier:   │           │
   │    string → as-is       │           │  pick tier by
   │    {path} → fs.read     │           │    availableTerminalWidth
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │         render Logo Column
   │ 3. sanitize art:        │         render Info Panel:
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 lines × 200    │                   ?? '>_ Qwen Code'
   │    cols                 │           Subtitle = customBannerSubtitle
   │ 4. sanitize title +     │                   ?? blank spacer row
   │    subtitle (single-    │           Status   = locked
   │    line, ≤ 80 / 160     │           Path     = locked
   │    chars)               │
   │ 5. memoize by source    │
   └─────────────────────────┘
```

L'algorithme de résolution en cinq étapes s'exécute une fois au chargement des paramètres, puis de nouveau uniquement lors des événements de rechargement des paramètres :

1. **Normaliser**. Une `string` nue ou `{ path }` devient `{ small: x, large: x }`. Un objet `{ small, large }` est transmis tel quel.
2. **Résoudre chaque niveau**. Pour chaque `AsciiArtSource` :
   - S'il s'agit d'une chaîne, l'utiliser telle quelle.
   - S'il s'agit de `{ path }`, lire le fichier de manière synchrone avec la défense `O_NOFOLLOW` (Windows : lecture seule simple — la constante n'est pas exposée), limitée à 64 Ko. Les chemins relatifs sont résolus par rapport au répertoire du fichier de paramètres propriétaire — les paramètres d'espace de travail par rapport au `.qwen/` de l'espace de travail, les paramètres utilisateur par rapport à `~/.qwen/`. Un échec de lecture enregistre un avertissement `[BANNER]` et revient au défaut pour ce niveau.
3. **Nettoyer**. Un extracteur spécifique à la bannière supprime les leaders OSC / CSI / SS2 / SS3 et remplace chaque autre octet de contrôle C0 / C1 (et DEL) par un espace, tout en préservant `\n` pour que l'art multi-lignes survive. Tronquer les espaces de fin de ligne, puis limiter à 200 lignes × 200 colonnes. Tout ce qui dépasse la limite est tronqué et un avertissement `[BANNER]` est enregistré.
4. **Sélection du niveau au moment du rendu**. Dans `Header.tsx`, étant donné les `small` et `large` résolus, évaluer le budget de largeur existant (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`) :
   - Préférer `large` s'il tient.
   - Sinon revenir à `small` s'il tient.
   - Sinon, **si l'utilisateur a fourni un art personnalisé**, masquer entièrement la colonne du logo (la branche existante `showLogo = false`) — revenir au logo QWEN intégré ici annulerait silencieusement un déploiement en marque blanche sur des terminaux étroits. Le panneau d'informations s'affiche toujours.
   - Sinon (aucun art personnalisé n'a été fourni du tout), passer à `shortAsciiLogo` et laisser la passerelle de largeur existante décider d'afficher ou non le logo par défaut.
5. **Solution de repli**. Si les deux niveaux sont vides ou invalides à cause d'échecs logiciels (fichier manquant, nettoyage ayant tout rejeté, configuration malformée), se comporter comme si aucune personnalisation n'avait été définie : afficher `shortAsciiLogo` et suivre la passerelle de largeur du logo par défaut. Le CLI ne doit jamais planter sur une erreur de configuration de bannière.
Pseudo-code pour la sélection du niveau :

```ts
function pickTier(
  small: string | undefined,
  large: string | undefined,
  availableWidth: number,
  logoGap: number,
  minInfoPanelWidth: number,
): string | undefined {
  for (const candidate of [large, small]) {
    if (!candidate) continue;
    const w = getAsciiArtWidth(candidate);
    if (availableWidth >= w + logoGap + minInfoPanelWidth) {
      return candidate;
    }
  }
  return undefined; // logo column hidden
}
```

## Ajouts au schéma de paramètres

Quatre nouvelles propriétés sont ajoutées à l'objet `ui` dans
`packages/cli/src/config/settingsSchema.ts`, immédiatement après
`shellOutputMaxLines` :

```ts
hideBanner: {
  type: 'boolean',
  label: 'Hide Banner',
  category: 'UI',
  requiresRestart: false,
  default: false,
  description: 'Hide the startup ASCII banner and info panel.',
  showInDialog: true,
},
customBannerTitle: {
  type: 'string',
  label: 'Custom Banner Title',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Replace the default ">_ Qwen Code" title shown in the banner info panel. The version suffix is always appended.',
  showInDialog: false,
},
customBannerSubtitle: {
  type: 'string',
  label: 'Custom Banner Subtitle',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Optional subtitle line rendered between the banner title and the auth/model line. When unset, the info panel keeps its blank spacer row.',
  showInDialog: false,
},
customAsciiArt: {
  type: 'object',
  label: 'Custom ASCII Art',
  category: 'UI',
  requiresRestart: false,
  default: undefined,
  description:
    'Replace the default QWEN ASCII art. Accepts an inline string, {"path": "..."}, or {"small": ..., "large": ...} for width-aware selection.',
  showInDialog: false,
  // The runtime accepts a union the SettingDefinition `type` field can't
  // express. The override is emitted verbatim by the JSON-schema generator
  // so VS Code accepts every documented shape (string, {path}, or
  // {small,large}) without flagging the bare-string form.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` reprend le même motif que `hideTips` (`showInDialog:
true`). Les trois champs libres (titre, sous‑titre, art) restent en
dehors de la boîte de dialogue des paramètres de l’application car un
éditeur ASCII multi‑lignes dans la boîte de dialogue TUI est un projet
en soi ; les utilisateurs avancés éditent directement `settings.json`.

## Modifications de câblage

Les points de touche de l’implémentation sont peu nombreux. Chacun est
décrit ci‑dessous avec le fichier et la plage de lignes dans le `main`
actuel.

`packages/cli/src/ui/components/AppHeader.tsx:53` — étendre `showBanner` :

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — passer la bannière
résolue dans `<Header>` :

```tsx
<Header
  version={version}
  authDisplayType={authDisplayType}
  model={model}
  workingDirectory={targetDir}
  customAsciiArt={resolvedBanner?.asciiArt /* { small?, large? } */}
  customBannerTitle={resolvedBanner?.title /* string | undefined */}
  customBannerSubtitle={resolvedBanner?.subtitle /* string | undefined */}
/>
```

`packages/cli/src/ui/components/Header.tsx` — étendre `HeaderProps` :

```ts
interface HeaderProps {
  customAsciiArt?: { small?: string; large?: string };
  customBannerTitle?: string;
  customBannerSubtitle?: string;
  version: string;
  authDisplayType?: AuthDisplayType;
  model: string;
  workingDirectory: string;
}
```

`packages/cli/src/ui/components/Header.tsx:45-46` — choisir le niveau avant
de calculer `logoWidth`, avec la valeur par défaut existante comme seuil
minimum :

```ts
const tier = pickTier(
  customAsciiArt?.small,
  customAsciiArt?.large,
  availableTerminalWidth,
  logoGap,
  minInfoPanelWidth,
);
const displayLogo = tier ?? shortAsciiLogo;
```

`packages/cli/src/ui/components/Header.tsx` — afficher le titre depuis la
propriété, et utiliser la propriété de sous‑titre à la place de la ligne
d’espacement vide lorsqu’elle est définie :

```tsx
<Text bold color={theme.text.accent}>
  {customBannerTitle ? customBannerTitle : '>_ Qwen Code'}
</Text>
…
{customBannerSubtitle ? (
  <Text color={theme.text.secondary}>{customBannerSubtitle}</Text>
) : (
  <Text> </Text>
)}
```

**Nouveau fichier** : `packages/cli/src/ui/utils/customBanner.ts` — le
résolveur. Exporte :

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

Le résolveur effectue la normalisation, la lecture de fichiers,
l’assainissement et la mise en cache décrits dans le pipeline de
résolution ci‑dessus. Il est appelé une fois au démarrage du CLI et
ré‑exécuté lors des événements de rechargement à chaud des paramètres.
Les chemins de fichiers par portée proviennent directement de
`settings.system.path` / `settings.workspace.path` /
`settings.user.path` de sorte que chaque `{ path }` se résout par
rapport au fichier qui l’a déclaré ; les paramètres d’espace de travail
sont complètement ignorés lorsque `settings.isTrusted` est `false`.

## Autres approches envisagées
Cinq formes de cette fonctionnalité ont été envisagées. Elles sont listées ici afin que les futurs contributeurs comprennent l'espace de conception et puissent reconsidérer le choix si les contraintes changent.

### Option 1 — Trois paramètres plats (RECOMMANDÉ, correspond au ticket)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Effet** : surface minimale exposée à l'utilisateur ; exactement ce que demande le ticket.
- **Avantages** : courbe d'apprentissage nulle ; trivial à documenter ; cohérent avec les propriétés `ui.*` plates existantes (`hideTips`, `customWittyPhrases`, etc.).
- **Inconvénients** : trois clés de premier niveau qui conceptuellement vont ensemble ne sont pas regroupées ; de futurs réglages spécifiques à la bannière (dégradé, sous-titre) ajouteraient d'autres clés sœurs à `ui` au lieu de s'imbriquer proprement.

### Option 2 — Espace de noms imbriqué `ui.banner`

```jsonc
{
  "ui": {
    "banner": {
      "hide": false,
      "title": "Acme CLI",
      "asciiArt": { "path": "./brand.txt" },
    },
  },
}
```

- **Effet** : mêmes capacités que l'option 1, organisées par fonctionnalité.
- **Avantages** : espace de noms propre pour de futurs réglages spécifiques à la bannière ; découverte plus facile via `/settings`.
- **Inconvénients** : s'écarte du libellé exact du ticket ; les réglages UI existants sont principalement plats (seuls `ui.accessibility` et `ui.statusLine` sont imbriqués), donc la cohérence est mitigée ; ajoute un niveau d'imbrication supplémentaire à retenir pour les utilisateurs.

### Option 3 — Préréglages de profil de bannière + surcharges d'emplacements

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* slot overrides for 'branded' */ }
  }
}
```

- **Effet** : les utilisateurs choisissent parmi des préréglages nommés ; les utilisateurs avancés surchargent des emplacements dans un profil choisi.
- **Avantages** : bonne expérience d'intégration ; les préréglages sont fournis avec le CLI.
- **Inconvénients** : complexité significative ; les préréglages sont un engagement de maintenance ; le ticket demande une personnalisation brute, pas une curation.

### Option 4 — Remplacement complet de la bannière (modèle de chaîne unique)

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Effet** : modèle libre unique avec des variables verrouillées renseignées.
- **Avantages** : flexibilité maximale pour des dispositions non standard.
- **Inconvénients** : réimplémente la disposition dans l'espace utilisateur ; perd la résilience à deux colonnes d'Ink face à la largeur du terminal ; très facile d'écrire un modèle qui casse sur les terminaux étroits ; grand rayon d'impact pour une petite fonctionnalité.

### Option 5 — API plugin / hook

Exposer un hook de rendu de bannière via le système d'extensions.

- **Effet** : personnalisation au niveau du code ; les extensions peuvent afficher n'importe quoi.
- **Avantages** : puissance maximale ; permet aux entreprises de livrer un plugin de marque scellé.
- **Inconvénients** : grande surface d'API ; nécessite une revue de sécurité pour le rendu terminal arbitraire ; massivement surdimensionné pour le ticket.

### Recommandation

**Option 1** est recommandée. Elle répond au ticket à la lettre, s'intègre dans le style existant de `ui.*`, et évite de forcer une décision d'espace de noms imbriqué avant de savoir à quoi ressembleraient réellement les autres réglages spécifiques à la bannière. Si à l'avenir des clés sœurs commencent à s'accumuler, la migration vers l'Option 2 est additive — `ui.banner.title` et `ui.customBannerTitle` peuvent coexister pendant une fenêtre de dépréciation.

## Sécurité et gestion des échecs

Le contenu personnalisé de la bannière est rendu textuellement dans le terminal ET, dans le formulaire de chemin, lu depuis le disque. Les deux surfaces sont atteignables par une attaque si un fichier de paramètres hostile ou compromis est chargé. Le même modèle de menace qui pilote la fonctionnalité de titre de session s'applique ici.

| Concern                                                                 | Guard                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Injection ANSI / OSC-8 / CSI dans l'art, le titre ou le sous-titre      | Suppresseur spécifique à la bannière (`sanitizeArt` / `sanitizeSingleLine`) : supprime les leaders OSC / CSI / SS2 / SS3 et remplace tout autre octet de contrôle C0 / C1 (et DEL) par un espace. Appliqué avant le rendu et l'écriture du cache. |
| Fichier trop volumineux bloque le démarrage                             | Limite stricte de 64 Ko sur les lectures de fichiers.                                                                                                                                                                                     |
| Art pathologique bloque la mise en page                                 | Limite de 200 lignes × 200 colonnes sur chaque chaîne résolue. L'excédent est tronqué ; un avertissement `[BANNER]` est enregistré.                                                                                                       |
| Redirection de lien symbolique sur le formulaire de chemin              | `O_NOFOLLOW` sur les lectures de fichiers (Windows : lecture seule simple ; constante non exposée).                                                                                                                                       |
| Fichier manquant ou illisible                                           | Attraper, enregistrer un avertissement `[BANNER]`, revenir au défaut. Ne jamais lancer dans l'interface utilisateur.                                                                                                                      |
| Titre ou sous-titre avec sauts de ligne / longueur excessive            | Sauts de ligne remplacés par des espaces ; limité à 80 (titre) / 160 (sous-titre) caractères.                                                                                                                                             |
| Espace de travail non fiable influençant le rendu ou les lectures de fichiers | Lorsque `settings.isTrusted` est faux, le résolveur ignore complètement `settings.workspace` (reflète le garde de confiance que `settings.merged` applique).                                                                          |
| Condition de concurrence lors du rechargement des paramètres            | La résolution est mémorisée par source (chemin ou hash de chaîne) par appel. Les rechargements réexécutent le résolveur et relisent les fichiers concernés.                                                                               |
Résumé des modes de défaillance : chaque échec bénin aboutit à `shortAsciiLogo` (ou
au titre par défaut verrouillé) plus un avertissement dans le journal de débogage. Les défaillances graves
(erreurs levées) ne sont autorisées dans aucune branche du résolveur.

## Hors du périmètre

Les éléments suivants ont été envisagés et délibérément reportés. Chacun pourra faire l'objet d'un
suivi séparé si une demande utilisateur se manifeste.

| Élément                                                           | Raison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendu texte en ASCII (forme `{ text: "xxxCode" }`)               | Envisagé et rejeté pour la v1. Son ajout nécessiterait soit une dépendance d'exécution `figlet` (~2–3 Mo décompressés une fois un ensemble de polices utilisables inclus), soit un moteur de rendu à police unique intégré (~200 lignes + un fichier de police `.flf` que nous posséderions). Les deux options introduisent une surface de maintenance continue : choix de police, suivi des licences de polices, problèmes de rendu "ma police ne s'affiche pas correctement sur le terminal X" et gestion des caractères CJK / à largeur variable. Le cas d'usage principal de cette fonctionnalité (marque blanche / multi-locataire) implique presque toujours un designer produisant intentionnellement de l'art ASCII, sans se reposer sur une police figlet par défaut. Les utilisateurs qui souhaitent une génération en une ligne peuvent déjà l'obtenir avec `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` — même résultat, sans dépendance ajoutée, sans charge de support dans Qwen Code. Si une demande se manifeste ultérieurement, cette forme est purement additive : étendre `AsciiArtSource` à `string \| {path} \| {text, font?}` sans casser aucune configuration existante. |
| Commande slash `/banner` pour l'édition en direct                 | L'interface de paramètres est la surface d'édition canonique. Un éditeur en direct pour l'art ASCII multi-lignes est un projet en soi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Couleurs de dégradé personnalisées / remplacements de couleur par ligne | Le thème gère les couleurs. Une proposition séparée peut étendre le contrat de thème ; la personnalisation de la bannière ne doit pas dupliquer cette surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Art ASCII chargé depuis une URL                                   | Le chargement réseau au démarrage est une boîte de Pandore — modes de défaillance, mise en cache, revue de sécurité. La forme par chemin de fichier est l'équivalent à moindre risque.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Animation (logo tournant, titre défilant)                         | Ajoute une charge de rendu et des préoccupations d'accessibilité ; rien dans les cas d'usage ne le nécessite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Parité de bannière avec VSCode / Web UI                          | Ces surfaces ne rendent pas la bannière Ink aujourd'hui. Si elles se dotent d'une bannière, cette conception fait référence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Rechargement dynamique lors de la modification du fichier         | Le résolveur s'exécute uniquement au démarrage et lors du rechargement des paramètres. Les changements d'art en cours de session sont suffisamment rares pour que le compromis "redémarrer pour appliquer" soit acceptable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Masquer uniquement certaines régions verrouillées (version, auth, modèle, chemin) | Ce sont des signaux opérationnels ; les supprimer nuit davantage au support et à la posture de sécurité qu'il n'aide les scénarios de marque blanche.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
## Plan de vérification

Pour la future PR d'implémentation, les vérifications de bout en bout suivantes doivent être satisfaites.

1. `~/.qwen/settings.json` avec `customBannerTitle: "Acme CLI"` et une chaîne `customAsciiArt` en ligne → `qwen` affiche le nouveau titre et l'art ; le suffixe de version est toujours présent.
2. `customBannerSubtitle: "Built-in Acme Skills"` → la ligne de sous-titre s'affiche entre le titre et la ligne auth/modèle dans la couleur de texte secondaire ; auth, modèle et chemin restent visibles. La désactiver rétablit la ligne d'espacement vierge (rétrocompatibilité).
3. `hideBanner: true` → `qwen` démarre sans bannière ; les astuces et le chat s'affichent normalement.
4. `customAsciiArt: { "path": "./brand.txt" }` dans un `settings.json` d'espace de travail, avec `brand.txt` à côté dans `.qwen/` → chargement depuis le disque à l'ouverture de l'espace de travail.
5. `customAsciiArt: { "small": "...", "large": "..." }` → redimensionner le terminal entre large / moyen / étroit ; large pour les largeurs larges, small pour les largeurs moyennes, colonne logo cachée pour les largeurs étroites, panneau d'information toujours visible.
6. Injecter `\x1b[31mhostile` dans `customBannerTitle` _et_ `customBannerSubtitle` → les deux s'affichent comme du texte littéral, pas interprétés en rouge.
7. Pointer `path` vers un fichier manquant → le CLI démarre ; un avertissement `[BANNER]` apparaît dans `~/.qwen/debug/<sessionId>.txt` ; l'art par défaut s'affiche.
8. Ouvrir l'arbre de travail avec la confiance de l'espace de travail désactivée → les `customAsciiArt` définis par l'espace de travail (y compris les entrées `{ path }`) sont silencieusement ignorés ; les paramètres de portée utilisateur s'appliquent toujours.
9. `npm test` et `npm run typecheck` réussissent pour le paquet CLI ; les tests unitaires dans `customBanner.test.ts` couvrent chaque forme acceptée et chaque chemin d'échec (fichier manquant, fichier trop volumineux, injection ANSI, objet malformé).
