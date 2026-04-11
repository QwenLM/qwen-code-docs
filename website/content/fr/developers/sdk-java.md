# Qwen Code Java SDK

Le SDK Java Qwen Code est un SDK expérimental minimal permettant un accès programmatique aux fonctionnalités de Qwen Code. Il fournit une interface Java pour interagir avec la CLI Qwen Code, permettant aux développeurs d'intégrer les capacités de Qwen Code dans leurs applications Java.

## Prérequis

- Java >= 1.8
- Maven >= 3.6.0 (pour la compilation depuis les sources)
- qwen-code >= 0.5.0

### Dépendances

- **Logging** : ch.qos.logback:logback-classic
- **Utilities** : org.apache.commons:commons-lang3
- **JSON Processing** : com.alibaba.fastjson2:fastjson2
- **Testing** : JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Ajoutez la dépendance suivante à votre `pom.xml` Maven :

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Ou si vous utilisez Gradle, ajoutez-la à votre `build.gradle` :

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Compilation et exécution

### Commandes de compilation

```bash
# Compile the project
mvn compile

# Run tests
mvn test

# Package the JAR
mvn package

# Install to local repository
mvn install
```

## Démarrage rapide

La méthode la plus simple pour utiliser le SDK est d'utiliser la méthode `QwenCodeCli.simpleQuery()` :

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

Pour la gestion du streaming de contenu avec des consommateurs de contenu personnalisés :

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

Pour d'autres exemples, consultez `src/test/java/com/alibaba/qwen/code/cli/example`

## Architecture

Le SDK suit une architecture en couches :

- **API Layer** : Fournit les points d'entrée principaux via la classe `QwenCodeCli` avec des méthodes statiques simples pour une utilisation de base
- **Session Layer** : Gère les sessions de communication avec la CLI Qwen Code via la classe `Session`
- **Transport Layer** : Gère le mécanisme de communication entre le SDK et le processus CLI (utilise actuellement le transport par processus via `ProcessTransport`)
- **Protocol Layer** : Définit les structures de données pour la communication basées sur le protocole CLI
- **Utils** : Utilitaires communs pour l'exécution concurrente, la gestion des timeout et la gestion des erreurs

## Fonctionnalités principales

### Modes de permission

Le SDK prend en charge différents modes de permission pour contrôler l'exécution des outils :

- **`default`** : Les outils d'écriture sont refusés sauf s'ils sont approuvés via le callback `canUseTool` ou dans `allowedTools`. Les outils en lecture seule s'exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d'écriture et demande à l'IA de présenter d'abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils d'édition (edit, write_file) tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s'exécutent automatiquement sans confirmation.

### Consommateurs d'événements de session et de contenu d'assistant

Le SDK fournit deux interfaces clés pour gérer les événements et le contenu provenant de la CLI :

#### Interface SessionEventConsumers

L'interface `SessionEventConsumers` fournit des callbacks pour différents types de messages lors d'une session :

- `onSystemMessage` : Gère les messages système de la CLI (reçoit Session et SDKSystemMessage)
- `onResultMessage` : Gère les messages de résultat de la CLI (reçoit Session et SDKResultMessage)
- `onAssistantMessage` : Gère les messages de l'assistant (réponses IA) (reçoit Session et SDKAssistantMessage)
- `onPartialAssistantMessage` : Gère les messages partiels de l'assistant pendant le streaming (reçoit Session et SDKPartialAssistantMessage)
- `onUserMessage` : Gère les messages utilisateur (reçoit Session et SDKUserMessage)
- `onOtherMessage` : Gère les autres types de messages (reçoit Session et un message String)
- `onControlResponse` : Gère les réponses de contrôle (reçoit Session et CLIControlResponse)
- `onControlRequest` : Gère les requêtes de contrôle (reçoit Session et CLIControlRequest, retourne CLIControlResponse)
- `onPermissionRequest` : Gère les requêtes de permission (reçoit Session et CLIControlRequest<CLIControlPermissionRequest>, retourne Behavior)

#### Interface AssistantContentConsumers

L'interface `AssistantContentConsumers` gère différents types de contenu au sein des messages de l'assistant :

- `onText` : Gère le contenu textuel (reçoit Session et TextAssistantContent)
- `onThinking` : Gère le contenu de réflexion (reçoit Session et ThingkingAssistantContent)
- `onToolUse` : Gère le contenu d'utilisation d'outil (reçoit Session et ToolUseAssistantContent)
- `onToolResult` : Gère le contenu de résultat d'outil (reçoit Session et ToolResultAssistantContent)
- `onOtherContent` : Gère les autres types de contenu (reçoit Session et AssistantContent)
- `onUsage` : Gère les informations d'utilisation (reçoit Session et AssistantUsage)
- `onPermissionRequest` : Gère les requêtes de permission (reçoit Session et CLIControlPermissionRequest, retourne Behavior)
- `onOtherControlRequest` : Gère les autres requêtes de contrôle (reçoit Session et ControlRequestPayload, retourne ControlResponsePayload)

#### Relation entre les interfaces

**Remarque importante sur la hiérarchie des événements :**

- `SessionEventConsumers` est le processeur d'événements de **haut niveau** qui gère différents types de messages (système, assistant, utilisateur, etc.)
- `AssistantContentConsumers` est le processeur de contenu de **bas niveau** qui gère différents types de contenu au sein des messages de l'assistant (texte, outils, réflexion, etc.)

