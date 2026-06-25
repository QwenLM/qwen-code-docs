# Rendu Markdown

Qwen Code rend les structures Markdown courantes directement dans le TUI afin
que les réponses du modèle soient plus faciles à parcourir sans quitter le
terminal. Le rendu est conçu pour garder la source originale accessible,
notamment pour les blocs visuels tels que les diagrammes Mermaid et les
mathématiques LaTeX.

## Modes rendu et brut

Par défaut, le Markdown est affiché en mode `render`. Les blocs pris en charge
s'affichent sous forme d'aperçus visuels lorsque c'est possible :

- blocs de code Mermaid
- tableaux Markdown
- listes de tâches
- citations
- formules mathématiques LaTeX en ligne et en bloc
- blocs de code avec coloration syntaxique

Appuyez sur `Alt/Option+M` pour basculer la session en cours entre les modes.
Sur macOS, le terminal doit envoyer Option en tant que Meta pour ce
raccourci ; sinon Option+M est traité comme une saisie de texte normale.

- `render` : affiche des aperçus enrichis dans le terminal pour le Markdown
  pris en charge.
- `raw` : affiche le Markdown orienté source pour les blocs visuels tels que
  Mermaid, les tableaux et LaTeX.

Pour démarrer Qwen Code en mode brut par défaut, définissez `ui.renderMode` :

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

Les valeurs acceptées sont `"render"` et `"raw"`. Le raccourci ne modifie que
la vue de la session en cours ; il ne réécrit pas votre fichier de
paramètres.

## Mermaid

Les blocs de code `mermaid` s'affichent visuellement en mode `render`. Le TUI
utilise une stratégie en couches :

1. Si activé et pris en charge, Qwen Code demande à l'interface en ligne de
   commande Mermaid CLI (`mmdc`) de générer le diagramme au format PNG et
   l'envoie au protocole d'image du terminal.
2. Si les images dans le terminal ne sont pas disponibles mais que `chafa` est
   installé, le même PNG peut être converti en graphiques ANSI par blocs.
3. Sinon, Qwen Code revient à un fil de fer dans le terminal ou à un aperçu
   texte compact.
4. Si un type de diagramme Mermaid ne peut pas être prévisualisé, Qwen Code
   affiche la source originale du bloc au lieu de la masquer derrière un
   espace réservé.

Le rendu d'image Mermaid est désactivé par défaut car il nécessite des
moteurs de rendu externes et la prise en charge des images dans le terminal.
Activez-le avec :

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

Variables d'environnement optionnelles :

| Variable                                    | Description                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`       | Active le rendu d'image Mermaid externe.                                           |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`        | Désactive le rendu d'image Mermaid même lorsqu'il est activé ailleurs.                       |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`    | Force la sortie du protocole Kitty. Utile pour les terminaux tels que Kitty et Ghostty.       |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`   | Demande les images en ligne iTerm2. Le rendu interactif du TUI revient au texte/ANSI.   |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`      | Désactive les protocoles d'image dans le terminal et permet le recours au texte ou à `chafa`.              |
| `QWEN_CODE_MERMAID_MMD_CLI=/path/to/mmdc`   | Utilise un exécutable Mermaid CLI spécifique.                                             |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`             | Permet à Qwen Code d'exécuter `npx @mermaid-js/mermaid-cli` si `mmdc` n'est pas installé. |
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1` | Autorise les binaires de rendu locaux du projet sous `node_modules/.bin`.                   |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`       | Remplace la largeur de rendu PNG.                                                     |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000` | Remplace le délai d'expiration du rendu externe, plafonné à 60000 ms.                          |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`   | Ajuste l'ajustement des lignes d'image pour la géométrie des cellules de police du terminal.                          |

Le premier rendu d'image peut être lent, surtout lorsque `npx` doit résoudre
ou télécharger Mermaid CLI. Pendant le streaming, Qwen Code affiche un aperçu
texte limité et tente le rendu d'image uniquement après la fin de la réponse
du modèle.

### Copie de la source Mermaid

Chaque bloc Mermaid rendu inclut une indication de source telle que :

```text
Mermaid flowchart (TD) · source: /copy mermaid 1
```

Utilisez ces commandes pour copier la source Mermaid de la dernière réponse
de l'IA :

| Commande                | Comportement                                      |
| ---------------------- | --------------------------------------------- |
| `/copy mermaid`        | Copie le dernier bloc Mermaid.                |
| `/copy mermaid 1`      | Copie le premier bloc Mermaid.               |
| `/copy code mermaid`   | Copie le dernier bloc de code `mermaid`.  |
| `/copy code mermaid 1` | Copie le premier bloc de code `mermaid`. |

