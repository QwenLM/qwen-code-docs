# Serveurs MCP avec Qwen Code

Ce document fournit un guide pour configurer et utiliser les serveurs Model Context Protocol (MCP) avec Qwen Code.

## Qu'est-ce qu'un serveur MCP ?

Un serveur MCP est une application qui expose des outils et des ressources au CLI via le Model Context Protocol, lui permettant d'interagir avec des systèmes externes et des sources de données. Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services comme des API.

Un serveur MCP permet au CLI de :

- **Découvrir des outils :** Lister les outils disponibles, leurs descriptions et paramètres grâce à des définitions de schéma standardisées.
- **Exécuter des outils :** Appeler des outils spécifiques avec des arguments définis et recevoir des réponses structurées.
- **Accéder aux ressources :** Lire des données à partir de ressources spécifiques (bien que le CLI se concentre principalement sur l'exécution d'outils).

Avec un serveur MCP, vous pouvez étendre les capacités du CLI pour effectuer des actions au-delà de ses fonctionnalités intégrées, comme interagir avec des bases de données, des API, des scripts personnalisés ou des flux de travail spécialisés.

## Architecture d'intégration principale

Qwen Code s'intègre avec les serveurs MCP via un système sophistiqué de découverte et d'exécution intégré dans le package principal (`packages/core/src/tools/`) :

### Couche de découverte (`mcp-client.ts`)

Le processus de découverte est orchestré par `discoverMcpTools()`, qui :

1. **Parcourt les serveurs configurés** à partir de votre configuration `mcpServers` dans `settings.json`
2. **Établit des connexions** en utilisant les mécanismes de transport appropriés (Stdio, SSE ou Streamable HTTP)
3. **Récupère les définitions d'outils** de chaque serveur en utilisant le protocole MCP
4. **Nettoie et valide** les schémas d'outils pour la compatibilité avec l'API Qwen
5. **Enregistre les outils** dans le registre global des outils avec résolution des conflits

### Couche d'exécution (`mcp-tool.ts`)

Chaque outil MCP découvert est enveloppé dans une instance `DiscoveredMCPTool` qui :

- **Gère la logique de confirmation** en fonction des paramètres de confiance du serveur et des préférences de l'utilisateur
- **Gère l'exécution des outils** en appelant le serveur MCP avec les bons paramètres
- **Traite les réponses** à la fois pour le contexte LLM et l'affichage utilisateur
- **Maintient l'état de la connexion** et gère les délais d'attente

### Mécanismes de transport

Le CLI prend en charge trois types de transport MCP :

- **Transport Stdio :** Lance un sous-processus et communique via stdin/stdout
- **Transport SSE :** Se connecte à des points de terminaison Server-Sent Events
- **Transport HTTP streamable :** Utilise le streaming HTTP pour la communication

## Comment configurer votre serveur MCP

Qwen Code utilise la configuration `mcpServers` dans votre fichier `settings.json` pour localiser et se connecter aux serveurs MCP. Cette configuration prend en charge plusieurs serveurs avec différents mécanismes de transport.

### Configurer le serveur MCP dans settings.json

Vous pouvez configurer les serveurs MCP dans votre fichier `settings.json` de deux manières principales : via l'objet `mcpServers` de premier niveau pour les définitions spécifiques de serveurs, et via l'objet `mcp` pour les paramètres globaux qui contrôlent la découverte et l'exécution des serveurs.

#### Paramètres MCP globaux (`mcp`)

L'objet `mcp` dans votre `settings.json` vous permet de définir des règles globales pour tous les serveurs MCP.

