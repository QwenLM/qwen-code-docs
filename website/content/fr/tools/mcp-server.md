# Serveurs MCP avec Qwen Code

Ce document fournit un guide pour configurer et utiliser les serveurs Model Context Protocol (MCP) avec Qwen Code.

## Qu'est-ce qu'un serveur MCP ?

Un serveur MCP est une application qui expose des outils et des ressources au CLI via le Model Context Protocol, lui permettant d'interagir avec des systèmes externes et des sources de données. Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services comme les APIs.

Un serveur MCP permet au CLI de :

- **Découvrir des outils :** Lister les outils disponibles, leurs descriptions et paramètres via des définitions de schéma standardisées.
- **Exécuter des outils :** Appeler des outils spécifiques avec des arguments définis et recevoir des réponses structurées.
- **Accéder aux ressources :** Lire des données depuis des ressources spécifiques (bien que le CLI se concentre principalement sur l'exécution d'outils).

Avec un serveur MCP, vous pouvez étendre les capacités du CLI pour effectuer des actions au-delà de ses fonctionnalités intégrées, telles que l'interaction avec des bases de données, des APIs, des scripts personnalisés ou des workflows spécialisés.

## Architecture d'intégration principale

Qwen Code s'intègre aux serveurs MCP via un système sophistiqué de découverte et d'exécution intégré dans le package principal (`packages/core/src/tools/`) :

### Couche de découverte (`mcp-client.ts`)

Le processus de découverte est orchestré par `discoverMcpTools()`, qui :

1. **Parcourt les serveurs configurés** à partir de la configuration `mcpServers` de votre `settings.json`
2. **Établit des connexions** en utilisant les mécanismes de transport appropriés (Stdio, SSE ou Streamable HTTP)
3. **Récupère les définitions des outils** depuis chaque serveur en utilisant le protocole MCP
4. **Nettoie et valide** les schémas des outils pour assurer la compatibilité avec l'API Qwen
5. **Enregistre les outils** dans le registre global des outils avec résolution des conflits

### Couche d'exécution (`mcp-tool.ts`)

Chaque outil MCP découvert est encapsulé dans une instance `DiscoveredMCPTool` qui :

- **Gère la logique de confirmation** en fonction des paramètres de confiance du serveur et des préférences utilisateur
- **Assure l'exécution de l'outil** en appelant le serveur MCP avec les paramètres appropriés
- **Traite les réponses** à la fois pour le contexte du LLM et l'affichage utilisateur
- **Maintient l'état de la connexion** et gère les timeouts

### Mécanismes de transport

Le CLI supporte trois types de transport MCP :

- **Transport Stdio :** Lance un sous-processus et communique via stdin/stdout
- **Transport SSE :** Se connecte aux endpoints Server-Sent Events
- **Transport HTTP Streamable :** Utilise le streaming HTTP pour la communication

## Comment configurer votre serveur MCP

Qwen Code utilise la configuration `mcpServers` dans votre fichier `settings.json` pour localiser et se connecter aux serveurs MCP. Cette configuration supporte plusieurs serveurs avec différents mécanismes de transport.

### Configurer le serveur MCP dans settings.json

Vous pouvez configurer les serveurs MCP au niveau global dans le fichier `~/.qwen/settings.json` ou dans le répertoire racine de votre projet, créez ou ouvrez le fichier `.qwen/settings.json`. Dans ce fichier, ajoutez le bloc de configuration `mcpServers`.

### Structure de la configuration

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
- **`url`** (string) : URL du endpoint SSE (ex. `"http://localhost:8080/sse"`)
- **`httpUrl`** (string) : URL du endpoint HTTP streaming

#### Optionnel

