# SDK Java Qwen Code

Le SDK Java Qwen Code est un SDK expérimental minimal permettant un accès programmatique aux fonctionnalités de Qwen Code. Il fournit une interface Java pour interagir avec l’interface en ligne de commande (CLI) de Qwen Code, ce qui permet aux développeurs d’intégrer les capacités de Qwen Code dans leurs applications Java.

## Prérequis

- Java >= 1.8  
- Maven >= 3.6.0 (pour la compilation à partir des sources)  
- qwen-code >= 0.5.0  

### Dépendances

- **Journalisation** : `ch.qos.logback:logback-classic`  
- **Utilitaires** : `org.apache.commons:commons-lang3`  
- **Traitement JSON** : `com.alibaba.fastjson2:fastjson2`  
- **Tests** : JUnit 5 (`org.junit.jupiter:junit-jupiter`)  

## Installation

Ajoutez la dépendance suivante à votre fichier `pom.xml` Maven :

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Ou, si vous utilisez Gradle, ajoutez-la à votre fichier `build.gradle` :

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Compilation et exécution

### Commandes de compilation

```bash

# Compiler le projet  
mvn compile  

# Exécuter les tests  
mvn test  

# Créer le fichier JAR  
mvn package  

# Installer dans le référentiel local  
mvn install

## Démarrage rapide

La façon la plus simple d’utiliser le SDK consiste à passer par la méthode `QwenCodeCli.simpleQuery()` :

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Pour une utilisation avancée avec des options de transport personnalisées :

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

    List<String> result = QwenCodeCli.simpleQuery("qui êtes-vous et quelles sont vos capacités ?", options);
    result.forEach(logger::info);
}
```

