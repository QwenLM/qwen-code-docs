# Dépannage

Ce guide propose des solutions aux problèmes courants et des conseils de débogage, couvrant les sujets suivants :

- Erreurs d'authentification ou de connexion
- Questions fréquentes (FAQ)
- Conseils de débogage
- Recherche d'issues GitHub existantes similaires ou création d'une nouvelle issue

## Erreurs d'authentification ou de connexion

- **Error: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Cause :** Qwen OAuth n'est plus disponible depuis le 15 avril 2026.
  - **Solution :** Basculez vers une autre méthode d'authentification. Exécutez `qwen` → `/auth` et choisissez l'une des options suivantes :
    - **API Key** : Utilisez une clé API depuis Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Consultez le guide de configuration de l'API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan** : Abonnez-vous pour un tarif mensuel fixe avec des quotas plus élevés. Consultez le guide du Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Error: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, or `unable to get local issuer certificate`**
  - **Cause :** Vous êtes peut-être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat CA racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` avec le chemin absolu vers votre fichier de certificat CA racine d'entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Error: `Device authorization flow failed: fetch failed`**
  - **Cause :** Node.js n'a pas pu atteindre les endpoints Qwen OAuth (souvent un problème de proxy ou de confiance SSL/TLS). Lorsqu'elle est disponible, Qwen Code affichera également la cause sous-jacente de l'erreur (par exemple : `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Remarque : cette erreur est spécifique au flux Qwen OAuth hérité.
  - **Solution :**
    - Si vous utilisez toujours Qwen OAuth, basculez vers API Key ou Coding Plan via `/auth`.
    - Si vous êtes derrière un proxy, configurez-le via `qwen --proxy <url>` (ou le paramètre `proxy` dans `settings.json`).
    - Si votre réseau utilise un CA d'inspection TLS d'entreprise, définissez `NODE_EXTRA_CA_CERTS` comme décrit ci-dessus.

- **Issue: Unable to display UI after authentication failure**
  - **Cause :** Si l'authentification échoue après la sélection d'un type d'authentification, le paramètre `security.auth.selectedType` peut être conservé dans `settings.json`. Au redémarrage, la CLI peut rester bloquée en essayant de s'authentifier avec le type ayant échoué et ne pas afficher l'interface utilisateur.
  - **Solution :** Supprimez l'élément de configuration `security.auth.selectedType` dans votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez la CLI pour qu'elle vous demande à nouveau de vous authentifier

## Questions fréquentes (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**
  - R : Si vous l'avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé depuis les sources, récupérez les dernières modifications du dépôt, puis reconstruisez-le avec la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.

    Consultez [Configuration de Qwen Code](../configuration/settings) pour plus de détails.

- **Q : Pourquoi ne vois-je pas le nombre de tokens mis en cache dans la sortie de mes statistiques ?**
  - R : Les informations sur les tokens mis en cache ne sont affichées que lorsque des tokens mis en cache sont utilisés. Cette fonctionnalité est disponible pour les utilisateurs de clé API (par ex., clé API Alibaba Cloud Model Studio ou Google Cloud Vertex AI). Vous pouvez toujours consulter votre utilisation totale de tokens avec la commande `/stats`.

## Messages d'erreur courants et solutions

- **Error: `EADDRINUSE` (Address already in use) when starting an MCP server.**
  - **Cause :** Un autre processus utilise déjà le port sur lequel le serveur MCP tente de se lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un port différent.

- **Error: Command not found (when attempting to run Qwen Code with `qwen`).**
  - **Cause :** La CLI n'est pas correctement installée ou ne se trouve pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la façon dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire des binaires globaux `npm` est dans votre `PATH`. Vous pouvez effectuer la mise à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` depuis les sources, assurez-vous d'utiliser la commande correcte pour l'invoquer (par ex. `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications du dépôt, puis reconstruisez avec la commande `npm run build`.

