# DingTalk Workspace (DWS)

Le canal DWS utilise un compte déjà authentifié par le CLI DingTalk Workspace. Il reçoit les messages directs et de groupe, reconnaît les cartes de notification de mention de document DingTalk et publie la réponse de l'agent en retour au message d'origine ou au commentaire de document.

Ceci est distinct du [canal bot DingTalk](./dingtalk). Continuez à utiliser `type: "dingtalk"` pour un bot d'application dédié ; utilisez `type: "dws"` lorsque Qwen Code doit agir via une connexion DWS existante.

## Prérequis

Installez DWS CLI 1.0.57 ou plus récent sur l'hôte qui exécute Qwen Code, et assurez-vous que `dws` est résolu depuis le `PATH` de ce processus :

```bash
dws version --format json
```

Authentifiez-vous sur le même hôte :

```bash
dws auth login
dws profile list --format json
dws auth status --format json
```

Sur un serveur headless, utilisez `dws auth login --device`. Un canal épingle exactement un profil existant au démarrage. Définissez `profile` sur un nom de profil exact ou un corpId, ou omettez-le pour épingler l'entrée marquée `isCurrent`. Le canal traite chaque connexion DWS de la même manière et ne dépend pas des métadonnées `user_id`.

## Configuration

Ajoutez un canal à `~/.qwen/settings.json` :

```json
{
  "channels": {
    "dws-work": {
      "type": "dws",
      "profile": "profile-name-or-corp-id",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "watchTodos": true,
      "startReaction": "🤔",
      "endReaction": "赞",
      "groups": {
        "*": { "requireMention": true }
      },
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project"
    }
  }
}
```

Le mode d'approbation YOLO est disponible pour les bots de réponse qui doivent exécuter des appels d'outils sans confirmations interactives :

```json
{
  "channels": {
    "dws-answers": {
      "type": "dws",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "approvalMode": "yolo",
      "cwd": "/path/to/answer-bot"
    }
  }
}
```

Le mode YOLO approuve automatiquement chaque appel d'outil. Utilisez-le uniquement pour un compte bot et un workspace de confiance.

`senderPolicy` et `groupPolicy` sont par défaut à `pairing` pour un canal DWS nouvellement géré. Approuvez un utilisateur ou un groupe avec le code renvoyé par le canal :

```bash
qwen channel pairing approve dws-work CODE
```

`senderPolicy` contrôle les expéditeurs de messages directs, les auteurs de notifications de document, les créateurs de todos natifs et les expéditeurs dans les groupes `open` ou `allowlist`. `groupPolicy` contrôle les conversations de groupe. Un groupe appairé approuvé suit le comportement partagé du canal et autorise ses membres ; les groupes open et allowlist doivent également passer `senderPolicy`.

`groups` contrôle le comportement de mention. Un ID de groupe concret remplace `"*"`. Avec `requireMention: true`, seul un message @ réveille le canal. Avec `requireMention: false`, les messages ordinaires sont également reçus après que les politiques de groupe et d'expéditeur sont passées.

Les mentions de groupe utilisent d'abord le flux d'événements personnel en temps réel. Le canal vérifie également l'historique des messages `@` récents toutes les cinq secondes, afin que les mentions des groupes externes soient récupérées lorsque DingTalk les omet du flux d'événements personnel. Les messages sont dédupliqués par conversation et par ID de message sur les deux chemins.

Lorsqu'un message cite un autre message DingTalk, le texte cité est inclus comme contexte de réponse pour l'agent sur les chemins temps réel et de secours par historique.

Les messages directs ordinaires sont récupérés de la même manière : une vérification de l'historique toutes les cinq secondes relance tout message direct omis par le flux en temps réel, dédupliqué par conversation et par ID de message sur les deux chemins.

`startReaction` est le caractère emoji ou le nom de réaction DingTalk ajouté pendant qu'une tâche acceptée est en cours d'exécution ; une valeur omise ou vide utilise la valeur par défaut `🤔`. `endReaction` la remplace après que la tâche se termine, échoue ou est annulée ; une valeur omise ou vide désactive la réaction de fin.