Pour la gestion de contenus en flux continu avec des consommateurs de contenu personnalisés :

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("qui êtes-vous et quelles sont vos capacités ?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Contenu texte reçu : {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Contenu réflexif reçu : {}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Contenu d’utilisation d’outil reçu : {} avec les arguments : {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Résultat d’outil reçu : {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Autre contenu reçu : {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Informations d’utilisation reçues : jetons d’entrée : {}, jetons de sortie : {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Exemple de flux continu terminé.");
}
```

Pour d’autres exemples, consultez `src/test/java/com/alibaba/qwen/code/cli/example`.

## Architecture

Le SDK suit une architecture en couches :

- **Couche API** : Fournit les points d’entrée principaux via la classe `QwenCodeCli`, avec des méthodes statiques simples pour une utilisation basique  
- **Couche Session** : Gère les sessions de communication avec l’interface en ligne de commande Qwen Code via la classe `Session`  
- **Couche Transport** : Gère le mécanisme de communication entre le SDK et le processus de l’interface en ligne de commande (actuellement implémenté via un transport par processus, `ProcessTransport`)  
- **Couche Protocole** : Définit les structures de données utilisées pour la communication, conformément au protocole de l’interface en ligne de commande  
- **Utilitaires** : Fonctions courantes pour l’exécution concurrente, la gestion des délais d’attente (*timeouts*) et la gestion des erreurs  

## Fonctionnalités clés

### Modes d’autorisation

Le SDK prend en charge différents modes d’autorisation pour contrôler l’exécution des outils :

- **`default`** : Les outils d’écriture sont refusés, sauf s’ils sont explicitement approuvés via le rappel `canUseTool` ou listés dans `allowedTools`. Les outils en lecture seule s’exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d’écriture et demande à l’IA de présenter d’abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils de modification (par exemple `edit`, `write_file`), tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s’exécutent automatiquement, sans confirmation.

### Consommateurs d’événements de session et consommateurs de contenu de l’assistant

Le SDK fournit deux interfaces clés pour traiter les événements et le contenu provenant de l’interface en ligne de commande (CLI) :

#### Interface SessionEventConsumers

L’interface `SessionEventConsumers` fournit des fonctions de rappel pour les différents types de messages échangés au cours d’une session :

- `onSystemMessage` : traite les messages système provenant de l’interface en ligne de commande (CLI) (reçoit une instance de `Session` et de `SDKSystemMessage`)  
- `onResultMessage` : traite les messages de résultat provenant de la CLI (reçoit une instance de `Session` et de `SDKResultMessage`)  
- `onAssistantMessage` : traite les messages de l’assistant (réponses de l’IA) (reçoit une instance de `Session` et de `SDKAssistantMessage`)  
- `onPartialAssistantMessage` : traite les messages partiels de l’assistant pendant le flux continu (streaming) (reçoit une instance de `Session` et de `SDKPartialAssistantMessage`)  
- `onUserMessage` : traite les messages utilisateur (reçoit une instance de `Session` et de `SDKUserMessage`)  
- `onOtherMessage` : traite les autres types de messages (reçoit une instance de `Session` et une chaîne de caractères `String`)  
- `onControlResponse` : traite les réponses de contrôle (reçoit une instance de `Session` et de `CLIControlResponse`)  
- `onControlRequest` : traite les demandes de contrôle (reçoit une instance de `Session` et de `CLIControlRequest`, renvoie une instance de `CLIControlResponse`)  
- `onPermissionRequest` : traite les demandes d’autorisation (reçoit une instance de `Session` et de `CLIControlRequest<CLIControlPermissionRequest>`, renvoie une instance de `Behavior`)

#### Interface `AssistantContentConsumers`

L’interface `AssistantContentConsumers` gère les différents types de contenu figurant dans les messages de l’assistant :

- `onText` : gère le contenu textuel (reçoit une instance de `Session` et de `TextAssistantContent`)  
- `onThinking` : gère le contenu relatif à la réflexion (reçoit une instance de `Session` et de `ThingkingAssistantContent`)  
- `onToolUse` : gère l’utilisation d’un outil (reçoit une instance de `Session` et de `ToolUseAssistantContent`)  
- `onToolResult` : gère le résultat d’un outil (reçoit une instance de `Session` et de `ToolResultAssistantContent`)  
- `onOtherContent` : gère les autres types de contenu (reçoit une instance de `Session` et de `AssistantContent`)  
- `onUsage` : gère les informations d’utilisation (reçoit une instance de `Session` et de `AssistantUsage`)  
- `onPermissionRequest` : gère les demandes d’autorisation (reçoit une instance de `Session` et de `CLIControlPermissionRequest`, renvoie une valeur de type `Behavior`)  
- `onOtherControlRequest` : gère les autres demandes de contrôle (reçoit une instance de `Session` et de `ControlRequestPayload`, renvoie une valeur de type `ControlResponsePayload`)

#### Relation entre les interfaces

**Remarque importante concernant la hiérarchie des événements :**

- `SessionEventConsumers` est le processeur d’événements **haut niveau**, chargé de traiter les différents types de messages (système, assistant, utilisateur, etc.).
- `AssistantContentConsumers` est le processeur de contenu **bas niveau**, chargé de traiter les différents types de contenu au sein des messages de l’assistant (texte, outils, raisonnement, etc.).

**Relation entre processeurs :**

- `SessionEventConsumers` → `AssistantContentConsumers` (`SessionEventConsumers` utilise `AssistantContentConsumers` pour traiter le contenu des messages de l’assistant)

**Relations de dérivation des événements :**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Relations de délai d’attente (timeout) des événements :**

Chaque méthode gestionnaire d’événement possède une méthode correspondante de délai d’attente permettant de personnaliser le comportement de délai spécifique à cet événement :

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Pour les méthodes de délai d’attente de `AssistantContentConsumers` :

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Valeurs par défaut des délais d’attente :**

- Délai d’attente par défaut de `SessionEventSimpleConsumers` : 180 secondes (`Timeout.TIMEOUT_180_SECONDS`)
- Délai d’attente par défaut de `AssistantContentSimpleConsumers` : 60 secondes (`Timeout.TIMEOUT_60_SECONDS`)

**Exigences relatives à la hiérarchie des délais d’attente :**

Pour un fonctionnement correct, les relations suivantes entre délais d’attente doivent être respectées :

- La valeur renvoyée par `onAssistantMessageTimeout` doit être supérieure aux valeurs renvoyées par `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` et `onOtherContentTimeout`.
- La valeur renvoyée par `onControlRequestTimeout` doit être supérieure aux valeurs renvoyées par `onPermissionRequestTimeout` et `onOtherControlRequestTimeout`.

### Options de transport

La classe `TransportOptions` permet de configurer la manière dont le SDK communique avec l’interface en ligne de commande (CLI) de Qwen Code :

- `pathToQwenExecutable` : Chemin vers l’exécutable de la CLI de Qwen Code  
- `cwd` : Répertoire de travail du processus CLI  
- `model` : Modèle d’intelligence artificielle à utiliser pour la session  
- `permissionMode` : Mode d’autorisation qui contrôle l’exécution des outils  
- `env` : Variables d’environnement à transmettre au processus CLI  
- `maxSessionTurns` : Limite le nombre d’échanges dans une session  
- `coreTools` : Liste des outils fondamentaux accessibles à l’IA  
- `excludeTools` : Liste des outils à exclure de l’accès de l’IA  
- `allowedTools` : Liste des outils préapprouvés, pouvant être utilisés sans confirmation supplémentaire  
- `authType` : Type d’authentification à utiliser pour la session  
- `includePartialMessages` : Active la réception de messages partiels pendant les réponses en streaming  
- `turnTimeout` : Délai d’attente maximal pour un échange complet de conversation  
- `messageTimeout` : Délai d’attente maximal pour un message individuel au sein d’un échange  
- `resumeSessionId` : Identifiant d’une session précédente à reprendre  
- `otherOptions` : Autres options de ligne de commande à transmettre à la CLI

### Fonctionnalités de contrôle des sessions

- **Création de session** : Utilisez `QwenCodeCli.newSession()` pour créer une nouvelle session avec des options personnalisées  
- **Gestion des sessions** : La classe `Session` fournit des méthodes pour envoyer des invites, traiter les réponses et gérer l’état de la session  
- **Nettoyage des sessions** : Fermez toujours les sessions à l’aide de `session.close()` afin de terminer correctement le processus CLI  
- **Reprise de session** : Utilisez `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente  
- **Interruption de session** : Utilisez `session.interrupt()` pour interrompre une invite actuellement en cours d’exécution  
- **Changement dynamique de modèle** : Utilisez `session.setModel()` pour modifier le modèle pendant une session  
- **Changement dynamique du mode d’autorisation** : Utilisez `session.setPermissionMode()` pour modifier le mode d’autorisation pendant une session

