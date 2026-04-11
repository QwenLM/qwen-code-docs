# Internationalisation (i18n) et langue

Qwen Code est conçu pour les workflows multilingues : il prend en charge la localisation de l'interface (i18n/l10n) dans le CLI, vous permet de choisir la langue de sortie de l'assistant et autorise les packs de langue personnalisés pour l'interface.

## Vue d'ensemble

Du point de vue de l'utilisateur, l'« internationalisation » de Qwen Code couvre plusieurs couches :

| Fonctionnalité / Paramètre | Ce qu'il contrôle                                                        | Emplacement de stockage        |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| `/language ui`             | Texte de l'interface du terminal (menus, messages système, prompts)      | `~/.qwen/settings.json`        |
| `/language output`         | Langue de réponse de l'IA (une préférence de sortie, pas une traduction de l'interface) | `~/.qwen/output-language.md`   |
| Packs de langue personnalisés pour l'interface | Remplace/étend les traductions intégrées de l'interface | `~/.qwen/locales/*.js`         |

## Langue de l'interface

Il s'agit de la couche de localisation de l'interface du CLI (i18n/l10n) : elle contrôle la langue des menus, des prompts et des messages système.

### Définir la langue de l'interface

Utilisez la commande `/language ui` :

```bash
/language ui zh-CN    # Chinese
/language ui en-US    # English
/language ui ru-RU    # Russian
/language ui de-DE    # German
/language ui ja-JP    # Japanese
```

Les alias sont également pris en charge :

```bash
/language ui zh       # Chinese
/language ui en       # English
/language ui ru       # Russian
/language ui de       # German
/language ui ja       # Japanese
```

### Détection automatique

Au premier démarrage, Qwen Code détecte la locale de votre système et définit automatiquement la langue de l'interface.

Ordre de priorité de la détection :

1. Variable d'environnement `QWEN_CODE_LANG`
2. Variable d'environnement `LANG`
3. Locale système via l'API JavaScript Intl
4. Par défaut : anglais

## Langue de sortie du LLM

La langue de sortie du LLM contrôle la langue dans laquelle l'assistant IA répond, indépendamment de la langue utilisée pour poser vos questions.

### Fonctionnement

La langue de sortie du LLM est contrôlée par un fichier de règles situé à `~/.qwen/output-language.md`. Ce fichier est automatiquement inclus dans le contexte du LLM au démarrage, lui indiquant de répondre dans la langue spécifiée.

### Détection automatique

Au premier démarrage, si aucun fichier `output-language.md` n'existe, Qwen Code en crée automatiquement un en fonction de la locale de votre système. Par exemple :

- La locale `zh` crée une règle pour les réponses en chinois
- La locale `en` crée une règle pour les réponses en anglais
- La locale `ru` crée une règle pour les réponses en russe
- La locale `de` crée une règle pour les réponses en allemand
- La locale `ja` crée une règle pour les réponses en japonais

### Configuration manuelle

Utilisez `/language output <language>` pour modifier la langue :

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Tout nom de langue fonctionne. Le LLM recevra l'instruction de répondre dans cette langue.

> [!note]
>
> Après avoir modifié la langue de sortie, redémarrez Qwen Code pour que la modification prenne effet.

### Emplacement du fichier

```
~/.qwen/output-language.md
```

## Configuration

### Via la boîte de dialogue des paramètres

1. Exécutez `/settings`
2. Recherchez "Language" sous General
3. Sélectionnez votre langue d'interface préférée

### Via une variable d'environnement

```bash
export QWEN_CODE_LANG=zh
```

Cela influence la détection automatique au premier démarrage (si vous n'avez pas défini de langue d'interface et qu'aucun fichier `output-language.md` n'existe encore).

## Packs de langue personnalisés

Pour les traductions de l'interface, vous pouvez créer des packs de langue personnalisés dans `~/.qwen/locales/` :

- Exemple : `~/.qwen/locales/es.js` pour l'espagnol
- Exemple : `~/.qwen/locales/fr.js` pour le français

Le répertoire utilisateur est prioritaire sur les traductions intégrées.

> [!tip]
>
> Les contributions sont les bienvenues ! Si vous souhaitez améliorer les traductions intégrées ou ajouter de nouvelles langues.
> Pour un exemple concret, consultez la [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Format des packs de langue

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... more translations
};
```

## Commandes associées

- `/language` - Afficher les paramètres de langue actuels
- `/language ui [lang]` - Définir la langue de l'interface
- `/language output <language>` - Définir la langue de sortie du LLM
- `/settings` - Ouvrir la boîte de dialogue des paramètres