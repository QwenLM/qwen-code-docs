# Qwen Code CLI

Dans Qwen Code, `packages/cli` est l'interface utilisateur permettant d'envoyer et de recevoir des prompts avec Qwen et d'autres modèles IA ainsi que leurs outils associés. Pour une vue d'ensemble de Qwen Code

## Navigation dans cette section

- **[Authentification](./authentication.md) :** Guide pour configurer l'authentification avec Qwen OAuth et les fournisseurs compatibles OpenAI.
- **[Commandes](./commands.md) :** Référence des commandes du Qwen Code CLI (ex. : `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md) :** Guide pour personnaliser le comportement du Qwen Code CLI à l'aide de fichiers de configuration.
- **[Thèmes](./themes.md) :** Guide pour personnaliser l'apparence du CLI avec différents thèmes.
- **[Tutoriels](tutorials.md) :** Tutoriel montrant comment utiliser Qwen Code pour automatiser une tâche de développement.

## Mode non-interactif

Qwen Code peut être exécuté en mode non-interactif, ce qui est utile pour les scripts et l'automatisation. Dans ce mode, vous pouvez envoyer des données en entrée via un pipe vers le CLI, il exécute la commande, puis il se termine.

L'exemple suivant envoie une commande à Qwen Code depuis votre terminal :

```bash
echo "What is fine tuning?" | qwen
```

Vous pouvez également utiliser le flag `--prompt` ou `-p` :

```bash
qwen -p "What is fine tuning?"
```

Pour une documentation complète sur l'utilisation en mode headless, les scripts, l'automatisation et des exemples avancés, consultez le guide **[Headless Mode](../headless.md)**.