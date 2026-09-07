# SDK Java pour Qwen Code

Le SDK Java pour Qwen Code fournit un transport démon recommandé pour `qwen serve` et conserve l'API stdio legacy expérimentale pour la compatibilité. Les deux API sont livrées dans le même artefact `com.alibaba:qwencode-sdk`.

## Prérequis

- Java >= 11 pour `0.1.0-alpha`
- Maven >= 3.9.2 pour la construction ou la publication de ce SDK depuis les sources
- Un `qwen serve` compatible pour l'API démon, ou qwen-code >= 0.5.0 pour l'API stdio legacy

### Dépendances

- **Logging API** : org.slf4j:slf4j-api (choisissez un fournisseur SLF4J dans votre application)
- **Utilitaires** : org.apache.commons:commons-lang3
- **Traitement JSON** : Fastjson2 pour l'encodage et Jackson Core pour le décodage strict
- **Tests** : JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Ajoutez la dépendance suivante à votre fichier `pom.xml` Maven :

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>0.1.0-alpha</version>
</dependency>
```

Ou si vous utilisez Gradle, ajoutez à votre `build.gradle` :

```gradle
implementation 'com.alibaba:qwencode-sdk:0.1.0-alpha'
```

## Construction et exécution

### Commandes de construction

```bash
# Compilation du projet
mvn compile

# Exécution des tests
mvn test

# Empaquetage du JAR
mvn package

# Installation dans le dépôt local
mvn install
```

### E2E avec démon réel depuis les sources

Exécutez les tests d'intégration Java avec démon réel depuis la racine du dépôt après avoir construit les workspaces et le bundle CLI racine :

```bash
npm run build
npm run bundle
npx tsx scripts/run-java-daemon-sdk-e2e.ts
```

`npm run build` seul ne rafraîchit pas `dist/cli.js` ; le harnais E2E lance ce bundle et échoue avec une erreur de prérequis explicite lorsqu'il est absent.

## API démon recommandée

Démarrez `qwen serve`, puis créez une session thread-scoped indépendante. `promptText` retourne uniquement après un `turn_complete` correspondant ; les flux incomplets échouent avec `PromptOutcomeIndeterminateException` plutôt que de retourner du texte partiel comme succès.

Pour les garanties de cycle de vie supposées par `0.1.0-alpha`, utilisez la build qwen-code publiée depuis la même révision source que le SDK. Le démon doit contenir le registre de détachement idempotent par client de [#7386](https://github.com/QwenLM/qwen-code/pull/7386), la garantie de terminal par époque de [#7400](https://github.com/QwenLM/qwen-code/pull/7400), et l'annulation d'admission reconnue de cette version plus la clôture FIFO de vidage d'annulation. Le commit #7400 seul n'est pas suffisant : un démon de même wire peut accuser réception de l'annulation avant la distribution de l'agent sans arrêter le prompt admis, ou laisser une annulation non accusée au niveau de la session atteindre un successeur en file. L'enfant ACP bundled utilise une poignée de main d'annulation consciente de l'admission accusée ; un enfant ACP conforme aux standards sans cette extension reçoit une notification standard `session/cancel`. La négociation de fonctionnalités ne peut pas distinguer les builds démon de même wire plus anciennes, donc le SDK échoue en refusant (fail closed) plutôt que de signaler une sortie partielle comme succès.

La poignée de main d'annulation bundled attend délibérément que l'appel de prompt ciblé se règle avant que le démon ne distribue son successeur en file. Elle n'a pas de timeout qui se contente d'accuser réception de l'annulation : cela pourrait laisser une annulation tardive au niveau de la session atteindre le prompt suivant. Si un fournisseur, un outil ou une intégration personnalisée ignore son `AbortSignal` indéfiniment, la mutation d'annulation peut donc rester à résultat inconnu et cette session ne doit pas être réutilisée. Considérez un terminal de prompt formel reçu dans la limite d'observation de l'appelant comme faisant autorité ; sinon fermez ou détruisez la session après l'échec de l'observation. Récupérer un enfant ACP partagé bloqué sans perturber ses sessions sœurs nécessite une isolation runtime plus forte et sort du cadre de ce contrat alpha.

```java
import com.alibaba.qwen.code.daemon.DaemonClient;
import com.alibaba.qwen.code.daemon.DaemonSessionClient;
import com.alibaba.qwen.code.daemon.PromptTextResult;
import java.net.URI;

