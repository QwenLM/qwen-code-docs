# Willkommen bei der Qwen Code Dokumentation

Qwen Code ist ein leistungsstarkes Command-Line AI Workflow Tool, das von [**Gemini CLI**](https://github.com/google-gemini/gemini-cli) übernommen wurde ([Details](./README.gemini.md)) und speziell für [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder) Modelle optimiert wurde. Es verbessert deinen Entwicklungsworkflow mit fortschrittlichem Code-Verständnis, automatisierten Aufgaben und intelligenter Unterstützung.

## 🚀 Warum Qwen Code wählen?

- 🎯 **Kostenlose Version:** Bis zu 60 Anfragen/Min und 2.000 Anfragen/Tag mit deinem [QwenChat](https://chat.qwen.ai/)-Account.
- 🧠 **Fortgeschrittenes Modell:** Speziell optimiert für [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder) für besseres Verständnis und Unterstützung beim Programmieren.
- 🏆 **Umfangreiche Funktionen:** Enthält Subagents, Plan Mode, TodoWrite, Unterstützung für Vision-Modelle und vollständige OpenAI-API-Kompatibilität – alles nahtlos integriert.
- 🔧 **Built-in & Erweiterbare Tools:** Beinhaltet Dateisystemoperationen, Shell-Befehlsausführung, Web-Fetch/Suche und mehr – alles einfach erweiterbar über das Model Context Protocol (MCP) für individuelle Integrationen.
- 💻 **Entwickler-zentriert:** Entwickelt für Terminal-first Workflows – perfekt für CLI-Enthusiasten.
- 🛡️ **Open Source:** Lizenziert unter Apache 2.0 für maximale Freiheit und Transparenz.

## Installation

### Voraussetzungen

Stelle sicher, dass [Node.js Version 20](https://nodejs.org/en/download) oder höher installiert ist.

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### Installation via npm

```bash
npm install -g @qwen-code/qwen-code@latest
qwen --version
```

### Installation aus dem Quellcode

```bash
git clone https://github.com/QwenLM/qwen-code.git
cd qwen-code
npm install
npm install -g .
```

### Globale Installation mit Homebrew (macOS/Linux)

```bash
brew install qwen-code
```

## Schnellstart

```bash

# Qwen Code starten
qwen

# Beispielbefehle
> Erkläre mir die Struktur dieser Codebase
> Hilf mir bei der Refaktorisierung dieser Funktion
> Generiere Unit Tests für dieses Modul
```

### Sitzungsverwaltung

Optimiere Kosten und Performance durch konfigurierbare Limits für Token-Nutzung pro Session.

#### Token-Limit pro Session konfigurieren

Erstelle oder bearbeite `.qwen/settings.json` in deinem Home-Verzeichnis:

```json
{
  "sessionTokenLimit": 32000
}
```

#### Session Commands

- **`/compress`** - Komprimiere den Gesprächsverlauf, um innerhalb der Token-Limits fortzufahren
- **`/clear`** - Lösche den gesamten Gesprächsverlauf und starte neu
- **`/stats`** - Prüfe die aktuelle Token-Nutzung und Limits

> 📝 **Hinweis**: Das Token-Limit pro Session gilt für eine einzelne Konversation, nicht für kumulierte API-Aufrufe.

### Vision Model Konfiguration

Qwen Code verfügt über ein intelligentes Auto-Switching für Vision Models, das Bilder in deiner Eingabe erkennt und automatisch zu vision-fähigen Modellen wechseln kann, um eine multimodale Analyse durchzuführen. **Dieses Feature ist standardmäßig aktiviert** – wenn du Bilder in deine Anfragen einfügst, siehst du einen Dialog, der dich fragt, wie du den Wechsel zum Vision Model handhaben möchtest.

#### Den Switch-Dialog überspringen (optional)

Wenn du den interaktiven Dialog jedes Mal vermeiden möchtest, kannst du das Standardverhalten in deiner `.qwen/settings.json` konfigurieren:

```json
{
  "experimental": {
    "vlmSwitchMode": "once"
  }
}
```

**Verfügbare Modi:**

- **`"once"`** – Nur für diese Abfrage auf das Vision-Model wechseln, danach zurücksetzen  
- **`"session"`** – Für die gesamte Session auf das Vision-Model wechseln  
- **`"persist"`** – Beim aktuellen Model bleiben (kein Wechsel)  
- **Nicht gesetzt** – Jedes Mal den interaktiven Dialog anzeigen (Standard)

#### Überschreiben per Kommandozeile

Du kannst das Verhalten auch über die Kommandozeile festlegen:

```bash

# Einmalig pro Abfrage wechseln
qwen --vlm-switch-mode once

# Für die gesamte Session wechseln
qwen --vlm-switch-mode session

# Nie automatisch wechseln
qwen --vlm-switch-mode persist
```

#### Vision Models deaktivieren (Optional)

Um die Unterstützung für Vision Models vollständig zu deaktivieren, füge folgendes zu deiner `.qwen/settings.json` hinzu:

```json
{
  "experimental": {
    "visionModelPreview": false
  }
}
```

> 💡 **Tipp**: Im YOLO-Modus (`--yolo`) erfolgt das Wechseln zwischen Vision Models automatisch ohne Aufforderung, sobald Bilder erkannt werden.

### Authentifizierung

Wähle deine bevorzugte Authentifizierungsmethode basierend auf deinen Anforderungen:

#### 1. Qwen OAuth (🚀 Empfohlen – Start in 30 Sekunden)

Der einfachste Weg, um loszulegen – völlig kostenlos mit großzügigen Kontingenten:

```bash

# Führe einfach diesen Befehl aus und folge der Browser-Authentifizierung
qwen
```

**Was passiert:**

1. **Sofortige Einrichtung**: CLI öffnet deinen Browser automatisch
2. **One-Click Login**: Authentifizierung mit deinem qwen.ai-Konto
3. **Automatische Verwaltung**: Zugangsdaten werden lokal zwischengespeichert für zukünftige Verwendung
4. **Keine Konfiguration**: Keine Einrichtung erforderlich - einfach mit dem Coden beginnen!

**Vorteile des Free Tiers:**

- ✅ **2.000 Anfragen/Tag** (keine Token-Zählung erforderlich)
- ✅ **60 Anfragen/Minute** Rate-Limit
- ✅ **Automatischer Credential-Refresh**
- ✅ **Kostenlos** für Einzelbenutzer
- ℹ️ **Hinweis**: Model-Fallback kann auftreten, um die Servicequalität zu gewährleisten

#### 2. OpenAI-kompatible API

Verwende API keys für OpenAI oder andere kompatible Anbieter:

**Konfigurationsmethoden:**

1. **Environment Variables**

   ```bash
   export OPENAI_API_KEY="your_api_key_here"
   export OPENAI_BASE_URL="your_api_endpoint"
   export OPENAI_MODEL="your_model_choice"
   ```

2. **Projekt `.env` Datei**  
   Erstelle eine `.env` Datei im Root-Verzeichnis deines Projekts:
   ```env
   OPENAI_API_KEY=your_api_key_here
   OPENAI_BASE_URL=your_api_endpoint
   OPENAI_MODEL=your_model_choice
   ```

**API-Anbieter Optionen**

> ⚠️ **Regionale Hinweise:**
>
> - **Festland China**: Nutze Alibaba Cloud Bailian oder ModelScope
> - **International**: Nutze Alibaba Cloud ModelStudio oder OpenRouter

<details>
<summary><b>🇨🇳 Für Nutzer in Festland China</b></summary>

**Option 1: Alibaba Cloud Bailian** ([API Key beantragen](https://bailian.console.aliyun.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Option 2: ModelScope (Free Tier)** ([API Key beantragen](https://modelscope.cn/docs/model-service/API-Inference/intro))

- ✅ **2.000 kostenlose API-Aufrufe pro Tag**
- ⚠️ Verbinde deinen Aliyun-Account, um Authentifizierungsfehler zu vermeiden

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
```

</details>

<details>
<summary><b>🌍 Für internationale Nutzer</b></summary>

**Option 1: Alibaba Cloud ModelStudio** ([API Key beantragen](https://modelstudio.console.alibabacloud.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Option 2: OpenRouter (kostenlose Option verfügbar)** ([API Key beantragen](https://openrouter.ai/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL="qwen/qwen3-coder:free"
```

</details>

## Verwendungsbeispiele

### 🔍 Codebases erkunden

```bash
cd your-project/
qwen

# Architekturanalyse
> Describe the main pieces of this system's architecture
> What are the key dependencies and how do they interact?
> Find all API endpoints and their authentication methods
```

### 💻 Code-Entwicklung

```bash

# Refactoring
> Refactor this function to improve readability and performance
> Convert this class to use dependency injection
> Split this large module into smaller, focused components

# Code-Generierung
> Create a REST API endpoint for user management
> Generate unit tests for the authentication module
> Add error handling to all database operations
```

### 🔄 Workflows automatisieren

```bash

# Git-Automatisierung
> Analyze git commits from the last 7 days, grouped by feature
> Create a changelog from recent commits
> Find all TODO comments and create GitHub issues
```

# Dateioperationen
> Konvertiere alle Bilder in diesem Verzeichnis ins PNG-Format
> Benenne alle Testdateien um, sodass sie dem Muster *.test.ts folgen
> Finde und entferne alle console.log-Anweisungen

### 🐛 Debugging & Analyse

```bash
# Performance-Analyse
> Identifiziere Performance-Flaschenhälse in dieser React-Komponente
> Finde alle N+1-Query-Probleme in der Codebase

# Sicherheitsaudit
> Prüfe auf potenzielle SQL-Injection-Schwachstellen
> Finde alle hartcodierten Credentials oder API keys
```

## Beliebte Aufgaben

### 📚 Neue Codebases verstehen

```text
> Welche Kernkomponenten der Business-Logik gibt es?
> Welche Sicherheitsmechanismen sind implementiert?
> Wie fließen die Daten durch das System?
> Welche Hauptdesignpatterns werden verwendet?
> Generiere einen Dependency-Graph für dieses Modul
```

### 🔨 Code Refactoring & Optimization

```text
> Welche Teile dieses Moduls können optimiert werden?
> Hilf mir, diese Klasse nach den SOLID-Prinzipien umzustrukturieren
> Füge ordnungsgemäßes Error Handling und Logging hinzu
> Konvertiere Callbacks in das async/await-Muster
> Implementiere Caching für teure Operationen
```

### 📝 Documentation & Testing

```text
> Generiere umfassende JSDoc-Kommentare für alle öffentlichen APIs
> Schreibe Unit Tests mit Edge Cases für diese Komponente
> Erstelle API-Dokumentation im OpenAPI-Format
> Füge Inline-Kommentare hinzu, die komplexe Algorithmen erklären
> Generiere eine README für dieses Modul
```

### 🚀 Development Acceleration

```text
> Richte einen neuen Express-Server mit Authentifizierung ein
> Erstelle eine React-Komponente mit TypeScript und Tests
> Implementiere ein Rate-Limiter-Middleware
> Füge Datenbank-Migrationen für das neue Schema hinzu
> Konfiguriere eine CI/CD-Pipeline für dieses Projekt
```

## Commands & Shortcuts

### Session Commands

- `/help` - Verfügbare Commands anzeigen
- `/clear` - Konversationsverlauf löschen
- `/compress` - Verlauf komprimieren, um Tokens zu sparen
- `/stats` - Aktuelle Session-Informationen anzeigen
- `/exit` oder `/quit` - Qwen Code beenden

### Tastenkombinationen

- `Strg+C` - Aktuelle Operation abbrechen
- `Strg+D` - Beenden (in leerer Zeile)
- `Pfeil rauf/runter` - Durch Command-Historie navigieren