**Relation entre les processeurs :**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers utilise AssistantContentConsumers pour traiter le contenu des messages de l'assistant)

**Relations de dérivation des événements :**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Relations de timeout des événements :**

Chaque méthode de gestion d'événement possède une méthode de timeout correspondante permettant de personnaliser le comportement du timeout pour cet événement spécifique :

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Pour les méthodes de timeout d'AssistantContentConsumers :

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Valeurs de timeout par défaut :**

- `SessionEventSimpleConsumers` timeout par défaut : 180 secondes (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers` timeout par défaut : 60 secondes (Timeout.TIMEOUT_60_SECONDS)

**Exigences de hiérarchie des timeouts :**

Pour un fonctionnement correct, les relations de timeout suivantes doivent être respectées :

- La valeur de retour de `onAssistantMessageTimeout` doit être supérieure aux valeurs de retour de `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` et `onOtherContentTimeout`
- La valeur de retour de `onControlRequestTimeout` doit être supérieure aux valeurs de retour de `onPermissionRequestTimeout` et `onOtherControlRequestTimeout`

### Options de transport

La classe `TransportOptions` permet de configurer la manière dont le SDK communique avec la CLI Qwen Code :

- `pathToQwenExecutable` : Chemin vers l'exécutable de la CLI Qwen Code
- `cwd` : Répertoire de travail du processus CLI
- `model` : Modèle IA à utiliser pour la session
- `permissionMode` : Mode de permission qui contrôle l'exécution des outils
- `env` : Variables d'environnement à transmettre au processus CLI
- `maxSessionTurns` : Limite le nombre de tours de conversation dans une session
- `coreTools` : Liste des outils principaux qui doivent être disponibles pour l'IA
- `excludeTools` : Liste des outils à exclure de la disponibilité pour l'IA
- `allowedTools` : Liste des outils pré-approuvés pour une utilisation sans confirmation supplémentaire
- `authType` : Type d'authentification à utiliser pour la session
- `includePartialMessages` : Active la réception de messages partiels pendant les réponses en streaming
- `turnTimeout` : Timeout pour un tour complet de conversation
- `messageTimeout` : Timeout pour les messages individuels au sein d'un tour
- `resumeSessionId` : ID d'une session précédente à reprendre
- `otherOptions` : Options de ligne de commande supplémentaires à transmettre à la CLI

### Fonctionnalités de contrôle de session

- **Création de session** : Utilisez `QwenCodeCli.newSession()` pour créer une nouvelle session avec des options personnalisées
- **Gestion de session** : La classe `Session` fournit des méthodes pour envoyer des prompts, gérer les réponses et contrôler l'état de la session
- **Nettoyage de session** : Fermez toujours les sessions avec `session.close()` pour terminer correctement le processus CLI
- **Reprise de session** : Utilisez `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente
- **Interruption de session** : Utilisez `session.interrupt()` pour interrompre un prompt en cours d'exécution
- **Changement dynamique de modèle** : Utilisez `session.setModel()` pour changer de modèle pendant une session
- **Changement dynamique de mode de permission** : Utilisez `session.setPermissionMode()` pour changer le mode de permission pendant une session

### Configuration du pool de threads

Le SDK utilise un pool de threads pour gérer les opérations concurrentes avec la configuration par défaut suivante :

- **Core Pool Size** : 30 threads
- **Maximum Pool Size** : 100 threads
- **Keep-Alive Time** : 60 secondes
- **Queue Capacity** : 300 tâches (via LinkedBlockingQueue)
- **Thread Naming** : "qwen_code_cli-pool-{number}"
- **Daemon Threads** : false
- **Rejected Execution Handler** : CallerRunsPolicy

## Gestion des erreurs

Le SDK fournit des types d'exceptions spécifiques pour différents scénarios d'erreur :

- `SessionControlException` : Levée en cas de problème avec le contrôle de session (création, initialisation, etc.)
- `SessionSendPromptException` : Levée en cas de problème lors de l'envoi d'un prompt ou de la réception d'une réponse
- `SessionClosedException` : Levée lors de la tentative d'utilisation d'une session fermée

## FAQ / Dépannage

### Q : Dois-je installer la CLI Qwen séparément ?

R : Oui, la CLI Qwen 0.5.5 ou une version supérieure est requise.

### Q : Quelles versions de Java sont prises en charge ?

R : Le SDK nécessite Java 1.8 ou une version supérieure.

### Q : Comment gérer les requêtes de longue durée ?

R : Le SDK inclut des utilitaires de timeout. Vous pouvez configurer les timeouts à l'aide de la classe `Timeout` dans `TransportOptions`.

### Q : Pourquoi certains outils ne s'exécutent-ils pas ?

R : Cela est probablement dû aux modes de permission. Vérifiez vos paramètres de mode de permission et envisagez d'utiliser `allowedTools` pour pré-approuver certains outils.

### Q : Comment reprendre une session précédente ?

R : Utilisez la méthode `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente.

### Q : Puis-je personnaliser l'environnement pour le processus CLI ?

R : Oui, utilisez la méthode `setEnv()` dans `TransportOptions` pour transmettre des variables d'environnement au processus CLI.

## Licence

Apache-2.0 - consultez [LICENSE](./LICENSE) pour plus de détails.