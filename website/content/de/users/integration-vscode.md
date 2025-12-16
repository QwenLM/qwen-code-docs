# Visual Studio Code

> Die VS Code-Erweiterung (Beta) ermöglicht es dir, Änderungen von Qwen in Echtzeit über eine native grafische Oberfläche direkt in deiner IDE zu sehen, was den Zugriff und die Interaktion mit Qwen Code erleichtert.

<br/>

<video src="https://cloud.video.taobao.com/vod/JnvYMhUia2EKFAaiuErqNpzWE9mz3odG76vArAHNg94.mp4" controls width="800">
  Dein Browser unterstützt das Video-Tag nicht.
</video>

### Funktionen

- **Native IDE-Erfahrung**: Dediziertes Qwen Code-Seitenleistenpanel, aufrufbar über das Qwen-Symbol
- **Automatischer Übernahmemodus für Bearbeitungen**: Wende Qwens Änderungen automatisch an, sobald sie vorgenommen werden
- **Dateiverwaltung**: @-Erwähnung von Dateien oder Anhängen von Dateien und Bildern mithilfe des Systemdateipickers
- **Konversationsverlauf**: Zugriff auf vergangene Konversationen
- **Mehrere Sitzungen**: Führe mehrere Qwen Code-Sitzungen gleichzeitig aus

### Anforderungen

- VS Code 1.98.0 oder höher

### Installation

1. Installiere die Qwen Code CLI:

   ```bash
   npm install -g qwen-code
   ```

2. Lade die Erweiterung aus dem [Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) herunter und installiere sie.

## Fehlerbehebung

### Erweiterung wird nicht installiert

- Stelle sicher, dass du VS Code 1.98.0 oder höher verwendest
- Überprüfe, ob VS Code die Berechtigung zum Installieren von Erweiterungen hat
- Versuche, direkt über die Marketplace-Website zu installieren

### Qwen Code reagiert nicht

- Überprüfe deine Internetverbindung
- Starte eine neue Konversation, um festzustellen, ob das Problem weiterhin besteht
- [Erstelle ein Issue auf GitHub](https://github.com/qwenlm/qwen-code/issues), falls das Problem weiterhin besteht