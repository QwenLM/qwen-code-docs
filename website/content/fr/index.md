# Bienvenue dans la documentation de Qwen Code

Qwen Code est un puissant outil AI en ligne de commande adapté de [**Gemini CLI**](https://github.com/google-gemini/gemini-cli) ([détails](./README.gemini.md)), spécifiquement optimisé pour les modèles [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder). Il améliore votre workflow de développement avec une compréhension avancée du code, des tâches automatisées et une assistance intelligente.

## 🚀 Pourquoi choisir Qwen Code ?

- 🎯 **Free Tier :** Jusqu'à 60 requêtes/min et 2 000 requêtes/jour avec votre compte [QwenChat](https://chat.qwen.ai/).
- 🧠 **Modèle avancé :** Spécialement optimisé pour [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder) afin d'offrir une compréhension et une assistance de code supérieures.
- 🏆 **Fonctionnalités complètes :** Inclut les sous-agents, le Plan Mode, TodoWrite, le support du modèle vision, ainsi qu'une compatibilité totale avec l'API OpenAI — le tout intégré de manière transparente.
- 🔧 **Outils intégrés & extensibles :** Opérations sur le système de fichiers, exécution de commandes shell, fetch/search web, et plus encore — tous facilement extensibles via le Model Context Protocol (MCP) pour des intégrations personnalisées.
- 💻 **Conçu pour les développeurs :** Pensé pour les workflows orientés terminal — parfait pour les amateurs de ligne de commande.
- 🛡️ **Open Source :** Sous licence Apache 2.0 pour une liberté et une transparence maximales.

## Installation

### Prérequis

Assurez-vous d'avoir [Node.js version 20](https://nodejs.org/en/download) ou supérieur installé.

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### Installation via npm

```bash
npm install -g @qwen-code/qwen-code@latest
qwen --version
```

### Installation depuis les sources

```bash
git clone https://github.com/QwenLM/qwen-code.git
cd qwen-code
npm install
npm install -g .
```

### Installation globale avec Homebrew (macOS/Linux)

```bash
brew install qwen-code
```

## Démarrage rapide

```bash

# Démarrer Qwen Code
qwen

# Exemples de commandes
> Explain this codebase structure
> Help me refactor this function
> Generate unit tests for this module
```

### Gestion des sessions

Contrôlez votre utilisation de tokens avec des limites de session configurables pour optimiser les coûts et les performances.

#### Configurer la limite de tokens par session

Créez ou modifiez le fichier `.qwen/settings.json` dans votre répertoire personnel :

```json
{
  "sessionTokenLimit": 32000
}
```

#### Commandes de session

- **`/compress`** - Compresse l'historique de la conversation pour continuer dans les limites de tokens
- **`/clear`** - Efface tout l'historique de la conversation et recommence à zéro
- **`/stats`** - Vérifie l'utilisation actuelle des tokens et les limites

> 📝 **Note** : La limite de tokens de session s'applique à une seule conversation, pas aux appels API cumulatifs.

### Configuration du modèle vision

Qwen Code inclut un système intelligent d'auto-switching du modèle vision qui détecte les images dans votre input et peut automatiquement basculer vers des modèles compatibles vision pour une analyse multimodale. **Cette fonctionnalité est activée par défaut** - lorsque vous incluez des images dans vos requêtes, vous verrez une boîte de dialogue vous demandant comment vous souhaitez gérer le switch du modèle vision.

#### Ignorer le dialogue de bascule (Optionnel)

Si vous ne souhaitez pas voir le dialogue interactif à chaque fois, configurez le comportement par défaut dans votre fichier `.qwen/settings.json` :

```json
{
  "experimental": {
    "vlmSwitchMode": "once"
  }
}
```

**Modes disponibles :**

- **`"once"`** - Basculer vers le modèle vision uniquement pour cette requête, puis revenir au modèle précédent
- **`"session"`** - Utiliser le modèle vision pour toute la session en cours
- **`"persist"`** - Conserver le modèle actuel (pas de bascule)
- **Non défini** - Afficher le dialogue interactif à chaque fois (comportement par défaut)

#### Forcer le mode depuis la ligne de commande

Vous pouvez également définir ce comportement via la ligne de commande :

```bash

# Basculer une seule fois par requête
qwen --vlm-switch-mode once

# Basculer pour toute la session
qwen --vlm-switch-mode session

# Ne jamais basculer automatiquement
qwen --vlm-switch-mode persist
```

#### Désactiver les modèles de vision (Optionnel)

Pour désactiver complètement le support des modèles de vision, ajoutez dans votre `.qwen/settings.json` :

```json
{
  "experimental": {
    "visionModelPreview": false
  }
}
```

> 💡 **Astuce** : En mode YOLO (`--yolo`), le basculement vers la vision se fait automatiquement sans invite lorsque des images sont détectées.

### Authentification

Choisissez votre méthode d'authentification préférée selon vos besoins :

#### 1. Qwen OAuth (🚀 Recommandé - Commencez en 30 secondes)

La façon la plus simple de démarrer - totalement gratuit avec des quotas généreux :

```bash

```markdown
# Exécutez simplement cette commande et suivez l'authentification dans le navigateur
qwen

**Ce qui se passe :**

1. **Configuration instantanée** : Le CLI ouvre automatiquement votre navigateur
2. **Connexion en un clic** : Authentifiez-vous avec votre compte qwen.ai
3. **Gestion automatique** : Les identifiants sont mis en cache localement pour une utilisation future
4. **Aucune configuration** : Aucune installation requise - commencez à coder tout de suite !

**Avantages du plan gratuit :**

- ✅ **2 000 requêtes/jour** (pas besoin de compter les tokens)
- ✅ Limite de **60 requêtes/minute**
- ✅ **Actualisation automatique des identifiants**
- ✅ **Gratuit** pour les utilisateurs individuels
- ℹ️ **Remarque** : Un fallback de modèle peut survenir afin de maintenir la qualité du service
```

#### 2. API Compatible avec OpenAI

Utilise des clés API pour OpenAI ou d'autres fournisseurs compatibles :

**Méthodes de Configuration :**

1. **Variables d'Environnement**

   ```bash
   export OPENAI_API_KEY="your_api_key_here"
   export OPENAI_BASE_URL="your_api_endpoint"
   export OPENAI_MODEL="your_model_choice"
   ```

2. **Fichier `.env` du Projet**
   Crée un fichier `.env` à la racine de ton projet :
   ```env
   OPENAI_API_KEY=your_api_key_here
   OPENAI_BASE_URL=your_api_endpoint
   OPENAI_MODEL=your_model_choice
   ```

**Options de Fournisseurs API**

> ⚠️ **Note Régionale :**
>
> - **Chine continentale** : Utilise Alibaba Cloud Bailian ou ModelScope
> - **International** : Utilise Alibaba Cloud ModelStudio ou OpenRouter

<details>
<summary><b>🇨🇳 Pour les Utilisateurs en Chine Continentale</b></summary>

**Option 1 : Alibaba Cloud Bailian** ([Demander une Clé API](https://bailian.console.aliyun.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Option 2 : ModelScope (Offre Gratuite)** ([Demander une Clé API](https://modelscope.cn/docs/model-service/API-Inference/intro))

- ✅ **2 000 appels API gratuits par jour**
- ⚠️ Associe ton compte Aliyun pour éviter les erreurs d'authentification

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
```

</details>

<details>
<summary><b>🌍 Pour les Utilisateurs Internationaux</b></summary>

**Option 1 : Alibaba Cloud ModelStudio** ([Demander une Clé API](https://modelstudio.console.alibabacloud.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Option 2 : OpenRouter (Offre Gratuite Disponible)** ([Demander une Clé API](https://openrouter.ai/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL="qwen/qwen3-coder:free"
```

</details>

## Exemples d'utilisation

### 🔍 Explorer les bases de code

```bash
cd your-project/
qwen

# Analyse d'architecture
> Décris les principaux composants de l'architecture de ce système
> Quelles sont les dépendances clés et comment interagissent-elles ?
> Trouve tous les endpoints API et leurs méthodes d'authentification
```

### 💻 Développement de code

```bash

# Refactoring
> Refactorise cette fonction pour améliorer sa lisibilité et ses performances
> Convertis cette classe pour utiliser l'injection de dépendances
> Découpe ce gros module en composants plus petits et spécialisés

# Génération de code
> Crée un endpoint REST API pour la gestion des utilisateurs
> Génère des tests unitaires pour le module d'authentification
> Ajoute la gestion d'erreurs à toutes les opérations de base de données
```

### 🔄 Automatiser les workflows

```bash

# Automatisation Git
> Analyse les commits git des 7 derniers jours, regroupés par fonctionnalité
> Crée un changelog à partir des commits récents
> Trouve tous les commentaires TODO et crée des issues GitHub

# Opérations sur les fichiers
> Convertir toutes les images de ce répertoire au format PNG
> Renommer tous les fichiers de test pour suivre le pattern *.test.ts
> Rechercher et supprimer toutes les instructions console.log

### 🐛 Debugging & Analyse

```bash
# Analyse de performance
> Identifier les goulots d'étranglement dans ce composant React
> Trouver tous les problèmes de requêtes N+1 dans la base de code

# Audit de sécurité
> Vérifier les vulnérabilités potentielles d'injection SQL
> Trouver toutes les credentials ou API keys hardcodées
```

## Tâches populaires

### 📚 Comprendre de nouvelles bases de code

```text
> Quels sont les composants principaux de la logique métier ?
> Quels mécanismes de sécurité sont en place ?
> Comment les données circulent-elles dans le système ?
> Quels sont les principaux design patterns utilisés ?
> Générer un graphe de dépendances pour ce module
```

### 🔨 Refactoring et Optimisation du Code

```text
> Quelles parties de ce module peuvent être optimisées ?
> Aide-moi à refactorer cette classe pour suivre les principes SOLID
> Ajoute une gestion d'erreurs et une journalisation appropriées
> Convertis les callbacks en pattern async/await
> Implémente du caching pour les opérations coûteuses
```

### 📝 Documentation et Tests

```text
> Génère des commentaires JSDoc complets pour toutes les APIs publiques
> Écris des tests unitaires avec des cas limites pour ce composant
> Crée une documentation API au format OpenAPI
> Ajoute des commentaires inline expliquant les algorithmes complexes
> Génère un README pour ce module
```

### 🚀 Accélération du Développement

```text
> Configure un nouveau serveur Express avec authentification
> Crée un composant React avec TypeScript et des tests
> Implémente un middleware de rate limiting
> Ajoute des migrations de base de données pour le nouveau schéma
> Configure un pipeline CI/CD pour ce projet
```

## Commandes et Raccourcis

### Commandes de Session

- `/help` - Affiche les commandes disponibles
- `/clear` - Efface l'historique des conversations
- `/compress` - Compresse l'historique pour économiser des tokens
- `/stats` - Affiche les informations de la session actuelle
- `/exit` ou `/quit` - Quitte Qwen Code

### Raccourcis Clavier

- `Ctrl+C` - Annule l'opération en cours
- `Ctrl+D` - Quitte (sur une ligne vide)
- `Haut/Bas` - Navigue dans l'historique des commandes