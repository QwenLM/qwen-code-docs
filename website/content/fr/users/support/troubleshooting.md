# Dépannage

Ce guide fournit des solutions aux problèmes courants et des conseils de débogage, notamment sur les sujets suivants :

- Erreurs d'authentification ou de connexion
- Questions fréquentes (FAQ)
- Conseils de débogage
- Problèmes GitHub existants similaires au vôtre ou création de nouveaux problèmes

## Erreurs d'authentification ou de connexion

- **Erreur : `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Cause :** L'authentification OAuth de Qwen n'est plus disponible depuis le 15 avril 2026.
  - **Solution :** Passez à une autre méthode d'authentification. Exécutez `qwen` → `/auth` et choisissez l'une des options suivantes :
    - **API Key** : Utilisez une clé API depuis Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Consultez le guide de configuration de l'API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan** : Abonnez-vous pour un forfait mensuel fixe avec des quotas plus élevés. Consultez le guide Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Erreur : `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Cause :** Vous pourriez être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat CA racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` avec le chemin absolu du fichier du certificat d'autorité de certification (CA) racine de votre entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Erreur : `Device authorization flow failed: fetch failed`**
  - **Cause :** Node.js n'a pas pu atteindre les points de terminaison OAuth de Qwen (souvent un problème de proxy ou de confiance SSL/TLS). Lorsqu'il est disponible, Qwen Code affiche également la cause sous-jacente de l'erreur (par exemple : `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Remarque : cette erreur est spécifique à l'ancien flux OAuth de Qwen.
  - **Solution :**
    - Si vous utilisez encore l'authentification OAuth de Qwen, passez à une clé API ou à Coding Plan via `/auth`.
    - Si vous êtes derrière un proxy, configurez-le via `qwen --proxy <url>` (ou le paramètre `proxy` dans `settings.json`).
    - Si votre réseau utilise un CA d'inspection TLS d'entreprise, définissez `NODE_EXTRA_CA_CERTS` comme décrit ci-dessus.

- **Problème : Impossible d'afficher l'interface utilisateur après un échec d'authentification**
  - **Cause :** Si l'authentification échoue après la sélection d'un type d'authentification, le paramètre `security.auth.selectedType` peut être conservé dans `settings.json`. Au redémarrage, la CLI peut rester bloquée en essayant de s'authentifier avec le type d'authentification ayant échoué et ne pas afficher l'interface utilisateur.
  - **Solution :** Supprimez l'élément de configuration `security.auth.selectedType` dans votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez la CLI pour qu'elle vous demande à nouveau une authentification

## Questions fréquentes (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**
  - **R :** Si vous avez installé Qwen Code avec l'installateur autonome, réexécutez la commande d'installation autonome. Si vous l'avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé à partir des sources, récupérez les dernières modifications du dépôt, puis reconstruisez avec la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration de Qwen Code ?**
  - **R :** La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.

    Référez-vous à [Configuration de Qwen Code](../configuration/settings) pour plus de détails.

- **Q : Pourquoi ne vois-je pas les nombres de tokens en cache dans ma sortie de statistiques ?**
  - **R :** Les informations sur les tokens en cache ne sont affichées que lorsque des tokens en cache sont utilisés. Cette fonctionnalité est disponible pour les utilisateurs de clé API (par exemple, clé API Alibaba Cloud Model Studio ou Google Cloud Vertex AI). Vous pouvez toujours consulter votre utilisation totale de tokens avec la commande `/stats`.

## Messages d'erreur courants et solutions

- **Erreur : `EADDRINUSE` (Adresse déjà utilisée) lors du démarrage d'un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port auquel le serveur MCP essaie de se lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un autre port.

