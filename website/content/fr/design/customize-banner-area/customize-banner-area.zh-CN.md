# Banner 自定义区域设计方案

> [!note]
> Permet à l'utilisateur de remplacer le logo ASCII QWEN, de changer le titre de la marque ou de masquer complètement la bannière,
> mais pas de supprimer les informations d'exécution nécessaires au dépannage et à la confiance (numéro de version, méthode d'authentification, modèle, répertoire de travail).

## Aperçu

Au démarrage de Qwen Code CLI, une bannière s'affiche en haut du terminal. Elle contient un logo ASCII QWEN et un panneau d'informations encadré. Plusieurs scénarios réels nécessitent un contrôle sur cette zone :

- **Marque blanche / intégration de marque tierce** : lors de l'intégration de Qwen Code dans un produit d'entreprise ou d'équipe, il est nécessaire d'afficher sa propre marque plutôt que le "Qwen Code" par défaut.
- **Personnalisation** : les utilisateurs individuels souhaitent que la bannière du terminal soit cohérente avec les normes de l'équipe ou leurs préférences esthétiques.
- **Distinction multi-locataire / multi-instance** : dans un environnement partagé, différentes équipes veulent identifier rapidement l'instance qu'elles utilisent.

La position de conception est simple : **l'apparence de la marque est remplaçable ; les informations d'exécution ne le sont pas**.
La personnalisation permet uniquement à l'utilisateur de superposer sa propre marque, **pas** de masquer les informations clés pour le dépannage.
Chaque décision « modifiable / non modifiable » dans ce document découle de cette position.

Issue correspondante : [#3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Division de la zone de la bannière

La bannière actuelle est rendue par `Header` (monté par `AppHeader`), et peut être décomposée comme suit :

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Colonne Logo ─────────┐  gap=2  ┌──── Panneau d'infos (avec bordure) ──────┐  │
│   │                           │         │                                           │  │
│   │  ███ QWEN ASCII ███      │         │  ① Titre :    >_ Qwen Code (vX.Y.Z)        │  │
│   │  ███   ART ART  ███      │         │  ② Sous-titre : « ligne vide / remplacé » │  │
│   │  ███ QWEN ASCII ███      │         │  ③ Statut :   Qwen OAuth | qwen-…          │  │
│   │                           │         │  ④ Chemin :   ~/projects/example           │  │
│   └──────── A ────────────────┘         └──────────────── B ──────────────────────────┘  │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                              Zone : AppHeader
                         │ Le composant Tips est rendu en dessous (contrôlé par ui.hideTips) │
```

Deux blocs de haut niveau :

- **A. Colonne Logo** — un bloc unique d'art ASCII avec dégradé de couleurs.
  Source actuelle : `shortAsciiLogo` dans `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Panneau d'informations** — boîte d'informations avec bordure, composée de quatre lignes. La deuxième ligne est par défaut un espaceur visuel vide, éventuellement remplacé par un sous-titre fourni par l'appelant :
  - **B①** Titre : `>_ Qwen Code (vX.Y.Z)` — texte de la marque + suffixe de version.
  - **B②** Sous-titre / espaceur : par défaut une ligne d'espace unique ; lors du paramétrage de `ui.customBannerSubtitle`, affiche une chaîne de sous-titre nettoyée sur une seule ligne (par exemple, un fork utilise `Built-in DataWorks Official Skills`).
  - **B③** Statut : `<type d'affichage d'authentification> | <modèle> (commutation /model)`.
  - **B④** Chemin : répertoire de travail après tildeify et raccourcissement.

Le composant externe `<AppHeader>` masque déjà la bannière en mode lecteur d'écran basé sur `showBanner = !config.getScreenReader()` (en mode lecteur d'écran, il revient à une sortie en texte brut).

## Règles de personnalisation — ce qui est modifiable et ce qui est verrouillé

