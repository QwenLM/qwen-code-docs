# Serveurs MCP avec Qwen Code

Ce document fournit un guide pour configurer et utiliser les serveurs Model Context Protocol (MCP) avec Qwen Code.

## Qu'est-ce qu'un serveur MCP ?

Un serveur MCP est une application qui expose des outils et des ressources au CLI via le Model Context Protocol, lui permettant d'interagir avec des systèmes externes et des sources de données. Les serveurs MCP font office de pont entre le modèle et votre environnement local ou d'autres services comme les API.

Un serveur MCP permet au CLI de :

- **Découvrir des outils :** Lister les outils disponibles, leurs descriptions et leurs paramètres via des définitions de schéma standardisées.
- **Exécuter des outils :** Appeler des outils spécifiques avec des arguments définis et recevoir des réponses structurées.
- **Accéder à des ressources :** Lire des données depuis des ressources spécifiques (bien que le CLI se concentre principalement sur l'exécution d'outils).

Avec un serveur MCP, vous pouvez étendre les capacités du CLI pour effectuer des actions au-delà de ses fonctionnalités intégrées, comme interagir avec des bases de données, des API, des scripts personnalisés ou des workflows spécialisés.

## Architecture d'intégration principale

Qwen Code s'intègre aux serveurs MCP via un système sophistiqué de découverte et d'exécution intégré au package principal (`packages/core/src/tools/`) :

### Couche de découverte (`mcp-client.ts`)

Le processus de découverte est orchestré par `discoverMcpTools()`, qui :

1. **Parcourt les serveurs configurés** depuis votre configuration `mcpServers` dans `settings.json`
2. **Établit des connexions** en utilisant les mécanismes de transport appropriés (Stdio, SSE ou Streamable HTTP)
3. **Récupère les définitions d'outils** de chaque serveur via le protocole MCP
4. **Nettoie et valide** les schémas d'outils pour assurer la compatibilité avec l'API Qwen
5. **Enregistre les outils** dans le registre global d'outils avec résolution des conflits

### Couche d'exécution (`mcp-tool.ts`)

Chaque outil MCP découvert est encapsulé dans une instance `DiscoveredMCPTool` qui :

- **Gère la logique de confirmation** en fonction des paramètres de confiance du serveur et des préférences de l'utilisateur
- **Gère l'exécution des outils** en appelant le serveur MCP avec les paramètres appropriés
- **Traite les réponses** pour le contexte du LLM et l'affichage utilisateur
- **Maintient l'état de la connexion** et gère les délais d'expiration

### Mécanismes de transport

Le CLI prend en charge trois types de transport MCP :

- **Transport Stdio :** Lance un sous-processus et communique via stdin/stdout
- **Transport SSE :** Se connecte aux points de terminaison Server-Sent Events
- **Transport Streamable HTTP :** Utilise le streaming HTTP pour la communication

## Comment configurer votre serveur MCP

Qwen Code utilise la configuration `mcpServers` de votre fichier `settings.json` pour localiser et se connecter aux serveurs MCP. Cette configuration prend en charge plusieurs serveurs avec différents mécanismes de transport.

### Configurer le serveur MCP dans settings.json

Vous pouvez configurer les serveurs MCP dans votre fichier `settings.json` de deux manières principales : via l'objet `mcpServers` de premier niveau pour les définitions de serveurs spécifiques, et via l'objet `mcp` pour les paramètres globaux qui contrôlent la découverte et l'exécution des serveurs.

#### Paramètres MCP globaux (`mcp`)

L'objet `mcp` dans votre `settings.json` vous permet de définir des règles globales pour tous les serveurs MCP.

