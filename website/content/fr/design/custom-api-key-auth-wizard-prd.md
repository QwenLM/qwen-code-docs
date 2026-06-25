# Guide de l'assistant de clé API personnalisée PRD

## Résumé

Améliorer l'expérience `/auth -> Clé API -> Clé API personnalisée` en remplaçant l'écran actuel d'information statique par un assistant de configuration en terminal pour les fournisseurs d'API personnalisés.

Qwen Code prend en charge plusieurs protocoles d'API via les clés `authType` / `modelProviders`, notamment `openai`, `anthropic` et `gemini`. Par conséquent, l'assistant de configuration personnalisée doit d'abord demander aux utilisateurs de sélectionner le protocole, puis collecter les informations de point de terminaison, de clé et de modèle pour ce protocole.

L'assistant guide les utilisateurs à travers :

```text
Select Protocol -> Enter Base URL -> Enter API Key -> Enter Model IDs -> Review JSON -> Save + authenticate
```

Cela maintient la configuration de la clé API personnalisée à l'intérieur de Qwen Code, réduit le besoin de modifier manuellement `settings.json` et rend la configuration finale transparente en affichant le JSON généré avant l'enregistrement.

## Contexte

Actuellement, sélectionner `Clé API personnalisée` dans `/auth` affiche un écran d'information statique :

```text
Custom Configuration

You can configure your API key and models in settings.json

Refer to the documentation for setup instructions
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc to go back
```

Cela oblige l'utilisateur à quitter le CLI, à lire de la documentation, à comprendre `settings.json`, à configurer manuellement `modelProviders`, à choisir une `envKey`, à ajouter des clés API, puis à revenir à Qwen Code. Les utilisateurs ont signalé que ce flux est difficile et déconnecté du reste de l'expérience `/auth`.

Le chemin actuel de la clé API standard ModelStudio offre déjà un flux de configuration guidé :

```text
Alibaba Cloud ModelStudio Standard API Key
└─ Select Region
   └─ Enter API Key
      └─ Enter Model IDs
         └─ Save + authenticate
```

La configuration de clé API personnalisée devrait offrir une expérience guidée similaire, tout en respectant le fait que Qwen Code prend en charge plusieurs protocoles de fournisseurs.

## Problématique

Le chemin de la clé API personnalisée est actuellement une impasse dans `/auth` :

```text
/auth
└─ Select Authentication Method
   ├─ Alibaba Cloud Coding Plan
   ├─ API Key
   │  └─ Select API Key Type
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Select Region
   │     │  ├─ Enter API Key
   │     │  ├─ Enter Model IDs
   │     │  └─ Save + authenticate
   │     │
   │     └─ Custom API Key
   │        └─ Documentation-only screen
   │
   └─ Qwen OAuth
```

Cela entraîne plusieurs problèmes d'utilisabilité :

- Les utilisateurs ne peuvent pas terminer la configuration d'un fournisseur personnalisé depuis `/auth`.
- Les utilisateurs doivent comprendre des concepts de configuration de bas niveau avant de pouvoir s'authentifier.
- Les utilisateurs peuvent ne pas savoir quels champs sont obligatoires : `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name`, et `security.auth.selectedType`.
- Les utilisateurs peuvent accidentellement entrer en conflit avec des variables d'environnement existantes ou écraser une configuration de fournisseur existante.
- Les utilisateurs n'obtiennent pas de retour d'authentification immédiat après avoir modifié manuellement les paramètres.

## Objectifs

1. Permettre aux utilisateurs de configurer un fournisseur d'API personnalisé entièrement dans `/auth`.
2. Prendre en charge les principaux protocoles que Qwen Code supporte dans `modelProviders` : `openai`, `anthropic` et `gemini`.
3. Garder le flux proche du flux standard ModelStudio existant.
4. Traiter `baseUrl` comme l'équivalent de `region` pour les fournisseurs personnalisés.
5. Générer automatiquement une `envKey` privée gérée par Qwen à partir du protocole sélectionné et du `baseUrl` saisi.
6. Stocker la clé API dans `settings.json.env`, conformément au modèle actuel des identifiants gérés par Qwen.
7. Éviter les conflits avec les variables d'environnement shell de l'utilisateur en utilisant un nom de clé généré spécifique à Qwen.
8. Afficher le JSON généré avant l'enregistrement afin que les utilisateurs puissent examiner les modifications exactes des paramètres.
9. Préserver les entrées `modelProviders` existantes non liées.
10. Authentifier immédiatement après l'enregistrement et afficher un retour de succès ou d'échec.

