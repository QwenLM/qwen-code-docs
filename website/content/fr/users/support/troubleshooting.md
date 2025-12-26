# Dépannage

Ce guide fournit des solutions aux problèmes courants et des conseils de débogage, notamment sur les sujets suivants :

- Erreurs d'authentification ou de connexion
- Questions fréquemment posées (FAQ)
- Conseils de débogage
- Problèmes GitHub existants similaires aux vôtres ou création de nouveaux problèmes

## Erreurs d'authentification ou de connexion

- **Erreur : `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` ou `unable to get local issuer certificate`**
  - **Cause :** Vous êtes peut-être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat CA racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` avec le chemin absolu vers votre fichier de certificat CA racine d'entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Problème : Impossible d'afficher l'interface utilisateur après un échec d'authentification**
  - **Cause :** Si l'authentification échoue après avoir sélectionné un type d'authentification, le paramètre `security.auth.selectedType` peut être persisté dans `settings.json`. Au redémarrage, la CLI peut rester bloquée en essayant de s'authentifier avec le type d'authentification ayant échoué et ne parvient pas à afficher l'interface utilisateur.
  - **Solution :** Effacez l'élément de configuration `security.auth.selectedType` dans votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez la CLI pour lui permettre de redemander l'authentification

## Questions fréquentes (FAQ)

- **Q : Comment puis-je mettre à jour Qwen Code vers la dernière version ?**
  - R : Si vous l'avez installé globalement via `npm`, mettez-le à jour en utilisant la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé à partir des sources, récupérez les dernières modifications depuis le dépôt, puis reconstruisez en utilisant la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.

    Référez-vous à [Configuration de Qwen Code](../configuration/settings) pour plus de détails.

- **Q : Pourquoi ne vois-je pas les compteurs de jetons mis en cache dans la sortie de mes statistiques ?**
  - R : Les informations de jetons mis en cache ne sont affichées que lorsque des jetons mis en cache sont utilisés. Cette fonctionnalité est disponible pour les utilisateurs de clés API (clé API Qwen ou Google Cloud Vertex AI) mais pas pour les utilisateurs OAuth (tels que les comptes Google Personnels/Entreprise comme Gmail Google ou Google Workspace, respectivement). Cela est dû au fait que l'API Qwen Code Assist ne prend pas en charge la création de contenu mis en cache. Vous pouvez toujours consulter votre utilisation totale de jetons en utilisant la commande `/stats`.

## Messages d'erreur courants et solutions

- **Erreur : `EADDRINUSE` (Adresse déjà utilisée) lors du démarrage d'un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port auquel le serveur MCP essaie de se lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un port différent.

- **Erreur : Commande introuvable (lors de la tentative d'exécuter Qwen Code avec `qwen`).**
  - **Cause :** La CLI n'est pas correctement installée ou n'est pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la manière dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` globalement, vérifiez que votre répertoire binaire global `npm` est dans votre `PATH`. Vous pouvez mettre à jour en utilisant la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` depuis la source, assurez-vous d'utiliser la bonne commande pour l'invoquer (par exemple `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications depuis le dépôt, puis reconstruisez en utilisant la commande `npm run build`.

- **Erreur : `MODULE_NOT_FOUND` ou erreurs d'importation.**
  - **Cause :** Les dépendances ne sont pas installées correctement, ou le projet n'a pas été compilé.
  - **Solution :**
    1.  Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2.  Exécutez `npm run build` pour compiler le projet.
    3.  Vérifiez que la compilation s'est terminée avec succès en exécutant `npm run start`.

- **Erreur : "Opération non autorisée", "Permission refusée" ou similaire.**
  - **Cause :** Lorsque le sandboxing est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de sandbox, comme l'écriture en dehors du répertoire du projet ou du répertoire temporaire du système.
  - **Solution :** Référez-vous à la documentation [Configuration : Sandboxing](../features/sandbox) pour plus d'informations, notamment sur la façon de personnaliser votre configuration de sandbox.

- **Qwen Code ne fonctionne pas en mode interactif dans les environnements "CI"**
  - **Problème :** Qwen Code n'entre pas en mode interactif (aucune invite n'apparaît) si une variable d'environnement commençant par `CI_` (par exemple `CI_TOKEN`) est définie. Cela est dû au fait que le package `is-in-ci`, utilisé par le framework d'interface utilisateur sous-jacent, détecte ces variables et suppose qu'il s'agit d'un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION`, ou de toute variable d'environnement avec un préfixe `CI_`. Lorsque l'une de celles-ci est trouvée, cela indique que l'environnement est non interactif, ce qui empêche la CLI de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée `CI_` n'est pas nécessaire au fonctionnement de la CLI, vous pouvez la désactiver temporairement pour la commande. Par exemple `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas depuis le fichier .env du projet**
  - **Problème :** Définir `DEBUG=true` dans le fichier `.env` d'un projet n'active pas le mode debug pour la CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` des projets pour éviter toute interférence avec le comportement de la CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

## Le compagnon IDE ne se connecte pas

- Assurez-vous que VS Code a un seul dossier d'espace de travail ouvert.
- Redémarrez le terminal intégré après l'installation de l'extension afin qu'il hérite :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` est résolu. Sinon, mappez l'hôte correctement.
- Réinstallez le compagnon avec `/ide install` et utilisez "Qwen Code : Exécuter" dans la palette de commandes pour vérifier qu'il démarre.

## Codes de sortie

Qwen Code utilise des codes de sortie spécifiques pour indiquer la raison de l'arrêt. Ceci est particulièrement utile pour les scripts et l'automatisation.

| Code de sortie | Type d'erreur              | Description                                                                                         |
| -------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41             | `FatalAuthenticationError` | Une erreur s'est produite pendant le processus d'authentification.                                  |
| 42             | `FatalInputError`          | Une entrée invalide ou manquante a été fournie au CLI. (mode non interactif uniquement)             |
| 44             | `FatalSandboxError`        | Une erreur s'est produite avec l'environnement de sandboxing (ex. Docker, Podman ou Seatbelt).     |
| 52             | `FatalConfigError`         | Un fichier de configuration (`settings.json`) est invalide ou contient des erreurs.                 |
| 53             | `FatalTurnLimitedError`    | Le nombre maximum de tours de conversation pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage CLI :**
  - Utilisez l'indicateur `--verbose` (si disponible) avec les commandes CLI pour obtenir une sortie plus détaillée.
  - Vérifiez les journaux CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du noyau :**
  - Vérifiez la sortie de la console du serveur pour les messages d'erreur ou les traces de pile.
  - Augmentez la verbosité des journaux si cela est configurable.
  - Utilisez les outils de débogage Node.js (par exemple `node --inspect`) si vous devez parcourir pas à pas le code côté serveur.

- **Problèmes avec les outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération que l'outil effectue.
  - Pour `run_shell_command`, vérifiez que la commande fonctionne directement dans votre shell en premier lieu.
  - Pour les _outils du système de fichiers_, vérifiez que les chemins sont corrects et contrôlez les permissions.

- **Vérifications préalables :**
  - Exécutez toujours `npm run preflight` avant de valider le code. Cela peut détecter de nombreux problèmes courants liés au formatage, à l'analyse syntaxique et aux erreurs de type.

## Problèmes GitHub existants similaires aux vôtres ou création de nouveaux problèmes

Si vous rencontrez un problème qui n'est pas couvert ici dans ce _Guide de dépannage_, pensez à consulter le [suivi des problèmes de Qwen Code sur GitHub](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez pas de problème similaire au vôtre, envisagez de créer un nouveau problème GitHub avec une description détaillée. Les pull requests sont également les bienvenues !