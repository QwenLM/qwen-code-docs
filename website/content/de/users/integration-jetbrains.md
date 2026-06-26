# JetBrains IDEs

> JetBrains IDEs bieten native Unterstützung für KI-Codierungsassistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht es Ihnen, Qwen Code direkt in Ihrer JetBrains IDE mit Echtzeit-Codevorschlägen zu verwenden.

### Funktionen

- **Nativer Agent-Erlebnis**: Integriertes KI-Assistenten-Panel in Ihrer JetBrains IDE
- **Agent Client Protocol**: Volle Unterstützung für ACP, die erweiterte IDE-Interaktionen ermöglicht
- **Symbolverwaltung**: #-Erwähnung von Dateien, um sie zum Gesprächskontext hinzuzufügen
- **Konversationsverlauf**: Zugriff auf vergangene Unterhaltungen innerhalb der IDE

### Voraussetzungen

- JetBrains IDE mit ACP-Unterstützung (IntelliJ IDEA, WebStorm, PyCharm usw.)
- Qwen Code CLI installiert

### Installation

#### Installation aus dem ACP-Registry (empfohlen)

1. Installieren Sie die Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Öffnen Sie Ihre JetBrains IDE und navigieren Sie zum AI Chat-Toolfenster.

3. Klicken Sie auf **Add ACP Agent**, dann auf **Install**.

   ![Installieren](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Wenn Sie JetBrains AI Assistant und/oder andere ACP-Agenten verwenden, klicken Sie in der Agentenliste auf **Install From ACP Registry**, und installieren Sie dann Qwen Code ACP.

   ![Hinzufügen aus der Agentenliste](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Der Qwen Code-Agent sollte nun im AI Assistant-Panel verfügbar sein.

   ![Qwen Code im JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Manuelle Installation (für ältere Versionen von JetBrains IDEs)

1. Installieren Sie die Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Öffnen Sie Ihre JetBrains IDE und navigieren Sie zum AI Chat-Toolfenster.

3. Klicken Sie auf das 3-Punkte-Menü in der oberen rechten Ecke und wählen Sie **Configure ACP Agent** und konfigurieren Sie Qwen Code mit den folgenden Einstellungen:

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

4. Der Qwen Code-Agent sollte nun im AI Assistant-Panel verfügbar sein.

![Qwen Code im JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Fehlerbehebung

### Agent wird nicht angezeigt

- Führen Sie `qwen --version` im Terminal aus, um die Installation zu überprüfen.
- Stellen Sie sicher, dass Ihre JetBrains IDE-Version ACP unterstützt.
- Starten Sie Ihre JetBrains IDE neu.

### Qwen Code antwortet nicht

- Überprüfen Sie Ihre Internetverbindung.
- Überprüfen Sie die Funktion der CLI, indem Sie `qwen` im Terminal ausführen.
- [Erstellen Sie ein Issue auf GitHub](https://github.com/qwenlm/qwen-code/issues), falls das Problem weiterhin besteht.