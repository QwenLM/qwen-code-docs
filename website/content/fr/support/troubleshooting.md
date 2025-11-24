# Guide de dépannage

Ce guide fournit des solutions aux problèmes courants et des conseils de debugging, incluant :

- Les erreurs d'authentification ou de connexion
- Les questions fréquemment posées (FAQs)
- Des astuces pour le debugging
- Les Issues GitHub existants similaires au vôtre ou la création de nouvelles Issues

## Erreurs d'authentification ou de connexion

- **Erreur : `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` ou `unable to get local issuer certificate`**
  - **Cause :** Vous êtes peut-être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat d'autorité racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` avec le chemin absolu vers votre fichier de certificat d'autorité racine d'entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Problème : Impossible d'afficher l'interface utilisateur après un échec d'authentification**
  - **Cause :** Si l'authentification échoue après avoir sélectionné un type d'authentification, le paramètre `security.auth.selectedType` peut être persisté dans `settings.json`. Au redémarrage, le CLI peut rester bloqué en essayant de s'authentifier avec le type ayant échoué et ne pas afficher l'interface.
  - **Solution :** Effacez l'élément de configuration `security.auth.selectedType` dans votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez le CLI pour lui permettre de demander à nouveau l'authentification

## Foire aux questions (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**
  - R : Si vous l'avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé depuis les sources, récupérez les derniers changements du repository, puis reconstruisez-le avec la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. À la racine de votre projet : `./.qwen/settings.json`.

    Consultez [Configuration de Qwen Code](./cli/configuration.md) pour plus de détails.

- **Q : Pourquoi ne vois-je pas le nombre de tokens mis en cache dans la sortie des statistiques ?**
  - R : Les informations sur les tokens mis en cache ne s'affichent que lorsque ces tokens sont effectivement utilisés. Cette fonctionnalité est disponible pour les utilisateurs avec une clé API (Qwen API key ou Google Cloud Vertex AI), mais pas pour les utilisateurs OAuth (comme les comptes Google personnels ou professionnels tels que Google Gmail ou Google Workspace). Cela est dû au fait que l'API Qwen Code Assist ne prend pas en charge la création de contenu mis en cache. Vous pouvez néanmoins consulter votre consommation totale de tokens en utilisant la commande `/stats`.

## Messages d'erreur courants et solutions

- **Erreur : `EADDRINUSE` (Adresse déjà utilisée) lors du démarrage d'un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port sur lequel le serveur MCP tente de se lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise ce port ou configurez le serveur MCP pour utiliser un port différent.

- **Erreur : Command not found (lorsque vous essayez d'exécuter Qwen Code avec `qwen`).**
  - **Cause :** Le CLI n'est pas installé correctement ou il n'est pas dans votre `PATH` système.
  - **Solution :**
    La mise à jour dépend de la façon dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire des binaires globaux de `npm` est bien dans votre `PATH`. Vous pouvez mettre à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` depuis les sources, assurez-vous d'utiliser la bonne commande pour l'invoquer (par exemple, `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les derniers changements depuis le dépôt, puis reconstruisez avec la commande `npm run build`.

- **Erreur : `MODULE_NOT_FOUND` ou erreurs d’import.**
  - **Cause :** Les dépendances ne sont pas installées correctement, ou le projet n’a pas été compilé.
  - **Solution :**
    1. Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2. Exécutez `npm run build` pour compiler le projet.
    3. Vérifiez que la compilation s’est terminée avec succès en exécutant `npm run start`.

- **Erreur : "Operation not permitted", "Permission denied", ou similaire.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de sandbox, comme écrire en dehors du répertoire du projet ou du répertoire temporaire du système.
  - **Solution :** Consultez la documentation [Configuration : Sandboxing](./cli/configuration.md#sandboxing) pour plus d'informations, notamment comment personnaliser votre configuration de sandbox.

- **Qwen Code ne fonctionne pas en mode interactif dans les environnements "CI"**
  - **Problème :** Qwen Code ne passe pas en mode interactif (aucune invite de commande n’apparaît) si une variable d’environnement commençant par `CI_` (comme `CI_TOKEN`) est définie. Cela provient du fait que le package `is-in-ci`, utilisé par le framework UI sous-jacent, détecte ces variables et considère qu’il s’agit d’un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION`, ou toute variable d’environnement préfixée par `CI_`. Dès qu’une de ces variables est trouvée, cela indique un environnement non interactif, empêchant ainsi le CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée par `CI_` n’est pas nécessaire au bon fonctionnement du CLI, vous pouvez la désactiver temporairement pour cette commande. Par exemple : `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas depuis le fichier .env du projet**
  - **Problème :** Définir `DEBUG=true` dans le fichier `.env` d’un projet n’active pas le mode debug pour le CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` du projet afin d’éviter tout conflit avec le comportement du CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou modifiez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

## IDE Companion ne se connecte pas

- Assurez-vous que VS Code a un seul dossier de workspace ouvert.
- Redémarrez le terminal intégré après avoir installé l'extension pour qu'il hérite des variables :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` est résolu. Sinon, mappez correctement l'hôte.
- Réinstallez le companion avec `/ide install` et utilisez "Qwen Code: Run" dans la Command Palette pour vérifier qu'il démarre.

## Codes de sortie

Qwen Code utilise des codes de sortie spécifiques pour indiquer la raison de l'arrêt. Cela est particulièrement utile pour les scripts et l'automatisation.

| Code de sortie | Type d'erreur              | Description                                                                                          |
|---------------|----------------------------|------------------------------------------------------------------------------------------------------|
| 41            | `FatalAuthenticationError` | Une erreur s'est produite pendant le processus d'authentification.                                   |
| 42            | `FatalInputError`          | Une entrée invalide ou manquante a été fournie au CLI. (mode non interactif uniquement)              |
| 44            | `FatalSandboxError`        | Une erreur s'est produite avec l'environnement de sandbox (ex. : Docker, Podman ou Seatbelt).         |
| 52            | `FatalConfigError`         | Un fichier de configuration (`settings.json`) est invalide ou contient des erreurs.                  |
| 53            | `FatalTurnLimitedError`    | Le nombre maximal de tours conversationnels pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage CLI :**
  - Utilise le flag `--verbose` (si disponible) avec les commandes CLI pour obtenir une sortie plus détaillée.
  - Consulte les logs du CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du core :**
  - Vérifie la sortie console du serveur pour repérer les messages d'erreur ou les stack traces.
  - Augmente le niveau de verbosité des logs si c'est configurable.
  - Utilise les outils de débogage Node.js (ex : `node --inspect`) si tu dois parcourir le code côté serveur pas à pas.

- **Problèmes d'outils :**
  - Si un outil spécifique échoue, essaie d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération effectuée par l'outil.
  - Pour `run_shell_command`, vérifie d'abord que la commande fonctionne directement dans ton shell.
  - Pour les _outils de système de fichiers_, confirme que les chemins sont corrects et vérifie les permissions.

- **Vérifications préalables :**
  - Exécute toujours `npm run preflight` avant de commit ton code. Cela permet de détecter de nombreuses erreurs courantes liées au formatage, au linting et aux types.

## Issues GitHub existants similaires au vôtre ou création de nouvelles Issues

Si vous rencontrez un problème qui n'est pas couvert ici dans ce _guide de dépannage_, envisagez de rechercher dans le [tracker d'issues GitHub](https://github.com/QwenLM/qwen-code/issues) de Qwen Code. Si vous ne trouvez pas d'issue similaire à la vôtre, envisagez de créer une nouvelle issue GitHub avec une description détaillée. Les pull requests sont également les bienvenues !