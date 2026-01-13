## Personnalisation de l'environnement sandbox (Docker/Podman)

### Actuellement, le projet ne prend pas en charge l'utilisation de la fonction BUILD_SANDBOX après l'installation via le package npm

1. Pour construire un sandbox personnalisé, vous devez accéder aux scripts de construction (scripts/build_sandbox.js) dans le dépôt de code source.
2. Ces scripts de construction ne sont pas inclus dans les packages publiés par npm.
3. Le code contient des vérifications de chemin codées en dur qui rejettent explicitement les demandes de construction provenant d'environnements autres que le code source.

Si vous avez besoin d'outils supplémentaires à l'intérieur du conteneur (par exemple, `git`, `python`, `rg`), créez un fichier Dockerfile personnalisé. La procédure spécifique est la suivante :

#### 1. Clonez d'abord le projet qwen code, https://github.com/QwenLM/qwen-code.git

#### 2. Assurez-vous d'effectuer l'opération suivante dans le répertoire du dépôt de code source

```bash

# 1. Installez d'abord les dépendances du projet
npm install

# 2. Construisez le projet Qwen Code
npm run build
```

# 3. Vérifier que le répertoire dist a été généré
ls -la packages/cli/dist/

# 4. Créer un lien global dans le répertoire du package CLI
cd packages/cli
npm link

# 5. Vérification du lien (il devrait maintenant pointer vers le code source)
which qwen

# Sortie attendue : /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen

# Ou des chemins similaires, mais il devrait s'agir d'un lien symbolique

# 6. Pour les détails du lien symbolique, vous pouvez voir le chemin spécifique du code source
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# Cela devrait montrer qu'il s'agit d'un lien symbolique pointant vers votre répertoire de code source

# 7. Tester la version de qwen
qwen -v

# npm link écrasera le qwen global. Pour éviter de ne pas pouvoir distinguer le même numéro de version, vous pouvez d'abord désinstaller le CLI global
```

#### 3. Créez votre fichier Dockerfile de sandbox dans le répertoire racine de votre projet

- Chemin : `.qwen/sandbox.Dockerfile`

- Adresse de l'image miroir officielle : https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# Basé sur l'image sandbox officielle de Qwen (il est recommandé de spécifier explicitement la version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# Ajoutez vos outils supplémentaires ici
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. Créez la première image de sandbox dans le répertoire racine de votre projet

```bash
GEMINI_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# Vérifiez si la version sandbox de l'outil que vous avez lancé correspond à la version de votre image personnalisée. Si elles correspondent, le démarrage sera réussi
```

Cela construit une image spécifique au projet basée sur l'image sandbox par défaut.

#### Supprimer le lien npm

- Si vous souhaitez restaurer le CLI officiel de qwen, veuillez supprimer le lien npm

```bash
```

# Méthode 1 : Désinstaller globalement
npm unlink -g @qwen-code/qwen-code

# Méthode 2 : Supprimer dans le répertoire packages/cli
cd packages/cli
npm unlink

# Vérification que la suppression a été effectuée
which qwen

# Devrait afficher "qwen not found"

# Réinstaller la version globale si nécessaire
npm install -g @qwen-code/qwen-code

# Vérification de la restauration
which qwen
qwen --version
```