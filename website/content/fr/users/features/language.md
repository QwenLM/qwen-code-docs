# Internationalisation (i18n) et langue

Qwen Code est conçu pour des flux de travail multilingues : il prend en charge la localisation de l’interface utilisateur (i18n/l10n) dans le CLI, vous permet de choisir la langue de sortie de l’assistant et autorise des packs de langue personnalisés pour l’interface.

## Vue d’ensemble

Du point de vue de l’utilisateur, l’« internationalisation » de Qwen Code couvre plusieurs couches :

| Capacité / Réglage      | Ce qu’il contrôle                                                       | Stockage                    |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------- |
| `/language ui`          | Texte de l’interface du terminal (menus, messages système, invites)     | `~/.qwen/settings.json`     |
| `/language output`      | Langue dans laquelle l’IA répond (préférence de sortie, pas traduction UI) | `~/.qwen/output-language.md` |
| Packs de langue UI personnalisés | Remplace/étend les traductions UI intégrées                     | `~/.qwen/locales/*.js`      |

## Langue de l’interface

C’est la couche de localisation UI du CLI (i18n/l10n) : elle contrôle la langue des menus, des invites et des messages système.

### Définir la langue de l’interface

Utilisez la commande `/language ui` :

```bash
/language ui zh-CN    # Chinois
/language ui en-US    # Anglais
/language ui ru-RU    # Russe
/language ui de-DE    # Allemand
/language ui ja-JP    # Japonais
/language ui pt-BR    # Portugais (Brésil)
/language ui fr-FR    # Français
/language ui ca-ES    # Catalan
```

Les alias sont également pris en charge :

```bash
/language ui zh       # Chinois
/language ui en       # Anglais
/language ui ru       # Russe
/language ui de       # Allemand
/language ui ja       # Japonais
/language ui pt       # Portugais
/language ui fr       # Français
/language ui ca       # Catalan
```

### Détection automatique

Au premier démarrage, Qwen Code détecte la locale de votre système et définit automatiquement la langue de l’interface.

Ordre de détection :

1. Variable d’environnement `QWEN_CODE_LANG`
2. Variable d’environnement `LANG`
3. Locale système via l’API JavaScript Intl
4. Par défaut : anglais

## Langue de sortie du LLM

La langue de sortie du LLM contrôle la langue dans laquelle l’assistant IA répond, quelle que soit la langue dans laquelle vous posez vos questions.

### Fonctionnement

La langue de sortie du LLM est contrôlée par un fichier de règle situé dans `~/.qwen/output-language.md`. Ce fichier est automatiquement inclus dans le contexte du LLM au démarrage, lui demandant de répondre dans la langue spécifiée.

### Détection automatique

Au premier démarrage, si aucun fichier `output-language.md` n’existe, Qwen Code en crée un automatiquement en fonction de votre locale système. Par exemple :

- Locale système `zh` crée une règle pour des réponses en chinois
- Locale système `en` crée une règle pour des réponses en anglais
- Locale système `ru` crée une règle pour des réponses en russe
- Locale système `de` crée une règle pour des réponses en allemand
- Locale système `ja` crée une règle pour des réponses en japonais
- Locale système `pt` crée une règle pour des réponses en portugais
- Locale système `fr` crée une règle pour des réponses en français
- Locale système `ca` crée une règle pour des réponses en catalan

### Réglage manuel

Utilisez `/language output <langue>` pour changer :

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

N’importe quel nom de langue fonctionne. Le LLM recevra la consigne de répondre dans cette langue.

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
2. Trouvez « Language » sous General
3. Sélectionnez votre langue d’interface préférée

### Via la variable d’environnement

```bash
export QWEN_CODE_LANG=zh
```

Cela influence la détection automatique au premier démarrage (si vous n’avez pas défini de langue d’interface et qu’aucun fichier `output-language.md` n’existe encore).

## Packs de langue personnalisés

Pour les traductions de l’interface, vous pouvez créer des packs de langue personnalisés dans `~/.qwen/locales/` :

