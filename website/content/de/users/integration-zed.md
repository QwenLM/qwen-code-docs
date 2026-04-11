# Zed Editor

> Zed Editor bietet native Unterstützung für AI-Coding-Assistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht es dir, Qwen Code direkt in der Zed-Oberfläche mit Echtzeit-Codevorschlägen zu nutzen.

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Funktionen

- **Native Agent-Erfahrung**: Integriertes AI-Assistenten-Panel in der Zed-Oberfläche
- **Agent Client Protocol**: Vollständige ACP-Unterstützung für erweiterte IDE-Interaktionen
- **Dateiverwaltung**: Dateien per @-Erwähnung zum Konversationskontext hinzufügen
- **Konversationsverlauf**: Zugriff auf frühere Konversationen innerhalb von Zed

### Voraussetzungen

- Zed Editor (aktuellste Version empfohlen)
- Installiertes Qwen Code CLI

### Installation

#### Installation über die ACP Registry (Empfohlen)

1. Installiere das Qwen Code CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Lade den [Zed Editor](https://zed.dev/) herunter und installiere ihn.

3. Klicke in Zed auf die **Einstellungsschaltfläche** oben rechts, wähle **"Add agent"**, dann **"Install from Registry"**, suche nach **Qwen Code** und klicke auf **Install**.

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP Installed](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Manuelle Installation

1. Installiere das Qwen Code CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Lade den [Zed Editor](https://zed.dev/) herunter und installiere ihn.

3. Klicke in Zed auf die **Einstellungsschaltfläche** oben rechts, wähle **"Add agent"**, dann **"Create a custom agent"** und füge die folgende Konfiguration hinzu:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
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
- Überprüfe, ob das CLI funktioniert, indem du `qwen` im Terminal ausführst
- [Erstelle ein Issue auf GitHub](https://github.com/qwenlm/qwen-code/issues), falls das Problem weiterhin besteht