- **Error: `MODULE_NOT_FOUND` or import errors.**
  - **Cause :** Les dépendances ne sont pas correctement installées ou le projet n'a pas été compilé.
  - **Solution :**
    1. Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2. Exécutez `npm run build` pour compiler le projet.
    3. Vérifiez que la compilation s'est terminée avec succès avec `npm run start`.

- **Error: "Operation not permitted", "Permission denied", or similar.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de sandbox, comme l'écriture en dehors du répertoire du projet ou du répertoire temporaire du système.
  - **Solution :** Consultez la documentation [Configuration : Sandboxing](../features/sandbox) pour plus d'informations, y compris comment personnaliser votre configuration de sandbox.

- **Qwen Code is not running in interactive mode in "CI" environments**
  - **Issue :** Qwen Code n'entre pas en mode interactif (aucun prompt n'apparaît) si une variable d'environnement commençant par `CI_` (par ex. `CI_TOKEN`) est définie. Cela est dû au fait que le package `is-in-ci`, utilisé par le framework UI sous-jacent, détecte ces variables et suppose un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION` ou de toute variable d'environnement avec le préfixe `CI_`. Lorsque l'une d'elles est trouvée, il signale que l'environnement est non interactif, ce qui empêche la CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée par `CI_` n'est pas nécessaire au fonctionnement de la CLI, vous pouvez la désactiver temporairement pour la commande. Par ex. `env -u CI_TOKEN qwen`

- **DEBUG mode not working from project .env file**
  - **Issue :** Définir `DEBUG=true` dans le fichier `.env` d'un projet n'active pas le mode debug pour la CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` du projet pour éviter toute interférence avec le comportement de la CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

## Le compagnon IDE ne se connecte pas

- Assurez-vous que VS Code a un seul dossier d'espace de travail ouvert.
- Redémarrez le terminal intégré après l'installation de l'extension afin qu'il hérite de :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` se résout. Sinon, mappez l'hôte de manière appropriée.
- Réinstallez le compagnon avec `/ide install` et utilisez “Qwen Code: Run” dans la palette de commandes pour vérifier qu'il se lance.

## Codes de sortie

Qwen Code utilise des codes de sortie spécifiques pour indiquer la raison de la terminaison. Cela est particulièrement utile pour le scripting et l'automatisation.

| Code de sortie | Type d'erreur                 | Description                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Une erreur s'est produite pendant le processus d'authentification.                                                |
| 42        | `FatalInputError`          | Une entrée invalide ou manquante a été fournie à la CLI. (mode non interactif uniquement)                       |
| 44        | `FatalSandboxError`        | Une erreur s'est produite avec l'environnement de sandboxing (par ex. Docker, Podman ou Seatbelt).               |
| 52        | `FatalConfigError`         | Un fichier de configuration (`settings.json`) est invalide ou contient des erreurs.                               |
| 53        | `FatalTurnLimitedError`    | Le nombre maximum de tours de conversation pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage de la CLI :**
  - Utilisez le flag `--verbose` (si disponible) avec les commandes CLI pour une sortie plus détaillée.
  - Vérifiez les logs de la CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du core :**
  - Vérifiez la sortie de la console du serveur pour les messages d'erreur ou les stack traces.
  - Augmentez la verbosité des logs si cela est configurable.
  - Utilisez les outils de débogage Node.js (par ex. `node --inspect`) si vous devez parcourir le code côté serveur.

- **Problèmes d'outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération que l'outil effectue.
  - Pour `run_shell_command`, vérifiez d'abord que la commande fonctionne directement dans votre shell.
  - Pour les _outils système de fichiers_, vérifiez que les chemins sont corrects et contrôlez les permissions.

- **Vérifications préalables (pre-flight) :**
  - Exécutez toujours `npm run preflight` avant de commiter du code. Cela permet de détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Recherche d'issues GitHub existantes similaires ou création d'une nouvelle issue

Si vous rencontrez un problème non couvert dans ce _guide de dépannage_, pensez à rechercher dans le [suivi des issues GitHub de Qwen Code](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez pas d'issue similaire à la vôtre, envisagez de créer une nouvelle issue GitHub avec une description détaillée. Les pull requests sont également les bienvenues !