| Zone                               | Source actuelle                        | Catégorie de personnalisation | Raison du verrouillage / ouverture                                                                                                                                                                                                 |
| ---------------------------------- | -------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Colonne Logo**                | `shortAsciiLogo` (`AsciiArt.ts`)       | **Remplaçable + masquable**   | Zone purement de marque. Les scénarios de marque blanche nécessitent un contrôle total sur l'apparence. Le comportement existant de « masquage automatique du Logo » sur les terminaux étroits reste inchangé.                  |
| **B①. Texte du titre** (`>_ Qwen Code`) | Codé en dur dans `Header.tsx`           | **Remplaçable**               | Zone de marque. Les caractères `>_` font partie de la marque existante ; si non souhaités, l'utilisateur peut les omettre dans `customBannerTitle`.                                                                               |
| **B①. Suffixe de version** (`(vX.Y.Z)`) | Propriété `version`                     | **Verrouillé**                | Indispensable pour le dépannage et le support. Sans lui, répondre à « Quelle version utilises-tu ? » nécessite `--version`, ce qui représente un coût réel pour le support. On sacrifie un peu d'expérience de marque blanche pour l'accessibilité du support. |
| **B②. Ligne de sous-titre / espaceur**      | Espace vide par défaut                  | **Remplaçable**               | Zone de marque / contexte. Les forks de marque blanche l'utilisent pour taguer la version de construction (ex. « Built-in DataWorks Official Skills »). Règles de nettoyage identiques à celles du titre ; une seule ligne autorisée, pas de sauts de ligne qui briseraient la mise en page. |
| **B③. Ligne de statut** (authentification + modèle) | Propriétés `formattedAuthType` et `model` | **Verrouillé**                | Signal opérationnel et de sécurité. L'utilisateur doit voir les identifiants utilisés et le modèle qui consomme réellement les tokens. Tout masquage ou remplacement est dangereux, même dans un scénario de marque blanche. |
| **B④. Ligne de chemin** (répertoire de travail) | Propriété `workingDirectory`              | **Verrouillé**                | Information opérationnelle. « Dans quel répertoire suis-je ? » est une question fréquente ; la bannière en est la seule réponse fiable.                                                                        |
| **Bannière entière** (A + B)       | Point de montage `<Header>` dans `AppHeader.tsx` | **Masquable**              | Un `ui.hideBanner: true` masque à la fois A et B — mécanisme identique au basculement existant en mode lecteur d'écran. `<Tips>` reste contrôlé indépendamment par `ui.hideTips`. |

Ce tableau correspond à quatre paramètres, et rien d'autre :

| Paramètre                | Valeur par défaut | Effet                                                                                          | Zone impactée |
| ------------------------ | ----------------- | ---------------------------------------------------------------------------------------------- | ------------- |
| `ui.hideBanner`          | `false`           | Masque toute la bannière (zones A + B).                                                        | A + B         |
| `ui.customBannerTitle`   | Non défini        | Remplace le texte de la marque B①. Le suffixe de version est ajouté normalement. Est trimé ; chaîne vide = valeur par défaut. | Texte de marque B① |
| `ui.customBannerSubtitle`| Non défini        | Remplace l'espaceur vide B② par une ligne de sous-titre. Nettoyé ; maximum 160 caractères ; chaîne vide = conserve l'espaceur vide (rétrocompatible). | Ligne d'espaceur B② |
| `ui.customAsciiArt`      | Non défini        | Remplace la zone A. Prend en charge trois formes de données (voir ci-dessous). Toute erreur revient à la valeur par défaut. | A            |
**Capacités intentionnellement non fournies** :

- Aucun interrupteur pour « masquer uniquement le suffixe de version ».
- Aucun interrupteur pour « masquer uniquement la ligne d'authentification/modèle ».
- Aucun interrupteur pour « masquer uniquement la ligne de chemin ».
- Aucune entrée pour modifier la couleur dégradée du logo (la couleur est gérée par le thème).
- Aucune capacité à réorganiser la structure ou l'ordre du panneau d'informations.

Si un besoin se fait sentir à l'avenir, il devra être évalué comme un nouveau champ séparé, et non dérivé des trois champs ci-dessus.

## Guide de configuration utilisateur — comment modifier

### Limites générales

Chaque personnalisation de bannière est soumise à ces groupes de limites. Avant d'écrire de l'art ASCII à la main, parcourez‑les pour éviter d'être silencieusement tronqué ou rejeté par l'analyseur.

