# Personnalisation de la conception de la bannière

> Permettez aux utilisateurs de remplacer l'art ASCII QWEN, de remplacer le titre de la marque et de masquer entièrement la bannière — sans les laisser supprimer les données opérationnelles (version, authentification, modèle, répertoire de travail) qui rendent Qwen Code débogable et digne de confiance.

## Aperçu

Le CLI Qwen Code affiche une bannière au démarrage contenant un logo ASCII QWEN et un panneau d'informations encadré. Plusieurs cas d'utilisation concrets souhaitent un certain contrôle sur cette surface :

- **Marque blanche / intégration de marque tierce** : les entreprises et les équipes qui intègrent Qwen Code dans leurs propres produits veulent afficher leur identité de marque plutôt que le « Qwen Code » par défaut.
- **Personnalisation** : les individus veulent que la bannière du terminal corresponde à une norme d'équipe ou à leurs propres goûts.
- **Distinction multi-locataire / multi-instance** : dans des environnements partagés, différentes équipes veulent un signal visuel rapide de l'instance dans laquelle elles se trouvent.

La position de conception est simple : **les éléments de marque sont remplaçables ; les données opérationnelles ne le sont pas**. La personnalisation doit permettre aux utilisateurs de placer leur propre image de marque par-dessus, pas de faire taire les informations qui rendent une session débogable. Cette position guide chaque décision « ce qui peut changer vs. ce qui est verrouillé » dans le reste de ce document.

Ceci est suivi par [le ticket #3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Taxonomie des zones de la bannière

Aujourd'hui, la bannière est rendue par `Header` (monté depuis `AppHeader`) et se décompose en zones suivantes :

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Colonne Logo ────┐  gap=2  ┌──── Panneau Info (encadré) ────────┐  │
│   │                      │         │                                     │  │
│   │  ███ ASCII QWEN ███  │         │  ① Titre :    >_ Qwen Code (vX.Y.Z) │  │
│   │  ███   ART ART  ███  │         │  ② Sous-titre : « vide, ou remplacement »    │  │
│   │  ███ ASCII QWEN ███  │         │  ③ Statut :   Qwen OAuth | qwen-…   │  │
│   │                      │         │  ④ Chemin :   ~/projects/exemple    │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              zone : AppHeader
                          │ Le composant Tips s'affiche en dessous (géré par ui.hideTips) │
```

Les deux boîtes de premier niveau sont :

- **A. Colonne Logo** — un bloc d'art ASCII unique avec un dégradé. Provient aujourd'hui de `shortAsciiLogo` dans `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Panneau Info** — une boîte encadrée contenant quatre lignes. La deuxième ligne est un espace visuel vide par défaut, éventuellement remplacée par un sous-titre fourni par l'appelant :
  - **B①** Titre : `>_ Qwen Code (vX.Y.Z)` — texte de la marque + suffixe de version.
  - **B②** Sous-titre / espace : ligne vide d'un seul espace par défaut. Lorsque `ui.customBannerSubtitle` est défini, cette chaîne prend cette ligne (par exemple, un fork pourrait utiliser `Compétences officielles DataWorks intégrées`).
  - **B③** Statut : `<type d'affichage d'auth> | <modèle> ( /model pour changer)`.
  - **B④** Chemin : un répertoire de travail simplifié avec tildification.

L'ensemble est enveloppé par `<AppHeader>`, qui bloque déjà la bannière sur `showBanner = !config.getScreenReader()` (le mode lecteur d'écran revient à une sortie en texte brut).

## Règles de personnalisation — ce qui peut changer, ce qui est verrouillé

