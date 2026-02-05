# Internationalisation (i18n) et Langue

Qwen Code est conçu pour des flux de travail multilingues : il prend en charge la localisation de l'interface utilisateur (i18n/l10n) dans le CLI, vous permet de choisir la langue de sortie de l'assistant et autorise les packs de langues personnalisés pour l'interface utilisateur.

## Aperçu

Du point de vue de l'utilisateur, l'"internationalisation" de Qwen Code s'étend sur plusieurs couches :

| Fonctionnalité / Paramètre | Ce qu'elle contrôle                                                                 | Où elle est stockée              |
| -------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- |
| `/language ui`             | Texte de l'interface utilisateur du terminal (menus, messages système, invites)   | `~/.qwen/settings.json`          |
| `/language output`         | Langue dans laquelle l'IA répond (une préférence de sortie, pas une traduction UI) | `~/.qwen/output-language.md`     |
| Packs de langues UI personnalisés | Remplace/étend les traductions UI intégrées                                       | `~/.qwen/locales/*.js`           |

## Langue de l'interface utilisateur

C'est la couche de localisation de l'interface CLI (i18n/l10n) : elle contrôle la langue des menus, des invites et des messages système.

### Configuration de la langue de l'interface utilisateur

Utilisez la commande `/language ui` :

```bash
/language ui zh-CN    # Chinois
/language ui en-US    # Anglais
/language ui ru-RU    # Russe
/language ui de-DE    # Allemand
/language ui ja-JP    # Japonais
```

Les alias sont également pris en charge :

```bash
/language ui zh       # Chinois
/language ui en       # Anglais
/language ui ru       # Russe
/language ui de       # Allemand
/language ui ja       # Japonais
```

### Détection automatique

Au premier démarrage, Qwen Code détecte les paramètres régionaux de votre système et définit automatiquement la langue de l'interface utilisateur.

Ordre de priorité pour la détection :

1. Variable d'environnement `QWEN_CODE_LANG`
2. Variable d'environnement `LANG`
3. Paramètres régionaux du système via l'API JavaScript Intl
4. Valeur par défaut : anglais

## Langue de sortie du modèle LLM

La langue de sortie du modèle LLM contrôle la langue dans laquelle l'assistant IA répond, quelle que soit la langue dans laquelle vous saisissez vos questions.

### Fonctionnement

Le langage de sortie du modèle LLM est contrôlé par un fichier de règles situé à l'emplacement `~/.qwen/output-language.md`. Ce fichier est automatiquement inclus dans le contexte du LLM au démarrage, lui indiquant de répondre dans la langue spécifiée.

### Détection automatique

Au premier démarrage, si aucun fichier `output-language.md` n'existe, Qwen Code en crée automatiquement un en se basant sur les paramètres régionaux de votre système. Par exemple :

- Les paramètres régionaux système `zh` créent une règle pour des réponses en chinois
- Les paramètres régionaux système `en` créent une règle pour des réponses en anglais
- Les paramètres régionaux système `ru` créent une règle pour des réponses en russe
- Les paramètres régionaux système `de` créent une règle pour des réponses en allemand
- Les paramètres régionaux système `ja` créent une règle pour des réponses en japonais

### Réglage manuel

Utilisez `/language output <language>` pour changer :

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Tout nom de langue fonctionne. Le modèle LLM sera instruit de répondre dans cette langue.

> [!note]
>
> Après avoir changé la langue de sortie, redémarrez Qwen Code pour que le changement prenne effet.

### Emplacement du fichier

```
~/.qwen/output-language.md
```

## Configuration

### Via la boîte de dialogue des paramètres

1. Exécutez `/settings`
2. Trouvez "Language" sous Général
3. Sélectionnez votre langue d'interface préférée

### Via une variable d'environnement

```bash
export QWEN_CODE_LANG=zh
```

Cela influence la détection automatique au premier démarrage (si vous n'avez pas encore défini de langue d'interface et qu'aucun fichier `output-language.md` n'existe encore).

## Packs de langues personnalisés

Pour les traductions de l'interface utilisateur, vous pouvez créer des packs de langues personnalisés dans `~/.qwen/locales/` :

- Exemple : `~/.qwen/locales/es.js` pour l'espagnol
- Exemple : `~/.qwen/locales/fr.js` pour le français

Le répertoire utilisateur est prioritaire sur les traductions intégrées.

> [!tip]
>
> Les contributions sont les bienvenues ! Si vous souhaitez améliorer les traductions intégrées ou ajouter de nouvelles langues.
> Pour un exemple concret, voir [PR #1238 : feat(i18n) : ajout du support de la langue russe](https://github.com/QwenLM/qwen-code/pull/1238).

### Format du pack de langues

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuración',
  // ... plus de traductions
};
```

## Commandes associées

- `/language` - Afficher les paramètres linguistiques actuels
- `/language ui [lang]` - Définir la langue de l'interface utilisateur
- `/language output <language>` - Définir la langue de sortie du modèle LLM
- `/settings` - Ouvrir la boîte de dialogue des paramètres