| Élément | Limite |
|----------------------------|----------------------------------------------------------------------------------------------------------------------|
| **Nombre de caractères du titre** | **80 caractères max** (comptage après nettoyage). Tronqué au‑delà avec un avertissement `[BANNER]`. Les sauts de ligne et caractères de contrôle sont supprimés avant le comptage. |
| **Nombre de caractères du sous‑titre** | **160 caractères max** (comptage après nettoyage). Même pipeline de nettoyage que le titre ; tronqué au‑delà avec un avertissement `[BANNER]`. |
| **Taille du bloc d'art ASCII** | **200 lignes × 200 colonnes max par niveau**. Tronqué au‑delà avec un avertissement `[BANNER]`. |
| **Taille du fichier d'art ASCII** | **64 Ko max**. Si le fichier dépasse la limite, seuls les octets dans la limite sont lus ; le reste est ignoré. |
| **Largeur affichable réelle de l'art ASCII** | Déterminée par le nombre de colonnes du terminal au démarrage, **pas un nombre fixe de caractères**. La formule exacte et les valeurs disponibles pour différentes largeurs de terminal sont détaillées dans la section « Quelle taille peut avoir le logo ? — Budget de largeur ». |

L'art ASCII **n'a pas de limite de caractères fixes** — seules les limites de colonnes/lignes ci‑dessus et le budget de largeur calculé au démarrage selon les colonnes du terminal. Un même nom de marque de 17 caractères peut ou non tenir sur une seule ligne selon sa largeur visuelle réelle, pas selon son nombre de lettres.

### Emplacement de configuration

Les quatre réglages se trouvent sous le nœud `ui` de `settings.json`. Les paramètres au niveau utilisateur (`~/.qwen/settings.json`) et au niveau espace de travail (`.qwen/settings.json` à la racine du projet) sont supportés, avec une priorité de fusion standard (espace de travail écrase utilisateur, système écrase espace de travail).

`customAsciiArt` est un cas particulier : l'analyseur ne remplace pas l'objet entier par une valeur d'un scope de priorité supérieure, mais fusionne chaque niveau (tier) en traversant tous les scopes. Si le scope utilisateur définit `{ small }` et le scope espace de travail définit `{ large }`, les deux s'appliquent — `small` vient de l'utilisateur, `large` de l'espace de travail. Cela permet de satisfaire deux besoins :

1. Chaque élément `{ path }` est résolu par rapport au fichier qui le déclare (`.qwen/` de l'espace de travail vs `~/.qwen/` de l'utilisateur) ; une simple vue fusionnée perd cette information de scope.
2. L'utilisateur peut laisser le niveau `large` par défaut dans ses paramètres personnels et ne surcharger que `small` par espace de travail, sans avoir à réécrire tout l'objet à chaque fois.

Si un même niveau est défini dans plusieurs scopes, la priorité normale s'applique (système > espace de travail > utilisateur). Si `customAsciiArt` est défini comme une simple chaîne ou un `{ path }` dans un scope, cela remplit automatiquement les deux niveaux de ce scope.

### Masquer complètement la bannière

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

La sortie de démarrage saute la colonne du logo et le panneau d'informations. Sauf si `ui.hideTips` est également défini, les astuces (Tips) continuent de s'afficher.

### Remplacer le titre de la marque

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Le panneau d'informations affichera `Acme CLI (vX.Y.Z)`. Par défaut, le caractère `>_` n'est plus ajouté ; pour le conserver, écrivez‑le explicitement :
`"customBannerTitle": ">_ Acme CLI"`.

### Ajouter un sous‑titre de marque

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Le sous‑titre apparaît sur une ligne séparée dans la couleur du texte secondaire, **remplaçant** la ligne d'espacement blanche par défaut (celle située entre le titre et la ligne d'authentification/modèle) :

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Titre
│ Built-in DataWorks Official Skills                      │  ← B② Sous‑titre
│ Qwen OAuth | qwen-coder ( /model  bascule)              │  ← B③ État
│ ~/projects/example                                      │  ← B④ Chemin
└─────────────────────────────────────────────────────────┘
```

Contraintes :

- Une seule ligne autorisée. Les sauts de ligne et autres octets de contrôle sont supprimés ou repliés en espaces pour éviter de déchirer la mise en page du panneau d'informations.
- Limite de 160 caractères après nettoyage (plus généreuse que le titre — les slogans, « powered by », etc. sont souvent plus longs que le nom de marque).
- Laisser vide (ou définir sur une chaîne vide / uniquement des espaces) = conserver la ligne d'espacement blanche par défaut — la rétrocompatibilité est assurée.
- Le sous‑titre ne modifie pas le comportement des lignes verrouillées ; l'authentification, le modèle et le répertoire de travail sont toujours visibles, indépendamment de l'état du sous‑titre.

### Remplacer l'art ASCII — chaîne en ligne

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Utilisez `\n` dans la chaîne JSON pour les sauts de ligne. Cet art ASCII applique le dégradé de couleur du thème actif, comme le logo par défaut.

> **Pas d'art ASCII sous la main ?** N'importe quel générateur externe fonctionne, il suffit de coller le résultat ici. Le plus simple est `figlet` :
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt`, puis pointez `customAsciiArt: { "path": "./brand.txt" }` vers ce fichier. Le CLI **ne** convertit **pas** le texte en art ASCII à l'exécution — voir la section « Hors périmètre de conception ».

