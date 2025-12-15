# Visual Studio Code

> L'extension VS Code (Beta) vous permet de voir les modifications de Qwen en temps réel grâce à une interface graphique native intégrée directement dans votre IDE, facilitant l'accès et l'interaction avec Qwen Code.

<br/>

<video src="https://cloud.video.taobao.com/vod/JnvYMhUia2EKFAaiuErqNpzWE9mz3odG76vArAHNg94.mp4" controls width="800">
  Votre navigateur ne prend pas en charge la balise vidéo.
</video>

### Fonctionnalités

- **Expérience IDE native** : Panneau latéral dédié à Qwen Code accessible via l'icône Qwen
- **Mode d'acceptation automatique des modifications** : Appliquer automatiquement les changements de Qwen au fur et à mesure qu'ils sont effectués
- **Gestion des fichiers** : Mentionner des fichiers avec @ ou joindre des fichiers et des images en utilisant le sélecteur de fichiers système
- **Historique des conversations** : Accès aux conversations passées
- **Sessions multiples** : Exécuter plusieurs sessions Qwen Code simultanément

### Prérequis

- VS Code 1.98.0 ou version supérieure

### Installation

1. Installez Qwen Code CLI :

   ```bash
   npm install -g qwen-code
   ```

2. Téléchargez et installez l'extension depuis le [Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Dépannage

### L'extension ne s'installe pas

- Assurez-vous d'avoir VS Code 1.98.0 ou une version supérieure
- Vérifiez que VS Code dispose des autorisations nécessaires pour installer des extensions
- Essayez d'installer directement depuis le site web du Marketplace

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet
- Démarrez une nouvelle conversation pour voir si le problème persiste
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème continue