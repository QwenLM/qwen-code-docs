# Qwen Code Translator

A documentation translation tool specifically designed for the github project. Automatically sync documentation from GitHub repositories, translate with Qwen AI, and build a multilingual Nextra documentation site.

## Features

- 🌍 **Multi-language Support**: Translate documentation to Chinese (zh), German (de), French (fr), Russian (ru), and Japanese (ja)
- 🤖 **Qwen AI Translation**: Powered by Qwen API for high-quality technical document translation
- 📚 **Nextra Integration**: Automatically generates a modern documentation site using Nextra
- 🔄 **Git Synchronization**: Automatically syncs with source repositories to keep translations up-to-date
- ⚡ **CLI Interface**: Easy-to-use command-line interface for all operations
- 📝 **Smart Translation**: Preserves code blocks, links, and technical terms while translating content
- 🚀 **Parallel Processing**: Translates multiple languages concurrently for faster processing

## Installation

```bash
npm install -g @qwen-code/translator
```

## Quick Start

1. **Initialize a new translation project**:

   ```bash
   qwen-translator init
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env file and add your Qwen API key
   ```

3. **Sync source repository documents**:

   ```bash
   qwen-translator sync
   ```

4. **Translate documents**:

   ```bash
   qwen-translator translate
   ```

5. **Start the documentation site**:
   ```bash
   npm install
   npm run dev
   ```

## Commands

### `init`

Initialize a new translation project with interactive configuration. Sets up project structure, copies Nextra template, and creates configuration files.

### `sync [options]`

Sync source repository documents and automatically translate changes.

- `-f, --force`: Force sync all documents (ignores previous sync records)

### `translate [options]`

Translate documents to target languages.

- `-l, --language <lang>`: Specify target language (zh, de, fr, ru, ja)
- `-f, --file <file>`: Specify single file to translate

### `config`

View and manage project configuration interactively.

### `status`

Show current project status, configuration, and environment setup.

## Configuration

The tool creates a `translation.config.json` file during initialization:

```json
{
  "name": "project-name",
  "sourceRepo": "https://github.com/QwenLM/qwen-code.git",
  "docsPath": "docs",
  "sourceLanguage": "en",
  "targetLanguages": ["zh", "de", "fr", "ru"],
  "outputDir": "content"
}
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Required: Qwen API key
OPENAI_API_KEY=your_qwen_api_key

# Optional: API configuration (defaults shown)
OPENAI_BASE_URL=https://api.qwen.ai/v1
QWEN_MODEL=qwen3-coder-plus
QWEN_MAX_TOKENS=4000
```

### Alternative API Endpoints

You can also use other compatible endpoints:

```env
# DashScope (Aliyun)
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/
QWEN_MODEL=qwen-turbo
```

## Requirements

- Node.js >= 18.0.0
- npm >= 8.0.0
- Qwen API key (or compatible OpenAI-format API)

## Project Structure

After initialization, your project will have:

```
├── content/
│   ├── en/           # Source language documents (synced from repo)
│   ├── zh/           # Chinese translations
│   ├── de/           # German translations
│   ├── fr/           # French translations
│   └── ru/           # Russian translations
├── app/              # Next.js app directory (from template)
│   ├── [lang]/       # Dynamic language routing
│   └── layout.tsx    # App layout
├── .source-docs/     # Raw synced documentation
├── .temp-source-repo/# Temporary git clone (auto-managed)
├── translation.config.json
├── translation-changelog.json  # Translation history
├── last-sync.json    # Sync tracking
├── .env.example
├── next.config.mjs
└── package.json
```

## How It Works

1. **Sync**: The tool clones/updates the source repository and detects changed files
2. **Parse**: Markdown documents are parsed while preserving structure and metadata
3. **Translate**: Content is segmented and translated using Qwen AI, with smart handling of code blocks and technical terms
4. **Generate**: Translated content is organized into a Nextra-based multilingual documentation site
5. **Serve**: The Next.js app serves the documentation with language switching

## Development

```bash
# Install dependencies
npm install

# Build the CLI tool
npm run build

# Run in development mode (watch mode)
npm run dev

# Run tests
npm test
```

## License

MIT

## Contributing

This tool is specifically designed for the Qwen Code project. For feature requests or bug reports, please open an issue in the project repository.
