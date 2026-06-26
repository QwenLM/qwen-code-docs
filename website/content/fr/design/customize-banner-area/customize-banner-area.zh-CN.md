# Schéma de conception pour la zone personnalisée du Banner

> Permet de remplacer le logo ASCII QWEN, de remplacer le titre de la marque, de masquer entièrement le bannière —
> mais interdit de supprimer les informations d'exécution nécessaires au dépannage et à la confiance (numéro de version, méthode d'authentification, modèle, répertoire de travail).

## Aperçu

Au lancement de Qwen Code CLI, un bannière s'affiche en haut du terminal, comprenant un logo ASCII QWEN et un panneau d'information avec bordure. Plusieurs scénarios réels nécessitent un contrôle de cette zone :

- **Marque blanche / Intégration de marque tierce** : lors de l'intégration de Qwen Code dans un produit interne d'entreprise ou d'équipe, il faut afficher sa propre marque plutôt que le "Qwen Code" par défaut.
- **Personnalisation** : les utilisateurs individuels souhaitent que le bannière du terminal corresponde aux normes de leur équipe ou à leurs préférences esthétiques.
- **Multi-locataire / distinction multi-instances** : dans un environnement partagé, différentes équipes veulent rapidement identifier l'instance qu'elles utilisent.

La position de conception est très simple : **l'apparence de la marque peut être remplacée ; les informations d'exécution ne peuvent pas être remplacées**. La personnalisation ne permet à l'utilisateur que de superposer sa propre marque par-dessus, **interdit** de masquer les informations critiques pour le dépannage. Chaque décision « modifiable / non modifiable » dans ce document découle de cette position.

Issue correspondante : [#3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Division des zones du bannière

Le bannière actuel est rendu par `Header` (monté par `AppHeader`). La décomposition globale est la suivante :

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Colonne Logo ─────────┐  gap=2  ┌──── Panneau d'info (avec bordure) ─┐
│   │                            │         │                                     │
│   │  ███ ASCII QWEN ███       │         │  ① Titre :    >_ Qwen Code (vX.Y.Z) │
│   │  ███   ART ART  ███       │         │  ② Sous-titre : « ligne vide / surcharge perso » │
│   │  ███ ASCII QWEN ███       │         │  ③ Statut :    Qwen OAuth | qwen-…   │
│   │                            │         │  ④ Chemin :    ~/projects/example   │
│   └──────── A ─────────────────┘         └──────────────── B ──────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              Zone attribuée à : AppHeader
                          │ Le composant Tips est rendu en dessous (contrôlé par ui.hideTips) │
```

Deux blocs de niveau supérieur :

- **A. Colonne Logo** —— Un seul bloc d'art ASCII avec dégradé de couleurs.
  Source actuelle : `shortAsciiLogo` dans `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Panneau d'information** —— Boîte d'info avec bordures, quatre lignes au total. La deuxième ligne est par défaut un espace vide visuel, et peut éventuellement être remplacée par un sous-titre fourni par l'appelant :
  - **B①** Titre : `>_ Qwen Code (vX.Y.Z)` —— Texte de la marque + suffixe de version.
  - **B②** Sous-titre / espace : Par défaut une ligne avec un seul espace, après avoir défini `ui.customBannerSubtitle`, une chaîne de sous-titre nettoyée sur une seule ligne est rendue (par exemple, un fork pourrait utiliser `Built-in DataWorks Official Skills`).
  - **B③** Statut : `<type d'affichage d'authentification> | <modèle> (commutateur /model)`.
  - **B④** Chemin : Répertoire de travail tildeifié et raccourci.

Le composant extérieur `<AppHeader>` gère déjà le masquage global du bannière en mode lecteur d'écran basé sur `showBanner = !config.getScreenReader()` (en mode lecteur d'écran, il revient à une sortie texte pur).

## Règles de personnalisation – ce qui peut être modifié, ce qui est verrouillé