- **`mcp.serverCommand`** (string) : Une commande globale pour démarrer un serveur MCP.
- **`mcp.allowed`** (array of strings) : Une liste de noms de serveurs MCP à autoriser. Si défini, seuls les serveurs de cette liste (correspondant aux clés de l'objet `mcpServers`) seront connectés.
- **`mcp.excluded`** (array of strings) : Une liste de noms de serveurs MCP à exclure. Les serveurs de cette liste ne seront pas connectés.

**Exemple :**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### Configuration spécifique au serveur (`mcpServers`)

L'objet `mcpServers` est l'endroit où vous définissez chaque serveur MCP individuel auquel vous souhaitez que le CLI se connecte.

### Structure de configuration

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
{ ...file contains other config objects
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### Propriétés de configuration

Chaque configuration de serveur prend en charge les propriétés suivantes :

#### Requis (l'un des suivants)

- **`command`** (string) : Chemin vers l'exécutable pour le transport Stdio
- **`url`** (string) : URL du point de terminaison SSE (ex. : `"http://localhost:8080/sse"`)
- **`httpUrl`** (string) : URL du point de terminaison de streaming HTTP

#### Facultatif

- **`args`** (string[]) : Arguments de ligne de commande pour le transport Stdio
- **`headers`** (object) : En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`
- **`env`** (object) : Variables d'environnement pour le processus serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string) : Répertoire de travail pour le transport Stdio
- **`timeout`** (number) : Délai d'expiration de la requête en millisecondes (par défaut : 600 000 ms = 10 minutes)
- **`trust`** (boolean) : Lorsque `true`, ignore toutes les confirmations d'appel d'outil pour ce serveur (par défaut : `false`)
- **`includeTools`** (string[]) : Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsqu'elle est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste d'autorisation). Si non spécifiée, tous les outils du serveur sont activés par défaut.
- **`excludeTools`** (string[]) : Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Remarque :** `excludeTools` a priorité sur `includeTools` - si un outil figure dans les deux listes, il sera exclu.
- **`targetAudience`** (string) : L'ID client OAuth autorisé sur l'application protégée par IAP que vous essayez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string) : L'adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.

### Prise en charge d'OAuth pour les serveurs MCP distants

Qwen Code prend en charge l'authentification OAuth 2.0 pour les serveurs MCP distants utilisant les transports SSE ou HTTP. Cela permet un accès sécurisé aux serveurs MCP nécessitant une authentification.

#### Découverte automatique d'OAuth

Pour les serveurs prenant en charge la découverte OAuth, vous pouvez omettre la configuration OAuth et laisser le CLI la découvrir automatiquement :

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

Le CLI effectuera automatiquement :

- Détecter quand un serveur nécessite une authentification OAuth (réponses 401)
- Découvrir les points de terminaison OAuth depuis les métadonnées du serveur
- Effectuer l'enregistrement dynamique du client si pris en charge
- Gérer le flux OAuth et la gestion des tokens

#### Flux d'authentification

Lors de la connexion à un serveur activé pour OAuth :

1. **La tentative de connexion initiale** échoue avec une erreur 401 Unauthorized
2. **La découverte OAuth** trouve les points de terminaison d'autorisation et de token
3. **Le navigateur s'ouvre** pour l'authentification de l'utilisateur (nécessite un accès local au navigateur)
4. **Le code d'autorisation** est échangé contre des tokens d'accès
5. **Les tokens sont stockés** de manière sécurisée pour une utilisation future
6. **La nouvelle tentative de connexion** réussit avec des tokens valides

#### Exigences de redirection du navigateur

**Important :** L'authentification OAuth nécessite que l'URI de redirection soit accessible :

- **Comportement par défaut** : Redirige vers `http://localhost:7777/oauth/callback` (fonctionne pour les configurations locales)
- **URI de redirection personnalisé** : Utilisez `--oauth-redirect-uri` ou configurez `redirectUri` dans settings.json pour spécifier une autre URL

Pour les **déploiements de serveurs distants/cloud** (ex. : terminaux web, sessions SSH, IDE cloud) :

- La redirection `localhost` par défaut NE FONCTIONNERA PAS
- Vous DEVEZ configurer un `redirectUri` personnalisé pointant vers une URL accessible publiquement
- Le navigateur de l'utilisateur doit pouvoir atteindre cette URL et rediriger vers le serveur

Exemple pour les serveurs distants :

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth ne fonctionnera pas dans :

- Les environnements headless sans accès au navigateur
- Les environnements où le `redirectUri` configuré est inaccessible depuis le navigateur de l'utilisateur

#### Gestion de l'authentification OAuth

Utilisez la commande `/mcp auth` pour gérer l'authentification OAuth :

```bash
# List servers requiring authentication
/mcp auth

# Authenticate with a specific server
/mcp auth serverName

# Re-authenticate if tokens expire
/mcp auth serverName
```

#### Propriétés de configuration OAuth

- **`enabled`** (boolean) : Active OAuth pour ce serveur
- **`clientId`** (string) : Identifiant client OAuth (facultatif avec l'enregistrement dynamique)
- **`clientSecret`** (string) : Secret client OAuth (facultatif pour les clients publics)
- **`authorizationUrl`** (string) : Point de terminaison d'autorisation OAuth (découvert automatiquement si omis)
- **`tokenUrl`** (string) : Point de terminaison de token OAuth (découvert automatiquement si omis)
- **`scopes`** (string[]) : Scopes OAuth requis
- **`redirectUri`** (string) : URI de redirection personnalisé. **Critique pour les déploiements distants** : Par défaut `http://localhost:7777/oauth/callback`. Lors de l'exécution de Qwen Code sur des serveurs distants/cloud, définissez-le sur une URL accessible publiquement (ex. : `https://your-server.com/oauth/callback`). Peut être configuré via `qwen mcp add --oauth-redirect-uri` ou directement dans settings.json.
- **`tokenParamName`** (string) : Nom du paramètre de requête pour les tokens dans les URL SSE
- **`audiences`** (string[]) : Audiences pour lesquelles le token est valide

#### Gestion des tokens

Les tokens OAuth sont automatiquement :

- **Stockés de manière sécurisée** dans `~/.qwen/mcp-oauth-tokens.json`
- **Actualisés** à l'expiration (si des tokens d'actualisation sont disponibles)
- **Validés** avant chaque tentative de connexion
- **Nettoyés** lorsqu'ils sont invalides ou expirés

#### Type de fournisseur d'authentification

Vous pouvez spécifier le type de fournisseur d'authentification en utilisant la propriété `authProviderType` :

- **`authProviderType`** (string) : Spécifie le fournisseur d'authentification. Peut être l'un des suivants :
  - **`dynamic_discovery`** (par défaut) : Le CLI découvrira automatiquement la configuration OAuth depuis le serveur.
  - **`google_credentials`** : Le CLI utilisera les Google Application Default Credentials (ADC) pour s'authentifier auprès du serveur. Lors de l'utilisation de ce fournisseur, vous devez spécifier les scopes requis.
  - **`service_account_impersonation`** : Le CLI usurpera l'identité d'un compte de service Google Cloud pour s'authentifier auprès du serveur. Cela est utile pour accéder aux services protégés par IAP (conçu spécifiquement pour les services Cloud Run).

#### Identifiants Google

```json
{
  "mcpServers": {
    "googleCloudServer": {
      "httpUrl": "https://my-gcp-service.run.app/mcp",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
      }
    }
  }
}
```

#### Usurpation d'identité de compte de service

Pour vous authentifier auprès d'un serveur en utilisant l'usurpation d'identité de compte de service, vous devez définir `authProviderType` sur `service_account_impersonation` et fournir les propriétés suivantes :

- **`targetAudience`** (string) : L'ID client OAuth autorisé sur l'application protégée par IAP que vous essayez d'accéder.
- **`targetServiceAccount`** (string) : L'adresse e-mail du compte de service Google Cloud à usurper.

Le CLI utilisera vos Application Default Credentials (ADC) locaux pour générer un token d'identité OIDC pour le compte de service et l'audience spécifiés. Ce token sera ensuite utilisé pour s'authentifier auprès du serveur MCP.

#### Instructions de configuration

1. **[Créez](https://cloud.google.com/iap/docs/oauth-client-creation) ou utilisez un ID client OAuth 2.0 existant.** Pour utiliser un ID client OAuth 2.0 existant, suivez les étapes de [Comment partager des clients OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Ajoutez l'ID OAuth à la liste d'autorisation pour [l'accès programmatique](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) de l'application.** Cloud Run n'étant pas encore un type de ressource pris en charge dans `gcloud iap`, vous devez autoriser l'ID client au niveau du projet.
3. **Créez un compte de service.** [Documentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Lien Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Ajoutez le compte de service et les utilisateurs à la politique IAP** dans l'onglet "Security" du service Cloud Run lui-même ou via gcloud.
5. **Accordez à tous les utilisateurs et groupes** qui accéderont au serveur MCP les autorisations nécessaires pour [usurper l'identité du compte de service](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (c.-à-d. `roles/iam.serviceAccountTokenCreator`).
6. **[Activez](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) l'API IAM Credentials** pour votre projet.

### Exemples de configurations

#### Serveur MCP Python (Stdio)

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

#### Serveur MCP Node.js (Stdio)

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["dist/server.js", "--verbose"],
      "cwd": "./mcp-servers/node",
      "trust": true
    }
  }
}
```

#### Serveur MCP basé sur Docker

```json
{
  "mcpServers": {
    "dockerizedServer": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "API_KEY",
        "-v",
        "${PWD}:/workspace",
        "my-mcp-server:latest"
      ],
      "env": {
        "API_KEY": "$EXTERNAL_SERVICE_TOKEN"
      }
    }
  }
}
```

#### Serveur MCP basé sur HTTP

```json
{
  "mcpServers": {
    "httpServer": {
      "httpUrl": "http://localhost:3000/mcp",
      "timeout": 5000
    }
  }
}
```

#### Serveur MCP basé sur HTTP avec en-têtes personnalisés

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token",
        "X-Custom-Header": "custom-value",
        "Content-Type": "application/json"
      },
      "timeout": 5000
    }
  }
}
```

