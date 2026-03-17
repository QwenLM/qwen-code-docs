# IDE JetBrains

> Les IDE JetBrains offrent une prise en charge native des assistants de programmation IA via le *Agent Client Protocol* (ACP). Cette intégration vous permet d’utiliser Qwen Code directement au sein de votre IDE JetBrains, avec des suggestions de code en temps réel.

### Fonctionnalités

- **Expérience agent native** : Panneau assistant IA intégré à votre IDE JetBrains  
- **Agent Client Protocol** : Prise en charge complète de l’ACP, permettant des interactions avancées avec l’IDE  
- **Gestion des symboles** : Mentionnez les fichiers avec `#` pour les ajouter au contexte de la conversation  
- **Historique des conversations** : Accès aux conversations précédentes directement depuis l’IDE  

### Prérequis

- Un IDE JetBrains prenant en charge l’ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)  
- L’interface en ligne de commande (CLI) Qwen Code installée  

### Installation

#### Installation depuis le registre ACP (recommandé)

1. Installez l’interface CLI Qwen Code :

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Ouvrez votre IDE JetBrains et accédez à la fenêtre d’outils « Chat IA ».

3. Cliquez sur **Ajouter un agent ACP**, puis sur **Installer**.

   ![Installer](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Pour les utilisateurs de JetBrains AI Assistant et/ou d’autres agents ACP, cliquez sur **Installer depuis le registre ACP** dans la liste des agents, puis installez Qwen Code ACP.

   ![Ajouter depuis la liste des agents](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. L’agent Qwen Code doit désormais être disponible dans le panneau Assistant IA.

   ![Qwen Code dans le chat IA de JetBrains](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Installation manuelle (pour les anciennes versions des IDE JetBrains)

1. Installez l’interface CLI Qwen Code :

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Ouvrez votre IDE JetBrains et accédez à la fenêtre d’outil « Chat IA ».

3. Cliquez sur le menu à trois points situé dans le coin supérieur droit, puis sélectionnez **Configurer l’agent ACP** et configurez Qwen Code avec les paramètres suivants :

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

4. L’agent Qwen Code devrait désormais être disponible dans le panneau de l’Assistant IA.

![Qwen Code dans le Chat IA de JetBrains](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Résolution des problèmes

### L’agent n’apparaît pas

- Exécutez `qwen --version` dans un terminal pour vérifier l’installation.
- Assurez-vous que votre version de l’IDE JetBrains prend en charge ACP.
- Redémarrez votre IDE JetBrains.

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet  
- Vérifiez que l’interface en ligne de commande (CLI) fonctionne en exécutant `qwen` dans le terminal  
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème persiste