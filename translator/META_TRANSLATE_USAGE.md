# Usage Guide: Meta File Translation

## Overview

The `meta` command automatically translates all `_meta.ts` files in your project into multiple target languages.

## Features

- Auto-detects all `_meta.ts` files
- Supports batch multi-language translation
- Preserves file format and structure
- Efficient bulk processing
- Robust error handling and fallback

## Usage

### 1. Translate all `_meta.ts` files to all target languages

```bash
qwen-translation meta
```

### 2. Translate a specific file to a specific language

```bash
qwen-translation meta -f "cli/_meta.ts" -l "zh"
```

### 3. Show help

```bash
qwen-translation meta --help
```

## Command Options

- `-f, --file <file>`: Path to a specific `_meta.ts` file
- `-l, --language <lang>`: Target language code

## Supported Format

Works with standard Nextra structure for `_meta.ts` files, e.g.:

```typescript
export default {
  index: "Introduction",
  authentication: "Authentication",
  commands: "Commands",
  configuration: "Configuration",
  themes: "Themes",
  tutorials: "Tutorials",
  "keyboard-shortcuts": "Keyboard Shortcuts",
  "trusted-folders": "Trusted Folders",
  "qwen-ignore": "Ignoring Files",
  Uninstall: "Uninstall",
};
```

## Example

Original (English):

```typescript
export default {
  index: "Introduction",
  commands: "Commands",
  configuration: "Configuration",
};
```

After translation (Chinese):

```typescript
export default {
  index: "介绍",
  commands: "命令",
  configuration: "配置",
};
```

## Notes

1. Ensure your project is initialized (`qwen-translation init`).
2. Make sure required environment variables (e.g., API keys) are set.
3. Translations will overwrite existing `_meta.ts` in the target language directory.
4. If translation fails, the original content is kept as a fallback.

## Error Handling

- If a file fails to translate, an error is shown but processing continues.
- In case of API failure, the original text is used.
- All errors are logged for debugging.

## Integration with Other Commands

The `meta` command is compatible with existing `sync` and `markdown` commands:

- `sync`: Synchronize source docs
- `markdown`: Translate Markdown files
- `meta`: Translate `_meta.ts` files

Recommended workflow:

1. Run `qwen-translation sync` to sync docs
2. Run `qwen-translation markdown` to translate Markdown files
3. Run `qwen-translation meta` to translate navigation files