try (DaemonClient daemon = DaemonClient.builder()
        .baseUri(URI.create("http://127.0.0.1:4170"))
        .build();
     DaemonSessionClient session = daemon.createSession()) {
    PromptTextResult result = session.promptText("Explain this repository");
    System.out.println(result.getText());
}
```

Les appelants qui doivent allouer l'identité de session avant la création peuvent passer un UUID RFC v1-v5. Le SDK vérifie `session_id_override` avant la mutation et signale un ID retourné différent comme `SessionCreationOutcomeUnknownException` :

```java
CreateSessionRequest request = CreateSessionRequest.builder()
        .sessionId("550E8400-E29B-41D4-A716-446655440000")
        .build();

try (DaemonSessionClient session = daemon.createSession(request)) {
    System.out.println(session.getSession().getSessionId());
}
```

Le démon normalise l'ID en minuscules et crée une nouvelle session thread. Ce n'est pas un attach idempotent ; après un résultat de création ambigu, récupérez avec l'ID connu plutôt que de réessayer la création.

Si `qwen serve` nécessite une authentification, ajoutez
`.bearerToken(System.getenv("QWEN_SERVER_TOKEN"))` au builder `DaemonClient`.
Le SDK envoie le bearer sur les requêtes REST et SSE et ne le met jamais dans
l'URL.

Utilisez `startPrompt` avec un `PromptObserver` lorsque vous avez besoin de callbacks ordonnés pour le texte, la réflexion, les outils, l'utilisation, les permissions et les événements bruts. Ses vues `acceptanceFuture()` et `completionFuture()` exposent séparément l'admission par le démon et le terminal de tour fiable. `respondToPermission()` retourne `false` lorsque la requête a déjà été résolue ou n'est plus en attente. Annuler les vues futures n'annule pas le prompt du démon ; utilisez `cancelActivePrompt()` pour l'opération d'annulation au niveau de la session et attendez toujours le terminal correspondant. Une annulation coopérative se termine avec `turn_complete` et `stopReason=cancelled` ; `promptText()` retourne son `PromptTextResult`, donc les appelants qui distinguent l'annulation doivent inspecter `result.getTerminal().getStopReason()`. Si l'agent ou le fournisseur échoue lors de l'annulation, le démon peut publier `turn_error` à la place, ce qui fait que `promptText()` lève `PromptTurnException`.

Lorsque l'annulation, la deadline, le démontage ou le règlement de l'agent entrent en compétition, le latch exactly-once du démon publie le premier terminal formel et supprime les candidats ultérieurs. Bifurquez toujours sur le terminal reçu lui-même ; la dernière mutation de contrôle envoyée par le client ne détermine pas le type de terminal ou le code d'erreur.

Le transport SSE envoie `Accept-Encoding: identity` et `Last-Event-ID`, valide le cadrage et les IDs d'événements, déduplique la relecture, et reconnecte uniquement le GET SSE. Les requêtes de prompt et autres mutations ne sont jamais réessayées automatiquement. Les réponses HTTP 408 et 5xx à l'admission de prompt, la création de session, la permission, l'annulation, le heartbeat, le détachement ou la suppression sont signalées comme résultat incertain car elles ne prouvent pas que le démon a rejeté la mutation. Les corps de réponse finis et l'observation SSE ont des deadlines indépendantes.

La sélection de modèle à la création n'est intentionnellement pas exposée par l'API SDK démon Java dans cette alpha. Le démon signale un `modelServiceId` rejeté uniquement comme un événement SSE émis avant la réponse de création, tandis que ce SDK ouvre son flux depuis le watermark d'admission de prompt ultérieur. Jusqu'à ce que le démon retourne un résultat de création définitif ou que le SDK possède une souscription séparée aux événements de session depuis `Last-Event-ID: 0`, utilisez le modèle par défaut configuré du démon.

`PromptRequest.Builder.deadline(Duration)` demande une deadline de prompt appliquée par le démon et n'est acceptée que lorsque le démon annonce `prompt_absolute_deadline` ; sinon le SDK échoue avant d'envoyer le prompt. La valeur doit être comprise entre 1 et 2 147 483 647 millisecondes, correspondant à la plage de temporisation Node du démon. Ceci est distinct de `observationTimeout(Duration)`, qui borne uniquement l'observation SSE locale et n'envoie jamais de mutation d'annulation.

Avant de créer une session, le SDK exige que le démon annonce le transport REST et `session_scope_override` ; cela empêche un démon plus ancien d'ignorer silencieusement la portée `thread` demandée et d'attacher le client à une session partagée. Lorsqu'un appelant fournit un ID de session, le SDK exige en plus `session_id_override` avant d'envoyer la mutation. Lorsque `client_heartbeat` est annoncé, une session ouverte envoie un nouveau heartbeat chaque minute afin que le démon ne moissonne pas un client autrement inactif. Définissez `heartbeatInterval(Duration.ZERO)` sur le builder `DaemonClient` pour désactiver ce comportement, ou choisissez un intervalle positif différent. Un heartbeat n'est jamais réessayé ; le prochain heartbeat planifié est un keepalive séparé. L'observation de prompt est limitée à 32 prompts simultanés par client par défaut et peut être ajustée avec `maximumConcurrentPrompts`. Les callbacks d'admission et de terminal futur s'exécutent en dehors des workers de transport ; les callbacks qui restent bloqués consomment une capacité de publication bornée. Le nettoyage du flux SSE est également borné, et une fermeture bloquée conserve sa réservation de nettoyage. L'une ou l'autre condition peut faire échouer un `startPrompt` ultérieur avec `DaemonClientCapacityException` plutôt que d'abandonner une fermeture par timeout ou de développer les threads et le travail en file sans limite.

Une complétion indéterminée est une limite de résultat, pas une limite de réutilisation de session. Après `PromptAdmissionUnknownException` ou `PromptOutcomeIndeterminateException`, ce `DaemonSessionClient` rejette définitivement les prompts ultérieurs même si le nettoyage local du flux réussit plus tard ; fermez ou détruisez la session à la place. Un timeout d'observation est publié sans attendre indéfiniment une fermeture de flux bloquée, tandis que le nettoyage continue de manière asynchrone et conserve la capacité bornée du client jusqu'à son terme.

## API stdio legacy

L'API `com.alibaba.qwen.code.cli` existante reste disponible :

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
            .setAllowedTools(Arrays.asList("read_file", "write_file", "glob"));

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
                public void onThinking(Session session, ThinkingAssistantContent thinkingAssistantContent) {
                    logger.info("Thinking content received: {}", thinkingAssistantContent.getThinking());
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

Pour d'autres exemples, consultez le répertoire src/test/java/com/alibaba/qwen/code/cli/example

## Java 11 migration et limites alpha

`0.1.0-alpha` relève la version minimale de Java pour l'ensemble de l'artefact de 8 à 11. Les applications Java 8 doivent rester sur `0.0.3-alpha`. Logback n'est plus une dépendance runtime ; ajoutez le fournisseur SLF4J utilisé par votre application.

Cette alpha échoue délibérément en refusant (fail closed) lorsqu'elle ne peut pas prouver un terminal de prompt. Elle ne garantit pas l'exécution exactly-once à travers les redémarrages du démon, ni la récupération automatique d'époque, ni le snapshot/resync, ni les curseurs persistés, ni l'annulation ciblée par ID de prompt. `prompt_cancelled` et les événements de file sont advisés ; seuls `turn_complete` et `turn_error` correspondants sont terminaux.

Si la création de session a un résultat de transport ambigu, le démon peut conserver une session dont l'ID n'a jamais atteint l'appelant. Le SDK ne réessaie pas la création et ne peut pas détacher cette session inconnue ; le moissonnage de cycle de vie côté démon est la limite de récupération.

## Architecture

L'artefact contient deux implémentations isolées :

- **Daemon API** : `DaemonClient` et `DaemonSessionClient` utilisent des mutations REST plus du SSE résumable et possèdent des ressources HTTP, de prompt, de maintenance et de temporisation bornées.
- **Legacy stdio API** : `QwenCodeCli`, `Session` et `ProcessTransport` gèrent un processus enfant CLI en utilisant les DTOs et utilitaires existants du protocole CLI.

L'implémentation démon ne réutilise pas le transport de processus legacy, le modèle de session, les DTOs ou l'exécuteur global.

## Fonctionnalités legacy stdio

### Modes de permission

Le SDK prend en charge différents modes de permission pour contrôler l'exécution des outils :

- **`default`** : Les outils d'écriture sont refusés sauf approbation via le callback `canUseTool` ou dans `allowedTools`. Les outils en lecture seule s'exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d'écriture, en demandant à l'IA de présenter un plan d'abord.
- **`auto-edit`** : Approuve automatiquement les outils d'édition (`edit`, `write_file`, `notebook_edit`) tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s'exécutent automatiquement sans confirmation.

### Consommateurs d'événements de session et consommateurs de contenu d'assistant

Le SDK fournit deux interfaces clés pour gérer les événements et le contenu de la CLI :

#### Interface SessionEventConsumers

L'interface `SessionEventConsumers` fournit des callbacks pour différents types de messages au cours d'une session :

- `onSystemMessage` : Gère les messages système de la CLI (reçoit Session et SDKSystemMessage)
- `onResultMessage` : Gère les messages de résultat de la CLI (reçoit Session et SDKResultMessage)
- `onAssistantMessage` : Gère les messages d'assistant (réponses de l'IA) (reçoit Session et SDKAssistantMessage)
- `onPartialAssistantMessage` : Gère les messages partiels d'assistant lors du streaming (reçoit Session et SDKPartialAssistantMessage)
- `onUserMessage` : Gère les messages utilisateur (reçoit Session et SDKUserMessage)
- `onOtherMessage` : Gère les autres types de messages (reçoit Session et String message)
- `onControlResponse` : Gère les réponses de contrôle (reçoit Session et CLIControlResponse)
- `onControlRequest` : Gère les requêtes de contrôle (reçoit Session et CLIControlRequest, retourne CLIControlResponse)
- `onPermissionRequest` : Gère les requêtes de permission (reçoit Session et CLIControlRequest<CLIControlPermissionRequest>, retourne Behavior)

#### Interface AssistantContentConsumers

L'interface `AssistantContentConsumers` gère différents types de contenu dans les messages d'assistant :

- `onText` : Gère le contenu textuel (reçoit Session et TextAssistantContent)
- `onThinking` : Gère le contenu de réflexion (reçoit Session et ThinkingAssistantContent)
- `onToolUse` : Gère le contenu d'utilisation d'outil (reçoit Session et ToolUseAssistantContent)
- `onToolResult` : Gère le contenu de résultat d'outil (reçoit Session et ToolResultAssistantContent)
- `onOtherContent` : Gère les autres types de contenu (reçoit Session et AssistantContent)
- `onUsage` : Gère les informations d'utilisation (reçoit Session et AssistantUsage)
- `onPermissionRequest` : Gère les requêtes de permission (reçoit Session et CLIControlPermissionRequest, retourne Behavior)
- `onOtherControlRequest` : Gère les autres requêtes de contrôle (reçoit Session et ControlRequestPayload, retourne ControlResponsePayload)

#### Relation entre les interfaces

**Remarque importante sur la hiérarchie des événements :**

- `SessionEventConsumers` est le processeur d'événements **haut niveau** qui gère différents types de messages (système, assistant, utilisateur, etc.)
- `AssistantContentConsumers` est le processeur de contenu **bas niveau** qui gère différents types de contenu au sein des messages d'assistant (texte, outils, réflexion, etc.)

**Relation entre les processeurs :**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers utilise AssistantContentConsumers pour traiter le contenu des messages d'assistant)

**Relations de dérivation des événements :**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Relations de timeout des événements :**

Chaque méthode de gestion d'événement possède une méthode de timeout correspondante permettant de personnaliser le comportement de timeout pour cet événement spécifique :

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Pour les méthodes de timeout de AssistantContentConsumers :

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

Pour un bon fonctionnement, les relations de timeout suivantes doivent être maintenues :

- La valeur de retour de `onAssistantMessageTimeout` doit être supérieure aux valeurs de retour de `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` et `onOtherContentTimeout`
- La valeur de retour de `onControlRequestTimeout` doit être supérieure aux valeurs de retour de `onPermissionRequestTimeout` et `onOtherControlRequestTimeout`

### Options de transport

La classe `TransportOptions` permet de configurer la communication entre le SDK et la CLI de Qwen Code :

- `pathToQwenExecutable` : Chemin vers l'exécutable de la CLI de Qwen Code
- `cwd` : Répertoire de travail pour le processus CLI
- `model` : Modèle d'IA à utiliser pour la session
- `permissionMode` : Mode de permission qui contrôle l'exécution des outils
- `env` : Variables d'environnement à passer au processus CLI
- `maxSessionTurns` : Limite le nombre de tours de conversation dans une session
- `coreTools` : Liste des outils de base qui doivent être disponibles pour l'IA
- `excludeTools` : Liste des outils à exclure de la disponibilité pour l'IA
- `allowedTools` : Liste des outils pré-approuvés pour une utilisation sans confirmation supplémentaire
- `authType` : Type d'authentification à utiliser pour la session
- `includePartialMessages` : Active la réception de messages partiels lors des réponses en streaming
- `turnTimeout` : Timeout pour un tour de conversation complet
- `messageTimeout` : Timeout pour les messages individuels au sein d'un tour
- `resumeSessionId` : ID d'une session précédente à reprendre
- `otherOptions` : Options supplémentaires en ligne de commande à passer à la CLI

### Fonctionnalités de contrôle de session

- **Création de session** : Utilisez `QwenCodeCli.newSession()` pour créer une nouvelle session avec des options personnalisées
- **Gestion de session** : La classe `Session` fournit des méthodes pour envoyer des prompts, gérer les réponses et gérer l'état de la session
- **Nettoyage de session** : Fermez toujours les sessions avec `session.close()` pour terminer correctement le processus CLI
- **Reprise de session** : Utilisez `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente
- **Interruption de session** : Utilisez `session.interrupt()` pour interrompre un prompt en cours d'exécution
- **Changement dynamique de modèle** : Utilisez `session.setModel()` pour changer le modèle pendant une session
- **Changement dynamique de mode de permission** : Utilisez `session.setPermissionMode()` pour changer le mode de permission pendant une session