## Objectifs exclus

1. Ne pas obliger les utilisateurs à saisir manuellement `envKey`.
2. Ne pas introduire le nom du fournisseur en tant que concept distinct.
3. Ne pas ajouter de paramètres avancés (`generationConfig`, `capabilities` ou surcharges par modèle) à l'assistant.
4. Ne pas supprimer complètement le lien vers la documentation ; il doit rester disponible pour une configuration avancée.
5. Ne pas modifier les flux existants de Coding Plan ou de clé API standard ModelStudio.
6. Ne pas tenter de détecter automatiquement le protocole à partir de `baseUrl` dans la première version ; les utilisateurs sélectionnent explicitement le protocole.

## Utilisateurs ciblés

- Les utilisateurs qui apportent leur propre point de terminaison d'API personnalisé.
- Les utilisateurs configurant des fournisseurs tels que des API compatibles OpenAI, compatibles Anthropic, compatibles Gemini, vLLM, Ollama, LM Studio ou des passerelles internes.
- Les utilisateurs qui préfèrent configurer l'authentification depuis le CLI plutôt que de modifier manuellement `settings.json`.

## Protocoles pris en charge

L'assistant doit initialement exposer ces options de protocole :

```text
openai
anthropic
gemini
```

Chaque protocole correspond directement à une clé `modelProviders` et une valeur `security.auth.selectedType`.

| Option de protocole          | Type d'authentification / clé modelProviders | Notes                                                                                         |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Compatible OpenAI            | `openai`                                     | OpenAI, OpenRouter, Fireworks, serveurs locaux compatibles OpenAI, passerelles internes        |
| Compatible Anthropic         | `anthropic`                                  | Points de terminaison compatibles Anthropic                                                     |
| Compatible Gemini            | `gemini`                                     | Points de terminaison compatibles Gemini                                                       |
## Présentation de l'expérience utilisateur

### Arborescence `/auth` mise à jour

```text
/auth
└─ Sélectionner la méthode d'authentification
   ├─ Alibaba Cloud Coding Plan
   │  └─ Sélectionner la région
   │     └─ Saisir la clé API
   │        └─ Enregistrer + authentifier
   │
   ├─ Clé API
   │  └─ Sélectionner le type de clé API
   │     ├─ Clé API standard Alibaba Cloud ModelStudio
   │     │  ├─ Sélectionner la région
   │     │  ├─ Saisir la clé API
   │     │  ├─ Saisir les ID de modèle
   │     │  └─ Enregistrer + authentifier
   │     │
   │     └─ Clé API personnalisée
   │        ├─ Sélectionner le protocole
   │        ├─ Saisir l'URL de base
   │        ├─ Saisir la clé API
   │        ├─ Saisir les ID de modèle
   │        ├─ Vérifier le JSON généré
   │        └─ Enregistrer + authentifier
   │
   └─ Qwen OAuth
```

### Machine d'état de la clé API personnalisée

```text
api-key-type-select
  │
  └─ CUSTOM_API_KEY
      │
      ▼
custom-protocol-select
      │ Saisir
      ▼
custom-base-url-input
      │ Saisir
      │ générer envKey à partir de protocol + baseUrl
      ▼
custom-api-key-input
      │ Saisir
      ▼
custom-model-id-input
      │ Saisir
      ▼
custom-review-json
      │ Saisir
      ▼
enregistrer les paramètres + refreshAuth(selectedProtocol)
```

### Comportement de la touche Échap

```text
custom-review-json
  Échap -> custom-model-id-input

custom-model-id-input
  Échap -> custom-api-key-input

custom-api-key-input
  Échap -> custom-base-url-input

custom-base-url-input
  Échap -> custom-protocol-select

custom-protocol-select
  Échap -> api-key-type-select
```

## Conception détaillée des interactions

