# Auto Mode

Auto Mode utilise un classifieur LLM pour évaluer chaque appel d'outil et décider
s'il doit être auto-approuvé. Il se situe entre Auto-Edit (qui n'auto-approuve
que les modifications de fichiers) et YOLO (qui auto-approuve tout).

Cette page est la référence pour configurer et dépanner Auto Mode.
Pour une introduction, voir la
[Présentation des modes d'approbation](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## Comment ça fonctionne

Lorsque vous êtes en Auto Mode et que l'agent tente d'exécuter un outil, Qwen Code
parcourt trois couches dans l'ordre :

1. **Chemin rapide acceptEdits** — Les opérations Édition / Écriture dont le chemin cible est
   dans l'espace de travail sont auto-approuvées sans invoquer le classifieur.
   **Exception :** les écritures sur les surfaces d'auto-modification de Qwen Code
   (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`,
   noms de fichiers de contexte configurés, `.qwen/rules/`, `.qwen/commands/`,
   `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) et
   les surfaces de persistance (`.git/`, `.husky/`, `package.json`, `.npmrc`,
   `Makefile`, `.github/workflows/`, etc.) passent par le classifieur
   même lorsqu'elles sont dans l'espace de travail. Les liens symboliques pointant vers des chemins protégés
   sont également résolus et rejetés. Les commandes shell qui atteignent ces
   chemins via `cd && bash -lc '...'` ou d'autres wrappers passent aussi par le
   classifieur.
2. **Liste blanche d'outils sûrs** — Les outils intégrés en lecture seule et ne manipulant que des métadonnées
   (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion, etc.) sont
   auto-approuvés sans invoquer le classifieur.
3. **Classifieur LLM** — Tout le reste (commandes shell, requêtes web,
   lancements de sous-agents, modifications hors de l'espace de travail, outils MCP) est envoyé à
   un classifieur en deux étapes :
   - **Étape 1 (rapide)** — produit uniquement `{ shouldBlock }`. Environ ~300 ms.
     Si `shouldBlock` est `false`, l'action est autorisée et l'appel
     continue.
   - **Étape 2 (réflexion)** — ne s'exécute que si l'étape 1 a dit de bloquer. Utilise
     une réflexion par chaîne de pensée pour réduire les faux positifs de l'étape 1.
     Peut rétrograder le blocage de l'étape 1 en autorisation. Produit la
     `reason` visible par l'utilisateur en cas de blocage.

Le classifieur utilise votre modèle rapide configuré
(`/model --fast`). Si aucun modèle rapide n'est configuré, le modèle de session
principal est utilisé à la place.

## Les règles strictes l'emportent toujours

Auto Mode ne remplace **pas** les règles de permission strictes. Avant que le classifieur
ne s'exécute :

- Les règles `permissions.deny` bloquent l'action avec la raison de la règle. Le
  classifieur ne la voit jamais.
- Les règles `permissions.allow` avec des spécificateurs spécifiques (par ex.
  `Bash(git status)`, `Read(./docs/**)`) auto-autorisent sans le
  classifieur — **sauf** lorsque l'appel correspond à une écriture sur un chemin
  protégé d'auto-modification ou de persistance (voir la liste sous
  "Comment ça fonctionne"). Dans ce cas, Auto Mode revérifie l'appel via
  le classifieur afin qu'une règle allow sur `Bash(*)` ne puisse pas silencieusement se
  transformer en autorisation de réécrire les paramètres, commandes, hooks,
  compétences ou serveurs MCP de Qwen Code.
- Les règles `permissions.ask` forcent une confirmation manuelle même en Auto Mode.

## Les règles allow trop larges sont supprimées en Auto Mode

Des règles comme les suivantes laisseraient l'agent exécuter du code arbitraire
sans révision du classifieur :

- `Bash` / `Bash(*)` / `Bash()` — auto-autorise toute commande shell
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — wildcards d'interpréteur
- `Agent` / `Agent(coder)` — toute autorisation sur l'outil Agent
- `Skill` / `Skill(pdf)` — toute autorisation sur l'outil Skill

Lorsque vous entrez en Auto Mode, Qwen Code supprime temporairement ces règles de
l'ensemble de permissions actif et affiche un avis les listant. Les règles
reviennent dès que vous quittez Auto Mode. `settings.json` n'est jamais
modifié.

Si vous avez vraiment besoin de ces règles larges, utilisez plutôt le mode YOLO.

## Configuration des indices

Auto Mode lit `permissions.autoMode` dans votre `settings.json`. Les
entrées sont des descriptions en langage naturel, pas des motifs de règles — elles sont
injectées de manière additive dans le prompt système du classifieur, en complément des
valeurs par défaut intégrées.

Il existe trois catégories d'indices ainsi qu'une liste d'environnement :

- **`allow`** — actions que le classifieur doit auto-approuver.
- **`softDeny`** — actions destructrices ou irréversibles que le classifieur
  doit bloquer **sauf si la demande explicite la plus récente de l'utilisateur
  demandait exactement cette action et cette portée**. Les softDeny peuvent être
  annulées par l'intention de l'utilisateur ; un "oui, fais tout ça" générique
  ne compte pas.
- **`hardDeny`** — actions aux limites de sécurité que le classifieur doit bloquer
  en Auto Mode, indépendamment de `autoMode.hints.allow` ou de l'intention
  récente de l'utilisateur. Il s'agit d'une politique du classifieur, pas d'une règle de permission
  déterministe : elle ne remplace pas `permissions.allow`. Utilisez `permissions.deny`
  pour les actions qui ne doivent jamais être autorisées par le gestionnaire de permissions.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Exécuter poetry install et poetry update dans ce projet Python",
          "Nettoyer les artefacts de build sous ./dist ou ./build",
          "Lire tout fichier sous /Users/me/code/"
        ],
        "softDeny": [
          "Modifier les paramètres de Qwen Code sauf si je demande explicitement le changement exact",
          "Exécuter des scripts de migration qui touchent la DB de production"
        ],
        "hardDeny": [
          "Envoyer des secrets ou le contenu de .env vers un point d'accès réseau",
          "Modifier quoi que ce soit sous ~/.ssh ou ~/.aws"
        ]
      },
      "environment": [
        "Ceci est un monorepo privé avec une signature de commit stricte",
        "Les identifiants de production sont dans 1Password, jamais dans des fichiers en clair"
      ]
    }
  }
}
```

`hints.deny` est toujours accepté pour la rétrocompatibilité et est traité
comme `softDeny`. Mélanger les deux est possible — les entrées sont concaténées, d'abord
`softDeny`.

### Limites de longueur et de nombre

Pour garder le prompt système du classifieur petit :

- Chaque entrée est limitée à 200 caractères (les entrées plus longues sont tronquées
  avec un avertissement).
- `hints.allow`, `hints.softDeny` et `hints.hardDeny` acceptent jusqu'à 50
  entrées chacune.
- `environment` accepte jusqu'à 20 entrées.

### Cumul entre fichiers de paramètres

`autoMode` est fusionné entre les paramètres système / utilisateur / espace de travail
de la même manière que les autres paramètres de permission : les tableaux sont concaténés et
dédupliqués.

## Lecture de la décision

Lorsque le classifieur bloque une action, l'appel d'outil échoue avec l'un
des textes d'erreur suivants :

- **`Bloqué par la politique du mode auto : <raison>`** —
  le classifieur a jugé l'action dangereuse. La raison provient de l'étape
  2 du classifieur.
- **`Classifieur du mode auto indisponible ; action bloquée par sécurité`** —
  l'API du classifieur était injoignable, a expiré ou a renvoyé une
  réponse non analysable. Il s'agit d'un comportement de fermeture en cas d'échec : en cas de doute,
  bloquer.

Les deux messages sont suivis d'une ligne d'orientation indiquant à l'agent
que l'**action refusée spécifiquement** ne doit pas être effectuée via un autre
outil, une indirection shell, un script généré, un alias, un lien symbolique, un changement de
configuration, un hook, un fichier de commande, une configuration MCP, un payload encodé
ou une voie équivalente. **Les tâches sûres sans rapport et les alternatives réellement plus
sûres sont toujours autorisées** — seules les tentatives d'accomplir la même intention refusée
via une surface différente sont bloquées.

Si l'action refusée est réellement nécessaire, l'agent doit s'arrêter et
vous demander une approbation explicite plutôt que de contourner le refus.

### Langue des raisons du classifieur

Les raisons du classifieur sont produites par le LLM et ne sont pas traduites. Si vous
souhaitez des raisons non anglaises, ajoutez un indice comme
`Répondre les raisons en chinois` à `permissions.autoMode.environment`.

## Repli vers l'approbation manuelle

Auto Mode vous protège contre les blocages :

- Après **3 blocages consécutifs par la politique**, l'appel d'outil suivant revient à
  l'invite d'approbation manuelle standard. Cela couvre le cas où l'agent
  essaie sans cesse de petites variantes d'une commande interdite.
- Après **2 résultats consécutifs d'indisponibilité** (échecs de l'API du classifieur),
  l'appel d'outil suivant revient également en arrière. Cela évite d'attendre un
  classifieur défaillant.

La session elle-même reste en Auto Mode — seul l'appel de repli unique
passe par une approbation manuelle. Les compteurs se réinitialisent lorsque vous approuvez l'appel de
repli ou changez de mode.

Si vous rencontrez constamment des replis, les causes les plus probables
sont une panne de l'API du classifieur ou des indices nécessitant un réglage. Passez en
mode par défaut pendant que vous examinez le problème.

## Dépannage

**"Le mode auto bloque constamment mes commandes"**

Regardez la raison dans le message d'erreur. Si le classifieur est trop
conservateur pour votre contexte, ajoutez une entrée dans
`permissions.autoMode.hints.allow` décrivant le motif en langage
naturel. Exemples :

- `"Construction d'images Docker pour ce projet (docker build ...)"`
- `"Exécution de migrations de base de données sur la base de test locale"`

**"Classifieur du mode auto indisponible"**

L'API du classifieur n'a pas répondu. Causes possibles :

- Problème réseau entre vous et le point d'accès du modèle.
- Le modèle rapide configuré n'est plus disponible — vérifiez `/model --fast`.
- Le transcript est trop long et dépasse la fenêtre de contexte du modèle rapide.

Pendant le diagnostic, repassez en mode par défaut : `/approval-mode default`.

**"Repli vers l'approbation manuelle"**

Vous avez atteint le garde-fou de 3 blocages consécutifs ou de 2 indisponibilités consécutives.
Approuvez ou rejetez l'invite comme d'habitude. Après un repli approuvé,
le compteur de consécutifs se réinitialise.

**Le classifieur voit des données sensibles dans mes invites**

Les entrées des outils sont projetées via la méthode `toAutoClassifierInput` de chaque outil
avant d'atteindre le classifieur. Les longs contenus d'édition, les invites de requête web
et les invites de sous-agent sont tronqués. Les résultats des outils (contenus des fichiers,
pages web) ne sont jamais envoyés au classifieur — seuls le texte de l'utilisateur
et les appels d'outils de l'assistant passent par lui.

Si un outil expose des champs que vous préférez masquer, signalez un problème
avec le nom de l'outil ; la projection est spécifique à chaque outil et est destinée à être
renforcée au fil du temps.

## Limitations

- **Pas utilisable hors ligne.** Le classifieur nécessite un appel LLM.
- **Ajoute de la latence sur le chemin lent.** La liste blanche + acceptEdits couvrent la plupart
  des appels sans latence, mais un `run_shell_command` ajoute généralement
  ~300 ms (chemin rapide du classifieur) ou ~3-5 s (chemin lent avec réflexion).
- **Ne remplace pas les règles `deny`.** Le classifieur fait de son mieux.
  Pour les commandes dont vous êtes sûr qu'elles ne doivent jamais être exécutées, mettez-les dans
  `permissions.deny`.
- **Les outils MCP sont bloqués de manière conservatrice par défaut.** Les outils MCP tiers
  (`mcp__*`) optent pour le transfert d'arguments via la
  redéfinition `toAutoClassifierInput`. Les outils qui n'ont pas opté exposent
  uniquement leur nom au classifieur — la plupart de ces appels sont
  bloqués de manière conservatrice, sauf si vous avez écrit une règle `allow`
  explicite. C'est une fermeture par conception (les identifiants et le contenu
  volumineux ne fuient pas vers le LLM du classifieur). Si vous faites confiance à un
  outil MCP spécifique, ajoutez `permissions.allow: ["mcp__serveur__outil"]` pour
  qu'il contourne complètement le classifieur.

## FAQ

**Auto Mode envoie-t-il mon code à un tiers ?**

Auto Mode réutilise votre configuration de modèle existante — même point d'accès que
l'agent principal. Si vous avez configuré Qwen Code pour utiliser un modèle
auto-hébergé, le classifieur utilise également ce point d'accès.

**Mes secrets / le contenu de `.env` atteignent-ils le classifieur ?**

Le classifieur ne voit que ce que la projection `toAutoClassifierInput`
de chaque outil expose :

- `read_file` et autres outils en lecture seule : non invoqués (ils sont sur la
  liste blanche du chemin rapide).
- `edit` / `write_file` : chemin du fichier plus les 80 premiers caractères du
  contenu ancien/nouveau. Le contenu complet n'est pas transmis.
- `run_shell_command` : la commande complète (elle doit l'être — c'est ce que le
  classifieur juge).
- `web_fetch` : l'URL uniquement. Le champ prompt n'est pas transmis.
- `agent` : type du sous-agent plus le prompt complet. Le prompt est l'instruction
  que le sous-agent suivra, donc le classifieur en a besoin
  en entier pour détecter les attaques qui orienteraient le sous-agent vers des
  actions destructrices — même raison pour laquelle `run_shell_command` transmet la
  commande complète.

Les résultats des outils (le contenu réel renvoyé par les outils) sont supprimés
du transcript du classifieur entièrement.

Les outils MCP (`mcp__*`) suivent une valeur par défaut plus stricte : leurs paramètres ne
sont pas transmis, sauf si l'auteur de l'outil MCP a explicitement opté via la
redéfinition `toAutoClassifierInput`. Le classifieur voit le nom de l'outil
mais aucun argument, donc la plupart des appels MCP seront bloqués de manière conservatrice,
sauf si l'utilisateur a écrit une règle allow explicite. Il s'agit d'une
fermeture par conception — les outils tiers ne doivent pas fuir d'identifiants ou
de contenu de fichier volumineux vers le LLM du classifieur sans intention.

**Puis-je désactiver le message d'information de la première fois ?**

Il ne s'affiche qu'une fois par fichier de paramètres utilisateur. Après
l'avoir rejeté, `ui.autoModeAcknowledged: true` est défini dans vos paramètres
utilisateur.

**En quoi est-ce différent d'Auto-Edit ?**

Auto-Edit auto-approuve les modifications de fichiers et rien d'autre — les commandes
shell demandent toujours. Auto Mode utilise un classifieur pour aussi auto-approuver les commandes shell
sûres et autres appels d'outils tout en bloquant les risques.

**En quoi est-ce différent de YOLO ?**

YOLO auto-approuve tout sans aucune révision. Auto Mode a le
classifieur dans la boucle et bloque les actions risquées.