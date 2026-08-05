# Curator d'auto-skills

## Problème

Qwen Code peut extraire des skills de projet réutilisables à partir de
conversations riches en outils, mais les auto-skills acceptés ne font que
s'accumuler. L'agent de revue existant peut créer ou mettre à jour des skills
`source: auto-skill` et a l'interdiction explicite de les supprimer. Le
gating de chemin et `skills.disabled` réduisent le bruit dans le prompt mais
ne maintiennent pas la bibliothèque sur disque.

## Périmètre

Ajouter un petit gestionnaire de cycle de vie déterministe pour les auto-skills
de projet :

- Suivre les invocations réussies des skills de projet dont le répertoire
  commence par `auto-skill-` et dont le frontmatter contient
  `source: auto-skill`.
- Marquer un skill géré comme obsolète après 30 jours sans activité.
- L'archiver après 90 jours sans activité en déplaçant son répertoire entier
  hors de `.qwen/skills/` vers `.qwen/archived-skills/`.
- Permettre d'épingler des skills gérés individuellement pour les exclure des
  transitions automatiques.
- Exécuter la passe déterministe au plus une fois tous les 7 jours pendant
  l'initialisation de la configuration quand Auto Skill est activé et que le
  workspace est fiable.
- Exposer `/curator`, `/curator status`, `/curator run [--dry-run]` et
  `/curator pin|unpin|restore <directory>` dans les surfaces de commandes
  interactive, non interactive et ACP.

Cette première version n'utilise pas de LLM, ne consolide pas les skills qui
se chevauchent, ne gère pas les skills personnels/bundled/extension/appris/
écrits à la main, ne supprime rien définitivement et n'introduit pas de seuils
configurables.

## Propriété et persistance

Le curator est résolu uniquement depuis `Config.getProjectRoot()`. Son état
réside dans `<project>/.qwen/skill-curator.json`, et les paquets archivés
résident dans `<project>/.qwen/archived-skills/`. Il n'y a pas de fallback
vers le workspace principal du processus, le répertoire home ou une autre
session active. Cela garde le démon et les sessions multi-workspace isolés.

L'état est indexé par le nom du répertoire de l'auto-skill car c'est l'unité
déplacée vers et depuis l'archive. Chaque enregistrement stocke le nom du
skill du frontmatter, l'heure de première observation, la dernière utilisation
réussie, le nombre d'utilisations, l'état de cycle de vie, l'état
d'épinglage et l'heure d'archivage optionnelle. Les écritures sont sérialisées
par un verrou inter-processus et committées atomiquement.

Un état corrompu est un échec dur, sans mutation. Le curator ne doit pas
déduire qu'une utilisation manquante signifie une inactivité quand sa preuve
persistée ne peut pas être lue.

## Éligibilité et sécurité

Un répertoire est géré par le curator uniquement quand toutes les conditions
sont réunies :

1. C'est un répertoire direct, sans lien symbolique, sous la racine des skills
   du projet.
2. Son nom commence par `auto-skill-`.
3. Il contient un `SKILL.md` régulier, sans lien symbolique.
4. Le frontmatter YAML d'ouverture contient exactement `source: auto-skill`.

Ce double marqueur empêche le curator de déplacer du contenu écrit à la main,
appris, d'extension, bundled, personnel, malformé ou lié par lien symbolique.
L'archivage et la restauration n'écrasent jamais un skill existant. Une
collision de destination ne saute que ce paquet afin que la maintenance non
liée puisse continuer. Les noms des répertoires archivés sont affichés comme
réservés dans le prompt de revue et rejetés par sa garde de permission
d'écriture, tandis que la mise en scène de confirmation ne snapshot que les
skills actifs. Si la persistance de l'état échoue après des déplacements, la
passe tente de déplacer chaque paquet en sens inverse avant de remonter
l'erreur.

Le statut en lecture seule et les aperçus dry-run restent disponibles en mode
sûr et dans les workspaces non fiables. Appliquer une passe de maintenance,
épingler, désépingler et restaurer exigent un workspace fiable en dehors du
mode sûr.

## Activité et transitions

Une invocation réussie de l'outil Skill ou d'un slash command de skill direct
met à jour un enregistrement d'auto-skill éligible en mode best-effort, même
quand la génération automatique de skills est désactivée. Cela garde
l'activité observée indépendante de l'interrupteur qui contrôle la génération
et la maintenance planifiée. Les invocations échouées, de skill désactivé ou
bloquées par un hook ne comptent pas.

Pour un skill live, l'activité est la plus récente parmi :

- la dernière invocation réussie persistée ;
- l'heure de première observation persistée ;
- l'heure de restauration persistée ; et
- l'heure de modification du manifeste du skill.

Inclure l'heure de modification empêche un skill récemment amélioré d'être
archivé simplement parce qu'il n'a pas encore été invoqué à nouveau.

La première observation de chaque skill éligible initialise
`firstSeenAt = now` plutôt que de déduire une inactivité à partir d'un ancien
horodatage du système de fichiers. La première observation automatique
initialise aussi `lastRunAt`, puis attend un intervalle complet de 7 jours.
`/curator run` explicite contourne l'intervalle mais préserve le délai de
grâce de première observation par skill ; `--dry-run` rapporte les mêmes
candidats d'initialisation et de transition sans déplacer de répertoires ni
modifier l'état. Les enregistrements épinglés contournent les transitions
obsolète et archive jusqu'à être explicitement désépinglés.

## Points d'intégration

- `Config.initialize` : exécute la passe déterministe arrivée à échéance avant
  que `SkillManager` scanne le système de fichiers.
- `SkillTool` : enregistre une invocation réussie de skill géré.
- `SkillCommandLoader` et les processeurs de commandes interactifs/non
  interactifs : enregistrent les invocations directes réussies de slash
  command ; ACP réutilise le processeur non interactif.
- `SkillManager` : son chemin de rafraîchissement existant est utilisé après
  un archivage ou une restauration manuels afin que les surfaces du modèle et
  des slash commands correspondent immédiatement au disque.
- `BuiltinCommandLoader` : publie la nouvelle commande `/curator`.

Aucun autre consommateur ne doit écrire l'état du curator ni déplacer les
paquets de skills gérés.

## Vérification

Les tests unitaires couvrent l'éligibilité, l'initialisation de la première
exécution, les seuils obsolète/archive, la non-mutation du dry-run, la
protection d'utilisation récente, la protection de modification récente, le
comportement fail closed sur état corrompu, la gestion des collisions, la
restauration et la surface de commandes. Les tests existants de l'outil Skill
vérifient que seuls les chargements réussis enregistrent une utilisation. Le
build et le typecheck couvrent l'export inter-packages et l'enregistrement de
la commande.