- **Erreur : Commande introuvable (en essayant d'exécuter Qwen Code avec `qwen`).**
  - **Cause :** La CLI n'est pas correctement installée ou elle n'est pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la façon dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` avec l'installateur autonome, réexécutez la commande d'installation autonome, puis ouvrez un nouveau terminal.
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire binaire global de `npm` se trouve dans votre `PATH`. Vous pouvez mettre à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` à partir des sources, assurez-vous d'utiliser la commande correcte pour l'invoquer (par exemple `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications du dépôt, puis reconstruisez avec la commande `npm run build`.

- **Erreur : `MODULE_NOT_FOUND` ou erreurs d'import.**
  - **Cause :** Les dépendances ne sont pas installées correctement, ou le projet n'a pas été construit.
  - **Solution :**
    1.  Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2.  Exécutez `npm run build` pour compiler le projet.
    3.  Vérifiez que la construction a réussi avec `npm run start`.

- **Erreur : "Operation not permitted", "Permission denied" ou similaire.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations qui sont restreintes par votre configuration de sandbox, comme l'écriture en dehors du répertoire du projet ou du répertoire temporaire système.
  - **Solution :** Consultez la documentation [Configuration : Sandboxing](../features/sandbox) pour plus d'informations, y compris la personnalisation de votre configuration de sandbox.

- **Qwen Code ne s'exécute pas en mode interactif dans les environnements "CI"**
  - **Problème :** Qwen Code n'entre pas en mode interactif (aucune invite n'apparaît) si une variable d'environnement commençant par `CI_` (par exemple `CI_TOKEN`) est définie. Cela est dû au fait que le package `is-in-ci`, utilisé par le framework d'interface utilisateur sous-jacent, détecte ces variables et suppose un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION` ou toute variable d'environnement avec un préfixe `CI_`. Lorsque l'une d'entre elles est trouvée, il signale que l'environnement est non interactif, ce qui empêche la CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée par `CI_` n'est pas nécessaire au fonctionnement de la CLI, vous pouvez la désactiver temporairement pour la commande. Par exemple : `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas à partir du fichier .env du projet**
  - **Problème :** Définir `DEBUG=true` dans un fichier `.env` du projet n'active pas le mode débogage pour la CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` du projet pour éviter toute interférence avec le comportement de la CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

- **Le défilement du trackpad dans tmux modifie l'historique des invites au lieu de faire défiler la conversation**
  - **Problème :** Dans une session tmux, le défilement du trackpad ou de la molette peut parcourir les invites précédentes, comme si vous appuyiez sur `Flèche Haut` ou `Flèche Bas`.
  - **Cause :** tmux peut traduire les gestes de défilement en séquences simples de touches de direction. Ces séquences sont impossibles à distinguer des véritables pressions de touches directionnelles lorsque qwen-code les reçoit.
  - **Solution :** Activez `ui.useTerminalBuffer` ; utilisez ensuite `Shift+Flèche Haut` / `Shift+Flèche Bas`, ou la molette de la souris lorsque tmux transfère les événements de défilement à l'application. Si vous préférez le défilement de l'hôte, ajustez vos liaisons de souris tmux pour les événements de défilement.

## L'extension IDE Companion ne se connecte pas

- Assurez-vous que VS Code a un seul dossier de travail ouvert.
- Redémarrez le terminal intégré après avoir installé l'extension afin qu'il hérite de :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` est résolu. Sinon, mappez l'hôte de manière appropriée.
- Réinstallez l'extension avec `/ide install` et utilisez "Qwen Code: Run" dans la Palette de commandes pour vérifier qu'elle se lance.

## Codes de sortie

Le code de sortie indique la raison de l'arrêt de Qwen Code. Ceci est particulièrement utile pour les scripts et l'automatisation.

| Code de sortie | Type d'erreur                 | Description                                                                                         |
| -------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| 41             | `FatalAuthenticationError`    | Une erreur s'est produite lors du processus d'authentification.                                     |
| 42             | `FatalInputError`             | Une entrée invalide ou manquante a été fournie à la CLI. (mode non interactif uniquement)           |
| 44             | `FatalSandboxError`           | Une erreur s'est produite avec l'environnement de sandboxing (par exemple Docker, Podman ou Seatbelt). |
| 52             | `FatalConfigError`            | Un fichier de configuration (`settings.json`) est invalide ou contient des erreurs.                 |
| 53             | `FatalTurnLimitedError`       | Le nombre maximum de tours de conversation pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage de la CLI :**
  - Utilisez l'option `--verbose` (si disponible) avec les commandes de la CLI pour une sortie plus détaillée.
  - Consultez les journaux de la CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du cœur :**
  - Vérifiez la sortie de la console du serveur pour les messages d'erreur ou les traces de pile.
  - Augmentez la verbosité des journaux si configurable.
  - Utilisez les outils de débogage Node.js (par exemple `node --inspect`) si vous devez parcourir le code côté serveur.

- **Problèmes d'outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération que l'outil effectue.
  - Pour `run_shell_command`, vérifiez d'abord que la commande fonctionne directement dans votre shell.
  - Pour les _outils du système de fichiers_, vérifiez que les chemins sont corrects et vérifiez les autorisations.

- **Vérifications préalables :**
  - Exécutez toujours `npm run preflight` avant de valider le code. Cela peut détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Problèmes GitHub existants similaires au vôtre ou création de nouveaux problèmes

Si vous rencontrez un problème qui n'est pas couvert ici dans ce _Guide de dépannage_, envisagez de consulter le [suivi des problèmes de Qwen Code sur GitHub](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez pas de problème similaire au vôtre, envisagez de créer un nouveau problème GitHub avec une description détaillée. Les pull requests sont également les bienvenues !