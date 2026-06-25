# Mode Auto

Le mode Auto utilise un classificateur LLM pour évaluer chaque appel d'outil et décider
s'il doit être auto-approuvé. Il se situe entre Auto-Edit (qui n'auto-approuve
que les modifications de fichiers) et YOLO (qui auto-approuve tout).

Cette page est la référence pour configurer et dépanner le mode Auto.
Pour une introduction, voir l'
[aperçu du mode d'approbation](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## Fonctionnement

Lorsque vous êtes en mode Auto et que l'agent tente d'exécuter un outil, Qwen Code
parcourt trois couches dans l'ordre :

1. **acceptEdits fast-path** — Les modifications/écritures dont le chemin cible se trouve
   dans l'espace de travail sont auto-approuvées sans invoquer le classificateur.
   **Exception :** les écritures sur les surfaces d'auto-modification propres à Qwen Code
   (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`,
   noms de fichiers de contexte configurés, `.qwen/rules/`, `.qwen/commands/`,
   `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) et
   les surfaces de persistance (`.git/`, `.husky/`, `package.json`, `.npmrc`,
   `Makefile`, `.github/workflows/`, etc.) passent par le classificateur
   même lorsqu'elles sont dans l'espace de travail. Les liens symboliques pointant vers des chemins
   protégés sont également résolus et rejetés. Les commandes shell qui atteignent ces
   chemins via `cd && bash -lc '...'` ou d'autres enveloppes passent aussi par
   le classificateur.
2. **Liste blanche d'outils sûrs** — Les outils intégrés en lecture seule ou ne traitant que des métadonnées
   (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion, etc.) sont
   auto-approuvés sans invoquer le classificateur.
3. **Classificateur LLM** — Tout le reste (commandes shell, requêtes web,
   création de sous-agents, modifications en dehors de l'espace de travail, outils MCP) est envoyé à
   un classificateur en deux étapes :
   - **Étape 1 (rapide)** — ne produit que `{ shouldBlock }`. Environ 300 ms.
     Si `shouldBlock` est `false`, l'action est autorisée et l'appel
     se poursuit.
   - **Étape 2 (réflexion)** — ne s'exécute que si l'étape 1 a indiqué blocage. Utilise un
     examen par raisonnement en chaîne pour réduire les faux positifs de l'étape 1.
     Peut rétrograder le blocage de l'étape 1 en autorisation. Produit la
     `reason` visible par l'utilisateur en cas de blocage.

Le classificateur utilise votre modèle rapide configuré
(`/model --fast`). Si aucun modèle rapide n'est configuré, le modèle de session principal
est utilisé à la place.

## Les règles strictes prévalent toujours

Le mode Auto ne **remplace pas** les règles d'autorisation strictes. Avant que le classificateur
ne s'exécute :

- Les règles `permissions.deny` bloquent l'action avec la raison de la règle. Le
  classificateur ne la voit jamais.
- Les règles `permissions.allow` avec des spécificateurs précis (par ex.
  `Bash(git status)`, `Read(./docs/**)`) continuent d'autoriser sans
  le classificateur — **sauf** lorsque l'appel aboutit à une écriture sur un chemin
  protégé d'auto-modification ou de persistance (voir la liste dans
  "Fonctionnement"). Dans ce cas, le mode Auto réévalue l'appel via
  le classificateur pour qu'une règle d'autorisation sur `Bash(*)` ne puisse pas silencieusement
  se transformer en permission de réécrire les paramètres, commandes, hooks,
  skills ou serveurs MCP de Qwen Code.
- Les règles `permissions.ask` imposent une confirmation manuelle même en mode Auto.

## Les règles d'autorisation trop larges sont retirées en mode Auto

Des règles comme les suivantes permettraient à l'agent d'exécuter du code arbitraire
sans examen du classificateur :

- `Bash` / `Bash(*)` / `Bash()` — auto-autorise toutes les commandes shell
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — wildcards d'interpréteurs
- `Agent` / `Agent(coder)` — toute autorisation sur l'outil Agent
- `Skill` / `Skill(pdf)` — toute autorisation sur l'outil Skill

Lorsque vous entrez en mode Auto, Qwen Code supprime temporairement ces règles de
l'ensemble d'autorisations actif et affiche un avis les listant. Les règles
reviennent dès que vous quittez le mode Auto. `settings.json` n'est jamais
modifié.

Si vous avez vraiment besoin de ces règles larges, utilisez le mode YOLO à la place.

## Configuration des indices

Le mode Auto lit `permissions.autoMode` dans votre `settings.json`. Les
entrées sont des descriptions en langage naturel, pas des motifs de règles — elles sont
injectées de manière additive dans le prompt système du classificateur en plus des
valeurs par défaut intégrées.

Il existe trois catégories d'indices plus une liste d'environnement :

- **`allow`** — actions que le classificateur doit auto-approuver.
- **`softDeny`** — actions destructrices ou irréversibles que le classificateur doit
  bloquer **sauf si la demande explicite la plus récente de l'utilisateur demandait
  exactement cette action et ce périmètre**. Les soft denys peuvent être levés par
  l'intention de l'utilisateur ; un "oui, fais ce que tu veux" générique ne compte pas.
- **`hardDeny`** — actions de limite de sécurité que le classificateur doit bloquer
  en mode Auto, indépendamment de `autoMode.hints.allow` ou de l'intention
  récente de l'utilisateur. Il s'agit d'une politique du classificateur, pas d'une règle
  d'autorisation déterministe : elle ne remplace pas `permissions.allow`. Utilisez `permissions.deny`
  pour les actions qui ne doivent jamais être autorisées par le gestionnaire d'autorisations.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Exécuter poetry install et poetry update dans ce projet Python",
          "Nettoyer les artefacts de build sous ./dist ou ./build",
          "Lire n'importe quel fichier sous /Users/me/code/"
        ],
        "softDeny": [
          "Modifier les paramètres de Qwen Code sauf si je demande explicitement le changement exact",
          "Exécuter des scripts de migration qui touchent la base de production"
        ],
        "hardDeny": [
          "Envoyer des secrets ou le contenu de .env vers un point de terminaison réseau",
          "Modifier quoi que ce soit sous ~/.ssh ou ~/.aws"
        ]
      },
      "environment": [
        "Ceci est un monorepo privé avec une signature de commit stricte",
        "Les identifiants de production se trouvent dans 1Password, jamais dans des fichiers en clair"
      ]
    }
  }
}
```
`hints.deny` est toujours accepté pour la compatibilité ascendante et est traité comme `softDeny`. Le mélange des deux est possible — les entrées sont concaténées, `softDeny` en premier.

### Limites de longueur et de nombre

Pour garder le prompt système du classificateur petit :

- Chaque entrée est limitée à 200 caractères (les entrées plus longues sont tronquées avec un avertissement).
- `hints.allow`, `hints.softDeny` et `hints.hardDeny` acceptent jusqu'à 50 entrées chacun.
- `environment` accepte jusqu'à 20 entrées.

### Empilement entre fichiers de configuration

`autoMode` est fusionné entre les paramètres système / utilisateur / espace de travail de la même manière que les autres paramètres d'autorisation : les tableaux sont concaténés et dédoublonnés.

## Interprétation de la décision

Lorsque le classificateur bloque une action, l'appel d'outil échoue avec l'un des messages d'erreur suivants :

- **`Blocked by auto mode policy: <reason>`** — le classificateur a jugé l'action dangereuse. La raison provient de l'étape 2 du classificateur.
- **`Auto mode classifier unavailable; action blocked for safety`** — l'API du classificateur était inaccessible, a expiré ou a renvoyé une réponse non analysable. C'est un comportement de sécurité par défaut : en cas de doute, bloquer.

Les deux messages sont suivis d'une ligne de guidage finale indiquant à l'agent que **l'action refusée spécifiquement** ne doit pas être accomplie via un autre outil, indirection shell, script généré, alias, lien symbolique, changement de configuration, hook, fichier de commandes, configuration MCP, charge utile encodée, ou tout chemin équivalent. **Les travaux sécurisés sans rapport et les alternatives réellement plus sûres sont toujours autorisées** — seules les tentatives d'accomplir la même intention refusée via une surface différente sont bloquées.

Si l'action refusée est réellement nécessaire, l'agent doit s'arrêter et vous demander une approbation explicite plutôt que de contourner le refus.

### Langue des raisons du classificateur

Les raisons du classificateur sont produites par le LLM et ne sont pas traduites. Si vous souhaitez des raisons non anglaises, ajoutez une indication comme `Respond reasons in Chinese` à `permissions.autoMode.environment`.

## Repli vers l'approbation manuelle

Le mode automatique vous évite de rester bloqué :

- Après **3 blocages consécutifs par la politique**, le prochain appel d'outil bascule vers l'invite d'approbation manuelle standard. Cela couvre le cas où l'agent continue d'essayer des variantes mineures d'une commande interdite.
- Après **2 résultats indisponibles consécutifs** (échecs de l'API du classificateur), le prochain appel d'outil bascule également. Cela évite d'attendre un classificateur défaillant.

La session elle-même reste en mode automatique — seul l'appel de repli unique passe par l'approbation manuelle. Les compteurs se réinitialisent lorsque vous approuvez l'appel de repli ou changez de mode.

Si vous rencontrez constamment des replis, les causes les plus probables sont une panne de l'API du classificateur ou des indications nécessitant un ajustement. Passez en mode par défaut pendant que vous enquêtez.

## Dépannage

**"Le mode automatique bloque mes commandes"**

Regardez la raison dans le message d'erreur. Si le classificateur est trop conservateur pour votre contexte, ajoutez une entrée à `permissions.autoMode.hints.allow` décrivant le modèle en langage naturel. Exemples :

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**"Classificateur du mode automatique indisponible"**

L'API du classificateur n'a pas répondu. Causes possibles :

- Problème réseau entre vous et le point de terminaison du modèle.
- Le modèle rapide configuré n'est plus disponible — vérifiez `/model --fast`.
- Le transcript est trop long et dépasse la fenêtre de contexte du modèle rapide.

Pendant le diagnostic, repassez en mode par défaut : `/approval-mode default`.

**"Repli vers l'approbation manuelle"**

Vous avez atteint soit la protection des 3 blocages consécutifs, soit celle des 2 indisponibilités consécutives. Approuvez ou rejetez l'invite comme d'habitude. Après un repli approuvé, le compteur consécutif se réinitialise.

**"Le classificateur voit des données sensibles dans mes invites"**

Les entrées des outils sont projetées via la méthode `toAutoClassifierInput` de chaque outil avant d'atteindre le classificateur. Les longs contenus d'édition, les invites de récupération web et les invites de sous-agent sont tronqués. Les résultats des outils (contenus de fichiers, pages web) ne sont jamais envoyés au classificateur — seuls le texte de l'utilisateur et les appels d'utilisation d'outils de l'assistant passent.

Si un outil spécifique expose des champs que vous préférez masquer, signalez un problème avec le nom de l'outil ; la projection est par outil et est censée être resserrée au fil du temps.

## Limitations

- **Pas capable hors ligne.** Le classificateur nécessite un appel LLM.
- **Ajoute de la latence sur le chemin lent.** La liste blanche + acceptEdits couvrent la plupart des appels sans latence, mais un `run_shell_command` ajoute généralement ~300ms (chemin rapide du classificateur) ou ~3-5s (chemin lent avec revue de réflexion).
- **Ne remplace pas les règles `deny`.** Le classificateur est au mieux. Pour les commandes qui ne doivent jamais être exécutées, placez-les dans `permissions.deny`.
- **Les outils MCP sont par défaut bloqués de manière conservative.** Les outils MCP tiers (`mcp__*`) adhèrent au transfert d'arguments via la redéfinition de `toAutoClassifierInput`. Les outils qui n'ont pas adhéré n'exposent que leur nom au classificateur — la plupart de ces appels sont bloqués de manière conservative sauf si vous avez écrit une règle `allow` explicite. C'est un échec fermé par conception (les identifiants et le contenu volumineux ne fuient pas dans le LLM du classificateur). Si vous faites confiance à un outil MCP spécifique, ajoutez `permissions.allow: ["mcp__server__tool"]` pour qu'il contourne complètement le classificateur.
## FAQ

**Est-ce que le mode Auto envoie mon code à un tiers ?**

Le mode Auto réutilise votre configuration de modèle existante — le même point de terminaison que l'agent principal. Si vous avez configuré Qwen Code pour utiliser un modèle auto-hébergé, le classificateur s'exécute également sur ce point de terminaison.

**Est-ce que mes secrets / le contenu du `.env` parviennent au classificateur ?**

Le classificateur ne voit que ce que la projection `toAutoClassifierInput` de chaque outil expose :

- `read_file` et autres outils en lecture seule : non invoqués (ils sont dans la liste blanche du chemin rapide).
- `edit` / `write_file` : le chemin du fichier plus les 80 premiers caractères du contenu ancien/nouveau. Le contenu complet n'est pas transmis.
- `run_shell_command` : la commande complète (c'est nécessaire — c'est ce que le classificateur évalue).
- `web_fetch` : l'URL uniquement. Le champ `prompt` n'est pas transmis.
- `agent` : le type de sous-agent plus le prompt complet. Le prompt est l'instruction que le sous-agent va suivre, donc le classificateur en a besoin en entier pour détecter les attaques qui orienteraient le sous-agent vers des actions destructrices — même raison pour laquelle `run_shell_command` transmet la commande complète.

Les résultats des outils (le contenu réel renvoyé par les outils) sont entièrement supprimés du transcript du classificateur.

Les outils MCP (`mcp__*`) suivent une valeur par défaut plus stricte : leurs paramètres ne sont pas transmis, sauf si l'auteur de l'outil MCP a explicitement activé la surcharge `toAutoClassifierInput`. Le classificateur voit le nom de l'outil mais aucun argument, donc la plupart des appels MCP seront bloqués par défaut, sauf si l'utilisateur a écrit une règle d'autorisation explicite. C'est un échec par conception — les outils tiers ne doivent pas fuiter de credentials ou de contenu volumineux de fichiers dans le LLM du classificateur sans intention.

**Puis-je désactiver le message d'information de première utilisation ?**

Il ne s'affiche qu'une fois par fichier de paramètres utilisateur. Après avoir été ignoré, `ui.autoModeAcknowledged: true` est défini dans vos paramètres utilisateur.

**En quoi cela diffère-t-il de Auto-Edit ?**

Auto-Edit approuve automatiquement les modifications de fichiers et rien d'autre — les commandes shell demandent toujours confirmation. Le mode Auto utilise un classificateur pour également approuver automatiquement les commandes shell sûres et autres appels d'outils tout en bloquant les risques.

**En quoi cela diffère-t-il de YOLO ?**

YOLO approuve tout automatiquement sans aucune vérification. Le mode Auto a le classificateur dans la boucle et bloque les actions risquées.
