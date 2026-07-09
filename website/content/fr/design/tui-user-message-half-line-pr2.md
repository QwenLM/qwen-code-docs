# Optimisation de l'espacement TUI PR2 — Bandes de couleur sur une demi-ligne et espacement compact

## Contexte

La PR1 a initialement resserré l'espacement vertical du TUI en supprimant les lignes vides superflues à l'intérieur des groupes d'outils. Cependant, deux problèmes d'expérience utilisateur persistent en pratique :

1. **Absence de séparation visuelle entre les messages utilisateur et les réponses de l'assistant** — Difficulté à repérer rapidement "où commence ma question" dans les longues conversations.
2. **L'espacement entre les blocs reste trop important** — Une ligne entière vide sépare chaque alternance question/réponse, ce qui gaspille de l'espace à l'écran.

## Modifications de cette PR

### 1. Bandes de couleur sur une demi-ligne pour les messages utilisateur

Ajout d'une fine ligne de couleur sur une demi-hauteur au-dessus et en dessous de chaque message utilisateur. La zone de contenu utilise le même `backgroundColor`, créant ainsi une bande de couleur continue sur trois niveaux :

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄   ← foreground = bandColor (coloration de la moitié inférieure)
> Contenu de la question utilisateur ← backgroundColor = bandColor (arrière-plan de la ligne entière)
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   ← foreground = bandColor (coloration de la moitié supérieure)
```

- La couleur est calculée via `subtleBandColor()` : un décalage de luminosité pure de 6 % est appliqué à la couleur d'arrière-plan (terminal sombre → légèrement plus clair, terminal clair → légèrement plus sombre), sans modifier la teinte.
- Dégradation automatique vers un affichage standard (`marginTop=1`) pour les terminaux ne supportant pas la couleur 24 bits, les lecteurs d'écran et les environnements `NO_COLOR`.
- Protection contre les largeurs négatives ou nulles.

### 2. Resserrage de l'espacement entre les questions et les réponses

| Emplacement | Avant | Après |
| --------------------- | -------------- | ----------------------------------------------- |
| Au-dessus du message utilisateur | 1 ligne vide | 0 (la bande de couleur assure la séparation visuelle ; `marginTop=1` conservé en cas de dégradation) |
| Au-dessus de la sortie du modèle | 1 ligne vide | 1 ligne vide (conservée pour distinguer le processus de réflexion de la sortie finale) |
| Au-dessus des appels d'outils / messages d'état | 1 ligne vide | 0 |
| À la fin du texte de réflexion | Possibilité de sauts de ligne superflus | `trimEnd()` pour éviter les doubles lignes vides |

La séquence "réponse → appel d'outil → réponse" au sein d'un même tour de conversation ne contient plus de lignes vides superflues, rendant l'information plus compacte et cohérente.

## Comparaison des résultats

**Avant :**

```
(1 ligne vide)
> Lis le package.json
(1 ligne vide)
✦ D'accord, je lis le fichier.
(1 ligne vide)
┌ Read package.json ─────────┐
│ ✓ Read  package.json       │
└────────────────────────────┘
(1 ligne vide)
✦ Voici le contenu du fichier : ...

(1 ligne vide)
┌─ Zone de saisie ────────────┐
```

**Après :**

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
> Lis le package.json
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
✦ D'accord, je lis le fichier.
┌ Read package.json ─────────┐
│ ✓ Read  package.json       │
└────────────────────────────┘
(1 ligne vide)
✦ Voici le contenu du fichier : ...

(1 ligne vide)
┌─ Zone de saisie ────────────┐
```

## Éléments non modifiés

- Le style des bordures des appels d'outils reste inchangé.
- L'espacement des paragraphes du corps en Markdown reste inchangé (1 ligne est déjà l'unité minimale du terminal).
- Les valeurs des couleurs pour les thèmes sombre et clair restent inchangées.
- L'espacement de la zone de saisie (Composer) reste inchangé avec `marginTop=1`.