#### Serveur MCP avec filtrage d'outils

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      // "excludeTools": ["dangerous_tool", "file_deleter"],
      "timeout": 30000
    }
  }
}
```

### Serveur MCP SSE avec usurpation de compte de service

```json
{
  "mcpServers": {
    "myIapProtectedServer": {
      "url": "https://my-iap-service.run.app/sse",
      "authProviderType": "service_account_impersonation",
      "targetAudience": "YOUR_IAP_CLIENT_ID.apps.googleusercontent.com",
      "targetServiceAccount": "your-sa@your-project.iam.gserviceaccount.com"
    }
  }
}
```

## Analyse approfondie du processus de découverte

Lorsque Qwen Code démarre, il effectue la découverte des serveurs MCP via le processus détaillé suivant :

### 1. Itération et connexion des serveurs

Pour chaque serveur configuré dans `mcpServers` :

1. **Le suivi de l'état commence :** L'état du serveur est défini sur `CONNECTING`
2. **Sélection du transport :** En fonction des propriétés de configuration :
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Établissement de la connexion :** Le client MCP tente de se connecter avec le délai d'expiration configuré
4. **Gestion des erreurs :** Les échecs de connexion sont journalisés et l'état du serveur est défini sur `DISCONNECTED`

### 2. Découverte des outils

Après une connexion réussie :

1. **Liste des outils :** Le client appelle le point de terminaison de liste d'outils du serveur MCP
2. **Validation du schéma :** La déclaration de fonction de chaque outil est validée
3. **Filtrage des outils :** Les outils sont filtrés en fonction de la configuration `includeTools` et `excludeTools`
4. **Nettoyage des noms :** Les noms d'outils sont nettoyés pour répondre aux exigences de l'API Qwen :
   - Les caractères invalides (non alphanumériques, tiret bas, point, tiret) sont remplacés par des tirets bas
   - Les noms de plus de 63 caractères sont tronqués avec un remplacement au milieu (`___`)

### 3. Résolution des conflits

Lorsque plusieurs serveurs exposent des outils portant le même nom :

1. **Le premier enregistrement gagne :** Le premier serveur à enregistrer un nom d'outil obtient le nom sans préfixe
2. **Préfixage automatique :** Les serveurs suivants obtiennent des noms préfixés : `serverName__toolName`
3. **Suivi du registre :** Le registre d'outils maintient les correspondances entre les noms de serveurs et leurs outils

### 4. Traitement des schémas

Les schémas de paramètres d'outils subissent un nettoyage pour la compatibilité avec l'API :

- **Les propriétés `$schema`** sont supprimées
- **`additionalProperties`** est supprimé
- **`anyOf` avec `default`** voient leurs valeurs par défaut supprimées (compatibilité Vertex AI)
- **Le traitement récursif** s'applique aux schémas imbriqués

### 5. Gestion des connexions

Après la découverte :

- **Connexions persistantes :** Les serveurs qui enregistrent des outils avec succès maintiennent leurs connexions
- **Nettoyage :** Les serveurs qui ne fournissent aucun outil utilisable voient leurs connexions fermées
- **Mises à jour d'état :** Les états finaux des serveurs sont définis sur `CONNECTED` ou `DISCONNECTED`

## Flux d'exécution des outils

Lorsque le modèle décide d'utiliser un outil MCP, le flux d'exécution suivant se produit :

### 1. Invocation de l'outil

Le modèle génère un `FunctionCall` avec :

- **Nom de l'outil :** Le nom enregistré (éventuellement préfixé)
- **Arguments :** Objet JSON correspondant au schéma de paramètres de l'outil

### 2. Processus de confirmation

Chaque `DiscoveredMCPTool` implémente une logique de confirmation sophistiquée :

#### Bypass basé sur la confiance

```typescript
if (this.trust) {
  return false; // No confirmation needed
}
```

#### Liste d'autorisation dynamique

Le système maintient des listes d'autorisation internes pour :

- **Niveau serveur :** `serverName` → Tous les outils de ce serveur sont considérés comme fiables
- **Niveau outil :** `serverName.toolName` → Cet outil spécifique est considéré comme fiable

#### Gestion des choix de l'utilisateur

Lorsqu'une confirmation est requise, les utilisateurs peuvent choisir :

- **Continuer une fois :** Exécuter uniquement cette fois
- **Toujours autoriser cet outil :** Ajouter à la liste d'autorisation au niveau de l'outil
- **Toujours autoriser ce serveur :** Ajouter à la liste d'autorisation au niveau du serveur
- **Annuler :** Abandonner l'exécution

### 3. Exécution

Après confirmation (ou bypass de confiance) :

1. **Préparation des paramètres :** Les arguments sont validés par rapport au schéma de l'outil
2. **Appel MCP :** Le `CallableTool` sous-jacent invoque le serveur avec :

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Original server tool name
       args: params,
     },
   ];
   ```

