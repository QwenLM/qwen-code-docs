## Personnalisation de l’environnement sandbox (Docker/Podman)

### Actuellement, le projet ne prend pas en charge l’utilisation de la fonction `BUILD_SANDBOX` après l’installation via le package npm

1. Pour construire un environnement sandbox personnalisé, vous devez accéder aux scripts de construction (`scripts/build_sandbox.js`) dans le dépôt source.
2. Ces scripts de construction ne sont pas inclus dans les packages publiés sur npm.
3. Le code contient des vérifications de chemin codées en dur qui rejettent explicitement les demandes de construction provenant d’environnements autres que l’environnement source.

Si vous avez besoin d’outils supplémentaires à l’intérieur du conteneur (par exemple `git`, `python`, `rg`), créez un fichier Dockerfile personnalisé. L’opération spécifique est la suivante :

#### 1. Clonez d’abord le projet Qwen Code à l’adresse https://github.com/QwenLM/qwen-code.git

#### 2. Assurez-vous d’exécuter les opérations suivantes depuis le répertoire racine du dépôt source

```bash

# 1. Installez d’abord les dépendances du projet
npm install

# 2. Construisez le projet Qwen Code
npm run build

# 3. Vérifiez que le répertoire `dist` a bien été généré  
ls -la packages/cli/dist/

# 4. Créez un lien global depuis le répertoire du package CLI  
cd packages/cli  
npm link  

# 5. Vérifiez le lien (il doit désormais pointer vers le code source)  
which qwen  

# Résultat attendu : `/xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen`  

# Ou un chemin similaire, mais il doit s’agir d’un lien symbolique  

# 6. Pour plus de détails sur le lien symbolique, affichez le chemin exact du code source  
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code  

# Cela doit indiquer qu’il s’agit d’un lien symbolique pointant vers votre répertoire source  

# 7. Testez la version de `qwen`  
qwen -v  

# `npm link` écrasera la version globale de `qwen`. Pour éviter toute confusion avec un numéro de version identique, vous pouvez désinstaller au préalable la CLI globale

#### 3. Créez votre fichier Dockerfile pour le bac à sable dans le répertoire racine de votre projet

- Chemin : `.qwen/sandbox.Dockerfile`

- Adresse de l’image officielle sur le registre : https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# Basé sur l’image officielle du bac à sable Qwen (il est recommandé de spécifier explicitement la version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# Ajoutez ici vos outils supplémentaires
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. Créez la première image de bac à sable dans le répertoire racine de votre projet

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# Vérifiez si la version de l’outil lancé en mode bac à sable correspond bien à celle de votre image personnalisée. Si les versions concordent, le démarrage réussit.
```

Cette commande crée une image spécifique au projet, basée sur l’image par défaut du bac à sable.

#### Supprimer le lien npm

- Si vous souhaitez restaurer l’interface CLI officielle de `qwen`, supprimez le lien npm.  

```bash

# Méthode 1 : Désassocier globalement  
npm unlink -g @qwen-code/qwen-code  

# Méthode 2 : Supprimer l’association depuis le répertoire `packages/cli`  
cd packages/cli  
npm unlink  

# Vérification que la désassociation a bien eu lieu  
which qwen  

# Doit afficher « qwen introuvable »  

# Réinstaller la version globale si nécessaire  
npm install -g @qwen-code/qwen-code  

# Vérification de la restauration  
which qwen  
qwen --version