| Zone                                      | Source actuelle                        | Catégorie de personnalisation          | Justification                                                                                                                                                                                                                                                          |
| ----------------------------------------- | -------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Colonne Logo**                       | `shortAsciiLogo` (`AsciiArt.ts`)       | **Remplaçable + auto-masquable**       | Surface pure de marque. La marque blanche nécessite un contrôle total du visuel. Le repli existant « auto-masquage sur terminaux étroits » est conservé.                                                                                                               |
| **B①. Titre — texte de marque** (`>_ Qwen Code`) | Codé en dur dans `Header.tsx`          | **Remplaçable**                        | Surface de marque. Le glyphe `>_` fait partie de la marque existante ; si un utilisateur veut le supprimer, il l'omet simplement de `customBannerTitle`.                                                                                                                |
| **B①. Titre — suffixe de version** (`(vX.Y.Z)`) | propriété `version`                    | **Verrouillé**                         | Critique pour les rapports de bugs. Le cacher rend « avec quelle version êtes-vous ? » uniquement répondable via `--version`, ce qui est un coût réel dans les flux de support. Nous sacrifions une petite perte de marque blanche pour la traçabilité du support.       |
| **B②. Ligne de sous-titre / espace**       | vide par défaut                        | **Remplaçable**                        | Surface pure de marque / contexte. Utilisé par les forks en marque blanche pour étiqueter la construction (par exemple « Compétences officielles DataWorks intégrées »). Sanitisé comme le titre ; une seule ligne — pas de sauts de ligne qui cassent la mise en page. |
| **B③. Ligne de statut** (auth + modèle)    | propriétés `formattedAuthType`, `model` | **Verrouillée**                        | Signal opérationnel et de sécurité. Les utilisateurs doivent toujours voir quelle identifiant est utilisé et quel modèle dépensera leurs tokens. Le supprimer est dangereux même pour les scénarios en marque blanche.                                                  |
| **B④. Ligne de chemin** (répertoire de travail) | propriété `workingDirectory`            | **Verrouillée**                        | Opérationnel. « Dans quel répertoire suis-je ? » est une question constante ; la bannière est sa réponse canonique.                                                                                                                                                      |
| **Bannière entière** (A + B)               | montage `<Header>` dans `AppHeader.tsx` | **Masquable**                          | Un simple `ui.hideBanner: true` ignore les deux zones — même forme que la porte existante du lecteur d'écran. `<Tips>` continue d'être géré indépendamment par `ui.hideTips`.                                                                                             |

La matrice se traduit par quatre paramètres, pas plus :

| Paramètre                  | Défaut  | Effet                                                                                                                                    | Zone concernée |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `ui.hideBanner`            | `false` | Masque toute la bannière (zones A + B).                                                                                                  | A + B          |
| `ui.customBannerTitle`     | non défini | Remplace le texte de la marque dans B①. Le suffixe de version est toujours ajouté. Tronqué ; une chaîne vide signifie « utiliser la valeur par défaut ». | B① texte de marque |
| `ui.customBannerSubtitle`  | non défini | Remplace la ligne d'espace vide B② par un sous-titre d'une ligne. Sanitisé ; limité à 160 caractères ; vide signifie « conserver l'espace vide ».     | B② espace      |
| `ui.customAsciiArt`        | non défini | Remplace la zone A. Trois formes acceptées (voir ci-dessous). Revient à la valeur par défaut en cas d'erreur.                           | A              |

Ce qui n'est **pas** proposé, par conception :

- Aucun paramètre ne masque uniquement le suffixe de version.
- Aucun paramètre ne masque uniquement la ligne d'authentification/modèle.
- Aucun paramètre ne masque uniquement la ligne de chemin.
- Aucun paramètre ne modifie les couleurs de dégradé du logo (le thème en est propriétaire).
- Aucun paramètre ne réorganise ou ne restructure le panneau d'informations.

Si l'implémentation devait ultérieurement exposer l'un de ces éléments, ils devraient être de nouveaux champs avec leur propre justification — pas dérivés des trois champs ci-dessus.

## Guide de configuration utilisateur — comment modifier

### Limites en un coup d'œil

Quelques limites s'appliquent à chaque personnalisation de bannière. Gardez-les à l'esprit avant de créer manuellement un art pour que le résolveur ne tronque pas ou ne rejette pas votre entrée.

| Quoi                             | Limite                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nombre de caractères du titre**        | **80 caractères max** (après nettoyage). Tout ce qui est plus long est tronqué et un avertissement `[BANNER]` est journalisé. Les sauts de ligne et les caractères de contrôle sont supprimés avant le décompte. |
| **Nombre de caractères du sous-titre**   | **160 caractères max** (après nettoyage). Même pipeline de nettoyage que le titre ; même avertissement `[BANNER]` en cas de troncature.                                                              |
| **Taille du bloc d'art ASCII**         | **200 lignes × 200 colonnes max** par niveau. Tout ce qui est plus grand est tronqué pour correspondre et un avertissement `[BANNER]` est journalisé.                                                |
| **Taille du fichier d'art ASCII sur disque** | **64 Ko max**. Les fichiers plus grands sont lus jusqu'à la limite ; le reste est ignoré.                                                                                                            |
| **Largeur de l'art ASCII rendu** | Déterminée par les colonnes du terminal au démarrage, **pas** un nombre de caractères fixe. Voir « Quelle largeur le logo peut-il avoir ? » ci-dessous pour la formule et les chiffres par terminal. |

