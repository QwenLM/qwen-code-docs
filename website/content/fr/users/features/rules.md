# Règles

Une règle est un fichier Markdown qui atteint le modèle soit au début d'une session, soit au moment où le travail touche un fichier auquel elle s'applique. Les règles se trouvent dans `.qwen/rules/`, et le champ `paths:` est ce qui rend le second type possible : les directives sur vos composants React n'ont pas besoin d'être dans le prompt pendant que vous modifiez un Makefile.

Elles sont l'alternative économique au fichier de contexte (`QWEN.md`), qui est inclus dans **chaque** requête de chaque session — voir [Resident Context Cost](./context-cost.md).

## Où se trouvent les règles

| Emplacement                                 | Chargées                                   |
| ------------------------------------------- | ------------------------------------------ |
| `~/.qwen/rules/` (ou `$QWEN_HOME/rules/`)   | toujours                                   |
| `<project>/.qwen/rules/`                    | quand le workspace est fiable              |
| `rules/` d'une extension active             | toujours, règles conditionnelles uniquement — voir ci-dessous |

Chaque fichier `.md` sous ces répertoires est découvert, y compris dans les sous-répertoires, dans un ordre déterministe.

## Règles de base et règles conditionnelles

```markdown
---
description: How we write React components
paths:
  - 'src/**/*.tsx'
  - 'src/**/*.jsx'
---

Components are function components. Co-locate the test beside the component.
Never reach for a global store for state one screen owns.
```

- **Avec `paths:`** — une règle _conditionnelle_. Elle reste en dehors du prompt jusqu'à ce qu'un appel d'outil lise ou modifie un fichier correspondant à l'un de ses globs, puis elle est injectée une fois pour le reste de la session.
- **Sans `paths:`** — une règle _de base_. Elle fait partie du prompt système dès la première requête, exactement comme un fichier de contexte, et coûte la même chose à chaque tour.

Les deux champs sont optionnels, et une règle sans frontmatter du tout est une règle de base.

Détails importants à connaître :

- Les globs sont comparés au chemin **relatif à la racine du projet**, avec des slashes avant sur toutes les plateformes, et ils correspondent aux dotfiles.
- Les symlinks sont résolus, donc une règle correspond que l'appel d'outil ait utilisé le lien ou le chemin réel.
- Une règle conditionnelle est injectée **une fois par session** — le deuxième fichier correspondant ne la répète pas.
- Les commentaires HTML sont retirés du corps d'une règle avant qu'elle ne soit envoyée.

## Règles des extensions

Une extension peut fournir un répertoire `rules/`, et **ses règles doivent être conditionnelles** : une règle sans `paths:` est ignorée, avec un avertissement au démarrage la nommant. Cette restriction est tout son intérêt. Le fichier de contexte d'une extension (`contextFileName`) est concaténé dans chaque requête de chaque session où l'extension est active, sans filtrage de pertinence — dans une session mesurée, les fichiers de contexte de neuf extensions totalisaient 9 989 tokens, soit 65 % de tout le contexte toujours actif de cette session. Une règle de base d'extension recréerait exactement cela, un mécanisme de plus.

Les règles d'extension sont étiquetées par leur propriétaire dans le prompt — `charts:rules/charting.md`, pas un chemin sortant du projet — ainsi une transcription montre quelle règle s'est déclenchée.

Elles ne sont pas conditionnées par la confiance du workspace, contrairement aux règles de projet : installer une extension est déjà un acte explicite, et la même extension peut contribuer des serveurs MCP, des commandes, des skills et un fichier de contexte sans condition. Exiger la confiance pour le seul mécanisme plus restreint et moins coûteux qu'un fichier de contexte ne ferait que pousser les auteurs vers l'option coûteuse.

**Si vous créez une extension**, voici la migration à effectuer :

| Contenu                                                                           | Mettez-le dans                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Faits toujours vrais — l'identité de l'extension, son vocabulaire, une contrainte forte | le fichier de contexte                         |
| « Quand vous travaillez sur X, faites Y »                                         | une règle conditionnée par `paths:`, ou un [skill](./skills.md) |
| Une procédure que le modèle exécute sur demande                                   | un [skill](./skills.md)                        |

## Règles, skills et fichiers de contexte

|                             | Dans le prompt dès le départ | Chargées à la demande           |
| --------------------------- | ---------------------------- | ------------------------------- |
| Fichier de contexte (`QWEN.md`) | toujours, en entier        | —                               |
| Règle de base               | toujours, en entier          | —                               |
| Règle conditionnelle (`paths:`) | rien                     | quand un fichier correspondant est touché |
| Skill                       | nom + description uniquement | corps, quand le modèle l'invoque |

Un skill est le bon endroit pour une procédure que le modèle choisit de suivre ; une règle conditionnelle est le bon endroit pour une contrainte qui s'applique à une région du code, que le modèle ait pensé à la chercher ou non. Les skills peuvent aussi être [conditionnés par `paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths), ce qui garde même leur entrée de liste en dehors du prompt jusqu'à ce qu'elle soit pertinente.

## Voir aussi

- [Resident Context Cost](./context-cost.md) — comment mesurer ce que coûte votre préfixe, et les autres leviers.
- [Skills](./skills.md)
- [Memory](./memory.md)