- **`args`** (string[]) : Arguments de ligne de commande pour le transport Stdio
- **`headers`** (object) : En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`
- **`env`** (object) : Variables d'environnement pour le processus du serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string) : Répertoire de travail pour le transport Stdio
- **`timeout`** (number) : Délai d'expiration des requêtes en millisecondes (par défaut : 600 000 ms = 10 minutes)
- **`trust`** (boolean) : Si `true`, contourne toutes les confirmations d'appel d'outils pour ce serveur (par défaut : `false`)
- **`includeTools`** (string[]) : Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsque cette liste est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste blanche). Si non spécifié, tous les outils du serveur sont activés par défaut.
- **`excludeTools`** (string[]) : Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Note :** `excludeTools` a priorité sur `includeTools` – si un outil est présent dans les deux listes, il sera exclu.

### Support OAuth pour les serveurs MCP distants

Qwen Code prend en charge l'authentification OAuth 2.0 pour les serveurs MCP distants utilisant les transports SSE ou HTTP. Cela permet un accès sécurisé aux serveurs MCP qui nécessitent une authentification.

#### Découverte automatique OAuth

Pour les serveurs qui supportent la découverte OAuth, vous pouvez omettre la configuration OAuth et laisser le CLI la découvrir automatiquement :

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

Le CLI va automatiquement :

- Détecter quand un serveur requiert une authentification OAuth (réponses 401)
- Découvrir les endpoints OAuth depuis les métadonnées du serveur
- Effectuer un enregistrement dynamique du client si supporté
- Gérer le flux OAuth et la gestion des tokens

#### Flux d'authentification

Lors de la connexion à un serveur compatible OAuth :

1. **Tentative de connexion initiale** échoue avec une erreur 401 Unauthorized
2. **Découverte OAuth** identifie les endpoints d'autorisation et de token
3. **Ouverture du navigateur** pour l'authentification utilisateur (nécessite un accès à un navigateur local)
4. **Le code d'autorisation** est échangé contre des access tokens
5. **Les tokens sont stockés** de manière sécurisée pour une utilisation future
6. **Nouvelle tentative de connexion** réussit avec des tokens valides

#### Conditions requises pour la redirection du navigateur

**Important :** L'authentification OAuth nécessite que votre machine locale puisse :

- Ouvrir un navigateur web pour l'authentification
- Recevoir des redirections sur `http://localhost:7777/oauth/callback`

Cette fonctionnalité ne fonctionnera pas dans :

- Des environnements headless sans accès au navigateur
- Des sessions SSH distantes sans X11 forwarding
- Des environnements containerisés sans support du navigateur

#### Gestion de l'authentification OAuth

Utilisez la commande `/mcp auth` pour gérer l'authentification OAuth :

```bash

# Lister les serveurs nécessitant une authentification
/mcp auth
```

```markdown
# Authentification avec un serveur spécifique
/mcp auth serverName

# Ré-authentification si les tokens expirent
/mcp auth serverName
```

#### Propriétés de configuration OAuth

