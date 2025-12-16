# Zed Editor

> Der Zed Editor bietet native Unterstützung für KI-basierte Coding-Assistenten über das Agent Control Protocol (ACP). Diese Integration ermöglicht es Ihnen, Qwen Code direkt innerhalb der Zed-Oberfläche mit Echtzeit-Code-Vorschlägen zu nutzen.

![Zed Editor Übersicht](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Funktionen

- **Native Agent-Erfahrung**: Integriertes KI-Assistenten-Panel innerhalb der Zed-Oberfläche
- **Agent Control Protocol**: Vollständige Unterstützung für ACP zur Aktivierung erweiterter IDE-Interaktionen
- **Dateiverwaltung**: Verwenden Sie @-Erwähnungen, um Dateien zum Gesprächskontext hinzuzufügen
- **Konversationsverlauf**: Zugriff auf vergangene Gespräche innerhalb von Zed

### Anforderungen

- Zed Editor (neueste Version empfohlen)
- Qwen Code CLI installiert

### Installation

1. Installiere die Qwen Code CLI:

   ```bash
   npm install -g qwen-code
   ```

2. Lade den [Zed Editor](https://zed.dev/) herunter und installiere ihn

3. Klicke in Zed auf den **Einstellungsbutton** in der oberen rechten Ecke, wähle **"Add agent"**, wähle **"Create a custom agent"** und füge die folgende Konfiguration hinzu:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--experimental-acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Fehlerbehebung

### Agent wird nicht angezeigt

- Führe `qwen --version` im Terminal aus, um die Installation zu überprüfen
- Stelle sicher, dass die JSON-Konfiguration gültig ist
- Starte den Zed Editor neu

### Qwen Code reagiert nicht

- Überprüfe deine Internetverbindung
- Stelle sicher, dass die CLI funktioniert, indem du `qwen` im Terminal ausführst
- [Erstelle ein Issue auf GitHub](https://github.com/qwenlm/qwen-code/issues), wenn das Problem weiterhin besteht