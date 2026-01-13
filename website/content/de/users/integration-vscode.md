# Visual Studio Code

> Die VS Code-Erweiterung (Beta) ermöglicht es Ihnen, Änderungen von Qwen in Echtzeit über eine native grafische Oberfläche zu sehen, die direkt in Ihre IDE integriert ist. Dadurch wird der Zugriff auf und die Interaktion mit Qwen Code erleichtert.

<br/>

<video src="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4" controls width="800">
  Ihr Browser unterstützt das Video-Tag nicht.
</video>

### Funktionen

- **Native IDE-Erfahrung**: Dediziertes Qwen Code-Seitenpanel, auf das über das Qwen-Symbol zugegriffen werden kann
- **Automatischer Annahmemodus für Bearbeitungen**: Qwens Änderungen werden automatisch angewendet, sobald sie vorgenommen werden
- **Dateiverwaltung**: Dateien per @-Erwähnung erwähnen oder Dateien und Bilder mit dem Systemdateiauswahl-Dialog anhängen
- **Konversationsverlauf**: Zugriff auf vergangene Konversationen
- **Mehrere Sitzungen**: Mehrere Qwen Code-Sitzungen gleichzeitig ausführen

### Anforderungen

- VS Code 1.85.0 oder höher

### Installation

1. Installiere die Qwen Code CLI:

   ```bash
   npm install -g qwen-code
   ```

2. Lade die Erweiterung herunter und installiere sie über den [Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Problembehandlung

### Erweiterung wird nicht installiert

- Stelle sicher, dass du über VS Code 1.85.0 oder höher verfügst
- Überprüfe, ob VS Code die Berechtigung zum Installieren von Erweiterungen hat
- Versuche eine direkte Installation über die Marketplace-Website

### Qwen Code reagiert nicht

- Überprüfe deine Internetverbindung
- Starte eine neue Konversation, um zu sehen, ob das Problem weiterhin besteht
- [Melde ein Problem auf GitHub](https://github.com/qwenlm/qwen-code/issues), wenn das Problem weiterhin besteht