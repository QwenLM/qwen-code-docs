# Dépannage

Ce guide fournit des solutions aux problèmes courants ainsi que des conseils pour le débogage, notamment sur les sujets suivants :

- Erreurs d’authentification ou de connexion
- Questions fréquemment posées (FAQ)
- Conseils pour le débogage
- Problèmes GitHub existants similaires au vôtre ou création de nouveaux problèmes

## Erreurs d’authentification ou de connexion

- **Erreur : `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou `unable to get local issuer certificate`**
  - **Cause :** Vous êtes probablement sur un réseau d’entreprise doté d’un pare-feu qui intercepte et inspecte le trafic SSL/TLS. Cela nécessite souvent qu’un certificat racine CA personnalisé soit approuvé par Node.js.
  - **Solution :** Définissez la variable d’environnement `NODE_EXTRA_CA_CERTS` avec le chemin absolu vers votre fichier de certificat racine CA entreprise.
    - Exemple : `export NODE_EXTRA_CA_CERTS=/chemin/vers/votre/corporate-ca.crt`

- **Erreur : `Device authorization flow failed: fetch failed`**
  - **Cause :** Node.js n’a pas pu accéder aux points de terminaison OAuth de Qwen (souvent en raison d’un problème de proxy ou de confiance SSL/TLS). Lorsqu’elle est disponible, Qwen Code affiche également la cause sous-jacente de l’erreur (par exemple : `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - **Solution :**
    - Vérifiez que vous pouvez accéder à `https://chat.qwen.ai` depuis la même machine ou le même réseau.
    - Si vous utilisez un proxy, configurez-le via `qwen --proxy <url>` (ou via le paramètre `proxy` dans le fichier `settings.json`).
    - Si votre réseau utilise une autorité de certification (CA) d’inspection TLS entreprise, définissez `NODE_EXTRA_CA_CERTS` comme décrit ci-dessus.

- **Problème : Impossible d’afficher l’interface utilisateur après une erreur d’authentification**
  - **Cause :** Si l’authentification échoue après avoir sélectionné un type d’authentification, le paramètre `security.auth.selectedType` peut être conservé dans le fichier `settings.json`. Au redémarrage, l’interface CLI peut alors rester bloquée en tentant de s’authentifier avec ce type d’authentification ayant échoué, sans parvenir à afficher l’interface utilisateur.
  - **Solution :** Supprimez l’élément de configuration `security.auth.selectedType` de votre fichier `settings.json` :
    - Ouvrez `~/.qwen/settings.json` (ou `./.qwen/settings.json` pour les paramètres propres à un projet)
    - Supprimez le champ `security.auth.selectedType`
    - Redémarrez l’interface CLI afin qu’elle vous invite à nouveau à choisir une méthode d’authentification

## Questions fréquemment posées (FAQ)