### Étape 1 : Sélectionner le protocole

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · Sélectionner le protocole            │
│                                                              │
│  ◉ Compatible OpenAI                                         │
│    OpenAI, OpenRouter, Fireworks, vLLM, Ollama, LM Studio    │
│                                                              │
│  ○ Compatible Anthropic                                      │
│    Points de terminaison compatibles Anthropic                │
│                                                              │
│  ○ Compatible Gemini                                         │
│    Points de terminaison compatibles Gemini                  │
│                                                              │
│ Entrée pour sélectionner, ↑↓ pour naviguer, Échap pour revenir │
└──────────────────────────────────────────────────────────────┘
```

Le protocole sélectionné détermine :

- La clé `modelProviders` à mettre à jour.
- La valeur `security.auth.selectedType` à conserver.
- Le libellé du protocole affiché sur les écrans suivants.
- Le type d'authentification `refreshAuth()` utilisé après l'enregistrement.

### Étape 2 : Saisir l'URL de base

`baseUrl` est l'équivalent de la sélection de région pour un fournisseur personnalisé. Elle doit être saisie avant la clé API car elle détermine le point de terminaison auquel appartient la clé.

Pour compatible OpenAI :

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · URL de base                          │
│                                                              │
│ Protocole : Compatible OpenAI                                │
│                                                              │
│ Saisissez le point de terminaison API compatible OpenAI.     │
│                                                              │
│ URL de base : https://openrouter.ai/api/v1_                  │
│                                                              │
│ Exemples :                                                   │
│   OpenAI :      https://api.openai.com/v1                    │
│   OpenRouter : https://openrouter.ai/api/v1                  │
│   Fireworks :  https://api.fireworks.ai/inference/v1         │
│   Ollama :     http://localhost:11434/v1                     │
│   LM Studio :  http://localhost:1234/v1                      │
│                                                              │
│ Entrée pour continuer, Échap pour revenir                    │
└──────────────────────────────────────────────────────────────┘
```

Pour compatible Anthropic :

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · URL de base                          │
│                                                              │
│ Protocole : Compatible Anthropic                             │
│                                                              │
│ Saisissez le point de terminaison API compatible Anthropic.  │
│                                                              │
│ URL de base : https://api.anthropic.com/v1_                  │
│                                                              │
│ Entrée pour continuer, Échap pour revenir                    │
└──────────────────────────────────────────────────────────────┘
```

Pour compatible Gemini :

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · URL de base                          │
│                                                              │
│ Protocole : Compatible Gemini                                │
│                                                              │
│ Saisissez le point de terminaison API compatible Gemini.     │
│                                                              │
│ URL de base : https://generativelanguage.googleapis.com_     │
│                                                              │
│ Entrée pour continuer, Échap pour revenir                    │
└──────────────────────────────────────────────────────────────┘
```
Validation :

- Requis.
- Doit commencer par `http://` ou `https://`.
- Supprimer les espaces de début et de fin.
- Conserver la chaîne normalisée telle que saisie, à l’exception de la suppression des espaces.

En cas de soumission valide :

- Générer la `envKey` gérée par Qwen à partir du protocole sélectionné et de `baseUrl`.
- Passer à la saisie de la clé API.

### Étape 3 : Saisir la clé API

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · Clé API                              │
│                                                              │
│ Protocole : Compatible OpenAI                                │
│ Point d’accès : https://openrouter.ai/api/v1                │
│                                                              │
│ Saisissez la clé API pour ce point d’accès.                 │
│                                                              │
│ Clé API : sk-or-v1-••••••••••••••••_                         │
│                                                              │
│ Entrée pour continuer, Échap pour revenir en arrière         │
└──────────────────────────────────────────────────────────────┘
```

Validation :

- Requis.
- Supprimer les espaces de début et de fin.

Remarques :

- La saisie peut initialement utiliser le comportement de champ de texte existant pour rester cohérente avec les flux voisins.
- L’écran de révision doit masquer la clé API.

### Étape 4 : Saisir les identifiants de modèles

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · Identifiants de modèles             │
│                                                              │
│ Protocole : Compatible OpenAI                                │
│ Point d’accès : https://openrouter.ai/api/v1                │
│                                                              │
│ Saisissez un ou plusieurs identifiants de modèles,          │
│ séparés par des virgules.                                    │
│                                                              │
│ Identifiants : qwen/qwen3-coder,openai/gpt-4.1_              │
│                                                              │
│ Entrée pour continuer, Échap pour revenir en arrière         │
└──────────────────────────────────────────────────────────────┘
```

Validation :

- Requis.
- Séparer par des virgules.
- Supprimer les espaces de début et de fin de chaque identifiant.
- Supprimer les entrées vides.
- Dédupliquer les entrées tout en conservant l’ordre.
- Au moins un identifiant de modèle doit subsister.

Nommage des modèles :

- `id` et `name` doivent être identiques.
- Aucun nom de fournisseur distinct n’est demandé à l’utilisateur.

Exemple :

