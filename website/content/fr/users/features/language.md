# Internationalisation (i18n) et langue

Qwen Code est conçu pour les flux de travail multilingues : il prend en charge la localisation de l’interface utilisateur (i18n/l10n) dans l’interface en ligne de commande (CLI), vous permet de choisir la langue de sortie de l’assistant, et autorise l’utilisation de jeux de langues personnalisés pour l’interface utilisateur.

## Aperçu

Du point de vue de l’utilisateur, l’« internationalisation » de Qwen Code couvre plusieurs niveaux :

| Fonctionnalité / Paramètre     | Ce qu’il contrôle                                                               | Emplacement de stockage                 |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------- |
| `/language ui`                 | Textes de l’interface utilisateur dans le terminal (menus, messages système, invites) | `~/.qwen/settings.json`                 |
| `/language output`             | Langue dans laquelle l’IA répond (préférence de sortie, pas une traduction de l’IU) | `~/.qwen/output-language.md`            |
| Jeux de langues personnalisés pour l’IU | Remplace ou étend les traductions intégrées de l’interface utilisateur           | `~/.qwen/locales/*.js`                 |

## Langue de l’interface utilisateur

Il s’agit de la couche de localisation (i18n/l10n) de l’interface en ligne de commande (CLI) : elle détermine la langue des menus, des invites et des messages système.

### Définir la langue de l’interface utilisateur

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

Au premier démarrage, Qwen Code détecte automatiquement la locale système et définit la langue de l’interface utilisateur en conséquence.

Ordre de priorité pour la détection :

1. Variable d’environnement `QWEN_CODE_LANG`
2. Variable d’environnement `LANG`
3. Locale système via l’API JavaScript `Intl`
4. Par défaut : anglais

## Langue de sortie du modèle LLM

La langue de sortie du modèle LLM détermine la langue dans laquelle l’assistant IA formule ses réponses, indépendamment de la langue dans laquelle vous saisissez vos questions.

### Fonctionnement

La langue de sortie du modèle LLM est contrôlée par un fichier de règles situé à `~/.qwen/output-language.md`. Ce fichier est automatiquement inclus dans le contexte du modèle LLM au démarrage, lui indiquant de répondre dans la langue spécifiée.

### Détection automatique

Lors du premier démarrage, si aucun fichier `output-language.md` n’existe, Qwen Code en crée automatiquement un en fonction des paramètres régionaux de votre système. Par exemple :

- Les paramètres régionaux système `zh` créent une règle pour des réponses en chinois  
- Les paramètres régionaux système `en` créent une règle pour des réponses en anglais  
- Les paramètres régionaux système `ru` créent une règle pour des réponses en russe  
- Les paramètres régionaux système `de` créent une règle pour des réponses en allemand  
- Les paramètres régionaux système `ja` créent une règle pour des réponses en japonais

### Configuration manuelle

Utilisez `/language output <langue>` pour modifier la langue de sortie :

```bash
/language output chinois
/language output anglais
/language output japonais
/language output allemand
```

Tout nom de langue fonctionne. Le modèle de langage (LLM) recevra pour instruction de répondre dans cette langue.

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
2. Recherchez « Langue » dans la section « Général »
3. Sélectionnez votre langue d’interface utilisateur préférée

### Via une variable d’environnement

```bash
export QWEN_CODE_LANG=zh
```

Cela influence la détection automatique à la première exécution (si aucune langue d’interface utilisateur n’a été définie et si le fichier `output-language.md` n’existe pas encore).

## Packs de langues personnalisés

Pour les traductions de l’interface utilisateur, vous pouvez créer des packs de langues personnalisés dans le répertoire `~/.qwen/locales/` :

- Exemple : `~/.qwen/locales/es.js` pour l’espagnol  
- Exemple : `~/.qwen/locales/fr.js` pour le français  

Le répertoire utilisateur a priorité sur les traductions intégrées.

> [!tip]
>
> Les contributions sont les bienvenues ! Si vous souhaitez améliorer les traductions intégrées ou ajouter de nouvelles langues.  
> Pour un exemple concret, consultez la [PR #1238 : feat(i18n) : ajout du support de la langue russe](https://github.com/QwenLM/qwen-code/pull/1238).

### Format d’un pack de langues

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuration',
  // ... autres traductions
};
```

## Commandes associées

- `/language` — Affiche les paramètres linguistiques actuels  
- `/language ui [lang]` — Définit la langue de l’interface utilisateur  
- `/language output <language>` — Définit la langue de sortie du modèle LLM  
- `/settings` — Ouvre la boîte de dialogue des paramètres