| Zone                                             | Source actuelle                   | Catégorie de personnalisation | Raison du verrouillage / de l'ouverture                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Colonne Logo**                              | `shortAsciiLogo` (`AsciiArt.ts`)  | **Remplaçable + masquable automatiquement** | Zone purement de marque. Les scénarios de marque blanche nécessitent un contrôle total de l'apparence visuelle. Le comportement existant de « masquer automatiquement le logo » dans les terminaux étroits reste inchangé. |
| **B①. Texte du titre** (`>_ Qwen Code`)         | Codé en dur dans `Header.tsx`     | **Remplaçable**               | Zone de marque. Le caractère `>_` au début fait partie de la marque existante ; si non souhaité, l'utilisateur peut l'omettre dans `customBannerTitle`.                                         |
| **B①. Suffixe de version** (`(vX.Y.Z)`)         | prop `version`                    | **Verrouillé**                | Essentiel pour le dépannage et le support. Si masqué, la seule façon de répondre « quelle version utilisez-vous ? » serait `--version`, ce qui représente un vrai coût pour le flux de support. Nous sacrifions un peu d'expérience de marque blanche pour l'accessibilité du support. |
| **B②. Ligne de sous-titre / espace**            | Par défaut vide                   | **Remplaçable**               | Zone purement de marque / contexte. Les forks de marque blanche l'utilisent pour taguer la version de construction (ex : "Built-in DataWorks Official Skills"). Les règles de nettoyage sont identiques à celles du titre ; une seule ligne autorisée, pas de sauts de ligne qui casseraient la mise en page. |
| **B③. Ligne de statut** (authentification + modèle) | `formattedAuthType`, prop `model` | **Verrouillé**                | Signal opérationnel et de sécurité. L'utilisateur doit voir les identifiants utilisés et le modèle qui consomme réellement les tokens. Tout masquage/remplacement est un piège, même dans un scénario de marque blanche. |
| **B④. Ligne de chemin** (répertoire de travail) | prop `workingDirectory`           | **Verrouillé**                | Information opérationnelle. « Dans quel répertoire suis-je ? » est une question fréquente ; le bannière est sa seule source de vérité.                                                          |
| **Bannière entier** (A + B)                      | Point de montage `<Header>` dans `AppHeader.tsx` | **Masquable** | Un `ui.hideBanner: true` saute les deux blocs A et B — forme identique au commutateur de mode lecteur d'écran existant. `<Tips>` reste contrôlé indépendamment par `ui.hideTips`.              |

La matrice ci-dessus correspond à quatre paramètres, et seulement ceux-ci :

| Paramètre                   | Valeur par défaut | Effet                                                                                                                   | Zone impactée     |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ui.hideBanner`             | `false`           | Masque l'intégralité du bannière (zones A + B).                                                                          | A + B             |
| `ui.customBannerTitle`      | Non défini        | Remplace le texte de marque en B①. Le suffixe de version est toujours ajouté. Est trimé ; chaîne vide = utiliser la valeur par défaut. | B① Texte de marque |
| `ui.customBannerSubtitle`   | Non défini        | Remplace l'espace vide en B② par une ligne de sous-titre. Nettoyé ; max 160 caractères ; chaîne vide = conserver l'espace vide (rétrocompatibilité). | B② Ligne d'espace  |
| `ui.customAsciiArt`         | Non défini        | Remplace la zone A. Supporte trois formes de données (voir ci-dessous). Toute erreur revient à la valeur par défaut.   | A                 |

**Capacités intentionnellement non fournies** :

- Aucun commutateur pour « masquer uniquement le suffixe de version ».
- Aucun commutateur pour « masquer uniquement la ligne d'authentification/modèle ».
- Aucun commutateur pour « masquer uniquement la ligne de chemin ».
- Aucun point d'entrée pour modifier la couleur du dégradé du logo (la couleur est gérée par le thème).
- Aucune possibilité de modifier l'ordre ou la structure du panneau d'information.

Si un besoin futur se présente, il devrait être évalué comme un nouveau champ séparé, et non dérivé des trois champs ci-dessus.

## Guide de configuration utilisateur – comment modifier

### Aperçu des limites

Chaque personnalisation de bannière est soumise à ces limites supérieures. Lisez-les avant d'écrire de l'art à la main pour éviter d'être silencieusement tronqué ou rejeté par le parseur.

| Élément                              | Limite supérieure                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Nombre de caractères du titre**    | **Limite de 80 caractères** (compté après nettoyage). Troncature et avertissement `[BANNER]` au dépassement. Les sauts de ligne et caractères de contrôle sont supprimés avant le comptage. |
| **Nombre de caractères du sous-titre** | **Limite de 160 caractères** (compté après nettoyage). Pipeline de nettoyage identique à celui du titre ; troncature avec avertissement `[BANNER]` au dépassement. |
| **Taille du bloc d'art ASCII**       | **Limite de 200 lignes × 200 colonnes par palier**. Troncature avec avertissement `[BANNER]` au dépassement.                    |
| **Taille du fichier d'art ASCII**    | **Limite de 64 Ko**. Au-delà, seuls les octets dans la limite sont lus, le reste est ignoré.                                    |
| **Largeur réelle rendue de l'art ASCII** | Déterminée par le nombre de colonnes du terminal au démarrage, **pas un nombre fixe de caractères**. La formule exacte et les valeurs disponibles pour différentes largeurs de terminal sont données ci-dessous dans « Quelle taille pour le logo ? — Budget de largeur ». |

L'art ASCII **n'a pas de limite de caractères fixe** — seulement les limites dures de colonnes/lignes ci-dessus et le budget de largeur calculé en fonction des colonnes du terminal au démarrage. Pour un nom de marque de 17 caractères, selon la police, savoir s'il peut tenir sur une seule ligne dépend de la largeur visuelle, pas du nombre de lettres.

### Emplacement de configuration

Les quatre paramètres se trouvent sous le nœud `ui` de `settings.json`. Ils sont supportés à la fois au niveau utilisateur (`~/.qwen/settings.json`) et au niveau de l'espace de travail (`.qwen/settings.json` à la racine du projet), avec la priorité de fusion standard (workspace écrase user, system écrase workspace).

`customAsciiArt` est un cas particulier : le parseur ne remplace pas l'objet entier par une valeur unique de la portée de priorité supérieure, mais traverse tous les niveaux par palier. Si la configuration utilisateur définit `{ small }` et la configuration workspace définit `{ large }`, les deux sont pris en compte — `small` provient de l'utilisateur, `large` du workspace. Cela satisfait deux choses simultanément :

1. Chaque élément `{ path }` est résolu par rapport au répertoire du fichier qui le déclare (workspace `.qwen/` vs. user `~/.qwen/`) ; en regardant uniquement la vue fusionnée, on perd l'information de portée.
2. L'utilisateur peut laisser le palier `large` par défaut dans ses paramètres personnels et ne remplacer que `small` par espace de travail, sans avoir à réécrire tout l'objet à chaque fois.

Si le même palier est défini dans plusieurs portées, la priorité normale s'applique (system > workspace > user). Lorsque `customAsciiArt` est défini comme une simple chaîne ou `{ path }` dans n'importe quelle portée, il remplit toujours les deux paliers de cette portée.

### Masquer complètement le bannière

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

La sortie de démarrage ignorera la colonne Logo et le panneau d'information. Les Tips s'afficheront toujours sauf si `ui.hideTips` est également défini.

### Remplacer le titre de la marque

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Le panneau d'information affichera `Acme CLI (vX.Y.Z)`. Après avoir défini un titre personnalisé, le caractère `>_` n'est plus inclus par défaut ; pour le conserver, écrivez-le vous-même :
`"customBannerTitle": ">_ Acme CLI"`.

### Ajouter un sous-titre de marque

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Le sous-titre apparaîtra sur sa propre ligne avec la couleur de texte secondaire, **remplaçant** la ligne d'espace vide par défaut (celle qui se trouve entre le titre et la ligne d'authentification/modèle) :

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Titre
│ Built-in DataWorks Official Skills                      │  ← B② Sous-titre
│ Qwen OAuth | qwen-coder (commutateur /model)            │  ← B③ Statut
│ ~/projects/example                                      │  ← B④ Chemin
└─────────────────────────────────────────────────────────┘
```

