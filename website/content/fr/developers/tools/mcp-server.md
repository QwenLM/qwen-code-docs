# Serveurs MCP avec Qwen Code

Ce document fournit un guide pour configurer et utiliser les serveurs Model Context Protocol (MCP) avec Qwen Code.

## Qu'est-ce qu'un serveur MCP ?

Un serveur MCP est une application qui expose des outils et des ressources vers le CLI via le Model Context Protocol, lui permettant d'interagir avec des systèmes et des sources de données externes. Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services tels que les API.

Un serveur MCP permet au CLI de :

- **Découvrir des outils :** Lister les outils disponibles, leurs descriptions et leurs paramètres via des définitions de schéma standardisées.
- **Exécuter des outils :** Appeler des outils spécifiques avec des arguments définis et recevoir des réponses structurées.
- **Accéder aux ressources :** Lire des données à partir de ressources spécifiques (bien que le CLI se concentre principalement sur l'exécution d'outils).

Avec un serveur MCP, vous pouvez étendre les capacités du CLI pour effectuer des actions allant au-delà de ses fonctionnalités intégrées, telles que l'interaction avec des bases de données, des API, des scripts personnalisés ou des flux de travail spécialisés.

## Architecture de l'intégration principale

Qwen Code s'intègre aux serveurs MCP via un système sophistiqué de découverte et d'exécution intégré au package principal (`packages/core/src/tools/`) :

### Couche de découverte (`mcp-client.ts`)

Le processus de découverte est orchestré par `discoverMcpTools()`, qui :

1. **Parcourt les serveurs configurés** à partir de votre configuration `mcpServers` dans `settings.json`
2. **Établit les connexions** en utilisant les mécanismes de transport appropriés (Stdio, SSE ou HTTP diffusable)
3. **Récupère les définitions d'outils** depuis chaque serveur en utilisant le protocole MCP
4. **Nettoie et valide** les schémas d'outils pour garantir leur compatibilité avec l'API Qwen
5. **Enregistre les outils** dans le registre global des outils avec une résolution des conflits

### Couche d'exécution (`mcp-tool.ts`)

Chaque outil MCP découvert est encapsulé dans une instance `DiscoveredMCPTool` qui :

- **Gère la logique de confirmation** en fonction des paramètres de confiance du serveur et des préférences de l'utilisateur
- **Gère l'exécution des outils** en appelant le serveur MCP avec les paramètres appropriés
- **Traite les réponses** à la fois pour le contexte du LLM et pour l'affichage à l'utilisateur
- **Maintient l'état de la connexion** et gère les délais d'expiration

### Mécanismes de transport

La CLI prend en charge trois types de transport MCP :

- **Transport Stdio :** Lance un sous-processus et communique via stdin/stdout
- **Transport SSE :** Se connecte aux points de terminaison Server-Sent Events
- **Transport HTTP diffusable :** Utilise le streaming HTTP pour la communication

## Comment configurer votre serveur MCP

Qwen Code utilise la configuration `mcpServers` dans votre fichier `settings.json` pour localiser et se connecter aux serveurs MCP. Cette configuration prend en charge plusieurs serveurs avec différents mécanismes de transport.

### Configurer le serveur MCP dans settings.json

Vous pouvez configurer les serveurs MCP dans votre fichier `settings.json` de deux manières principales : via l'objet de niveau supérieur `mcpServers` pour les définitions spécifiques de serveur, et via l'objet `mcp` pour les paramètres globaux qui contrôlent la découverte et l'exécution des serveurs.

#### Paramètres globaux MCP (`mcp`)

L'objet `mcp` dans votre `settings.json` vous permet de définir des règles globales pour tous les serveurs MCP.

