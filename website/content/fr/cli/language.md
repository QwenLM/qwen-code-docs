# Commande /language

La commande `/language` vous permet de personnaliser les paramètres linguistiques à la fois pour l'interface utilisateur (UI) de Qwen Code et la langue de sortie du modèle linguistique. Cette commande prend en charge deux fonctionnalités distinctes :

1. Définir la langue de l'interface utilisateur de Qwen Code
2. Définir la langue de sortie du modèle linguistique (LLM)

## Paramètres de langue de l'interface utilisateur

Pour modifier la langue de l'interface utilisateur de Qwen Code, utilisez la sous-commande `ui` :

```
/language ui [zh-CN|en-US]
```

### Langues disponibles pour l'interface utilisateur

- **zh-CN** : Chinois simplifié (简体中文)
- **en-US** : Anglais

### Exemples

```
/language ui zh-CN    # Définit la langue de l'interface en chinois simplifié
/language ui en-US    # Définit la langue de l'interface en anglais
```

### Sous-commandes pour la langue de l'interface utilisateur

Vous pouvez également utiliser des sous-commandes directes pour plus de commodité :

- `/language ui zh-CN` ou `/language ui zh` ou `/language ui 中文`
- `/language ui en-US` ou `/language ui en` ou `/language ui english`

## Paramètres de langue des réponses du LLM

Pour définir la langue des réponses du modèle linguistique, utilisez la sous-commande `output` :

```
/language output <language>
```

Cette commande génère un fichier de règle qui indique au LLM de répondre dans la langue spécifiée. Le fichier de règle est enregistré dans `~/.qwen/output-language.md`.

### Exemples

```
/language output 中文      # Définir la langue de sortie du LLM sur chinois
/language output English   # Définir la langue de sortie du LLM sur anglais
/language output 日本語    # Définir la langue de sortie du LLM sur japonais
```

## Affichage des paramètres actuels

Lorsqu'elle est utilisée sans argument, la commande `/language` affiche les paramètres de langue actuels :

```
/language
```

Cela affichera :

- La langue actuelle de l'interface utilisateur
- La langue actuelle des sorties du LLM (si définie)
- Les sous-commandes disponibles

## Notes

- Les changements de langue de l'interface utilisateur prennent effet immédiatement et rechargent toutes les descriptions de commandes
- Les paramètres de langue de sortie du LLM sont persistés dans un fichier de règles qui est automatiquement inclus dans le contexte du modèle
- Pour demander des packs de langue supplémentaires pour l'UI, veuillez ouvrir une issue sur GitHub