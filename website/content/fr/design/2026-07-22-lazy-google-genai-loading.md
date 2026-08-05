# Chargement paresseux de `@google/genai`

- **Issue** : #7264 candidat 3
- **Périmètre** : closure d'imports du démarrage à froid ACP
- **Statut** : implémenté et validé

## Problème

Le runtime ACP bundlé atteint actuellement l'entrée Node de `@google/genai`
via neuf sites d'imports eager à l'exécution. Le SDK contribue 755 788 octets
à un chunk partagé de 1 196 331 octets contenant 77 entrées, dont
`google-auth-library` et `gaxios`. Parce que l'amorçage ACP importe l'entrée
CLI complète avant de répondre à `initialize`, ce chunk est parsé et évalué
alors que l'amorçage saute délibérément l'initialisation du client Gemini et
la découverte MCP.

Passer les imports eager à `import()` ne suffit pas. La création de session
ACP appelle `ensureAuthenticated()` et `createContentGenerator()` avant de
renvoyer la réponse de session. Les imports de provider existants et la
construction de `LoggingContentGenerator` chargeraient donc le SDK pendant
`newSession`, déplaçant le travail hors de `channel.initialize` sans
améliorer le process→première session.

## Conception

### Valeurs de compatibilité synchrones légères

L'orchestration du cœur n'utilise qu'une petite partie synchrone du SDK en
dehors des implémentations de provider : `FinishReason`,
`FunctionCallingConfigMode`, `createUserContent` et `createModelContent`. Un
module de compatibilité local au package fournit ces valeurs tout en
conservant les types du SDK comme imports type-only. Sa conversion de contenu
reflète la validation et la forme de sortie du SDK afin que les appelants
existants gardent le même comportement sans évaluer le SDK.

Les implémentations de provider continuent d'utiliser les classes officielles
du SDK. En particulier, ce changement ne copie ni ne remplace
`GenerateContentResponse`.

### Générateur de contenu paresseux single-flight

`createContentGenerator()` valide toujours la configuration, précharge
l'implémentation de fetch du runtime et effectue l'acquisition des
credentials Qwen OAuth à son point actuel du cycle de vie de la session. Il
renvoie un `ContentGenerator` paresseux privé dont le chargeur mémorisé
construit le provider sélectionné et l'enveloppe dans `LoggingContentGenerator`
lors de la première opération asynchrone du générateur de contenu.

Les quatre opérations asynchrones partagent la même promesse de chargeur :

- `generateContent`
- `generateContentStream`
- `countTokens`
- `embedContent`

Les premiers appels concurrents importent et construisent donc le provider
une seule fois. `useSummarizedThinking()` reste synchrone et est renseigné
depuis le comportement connu du provider sélectionné : vrai pour
Gemini/Vertex et faux pour OpenAI, Qwen OAuth et Anthropic.

L'acquisition des credentials Qwen OAuth reste eager à l'intérieur de
`createContentGenerator()`. Un credential expiré ou manquant continue donc de
rejeter la création de session ACP plutôt que de produire une session
apparemment utilisable qui n'échoue qu'à son premier prompt.

Les échecs d'import dynamique conservent le message existant de redémarrage
pour mise à jour en arrière-plan, bien que les échecs de chunk de provider se
manifestent désormais à la première utilisation du générateur. Un
rafraîchissement d'authentification remplace le générateur paresseux, ce qui
fournit aussi la frontière de retry après un échec du chargeur.

### Première utilisation MCP

`mcpToTool` est chargé dynamiquement à l'intérieur de `discoverTools()`. Cela
préserve la pagination du SDK, la gestion des noms en double, le fallback des
outils appelables et l'effet de bord d'en-tête d'usage MCP. Les
configurations avec des serveurs MCP peuvent donc évaluer `@google/genai`
pendant la découverte MCP en arrière-plan avant le premier prompt du modèle.
C'est une exception de première utilisation intentionnelle : remplacer
`mcpToTool` dupliquerait un comportement expérimental du SDK et élargirait
sensiblement la surface de régression.