- **`mcp.serverCommand`** (chaîne de caractères) : Une commande globale pour démarrer un serveur MCP.
- **`mcp.allowed`** (tableau de chaînes de caractères) : Une liste de noms de serveurs MCP autorisés. Si ce paramètre est défini, seuls les serveurs de cette liste (correspondant aux clés de l'objet `mcpServers`) seront connectés.
- **`mcp.excluded`** (tableau de chaînes de caractères) : Une liste de noms de serveurs MCP à exclure. Les serveurs de cette liste ne seront pas connectés.

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

#### Requis (un des suivants)

- **`command`** (string) : Chemin vers l'exécutable pour le transport Stdio
- **`url`** (string) : URL du point de terminaison SSE (par exemple, `"http://localhost:8080/sse"`)
- **`httpUrl`** (string) : URL du point de terminaison de streaming HTTP

#### Facultatif

- **`args`** (string[]): Arguments de ligne de commande pour le transport Stdio
- **`headers`** (object): En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`
- **`env`** (object): Variables d'environnement pour le processus serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string): Répertoire de travail pour le transport Stdio
- **`timeout`** (number): Délai d'attente des requêtes en millisecondes (par défaut : 600 000ms = 10 minutes)
- **`trust`** (boolean): Lorsque `true`, contourne toutes les confirmations d'appel d'outils pour ce serveur (par défaut : `false`)
- **`includeTools`** (string[]): Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsque spécifié, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste blanche). Si non spécifié, tous les outils du serveur sont activés par défaut.
- **`excludeTools`** (string[]): Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Remarque :** `excludeTools` a priorité sur `includeTools` - si un outil se trouve dans les deux listes, il sera exclu.
- **`targetAudience`** (string): L'ID client OAuth figurant sur la liste blanche de l'application protégée par IAP que vous essayez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string): L'adresse e-mail du compte de service Google Cloud à utiliser. Utilisé avec `authProviderType: 'service_account_impersonation'`.

### Prise en charge d'OAuth pour les serveurs MCP distants

Qwen Code prend en charge l'authentification OAuth 2.0 pour les serveurs MCP distants utilisant les transports SSE ou HTTP. Cela permet un accès sécurisé aux serveurs MCP qui nécessitent une authentification.

#### Découverte automatique d'OAuth

Pour les serveurs prenant en charge la découverte d'OAuth, vous pouvez omettre la configuration OAuth et laisser le CLI la découvrir automatiquement :

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

- La détection lorsqu'un serveur nécessite une authentification OAuth (réponses 401)
- La découverte des points de terminaison OAuth à partir des métadonnées du serveur
- L'enregistrement dynamique du client si pris en charge
- La gestion du flux OAuth et des jetons

#### Flux d'authentification

Lors de la connexion à un serveur avec OAuth activé :

1. **La tentative de connexion initiale** échoue avec un code 401 Non autorisé
2. **La découverte OAuth** trouve les points de terminaison d'autorisation et de jeton
3. **Un navigateur s'ouvre** pour l'authentification de l'utilisateur (nécessite un accès local au navigateur)
4. **Le code d'autorisation** est échangé contre des jetons d'accès
5. **Les jetons sont stockés** de manière sécurisée pour une utilisation future
6. **La nouvelle tentative de connexion** réussit avec des jetons valides

#### Exigences relatives à la redirection du navigateur

**Important :** L'authentification OAuth nécessite que votre machine locale puisse :

- Ouvrir un navigateur web pour l'authentification
- Recevoir des redirections sur `http://localhost:7777/oauth/callback`

Cette fonctionnalité ne fonctionnera pas dans les environnements :

- Sans interface graphique et sans accès au navigateur
- En session SSH distante sans transfert X11
- Dans des environnements conteneurisés sans support de navigateur

#### Gestion de l'authentification OAuth

Utilisez la commande `/mcp auth` pour gérer l'authentification OAuth :

```bash

# Lister les serveurs nécessitant une authentification
/mcp auth
```

# S'authentifier avec un serveur spécifique
/mcp auth serverName

# Se réauthentifier si les jetons expirent
/mcp auth serverName
```

#### Propriétés de configuration OAuth

- **`enabled`** (booléen) : Activer OAuth pour ce serveur
- **`clientId`** (chaîne de caractères) : Identifiant du client OAuth (optionnel avec l'enregistrement dynamique)
- **`clientSecret`** (chaîne de caractères) : Secret du client OAuth (optionnel pour les clients publics)
- **`authorizationUrl`** (chaîne de caractères) : Point de terminaison d'autorisation OAuth (découvert automatiquement si omis)
- **`tokenUrl`** (chaîne de caractères) : Point de terminaison du jeton OAuth (découvert automatiquement si omis)
- **`scopes`** (string[]) : Portées OAuth requises
- **`redirectUri`** (chaîne de caractères) : URI de redirection personnalisée (valeur par défaut : `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (chaîne de caractères) : Nom du paramètre de requête pour les jetons dans les URL SSE
- **`audiences`** (string[]) : Audiences pour lesquelles le jeton est valide

#### Gestion des jetons

Les jetons OAuth sont automatiquement :

- **Stockés de manière sécurisée** dans `~/.qwen/mcp-oauth-tokens.json`
- **Actualisés** lorsqu'ils expirent (si des jetons d'actualisation sont disponibles)
- **Validés** avant chaque tentative de connexion
- **Nettoyés** lorsqu'ils sont invalides ou expirés