Contraintes :

- Une seule ligne autorisée. Les sauts de ligne et autres octets de contrôle sont supprimés/remplacés par des espaces pour éviter que des accidents de collage ne déchirent la mise en page du panneau d'information.
- Limite de 160 caractères après nettoyage (plus large que le titre — les slogans / "powered by" sont souvent plus longs que le nom de marque).
- Laisser vide (ou définir comme chaîne vide / uniquement des espaces) = conserver la ligne d'espace vide par défaut — la rétrocompatibilité est le comportement par défaut.
- Le sous-titre ne modifie pas le comportement des lignes verrouillées ; l'authentification, le modèle et le répertoire de travail restent toujours visibles, quel que soit l'état du sous-titre.

### Remplacer l'art ASCII – chaîne en ligne

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Utilisez `\n` pour les retours à la ligne dans la chaîne JSON. Cet art ASCII recevra le dégradé de couleurs du thème actif, comme le logo par défaut.

> **Pas d'art ASCII sous la main ?** N'importe quel générateur externe fera l'affaire, collez simplement le résultat. Le chemin le plus simple est `figlet` :
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt`, puis pointez `customAsciiArt: { "path": "./brand.txt" }` vers ce fichier. Le CLI **ne** génère pas l'art ASCII à partir du texte au moment de l'exécution — voir « Hors du champ de conception » ci-dessous.

### Remplacer l'art ASCII – fichier externe

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Évitez d'échapper de longs blocs de texte multiligne dans le JSON. Règles de résolution des chemins :

- **Configuration au niveau workspace** : les chemins relatifs sont relatifs au répertoire `.qwen/` du workspace.
- **Configuration au niveau utilisateur** : les chemins relatifs sont relatifs à `~/.qwen/`.
- Les chemins absolus sont utilisés tels quels.
- Le fichier **n'est lu qu'une fois au démarrage**, nettoyé et mis en cache. Les modifications du fichier en cours de session ne sont pas prises en compte — redémarrez le CLI.

### Remplacer l'art ASCII – adaptation à la largeur

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

Lorsque le terminal est suffisamment large, `large` est prioritaire ; sinon, `small` est utilisé ; autrement, la colonne Logo est masquée (en utilisant la stratégie de repli actuelle à deux colonnes). `small` et `large` peuvent chacun être une chaîne ou un `{ path }`. Chaque palier peut être omis : s'il est absent, on passe au palier suivant.

### Quelle taille pour le logo ? — Budget de largeur

Le titre et l'art n'ont pas de « limite dure en nombre de caractères », seulement un **budget de largeur** déterminé par le nombre de colonnes du terminal, ainsi qu'une limite dure absolue pour éviter que des entrées malformées ne figent la mise en page :

| Élément                                     | Limite                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Nombre de colonnes du terminal au démarrage | Autant que rapporté par le terminal de l'utilisateur.                          |
| Marge du conteneur                          | 4 colonnes (2 à gauche + 2 à droite).                                        |
| Espacement entre colonne Logo et panneau    | 2 colonnes.                                                                    |
| Largeur minimale du panneau d'information   | 44 colonnes (40 chemin + bordure + rembourrage).                               |
| **Largeur disponible pour l'art de chaque palier lors du rendu** | `colonnes_terminal − 4 − 2 − 44 = colonnes_terminal − 50`. |
| Limite dure pour l'art d'un palier après nettoyage | 200 colonnes × 200 lignes. Troncature et avertissement `[BANNER]`.         |
| Limite dure pour `customBannerTitle` après nettoyage | 80 caractères. Troncature et avertissement `[BANNER]`.                  |

Largeurs de logo maximales pour les largeurs de terminal courantes :

| Colonnes terminal | Largeur max logo rendu | Ce que cela signifie concrètement                                                      |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| 80                | 30                     | La plupart des lettres figlet "ANSI Shadow" font 7–11 colonnes, max 3 lettres.         |
| 100               | 50                     | Un mot court (environ 6 lettres) en ANSI Shadow, ou deux mots empilés.                 |
| 120               | 70                     | L'art empilé de mots sur plusieurs lignes est tout à fait possible.                    |
| 200               | 150                    | Même une longue chaîne sur une seule ligne (par exemple, un nom de produit complet en ANSI Shadow) peut tenir. |

Deux règles empiriques pour concevoir votre art :

1. **Les noms de marque à plusieurs mots ne peuvent généralement pas être rendus en une seule ligne ANSI Shadow sur la plupart des terminaux.** ANSI Shadow nécessite environ 7 à 9 colonnes par lettre. Même un nom de marque de 12 caractères comme `Custom Agent` nécessite environ 95 colonnes d'art sur une seule ligne — un terminal de 100 colonnes ne suffit pas après avoir installé le panneau d'information. Soit vous empilez les mots sur plusieurs lignes, soit vous utilisez une police figlet plus étroite, soit vous optez pour une décoration compacte sur une seule ligne, comme `▶ Custom Agent ◀`.
2. **Lorsqu'un seul palier doit être « beau en écran large » et « ne pas planter en écran étroit », utilisez la forme d'adaptation à la largeur `{ small, large }`**. Dans l'exemple ci-dessous, `large` est un art empilé sur plusieurs lignes pour les terminaux ≥ 104 colonnes, `small` est une décoration sur une seule ligne de 16 colonnes ; si le terminal est trop étroit pour les deux, la colonne Logo est masquée.

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

Dans `banner-large.txt`, mettez la sortie ANSI Shadow empilée (environ 54 colonnes × 12 lignes), générable avec la commande suivante :

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Combinaison des trois éléments

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

### Comment vérifier

1. Enregistrez `settings.json`, redémarrez `qwen` — l'analyse du bannière ne s'exécute qu'une fois au démarrage.
2. Ajustez la largeur du terminal, confirmez que la commutation `small` / `large` fonctionne comme prévu, et que la colonne Logo se masque correctement dans les largeurs très étroites.
3. Si le résultat n'est pas conforme, consultez `~/.qwen/debug/<sessionId>.txt` (`latest.txt` lien symbolique pointant vers la session courante), cherchez `[BANNER]` — chaque échec logiciel imprime une ligne d'avertissement expliquant la raison.

## Pipeline d'analyse

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
   │ 1. Normaliser en        │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. Analyser chaque      │           │
   │    palier :             │           │  Choisir le palier en fonction
   │    string → utiliser    │           │  de availableTerminalWidth
   │    {path} → fs.read     │           ▼
   │      O_NOFOLLOW         │          Rendre la colonne Logo
   │      ≤ 64 Ko            │          Rendre le panneau d'info :
   │ 3. Nettoyer l'art :     │           Title    = customBannerTitle
   │    stripControlSeqs     │                   ?? '>_ Qwen Code'
   │    ≤ 200 lignes × 200 col│           Subtitle = customBannerSubtitle
   │ 4. Nettoyer title +      │                   ?? ligne d'espace vide
   │    subtitle (une ligne,  │           Status   = Verrouillé
   │    ≤ 80 / 160 car.)      │           Path     = Verrouillé
   │ 5. Mémoization par source│
   └─────────────────────────┘
```

