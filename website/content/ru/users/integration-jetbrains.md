# JetBrains IDEs

> Среда разработки JetBrains обеспечивает нативную поддержку AI-ассистентов для написания кода через протокол Agent Client Protocol (ACP). Эта интеграция позволяет использовать Qwen Code непосредственно в вашей IDE JetBrains с подсказками кода в реальном времени.

### Возможности

- **Нативный опыт работы с агентом**: Встроенная панель AI-ассистента в вашей IDE JetBrains
- **Agent Client Protocol**: Полная поддержка ACP для расширенного взаимодействия с IDE
- **Управление символами**: Упоминайте файлы через `#`, чтобы добавить их в контекст разговора
- **История разговоров**: Доступ к предыдущим диалогам внутри IDE

### Требования

- IDE JetBrains с поддержкой ACP (IntelliJ IDEA, WebStorm, PyCharm и др.)
- Установленный Qwen Code CLI

### Установка

#### Установка из ACP Registry (рекомендуется)

1. Установите Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Откройте IDE JetBrains и перейдите в окно инструмента AI Chat.

3. Нажмите **Add ACP Agent**, затем нажмите **Install**.

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Если вы используете JetBrains AI Assistant и/или другие ACP-агенты, нажмите **Install From ACP Registry** в списке агентов (Agents List), затем установите Qwen Code ACP.

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Агент Qwen Code теперь должен быть доступен на панели AI Assistant.

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Ручная установка (для старых версий IDE JetBrains)

1. Установите Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Откройте IDE JetBrains и перейдите в окно инструмента AI Chat.

3. Нажмите меню с тремя точками в правом верхнем углу, выберите **Configure ACP Agent** и настройте Qwen Code, указав следующие параметры:

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

4. Агент Qwen Code теперь должен быть доступен на панели AI Assistant.

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Устранение неполадок

### Агент не отображается

- Выполните `qwen --version` в терминале, чтобы проверить установку
- Убедитесь, что ваша версия IDE JetBrains поддерживает ACP
- Перезапустите IDE JetBrains

### Qwen Code не отвечает

- Проверьте подключение к интернету
- Убедитесь, что CLI работает, запустив `qwen` в терминале
- [Создайте issue на GitHub](https://github.com/qwenlm/qwen-code/issues), если проблема не исчезнет