### Remplacer l'art ASCII — fichier externe

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Évitez d'échapper de longues chaînes multilignes dans le JSON. Règles de résolution des chemins :

- **Paramètres au niveau espace de travail** : les chemins relatifs sont résolus par rapport au répertoire `.qwen/` de l'espace de travail.
- **Paramètres au niveau utilisateur** : les chemins relatifs sont résolus par rapport à `~/.qwen/`.
- Les chemins absolus sont utilisés directement.
- Le fichier **est lu une seule fois au démarrage**, nettoyé puis mis en cache. Modifier le fichier en cours de session ne déclenche pas de nouveau rendu — veuillez redémarrer le CLI.

### Remplacer l'art ASCII — adaptation à la largeur

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

Si le terminal est suffisamment large, utilisez `large` ; sinon `small` ; sinon, masquez la colonne du logo (en suivant la stratégie de repli à deux colonnes actuelle). `small` et `large` peuvent chacun être soit une chaîne, soit un `{ path }`. Chaque niveau peut être omis : l'absence fait passer au niveau suivant.

### Quelle taille peut avoir le logo ? — Budget de largeur

Le titre et l'art n'ont pas de « limite de caractères fixes », mais un **budget de largeur** déterminé par le nombre de colonnes du terminal, en plus des limites absolues pour éviter qu'une entrée malformée ne fige la mise en page :

| Élément | Limite |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Colonnes du terminal au démarrage | Ce que le terminal de l'utilisateur rapporte. |
| Marge extérieure du conteneur | 4 colonnes (2 à gauche + 2 à droite). |
| Espace entre la colonne logo et le panneau d'informations | 2 colonnes. |
| Largeur minimale du panneau d'informations | 44 colonnes (40 chemin + bordure + padding). |
| **Largeur disponible pour l'art d'un niveau à l'affichage** | `colonnes_terminal − 4 − 2 − 44 = colonnes_terminal − 50`. |
| Limite absolue maximale pour l'art d'un niveau après nettoyage | 200 colonnes × 200 lignes. Tronqué au‑delà avec avertissement `[BANNER]`. |
| Limite absolue pour `customBannerTitle` après nettoyage | 80 caractères. Tronqué au‑delà avec avertissement `[BANNER]`. |

Largeur maximale du logo pour les largeurs de terminal courantes :

| Colonnes du terminal | Largeur maximale affichable du logo | Signification concrète |
|----------------------|-------------------------------------|------------------------|
| 80 | 30 | La plupart des lettres « ANSI Shadow » de figlet occupent 7–11 colonnes, soit 3 lettres max. |
| 100 | 50 | ANSI Shadow peut contenir un mot court (environ 6 lettres) ou deux mots empilés. |
| 120 | 70 | Largement suffisant pour un art multiligne avec mots empilés. |
| 200 | 150 | Une longue chaîne sur une seule ligne (par ex. un nom de produit complet en ANSI Shadow) tient aussi. |
Deux règles d'or pour concevoir un art ASCII :

1. **Les noms de marque composés de plusieurs mots ne peuvent généralement pas être rendus sur une seule ligne avec ANSI Shadow dans la plupart des terminaux.**  
   Chaque lettre dans ANSI Shadow occupe environ 7 à 9 colonnes. Même pour un nom comme `Custom Agent` (12 caractères), une seule ligne nécessite environ 95 colonnes d'art – un terminal de 100 colonnes n'a déjà plus assez de place après avoir accueilli le panneau d'information. Soit empiler les mots sur plusieurs lignes, soit utiliser une police figlet plus étroite, soit opter pour une décoration compacte sur une seule ligne, par exemple `▶ Custom Agent ◀`.

2. **Lorsqu'un seul niveau doit à la fois « bien rendre en écran large » et « survivre en écran étroit », utilisez la forme adaptative `{ small, large }` basée sur la largeur.**  
   Dans l'exemple ci-dessous, `large` est un art multi‑lignes empilé pour les terminaux ≥ 104 colonnes, `small` est une décoration d'une seule ligne de 16 colonnes. Si la largeur est trop faible pour l'un ou l'autre, la colonne logo est masquée.

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

