# 集成测试

本文档提供了关于本项目中使用的集成测试框架的信息。

## 概述

集成测试旨在验证 Qwen Code 的端到端功能。它们在受控环境中执行构建好的二进制文件，并验证其在与文件系统交互时的行为是否符合预期。

这些测试位于 `integration-tests` 目录中，并使用自定义的 test runner 来运行。

## 运行测试

集成测试不会作为默认的 `npm run test` 命令的一部分来运行。你必须显式地使用 `npm run test:integration:all` 脚本来运行它们。

也可以通过以下快捷方式运行集成测试：

```bash
npm run test:e2e
```

## 运行特定测试集

要运行部分测试文件，可以使用 `npm run <integration test command> <file_name1> ....`，其中 &lt;integration test command&gt; 是 `test:e2e` 或 `test:integration*`，而 `<file_name>` 是 `integration-tests/` 目录下的任意 `.test.js` 文件。例如，以下命令会运行 `list_directory.test.js` 和 `write_file.test.js`：

```bash
npm run test:e2e list_directory write_file
```

### 根据名称运行单个测试

要根据测试名称运行单个测试，可以使用 `--test-name-pattern` 参数：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 运行所有测试

要运行完整的集成测试套件，请使用以下命令：

```bash
npm run test:integration:all
```

### Sandbox 矩阵

`all` 命令会为 `no sandboxing`、`docker` 和 `podman` 运行测试。
每种类型可以使用以下命令单独运行：

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

集成测试运行器提供了几个诊断选项，帮助追踪测试失败的原因。

### 保留测试输出

你可以保留测试运行期间创建的临时文件以便检查。这对于调试文件系统操作相关的问题非常有用。

要保留测试输出，请将 `KEEP_OUTPUT` 环境变量设置为 `true`。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

当保留输出时，测试运行器会打印出本次测试运行的唯一目录路径。

### 详细输出

如果需要更详细的调试信息，可以将 `VERBOSE` 环境变量设置为 `true`。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

当在同一命令中使用 `VERBOSE=true` 和 `KEEP_OUTPUT=true` 时，输出会同时流式显示在控制台中，并保存到测试临时目录下的日志文件中。

详细输出的格式会清晰标明日志来源：

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## 代码检查和格式化

为了确保代码质量和一致性，集成测试文件会在主构建流程中进行 lint 检查。你也可以手动运行 linter 和自动修复工具。

### 运行 linter

要检查是否存在 lint 错误，请运行以下命令：

```bash
npm run lint
```

你可以在命令中加上 `:fix` 参数来自动修复所有可修复的 lint 错误：

```bash
npm run lint:fix
```

## 目录结构

集成测试会在 `.integration-tests` 目录内为每次测试运行创建一个唯一的目录。在此目录中，会为每个测试文件创建一个子目录，而在该子目录中，会为每个单独的测试用例创建一个子目录。

这种结构使得定位特定测试运行、文件或用例的 artifacts 变得非常简单。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...其他测试 artifacts...
```

## 持续集成

为确保集成测试始终运行，我们在 `.github/workflows/e2e.yml` 中定义了一个 GitHub Actions 工作流。该工作流会自动对针对 `main` 分支的 Pull Request 运行集成测试，或者在 Pull Request 被加入合并队列时运行。

该工作流会在不同的沙箱环境中运行测试，以确保 Qwen Code 在每种环境下都经过测试：

- `sandbox:none`：不使用任何沙箱环境直接运行测试。
- `sandbox:docker`：在 Docker 容器中运行测试。
- `sandbox:podman`：在 Podman 容器中运行测试。