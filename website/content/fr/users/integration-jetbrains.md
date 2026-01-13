# IDE JetBrains

> Les IDE JetBrains fournissent une prise en charge native des assistants de codage IA via le protocole Agent Control Protocol (ACP). Cette intégration vous permet d'utiliser Qwen Code directement au sein de votre IDE JetBrains avec des suggestions de code en temps réel.

### Fonctionnalités

- **Expérience native de l'agent** : Panneau d'assistant IA intégré dans votre IDE JetBrains
- **Agent Control Protocol** : Prise en charge complète de l'ACP permettant des interactions avancées avec l'IDE
- **Gestion des symboles** : Mentionnez les fichiers avec # pour les ajouter au contexte de la conversation
- **Historique des conversations** : Accès aux conversations précédentes depuis l'IDE

### Prérequis

- IDE JetBrains avec prise en charge d'ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- Qwen Code CLI installé

### Installation

1. Installez l'interface de ligne de commande Qwen Code :

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Ouvrez votre IDE JetBrains et accédez à la fenêtre d'outil AI Chat.

3. Cliquez sur le menu à trois points dans le coin supérieur droit et sélectionnez **Configurer l'agent ACP**, puis configurez Qwen Code avec les paramètres suivants :

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/chemin/vers/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. L'agent Qwen Code devrait maintenant être disponible dans le panneau AI Assistant

![Qwen Code dans AI Chat de JetBrains](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Dépannage

### L'agent n'apparaît pas

- Exécutez `qwen --version` dans le terminal pour vérifier l'installation
- Assurez-vous que votre version de l'IDE JetBrains prend en charge ACP
- Redémarrez votre IDE JetBrains

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet
- Vérifiez que l'interface de ligne de commande fonctionne en exécutant `qwen` dans le terminal
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème persiste