Il n'y a **pas de limite de nombre de caractères fixe sur l'art ASCII** — seulement les limites de colonnes/lignes ci-dessus et le budget de largeur par démarrage. Un nom de marque de 17 caractères qui s'afficherait confortablement dans une police peut nécessiter un empilement ou une police plus dense dans une autre ; le facteur limitant est la largeur visuelle, pas les lettres.

### Où se trouvent les paramètres

Les quatre paramètres se trouvent sous `ui` dans `settings.json`. Les niveaux utilisateur (`~/.qwen/settings.json`) et espace de travail (`.qwen/settings.json` à la racine du projet) sont tous deux pris en charge avec la précédence de fusion standard (l'espace de travail écrase l'utilisateur, le système écrase l'espace de travail).

`customAsciiArt` est un cas particulier : plutôt que de traiter l'objet entier comme une valeur unique que la portée de précédence supérieure remplace, le résolveur parcourt les portées par niveau. Si les paramètres utilisateur définissent `{ small }` et les paramètres de l'espace de travail définissent `{ large }`, les deux contribuent — `small` de l'utilisateur, `large` de l'espace de travail. Cela permet de faire fonctionner deux choses à la fois :

1. Chaque entrée `{ path }` est résolue par rapport au fichier qui l'a déclarée (`.qwen/` de l'espace de travail vs. `~/.qwen/` de l'utilisateur) ; la vue fusionnée seule perdrait cette information de portée.
2. Les utilisateurs peuvent conserver un niveau `large` par défaut dans leurs paramètres personnels et remplacer uniquement `small` par espace de travail, sans restater tout l'objet.

Lorsque le même niveau est défini dans plusieurs portées, la précédence normale s'applique (système > espace de travail > utilisateur). Définir `customAsciiArt` sur une chaîne nue ou `{ path }` dans n'importe quelle portée remplit toujours les deux niveaux dans cette portée.

### Masquer entièrement la bannière

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

La sortie de démarrage ignore à la fois la colonne logo et le panneau d'informations. Les astuces continuent de s'afficher sauf si `ui.hideTips` est également `true`.

### Remplacer le titre de la marque

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Affiche `Acme CLI (vX.Y.Z)` dans le panneau d'informations. Le glyphe `>_` est supprimé lorsqu'un titre personnalisé est défini ; si vous voulez le récupérer, incluez-le vous-même : `"customBannerTitle": ">_ Acme CLI"`.

### Ajouter un sous-titre de marque

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Compétences officielles DataWorks intégrées",
  },
}
```

Affiche le sous-titre sur sa propre ligne, dans la couleur de texte secondaire, à la place de l'espace vide qui se trouve normalement entre le titre et la ligne d'authentification/modèle :

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① titre
│ Compétences officielles DataWorks intégrées                      │  ← B② sous-titre
│ Qwen OAuth | qwen-coder ( /model to change)             │  ← B③ statut
│ ~/projects/example                                      │  ← B④ chemin
└─────────────────────────────────────────────────────────┘
```

Contraintes :

- Une seule ligne. Les sauts de ligne et autres octets de contrôle sont supprimés / transformés en espaces pour qu'une erreur de collage ne casse pas la mise en page du panneau d'informations.
- Limité à 160 caractères après nettoyage (plus large que la limite du titre car les slogans / lignes « propulsé par » sont souvent un peu longs).
- Laissez le champ non défini (ou définissez-le sur une chaîne vide / espaces) pour conserver la ligne d'espace vide existante — la rétrocompatibilité est la valeur par défaut.
- Le sous-titre ne modifie pas les lignes verrouillées ; l'authentification, le modèle et le répertoire de travail sont toujours visibles quel que soit l'état du sous-titre.

### Remplacer l'art ASCII — chaîne inline

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Utilisez `\n` pour intégrer les sauts de ligne dans la chaîne JSON. L'art est rendu avec le thème de dégradé actif comme pour le logo par défaut.

> **Vous n'avez pas d'art ASCII sous la main ?** Utilisez n'importe quel générateur externe et collez le résultat. Le chemin le plus simple est `figlet` : `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` puis pointez `customAsciiArt: { "path": "./brand.txt" }` vers le fichier. Le CLI ne rend pas le texte en art au moment de l'exécution — voir la section _Hors périmètre_ pour savoir pourquoi.

