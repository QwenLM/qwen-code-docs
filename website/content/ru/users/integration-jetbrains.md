# JetBrains IDEs

> JetBrains IDE предоставляют встроенную поддержку AI-ассистентов через протокол Agent Client Protocol (ACP). Эта интеграция позволяет использовать Qwen Code напрямую в вашей JetBrains IDE с подсказками кода в реальном времени.

### Возможности

- **Встроенный агент**: Панель AI-ассистента, интегрированная в вашу JetBrains IDE
- **Agent Client Protocol**: Полная поддержка ACP, обеспечивающая расширенное взаимодействие с IDE
- **Управление символами**: Упоминание файлов через # для добавления в контекст разговора
- **История диалогов**: Доступ к предыдущим диалогам в среде IDE

### Требования

- JetBrains IDE с поддержкой ACP (IntelliJ IDEA, WebStorm, PyCharm и т.д.)
- Установленный CLI Qwen Code

### Установка

#### Установка из реестра ACP (рекомендуется)

1. Установите CLI Qwen Code:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Откройте вашу JetBrains IDE и перейдите в окно AI Chat.

3. Нажмите **Add ACP Agent**, затем нажмите **Install**.

   ![Установка](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Для пользователей, использующих JetBrains AI Assistant и/или других ACP-агентов, нажмите **Install From ACP Registry** в списке агентов, затем установите Qwen Code ACP.

   ![Добавление из списка агентов](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Теперь агент Qwen Code должен быть доступен в панели AI Assistant.

   ![Qwen Code в JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Ручная установка (для старых версий JetBrains IDE)

1. Установите CLI Qwen Code:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Откройте вашу JetBrains IDE и перейдите в окно AI Chat.

3. Нажмите на меню из трёх точек в правом верхнем углу и выберите **Configure ACP Agent**, затем настройте Qwen Code со следующими параметрами:

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/путь/к/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. Теперь агент Qwen Code должен быть доступен в панели AI Assistant.

![Qwen Code в JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Устранение неполадок

### Агент не отображается

- Выполните `qwen --version` в терминале, чтобы проверить установку
- Убедитесь, что ваша версия JetBrains IDE поддерживает ACP
- Перезапустите JetBrains IDE

### Qwen Code не отвечает

- Проверьте подключение к интернету
- Проверьте работу CLI, выполнив `qwen` в терминале
- [Сообщите о проблеме на GitHub](https://github.com/qwenlm/qwen-code/issues), если проблема сохраняется