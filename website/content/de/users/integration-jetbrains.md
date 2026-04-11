# JetBrains IDEs

> JetBrains IDEs bieten native Unterstützung für KI-Coding-Assistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht es dir, Qwen Code direkt in deiner JetBrains IDE mit Echtzeit-Codevorschlägen zu nutzen.

### Features

- **Native Agent-Erfahrung**: Integriertes KI-Assistenten-Panel direkt in deiner JetBrains IDE
- **Agent Client Protocol**: Vollständige ACP-Unterstützung für erweiterte IDE-Interaktionen
- **Symbolverwaltung**: Dateien mit `#` erwähnen, um sie zum Konversationskontext hinzuzufügen
- **Konversationsverlauf**: Zugriff auf frühere Konversationen innerhalb der IDE

### Voraussetzungen

- JetBrains IDE mit ACP-Unterstützung (IntelliJ IDEA, WebStorm, PyCharm usw.)
- Installierte Qwen Code CLI

### Installation

#### Installation über die ACP Registry (Empfohlen)

1. Installiere die Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Öffne deine JetBrains IDE und navigiere zum Toolfenster AI Chat.

3. Klicke auf **Add ACP Agent** und anschließend auf **Install**.

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Falls du JetBrains AI Assistant und/oder andere ACP-Agents nutzt, klicke in der Agents List auf **Install From ACP Registry** und installiere anschließend Qwen Code ACP.

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Der Qwen Code Agent sollte nun im AI Assistant-Panel verfügbar sein.

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Manuelle Installation (für ältere Versionen von JetBrains IDEs)

1. Installiere die Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Öffne deine JetBrains IDE und navigiere zum Toolfenster AI Chat.

3. Klicke auf das 3-Punkte-Menü in der oberen rechten Ecke, wähle **Configure ACP Agent** und konfiguriere Qwen Code mit den folgenden Einstellungen:

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/path/to/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. Der Qwen Code Agent sollte nun im AI Assistant-Panel verfügbar sein.

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Fehlerbehebung

### Agent wird nicht angezeigt

- Führe `qwen --version` im Terminal aus, um die Installation zu überprüfen
- Stelle sicher, dass deine JetBrains IDE-Version ACP unterstützt
- Starte deine JetBrains IDE neu

### Qwen Code reagiert nicht

- Überprüfe deine Internetverbindung
- Überprüfe, ob die CLI funktioniert, indem du `qwen` im Terminal ausführst
- [Erstelle ein Issue auf GitHub](https://github.com/qwenlm/qwen-code/issues), falls das Problem weiterhin besteht