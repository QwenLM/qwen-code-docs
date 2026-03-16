# Éditeur Zed

> L’éditeur Zed prend en charge nativement les assistants de programmation IA via le *Agent Client Protocol* (ACP). Cette intégration vous permet d’utiliser Qwen Code directement depuis l’interface de Zed, avec des suggestions de code en temps réel.

![Aperçu de l’éditeur Zed](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Fonctionnalités

- **Expérience native avec les agents** : Panneau assistant IA intégré à l’interface de Zed  
- **Agent Client Protocol** : Prise en charge complète de l’ACP pour des interactions avancées avec l’IDE  
- **Gestion des fichiers** : Mentionnez des fichiers avec `@` pour les ajouter au contexte de la conversation  
- **Historique des conversations** : Accès aux conversations précédentes directement dans Zed  

### Prérequis

- Éditeur Zed (version la plus récente recommandée)  
- CLI Qwen Code installé  

### Installation

#### Installation depuis le registre ACP (recommandé)

1. Installez l’interface CLI Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

2. Téléchargez et installez [l’éditeur Zed](https://zed.dev/)

3. Dans Zed, cliquez sur le **bouton Paramètres** dans le coin supérieur droit, sélectionnez **« Ajouter un agent »**, choisissez **« Installer depuis le registre »**, recherchez **Qwen Code**, puis cliquez sur **Installer**.

   ![Registre ACP](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code installé depuis le registre ACP](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Installation manuelle

1. Installez l’interface en ligne de commande (CLI) Qwen Code :

```bash
npm install -g @qwen-code/qwen-code
```

2. Téléchargez et installez [l’éditeur Zed](https://zed.dev/)

3. Dans Zed, cliquez sur le **bouton Paramètres** dans le coin supérieur droit, sélectionnez **« Ajouter un agent »**, choisissez **« Créer un agent personnalisé »**, puis ajoutez la configuration suivante :

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Intégration de Qwen Code](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Résolution des problèmes

### L’agent n’apparaît pas

- Exécutez `qwen --version` dans le terminal pour vérifier l’installation.
- Vérifiez que la configuration JSON est valide.
- Redémarrez l’éditeur Zed.

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet.
- Vérifiez que la CLI fonctionne en exécutant `qwen` dans le terminal.
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème persiste.