#### Type du fournisseur d'authentification

Vous pouvez spécifier le type du fournisseur d'authentification à l'aide de la propriété `authProviderType` :

- **`authProviderType`** (string) : Spécifie le fournisseur d'authentification. Peut être l'une des valeurs suivantes :
  - **`dynamic_discovery`** (valeur par défaut) : L'interface en ligne de commande découvrira automatiquement la configuration OAuth à partir du serveur.
  - **`google_credentials`** : L'interface en ligne de commande utilisera les identifiants par défaut des applications Google (ADC) pour s'authentifier auprès du serveur. Lorsque vous utilisez ce fournisseur, vous devez spécifier les scopes requis.
  - **`service_account_impersonation`** : L'interface en ligne de commande endossera un compte de service Google Cloud pour s'authentifier auprès du serveur. Ceci est utile pour accéder aux services protégés par IAP (cette fonctionnalité a été spécifiquement conçue pour les services Cloud Run).

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

Pour vous authentifier auprès d'un serveur en utilisant l'usurpation de compte de service, vous devez définir `authProviderType` à `service_account_impersonation` et fournir les propriétés suivantes :

- **`targetAudience`** (chaîne de caractères) : L'ID client OAuth figurant sur la liste autorisée de l'application protégée par IAP que vous essayez d'accéder.
- **`targetServiceAccount`** (chaîne de caractères) : L'adresse e-mail du compte de service Google Cloud à utiliser.

La CLI utilisera vos identifiants par défaut de l'application (ADC) locaux pour générer un jeton d'identité OIDC pour le compte de service et l'audience spécifiés. Ce jeton sera ensuite utilisé pour s'authentifier auprès du serveur MCP.

#### Instructions de configuration

