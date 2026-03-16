# Zed-Editor

> Der Zed-Editor bietet native Unterstützung für KI-Coding-Assistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht es Ihnen, Qwen Code direkt innerhalb der Zed-Oberfläche mit Echtzeit-Codevorschlägen zu nutzen.

![Übersicht über den Zed-Editor](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Funktionen

- **Native Agent-Erfahrung**: Integrierte KI-Assistentenleiste innerhalb der Zed-Oberfläche
- **Agent Client Protocol**: Vollständige ACP-Unterstützung für erweiterte IDE-Interaktionen
- **Dateiverwaltung**: Dateien mittels `@`-Mention in den Konversationskontext einbinden
- **Konversationsverlauf**: Zugriff auf frühere Konversationen innerhalb von Zed

### Voraussetzungen

- Zed-Editor (aktuellste Version wird empfohlen)
- Installierte Qwen Code CLI

### Installation

#### Installation über die ACP-Registry (empfohlen)

1. Installieren Sie die Qwen Code-CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Laden Sie den [Zed-Editor](https://zed.dev/) herunter und installieren Sie ihn.

3. Klicken Sie in Zed auf die **Einstellungsschaltfläche** in der oberen rechten Ecke, wählen Sie **„Agent hinzufügen“**, dann **„Aus Registry installieren“**, suchen Sie nach **Qwen Code** und klicken Sie auf **Installieren**.

   ![ACP-Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP installiert](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Manuelle Installation

1. Installieren Sie die Qwen Code-CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Laden Sie den [Zed-Editor](https://zed.dev/) herunter und installieren Sie ihn.

3. Klicken Sie in Zed auf die **Einstellungsschaltfläche** in der oberen rechten Ecke, wählen Sie **„Agent hinzufügen“**, dann **„Benutzerdefinierten Agent erstellen“**, und fügen Sie die folgende Konfiguration hinzu:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen-Code-Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Problembehandlung

### Agent wird nicht angezeigt

- Führen Sie `qwen --version` im Terminal aus, um die Installation zu überprüfen.
- Stellen Sie sicher, dass die JSON-Konfiguration gültig ist.
- Starten Sie den Zed-Editor neu.

### Qwen Code antwortet nicht

- Überprüfen Sie Ihre Internetverbindung.
- Stellen Sie sicher, dass die CLI funktioniert, indem Sie `qwen` im Terminal ausführen.
- [Erstellen Sie ein Issue auf GitHub](https://github.com/qwenlm/qwen-code/issues), falls das Problem weiterhin besteht.