### Configuration du pool de threads

Le SDK utilise un pool de threads pour gérer les opérations concurrentes, avec la configuration par défaut suivante :

- **Taille initiale du pool** : 30 threads  
- **Taille maximale du pool** : 100 threads  
- **Délai de conservation des threads inactifs** : 60 secondes  
- **Capacité de la file d’attente** : 300 tâches (avec `LinkedBlockingQueue`)  
- **Nom des threads** : `qwen_code_cli-pool-{number}`  
- **Threads démons** : `false`  
- **Stratégie de gestion des tâches rejetées** : `CallerRunsPolicy`

## Gestion des erreurs

Le SDK fournit des types d’exception spécifiques pour différents scénarios d’erreur :

- `SessionControlException` : levée en cas de problème lié au contrôle de la session (création, initialisation, etc.)  
- `SessionSendPromptException` : levée en cas de problème lors de l’envoi d’un prompt ou de la réception d’une réponse  
- `SessionClosedException` : levée lorsqu’on tente d’utiliser une session fermée  

## FAQ / Dépannage

### Q : Dois-je installer séparément l’interface en ligne de commande Qwen ?

R : Oui, l’interface en ligne de commande Qwen version 0.5.5 ou supérieure est requise.

### Q : Quelles versions de Java sont prises en charge ?

R : Le SDK nécessite Java 1.8 ou une version ultérieure.

### Q : Comment gérer les requêtes longues ?

R : Le SDK inclut des utilitaires de gestion des délais d’attente. Vous pouvez configurer ces délais à l’aide de la classe `Timeout` dans `TransportOptions`.

### Q : Pourquoi certains outils ne s’exécutent-ils pas ?

R : Cela est probablement dû aux modes d’autorisation. Vérifiez vos paramètres de mode d’autorisation et envisagez d’utiliser `allowedTools` pour approuver préalablement certains outils.

### Q : Comment reprendre une session précédente ?

R : Utilisez la méthode `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente.

### Q : Puis-je personnaliser l’environnement du processus CLI ?

R : Oui, utilisez la méthode `setEnv()` dans `TransportOptions` pour transmettre des variables d’environnement au processus CLI.

## Licence

Apache-2.0 — voir [LICENSE](./LICENSE) pour plus de détails.