1. **[Créez](https://cloud.google.com/iap/docs/oauth-client-creation) ou utilisez un ID client OAuth 2.0 existant.** Pour utiliser un ID client OAuth 2.0 existant, suivez les étapes décrites dans [Comment partager des clients OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Ajoutez l'ID OAuth à la liste blanche pour [l'accès programmatique](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) de l'application.** Puisque Cloud Run n'est pas encore un type de ressource pris en charge dans gcloud iap, vous devez ajouter l'ID client à la liste blanche au niveau du projet.
3. **Créez un compte de service.** [Documentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Lien vers la console Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Ajoutez à la fois le compte de service et les utilisateurs à la politique IAP** dans l'onglet "Sécurité" du service Cloud Run lui-même ou via gcloud.
5. **Accordez à tous les utilisateurs et groupes** qui accéderont au serveur MCP les autorisations nécessaires pour [usurper l'identité du compte de service](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (c'est-à-dire `roles/iam.serviceAccountTokenCreator`).
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

### Serveur MCP SSE avec impersonation de compte de service

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

## Exploration approfondie du processus de découverte

Lorsque Qwen Code démarre, il effectue une découverte du serveur MCP via le processus détaillé suivant :

### 1. Itération serveur et connexion

Pour chaque serveur configuré dans `mcpServers` :

1. **Le suivi de statut commence :** Le statut du serveur est défini sur `CONNECTING`
2. **Sélection du transport :** Basé sur les propriétés de configuration :
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Établissement de la connexion :** Le client MCP tente de se connecter avec le délai d'attente configuré
4. **Gestion des erreurs :** Les échecs de connexion sont journalisés et le statut du serveur est défini sur `DISCONNECTED`

### 2. Découverte des outils

Après une connexion réussie :

1. **Liste des outils :** Le client appelle le point de terminaison de liste des outils du serveur MCP
2. **Validation du schéma :** La déclaration de fonction de chaque outil est validée
3. **Filtrage des outils :** Les outils sont filtrés en fonction de la configuration `includeTools` et `excludeTools`
4. **Nettoyage des noms :** Les noms des outils sont nettoyés pour répondre aux exigences de l'API Qwen :
   - Les caractères non valides (non alphanumériques, trait de soulignement, point, trait d'union) sont remplacés par des traits de soulignement
   - Les noms dépassant 63 caractères sont tronqués avec un remplacement central (`___`)

### 3. Résolution des conflits

Lorsque plusieurs serveurs exposent des outils portant le même nom :

1. **Première inscription gagnante :** Le premier serveur à enregistrer un nom d'outil obtient le nom sans préfixe
2. **Préfixage automatique :** Les serveurs suivants obtiennent des noms préfixés : `nomServeur__nomOutil`
3. **Suivi du registre :** Le registre des outils maintient les mappages entre les noms des serveurs et leurs outils

### 4. Traitement du schéma

Les schémas de paramètres des outils subissent un nettoyage pour la compatibilité avec l'API :

- Les propriétés **`$schema`** sont supprimées
- Les propriétés **`additionalProperties`** sont supprimées
- Les propriétés **`anyOf` avec `default`** voient leurs valeurs par défaut supprimées (compatibilité Vertex AI)
- Le **traitement récursif** s'applique aux schémas imbriqués

### 5. Gestion des connexions

Après la découverte :

- **Connexions persistantes :** Les serveurs qui enregistrent avec succès des outils maintiennent leurs connexions
- **Nettoyage :** Les serveurs qui ne fournissent aucun outil utilisable voient leurs connexions fermées
- **Mises à jour de statut :** Les statuts finaux des serveurs sont définis sur `CONNECTED` ou `DISCONNECTED`

## Flux d'exécution des outils

Lorsque le modèle décide d'utiliser un outil MCP, le flux d'exécution suivant se produit :

### 1. Invocation de l'outil

Le modèle génère un `FunctionCall` avec :

- **Nom de l'outil :** Le nom enregistré (éventuellement préfixé)
- **Arguments :** Objet JSON correspondant au schéma de paramètres de l'outil

### 2. Processus de confirmation

Chaque `DiscoveredMCPTool` implémente une logique de confirmation sophistiquée :

#### Contournement basé sur la confiance

```typescript
if (this.trust) {
  return false; // Aucune confirmation nécessaire
}
```

#### Liste blanche dynamique

Le système maintient des listes blanches internes pour :

- **Niveau serveur :** `serverName` → Tous les outils de ce serveur sont de confiance
- **Niveau outil :** `serverName.toolName` → Cet outil spécifique est de confiance

#### Gestion du choix utilisateur

Lorsque la confirmation est requise, les utilisateurs peuvent choisir :

- **Continuer une fois :** Exécuter cette fois uniquement
- **Toujours autoriser cet outil :** Ajouter à la liste blanche au niveau outil
- **Toujours autoriser ce serveur :** Ajouter à la liste blanche au niveau serveur
- **Annuler :** Interrompre l'exécution

### 3. Exécution

Lors de la confirmation (ou contournement de la vérification) :

1. **Préparation des paramètres :** Les arguments sont validés par rapport au schéma de l'outil
2. **Appel MCP :** Le `CallableTool` sous-jacent invoque le serveur avec :

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Nom d'origine de l'outil serveur
       args: params,
     },
   ];
   ```

3. **Traitement de la réponse :** Les résultats sont formatés à la fois pour le contexte du modèle linguistique et pour l'affichage utilisateur

### 4. Gestion des réponses

Le résultat d'exécution contient :

- **`llmContent` :** Parties de réponse brutes pour le contexte du modèle linguistique
- **`returnDisplay` :** Sortie formatée pour l'affichage utilisateur (souvent du JSON dans des blocs de code markdown)

## Comment interagir avec votre serveur MCP

### Utilisation de la commande `/mcp`

La commande `/mcp` fournit des informations complètes sur votre configuration de serveur MCP :

```bash
/mcp
```

Cela affiche :

- **Liste des serveurs :** Tous les serveurs MCP configurés
- **Statut de connexion :** `CONNECTED`, `CONNECTING` ou `DISCONNECTED`
- **Détails du serveur :** Résumé de la configuration (hors données sensibles)
- **Outils disponibles :** Liste des outils de chaque serveur avec descriptions
- **État de découverte :** Statut global du processus de découverte

### Exemple de sortie `/mcp`

```
Statut des serveurs MCP :

📡 pythonTools (CONNECTED)
  Commande : python -m my_mcp_server --port 8080
  Répertoire de travail : ./mcp-servers/python
  Délai d'attente : 15000ms
  Outils : calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Commande : node dist/server.js --verbose
  Erreur : Connexion refusée

🐳 dockerizedServer (CONNECTED)
  Commande : docker run -i --rm -e API_KEY my-mcp-server:latest
  Outils : docker__deploy, docker__status

État de découverte : COMPLETED
```

### Utilisation des outils

Une fois découverts, les outils MCP sont disponibles pour le modèle Qwen comme des outils intégrés. Le modèle va automatiquement :

1. **Sélectionner les outils appropriés** en fonction de vos demandes
2. **Présenter des boîtes de confirmation** (sauf si le serveur est de confiance)
3. **Exécuter les outils** avec les paramètres appropriés
4. **Afficher les résultats** dans un format convivial

## Surveillance de l'état et dépannage

### États de connexion

L'intégration MCP suit plusieurs états :

#### État du serveur (`MCPServerStatus`)

- **`DISCONNECTED` :** Le serveur n'est pas connecté ou présente des erreurs
- **`CONNECTING` :** Tentative de connexion en cours
- **`CONNECTED` :** Le serveur est connecté et prêt

#### État de découverte (`MCPDiscoveryState`)

- **`NOT_STARTED` :** La découverte n'a pas commencé
- **`IN_PROGRESS` :** Découverte des serveurs en cours
- **`COMPLETED` :** La découverte est terminée (avec ou sans erreurs)

### Problèmes courants et solutions

#### Le serveur ne se connecte pas

**Symptômes :** Le serveur affiche l'état `DÉCONNECTÉ`

**Dépannage :**

1. **Vérifier la configuration :** Vérifiez que `command`, `args` et `cwd` sont corrects
2. **Tester manuellement :** Exécutez directement la commande du serveur pour vous assurer qu'elle fonctionne
3. **Vérifier les dépendances :** Assurez-vous que tous les packages requis sont installés
4. **Examiner les journaux :** Recherchez les messages d'erreur dans la sortie CLI
5. **Vérifier les autorisations :** Assurez-vous que la CLI peut exécuter la commande du serveur

#### Aucun outil découvert

**Symptômes :** Le serveur se connecte mais aucun outil n'est disponible

**Dépannage :**

1. **Vérifier l'enregistrement des outils :** Assurez-vous que votre serveur enregistre effectivement des outils
2. **Vérifier le protocole MCP :** Confirmez que votre serveur implémente correctement la liste des outils MCP
3. **Examiner les journaux du serveur :** Vérifiez la sortie stderr pour les erreurs côté serveur
4. **Tester la liste des outils :** Testez manuellement le point de terminaison de découverte des outils de votre serveur

#### Outils non exécutés

**Symptômes :** Les outils sont découverts mais échouent lors de l'exécution

**Dépannage :**

1. **Validation des paramètres :** Assurez-vous que votre outil accepte les paramètres attendus
2. **Compatibilité du schéma :** Vérifiez que vos schémas d'entrée sont des schémas JSON valides
3. **Gestion des erreurs :** Vérifiez si votre outil lance des exceptions non gérées
4. **Problèmes de délai d'attente :** Envisagez d'augmenter le paramètre `timeout`

#### Compatibilité avec le bac à sable

**Symptômes :** Les serveurs MCP échouent lorsque le mode sandbox est activé

**Solutions :**

1. **Serveurs basés sur Docker :** Utilisez des conteneurs Docker qui incluent toutes les dépendances
2. **Accessibilité des chemins :** Assurez-vous que les exécutables du serveur sont disponibles dans le sandbox
3. **Accès réseau :** Configurez le sandbox pour autoriser les connexions réseau nécessaires
4. **Variables d'environnement :** Vérifiez que les variables d'environnement requises sont transmises

### Conseils de débogage

1. **Activer le mode débogage :** Exécutez la CLI avec `--debug` pour une sortie détaillée
2. **Vérifier stderr :** La sortie d'erreur du serveur MCP est capturée et journalisée (les messages INFO sont filtrés)
3. **Test d'isolation :** Testez votre serveur MCP indépendamment avant l'intégration
4. **Configuration progressive :** Commencez par des outils simples avant d'ajouter des fonctionnalités complexes
5. **Utilisez `/mcp` fréquemment :** Surveillez l'état du serveur pendant le développement

## Notes importantes

### Considérations de sécurité

- **Paramètres de confiance :** L'option `trust` contourne toutes les boîtes de dialogue de confirmation. À utiliser avec prudence et uniquement pour les serveurs que vous contrôlez complètement
- **Jetons d'accès :** Soyez vigilant sur la sécurité lors de la configuration des variables d'environnement contenant des clés API ou des jetons
- **Compatibilité avec le sandboxing :** Lors de l'utilisation du sandboxing, assurez-vous que les serveurs MCP sont disponibles dans l'environnement sandbox
- **Données privées :** L'utilisation de jetons d'accès personnels à large portée peut entraîner une fuite d'informations entre les dépôts

### Performances et gestion des ressources

- **Persistance des connexions :** Le CLI maintient des connexions persistantes vers les serveurs qui enregistrent avec succès des outils
- **Nettoyage automatique :** Les connexions aux serveurs ne fournissant aucun outil sont automatiquement fermées
- **Gestion des délais d'attente :** Configurez des délais d'attente appropriés en fonction des caractéristiques de réponse de votre serveur
- **Surveillance des ressources :** Les serveurs MCP s'exécutent en tant que processus séparés et consomment des ressources système

### Compatibilité de schéma

- **Mode de conformité de schéma :** Par défaut (`schemaCompliance: "auto"`), les schémas d'outils sont transmis tels quels. Définissez `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` dans votre `settings.json` pour convertir les modèles au format Strict OpenAPI 3.0.
- **Transformations OpenAPI 3.0 :** Lorsque le mode `openapi_30` est activé, le système gère :
  - Types pouvant être nuls : `["string", "null"]` -> `type: "string", nullable: true`
  - Valeurs constantes : `const: "foo"` -> `enum: ["foo"]`
  - Limites exclusives : `exclusiveMinimum` numérique -> forme booléenne avec `minimum`
  - Suppression de mots-clés : `$schema`, `$id`, `dependencies`, `patternProperties`
- **Nettoyage des noms :** Les noms d'outils sont automatiquement nettoyés pour répondre aux exigences de l'API
- **Résolution des conflits :** Les conflits de nom d'outils entre serveurs sont résolus par préfixage automatique

Cette intégration complète fait des serveurs MCP un moyen puissant d'étendre les capacités du CLI tout en maintenant la sécurité, la fiabilité et la facilité d'utilisation.

## Retour de contenu riche à partir des outils

Les outils MCP ne sont pas limités au retour de texte simple. Vous pouvez retourner du contenu riche et multipartite, incluant du texte, des images, de l'audio et d'autres données binaires dans une seule réponse d'outil. Cela vous permet de créer des outils puissants qui peuvent fournir des informations diverses au modèle en un seul tour.

Toutes les données retournées par l'outil sont traitées et envoyées au modèle comme contexte pour sa prochaine génération, lui permettant de raisonner ou de résumer les informations fournies.

### Fonctionnement

Pour retourner du contenu riche, la réponse de votre outil doit se conformer à la spécification MCP pour un [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). Le champ `content` du résultat doit être un tableau d'objets `ContentBlock`. La CLI traitera correctement ce tableau, en séparant le texte des données binaires et en les empaquetant pour le modèle.

Vous pouvez mélanger différents types de blocs de contenu dans le tableau `content`. Les types de blocs pris en charge incluent :

- `text`
- `image`
- `audio`
- `resource` (contenu intégré)
- `resource_link`

### Exemple : Retour de texte et d'une image

Voici un exemple de réponse JSON valide provenant d'un outil MCP qui retourne à la fois une description textuelle et une image :

```json
{
  "content": [
    {
      "type": "text",
      "text": "Voici le logo que vous avez demandé."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
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
2.  Présenter les données de l'image comme une partie séparée `inlineData`.
3.  Fournir un résumé clair et convivial dans le CLI, indiquant que du texte et une image ont été reçus.

Cela vous permet de créer des outils sophistiqués capables de fournir un contexte riche et multimodal au modèle Qwen.

## Invite MCP en tant que commandes slash

En plus des outils, les serveurs MCP peuvent exposer des invites prédéfinies qui peuvent être exécutées en tant que commandes slash dans Qwen Code. Cela vous permet de créer des raccourcis pour les requêtes courantes ou complexes qui peuvent être facilement invoquées par leur nom.

### Définition des invites sur le serveur

Voici un petit exemple de serveur MCP stdio qui définit des invites :

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
    description: 'Écrire un joli haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Écrivez un haiku${mood ? ` avec l'humeur ${mood}` : ''} intitulé ${title}. Notez qu'un haiku comporte 5 syllabes suivies de 7 syllabes puis de 5 syllabes `,
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

### Invocation des invites

Une fois qu'une invite est découverte, vous pouvez l'invoquer en utilisant son nom comme commande slash. Le CLI gère automatiquement l'analyse des arguments.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, en utilisant des arguments positionnels :

```bash
/poem-writer "Qwen Code" reverent
```

Lorsque vous exécutez cette commande, le CLI exécute la méthode `prompts/get` sur le serveur MCP avec les arguments fournis. Le serveur est chargé de substituer les arguments dans le modèle d'invite et de renvoyer le texte final de l'invite. Le CLI envoie ensuite cette invite au modèle pour exécution. Cela fournit un moyen pratique d'automatiser et de partager des flux de travail courants.

## Gestion des serveurs MCP avec `qwen mcp`

Bien que vous puissiez toujours configurer les serveurs MCP en modifiant manuellement votre fichier `settings.json`, la CLI fournit un ensemble pratique de commandes pour gérer vos configurations de serveur par programmation. Ces commandes simplifient le processus d'ajout, de liste et de suppression des serveurs MCP sans avoir à éditer directement les fichiers JSON.

### Ajouter un serveur (`qwen mcp add`)

La commande `add` configure un nouveau serveur MCP dans votre `settings.json`. En fonction de la portée (`-s, --scope`), il sera ajouté soit à la configuration utilisateur `~/.qwen/settings.json`, soit au fichier de configuration du projet `.qwen/settings.json`.

**Commande :**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>` : Un nom unique pour le serveur.
- `<commandOrUrl>` : La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`).
- `[args...]` : Arguments facultatifs pour une commande `stdio`.

**Options (drapeaux) :**

- `-s, --scope` : Portée de la configuration (utilisateur ou projet). [valeur par défaut : "project"]
- `-t, --transport` : Type de transport (stdio, sse, http). [valeur par défaut : "stdio"]
- `-e, --env` : Définir les variables d'environnement (par exemple -e KEY=value).
- `-H, --header` : Définir les en-têtes HTTP pour les transports SSE et HTTP (par exemple -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout` : Définir le délai d'attente de la connexion en millisecondes.
- `--trust` : Faire confiance au serveur (ignorer toutes les demandes de confirmation d'appel d'outils).
- `--description` : Définir la description du serveur.
- `--include-tools` : Une liste d'outils à inclure, séparés par des virgules.
- `--exclude-tools` : Une liste d'outils à exclure, séparés par des virgules.

#### Ajouter un serveur stdio

C'est le transport par défaut pour exécuter des serveurs locaux.

```bash

# Syntaxe de base
qwen mcp add <nom> <commande> [args...]

# Exemple : Ajouter un serveur local
qwen mcp add mon-serveur-stdio -e API_KEY=123 /chemin/vers/serveur arg1 arg2 arg3

# Exemple : Ajouter un serveur python local
qwen mcp add serveur-python python server.py --port 8080
```

#### Ajouter un serveur HTTP

Ce transport est destiné aux serveurs qui utilisent le transport HTTP diffusable.

```bash

# Syntaxe de base
qwen mcp add --transport http <nom> <url>

# Exemple : Ajouter un serveur HTTP
qwen mcp add --transport http serveur-http https://api.example.com/mcp/

# Exemple : Ajouter un serveur HTTP avec un en-tête d'authentification
qwen mcp add --transport http http-securise https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Ajouter un serveur SSE

Ce transport est destiné aux serveurs qui utilisent les événements envoyés par le serveur (SSE).

```bash

# Syntaxe de base
qwen mcp add --transport sse <nom> <url>
```

# Exemple : Ajout d'un serveur SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemple : Ajout d'un serveur SSE avec un en-tête d'authentification
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Lister les serveurs (`qwen mcp list`)

Pour afficher tous les serveurs MCP actuellement configurés, utilisez la commande `list`. Elle affiche le nom de chaque serveur, les détails de configuration et l'état de connexion.

**Commande :**

```bash
qwen mcp list
```

**Exemple de sortie :**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Connecté
✓ http-server: https://api.example.com/mcp (http) - Connecté
✗ sse-server: https://api.example.com/sse (sse) - Déconnecté
```

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

Cela recherchera et supprimera l'entrée "my-server" de l'objet `mcpServers` dans le fichier `settings.json` approprié en fonction de la portée (`-s, --scope`).