# Субагенты

Субагенты — это специализированные ИИ-ассистенты, которые выполняют определенные типы задач в Qwen Code. Они позволяют делегировать узконаправленную работу ИИ-агентам, настроенным с помощью специфичных для задачи промптов, инструментов и поведения.

## Что такое субагенты?

Субагенты — это независимые ИИ-ассистенты, которые:

- **Специализируются на конкретных задачах** — каждый субагент настраивается с помощью сфокусированного системного промпта для определенных типов работы
- **Имеют отдельный контекст** — они ведут собственную историю диалога, независимую от вашего основного чата
- **Используют контролируемые инструменты** — вы можете настроить, к каким инструментам имеет доступ каждый субагент
- **Работают автономно** — получив задачу, они работают независимо до её завершения или возникновения ошибки
- **Предоставляют подробную обратную связь** — вы можете отслеживать их прогресс, использование инструментов и статистику выполнения в реальном времени

## Ключевые преимущества

- **Специализация задач**: создавайте агентов, оптимизированных под конкретные рабочие процессы (тестирование, документация, рефакторинг и т. д.)
- **Изоляция контекста**: отделяйте специализированную работу от основного диалога
- **Повторное использование**: сохраняйте и применяйте конфигурации агентов в разных проектах и сессиях
- **Контролируемый доступ**: ограничивайте набор инструментов для каждого агента в целях безопасности и фокусировки
- **Видимость прогресса**: отслеживайте выполнение задач агентами с обновлениями в реальном времени

## Как работают субагенты

1. **Конфигурация**: вы создаете конфигурации субагентов, определяющие их поведение, инструменты и системные промпты
2. **Делегирование**: основной ИИ может автоматически передавать задачи подходящим субагентам
3. **Выполнение**: субагенты работают независимо, используя настроенные инструменты для выполнения задач
4. **Результаты**: они возвращают результаты и сводки выполнения обратно в основной диалог

## Начало работы

### Быстрый старт

1. **Создайте свой первый субагент**:

   `/agents create`

   Следуйте указаниям мастера для создания специализированного агента.

2. **Управляйте существующими агентами**:

   `/agents manage`

   Просматривайте и управляйте настроенными субагентами.

3. **Используйте субагентов автоматически**: просто попросите основной ИИ выполнить задачи, соответствующие специализации ваших субагентов. ИИ автоматически делегирует подходящую работу.

### Пример использования

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```

## Управление

### CLI-команды

Субагенты управляются через слэш-команду `/agents` и её подкоманды:

**Использование:** `/agents create`. Создает новый субагент через пошаговый мастер.

**Использование:** `/agents manage`. Открывает интерактивное диалоговое окно для просмотра и управления существующими субагентами.

### Места хранения

Конфигурации субагентов хранятся в виде Markdown-файлов в нескольких местах:

- **Уровень проекта**: `.qwen/agents/` (наивысший приоритет)
- **Уровень пользователя**: `~/.qwen/agents/` (резервный вариант)
- **Уровень расширений**: предоставляются установленными расширениями

Это позволяет использовать агентов для конкретного проекта, персональных агентов, работающих во всех проектах, и агентов от расширений, добавляющих специализированные возможности.

### Субагенты расширений

Расширения могут предоставлять собственные субагенты, которые становятся доступны при включении расширения. Эти агенты хранятся в директории `agents/` расширения и используют тот же формат, что и персональные или проектные агенты.

Субагенты расширений:

- автоматически обнаруживаются при включении расширения
- отображаются в диалоге `/agents manage` в разделе "Extension Agents"
- не могут быть отредактированы напрямую (вместо этого редактируйте исходный код расширения)
- используют тот же формат конфигурации, что и агенты, определенные пользователем

Чтобы узнать, какие расширения предоставляют субагентов, проверьте наличие поля `agents` в файле `qwen-extension.json` расширения.

### Формат файла

Субагенты настраиваются с помощью Markdown-файлов с YAML-фронтматтером. Этот формат удобочитаем и легко редактируется в любом текстовом редакторе.

#### Базовая структура

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
tools:
	- tool1
	- tool2
	- tool3 # Optional
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### Выбор модели

Используйте опциональное поле `model` во фронтматтере, чтобы управлять тем, какую модель использует субагент:

- `inherit`: использовать ту же модель, что и в основном диалоге
- пропустить поле: аналогично `inherit`
- `glm-5`: использовать указанный ID модели с типом авторизации основного диалога
- `openai:gpt-4o`: использовать другого провайдера (учетные данные берутся из переменных окружения)

#### Пример использования

```
---
name: project-documenter
description: Creates project documentation and README files
---

