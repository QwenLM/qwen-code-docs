# SDK Java Qwen Code

Le SDK Java Qwen Code est un SDK expérimental minimal permettant un accès programmatique aux fonctionnalités de Qwen Code. Il fournit une interface Java pour interagir avec l'interface en ligne de commande (CLI) de Qwen Code, permettant aux développeurs d'intégrer les capacités de Qwen Code dans leurs applications Java.

## Prérequis

- Java >= 1.8
- Maven >= 3.6.0 (pour la compilation à partir des sources)
- qwen-code >= 0.5.0

### Dépendances

- **Journalisation** : ch.qos.logback:logback-classic
- **Utilitaires** : org.apache.commons:commons-lang3
- **Traitement JSON** : com.alibaba.fastjson2:fastjson2
- **Tests** : JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Ajoutez la dépendance suivante à votre fichier `pom.xml` Maven :

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Ou si vous utilisez Gradle, ajoutez ceci à votre fichier `build.gradle` :

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Compilation et exécution

### Commandes de compilation

```bash

```bash
# Compiler le projet
mvn compile

# Exécuter les tests
mvn test

# Créer le package JAR
mvn package

# Installer dans le dépôt local
mvn install
```

## Démarrage rapide

La façon la plus simple d'utiliser le SDK est d'utiliser la méthode `QwenCodeCli.simpleQuery()` :

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Pour une utilisation plus avancée avec des options de transport personnalisées :

```java
public static void runTransportOptionsExample() {
    TransportOptions options = new TransportOptions()
            .setModel("qwen3-coder-flash")
            .setPermissionMode(PermissionMode.AUTO_EDIT)
            .setCwd("./")
            .setEnv(new HashMap<String, String>() {{put("CUSTOM_VAR", "value");}})
            .setIncludePartialMessages(true)
            .setTurnTimeout(new Timeout(120L, TimeUnit.SECONDS))
            .setMessageTimeout(new Timeout(90L, TimeUnit.SECONDS))
            .setAllowedTools(Arrays.asList("read_file", "write_file", "list_directory"));

    List<String> result = QwenCodeCli.simpleQuery("who are you, what are your capabilities?", options);
    result.forEach(logger::info);
}
```

Pour la gestion du contenu en streaming avec des consommateurs de contenu personnalisés :

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Text content received: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Thinking content received: {}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Tool use content received: {} with arguments: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Tool result content received: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Other content received: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Usage information received: Input tokens: {}, Output tokens: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Streaming example completed.");
}
```

d'autres exemples voir src/test/java/com/alibaba/qwen/code/cli/example

## Architecture

Le SDK suit une architecture en couches :

- **Couche API** : Fournit les points d'entrée principaux via la classe `QwenCodeCli` avec des méthodes statiques simples pour une utilisation basique
- **Couche Session** : Gère les sessions de communication avec le CLI Qwen Code via la classe `Session`
- **Couche Transport** : Gère le mécanisme de communication entre le SDK et le processus CLI (actuellement via transport de processus avec `ProcessTransport`)
- **Couche Protocole** : Définit les structures de données pour la communication basées sur le protocole CLI
- **Utilitaires** : Utilitaires communs pour l'exécution concurrente, la gestion des délais et la gestion des erreurs

## Fonctionnalités clés

### Modes de permission

Le SDK prend en charge différents modes de permission pour contrôler l'exécution des outils :

- **`default`** : Les outils d'écriture sont refusés sauf s'ils sont approuvés via le callback `canUseTool` ou dans `allowedTools`. Les outils en lecture seule s'exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d'écriture et demande à l'IA de présenter d'abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils de modification (edit, write_file) tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s'exécutent automatiquement sans confirmation.

### Consommateurs d'événements de session et consommateurs de contenu d'assistant

Le SDK fournit deux interfaces clés pour gérer les événements et le contenu provenant du CLI :

#### Interface SessionEventConsumers

L'interface `SessionEventConsumers` fournit des rappels pour différents types de messages pendant une session :

