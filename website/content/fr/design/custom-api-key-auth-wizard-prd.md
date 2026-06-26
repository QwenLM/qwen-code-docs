# PRD de l'assistant de configuration de clé API personnalisée

## Résumé

Améliorer l'expérience `/auth -> Clé API -> Clé API personnalisée` en remplaçant l'écran actuel, qui n'affiche que de la documentation, par un assistant de configuration en terminal pour les fournisseurs d'API personnalisés.

Qwen Code prend en charge plusieurs protocoles d'API via les clés `authType` / `modelProviders`, notamment `openai`, `anthropic` et `gemini`. Par conséquent, l'assistant de configuration personnalisée doit commencer par demander à l'utilisateur de sélectionner le protocole, puis collecter les informations de point de terminaison, de clé et de modèle pour ce protocole.

L'assistant guide l'utilisateur à travers les étapes suivantes :

```text
Sélection du protocole -> Saisie de l'URL de base -> Saisie de la clé API -> Saisie des ID de modèle -> Révision du JSON -> Enregistrement + authentification
```

Cela permet de garder la configuration de la clé API personnalisée dans Qwen Code, de réduire le besoin de modifier manuellement `settings.json`, et de rendre la configuration finale transparente en affichant le JSON généré avant l'enregistrement.

## Contexte

Actuellement, la sélection de `Clé API personnalisée` dans `/auth` affiche un écran d'information statique :

```text
Configuration personnalisée

Vous pouvez configurer votre clé API et vos modèles dans settings.json

Reportez-vous à la documentation pour les instructions de configuration
https://qwenlm.github.io/qwen-code-docs/fr/users/configuration/model-providers/

Esc pour revenir en arrière
```

Cela oblige les utilisateurs à quitter le CLI, à lire la documentation, à comprendre `settings.json`, à configurer manuellement `modelProviders`, à choisir une `envKey`, à ajouter des clés API, puis à revenir à Qwen Code. Les utilisateurs ont signalé que ce flux est difficile et déconnecté du reste de l'expérience `/auth`.

Le chemin actuel de la clé API standard ModelStudio fournit déjà un flux de configuration guidé :

```text
Clé API standard Alibaba Cloud ModelStudio
└─ Sélectionner la région
   └─ Saisir la clé API
      └─ Saisir les ID de modèle
         └─ Enregistrer + authentifier
```

La configuration de la clé API personnalisée devrait offrir une expérience guidée similaire, tout en respectant le fait que Qwen Code prend en charge plusieurs protocoles de fournisseurs.

## Énoncé du problème

Le chemin de la clé API personnalisée est actuellement un cul-de-sac dans `/auth` :

```text
/auth
└─ Sélectionner la méthode d'authentification
   ├─ Plan de codage Alibaba Cloud
   ├─ Clé API
   │  └─ Sélectionner le type de clé API
   │     ├─ Clé API standard Alibaba Cloud ModelStudio
   │     │  ├─ Sélectionner la région
   │     │  ├─ Saisir la clé API
   │     │  ├─ Saisir les ID de modèle
   │     │  └─ Enregistrer + authentifier
   │     │
   │     └─ Clé API personnalisée
   │        └─ Écran d'information uniquement
   │
   └─ Qwen OAuth
```

Cela entraîne plusieurs problèmes d'utilisabilité :

- Les utilisateurs ne peuvent pas terminer la configuration d'un fournisseur personnalisé depuis `/auth`.
- Les utilisateurs doivent comprendre les concepts de configuration de bas niveau avant de pouvoir s'authentifier.
- Les utilisateurs peuvent ne pas savoir quels champs sont obligatoires : `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name` et `security.auth.selectedType`.
- Les utilisateurs peuvent accidentellement entrer en conflit avec des variables d'environnement existantes ou écraser une configuration de fournisseur existante.
- Les utilisateurs ne reçoivent pas de retour d'authentification immédiat après avoir modifié manuellement les paramètres.

## Objectifs

