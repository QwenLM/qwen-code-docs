# Capacités live à la reprise des forks

## Problème

Les transcriptions d'arrière-plan legacy des forks persistaient
l'instruction système rendue du parent et les déclarations d'outils en
ligne. Rejouer ces déclarations du moment du lancement alors que
l'exécution utilise le `ToolRegistry` courant peut laisser un outil
supprimé ou modifié visible par le modèle même s'il ne peut pas être
exécuté.

## Design

Conserver les messages d'amorçage et runtime du fork comme son identité
durable. À la reprise, reconstruire sa surface exécutable depuis la session
parente courante :

- utiliser l'instruction système rendue du parent courant ;
- prendre les noms d'outils annoncés du parent courant et résoudre leurs
  schémas via le registre courant de l'agent repris ;
- inclure les rappels courants MCP, d'outils différés et de Skill sur le
  tour de continuation, tout en déclarant obsolètes les listages de
  capacités antérieurs ;
- laisser la tâche en pause lorsque le prompt parent courant ou la surface
  d'outils ne peut pas être reconstruit.

Les instructions système et les déclarations d'outils du moment du
lancement restent lisibles dans les anciennes transcriptions pour la
compatibilité, mais la reprise ne les traite plus comme une autorité
exécutable. Les nouvelles transcriptions persistent l'historique hérité et
le prompt de tâche, pas des snapshots de capacités ; l'état runtime courant
fait autorité.

Les restrictions d'exécution du moment du lancement sont différentes des
snapshots de capacités. Lorsqu'un fork utilise `fork_tools`, sa politique
`executionAllowedTools` est stockée dans le sidecar `AgentMeta` et
réappliquée après que la surface d'outils live est reconstruite. Une liste
persistée vide reste un refus total ; un champ absent reste sans
restriction.

## Conséquences

Les outils supprimés ne sont plus annoncés après la reprise, et les outils
modifiés utilisent leurs schémas courants. Un fork repris peut gagner un
outil nouvellement disponible pour son parent uniquement lorsque sa
politique d'exécution persistée autorise aussi cet outil. Cela favorise la
cohérence live plutôt qu'une relecture identique en octets sans affaiblir
une restriction de lancement explicite. Le reliage peut aussi invalider
l'ancien préfixe du cache de prompt, ce qui est préférable à l'envoi de
capacités obsolètes.
