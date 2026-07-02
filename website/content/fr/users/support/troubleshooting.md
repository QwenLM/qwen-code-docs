# Dépannage

Ce guide fournit des solutions aux problèmes courants et des conseils de débogage, couvrant les sujets suivants :

- Erreurs d'authentification ou de connexion
- Foire aux questions (FAQ)
- Conseils de débogage
- Issues GitHub existantes similaires à la vôtre ou création de nouvelles Issues

## Erreurs d'authentification ou de connexion

- **Erreur : `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Cause :** Qwen OAuth n'est plus disponible depuis le 15 avril 2026.
  - **Solution :** Passez à une autre méthode d'authentification. Exécutez `qwen` → `/auth` et choisissez l'une des options suivantes :
    - **API Key** : Utilisez une API key d'Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Consultez le guide de configuration de l'API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan** : Abonnez-vous pour un tarif mensuel fixe avec des quotas plus élevés. Consultez le guide du Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Erreur : `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Cause :** Vous êtes peut-être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat CA racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` avec le chemin absolu de votre fichier de certificat CA racine d'entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Erreur : `Connection error. (cause: fetch failed)` sur un point de terminaison auto-signé**
  - **Cause :** Vous pointez Qwen Code vers un serveur auto-hébergé (par exemple un modèle local derrière `https://`) dont le certificat TLS est auto-signé, ce qui fait que Node.js le rejette.
  - **Solution :** Privilégiez l'approbation du certificat via `NODE_EXTRA_CA_CERTS` (ci-dessus). Si ce n'est pas pratique dans un laboratoire/réseau privé de confiance, ignorez la vérification avec le flag `--insecure` (ou `QWEN_TLS_INSECURE=1`) :
    - Exemple : `qwen --insecure --openaiBaseUrl https://192.168.1.10:8080 ...`
    - **Avertissement :** La désactivation de la vérification supprime la protection contre les attaques de type man-in-the-middle. Utilisez-la uniquement pour les points de terminaison auxquels vous faites entièrement confiance.

- **Erreur : `Device authorization flow failed: fetch failed`**
  - **Cause :** Node.js n'a pas pu atteindre les points de terminaison de Qwen OAuth (souvent un problème de proxy ou de confiance SSL/TLS). Lorsqu'elle est disponible, Qwen Code affichera également la cause sous-jacente de l'erreur (par exemple : `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Remarque : cette erreur est spécifique au flux legacy de Qwen OAuth.
  - **Solution :**
    - Si vous utilisez encore Qwen OAuth, passez à l'API Key ou au Coding Plan via `/auth`.
    - Si vous êtes derrière un proxy, configurez-le via `qwen --proxy <url>` (ou le paramètre `proxy` dans `settings.json`).
    - Si votre réseau utilise un CA d'inspection TLS d'entreprise, définissez `NODE_EXTRA_CA_CERTS` comme décrit ci-dessus.

- **Problème : Impossible d'afficher l'interface utilisateur après un échec d'authentification**
  - **Cause :** Si l'authentification échoue après avoir sélectionné un type d'authentification, le paramètre `security.auth.selectedType` peut être persisté dans `settings.json`. Au redémarrage, la CLI peut rester bloquée en essayant de s'authentifier avec le type d'authentification ayant échoué et ne pas réussir à afficher l'interface utilisateur.
  - **Solution :** Effacez l'élément de configuration `security.auth.selectedType` dans votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez la CLI pour qu'elle puisse vous demander de vous authentifier à nouveau

## Foire aux questions (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**
  - R : Si vous avez installé Qwen Code avec l'installateur autonome, réexécutez la commande d'installation autonome. Si vous l'avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé à partir des sources, récupérez les dernières modifications du dépôt, puis reconstruisez-le avec la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.

    Reportez-vous à [Qwen Code Configuration](../configuration/settings) pour plus de détails.

- **Q : Pourquoi ne vois-je pas les compteurs de tokens mis en cache dans ma sortie de statistiques ?**
  - R : Les informations sur les tokens mis en cache ne sont affichées que lorsque des tokens en cache sont utilisés. Cette fonctionnalité est disponible pour les utilisateurs d'API key (par exemple, l'API key d'Alibaba Cloud Model Studio ou Google Cloud Vertex AI). Vous pouvez toujours consulter votre utilisation totale de tokens avec la commande `/stats`.

- **Q : Une personnalisation (extension, hook, skill, serveur MCP ou subagent) semble casser Qwen Code. Comment l'isoler ?**
  - R : Démarrez Qwen Code avec le flag `--safe-mode` pour désactiver toutes les personnalisations — fichiers de contexte, hooks, extensions, skills, serveurs MCP, subagents personnalisés (seuls les subagents intégrés se chargent), règles de permission, remplacements du mode d'approbation provenant des paramètres, fonctionnalités de mémoire et paramètres de sandbox — pour la session. Remarque : les flags CLI `--yolo` et `--approval-mode` prennent toujours effet en mode sans échec. Si le problème disparaît en mode sans échec, réactivez vos personnalisations une par une pour trouver le coupable.
    - Exemple : `qwen --safe-mode`
    - Alternative : définissez la variable d'environnement `QWEN_CODE_SAFE_MODE=true` si la CLI ne peut pas accepter de flags.

## Messages d'erreur courants et solutions

- **Erreur : `EADDRINUSE` (Address already in use) lors du démarrage d'un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port auquel le serveur MCP essaie de se lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un port différent.