- Exemple : `~/.qwen/locales/es.js` pour l’espagnol
- Exemple : `~/.qwen/locales/fr.js` pour le français

Le répertoire utilisateur a priorité sur les traductions intégrées.

> [!tip]
>
> Les contributions sont les bienvenues ! Si vous souhaitez améliorer les traductions intégrées ou ajouter de nouvelles langues.
> Pour un exemple concret, voir [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Maintenance de `zh-TW` (chinois traditionnel pour Taïwan)

`zh-TW` **n’est pas** une conversion automatique OpenCC s2t de `zh.js` — c’est une traduction maintenue manuellement avec le vocabulaire taïwanais. Lors de l’ajout ou de la mise à jour de clés, veuillez suivre les conventions ci-dessous.

La colonne « CI enforced? » indique si `npm run check-i18n` fera échouer la construction en cas de violation. Les lignes marquées **Non** sont des directives de style appliquées uniquement par révision — généralement parce que la forme incriminée a une signification légitime non liée à l’interface ( `文件` peut signifier « document », `打開` est familier mais acceptable à Taïwan).

| À éviter              | À utiliser à la place | CI enforced? | Raison                                                                                                                                                                           |
| --------------------- | --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 (file)           | 檔案                  | Non          | Terme taïwanais pour les fichiers du système de fichiers (mais `文件` peut légitimement signifier « document »)                                                                                                   |
| 服務器 / 服务器       | 伺服器                | Oui          | Terme taïwanais pour « serveur »                                                                                                                                                         |
| 菜單 / 菜单           | 選單                  | Oui          | Terme taïwanais pour « menu »                                                                                                                                                           |
| 鏈接 / 链接           | 連結                  | Oui          | Terme taïwanais pour « lien » ( `鏈` seul est correct — par ex. 區塊鏈)                                                                                                                         |
| 打開                  | 開啟                  | Non          | Verbe préféré à Taïwan pour « ouvrir » (UI) ; `打開` est couramment utilisé familièrement                                                                                                             |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | Oui          | Formes traditionnelles variantes issues d’OpenCC s2t brut. Note : `曆` dépend du contexte et est correct dans les termes calendaires (日曆, 農曆, 西曆) ; CI ne signale que le bigramme `曆史`, pas `曆` seul. |
Si vous n'êtes pas un locuteur natif du chinois traditionnel et devez amorcer une valeur, **ne collez pas la sortie brute de `s2t` d'OpenCC** : le profil `s2t` par défaut produit des caractères traditionnels variants (ex. 爲, 啓) que Taïwan n'utilise pas, et ne réécrit jamais le vocabulaire de la Chine continentale (服務器, 菜單). Préférez `s2twp.json` (Simplifié → Taïwan avec correspondance de phrases) comme point de départ, puis demandez à un locuteur du chinois de Taïwan de relire.

Le script `check-i18n` (exécuté dans l'IC via `npm run check-i18n`) fera échouer la build si l'une des sous-chaînes CI-contraintes ci-dessus se retrouve dans une valeur `zh-TW`. Consultez `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` pour la liste complète. Si une traduction a légitimement besoin de contenir une sous-chaîne interdite par l'IC, ajoutez sa clé dans `ZH_TW_ALLOWED_EXCEPTIONS` du même fichier avec une brève justification.

> [!note]
>
> La vérification utilise une correspondance de sous-chaînes simple, qui ne comprend pas les limites des mots chinois. Un modèle de bigramme peut donc générer un faux positif aux frontières de mots composés – par exemple, `區塊鏈接口` (= `區塊鏈` + `接口`) contient la sous-chaîne `鏈接` même si aucun des deux mots n'est incorrect. Si vous rencontrez un échec CI surprenant de ce type, ajoutez la clé de traduction dans `ZH_TW_ALLOWED_EXCEPTIONS` plutôt que de supprimer le modèle.

### Format du pack de langue

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