- **`enabled`** (boolean): Active OAuth pour ce serveur
- **`clientId`** (string): Identifiant du client OAuth (optionnel avec enregistrement dynamique)
- **`clientSecret`** (string): Secret du client OAuth (optionnel pour les clients publics)
- **`authorizationUrl`** (string): Endpoint d'autorisation OAuth (auto-découvert si omis)
- **`tokenUrl`** (string): Endpoint de token OAuth (auto-découvert si omis)
- **`scopes`** (string[]): Scopes OAuth requis
- **`redirectUri`** (string): URI de redirection personnalisée (par défaut `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (string): Nom du paramètre de requête pour les tokens dans les URLs SSE
- **`audiences`** (string[]): Audiences pour lesquelles le token est valide
```

#### Gestion des Tokens

Les tokens OAuth sont automatiquement :

- **Stockés de manière sécurisée** dans `~/.qwen/mcp-oauth-tokens.json`
- **Renouvelés** lorsqu'ils expirent (si les refresh tokens sont disponibles)
- **Validés** avant chaque tentative de connexion
- **Nettoyés** lorsqu'ils sont invalides ou expirés

#### Type de fournisseur d'authentification

Vous pouvez spécifier le type de fournisseur d'authentification en utilisant la propriété `authProviderType` :

- **`authProviderType`** (string) : Spécifie le fournisseur d'authentification. Peut prendre l'une des valeurs suivantes :
  - **`dynamic_discovery`** (par défaut) : Le CLI découvrira automatiquement la configuration OAuth depuis le serveur.
  - **`google_credentials`** : Le CLI utilisera les Google Application Default Credentials (ADC) pour s'authentifier auprès du serveur. Lorsque vous utilisez ce fournisseur, vous devez spécifier les scopes requis.

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

## Plongée dans le processus de découverte

Lorsque Qwen Code démarre, il effectue la découverte des serveurs MCP via le processus détaillé suivant :

### 1. Itération sur les serveurs et connexion

Pour chaque serveur configuré dans `mcpServers` :

1. **Suivi du statut :** Le statut du serveur est défini sur `CONNECTING`
2. **Sélection du transport :** En fonction des propriétés de configuration :
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Établissement de la connexion :** Le client MCP tente de se connecter avec le timeout configuré
4. **Gestion des erreurs :** Les échecs de connexion sont enregistrés dans les logs et le statut du serveur est défini sur `DISCONNECTED`

### 2. Découverte des outils

Une fois la connexion établie :

1. **Liste des outils :** Le client appelle l'endpoint de liste des outils du serveur MCP
2. **Validation du schéma :** La déclaration de chaque fonction d'outil est validée
3. **Filtrage des outils :** Les outils sont filtrés en fonction de la configuration `includeTools` et `excludeTools`
4. **Nettoyage des noms :** Les noms des outils sont nettoyés pour respecter les exigences de l'API Qwen :
   - Les caractères invalides (non alphanumériques, underscore, point, trait d'union) sont remplacés par des underscores
   - Les noms de plus de 63 caractères sont tronqués avec un remplacement au milieu (`___`)

### 3. Résolution des conflits

Lorsque plusieurs serveurs exposent des outils portant le même nom :

1. **Premier enregistrement gagnant :** Le premier serveur à enregistrer un nom d'outil obtient le nom sans préfixe
2. **Préfixage automatique :** Les serveurs suivants reçoivent des noms préfixés : `serverName__toolName`
3. **Suivi dans le registre :** Le registre des outils maintient les correspondances entre les noms de serveurs et leurs outils

### 4. Traitement des schémas

Les schémas de paramètres des outils sont nettoyés pour assurer la compatibilité avec l'API :

- Les propriétés **`$schema`** sont supprimées
- Les propriétés **`additionalProperties`** sont retirées
- Les blocs **`anyOf` avec `default`** voient leurs valeurs par défaut supprimées (pour la compatibilité Vertex AI)
- Un traitement **récursif** est appliqué aux schémas imbriqués

### 5. Gestion des connexions

Après la découverte :

- **Connexions persistantes :** Les serveurs ayant réussi à enregistrer des outils conservent leur connexion
- **Nettoyage :** Les connexions des serveurs ne fournissant aucun outil utilisable sont fermées
- **Mise à jour du statut :** Le statut final des serveurs est défini sur `CONNECTED` ou `DISCONNECTED`

## Flux d'exécution des outils

Lorsque le modèle décide d'utiliser un outil MCP, le flux d'exécution suivant se produit :

### 1. Invocation de l'outil

Le modèle génère un `FunctionCall` contenant :

- **Nom de l'outil :** Le nom enregistré (potentiellement préfixé)
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

#### Gestion des choix utilisateur

Lorsqu'une confirmation est requise, les utilisateurs peuvent choisir :

- **Exécuter une fois :** Exécuter uniquement cette fois-ci
- **Toujours autoriser cet outil :** Ajouter à la liste d'autorisation au niveau de l'outil
- **Toujours autoriser ce serveur :** Ajouter à la liste d'autorisation au niveau du serveur
- **Annuler :** Abandonner l'exécution

### 3. Exécution

Après confirmation (ou contournement de la vérification de confiance) :

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

3. **Traitement de la réponse :** Les résultats sont formatés à la fois pour le contexte du LLM et pour l'affichage utilisateur

### 4. Gestion de la réponse

Le résultat de l'exécution contient :

- **`llmContent` :** Parties de la réponse brute destinées au contexte du modèle linguistique
- **`returnDisplay` :** Sortie formatée pour l'affichage utilisateur (souvent du JSON dans des blocs de code markdown)

## Comment interagir avec votre serveur MCP

### Utilisation de la commande `/mcp`

La commande `/mcp` fournit des informations complètes sur la configuration de votre serveur MCP :

```bash
/mcp
```

Elle affiche :

- **Liste des serveurs :** Tous les serveurs MCP configurés
- **Statut de connexion :** `CONNECTED`, `CONNECTING`, ou `DISCONNECTED`
- **Détails du serveur :** Résumé de la configuration (sans les données sensibles)
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
2. **Afficher des dialogues de confirmation** (sauf si le serveur est approuvé)
3. **Exécuter les outils** avec les paramètres appropriés
4. **Afficher les résultats** dans un format convivial

## Surveillance du statut et dépannage

### États de connexion

L'intégration MCP suit plusieurs états :

#### Statut du serveur (`MCPServerStatus`)

- **`DISCONNECTED` :** Le serveur n'est pas connecté ou rencontre des erreurs
- **`CONNECTING` :** Tentative de connexion en cours
- **`CONNECTED` :** Le serveur est connecté et prêt

#### État de découverte (`MCPDiscoveryState`)

- **`NOT_STARTED` :** La découverte n'a pas encore commencé
- **`IN_PROGRESS` :** Découverte des serveurs en cours
- **`COMPLETED` :** Découverte terminée (avec ou sans erreurs)

### Problèmes courants et solutions

#### Le serveur ne se connecte pas

**Symptômes :** Le serveur affiche le statut `DISCONNECTED`

**Dépannage :**

1. **Vérifier la configuration :** Assurez-vous que `command`, `args`, et `cwd` sont corrects
2. **Tester manuellement :** Exécutez directement la commande du serveur pour vérifier qu'elle fonctionne
3. **Vérifier les dépendances :** Assurez-vous que tous les packages requis sont installés
4. **Consulter les logs :** Recherchez les messages d'erreur dans la sortie CLI
5. **Vérifier les permissions :** Assurez-vous que le CLI peut exécuter la commande du serveur

#### Aucun outil découvert

**Symptômes :** Le serveur se connecte mais aucun outil n'est disponible

**Dépannage :**

1. **Vérifier l'enregistrement des outils :** Assurez-vous que votre serveur enregistre réellement des outils
2. **Vérifier le protocole MCP :** Confirmez que votre serveur implémente correctement le listing des outils MCP
3. **Consulter les logs du serveur :** Vérifiez la sortie stderr pour détecter les erreurs côté serveur
4. **Tester le listing des outils :** Testez manuellement le endpoint de découverte d'outils de votre serveur

#### Outils qui ne s'exécutent pas

**Symptômes :** Les outils sont découverts mais échouent pendant l'exécution

**Dépannage :**

1. **Validation des paramètres :** Assurez-vous que votre outil accepte les paramètres attendus
2. **Compatibilité du schéma :** Vérifiez que vos schémas d'entrée sont des JSON Schema valides
3. **Gestion des erreurs :** Vérifiez si votre outil lance des exceptions non gérées
4. **Problèmes de timeout :** Envisagez d'augmenter le paramètre `timeout`

#### Compatibilité du sandbox

**Symptômes :** Les serveurs MCP échouent quand le sandboxing est activé

**Solutions :**

1. **Serveurs basés sur Docker :** Utilisez des conteneurs Docker qui incluent toutes les dépendances
2. **Accessibilité des chemins :** Assurez-vous que les exécutables du serveur sont disponibles dans le sandbox
3. **Accès réseau :** Configurez le sandbox pour autoriser les connexions réseau nécessaires
4. **Variables d'environnement :** Vérifiez que les variables d'environnement requises sont transmises

### Conseils de débogage

1. **Activer le mode debug :** Exécutez le CLI avec `--debug` pour obtenir une sortie verbeuse
2. **Vérifier stderr :** Les messages stderr du serveur MCP sont capturés et enregistrés (les messages INFO sont filtrés)
3. **Test isolé :** Testez votre serveur MCP indépendamment avant de l'intégrer
4. **Configuration progressive :** Commencez par des outils simples avant d'ajouter des fonctionnalités complexes
5. **Utiliser `/mcp` fréquemment :** Surveillez l'état du serveur pendant le développement

## Notes importantes

### Considérations de sécurité

- **Paramètres de confiance :** L'option `trust` contourne toutes les boîtes de dialogue de confirmation. À utiliser avec prudence et uniquement pour les serveurs que vous contrôlez entièrement
- **Tokens d'accès :** Soyez vigilant sur la sécurité lors de la configuration des variables d'environnement contenant des API keys ou des tokens
- **Compatibilité sandbox :** Lors de l'utilisation du sandboxing, assurez-vous que les serveurs MCP sont disponibles dans l'environnement sandbox
- **Données privées :** L'utilisation de tokens d'accès personnels à portée large peut entraîner une fuite d'informations entre les repositories

### Performance et Gestion des Ressources

- **Persistance des connexions :** Le CLI maintient des connexions persistantes vers les serveurs qui enregistrent avec succès des outils
- **Nettoyage automatique :** Les connexions vers les serveurs ne fournissant aucun outil sont automatiquement fermées
- **Gestion des timeouts :** Configurez des timeouts appropriés en fonction des caractéristiques de réponse de votre serveur
- **Surveillance des ressources :** Les serveurs MCP s'exécutent en tant que processus séparés et consomment des ressources système

### Compatibilité des Schémas

- **Suppression de propriétés :** Le système supprime automatiquement certaines propriétés de schéma (`$schema`, `additionalProperties`) pour assurer la compatibilité avec l'API Qwen
- **Nettoyage des noms :** Les noms des outils sont automatiquement nettoyés pour satisfaire aux exigences de l'API
- **Résolution des conflits :** Les conflits de noms d'outils entre serveurs sont résolus par un préfixage automatique

Cette intégration complète fait des serveurs MCP un moyen puissant d'étendre les capacités du CLI tout en maintenant la sécurité, la fiabilité et la facilité d'utilisation.

## Retourner du contenu riche depuis les outils

Les outils MCP ne se limitent pas à retourner du texte simple. Vous pouvez renvoyer du contenu riche et multi-parties, incluant du texte, des images, de l'audio et d'autres données binaires dans une seule réponse d'outil. Cela vous permet de créer des outils puissants capables de fournir des informations diverses au modèle en un seul tour.

Toutes les données retournées par l'outil sont traitées et envoyées au modèle comme contexte pour sa prochaine génération, lui permettant de raisonner ou de résumer les informations fournies.

### Fonctionnement

Pour renvoyer du contenu riche, la réponse de votre outil doit respecter la spécification MCP pour un [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). Le champ `content` du résultat doit être un tableau d'objets `ContentBlock`. Le CLI traitera correctement ce tableau, en séparant le texte des données binaires et en les empaquetant pour le modèle.

Vous pouvez combiner différents types de blocs de contenu dans le tableau `content`. Les types de blocs pris en charge incluent :

- `text`
- `image`
- `audio`
- `resource` (contenu intégré)
- `resource_link`

### Exemple : Retourner du texte et une image

Voici un exemple de réponse JSON valide depuis un outil MCP qui retourne à la fois une description textuelle et une image :

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

Lorsque Qwen Code reçoit cette réponse, il va :

1. Extraire tout le texte et le combiner en une seule partie `functionResponse` pour le modèle.
2. Présenter les données de l’image comme une partie `inlineData` distincte.
3. Fournir un résumé clair et convivial dans le CLI, indiquant qu’un texte et une image ont été reçus.

Cela vous permet de créer des outils sophistiqués capables de fournir un contexte riche et multi-modale au modèle Qwen.

## Prompts MCP en tant que commandes Slash

En plus des outils, les serveurs MCP peuvent exposer des prompts prédéfinis qui peuvent être exécutés en tant que commandes slash dans Qwen Code. Cela vous permet de créer des raccourcis pour des requêtes courantes ou complexes qui peuvent être facilement invoquées par leur nom.

### Définir des prompts côté serveur

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
"nodeServer": {
  "command": "node",
  "args": ["filename.ts"],
}
```

### Invocation des Prompts

Une fois qu'un prompt est découvert, vous pouvez l'invoquer en utilisant son nom comme commande slash. Le CLI gérera automatiquement l'analyse des arguments.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, en utilisant des arguments positionnels :

```bash
/poem-writer "Qwen Code" reverent
```

Lorsque vous exécutez cette commande, le CLI exécute la méthode `prompts/get` sur le serveur MCP avec les arguments fournis. Le serveur est responsable de la substitution des arguments dans le template du prompt et de retourner le texte final du prompt. Le CLI envoie ensuite ce prompt au modèle pour exécution. Cela fournit un moyen pratique d'automatiser et de partager des workflows courants.

## Gérer les serveurs MCP avec `qwen mcp`

Même si vous pouvez toujours configurer les serveurs MCP en modifiant manuellement votre fichier `settings.json`, la CLI fournit un ensemble pratique de commandes pour gérer vos configurations de serveur de manière programmatique. Ces commandes simplifient le processus d'ajout, de listage et de suppression de serveurs MCP sans avoir besoin de modifier directement les fichiers JSON.

### Ajouter un serveur (`qwen mcp add`)

La commande `add` configure un nouveau serveur MCP dans votre fichier `settings.json`. Selon la portée (`-s, --scope`), le serveur sera ajouté soit au fichier de configuration utilisateur `~/.qwen/settings.json`, soit au fichier de configuration du projet `.qwen/settings.json`.

**Commande :**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>` : Un nom unique pour le serveur.
- `<commandOrUrl>` : La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`).
- `[args...]` : Arguments optionnels pour une commande `stdio`.

**Options (Flags) :**

- `-s, --scope` : Portée de la configuration (user ou project). [par défaut : "project"]
- `-t, --transport` : Type de transport (stdio, sse, http). [par défaut : "stdio"]
- `-e, --env` : Définir des variables d'environnement (ex. : -e KEY=value).
- `-H, --header` : Définir des en-têtes HTTP pour les transports SSE et HTTP (ex. : -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout` : Définir le délai d'attente de connexion en millisecondes.
- `--trust` : Faire confiance au serveur (contourne toutes les demandes de confirmation d'appel d'outils).
- `--description` : Définir la description du serveur.
- `--include-tools` : Liste des outils à inclure, séparés par des virgules.
- `--exclude-tools` : Liste des outils à exclure, séparés par des virgules.

#### Ajouter un serveur stdio

C'est le transport par défaut pour exécuter des serveurs locaux.

```bash

# Syntaxe de base
qwen mcp add <name> <command> [args...]

# Exemple : Ajouter un serveur local
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Exemple : Ajouter un serveur Python local
qwen mcp add python-server python server.py --port 8080
```

#### Ajouter un serveur HTTP

Ce transport est destiné aux serveurs qui utilisent le transport HTTP streamable.

```bash

# Syntaxe de base
qwen mcp add --transport http <name> <url>

# Exemple : Ajouter un serveur HTTP
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Exemple : Ajouter un serveur HTTP avec un header d'authentification
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Ajouter un serveur SSE

Ce transport est destiné aux serveurs qui utilisent les Server-Sent Events (SSE).

```bash

# Syntaxe de base
qwen mcp add --transport sse <name> <url>
```

```markdown
# Exemple : Ajouter un serveur SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemple : Ajouter un serveur SSE avec un header d'authentification
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Lister les serveurs (`qwen mcp list`)

Pour afficher tous les serveurs MCP actuellement configurés, utilise la commande `list`. Elle affiche le nom de chaque serveur, ses détails de configuration, ainsi que son statut de connexion.

**Commande :**

```bash
qwen mcp list
```

**Exemple de sortie :**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Connected
✓ http-server: https://api.example.com/mcp (http) - Connected
✗ sse-server: https://api.example.com/sse (sse) - Disconnected
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

Cette commande va rechercher et supprimer l'entrée "my-server" de l'objet `mcpServers` dans le fichier `settings.json` approprié, en fonction du scope (`-s, --scope`).