3. **Traitement des réponses :** Les résultats sont formatés pour le contexte du LLM et l'affichage utilisateur

### 4. Gestion des réponses

Le résultat d'exécution contient :

- **`llmContent`:** Parties de réponse brutes pour le contexte du modèle de langage
- **`returnDisplay`:** Sortie formatée pour l'affichage utilisateur (souvent du JSON dans des blocs de code markdown)

## Comment interagir avec votre serveur MCP

### Utilisation de la commande `/mcp`

La commande `/mcp` fournit des informations complètes sur la configuration de votre serveur MCP :

```bash
/mcp
```

Cela affiche :

- **Liste des serveurs :** Tous les serveurs MCP configurés
- **État de la connexion :** `CONNECTED`, `CONNECTING` ou `DISCONNECTED`
- **Détails du serveur :** Résumé de la configuration (hors données sensibles)
- **Outils disponibles :** Liste des outils de chaque serveur avec descriptions
- **État de la découverte :** État global du processus de découverte

### Exemple de sortie `/mcp`

```
MCP Servers Status:

📡 pythonTools (CONNECTED)
  Command: python -m my_mcp_server --port 8080
  Working Directory: ./mcp-servers/python
  Timeout: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Command: node dist/server.js --verbose
  Error: Connection refused

🐳 dockerizedServer (CONNECTED)
  Command: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Discovery State: COMPLETED
```