Le fichier `banner-large.txt` contient la sortie ANSI Shadow empilée (environ 54 colonnes × 12 lignes), générée avec la commande suivante :

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Combinaison des trois

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

1. Enregistrez `settings.json`, redémarrez `qwen` – l'analyse de la bannière ne s'exécute qu'au démarrage.
2. Ajustez la largeur du terminal, vérifiez que le basculement entre `small` et `large` fonctionne comme prévu, et que la colonne logo se masque correctement lorsque la largeur est très étroite.
3. Si le résultat n'est pas conforme, consultez `~/.qwen/debug/<sessionId>.txt` (le lien symbolique `latest.txt` pointe vers la session en cours) et cherchez `[BANNER]` – chaque échec léger imprime une ligne d'avertissement expliquant la cause.

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
   │ 1. Normalisation        │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. Analyser chaque niv. │           │
   │    string → utilisation │           │  Selon availableTerminalWidth
   │    {path} → fs.read     │           │  sélectionner le niveau
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │          Rendu logo colonne
   │ 3. Nettoyage art :      │          Rendu panneau info :
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 lignes × 200   │                   ?? '>_ Qwen Code'
   │ 4. Nettoyage titre +    │           Subtitle = customBannerSubtitle
   │    sous-titre (1 ligne) │                   ?? ligne espacement vide
   │    ≤ 80 / 160 car.     │           Status   = Verrouillé
   │ 5. Memoisation par src  │           Path     = Verrouillé
   └─────────────────────────┘
```

L'algorithme d'analyse en cinq étapes s'exécute une fois au chargement des paramètres, et à nouveau uniquement lorsque l'événement de rechargement à chaud des paramètres est déclenché :

1. **Normalisation.** Une `string` nue ou un `{ path }` est converti en `{ small: x, large: x }`. L'objet `{ small, large }` passe tel quel.
2. **Analyse par niveau.** Pour chaque `AsciiArtSource` :
   - Chaîne : utilisée directement.
   - `{ path }` : lecture synchrone, avec `O_NOFOLLOW` pour se protéger des détournements de liens symboliques (sous Windows, on tombe en lecture seule ordinaire – cette constante n'est pas exposée), limite 64 Ko. Le chemin relatif est résolu par rapport au *répertoire du fichier de paramètres* : les paramètres workspace sont relatifs au `.qwen/` du workspace, les paramètres utilisateur relatifs à `~/.qwen/`. En cas d'échec de lecture → avertissement `[BANNER]`, ce niveau retombe sur la valeur par défaut.
3. **Nettoyage.** Un stripper dédié à la bannière : supprime les séquences d'échappement OSC/CSI/SS2/SS3, remplace les autres octets de contrôle C0/C1 (y compris DEL) par des espaces, tout en conservant les `\n` pour préserver l'art ASCII multi‑lignes. Chaque ligne est tronquée de ses espaces de fin, puis coupée à 200 lignes × 200 colonnes, avec un avertissement `[BANNER]` si dépassement.
4. **Sélection du niveau au rendu.** Dans `Header.tsx`, étant donné les `small` et `large` parsés, en fonction de la largeur disponible (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`) :
   - Si `large` tient, on utilise `large` en priorité.
   - Sinon si `small` tient, on retombe sur `small`.
   - Sinon, **si l'utilisateur a fourni un art personnalisé**, on masque carrément la colonne logo (on suit la branche `showLogo = false`) – à ce stade, retomber sur le logo QWEN intégré briserait silencieusement le déploiement sans marque sur les terminaux étroits. Le panneau d'information continue de s'afficher.
   - Sinon (l'utilisateur n'a fourni aucun art personnalisé), on retombe sur `shortAsciiLogo`, dont l'affichage est décidé par la largeur du logo par défaut.
5. **Filet de sécurité.** Si les deux niveaux sont finalement vides ou invalides à cause d'échecs légers (fichier manquant, nettoyage vide, configuration malformée), on affiche `shortAsciiLogo` comme si rien n'avait été personnalisé, et on suit la décision de largeur du logo par défaut. Le CLI **ne doit jamais** planter à cause d'une erreur de configuration de la bannière.