```text
Saisie :
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalisé :
qwen/qwen3-coder, openai/gpt-4.1
```

### Étape 5 : Révision du JSON

Avant de sauvegarder, afficher l’extrait JSON généré qui sera écrit ou fusionné dans `settings.json`.

Exemple compatible OpenAI :

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · Révision                             │
│                                                              │
│ Le JSON suivant sera enregistré dans settings.json :         │
│                                                              │
│ {                                                            │
│   "env": {                                                   │
│     "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1":│
│       "sk-••••••••••••••••"                                  │
│   },                                                         │
│   "modelProviders": {                                        │
│     "openai": [                                              │
│       {                                                      │
│         "id": "qwen/qwen3-coder",                           │
│         "name": "qwen/qwen3-coder",                         │
│         "baseUrl": "https://openrouter.ai/api/v1",          │
│         "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"│
│       }                                                      │
│     ]                                                        │
│   },                                                         │
│   "security": {                                              │
│     "auth": {                                                │
│       "selectedType": "openai"                              │
│     }                                                        │
│   },                                                         │
│   "model": {                                                 │
│     "name": "qwen/qwen3-coder"                              │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Entrée pour sauvegarder, Échap pour revenir en arrière       │
└──────────────────────────────────────────────────────────────┘
```

Exemple compatible Anthropic :

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1": "sk-••••"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-sonnet-4-5",
        "name": "claude-sonnet-4-5",
        "baseUrl": "https://api.anthropic.com/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "anthropic"
    }
  },
  "model": {
    "name": "claude-sonnet-4-5"
  }
}
```
Le JSON affiché doit :

- Utiliser le protocole sélectionné comme clé `modelProviders`.
- Utiliser le protocole sélectionné comme `security.auth.selectedType`.
- Utiliser la `envKey` réellement générée.
- Masquer la clé API.
- Utiliser l'`baseUrl` saisie par l'utilisateur.
- Utiliser `id === name` pour chaque modèle.
- Afficher `model.name` défini sur le premier ID de modèle normalisé.

Si le JSON est trop large pour le terminal actuel, l'habillage est acceptable. L'objectif est la transparence, pas un formatage parfait pour le copier-coller.

### Étape 6 : Enregistrer et authentifier

Sur la touche Entrée depuis l'écran de révision :

```text
save:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...new custom configs using generatedEnvKey,
    ...existing configs whose envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

Message de succès :

```text
Custom API Key authenticated successfully. Settings updated with generated env key and model provider config.
Tip: Use /model to switch between configured models.
```

Le message d'échec doit conserver le modèle existant de message d'échec d'authentification, avec des indications supplémentaires pour l'utilisateur si possible :

```text
Failed to authenticate. Message: <error>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## Génération de la clé d'environnement

L'assistant ne doit pas demander aux utilisateurs de saisir une `envKey`.

Les clés API gérées par Qwen sont stockées dans `settings.json.env`, donc la clé d'environnement doit être générée automatiquement dans un espace de noms spécifique à Qwen. Cela évite les collisions avec les variables d'environnement shell gérées par l'utilisateur et empêche plusieurs points de terminaison personnalisés de se chevaucher.

### Format

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Inclure le protocole évite les collisions lorsque le même point de terminaison est utilisé sous différents adaptateurs de protocole.

### Exemples

```text
Protocol: openai
Base URL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocol: openai
Base URL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocol: anthropic
Base URL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocol: gemini
Base URL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocol: openai
Base URL: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### Règle de normalisation

```text
protocol
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _

baseUrl
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _
  -> collapse consecutive _ characters
  -> remove leading/trailing _

return QWEN_CUSTOM_API_KEY_${NORMALIZED_PROTOCOL}_${NORMALIZED_BASE_URL}
```

Pseudo-code :

```ts
function generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `QWEN_CUSTOM_API_KEY_${normalize(protocol)}_${normalize(baseUrl)}`;
}
```

## Conception de l'écriture des paramètres

Étant donné les entrées utilisateur :

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

L'assistant doit produire :

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": "sk-or-v1-xxx"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen/qwen3-coder",
        "name": "qwen/qwen3-coder",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      },
      {
        "id": "openai/gpt-4.1",
        "name": "openai/gpt-4.1",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen/qwen3-coder"
  }
}
```

Pour `anthropic`, la même structure est utilisée, sauf :

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

Pour `gemini`, la même structure est utilisée, sauf :

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### Portée de la persistance

Utilisez la même stratégie de portée de persistance que la sélection de modèle et les flux de clés API existants :

```text
getPersistScopeForModelSelection(settings)
```

Cela maintient la cohérence avec les règles de propriété `modelProviders` existantes.

### Sauvegarde

Avant d'écrire, sauvegardez le fichier de paramètres cible, comme dans les flux existants Coding Plan et ModelStudio Standard.

### Synchronisation process.env

Après avoir écrit `settings.json.env[generatedEnvKey]`, synchronisez immédiatement :

```text
process.env[generatedEnvKey] = apiKey
```

Cela garantit que `refreshAuth(selectedProtocol)` peut utiliser la clé nouvellement saisie dans la même session.
### Règle de fusion des fournisseurs de modèles

Pour la clé d'environnement générée :

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Mettez à jour `modelProviders[selectedProtocol]` comme suit :

```text
newConfigs = normalizedModelIds.map(modelId => ({
  id: modelId,
  name: modelId,
  baseUrl,
  envKey: generatedEnvKey,
}))

existingConfigs = settings.merged.modelProviders?.[selectedProtocol] ?? []

preservedConfigs = existingConfigs.filter(config =>
  config.envKey !== generatedEnvKey
)

updatedConfigs = [
  ...newConfigs,
  ...preservedConfigs,
]
```

Justification :

- Reconfigurer le même protocole + `baseUrl` remplace les anciens modèles pour ce point de terminaison.
- Configurer un protocole ou une `baseUrl` différent utilise une clé d'environnement différente et n'écrase pas les points de terminaison personnalisés précédents.
- Le plan de codage, ModelStudio Standard et les autres configurations utilisateur sont conservés sauf s'ils utilisent la même clé d'environnement générée sous le même protocole.
- Les nouvelles configurations sont placées en premier afin que les modèles nouvellement configurés soient immédiatement visibles et sélectionnés par défaut.

## Gestion des erreurs

### Erreur de validation du protocole

Le protocole doit être l'un des suivants :

```text
openai
anthropic
gemini
```

### Erreur de validation de l'URL de base

```text
L'URL de base ne peut pas être vide.
```

```text
L'URL de base doit commencer par http:// ou https://.
```

### Erreur de validation de la clé API

```text
La clé API ne peut pas être vide.
```

### Erreur de validation des IDs de modèles

```text
Les IDs de modèles ne peuvent pas être vides.
```

### Échec d'authentification

Utilisez le mécanisme d'échec existant lorsque cela est possible, mais le message destiné à l'utilisateur doit l'aider à se rétablir :

```text
Échec de l'authentification. Message : <message>

Veuillez vérifier :
- L'URL de base est compatible avec le protocole sélectionné
- La clé API est valide pour ce point de terminaison
- L'ID du modèle existe pour ce fournisseur
```

## Lien vers la documentation

L'assistant doit toujours exposer la documentation existante des fournisseurs de modèles pour les utilisateurs avancés.

Emplacement recommandé :

- Sur le pied de page de l'écran de révision, ou
- Sous forme de texte secondaire sur l'écran de l'URL de base.

Texte suggéré :

```text
Besoin de configuration avancée ou de capacités avancées ? Voir :
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## Notes d'implémentation

Niveaux de vue attendus pour `AuthDialog` :

```ts
type ViewLevel =
  | 'main'
  | 'region-select'
  | 'api-key-input'
  | 'api-key-type-select'
  | 'alibaba-standard-region-select'
  | 'alibaba-standard-api-key-input'
  | 'alibaba-standard-model-id-input'
  | 'custom-protocol-select'
  | 'custom-base-url-input'
  | 'custom-api-key-input'
  | 'custom-model-id-input'
  | 'custom-review-json';
```

Type de protocole personnalisé attendu :

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

Nouvel état attendu dans `AuthDialog` :

```ts
const [customProtocol, setCustomProtocol] = useState<CustomApiProtocol>(
  AuthType.USE_OPENAI,
);
const [customProtocolIndex, setCustomProtocolIndex] = useState<number>(0);
const [customBaseUrl, setCustomBaseUrl] = useState('');
const [customBaseUrlError, setCustomBaseUrlError] = useState<string | null>(
  null,
);
const [customApiKey, setCustomApiKey] = useState('');
const [customApiKeyError, setCustomApiKeyError] = useState<string | null>(null);
const [customModelIds, setCustomModelIds] = useState('');
const [customModelIdsError, setCustomModelIdsError] = useState<string | null>(
  null,
);
```

Nouvelle action UI attendue :

```ts
handleCustomApiKeySubmit: (
  protocol: CustomApiProtocol,
  baseUrl: string,
  apiKey: string,
  modelIdsInput: string,
) => Promise<void>;
```

Fonctions utilitaires attendues :

```ts
generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string
normalizeCustomModelIds(modelIdsInput: string): string[]
maskApiKey(apiKey: string): string
```

## Critères d'acceptation

### UX

- Sélectionner `/auth -> API Key -> Custom API Key` ouvre l'assistant personnalisé au lieu de la page de documentation uniquement.
- La première étape de l'assistant personnalisé demande le protocole.
- La deuxième étape demande l'URL de base et affiche le protocole sélectionné.
- La troisième étape demande la clé API et affiche le protocole et le point de terminaison sélectionnés.
- La quatrième étape demande les IDs de modèles et affiche le protocole et le point de terminaison sélectionnés.
- L'étape de révision affiche le JSON généré, y compris la clé API masquée, le protocole sélectionné et la clé d'environnement générée.
- Appuyer sur Entrée à l'étape de révision enregistre les paramètres et tente une authentification.
- Appuyer sur Échap permet de revenir en arrière d'une étape à la fois.

### Paramètres

- La clé API est écrite dans `settings.json.env[generatedEnvKey]`.
- `generatedEnvKey` est dérivé du protocole sélectionné et de `baseUrl` en utilisant l'espace de noms privé de Qwen.
- `modelProviders[selectedProtocol]` reçoit une entrée par ID de modèle normalisé.
- Chaque entrée de modèle personnalisé utilise `id === name`.
- `security.auth.selectedType` est défini sur le protocole sélectionné.
- `model.name` est défini sur le premier ID de modèle normalisé.
- Les entrées existantes sous `modelProviders[selectedProtocol]` avec une `envKey` différente sont conservées.
- Les entrées existantes sous `modelProviders[selectedProtocol]` avec la même `generatedEnvKey` sont remplacées.
- Les entrées sous d'autres clés de protocole `modelProviders` sont conservées.
### Authentification

- La clé d’environnement générée est synchronisée avec `process.env` avant l’actualisation de l’authentification.
- L’application recharge la configuration du fournisseur de modèle avant `refreshAuth(selectedProtocol)`.
- Une authentification réussie ferme la boîte de dialogue d’authentification et affiche un message de succès.
- Une authentification échouée maintient l’utilisateur dans le flux d’authentification et affiche une erreur exploitable.

### Tests

- Ajoutez ou mettez à jour les tests d’`AuthDialog` pour couvrir le chemin personnalisé de l’assistant.
- Ajoutez des tests pour la sélection du protocole.
- Ajoutez des tests pour la génération de la clé d’environnement à partir du protocole et de l’URL de base.
- Ajoutez des tests pour la normalisation et la déduplication des ID de modèle.
- Ajoutez des tests pour le comportement de fusion des paramètres :
  - la même clé d’environnement générée remplace les anciennes entrées personnalisées sous le même protocole ;
  - les différentes clés d’environnement sont conservées ;
  - les clés d’autres protocoles sont conservées ;
  - les entrées Coding Plan et ModelStudio Standard sont conservées.
- Ajoutez des tests pour l’aperçu JSON généré lorsque cela est pertinent.

## Questions ouvertes

1. La saisie de la clé API doit-elle être masquée pendant la frappe, ou seulement sur l’écran de révision ?
2. Les points d’accès locaux comme `http://localhost:11434/v1` doivent-ils autoriser des clés API vides ou fictives pour les serveurs qui n’exigent pas d’authentification ?
3. L’aperçu JSON généré doit-il montrer uniquement le correctif appliqué, ou la totalité de la sous-arborescence des paramètres pertinents après fusion ?
4. Vertex AI doit-il être inclus dans cet assistant de clé API personnalisé, ou rester en dehors car sa configuration d’authentification diffère des fournisseurs simples par clé API ?

Pour la première version, les valeurs par défaut recommandées sont les suivantes :

- Prendre en charge `openai`, `anthropic` et `gemini`.
- Utiliser le comportement de saisie existant pendant la frappe.
- Exiger une clé API non vide pour rester cohérent avec les flux d’authentification par clé API.
- Afficher le JSON de type correctif qui sera sauvegardé ou mis à jour.
- Laisser Vertex AI en dehors de l’assistant de clé API personnalisé jusqu’à une décision produit distincte.
