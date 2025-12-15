# Dépannage

Ce guide fournit des solutions aux problèmes courants et des conseils de débogage, incluant les sujets suivants :

- Erreurs d'authentification ou de connexion
- Foire aux questions (FAQ)
- Conseils de débogage
- Problèmes GitHub existants similaires au vôtre ou création de nouveaux problèmes

## Erreurs d'authentification ou de connexion

- **Erreur : `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` ou `unable to get local issuer certificate`**
  - **Cause :** Vous pouvez être sur un réseau d'entreprise avec un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu'un certificat d'autorité de certification racine personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d'environnement `NODE_EXTRA_CA_CERTS` avec le chemin absolu vers votre fichier de certificat d'autorité de certification racine d'entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/chemin/vers/votre/corporate-ca.crt`

- **Problème : Impossible d'afficher l'interface utilisateur après un échec d'authentification**
  - **Cause :** Si l'authentification échoue après avoir sélectionné un type d'authentification, le paramètre `security.auth.selectedType` peut être persisté dans `settings.json`. Au redémarrage, l'interface en ligne de commande peut rester bloquée en essayant de s'authentifier avec le type d'authentification ayant échoué et ne pas afficher l'interface utilisateur.
  - **Solution :** Effacez l'élément de configuration `security.auth.selectedType` dans votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres spécifiques au projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez l'interface en ligne de commande pour lui permettre de demander à nouveau l'authentification

## Foire aux questions (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**
  - R : Si vous l'avez installé globalement via `npm`, mettez-le à jour en utilisant la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l'avez compilé depuis les sources, récupérez les dernières modifications du dépôt, puis reconstruisez-le en utilisant la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.

    Référez-vous à [Configuration de Qwen Code](/users/configuration/settings) pour plus de détails.

- **Q : Pourquoi ne vois-je pas les comptes de jetons mis en cache dans la sortie des statistiques ?**
  - R : Les informations sur les jetons mis en cache ne s'affichent que lorsque des jetons mis en cache sont utilisés. Cette fonctionnalité est disponible pour les utilisateurs avec clé API (clé API Qwen ou Google Cloud Vertex AI) mais pas pour les utilisateurs OAuth (comme les comptes personnels/entreprise Google tels que Google Gmail ou Google Workspace). Cela est dû au fait que l'API Qwen Code Assist ne prend pas en charge la création de contenu mis en cache. Vous pouvez néanmoins consulter votre utilisation totale de jetons en utilisant la commande `/stats`.

## Messages d'erreur courants et solutions

- **Erreur : `EADDRINUSE` (Adresse déjà utilisée) lors du démarrage d'un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port sur lequel le serveur MCP tente de se lier.
  - **Solution :**
    Arrêtez l'autre processus qui utilise le port ou configurez le serveur MCP pour utiliser un port différent.

- **Erreur : Commande introuvable (lorsque vous tentez d'exécuter Qwen Code avec `qwen`).**
  - **Cause :** L'interface en ligne de commande n'est pas correctement installée ou elle n'est pas dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la façon dont vous avez installé Qwen Code :
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire des binaires globaux de `npm` est dans votre `PATH`. Vous pouvez effectuer une mise à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` depuis les sources, assurez-vous d'utiliser la bonne commande pour l'invoquer (par exemple `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications depuis le dépôt, puis reconstruisez avec la commande `npm run build`.

- **Erreur : `MODULE_NOT_FOUND` ou erreurs d'importation.**
  - **Cause :** Les dépendances ne sont pas installées correctement, ou le projet n'a pas été construit.
  - **Solution :**
    1. Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2. Exécutez `npm run build` pour compiler le projet.
    3. Vérifiez que la construction s'est terminée avec succès avec `npm run start`.

- **Erreur : "Opération non autorisée", "Permission refusée", ou similaire.**
  - **Cause :** Lorsque le bac à sable est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de bac à sable, comme écrire en dehors du répertoire du projet ou du répertoire temporaire du système.
  - **Solution :** Reportez-vous à la documentation [Configuration : Bac à sable](/users/features/sandbox) pour plus d'informations, notamment sur la personnalisation de votre configuration de bac à sable.

- **Qwen Code ne s'exécute pas en mode interactif dans les environnements "CI"**
  - **Problème :** Qwen Code n'entre pas en mode interactif (aucune invite n'apparaît) si une variable d'environnement commençant par `CI_` (par exemple `CI_TOKEN`) est définie. Cela est dû au fait que le paquet `is-in-ci`, utilisé par le framework d'interface sous-jacent, détecte ces variables et suppose un environnement CI non interactif.
  - **Cause :** Le paquet `is-in-ci` vérifie la présence de `CI`, `CONTINUOUS_INTEGRATION`, ou toute variable d'environnement préfixée par `CI_`. Lorsque l'une d'elles est trouvée, cela signale que l'environnement est non interactif, ce qui empêche l'interface en ligne de commande de démarrer en mode interactif.
  - **Solution :** Si la variable préfixée par `CI_` n'est pas nécessaire au fonctionnement de l'interface, vous pouvez la désactiver temporairement pour la commande. Par exemple : `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas depuis le fichier .env du projet**
  - **Problème :** Définir `DEBUG=true` dans le fichier `.env` d'un projet n'active pas le mode débogage pour l'interface en ligne de commande.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` du projet afin d'éviter toute interférence avec le comportement de l'interface.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre `settings.json` pour exclure moins de variables.

## Le compagnon IDE ne se connecte pas

- Assurez-vous que VS Code a un seul dossier d'espace de travail ouvert.
- Redémarrez le terminal intégré après avoir installé l'extension pour qu'il hérite de :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez dans un conteneur, vérifiez que `host.docker.internal` est résolu. Sinon, mappez l'hôte de manière appropriée.
- Réinstallez le compagnon avec `/ide install` et utilisez « Qwen Code : Run » dans la palette de commandes pour vérifier qu'il se lance.

## Codes de sortie

Qwen Code utilise des codes de sortie spécifiques pour indiquer la raison de l'arrêt. Cela est particulièrement utile pour les scripts et l'automatisation.

| Code de sortie | Type d'erreur              | Description                                                  |
| -------------- | -------------------------- | ------------------------------------------------------------ |
| 41             | `FatalAuthenticationError` | Une erreur s'est produite pendant le processus d'authentification. |
| 42             | `FatalInputError`          | Une entrée invalide ou manquante a été fournie à l'interface CLI. (mode non interactif uniquement) |
| 44             | `FatalSandboxError`        | Une erreur s'est produite avec l'environnement de bac à sable (par exemple, Docker, Podman ou Seatbelt). |
| 52             | `FatalConfigError`         | Un fichier de configuration (`settings.json`) est invalide ou contient des erreurs. |
| 53             | `FatalTurnLimitedError`    | Le nombre maximal de tours conversationnels pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage CLI :**
  - Utilisez le drapeau `--verbose` (si disponible) avec les commandes CLI pour obtenir une sortie plus détaillée.
  - Consultez les journaux CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l'utilisateur.

- **Débogage du cœur :**
  - Vérifiez la sortie de la console du serveur pour les messages d'erreur ou les traces de pile.
  - Augmentez la verbosité des journaux si c'est configurable.
  - Utilisez les outils de débogage Node.js (par exemple `node --inspect`) si vous devez parcourir le code côté serveur pas à pas.

- **Problèmes d'outils :**
  - Si un outil spécifique échoue, essayez d'isoler le problème en exécutant la version la plus simple possible de la commande ou de l'opération effectuée par l'outil.
  - Pour `run_shell_command`, vérifiez d'abord que la commande fonctionne directement dans votre shell.
  - Pour les _outils du système de fichiers_, assurez-vous que les chemins sont corrects et vérifiez les permissions.

- **Vérifications préalables :**
  - Exécutez toujours `npm run preflight` avant de valider le code. Cela peut détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Problèmes GitHub existants similaires au vôtre ou création de nouveaux problèmes

Si vous rencontrez un problème qui n'est pas couvert ici dans ce _guide de dépannage_, envisagez de rechercher dans le [suivi des problèmes de Qwen Code sur GitHub](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez pas de problème similaire au vôtre, envisagez de créer un nouveau problème GitHub avec une description détaillée. Les pull requests sont également les bienvenues !