Pseudo‑code pour la sélection du niveau :

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
  return undefined; // Masquer la colonne logo
}
```

## Ajout au schéma de paramètres

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
  // Le type `SettingDefinition` ne peut pas exprimer la forme d'union acceptée au runtime.
  // La surcharge est laissée telle quelle par le générateur JSON‑schema, permettant à VS Code d'accepter
  // toutes les formes documentées (string, {path}, {small,large}) sans marquer en rouge une simple chaîne.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```
`hideBanner` reprend le modèle existant de `hideTips` (`showInDialog: true`) ;
les trois autres champs de texte libre (titre, sous-titre, art) n'entrent pas dans la boîte de dialogue des paramètres de l'application —
créer un éditeur ASCII multiligne dans la boîte de dialogue TUI est un autre projet ; les utilisateurs avancés peuvent directement éditer
`settings.json`.

## Modifications du code

Les changements sont minimes. Voici les fichiers et les plages de lignes sur la branche `main` actuelle.

`packages/cli/src/ui/components/AppHeader.tsx:53` — Extension
`showBanner` :

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — Passage des données
de bannière parsées à `<Header>` :

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

`packages/cli/src/ui/components/Header.tsx` — Extension de `HeaderProps` :

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

`packages/cli/src/ui/components/Header.tsx:45-46` — Sélection du niveau avant le calcul
de `logoWidth`, avec repli sur la valeur par défaut existante :

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

`packages/cli/src/ui/components/Header.tsx` — Le titre est rendu à partir de la prop,
le sous-titre remplace la ligne d'espace vide lorsque la prop est véridique :

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

**Nouveau fichier** : `packages/cli/src/ui/utils/customBanner.ts` — Analyseur syntaxique.
Interface publique :

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

L'analyseur est responsable de la normalisation, de la lecture des fichiers, du nettoyage et de la mise en cache décrits dans le « pipeline d'analyse » ci-dessus.
Il est appelé une fois au démarrage du CLI et à nouveau lors des événements de rechargement à chaud des paramètres. Les chemins de fichiers de chaque scope
proviennent directement de `settings.system.path` / `settings.workspace.path` /
`settings.user.path`, donc chaque `{ path }` est résolu relativement au fichier qui le déclare ;
lorsque `settings.isTrusted` est `false`, tout le scope workspace est ignoré.

## Comparaison des alternatives

Voici les 5 formes qui ont été évaluées, afin que les futurs mainteneurs comprennent l'espace de conception et puissent
réévaluer si nécessaire.

### Option 1 — Trois champs plats (recommandée, identique à l'issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Effet** : Surface utilisateur minimale, correspond parfaitement à la description de l'issue.
- **Avantages** : Aucun apprentissage nécessaire ; documentation très facile ; cohérent avec les champs plats existants de `ui.*`
  (`hideTips`, `customWittyPhrases`, etc.).
- **Inconvénients** : Trois clés sémantiquement liées éparpillées au niveau supérieur de `ui` ; si de nouvelles options spécifiques à la bannière
  (dégradé, sous-titre, etc.) apparaissent à l'avenir, elles devront être ajoutées comme champs frères dans `ui`, sans
  regroupement naturel.

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

- **Effet** : Capacités identiques à l'option 1, regroupées par fonctionnalité.
- **Avantages** : Les futures options spécifiques à la bannière auront un espace de noms propre ; meilleure découvrabilité via `/settings`.
- **Inconvénients** : Pas exactement la même syntaxe que dans l'issue originale ; les paramètres d'interface existants sont majoritairement plats
  (seuls `ui.accessibility` et `ui.statusLine` sont imbriqués), ce qui brise la cohérence ; ajoute une couche supplémentaire à mémoriser.