You are a documentation specialist.

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## Эффективное использование субагентов

### Автоматическое делегирование

Qwen Code проактивно делегирует задачи на основе:

- описания задачи в вашем запросе
- поля `description` в конфигурациях субагентов
- текущего контекста и доступных инструментов

Чтобы стимулировать более проактивное использование субагентов, добавьте в поле `description` фразы вроде "use PROACTIVELY" или "MUST BE USED".

### Явный вызов

Запросите конкретного субагента, упомянув его в команде:

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Примеры

### Агенты для рабочих процессов разработки

#### Специалист по тестированию

Идеально подходит для создания комплексных тестов и разработки через тестирование (TDD).

```
---
name: testing-expert
description: Writes comprehensive unit tests, integration tests, and handles test automation with best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a testing specialist focused on creating high-quality, maintainable tests.

Your expertise includes:

- Unit testing with appropriate mocking and isolation
- Integration testing for component interactions
- Test-driven development practices
- Edge case identification and comprehensive coverage
- Performance and load testing when appropriate

For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality, edge cases, and error conditions
3. Create comprehensive test suites with descriptive names
4. Include proper setup/teardown and meaningful assertions
5. Add comments explaining complex test scenarios
6. Ensure tests are maintainable and follow DRY principles

Always follow testing best practices for the detected language and framework.
Focus on both positive and negative test cases.
```

**Сценарии использования:**

- «Напишите юнит-тесты для сервиса аутентификации»
- «Создайте интеграционные тесты для рабочего процесса обработки платежей»
- «Добавьте тестовое покрытие для граничных случаев в модуле валидации данных»

#### Автор документации

Специализируется на создании понятной и подробной документации.

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

You are a technical documentation specialist.

Your role is to create clear, comprehensive documentation that serves both
developers and end users. Focus on:

**For API Documentation:**

- Clear endpoint descriptions with examples
- Parameter details with types and constraints
- Response format documentation
- Error code explanations
- Authentication requirements

**For User Documentation:**

- Step-by-step instructions with screenshots when helpful
- Installation and setup guides
- Configuration options and examples
- Troubleshooting sections for common issues
- FAQ sections based on common user questions

**For Developer Documentation:**

- Architecture overviews and design decisions
- Code examples that actually work
- Contributing guidelines
- Development environment setup

Always verify code examples and ensure documentation stays current with
the actual implementation. Use clear headings, bullet points, and examples.
```

**Сценарии использования:**

- «Создайте документацию по API для эндпоинтов управления пользователями»
- «Напишите подробный README для этого проекта»
- «Задокументируйте процесс развертывания с шагами по устранению неполадок»

#### Ревьюер кода

Сфокусирован на качестве кода, безопасности и лучших практиках.

```
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools:
  - read_file
  - read_many_files
---

You are an experienced code reviewer focused on quality, security, and maintainability.

Review criteria:

- **Code Structure**: Organization, modularity, and separation of concerns
- **Performance**: Algorithmic efficiency and resource usage
- **Security**: Vulnerability assessment and secure coding practices
- **Best Practices**: Language/framework-specific conventions
- **Error Handling**: Proper exception handling and edge case coverage
- **Readability**: Clear naming, comments, and code organization
- **Testing**: Test coverage and testability considerations

Provide constructive feedback with:

1. **Critical Issues**: Security vulnerabilities, major bugs
2. **Important Improvements**: Performance issues, design problems
3. **Minor Suggestions**: Style improvements, refactoring opportunities
4. **Positive Feedback**: Well-implemented patterns and good practices