1. Permettre aux utilisateurs de configurer un fournisseur d'API personnalisé entièrement depuis `/auth`.
2. Prendre en charge les principaux protocoles que Qwen Code supporte dans `modelProviders` : `openai`, `anthropic` et `gemini`.
3. Garder le flux proche du flux standard ModelStudio existant.
4. Traiter `baseUrl` comme l'équivalent de `region` pour un fournisseur personnalisé.
5. Générer automatiquement une `envKey` privée gérée par Qwen à partir du protocole sélectionné et de la `baseUrl` saisie.
6. Stocker la clé API dans `settings.json.env`, conformément au modèle actuel des informations d'identification gérées par Qwen.
7. Éviter les conflits avec les variables d'environnement shell de l'utilisateur en utilisant un nom de clé généré spécifique à Qwen.
8. Afficher le JSON généré avant l'enregistrement afin que les utilisateurs puissent examiner les modifications exactes des paramètres.
9. Préserver les entrées `modelProviders` existantes non liées.
10. Authentifier immédiatement après l'enregistrement et afficher un retour de réussite ou d'échec.

## Non-objectifs

1. Ne pas obliger les utilisateurs à saisir manuellement `envKey`.
2. Ne pas introduire le nom du fournisseur en tant que concept distinct.
3. Ne pas ajouter de `generationConfig`, `capabilities` ou de surcharges par modèle avancés à l'assistant.
4. Ne pas supprimer complètement le lien vers la documentation ; il doit rester disponible pour une configuration avancée.
5. Ne pas modifier les flux existants du Plan de codage ou de la clé API standard ModelStudio.
6. Ne pas tenter de détecter automatiquement le protocole à partir de `baseUrl` dans la première version ; les utilisateurs sélectionnent explicitement le protocole.

## Utilisateurs cibles

- Utilisateurs qui apportent leur propre point de terminaison d'API personnalisé.
- Utilisateurs configurant des fournisseurs tels que des API compatibles OpenAI, des API compatibles Anthropic, des API compatibles Gemini, vLLM, Ollama, LM Studio ou des passerelles internes.
- Utilisateurs qui préfèrent configurer l'authentification depuis le CLI plutôt que de modifier manuellement `settings.json`.

## Protocoles pris en charge

L'assistant doit initialement exposer ces options de protocole :

```text
openai
anthropic
gemini
```

Chaque protocole correspond directement à une clé `modelProviders` et à une valeur `security.auth.selectedType`.

| Option de protocole        | Clé authType / modelProviders | Remarques                                                                     |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| Compatible OpenAI          | `openai`                      | OpenAI, OpenRouter, Fireworks, serveurs locaux compatibles OpenAI, passerelles internes |
| Compatible Anthropic       | `anthropic`                   | Points de terminaison compatibles Anthropic                                   |
| Compatible Gemini          | `gemini`                      | Points de terminaison compatibles Gemini                                      |

## Aperçu de l'expérience utilisateur

### Arborescence `/auth` mise à jour

```text
/auth
└─ Sélectionner la méthode d'authentification
   ├─ Plan de codage Alibaba Cloud
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
   │        ├─ Réviser le JSON généré
   │        └─ Enregistrer + authentifier
   │
   └─ Qwen OAuth
```

### Machine à états de la clé API personnalisée

```text
sélection-type-clé-api
  │
  └─ CLÉ_API_PERSONNALISÉE
      │
      ▼
sélection-protocole-personnalisé
      │ Saisie
      ▼
saisie-url-base-personnalisée
      │ Saisie
      │ générer envKey à partir du protocole + baseUrl
      ▼
saisie-clé-api-personnalisée
      │ Saisie
      ▼
saisie-id-modèle-personnalisé
      │ Saisie
      ▼
révision-json-personnalisée
      │ Saisie
      ▼
enregistrer paramètres + refreshAuth(protocoleSélectionné)
```

### Comportement avec la touche Échap

```text
révision-json-personnalisée
  Esc -> saisie-id-modèle-personnalisé

saisie-id-modèle-personnalisé
  Esc -> saisie-clé-api-personnalisée

saisie-clé-api-personnalisée
  Esc -> saisie-url-base-personnalisée

saisie-url-base-personnalisée
  Esc -> sélection-protocole-personnalisé

sélection-protocole-personnalisé
  Esc -> sélection-type-clé-api
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
│    Points de terminaison compatibles Anthropic               │
│                                                              │
│  ○ Compatible Gemini                                         │
│    Points de terminaison compatibles Gemini                  │
│                                                              │
│ Entrée pour sélectionner, ↑↓ pour naviguer, Esc pour revenir │
└──────────────────────────────────────────────────────────────┘
```

Le protocole sélectionné détermine :

- La clé `modelProviders` à mettre à jour.
- La valeur `security.auth.selectedType` à conserver.
- Le libellé du protocole affiché sur les écrans suivants.
- Le type d'authentification `refreshAuth()` utilisé après l'enregistrement.

### Étape 2 : Saisir l'URL de base

