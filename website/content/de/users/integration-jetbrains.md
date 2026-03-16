# JetBrains-IDEs

> JetBrains-IDEs bieten native Unterstützung für KI-Coding-Assistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht es Ihnen, Qwen Code direkt innerhalb Ihrer JetBrains-IDE mit Echtzeit-Codevorschlägen zu nutzen.

### Funktionen

- **Native Agent-Erfahrung**: Integrierte KI-Assistenten-Leiste innerhalb Ihrer JetBrains-IDE  
- **Agent Client Protocol**: Vollständige ACP-Unterstützung für erweiterte IDE-Interaktionen  
- **Symbolverwaltung**: Dateien mit `#`-Mention in den Konversationskontext einbinden  
- **Konversationsverlauf**: Zugriff auf frühere Konversationen innerhalb der IDE  

### Voraussetzungen

- JetBrains-IDE mit ACP-Unterstützung (z. B. IntelliJ IDEA, WebStorm, PyCharm)  
- Installierte Qwen Code CLI  

### Installation

#### Installation über das ACP-Register (empfohlen)

1. Installieren Sie die Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Öffnen Sie Ihre JetBrains-IDE und navigieren Sie zum Fenster „AI Chat“.

3. Klicken Sie auf **ACP-Agent hinzufügen**, dann auf **Installieren**.

   ![Installieren](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Falls Sie den JetBrains AI Assistant und/oder andere ACP-Agenten verwenden, klicken Sie in der Agentenliste auf **Über das ACP-Register installieren**, um Qwen Code ACP zu installieren.

   ![Über die Agentenliste hinzufügen](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Der Qwen Code-Agent sollte nun im Fenster „AI Assistant“ verfügbar sein.

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Manuelles Installieren (für ältere Versionen von JetBrains-IDEs)

1. Installieren Sie die Qwen Code-CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Öffnen Sie Ihre JetBrains-IDE und navigieren Sie zum Fenster „KI-Chat“.

3. Klicken Sie auf das Dreipunkt-Menü in der oberen rechten Ecke, wählen Sie **ACP-Agent konfigurieren** und konfigurieren Sie Qwen Code mit den folgenden Einstellungen:

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/Pfad/zum/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. Der Qwen Code-Agent sollte nun im Fenster „KI-Assistent“ verfügbar sein.

![Qwen Code im JetBrains-KI-Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Problembehandlung

### Agent wird nicht angezeigt

- Führen Sie `qwen --version` im Terminal aus, um die Installation zu überprüfen.
- Stellen Sie sicher, dass Ihre JetBrains-IDE-Version ACP unterstützt.
- Starten Sie Ihre JetBrains-IDE neu.

### Qwen Code antwortet nicht

- Überprüfen Sie Ihre Internetverbindung.
- Stellen Sie sicher, dass die CLI funktioniert, indem Sie `qwen` im Terminal ausführen.
- [Erstellen Sie ein Issue auf GitHub](https://github.com/qwenlm/qwen-code/issues), falls das Problem weiterhin besteht.