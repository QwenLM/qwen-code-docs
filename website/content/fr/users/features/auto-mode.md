# Mode Auto

Le Mode Auto utilise un classificateur LLM pour évaluer chaque appel d'outil et décider de l'approuver automatiquement. Il se situe entre Auto-Edit (qui approuve automatiquement uniquement les modifications de fichiers) et YOLO (qui approuve tout automatiquement).

Cette page est la référence pour configurer et dépanner le Mode Auto. Pour une introduction, consultez la
[vue d'ensemble des modes d'approbation](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## Fonctionnement

Lorsque vous êtes en Mode Auto et que l'agent tente d'exécuter un outil, Qwen Code
parcourt trois couches dans l'ordre :

1. **Chemin rapide `acceptEdits`** — Les opérations Edit / Write dont le chemin cible se trouve dans
   l'espace de travail sont approuvées automatiquement sans invoquer le classificateur.
   **Exception :** les écritures sur les surfaces d'auto-modification de Qwen Code
   (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`,
   noms de fichiers de contexte configurés, `.qwen/rules/`, `.qwen/commands/`,
   `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) et
   les surfaces de persistance (`.git/`, `.husky/`, `package.json`, `.npmrc`,
   `Makefile`, `.github/workflows/`, etc.) passent par le classificateur
   même si elles se trouvent dans l'espace de travail. Les liens symboliques ciblant des
   chemins protégés sont également résolus et rejetés. Les commandes shell qui atteignent ces
   chemins via `cd && bash -lc '...'` ou d'autres wrappers passent également par le
   classificateur.
2. **Liste blanche des outils sûrs** — Les outils intégrés en lecture seule et en métadonnées uniquement
   (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion, etc.) sont
   approuvés automatiquement sans invoquer le classificateur.
3. **Classificateur LLM** — Tout le reste (commandes shell, requêtes web,
   création de sous-agents, modifications en dehors de l'espace de travail, outils MCP) est envoyé à
   un classificateur en deux étapes :
   - **Étape 1 (rapide)** — renvoie uniquement `{ shouldBlock }`. Environ ~300 ms.
     Si `shouldBlock` est `false`, l'action est autorisée et l'appel
     se poursuit.
   - **Étape 2 (réflexion)** — s'exécute uniquement si l'Étape 1 a indiqué un blocage. Utilise
     une révision par chaîne de pensée (chain-of-thought) pour réduire les faux positifs de l'Étape 1. Peut
     rétrograder le blocage de l'Étape 1 en autorisation. Renvoie la `reason` (raison) visible par l'utilisateur
     en cas de blocage.

Le classificateur utilise votre modèle rapide configuré
(`/model --fast`). Si aucun modèle rapide n'est configuré, le modèle de la session
principale est utilisé à la place.

> [!tip]
>
> Les commandes shell que le système de permissions détecte comme étant en lecture seule (par ex.
> `ls`, `cat`, `git log`) sont approuvées automatiquement avant d'atteindre le
> classificateur. Définissez `permissions.autoMode.classifyAllShell: true` pour
> outrepasser cela et router toutes les commandes shell via le classificateur —
> voir [Classifier toutes les commandes shell](#classify-all-shell-commands) ci-dessous.

## Les règles strictes restent prioritaires

Le Mode Auto ne remplace **pas** les règles de permissions strictes. Avant que le classificateur
ne s'exécute :

- Les règles `permissions.deny` bloquent l'action avec la raison de la règle. Le
  classificateur ne la voit jamais.
- Les règles `permissions.allow` avec des spécificateurs spécifiques (par ex.
  `Bash(git status)`, `Read(./docs/**)`) autorisent toujours automatiquement sans le
  classificateur — **sauf** lorsque l'appel se résout en une écriture sur un
  chemin protégé d'auto-modification ou de persistance (voir la liste sous
  "Fonctionnement"). Dans ce cas, le Mode Auto revérifie l'appel via
  le classificateur afin qu'une règle d'autorisation sur `Bash(*)` ne se transforme pas silencieusement
  en permission de réécrire les paramètres, commandes, hooks, skills ou serveurs MCP de Qwen Code.
- Les règles `permissions.ask` forcent une confirmation manuelle même en Mode Auto.

## Les règles d'autorisation trop larges sont retirées en Mode Auto

Des règles comme les suivantes permettraient à l'agent d'exécuter du code arbitraire
sans examen par le classificateur :

- `Bash` / `Bash(*)` / `Bash()` — autorise automatiquement toutes les commandes shell
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — wildcards d'interpréteur
- `Agent` / `Agent(coder)` — toute autorisation sur l'outil Agent
- `Skill` / `Skill(pdf)` — toute autorisation sur l'outil Skill

Lorsque vous passez en Mode Auto, Qwen Code retire temporairement ces règles de
l'ensemble des permissions actives et affiche un avis les listant. Les règles
reviennent dès que vous quittez le Mode Auto. `settings.json` n'est jamais
modifié.

Si vous avez vraiment besoin de ces règles larges, utilisez plutôt le mode YOLO.

## Configuration des hints

Le Mode Auto lit `permissions.autoMode` depuis votre `settings.json`. Les
entrées sont des descriptions en langage naturel, pas des modèles de règles — elles sont
injectées de manière additive dans le prompt système du classificateur à côté des
valeurs par défaut intégrées.

Il y a trois catégories de hints plus une liste d'environnement :

- **`allow`** — actions que le classificateur doit approuver automatiquement.
- **`softDeny`** — actions destructrices ou irréversibles que le classificateur
  doit bloquer **sauf si la demande explicite la plus récente de l'utilisateur a demandé
  cette action et cette portée exactes**. Les soft denies peuvent être levés par
  l'intention de l'utilisateur ; un "oui fais ce que tu veux" générique ne compte pas.
- **`hardDeny`** — actions au niveau de la limite de sécurité que le classificateur doit bloquer
  en Mode Auto indépendamment de `autoMode.hints.allow` ou de l'intention récente de l'utilisateur.
  Il s'agit d'une politique du classificateur, pas d'une règle de permission
  déterministe : cela n'écrase pas `permissions.allow`. Utilisez `permissions.deny`
  pour les actions qui ne doivent jamais être autorisées par le gestionnaire de permissions.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Running poetry install and poetry update in this Python project",
          "Cleaning build artifacts under ./dist or ./build",
          "Reading any file under /Users/me/code/"
        ],
        "softDeny": [
          "Editing Qwen Code settings unless I explicitly ask for the exact change",
          "Running migration scripts that touch the production DB"
        ],
        "hardDeny": [
          "Sending secrets or .env contents to any network endpoint",
          "Modifying anything under ~/.ssh or ~/.aws"
        ]
      },
      "environment": [
        "This is a private monorepo with strict commit signing",
        "Production credentials live in 1Password, never in plain files"
      ]
    }
  }
}
```

`hints.deny` est toujours accepté pour la rétrocompatibilité et est traité
comme `softDeny`. Mélanger les deux est possible — les entrées sont concaténées, `softDeny`
en premier.

### Limites de longueur et de nombre

Pour garder le prompt système du classificateur petit :

- Chaque entrée est limitée à 200 caractères (les entrées plus longues sont tronquées
  avec un avertissement).
- `hints.allow`, `hints.softDeny` et `hints.hardDeny` acceptent jusqu'à 50
  entrées chacun.
- `environment` accepte jusqu'à 20 entrées.

### Fusion dans les fichiers de configuration

`autoMode` est fusionné à travers les paramètres système / utilisateur / espace de travail de la même
manière que les autres paramètres de permissions : les tableaux sont concaténés et
dédupliqués.

### Classifier toutes les commandes shell

Par défaut, les commandes shell en lecture seule (`ls`, `cat`, `git status`, …) sont
approuvées automatiquement sans invoquer le classificateur — le système de permissions
les détecte comme sûres au niveau 3 et ignore entièrement le classificateur. Définissez
`classifyAllShell` sur `true` pour forcer **toutes** les commandes shell à passer par
le classificateur, y compris celles en lecture seule :

```json
{
  "permissions": {
    "autoMode": {
      "classifyAllShell": true
    }
  }
}
```

C'est utile pour les environnements de production ou à haute sécurité où vous
voulez une défense en profondeur : même les commandes apparemment inoffensives sont examinées par
le classificateur avant exécution. Le compromis est une latence ajoutée (~300 ms
par appel shell en lecture seule) et une dépendance à la disponibilité du classificateur — si
l'API du classificateur est inaccessible, les commandes shell en lecture seule nécessiteront également
une approbation manuelle.

> [!note]
>
> `classifyAllShell` affecte uniquement les commandes shell (`run_shell_command` et
> `monitor`). Les outils intégrés en lecture seule (`read_file`, `grep_search`,
> `glob`, `list_directory`, etc.) ne sont pas affectés et utilisent toujours la
> liste blanche du chemin rapide.

## Lecture de la décision

Lorsque le classificateur bloque une action, l'appel d'outil échoue avec :

- **`Blocked by auto mode policy: <reason>`** —
  le classificateur a jugé l'action non sûre. La raison provient de l'Étape
  2 du classificateur.

Ce message est suivi d'une ligne d'indication finale indiquant à l'agent
que **l'action refusée spécifiquement** ne doit pas être complétée via
un autre outil, une indirection shell, un script généré, un alias, un lien symbolique,
un changement de configuration, un hook, un fichier de commande, une configuration MCP, une charge utile encodée
ou un chemin équivalent. **Le travail sûr non lié et les alternatives
véritablement plus sûres sont toujours autorisés** — seules les tentatives d'accomplir la même
intention refusée via une surface différente sont bloquées.

Si l'action refusée est vraiment nécessaire, l'agent doit s'arrêter et
vous demander une approbation explicite plutôt que de contourner le refus.

### Langue des raisons du classificateur

Les raisons du classificateur sont produites par le LLM et ne sont pas traduites. Si vous
souhaitez des raisons dans une autre langue, ajoutez un hint comme
`Respond reasons in Chinese` à `permissions.autoMode.environment`.

## Repli vers l'approbation manuelle

Le Mode Auto vous protège contre les blocages :

- Si l'API du classificateur est inaccessible, expire (timeout), dépasse sa fenêtre de contexte
  ou renvoie une réponse invalide, l'action en cours bascule immédiatement vers
  l'approbation manuelle. La confirmation recommande le mode par défaut (Default Mode) et propose
  **Passer en mode par défaut et autoriser une fois** à côté de Autoriser une fois et Rejeter.
  Le changement affecte uniquement la session d'exécution en cours ; il ne modifie pas
  vos paramètres sauvegardés.

- Après **3 blocages consécutifs par la politique**, le prochain appel d'outil bascule vers
  l'invite d'approbation manuelle standard. Cela couvre le cas où l'agent
  continue d'essayer des variantes mineures d'une commande interdite.
- Après **2 résultats consécutifs indisponibles** (échecs de l'API du classificateur),
  les appels suivants ignorent le classificateur connu comme défaillant et passent directement
  à l'approbation manuelle. Le premier résultat indisponible demande déjà une approbation ;
  ce seuil évite d'attendre répétitivement les retries du classificateur.

La session reste en Mode Auto sauf si vous sélectionnez explicitement l'option de changement.
Seul l'appel de repli passe par l'approbation manuelle. Les compteurs se réinitialisent lorsque
vous approuvez l'appel de repli ou changez de mode.

Si vous vous retrouvez constamment à atteindre le repli, les causes les plus probables
sont une panne de l'API du classificateur ou des hints qui nécessitent un ajustement. Passez en
mode par défaut (Default Mode) pendant que vous investigatez.

## Dépannage

**"Le Mode Auto bloque constamment mes commandes"**

Regardez la raison dans le message d'erreur. Si le classificateur est trop
conservateur pour votre contexte, ajoutez une entrée à
`permissions.autoMode.hints.allow` décrivant le modèle en
langage naturel. Exemples :

- `"Construction des images Docker pour ce projet (docker build ...)"`
- `"Exécution des migrations de base de données sur la base de données de test locale"`

**"Repli vers l'approbation manuelle"**

Vous avez atteint la garde de 3 blocages consécutifs ou 2 indisponibilités consécutives.
Approuvez ou rejetez l'invite comme vous le feriez normalement. Après un
repli approuvé, le compteur consécutif se réinitialise.

**Le classificateur voit des données sensibles dans mes prompts**

Les entrées des outils sont projetées via la méthode `toAutoClassifierInput`
de chaque outil avant d'atteindre le classificateur. Le contenu long des modifications, les prompts
de récupération web et les prompts de sous-agents sont tronqués. Les résultats des outils
ne sont jamais envoyés au classificateur — seul le texte de l'utilisateur
et les appels d'outils de l'assistant passent.

Si un outil spécifique expose des champs que vous préféreriez expurger, ouvrez une issue
avec le nom de l'outil ; la projection est par outil et est destinée à être
renforcée au fil du temps.

## Limites

- **Non capable de fonctionner hors ligne.** Le classificateur nécessite un appel LLM.
- **Ajoute de la latence sur le chemin lent.** La liste blanche + acceptEdits couvrent la plupart
  des appels sans latence, mais un `run_shell_command` ajoute généralement
  ~300 ms (chemin rapide du classificateur) ou ~3-5 s (chemin lent avec examen
  par réflexion).
- **Pas un substitut aux règles `deny`.** Le classificateur fait au mieux.
  Pour les commandes dont vous êtes sûr qu'elles ne doivent jamais s'exécuter, mettez-les dans
  `permissions.deny`.
- **Les outils MCP sont jugés sur leurs arguments, pas sur le comportement vérifié.**
  Les outils MCP tiers (`mcp__*`) ne sont jamais dans la liste blanche du chemin rapide ;
  chaque appel provenant d'un serveur non marqué `trust: true` est envoyé au
  classificateur avec le nom du serveur, le nom de l'outil, les
  annotations auto-déclarées du serveur (`readOnlyHint` / `destructiveHint` /
  `idempotentHint` / `openWorldHint`) et une copie bornée des
  arguments. Le classificateur est informé que les annotations ne sont pas vérifiées. Il
  ne peut pas voir ce que le serveur fait réellement de l'appel, donc un
  nom d'outil trompeur associé à des arguments bénins peut quand même passer. Si vous
  faites confiance à un outil MCP spécifique, ajoutez
  `permissions.allow: ["mcp__server__tool"]` pour qu'il contourne entièrement le
  classificateur ; si vous voulez que le classificateur ne voie que le nom de l'outil
  (par exemple lorsqu'il s'exécute contre un fournisseur différent de celui du
  modèle principal), définissez `permissions.autoMode.mcp.forwardArguments: false`
  — la plupart des appels MCP seront alors bloqués de manière conservatrice.

## FAQ

**Le Mode Auto envoie-t-il mon code à un tiers ?**

Le Mode Auto réutilise votre configuration de modèle existante — le même point de terminaison que
l'agent principal. Si vous avez configuré Qwen Code pour utiliser un modèle auto-hébergé,
le classificateur s'exécute également sur ce point de terminaison.

**Mes secrets / contenus `.env` atteindront-ils le classificateur ?**

Le classificateur ne voit que ce que la projection `toAutoClassifierInput` de chaque outil
expose :

- `read_file` et autres outils en lecture seule : non invoqués (ils sont sur la
  liste blanche du chemin rapide).
- `edit` / `write_file` : file_path plus un aperçu de 300 caractères du
  contenu ancien/nouveau. Le contenu complet n'est pas transféré.
- `run_shell_command` : la commande complète (c'est nécessaire — c'est ce que le
  classificateur juge).
- `web_fetch` : l'URL uniquement. Le champ prompt n'est pas transféré.
- `agent` : type de sous-agent plus le prompt complet. Le prompt est
  l'instruction que le sous-agent suivra, donc le classificateur en a besoin
  en entier pour détecter les attaques qui orienteraient le sous-agent vers
  des actions destructrices — même raison que pour `run_shell_command` qui transfère la
  commande complète.

Les résultats des outils (le contenu réel renvoyé par les outils) sont retirés de
la transcription du classificateur entièrement.

Les outils MCP (`mcp__*`) : le nom du serveur, le nom de l'outil, les
annotations du serveur et les arguments de l'appel sont transférés. Chaque chaîne (valeur
ou clé) est coupée à 2 000 caractères, les noms à 200, l'ensemble du payload
partage un budget de 16 000 caractères mesuré sur la forme formatée
reçue par le classificateur, et les imbrications / nombres d'entrées sont plafonnés ; chaque
coupure est marquée sur place (`…[truncated N chars]` ou `[omitted: …]`) et
signalée par `arguments_truncated: true` / `name_truncated: true` afin que
le classificateur ne confonde jamais une omission avec une absence. Les actions
historiques dans la transcription sont limitées à 4 000 caractères chacune et
40 000 au total (les plus récentes conservées en premier ; les plus anciennes ne gardent que leur nom
d'outil). Les arguments sont ce que l'agent est sur le point
d'envoyer à ce serveur — les règles d'exfiltration de données et
d'écriture externe du classificateur ne peuvent leur être appliquées, et ils ont
déjà été produits par le modèle principal, donc les transférer à un classificateur
sur la même configuration de modèle ne divulgue rien de nouveau. Si votre
classificateur s'exécute contre un fournisseur différent, définissez
`permissions.autoMode.mcp.forwardArguments: false` pour restaurer la
projection par nom uniquement (attendez-vous à ce que la plupart des appels MCP soient bloqués).

**Puis-je désactiver le message d'information de la première fois ?**

Il ne s'affiche qu'une seule fois par fichier de paramètres utilisateur. Après avoir été fermé,
`ui.autoModeAcknowledged: true` est défini dans vos paramètres utilisateur.

**En quoi est-ce différent d'Auto-Edit ?**

Auto-Edit approuve automatiquement les modifications de fichiers et rien d'autre — les commandes shell
demandent toujours une approbation. Le Mode Auto utilise un classificateur pour approuver automatiquement les commandes shell
sûres et d'autres appels d'outils tout en bloquant ceux risqués.

**En quoi est-ce différent de YOLO ?**

YOLO approuve tout automatiquement sans aucun examen. Le Mode Auto a le
classificateur dans la boucle et bloque les actions risquées.