`baseUrl` est l'équivalent de la sélection de région pour un fournisseur personnalisé. Elle doit venir avant la saisie de la clé API car elle détermine le point de terminaison auquel la clé API appartient.

Pour un protocole compatible OpenAI :

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · URL de base                          │
│                                                              │
│ Protocole : Compatible OpenAI                                │
│                                                              │
│ Saisissez le point de terminaison d'API compatible OpenAI.    │
│                                                              │
│ URL de base : https://openrouter.ai/api/v1_                  │
│                                                              │
│ Exemples :                                                    │
│   OpenAI :     https://api.openai.com/v1                     │
│   OpenRouter : https://openrouter.ai/api/v1                  │
│   Fireworks : https://api.fireworks.ai/inference/v1          │
│   Ollama :    http://localhost:11434/v1                      │
│   LM Studio : http://localhost:1234/v1                       │
│                                                              │
│ Entrée pour continuer, Esc pour revenir                      │
└──────────────────────────────────────────────────────────────┘
```

Pour un protocole compatible Anthropic :

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · URL de base                          │
│                                                              │
│ Protocole : Compatible Anthropic                             │
│                                                              │
│ Saisissez le point de terminaison d'API compatible Anthropic.│
│                                                              │
│ URL de base : https://api.anthropic.com/v1_                  │
│                                                              │
│ Entrée pour continuer, Esc pour revenir                      │
└──────────────────────────────────────────────────────────────┘
```

Pour un protocole compatible Gemini :

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · URL de base                          │
│                                                              │
│ Protocole : Compatible Gemini                                │
│                                                              │
│ Saisissez le point de terminaison d'API compatible Gemini.   │
│                                                              │
│ URL de base : https://generativelanguage.googleapis.com_     │
│                                                              │
│ Entrée pour continuer, Esc pour revenir                      │
└──────────────────────────────────────────────────────────────┘
```

Validation :

- Obligatoire.
- Doit commencer par `http://` ou `https://`.
- Supprimer les espaces blancs de début et de fin.
- Conserver la chaîne normalisée telle que saisie, à l'exception de la suppression des espaces.

Lors de la soumission valide :

- Générer la `envKey` gérée par Qwen à partir du protocole sélectionné et de `baseUrl`.
- Passer à la saisie de la clé API.

### Étape 3 : Saisir la clé API

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · Clé API                              │
│                                                              │
│ Protocole : Compatible OpenAI                                │
│ Point de terminaison : https://openrouter.ai/api/v1          │
│                                                              │
│ Saisissez la clé API pour ce point de terminaison.           │
│                                                              │
│ Clé API : sk-or-v1-••••••••••••••••_                        │
│                                                              │
│ Entrée pour continuer, Esc pour revenir                      │
└──────────────────────────────────────────────────────────────┘
```

Validation :

- Obligatoire.
- Supprimer les espaces blancs de début et de fin.

Remarques :

- La saisie peut initialement utiliser le comportement de saisie de texte existant pour rester cohérente avec les flux voisins.
- L'écran de révision doit masquer la clé API.

### Étape 4 : Saisir les ID de modèle

```text
┌──────────────────────────────────────────────────────────────┐
│ Clé API personnalisée · ID de modèle                         │
│                                                              │
│ Protocole : Compatible OpenAI                                │
│ Point de terminaison : https://openrouter.ai/api/v1          │
│                                                              │
│ Saisissez un ou plusieurs ID de modèle, séparés par des      │
│ virgules.                                                     │
│                                                              │
│ ID de modèle : qwen/qwen3-coder,openai/gpt-4.1_             │
│                                                              │
│ Entrée pour continuer, Esc pour revenir                      │
└──────────────────────────────────────────────────────────────┘
```

Validation :

- Obligatoire.
- Diviser par virgule.
- Supprimer les espaces blancs de chaque ID de modèle.
- Supprimer les entrées vides.
- Dédupliquer les entrées tout en préservant l'ordre.
- Au moins un ID de modèle doit rester.

Nommage des modèles :

- `id` et `name` doivent être identiques.
- Aucun nom de fournisseur distinct n'est demandé à l'utilisateur.

Exemple :

```text
Saisie :
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalisé :
qwen/qwen3-coder, openai/gpt-4.1
```

### Étape 5 : Réviser le JSON

Avant d'enregistrer, afficher l'extrait JSON généré qui sera écrit ou fusionné dans `settings.json`.

Exemple pour un protocole compatible OpenAI :

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
│ Entrée pour enregistrer, Esc pour revenir                    │
└──────────────────────────────────────────────────────────────┘
```

