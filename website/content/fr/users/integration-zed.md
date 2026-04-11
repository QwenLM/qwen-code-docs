# Zed Editor

> Zed Editor prend en charge nativement les assistants de codage IA via l'Agent Client Protocol (ACP). Cette intégration vous permet d'utiliser Qwen Code directement dans l'interface de Zed avec des suggestions de code en temps réel.

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Fonctionnalités

- **Expérience d'agent native** : Panneau d'assistant IA intégré dans l'interface de Zed
- **Agent Client Protocol** : Prise en charge complète de l'ACP pour des interactions IDE avancées
- **Gestion des fichiers** : Mentionnez les fichiers avec `@` pour les ajouter au contexte de la conversation
- **Historique des conversations** : Accès aux conversations passées dans Zed

### Prérequis

- Zed Editor (dernière version recommandée)
- Qwen Code CLI installé

### Installation

#### Installation depuis le registre ACP (Recommandé)

1. Installez Qwen Code CLI :

```bash
npm install -g @qwen-code/qwen-code
```

2. Téléchargez et installez [Zed Editor](https://zed.dev/)

3. Dans Zed, cliquez sur le **bouton des paramètres** en haut à droite, sélectionnez **"Ajouter un agent"**, choisissez **"Installer depuis le registre"**, recherchez **Qwen Code**, puis cliquez sur **Installer**.

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP Installed](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Installation manuelle

1. Installez Qwen Code CLI :

```bash
npm install -g @qwen-code/qwen-code
```

2. Téléchargez et installez [Zed Editor](https://zed.dev/)

3. Dans Zed, cliquez sur le **bouton des paramètres** en haut à droite, sélectionnez **"Ajouter un agent"**, choisissez **"Créer un agent personnalisé"**, puis ajoutez la configuration suivante :

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Dépannage

### L'agent n'apparaît pas

- Exécutez `qwen --version` dans le terminal pour vérifier l'installation
- Vérifiez que la configuration JSON est valide
- Redémarrez Zed Editor

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet
- Vérifiez que le CLI fonctionne en exécutant `qwen` dans le terminal
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème persiste