### Utilisation des outils

Une fois découverts, les outils MCP sont disponibles pour le modèle Qwen comme des outils intégrés. Le modèle effectuera automatiquement :

1. **Sélectionner les outils appropriés** en fonction de vos demandes
2. **Présenter des boîtes de dialogue de confirmation** (sauf si le serveur est fiable)
3. **Exécuter les outils** avec les paramètres appropriés
4. **Afficher les résultats** dans un format convivial

## Surveillance de l'état et dépannage

### États de connexion

L'intégration MCP suit plusieurs états :

#### État du serveur (`MCPServerStatus`)

- **`DISCONNECTED`:** Le serveur n'est pas connecté ou présente des erreurs
- **`CONNECTING`:** Tentative de connexion en cours
- **`CONNECTED`:** Le serveur est connecté et prêt

#### État de découverte (`MCPDiscoveryState`)

- **`NOT_STARTED`:** La découverte n'a pas commencé
- **`IN_PROGRESS`:** Découverte des serveurs en cours
- **`COMPLETED`:** Découverte terminée (avec ou sans erreurs)

### Problèmes courants et solutions

#### Le serveur ne se connecte pas

**Symptômes :** Le serveur affiche l'état `DISCONNECTED`

**Dépannage :**

1. **Vérifiez la configuration :** Assurez-vous que `command`, `args` et `cwd` sont corrects
2. **Testez manuellement :** Exécutez directement la commande du serveur pour vérifier qu'elle fonctionne
3. **Vérifiez les dépendances :** Assurez-vous que tous les packages requis sont installés
4. **Consultez les journaux :** Recherchez les messages d'erreur dans la sortie du CLI
5. **Vérifiez les permissions :** Assurez-vous que le CLI peut exécuter la commande du serveur