Exemple pour un protocole compatible Anthropic :

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

Le JSON affiché doit :

- Utiliser le protocole sélectionné comme clé `modelProviders`.
- Utiliser le protocole sélectionné comme `security.auth.selectedType`.
- Utiliser la `envKey` réellement générée.
- Masquer la clé API.
- Utiliser la `baseUrl` saisie par l'utilisateur.
- Utiliser `id === name` pour chaque modèle.
- Afficher `model.name` défini sur le premier ID de modèle normalisé.

Si le JSON est trop large pour le terminal actuel, un retour à la ligne est acceptable. L'objectif est la transparence, pas un formatage parfaitement copiable.

### Étape 6 : Enregistrer et authentifier

Lors de la pression sur Entrée depuis l'écran de révision :

```text
enregistrer :
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...nouvelles configs personnalisées utilisant generatedEnvKey,
    ...configs existantes dont envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

Message de succès :

```text
Clé API personnalisée authentifiée avec succès. Paramètres mis à jour avec la clé d'environnement générée et la configuration du fournisseur de modèles.
Astuce : Utilisez /model pour basculer entre les modèles configurés.
```

Le message d'échec doit conserver le modèle d'échec d'authentification existant, avec des astuces supplémentaires destinées à l'utilisateur si possible :

```text
Échec de l'authentification. Message : <error>

Veuillez vérifier :
- L'URL de base est compatible avec le protocole sélectionné
- La clé API est valide pour ce point de terminaison
- L'ID de modèle existe pour ce fournisseur
```

## Génération de la clé d'environnement

L'assistant ne doit pas demander aux utilisateurs de saisir une `envKey`.

Les clés API gérées par Qwen sont stockées dans `settings.json.env`, donc la clé d'environnement doit être générée automatiquement sous un espace de noms spécifique à Qwen. Cela évite les collisions avec les variables d'environnement shell gérées par l'utilisateur et empêche plusieurs points de terminaison personnalisés de s'écraser mutuellement.

### Format

```text
QWEN_CUSTOM_API_KEY_${PROTOCOLE}_${URL_BASE_NORMALISÉE}
```

Inclure le protocole évite les collisions lorsque le même point de terminaison est utilisé avec différents adaptateurs de protocole.

### Exemples

```text
Protocole : openai
URL de base : https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocole : openai
URL de base : https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocole : anthropic
URL de base : https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocole : gemini
URL de base : https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocole : openai
URL de base : http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### Règle de normalisation

```text
protocole
  -> supprimer les espaces
  -> mettre en majuscules
  -> remplacer tout caractère non A-Z / 0-9 par _

urlBase
  -> supprimer les espaces
  -> mettre en majuscules
  -> remplacer tout caractère non A-Z / 0-9 par _
  -> réduire les caractères _ consécutifs
  -> supprimer les _ de début et de fin

retourner QWEN_CUSTOM_API_KEY_${PROTOCOLE_NORMALISÉ}_${URL_BASE_NORMALISÉE}
```

Pseudo-code :

```ts
function generateCustomApiKeyEnvKey(protocole: string, urlBase: string): string {
  const normaliser = (valeur: string) =>
    valeur
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `QWEN_CUSTOM_API_KEY_${normaliser(protocole)}_${normaliser(urlBase)}`;
}
```
## Conception de l'écriture des paramètres

Étant donné une entrée utilisateur :

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

### Portée de persistance

Utiliser la même stratégie de portée de persistance que la sélection de modèle et les flux existants de clés API :

```text
getPersistScopeForModelSelection(settings)
```

Cela maintient la cohérence avec les règles de propriété existantes de `modelProviders`.

### Sauvegarde

Avant d'écrire, sauvegarder le fichier de paramètres cible, conformément aux flux existants du Plan de codage et du Standard ModelStudio.

### Synchronisation des variables d'environnement de processus

Après avoir écrit `settings.json.env[generatedEnvKey]`, synchroniser immédiatement :

```text
process.env[generatedEnvKey] = apiKey
```

Cela garantit que `refreshAuth(selectedProtocol)` peut utiliser la clé nouvellement saisie dans la même session.

### Règle de fusion des fournisseurs de modèles