## Mentions de documents

Il n'y a pas de liste de surveillance de documents ou de base de connaissances. Pour démarrer une tâche de document :

1. Ajoutez un commentaire de document DingTalk qui @mentionne le compte authentifié.
2. Activez l'option qui envoie une notification DingTalk à ce compte.
3. DWS délivre la carte de notification via l'historique des messages directs du compte.

Le canal extrait l'ID du document, la clé de commentaire et la requête depuis cette notification. Il lit le document référencé pour le contexte, ajoute la réaction de démarrage configurée pendant l'exécution de la tâche, et répond au commentaire de document d'origine. Le flux d'événements DWS en temps réel est utilisé lorsqu'il contient la carte ; une vérification incrémentale de l'historique toutes les cinq secondes couvre les cartes omises par le flux d'événements actuel.

Les commentaires qui ne génèrent pas de notification sont ignorés par conception. Les messages de notification en double pour le même commentaire de document ne s'exécutent qu'une seule fois. Les tâches de document suivent `senderPolicy` et supportent `approvalMode` `default`, `plan` ou `yolo` ; `default` est utilisé lorsqu'il est omis.

## Modifications de todos natifs

Définissez `watchTodos: true` pour poller les todos natifs en attente du profil DWS sélectionné où le compte est un exécuteur. L'option est par défaut à `false` afin que l'ajout d'un canal DWS n'exécute jamais implicitement les todos existants.

Le premier scan réussi établit une baseline et ne démarre pas les todos historiques. Les scans ultérieurs exécutent une tâche lorsqu'un todo est nouvellement assigné, rouvert, ou que ses champs actionnables changent, y compris son titre, sa priorité, sa date limite ou ses assignés. La réponse finale est ajoutée en tant que commentaire sur le todo d'origine. Les métadonnées de commentaire uniquement et les horodatages de modification sont exclus de la détection de changements afin que la propre réponse du canal ne puisse pas déclencher une boucle. L'achèvement ou la suppression retire le todo de l'ensemble en attente ; le rouvrir crée un nouveau déclencheur.

Les todos natifs suivent `senderPolicy` en utilisant l'identité du créateur du todo. Sous `pairing`, le canal ajoute un commentaire de code d'appairage et maintient le todo en attente ; après que le créateur est approuvé localement, un poll ultérieur peut traiter le todo inchangé. Le polling s'exécute toutes les 30 secondes et reste limité à l'organisation actuelle du profil épinglé.

## Démarrage et vérification

Exécutez le canal directement :

```bash
qwen channel start dws-work
```

Ou laissez le démon le gérer :

```bash
qwen serve --workspace /path/to/your/project --channel dws-work
```

N'exécutez pas les deux formes en même temps car elles partagent le bail de service de canal.

Pour la vérification locale, envoyez un message direct depuis un autre compte, approuvez l'appairage si nécessaire, et vérifiez que la réaction de démarrage configurée apparaît pendant l'exécution de la tâche. Si une réaction de fin est configurée, vérifiez qu'elle remplace la réaction de démarrage par la suite. Ajoutez ensuite un commentaire de document avec la notification de @mention activée. Le canal devrait réagir au message de notification, lire le document et publier la réponse finale sous le commentaire d'origine. Un commentaire avec la notification désactivée ne devrait produire aucune tâche.

Le canal ignore les événements provenant des IDs d'expéditeur que DWS identifie comme le compte authentifié, empêchant les boucles de réponse et d'appairage sans déduire l'identité du texte du message. Le démarrage des sources IM nécessite cette auto-identité autoritaire : si le compte authentifié n'expose aucun openDingTalkId et qu'aucune session antérieure sous le même profil n'en a enregistré un, le canal refuse de se connecter. Une reconnexion qui perd temporairement l'ID continue de filtrer sur les IDs d'expéditeur auto-enregistrés précédemment.
