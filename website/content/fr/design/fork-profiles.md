# Profils de fork

## Résumé

Ajouter une couche de profils nommés au niveau du projet au-dessus de la
liste d'autorisation d'exécution des forks introduite par #8066. Un
appelant peut passer `fork_profile: "<name>"` au lieu de répéter
`fork_tools` ; le runtime résout `.qwen/fork-profiles/<name>.md` une seule
fois au lancement et injecte la liste d'outils résultante dans la porte
d'exécution existante.

Cette phase n'ajoute aucun nouveau mécanisme d'autorisation. Le profil
résolu doit se comporter exactement comme un appel `fork_tools` en ligne
équivalent.

## Format de fichier

Les profils se trouvent sous la racine du projet actif :

```text
.qwen/fork-profiles/<name>.md
```

Chaque fichier contient une frontmatter YAML :

```markdown
---
name: ro-research
tools:
  - read_file
  - grep_search
  - glob
  - mcp__search__*
promptHint: |
  Work read-only. Prefer targeted searches and report evidence.
---
```

`name` et `tools` sont requis. `promptHint` est optionnel et limité à 200
caractères. Le nom demandé, le nom de fichier et le nom de la frontmatter
doivent correspondre. Les noms font 2 à 50 caractères et ne contiennent que
des lettres, des chiffres, des tirets ou des underscores, sans séparateur
en tête ou en fin. Les fichiers de profil sont constitués uniquement de la
frontmatter ; un corps Markdown non vide est rejeté afin que le guidage ne
puisse pas être ignoré silencieusement. Un profil doit se résoudre en un
fichier régulier dans le répertoire de profils du projet et ne peut pas
dépasser 64 KiB.

Le champ `tools` utilise le contrat exact de `fork_tools`. Une liste vide
reste un refus total, un `*` nu est invalide et la syntaxe de joker MCP est
inchangée.

Le scope projet est le seul scope de recherche dans cette phase. Les
profils de niveau utilisateur, la priorité des scopes, les profils
intégrés, le listage des profils et l'UI de gestion sont différés. Le mode
sans échec et le mode nu rejettent les profils de projet car ce sont des
personnalisations locales. Le mode AUTO traite les écritures sous
`.qwen/fork-profiles/` comme de l'auto-modification, elles ne peuvent donc
pas utiliser le chemin rapide normal d'édition dans le workspace.

## Résolution au lancement

`fork_profile` n'est valide qu'avec `subagent_type: "fork"` et ne peut pas
être combiné avec `fork_tools` ni avec un coéquipier nommé. L'invocation de
l'Agent résout le profil avant de construire le runtime du fork :

1. Valider le nom logique demandé avant de construire un chemin de système
   de fichiers.
2. Lire le profil de projet correspondant et analyser strictement sa
   frontmatter YAML.
3. Valider l'identité nom de fichier/frontmatter et la liste d'autorisation
   d'outils.
4. Lier le profil analysé à un seul snapshot de lancement et exposer ses
   outils effectifs et son indice de prompt à la classification du mode
   AUTO.
5. Passer une liste d'outils clonée en tant que
   `ToolConfig.executionAllowedTools`.
6. Ajouter `promptHint`, lorsqu'il est présent, à la directive de tâche du
   fork après le préfixe cachable dérivé du parent. Le texte contrôlé par
   le projet est échappé et encadré comme guidage après la directive,
   tandis que la restriction d'exécution faisant autorité reste en dernier.

Les profils absents ou invalides font échouer le lancement avant que le
runtime de l'agent, les hooks, l'entrée de registre d'arrière-plan ou le
sidecar de transcription ne soient créés.

## Runtime et relance

La porte d'exécution existante reste faisant autorité. La résolution du
profil ne change ni les déclarations visibles par le modèle ni ne
contourne les permissions normales pour un outil autorisé.

La liste d'outils résolue, et non le nom ou le chemin du profil, est la
politique au moment du lancement. Le sidecar existant
`AgentMeta.executionAllowedTools` la stocke, y compris une liste vide de
refus total. La relance à froid réapplique ce snapshot à la surface
d'outils live courante et ne relit pas un profil qui peut avoir changé
depuis le lancement.

Le prompt de tâche du lancement fait déjà partie de la transcription du
fork, donc l'indice de prompt résolu suit le chemin existant de
transcription/relance sans seconde recherche de profil.

## Frontières

Cette phase n'ajoute ni motifs d'arguments shell, ni systèmes de fichiers
superposés, ni intégration `/btw`, ni réflexion automatique/orchestration
en essaim, ni profils de niveau utilisateur, ni UI de CRUD de profils.

Les profils de fork sont une commodité pour l'appelant et une couche de
prompt contrôlée par le projet, pas un sandbox imposé par un
administrateur. Ils ne peuvent que restreindre la surface exécutable
héritée du parent.
