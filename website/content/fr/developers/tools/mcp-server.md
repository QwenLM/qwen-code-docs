# Serveurs MCP avec Qwen Code

Ce document fournit un guide pour configurer et utiliser des serveurs Model Context Protocol (MCP) avec Qwen Code.

## Qu’est-ce qu’un serveur MCP ?

Un serveur MCP est une application qui expose des outils et des ressources à l’interface en ligne de commande (CLI) via le *Model Context Protocol* (protocole de contexte de modèle), ce qui lui permet d’interagir avec des systèmes externes et des sources de données. Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d’autres services, tels que des API.

Un serveur MCP permet à la CLI de :

- **Découvrir des outils** : lister les outils disponibles, leurs descriptions et leurs paramètres grâce à des définitions de schéma standardisées.
- **Exécuter des outils** : appeler des outils spécifiques avec des arguments définis et recevoir des réponses structurées.
- **Accéder à des ressources** : lire des données depuis des ressources spécifiques (bien que la CLI se concentre principalement sur l’exécution d’outils).

Grâce à un serveur MCP, vous pouvez étendre les fonctionnalités de la CLI pour effectuer des actions allant au-delà de ses fonctionnalités intégrées, par exemple interagir avec des bases de données, des API, des scripts personnalisés ou des flux de travail spécialisés.

## Architecture fondamentale d’intégration

Qwen Code s’intègre aux serveurs MCP via un système sophistiqué de découverte et d’exécution intégré au package principal (`packages/core/src/tools/`) :

### Couche de découverte (`mcp-client.ts`)

Le processus de découverte est orchestré par la fonction `discoverMcpTools()`, qui :

1. **Parcourt les serveurs configurés** listés dans la configuration `mcpServers` de votre fichier `settings.json`
2. **Établit des connexions** à l’aide des mécanismes de transport appropriés (Stdio, SSE ou HTTP streamable)
3. **Récupère les définitions des outils** depuis chaque serveur en utilisant le protocole MCP
4. **Nettoie et valide** les schémas des outils afin de garantir leur compatibilité avec l’API Qwen
5. **Enregistre les outils** dans le registre global des outils, avec résolution des conflits

### Couche d’exécution (`mcp-tool.ts`)

Chaque outil MCP détecté est encapsulé dans une instance `DiscoveredMCPTool`, qui :

- **Gère la logique de confirmation**, en fonction des paramètres de confiance du serveur et des préférences utilisateur  
- **Orchestre l’exécution de l’outil**, en appelant le serveur MCP avec les paramètres appropriés  
- **Traite les réponses**, à la fois pour le contexte du modèle de langage (LLM) et pour l’affichage à l’utilisateur  
- **Gère l’état de la connexion** et gère les délais d’expiration  

### Mécanismes de transport

L’interface en ligne de commande (CLI) prend en charge trois types de transport MCP :

- **Transport Stdio** : lance un sous-processus et communique via `stdin`/`stdout`  
- **Transport SSE (Server-Sent Events)** : se connecte à des points de terminaison SSE  
- **Transport HTTP diffusable (streamable)** : utilise le streaming HTTP pour la communication  

## Comment configurer votre serveur MCP

Qwen Code utilise la configuration `mcpServers` dans votre fichier `settings.json` pour localiser et se connecter aux serveurs MCP. Cette configuration permet de spécifier plusieurs serveurs, chacun pouvant utiliser un mécanisme de transport différent.

### Configurer le serveur MCP dans le fichier settings.json

Vous pouvez configurer les serveurs MCP dans votre fichier `settings.json` de deux manières principales : via l’objet de premier niveau `mcpServers` pour définir des serveurs spécifiques, et via l’objet `mcp` pour définir des paramètres globaux qui contrôlent la découverte et l’exécution des serveurs.

#### Paramètres globaux MCP (`mcp`)

L’objet `mcp` dans votre fichier `settings.json` vous permet de définir des règles globales applicables à tous les serveurs MCP.

- **`mcp.serverCommand`** (chaîne de caractères) : Commande globale permettant de démarrer un serveur MCP.  
- **`mcp.allowed`** (tableau de chaînes de caractères) : Liste des noms de serveurs MCP autorisés. Si ce paramètre est défini, seuls les serveurs figurant dans cette liste (correspondant aux clés de l’objet `mcpServers`) seront connectés.  
- **`mcp.excluded`** (tableau de chaînes de caractères) : Liste des noms de serveurs MCP exclus. Les serveurs figurant dans cette liste ne seront pas connectés.

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