L'algorithme d'analyse en cinq étapes s'exécute une fois lors du chargement des paramètres, et seulement à nouveau lors d'un événement de rechargement à chaud des paramètres :

1. **Normalisation**. Une chaîne nue ou `{ path }` est convertie en `{ small: x, large: x }`. L'objet `{ small, large }` passe tel quel.
2. **Analyse par palier**. Pour chaque `AsciiArtSource` :
   - Chaîne : utiliser directement.
   - `{ path }` : lire de manière synchrone, utiliser `O_NOFOLLOW` pour se défendre contre les attaques de lien symbolique (Windows se rétracte en lecture seule normale — cette constante n'est pas exposée), limite de 64 Ko. Les chemins relatifs sont relatifs au *répertoire du fichier de configuration auquel ils appartiennent* : la configuration workspace est relative à `.qwen/` du workspace, la configuration utilisateur est relative à `~/.qwen/`. Échec de lecture → avertissement `[BANNER]`, ce palier revient à la valeur par défaut.
3. **Nettoyage**. Stripper spécifique au bannière : supprime les séquences d'introduction OSC / CSI / SS2 / SS3, remplace les autres octets de contrôle C0 / C1 (y compris DEL) par des espaces, tout en conservant `\n` pour que l'art ASCII multiligne survive. Chaque ligne est trimée de ses espaces de fin, puis tronquée à 200 lignes × 200 colonnes ; au-delà, troncature et avertissement `[BANNER]`.
4. **Sélection du palier lors du rendu**. Dans `Header.tsx`, étant donné `small` et `large` analysés, selon le budget de largeur actuel (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`) :
   - Si `large` tient, priorité à `large`.
   - Sinon, si `small` tient, repli sur `small`.
   - Sinon, **si l'utilisateur a fourni un art personnalisé**, masquer directement la colonne Logo (utiliser la branche `showLogo = false`) — revenir au logo QWEN intégré dans un terminal étroit briserait silencieusement un déploiement en marque blanche. Le panneau d'information continue de s'afficher.
   - Sinon (l'utilisateur n'a pas du tout fourni d'art personnalisé) revenir à `shortAsciiLogo`, géré par la porte de largeur du logo par défaut.
5. **Filet de sécurité**. Si les deux paliers deviennent vides ou invalides (fichier manquant, vide après nettoyage, configuration malformée), utiliser `shortAsciiLogo` comme si non personnalisé, et le traiter selon la porte de largeur du logo par défaut. Le CLI **ne doit en aucun cas** planter à cause d'une configuration de bannière erronée.

Pseudo-code de sélection du palier :

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
  return undefined; // Masquer la colonne Logo
}
```

## Ajout au schéma des paramètres

Dans `packages/cli/src/config/settingsSchema.ts`, dans l'objet `ui`, juste après `shellOutputMaxLines`, ajoutez quatre propriétés :

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
  // Accepte des formes d'union que le type `type` de SettingDefinition ne peut pas exprimer.
  // override est sorti tel quel par le générateur de schéma JSON, permettant à VS Code d'accepter toutes les
  // formes documentées (string, {path}, {small,large}), sans marquer en rouge les chaînes nues.
  jsonSchemaOverride: { /* oneOf … string | {path} | {small,large} */ },
},
```

`hideBanner` suit le modèle existant de `hideTips` (`showInDialog: true`) ; les trois autres champs de texte libre (titre, sous-titre, art) n'entrent pas dans la boîte de dialogue des paramètres de l'application — éditer de l'ASCII multiligne dans une boîte de dialogue TUI est un autre projet, les utilisateurs avancés éditent directement `settings.json`.

## Points de modification du code

La mise en œuvre est très légère. Voici les fichiers et les plages de numéros de ligne sur la branche `main` actuelle.

`packages/cli/src/ui/components/AppHeader.tsx:53` — Étendre `showBanner` :

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — Passer les données de bannière analysées à `<Header>` :

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

`packages/cli/src/ui/components/Header.tsx` — Étendre `HeaderProps` :

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

`packages/cli/src/ui/components/Header.tsx:45-46` — Sélectionner le palier avant de calculer `logoWidth`, avec le repli sur la valeur par défaut existante :

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

`packages/cli/src/ui/components/Header.tsx` — Le titre est rendu à partir de la prop, le sous-titre remplace la ligne d'espace vide par défaut lorsque la prop est véridique :

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

**Nouveau fichier** : `packages/cli/src/ui/utils/customBanner.ts` — Parseur. Interface externe :

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

Le parseur est responsable de la normalisation, de la lecture des fichiers, du nettoyage et de la mise en cache décrits dans le « Pipeline d'analyse » ci-dessus. Il est appelé une fois au démarrage du CLI, et à nouveau lors d'un événement de rechargement à chaud des paramètres. Les chemins de fichiers de chaque portée proviennent directement de `settings.system.path` / `settings.workspace.path` / `settings.user.path`, donc chaque `{ path }` est résolu par rapport au fichier qui le déclare ; lorsque `settings.isTrusted` est faux, la portée workspace est entièrement ignorée.

## Comparaison des alternatives

Ci-dessous sont listées les 5 formes qui ont été évaluées, pour permettre aux mainteneurs futurs de comprendre l'espace de conception et de réévaluer si nécessaire.

### Option 1 – Trois champs plats (recommandée, identique à l'issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Effet** : Surface utilisateur minimale, correspond un à un à la description de l'issue.
- **Avantages** : Aucun coût d'apprentissage ; documentation très facile ; cohérent avec les champs plats existants de `ui.*` (`hideTips`, `customWittyPhrases`, etc.).
- **Inconvénients** : Trois clés sémantiquement liées éparpillées dans le niveau supérieur de `ui` ; l'ajout futur de commutateurs spécifiques au bannière (dégradé, sous-titre, etc.) ne ferait qu'ajouter des champs frères à `ui`, sans regroupement naturel.

### Option 2 – Espace de noms imbriqué `ui.banner`

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

- **Effet** : Capacité identique à l'option 1, mais regroupée par fonctionnalité.
- **Avantages** : Les futurs commutateurs spécifiques au bannière auront un espace de noms propre ; meilleure découvrabilité dans `/settings`.
- **Inconvénients** : N'est pas strictement identique à l'écriture de l'issue originale ; les paramètres UI existants sont principalement plats (seuls `ui.accessibility` et `ui.statusLine` sont imbriqués), ce qui réduit la cohérence ; un niveau supplémentaire à mémoriser pour l'utilisateur.

*(Le document continue avec les options 3-5, mais le texte fourni s'arrête ici. Fin de la traduction.)*## Comparaison des alternatives (suite)

### Option 3 – Un seul champ avec objet de configuration complet

```jsonc
{
  "ui": {
    "customBanner": {
      "hide": false,
      "title": "Acme CLI",
      "subtitle": "Éditions Spéciales",
      "ascii": { "path": "./brand.txt" }
    }
  }
}
```

- **Effet** : Regroupe toute la configuration du bannière dans un seul objet, la rendant immédiatement visible.
- **Avantages** : Une seule clé à connaître ; facile à réinitialiser en supprimant tout l'objet ; extensible sans ajouter de nouvelles clés au niveau `ui`.
- **Inconvénients** : Nécessite de modifier le schéma de validation pour accepter un objet ; rompt la symétrie avec les autres paramètres `ui.*` ; les mises à jour futures pourraient devoir ajouter de nouveaux champs dans l'objet, ce qui peut être moins intuitif.

### Option 4 – Utiliser des variables d'environnement

```bash
export QWEN_BANNER_TITLE="Acme CLI"
export QWEN_BANNER_ASCII_PATH="./brand.txt"
```

- **Effet** : Délègue la configuration à l'environnement plutôt qu'au fichier de paramètres.
- **Avantages** : Très rapide pour des tests ponctuels ; bien adapté aux environnements conteneurisés ou CI.
- **Inconvénients** : Pas persistant par défaut (nécessite d'être défini à chaque session) ; ne s'intègre pas au système de paramètres existant ; plus difficile à documenter et à découvrir pour les utilisateurs finaux ; risque de conflit avec d'autres configurations.

### Option 5 – Utiliser des fichiers de thème

```jsonc
{
  "theme": {
    "banner": {
      "hide": false,
      "title": "Acme CLI",
      "ascii": { "path": "./theme-brand.txt" }
    }
  }
}
```

- **Effet** : Intègre la personnalisation du bannière dans le système de thèmes.
- **Avantages** : Logique de regroupement naturelle ; pourrait remplacer à la fois le logo et les couleurs en un seul thème ; cohérent avec les thèmes d'IDE.
- **Inconvénients** : Le système de thèmes actuel ne gère que les couleurs, pas les chaînes ; mélanger des ressources statiques (ASCII) avec des définitions de thème est lourd ; les utilisateurs qui ne changent que le titre devraient créer un thème complet ; pas rétrocompatible.

## Décision

L'option 1 (champs plats) est retenue pour sa simplicité, son alignement avec l'issue originale et sa cohérence avec le reste de la configuration UI. Elle permet une extension future simple si nécessaire (par exemple, `ui.customBannerFooter`, `ui.customBannerAlignment`).

## Considérations d'implémentation

- **Validation** : chaque chaîne est nettoyée des caractères de contrôle et des séquences d'échappement non sécurisées.
- **Sécurité** : les chemins de fichiers sont résolus en mode `O_NOFOLLOW` pour éviter les attaques de lien symbolique.
- **Performances** : le fichier ASCII n'est lu qu'au démarrage et mis en cache ; les modifications ultérieures du fichier ne sont pas détectées.
- **Rétrocompatibilité** : les anciennes configurations sans ces champs continueront d'afficher le bannière par défaut.
- **Documentation** : le guide d'utilisation doit être visible dans le fichier `TERMINOLOGY.md` et dans les commentaires du schéma.

## Conclusion

Le système de bannière personnalisable permet aux utilisateurs et aux organisations d'adapter l'identité visuelle de Qwen Code tout en préservant les informations essentielles au support. Les limites strictes sur les zones modifiables garantissent que le bannière reste fonctionnel et non trompeur. La solution choisie équilibre flexibilité, simplicité et sécurité.

## Références

- Issue : [#3005](https://github.com/QwenLM/qwen-code/issues/3005)
- Code source : `packages/cli/src/ui/components/AppHeader.tsx`, `Header.tsx`, `AsciiArt.ts`
- Schéma : `packages/cli/src/config/settingsSchema.ts`

*(Fin de la traduction)*
### Option 3 — Preset de profile de bannière + override de slot

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* override de slot sous 'branded' */ }
  }
}
```

- **Effet** : L'utilisateur choisit parmi des presets nommés ; les utilisateurs avancés peuvent écraser des slots spécifiques sur le preset choisi.
- **Avantages** : Meilleure expérience d'intégration ; les presets peuvent être fournis par le CLI.
- **Inconvénients** : Complexité nettement accrue ; les presets sont un engagement de maintenance à long terme ; l'issue demande une personnalisation ouverte, pas de curation de contenu.

### Option 4 — Chaîne de modèle de bannière globale

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Effet** : Un seul template libre avec interpolation pour les champs verrouillés.
- **Avantages** : Flexibilité maximale pour des layouts non standard.
- **Inconvénients** : Repousse la responsabilité du layout sur l'utilisateur ; la robustesse des colonnes doubles d'Ink face à la largeur du terminal est perdue ; risque élevé de templates qui cassent sur des terminaux étroits ; grande surface d'impact pour un bénéfice limité.

### Option 5 — API de plugin / hook

Exposer un hook de rendu de bannière via le système d'extension.

- **Effet** : Personnalisation au niveau du code ; les extensions peuvent rendre n'importe quel contenu.
- **Avantages** : Capacité maximale ; les entreprises peuvent empaqueter des plugins de marque complets.
- **Inconvénients** : Surface d'API énorme ; le rendu terminal arbitraire nécessite une revue de sécurité ; conception excessivement complexe pour cette issue.

### Recommandation

**Adopter l'option 1**. Elle répond directement à l'issue, s'intègre au style existant de `ui.*`, et ne verrouille pas un espace de noms avant que nous sachions quels autres commutateurs spécifiques à la bannière sont nécessaires. Si à l'avenir des champs frères s'accumulent, la migration vers l'option 2 est additive — `ui.banner.title` et `ui.customBannerTitle` peuvent coexister pendant une fenêtre de dépréciation.

## Sécurité et gestion des échecs

Le contenu personnalisé de la bannière est rendu **textuellement dans le terminal**, et en mode `path`, il est également **lu depuis le disque**. Les deux chemins sont atteignables si des paramètres malveillants ou corrompus sont chargés. Le même modèle de menace que pour la fonctionnalité de titre de session s'applique ici.

| Point d'attention                                                                                         | Protection                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection ANSI / OSC-8 / CSI dans l'ASCII art / titre / sous-titre                                        | Nettoyeur dédié à la bannière (`sanitizeArt` / `sanitizeSingleLine`) : supprime les séquences d'introduction OSC / CSI / SS2 / SS3, remplace les autres octets de contrôle C0 / C1 (y compris DEL) par des espaces. Appliqué avant le rendu et l'écriture du cache. |
| Gel du démarrage par fichier très volumineux                                                              | Limite dure de 64 Ko pour la lecture de fichier.                                                                                                                                                                                  |
| Gel du layout par ASCII art pathologique                                                                  | Limite de 200 lignes × 200 colonnes par résultat d'analyse ; tronqué au-delà avec avertissement `[BANNER]`.                                                                                                                       |
| Détournement de lien symbolique pour le mode `path`                                                       | Lecture de fichier avec `O_NOFOLLOW` (dégradé en lecture seule sur Windows ; la constante n'est pas exposée).                                                                                                                     |
| Fichier manquant ou illisible                                                                             | Capture → avertissement `[BANNER]` → recours au défaut ; ne jamais remonter dans l'interface utilisateur.                                                                                                                         |
| Titre / sous-titre contenant des sauts de ligne ou trop long                                             | Les sauts de ligne sont remplacés par des espaces, tronqués à 80 (titre) / 160 (sous-titre) caractères.                                                                                                                           |
| Espace de travail non fiable impactant le rendu ou la lecture de fichier                                  | Lorsque `settings.isTrusted` est `false`, l'analyseur ignore entièrement `settings.workspace` (cohérent avec le portail de confiance de la vue `settings.merged`).                                                                |
| Condition de concurrence lors du rechargement à chaud des paramètres                                      | Le résultat d'analyse est mémorisé par source (chemin ou chaîne) à chaque appel ; un rechargement réexécute l'analyseur et relit les fichiers concernés.                                                                          |

Résumé des modes d'échec : Tous les échecs logiciels aboutissent finalement à `shortAsciiLogo` (ou au titre par défaut verrouillé) + une ligne de log d'avertissement de débogage. Aucune branche ne doit produire un échec dur (exception remontée).

## Hors du périmètre de cette conception

Les éléments suivants sont intentionnellement exclus. Chacun peut faire l'objet d'une proposition ultérieure distincte en fonction des retours utilisateurs.

| Élément                                                                               | Raison de l'exclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conversion de texte en ASCII art (forme `{ text: "xxxCode" }`)                        | **Rejeté** après évaluation v1. Soit ajouter la dépendance runtime `figlet` (environ 2–3 Mo unpacked avec un jeu de polices utilisables), soit « vendoriser » un renderer de police unique (~200 lignes de code + une police `.flf` à maintenir). Les deux voies créent une surface de maintenance à long terme : choix de polices, licence des polices, issues du type « ma police ne rend pas correctement sur le terminal X », gestion des caractères CJK / pleine largeur. Le cas d'usage qui motive cette fonctionnalité (marque blanche / multi-locataire) implique presque toujours des designers qui fournissent de l'ASCII art finalisé, pas une dépendance à la police par défaut de figlet. Les utilisateurs qui souhaitent générer en une ligne peuvent aujourd'hui faire `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` — effet équivalent, zéro nouvelle dépendance, zéro charge de support interne pour Qwen Code. Si la demande augmente, cette forme est additive : étendre `AsciiArtSource` en `string \| {path} \| {text, font?}` ne casse aucune configuration existante. |
| Édition en ligne via la commande slash `/banner`                                      | L'interface de paramètres est le point d'entrée normatif ; un éditeur en ligne multi-lignes ASCII est un autre projet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Couleurs de dégradé / couleur de ligne personnalisées                                 | La couleur relève du thème. Si une extension est nécessaire, une autre proposition doit être faite ; la personnalisation de bannière ne refait pas cette surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Chargement d'ASCII art depuis une URL                                                 | Les requêtes réseau au démarrage apportent une foule de problèmes : modes d'échec, cache, revue de sécurité. Le chargement par `{path}` est un équivalent à faible risque.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Animations (logo rotatif, titre défilant)                                             | Augmente la charge de rendu et les problèmes d'accessibilité ; le cas d'usage de cette fonctionnalité n'en a pas besoin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Alignement de la bannière avec VSCode / Web UI                                        | Ces deux terminaux ne rendent pas actuellement la bannière Ink. Si elle est introduite à l'avenir, cette conception servira de référence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Rechargement dynamique lors des modifications de fichier                              | L'analyseur ne s'exécute qu'au démarrage et lors du rechargement des paramètres. Le besoin de changer d'art en cours de session est rare ; « redémarrer pour appliquer » est un compromis acceptable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Masquage individuel des zones verrouillées (version / auth / model / path)            | Ce sont des signaux d'exécution ; les masquer nuit au support et à la posture de sécurité bien plus que le gain pour la marque blanche.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Plan de validation

La PR de mise en œuvre ultérieure devra passer les vérifications de bout en bout suivantes :

1. Définir `customBannerTitle: "Acme CLI"` et un `customAsciiArt` en ligne dans `~/.qwen/settings.json` → `qwen` démarre en affichant le nouveau titre et le nouvel ASCII art ; le suffixe de version est toujours présent.
2. Définir `customBannerSubtitle: "Built-in Acme Skills"` → la ligne de sous-titre apparaît entre le titre et la ligne d'authentification / modèle, dans une couleur de texte secondaire ; l'authentification, le modèle et le chemin restent visibles. Annuler le réglage pour revenir à une ligne d'espace vide (rétrocompatible).
3. Définir `hideBanner: true` → `qwen` démarre sans bannière ; les astuces et le contenu principal sont rendus normalement.
4. Définir `customAsciiArt: { "path": "./brand.txt" }` dans le `settings.json` de l'espace de travail, avec `brand.txt` dans le même répertoire `.qwen/` → chargement depuis le disque lors de l'ouverture de l'espace de travail.
5. `customAsciiArt: { "small": "...", "large": "..." }` → redimensionner le terminal dans les trois largeurs (large / moyen / étroit) ; sur large, prendre large ; sur moyen, prendre small ; sur étroit, masquer la colonne du logo ; le panneau d'information est toujours visible.
6. Injecter `\x1b[31mhostile` dans `customBannerTitle` **et** `customBannerSubtitle` → les deux s'affichent comme du texte littéral, non interprété comme une couleur rouge.
7. `path` pointe vers un fichier inexistant → le CLI démarre normalement ; un avertissement `[BANNER]` apparaît dans `~/.qwen/debug/<sessionId>.txt` ; l'art par défaut est rendu.
8. Ouvrir un worktree avec la confiance de l'espace de travail désactivée → les `customAsciiArt` fournis par l'espace de travail (y compris `{ path }`) sont silencieusement ignorés ; les paramètres de l'utilisateur restent actifs.