- **Q : Comment mettre à jour Qwen Code vers la dernière version ?**  
  - R : Si vous l’avez installé globalement via `npm`, mettez-le à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`. Si vous l’avez compilé depuis les sources, récupérez les dernières modifications depuis le dépôt, puis reconstruisez-le à l’aide de la commande `npm run build`.

- **Q : Où sont stockés les fichiers de configuration ou de paramètres de Qwen Code ?**  
  - R : La configuration de Qwen Code est stockée dans deux fichiers `settings.json` :  
    1. Dans votre répertoire personnel : `~/.qwen/settings.json`.  
    2. Dans le répertoire racine de votre projet : `./.qwen/settings.json`.  

    Pour plus de détails, consultez la page [Configuration de Qwen Code](../configuration/settings).

- **Q : Pourquoi les nombres de jetons mis en cache n’apparaissent-ils pas dans ma sortie de statistiques ?**  
  - R : Les informations sur les jetons mis en cache ne sont affichées que lorsque des jetons mis en cache sont effectivement utilisés. Cette fonctionnalité est disponible pour les utilisateurs de clés API (clé API Qwen ou Google Cloud Vertex AI), mais pas pour les utilisateurs OAuth (tels que les comptes Google Personnels/Entreprise, par exemple Gmail ou Google Workspace). En effet, l’API Qwen Code Assist ne prend pas en charge la création de contenu mis en cache. Vous pouvez toutefois consulter votre utilisation totale de jetons à l’aide de la commande `/stats`.

## Messages d’erreur courants et solutions

- **Erreur : `EADDRINUSE` (Adresse déjà utilisée) lors du démarrage d’un serveur MCP.**
  - **Cause :** Un autre processus utilise déjà le port auquel le serveur MCP tente de se lier.
  - **Solution :**
    Soit arrêtez l’autre processus utilisant ce port, soit configurez le serveur MCP pour utiliser un port différent.

- **Erreur : Commande introuvable (lors de la tentative d’exécution de Qwen Code avec `qwen`).**
  - **Cause :** L’interface en ligne de commande (CLI) n’est pas correctement installée ou n’est pas présente dans le `PATH` de votre système.
  - **Solution :**
    La mise à jour dépend de la méthode d’installation de Qwen Code :
    - Si vous avez installé `qwen` globalement, vérifiez que le répertoire des binaires globaux de `npm` est bien présent dans votre `PATH`. Vous pouvez effectuer la mise à jour avec la commande `npm install -g @qwen-code/qwen-code@latest`.
    - Si vous exécutez `qwen` depuis le code source, assurez-vous d’utiliser la bonne commande pour l’appeler (par exemple `node packages/cli/dist/index.js ...`). Pour mettre à jour, récupérez les dernières modifications depuis le dépôt, puis reconstruisez le projet avec la commande `npm run build`.

- **Erreur : `MODULE_NOT_FOUND` ou erreurs d’importation.**
  - **Cause :** Les dépendances ne sont pas correctement installées, ou le projet n’a pas été construit.
  - **Solution :**
    1. Exécutez `npm install` pour vous assurer que toutes les dépendances sont présentes.
    2. Exécutez `npm run build` pour compiler le projet.
    3. Vérifiez que la construction s’est terminée avec succès à l’aide de la commande `npm run start`.

- **Erreur : « Opération non autorisée », « Accès refusé » ou similaire.**
  - **Cause :** Lorsque le bac à sable (sandboxing) est activé, Qwen Code peut tenter des opérations restreintes par votre configuration de bac à sable, comme l’écriture en dehors du répertoire du projet ou du répertoire temporaire système.
  - **Solution :** Reportez-vous à la documentation [Configuration : Bac à sable](../features/sandbox) pour plus d’informations, notamment sur la façon de personnaliser votre configuration de bac à sable.

- **Qwen Code ne s’exécute pas en mode interactif dans les environnements « CI »**
  - **Problème :** Qwen Code n’entre pas en mode interactif (aucune invite n’apparaît) si une variable d’environnement commençant par `CI_` (par exemple `CI_TOKEN`) est définie. En effet, le package `is-in-ci`, utilisé par le framework d’interface sous-jacent, détecte ces variables et suppose qu’il s’agit d’un environnement CI non interactif.
  - **Cause :** Le package `is-in-ci` vérifie la présence de la variable `CI`, de `CONTINUOUS_INTEGRATION`, ou de toute variable d’environnement dont le nom commence par le préfixe `CI_`. Dès que l’une de ces variables est détectée, il considère que l’environnement est non interactif, empêchant ainsi la CLI de démarrer en mode interactif.
  - **Solution :** Si la variable d’environnement préfixée par `CI_` n’est pas nécessaire au fonctionnement de la CLI, vous pouvez la désactiver temporairement pour cette commande. Par exemple : `env -u CI_TOKEN qwen`

- **Le mode DEBUG ne fonctionne pas à partir du fichier `.env` du projet**
  - **Problème :** Définir `DEBUG=true` dans le fichier `.env` d’un projet n’active pas le mode débogage pour la CLI.
  - **Cause :** Les variables `DEBUG` et `DEBUG_MODE` sont automatiquement exclues des fichiers `.env` de projet afin d’éviter toute interférence avec le comportement de la CLI.
  - **Solution :** Utilisez plutôt un fichier `.qwen/.env`, ou configurez le paramètre `advanced.excludedEnvVars` dans votre fichier `settings.json` pour exclure moins de variables.

## Le compagnon IDE ne parvient pas à se connecter

- Assurez-vous que VS Code a un seul dossier d’espace de travail ouvert.
- Redémarrez le terminal intégré après avoir installé l’extension afin qu’il en hérite :
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Si vous exécutez l’application dans un conteneur, vérifiez que `host.docker.internal` est résolu. Sinon, mappez correctement l’hôte.
- Réinstallez le compagnon avec la commande `/ide install`, puis utilisez « Qwen Code : Exécuter » dans la palette de commandes pour vérifier qu’il démarre correctement.

## Codes de sortie

Qwen Code utilise des codes de sortie spécifiques pour indiquer la raison de son arrêt. Cela est particulièrement utile pour les scripts et l’automatisation.

| Code de sortie | Type d’erreur                   | Description                                                                                         |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| 41             | `FatalAuthenticationError`        | Une erreur s’est produite pendant le processus d’authentification.                                |
| 42             | `FatalInputError`                 | Une entrée invalide ou manquante a été fournie à l’interface en ligne de commande (CLI). (mode non interactif uniquement) |
| 44             | `FatalSandboxError`               | Une erreur s’est produite avec l’environnement de bac à sable (par exemple Docker, Podman ou Seatbelt). |
| 52             | `FatalConfigError`                | Le fichier de configuration (`settings.json`) est invalide ou contient des erreurs.                 |
| 53             | `FatalTurnLimitedError`           | Le nombre maximal de tours de conversation pour la session a été atteint. (mode non interactif uniquement) |

## Conseils de débogage

- **Débogage de l’interface en ligne de commande (CLI) :**
  - Utilisez l’indicateur `--verbose` (si disponible) avec les commandes CLI pour obtenir une sortie plus détaillée.
  - Consultez les journaux de la CLI, souvent situés dans un répertoire de configuration ou de cache spécifique à l’utilisateur.

- **Débogage du cœur de l’application :**
  - Vérifiez la sortie de la console du serveur pour repérer les messages d’erreur ou les traces de pile.
  - Augmentez le niveau de verbosité des journaux si cela est configurable.
  - Utilisez les outils de débogage de Node.js (par exemple `node --inspect`) si vous devez exécuter pas à pas le code côté serveur.

- **Problèmes liés aux outils :**
  - Si un outil particulier échoue, tentez d’isoler le problème en exécutant la version la plus simple possible de la commande ou de l’opération qu’il effectue.
  - Pour `run_shell_command`, vérifiez d’abord que la commande fonctionne correctement directement dans votre interpréteur de commandes.
  - Pour les _outils système de fichiers_, assurez-vous que les chemins sont corrects et vérifiez les autorisations.

- **Vérifications préalables au déploiement (« pre-flight ») :**
  - Exécutez toujours `npm run preflight` avant de valider du code. Cette commande permet de détecter de nombreux problèmes courants liés au formatage, au linting et aux erreurs de type.

## Problèmes GitHub existants similaires au vôtre ou création de nouveaux problèmes

Si vous rencontrez un problème non traité dans ce _guide de dépannage_, envisagez de rechercher dans le [suivi des problèmes Qwen Code sur GitHub](https://github.com/QwenLM/qwen-code/issues). Si vous ne trouvez aucun problème similaire au vôtre, créez un nouveau problème GitHub avec une description détaillée. Les demandes d’intégration (pull requests) sont également les bienvenues !