`/copy code 1` compte tous les blocs de code, pas seulement les blocs
Mermaid. Utilisez `/copy mermaid N` lorsque vous souhaitez la séquence
spécifique à Mermaid indiquée dans le titre rendu.

## Mathématiques LaTeX

Qwen Code prend en charge le rendu de base des formules LaTeX en ligne et en
bloc dans le terminal :

```markdown
Mathématiques en ligne : $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```
Le moteur de rendu se concentre sur les symboles courants et les sorties terminal lisibles. Il ne s'agit pas d'un moteur TeX complet ; les mises en page complexes telles que les matrices, les équations alignées et les grandes expressions imbriquées peuvent être simplifiées.

Les expressions en ligne `$...$` sont volontairement limitées à 1 024 caractères par ligne afin qu'un Markdown généré malformé ou très volumineux ne puisse pas bloquer le rendu du terminal. Les formules plus longues restent visibles sous forme de texte source et peuvent toujours être copiées depuis le mode brut ou la réponse d'origine.

### Copie du source LaTeX

Utilisez ces commandes pour copier le source LaTeX de la dernière réponse IA :

| Commande                | Comportement                                |
| ----------------------- | ------------------------------------------- |
| `/copy latex`           | Copie la dernière expression LaTeX en bloc. |
| `/copy latex 2`         | Copie la deuxième expression en bloc.       |
| `/copy latex inline`    | Copie la dernière expression en ligne.      |
| `/copy latex inline 2`  | Copie la deuxième expression en ligne.      |
| `/copy inline-latex 2`  | Alias pour `/copy latex inline 2`.          |

Le LaTeX en ligne n'affiche pas d'info-bulle de copie par expression dans le texte rendu pour éviter d'alourdir la prose. Passez en mode brut avec `Alt/Option+M` lorsque vous souhaitez inspecter le source en ligne sur place ; sur macOS, cela nécessite une saisie terminal avec Option comme Meta.

## Copie de code général

La commande `/copy code` lit les blocs de code délimités de la dernière réponse Markdown IA :

| Commande                 | Comportement                                 |
| ------------------------ | -------------------------------------------- |
| `/copy code`             | Copie le dernier bloc de code délimité.      |
| `/copy code 2`           | Copie le deuxième bloc de code délimité.     |
| `/copy code typescript`  | Copie le dernier bloc de code `typescript`.  |
| `/copy code mermaid 1`   | Copie le premier bloc de code `mermaid`.     |

## Sélection d'un message IA antérieur

Par défaut, `/copy` cible le message IA le plus récent. Ajoutez un entier positif avant la commande pour copier à partir du Nième message IA en partant de la fin – pratique lorsque la dernière réponse est de faible valeur (par ex. une mise à jour TODO) et que la réponse substantielle se trouve un ou deux tours avant.

| Commande               | Comportement                                               |
| ---------------------- | ---------------------------------------------------------- |
| `/copy 2`              | Copie l'intégralité de l'avant-dernier message IA.         |
| `/copy 3`              | Copie l'intégralité de l'antépénultième message IA.        |
| `/copy 2 code python`  | Copie le dernier bloc `python` de l'avant-dernier message. |
| `/copy 3 latex`        | Copie le dernier bloc LaTeX de l'antépénultième message.   |

`/copy 1` est équivalent à `/copy`. Si `N` dépasse le nombre de messages IA dans la session, `/copy` signale le nombre réel sans rien copier. Sans entier en tête, les sous-sélecteurs comme `/copy code python 2` conservent leur signification actuelle (le 2ème bloc `python` du dernier message).

## Limites actuelles

- Le rendu d'image Mermaid dépend de Mermaid CLI et du support d'image du terminal.
- Le placement d'image en ligne asynchrone iTerm2 est désactivé dans la TUI car le protocole est lié à la position du curseur ; utilisez Kitty/Ghostty ou le repli ANSI pour les aperçus d'image interactifs.
- Le rendu fil de fer Mermaid est un aperçu lisible en terminal, pas un moteur de mise en page Mermaid complet.
- Le mode brut est global pour les blocs Markdown rendus ; ce n'est pas un basculement par bloc.
- Le rendu LaTeX couvre les symboles et expressions courants, pas la mise en page TeX complète.
- Les commandes de copie de source ciblent par défaut la dernière réponse IA, ou la Nième en partant de la fin lorsqu'elles sont invoquées avec `/copy N ...`.
