# Conception du titre de session

> Un titre de session de 3 à 7 mots, en casse de phrase, généré par le modèle rapide après
> le premier tour de l'assistant. Persisté dans le JSONL de la session avec un
> tag `titleSource: 'auto' | 'manual'`, affiché dans le sélecteur de session,
> et régénérable à la demande via `/rename --auto`.

## Vue d'ensemble

`/rename` (#3093) permet à un utilisateur d'étiqueter une session pour la retrouver plus tard dans
le sélecteur, mais tant qu'il ne l'a pas exécuté, le sélecteur affiche la première invite utilisateur — souvent tronquée au milieu d'une phrase, ou décrivant une question de cadrage
plutôt que le sujet réel de la session. Le renommage manuel est une friction optionnelle que la plupart des utilisateurs ne font jamais.

L'objectif est de rendre les noms de session _utiles par défaut_ :

- **Descriptif** de ce que la session a réellement accompli, et pas seulement de la
  première ligne. 3 à 7 mots, casse de phrase, style sujet de commit git.
- **Best-effort** : s'exécute en arrière-plan après la première réponse ; en cas d'échec, l'utilisateur ne voit jamais d'erreur.
- **Respectueux des choix de l'utilisateur** : n'écrase jamais un titre `/rename` choisi délibérément par l'utilisateur, même entre plusieurs onglets CLI sur la même session.
- **Explicitement régénérable** via `/rename --auto` pour les cas où le titre automatique est devenu obsolète ou pour en obtenir un nouveau.

## Déclencheurs

| Déclencheur | Conditions                                                                                                                                                          | Implémentation                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Auto**   | Après l'exécution de `recordAssistantTurn`. Ignoré si un titre existe déjà, si une autre tentative est en cours, si le plafond est atteint, en mode non interactif, si désactivé par variable d'environnement, ou si aucun modèle rapide n'est disponible. | `ChatRecordingService.maybeTriggerAutoTitle` — fire-and-forget |
| **Manuel** | L'utilisateur exécute `/rename --auto`                                                                                                                                          | `renameCommand.ts` via `tryGenerateSessionTitle`               |

Les deux chemins convergent vers une seule fonction — `tryGenerateSessionTitle(config,
signal)` — pour garantir une invite, un schéma, une sélection de modèle et une désinfection identiques. Le déclencheur automatique est un appel en arrière-plan de type best-effort ; le `/rename --auto` manuel est une action utilisateur bloquante qui affiche une erreur spécifique en cas d'échec.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        packages/core/src/services/                      │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ chatRecordingService.ts  │                                           │
│  │                          │                                           │
│  │  recordAssistantTurn()   │                                           │
│  │     │                    │                                           │
│  │     ↓                    │                                           │
│  │  maybeTriggerAutoTitle() │── 6 gardes ──→ IIFE(autoTitleController)  │
│  │     │                    │                       │                   │
│  │     └── reprise hydrate  │                       ↓                   │
│  │         via              │          tryGenerateSessionTitle          │
│  │         getSessionTitle- │          (sessionTitle.ts)                │
│  │         Info             │                       │                   │
│  │                          │                       ↓                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (modèle rapide + schéma JSON)    │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + vérifications     │
│  │                          │                         │                 │
│  │  getSessionTitleInfo()   │◀── inter-processus      ↓                 │
│  │      utilise             │    relecture            recordCustomTitle  │
│  │  readLastJsonString-     │    avant écriture       (…, 'auto')        │
│  │  FieldsSync              │                                           │
│  │  (sessionStorageUtils)   │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│                          ┌─────────────────────┐                        │
│                          │ utils/terminalSafe  │                        │
│                          │ stripTerminalCtrl-  │                        │
│                          │ Sequences           │                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     packages/cli/src/ui/                                │
│                                                                         │
│  commands/renameCommand.ts     ─── /rename <nom>          → manuel      │
│                                ─── /rename                 → kebab       │
│                                ─── /rename --auto          → auto       │
│                                ─── /rename -- --literal    → manuel     │
│                                ─── /rename --unknown-flag  → erreur     │
│                                                                         │
│  components/SessionPicker.tsx  ── estompe les lignes où                 │
│                                   session.titleSource === 'auto'        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fichiers

| Fichier                                                 | Responsabilité                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionTitle.ts`         | Appel LLM unique + filtre d'historique + nettoyage. Exporte `tryGenerateSessionTitle`.  |
| `packages/core/src/services/chatRecordingService.ts` | Déclencheur `maybeTriggerAutoTitle`, gardes, relecture inter-processus, abandon lors de la finalisation. |
| `packages/core/src/services/sessionService.ts`       | Accesseur public `getSessionTitleInfo` ; `renameSession` accepte `titleSource`.      |
| `packages/core/src/utils/sessionStorageUtils.ts`     | Lecteur de paire atomique `extractLastJsonStringFields` + `readLastJsonStringFieldsSync`. |
| `packages/core/src/utils/terminalSafe.ts`            | `stripTerminalControlSequences` partagé par les chemins sentence-case et kebab.           |
| `packages/cli/src/ui/commands/renameCommand.ts`      | `/rename --auto`, analyseur sentinelle, mappage des messages de raison d'échec.                     |
| `packages/cli/src/ui/components/SessionPicker.tsx`   | Style estompé pour `titleSource === 'auto'`.                                          |

## Conception de l'invite (Prompt)

### Invite système

Remplace l'invite système de l'agent principal pour cet appel unique afin que le modèle
tente uniquement d'étiqueter la session, et non de se comporter comme un assistant de codage.

Les puces ci-dessous correspondent 1:1 à `TITLE_SYSTEM_PROMPT` :

- 3 à 7 mots, casse de phrase (seul le premier mot et les noms propres prennent une majuscule).
- Pas de ponctuation finale, pas de markdown, pas de guillemets.
- Correspond à la langue dominante de la conversation ; pour le chinois, prévoir environ 12 à 20 caractères.
- Soyez précis sur l'objectif réel de l'utilisateur — nommez la fonctionnalité, le bug ou le domaine. Évitez les termes vagues comme "Modifications de code" ou "Demande d'aide".
- Quatre bons exemples (trois en anglais + un en chinois) et quatre mauvais exemples (trop vagues / trop longs / mauvaise casse / ponctuation finale).
- Retourne uniquement un objet JSON avec une seule clé `title`.

### Sortie structurée (schéma JSON)

Au lieu d'encapsuler la sortie dans des balises (comme le fait session-recap), nous utilisons
`BaseLlmClient.generateJson` avec un schéma d'appel de fonction :

```ts
const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'A concise sentence-case session title, 3-7 words, no trailing punctuation.',
    },
  },
  required: ['title'],
};
```

Pourquoi l'appel de fonction plutôt que du texte libre + extraction de balises :

1. Fiabilité multi-fournisseurs — les endpoints compatibles OpenAI, Gemini et l'appel d'outils natif de Qwen implémentent tous l'appel de fonction ; l'analyse de balises dépendrait du respect d'une convention textuelle par chaque modèle.
2. Pas de fuite de préambule de raisonnement — les arguments de l'appel de fonction sont retournés de manière structurée, donc un paragraphe de "réflexion" avant la réponse ne peut pas s'infiltrer dans le titre.
3. Post-traitement simplifié — une seule vérification `typeof result.title === 'string'` combinée à `sanitizeTitle` couvre toute dérive réaliste du modèle.

Le modèle peut toujours retourner quelque chose que le schéma autorise mais que l'UX rejette (chaîne vide, espaces uniquement, 500 caractères, délimiteurs markdown, caractères de contrôle). `sanitizeTitle` gère tous ces cas et retourne `''` → le service retourne `{ok: false, reason: 'empty_result'}`.

### Paramètres d'appel

| Paramètre         | Valeur                          | Raison                                                                                          |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `model`           | `getFastModel()` — pas de fallback | L'attribution automatique de titres avec les tokens du modèle principal est trop coûteuse pour être silencieuse.                                |
| `schema`          | `TITLE_SCHEMA`                 | Force `{title: string}` ; filtre les dérives de structure au niveau de la couche de transport.                           |
| `maxOutputTokens` | `100`                          | Largement suffisant pour 7 mots plus la surcharge du schéma.                                              |
| `temperature`     | `0.2`                          | Principalement déterministe — les titres de session bénéficient de la stabilité lors de la régénération.               |
| `maxAttempts`     | `1`                            | Les titres sont des métadonnées cosmétiques de type best-effort ; les nouvelles tentatives s'empileraient derrière le trafic principal visible par l'utilisateur. |

Contrairement à session-recap, qui utilise le modèle principal en fallback. La génération de titre est déclenchée automatiquement et fréquemment ; dépenser silencieusement des tokens du modèle principal sans consentement explicite de l'utilisateur est une mauvaise surprise sur la facture. Le `/rename --auto` manuel échoue explicitement avec `no_fast_model` plutôt que de fallback — forçant l'utilisateur à choisir consciemment le modèle rapide.

## Filtrage de l'historique

`geminiClient.getChat().getHistory()` retourne `Content[]` qui inclut les appels d'outils, les réponses d'outils (souvent plus de 10K tokens de contenu de fichier) et les parties de réflexion du modèle. Injecter cela tel quel dans le LLM de titre biaiserait l'étiquette vers du bruit d'implémentation comme "Appel de grep sur le module auth".

`filterToDialog` ne conserve que les entrées `user` / `model` avec un texte non vide et sans parties `thought` / `thoughtSignature`. `takeRecentDialog` découpe les 20 derniers messages et refuse de commencer sur une réponse modèle/outil orpheline. `flattenToTail` convertit en lignes "Rôle: texte" et découpe les 1000 derniers caractères.

### Découpe des 1000 derniers caractères

Une session qui commence par `help me debug X` mais pivote vers le refactoring de Y doit être titrée sur Y. Titrer par le début fige le cadrage initial ; titrer par la fin capture ce que la session est devenue.

### Gestion des surrogates UTF-16

`.slice(-1000)` sur une limite d'unité de code UTF-16 peut isoler un surrogate haut ou bas si un caractère CJK supplémentaire ou un emoji est coupé. Certains fournisseurs répondent à l'UTF-16 invalide résultant par une erreur 400 — ce qui, sans gestion, consommerait une tentative pour rien. `flattenToTail` supprime un surrogate bas orphelin en tête ; `sanitizeTitle` nettoie également tout surrogate orphelin après la réduction de longueur maximale sur le chemin de sortie.

## Persistance

### Structure de l'enregistrement

`CustomTitleRecordPayload` s'enrichit d'un champ optionnel `titleSource: 'auto' |
'manual'` :

```jsonc
{
  "type": "system",
  "subtype": "custom_title",
  "systemPayload": {
    "customTitle": "Debug login button on mobile",
    "titleSource": "auto",
  },
}
```

Le champ est optionnel, et son absence dans les anciens enregistrements est traitée comme
`undefined`. `SessionPicker` estompe les lignes uniquement sur une correspondance stricte `=== 'auto'` — un titre `/rename` utilisateur antérieur au changement n'est jamais reclassifié silencieusement comme une supposition du modèle.

### Hydratation à la reprise

À la reprise, le constructeur `ChatRecordingService` appelle
`sessionService.getSessionTitleInfo(sessionId)` pour lire **à la fois** le titre et sa source. Sans hydrater la source, le ré-ajout de `finalize()` (qui s'exécute à chaque événement du cycle de vie de la session) réécrirait auto en manuel à chaque cycle de reprise — supprimant silencieusement l'indicateur d'estompage.

### Lecture de paire atomique

`extractLastJsonStringFields` retourne `customTitle` et `titleSource` depuis la **même ligne correspondante** en une seule passe. Deux appels séparés `readLastJsonStringFieldSync` pourraient atterrir sur des enregistrements différents si une ancienne ligne ne contient que le champ principal, produisant une paire incohérente. L'extracteur exige également un guillemet fermant correct sur la valeur principale, empêchant ainsi un enregistrement tronqué par un crash de gagner la course au dernier match.

### Plafond de scan complet du fichier

La phase 2 (lorsque le chemin rapide de la fenêtre de fin échoue) diffuse l'intégralité du fichier par blocs de 64 Ko. Plafonné à `MAX_FULL_SCAN_BYTES = 64 MB` pour qu'un JSONL corrompu de plusieurs Go ne gèle pas le sélecteur de session sur la boucle d'événements principale. L'enveloppe de latence du sélecteur survit à la corruption.

### Défense contre les liens symboliques

Les lectures de session s'ouvrent avec `O_NOFOLLOW` (fallback en lecture seule simple sur Windows, où la constante n'est pas exposée). Défense en profondeur pour qu'un lien symbolique placé dans `~/.qwen/projects/<proj>/chats/` ne puisse pas rediriger une lecture de métadonnées vers un fichier non lié.

## Concurrence et cas limites

### Ordre des gardes de déclenchement

`maybeTriggerAutoTitle` vérifie six conditions dans cet ordre exact — chacune court-circuite les suivantes pour que les moins coûteuses s'exécutent d'abord :

1. `currentCustomTitle` défini → ignorer. N'écrase jamais un titre manuel ou automatique précédent.
2. `autoTitleController !== undefined` → ignorer. Une seule tentative à la fois.
3. `autoTitleAttempts >= 3` → ignorer. Le plafond limite le gaspillage total.
4. `!config.isInteractive()` → ignorer. `qwen -p` headless / CI ne dépense jamais de tokens de modèle rapide pour une session à usage unique.
5. `autoTitleDisabledByEnv()` → ignorer. `QWEN_DISABLE_AUTO_TITLE=1` désactivation explicite.
6. `!config.getFastModel()` → ignorer. Pas de modèle rapide → no-op.

### Pourquoi le plafond est à 3 et non à 1

Le premier tour de l'assistant peut être un appel d'outil pur sans texte visible pour l'utilisateur (ex. le modèle commence par un `grep`). `tryGenerateSessionTitle` retourne `{ok: false, reason: 'empty_history'}` dans ce cas. Sans fenêtre de nouvelle tentative, la chance d'obtenir un titre pour toute la session serait consumée au tour 1 avant que l'utilisateur n'ait dit quoi que ce soit d'intéressant. Un plafond de 3 couvre le cas courant "le premier tour est du bruit" tout en limitant les tentatives incontrôlées sur un modèle rapide qui échoue de manière persistante.

### Condition de concurrence de renommage manuel inter-processus

Deux onglets CLI sur le même fichier de session peuvent diverger en mémoire. L'onglet A exécute `/rename foo` et écrit `titleSource: manual`. Le `ChatRecordingService` de l'onglet B possède son propre `currentCustomTitle = undefined` et écraserait naïvement avec un titre automatique.

Après la résolution de l'appel LLM, l'IIFE relit le JSONL via
`sessionService.getSessionTitleInfo`. Si le fichier indique
`source: 'manual'`, l'IIFE abandonne ET synchronise son état en mémoire afin que les tours suivants respectent également le renommage. Coût : une lecture de fin de fichier de 64 Ko par génération réussie ; négligeable.

### Propagation de l'abandon sur `finalize()`

`autoTitleController` fait également office de drapeau en cours d'exécution. `finalize()` (exécuté lors du changement de session et de l'arrêt du processus) appelle
`autoTitleController.abort()` avant de ré-ajouter l'enregistrement de titre. Le socket LLM est annulé rapidement ; le changement de session n'attend pas un appel lent au modèle rapide. Le bloc `finally` de l'IIFE efface
`autoTitleController` uniquement s'il s'agit toujours de l'actif, évitant ainsi qu'un `finalize()` en cours d'exécution n'entre en concurrence avec un `recordAssistantTurn` simultané.

### Un `/rename` manuel arrive en plein vol

Entre la fin de l'`await` de l'IIFE et l'appel `recordCustomTitle('auto')`, l'utilisateur pourrait exécuter `/rename foo`. L'IIFE revérifie
`this.currentTitleSource === 'manual'` et abandonne. La vérification intra-processus ET la relecture inter-processus s'exécutent toutes les deux ; le manuel l'emporte aux deux niveaux.

## Configuration

### Paramètres visibles par l'utilisateur

| Paramètre / variable d'environnement           | Par défaut | Effet                                                                                              |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `fastModel`                 | non défini   | Requis pour l'attribution automatique de titres. Non défini → no-op (pas de fallback sur le modèle principal).                                  |
| `QWEN_DISABLE_AUTO_TITLE=1` | non défini   | Désactive le déclencheur automatique sans supprimer `fastModel`. `/rename --auto` fonctionne toujours sur demande. |

Pas de commutateur dans `settings.json` — la variable d'environnement est le seul interrupteur visible par l'utilisateur. Justification : la fonctionnalité est cosmétique et peu coûteuse ; un commutateur dans les paramètres ajouterait une surface d'interface pour quelque chose qui peut se contenter d'un export d'environnement ponctuel pour les rares utilisateurs souhaitant le désactiver.

### Pourquoi l'automatique ne fallback pas sur le modèle principal

L'attribution automatique de titres est déclenchée inconditionnellement après chaque tour de l'assistant. Si un utilisateur sans modèle rapide se voyait facturer silencieusement des tokens du modèle principal pour le titre de chaque nouvelle session, l'écart de coût resterait invisible jusqu'à l'arrivée de la facture mensuelle. L'échec silencieux (no-op, pas de titre, pas de coût) est le comportement par défaut le plus sûr. `/rename --auto` affiche `no_fast_model` comme une erreur actionnable pour que l'utilisateur puisse en configurer un s'il le souhaite.

## Observabilité

`createDebugLogger('SESSION_TITLE')` émet `debugLogger.warn` depuis le bloc catch du générateur. Les échecs sont totalement transparents pour l'utilisateur — le titre automatique est une fonctionnalité auxiliaire et ne lève jamais d'exception dans l'interface.

Les développeurs peuvent rechercher le tag `[SESSION_TITLE]` dans le journal de débogage (`~/.qwen/debug/<sessionId>.txt` ; `latest.txt` est un lien symbolique vers la session actuelle). Un appel end-to-end fonctionnel ne produit aucune sortie de journal ; un appel échoué génère une ligne WARN avec le message d'erreur sous-jacent.

## Renforcement de la sécurité

La valeur du titre est rendue telle quelle dans le terminal (sélecteur de session) ET persistée dans un fichier JSONL lisible par l'utilisateur. Les deux surfaces sont atteignables par une attaque si un modèle rapide compromis ou injecté par prompt retourne un texte hostile.

| Préoccupation                                     | Garde                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Injection ANSI / OSC-8 / CSI                | `stripTerminalControlSequences` avant l'écriture JSONL et le rendu du sélecteur.                                                    |
| Injection de lien cliquable via OSC-8            | Identique — les séquences OSC sont supprimées en tant qu'unités complètes, pas seulement l'octet ESC.                                                          |
| Surrogates UTF-16 invalides                   | Nettoyés dans `flattenToTail` (entrée LLM) et `sanitizeTitle` (sortie LLM après réduction de longueur maximale).                               |
| Usurpation de ligne de sous-type via le contenu du message utilisateur | `lineContains: '"subtype":"custom_title"'` — un texte utilisateur contenant par hasard cette phrase littérale ne peut pas masquer un enregistrement réel. |
| Redirection de lien symbolique lors des lectures de session           | `O_NOFOLLOW` (no-op sur Windows où la constante est absente).                                                                |
| Enregistrement JSONL final tronqué             | `extractLastJsonStringFields` exige un guillemet fermant avant qu'un enregistrement ne gagne la course au dernier match.                            |
| Taille de fichier pathologique gelant le sélecteur  | Plafond `MAX_FULL_SCAN_BYTES = 64 MB` sur le scan complet du fichier en phase 2.                                                                  |
| Décorateurs de parenthèses CJK par paires (`【Draft】`) | Supprimés en tant qu'unité pour qu'un crochet fermant seul ne reste pas en suspens.                                                                  |

## Hors périmètre

| Élément                                        | Pourquoi                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Régénération automatique lorsque le titre devient obsolète   | `/rename --auto` est le chemin déclenché explicitement par l'utilisateur. Des changements de titre silencieux en milieu de session perturberaient les utilisateurs qui parcourent le sélecteur. |
| Parité de style estompé WebUI / VSCode           | Ces surfaces lisent déjà `customTitle` et afficheront les titres automatiques comme manuels. Un suivi pourra connecter `titleSource`.           |
| Commutateur dans la boîte de dialogue des paramètres pour la génération automatique  | La variable d'environnement est le seul paramètre. Une interface complète des paramètres sera facile à ajouter plus tard si la demande des utilisateurs se manifeste.                                                  |
| Entrées de catalogue de localisation i18n pour les nouvelles chaînes | Cohérent avec les chaînes `/rename` existantes, qui fallback sur l'anglais. Une passe i18n à l'échelle du repo est hors périmètre.                           |
| Migration pour reclassifier les anciens enregistrements     | Compatibilité descendante par conception : l'absence de `titleSource` est traitée comme manuel. Réécrire les anciens enregistrements risquerait de perdre l'intention de l'utilisateur.                      |
| Attribution automatique de titres non interactive                | `qwen -p` / scripts CI jettent la session ; les tokens de modèle rapide pour un titre que personne ne reprendra sont un pur gaspillage.                         |