### Option 3 — Profil de bannière prédéfini + remplacement de slot

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* remplacement de slot sous 'branded' */ }
  }
}
```

- **Effet** : L'utilisateur choisit parmi des préréglages nommés ; les utilisateurs avancés peuvent remplacer des slots spécifiques sur le préréglage choisi.
- **Avantages** : Meilleure expérience d'intégration ; les préréglages peuvent être fournis par le CLI lui-même.
- **Inconvénients** : Complexité considérablement accrue ; les préréglages sont un engagement de maintenance à long terme ; l'issue demande une
  personnalisation ouverte et non une curation de contenu.

### Option 4 — Chaîne de template de bannière globale

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Effet** : Un seul template libre, avec interpolation pour les champs verrouillés.
- **Avantages** : Plus grande flexibilité pour les mises en page non standard.
- **Inconvénients** : Délègue la responsabilité de la mise en page à l'utilisateur ; perd la robustesse de la double colonne Ink pour la largeur du terminal ;
  très facile d'écrire un template qui se brise sur des terminaux étroits ; ouvre une grande surface de dégâts pour ce gain.

### Option 5 — API plugin / hook

Exposer un hook de rendu de bannière via le système d'extension.

- **Effet** : Personnalisation au niveau du code ; les extensions peuvent afficher n'importe quel contenu.
- **Avantages** : Plafond de capacité le plus élevé ; les entreprises peuvent empaqueter un plugin de marque complet.
- **Inconvénients** : Surface API énorme ; le rendu terminal arbitraire nécessite une revue de sécurité ; surconception totale pour cette issue.

### Recommandation

**Adopter l'option 1**. Elle répond directement à l'issue, s'aligne sur le style existant de `ui.*`, et ne verrouille pas l'espace de noms avant que nous sachions quels autres commutateurs spécifiques à la bannière seront nécessaires. Si les champs frères commencent à s'accumuler à l'avenir, la migration vers l'option 2 est additive — `ui.banner.title` et
`ui.customBannerTitle` peuvent coexister pendant une période de dépréciation.

## Sécurité et gestion des erreurs

Le contenu personnalisé de la bannière est **rendu textuellement dans le terminal**, et dans le cas d'un chemin, il est également
**lu depuis le disque**. Ces deux chemins sont accessibles lorsque des paramètres malveillants ou falsifiés sont chargés. Le même modèle de menace que celui géré par la fonctionnalité de titre de session s'applique ici.

| Point d'attention                                                                                            | Mesure de protection                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection ANSI / OSC-8 / CSI dans l'ASCII art / titre / sous-titre                                           | Stripper dédié à la bannière (`sanitizeArt` / `sanitizeSingleLine`) : supprime les séquences d'introduction OSC / CSI / SS2 / SS3, remplace les autres octets de contrôle C0 / C1 (y compris DEL) par des espaces. Appliqué avant le rendu et l'écriture dans le cache. |
| Fichier trop gros gelant le démarrage                                                                        | Limite supérieure de lecture de fichier à 64 Ko.                                                                                                                                                         |
| ASCII art pathologique gelant la mise en page                                                                | Limite de 200 lignes × 200 colonnes par résultat parsé ; troncature + avertissement `[BANNER]` si dépassé.                                                                                               |
| Détournement de lien symbolique pour le chemin                                                                | Lecture du fichier avec `O_NOFOLLOW` (se dégrade en lecture seule sous Windows ; constante non exposée).                                                                                                 |
| Fichier manquant ou illisible                                                                                 | Capture → avertissement `[BANNER]` → repli sur la valeur par défaut ; jamais levé dans l'interface.                                                                                                       |
| Titre / sous-titre contenant des retours à la ligne ou trop longs                                            | Les retours à la ligne sont repliés en espaces, tronqués à 80 (titre) / 160 (sous-titre) caractères.                                                                                                      |
| Espace de travail non fiable affectant le rendu ou la lecture de fichier                                    | Lorsque `settings.isTrusted` est `false`, l'analyseur ignore complètement `settings.workspace` (cohérent avec la porte de confiance dans la vue `settings.merged`).                                       |
| Condition de concurrence lors du rechargement à chaud des paramètres                                        | Le résultat de l'analyse est mémorisé par source (chemin ou chaîne) dans chaque appel ; un rechargement relance l'analyseur et relit les fichiers concernés.                                              |
Résumé des modes d'échec : tous les échecs logiciels aboutissent finalement à `shortAsciiLogo` (ou au titre par défaut verrouillé) + une ligne de journal de débogage en warn. Aucune branche ne doit produire un échec dur (lancer une exception vers le haut).

## Hors du périmètre de cette conception

Les éléments suivants sont intentionnellement exclus. Chacun peut faire l'objet d'une proposition distincte ultérieure en fonction des retours des utilisateurs.

| Élément                                              | Raison de l'exclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transformation du texte en ASCII art (forme `{ text: "xxxCode" }`)    | **Rejeté** après évaluation v1. Soit introduire une dépendance d'exécution `figlet` (environ 2–3 Mo décompressé avec un jeu de polices utilisable), soit fournir en interne un moteur de rendu à police unique (~200 lignes de code + un fichier de police `.flf` que nous maintenons). Les deux voies entraînent une charge de maintenance à long terme : sélection des polices, audit des licences, problèmes du type « ma police ne s'affiche pas correctement dans le terminal X », gestion des caractères CJK / pleine largeur. Le cas d'utilisation motivant cette fonctionnalité (marque blanche / multi-locataire) implique presque toujours que le designer livre un ASCII art fini, sans dépendre de la police par défaut de figlet. Les utilisateurs qui souhaitent une génération en une ligne peuvent déjà faire `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` — effet équivalent, aucune nouvelle dépendance, aucun coût de support interne pour Qwen Code. Si la demande augmente à l'avenir, cette forme est purement additive : étendre `AsciiArtSource` en `string \| {path} \| {text, font?}` sans casser aucune configuration existante. |
| Édition en ligne via la commande slash `/banner`                      | L'interface utilisateur des paramètres est l'entrée d'édition normalisée ; un éditeur en ligne d'ASCII multi-lignes est un autre projet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Dégradé de couleurs personnalisé / couleur de ligne unique                           | Les couleurs sont gérées par le thème. Si une extension est nécessaire, une proposition distincte devrait être faite ; la personnalisation de la bannière ne réinvente pas cette roue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Chargement d'ASCII art via URL                                | Les requêtes réseau au démarrage apportent leur lot de problèmes : modes d'échec, cache, revue de sécurité. Le chargement de fichier via `{path}` est un équivalent à faible risque.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Animations (logo tournant, titre défilant)                     | Augmente la charge de rendu et pose des problèmes d'accessibilité ; les cas d'utilisation de cette fonctionnalité n'en ont pas besoin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Alignement de la bannière dans VSCode / Web UI                       | Ces deux terminaux ne rendent actuellement pas la bannière Ink. Si elle est introduite à l'avenir, cette conception servira de référence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Rechargement dynamique lors des modifications de fichier                             | L'analyseur ne s'exécute qu'au démarrage et lors du rechargement des paramètres. Le besoin de changer d'art en cours de session est rare, et « redémarrage pour prise en compte » est un compromis acceptable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Masquage individuel des zones verrouillées (version / auth / model / path) | Ce sont des signaux d'exécution ; les masquer nuit bien plus au support et à la posture de sécurité que le gain apporté par les scénarios de marque blanche.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
## Plan de vérification

Les PR d'implémentation ultérieures doivent passer les vérifications de bout en bout suivantes :

1. `~/.qwen/settings.json` définit `customBannerTitle: "Acme CLI"` avec un `customAsciiArt` en ligne → le lancement de `qwen` affiche le nouveau titre et le nouvel art ASCII ; le suffixe du numéro de version reste.
2. Définir `customBannerSubtitle: "Built-in Acme Skills"` → la ligne de sous-titre apparaît avec une couleur de texte secondaire entre le titre et la ligne d'authentification/modèle ; l'authentification, le modèle et le chemin restent visibles. Après désactivation, revient à une ligne d'espacement vide (rétrocompatible).
3. Définir `hideBanner: true` → le lancement de `qwen` se fait sans bannière ; les astuces et le contenu principal sont rendus normalement.
4. Dans l'espace de travail, définir dans `settings.json` `customAsciiArt: { "path": "./brand.txt" }`, avec `brand.txt` dans le même répertoire `.qwen/` → chargé depuis le disque lors de l'ouverture de l'espace de travail.
5. `customAsciiArt: { "small": "...", "large": "..." }` → ajuster la taille du terminal selon les trois niveaux large/moyen/étroit ; en large prendre large, en moyen prendre small, en étroit masquer la colonne du logo ; le panneau d'informations toujours visible.
6. Injecter `\x1b[31mhostile` respectivement dans `customBannerTitle` **et** `customBannerSubtitle` → les deux sont rendus comme texte littéral, ne sont pas interprétés comme rouge.
7. `path` pointe vers un fichier inexistant → le CLI démarre normalement ; `[BANNER]` warn apparaît dans `~/.qwen/debug/<sessionId>.txt` ; l'art par défaut est rendu.
8. Ouvrir un worktree avec la confiance de l'espace de travail désactivée → le `customAsciiArt` fourni par l'espace de travail (contenant l'élément `{ path }`) est ignoré silencieusement ; les paramètres de l'utilisateur restent appliqués.
