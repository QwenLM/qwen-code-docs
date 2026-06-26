# IDE JetBrains

> Les IDE JetBrains offrent un support natif pour les assistants de codage IA via le protocole Agent Client Protocol (ACP). Cette intégration vous permet d'utiliser Qwen Code directement dans votre IDE JetBrains avec des suggestions de code en temps réel.

### Fonctionnalités

- **Expérience agent native** : Panneau d’assistant IA intégré dans votre IDE JetBrains
- **Agent Client Protocol** : Prise en charge complète d’ACP pour des interactions avancées avec l’IDE
- **Gestion des symboles** : Mentionner des fichiers avec # pour les ajouter au contexte de la conversation
- **Historique des conversations** : Accès aux conversations passées dans l’IDE

### Prérequis

- IDE JetBrains avec prise en charge d’ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- CLI Qwen Code installée

### Installation

#### Installer depuis l’ACP Registry (Recommandé)

1. Installer la CLI Qwen Code :

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Ouvrir votre IDE JetBrains et naviguer vers la fenêtre d’outil AI Chat.

3. Cliquer sur **Ajouter un agent ACP**, puis sur **Installer**.

   ![Installer](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Pour les utilisateurs de l’assistant IA JetBrains et/ou d’autres agents ACP, cliquer sur **Installer depuis l’ACP Registry** dans la liste des agents, puis installer Qwen Code ACP.

   ![Ajouter depuis la liste des agents](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. L’agent Qwen Code devrait désormais être disponible dans le panneau AI Assistant.

   ![Qwen Code dans AI Chat de JetBrains](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Installation manuelle (pour les versions plus anciennes des IDE JetBrains)

1. Installer la CLI Qwen Code :

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Ouvrir votre IDE JetBrains et naviguer vers la fenêtre d’outil AI Chat.

3. Cliquer sur le menu à 3 points dans le coin supérieur droit, sélectionner **Configurer l’agent ACP**, puis configurer Qwen Code avec les paramètres suivants :

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

4. L’agent Qwen Code devrait désormais être disponible dans le panneau AI Assistant

![Qwen Code dans AI Chat de JetBrains](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Dépannage

### L’agent n’apparaît pas

- Exécutez `qwen --version` dans le terminal pour vérifier l’installation
- Assurez-vous que votre version de l’IDE JetBrains prend en charge ACP
- Redémarrez votre IDE JetBrains

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet
- Vérifiez que la CLI fonctionne en exécutant `qwen` dans le terminal
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème persiste