# GitHub

Ce guide couvre la configuration d'un canal Qwen Code qui surveille les notifications GitHub et répond aux mentions, demandes de review, assignations et activité des threads suivis.

## Prérequis

- Un compte GitHub authentifié avec les permissions nécessaires pour lire les notifications et publier des commentaires
- [GitHub CLI](https://cli.github.com/) installé sur l'hôte exécutant Qwen Code lors de l'utilisation de l'authentification locale `gh`

Utilisez un compte bot dédié lorsque le compte authentifié doit également opérer le canal. GitHub ne génère pas de notification utilisable pour l'activité propre du compte, et l'adaptateur ignore ses propres commentaires pour éviter les boucles de réponse.

## Authentification

Pour réutiliser la connexion GitHub CLI sur l'hôte Qwen Code, authentifiez `gh` et définissez explicitement `useLocalGh: true` dans la configuration du canal :

```bash
gh auth login
```

L'authentification locale `gh` couvre l'ensemble du compte et peut exposer les notifications de chaque dépôt visible par ce compte GitHub. Ne l'activez que lorsque l'opérateur du workspace est fiable pour utiliser ce compte. Sinon, configurez un PAT dédié.

Pour GitHub Enterprise Server, authentifiez le même hôte que celui utilisé par `baseUrl` :

```bash
gh auth login --hostname github.example.com
```

Vous pouvez également configurer un personal access token classique (PAT). Un `token` explicite remplace l'authentification locale `gh`. Le PAT nécessite ces scopes :

- **notifications** — lire les threads de notification
- **public_repo** (ou **repo** pour les dépôts privés) — publier des commentaires

## Configuration

Ajoutez le canal à `~/.qwen/settings.json` :

```json
{
  "channels": {
    "my-github": {
      "type": "github",
      "useLocalGh": true,
      "pollInterval": 60000,
      "reasonFilter": ["mention", "review_requested", "assign"],
      "senderPolicy": "allowlist",
      "allowedUsers": ["operator-github-username"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "blockStreaming": "off",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Pour remplacer l'authentification locale `gh` par un PAT, ajoutez `"token": "$GITHUB_TOKEN"` au canal et définissez la variable d'environnement avant de démarrer Qwen Code :

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

Le compte authentifié ne peut pas déclencher son propre canal. Si ce compte doit opérer le canal, authentifiez un compte bot séparé et ne mettez que les comptes opérateurs dans `allowedUsers`. Le démarrage rejette une allowlist ne contenant que le compte authentifié et avertit lorsqu'il apparaît avec d'autres opérateurs.

### GitHub Enterprise

Pour GitHub Enterprise Server, définissez `baseUrl` :

```json
{
  "baseUrl": "https://github.example.com/api/v3"
}
```

L'authentification locale `gh` nécessite un `baseUrl` HTTPS afin que le credential de l'hôte du démon ne puisse pas être envoyé sur du HTTP en clair.

## Options de configuration

| Option                    | Défaut                   | Description                                                                                   |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `token`                   | non défini               | PAT classique optionnel avec le scope `notifications` ; remplace l'authentification locale `gh` |
| `useLocalGh`              | `false`                  | Réutiliser explicitement l'authentification GitHub CLI du compte de l'hôte du démon           |
| `pollInterval`            | `60000`                  | Intervalle de polling en ms                                                                   |
| `baseUrl`                 | `https://api.github.com` | URL de base de l'API (pour GHE)                                                               |
| `groupPolicy`             | `"disabled"`             | Doit être `"open"`, `"allowlist"` avec le dépôt (`owner/repo`) listé dans `groups`, ou `"pairing"` avec le dépôt approuvé pour que les notifications circulent |
| `senderPolicy`            | `"allowlist"`            | Qui peut déclencher le bot                                                                    |
| `groups.*.requireMention` | `true`                   | Exiger les @mentions pour les commentaires ordinaires ; les raisons de notification dirigées s'exécutent toujours |
| `blockStreaming`          | `"off"`                  | Toujours forcé à `"off"` ; les chunks intermédiaires du modèle ne sont pas publiés ; `"on"` n'est pas supporté |
| `reasonFilter`            | non défini               | Allowlist optionnelle de raisons de notification GitHub à traiter                             |

Utilisez `reasonFilter` pour éliminer les classes de notifications bruyantes comme `ci_activity` ou `state_change`. N'utilisez pas `reasonFilter: ["mention"]` comme remplacement de `groups.*.requireMention` : la raison `mention` de GitHub est persistante au niveau du thread, de sorte que de vraies nouvelles @mentions peuvent arriver plus tard sous les raisons `comment`, `subscribed`, `author` ou autres et seraient ignorées.

Les valeurs valides de `reasonFilter` sont `mention`, `review_requested`, `assign`, `author`, `comment`, `ci_activity`, `manual`, `state_change`, `subscribed`, `team_mention`, `security_alert`, `approval_requested`, `invitation`, `member_feature_requested` et `security_advisory_credit`.

Les notifications filtrées sont marquées comme lues uniquement après que tout le travail accepté dans la fenêtre de polling est terminé. Supprimer le filtre plus tard ne rejouera pas les notifications que le canal a déjà ignorées.

## ⚠️ Sécurité

Sur un **dépôt public**, définir `senderPolicy: "open"` permet à **tout utilisateur GitHub** qui déclenche une raison de notification supportée de soumettre des prompts qui pilotent l'agent dans votre `cwd`. Cela inclut la lecture de code, la dépense de tokens, la publication de commentaires et (selon la politique de permissions) l'exécution d'outils.

Utilisez toujours `senderPolicy: "allowlist"` avec des `allowedUsers` explicites sur les dépôts publics.

Les entrées d'allowlist et de pairing suivent le **nom d'utilisateur**, pas l'ID de compte immuable. Si un utilisateur en allowlist renomme son compte GitHub, supprimez l'entrée obsolète — GitHub libère l'ancien nom d'utilisateur pour que n'importe qui d'autre puisse se l'approprier, et le nouveau titulaire hériterait de l'autorisation d'allowlist/pairing.

Notez que sous `groupPolicy: "pairing"`, l'accès est accordé par dépôt : une fois qu'un dépôt est approuvé, **tout utilisateur GitHub** peut piloter le bot via les issues et pull requests de ce dépôt. Tout le trafic GitHub est du trafic de groupe, donc `senderPolicy` et `allowedUsers` ne filtrent pas les membres d'un dépôt approuvé. Les approbations sont indexées par le nom complet du dépôt (`owner/repo`), qui change en cas de renommage ou de transfert — révoquez les approbations de groupe obsolètes après tout renommage, transfert ou suppression de dépôt.

## Détection des mentions

L'adaptateur détecte les mentions en analysant le texte des commentaires et les corps d'issues ou de PRs de premier contact pour `@bot-username` à l'aide d'une regex insensible à la casse. Il ne fait pas confiance à `reason: "mention"` seul car cette valeur est persistante au niveau du thread. Les autres raisons sélectionnent des prompts de review, triage, threads suivis ou fallback.

## Comment ça marche

L'adaptateur utilise l'API Notifications de GitHub comme signal de réveil :

1. **Poll** `GET /notifications` pour les threads non lus
2. **Énumérer** les commentaires via `listComments` dans une fenêtre temporelle basée sur un curseur
3. **Persister le travail accepté** avant le dispatch, incluant l'enveloppe source et les clés de déduplication
4. **Dispatch** par raison de notification : correspondance stricte des mentions, review de pull request, triage d'issue, agrégation de commentaires de threads suivis, ou fallback par commentaire
5. **Valider la fenêtre de polling** uniquement après la fin du travail accepté : marquer les notifications comme lues et avancer le curseur
6. **Fallback de premier contact** : un corps d'issue/PR non lu et tout neuf peut être traité quand aucun commentaire n'a été dispatché ; les notifications de mention nécessitent toujours une mention réelle dans le corps

La fenêtre de commentaires est `(previousCursor, currentMaxUpdatedAt]`. Les tâches acceptées, en cours et échouées sont stockées sous `~/.qwen/channels/<workspace-scope>/` avec des permissions de fichier privées. Au redémarrage, le canal récupère ces tâches avant de re-poller GitHub. Les tâches échouées sont tentées jusqu'à trois fois, puis deviennent terminales ; les tâches annulées sont terminales et ne sont pas relancées. Une tâche dont la réponse finale a déjà été publiée, supprimée ou mise en file d'attente pour un retry sans écriture définitive n'est pas relancée.

Le curseur de notification n'avance pas tant qu'il reste des tâches récupérables, ou lorsque l'état des tâches entrantes ne peut pas être lu ou écrit. Cela empêche un crash ou une défaillance de l'agent de perdre un commentaire accepté et préserve les clés de déduplication nécessaires pour éviter un second dispatch depuis le flux de notifications.

L'activité hors commentaires (push, changements de labels) met à jour le `updated_at` de la notification mais ne produit aucun nouveau commentaire dans la fenêtre, donc les threads re-récupérés sont ignorés sans déclencher l'agent.

## Feedback de réponse

Pour un commentaire d'issue ou de pull request accepté, le canal ajoute la réaction `👀` de GitHub pendant que l'agent travaille, puis la supprime quand l'exécution se termine, échoue ou est annulée. Les deux opérations sont best-effort : une défaillance de l'API de réactions ou de permission est journalisée et n'empêche jamais la réponse finale.

### Sortie finale uniquement

Le canal GitHub force toujours la livraison finale uniquement. L'adaptateur définit `blockStreaming` à `"off"`, donc les chunks intermédiaires du modèle ne sont jamais publiés comme des commentaires séparés et `blockStreaming: "on"` n'est pas supporté.

```json
{
  "blockStreaming": "off"
}
```

Si GitHub renvoie un échec de livraison sans écriture définitif, comme une réponse
de rate-limit, le canal stocke la réponse finale dans
`~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json`
avec des permissions de fichier privées et la re-tente au prochain démarrage du canal. La
tâche entrante correspondante reste en état `reply_pending` jusqu'à ce que cette livraison
réussisse ou atteigne un échec terminal définitif. Les échecs de livraison ambigus ne
sont pas re-tentés automatiquement car GitHub a peut-être créé le commentaire.

## Limitations connues

- **Le premier démarrage ignore les notifications non lues existantes.** Le curseur s'initialise à "maintenant" au premier lancement. Les notifications créées avant le démarrage du bot ne sont pas traitées sauf si le thread reçoit une nouvelle activité ensuite.
- Si un utilisateur marque une notification comme lue sur github.com avant le cycle de polling du bot, le bot ne la traitera pas.
- Le bot ne lit pas les commentaires avant la fenêtre de polling en cours ; les notifications `author` et `comment` peuvent agréger jusqu'à 20 commentaires de cette fenêtre.
- Les commentaires de review inline de PR et les corps de résumé de review ne sont pas énumérés ; seuls les commentaires d'issues/PRs sont traités.
- Le credential sélectionné doit supporter l'API Notifications. Les PATs à grain fin ne la supportent pas ; utilisez l'authentification locale `gh` ou un PAT classique avec le scope `notifications`.

## Démarrer le canal

```bash
qwen channel start my-github
```