### Configuration du pool de threads

Le SDK utilise un pool de threads pour gérer les opérations concurrentes avec la configuration par défaut suivante :

- **Taille de base du pool** : 30 threads
- **Taille maximale du pool** : 100 threads
- **Temps de maintien en vie** : 60 secondes
- **Capacité de la file d'attente** : 300 tâches (avec LinkedBlockingQueue)
- **Nommage des threads** : "qwen_code_cli-pool-{number}"
- **Threads daemon** : true
- **Gestionnaire d'exécution rejetée** : CallerRunsPolicy

## Gestion des erreurs

Le SDK fournit des types d'exceptions spécifiques pour différents scénarios d'erreur :

- `SessionControlException` : Levée en cas de problème de contrôle de session, y compris lors d'une tentative d'utilisation d'une session fermée ou indisponible. La construction de session et `start()` peuvent la lever directement ; `QwenCodeCli.newSession()` encapsule les échecs de création et d'initialisation de bas niveau dans une `RuntimeException`.
- `SessionSendPromptException` : Levée en cas de problème d'envoi d'un prompt ou de réception d'une réponse

## FAQ / Dépannage

### Q : Dois-je installer la CLI Qwen séparément ?

R : Oui. L'API démon nécessite un `qwen serve` compatible ; l'API stdio legacy
nécessite qwen-code 0.5.0 ou supérieur.

### Q : Quelles versions de Java sont prises en charge ?

R : `0.1.0-alpha` nécessite Java 11 ou supérieur. Les utilisateurs de Java 8 doivent rester sur `0.0.3-alpha`.

### Q : Comment gérer les requêtes de longue durée ?

R : Le SDK inclut des utilitaires de timeout. Vous pouvez configurer les timeouts à l'aide de la classe `Timeout` dans `TransportOptions`.

### Q : Pourquoi certains outils ne s'exécutent-ils pas ?

R : Cela est probablement dû aux modes de permission. Vérifiez vos paramètres de mode de permission et envisagez d'utiliser `allowedTools` pour pré-approuver certains outils.

### Q : Comment reprendre une session précédente ?

R : Utilisez la méthode `setResumeSessionId()` dans `TransportOptions` pour reprendre une session précédente.

### Q : Puis-je personnaliser l'environnement du processus CLI ?

R : Oui, utilisez la méthode `setEnv()` dans `TransportOptions` pour passer des variables d'environnement au processus CLI.

## Licence

Apache-2.0 - voir [LICENSE](../../LICENSE) pour plus de détails.