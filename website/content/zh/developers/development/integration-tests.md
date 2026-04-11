# 集成测试

本文档介绍了本项目使用的集成测试框架。

## 概述

集成测试旨在验证 Qwen Code 的端到端功能。它们会在受控环境中执行构建好的二进制文件，并验证其与文件系统交互时的行为是否符合预期。

这些测试位于 `integration-tests` 目录中，并使用自定义的测试运行器执行。

## 运行测试

集成测试不会作为默认的 `npm run test` 命令的一部分运行。必须使用 `npm run test:integration:all` 脚本显式运行。

也可以使用以下快捷命令运行集成测试：

```bash
npm run test:e2e
```

## 运行特定测试集

要运行部分测试文件，可以使用 `npm run <integration test command> <file_name1> ...`，其中 `<integration test command>` 为 `test:e2e` 或 `test:integration*`，`<file_name>` 是 `integration-tests/` 目录中的任意 `.test.js` 文件。例如，以下命令将运行 `list_directory.test.js` 和 `write_file.test.js`：

```bash
npm run test:e2e list_directory write_file
```

### 按名称运行单个测试

要按名称运行单个测试，请使用 `--test-name-pattern` 标志：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 运行所有测试

要运行完整的集成测试套件，请使用以下命令：

```bash
npm run test:integration:all
```

### 沙箱矩阵

`all` 命令将针对 `no sandboxing`、`docker` 和 `podman` 运行测试。
可以使用以下命令分别运行每种类型：

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## 诊断

集成测试运行器提供了多种诊断选项，以帮助排查测试失败的原因。

### 保留测试输出

你可以保留测试运行期间创建的临时文件以供检查。这对于调试文件系统操作相关的问题非常有用。

要保留测试输出，请将 `KEEP_OUTPUT` 环境变量设置为 `true`。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

保留输出时，测试运行器将打印该次测试运行专属目录的路径。

### 详细输出

如需更详细的调试信息，请将 `VERBOSE` 环境变量设置为 `true`。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

在同一命令中同时使用 `VERBOSE=true` 和 `KEEP_OUTPUT=true` 时，输出将实时输出到控制台，并保存到测试临时目录中的日志文件内。

详细输出经过格式化，可清晰标识日志来源：

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## 代码检查与格式化

为确保代码质量和一致性，集成测试文件会在主构建流程中进行 lint 检查。你也可以手动运行 linter 和自动修复工具。

### 运行 Linter

要检查 lint 错误，请运行以下命令：

```bash
npm run lint
```

你可以在命令中添加 `:fix` 标志，以自动修复所有可修复的 lint 错误：

```bash
npm run lint:fix
```

## 目录结构

集成测试会在 `.integration-tests` 目录内为每次测试运行创建一个专属目录。在该目录中，会为每个测试文件创建子目录，并在其中为每个独立的测试用例创建子目录。

这种结构便于快速定位特定测试运行、文件或用例的产物。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## 持续集成

为确保集成测试始终被执行，项目在 `.github/workflows/e2e.yml` 中定义了 GitHub Actions 工作流。该工作流会在针对 `main` 分支的 Pull Request 创建时，或 Pull Request 加入合并队列时自动运行集成测试。

该工作流会在不同的沙箱环境中运行测试，以确保 Qwen Code 在每种环境下都经过验证：

- `sandbox:none`：在不使用任何沙箱的情况下运行测试。
- `sandbox:docker`：在 Docker 容器中运行测试。
- `sandbox:podman`：在 Podman 容器中运行测试。