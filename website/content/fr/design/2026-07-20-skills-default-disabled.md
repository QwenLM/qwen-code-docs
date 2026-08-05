# Skills désactivés par défaut et surchargeables

## Problème

`skills.disabled` est une union insensible à la casse à travers les portées
de paramètres. Cela en fait une denylist dure : un projet ne peut pas activer
un skill désactivé par les paramètres utilisateur ou système. C'est correct
pour la politique, mais cela ne peut pas représenter un skill qui devrait
démarrer désactivé tout en restant disponible pour l'opt-in d'un projet.

## Paramètres

Ajouter deux listes d'union insensibles à la casse tout en gardant
`skills.disabled` inchangé :

| Paramètre                | Signification                                                          |
| ------------------------ | ---------------------------------------------------------------------- |
| `skills.disabled`        | Désactivation dure. Gagne toujours et préserve les verrous existants.  |
| `skills.defaultDisabled` | Désactivé sauf activation explicite.                                   |
| `skills.enabled`         | Opt-in explicite ; ne peut pas surcharger `skills.disabled`.           |

Les désactivations effectives sont `disabled + (defaultDisabled - enabled)`.
Une liste `enabled` explicite est utilisée plutôt qu'une sémantique de
remplacement afin qu'activer un défaut hérité ne remplace pas des défauts
sans rapport.

## Runtime et persistance

Un seul résolveur local au CLI calcule les noms désactivés effectifs et si
chaque skill désactivé est `hard` ou `default`. Les consommateurs existants
du runtime continuent de lire l'ensemble effectif via
`Config.getDisabledSkillNames()` ; les API de découverte et d'exécution des
skills du cœur ne changent pas.

Le sélecteur `/skills` et le toggle du démon appliquent les mêmes règles :

- activer supprime une désactivation dure du workspace et ajoute le nom
  canonique au `skills.enabled` du workspace uniquement si nécessaire ;
- désactiver supprime l'opt-in du workspace et ajoute le nom canonique au
  `skills.disabled` du workspace ;
- les entrées `skills.disabled` d'une portée supérieure restent verrouillées ;
- les entrées de skill sans rapport et indisponibles sont préservées.

Le statut des skills du workspace ajoute une raison de désactivation et une
portée de verrou optionnelle afin que les clients puissent distinguer un
verrou dur d'un défaut surchargeable. Les chemins de statut locaux au démon
et ACP lisent tous deux le même résolveur local au CLI.

## Périmètre

- Aucun skill n'est ajouté à `defaultDisabled` par ce changement.
- `disable-model-invocation` et les opérations ACP de skill géré sont
  inchangées.
- La configuration existante de `skills.disabled` reste compatible.
- Les changements sont limités aux paramètres, aux deux surfaces de toggle
  existantes, au statut des skills du workspace, à leurs types de protocole,
  à la documentation et aux tests ciblés.