- **`mcp.serverCommand`** (chaîne) : Une commande globale pour démarrer un serveur MCP.
- **`mcp.allowed`** (tableau de chaînes) : Une liste de noms de serveurs MCP autorisés. Si cette option est définie, seuls les serveurs de cette liste (correspondant aux clés de l'objet `mcpServers`) seront connectés.
- **`mcp.excluded`** (tableau de chaînes) : Une liste de noms de serveurs MCP à exclure. Les serveurs de cette liste ne seront pas connectés.

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

#### Requis (l'une des suivantes)

- **`command`** (chaîne) : Chemin vers l'exécutable pour le transport Stdio
- **`url`** (chaîne) : URL du point de terminaison SSE (ex. : `"http://localhost:8080/sse"`)
- **`httpUrl`** (chaîne) : URL du point de terminaison HTTP streaming

#### Optionnelles

- **`args`** (tableau de chaînes) : Arguments de ligne de commande pour le transport Stdio
- **`headers`** (objet) : En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`
- **`env`** (objet) : Variables d'environnement pour le processus serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (chaîne) : Répertoire de travail pour le transport Stdio
- **`timeout`** (nombre) : Délai d'attente de la requête en millisecondes (par défaut : 600 000 ms = 10 minutes)
- **`trust`** (booléen) : Lorsqu'il est `true`, ignore toutes les confirmations d'appel d'outil pour ce serveur (par défaut : `false`)
- **`includeTools`** (tableau de chaînes) : Liste des noms d'outils à inclure de ce serveur MCP. Lorsqu'elle est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste blanche). Si non spécifiée, tous les outils du serveur sont activés par défaut.
- **`excludeTools`** (tableau de chaînes) : Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Remarque :** `excludeTools` a priorité sur `includeTools` - si un outil figure dans les deux listes, il sera exclu.
- **`targetAudience`** (chaîne) : L'ID client OAuth autorisé sur l'application protégée par IAP à laquelle vous essayez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (chaîne) : L'adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.
### Prise en charge d’OAuth pour les serveurs MCP distants

Qwen Code prend en charge l’authentification OAuth 2.0 pour les serveurs MCP distants utilisant les transports SSE ou HTTP. Cela permet un accès sécurisé aux serveurs MCP nécessitant une authentification.

#### Découverte automatique d’OAuth

Pour les serveurs prenant en charge la découverte OAuth, vous pouvez omettre la configuration OAuth et laisser la CLI la découvrir automatiquement :

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

La CLI va automatiquement :

- Détecter quand un serveur nécessite une authentification OAuth (réponses 401)
- Découvrir les points de terminaison OAuth à partir des métadonnées du serveur
- Effectuer un enregistrement dynamique du client si pris en charge
- Gérer le flux OAuth et la gestion des jetons

#### Flux d’authentification

Lors de la connexion à un serveur compatible OAuth :

1. **La tentative de connexion initiale** échoue avec une erreur 401 Non autorisé
2. **La découverte OAuth** trouve les points de terminaison d’autorisation et de jeton
3. **Le navigateur s’ouvre** pour l’authentification de l’utilisateur (nécessite un accès au navigateur local)
4. **Le code d’autorisation** est échangé contre des jetons d’accès
5. **Les jetons sont stockés** de manière sécurisée pour une utilisation future
6. **La nouvelle tentative de connexion** réussit avec des jetons valides

#### Exigences de redirection du navigateur

**Important :** L’authentification OAuth nécessite que l’URI de redirection soit accessible :

- **Comportement par défaut** : Redirection vers `http://localhost:7777/oauth/callback` (fonctionne pour les configurations locales)
- **URI de redirection personnalisée** : Utilisez `--oauth-redirect-uri` ou configurez `redirectUri` dans settings.json pour spécifier une URL différente

Pour **les déploiements de serveurs distants/cloud** (par exemple, terminaux web, sessions SSH, IDE cloud) :

- La redirection `localhost` par défaut ne fonctionnera PAS
- Vous DEVEZ configurer une `redirectUri` personnalisée pointant vers une URL accessible publiquement
- Le navigateur de l’utilisateur doit pouvoir atteindre cette URL et rediriger vers le serveur

Exemple pour les serveurs distants :

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth ne fonctionnera pas dans :

- Les environnements sans tête (headless) sans accès au navigateur
- Les environnements où la `redirectUri` configurée est inaccessible depuis le navigateur de l’utilisateur

#### Gestion de l’authentification OAuth

Utilisez la boîte de dialogue `/mcp` dans une session interactive Qwen Code pour inspecter les serveurs MCP et gérer l’authentification OAuth.

#### Propriétés de configuration OAuth

- **`enabled`** (booléen) : Activer OAuth pour ce serveur
- **`clientId`** (chaîne) : Identifiant client OAuth (facultatif avec enregistrement dynamique)
- **`clientSecret`** (chaîne) : Secret client OAuth (facultatif pour les clients publics)
- **`authorizationUrl`** (chaîne) : Point de terminaison d’autorisation OAuth (découvert automatiquement si omis)
- **`tokenUrl`** (chaîne) : Point de terminaison de jeton OAuth (découvert automatiquement si omis)
- **`scopes`** (tableau de chaînes) : Portées OAuth requises
- **`redirectUri`** (chaîne) : URI de redirection personnalisée. **Critique pour les déploiements distants** : Par défaut à `http://localhost:7777/oauth/callback`. Lorsque Qwen Code est exécuté sur des serveurs distants/cloud, définissez-la sur une URL accessible publiquement (par exemple, `https://votre-serveur.com/oauth/callback`). Peut être configurée via `qwen mcp add --oauth-redirect-uri` ou directement dans settings.json.
- **`tokenParamName`** (chaîne) : Nom du paramètre de requête pour les jetons dans les URL SSE
- **`audiences`** (tableau de chaînes) : Audiences pour lesquelles le jeton est valide

#### Gestion des jetons

Les jetons OAuth sont automatiquement :

- **Stockés** dans `~/.qwen/mcp-oauth-tokens.json` (texte brut, mode 0600) par défaut. Si `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` est défini, Qwen Code utilise un stockage basé sur le trousseau (keychain) lorsque disponible, ou `~/.qwen/mcp-oauth-tokens-v2.json` avec chiffrement AES-256-GCM.
- **Rafraîchis** à leur expiration (si des jetons de rafraîchissement sont disponibles)
- **Validés** avant chaque tentative de connexion
- **Nettoyés** lorsqu’ils sont invalides ou expirés

> [!WARNING]
> Par défaut, les jetons OAuth sont stockés non chiffrés sur le disque. Sur les machines partagées ou multi-utilisateurs, définissez `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` pour protéger les informations d’identification.

#### Type de fournisseur d’authentification

Vous pouvez spécifier le type de fournisseur d’authentification à l’aide de la propriété `authProviderType` :

- **`authProviderType`** (chaîne) : Spécifie le fournisseur d’authentification. Peut être l’un des suivants :
  - **`dynamic_discovery`** (par défaut) : La CLI découvre automatiquement la configuration OAuth à partir du serveur.
  - **`google_credentials`** : La CLI utilise les Google Application Default Credentials (ADC) pour s’authentifier auprès du serveur. Lorsque vous utilisez ce fournisseur, vous devez spécifier les portées requises.
  - **`service_account_impersonation`** : La CLI usurpe l’identité d’un compte de service Google Cloud pour s’authentifier auprès du serveur. Cela est utile pour accéder aux services protégés par IAP (conçu spécifiquement pour les services Cloud Run).

#### Informations d’identification Google

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
#### Usurpation de compte de service

Pour vous authentifier auprès d'un serveur en utilisant l'usurpation de compte de service, vous devez définir `authProviderType` sur `service_account_impersonation` et fournir les propriétés suivantes :

- **`targetAudience`** (chaîne de caractères) : l'ID client OAuth autorisé sur l'application protégée par IAP que vous essayez d'accéder.
- **`targetServiceAccount`** (chaîne de caractères) : l'adresse e-mail du compte de service Google Cloud à usurper.

La CLI utilisera vos informations d'identification par défaut de l'application (ADC) locales pour générer un jeton d'identification OIDC pour le compte de service et l'audience spécifiés. Ce jeton sera ensuite utilisé pour s'authentifier auprès du serveur MCP.

#### Instructions de configuration

1. **[Créez](https://cloud.google.com/iap/docs/oauth-client-creation) ou utilisez un ID client OAuth 2.0 existant.** Pour utiliser un ID client OAuth 2.0 existant, suivez les étapes dans [Comment partager des clients OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Ajoutez l'ID OAuth à la liste autorisée pour l'[accès programmatique](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) de l'application.** Comme Cloud Run n'est pas encore un type de ressource pris en charge dans gcloud iap, vous devez autoriser l'ID client sur le projet.
3. **Créez un compte de service.** [Documentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Lien vers la console Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Ajoutez à la fois le compte de service et les utilisateurs à la politique IAP** dans l'onglet « Sécurité » du service Cloud Run lui-même ou via gcloud.
5. **Accordez à tous les utilisateurs et groupes** qui accéderont au serveur MCP les autorisations nécessaires pour [usurper le compte de service](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (c'est-à-dire `roles/iam.serviceAccountTokenCreator`).
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

Lorsque Qwen Code démarre, il effectue la découverte des serveurs MCP via le processus détaillé suivant :

### 1. Itération des serveurs et connexion

Pour chaque serveur configuré dans `mcpServers` :

1. **Le suivi d'état commence :** l'état du serveur est défini sur `CONNECTING`
2. **Sélection du transport :** en fonction des propriétés de configuration :
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Établissement de la connexion :** le client MCP tente de se connecter avec le délai d'attente configuré
4. **Gestion des erreurs :** les échecs de connexion sont enregistrés et l'état du serveur est défini sur `DISCONNECTED`

### 2. Découverte des outils

En cas de connexion réussie :

1. **Liste des outils :** le client appelle le point de terminaison de liste des outils du serveur MCP
2. **Validation du schéma :** la déclaration de fonction de chaque outil est validée
3. **Filtrage des outils :** les outils sont filtrés en fonction des configurations `includeTools` et `excludeTools`
4. **Nettoyage des noms :** les noms des outils sont nettoyés pour répondre aux exigences de l'API Qwen :
   - Les caractères invalides (non alphanumériques, tiret bas, point, trait d'union) sont remplacés par des tirets bas
   - Les noms de plus de 63 caractères sont tronqués avec un remplacement au milieu (`___`)
### 3. Résolution des conflits

Lorsque plusieurs serveurs exposent des outils portant le même nom :

1. **Premier enregistrement gagne :** Le premier serveur à enregistrer un nom d'outil obtient le nom sans préfixe.
2. **Préfixage automatique :** Les serveurs suivants reçoivent des noms préfixés : `serverName__toolName`
3. **Suivi du registre :** Le registre des outils conserve les correspondances entre les noms des serveurs et leurs outils.

### 4. Traitement du schéma

Les schémas de paramètres des outils subissent un nettoyage pour la compatibilité avec l'API :

- **Les propriétés `$schema`** sont supprimées
- **`additionalProperties`** sont supprimées
- **`anyOf` avec `default`** voient leurs valeurs par défaut supprimées (compatibilité Vertex AI)
- **Un traitement récursif** est appliqué aux schémas imbriqués

### 5. Gestion des connexions

Après la découverte :

- **Connexions persistantes :** Les serveurs qui enregistrent avec succès des outils conservent leurs connexions
- **Nettoyage :** Les serveurs qui ne fournissent aucun outil utilisable voient leurs connexions fermées
- **Mises à jour de statut :** Les statuts finaux des serveurs sont définis sur `CONNECTED` ou `DISCONNECTED`

## Flux d'exécution des outils

Lorsque le modèle décide d'utiliser un outil MCP, le flux d'exécution suivant se produit :

### 1. Invocation de l'outil

Le modèle génère un `FunctionCall` avec :

- **Nom de l'outil :** Le nom enregistré (potentiellement préfixé)
- **Arguments :** Objet JSON correspondant au schéma des paramètres de l'outil

### 2. Processus de confirmation

Chaque `DiscoveredMCPTool` implémente une logique de confirmation sophistiquée :

#### Contournement basé sur la confiance

```typescript
if (this.trust) {
  return false; // No confirmation needed
}
```

#### Liste blanche dynamique

Le système maintient des listes blanches internes pour :

- **Au niveau du serveur :** `serverName` → Tous les outils de ce serveur sont approuvés
- **Au niveau de l'outil :** `serverName.toolName` → Cet outil spécifique est approuvé

#### Gestion des choix de l'utilisateur

Lorsqu'une confirmation est requise, les utilisateurs peuvent choisir :

- **Exécuter une fois :** Exécuter uniquement cette fois-ci
- **Toujours autoriser cet outil :** Ajouter à la liste blanche au niveau de l'outil
- **Toujours autoriser ce serveur :** Ajouter à la liste blanche au niveau du serveur
- **Annuler :** Abandonner l'exécution

### 3. Exécution

Après confirmation (ou contournement par confiance) :

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

3. **Traitement des réponses :** Les résultats sont formatés à la fois pour le contexte du LLM et l'affichage utilisateur

### 4. Gestion des réponses

Le résultat de l'exécution contient :

- **`llmContent` :** Parties brutes de la réponse pour le contexte du modèle de langage
- **`returnDisplay` :** Sortie formatée pour l'affichage utilisateur (souvent du JSON dans des blocs de code markdown)

## Comment interagir avec votre serveur MCP

### Utilisation de la commande `/mcp`

La commande `/mcp` fournit des informations complètes sur la configuration de votre serveur MCP :

```bash
/mcp
```

Ceci affiche :

- **Liste des serveurs :** Tous les serveurs MCP configurés
- **Statut de connexion :** `CONNECTED`, `CONNECTING` ou `DISCONNECTED`
- **Détails du serveur :** Résumé de la configuration (à l'exclusion des données sensibles)
- **Outils disponibles :** Liste des outils de chaque serveur avec descriptions
- **État de la découverte :** Statut global du processus de découverte

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

Une fois découverts, les outils MCP sont disponibles pour le modèle Qwen comme des outils intégrés. Le modèle va automatiquement :

1. **Sélectionner les outils appropriés** en fonction de vos demandes
2. **Présenter des dialogues de confirmation** (sauf si le serveur est approuvé)
3. **Exécuter les outils** avec les paramètres appropriés
4. **Afficher les résultats** dans un format convivial

## Surveillance des statuts et dépannage

### États de connexion

L'intégration MCP suit plusieurs états :

#### Statut du serveur (`MCPServerStatus`)

- **`DISCONNECTED` :** Le serveur n'est pas connecté ou présente des erreurs
- **`CONNECTING` :** Tentative de connexion en cours
- **`CONNECTED` :** Le serveur est connecté et prêt

#### État de la découverte (`MCPDiscoveryState`)

- **`NOT_STARTED` :** La découverte n'a pas commencé
- **`IN_PROGRESS` :** Découverte des serveurs en cours
- **`COMPLETED` :** Découverte terminée (avec ou sans erreurs)

### Problèmes courants et solutions

#### Le serveur ne se connecte pas

**Symptômes :** Le serveur affiche le statut `DISCONNECTED`

**Dépannage :**

1. **Vérifier la configuration :** Vérifiez que `command`, `args` et `cwd` sont corrects
2. **Tester manuellement :** Exécutez directement la commande du serveur pour vérifier qu'elle fonctionne
3. **Vérifier les dépendances :** Assurez-vous que tous les paquets requis sont installés
4. **Consulter les journaux :** Recherchez les messages d'erreur dans la sortie CLI
5. **Vérifier les permissions :** Assurez-vous que la CLI peut exécuter la commande du serveur
#### Aucun outil découvert

**Symptômes :** Le serveur se connecte mais aucun outil n'est disponible

**Dépannage :**

1. **Vérifier l'enregistrement des outils :** Assurez-vous que votre serveur enregistre réellement des outils
2. **Vérifier le protocole MCP :** Confirmez que votre serveur implémente correctement la liste des outils MCP
3. **Consulter les logs du serveur :** Examinez la sortie stderr pour détecter les erreurs côté serveur
4. **Tester la liste des outils :** Testez manuellement le point de terminaison de découverte des outils de votre serveur

#### Les outils ne s'exécutent pas

**Symptômes :** Les outils sont découverts mais échouent lors de l'exécution

**Dépannage :**

1. **Validation des paramètres :** Assurez-vous que votre outil accepte les paramètres attendus
2. **Compatibilité des schémas :** Vérifiez que vos schémas d'entrée sont des schémas JSON valides
3. **Gestion des erreurs :** Vérifiez si votre outil lève des exceptions non gérées
4. **Problèmes de délai d'attente :** Envisagez d'augmenter le paramètre `timeout`

#### Compatibilité du bac à sable

**Symptômes :** Les serveurs MCP échouent lorsque le bac à sable est activé

**Solutions :**

1. **Serveurs basés sur Docker :** Utilisez des conteneurs Docker qui incluent toutes les dépendances
2. **Accessibilité des chemins :** Assurez-vous que les exécutables du serveur sont disponibles dans le bac à sable
3. **Accès réseau :** Configurez le bac à sable pour autoriser les connexions réseau nécessaires
4. **Variables d'environnement :** Vérifiez que les variables d'environnement requises sont transmises

### Conseils de débogage

1. **Activer le mode débogage :** Lancez le CLI avec `--debug` pour une sortie détaillée
2. **Vérifier stderr :** La sortie stderr du serveur MCP est capturée et journalisée (les messages INFO sont filtrés)
3. **Test d'isolement :** Testez votre serveur MCP indépendamment avant l'intégration
4. **Configuration progressive :** Commencez par des outils simples avant d'ajouter des fonctionnalités complexes
5. **Utilisez `/mcp` fréquemment :** Surveillez l'état du serveur pendant le développement

## Remarques importantes

### Considérations de sécurité

- **Paramètres de confiance :** L'option `trust` contourne toutes les boîtes de dialogue de confirmation. Utilisez-la avec prudence et uniquement pour les serveurs que vous contrôlez entièrement
- **Jetons d'accès :** Soyez vigilant lors de la configuration des variables d'environnement contenant des clés API ou des jetons
- **Compatibilité du bac à sable :** Lorsque vous utilisez le bac à sable, assurez-vous que les serveurs MCP sont disponibles dans l'environnement du bac à sable
- **Données privées :** L'utilisation de jetons d'accès personnel à large portée peut entraîner une fuite d'informations entre les dépôts

### Performances et gestion des ressources

- **Persistance des connexions :** Le CLI maintient des connexions persistantes vers les serveurs qui enregistrent avec succès des outils
- **Nettoyage automatique :** Les connexions vers les serveurs ne fournissant aucun outil sont automatiquement fermées
- **Gestion des délais d'attente :** Configurez des délais d'attente appropriés en fonction des caractéristiques de réponse de votre serveur
- **Surveillance des ressources :** Les serveurs MCP s'exécutent en tant que processus séparés et consomment des ressources système

### Compatibilité des schémas

- **Mode de conformité des schémas :** Par défaut (`schemaCompliance: "auto"`), les schémas d'outils sont transmis tels quels. Définissez `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` dans votre `settings.json` pour convertir les modèles au format Strict OpenAPI 3.0.
- **Transformations OpenAPI 3.0 :** Lorsque le mode `openapi_30` est activé, le système gère :
  - Types nullables : `["string", "null"]` -> `type: "string", nullable: true`
  - Valeurs constantes : `const: "foo"` -> `enum: ["foo"]`
  - Limites exclusives : `exclusiveMinimum` numérique -> forme booléenne avec `minimum`
  - Suppression de mots-clés : `$schema`, `$id`, `dependencies`, `patternProperties`
- **Assainissement des noms :** Les noms d'outils sont automatiquement assainis pour répondre aux exigences de l'API
- **Résolution des conflits :** Les conflits de noms d'outils entre serveurs sont résolus par un préfixage automatique

Cette intégration complète fait des serveurs MCP un moyen puissant d'étendre les capacités du CLI tout en maintenant la sécurité, la fiabilité et la facilité d'utilisation.

## Retourner du contenu riche depuis les outils

Les outils MCP ne se limitent pas à retourner du texte simple. Vous pouvez retourner du contenu riche en plusieurs parties, incluant du texte, des images, de l'audio et d'autres données binaires dans une seule réponse d'outil. Cela vous permet de construire des outils puissants capables de fournir des informations variées au modèle en un seul tour.

Toutes les données retournées par l'outil sont traitées et envoyées au modèle comme contexte pour sa prochaine génération, lui permettant de raisonner sur les informations fournies ou de les résumer.

### Comment ça fonctionne

Pour retourner du contenu riche, la réponse de votre outil doit adhérer à la spécification MCP pour un [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). Le champ `content` du résultat doit être un tableau d'objets `ContentBlock`. Le CLI traitera correctement ce tableau, en séparant le texte des données binaires et en le conditionnant pour le modèle.

Vous pouvez mélanger différents types de blocs de contenu dans le tableau `content`. Les types de blocs pris en charge incluent :

- `text`
- `image`
- `audio`
- `resource` (contenu intégré)
- `resource_link`

### Exemple : Retourner un texte et une image

Voici un exemple de réponse JSON valide d'un outil MCP qui retourne à la fois une description textuelle et une image :

```json
{
  "content": [
    {
      "type": "text",
      "text": "Voici le logo que vous avez demandé."
    },
    {
      "type": "image",
      "data": "DONNÉES_IMAGE_ENCODÉES_EN_BASE64_ICI",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "Le logo a été créé en 2025."
    }
  ]
}
```
Lorsque Qwen Code reçoit cette réponse, il va :

1. Extraire tout le texte et le combiner en une seule partie `functionResponse` pour le modèle.
2. Présenter les données de l’image sous forme d’une partie `inlineData` séparée.
3. Fournir un résumé clair et convivial dans le CLI, indiquant que du texte et une image ont été reçus.

Cela vous permet de construire des outils sophistiqués capables de fournir un contexte multimodal riche au modèle Qwen.

## Les prompts MCP en tant que commandes slash

En plus des outils, les serveurs MCP peuvent exposer des prompts prédéfinis qui peuvent être exécutés comme des commandes slash dans Qwen Code. Cela vous permet de créer des raccourcis pour des requêtes courantes ou complexes qui peuvent être facilement invoquées par leur nom.

### Définition des prompts sur le serveur

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

Ceci peut être inclus dans `settings.json` sous `mcpServers` avec :

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

### Invocation des prompts

Une fois qu’un prompt est découvert, vous pouvez l’invoquer en utilisant son nom comme commande slash. Le CLI se charge automatiquement d’analyser les arguments.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, en utilisant des arguments positionnels :

```bash
/poem-writer "Qwen Code" reverent
```

Lorsque vous exécutez cette commande, le CLI appelle la méthode `prompts/get` sur le serveur MCP avec les arguments fournis. Le serveur est responsable de la substitution des arguments dans le modèle de prompt et de retourner le texte final du prompt. Le CLI envoie ensuite ce prompt au modèle pour exécution. Cela offre un moyen pratique d’automatiser et de partager des workflows courants.

## Gestion des serveurs MCP avec `qwen mcp`

Bien que vous puissiez toujours configurer les serveurs MCP en modifiant manuellement votre fichier `settings.json`, le CLI propose un ensemble de commandes pratiques pour gérer vos configurations de serveur par programmation. Ces commandes simplifient le processus d’ajout, de listage et de suppression de serveurs MCP sans avoir à éditer directement des fichiers JSON.

### Ajout d’un serveur (`qwen mcp add`)

La commande `add` configure un nouveau serveur MCP dans votre `settings.json`. Selon la portée (`-s, --scope`), il sera ajouté soit au fichier de configuration utilisateur `~/.qwen/settings.json`, soit au fichier de configuration du projet `.qwen/settings.json`.

**Commande :**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>` : Un nom unique pour le serveur.
- `<commandOrUrl>` : La commande à exécuter (pour `stdio`) ou l’URL (pour `http`/`sse`).
- `[args...]` : Arguments optionnels pour une commande `stdio`.

**Options (drapeaux) :**

- `-s, --scope` : Portée de la configuration (user ou project). [défaut : "project"]
- `-t, --transport` : Type de transport (stdio, sse, http). [défaut : "stdio"]
- `-e, --env` : Définir des variables d’environnement (ex. -e KEY=valeur).
- `-H, --header` : Définir des en-têtes HTTP pour les transports SSE et HTTP (ex. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout` : Définir le délai d’attente de connexion en millisecondes.
- `--trust` : Faire confiance au serveur (ignorer toutes les invites de confirmation d’appel d’outil).
- `--description` : Définir la description du serveur.
- `--include-tools` : Liste séparée par des virgules des outils à inclure.
- `--exclude-tools` : Liste séparée par des virgules des outils à exclure.
- `--oauth-client-id` : ID client OAuth pour l’authentification du serveur MCP.
- `--oauth-client-secret` : Secret client OAuth pour l’authentification du serveur MCP.
- `--oauth-redirect-uri` : URI de redirection OAuth (ex. `https://votre-serveur.com/oauth/callback`). Par défaut `http://localhost:7777/oauth/callback` pour les configurations locales. **Important pour les déploiements distants** : Lorsque Qwen Code est exécuté sur des serveurs distants/cloud, définissez une URL accessible publiquement.
- `--oauth-authorization-url` : URL d’autorisation OAuth.
- `--oauth-token-url` : URL de jeton OAuth.
- `--oauth-scopes` : Périmètres OAuth (séparés par des virgules).

#### Ajout d’un serveur stdio

Il s’agit du transport par défaut pour exécuter des serveurs locaux.

```bash
# Syntaxe de base
qwen mcp add <name> <command> [args...]

# Exemple : Ajout d’un serveur local
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Exemple : Ajout d’un serveur python local
qwen mcp add python-server python server.py --port 8080
```
#### Ajout d'un serveur HTTP

Ce transport est destiné aux serveurs qui utilisent le transport HTTP streamable.

```bash
# Syntaxe de base
qwen mcp add --transport http <name> <url>

# Exemple : Ajout d'un serveur HTTP
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Exemple : Ajout d'un serveur HTTP avec un en-tête d'authentification
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Ajout d'un serveur SSE

Ce transport est destiné aux serveurs qui utilisent les Server-Sent Events (SSE).

```bash
# Syntaxe de base
qwen mcp add --transport sse <name> <url>

# Exemple : Ajout d'un serveur SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemple : Ajout d'un serveur SSE avec un en-tête d'authentification
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Exemple : Ajout d'un serveur SSE avec OAuth
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id votre-id-client \
  --oauth-redirect-uri https://votre-serveur.com/oauth/callback \
  --oauth-authorization-url https://fournisseur.example.com/authorize \
  --oauth-token-url https://fournisseur.example.com/token
```

### Gestion des serveurs (`/mcp`)

Pour voir et gérer tous les serveurs MCP actuellement configurés, ouvrez le dialogue `/mcp` dans une session interactive Qwen Code. Ce dialogue vous permet :

- Voir tous les serveurs MCP avec leur état de connexion
- Activer/désactiver des serveurs
- Reconnecter les serveurs déconnectés
- Voir les outils et les prompts fournis par chaque serveur
- Voir les journaux des serveurs

**Commande :**

```bash
qwen
```

Puis saisissez :

```text
/mcp
```

Le dialogue de gestion fournit une interface visuelle affichant le nom de chaque serveur, les détails de configuration, l'état de la connexion et les outils/prompts disponibles.

### Suppression d'un serveur (`qwen mcp remove`)

Pour supprimer un serveur de votre configuration, utilisez la commande `remove` avec le nom du serveur.

**Commande :**

```bash
qwen mcp remove <name>
```

**Exemple :**

```bash
qwen mcp remove my-server
```

Cette commande recherche et supprime l'entrée "my-server" de l'objet `mcpServers` dans le fichier `settings.json` approprié en fonction de la portée (`-s, --scope`).
