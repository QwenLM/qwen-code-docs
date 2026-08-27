# 集成测试

本文档提供了本项目中所使用的集成测试框架的相关信息。

## 概述

集成测试旨在验证 Qwen Code 的端到端功能。它们在受控环境中执行构建后的二进制文件，并验证其在与文件系统交互时的行为是否符合预期。

这些测试位于 `integration-tests` 目录中，并使用自定义测试运行器来执行。

## 运行测试

集成测试不会作为默认的 `npm run test` 命令的一部分运行。必须使用 `npm run test:integration:all` 脚本显式运行。

也可以使用以下快捷命令运行集成测试：

```bash
npm run test:e2e
```

## 运行特定测试集

要运行部分测试文件，可以使用 `npm run <集成测试命令> <文件名1> ....`，其中 `<集成测试命令>` 是 `test:e2e` 或 `test:integration*`，`<文件名>` 是 `integration-tests/` 目录下的任意 `.test.ts` 文件。例如，以下命令会运行 `list_directory.test.ts` 和 `write_file.test.ts`：

```bash
npm run test:e2e list_directory write_file
```

### 按名称运行单个测试

要按名称运行单个测试，请使用 `--test-name-pattern` 标志：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 运行所有测试

要运行整个集成测试套件，请使用以下命令：

```bash
npm run test:integration:all
```

### 沙箱矩阵

`all` 命令会针对 `no sandboxing`、`docker` 和 `podman` 运行测试。
每个独立类型可以使用以下命令运行：

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

集成测试运行器提供了多个诊断选项，以帮助追踪测试失败的原因。

### 保留测试输出

你可以保留测试运行期间创建的临时文件以供检查。这对于调试文件系统操作相关的问题非常有用。

要保留测试输出，请将 `KEEP_OUTPUT` 环境变量设置为 `true`。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

当输出被保留时，测试运行器会打印出该次测试运行的唯一目录路径。

### 详细输出

要获取更详细的调试信息，请将 `VERBOSE` 环境变量设置为 `true`。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

在同一命令中使用 `VERBOSE=true` 和 `KEEP_OUTPUT=true` 时，输出会同时流式传输到控制台，并保存到测试临时目录内的日志文件中。

详细输出的格式会清晰地标识日志来源：

```
--- TEST: <日志目录>:<测试名称> ---
... qwen 命令的输出 ...
--- END TEST: <日志目录>:<测试名称> ---
```

## 代码检查与格式化

为确保代码质量和一致性，集成测试文件会作为主要构建过程的一部分进行代码检查。你也可以手动运行检查器和自动修复工具。

### 运行检查器

要检查代码检查错误，请运行以下命令：

```bash
npm run lint
```

你可以在命令中包含 `:fix` 标志，以自动修复所有可修复的代码检查错误：

```bash
npm run lint:fix
```

## 目录结构

集成测试会在 `.integration-tests` 目录内为每次测试运行创建一个唯一目录。在此目录内，为每个测试文件创建一个子目录，并在该子目录内为每个独立的测试用例创建子目录。

这种结构使得定位特定测试运行、文件或用例的产物变得容易。

```
.integration-tests/
└── <运行ID>/
    └── <测试文件名>.test.ts/
        └── <测试用例名称>/
            ├── output.log
            └── ...其他测试产物...
```

## 持续集成

为确保集成测试始终运行，在 `.github/workflows/e2e.yml` 中定义了一个 GitHub Actions 工作流。该工作流会在针对 `main` 分支的拉取请求（或当拉取请求被添加到合并队列时）自动运行集成测试。

该工作流会在不同的沙箱环境中运行测试，以确保 Qwen Code 在每个环境下都经过了测试：

- `sandbox:none`: 在无沙箱的情况下运行测试。
- `sandbox:docker`: 在 Docker 容器中运行测试。
- `sandbox:podman`: 在 Podman 容器中运行测试。