Focus on actionable feedback with specific examples and suggested solutions.
Prioritize issues by impact and provide rationale for recommendations.
```

**Сценарии использования:**

- «Проверьте эту реализацию аутентификации на наличие проблем с безопасностью»
- «Оцените влияние на производительность этой логики запросов к базе данных»
- «Оцените структуру кода и предложите улучшения»

### Агенты для конкретных технологий

#### Специалист по React

Оптимизирован для разработки на React, работы с хуками и паттернами компонентов.

```
---
name: react-specialist
description: Expert in React development, hooks, component patterns, and modern React best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a React specialist with deep expertise in modern React development.

Your expertise covers:

- **Component Design**: Functional components, custom hooks, composition patterns
- **State Management**: useState, useReducer, Context API, and external libraries
- **Performance**: React.memo, useMemo, useCallback, code splitting
- **Testing**: React Testing Library, Jest, component testing strategies
- **TypeScript Integration**: Proper typing for props, hooks, and components
- **Modern Patterns**: Suspense, Error Boundaries, Concurrent Features

For React tasks:

1. Use functional components and hooks by default
2. Implement proper TypeScript typing
3. Follow React best practices and conventions
4. Consider performance implications
5. Include appropriate error handling
6. Write testable, maintainable code

Always stay current with React best practices and avoid deprecated patterns.
Focus on accessibility and user experience considerations.
```

**Сценарии использования:**

- «Создайте переиспользуемый компонент таблицы данных с сортировкой и фильтрацией»
- «Реализуйте кастомный хук для получения данных из API с кэшированием»
- «Рефакторите этот классовый компонент под современные паттерны React»

#### Эксперт по Python

Специализируется на разработке на Python, фреймворках и лучших практиках.

```
---
name: python-expert
description: Expert in Python development, frameworks, testing, and Python-specific best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a Python expert with deep knowledge of the Python ecosystem.

Your expertise includes:

- **Core Python**: Pythonic patterns, data structures, algorithms
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await patterns
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, type hints, linting with pylint/flake8

For Python tasks:

1. Follow PEP 8 style guidelines
2. Use type hints for better code documentation
3. Implement proper error handling with specific exceptions
4. Write comprehensive docstrings
5. Consider performance and memory usage
6. Include appropriate logging
7. Write testable, modular code

Focus on writing clean, maintainable Python code that follows community standards.
```

**Сценарии использования:**

- «Создайте сервис на FastAPI для аутентификации пользователей с JWT-токенами»
- «Реализуйте конвейер обработки данных с pandas и обработкой ошибок»
- «Напишите CLI-утилиту с использованием argparse и подробной справкой»

## Лучшие практики

### Принципы проектирования

#### Принцип единственной ответственности

Каждый субагент должен иметь четкую и сфокусированную цель.

**✅ Хорошо:**

```
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ Избегайте:**

```
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**Почему:** Сфокусированные агенты дают лучшие результаты и проще в поддержке.

#### Четкая специализация

Определяйте конкретные области экспертизы, а не общие возможности.

**✅ Хорошо:**

```
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ Избегайте:**

```
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**Почему:** Конкретная экспертиза обеспечивает более целенаправленную и эффективную помощь.

#### Конкретные описания

Пишите описания, которые четко указывают, когда следует использовать агента.

**✅ Хорошо:**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ Избегайте:**

```
description: A helpful code reviewer
```

**Почему:** Четкие описания помогают основному ИИ выбирать правильного агента для каждой задачи.

### Лучшие практики конфигурации

#### Рекомендации по системному промпту

**Указывайте конкретную экспертизу:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Включайте пошаговые подходы:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**Определяйте стандарты вывода:**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Вопросы безопасности

- **Ограничения инструментов**: субагенты имеют доступ только к настроенным для них инструментам
- **Песочница**: выполнение всех инструментов подчиняется той же модели безопасности, что и прямое использование
- **Журнал аудита**: все действия субагентов логируются и видны в реальном времени
- **Контроль доступа**: разделение на уровне проекта и пользователя обеспечивает необходимые границы
- **Конфиденциальная информация**: избегайте включения секретов или учетных данных в конфигурации агентов
- **Продакшен-окружения**: рассмотрите использование отдельных агентов для продакшена и разработки

## Ограничения

К конфигурациям субагентов применяются следующие предупреждения (жесткие ограничения не накладываются):

- **Поле Description**: предупреждение отображается для описаний длиннее 1000 символов
- **System Prompt**: предупреждение отображается для системных промптов длиннее 10 000 символов