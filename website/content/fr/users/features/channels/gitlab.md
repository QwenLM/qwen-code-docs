# GitLab

Ce guide couvre la configuration d'un canal Qwen Code qui surveille les todos GitLab et répond aux mentions sur les issues et merge requests.

## Prérequis

- Un compte GitLab (ou un compte bot dédié)
- Un Personal Access Token GitLab avec les scopes `read_api` et `api`

## Créer un token

1. Allez dans **Preferences → Access Tokens**
2. Créez un token avec ces scopes :
   - **read_api** — lire les todos et les données de projet
   - **api** — publier des notes (commentaires) sur les issues/MRs
3. Sauvegardez le token de manière sécurisée comme variable d'environnement

## Configuration

Ajoutez le canal à `~/.qwen/settings.json` :

```json
{
  "channels": {
    "my-gitlab": {
      "type": "gitlab",
      "token": "$GITLAB_TOKEN",
      "pollInterval": 60000,
      "senderPolicy": "open",
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "action_prompt_template": {
        "mentioned": "Project: %project% | URL: %project_url% | Author: %author% | Type: %target_type% | IID: %iid% | Title: %title% | Description: %description% | TodoID: %todo_id%"
      }
    }
  }
}
```

Définissez le token comme variable d'environnement :

```bash
export GITLAB_TOKEN="glpat-your_token_here"
```

### GitLab auto-hébergé

Pour les instances auto-hébergées, définissez `baseUrl` :

```json
{
  "baseUrl": "https://gitlab.example.com"
}
```

## Options de configuration

| Option                   | Défaut                    | Description                                                |
| ------------------------ | ------------------------- | ---------------------------------------------------------- |
| `token`                  | (requis)                  | PAT avec les scopes `read_api` + `api`                     |
| `pollInterval`           | `60000`                   | Intervalle de polling en ms                                |
| `baseUrl`                | `https://gitlab.com`      | URL de l'instance GitLab                                   |
| `action_prompt_template` | (requis pour le traitement) | Associe les noms d'actions GitLab à des templates de métadonnées |
| `groupPolicy`            | `"disabled"`              | Doit être `"open"`, `"allowlist"` avec le projet listé, ou `"pairing"` avec le projet approuvé |
| `senderPolicy`           | `"allowlist"`             | Qui peut déclencher le bot                                 |

## action_prompt_template

Ce champ contrôle quelles actions de todo sont traitées et comment les métadonnées sont rendues. Seules les actions avec un template configuré sont dispatchées ; toutes les autres sont ignorées et marquées comme terminées.

```json
{
  "action_prompt_template": {
    "mentioned": "Project: %project% | Author: %author% | Title: %title%"
  }
}
```

L'action `directly_addressed` (commentaire commençant par `@bot`) revient automatiquement au template `mentioned` si elle n'est pas explicitement configurée.

### Clés d'action disponibles

| Clé                   | Déclencheur                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `mentioned`           | Quelqu'un @mention le bot dans un commentaire ou une description (pas au début) |
| `directly_addressed`  | Un commentaire **commence par** `@bot` (revient au template `mentioned`)     |
| `assigned`            | Quelqu'un assigne le bot à une issue/MR                                      |
| `review_requested`    | Quelqu'un demande le bot comme reviewer sur une MR                           |
| `approval_required`   | Une MR nécessite l'approbation du bot (règles d'approbation)                 |
| `marked`              | Quelqu'un marque le commentaire/issue/MR du bot (étoile)                     |
| `build_failed`        | Un pipeline CI/CD échoue sur la branche/MR du bot                            |
| `unmergeable`         | Une MR impliquant le bot devient non-fusionnable (conflits)                  |
| `merge_train_removed` | Une MR est retirée du merge train                                            |

Seules les clés présentes dans `action_prompt_template` sont traitées. Les actions non configurées sont ignorées et marquées comme terminées silencieusement.

### Variables de template

| Variable        | Valeur                              |
| --------------- | ----------------------------------- |
| `%project%`     | Chemin du projet (par ex. `owner/repo`) |
| `%project_url%` | URL complète du projet              |
| `%author%`      | Nom d'utilisateur de l'auteur du todo |
| `%target_type%` | `Issue` ou `MergeRequest`           |
| `%iid%`         | ID interne de l'issue/MR            |
| `%title%`       | Titre de l'issue/MR                 |
| `%description%` | Corps de la description de l'issue/MR |
| `%todo_id%`     | ID du todo GitLab                   |
| `%%`            | `%` littéral (échappement)          |

Les variables inconnues sont conservées telles quelles dans la sortie.

### Assemblage du prompt

Le template est rendu dans `envelope.metadata` (contexte structuré). Le texte déclencheur (`todo.body` ou la description) va dans `envelope.text` (prompt principal). La classe de base assemble le prompt final envoyé à l'agent :

```
[alice] please fix this bug

Project: owner/repo | URL: https://gitlab.com/owner/repo | Author: alice | Type: Issue | IID: 42 | Title: Test Issue | Description: ... | TodoID: 100
```

- Ligne 1 : préfixe `[sender]` + `envelope.text` (avec `@bot` supprimé)
- Ligne 3 : `envelope.metadata` (template rendu, nettoyé)

Vous n'avez **pas** besoin d'une variable `%body%` — le texte du commentaire/de la description est toujours le contenu principal du prompt, et le template fournit un contexte supplémentaire en dessous.

