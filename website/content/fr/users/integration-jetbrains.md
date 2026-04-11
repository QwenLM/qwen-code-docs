# IDE JetBrains

> Les IDE JetBrains offrent une prise en charge native des assistants de codage IA via l'Agent Client Protocol (ACP). Cette intégration vous permet d'utiliser Qwen Code directement dans votre IDE JetBrains avec des suggestions de code en temps réel.

### Fonctionnalités

- **Expérience d'agent native** : Panneau d'assistant IA intégré directement dans votre IDE JetBrains
- **Agent Client Protocol** : Prise en charge complète de l'ACP pour des interactions avancées avec l'IDE
- **Gestion des symboles** : Mentionnez des fichiers avec `#` pour les ajouter au contexte de la conversation
- **Historique des conversations** : Accès aux conversations précédentes directement dans l'IDE

### Prérequis

- Un IDE JetBrains compatible avec l'ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- Qwen Code CLI installé

### Installation

#### Installation depuis l'ACP Registry (Recommandé)

1. Installez Qwen Code CLI :

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Ouvrez votre IDE JetBrains et accédez à la fenêtre de l'outil AI Chat.

3. Cliquez sur **Add ACP Agent**, puis sur **Install**.

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Pour les utilisateurs de JetBrains AI Assistant et/ou d'autres agents ACP, cliquez sur **Install From ACP Registry** dans la liste des agents, puis installez Qwen Code ACP.

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. L'agent Qwen Code devrait maintenant être disponible dans le panneau AI Assistant.

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Installation manuelle (pour les anciennes versions des IDE JetBrains)

1. Installez Qwen Code CLI :

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Ouvrez votre IDE JetBrains et accédez à la fenêtre de l'outil AI Chat.

3. Cliquez sur le menu à trois points dans le coin supérieur droit, sélectionnez **Configure ACP Agent** et configurez Qwen Code avec les paramètres suivants :

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/path/to/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. L'agent Qwen Code devrait maintenant être disponible dans le panneau AI Assistant.

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Dépannage

### L'agent n'apparaît pas

- Exécutez `qwen --version` dans le terminal pour vérifier l'installation
- Vérifiez que votre version de l'IDE JetBrains prend en charge l'ACP
- Redémarrez votre IDE JetBrains

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet
- Vérifiez que la CLI fonctionne en exécutant `qwen` dans le terminal
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème persiste