#### Aucun outil découvert

**Symptômes :** Le serveur se connecte mais aucun outil n'est disponible

**Dépannage :**

1. **Vérifiez l'enregistrement des outils :** Assurez-vous que votre serveur enregistre bien des outils
2. **Vérifiez le protocole MCP :** Confirmez que votre serveur implémente correctement la liste d'outils MCP
3. **Consultez les journaux du serveur :** Vérifiez la sortie stderr pour les erreurs côté serveur
4. **Testez la liste d'outils :** Testez manuellement le point de terminaison de découverte d'outils de votre serveur

#### Les outils ne s'exécutent pas

**Symptômes :** Les outils sont découverts mais échouent lors de l'exécution

**Dépannage :**

1. **Validation des paramètres :** Assurez-vous que votre outil accepte les paramètres attendus
2. **Compatibilité des schémas :** Vérifiez que vos schémas d'entrée sont des JSON Schema valides
3. **Gestion des erreurs :** Vérifiez si votre outil lève des exceptions non gérées
4. **Problèmes de délai d'expiration :** Envisagez d'augmenter le paramètre `timeout`

#### Compatibilité avec le sandbox

**Symptômes :** Les serveurs MCP échouent lorsque le sandboxing est activé

**Solutions :**

1. **Serveurs basés sur Docker :** Utilisez des conteneurs Docker incluant toutes les dépendances
2. **Accessibilité des chemins :** Assurez-vous que les exécutables du serveur sont disponibles dans le sandbox
3. **Accès réseau :** Configurez le sandbox pour autoriser les connexions réseau nécessaires
4. **Variables d'environnement :** Vérifiez que les variables d'environnement requises sont transmises

### Conseils de débogage

1. **Activez le mode debug :** Exécutez le CLI avec `--debug` pour une sortie détaillée
2. **Vérifiez stderr :** Le stderr du serveur MCP est capturé et journalisé (messages INFO filtrés)
3. **Testez en isolation :** Testez votre serveur MCP indépendamment avant de l'intégrer
4. **Configuration progressive :** Commencez par des outils simples avant d'ajouter des fonctionnalités complexes
5. **Utilisez `/mcp` fréquemment :** Surveillez l'état du serveur pendant le développement

## Remarques importantes

### Considérations de sécurité

- **Paramètres de confiance :** L'option `trust` ignore toutes les boîtes de dialogue de confirmation. Utilisez-la avec prudence et uniquement pour les serveurs que vous contrôlez entièrement
- **Tokens d'accès :** Soyez vigilant sur le plan de la sécurité lors de la configuration de variables d'environnement contenant des clés API ou des tokens
- **Compatibilité sandbox :** Lors de l'utilisation du sandboxing, assurez-vous que les serveurs MCP sont disponibles dans l'environnement sandbox
- **Données privées :** L'utilisation de tokens d'accès personnels à large portée peut entraîner des fuites d'informations entre les repositories

### Gestion des performances et des ressources

- **Persistance des connexions :** Le CLI maintient des connexions persistantes avec les serveurs qui enregistrent des outils avec succès
- **Nettoyage automatique :** Les connexions aux serveurs ne fournissant aucun outil sont automatiquement fermées
- **Gestion des délais d'expiration :** Configurez des délais d'expiration appropriés en fonction des caractéristiques de réponse de votre serveur
- **Surveillance des ressources :** Les serveurs MCP s'exécutent en tant que processus distincts et consomment des ressources système

### Compatibilité des schémas

