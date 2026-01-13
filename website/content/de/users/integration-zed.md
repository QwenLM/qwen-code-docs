# Zed Editor

> Der Zed Editor bietet nativen Support für KI-Coding-Assistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht es Ihnen, Qwen Code direkt innerhalb der Zed-Oberfläche mit Echtzeit-Code-Vorschlägen zu verwenden.

![Zed Editor Übersicht](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Funktionen

- **Natives Agent-Erlebnis**: Integriertes KI-Assistenten-Panel innerhalb der Zed-Oberfläche
- **Agent Client Protocol**: Vollständige Unterstützung für ACP zur Aktivierung fortschrittlicher IDE-Interaktionen
- **Dateiverwaltung**: Dateien per @-Erwähnung hinzufügen, um sie in den Gesprächskontext einzubeziehen
- **Gesprächsverlauf**: Zugriff auf vergangene Gespräche innerhalb von Zed

### Voraussetzungen

- Zed Editor (aktuelle Version empfohlen)
- Qwen Code CLI installiert

### Installation

1. Installiere Qwen Code CLI:

   ```bash
   npm install -g qwen-code
   ```

2. Lade [Zed Editor](https://zed.dev/) herunter und installiere ihn

3. Klicke in Zed auf die **Einstellungsschaltfläche** in der oberen rechten Ecke, wähle **"Agent hinzufügen"**, wähle **"Benutzerdefinierten Agent erstellen"** und füge die folgende Konfiguration hinzu:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Problembehandlung

### Agent erscheint nicht

- Führe `qwen --version` im Terminal aus, um die Installation zu überprüfen
- Stelle sicher, dass die JSON-Konfiguration gültig ist
- Starte den Zed Editor neu

### Qwen Code antwortet nicht

- Überprüfe deine Internetverbindung
- Stelle sicher, dass die CLI funktioniert, indem du `qwen` im Terminal ausführst
- [Melde ein Problem auf GitHub](https://github.com/qwenlm/qwen-code/issues), wenn das Problem weiterhin besteht