- **Erreur : Command not found (lors de la tentative d'exécution de Qwen Code avec `qwen`).**
  - **Cause :** La CLI n'est pas correctement installée ou elle ne se trouve pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la façon dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` avec l'installateur autonome, réexécutez la commande d'installation autonome, puis ouvrez un nouveau terminal.
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire binaire global de `npm` se trouve dans votre `PATH`. Vous pouvez effectuer la mise à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` à partir des sources, assurez-vous d'utiliser la bonne commande pour l'invoquer (par ex. `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications du dépôt, puis reconstruisez avec la commande `npm run build`.

- **Erreur : `MODULE_NOT_FOUND` ou erreurs d'importation.**
  - **Cause :** Les dépendances ne sont pas installées correctement, ou le projet n'a pas été construit.
  - **Solution :**
    1.  Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2.  Exécutez `npm run build` pour compiler le projet.
    3.  Vérifiez que la compilation s'est terminée avec succès avec `npm run start`.

- **Erreur : "Operation not permitted", "Permission denied" ou similaire.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de sandbox, comme l'écriture en dehors du répertoire du projet ou du répertoire temporaire du système.
  - **Solution :** Reportez-vous à la documentation [Configuration: Sandboxing](../features/sandbox) pour plus d'informations, y compris comment personnaliser votre configuration de sandbox.

- **Qwen Code ne s'exécute pas en mode interactif dans les environnements "CI"**
  - **Problème :** Qwen Code n'entre pas en mode interactif (aucune invite n'apparaît) si une variable d'environnement commençant par `CI_` (par ex. `CI_TOKEN`) est définie. Cela s'explique par le fait que le package `is-in-ci`, utilisé par le framework UI sous-jacent, détecte ces variables et suppose un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION` ou de toute variable d'environnement avec le préfixe `CI_`. Lorsque l'une d'elles est trouvée, cela signale que l'environnement est non interactif, ce qui empêche la CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée par `CI_` n'est pas nécessaire au fonctionnement de la CLI, vous pouvez la désactiver temporairement pour la commande. Par ex. `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas depuis le fichier .env du projet**
  - **Problème :** Définir `DEBUG=true` dans le fichier `.env` d'un projet n'active pas le mode debug pour la CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` du projet pour éviter les interférences avec le comportement de la CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

- **Le défilement du trackpad dans tmux modifie l'historique des invites au lieu de faire défiler la conversation**
  - **Problème :** Dans une session tmux, le défilement avec le trackpad ou la molette peut faire défiler les invites précédentes, de la même manière que d'appuyer sur `Up Arrow` ou `Down Arrow`.
  - **Cause :** tmux peut traduire les gestes de la molette en simples séquences de touches fléchées. Ces séquences sont indiscernables des véritables pressions sur les touches fléchées au moment où qwen-code les reçoit.
  - **Solution :** Activez `ui.useTerminalBuffer` ; utilisez ensuite `Shift+Up` / `Shift+Down`, ou la molette de la souris lorsque tmux transmet les événements de la molette à l'application. Si vous préférez le scrollback de l'hôte, ajustez vos bindings de souris tmux pour les événements de la molette.

## IDE Companion ne se connecte pas

- Assurez-vous que VS Code a un seul dossier d'espace de travail ouvert.
- Redémarrez le terminal intégré après avoir installé l'extension afin qu'il hérite :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` se résout. Sinon, mappez l'hôte de manière appropriée.
- Réinstallez le companion avec `/ide install` et utilisez "Qwen Code: Run" dans la palette de commandes pour vérifier qu'il se lance.

## Codes de sortie

Qwen Code utilise des codes de sortie spécifiques pour indiquer la raison de l'arrêt. Cela est particulièrement utile pour les scripts et l'automatisation.

| Code de sortie | Type d'erreur                 | Description                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Une erreur s'est produite lors du processus d'authentification.                                                |
| 42        | `FatalInputError`          | Une entrée invalide ou manquante a été fournie à la CLI. (mode non interactif uniquement)                       |
| 44        | `FatalSandboxError`        | Une erreur s'est produite avec l'environnement de sandboxing (par ex. Docker, Podman ou Seatbelt).               |
| 52        | `FatalConfigError`         | Un fichier de configuration (`settings.json`) est invalide ou contient des erreurs.                               |
| 53        | `FatalTurnLimitedError`    | Le nombre maximum de tours de conversation pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage de la CLI :**
  - Utilisez le flag `--verbose` (si disponible) avec les commandes de la CLI pour une sortie plus détaillée.
  - Vérifiez les logs de la CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du core :**
  - Vérifiez la sortie de la console du serveur pour les messages d'erreur ou les stack traces.
  - Augmentez la verbosité des logs si cela est configurable.
  - Utilisez les outils de débogage de Node.js (par ex. `node --inspect`) si vous devez parcourir le code côté serveur.

- **Problèmes d'outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération que l'outil effectue.
  - Pour `run_shell_command`, vérifiez d'abord que la commande fonctionne directement dans votre shell.
  - Pour les _outils du système de fichiers_, vérifiez que les chemins sont corrects et contrôlez les permissions.

- **Vérifications pre-flight :**
  - Exécutez toujours `npm run preflight` avant de committer du code. Cela permet de détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Issues GitHub existantes similaires à la vôtre ou création de nouvelles Issues

Si vous rencontrez un problème qui n'est pas couvert ici dans ce _guide de dépannage_, envisagez de faire une recherche dans le [traqueur d'Issues de Qwen Code sur GitHub](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez pas d'issue similaire à la vôtre, envisagez de créer une nouvelle Issue GitHub avec une description détaillée. Les pull requests sont également les bienvenues !