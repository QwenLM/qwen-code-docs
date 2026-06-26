# Zed Editor

> Zed Editor bietet native Unterstützung für KI-Coding-Assistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht die direkte Verwendung von Qwen Code in der Zed-Oberfläche mit Echtzeit-Codevorschlägen.

![Zed Editor Übersicht](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Funktionen

- **Native Agent-Erfahrung**: Integriertes KI-Assistenten-Panel in der Zed-Oberfläche
- **Agent Client Protocol**: Vollständige ACP-Unterstützung für erweiterte IDE-Interaktionen
- **Dateiverwaltung**: @-erwähnte Dateien zum Gesprächskontext hinzufügen
- **Gesprächsverlauf**: Zugriff auf frühere Unterhaltungen in Zed

### Voraussetzungen

- Zed Editor (aktuelle Version empfohlen)
- Qwen Code CLI installiert

### Installation

#### Installation aus der ACP-Registry (Empfohlen)

1. Qwen Code CLI installieren:

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) herunterladen und installieren

3. In Zed oben rechts auf die **Einstellungen-Schaltfläche** klicken, **"Agent hinzufügen"** auswählen, dann **"Aus Registry installieren"** wählen, **Qwen Code** suchen und auf **Installieren** klicken.

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP installiert](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Manuelle Installation

1. Qwen Code CLI installieren:

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) herunterladen und installieren

3. In Zed oben rechts auf die **Einstellungen-Schaltfläche** klicken, **"Agent hinzufügen"** auswählen, dann **"Benutzerdefinierten Agent erstellen"** wählen und folgende Konfiguration hinzufügen:

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

- Führen Sie `qwen --version` im Terminal aus, um die Installation zu überprüfen
- Stellen Sie sicher, dass die JSON-Konfiguration gültig ist
- Starten Sie Zed Editor neu

### Qwen Code antwortet nicht

- Überprüfen Sie Ihre Internetverbindung
- Testen Sie die CLI mit `qwen` im Terminal
- [Melden Sie ein Problem auf GitHub](https://github.com/qwenlm/qwen-code/issues), falls das Problem weiterhin besteht