# Qwen Code CLI

Dans Qwen Code, `packages/cli` est l'interface frontend permettant aux utilisateurs d'envoyer et de recevoir des prompts avec Qwen et d'autres modèles IA ainsi que leurs outils associés. Pour une vue d'ensemble de Qwen Code, consultez la [page de documentation principale](../index.md).

## Navigation dans cette section

- **[Authentication](./authentication.md) :** Guide de configuration de l'authentification avec Qwen OAuth et les providers compatibles OpenAI.
- **[Commands](./commands.md) :** Référence des commandes du Qwen Code CLI (ex. : `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md) :** Guide pour personnaliser le comportement du Qwen Code CLI via des fichiers de configuration.
- **[Token Caching](./token-caching.md) :** Optimisez les coûts API grâce à la mise en cache des tokens.
- **[Themes](./themes.md) :** Guide pour personnaliser l'apparence du CLI avec différents thèmes.
- **[Tutorials](tutorials.md) :** Tutoriel montrant comment utiliser Qwen Code pour automatiser une tâche de développement.
- **[Welcome Back](./welcome-back.md) :** Découvrez la fonctionnalité Welcome Back qui vous permet de reprendre votre travail facilement d'une session à l'autre.

## Mode non-interactif

Qwen Code peut être exécuté en mode non-interactif, ce qui est utile pour les scripts et l'automatisation. Dans ce mode, vous pouvez envoyer (pipe) des entrées à la CLI, elle exécute la commande, puis se termine.

L'exemple suivant envoie une commande à Qwen Code depuis votre terminal :

```bash
echo "What is fine tuning?" | qwen
```

Qwen Code exécute la commande et affiche la sortie dans votre terminal. Notez que vous pouvez obtenir le même comportement en utilisant le flag `--prompt` ou `-p`. Par exemple :

```bash
qwen -p "What is fine tuning?"
```