# Dépannage

Ce guide propose des solutions aux problèmes courants et des conseils de débogage, couvrant les sujets suivants :

- Erreurs d'authentification ou de connexion
- Foire aux questions (FAQ)
- Conseils de débogage
- Recherche d'issues GitHub existantes similaires ou création d'une nouvelle issue

## Erreurs d'authentification ou de connexion

- **Error: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, or `unable to get local issuer certificate`**
  - **Cause :** Vous êtes peut-être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat CA racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` sur le chemin absolu de votre fichier de certificat CA racine d'entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Error: `Device authorization flow failed: fetch failed`**
  - **Cause :** Node.js n'a pas pu atteindre les endpoints OAuth de Qwen (souvent un problème de proxy ou de confiance SSL/TLS). Lorsqu'elle est disponible, Qwen Code affichera également la cause sous-jacente de l'erreur (par exemple : `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - **Solution :**
    - Confirmez que vous pouvez accéder à `https://chat.qwen.ai` depuis la même machine/le même réseau.
    - Si vous utilisez un proxy, configurez-le via `qwen --proxy <url>` (ou le paramètre `proxy` dans `settings.json`).
    - Si votre réseau utilise une autorité de certification TLS d'entreprise pour l'inspection, définissez `NODE_EXTRA_CA_CERTS` comme décrit ci-dessus.

- **Issue: Unable to display UI after authentication failure**
  - **Cause :** Si l'authentification échoue après la sélection d'un type d'authentification, le paramètre `security.auth.selectedType` peut être conservé dans `settings.json`. Au redémarrage, la CLI peut rester bloquée en essayant de s'authentifier avec ce type échoué et ne pas afficher l'interface.
  - **Solution :** Supprimez l'élément de configuration `security.auth.selectedType` de votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez la CLI pour qu'elle vous invite à nouveau à vous authentifier

## Foire aux questions (FAQ)

- **Q: How do I update Qwen Code to the latest version?**
  - R : Si vous l'avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé depuis les sources, récupérez les dernières modifications du dépôt, puis reconstruisez-le avec la commande `npm run build`.

- **Q: Where are the Qwen Code configuration or settings files stored?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.

    Consultez [Configuration de Qwen Code](../configuration/settings) pour plus de détails.

- **Q: Why don't I see cached token counts in my stats output?**
  - R : Les informations sur les tokens mis en cache ne s'affichent que lorsque des tokens en cache sont effectivement utilisés. Cette fonctionnalité est disponible pour les utilisateurs de clé API (clé API Qwen ou Google Cloud Vertex AI), mais pas pour les utilisateurs OAuth (comme les comptes personnels/entreprise Google, respectivement Google Gmail ou Google Workspace). En effet, l'API Qwen Code Assist ne prend pas en charge la création de contenu mis en cache. Vous pouvez toujours consulter votre utilisation totale de tokens avec la commande `/stats`.

## Messages d'erreur courants et solutions

- **Error: `EADDRINUSE` (Address already in use) when starting an MCP server.**
  - **Cause :** Un autre processus utilise déjà le port que le serveur MCP tente de lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un port différent.

- **Error: Command not found (when attempting to run Qwen Code with `qwen`).**
  - **Cause :** La CLI n'est pas correctement installée ou ne se trouve pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la méthode d'installation de Qwen Code :
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire des binaires globaux `npm` est dans votre `PATH`. Vous pouvez mettre à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` depuis les sources, assurez-vous d'utiliser la bonne commande pour l'invoquer (par ex. `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications du dépôt, puis reconstruisez avec la commande `npm run build`.

- **Error: `MODULE_NOT_FOUND` or import errors.**
  - **Cause :** Les dépendances ne sont pas correctement installées ou le projet n'a pas été compilé.
  - **Solution :**
    1. Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2. Exécutez `npm run build` pour compiler le projet.
    3. Vérifiez que la compilation s'est terminée avec succès via `npm run start`.

- **Error: "Operation not permitted", "Permission denied", or similar.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de sandbox, comme l'écriture en dehors du répertoire du projet ou du répertoire temporaire système.
  - **Solution :** Consultez la documentation [Configuration : Sandboxing](../features/sandbox) pour plus d'informations, y compris comment personnaliser votre configuration de sandbox.

- **Qwen Code is not running in interactive mode in "CI" environments**
  - **Issue :** Qwen Code n'entre pas en mode interactif (aucune invite n'apparaît) si une variable d'environnement commençant par `CI_` (par ex. `CI_TOKEN`) est définie. En effet, le package `is-in-ci`, utilisé par le framework UI sous-jacent, détecte ces variables et suppose un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION` ou de toute variable d'environnement avec le préfixe `CI_`. Lorsque l'une d'elles est trouvée, il signale que l'environnement est non interactif, ce qui empêche la CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée par `CI_` n'est pas nécessaire au fonctionnement de la CLI, vous pouvez la désactiver temporairement pour la commande. Par ex. `env -u CI_TOKEN qwen`

- **DEBUG mode not working from project .env file**
  - **Issue :** Définir `DEBUG=true` dans le fichier `.env` d'un projet n'active pas le mode debug pour la CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` de projet pour éviter d'interférer avec le comportement de la CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

## L'IDE Companion ne se connecte pas

- Assurez-vous qu'un seul dossier d'espace de travail est ouvert dans VS Code.
- Redémarrez le terminal intégré après l'installation de l'extension afin qu'il hérite de :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` se résout correctement. Sinon, mappez l'hôte de manière appropriée.
- Réinstallez le companion avec `/ide install` et utilisez “Qwen Code: Run” dans la palette de commandes pour vérifier qu'il se lance.

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
  - Utilisez le flag `--verbose` (si disponible) avec les commandes CLI pour obtenir une sortie plus détaillée.
  - Consultez les logs de la CLI, généralement situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du core :**
  - Vérifiez la sortie de la console du serveur pour les messages d'erreur ou les stack traces.
  - Augmentez la verbosité des logs si cela est configurable.
  - Utilisez les outils de débogage Node.js (par ex. `node --inspect`) si vous devez parcourir le code côté serveur pas à pas.

- **Problèmes liés aux outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération que l'outil effectue.
  - Pour `run_shell_command`, vérifiez d'abord que la commande fonctionne directement dans votre shell.
  - Pour les _outils système de fichiers_, vérifiez que les chemins sont corrects et contrôlez les permissions.

- **Vérifications préliminaires :**
  - Exécutez toujours `npm run preflight` avant de commiter du code. Cela permet de détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Recherche d'issues GitHub existantes similaires ou création d'une nouvelle issue

Si vous rencontrez un problème non couvert dans ce _guide de dépannage_, pensez à rechercher dans le [suivi des issues GitHub de Qwen Code](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez pas d'issue similaire à la vôtre, envisagez de créer une nouvelle issue GitHub avec une description détaillée. Les pull requests sont également les bienvenues !