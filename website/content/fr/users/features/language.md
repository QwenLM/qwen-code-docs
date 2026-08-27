# Internationalisation (i18n) & Langue

Qwen Code est conçu pour les workflows multilingues : il prend en charge la localisation de l'interface utilisateur (i18n/l10n) dans le CLI, vous permet de choisir la langue de sortie de l'assistant et autorise des packs de langue personnalisés pour l'interface.

## Aperçu

Du point de vue de l'utilisateur, « l'internationalisation » de Qwen Code comporte plusieurs couches :

| Capacité / Paramètre | Ce qu'il contrôle | Où il est stocké |
| --------------------- | ----------------- | ---------------- |
| `/language ui` | Texte de l'interface utilisateur du terminal (menus, messages système, invites) | `~/.qwen/settings.json` |
| `/language output` | Langue dans laquelle l'IA répond (une préférence de sortie, pas une traduction de l'interface) | `~/.qwen/output-language.md` |
| Packs de langue personnalisés | Remplace/étend les traductions intégrées de l'interface | `~/.qwen/locales/*.js` |

## Langue de l'interface

Il s'agit de la couche de localisation de l'interface utilisateur du CLI (i18n/l10n) : elle contrôle la langue des menus, des invites et des messages système.

### Définition de la langue de l'interface

Utilisez la commande `/language ui` :

```bash
/language ui zh-CN    # Chinese
/language ui en-US    # English
/language ui ru-RU    # Russian
/language ui de-DE    # German
/language ui ja-JP    # Japanese
/language ui pt-BR    # Portuguese (Brazil)
/language ui fr-FR    # French
/language ui ca-ES    # Catalan
```

Les alias sont également pris en charge :

```bash
/language ui zh       # Chinese
/language ui en       # English
/language ui ru       # Russian
/language ui de       # German
/language ui ja       # Japanese
/language ui pt       # Portuguese
/language ui fr       # French
/language ui ca       # Catalan
```

### Détection automatique

Au premier démarrage, Qwen Code détecte votre locale système et définit automatiquement la langue de l'interface.

Priorité de détection :

1. Variable d'environnement `QWEN_CODE_LANG`
2. Variable d'environnement `LANG`
3. Locale système via l'API JavaScript Intl
4. Par défaut : Anglais

## Langue de sortie du LLM

La langue de sortie du LLM contrôle dans quelle langue l'assistant IA répond, indépendamment de la langue dans laquelle vous posez vos questions.

### Fonctionnement

La langue de sortie du LLM est contrôlée par un fichier de règles situé dans `~/.qwen/output-language.md`. Ce fichier est automatiquement inclus dans le contexte du LLM au démarrage, lui demandant de répondre dans la langue spécifiée.

### Détection automatique

Au premier démarrage, si aucun fichier `output-language.md` n'existe, Qwen Code en crée automatiquement un basé sur votre locale système. Par exemple :

- La locale système `zh` crée une règle pour les réponses en chinois
- La locale système `en` crée une règle pour les réponses en anglais
- La locale système `ru` crée une règle pour les réponses en russe
- La locale système `de` crée une règle pour les réponses en allemand
- La locale système `ja` crée une règle pour les réponses en japonais
- La locale système `pt` crée une règle pour les réponses en portugais
- La locale système `fr` crée une règle pour les réponses en français
- La locale système `ca` crée une règle pour les réponses en catalan

### Paramétrage manuel

Utilisez `/language output <language>` pour changer :

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

N'importe quel nom de langue fonctionne. Le LLM sera invité à répondre dans cette langue.

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
2. Trouvez « Langue » sous Général
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

Le répertoire utilisateur a priorité sur les traductions intégrées.

> [!tip]
>
> Les contributions sont les bienvenues ! Si vous souhaitez améliorer les traductions intégrées ou ajouter de nouvelles langues.
> Pour un exemple concret, voir [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Maintien du `zh-TW` (chinois traditionnel pour Taïwan)

`zh-TW` n'est **pas** une conversion automatique OpenCC s2t de `zh.js` — c'est une traduction maintenue manuellement avec le vocabulaire taïwanais. Lorsque vous ajoutez ou mettez à jour des clés, veuillez suivre les conventions ci-dessous.

La colonne « Application CI ? » indique si `npm run check-i18n` fera échouer la build en cas de violation. Les lignes marquées **Non** sont des recommandations de style appliquées uniquement lors de la relecture — généralement parce que la forme litigieuse peut avoir un sens légitime non lié à l'interface (`文件` peut signifier « document », `打開` est acceptable dans le langage courant à Taïwan).

| À éviter | Utiliser à la place | Application CI ? | Raison |
| -------- | ------------------- | ---------------- | ------ |
| 文件 (file) | 檔案 | Non | Terme taïwanais pour les fichiers du système de fichiers (mais `文件` peut légitimement signifier « document ») |
| 服務器 / 服务器 | 伺服器 | Oui | Terme taïwanais pour « serveur » |
| 菜單 / 菜单 | 選單 | Oui | Terme taïwanais pour « menu » |
| 鏈接 / 链接 | 連結 | Oui | Terme taïwanais pour « lien » (`鏈` seul est correct — p. ex. 區塊鏈) |
| 打開 | 開啟 | Non | Verbe préféré à Taïwan pour « ouvrir » (interface) ; `打開` est courant dans le langage parlé |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | Oui | Formes traditionnelles variantes issues de la conversion brute OpenCC s2t. Note : `曆` dépend du contexte et est correct dans les termes calendaires (日曆, 農曆, 西曆) ; la CI ne signale que le bigramme `曆史`, pas le `曆` seul. |

Si vous n'êtes pas un locuteur du chinois traditionnel et que vous devez trouver une valeur de base, **ne collez pas la sortie brute d'OpenCC `s2t`** : le profil s2t par défaut produit des caractères traditionnels variantes (par exemple 爲, 啓) que Taïwan n'utilise pas, et ne réécrit jamais le vocabulaire de Chine continentale (服務器, 菜單). Préférez `s2twp.json` (Simplifié → Taïwan avec correspondance de phrases) comme point de départ, puis demandez à un locuteur du chinois taïwanais de relire.

Le script `check-i18n` (exécuté dans la CI via `npm run check-i18n`) fera échouer la build si l'une des sous-chaînes appliquées par la CI ci-dessus se retrouve dans une valeur `zh-TW`. Consultez `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` pour la liste complète. Si une traduction doit légitimement contenir une sous-chaîne interdite par la CI, ajoutez sa clé à `ZH_TW_ALLOWED_EXCEPTIONS` dans le même fichier avec une brève justification.

> [!note]
>
> La vérification utilise une correspondance de sous-chaînes simples, qui ne comprend pas les limites des mots chinois. Un bigramme peut donc donner un faux positif à travers les frontières de mots composés — par exemple, `區塊鏈接口` (= `區塊鏈` + `接口`) contient la sous-chaîne `鏈接` même si aucun des deux mots n'est incorrect. Si vous rencontrez un échec CI surprenant de ce type, ajoutez la clé de traduction à `ZH_TW_ALLOWED_EXCEPTIONS` plutôt que de supprimer le motif.

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