- **Mode de conformité des schémas :** Par défaut (`schemaCompliance: "auto"`), les schémas d'outils sont transmis tels quels. Définissez `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` dans votre `settings.json` pour convertir les modèles au format Strict OpenAPI 3.0.
- **Transformations OpenAPI 3.0 :** Lorsque le mode `openapi_30` est activé, le système gère :
  - Types nullable : `["string", "null"]` -> `type: "string", nullable: true`
  - Valeurs const : `const: "foo"` -> `enum: ["foo"]`
  - Limites exclusives : `exclusiveMinimum` numérique -> forme booléenne avec `minimum`
  - Suppression de mots-clés : `$schema`, `$id`, `dependencies`, `patternProperties`
- **Nettoyage des noms :** Les noms d'outils sont automatiquement nettoyés pour répondre aux exigences de l'API
- **Résolution des conflits :** Les conflits de noms d'outils entre serveurs sont résolus via un préfixage automatique

Cette intégration complète fait des serveurs MCP un moyen puissant d'étendre les capacités du CLI tout en maintenant la sécurité, la fiabilité et la facilité d'utilisation.

## Retourner du contenu riche depuis les outils

Les outils MCP ne se limitent pas au retour de texte simple. Vous pouvez retourner du contenu riche et multi-parties, incluant du texte, des images, de l'audio et d'autres données binaires dans une seule réponse d'outil. Cela vous permet de créer des outils puissants capables de fournir des informations diverses au modèle en un seul tour.

Toutes les données retournées par l'outil sont traitées et envoyées au modèle comme contexte pour sa prochaine génération, lui permettant de raisonner sur ou de résumer les informations fournies.

### Comment ça fonctionne

Pour retourner du contenu riche, la réponse de votre outil doit respecter la spécification MCP pour un [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). Le champ `content` du résultat doit être un tableau d'objets `ContentBlock`. Le CLI traitera correctement ce tableau, en séparant le texte des données binaires et en les conditionnant pour le modèle.

Vous pouvez mélanger différents types de blocs de contenu dans le tableau `content`. Les types de blocs pris en charge incluent :

- `text`
- `image`
- `audio`
- `resource` (contenu intégré)
- `resource_link`

### Exemple : Retourner du texte et une image

Voici un exemple de réponse JSON valide d'un outil MCP qui retourne à la fois une description textuelle et une image :

```json
{
  "content": [
    {
      "type": "text",
      "text": "Here is the logo you requested."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "The logo was created in 2025."
    }
  ]
}
```

Lorsque Qwen Code reçoit cette réponse, il :

1.  Extrait tout le texte et le combine en une seule partie `functionResponse` pour le modèle.
2.  Présente les données de l'image comme une partie `inlineData` distincte.
3.  Fournit un résumé clair et convivial dans le CLI, indiquant que du texte et une image ont été reçus.

Cela vous permet de créer des outils sophistiqués capables de fournir un contexte riche et multimodal au modèle Qwen.

## Prompts MCP en tant que commandes slash

En plus des outils, les serveurs MCP peuvent exposer des prompts prédéfinis qui peuvent être exécutés en tant que commandes slash dans Qwen Code. Cela vous permet de créer des raccourcis pour des requêtes courantes ou complexes qui peuvent être facilement invoquées par leur nom.

### Définir des prompts sur le serveur

Voici un petit exemple de serveur MCP stdio qui définit des prompts :

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