- `onSystemMessage` : Gère les messages système provenant du CLI (reçoit Session et SDKSystemMessage)
- `onResultMessage` : Gère les messages de résultat provenant du CLI (reçoit Session et SDKResultMessage)
- `onAssistantMessage` : Gère les messages de l'assistant (réponses IA) (reçoit Session et SDKAssistantMessage)
- `onPartialAssistantMessage` : Gère les messages partiels de l'assistant pendant le streaming (reçoit Session et SDKPartialAssistantMessage)
- `onUserMessage` : Gère les messages utilisateur (reçoit Session et SDKUserMessage)
- `onOtherMessage` : Gère les autres types de messages (reçoit Session et message String)
- `onControlResponse` : Gère les réponses de contrôle (reçoit Session et CLIControlResponse)
- `onControlRequest` : Gère les requêtes de contrôle (reçoit Session et CLIControlRequest, retourne CLIControlResponse)
- `onPermissionRequest` : Gère les demandes d'autorisation (reçoit Session et CLIControlRequest<CLIControlPermissionRequest>, retourne Behavior)

#### Interface AssistantContentConsumers

L'interface `AssistantContentConsumers` gère différents types de contenu au sein des messages de l'assistant :

- `onText` : Gère le contenu texte (reçoit une Session et un TextAssistantContent)
- `onThinking` : Gère le contenu de réflexion (reçoit une Session et un ThingkingAssistantContent)
- `onToolUse` : Gère l'utilisation d'outils (reçoit une Session et un ToolUseAssistantContent)
- `onToolResult` : Gère les résultats d'outils (reçoit une Session et un ToolResultAssistantContent)
- `onOtherContent` : Gère les autres types de contenu (reçoit une Session et un AssistantContent)
- `onUsage` : Gère les informations d'utilisation (reçoit une Session et un AssistantUsage)
- `onPermissionRequest` : Gère les demandes de permissions (reçoit une Session et un CLIControlPermissionRequest, retourne un Behavior)
- `onOtherControlRequest` : Gère les autres demandes de contrôle (reçoit une Session et un ControlRequestPayload, retourne un ControlResponsePayload)

#### Relation entre les interfaces

**Note importante sur la hiérarchie des événements :**

- `SessionEventConsumers` est le processeur d'événements **haut niveau** qui gère différents types de messages (système, assistant, utilisateur, etc.)
- `AssistantContentConsumers` est le processeur de contenu **bas niveau** qui gère différents types de contenu au sein des messages de l'assistant (texte, outils, réflexion, etc.)

**Relation entre les processeurs :**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers utilise AssistantContentConsumers pour traiter le contenu des messages de l'assistant)

**Relations de dérivation des événements :**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Relations de délai d'attente des événements :**

Chaque méthode de gestionnaire d'événement possède une méthode de délai d'attente correspondante qui permet de personnaliser le comportement de délai d'attente pour cet événement spécifique :

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Pour les méthodes de délai d'attente d'AssistantContentConsumers :

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Valeurs de délai d'attente par défaut :**

- Délai d'attente par défaut de `SessionEventSimpleConsumers` : 180 secondes (Timeout.TIMEOUT_180_SECONDS)
- Délai d'attente par défaut de `AssistantContentSimpleConsumers` : 60 secondes (Timeout.TIMEOUT_60_SECONDS)

**Exigences de hiérarchie des délais d'attente :**

Pour un fonctionnement correct, les relations de délai d'attente suivantes doivent être respectées :

- La valeur de retour de `onAssistantMessageTimeout` doit être supérieure aux valeurs de retour de `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` et `onOtherContentTimeout`
- La valeur de retour de `onControlRequestTimeout` doit être supérieure aux valeurs de retour de `onPermissionRequestTimeout` et `onOtherControlRequestTimeout`

### Options de transport

La classe `TransportOptions` permet de configurer la manière dont le SDK communique avec l'interface en ligne de commande Qwen Code :

