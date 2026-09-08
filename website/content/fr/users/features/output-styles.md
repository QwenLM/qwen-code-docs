# Styles de sortie

Les styles de sortie modifient la façon dont Qwen Code rédige ses réponses — le ton, la quantité de narration, le niveau d'explication — sans changer ses capacités. Un style est un bloc d'instructions nommé superposé au prompt système intégré, et le modèle reçoit un rappel du style actif à chaque tour pour le maintenir sur de longues sessions.

## Styles intégrés

| Style           | Ce qu'il fait                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **default**     | Aucun style supplémentaire — le prompt standard.                                                                                                                                                         |
| **Concise**     | Réponses d'abord, sans préambule, narration ni récapitulatif final. Le travail reste aussi approfondi que toujours ; les rapports d'erreur et les confirmations de sécurité conservent tout leur contenu.                             |
| **Proactive**   | Démarre le travail immédiatement et préfère une hypothèse explicite à une question pour les décisions à faible risque. Ne change pas ce qui est autorisé : le mode d'approbation et les règles de confirmation s'appliquent toujours pleinement. |
| **Explanatory** | Ajoute de courtes notes éducatives « Insight » sur la base de code et les choix d'implémentation à côté du travail.                                                                                  |
| **Learning**    | Apprentissage collaboratif par la pratique : vous confie de petits morceaux de code significatifs à écrire (marqués `TODO(human)`), puis attend. Ignoré en mode headless, qui ne peut pas vous attendre.                    |

## Choisir un style

Exécutez `/output-style` pour ouvrir un sélecteur, ou définissez-en un directement :

```
/output-style Concise
/output-style default   # back to no style
```

Le changement s'applique immédiatement à la session en cours — le prompt système est reconstruit sur place, donc le tour suivant répond déjà dans le nouveau style — et il est persisté pour les sessions futures. Si un paramètre de projet fiable possède actuellement `general.outputStyle`, la commande met à jour ce paramètre de projet ; sinon elle met à jour votre paramètre utilisateur. Les noms de style sont insensibles à la casse.

Vous pouvez aussi définir le style sans la commande :

- **Paramètres** : `"general": { "outputStyle": "Concise" }` dans `settings.json` (portée utilisateur ou projet). La valeur est un nom de style intégré ou [personnalisé](#custom-styles). Une modification manuelle prend effet au prochain démarrage.
- **Une exécution** : `qwen -p "..." --output-style Concise` override le paramètre pour cette exécution. Voir [Headless Mode](./headless).

## Styles personnalisés

Un style personnalisé est un fichier Markdown dont le corps contient les instructions du style. Placez-le dans l'un des deux répertoires :

| Emplacement                             | Portée                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| `~/.qwen/output-styles/<name>.md`    | Vos styles, disponibles dans chaque projet                       |
| `<project>/.qwen/output-styles/*.md` | Les styles du projet, lus uniquement quand le workspace est fiable |

La confiance est vérifiée à chaque utilisation du style, pas seulement à la lecture du fichier, donc révoquer la confiance en cours de session empêche un style de projet d'influencer la conversation.

```markdown
---
name: Reviewer
description: Reviews code and reports findings without editing anything
keep-coding-instructions: false
---

You are reviewing, not implementing. Read the code the user points you at, list concrete findings ordered by severity, and never edit files unless the user asks for a fix.
```

Le frontmatter est optionnel. Chaque champ a une valeur par défaut :

- `name` — le nom du style, utilisé avec `/output-style <name>` et dans `general.outputStyle`. Par défaut, le nom du fichier sans `.md`. `default` est réservé.
- `description` — le résumé en une ligne affiché dans le sélecteur. Par défaut, la première ligne du corps.
- `keep-coding-instructions` — `true` conserve le guide de workflow d'ingénierie logicielle intégré dans le prompt à côté de votre style ; `false` supprime cette section, pour un style dont le travail n'est pas du code. Un fichier qui ne dit rien hérite de la valeur du style intégré qu'il remplace, donc réécrire `concise.md` change le libellé sans supprimer ce guide ; un fichier sans équivalent intégré vaut `false` par défaut. Tout le reste du prompt intégré — identité, règles de sécurité, guide des outils — reste en vigueur sous chaque style.

Les styles personnalisés apparaissent dans le sélecteur `/output-style` après les intégrés, étiquetés avec leur source, et sont relus à chaque ouverture du sélecteur ou indication d'un nom, donc un nouveau fichier ne nécessite pas de redémarrage. Les noms sont comparés sans sensibilité à la casse et doivent être uniques : un style de projet remplace un style utilisateur du même nom, et l'un comme l'autre remplace un style intégré de ce nom. Un fichier qui ne peut pas être chargé est ignoré et signalé dans le log de debug tandis que les autres fichiers se chargent normalement — un corps vide, un nom invalide, un fichier de plus de 25 ko (un style est un prompt, pas un document), un fichier qui n'est pas du texte UTF-8, ou un fichier dont le corps entier est un commentaire HTML. Les commentaires HTML sont retirés du corps, donc une note pour vos coéquipiers n'est pas envoyée au modèle.

Un fichier de style peut uniquement se lire lui-même : un fichier de projet qui est un lien symbolique est ignoré, un fichier utilisateur peut être un lien symbolique vers votre propre home (une configuration dotfiles) mais pas en dehors, et un lien physique est refusé à chaque niveau.

Les styles personnalisés sont ignorés avec `--bare` et `--safe-mode`, qui conservent uniquement les intégrés.

## Portée et interactions

- Un style se superpose au prompt intégré. Quand `--system-prompt` ou `QWEN_SYSTEM_MD` remplace entièrement le prompt, le style (et son rappel par tour) n'est pas appliqué.
- Les styles s'appliquent uniquement à la conversation principale. Les sous-agents exécutent leurs propres prompts système, et un pair d'arena hérite du style de la session uniquement si ce style conserve les instructions de code — un pair est jugé sur le diff qu'il produit, donc il ne s'exécute jamais sans le guide d'ingénierie logicielle.
- `--bare` et `--safe-mode` ignorent le paramètre et n'autorisent pas les changements de `/output-style`.
- Changer le style en cours de session invalide le préfixe de prompt en cache une fois ; après cela, le cache fonctionne comme d'habitude.

Les styles ajustent le ton et le workflow, pas les connaissances ni les permissions. Pour les conventions de projet que le modèle doit toujours connaître, utilisez les fichiers de contexte (`QWEN.md`) ; pour un ajout ponctuel au prompt, utilisez `--append-system-prompt`.