## ⚠️ Sécurité

Sur un **projet public**, définir `senderPolicy: "open"` permet à **tout utilisateur GitLab** qui @mention le bot de soumettre des prompts qui pilotent l'agent dans votre `cwd`.

Utilisez toujours `senderPolicy: "allowlist"` avec des `allowedUsers` explicites sur les projets publics.

Notez que sous `groupPolicy: "pairing"`, l'accès est accordé par projet : une fois qu'un projet est approuvé, **tout utilisateur GitLab** peut piloter le bot via les issues et merge requests de ce projet. Tout le trafic GitLab est du trafic de groupe, donc `senderPolicy` et `allowedUsers` ne filtrent pas les membres d'un projet approuvé. Les approbations sont indexées par le chemin du projet (`owner/repo`), qui change en cas de renommage ou de transfert — révoquez les approbations de groupe obsolètes après tout renommage, transfert ou suppression de projet.

## Détection des mentions

L'adaptateur définit toujours `isMentioned = true` sur les enveloppes dispatchées, car GitLab a déjà déterminé la mention lors de la création du todo. La configuration `action_prompt_template` est le véritable filtre d'événements — seules les actions avec un template configuré sont traitées. La mention `@bot` est supprimée du texte du message avant le dispatch via `stripBotMention`.

### ⚠️ groupPolicy doit être "open", "allowlist" ou "pairing"

`groupPolicy` doit être défini à `"open"`, `"allowlist"` avec le projet explicitement listé, ou `"pairing"` pour que les todos soient traités. Sous `"pairing"`, la première mention provenant d'un projet non approuvé crée une demande d'appairage de groupe ; approuvez-la une fois avec `qwen channel pairing approve`, et les todos de ce projet seront dispatchés à partir de ce moment. La valeur par défaut `"disabled"` ignore toutes les mentions : les todos sont marqués comme terminés et le curseur avance, mais aucun dispatch n'a lieu. Un rejet est journalisé (`preflight rejected reason=group_disabled`) mais le todo est toujours consommé. Si votre bot ne répond pas aux mentions, vérifiez que `groupPolicy` n'est pas `"disabled"`.

## Comment ça marche

L'adaptateur utilise l'API Todos de GitLab comme source de messages :

1. **Poll** `GET /todos?state=pending` pour les nouveaux todos
2. **Drainage du premier poll** : si le curseur n'a jamais été initialisé (`initialized: false`), tous les todos en attente sont marqués comme terminés sans dispatch et le curseur avance à l'ID de todo max. Cela évite un afflux de retard au premier démarrage.
3. **Nettoyage des todos obsolètes** : les todos avec `id <= cursor` sont marqués comme terminés (best-effort) pour éviter qu'ils ne soient re-récupérés à chaque poll
4. **Filtrer** par `id > cursor` et `action_prompt_template` configuré
5. **Détecter le type de mention** via l'ancre `target_url` :
   - `#note_123` présent → mention dans un commentaire → le texte est `todo.body` (le commentaire)
   - Pas d'ancre → mention dans la description → le texte est la description de l'issue/MR
6. **Dispatcher** l'enveloppe via `handleInbound` (nécessite `groupPolicy: "open"`, `"allowlist"` avec le projet listé, ou `"pairing"` avec le projet approuvé)
7. **Avancer le curseur** et **marquer le todo comme terminé** (best-effort)

Le curseur (`lastProcessedId`) avance indépendamment du succès ou de l'échec du dispatch. Les dispatchs échoués publient un commentaire d'erreur ⚠️ sur l'issue/MR et ne sont pas re-tentés — l'utilisateur peut re-mentionner le bot pour déclencher un nouveau todo.

## Feedback de réponse

Pour une mention dans un commentaire accepté (note avec l'ancre `#note_`), le canal ajoute un award emoji 👀 à la note pendant que l'agent travaille, puis le supprime quand l'exécution se termine, échoue ou est annulée. Les deux opérations sont best-effort : une défaillance de l'API d'award emoji ou de permission est journalisée et n'empêche jamais la réponse finale.

Les mentions dans les descriptions (pas d'ancre `#note_`) ne reçoivent pas d'award emoji car il n'y a pas de note spécifique à laquelle réagir.

## Limitations connues

- **Le premier démarrage ignore les todos en attente existants.** Le curseur s'initialise à `{ lastProcessedId: 0, initialized: false }` au premier lancement. Lors du premier cycle de poll, tous les todos en attente préexistants sont marqués comme terminés sans dispatch (le flag `initialized` conditionne ce drainage unique), évitant un afflux de retard.
- Le bot ne lit pas l'historique de conversation antérieur — seul le contenu déclencheur est traité.
- **Notes confidentielles (internes) :** Si quelqu'un @mention le bot dans une note confidentielle, le corps du todo contient ce texte interne et l'agent le traitera. La réponse du bot est toujours publiée comme une note **publique**, exposant potentiellement une discussion interne. L'API todo de GitLab n'expose pas la visibilité des notes, donc l'adaptateur ne peut pas filtrer cela. Évitez de @mentionner le bot dans des notes confidentielles.
- Nécessite les scopes PAT `read_api` + `api`. Les tokens au niveau du groupe ou du projet fonctionnent s'ils ont ces scopes.
- Les todos pour les Epics, Designs et Alerts sont ignorés (seules les Issues et MRs sont traitées).

## Démarrer le canal

```bash
qwen channel start my-gitlab
```
