# Conception du Titre de Session

> Un titre de session en casse de phrase de 3 à 7 mots, généré par le modèle rapide après
> le premier tour de l'assistant. Persisté dans le JSONL de session avec une
> balise `titleSource: 'auto' | 'manual'`, affiché dans le sélecteur de session,
> et régénérable à la demande via `/rename --auto`.

## Vue d'ensemble

`/rename` (#3093) permet à un utilisateur de nommer une session pour la retrouver
plus tard dans le sélecteur, mais tant qu'il ne l'a pas exécuté, le sélecteur affiche la première
invite utilisateur — souvent tronquée en milieu de phrase, ou décrivant une question
cadre plutôt que ce dont la session a réellement parlé. Le renommage manuel est
une friction optionnelle que la plupart des utilisateurs ne font jamais.

L'objectif est de rendre les noms de session _utiles par défaut_ :

- **Descriptifs** de ce que la session a réellement accompli, pas seulement la
  première ligne. 3 à 7 mots, casse de phrase, style sujet de commit git.
- **Au mieux** : se déclenche en arrière-plan après la première réponse ; en cas
  d'échec, l'utilisateur ne voit jamais d'erreur.
- **Respectueux de l'utilisateur** : n'écrase jamais un titre `/rename` que l'utilisateur
  a choisi délibérément, même entre onglets CLI sur la même session.
- **Explicitement régénérable** via `/rename --auto` pour le cas « le titre auto
  est devenu obsolète / j'en veux un nouveau ».

## Déclencheurs

| Déclencheur | Conditions                                                                                                                                                                     | Implémentation                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Auto**    | Après le déclenchement de `recordAssistantTurn`. Ignoré si un titre existant est défini, une autre tentative est en cours, le plafond est atteint, non interactif, env désactivé, ou pas de modèle rapide. | `ChatRecordingService.maybeTriggerAutoTitle` — fire-and-forget  |
| **Manuel**  | L'utilisateur exécute `/rename --auto`                                                                                                                                          | `renameCommand.ts` via `tryGenerateSessionTitle`                |

Les deux chemins convergent vers une seule fonction — `tryGenerateSessionTitle(config,
signal)` — pour garantir une invite, un schéma, une sélection de modèle et une
assainissement identiques. Le déclencheur auto est un appel en arrière-plan au mieux ; le
manuel `/rename --auto` est une action bloquante qui remonte une erreur spécifique à la raison en cas d'échec.

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
│  │     └── reprise hydrate   │                       ↓                   │
│  │         via              │          tryGenerateSessionTitle          │
│  │         getSessionTitle- │          (sessionTitle.ts)                │
│  │         Info             │                       │                   │
│  │                          │                       ↓                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (fastModel + schéma JSON)        │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + vérifications     │
│  │                          │                         │                 │
│  │  getSessionTitleInfo()   │◀── re-lecture            ↓                 │
│  │      utilise             │    inter-processus     recordCustomTitle  │
│  │  readLastJsonString-     │    avant écriture      (…, 'auto')        │
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
│  components/SessionPicker.tsx  ── atténue les lignes où                 │
│                                   session.titleSource === 'auto'        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fichiers

| Fichier                                                 | Responsabilité                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionTitle.ts`            | Appel LLM unique + filtre d'historique + assainissement. Exporte `tryGenerateSessionTitle`.      |
| `packages/core/src/services/chatRecordingService.ts`    | Déclencheur `maybeTriggerAutoTitle`, gardes, re-lecture inter-processus, abandon sur finalisation. |
| `packages/core/src/services/sessionService.ts`          | Accesseur public `getSessionTitleInfo` ; `renameSession` accepte `titleSource`.                   |
| `packages/core/src/utils/sessionStorageUtils.ts`        | Lecteur de paire atomique `extractLastJsonStringFields` + `readLastJsonStringFieldsSync`.         |
| `packages/core/src/utils/terminalSafe.ts`               | `stripTerminalControlSequences` partagé par les chemins casse de phrase et kebab.                 |
| `packages/cli/src/ui/commands/renameCommand.ts`         | `/rename --auto`, analyseur de sentinelle, tableau des messages d'échec par raison.              |
| `packages/cli/src/ui/components/SessionPicker.tsx`      | Style atténué pour `titleSource === 'auto'`.                                                    |

## Conception de l'invite

### Invite système

Remplace l'invite système de l'agent principal pour cet appel unique afin que le modèle
essaie uniquement de nommer la session, pas de se comporter comme un assistant de codage.

Les puces ci-dessous correspondent 1:1 à `TITLE_SYSTEM_PROMPT` :

- 3 à 7 mots, casse de phrase (seuls le premier mot et les noms propres sont en majuscule).
- Pas de ponctuation finale, pas de markdown, pas de guillemets.
- Correspondre à la langue dominante de la conversation ; pour le chinois, prévoir
  environ 12 à 20 caractères.
- Être spécifique à l'objectif réel de l'utilisateur — nommer la fonctionnalité, le bogue, ou le
  domaine du sujet. Éviter les fourre-tout vagues comme « Modifications de code » ou « Demande
  d'aide ».
- Quatre bons exemples (trois en anglais + un en chinois) et quatre mauvais exemples
  (trop vague / trop long / mauvaise casse / ponctuation finale).
- Ne renvoyer qu'un objet JSON avec une seule clé `title`.

### Sortie structurée (schéma JSON)

Au lieu d'envelopper la sortie dans des balises (comme le fait le récapitulatif de session), nous utilisons
`BaseLlmClient.generateJson` avec un schéma d'appel de fonction :

```ts
const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'Un titre de session concis en casse de phrase, 3 à 7 mots, sans ponctuation finale.',
    },
  },
  required: ['title'],
};
```

Pourquoi l'appel de fonction plutôt que du texte libre + extraction de balises :

1. Fiabilité inter-fournisseurs — les points de terminaison compatibles OpenAI, Gemini et
   l'appel d'outil natif de Qwen implémentent tous l'appel de fonction ; l'analyse de balises
   reposerait sur le respect par chaque modèle d'une convention textuelle.
2. Pas de fuite de préambule de raisonnement — les arguments de l'appel de fonction sont renvoyés
   structurés, donc un paragraphe de « réflexion » avant la réponse ne peut pas s'infiltrer
   dans le titre.
3. Post-traitement plus simple — une seule vérification `typeof result.title === 'string'`
   plus `sanitizeTitle` couvre toutes les dérives de modèle réalistes.

Le modèle peut toujours renvoyer quelque chose que le schéma autorise mais que l'UX
rejette (chaîne vide, uniquement des espaces, 500 caractères, délimiteur markdown, caractères
de contrôle). `sanitizeTitle` gère tout cela et renvoie `''` → le service
renvoie `{ok: false, reason: 'empty_result'}`.

### Paramètres d'appel

| Paramètre         | Valeur                          | Raison                                                                                              |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `model`           | `getFastModel()` — pas de repli | L'auto-titrage sur les jetons du modèle principal est trop coûteux pour être silencieux.              |
| `schema`          | `TITLE_SCHEMA`                  | Impose `{title: string}` ; filtre les dérives de forme au niveau de la couche de transport.           |
| `maxOutputTokens` | `100`                           | Largement suffisant pour 7 mots plus la surcharge du schéma.                                          |
| `temperature`     | `0.2`                           | Principalement déterministe — les titres de session bénéficient d'une stabilité entre régénérations. |
| `maxAttempts`     | `1`                             | Les titres sont des métadonnées esthétiques au mieux ; les tentatives supplémentaires s'empileraient derrière le trafic principal visible par l'utilisateur. |

Contraste avec le récapitulatif de session, qui se rabat sur le modèle principal. La génération
de titre est déclenchée automatiquement et souvent ; dépenser silencieusement des jetons du modèle
principal sans que l'utilisateur ait donné son accord est une vraie surprise sur la facture. Manuel
`/rename --auto` échoue explicitement avec `no_fast_model` plutôt que de se rabattre —
forçant l'utilisateur à faire le choix conscient du modèle rapide.

## Filtrage de l'historique

`geminiClient.getChat().getHistory()` renvoie des `Content[]` qui incluent les appels
d'outil, les réponses d'outil (souvent 10K+ jetons de contenu de fichier) et les parties
de pensée du modèle. Alimenter cela brut dans le LLM de titre biaiserait l'étiquette
vers le bruit d'implémentation comme « Appelé grep sur le module d'authentification ».

`filterToDialog` ne conserve que les entrées `user` / `model` avec un texte non vide
et sans parties `thought` / `thoughtSignature`. `takeRecentDialog` tronque
aux 20 derniers messages et refuse de commencer sur une réponse pendante de modèle/outil.
`flattenToTail` convertit en lignes « Rôle : texte » et tronque les
1000 derniers caractères.

### La tranche de queue de 1000 caractères

Une session qui commence par `aide-moi à déboguer X` mais pivote vers le refactoring de Y
devrait être intitulée à propos de Y. Titrer par le début verrouille le cadre
d'ouverture ; titrer par la queue capture ce que la session est devenue.

### Gestion des substituts UTF-16

`.slice(-1000)` sur une frontière d'unité de code UTF-16 peut orpheliner un substitut
haut ou bas si un caractère supplémentaire CJK ou un emoji est coupé. Certains
fournisseurs répondent à l'UTF-16 invalide résultant par un 400 — ce qui, sans
gestion, brûlerait une tentative pour rien. `flattenToTail` supprime un
substitut bas orphelin en début ; `sanitizeTitle` nettoie tout substitut
orphelin après la troncature de longueur maximale sur le chemin de sortie aussi.

## Persistance

### Forme de l'enregistrement

`CustomTitleRecordPayload` gagne un champ optionnel `titleSource: 'auto' |
'manual'` :

```jsonc
{
  "type": "system",
  "subtype": "custom_title",
  "systemPayload": {
    "customTitle": "Déboguer le bouton de connexion sur mobile",
    "titleSource": "auto",
  },
}
```

Le champ est optionnel, et les enregistrements hérités absents sont traités comme
`undefined`. `SessionPicker` atténue les lignes uniquement sur une correspondance stricte
`=== 'auto'` — un titre `/rename` antérieur à la modification par l'utilisateur n'est jamais
reclassé silencieusement comme une déduction du modèle.

### Hydratation lors de la reprise

À la reprise, le constructeur de `ChatRecordingService` appelle
`sessionService.getSessionTitleInfo(sessionId)` pour lire **à la fois** le
titre et sa source. Sans hydrater la source, `finalize()`'s
ré-ajout (qui s'exécute à chaque événement du cycle de vie de la session) réécrirait
auto en manuel à chaque cycle de reprise — supprimant silencieusement l'affordance
d'atténuation.

### Lecture atomique par paire

`extractLastJsonStringFields` renvoie `customTitle` et `titleSource`
depuis la **même ligne correspondante** en un seul balayage. Deux appels
séparés `readLastJsonStringFieldSync` pourraient atterrir sur différents enregistrements si
une ligne plus ancienne n'a que le champ primaire, produisant une paire non
correspondante. L'extracteur exige également un guillemet fermant approprié sur la valeur
primaire, donc un enregistrement de fin tronqué par un crash ne peut pas gagner la course de la
correspondance la plus récente.

### Plafond de balayage complet du fichier

Phase-2 (lorsque le chemin rapide de la fenêtre de queue échoue) diffuse le fichier
entier par morceaux de 64 Ko. Plafonné à `MAX_FULL_SCAN_BYTES = 64 Mo` pour qu'un
fichier JSONL corrompu de plusieurs Go ne puisse pas bloquer le sélecteur de session sur la boucle
d'événements principale. L'enveloppe de latence du sélecteur survit à la corruption.

### Défense contre les liens symboliques

Les lectures de session s'ouvrent avec `O_NOFOLLOW` (se rabat sur une simple lecture seule sous
Windows, où la constante n'est pas exposée). Défense en profondeur pour qu'un
lien symbolique placé dans `~/.qwen/projects/<proj>/chats/` ne puisse pas rediriger une
lecture de métadonnées vers un fichier sans rapport.

## Concurrence et cas limites

### Ordre des gardes de déclenchement

`maybeTriggerAutoTitle` vérifie six conditions dans cet ordre exact — chacune
court-circuite les suivantes afin que les moins coûteuses s'exécutent en premier :

1. `currentCustomTitle` défini → ignorer. Ne jamais écraser un titre manuel / auto précédent.
2. `autoTitleController !== undefined` → ignorer. Une seule tentative à la fois.
3. `autoTitleAttempts >= 3` → ignorer. Le plafond limite le gaspillage total.
4. `!config.isInteractive()` → ignorer. `qwen -p` / CI sans tête ne dépense jamais
   de jetons de modèle rapide pour une session unique.
5. `autoTitleDisabledByEnv()` → ignorer. `QWEN_DISABLE_AUTO_TITLE=1`
   désactivation explicite.
6. `!config.getFastModel()` → ignorer. Pas de modèle rapide → aucune opération.

### Pourquoi le plafond est 3, pas 1

Le premier tour de l'assistant peut être un pur appel d'outil sans texte
visible par l'utilisateur (par exemple, le modèle commence par un `grep`). `tryGenerateSessionTitle`
renvoie `{ok: false, reason: 'empty_history'}` dans ce cas. Sans fenêtre de
réessai, une session entière verrait sa chance d'avoir un titre brûlée sur le
tour 1 avant que l'utilisateur ne dise quoi que ce soit d'intéressant. Le plafond de 3 couvre
le cas courant « le premier tour est du bruit » tout en limitant les réessais incontrôlés sur
un modèle rapide qui échoue systématiquement.

### Course de renommage manuel inter-processus

Deux onglets CLI sur le même fichier de session peuvent diverger en mémoire. L'onglet A exécute
`/rename foo` et écrit `titleSource: manual`. L'onglet B
`ChatRecordingService` a son propre `currentCustomTitle = undefined` et
écraserait naïvement avec un titre auto.

Après la résolution de l'appel LLM, l'IIFE relit le JSONL via
`sessionService.getSessionTitleInfo`. Si le fichier montre
`source: 'manual'`, l'IIFE abandonne ET synchronise son état en mémoire afin que
les tours suivants respectent également le renommage. Coût : une lecture de queue de 64 Ko par
génération réussie ; négligeable.

### Propagation d'abandon lors de `finalize()`

`autoTitleController` sert également de drapeau de vol. `finalize()` (exécuté
lors du changement de session et de l'arrêt du processus) appelle
`autoTitleController.abort()` avant de ré-ajouter l'enregistrement de titre. Le
socket LLM est annulé rapidement ; le changement de session n'attend pas un appel de modèle rapide
lent. Le bloc `finally` de l'IIFE efface
`autoTitleController` uniquement s'il est toujours actif, donc une finalisation
en plein vol ne fait pas la course avec un `recordAssistantTurn` simultané.

### `/rename` manuel atterrit en plein vol

Entre la fin de l'attente de l'IIFE et l'appel `recordCustomTitle('auto')`,
l'utilisateur pourrait faire `/rename foo`. L'IIFE revérifie
`this.currentTitleSource === 'manual'` et abandonne. La vérification en cours
ET la re-lecture inter-processus s'exécutent toutes deux ; le manuel gagne aux deux
niveaux.

## Configuration

### Boutons visibles par l'utilisateur

| Paramètre / variable d'env     | Défaut | Effet                                                                                                 |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| `fastModel`                    | non défini | Requis pour l'auto-titrage. Non défini → aucune opération (pas de repli sur le modèle principal).       |
| `QWEN_DISABLE_AUTO_TITLE=1`    | non défini | Désactive le déclencheur auto sans désactiver `fastModel`. `/rename --auto` fonctionne toujours à la demande. |

Pas de bascule `settings.json` — la variable d'env est le seul interrupteur
visible par l'utilisateur. Justification : la fonctionnalité est cosmétique et peu coûteuse ; un
basculement de paramètres ajouterait une surface d'interface pour quelque chose qui peut vivre comme un
export d'env ponctuel pour les quelques utilisateurs qui veulent le désactiver.

### Pourquoi l'auto ne se rabat pas sur le modèle principal

L'auto-titrage est déclenché inconditionnellement après chaque tour d'assistant.
Si un utilisateur sans modèle rapide se voyait facturer silencieusement des jetons du modèle principal
pour chaque titre de nouvelle session, le delta de coût est invisible jusqu'à ce que
la facture mensuelle arrive. Échouer silencieusement (aucune opération, pas de titre, pas de coût) est
le défaut le plus sûr. `/rename --auto` remonte `no_fast_model` comme une
erreur exploitable afin que l'utilisateur puisse en définir un s'il le souhaite.

## Observabilité

`createDebugLogger('SESSION_TITLE')` émet `debugLogger.warn` depuis le
bloc catch du générateur. Les échecs sont totalement transparents pour l'utilisateur —
le titre auto est une fonctionnalité auxiliaire et ne se déclenche jamais dans l'interface utilisateur.

Les développeurs peuvent rechercher la balise `[SESSION_TITLE]` dans le journal de débogage
(`~/.qwen/debug/<sessionId>.txt` ; `latest.txt` pointe vers la session
courante). Un appel de bout en bout réussi ne produit aucune sortie de journal ; un
échec produit une ligne WARN avec le message d'erreur sous-jacent.

## Durcissement de sécurité

La valeur du titre est rendue textuellement dans le terminal (sélecteur de session)
ET persistée dans un fichier JSONL lisible par l'utilisateur. Les deux surfaces sont
accessibles à une attaque si un modèle rapide compromis ou injecté par invite renvoie
un texte hostile.

| Préoccupation                                  | Protection                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Injection ANSI / OSC-8 / CSI                   | `stripTerminalControlSequences` avant l'écriture JSONL et le rendu dans le sélecteur.                                            |
| Contrebande de lien cliquable via OSC-8        | Idem — les séquences OSC sont supprimées comme des unités entières, pas seulement l'octet ESC.                                    |
| Substituts UTF-16 invalides                    | Nettoyés dans `flattenToTail` (entrée LLM) et `sanitizeTitle` (sortie LLM après troncature de longueur max).                       |
| Usurpation de ligne de sous-type via contenu de message utilisateur | `lineContains: '"subtype":"custom_title"'` — le texte utilisateur qui contient par hasard l'expression textuelle ne peut pas masquer un vrai enregistrement. |
| Redirection de lien symbolique sur les lectures de session | `O_NOFOLLOW` (sans opération sous Windows où la constante est absente).                                                          |
| Enregistrement JSONL de fin tronqué            | `extractLastJsonStringFields` exige un guillemet fermant avant qu'un enregistrement ne gagne la course de correspondance la plus récente. |
| Taille de fichier pathologique bloquant le sélecteur | Plafond `MAX_FULL_SCAN_BYTES = 64 Mo` sur le balayage complet du fichier en Phase-2.                                              |
| Décorateurs de crochets CJK appariés (`【Ébauche】`) | Supprimés comme une unité pour qu'une parenthèse fermante isolée ne reste pas pendante.                                          |
## Hors du périmètre

| Élément                                        | Justification                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Régénération automatique lorsque le titre devient obsolète | `/rename --auto` est le chemin explicite déclenché par l'utilisateur. Des échanges de titre silencieux en cours de session dérouteraient les utilisateurs qui remontent dans le sélecteur. |
| Parité de style grisé WebUI / VSCode           | Ces surfaces lisent déjà `customTitle` et afficheront les titres automatiques comme s'ils étaient manuels. Une prochaine étape pourra connecter `titleSource`. |
| Bascule dans la boîte de dialogue des paramètres pour la génération automatique | Une variable d'environnement est le seul paramètre. L'ajout d'une interface de paramètres complète est simple si la demande utilisateur se manifeste. |
| Entrées du catalogue de locales i18n pour les nouvelles chaînes | Cohérent avec les chaînes `/rename` existantes, qui tombent par défaut en anglais. Un passage i18n à l'échelle du dépôt est hors du périmètre. |
| Migration pour reclassifier les enregistrements existants | Rétrocompatibilité par conception : l'absence de `titleSource` est traitée comme manuelle. Réécrire les anciens enregistrements risquerait de perdre l'intention de l'utilisateur. |
| Titrage automatique non interactif              | Les scripts `qwen -p` / CI jettent la session ; des tokens de modèle rapide pour un titre que personne ne reprendra jamais est un pur gaspillage. |