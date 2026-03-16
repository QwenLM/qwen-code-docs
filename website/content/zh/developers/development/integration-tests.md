# 集成测试

本文档介绍了本项目中使用的集成测试框架。

## 概述

集成测试旨在验证 Qwen Code 的端到端功能。它们在受控环境中执行已构建的二进制文件，并验证其与文件系统交互时的行为是否符合预期。

这些测试位于 `integration-tests` 目录中，并通过自定义测试运行器执行。

## 运行测试

集成测试不会作为默认 `npm run test` 命令的一部分运行。必须显式使用 `npm run test:integration:all` 脚本来运行。

也可使用以下快捷命令运行集成测试：

```bash
npm run test:e2e
```

## 运行特定的一组测试

若要运行部分测试文件，可使用 `npm run <集成测试命令> <文件名1> ...` 命令，其中 `<集成测试命令>` 为 `test:e2e` 或 `test:integration*`，而 `<文件名>` 是 `integration-tests/` 目录下的任意 `.test.js` 文件。例如，以下命令将运行 `list_directory.test.js` 和 `write_file.test.js`：

```bash
npm run test:e2e list_directory write_file
```

### 按名称运行单个测试

若要按测试名称运行单个测试，请使用 `--test-name-pattern` 标志：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 运行全部测试

若要运行全部集成测试，请使用以下命令：

```bash
npm run test:integration:all
```

### 沙箱矩阵

`all` 命令将运行针对 `无沙箱`、`Docker` 和 `Podman` 的测试。  
每种类型均可通过以下命令单独运行：

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

集成测试运行器提供了多种诊断选项，以帮助定位测试失败原因。

### 保留测试输出

你可以保留测试运行期间创建的临时文件，以便检查。这对于调试文件系统操作相关问题非常有用。

如需保留测试输出，请将 `KEEP_OUTPUT` 环境变量设为 `true`。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

当启用输出保留时，测试运行器会打印本次测试运行所使用的唯一目录路径。

### 详细输出

如需更详细的调试信息，请将 `VERBOSE` 环境变量设为 `true`。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

当在同一命令中同时使用 `VERBOSE=true` 和 `KEEP_OUTPUT=true` 时，输出内容会实时流式打印到控制台，并同时保存至测试临时目录下的日志文件中。

详细输出格式经过专门设计，可清晰标识日志来源：

```
--- TEST: <日志目录>:<测试名称> ---
... qwen 命令的输出 ...
--- END TEST: <日志目录>:<测试名称> ---
```

## 代码检查与格式化

为确保代码质量与一致性，集成测试文件会在主构建流程中自动执行代码检查。你也可以手动运行检查器及自动修复工具。

### 运行代码检查器

要检查是否存在代码风格问题，请运行以下命令：

```bash
npm run lint
```

你可在命令中添加 `:fix` 标志，以自动修复所有可修复的代码风格问题：

```bash
npm run lint:fix
```

## 目录结构

集成测试会在 `.integration-tests` 目录内为每次测试运行创建一个唯一目录。在此目录下，每个测试文件对应一个子目录；而每个测试用例又在该子目录下创建一个独立的子目录。

这种结构便于快速定位特定测试运行、测试文件或测试用例所生成的产物。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...其他测试产物...
```

## 持续集成

为确保集成测试始终运行，在 `.github/workflows/e2e.yml` 中定义了一个 GitHub Actions 工作流。该工作流会在针对 `main` 分支发起的拉取请求（Pull Request）上，或当拉取请求加入合并队列时，自动运行集成测试。

该工作流在不同的沙箱环境中运行测试，以确保 Qwen Code 在每种环境下均经过测试：

- `sandbox:none`：不启用任何沙箱机制直接运行测试。
- `sandbox:docker`：在 Docker 容器中运行测试。
- `sandbox:podman`：在 Podman 容器中运行测试。