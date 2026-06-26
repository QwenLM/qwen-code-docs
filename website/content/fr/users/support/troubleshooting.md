# Dépannage

Ce guide fournit des solutions aux problèmes courants et des astuces de débogage, notamment sur les sujets suivants :

- Erreurs d'authentification ou de connexion
- Questions fréquemment posées (FAQs)
- Conseils de débogage
- Problèmes GitHub existants similaires aux vôtres ou création de nouveaux problèmes

## Erreurs d'authentification ou de connexion

- **Erreur : `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Cause :** Le niveau gratuit OAuth de Qwen n'est plus disponible depuis le 15 avril 2026.
  - **Solution :** Passez à une autre méthode d'authentification. Exécutez `qwen` → `/auth` et choisissez l'une des options suivantes :
    - **Clé API** : Utilisez une clé API depuis Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Consultez le guide de configuration de l'API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Plan de codage Alibaba Cloud** : Abonnez-vous pour un forfait mensuel fixe avec des quotas plus élevés. Consultez le guide du Plan de codage ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Erreur : `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Cause :** Vous êtes peut-être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat CA racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` sur le chemin absolu de votre fichier de certificat CA racine d'entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/chemin/vers/votre/ca-entreprise.crt`

- **Erreur : `Device authorization flow failed: fetch failed`**
  - **Cause :** Node.js n'a pas pu atteindre les points de terminaison OAuth de Qwen (souvent un problème de proxy ou de confiance SSL/TLS). Lorsqu'il est disponible, Qwen Code affiche également la cause sous-jacente de l'erreur (par exemple : `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Note : cette erreur est spécifique au flux OAuth Qwen hérité.
  - **Solution :**
    - Si vous utilisez encore OAuth Qwen, passez à une clé API ou à un plan de codage via `/auth`.
    - Si vous êtes derrière un proxy, configurez-le via `qwen --proxy <url>` (ou le paramètre `proxy` dans `settings.json`).
    - Si votre réseau utilise un CA d'inspection TLS d'entreprise, définissez `NODE_EXTRA_CA_CERTS` comme décrit ci-dessus.

- **Problème : Impossible d'afficher l'interface utilisateur après un échec d'authentification**
  - **Cause :** Si l'authentification échoue après avoir sélectionné un type d'authentification, le paramètre `security.auth.selectedType` peut être conservé dans `settings.json`. Au redémarrage, le CLI peut rester bloqué en essayant de s'authentifier avec le type d'authentification ayant échoué et ne pas afficher l'interface.
  - **Solution :** Effacez l'élément de configuration `security.auth.selectedType` dans votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez le CLI pour qu'il vous invite à nouveau à vous authentifier

## Questions fréquemment posées (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**
  - R : Si vous avez installé Qwen Code avec l'installateur autonome, réexécutez la commande d'installation autonome. Si vous l'avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé à partir des sources, récupérez les dernières modifications du dépôt, puis reconstruisez avec la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. À la racine de votre projet : `./.qwen/settings.json`.

    Consultez [Configuration de Qwen Code](../configuration/settings) pour plus de détails.

- **Q : Pourquoi ne vois-je pas les nombres de jetons mis en cache dans les statistiques ?**
  - R : Les informations sur les jetons mis en cache ne sont affichées que lorsque des jetons mis en cache sont utilisés. Cette fonctionnalité est disponible pour les utilisateurs de clés API (par exemple, clé API Alibaba Cloud Model Studio ou Google Cloud Vertex AI). Vous pouvez toujours consulter votre utilisation totale de jetons avec la commande `/stats`.

## Messages d'erreur courants et solutions

- **Erreur : `EADDRINUSE` (Adresse déjà utilisée) au démarrage d'un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port auquel le serveur MCP tente de se lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un port différent.

