# Serveurs MCP avec Qwen Code

Ce document fournit un guide pour configurer et utiliser les serveurs Model Context Protocol (MCP) avec Qwen Code.

## Qu'est-ce qu'un serveur MCP ?

Un serveur MCP est une application qui expose des outils et des ressources à la CLI via le Model Context Protocol, lui permettant d'interagir avec des systèmes externes et des sources de données. Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services comme les API.

Un serveur MCP permet à la CLI de :

- **Découvrir des outils :** Lister les outils disponibles, leurs descriptions et leurs paramètres via des définitions de schéma standardisées.
- **Exécuter des outils :** Appeler des outils spécifiques avec des arguments définis et recevoir des réponses structurées.
- **Accéder aux ressources :** Lire des données à partir de ressources spécifiques (bien que la CLI se concentre principalement sur l'exécution d'outils).

Avec un serveur MCP, vous pouvez étendre les capacités de la CLI pour effectuer des actions au-delà de ses fonctionnalités intégrées, comme interagir avec des bases de données, des API, des scripts personnalisés ou des workflows spécialisés.

## Architecture d'intégration de base

Qwen Code s'intègre aux serveurs MCP via un système sophistiqué de découverte et d'exécution intégré dans le package de base (`packages/core/src/tools/`) :

### Couche de découverte (`mcp-client.ts`)

Le processus de découverte est orchestré par `discoverMcpTools()`, qui :

1. **Parcourt les serveurs configurés** depuis votre configuration `mcpServers` dans `settings.json`
2. **Établit des connexions** en utilisant les mécanismes de transport appropriés (Stdio, SSE, ou HTTP streamable)
3. **Récupère les définitions d'outils** de chaque serveur via le protocole MCP
4. **Nettoie et valide** les schémas d'outils pour la compatibilité avec l'API Qwen
5. **Enregistre les outils** dans le registre global d'outils avec résolution des conflits

### Couche d'exécution (`mcp-tool.ts`)

Chaque outil MCP découvert est encapsulé dans une instance `DiscoveredMCPTool` qui :

- **Gère la logique de confirmation** en fonction des paramètres de confiance du serveur et des préférences utilisateur
- **Gère l'exécution de l'outil** en appelant le serveur MCP avec les paramètres appropriés
- **Traite les réponses** à la fois pour le contexte LLM et l'affichage utilisateur
- **Maintient l'état de la connexion** et gère les timeouts

### Mécanismes de transport

La CLI prend en charge trois types de transport MCP :

- **Transport Stdio :** Lance un sous-processus et communique via stdin/stdout
- **Transport SSE :** Se connecte à des points de terminaison Server-Sent Events
- **Transport HTTP streamable :** Utilise le streaming HTTP pour la communication

## Comment configurer votre serveur MCP

Qwen Code utilise la configuration `mcpServers` dans votre fichier `settings.json` pour localiser et se connecter aux serveurs MCP. Cette configuration prend en charge plusieurs serveurs avec différents mécanismes de transport.

### Configurer le serveur MCP dans settings.json

Vous pouvez configurer les serveurs MCP dans votre fichier `settings.json` de deux manières principales : via l'objet `mcpServers` de premier niveau pour les définitions de serveurs spécifiques, et via l'objet `mcp` pour les paramètres globaux qui contrôlent la découverte et l'exécution des serveurs.

#### Paramètres MCP globaux (`mcp`)

L'objet `mcp` dans votre `settings.json` vous permet de définir des règles globales pour tous les serveurs MCP.

