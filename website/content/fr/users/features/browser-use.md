# Browser Use

Browser Use permet à Qwen Code de travailler avec des pages dans votre navigateur Chrome, en utilisant vos
onglets existants et vos sessions connectées.

## Utilisation

Utilisez macOS ou Linux avec Chrome 125 ou ultérieur. **Installez et activez l'extension Qwen
Chrome dans le profil Chrome que vous souhaitez utiliser.** L'extension est
requise et n'est pas installée par le package Qwen Code. Il n'y a pas encore de listing
sur le Chrome Web Store. Construisez-la depuis le répertoire `packages/chrome-extension` du
dépôt Qwen Code en suivant son
[README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme),
puis ouvrez `chrome://extensions`, activez le mode Développeur, choisissez **Charger
l'extension non empaquetée**, et sélectionnez le répertoire `dist/extension` construit.

Décrivez votre tâche de navigateur directement, par exemple :

> Lis mon tableau de bord ouvert et résume les commandes d'aujourd'hui.

Qwen sélectionne le skill Browser Use lorsque c'est approprié. La première tâche navigateur enregistre automatiquement un petit programme de connexion local dans votre répertoire utilisateur ; les tâches suivantes le réutilisent. Qwen confirme la connexion avec l'extension avant d'opérer sur les pages. S'il ne peut pas se connecter, ouvrez Chrome et vérifiez que l'extension est activée dans le profil prévu, puis réessayez. Si une dépendance d'exécution
nécessite une configuration lors de la première utilisation, Qwen vous guidera et pourra vous demander de redémarrer.
Aucune extension Qwen Browser Use séparée ni processus `qwen serve` n'est nécessaire.

## Désactivation

Utilisez `/skills` pour désactiver **browser-use**. Cela masque le skill au modèle
mais ne déconnecte pas une session navigateur existante ni ne supprime les instructions
déjà chargées dans une conversation.