- **Erreur : Commande introuvable (lors de la tentative d'exécution de Qwen Code avec `qwen`).**
  - **Cause :** Le CLI n'est pas correctement installé ou n'est pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la façon dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` avec l'installateur autonome, réexécutez la commande d'installation autonome, puis ouvrez un nouveau terminal.
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire des binaires globaux de `npm` est dans votre `PATH`. Vous pouvez mettre à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` à partir des sources, assurez-vous d'utiliser la bonne commande pour l'invoquer (par exemple `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications du dépôt, puis reconstruisez avec la commande `npm run build`.
- **Erreur : `MODULE_NOT_FOUND` ou erreurs d'import.**
  - **Cause :** Les dépendances ne sont pas correctement installées ou le projet n'a pas été compilé.
  - **Solution :**
    1.  Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2.  Exécutez `npm run build` pour compiler le projet.
    3.  Vérifiez que la compilation s'est terminée avec succès avec `npm run start`.

- **Erreur : "Operation not permitted", "Permission denied" ou similaire.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations qui sont restreintes par votre configuration sandbox, comme écrire en dehors du répertoire du projet ou du répertoire temporaire système.
  - **Solution :** Consultez la documentation [Configuration : Sandboxing](../features/sandbox) pour plus d'informations, y compris comment personnaliser votre configuration sandbox.

- **Qwen Code ne fonctionne pas en mode interactif dans les environnements "CI"**
  - **Problème :** Qwen Code n'entre pas en mode interactif (aucun invite n'apparaît) si une variable d'environnement commençant par `CI_` (par ex. `CI_TOKEN`) est définie. Cela est dû au fait que le package `is-in-ci`, utilisé par le framework d'interface sous-jacent, détecte ces variables et suppose un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION` ou toute variable d'environnement avec un préfixe `CI_`. Lorsqu'elles sont trouvées, cela signale que l'environnement est non interactif, ce qui empêche le CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée par `CI_` n'est pas nécessaire au fonctionnement du CLI, vous pouvez la désactiver temporairement pour la commande. Par exemple : `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas à partir du fichier .env du projet**
  - **Problème :** Définir `DEBUG=true` dans le fichier `.env` d'un projet n'active pas le mode débogage pour le CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` du projet pour éviter toute interférence avec le comportement du CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

- **Le défilement du trackpad dans tmux modifie l'historique des invites au lieu de faire défiler la conversation**
  - **Problème :** Dans une session tmux, le défilement du trackpad ou de la molette peut parcourir les invites précédentes, similaire à l'appui sur `Flèche haut` ou `Flèche bas`.
  - **Cause :** tmux peut traduire les gestes de la molette en simples séquences de touches fléchées. Ces séquences sont indiscernables des vraies pressions de touches fléchées au moment où qwen-code les reçoit.
  - **Solution :** Activez `ui.useTerminalBuffer` ; utilisez ensuite `Shift+Flèche haut` / `Shift+Flèche bas`, ou la molette de la souris lorsque tmux transmet les événements de la molette à l'application. Si vous préférez le scrollback de l'hôte, ajustez les liaisons de souris de tmux pour les événements de la molette.

## Connexion du Compagnon IDE impossible

- Assurez-vous que VS Code a un seul dossier d'espace de travail ouvert.
- Redémarrez le terminal intégré après avoir installé l'extension afin qu'il hérite de :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` est résolu. Sinon, mappez l'hôte de manière appropriée.
- Réinstallez le compagnon avec `/ide install` et utilisez « Qwen Code : Exécuter » dans la palette de commandes pour vérifier son lancement.

## Codes de sortie

Qwen Code utilise des codes de sortie spécifiques pour indiquer la raison de l'arrêt. Ceci est particulièrement utile pour les scripts et l'automatisation.

| Code de sortie | Type d'erreur              | Description                                                                                         |
| -------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41             | `FatalAuthenticationError` | Une erreur s'est produite lors du processus d'authentification.                                     |
| 42             | `FatalInputError`          | Une entrée invalide ou manquante a été fournie au CLI. (mode non interactif uniquement)             |
| 44             | `FatalSandboxError`        | Une erreur s'est produite avec l'environnement sandbox (par ex. Docker, Podman ou Seatbelt).        |
| 52             | `FatalConfigError`         | Un fichier de configuration (`settings.json`) est invalide ou contient des erreurs.                 |
| 53             | `FatalTurnLimitedError`    | Le nombre maximal de tours de conversation pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage du CLI :**
  - Utilisez le drapeau `--verbose` (si disponible) avec les commandes CLI pour une sortie plus détaillée.
  - Consultez les logs du CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du cœur :**
  - Consultez la sortie de la console du serveur pour les messages d'erreur ou les traces de pile.
  - Augmentez la verbosité des logs si configurable.
  - Utilisez les outils de débogage Node.js (par ex. `node --inspect`) si vous devez parcourir le code côté serveur.

- **Problèmes d'outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération que l'outil effectue.
  - Pour `run_shell_command`, vérifiez d'abord que la commande fonctionne directement dans votre shell.
  - Pour les _outils de système de fichiers_, vérifiez que les chemins sont corrects et les permissions.
- **Vérifications préalables :**
  - Exécutez toujours `npm run preflight` avant de commiter du code. Cela permet de détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Issues GitHub existantes similaires aux vôtres ou création de nouvelles Issues

Si vous rencontrez un problème qui n'est pas couvert ici dans ce _Guide de dépannage_, envisagez de rechercher dans le [suivi des issues de Qwen Code sur GitHub](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez pas d'issue similaire à la vôtre, envisagez de créer une nouvelle GitHub Issue avec une description détaillée. Les Pull requests sont également les bienvenues !