server.registerPrompt(
  'poem-writer',
  {
    title: 'Poem Writer',
    description: 'Write a nice haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a haiku${mood ? ` with the mood ${mood}` : ''} called ${title}. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables `,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Cela peut être inclus dans `settings.json` sous `mcpServers` avec :

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["filename.ts"]
    }
  }
}
```

### Invoquer des prompts

Une fois un prompt découvert, vous pouvez l'invoquer en utilisant son nom comme commande slash. Le CLI gérera automatiquement l'analyse des arguments.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, en utilisant des arguments positionnels :

```bash
/poem-writer "Qwen Code" reverent
```

Lorsque vous exécutez cette commande, le CLI exécute la méthode `prompts/get` sur le serveur MCP avec les arguments fournis. Le serveur est responsable de la substitution des arguments dans le modèle de prompt et du retour du texte final du prompt. Le CLI envoie ensuite ce prompt au modèle pour exécution. Cela offre un moyen pratique d'automatiser et de partager des workflows courants.

## Gérer les serveurs MCP avec `qwen mcp`

Bien que vous puissiez toujours configurer les serveurs MCP en modifiant manuellement votre fichier `settings.json`, le CLI fournit un ensemble pratique de commandes pour gérer vos configurations de serveur par programmation. Ces commandes simplifient le processus d'ajout, de liste et de suppression de serveurs MCP sans avoir besoin de modifier directement des fichiers JSON.

### Ajouter un serveur (`qwen mcp add`)

La commande `add` configure un nouveau serveur MCP dans votre `settings.json`. En fonction du scope (`-s, --scope`), il sera ajouté soit à la configuration utilisateur `~/.qwen/settings.json`, soit à la configuration projet `.qwen/settings.json`.

**Commande :**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>` : Un nom unique pour le serveur.
- `<commandOrUrl>` : La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`).
- `[args...]` : Arguments optionnels pour une commande `stdio`.

**Options (Flags) :**

- `-s, --scope` : Scope de configuration (user ou project). [par défaut : "project"]
- `-t, --transport` : Type de transport (stdio, sse, http). [par défaut : "stdio"]
- `-e, --env` : Définir des variables d'environnement (ex. -e KEY=value).
- `-H, --header` : Définir des en-têtes HTTP pour les transports SSE et HTTP (ex. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout` : Définir le délai d'expiration de la connexion en millisecondes.
- `--trust` : Faire confiance au serveur (ignorer toutes les invites de confirmation d'appel d'outil).
- `--description` : Définir la description du serveur.
- `--include-tools` : Une liste d'outils à inclure, séparée par des virgules.
- `--exclude-tools` : Une liste d'outils à exclure, séparée par des virgules.
- `--oauth-client-id` : ID client OAuth pour l'authentification du serveur MCP.
- `--oauth-client-secret` : Secret client OAuth pour l'authentification du serveur MCP.
- `--oauth-redirect-uri` : URI de redirection OAuth (ex. `https://your-server.com/oauth/callback`). Par défaut `http://localhost:7777/oauth/callback` pour les configurations locales. **Important pour les déploiements distants** : Lors de l'exécution de Qwen Code sur des serveurs distants/cloud, définissez-le sur une URL accessible publiquement.
- `--oauth-authorization-url` : URL d'autorisation OAuth.
- `--oauth-token-url` : URL de token OAuth.
- `--oauth-scopes` : Scopes OAuth (séparés par des virgules).

#### Ajouter un serveur stdio

Il s'agit du transport par défaut pour l'exécution de serveurs locaux.

```bash
# Basic syntax
qwen mcp add <name> <command> [args...]

# Example: Adding a local server
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Example: Adding a local python server
qwen mcp add python-server python server.py --port 8080
```

#### Ajouter un serveur HTTP

Ce transport est destiné aux serveurs utilisant le transport HTTP streamable.

```bash
# Basic syntax
qwen mcp add --transport http <name> <url>

# Example: Adding an HTTP server
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Example: Adding an HTTP server with an authentication header
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Ajouter un serveur SSE

Ce transport est destiné aux serveurs utilisant les Server-Sent Events (SSE).

```bash
# Basic syntax
qwen mcp add --transport sse <name> <url>

# Example: Adding an SSE server
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Example: Adding an SSE server with an authentication header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Example: Adding an OAuth-enabled SSE server
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### Gérer les serveurs (`qwen mcp`)

Pour afficher et gérer tous les serveurs MCP actuellement configurés, utilisez la commande `manage` ou simplement `qwen mcp`. Cela ouvre une boîte de dialogue TUI interactive où vous pouvez :

- Afficher tous les serveurs MCP avec leur état de connexion
- Activer/désactiver des serveurs
- Se reconnecter aux serveurs déconnectés
- Afficher les outils et prompts fournis par chaque serveur
- Afficher les journaux du serveur

**Commande :**

```bash
qwen mcp
# or
qwen mcp manage
```

La boîte de dialogue de gestion fournit une interface visuelle affichant le nom de chaque serveur, les détails de configuration, l'état de connexion et les outils/prompts disponibles.

### Supprimer un serveur (`qwen mcp remove`)

Pour supprimer un serveur de votre configuration, utilisez la commande `remove` avec le nom du serveur.

**Commande :**

```bash
qwen mcp remove <name>
```

**Exemple :**

```bash
qwen mcp remove my-server
```

Cela trouvera et supprimera l'entrée "my-server" de l'objet `mcpServers` dans le fichier `settings.json` approprié en fonction du scope (`-s, --scope`).