L’objet `mcpServers` permet de définir chaque serveur MCP individuel auquel l’interface en ligne de commande (CLI) doit se connecter.

### Structure de la configuration

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
{ ...le fichier contient d'autres objets de configuration
  "mcpServers": {
    "serverName": {
      "command": "chemin/vers/le/serveur",
      "args": ["--arg1", "valeur1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./repertoire-du-serveur",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### Propriétés de la configuration

Chaque configuration de serveur prend en charge les propriétés suivantes :

#### Obligatoires (l’une des suivantes)

- **`command`** (chaîne de caractères) : Chemin vers l’exécutable utilisé pour le transport Stdio  
- **`url`** (chaîne de caractères) : URL du point de terminaison SSE (par exemple, `"http://localhost:8080/sse"`)  
- **`httpUrl`** (chaîne de caractères) : URL du point de terminaison HTTP avec diffusion en continu

#### Facultatif

- **`args`** (tableau de chaînes) : Arguments de ligne de commande pour le transport Stdio  
- **`headers`** (objet) : En-têtes HTTP personnalisés lors de l’utilisation de `url` ou `httpUrl`  
- **`env`** (objet) : Variables d’environnement pour le processus serveur. Les valeurs peuvent faire référence à des variables d’environnement à l’aide de la syntaxe `$VAR_NAME` ou `${VAR_NAME}`  
- **`cwd`** (chaîne) : Répertoire de travail pour le transport Stdio  
- **`timeout`** (nombre) : Délai d’expiration de la requête en millisecondes (par défaut : 600 000 ms = 10 minutes)  
- **`trust`** (booléen) : Lorsque cette valeur est définie sur `true`, toutes les confirmations d’appel d’outil sont contournées pour ce serveur (par défaut : `false`)  
- **`includeTools`** (tableau de chaînes) : Liste des noms d’outils à inclure depuis ce serveur MCP. Lorsqu’elle est spécifiée, seuls les outils figurant dans cette liste seront disponibles depuis ce serveur (comportement de liste blanche). Si elle n’est pas spécifiée, tous les outils du serveur sont activés par défaut.  
- **`excludeTools`** (tableau de chaînes) : Liste des noms d’outils à exclure de ce serveur MCP. Les outils figurant dans cette liste ne seront pas accessibles au modèle, même s’ils sont exposés par le serveur. **Remarque :** `excludeTools` a priorité sur `includeTools` — si un outil figure dans les deux listes, il sera exclu.  
- **`targetAudience`** (chaîne) : ID client OAuth autorisé sur l’application protégée par IAP que vous tentez d’accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.  
- **`targetServiceAccount`** (chaîne) : Adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.

### Prise en charge d’OAuth pour les serveurs MCP distants

Qwen Code prend en charge l’authentification OAuth 2.0 pour les serveurs MCP distants utilisant les transports SSE ou HTTP. Cela permet un accès sécurisé aux serveurs MCP nécessitant une authentification.

#### Découverte automatique d’OAuth

Pour les serveurs prenant en charge la découverte OAuth, vous pouvez omettre la configuration OAuth et laisser l’interface CLI la détecter automatiquement :

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

L’interface CLI effectue automatiquement les opérations suivantes :

- Détecte quand un serveur requiert une authentification OAuth (réponses 401)
- Découvre les points de terminaison OAuth à partir des métadonnées du serveur
- Effectue l’inscription dynamique du client, si prise en charge
- Gère le flux OAuth et la gestion des jetons

#### Flux d’authentification

Lors de la connexion à un serveur prenant en charge OAuth :

1. La **tentative de connexion initiale** échoue avec le code d’erreur 401 (Non autorisé).
2. La **découverte OAuth** identifie les points de terminaison d’autorisation et de jeton.
3. Un **navigateur s’ouvre** pour l’authentification de l’utilisateur (nécessite un accès à un navigateur local).
4. Le **code d’autorisation** est échangé contre des jetons d’accès.
5. Les **jetons sont stockés** de façon sécurisée pour une utilisation ultérieure.
6. La **nouvelle tentative de connexion** réussit grâce aux jetons valides.

#### Exigences concernant la redirection du navigateur

**Important :** L’authentification OAuth exige que votre machine locale puisse :

- Ouvrir un navigateur web pour l’authentification.
- Recevoir des redirections sur `http://localhost:7777/oauth/callback`.

Cette fonctionnalité ne fonctionne pas dans les environnements suivants :

- Les environnements sans interface graphique (« headless ») n’offrant pas d’accès à un navigateur.
- Les sessions SSH distantes sans transfert X11.
- Les environnements conteneurisés ne disposant pas d’un support navigateur.

#### Gestion de l’authentification OAuth

Utilisez la commande `/mcp auth` pour gérer l’authentification OAuth :

```bash

# Liste les serveurs nécessitant une authentification
/mcp auth

# S’authentifier auprès d’un serveur spécifique  
`/mcp auth serverName`

# Se réauthentifier si les jetons expirent  
`/mcp auth serverName`  

#### Propriétés de configuration OAuth  

- **`enabled`** (booléen) : Activez OAuth pour ce serveur.  
- **`clientId`** (chaîne de caractères) : Identifiant client OAuth (facultatif avec l’inscription dynamique).  
- **`clientSecret`** (chaîne de caractères) : Secret client OAuth (facultatif pour les clients publics).  
- **`authorizationUrl`** (chaîne de caractères) : Point de terminaison d’autorisation OAuth (découvert automatiquement si omis).  
- **`tokenUrl`** (chaîne de caractères) : Point de terminaison de jeton OAuth (découvert automatiquement si omis).  
- **`scopes`** (tableau de chaînes de caractères) : Portées OAuth requises.  
- **`redirectUri`** (chaîne de caractères) : URI de redirection personnalisée (valeur par défaut : `http://localhost:7777/oauth/callback`).  
- **`tokenParamName`** (chaîne de caractères) : Nom du paramètre de requête utilisé pour les jetons dans les URL SSE.  
- **`audiences`** (tableau de chaînes de caractères) : Publics pour lesquels le jeton est valide.

#### Gestion des jetons

Les jetons OAuth sont gérés automatiquement de la manière suivante :

- **Stockés de façon sécurisée** dans `~/.qwen/mcp-oauth-tokens.json`
- **Actualisés** lorsqu’ils expirent (si des jetons d’actualisation sont disponibles)
- **Validés** avant chaque tentative de connexion
- **Supprimés** lorsqu’ils sont invalides ou expirés

#### Type du fournisseur d’authentification

Vous pouvez spécifier le type du fournisseur d’authentification à l’aide de la propriété `authProviderType` :

- **`authProviderType`** (chaîne de caractères) : Spécifie le fournisseur d’authentification. Peut prendre l’une des valeurs suivantes :
  - **`dynamic_discovery`** (valeur par défaut) : L’interface CLI détectera automatiquement la configuration OAuth depuis le serveur.
  - **`google_credentials`** : L’interface CLI utilisera les identifiants par défaut de l’application Google (ADC) pour s’authentifier auprès du serveur. Lorsque vous utilisez ce fournisseur, vous devez spécifier les étendues (scopes) requises.
  - **`service_account_impersonation`** : L’interface CLI empruntera l’identité d’un compte de service Google Cloud afin de s’authentifier auprès du serveur. Cette méthode est utile pour accéder à des services protégés par IAP (celle-ci a été spécifiquement conçue pour les services Cloud Run).

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

#### Usurpation d’identité d’un compte de service

Pour vous authentifier auprès d’un serveur à l’aide de l’usurpation d’identité d’un compte de service, vous devez définir `authProviderType` sur `service_account_impersonation` et fournir les propriétés suivantes :

- **`targetAudience`** (chaîne de caractères) : L’ID client OAuth autorisé sur l’application protégée par IAP à laquelle vous tentez d’accéder.
- **`targetServiceAccount`** (chaîne de caractères) : L’adresse e-mail du compte de service Google Cloud à usurper.

L’interface en ligne de commande (CLI) utilisera vos identifiants par défaut applicatifs (ADC) locaux pour générer un jeton d’identité OIDC pour le compte de service et l’audience spécifiés. Ce jeton sera ensuite utilisé pour s’authentifier auprès du serveur MCP.

#### Instructions de configuration

1. **[Créez](https://cloud.google.com/iap/docs/oauth-client-creation) un identifiant client OAuth 2.0 ou utilisez-en un existant.** Pour utiliser un identifiant client OAuth 2.0 existant, suivez les étapes décrites dans la section [Comment partager des clients OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Ajoutez l’identifiant OAuth à la liste autorisée pour l’[accès programmatique](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) à l’application.** Comme Cloud Run n’est pas encore un type de ressource pris en charge par `gcloud iap`, vous devez ajouter manuellement l’identifiant client à la liste autorisée au niveau du projet.
3. **Créez un compte de service.** [Documentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Lien vers la console Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Ajoutez à la fois le compte de service et les utilisateurs à la stratégie IAP**, soit dans l’onglet « Sécurité » du service Cloud Run lui-même, soit via `gcloud`.
5. **Accordez à tous les utilisateurs et groupes** qui accéderont au serveur MCP les autorisations nécessaires pour [usurper l’identité du compte de service](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (c’est-à-dire le rôle `roles/iam.serviceAccountTokenCreator`).
6. **[Activez](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) l’API IAM Credentials** pour votre projet.

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

### Serveur MCP SSE avec l’usurpation d’identité de compte de service

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

## Approfondissement du processus de découverte

Lorsque Qwen Code démarre, il effectue la découverte des serveurs MCP selon le processus détaillé suivant :

### 1. Itération et connexion au serveur

Pour chaque serveur configuré dans `mcpServers` :

1. **Démarrage du suivi de l’état** : L’état du serveur est défini sur `CONNECTING`.
2. **Sélection du transport** : Selon les propriétés de configuration :
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Établissement de la connexion** : Le client MCP tente de se connecter avec le délai d’attente configuré.
4. **Gestion des erreurs** : Les échecs de connexion sont journalisés et l’état du serveur est défini sur `DISCONNECTED`.

### 2. Découverte des outils

Une fois la connexion établie avec succès :

1. **Liste des outils :** Le client appelle le point de terminaison de liste des outils du serveur MCP.
2. **Validation du schéma :** La déclaration de fonction de chaque outil est validée.
3. **Filtrage des outils :** Les outils sont filtrés en fonction de la configuration `includeTools` et `excludeTools`.
4. **Nettoyage des noms :** Les noms des outils sont normalisés pour respecter les exigences de l’API Qwen :
   - Les caractères invalides (non alphanumériques, ni souligné `_`, ni point `.`, ni trait d’union `-`) sont remplacés par des soulignés `_`.
   - Les noms dépassant 63 caractères sont tronqués avec un remplacement au milieu (`___`).

### 3. Résolution des conflits

Lorsque plusieurs serveurs exposent des outils portant le même nom :

1. **Le premier inscrit l’emporte :** Le premier serveur à enregistrer un nom d’outil obtient ce nom sans préfixe.
2. **Préfixage automatique :** Les serveurs suivants reçoivent des noms préfixés sous la forme `nomDuServeur__nomDeLOutil`.
3. **Suivi dans le registre :** Le registre des outils conserve les associations entre les noms des serveurs et leurs outils respectifs.

### 4. Traitement des schémas

Les schémas de paramètres des outils sont assainis afin d’assurer leur compatibilité avec l’API :

- Les propriétés **`$schema`** sont supprimées  
- Les propriétés **`additionalProperties`** sont supprimées  
- Les valeurs par défaut dans les blocs **`anyOf`** sont supprimées (pour compatibilité avec Vertex AI)  
- Un **traitement récursif** est appliqué aux schémas imbriqués  

### 5. Gestion des connexions

Après la découverte :

- **Connexions persistantes :** les serveurs ayant enregistré avec succès des outils conservent leurs connexions  
- **Nettoyage :** les connexions des serveurs ne fournissant aucun outil utilisable sont fermées  
- **Mises à jour d’état :** les états finaux des serveurs sont définis sur `CONNECTED` ou `DISCONNECTED`  

## Flux d’exécution des outils

Lorsque le modèle décide d’utiliser un outil MCP, le flux d’exécution suivant est déclenché :

### 1. Appel de l’outil

Le modèle génère un objet `FunctionCall` contenant :

- **Nom de l’outil :** le nom enregistré (éventuellement préfixé)  
- **Arguments :** un objet JSON conforme au schéma des paramètres de l’outil

### 2. Processus de confirmation

Chaque `DiscoveredMCPTool` implémente une logique sophistiquée de confirmation :

#### Contournement basé sur la confiance

```typescript
if (this.trust) {
  return false; // Aucune confirmation requise
}
```

#### Autorisation dynamique

Le système maintient des listes d’autorisation internes pour :

- **Niveau serveur :** `serverName` → Tous les outils provenant de ce serveur sont approuvés  
- **Niveau outil :** `serverName.toolName` → Cet outil spécifique est approuvé

#### Gestion des choix de l’utilisateur

Lorsqu’une confirmation est requise, l’utilisateur peut choisir :

- **Exécuter une fois :** Exécution uniquement pour cette instance  
- **Autoriser systématiquement cet outil :** Ajout à la liste d’autorisation au niveau de l’outil  
- **Autoriser systématiquement ce serveur :** Ajout à la liste d’autorisation au niveau du serveur  
- **Annuler :** Interrompre l’exécution

### 3. Exécution

Une fois la confirmation fournie (ou le contournement de la vérification de confiance) :

1. **Préparation des paramètres :** Les arguments sont validés selon le schéma de l’outil.
2. **Appel MCP :** Le `CallableTool` sous-jacent invoque le serveur avec :

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Nom d’origine de l’outil côté serveur
       args: params,
     },
   ];
   ```

3. **Traitement de la réponse :** Les résultats sont mis en forme à la fois pour le contexte du modèle linguistique (LLM) et pour l’affichage utilisateur.

### 4. Gestion des réponses

Le résultat de l’exécution contient :

- **`llmContent` :** Parties brutes de la réponse destinées au contexte du modèle linguistique (LLM) ;
- **`returnDisplay` :** Sortie mise en forme destinée à l’affichage utilisateur (souvent au format JSON, dans des blocs de code Markdown).

## Comment interagir avec votre serveur MCP

### Utilisation de la commande `/mcp`

La commande `/mcp` fournit des informations complètes sur votre configuration de serveur MCP :

```bash
/mcp
```

Cela affiche :

- **Liste des serveurs :** Tous les serveurs MCP configurés  
- **État de la connexion :** `CONNECTÉ`, `EN COURS DE CONNEXION` ou `DÉCONNECTÉ`  
- **Détails du serveur :** Résumé de la configuration (à l’exception des données sensibles)  
- **Outils disponibles :** Liste des outils fournis par chaque serveur, accompagnée de leur description  
- **État de la découverte :** Statut global du processus de découverte  

### Exemple de sortie de `/mcp`

```
État des serveurs MCP :

📡 pythonTools (CONNECTÉ)
  Commande : python -m my_mcp_server --port 8080
  Répertoire de travail : ./mcp-servers/python
  Délai d’attente : 15000 ms
  Outils : calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DÉCONNECTÉ)
  Commande : node dist/server.js --verbose
  Erreur : Connexion refusée

🐳 dockerizedServer (CONNECTÉ)
  Commande : docker run -i --rm -e API_KEY my-mcp-server:latest
  Outils : docker__deploy, docker__status

État de la découverte : TERMINÉ
```

### Utilisation des outils

Une fois découverts, les outils MCP sont disponibles pour le modèle Qwen comme s’il s’agissait d’outils intégrés. Le modèle effectuera automatiquement les opérations suivantes :

1. **Sélectionner les outils appropriés**, en fonction de vos demandes  
2. **Afficher des boîtes de dialogue de confirmation**, sauf si le serveur est approuvé  
3. **Exécuter les outils** avec les paramètres adéquats  
4. **Afficher les résultats** dans un format convivial pour l’utilisateur  

## Surveillance de l’état et dépannage  

### États de connexion  

L’intégration MCP suit plusieurs états :  

#### État du serveur (`MCPServerStatus`)  

- **`DISCONNECTED`** : Le serveur n’est pas connecté ou présente des erreurs  
- **`CONNECTING`** : Une tentative de connexion est en cours  
- **`CONNECTED`** : Le serveur est connecté et prêt à l’emploi  

#### État de la découverte (`MCPDiscoveryState`)  

- **`NOT_STARTED`** : La découverte n’a pas encore commencé  
- **`IN_PROGRESS`** : La découverte des serveurs est en cours  
- **`COMPLETED`** : La découverte est terminée (avec ou sans erreurs)  

### Problèmes courants et solutions

#### Le serveur ne parvient pas à se connecter

**Symptômes :** Le statut du serveur affiche `DÉCONNECTÉ`

**Dépannage :**

1. **Vérifiez la configuration :** Assurez-vous que les valeurs de `command`, `args` et `cwd` sont correctes  
2. **Testez manuellement :** Exécutez directement la commande du serveur pour vérifier qu’elle fonctionne  
3. **Vérifiez les dépendances :** Assurez-vous que tous les packages requis sont installés  
4. **Examinez les journaux :** Recherchez des messages d’erreur dans la sortie CLI  
5. **Vérifiez les autorisations :** Assurez-vous que la CLI est autorisée à exécuter la commande du serveur  

#### Aucun outil détecté

**Symptômes :** Le serveur se connecte, mais aucun outil n’est disponible  

**Dépannage :**

1. **Vérifiez l’inscription des outils :** Assurez-vous que votre serveur inscrit effectivement des outils  
2. **Vérifiez le protocole MCP :** Confirmez que votre serveur implémente correctement la liste des outils MCP  
3. **Examinez les journaux du serveur :** Vérifiez la sortie `stderr` à la recherche d’erreurs côté serveur  
4. **Testez la découverte des outils :** Testez manuellement le point de terminaison de découverte des outils de votre serveur

#### Outils non exécutés

**Symptômes :** Les outils sont détectés, mais échouent lors de leur exécution.

**Dépannage :**

1. **Validation des paramètres :** Vérifiez que votre outil accepte les paramètres attendus.
2. **Compatibilité du schéma :** Assurez-vous que vos schémas d’entrée sont des schémas JSON valides.
3. **Gestion des erreurs :** Vérifiez si votre outil lève des exceptions non gérées.
4. **Problèmes de délai d’attente :** Envisagez d’augmenter le paramètre `timeout`.

#### Compatibilité avec le bac à sable

**Symptômes :** Les serveurs MCP échouent lorsque la fonctionnalité de bac à sable est activée.

**Solutions :**

1. **Serveurs basés sur Docker :** Utilisez des conteneurs Docker incluant toutes les dépendances nécessaires.
2. **Accessibilité des chemins :** Assurez-vous que les exécutables du serveur sont disponibles dans le bac à sable.
3. **Accès réseau :** Configurez le bac à sable pour autoriser les connexions réseau nécessaires.
4. **Variables d’environnement :** Vérifiez que les variables d’environnement requises sont correctement transmises.

### Conseils de débogage

1. **Activez le mode débogage :** Exécutez l’interface CLI avec l’option `--debug` pour obtenir une sortie détaillée.
2. **Vérifiez la sortie d’erreur (stderr) :** La sortie d’erreur du serveur MCP est capturée et journalisée (les messages de niveau INFO sont filtrés).
3. **Isolez les tests :** Testez votre serveur MCP indépendamment avant de l’intégrer.
4. **Configuration progressive :** Commencez par des outils simples avant d’ajouter des fonctionnalités complexes.
5. **Utilisez fréquemment `/mcp` :** Surveillez l’état du serveur pendant le développement.

## Remarques importantes

### Considérations de sécurité

- **Paramètres de confiance :** L’option `trust` contourne tous les dialogues de confirmation. Utilisez-la avec précaution, uniquement pour les serveurs que vous contrôlez entièrement.
- **Jetons d’accès :** Soyez vigilant sur le plan de la sécurité lors de la configuration des variables d’environnement contenant des clés API ou des jetons.
- **Compatibilité avec les environnements isolés (sandbox) :** Lors de l’utilisation d’un environnement isolé, assurez-vous que les serveurs MCP sont accessibles depuis cet environnement.
- **Données privées :** L’utilisation de jetons d’accès personnels à large portée peut entraîner des fuites d’informations entre les dépôts.

### Performances et gestion des ressources

- **Persistance des connexions :** L’interface en ligne de commande (CLI) maintient des connexions persistantes vers les serveurs ayant correctement enregistré des outils.  
- **Nettoyage automatique :** Les connexions vers les serveurs ne fournissant aucun outil sont automatiquement fermées.  
- **Gestion des délais d’attente :** Configurez des délais d’attente appropriés en fonction des caractéristiques de réponse de votre serveur.  
- **Surveillance des ressources :** Les serveurs MCP s’exécutent comme des processus distincts et consomment des ressources système.

### Compatibilité des schémas

- **Mode de conformité aux schémas :** Par défaut (`schemaCompliance: "auto"`), les schémas d’outils sont transmis tels quels. Définissez `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` dans votre fichier `settings.json` pour convertir les modèles au format OpenAPI 3.0 strict.
- **Transformations OpenAPI 3.0 :** Lorsque le mode `openapi_30` est activé, le système gère :
  - Les types pouvant être nuls : `["string", "null"]` → `type: "string", nullable: true`
  - Les valeurs constantes : `const: "foo"` → `enum: ["foo"]`
  - Les limites exclusives : `exclusiveMinimum` numérique → forme booléenne avec `minimum`
  - La suppression de mots-clés : `$schema`, `$id`, `dependencies`, `patternProperties`
- **Nettoyage des noms :** Les noms des outils sont automatiquement nettoyés pour respecter les exigences de l’API.
- **Résolution des conflits :** Les conflits de noms d’outils entre serveurs sont résolus automatiquement par ajout d’un préfixe.

Cette intégration complète fait des serveurs MCP un moyen puissant d’étendre les fonctionnalités de l’interface en ligne de commande (CLI), tout en préservant la sécurité, la fiabilité et la simplicité d’utilisation.

## Retourner du contenu enrichi depuis les outils

Les outils MCP ne se limitent pas au retour de texte simple. Vous pouvez retourner du contenu riche et multipart, incluant du texte, des images, de l’audio et d’autres données binaires dans une seule réponse d’outil. Cela vous permet de créer des outils puissants capables de fournir des informations variées au modèle en un seul tour.

Toutes les données retournées par l’outil sont traitées puis envoyées au modèle sous forme de contexte pour sa prochaine génération, ce qui lui permet de raisonner sur ces informations ou d’en produire un résumé.

### Fonctionnement

Pour renvoyer un contenu enrichi, la réponse de votre outil doit respecter la spécification MCP relative à un [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). Le champ `content` du résultat doit être un tableau d’objets `ContentBlock`. L’interface en ligne de commande (CLI) traitera correctement ce tableau, en séparant le texte des données binaires et en les conditionnant pour le modèle.

Vous pouvez combiner librement différents types de blocs de contenu dans le tableau `content`. Les types de blocs pris en charge sont les suivants :

- `text`
- `image`
- `audio`
- `resource` (contenu intégré)
- `resource_link`

### Exemple : Retourner du texte et une image

Voici un exemple de réponse JSON valide provenant d’un outil MCP qui renvoie à la fois une description textuelle et une image :

```json
{
  "content": [
    {
      "type": "text",
      "text": "Voici le logo que vous avez demandé."
    },
    {
      "type": "image",
      "data": "DONNÉES_DE_L_IMAGE_EN_BASE64_ICI",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "Le logo a été créé en 2025."
    }
  ]
}
```

Lorsque Qwen Code reçoit cette réponse, il effectue les opérations suivantes :

1.  Il extrait l’ensemble du texte et le combine en une seule partie `functionResponse` destinée au modèle.
2.  Il présente les données de l’image comme une partie `inlineData` distincte.
3.  Il fournit un résumé clair et convivial dans l’interface CLI, indiquant que du texte et une image ont bien été reçus.

Cela vous permet de créer des outils sophistiqués capables de fournir un contexte riche et multimodal au modèle Qwen.

## Invocations MCP sous forme de commandes obliques

En plus des outils, les serveurs MCP peuvent exposer des invocations prédéfinies qui peuvent être exécutées sous forme de commandes obliques dans Qwen Code. Cela vous permet de créer des raccourcis pour des requêtes courantes ou complexes, facilement appelables par leur nom.

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
    title: 'Rédacteur de poèmes',
    description: 'Rédige un joli haïku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Rédige un haïku${mood ? ` avec l’ambiance ${mood}` : ''} intitulé ${title}. Note qu’un haïku comporte 5 syllabes, suivies de 7 syllabes, puis de 5 syllabes.`,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Ceci peut être inclus dans le fichier `settings.json`, sous la clé `mcpServers`, comme suit :

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

### Appel des invites

Une fois qu’une invite est découverte, vous pouvez l’appeler en utilisant son nom comme commande avec barre oblique (`/`). L’interface en ligne de commande (CLI) gère automatiquement l’analyse des arguments.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, en utilisant des arguments positionnels :

```bash
/poem-writer "Qwen Code" reverent
```

Lorsque vous exécutez cette commande, la CLI appelle la méthode `prompts/get` sur le serveur MCP avec les arguments fournis. Le serveur se charge alors de substituer ces arguments dans le modèle d’invite et de renvoyer le texte final de l’invite. La CLI transmet ensuite cette invite au modèle pour exécution. Cela offre un moyen pratique d’automatiser et de partager des workflows courants.

## Gestion des serveurs MCP avec `qwen mcp`

Bien que vous puissiez toujours configurer les serveurs MCP en modifiant manuellement votre fichier `settings.json`, l’interface en ligne de commande (CLI) fournit un ensemble pratique de commandes pour gérer vos configurations de serveur par programmation. Ces commandes simplifient l’ajout, la liste et la suppression des serveurs MCP, sans nécessiter de modification directe des fichiers JSON.

### Ajout d’un serveur (`qwen mcp add`)

La commande `add` configure un nouveau serveur MCP dans votre fichier `settings.json`. Selon la portée spécifiée (`-s, --scope`), elle sera ajoutée soit au fichier de configuration utilisateur `~/.qwen/settings.json`, soit au fichier de configuration projet `.qwen/settings.json`.

**Commande :**

```bash
qwen mcp add [options] <nom> <commandeOuUrl> [arguments...]
```

- `<nom>` : Nom unique du serveur.
- `<commandeOuUrl>` : Commande à exécuter (pour le transport `stdio`) ou URL (pour les transports `http`/`sse`).
- `[arguments...]` : Arguments facultatifs pour une commande `stdio`.

**Options (drapeaux) :**

- `-s, --scope` : Portée de la configuration (utilisateur ou projet). [valeur par défaut : « project »]
- `-t, --transport` : Type de transport (`stdio`, `sse`, `http`). [valeur par défaut : « stdio »]
- `-e, --env` : Définit des variables d’environnement (ex. : `-e CLÉ=valeur`).
- `-H, --header` : Définit des en-têtes HTTP pour les transports `sse` et `http` (ex. : `-H "X-Api-Key: abc123"` `-H "Authorization: Bearer abc123"`).
- `--timeout` : Définit le délai d’attente de connexion en millisecondes.
- `--trust` : Fait confiance au serveur (ignore toutes les demandes de confirmation lors des appels d’outils).
- `--description` : Définit la description du serveur.
- `--include-tools` : Liste séparée par des virgules des outils à inclure.
- `--exclude-tools` : Liste séparée par des virgules des outils à exclure.

#### Ajout d’un serveur stdio

Il s’agit du transport par défaut pour l’exécution de serveurs locaux.

```bash

# Syntaxe de base
qwen mcp add <nom> <commande> [arguments...]

# Exemple : ajout d’un serveur local
qwen mcp add mon-serveur-stdio -e API_KEY=123 /chemin/vers/le/serveur arg1 arg2 arg3

# Exemple : ajout d’un serveur Python local
qwen mcp add serveur-python python server.py --port 8080
```

#### Ajout d’un serveur HTTP

Ce transport est destiné aux serveurs utilisant le transport HTTP diffusable (streamable).

```bash

# Syntaxe de base
qwen mcp add --transport http <nom> <url>

# Exemple : ajout d’un serveur HTTP
qwen mcp add --transport http serveur-http https://api.example.com/mcp/

# Exemple : ajout d’un serveur HTTP avec un en-tête d’authentification
qwen mcp add --transport http serveur-http-securise https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Ajout d’un serveur SSE

Ce transport est destiné aux serveurs utilisant les événements envoyés par le serveur (Server-Sent Events, SSE).

```bash

# Syntaxe de base
qwen mcp add --transport sse <nom> <url>

# Exemple : Ajout d’un serveur SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemple : Ajout d’un serveur SSE avec un en-tête d’authentification
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Gestion des serveurs (`qwen mcp`)

Pour afficher et gérer l’ensemble des serveurs MCP actuellement configurés, utilisez la commande `manage` ou simplement `qwen mcp`. Cela ouvre une interface interactive en mode texte (TUI) vous permettant de :

- Visualiser tous les serveurs MCP avec leur statut de connexion
- Activer ou désactiver des serveurs
- Rétablir la connexion aux serveurs déconnectés
- Afficher les outils et invites fournis par chaque serveur
- Consulter les journaux du serveur

**Commande :**

```bash
qwen mcp

# ou
qwen mcp manage
```

La boîte de dialogue de gestion fournit une interface visuelle indiquant le nom de chaque serveur, ses détails de configuration, son statut de connexion ainsi que les outils et invites disponibles.

### Supprimer un serveur (`qwen mcp remove`)

Pour supprimer un serveur de votre configuration, utilisez la commande `remove` avec le nom du serveur.

**Commande :**

```bash
qwen mcp remove <nom>
```

**Exemple :**

```bash
qwen mcp remove my-server
```

Cette commande recherche et supprime l’entrée « my-server » de l’objet `mcpServers` dans le fichier `settings.json` approprié, en fonction de la portée spécifiée (`-s, --scope`).