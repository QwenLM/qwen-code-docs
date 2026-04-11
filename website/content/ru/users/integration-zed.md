# Zed Editor

> Zed Editor обеспечивает нативную поддержку AI-ассистентов для написания кода через Agent Client Protocol (ACP). Эта интеграция позволяет использовать Qwen Code прямо в интерфейсе Zed с подсказками кода в реальном времени.

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Возможности

- **Нативная работа с агентом**: Встроенная панель AI-ассистента в интерфейсе Zed
- **Agent Client Protocol**: Полная поддержка ACP для расширенного взаимодействия с IDE
- **Управление файлами**: Упоминайте файлы через `@`, чтобы добавить их в контекст разговора
- **История диалогов**: Доступ к предыдущим разговорам внутри Zed

### Требования

- Zed Editor (рекомендуется последняя версия)
- Установленный Qwen Code CLI

### Установка

#### Установка из ACP Registry (рекомендуется)

1. Установите Qwen Code CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Скачайте и установите [Zed Editor](https://zed.dev/)

3. В Zed нажмите **кнопку настроек** в правом верхнем углу, выберите **"Add agent"**, затем **"Install from Registry"**, найдите **Qwen Code** и нажмите **Install**.

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP Installed](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Ручная установка

1. Установите Qwen Code CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Скачайте и установите [Zed Editor](https://zed.dev/)

3. В Zed нажмите **кнопку настроек** в правом верхнем углу, выберите **"Add agent"**, затем **"Create a custom agent"** и добавьте следующую конфигурацию:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Устранение неполадок

### Агент не отображается

- Выполните `qwen --version` в терминале, чтобы проверить установку
- Убедитесь, что JSON-конфигурация корректна
- Перезапустите Zed Editor

### Qwen Code не отвечает

- Проверьте подключение к интернету
- Убедитесь, что CLI работает, запустив `qwen` в терминале
- [Создайте issue на GitHub](https://github.com/qwenlm/qwen-code/issues), если проблема не исчезнет