La frontière garantie est que `@google/genai` est absent de la closure
statique de l'amorçage ACP. Sans serveur MCP configuré, il reste non chargé
pendant la création de session et se charge à la première opération du
`ContentGenerator`.

### Garde de bundle

La garde de metafile du fast-path de serve ajoute `@google/genai` à la liste
des packages interdits ACP. Les chunks dynamiques restent autorisés. Cela
fait échouer la CI sur tout ré-import statique futur en affichant son chemin
d'import.

## Audit des consommateurs en aval

Il y a trois chemins de création directs en production.
`Config.refreshAuth()` possède le générateur de la session principale.
`BaseLlmClient` possède des générateurs par modèle en cache pour les
requêtes latérales routées. `createRuntimeContentGeneratorView()` possède des
générateurs dédiés utilisés par le backend d'agent in-process, le
gestionnaire de sous-agents et les agents forkés. Chaque chemin stocke et
consomme uniquement l'interface `ContentGenerator`, donc le wrapper paresseux
privé préserve sa frontière de propriété et de routage.

Les consommateurs de l'interface n'appellent que `generateContent`,
`generateContentStream`, `countTokens`, `embedContent` et
`useSummarizedThinking`. Le chemin de chat principal, les hooks de prompt,
les requêtes mémoire/objectif/latérales, le routage vision, les sous-agents
et la reprise de session n'inspectent pas le provider concret ni ne
déballent `LoggingContentGenerator` ; une recherche sur tout le dépôt n'a
trouvé aucun appelant de production à `instanceof` ou `getWrapped()`. La
découverte d'outils MCP est séparée de la propriété du générateur et garde
l'adaptateur `mcpToTool` fourni par le SDK derrière son propre import de
première utilisation.

## Alternatives rejetées

- **Rendre dynamiques uniquement les imports actuels** : améliore
  `channel.initialize` mais charge le même SDK pendant `newSession`, donc ne
  traite pas le process→première session.
- **Retarder `GeminiClient.initialize()` lui-même** : change la construction
  du chat, la reprise, l'enregistrement des outils, la disponibilité de la
  session et le timing des erreurs d'authentification.
- **Copier `GenerateContentResponse`** : risque une dérive des prototypes et
  des getters à travers les mises à jour du SDK et change les objets à
  l'exécution renvoyés par les adaptateurs OpenAI et Anthropic.
- **Remplacer `mcpToTool` localement** : duplique un adaptateur expérimental
  du SDK et supprime ou doit reproduire son comportement de télémétrie MCP
  global au processus.
- **Importer des internes non documentés du SDK** : `@google/genai` n'expose
  aucun sous-chemin léger pris en charge pour ces helpers et classes.

## Compatibilité et chemins d'échec

- La validation du provider reste dans `createContentGenerator()`.
- Les vérifications de credentials Qwen OAuth restent avant l'enregistrement
  de la session ACP.
- Le premier chargeur est single-flight à travers les prompts concurrents et
  les requêtes latérales.
- Une première requête déjà annulée peut quand même terminer l'évaluation du
  module, car les imports ESM ne sont pas annulables ; le provider reçoit
  ensuite le signal annulé original.
- La configuration du modèle est capturée par référence comme aujourd'hui,
  donc les changements de modèle du même provider effectués avant la
  première utilisation sont observés par le constructeur du provider.
- Les changements d'authentification/provider reconstruisent le générateur
  paresseux via le chemin `refreshAuth()` existant.
- Un chunk dynamique manquant après une mise à jour du CLI en arrière-plan
  produit le conseil de redémarrage existant.

## Vérification