### Remplacer l'art ASCII — fichier externe

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Évite d'échapper une chaîne multi-lignes en JSON. Règles de résolution de chemin :

- **Paramètres de l'espace de travail** : les chemins relatifs sont résolus par rapport au répertoire `.qwen/` de l'espace de travail.
- **Paramètres utilisateur** : les chemins relatifs sont résolus par rapport à `~/.qwen/`.
- Les chemins absolus sont utilisés tels quels.
- Le fichier est lu **une fois au démarrage**, nettoyé et mis en cache. Éditer le fichier en cours de session ne réaffiche pas la bannière — redémarrez le CLI.

### Remplacer l'art ASCII — adapté à la largeur

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

`large` est préféré lorsque le terminal est suffisamment large ; sinon `small` est utilisé ; sinon la colonne logo est masquée (le repli existant à deux colonnes). Chaque niveau peut être une chaîne ou `{ path }`. Chaque niveau peut être omis : un niveau manquant passe simplement à l'étape suivante.

### Quelle largeur le logo peut-il avoir ? — le budget de taille

Il n'y a pas de limite de nombre de caractères dure sur le titre ou l'art. Il y a un **budget de largeur** déterminé par les colonnes du terminal et une limite dure absolue pour empêcher un fichier malformé de bloquer la mise en page :

| Bouton                                             | Limite                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Colonnes du terminal au démarrage                  | Ce que rapporte le terminal de l'utilisateur.                           |
| Marge extérieure du conteneur                      | 4 cols (2 gauche + 2 droite).                                           |
| Espace entre le logo et le panneau info            | 2 cols.                                                                 |
| Largeur minimale du panneau info                   | 44 cols (40 chemin + bordure + padding).                                |
| **Largeur de logo disponible** (par niveau, au rendu) | `terminalCols − 4 − 2 − 44 = terminalCols − 50`.                         |
| Limite dure sur chaque niveau d'art (après nettoyage) | 200 cols × 200 lignes. Tout ce qui dépasse est tronqué + avertissement `[BANNER]`. |
| Limite dure sur `customBannerTitle` (après nettoyage) | 80 caractères. Tout ce qui dépasse est tronqué + avertissement `[BANNER]`. |

Lecture du budget aux largeurs de terminal courantes :

| Colonnes du terminal | Largeur max du logo rendu | Ce que cela signifie en pratique                                           |
| -------------------- | ------------------------- | -------------------------------------------------------------------------- |
| 80                   | 30                        | La plupart des lettres « ANSI Shadow » de figlet font ~7–11 cols — 3 lettres max. |
| 100                  | 50                        | Un mot court en ANSI Shadow (~6 lettres), ou deux mots courts empilés.     |
| 120                  | 70                        | Un art de mots multi-lignes empilé tient confortablement.                  |
| 200                  | 150                       | Les chaînes inline longues comme les noms de produits complets en ANSI Shadow tiennent. |

Deux implications pratiques lors de la conception de votre art :

1. **Un nom de marque multi-mots ne s'affichera souvent pas comme une seule ligne ANSI Shadow sur la plupart des terminaux.** À ~7–9 cols par lettre ANSI Shadow, même un nom de marque de 12 caractères comme `Custom Agent` fait environ 95 cols d'art sur une seule ligne — déjà plus qu'un terminal de 100 cols ne peut en allouer à côté du panneau info. Soit empilez les mots sur plusieurs lignes, choisissez une police figlet plus dense, ou utilisez une décoration de texte compacte sur une seule ligne comme `▶ Custom Agent ◀`.
2. **Utilisez la forme adaptée à la largeur `{ small, large }`** lorsqu'un seul niveau vous forcerait à choisir entre « rendu superbe en large / meurt en étroit » et « rendu correct en étroit / gaspille de l'espace en large ». L'exemple ci-dessous empile les mots pour un terminal ≥104 cols dans `large` et passe à une décoration sur une ligne de 16 cols dans `small`.

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

Où `banner-large.txt` contient la sortie ANSI Shadow des mots empilés (~54 cols × 12 lignes), par exemple, générée par :

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Combiner les trois

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

