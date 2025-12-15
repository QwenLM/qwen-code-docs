# Serveurs MCP avec Qwen Code

Ce document fournit un guide pour configurer et utiliser les serveurs Model Context Protocol (MCP) avec Qwen Code.

## Qu'est-ce qu'un serveur MCP ?

Un serveur MCP est une application qui expose des outils et des ressources à l'interface de ligne de commande (CLI) via le protocole Model Context Protocol, lui permettant d'interagir avec des systèmes externes et des sources de données. Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services tels que les API.

Un serveur MCP permet au CLI de :

- **Découvrir des outils :** Lister les outils disponibles, leurs descriptions et paramètres via des définitions de schéma standardisées.
- **Exécuter des outils :** Appeler des outils spécifiques avec des arguments définis et recevoir des réponses structurées.
- **Accéder aux ressources :** Lire des données depuis des ressources spécifiques (bien que le CLI se concentre principalement sur l'exécution d'outils).

Avec un serveur MCP, vous pouvez étendre les capacités du CLI pour effectuer des actions au-delà de ses fonctionnalités intégrées, telles que l'interaction avec des bases de données, des API, des scripts personnalisés ou des flux de travail spécialisés.

## Architecture d'intégration principale

Qwen Code s'intègre aux serveurs MCP via un système sophistiqué de découverte et d'exécution intégré dans le package principal (`packages/core/src/tools/`) :

### Couche de découverte (`mcp-client.ts`)

Le processus de découverte est orchestré par `discoverMcpTools()`, qui :

1. **Parcourt les serveurs configurés** à partir de la configuration `mcpServers` de votre `settings.json`
2. **Établit des connexions** en utilisant les mécanismes de transport appropriés (Stdio, SSE ou HTTP streamable)
3. **Récupère les définitions d'outils** depuis chaque serveur en utilisant le protocole MCP
4. **Nettoie et valide** les schémas d'outils pour assurer la compatibilité avec l'API Qwen
5. **Enregistre les outils** dans le registre global des outils avec résolution des conflits

### Couche d'exécution (`mcp-tool.ts`)

Chaque outil MCP découvert est encapsulé dans une instance de `DiscoveredMCPTool` qui :

- **Gère la logique de confirmation** en fonction des paramètres de confiance du serveur et des préférences utilisateur
- **Assure l'exécution des outils** en appelant le serveur MCP avec les paramètres appropriés
- **Traite les réponses** à la fois pour le contexte du LLM et l'affichage utilisateur
- **Maintient l'état de la connexion** et gère les délais d'attente

### Mécanismes de transport

L'interface CLI prend en charge trois types de transports MCP :

- **Transport Stdio :** Lance un sous-processus et communique via stdin/stdout
- **Transport SSE :** Se connecte aux points de terminaison Server-Sent Events
- **Transport HTTP streamable :** Utilise le streaming HTTP pour la communication

## Comment configurer votre serveur MCP

Qwen Code utilise la configuration `mcpServers` dans votre fichier `settings.json` pour localiser et se connecter aux serveurs MCP. Cette configuration prend en charge plusieurs serveurs avec différents mécanismes de transport.

### Configurer le serveur MCP dans settings.json

Vous pouvez configurer les serveurs MCP dans votre fichier `settings.json` de deux manières principales : via l'objet `mcpServers` de premier niveau pour des définitions spécifiques de serveurs, et via l'objet `mcp` pour des paramètres globaux qui contrôlent la découverte et l'exécution des serveurs.

#### Paramètres globaux MCP (`mcp`)

L'objet `mcp` dans votre `settings.json` vous permet de définir des règles globales pour tous les serveurs MCP.