Les tests unitaires couvrent la parité des helpers, la construction différée,
le timing des credentials Qwen, le comportement single-flight, les valeurs de
summarized-thinking spécifiques au provider, les échecs de module différés et
le comportement de découverte MCP. Le metafile bundlé doit montrer
`@google/genai` absent de la closure statique ACP tout en le conservant dans
les chunks dynamiques de provider/MCP.

L'exécution d'acceptation 2C4G suit #7264 : 30 démarrages à froid
séquentiels appariés, P50/P95 de `channel.initialize`, process→première
session, comportement préchauffé/chaud, premières sessions concurrentes,
télémétrie activée/désactivée et pic RSS. Comme ce changement déplace le
travail plus tard, il enregistre en plus session-réponse→premier token et
process→premier token pour un premier prompt immédiat. Un gain au démarrage
entièrement repayé par une régression du premier token est rapporté plutôt
que traité comme une optimisation réussie.

## Résultats

Le contrôle était l'`origin/main` alors courant à
`dd2552018a72a2b5795977211f06435711e5f99a`, qui inclut déjà le travail de
télémétrie/protocole paresseux et le changement lazy-undici. Le candidat
était le bundle exact du working tree final. Les deux ont été construits
depuis le même lockfile et testés sur l'hôte Alibaba Cloud fourni avec
2 vCPU, environ 3,5 GiB de RAM, sans swap, et Node.js bundlé 22.23.1.

La closure statique ACP est passée de 14 279 497 octets à 13 280 177 octets
(999 320 octets). La closure du contrôle contenait 755 788 octets attribués
directement à `@google/genai` ; le candidat en contenait zéro. Le SDK reste
présent dans les chunks dynamiques pour la première utilisation provider et
MCP.

Avec la télémétrie activée vers un outfile, 30 démarrages à froid appariés
alternés ont produit :

| Métrique                 | Contrôle P50 / P95   | Candidat P50 / P95    | Delta P50 |
| ------------------------ | -------------------- | --------------------- | --------- |
| `channel.initialize`     | 984,9 / 1010,6 ms    | 954,8 / 972,5 ms      | -30,1 ms  |
| `POST /session` à froid  | 1293,1 / 1316,0 ms   | 1252,4 / 1291,3 ms    | -40,7 ms  |
| process→première session | 1924,6 / 1951,1 ms   | 1858,7 / 1901,0 ms    | -65,9 ms  |
| `phase.gemini_import`    | 536,3 / 550,2 ms     | 517,2 / 526,5 ms      | -19,1 ms  |
| pic RSS                  | 414,6 / 427,1 MiB    | 406,5 / 420,5 MiB     | -8,0 MiB  |

Après un préchauffage de trois secondes, `channel.initialize` restait 32,7 ms
plus rapide au P50, tandis que `POST /session` s'améliorait de 4,8 ms. Les
premières sessions concurrentes, la télémétrie désactivée et le mode session
unique legacy ont tous réussi ; chaque arbre de processus a été nettoyé et le
mode télémétrie désactivée n'a émis aucun enregistrement.

Une exécution supplémentaire avec télémétrie désactivée a émis un prompt réel
OpenAI-compatible immédiat en 30 paires alternées. Les 60 prompts se sont
terminés. Process→session s'est amélioré de 53,4 ms au P50 et le candidat
était plus rapide dans 28 paires sur 30. Prompt→premier token était
effectivement neutre sous la variance du réseau du modèle : le P50 du
candidat était 24,2 ms plus rapide et le candidat était plus rapide dans 16
paires sur 30 ; le P95 était 297,6 ms plus lent car les deux variantes
avaient des outliers réseau multi-secondes sans rapport. Le P50 de bout en
bout process→premier token s'est amélioré de 57,6 ms, le candidat étant plus
rapide dans 19 paires sur 30. Cela écarte un déplacement de coût médian
démontré, mais la queue du premier token n'est pas attribuable au point de
pouvoir revendiquer un gain supplémentaire de performance d'appel modèle.
