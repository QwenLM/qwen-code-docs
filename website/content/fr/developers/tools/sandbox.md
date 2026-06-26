## Personnalisation de l'environnement sandbox (Docker/Podman)

### Actuellement, le projet ne prend pas en charge l'utilisation de la fonction BUILD_SANDBOX après l'installation via le paquet npm

1. Pour construire un sandbox personnalisé, vous devez accéder aux scripts de construction (scripts/build_sandbox.js) dans le dépôt du code source.
2. Ces scripts de construction ne sont pas inclus dans les paquets publiés par npm.
3. Le code contient des vérifications de chemins codés en dur qui rejettent explicitement les demandes de construction provenant d'environnements autres que le code source.

Si vous avez besoin d'outils supplémentaires dans le conteneur (par exemple, `git`, `python`, `rg`), créez un Dockerfile personnalisé. L'opération spécifique est la suivante

#### 1. Clonez d'abord le projet qwen code, https://github.com/QwenLM/qwen-code.git

#### 2. Assurez-vous d'effectuer les opérations suivantes dans le répertoire du dépôt du code source

```bash
# 1. First, install the dependencies of the project
npm install

# 2. Build the Qwen Code project
npm run build

# 3. Verify that the dist directory has been generated
ls -la packages/cli/dist/

# 4. Create a global link in the CLI package directory
cd packages/cli
npm link

# 5. Verification link (it should now point to the source code)
which qwen
# Expected output: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# Or similar paths, but it should be a symbolic link

# 6. For details of the symbolic link, you can see the specific source code path
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# It should show that this is a symbolic link pointing to your source code directory

# 7.Test the version of qwen
qwen -v
# npm link will overwrite the global qwen. To avoid being unable to distinguish the same version number, you can uninstall the global CLI first

```

#### 3. Créez votre Dockerfile sandbox dans le répertoire racine de votre propre projet

- Chemin : `.qwen/sandbox.Dockerfile`

- Adresse de l'image miroir officielle : https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# Based on the official Qwen sandbox image (It is recommended to explicitly specify the version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# Add your extra tools here
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. Créez la première image sandbox dans le répertoire racine de votre projet

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# Observe whether the sandbox version of the tool you launched is consistent with the version of your custom image. If they are consistent, the startup will be successful
```

Ceci construit une image spécifique au projet basée sur l'image sandbox par défaut.

#### Supprimer le lien npm

- Si vous souhaitez restaurer le CLI officiel de qwen, veuillez supprimer le lien npm

```bash
# Method 1: Unlink globally
npm unlink -g @qwen-code/qwen-code

# Method 2: Remove it in the packages/cli directory
cd packages/cli
npm unlink

# Verification has been lifted
which qwen
# It should display "qwen not found"

# Reinstall the global version if necessary
npm install -g @qwen-code/qwen-code

# Verification Recovery
which qwen
qwen --version
```