1. Sauvegardez `settings.json` et démarrez une nouvelle session `qwen` — la résolution de la bannière s'exécute une fois au démarrage.
2. Redimensionnez le terminal pour confirmer que les niveaux `small` / `large` s'échangent comme prévu, et que la colonne logo disparaît aux très petites largeurs.
3. Si quelque chose ne s'affiche pas comme prévu, regardez dans `~/.qwen/debug/<sessionId>.txt` (le lien symbolique `latest.txt` pointe vers la session actuelle) et cherchez `[BANNER]` — chaque échec non blocant journalise une ligne d'avertissement avec la raison sous-jacente.

## Pipeline de résolution

```
   settings.json                              packages/cli/src/ui/components/
   ─────────────                              ──────────────────────────────
   {                                          AppHeader.tsx
     "ui": {                                    │
       "hideBanner": false,                     │  showBanner =
       "customBannerTitle": "Acme",             │      !lecteurEcran
       "customBannerSubtitle": "Intégrée …",    │   && !ui.hideBanner
       "customAsciiArt": …                      │
     }                                          │
   }                                            ▼
        │                              <Header
        ▼                                customAsciiArt={résolu.asciiArt}
   loadSettings()                        customBannerTitle={résolu.title}
   fusionner utilisateur / espace de travail                customBannerSubtitle={résolu.subtitle}
        │                                version=… model=… authType=…
        ▼                                workingDirectory=… />
   resolveCustomBanner(paramètres)                  │
   ┌─────────────────────────┐                    ▼
   │ 1. normaliser vers      │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. résoudre chaque      │           │
   │    niveau :             │           │  choisir niveau par
   │    chaîne → telle quelle│           │    largeurTerminalDisponible
   │    {path} → fs.read     │           ▼
   │      O_NOFOLLOW         │         rendre Colonne Logo
   │      ≤ 64 Ko            │         rendre Panneau Info :
   │ 3. nettoyer l'art :     │           Titre    = customBannerTitle
   │    supprimerSéquences   │                   ?? '>_ Qwen Code'
   │    ≤ 200 lignes × 200    │           Sous-titre = customBannerSubtitle
   │    cols                 │                   ?? ligne d'espace vide
   │ 4. nettoyer titre +     │           Statut   = verrouillé
   │    sous-titre (une      │           Chemin   = verrouillé
   │    ligne, ≤ 80 / 160    │
   │    caractères)          │
   │ 5. mémoriser par source │
   └─────────────────────────┘
```
L'algorithme de résolution en cinq étapes s'exécute une fois au chargement des paramètres,
et à nouveau uniquement lors des événements de rechargement des paramètres :

1. **Normaliser**. Une `string` nue ou `{ path }` devient
   `{ small: x, large: x }`. Un objet `{ small, large }` passe tel quel.
