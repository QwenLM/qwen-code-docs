# JetBrains IDEs

> JetBrains IDEs bieten nativen Support für KI-Coding-Assistenten über das Agent Client Protocol (ACP). Diese Integration ermöglicht es Ihnen, Qwen Code direkt innerhalb Ihrer JetBrains IDE mit Echtzeit-Code-Vorschlägen zu verwenden.

### Funktionen

- **Native Agent-Erfahrung**: Integriertes KI-Assistenten-Panel innerhalb Ihrer JetBrains IDE
- **Agent Client Protocol**: Vollständige Unterstützung für ACP zur Aktivierung erweiterter IDE-Interaktionen
- **Symbolverwaltung**: #-Erwähnung von Dateien, um sie zum Gesprächskontext hinzuzufügen
- **Gesprächshistorie**: Zugriff auf vergangene Gespräche innerhalb der IDE

### Voraussetzungen

- JetBrains IDE mit ACP-Unterstützung (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- Installiertes Qwen Code CLI

### Installation

1. Installiere die Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Öffne deine JetBrains IDE und navigiere zum AI Chat-Tool-Fenster.

3. Klicke auf das 3-Punkte-Menü in der oberen rechten Ecke und wähle **Configure ACP Agent**, um Qwen Code mit den folgenden Einstellungen zu konfigurieren:

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

4. Der Qwen Code-Agent sollte nun im AI Assistant-Panel verfügbar sein

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Problembehandlung

### Agent erscheint nicht

- Führe `qwen --version` im Terminal aus, um die Installation zu überprüfen
- Stelle sicher, dass deine JetBrains IDE-Version ACP unterstützt
- Starte deine JetBrains IDE neu

### Qwen Code antwortet nicht

- Überprüfen Sie Ihre Internetverbindung
- Stellen Sie sicher, dass die CLI funktioniert, indem Sie `qwen` im Terminal ausführen
- [Melden Sie ein Problem auf GitHub](https://github.com/qwenlm/qwen-code/issues), wenn das Problem weiterhin besteht