- **`mcp.serverCommand`** (string) : Une commande globale pour démarrer un serveur MCP.
- **`mcp.allowed`** (tableau de strings) : Une liste de noms de serveurs MCP à autoriser. Si défini, seuls les serveurs de cette liste (correspondant aux clés de l'objet `mcpServers`) seront connectés.
- **`mcp.excluded`** (tableau de strings) : Une liste de noms de serveurs MCP à exclure. Les serveurs de cette liste ne seront pas connectés.

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

L'objet `mcpServers` est l'endroit où vous définissez chaque serveur MCP individuel auquel la CLI doit se connecter.

### Structure de configuration

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
{ ...le fichier contient d'autres objets de configuration
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

#### Requises (l'une des suivantes)

- **`command`** (string) : Chemin vers l'exécutable pour le transport Stdio
- **`url`** (string) : URL du point de terminaison SSE (ex. `"http://localhost:8080/sse"`)
- **`httpUrl`** (string) : URL du point de terminaison HTTP streamable

#### Optionnelles

- **`args`** (string[]) : Arguments de ligne de commande pour le transport Stdio
- **`headers`** (object) : En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`
- **`env`** (object) : Variables d'environnement pour le processus serveur. Les valeurs peuvent référencer des variables d'environnement avec la syntaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string) : Répertoire de travail pour le transport Stdio
- **`timeout`** (number) : Timeout de demande en millisecondes (par défaut : 600 000 ms = 10 minutes)
- **`trust`** (boolean) : Quand `true`, ignore toutes les confirmations d'appel d'outil pour ce serveur (par défaut : `false`)
- **`includeTools`** (string[]) : Liste de noms d'outils à inclure de ce serveur MCP. Lorsque spécifié, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste blanche). Si non spécifié, tous les outils du serveur sont activés par défaut.
- **`excludeTools`** (string[]) : Liste de noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Remarque :** `excludeTools` a priorité sur `includeTools` – si un outil est dans les deux listes, il sera exclu.
- **`targetAudience`** (string) : L'ID client OAuth autorisé sur l'application protégée par IAP à laquelle vous essayez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string) : L'adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.

### Prise en charge OAuth pour les serveurs MCP distants

Qwen Code prend en charge l'authentification OAuth 2.0 pour les serveurs MCP distants utilisant les transports SSE ou HTTP. Cela permet un accès sécurisé aux serveurs MCP nécessitant une authentification.

#### Découverte automatique OAuth

Pour les serveurs prenant en charge la découverte OAuth, vous pouvez omettre la configuration OAuth et laisser la CLI la découvrir automatiquement :

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

La CLI va automatiquement :

- Détecter quand un serveur nécessite une authentification OAuth (réponses 401)
- Découvrir les points de terminaison OAuth à partir des métadonnées du serveur
- Effectuer un enregistrement dynamique du client si pris en charge
- Gérer le flux OAuth et la gestion des jetons

#### Flux d'authentification

Lors de la connexion à un serveur compatible OAuth :

1. **La tentative de connexion initiale** échoue avec 401 Non autorisé
2. **La découverte OAuth** trouve les points de terminaison d'autorisation et de jeton
3. **Le navigateur s'ouvre** pour l'authentification utilisateur (nécessite un accès au navigateur local)
4. **Le code d'autorisation** est échangé contre des jetons d'accès
5. **Les jetons sont stockés** de manière sécurisée pour une utilisation future
6. **La nouvelle tentative de connexion** réussit avec des jetons valides

#### Exigences de redirection du navigateur

**Important :** L'authentification OAuth nécessite que l'URI de redirection soit accessible :

- **Comportement par défaut** : Redirige vers `http://localhost:7777/oauth/callback` (fonctionne pour les configurations locales)
- **URI de redirection personnalisé** : Utilisez `--oauth-redirect-uri` ou configurez `redirectUri` dans settings.json pour spécifier une URL différente

Pour les **déploiements de serveurs distants/cloud** (ex. terminaux web, sessions SSH, IDE cloud) :

- La redirection `localhost` par défaut ne fonctionnera PAS
- Vous DEVEZ configurer un `redirectUri` personnalisé pointant vers une URL accessible publiquement
- Le navigateur de l'utilisateur doit pouvoir atteindre cette URL et rediriger vers le serveur

Exemple pour les serveurs distants :

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://votre-serveur-distant.example.com/oauth/callback
```

OAuth ne fonctionnera pas dans :

- Les environnements sans tête (headless) sans accès au navigateur
- Les environnements où le `redirectUri` configuré est inaccessible depuis le navigateur de l'utilisateur

#### Gestion de l'authentification OAuth

Utilisez le dialogue `/mcp` dans une session interactive Qwen Code pour inspecter les serveurs MCP et gérer l'authentification OAuth.

#### Propriétés de configuration OAuth

- **`enabled`** (boolean) : Activer OAuth pour ce serveur
- **`clientId`** (string) : Identifiant client OAuth (optionnel avec enregistrement dynamique)
- **`clientSecret`** (string) : Secret client OAuth (optionnel pour les clients publics)
- **`authorizationUrl`** (string) : Point de terminaison d'autorisation OAuth (découvert automatiquement si omis)
- **`tokenUrl`** (string) : Point de terminaison de jeton OAuth (découvert automatiquement si omis)
- **`scopes`** (string[]) : Portées OAuth requises
- **`redirectUri`** (string) : URI de redirection personnalisé. **Critique pour les déploiements distants** : Par défaut, `http://localhost:7777/oauth/callback`. Lorsque vous exécutez Qwen Code sur des serveurs distants/cloud, définissez-le sur une URL accessible publiquement (ex. `https://votre-serveur.com/oauth/callback`). Peut être configuré via `qwen mcp add --oauth-redirect-uri` ou directement dans settings.json.
- **`tokenParamName`** (string) : Nom du paramètre de requête pour les jetons dans les URL SSE
- **`audiences`** (string[]) : Audiences pour lesquelles le jeton est valide

#### Gestion des jetons

Les jetons OAuth sont automatiquement :

- **Stockés** dans `~/.qwen/mcp-oauth-tokens.json` (texte brut, mode 0600) par défaut. Si `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` est défini, Qwen Code utilise un stockage basé sur le trousseau (keychain) lorsque disponible, ou `~/.qwen/mcp-oauth-tokens-v2.json` avec chiffrement AES-256-GCM.
- **Rafraîchis** lorsqu'ils expirent (si des jetons de rafraîchissement sont disponibles)
- **Validés** avant chaque tentative de connexion
- **Nettoyés** lorsqu'ils sont invalides ou expirés

> [!WARNING]
> Par défaut, les jetons OAuth sont stockés non chiffrés sur le disque. Sur les machines partagées ou multi-utilisateurs, définissez `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` pour protéger les informations d'identification.

#### Type de fournisseur d'authentification

Vous pouvez spécifier le type de fournisseur d'authentification avec la propriété `authProviderType` :

- **`authProviderType`** (string) : Spécifie le fournisseur d'authentification. Peut être l'un des suivants :
  - **`dynamic_discovery`** (par défaut) : La CLI découvre automatiquement la configuration OAuth depuis le serveur.
  - **`google_credentials`** : La CLI utilise les credentials d'application par défaut Google (ADC) pour s'authentifier auprès du serveur. Lorsque vous utilisez ce fournisseur, vous devez spécifier les scopes requis.
  - **`service_account_impersonation`** : La CLI usurpe l'identité d'un compte de service Google Cloud pour s'authentifier auprès du serveur. Utile pour accéder aux services protégés par IAP (conçu spécifiquement pour les services Cloud Run).

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

#### Usurpation de compte de service

Pour s'authentifier auprès d'un serveur avec l'usurpation de compte de service, vous devez définir `authProviderType` sur `service_account_impersonation` et fournir les propriétés suivantes :

- **`targetAudience`** (string) : L'ID client OAuth autorisé sur l'application protégée par IAP à laquelle vous essayez d'accéder.
- **`targetServiceAccount`** (string) : L'adresse e-mail du compte de service Google Cloud à usurper.

La CLI utilise vos credentials d'application par défaut (ADC) locaux pour générer un jeton d'identité OIDC pour le compte de service et l'audience spécifiés. Ce jeton est ensuite utilisé pour s'authentifier auprès du serveur MCP.

#### Instructions de configuration

1. **[Créez](https://cloud.google.com/iap/docs/oauth-client-creation) ou utilisez un ID client OAuth 2.0 existant.** Pour utiliser un ID client OAuth 2.0 existant, suivez les étapes dans [Comment partager des clients OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Ajoutez l'ID OAuth à la liste blanche pour l'[accès programmatique](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) de l'application.** Étant donné que Cloud Run n'est pas encore un type de ressource pris en charge dans gcloud iap, vous devez autoriser l'ID client sur le projet.
3. **Créez un compte de service.** [Documentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Lien Console Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Ajoutez à la fois le compte de service et les utilisateurs à la politique IAP** dans l'onglet "Sécurité" du service Cloud Run lui-même ou via gcloud.
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
        "Authorization": "Bearer votre-jeton-api",
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

## Examen approfondi du processus de découverte

Lorsque Qwen Code démarre, il effectue la découverte des serveurs MCP via le processus détaillé suivant :

### 1. Parcours des serveurs et connexion

Pour chaque serveur configuré dans `mcpServers` :

1. **Le suivi d'état commence :** L'état du serveur est défini sur `CONNECTING`
2. **Sélection du transport :** Basée sur les propriétés de configuration :
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Établissement de la connexion :** Le client MCP tente de se connecter avec le timeout configuré
4. **Gestion des erreurs :** Les échecs de connexion sont enregistrés et l'état du serveur est défini sur `DISCONNECTED`

### 2. Découverte d'outils

Lors d'une connexion réussie :

1. **Liste des outils :** Le client appelle le point de terminaison de liste d'outils du serveur MCP
2. **Validation des schémas :** La déclaration de fonction de chaque outil est validée
3. **Filtrage des outils :** Les outils sont filtrés en fonction des configurations `includeTools` et `excludeTools`
4. **Nettoyage des noms :** Les noms d'outils sont nettoyés pour répondre aux exigences de l'API Qwen :
   - Les caractères invalides (non alphanumériques, underscore, point, trait d'union) sont remplacés par des underscores
   - Les noms de plus de 63 caractères sont tronqués avec remplacement du milieu (`___`)

### 3. Résolution des conflits

Lorsque plusieurs serveurs exposent des outils avec le même nom :

1. **Le premier enregistrement gagne :** Le premier serveur à enregistrer un nom d'outil obtient le nom sans préfixe
2. **Ajout automatique du préfixe :** Les serveurs suivants obtiennent des noms préfixés : `serverName__toolName`
3. **Suivi du registre :** Le registre d'outils maintient les correspondances entre les noms de serveurs et leurs outils

### 4. Traitement des schémas

Les schémas des paramètres d'outils subissent un nettoyage pour la compatibilité avec l'API :

- **Les propriétés `$schema`** sont supprimées
- **`additionalProperties`** sont supprimés
- **`anyOf` avec `default`** ont leurs valeurs par défaut supprimées (compatibilité Vertex AI)
- **Traitement récursif** s'applique aux schémas imbriqués

### 5. Gestion des connexions

Après la découverte :

- **Connexions persistantes :** Les serveurs qui enregistrent avec succès des outils maintiennent leurs connexions
- **Nettoyage :** Les serveurs qui ne fournissent aucun outil utilisable voient leurs connexions fermées
- **Mises à jour d'état :** Les états finaux des serveurs sont définis sur `CONNECTED` ou `DISCONNECTED`

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
  return false; // Aucune confirmation nécessaire
}
```

#### Ajout dynamique à la liste blanche

Le système maintient des listes blanches internes pour :

- **Niveau serveur :** `serverName` → Tous les outils de ce serveur sont approuvés
- **Niveau outil :** `serverName.toolName` → Cet outil spécifique est approuvé

#### Gestion du choix de l'utilisateur

Lorsqu'une confirmation est requise, les utilisateurs peuvent choisir :

- **Exécuter une fois :** Exécuter uniquement cette fois-ci
- **Toujours autoriser cet outil :** Ajouter à la liste blanche au niveau de l'outil
- **Toujours autoriser ce serveur :** Ajouter à la liste blanche au niveau du serveur
- **Annuler :** Abandonner l'exécution

### 3. Exécution

Après confirmation (ou contournement de la confiance) :

1. **Préparation des paramètres :** Les arguments sont validés par rapport au schéma de l'outil
2. **Appel MCP :** L'outil `CallableTool` sous-jacent invoque le serveur avec :

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Nom original de l'outil serveur
       args: params,
     },
   ];
   ```

3. **Traitement de la réponse :** Les résultats sont formatés à la fois pour le contexte LLM et l'affichage utilisateur

### 4. Gestion de la réponse

Le résultat d'exécution contient :

- **`llmContent` :** Parties de la réponse brute pour le contexte du modèle de langage
- **`returnDisplay` :** Sortie formatée pour l'affichage utilisateur (souvent du JSON dans des blocs de code markdown)

## Comment interagir avec votre serveur MCP

### Utilisation de la commande `/mcp`

La commande `/mcp` fournit des informations complètes sur votre configuration de serveur MCP :

```bash
/mcp
```

Cela affiche :

- **Liste des serveurs :** Tous les serveurs MCP configurés
- **État de la connexion :** `CONNECTED`, `CONNECTING`, ou `DISCONNECTED`
- **Détails du serveur :** Résumé de la configuration (à l'exclusion des données sensibles)
- **Outils disponibles :** Liste des outils de chaque serveur avec descriptions
- **État de la découverte :** Statut global du processus de découverte

### Exemple de sortie `/mcp`

```
MCP Servers Status:

📡 pythonTools (CONNECTED)
  Commande : python -m my_mcp_server --port 8080
  Répertoire de travail : ./mcp-servers/python
  Timeout : 15000ms
  Outils : calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Commande : node dist/server.js --verbose
  Erreur : Connexion refusée

🐳 dockerizedServer (CONNECTED)
  Commande : docker run -i --rm -e API_KEY my-mcp-server:latest
  Outils : docker__deploy, docker__status

État de la découverte : COMPLETED
```
### Utilisation des outils

Une fois découverts, les outils MCP sont disponibles pour le modèle Qwen comme des outils intégrés. Le modèle va automatiquement :

1. **Sélectionner les outils appropriés** en fonction de vos demandes
2. **Présenter des boîtes de dialogue de confirmation** (sauf si le serveur est de confiance)
3. **Exécuter les outils** avec les paramètres appropriés
4. **Afficher les résultats** dans un format convivial

## Surveillance de l'état et dépannage

### États de connexion

L'intégration MCP suit plusieurs états :

#### Statut du serveur (`MCPServerStatus`)

- **`DISCONNECTED` :** Le serveur n'est pas connecté ou présente des erreurs
- **`CONNECTING` :** Tentative de connexion en cours
- **`CONNECTED` :** Le serveur est connecté et prêt

#### État de découverte (`MCPDiscoveryState`)

- **`NOT_STARTED` :** La découverte n'a pas commencé
- **`IN_PROGRESS` :** Découverte des serveurs en cours
- **`COMPLETED` :** Découverte terminée (avec ou sans erreurs)

### Problèmes courants et solutions

#### Le serveur ne se connecte pas

**Symptômes :** Le serveur affiche le statut `DISCONNECTED`

**Dépannage :**

1. **Vérifier la configuration :** Assurez-vous que `command`, `args` et `cwd` sont corrects
2. **Tester manuellement :** Exécutez directement la commande du serveur pour vérifier son fonctionnement
3. **Vérifier les dépendances :** Assurez-vous que tous les paquets requis sont installés
4. **Consulter les logs :** Recherchez des messages d'erreur dans la sortie CLI
5. **Vérifier les autorisations :** Assurez-vous que le CLI peut exécuter la commande du serveur

#### Aucun outil découvert

**Symptômes :** Le serveur se connecte mais aucun outil n'est disponible

**Dépannage :**

1. **Vérifier l'enregistrement des outils :** Assurez-vous que votre serveur enregistre effectivement des outils
2. **Vérifier le protocole MCP :** Confirmez que votre serveur implémente correctement le listing d'outils MCP
3. **Consulter les logs du serveur :** Vérifiez la sortie stderr pour les erreurs côté serveur
4. **Tester le listing d'outils :** Testez manuellement le point de terminaison de découverte d'outils de votre serveur

#### Les outils ne s'exécutent pas

**Symptômes :** Les outils sont découverts mais échouent lors de l'exécution

**Dépannage :**

1. **Validation des paramètres :** Assurez-vous que votre outil accepte les paramètres attendus
2. **Compatibilité des schémas :** Vérifiez que vos schémas d'entrée sont des JSON Schema valides
3. **Gestion des erreurs :** Vérifiez si votre outil lève des exceptions non gérées
4. **Problèmes de timeout :** Envisagez d'augmenter le paramètre `timeout`

#### Compatibilité du bac à sable

**Symptômes :** Les serveurs MCP échouent lorsque le bac à sable est activé

**Solutions :**

1. **Serveurs basés sur Docker :** Utilisez des conteneurs Docker qui incluent toutes les dépendances
2. **Accessibilité des chemins :** Assurez-vous que les exécutables du serveur sont disponibles dans le bac à sable
3. **Accès réseau :** Configurez le bac à sable pour autoriser les connexions réseau nécessaires
4. **Variables d'environnement :** Vérifiez que les variables d'environnement requises sont transmises

### Conseils de débogage

1. **Activer le mode debug :** Exécutez le CLI avec `--debug` pour une sortie détaillée
2. **Vérifier stderr :** La sortie stderr du serveur MCP est capturée et enregistrée (les messages INFO sont filtrés)
3. **Tester l'isolation :** Testez votre serveur MCP indépendamment avant de l'intégrer
4. **Configuration progressive :** Commencez par des outils simples avant d'ajouter des fonctionnalités complexes
5. **Utilisez `/mcp` fréquemment :** Surveillez l'état du serveur pendant le développement

## Remarques importantes

### Considérations de sécurité

- **Paramètres de confiance :** L'option `trust` ignore toutes les boîtes de dialogue de confirmation. À utiliser avec prudence et uniquement pour des serveurs que vous contrôlez totalement
- **Jetons d'accès :** Soyez vigilant lors de la configuration de variables d'environnement contenant des clés API ou des jetons
- **Compatibilité du bac à sable :** Lorsque vous utilisez le bac à sable, assurez-vous que les serveurs MCP sont disponibles dans cet environnement
- **Données privées :** L'utilisation de jetons d'accès personnel à portée large peut entraîner des fuites d'informations entre les dépôts

### Gestion des performances et des ressources

- **Persistance des connexions :** Le CLI maintient des connexions persistantes avec les serveurs qui enregistrent avec succès des outils
- **Nettoyage automatique :** Les connexions aux serveurs ne fournissant aucun outil sont automatiquement fermées
- **Gestion des timeouts :** Configurez des timeouts appropriés en fonction des caractéristiques de réponse de votre serveur
- **Surveillance des ressources :** Les serveurs MCP s'exécutent en tant que processus séparés et consomment des ressources système

### Compatibilité des schémas

- **Mode de conformité des schémas :** Par défaut (`schemaCompliance: "auto"`), les schémas d'outils sont transmis tels quels. Définissez `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` dans votre `settings.json` pour convertir les modèles au format Strict OpenAPI 3.0.
- **Transformations OpenAPI 3.0 :** Lorsque le mode `openapi_30` est activé, le système gère :
  - Types nullables : `["string", "null"]` -> `type: "string", nullable: true`
  - Valeurs Const : `const: "foo"` -> `enum: ["foo"]`
  - Limites exclusives : `exclusiveMinimum` numérique -> forme booléenne avec `minimum`
  - Suppression de mots-clés : `$schema`, `$id`, `dependencies`, `patternProperties`
- **Nettoyage des noms :** Les noms d'outils sont automatiquement nettoyés pour répondre aux exigences de l'API
- **Résolution des conflits :** Les conflits de noms d'outils entre serveurs sont résolus par un préfixage automatique

Cette intégration complète fait des serveurs MCP un moyen puissant d'étendre les capacités du CLI tout en maintenant la sécurité, la fiabilité et la facilité d'utilisation.

## Retour de contenu riche depuis les outils

Les outils MCP ne se limitent pas à renvoyer du texte simple. Vous pouvez renvoyer un contenu riche et multi-partie, comprenant du texte, des images, de l'audio et d'autres données binaires dans une seule réponse d'outil. Cela vous permet de créer des outils puissants capables de fournir des informations diverses au modèle en un seul tour.

Toutes les données renvoyées par l'outil sont traitées et envoyées au modèle comme contexte pour sa prochaine génération, lui permettant de raisonner ou de résumer les informations fournies.

### Comment ça fonctionne

Pour renvoyer un contenu riche, la réponse de votre outil doit respecter la spécification MCP pour un [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). Le champ `content` du résultat doit être un tableau d'objets `ContentBlock`. Le CLI traitera correctement ce tableau, en séparant le texte des données binaires et en les conditionnant pour le modèle.

Vous pouvez mélanger différents types de blocs de contenu dans le tableau `content`. Les types de blocs pris en charge incluent :

- `text`
- `image`
- `audio`
- `resource` (contenu intégré)
- `resource_link`

### Exemple : Renvoyer du texte et une image

Voici un exemple de réponse JSON valide d'un outil MCP qui renvoie à la fois une description textuelle et une image :

```json
{
  "content": [
    {
      "type": "text",
      "text": "Voici le logo que vous avez demandé."
    },
    {
      "type": "image",
      "data": "DONNÉES_IMAGE_ENCODÉES_EN_BASE64",
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

1.  Extraire tout le texte et le combiner en une seule partie `functionResponse` pour le modèle.
2.  Présenter les données de l'image comme une partie `inlineData` distincte.
3.  Fournir un résumé clair et convivial dans le CLI, indiquant que du texte et une image ont été reçus.

Cela vous permet de créer des outils sophistiqués capables de fournir un contexte riche et multimodal au modèle Qwen.

## Prompts MCP en tant que Slash Commands

En plus des outils, les serveurs MCP peuvent exposer des prompts prédéfinis exécutables comme des slash commands dans Qwen Code. Cela vous permet de créer des raccourcis pour des requêtes courantes ou complexes qui peuvent être facilement invoquées par leur nom.

### Définition de prompts sur le serveur

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

### Invocation des prompts

Une fois qu'un prompt est découvert, vous pouvez l'invoquer en utilisant son nom comme slash command. Le CLI analysera automatiquement les arguments.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, en utilisant des arguments positionnels :

```bash
/poem-writer "Qwen Code" reverent
```

Lorsque vous exécutez cette commande, le CLI exécute la méthode `prompts/get` sur le serveur MCP avec les arguments fournis. Le serveur est responsable de la substitution des arguments dans le modèle de prompt et de renvoyer le texte final du prompt. Le CLI envoie ensuite ce prompt au modèle pour exécution. Cela offre un moyen pratique d'automatiser et de partager des workflows courants.

## Gestion des serveurs MCP avec `qwen mcp`

Bien que vous puissiez toujours configurer les serveurs MCP en modifiant manuellement votre fichier `settings.json`, le CLI fournit un ensemble pratique de commandes pour gérer vos configurations de serveur par programmation. Ces commandes simplifient le processus d'ajout, de listage et de suppression de serveurs MCP sans avoir à éditer directement des fichiers JSON.

### Ajout d'un serveur (`qwen mcp add`)

La commande `add` configure un nouveau serveur MCP dans votre `settings.json`. Selon la portée (`-s, --scope`), il sera ajouté soit à la configuration utilisateur `~/.qwen/settings.json` soit à la configuration du projet `.qwen/settings.json`.

**Commande :**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>` : Un nom unique pour le serveur.
- `<commandOrUrl>` : La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`).
- `[args...]` : Arguments optionnels pour une commande `stdio`.

**Options (Drapeaux) :**

- `-s, --scope` : Portée de configuration (user ou project). [défaut : "project"]
- `-t, --transport` : Type de transport (stdio, sse, http). [défaut : "stdio"]
- `-e, --env` : Définir des variables d'environnement (ex. -e KEY=valeur).
- `-H, --header` : Définir des en-têtes HTTP pour les transports SSE et HTTP (ex. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout` : Définir le délai d'attente de connexion en millisecondes.
- `--trust` : Approuver le serveur (ignorer toutes les invites de confirmation d'appel d'outil).
- `--description` : Définir la description du serveur.
- `--include-tools` : Liste séparée par des virgules des outils à inclure.
- `--exclude-tools` : Liste séparée par des virgules des outils à exclure.
- `--oauth-client-id` : ID client OAuth pour l'authentification du serveur MCP.
- `--oauth-client-secret` : Secret client OAuth pour l'authentification du serveur MCP.
- `--oauth-redirect-uri` : URI de redirection OAuth (ex. `https://your-server.com/oauth/callback`). Par défaut `http://localhost:7777/oauth/callback` pour les configurations locales. **Important pour les déploiements distants** : Lorsque vous exécutez Qwen Code sur des serveurs distants/cloud, définissez ceci sur une URL accessible publiquement.
- `--oauth-authorization-url` : URL d'autorisation OAuth.
- `--oauth-token-url` : URL de jeton OAuth.
- `--oauth-scopes` : Périmètres OAuth (séparés par des virgules).

#### Ajout d'un serveur stdio

C'est le transport par défaut pour exécuter des serveurs locaux.

```bash
# Syntaxe de base
qwen mcp add <name> <command> [args...]

# Exemple : Ajout d'un serveur local
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Exemple : Ajout d'un serveur python local
qwen mcp add python-server python server.py --port 8080
```

#### Ajout d'un serveur HTTP

Ce transport est destiné aux serveurs utilisant le transport HTTP streamable.

```bash
# Syntaxe de base
qwen mcp add --transport http <name> <url>

# Exemple : Ajout d'un serveur HTTP
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Exemple : Ajout d'un serveur HTTP avec un en-tête d'authentification
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Ajout d'un serveur SSE

Ce transport est destiné aux serveurs utilisant Server-Sent Events (SSE).

```bash
# Syntaxe de base
qwen mcp add --transport sse <name> <url>

# Exemple : Ajout d'un serveur SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemple : Ajout d'un serveur SSE avec un en-tête d'authentification
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Exemple : Ajout d'un serveur SSE compatible OAuth
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### Gestion des serveurs (`/mcp`)

Pour visualiser et gérer tous les serveurs MCP actuellement configurés, ouvrez la boîte de dialogue `/mcp` dans une session interactive Qwen Code. Cette boîte de dialogue vous permet de :

- Voir tous les serveurs MCP avec leur état de connexion
- Activer/désactiver les serveurs
- Reconnecter les serveurs déconnectés
- Visualiser les outils et prompts fournis par chaque serveur
- Visualiser les logs du serveur

**Commande :**

```bash
qwen
```

Puis saisissez :

```text
/mcp
```

La boîte de dialogue de gestion fournit une interface visuelle montrant le nom de chaque serveur, les détails de configuration, l'état de connexion et les outils/prompts disponibles.

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

Cela recherchera et supprimera l'entrée "my-server" de l'objet `mcpServers` dans le fichier `settings.json` approprié en fonction de la portée (`-s, --scope`).