2. **Résoudre chaque niveau**. Pour chaque `AsciiArtSource` :
   - S'il s'agit d'une chaîne, l'utiliser telle quelle.
   - S'il s'agit de `{ path }`, lire le fichier de manière synchrone avec la protection
     `O_NOFOLLOW` (Windows : lecture seule simple — la constante n'est pas exposée),
     limitée à 64 Ko. Les chemins relatifs sont résolus par rapport au _répertoire du
     fichier de paramètres propriétaire_ — les paramètres de l'espace de travail par rapport
     à `.qwen/` de l'espace de travail, les paramètres utilisateur par rapport à `~/.qwen/`.
     Un échec de lecture enregistre un avertissement `[BANNER]` et revient à la valeur par
     défaut pour ce niveau.
3. **Assainir**. Un nettoyeur spécifique à la bannière supprime les préfixes
   OSC / CSI / SS2 / SS3 et remplace chaque autre octet de contrôle C0 / C1 (et DEL) par
   un espace, tout en préservant `\n` pour que l'art multi-lignes survive.
   Supprimer les espaces de fin de ligne, puis limiter à 200 lignes × 200 colonnes.
   Tout ce qui dépasse la limite est tronqué et un avertissement `[BANNER]` est enregistré.
4. **Sélection de niveau au rendu**. Dans `Header.tsx`, avec les résolutions
   `small` et `large`, évaluer le budget de largeur existant
   (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`) :
   - Préférer `large` s'il tient.
   - Sinon, revenir à `small` s'il tient.
   - Sinon, **si l'utilisateur a fourni un art personnalisé**, masquer entièrement la colonne
     du logo (la branche existante `showLogo = false`) — revenir ici au logo QWEN inclus
     annulerait silencieusement un déploiement en marque blanche sur les terminaux étroits.
     Le panneau d'information s'affiche toujours.
   - Sinon (aucun art personnalisé n'a été fourni du tout) passer à
     `shortAsciiLogo` et laisser la barrière de largeur existante décider d'afficher ou non
     le logo par défaut.
5. **Repli**. Si les deux niveaux sont vides ou invalides en raison d'échecs
   logiciels (fichier manquant, assainissement rejetant tout, configuration malformée),
   se comporter comme si aucune personnalisation n'avait été définie : afficher
   `shortAsciiLogo` et suivre la barrière de largeur du logo par défaut. Le CLI
   ne doit jamais planter sur une erreur de configuration de bannière.

Pseudo-code pour la sélection de niveau :

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
  return undefined; // colonne logo masquée
}
```

## Ajouts au schéma des paramètres

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

`hideBanner` suit le modèle existant `hideTips` (`showInDialog :
true`). Les trois champs libres (titre, sous-titre, art) restent en
dehors de la boîte de dialogue des paramètres de l'application car un
éditeur ASCII multi-lignes dans la boîte de dialogue TUI est un projet
en soi ; les utilisateurs avancés éditent `settings.json`
directement.

## Modifications de câblage

Les points de touche de l'implémentation sont peu nombreux. Chacun est décrit ci-dessous avec le
fichier et la plage de lignes de la branche `main` actuelle.

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

`packages/cli/src/ui/components/Header.tsx:45-46` — choisir le niveau avant de
calculer `logoWidth`, avec la valeur par défaut existante comme plancher :

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

`packages/cli/src/ui/components/Header.tsx` — afficher le titre à partir de
la propriété, et utiliser la propriété de sous-titre à la place de la ligne
d'espacement vierge lorsqu'elle est définie :

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

**Nouveau fichier** : `packages/cli/src/ui/utils/customBanner.ts` — le résolveur.
Exportations :

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

Le résolveur effectue la normalisation, les lectures de fichiers, l'assainissement et la
mise en cache décrits dans le pipeline de résolution ci-dessus. Il est appelé une fois
au démarrage du CLI et réexécuté lors des événements de rechargement à chaud des paramètres. Les chemins
de fichiers par portée proviennent de `settings.system.path` / `settings.workspace.path`
/ `settings.user.path` directement, de sorte que chaque `{ path }` soit résolu par rapport au
fichier qui l'a déclaré ; les paramètres de l'espace de travail sont ignorés lorsque
`settings.isTrusted` est faux.

## Approches alternatives envisagées

Cinq formes de cette fonctionnalité ont été envisagées. Elles sont listées ici afin que
les futurs contributeurs comprennent l'espace de conception et puissent reconsidérer le
choix si les contraintes changent.

### Option 1 — Trois paramètres plats (RECOMMANDÉE, correspond à l'issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Effet** : surface utilisateur minimale ; exactement ce que demande l'issue.
- **Avantages** : courbe d'apprentissage nulle ; documentation triviale ; cohérent avec
  les propriétés `ui.*` plates existantes (`hideTips`, `customWittyPhrases`,
  etc.).
- **Inconvénients** : trois clés de premier niveau qui appartiennent conceptuellement ensemble
  ne sont pas regroupées ; de futurs boutons propres à la bannière (dégradé, sous-titre)
  ajouteraient plus de frères à `ui` au lieu de s'imbriquer proprement.

### Option 2 — Espace de noms `ui.banner` imbriqué

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
- **Avantages** : espace de noms propre pour de futurs boutons propres à la bannière ; découverte
  plus facile via `/settings`.
- **Inconvénients** : s'écarte du libellé exact de l'issue ; les paramètres d'interface
  existants sont pour la plupart plats (seuls `ui.accessibility` et `ui.statusLine`
  sont imbriqués), donc la cohérence est mitigée ; ajoute un niveau d'imbrication à retenir
  pour les utilisateurs.

### Option 3 — Profils de bannière prédéfinis + remplacements d'emplacements

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* slot overrides for 'branded' */ }
  }
}
```

- **Effet** : les utilisateurs choisissent parmi des préréglages nommés ; les utilisateurs avancés
  remplacent des emplacements à l'intérieur d'un profil choisi.
- **Avantages** : bonne expérience d'intégration ; les préréglages sont fournis avec le CLI.
- **Inconvénients** : complexité importante ; les préréglages sont un engagement de maintenance
  ; l'issue demande une personnalisation brute, pas une curation.

### Option 4 — Remplacement complet de la bannière (modèle de chaîne unique)

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Effet** : modèle libre unique avec des variables verrouillées remplies.
- **Avantages** : flexibilité maximale pour des mises en page non standard.
- **Inconvénients** : réimplémente la mise en page dans l'espace utilisateur ; perd la résilience
  à deux colonnes d'Ink face à la largeur du terminal ; très facile d'écrire un modèle qui
  casse sur les terminaux étroits ; grande portée pour une petite fonctionnalité.

### Option 5 — API de plugin / hook

Exposer un hook de rendu de bannière via le système d'extensions.

- **Effet** : personnalisation au niveau du code ; les extensions peuvent afficher n'importe quoi.
- **Avantages** : puissance maximale ; permet aux entreprises d'expédier un plugin de marque
  scellé.
- **Inconvénients** : grande surface d'API ; nécessite une revue de sécurité pour le rendu
  terminal arbitraire ; largement surdimensionné pour l'issue.

### Recommandation

**L'option 1** est recommandée. Elle satisfait l'issue textuellement, s'insère dans
le style `ui.*` existant et évite de forcer une décision d'espace de noms imbriqué
avant de savoir à quoi ressembleraient réellement les autres boutons propres à la bannière.
Si des frères s'accumulent à l'avenir, la migration vers l'option 2 est
additive — `ui.banner.title` et `ui.customBannerTitle` peuvent coexister
pendant une fenêtre de dépréciation.

## Gestion de la sécurité et des échecs

Le contenu de la bannière personnalisée est rendu textuellement dans le terminal ET, dans
le formulaire de chemin, lu depuis le disque. Les deux surfaces sont atteignables par une attaque si un
fichier de paramètres hostile ou compromis est chargé. Le même modèle de menace qui
conduit la fonctionnalité de titre de session s'applique ici.

| Problème                                                | Protection                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection ANSI / OSC-8 / CSI dans l'art, le titre ou le sous-titre | Nettoyeur spécifique à la bannière (`sanitizeArt` / `sanitizeSingleLine`) : supprime les préfixes OSC / CSI / SS2 / SS3 et remplace chaque autre octet de contrôle C0 / C1 (et DEL) par un espace. Appliqué avant le rendu et l'écriture du cache. |
| Fichier surdimensionné bloquant le démarrage            | Limite stricte de 64 Ko sur les lectures de fichiers.                                                                                                                                                                        |
| Art pathologique bloquant la mise en page               | Limite de 200 lignes × 200 colonnes sur chaque chaîne résolue. L'excédent est tronqué ; un avertissement `[BANNER]` est enregistré.                                                                                         |
| Redirection de lien symbolique sur le formulaire de chemin | `O_NOFOLLOW` sur les lectures de fichiers (Windows : lecture seule simple ; constante non exposée).                                                                                                                          |
| Fichier manquant ou illisible                           | Attraper, enregistrer un avertissement `[BANNER]`, revenir à la valeur par défaut. Ne jamais lancer d'exception dans l'interface.                                                                                            |
| Titre ou sous-titre avec sauts de ligne / longueur excessive | Les sauts de ligne sont transformés en espaces ; limité à 80 (titre) / 160 (sous-titre) caractères.                                                                                                                          |
| Espace de travail non fiable influençant le rendu ou les lectures | Lorsque `settings.isTrusted` est faux, le résolveur ignore `settings.workspace` entièrement (reflète la barrière de confiance que `settings.merged` applique).                                                               |
| Condition de concurrence sur le rechargement des paramètres | La résolution est mémorisée par source (chemin ou hash de chaîne) par appel. Les rechargements réexécutent le résolveur et relisent les fichiers affectés.                                                                   |

Récapitulatif des modes d'échec : chaque échec logiciel aboutit à `shortAsciiLogo` (ou
au titre verrouillé par défaut) plus un avertissement de journal de débogage. Les échecs
matériels (exceptions levées) ne sont pas autorisés dans aucune branche du résolveur.

## Hors du champ d'application

Ces éléments ont été envisagés et délibérément reportés. Chacun peut faire l'objet d'un
suivi séparé si la demande des utilisateurs se manifeste.

| Élément                                                               | Pourquoi pas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendu texte vers ASCII (formulaire `{ text: "xxxCode" }`)               | Envisagé et rejeté pour la v1. Ajouter cela nécessiterait soit une dépendance d'exécution `figlet` (~2–3 Mo décompressés une fois qu'un ensemble utilisable de polices est inclus), soit un moteur de rendu à police unique intégré (~200 lignes + un fichier de police `.flf` que nous posséderions). Les deux options apportent une surface continue : sélection de police, suivi de licence de police, problèmes « ma police ne s'affiche pas correctement sur le terminal X », et gestion des caractères CJK / large. Le cas d'utilisation principal de cette fonctionnalité (marque blanche / multi-locataire) implique presque toujours un designer produisant intentionnellement de l'art ASCII, pas un recours à une police figlet par défaut. Les utilisateurs qui souhaitent une génération sur une seule ligne peuvent déjà l'obtenir avec `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` — même résultat, aucune dépendance ajoutée, aucune charge de support dans Qwen Code. Si la demande apparaît plus tard, cette forme est purement additive : étendre `AsciiArtSource` à `string \| {path} \| {text, font?}` sans casser aucune configuration existante. |
| Commande slash `/banner` pour édition en direct                       | L'interface des paramètres est la surface d'édition canonique. Un éditeur en direct pour l'art ASCII multi-lignes est son propre projet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Couleurs de dégradé personnalisées / remplacements de couleur par ligne | Les couleurs appartiennent au thème. Une proposition séparée peut étendre le contrat de thème ; la personnalisation de la bannière ne devrait pas dupliquer cette surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Art ASCII chargé via URL                                               | Le chargement réseau au démarrage est un sac de nœuds — modes d'échec, mise en cache, revue de sécurité. Le formulaire de chemin de fichier est l'équivalent à moindre risque.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Animation (logo tournant, titre défilant)                             | Ajoute une charge de rendu et des problèmes d'accessibilité ; rien dans les cas d'utilisation n'en a besoin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Parité de bannière avec l'interface VSCode / Web                      | Ces surfaces n'affichent pas la bannière Ink aujourd'hui. Si elles développent une bannière, cette conception est la référence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Rechargement dynamique sur modification de fichier                    | Le résolveur s'exécute au démarrage et uniquement lors du rechargement des paramètres. Les changements d'art en milieu de session sont assez rares pour que « redémarrer pour appliquer » soit un compromis acceptable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Masquage de régions verrouillées individuelles (version, auth, modèle, chemin) | Ce sont des signaux opérationnels ; les supprimer nuit plus à l'assistance et à la posture de sécurité qu'elle n'aide les scénarios de marque blanche.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
## Plan de vérification

Pour la future PR d'implémentation, les vérifications de bout en bout suivantes devraient réussir.

1. `~/.qwen/settings.json` avec `customBannerTitle: "Acme CLI"` et une chaîne `customAsciiArt` en ligne → `qwen` affiche le nouveau titre et l'art ; le suffixe de version est toujours présent.
2. `customBannerSubtitle: "Built-in Acme Skills"` → la ligne de sous-titre s'affiche entre le titre et la ligne auth/modèle dans la couleur de texte secondaire ; auth, modèle et chemin restent visibles. La désactiver restaure la ligne d'espacement vierge (rétrocompatibilité).
3. `hideBanner: true` → `qwen` démarre sans bannière ; les astuces et le chat s'affichent normalement.
4. `customAsciiArt: { "path": "./brand.txt" }` dans un `settings.json` d'espace de travail, avec `brand.txt` à côté dans `.qwen/` → charge depuis le disque à l'ouverture de l'espace de travail.
5. `customAsciiArt: { "small": "...", "large": "..." }` → redimensionner le terminal entre large / moyen / étroit ; large aux grandes largeurs, petit aux largeurs moyennes, colonne logo cachée aux largeurs étroites, panneau d'information toujours visible.
6. Injecter `\x1b[31mhostile` dans `customBannerTitle` _et_ `customBannerSubtitle` → les deux s'affichent en texte littéral, sans être interprétés en rouge.
7. Pointer `path` vers un fichier manquant → le CLI démarre ; l'avertissement `[BANNER]` apparaît dans `~/.qwen/debug/<sessionId>.txt` ; l'art par défaut s'affiche.
8. Ouvrir l'arborescence de travail avec la confiance de l'espace de travail désactivée → le `customAsciiArt` défini par l'espace de travail (y compris les entrées `{ path }`) est ignoré silencieusement ; les paramètres de l'utilisateur s'appliquent toujours.
9. `npm test` et `npm run typecheck` réussissent pour le paquet CLI ; les tests unitaires dans `customBanner.test.ts` couvrent chaque forme acceptée et chaque chemin d'échec (fichier manquant, fichier trop volumineux, injection ANSI, objet mal formé).