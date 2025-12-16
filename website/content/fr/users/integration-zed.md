# Éditeur Zed

> L'éditeur Zed prend en charge nativement les assistants de codage IA via le protocole Agent Control Protocol (ACP). Cette intégration vous permet d'utiliser Qwen Code directement dans l'interface de Zed avec des suggestions de code en temps réel.

![Aperçu de l'éditeur Zed](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Fonctionnalités

- **Expérience d'agent native** : Panneau d'assistant IA intégré dans l'interface de Zed
- **Protocole Agent Control** : Prise en charge complète de l'ACP permettant des interactions avancées avec l'IDE
- **Gestion des fichiers** : Mentionnez des fichiers avec @ pour les ajouter au contexte de la conversation
- **Historique des conversations** : Accès aux conversations passées depuis Zed

### Prérequis

- Éditeur Zed (dernière version recommandée)
- CLI Qwen Code installé

### Installation

1. Installez Qwen Code CLI :

   ```bash
   npm install -g qwen-code
   ```

2. Téléchargez et installez [Zed Editor](https://zed.dev/)

3. Dans Zed, cliquez sur le **bouton des paramètres** en haut à droite, sélectionnez **"Ajouter un agent"**, choisissez **"Créer un agent personnalisé"**, puis ajoutez la configuration suivante :

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--experimental-acp"],
  "env": {}
}
```

![Intégration de Qwen Code](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Dépannage

### L'agent n'apparaît pas

- Exécutez `qwen --version` dans le terminal pour vérifier l'installation
- Vérifiez que la configuration JSON est valide
- Redémarrez Zed Editor

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet
- Testez le bon fonctionnement du CLI en exécutant `qwen` dans le terminal
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème persiste