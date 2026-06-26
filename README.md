# Qwen Code Translator

A documentation translation tool specifically designed for the github project. Automatically sync documentation from GitHub repositories, translate with Qwen AI, and build a multilingual Nextra documentation site.

## Features

- 🌍 **Multi-language Support**: Translate documentation to Chinese (zh), German (de), French (fr), Russian (ru), Japanese (ja), and Spanish (es)
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
   qwen-translator markdown
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

Sync source repository documents and automatically translate changed files into the target languages.

- `-f, --force`: Force sync all documents (ignores previous sync records)
- `-d, --detect-only`: Only detect and list changed files; skip translation and write nothing (no `content/` updates, no `last-sync.json`/changelog changes). Useful for previewing what a sync would translate.
- `-s, --source-only`: Detect changes and write the source-language docs (`content/<sourceLanguage>` and `.source-docs`), but skip translation. Does **not** advance `last-sync.json` or write the changelog, so a later `sync` (with a key) still re-detects and translates these files. Useful for refreshing the source docs now and translating later.

> **No API key for detection / source-only.** The translator is lazy-loaded, so `--detect-only`, `--source-only`, and a normal sync that finds zero changes do **not** require `OPENAI_API_KEY`. A normal sync that has changes validates the key *before* writing any files, so a missing key fails fast without leaving partially-written output. Note that detection still clones/updates the source repo under `.temp-source-repo`.

### `markdown [options]`

Translate the Markdown documents under `content/<sourceLanguage>/` into the target languages. Translates the whole directory by default, or a single file with `-f`.

- `-l, --language <lang>`: Specify target language (zh, de, fr, ru, ja, pt-BR, es)
- `-f, --file <file>`: Specify single file to translate

### `meta [options]`

Translate Nextra navigation files (`_meta.ts`) into the target languages.

- `-l, --language <lang>`: Specify target language
- `-f, --file <file>`: Specify a single `_meta.ts` file to translate

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
# Required: OpenAI-compatible API key
OPENAI_API_KEY=your_api_key_here

# Optional: API configuration (defaults shown)
OPENAI_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=deepseek-v4-flash
QWEN_MAX_TOKENS=32768
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
- OpenAI-compatible API key

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