Pour la clé d'environnement générée :

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Mettre à jour `modelProviders[selectedProtocol]` comme suit :

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
- Configurer un protocole ou une `baseUrl` différente utilise une clé d'environnement différente et n'écrase pas les points de terminaison personnalisés précédents.
- Le Plan de codage, le Standard ModelStudio et les autres configurations utilisateur sont conservés, sauf s'ils utilisent la même clé d'environnement générée sous le même protocole.
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

### Erreur de validation des ID de modèle

```text
Les ID de modèle ne peuvent pas être vides.
```

### Échec d'authentification

Utiliser le mécanisme d'échec existant lorsque c'est possible, mais le message destiné à l'utilisateur doit l'aider à se rétablir :

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

- Dans le pied de page de l'écran de révision, ou
- Sous forme de texte secondaire sur l'écran de l'URL de base.

Texte suggéré :

```text
Besoin de paramètres avancés generationConfig ou de capacités ? Voir :
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## Notes d'implémentation

Niveaux de vue attendus dans `AuthDialog` :

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
- La quatrième étape demande les ID de modèle et affiche le protocole et le point de terminaison sélectionnés.
- L'étape de révision affiche le JSON généré, y compris la clé API masquée, le protocole sélectionné et la clé d'environnement générée.
- Appuyer sur Entrée à l'étape de révision enregistre les paramètres et tente l'authentification.
- Appuyer sur Échap permet de revenir en arrière d'une étape à la fois.

### Paramètres

- La clé API est écrite dans `settings.json.env[generatedEnvKey]`.
- `generatedEnvKey` est dérivé du protocole sélectionné et de `baseUrl` en utilisant l'espace de noms privé Qwen.
- `modelProviders[selectedProtocol]` reçoit une entrée par ID de modèle normalisé.
- Chaque entrée de modèle personnalisé utilise `id === name`.
- `security.auth.selectedType` est défini sur le protocole sélectionné.
- `model.name` est défini sur le premier ID de modèle normalisé.
- Les entrées existantes sous `modelProviders[selectedProtocol]` avec une `envKey` différente sont conservées.
- Les entrées existantes sous `modelProviders[selectedProtocol]` avec la même `generatedEnvKey` sont remplacées.
- Les entrées sous d'autres clés de protocole `modelProviders` sont conservées.

### Authentification

- La clé d'environnement générée est synchronisée avec `process.env` avant le rafraîchissement de l'authentification.
- L'application recharge la configuration du fournisseur de modèle avant `refreshAuth(selectedProtocol)`.
- Une authentification réussie ferme la boîte de dialogue d'authentification et affiche un message de succès.
- Une authentification échouée maintient l'utilisateur dans le flux d'authentification et affiche une erreur exploitable.

### Tests

- Ajouter ou mettre à jour les tests `AuthDialog` pour couvrir le chemin de l'assistant personnalisé.
- Ajouter des tests pour la sélection du protocole.
- Ajouter des tests pour la génération de la clé d'environnement à partir du protocole et de l'URL de base.
- Ajouter des tests pour la normalisation et la déduplication des ID de modèle.
- Ajouter des tests pour le comportement de fusion des paramètres :
  - la même clé d'environnement générée remplace les anciennes entrées personnalisées sous le même protocole ;
  - les clés d'environnement différentes sont conservées ;
  - les autres clés de protocole sont conservées ;
  - les entrées du Plan de codage et du Standard ModelStudio sont conservées.
- Ajouter des tests pour le contenu de l'aperçu JSON généré lorsque c'est pratique.

## Questions ouvertes

1. La clé API doit-elle être masquée pendant la saisie, ou uniquement sur l'écran de révision ?
2. Les points de terminaison locaux tels que `http://localhost:11434/v1` doivent-ils autoriser une clé API vide ou un espace réservé pour les serveurs qui ne nécessitent pas d'authentification ?
3. L'aperçu JSON généré doit-il montrer uniquement le patch appliqué, ou la totalité de la sous-arborescence des paramètres pertinents après fusion ?
4. Vertex AI doit-il être inclus dans cet assistant de clé API personnalisée, ou rester en dehors car sa configuration d'authentification diffère des fournisseurs simples avec clé API ?

Pour la première version, les valeurs par défaut recommandées sont :

- Prendre en charge `openai`, `anthropic` et `gemini`.
- Utiliser le comportement de saisie existant pendant la frappe.
- Exiger une clé API non vide pour la cohérence avec les flux d'authentification par clé API.
- Afficher le JSON de type patch qui sera sauvegardé ou mis à jour.
- Laisser Vertex AI en dehors de l'assistant de clé API personnalisée jusqu'à une décision produit distincte.