- **`mcp.serverCommand`** (chaîne de caractères) : Une commande globale pour démarrer un serveur MCP.
- **`mcp.allowed`** (tableau de chaînes de caractères) : Une liste de noms de serveurs MCP à autoriser. Si cette option est définie, seuls les serveurs de cette liste (correspondant aux clés de l'objet `mcpServers`) seront connectés.
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

L'objet `mcpServers` est l'endroit où vous définissez chaque serveur MCP individuel auquel vous souhaitez que l'interface en ligne de commande se connecte.

### Structure de la configuration

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
{ ...le fichier contient d'autres objets de configuration
  "mcpServers": {
    "serverName": {
      "command": "chemin/vers/serveur",
      "args": ["--arg1", "valeur1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./répertoire-serveur",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### Propriétés de configuration

Chaque configuration de serveur prend en charge les propriétés suivantes :

#### Requis (l'une des suivantes)

- **`command`** (chaîne de caractères) : Chemin vers l'exécutable pour le transport Stdio
- **`url`** (chaîne de caractères) : URL du point de terminaison SSE (par exemple, `"http://localhost:8080/sse"`)
- **`httpUrl`** (chaîne de caractères) : URL du point de terminaison de streaming HTTP

#### Optionnel

- **`args`** (string[]) : Arguments de ligne de commande pour le transport Stdio
- **`headers`** (object) : En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`
- **`env`** (object) : Variables d'environnement pour le processus du serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string) : Répertoire de travail pour le transport Stdio
- **`timeout`** (number) : Délai d'expiration de la requête en millisecondes (par défaut : 600 000 ms = 10 minutes)
- **`trust`** (boolean) : Lorsque défini à `true`, contourne toutes les confirmations d'appel d'outils pour ce serveur (par défaut : `false`)
- **`includeTools`** (string[]) : Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsque spécifié, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste autorisée). Si non spécifié, tous les outils du serveur sont activés par défaut.
- **`excludeTools`** (string[]) : Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Remarque :** `excludeTools` prime sur `includeTools` – si un outil est présent dans les deux listes, il sera exclu.
- **`targetAudience`** (string) : L'ID client OAuth autorisé sur l'application protégée par IAP à laquelle vous tentez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string) : L'adresse e-mail du compte de service Google Cloud à impersonner. Utilisé avec `authProviderType: 'service_account_impersonation'`.

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

Le CLI effectuera automatiquement les opérations suivantes :

- Détecter quand un serveur requiert une authentification OAuth (réponses 401)
- Découvrir les points de terminaison OAuth à partir des métadonnées du serveur
- Effectuer un enregistrement dynamique du client si pris en charge
- Gérer le flux OAuth et la gestion des jetons

#### Flux d'authentification

Lors de la connexion à un serveur compatible OAuth :

1. **Tentative de connexion initiale** échoue avec l'erreur 401 Non autorisé
2. **Découverte OAuth** identifie les points de terminaison d'autorisation et de jetons
3. **Ouverture du navigateur** pour l'authentification utilisateur (nécessite un accès à un navigateur local)
4. **Code d'autorisation** est échangé contre des jetons d'accès
5. **Les jetons sont stockés** en toute sécurité pour une utilisation ultérieure
6. **Nouvelle tentative de connexion** réussit avec des jetons valides

#### Exigences pour la redirection du navigateur

**Important :** L'authentification OAuth nécessite que votre machine locale puisse :

- Ouvrir un navigateur web pour l'authentification
- Recevoir des redirections sur `http://localhost:7777/oauth/callback`

Cette fonctionnalité ne fonctionnera pas dans :

- Des environnements sans interface graphique ni accès au navigateur
- Des sessions SSH distantes sans transfert X11
- Des environnements conteneurisés sans prise en charge du navigateur

#### Gestion de l'authentification OAuth

Utilisez la commande `/mcp auth` pour gérer l'authentification OAuth :

```bash

# Liste des serveurs nécessitant une authentification
/mcp auth```

```markdown
# S'authentifier avec un serveur spécifique
/mcp auth serverName

# Ré-authentifier si les jetons expirent
/mcp auth serverName
```

#### Propriétés de configuration OAuth

- **`enabled`** (booléen) : Active OAuth pour ce serveur
- **`clientId`** (chaîne) : Identifiant du client OAuth (facultatif avec l'enregistrement dynamique)
- **`clientSecret`** (chaîne) : Secret du client OAuth (facultatif pour les clients publics)
- **`authorizationUrl`** (chaîne) : Point de terminaison d'autorisation OAuth (découvert automatiquement s'il est omis)
- **`tokenUrl`** (chaîne) : Point de terminaison de jeton OAuth (découvert automatiquement s'il est omis)
- **`scopes`** (tableau de chaînes) : Scopes OAuth requis
- **`redirectUri`** (chaîne) : URI de redirection personnalisée (par défaut : `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (chaîne) : Nom du paramètre de requête pour les jetons dans les URL SSE
- **`audiences`** (tableau de chaînes) : Audiences pour lesquelles le jeton est valide
```

#### Gestion des jetons

Les jetons OAuth sont automatiquement :

- **Stockés de manière sécurisée** dans `~/.qwen/mcp-oauth-tokens.json`
- **Actualisés** lorsqu'ils expirent (si les jetons d'actualisation sont disponibles)
- **Validés** avant chaque tentative de connexion
- **Nettoyés** lorsqu'ils sont invalides ou expirés

#### Type de fournisseur d'authentification

Vous pouvez spécifier le type de fournisseur d'authentification en utilisant la propriété `authProviderType` :

- **`authProviderType`** (chaîne de caractères) : Spécifie le fournisseur d'authentification. Peut être l'une des valeurs suivantes :
  - **`dynamic_discovery`** (par défaut) : L'interface CLI découvrira automatiquement la configuration OAuth depuis le serveur.
  - **`google_credentials`** : L'interface CLI utilisera les identifiants par défaut de l'application Google (ADC) pour s'authentifier auprès du serveur. Lorsque vous utilisez ce fournisseur, vous devez spécifier les portées requises.
  - **`service_account_impersonation`** : L'interface CLI usurpera l'identité d'un compte de service Google Cloud pour s'authentifier auprès du serveur. Cela est utile pour accéder aux services protégés par IAP (cela a été spécifiquement conçu pour les services Cloud Run).

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

Pour vous authentifier auprès d’un serveur en utilisant l’usurpation de compte de service, vous devez définir `authProviderType` sur `service_account_impersonation` et fournir les propriétés suivantes :

- **`targetAudience`** (chaîne de caractères) : L’ID client OAuth autorisé dans l’application protégée par IAP à laquelle vous tentez d’accéder.
- **`targetServiceAccount`** (chaîne de caractères) : L’adresse e-mail du compte de service Google Cloud à usurper.

L’interface CLI utilisera vos identifiants ADC (Application Default Credentials) locaux pour générer un jeton d’identité OIDC pour le compte de service et l’audience spécifiés. Ce jeton sera ensuite utilisé pour s’authentifier auprès du serveur MCP.

#### Instructions de configuration

1. **[Créer](https://cloud.google.com/iap/docs/oauth-client-creation) ou utiliser un identifiant client OAuth 2.0 existant.** Pour utiliser un identifiant client OAuth 2.0 existant, suivez les étapes décrites dans [Comment partager des clients OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Ajouter l'identifiant OAuth à la liste d'autorisation pour l'[accès programmatique](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) de l'application.** Étant donné que Cloud Run n'est pas encore un type de ressource pris en charge dans gcloud iap, vous devez ajouter l'identifiant client à la liste d'autorisation au niveau du projet.
3. **Créer un compte de service.** [Documentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Lien vers la console Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Ajouter le compte de service ainsi que les utilisateurs à la politique IAP** dans l'onglet « Sécurité » du service Cloud Run lui-même ou via gcloud.
5. **Accorder aux utilisateurs et groupes** qui accéderont au serveur MCP les autorisations nécessaires pour [usurper l'identité du compte de service](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (c'est-à-dire, `roles/iam.serviceAccountTokenCreator`).
6. **[Activer](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) l'API IAM Credentials** pour votre projet.

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

#### Serveur MCP avec filtrage des outils

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

### Serveur SSE MCP avec usurpation d'identité de compte de service

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

## Plongée dans le processus de découverte

Lorsque Qwen Code démarre, il effectue la découverte des serveurs MCP via le processus détaillé suivant :

### 1. Itération du serveur et connexion

Pour chaque serveur configuré dans `mcpServers` :

1. **Le suivi du statut commence :** Le statut du serveur est défini sur `CONNECTING`
2. **Sélection du transport :** En fonction des propriétés de configuration :
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Établissement de la connexion :** Le client MCP tente de se connecter avec le délai d'attente configuré
4. **Gestion des erreurs :** Les échecs de connexion sont enregistrés et le statut du serveur est défini sur `DISCONNECTED`

### 2. Découverte des outils

Une fois la connexion établie :

1. **Liste des outils :** Le client appelle le point de terminaison de liste d'outils du serveur MCP
2. **Validation du schéma :** La déclaration de fonction de chaque outil est validée
3. **Filtrage des outils :** Les outils sont filtrés en fonction de la configuration `includeTools` et `excludeTools`
4. **Nettoyage des noms :** Les noms des outils sont nettoyés pour respecter les exigences de l'API Qwen :
   - Les caractères non valides (non alphanumériques, traits de soulignement, points, tirets) sont remplacés par des traits de soulignement
   - Les noms de plus de 63 caractères sont tronqués avec remplacement au milieu (`___`)

### 3. Résolution des conflits

Lorsque plusieurs serveurs exposent des outils portant le même nom :

1. **Premier enregistrement prioritaire :** Le premier serveur à enregistrer un nom d'outil obtient le nom sans préfixe
2. **Préfixage automatique :** Les serveurs suivants reçoivent des noms préfixés : `serverName__toolName`
3. **Suivi dans le registre :** Le registre des outils maintient les correspondances entre les noms de serveurs et leurs outils

### 4. Traitement des schémas

Les schémas de paramètres des outils subissent une désinfection pour assurer la compatibilité avec l'API :

- Les propriétés **`$schema`** sont supprimées
- Les propriétés **`additionalProperties`** sont retirées
- Les clauses **`anyOf` accompagnées d'une valeur par défaut** voient cette dernière supprimée (pour compatibilité avec Vertex AI)
- Un traitement **récursif** est appliqué aux schémas imbriqués

### 5. Gestion des connexions

Après la découverte :

- **Connexions persistantes :** Les serveurs ayant réussi à enregistrer des outils conservent leur connexion
- **Nettoyage :** Les connexions vers les serveurs ne fournissant aucun outil utilisable sont fermées
- **Mise à jour du statut :** Le statut final des serveurs est défini comme `CONNECTED` ou `DISCONNECTED`

## Flux d'exécution des outils

Lorsque le modèle décide d'utiliser un outil MCP, le flux d'exécution suivant se produit :

### 1. Invocation de l'outil

Le modèle génère un `FunctionCall` contenant :

- **Nom de l'outil :** Le nom enregistré (éventuellement préfixé)
- **Arguments :** Un objet JSON correspondant au schéma de paramètres de l'outil

### 2. Processus de confirmation

Chaque `DiscoveredMCPTool` implémente une logique de confirmation sophistiquée :

#### Contournement basé sur la confiance

```typescript
if (this.trust) {
  return false; // Aucune confirmation nécessaire
}
```

#### Liste d'autorisation dynamique

Le système maintient des listes d'autorisation internes pour :

- **Niveau serveur :** `serverName` → Tous les outils de ce serveur sont approuvés
- **Niveau outil :** `serverName.toolName` → Cet outil spécifique est approuvé

#### Gestion du choix utilisateur

Lorsqu'une confirmation est requise, les utilisateurs peuvent choisir :

- **Procéder une fois :** Exécuter cette fois uniquement
- **Toujours autoriser cet outil :** Ajouter à la liste d'autorisation au niveau de l'outil
- **Toujours autoriser ce serveur :** Ajouter à la liste d'autorisation au niveau du serveur
- **Annuler :** Abandonner l'exécution

### 3. Exécution

Après confirmation (ou contournement de la confiance) :

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

3. **Traitement de la réponse :** Les résultats sont formatés à la fois pour le contexte du LLM et pour l'affichage utilisateur

### 4. Gestion de la réponse

Le résultat de l'exécution contient :

- **`llmContent` :** Parties de la réponse brute pour le contexte du modèle linguistique
- **`returnDisplay` :** Sortie formatée pour l'affichage utilisateur (souvent du JSON dans des blocs de code markdown)

## Comment interagir avec votre serveur MCP

### Utilisation de la commande `/mcp`

La commande `/mcp` fournit des informations complètes sur la configuration de votre serveur MCP :

```bash
/mcp
```

Celle-ci affiche :

- **Liste des serveurs :** Tous les serveurs MCP configurés
- **Statut de connexion :** `CONNECTED`, `CONNECTING`, ou `DISCONNECTED`
- **Détails du serveur :** Résumé de la configuration (sans données sensibles)
- **Outils disponibles :** Liste des outils de chaque serveur avec leurs descriptions
- **État de découverte :** Statut global du processus de découverte

### Exemple de sortie de la commande `/mcp`

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

1. **Sélectionner les outils appropriés** en fonction de vos requêtes
2. **Afficher des boîtes de dialogue de confirmation** (sauf si le serveur est approuvé)
3. **Exécuter les outils** avec les paramètres adéquats
4. **Afficher les résultats** dans un format convivial

## Surveillance du statut et dépannage

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

1. **Vérifier la configuration :** Assurez-vous que `command`, `args`, et `cwd` sont corrects
2. **Tester manuellement :** Exécutez directement la commande du serveur pour vérifier qu'elle fonctionne
3. **Vérifier les dépendances :** Assurez-vous que tous les paquets requis sont installés
4. **Consulter les journaux :** Recherchez les messages d'erreur dans la sortie CLI
5. **Vérifier les permissions :** Assurez-vous que le CLI peut exécuter la commande du serveur

#### Aucun outil découvert

**Symptômes :** Le serveur se connecte mais aucun outil n'est disponible

**Dépannage :**

1. **Vérifier l'enregistrement des outils :** Assurez-vous que votre serveur enregistre réellement des outils
2. **Vérifier le protocole MCP :** Confirmez que votre serveur implémente correctement le listage des outils MCP
3. **Consulter les journaux du serveur :** Vérifiez la sortie stderr pour détecter les erreurs côté serveur
4. **Tester le listage des outils :** Testez manuellement le point de terminaison de découverte d'outils de votre serveur

#### Outils non exécutés

**Symptômes :** Les outils sont découverts mais échouent lors de l'exécution

**Dépannage :**

1. **Validation des paramètres :** Assurez-vous que votre outil accepte les paramètres attendus
2. **Compatibilité du schéma :** Vérifiez que vos schémas d'entrée sont des schémas JSON valides
3. **Gestion des erreurs :** Vérifiez si votre outil lance des exceptions non gérées
4. **Problèmes de timeout :** Envisagez d'augmenter le paramètre `timeout`

#### Compatibilité du bac à sable

**Symptômes :** Les serveurs MCP échouent lorsque le bac à sable est activé

**Solutions :**

1. **Serveurs basés sur Docker :** Utilisez des conteneurs Docker qui incluent toutes les dépendances
2. **Accessibilité des chemins :** Assurez-vous que les exécutables du serveur sont disponibles dans le bac à sable
3. **Accès réseau :** Configurez le bac à sable pour autoriser les connexions réseau nécessaires
4. **Variables d'environnement :** Vérifiez que les variables d'environnement requises sont transmises

### Conseils de débogage

1. **Activer le mode débogage :** Exécutez l'interface CLI avec `--debug` pour obtenir une sortie verbeuse
2. **Vérifier stderr :** Les erreurs du serveur MCP sont capturées et journalisées (les messages INFO sont filtrés)
3. **Isoler les tests :** Testez votre serveur MCP indépendamment avant de l'intégrer
4. **Configuration incrémentielle :** Commencez par des outils simples avant d’ajouter des fonctionnalités complexes
5. **Utiliser `/mcp` fréquemment :** Surveillez l’état du serveur pendant le développement

## Notes importantes

### Considérations de sécurité

- **Paramètres de confiance :** L'option `trust` contourne toutes les boîtes de dialogue de confirmation. À utiliser avec prudence et uniquement pour les serveurs que vous contrôlez entièrement
- **Jetons d’accès :** Soyez vigilant sur la sécurité lors de la configuration de variables d’environnement contenant des clés API ou des jetons
- **Compatibilité bac à sable :** Si vous utilisez un environnement sandboxé, assurez-vous que les serveurs MCP soient accessibles depuis cet environnement
- **Données privées :** Utiliser des jetons personnels d'accès à portée large peut entraîner une fuite d'informations entre dépôts

### Performances et Gestion des Ressources

- **Persistance des connexions :** L'interface CLI maintient des connexions persistantes avec les serveurs qui enregistrent avec succès les outils
- **Nettoyage automatique :** Les connexions vers les serveurs ne fournissant aucun outil sont automatiquement fermées
- **Gestion des délais d'attente :** Configurez des délais appropriés en fonction des caractéristiques de réponse de votre serveur
- **Surveillance des ressources :** Les serveurs MCP s'exécutent en tant que processus distincts et consomment des ressources système

### Compatibilité des Schémas

- **Suppression de propriétés :** Le système supprime automatiquement certaines propriétés du schéma (`$schema`, `additionalProperties`) pour assurer la compatibilité avec l'API Qwen
- **Nettoyage des noms :** Les noms des outils sont automatiquement nettoyés pour respecter les exigences de l'API
- **Résolution des conflits :** Les conflits de noms d'outils entre serveurs sont résolus par préfixage automatique

Cette intégration complète fait des serveurs MCP un moyen puissant d'étendre les capacités de l'interface CLI tout en maintenant la sécurité, la fiabilité et la facilité d'utilisation.

## Retourner du contenu riche depuis les outils

Les outils MCP ne se limitent pas à retourner du texte simple. Vous pouvez renvoyer du contenu riche et multipartite, incluant du texte, des images, de l'audio et d'autres données binaires dans une seule réponse d'outil. Cela vous permet de créer des outils puissants capables de fournir diverses informations au modèle en un seul tour.

Toutes les données retournées par l'outil sont traitées et envoyées au modèle comme contexte pour sa prochaine génération, lui permettant de raisonner ou de résumer les informations fournies.

### Fonctionnement

Pour renvoyer du contenu riche, la réponse de votre outil doit respecter la spécification MCP pour un [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). Le champ `content` du résultat doit être un tableau d'objets `ContentBlock`. L'interface CLI traitera correctement ce tableau, en séparant le texte des données binaires et en les empaquetant pour le modèle.

Vous pouvez combiner différents types de blocs de contenu dans le tableau `content`. Les types de blocs pris en charge incluent :

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
2. Présenter les données de l'image comme une partie `inlineData` distincte.
3. Fournir un résumé clair et convivial dans la CLI, indiquant qu'à la fois du texte et une image ont été reçus.

Cela vous permet de créer des outils sophistiqués capables de fournir un contexte riche et multimodal au modèle Qwen.

## Invites MCP en tant que commandes slash

En plus des outils, les serveurs MCP peuvent exposer des invites prédéfinies qui peuvent être exécutées en tant que commandes slash dans Qwen Code. Cela vous permet de créer des raccourcis pour des requêtes courantes ou complexes qui peuvent être facilement invoquées par leur nom.

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

Une fois qu'un prompt est découvert, vous pouvez l'invoquer en utilisant son nom comme commande slash. L'interface CLI gérera automatiquement l'analyse des arguments.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, en utilisant des arguments positionnels :

```bash
/poem-writer "Qwen Code" reverent
```

Lorsque vous exécutez cette commande, l'interface CLI appelle la méthode `prompts/get` sur le serveur MCP avec les arguments fournis. Le serveur se charge de substituer les arguments dans le modèle de prompt et renvoie le texte final du prompt. L'interface CLI envoie ensuite ce prompt au modèle pour exécution. Cela offre un moyen pratique d'automatiser et de partager des flux de travail courants.

## Gestion des serveurs MCP avec `qwen mcp`

Bien que vous puissiez toujours configurer les serveurs MCP en modifiant manuellement votre fichier `settings.json`, l'interface en ligne de commande fournit un ensemble pratique de commandes pour gérer vos configurations de serveur de manière programmatique. Ces commandes simplifient le processus d'ajout, de listage et de suppression de serveurs MCP sans avoir besoin de modifier directement les fichiers JSON.

### Ajouter un serveur (`qwen mcp add`)

La commande `add` configure un nouveau serveur MCP dans votre fichier `settings.json`. Selon la portée (`-s, --scope`), il sera ajouté soit au fichier de configuration utilisateur `~/.qwen/settings.json`, soit au fichier de configuration du projet `.qwen/settings.json`.

**Commande :**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>` : Un nom unique pour le serveur.
- `<commandOrUrl>` : La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`).
- `[args...]` : Arguments facultatifs pour une commande `stdio`.

**Options (drapeaux) :**

- `-s, --scope` : Portée de la configuration (utilisateur ou projet). [par défaut : "project"]
- `-t, --transport` : Type de transport (stdio, sse, http). [par défaut : "stdio"]
- `-e, --env` : Définir des variables d'environnement (ex. : -e KEY=value).
- `-H, --header` : Définir des en-têtes HTTP pour les transports SSE et HTTP (ex. : -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout` : Définir le délai d'attente de connexion en millisecondes.
- `--trust` : Faire confiance au serveur (contourner toutes les invites de confirmation d'appel d'outils).
- `--description` : Définir la description du serveur.
- `--include-tools` : Une liste d'outils à inclure, séparés par des virgules.
- `--exclude-tools` : Une liste d'outils à exclure, séparés par des virgules.

#### Ajout d'un serveur stdio

Il s'agit du transport par défaut pour l'exécution de serveurs locaux.

```bash

# Syntaxe de base
qwen mcp add <nom> <commande> [arguments...]

# Exemple : Ajout d'un serveur local
qwen mcp add mon-serveur-stdio -e API_KEY=123 /chemin/vers/le/serveur arg1 arg2 arg3

# Exemple : Ajout d'un serveur Python local
qwen mcp add serveur-python python server.py --port 8080
```

#### Ajout d'un serveur HTTP

Ce transport est destiné aux serveurs qui utilisent le transport HTTP avec flux.

```bash

# Syntaxe de base
qwen mcp add --transport http <nom> <url>

# Exemple : Ajout d'un serveur HTTP
qwen mcp add --transport http serveur-http https://api.exemple.com/mcp/

# Exemple : Ajout d'un serveur HTTP avec un en-tête d'authentification
qwen mcp add --transport http http-securise https://api.exemple.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Ajout d'un serveur SSE

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

### Liste des serveurs (`qwen mcp list`)

Pour afficher tous les serveurs MCP actuellement configurés, utilisez la commande `list`. Elle affiche le nom de chaque serveur, ses détails de configuration et son statut de connexion.

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

Cette commande recherchera et supprimera l'entrée "my-server" de l'objet `mcpServers` dans le fichier `settings.json` approprié, en fonction de la portée (`-s, --scope`).