# Visual Studio Code

> L'extension VS Code (Bêta) vous permet de voir les modifications de Qwen en temps réel grâce à une interface graphique native intégrée directement dans votre IDE, facilitant ainsi l'accès et l'interaction avec Qwen Code.

<br/>

<video src="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4" controls width="800">
  Votre navigateur ne prend pas en charge la balise vidéo.
</video>

### Fonctionnalités

- **Expérience IDE native** : Panneau latéral dédié à Qwen Code accessible via l'icône Qwen
- **Mode d'acceptation automatique des modifications** : Appliquer automatiquement les changements de Qwen au fur et à mesure qu'ils sont effectués
- **Gestion des fichiers** : Mentionner des fichiers avec @ ou joindre des fichiers et images à l'aide du sélecteur de fichiers système
- **Historique des conversations** : Accès aux conversations précédentes
- **Sessions multiples** : Exécuter plusieurs sessions Qwen Code simultanément

### Prérequis

- VS Code 1.85.0 ou supérieur

### Installation

1. Installez l'interface de ligne de commande Qwen Code :

   ```bash
   npm install -g qwen-code
   ```

2. Téléchargez et installez l'extension depuis le [Marché des extensions Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Dépannage

### L'extension ne s'installe pas

- Assurez-vous d'avoir VS Code version 1.85.0 ou supérieure
- Vérifiez que VS Code dispose des autorisations nécessaires pour installer des extensions
- Essayez d'installer directement depuis le site web du Marketplace

### Qwen Code ne répond pas

- Vérifiez votre connexion Internet
- Démarrez une nouvelle conversation pour voir si le problème persiste
- [Signalez un problème sur GitHub](https://github.com/qwenlm/qwen-code/issues) si le problème continue