- `pathToQwenExecutable` : Chemin vers l'exécutable de l'interface en ligne de commande Qwen Code
- `cwd` : Répertoire de travail pour le processus CLI
- `model` : Modèle d'intelligence artificielle à utiliser pour la session
- `permissionMode` : Mode d'autorisation qui contrôle l'exécution des outils
- `env` : Variables d'environnement à transmettre au processus CLI
- `maxSessionTurns` : Limite le nombre de tours de conversation dans une session
- `coreTools` : Liste des outils principaux qui devraient être disponibles pour l'IA
- `excludeTools` : Liste des outils à exclure pour qu'ils ne soient pas disponibles pour l'IA
- `allowedTools` : Liste des outils pré-approuvés pour une utilisation sans confirmation supplémentaire
- `authType` : Type d'authentification à utiliser pour la session
- `includePartialMessages` : Active la réception de messages partiels pendant les réponses en streaming
- `skillsEnable` : Active ou désactive la fonctionnalité de compétences pour la session
- `turnTimeout` : Délai d'attente pour un tour complet de conversation
- `messageTimeout` : Délai d'attente pour les messages individuels dans un tour
- `resumeSessionId` : Identifiant d'une session précédente à reprendre
- `otherOptions` : Options supplémentaires en ligne de commande à transmettre au CLI

### Fonctionnalités de contrôle des sessions

- **Création de session** : Utilisez `QwenCodeCli.newSession()` pour créer une nouvelle session avec des options personnalisées
- **Gestion des sessions** : La classe `Session` fournit des méthodes pour envoyer des invites, gérer les réponses et contrôler l'état de la session
- **Nettoyage des sessions** : Fermez toujours les sessions en utilisant `session.close()` afin de terminer correctement le processus CLI
- **Reprise de session** : Utilisez `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente
- **Interruption de session** : Utilisez `session.interrupt()` pour interrompre une invite en cours d'exécution
- **Changement dynamique de modèle** : Utilisez `session.setModel()` pour modifier le modèle pendant une session
- **Changement dynamique du mode de permission** : Utilisez `session.setPermissionMode()` pour modifier le mode de permission pendant une session

### Configuration du pool de threads

Le SDK utilise un pool de threads pour gérer les opérations concurrentes avec la configuration par défaut suivante :

- **Taille du pool de base** : 30 threads
- **Taille maximale du pool** : 100 threads
- **Durée de maintien en vie** : 60 secondes
- **Capacité de la file d'attente** : 300 tâches (en utilisant LinkedBlockingQueue)
- **Nommage des threads** : "qwen_code_cli-pool-{number}"
- **Threads daemon** : false
- **Gestionnaire de rejet d'exécution** : CallerRunsPolicy

## Gestion des erreurs

Le SDK fournit des types d'exceptions spécifiques pour différents scénarios d'erreur :

- `SessionControlException` : levée lorsqu'il y a un problème avec le contrôle de la session (création, initialisation, etc.)
- `SessionSendPromptException` : levée lorsqu'il y a un problème lors de l'envoi d'une invite ou de la réception d'une réponse
- `SessionClosedException` : levée lorsqu'on tente d'utiliser une session fermée

## FAQ / Dépannage

### Q : Dois-je installer le CLI Qwen séparément ?

R : oui, nécessite Qwen CLI version 0.5.5 ou supérieure.

### Q : Quelles versions de Java sont prises en charge ?

R : Le SDK nécessite Java 1.8 ou une version supérieure.

### Q : Comment gérer les requêtes longues ?

R : Le SDK inclut des utilitaires pour gérer les délais d'attente. Vous pouvez configurer les délais d'attente à l'aide de la classe `Timeout` dans `TransportOptions`.

### Q : Pourquoi certains outils ne s'exécutent-ils pas ?

R : Cela est probablement dû aux modes d'autorisation. Vérifiez vos paramètres de mode d'autorisation et envisagez d'utiliser `allowedTools` pour pré-approuver certains outils.

### Q : Comment reprendre une session précédente ?

R : Utilisez la méthode `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente.

### Q : Puis-je personnaliser l'environnement du processus CLI ?

R : Oui, utilisez la méthode `setEnv()` dans `TransportOptions` pour transmettre des variables d'environnement au processus CLI.

## Licence

Apache-2.0 - voir [LICENSE](./LICENSE) pour plus de détails.