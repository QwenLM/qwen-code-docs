# Guide de dépannage

Ce guide fournit des solutions aux problèmes courants et des conseils de débogage, notamment sur les sujets suivants :

- Erreurs d'authentification ou de connexion
- Foire aux questions (FAQ)
- Conseils de débogage
- Issues GitHub existants similaires au vôtre ou création de nouvelles Issues

## Erreurs d'authentification ou de connexion

- **Erreur : `Failed to login. Message: Request contains an invalid argument`**
  - Les utilisateurs disposant de comptes Google Workspace ou de comptes Google Cloud
    associés à leurs comptes Gmail peuvent ne pas pouvoir activer la
    formule Google Code Assist gratuite.
  - Pour les comptes Google Cloud, vous pouvez contourner ce problème en définissant
    `GOOGLE_CLOUD_PROJECT` avec l'ID de votre projet.
  - Vous pouvez également obtenir la clé API Gemini depuis
    [Google AI Studio](http://aistudio.google.com/app/apikey), qui inclut également une
    formule gratuite distincte.

## Foire aux questions (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**
  - R : Si vous l'avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé depuis les sources, récupérez les derniers changements depuis le repository, puis reconstruisez-le avec la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.

    Consultez [Configuration de Qwen Code](./cli/configuration.md) pour plus de détails.

- **Q : Pourquoi ne vois-je pas les comptages de tokens mis en cache dans la sortie des statistiques ?**
  - R : Les informations sur les tokens mis en cache ne s'affichent que lorsque ces tokens sont effectivement utilisés. Cette fonctionnalité est disponible pour les utilisateurs avec une API key (Gemini API key ou Google Cloud Vertex AI), mais pas pour les utilisateurs OAuth (comme les comptes Google personnels ou professionnels, par exemple Gmail ou Google Workspace). Cela est dû au fait que l'API Gemini Code Assist ne prend pas en charge la création de contenu mis en cache. Vous pouvez néanmoins consulter votre consommation totale de tokens en utilisant la commande `/stats`.

## Messages d'erreur courants et solutions

- **Erreur : `EADDRINUSE` (Adresse déjà utilisée) lors du démarrage d’un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port sur lequel le serveur MCP tente de se lier.
  - **Solution :**
    Arrêtez l’autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un port différent.

- **Erreur : Command not found (lors de la tentative d’exécution de Qwen Code avec `qwen`).**
  - **Cause :** Le CLI n’est pas correctement installé ou il n’est pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la façon dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire des binaires globaux de `npm` est dans votre `PATH`. Vous pouvez le mettre à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` depuis les sources, assurez-vous d’utiliser la bonne commande pour l’appeler (par exemple, `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les derniers changements depuis le repository, puis reconstruisez avec la commande `npm run build`.

- **Erreur : `MODULE_NOT_FOUND` ou erreurs d’import.**
  - **Cause :** Les dépendances ne sont pas correctement installées, ou le projet n’a pas été compilé.
  - **Solution :**
    1. Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2. Exécutez `npm run build` pour compiler le projet.
    3. Vérifiez que la compilation s’est terminée avec succès en exécutant `npm run start`.

- **Erreur : "Operation not permitted", "Permission denied", ou similaire.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de sandbox, comme écrire en dehors du répertoire du projet ou du répertoire temporaire du système.
  - **Solution :** Consultez la documentation [Configuration : Sandboxing](./cli/configuration.md#sandboxing) pour plus d’informations, notamment sur la personnalisation de votre configuration de sandbox.

- **Qwen Code ne s’exécute pas en mode interactif dans les environnements "CI"**
  - **Problème :** Qwen Code ne démarre pas en mode interactif (aucune invite de commande n’apparaît) si une variable d’environnement commençant par `CI_` (par exemple, `CI_TOKEN`) est définie. Cela est dû au fait que le package `is-in-ci`, utilisé par le framework UI sous-jacent, détecte ces variables et considère qu’il s’agit d’un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION`, ou de toute variable d’environnement avec un préfixe `CI_`. Si l’une d’elles est trouvée, cela indique que l’environnement est non interactif, ce qui empêche le CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée avec `CI_` n’est pas nécessaire au fonctionnement du CLI, vous pouvez la désactiver temporairement pour la commande. Par exemple : `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas depuis le fichier .env du projet**
  - **Problème :** Définir `DEBUG=true` dans le fichier `.env` d’un projet n’active pas le mode debug pour le CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` du projet pour éviter d’interférer avec le comportement du CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `excludedProjectEnvVars` dans votre `settings.json` pour exclure moins de variables.

## IDE Companion ne se connecte pas

- Assurez-vous que VS Code a un seul dossier de workspace ouvert.
- Redémarrez le terminal intégré après avoir installé l'extension pour qu'il hérite des variables :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un container, vérifiez que `host.docker.internal` est résolu. Sinon, mappez l'hôte de manière appropriée.
- Réinstallez le companion avec `/ide install` et utilisez "Qwen Code: Run" dans la Command Palette pour vérifier qu'il se lance correctement.

## Conseils de débogage

- **Débogage CLI :**
  - Utilisez le flag `--verbose` (si disponible) avec les commandes CLI pour obtenir une sortie plus détaillée.
  - Consultez les logs CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du core :**
  - Vérifiez la sortie console du serveur pour repérer les messages d'erreur ou les stack traces.
  - Augmentez le niveau de verbosité des logs si c'est configurable.
  - Utilisez les outils de débogage Node.js (ex. `node --inspect`) si vous devez parcourir le code côté serveur pas à pas.

- **Problèmes d'outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération effectuée par l'outil.
  - Pour `run_shell_command`, vérifiez d'abord que la commande fonctionne directement dans votre shell.
  - Pour les _outils de système de fichiers_, assurez-vous que les chemins sont corrects et vérifiez les permissions.

- **Vérifications préalables :**
  - Exécutez toujours `npm run preflight` avant de commiter du code. Cela permet de détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Issues GitHub existants similaires au vôtre ou création de nouvelles Issues

Si vous rencontrez un problème qui n'est pas couvert ici dans ce _guide de dépannage_, envisagez de rechercher dans le [tracker d'issues GitHub](https://github.com/QwenLM/qwen-code/issues) de Qwen Code. Si vous ne trouvez pas d'issue similaire à la vôtre, envisagez de créer une nouvelle issue GitHub avec une description détaillée. Les pull requests sont également les bienvenues !