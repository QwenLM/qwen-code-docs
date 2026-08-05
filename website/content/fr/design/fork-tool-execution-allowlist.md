# Liste d'autorisation d'exécution des outils de fork

## Résumé

Ajouter un paramètre optionnel `fork_tools` au runtime existant
`subagent_type: "fork"` de l'outil Agent. Le paramètre restreint les outils
qu'un fork peut exécuter sans changer les déclarations d'outils envoyées au
modèle.

C'est la première phase de #7625. Les fichiers de profils nommés, les
motifs d'arguments shell, les systèmes de fichiers superposés et
l'intégration `/btw` sont hors du périmètre. Un indice de prompt de
lancement indique au fork quels outils visibles la liste d'autorisation
permet.

## Objectifs

- Préserver la surface d'exécution héritée du fork lorsque `fork_tools` est
  omis, à l'exception des outils d'interaction qu'un fork ne doit jamais
  exécuter.
- Traiter une liste vide comme un refus total plutôt que comme le
  comportement de joker existant de `tools: []`.
- Garder les déclarations courantes visibles par le modèle du fork
  inchangées afin qu'ajouter une restriction d'exécution ne modifie pas son
  préfixe de cache de prompt.
- Rejeter les appels non autorisés avant la construction des outils, les
  hooks d'outils, la classification des permissions, la planification ou
  l'approbation.
- Préserver la restriction lorsqu'un fork d'arrière-plan est relancé depuis
  son sidecar persisté.

## Paramètre et correspondance

`fork_tools` n'est valide qu'avec un `subagent_type: "fork"` explicite et
ne peut pas être combiné avec un coéquipier nommé. Chaque entrée doit être
une chaîne non vide sans espace en début ou en fin. Les noms exacts
inconnus restent dans la liste d'autorisation et ne correspondent à rien ;
ils ne sont pas filtrés, car transformer une liste non vide invalide en une
restriction omise serait fail-open.

Les outils intégrés utilisent les noms de fonction canoniques exacts des
déclarations visibles par le modèle. Les entrées MCP prennent en charge les
noms canoniques exacts ainsi que les motifs de serveur et de joker final.
Les motifs sont comparés à l'identité brute serveur/outil MCP de l'outil
enregistré plutôt qu'à son seul nom assaini par le provider, afin que des
noms de serveur distincts qui s'assainissent vers le même préfixe ne
puissent pas correspondre entre eux. Un `*` nu est rejeté ; l'omission
autorise déjà tous les outils hérités exécutables par ailleurs. Les entrées
à joker sont limitées à `mcp__*` ou à un motif de préfixe d'outil MCP final
comme `mcp__github__read_*`. `mcp__*` correspond délibérément à tous les
outils MCP sans correspondre aux outils intégrés.

Les motifs d'arguments shell ne font pas partie de cette phase. Lister
`run_shell_command` permet à l'appel d'outil de continuer dans le pipeline
de permissions normal mais ne pré-approuve pas sa commande.

## Séparation du runtime

`ToolConfig.tools` reste la source de `AgentCore.prepareTools()` et des
déclarations de fonction de chaque requête au modèle. Un champ séparé
`executionAllowedTools` est pris en snapshot lorsque `AgentCore` est créé.
Les entrées exactes et les entrées à joker MCP sont précalculées séparément
afin qu'un outil absent n'alloue ni ne rescane des noms intégrés sans
rapport.

`processFunctionCalls()` vérifie d'abord qu'un nom demandé est présent dans
l'ensemble de déclarations. Il applique ensuite la liste d'autorisation
d'exécution optionnelle. Un appel non autorisé produit une réponse d'erreur
synthétique avec l'ID et le nom de l'appel d'origine, tandis que les
autres appels du même lot continuent vers le planificateur. Comme cette
vérification précède la construction du planificateur, l'appel rejeté ne
peut pas ouvrir un prompt d'approbation ni exécuter un hook pré-outil.

La liste d'autorisation ne fait que restreindre la surface existante. Elle
ne peut pas réactiver des outils supprimés par les exclusions de
sous-agents, contourner les permissions normales pour un outil autorisé ni
ajouter des déclarations.

Chaque fork reçoit une liste d'autorisation d'exécution en mémoire, même
lorsque `fork_tools` est omis. Le socle possédé par le runtime supprime
`ask_user_question` après avoir appliqué la liste fournie par l'appelant,
de sorte qu'un appelant ne puisse pas le réactiver. L'outil reste dans la
liste de déclarations dérivée du parent pour le partage du cache de prompt,
mais un appel est rejeté avant la planification ou l'approbation. Un fork
bloqué signale l'entrée manquante à son parent au lieu d'essayer
d'interagir directement avec l'utilisateur.

Le fork reçoit une notice de restriction dans le prompt de tâche après le
préfixe cachable hérité. Cela évite les appels par essais et erreurs sans
changer l'instruction système dérivée du parent, le préfixe d'historique ou
les déclarations d'outils.

## Relance en arrière-plan

Les forks d'arrière-plan persistent l'historique hérité dans
l'enregistrement de transcription `agent_bootstrap` et le prompt de tâche
de lancement dans un enregistrement séparé. L'instruction système et les
déclarations d'outils sont des capacités, donc la relance à froid les
relie depuis le runtime parent courant et résout les noms d'outils
courants via le registre live.

`executionAllowedTools` fourni par l'appelant est à la place une politique
au moment du lancement. Les forks restreints le stockent dans le sidecar
`AgentMeta`, y compris une liste vide de refus total, et la relance à froid
le réapplique au `ToolConfig` live. Les forks lancés sans `fork_tools` ne
persistent pas la liste dérivée, permettant à la relance de la recalculer
depuis la surface d'outils courante du parent. La surface exécutable
résultante est la surface d'outils courante dérivée du parent, restreinte
par la politique persistée et par l'exclusion obligatoire des outils
d'interaction.

Le champ reste optionnel pour la compatibilité. Les anciennes
transcriptions et les forks lancés sans `fork_tools` sont restaurés avec la
surface d'outils courante dérivée du parent moins l'exclusion obligatoire
des outils d'interaction.

## Frontière

`fork_tools` est fourni par le modèle parent ou l'appelant à chaque appel
de l'outil Agent. C'est donc une restriction de capacité de l'enfant, pas
un sandbox de sécurité imposé par l'utilisateur ou un administrateur. Une
future couche de profils peut fournir un nom de politique court et contrôlé
par le projet au-dessus de ce mécanisme d'exécution.

La restriction ne peut pas être blanchie à travers un autre enfant :
l'exécution du fork s'exécute dans le contexte du runtime du fork, dont la
garde de l'outil Agent faisant autorité rejette toute génération de
sous-agent. Plus généralement, `fork_tools` ne peut pas rendre exécutable
un outil exclu ou non déclaré.
