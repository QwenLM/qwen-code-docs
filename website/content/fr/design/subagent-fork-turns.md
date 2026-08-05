# `fork_turns` du fork de sous-agent

## Résumé

Ajouter un paramètre optionnel `fork_turns` au runtime détaché existant
`subagent_type: "fork"` de l'outil Agent. Un fork continue d'hériter de la
conversation parente complète lorsque le paramètre est omis. Les appelants
peuvent utiliser explicitement :

- `all` pour la conversation parente complète, ou
- une chaîne d'entier positif telle que `"3"` pour les trois tours
  utilisateur réels les plus récents.

Les sous-agents réguliers et les coéquipiers nommés n'acceptent pas
`fork_turns` et continuent de démarrer sans historique de conversation
parente.

## Objectifs

- Préserver le comportement existant d'historique complet pour les appels de
  fork qui omettent le paramètre.
- Permettre aux appelants de borner l'historique hérité d'un fork sans
  modifier son prompt système, ses outils, son modèle, son mode
  d'approbation, son répertoire de travail ou son cycle de vie détaché.
- Compter les tours utilisateur réels plutôt que les messages API bruts. Les
  réponses d'outil et les purs rappels système ne consomment pas le nombre de
  tours demandé.
- Garder l'historique de fork sélectionné isolé des parties mutables des
  messages du parent.

## Non-objectifs

- Ajouter l'héritage de contexte aux sous-agents spécialisés réguliers ou aux
  coéquipiers d'équipe d'agents.
- Ajouter un mode de fork sans historique. Les appelants qui ne veulent pas
  du contexte parent doivent lancer un sous-agent régulier.
- Modifier la disponibilité des forks, les règles d'imbrication, l'exécution
  en arrière-plan, la récupération de transcription ou la réutilisation du
  prompt système et des déclarations d'outils du parent.

## Design

### Paramètre et validation

`AgentParams.fork_turns` est optionnel. Le schéma JSON accepte `all` ou une
chaîne correspondant à `^[1-9][0-9]*$`. L'omission est normalisée en `all`,
préservant le comportement de fork existant.

Fournir `fork_turns` avec un type de sous-agent non fork, sans type de
sous-agent explicite, ou lors du lancement d'un coéquipier nommé est rejeté.
`none`, zéro, les nombres négatifs, les décimaux, les valeurs entourées
d'espaces et les valeurs non chaîne sont rejetés.

### Sélection de l'historique

`all` utilise le même historique parent organisé que le runtime de fork
existant.

Pour une valeur numérique, le chat parent supprime son contexte de démarrage
de tête avant d'organiser l'historique de conversation. Cela empêche
l'organisation de fusionner le rappel de démarrage avec le premier prompt
utilisateur réel. Le préfixe de démarrage d'origine est ensuite ajouté devant
la fenêtre sélectionnée afin que le fork conserve le contexte d'environnement
du parent.

Un tour utilisateur réel est un message de rôle utilisateur contenant un
contenu autre que des réponses de fonction, du texte vide ou de purs rappels
système. La tranche sélectionnée commence au Nième tour utilisateur réel le
plus récent et inclut les messages modèle, appels d'outil, réponses d'outil
et rappels suivants. S'il existe moins de N tours réels, tous les tours réels
disponibles sont sélectionnés.

Un résumé d'historique compacté est un préfixe synthétique et n'est pas
inclus dans une fenêtre numérique ; les appelants doivent utiliser `all`
lorsque le fork a besoin du résumé compacté. L'historique final sélectionné
est cloné en profondeur afin que le fork et le parent ne partagent pas de
parties de message imbriquées mutables.

La construction de fork existante répare toujours la frontière finale avant
d'envoyer la directive. Elle supprime un message utilisateur final sans
réponse et clôt un appel de fonction modèle ouvert avec des réponses
placeholder lorsque nécessaire.

### Réactivation en arrière-plan

Les messages initiaux sélectionnés continuent d'utiliser l'enregistrement de
bootstrap de fork existant. La récupération de transcription réactive donc un
fork à historique borné avec le même historique sélectionné, la même
instruction système au lancement, les mêmes outils et le même prompt de tâche
que son exécution d'origine.

## Compatibilité et risques

Les appels de fork existants restent des forks à historique complet car
l'omission a pour valeur par défaut `all`. Les appels existants de
sous-agents réguliers et de coéquipiers restent isolés. Une fenêtre numérique
peut omettre des faits plus anciens ou des résumés compactés, donc la
directive doit répéter tout contexte plus ancien dont le fork a encore
besoin. Elle raccourcit également le préfixe réutilisable du cache
d'historique de conversation, tandis que le prompt système du parent, les
outils et le contexte de démarrage restent partagés.
