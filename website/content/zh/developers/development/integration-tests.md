# 集成测试

本文档提供了有关本项目中使用的集成测试框架的信息。

## 概述

集成测试旨在验证 Qwen Code 的端到端功能。它们在受控环境中执行构建好的二进制文件，并验证其在与文件系统交互时的行为是否符合预期。

这些测试位于 `integration-tests` 目录中，并使用自定义测试运行器执行。

## 运行测试

集成测试不会作为默认的 `npm run test` 命令的一部分运行。必须使用 `npm run test:integration:all` 脚本显式运行它们。

也可以使用以下快捷方式运行集成测试：

```bash
npm run test:e2e
```

## 运行特定测试集

要运行部分测试文件，可以使用 `npm run <integration test command> <file_name1> ....`，其中 &lt;integration test command&gt; 是 `test:e2e` 或 `test:integration*` 之一，而 `<file_name>` 是 `integration-tests/` 目录中的任意 `.test.js` 文件。例如，以下命令将运行 `list_directory.test.js` 和 `write_file.test.js`：

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

`all` 命令将为 `无沙箱`、`docker` 和 `podman` 运行测试。
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

集成测试运行器提供了几种诊断选项，以帮助追踪测试失败。

### 保留测试输出

你可以保留测试运行期间创建的临时文件以供检查。这对于调试文件系统操作问题非常有用。

要保留测试输出，请将 `KEEP_OUTPUT` 环境变量设置为 `true`。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

当保留输出时，测试运行器将打印测试运行的唯一目录路径。

### 详细输出

为了进行更详细的调试，可以将 `VERBOSE` 环境变量设置为 `true`。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

当在同一命令中使用 `VERBOSE=true` 和 `KEEP_OUTPUT=true` 时，输出会同时流式传输到控制台，并保存到测试临时目录中的日志文件里。

详细输出的格式能够清晰标识日志来源：

```
--- TEST: <log dir>:<test-name> ---
... 来自 qwen 命令的输出 ...
--- END TEST: <log dir>:<test-name> ---
```

## 代码检查和格式化

为确保代码质量和一致性，集成测试文件会在主构建流程中进行代码检查。你也可以手动运行代码检查工具和自动修复功能。

### 运行代码检查

要检查是否存在代码风格错误，请运行以下命令：

```bash
npm run lint
```

你可以在命令中加入 `:fix` 标志来自动修复任何可修复的代码风格问题：

```bash
npm run lint:fix
```

## 目录结构

集成测试会在 `.integration-tests` 目录内为每次测试运行创建一个唯一的目录。在此目录中，会为每个测试文件创建一个子目录，而每个单独的测试用例也会在对应文件目录下创建一个子目录。

这种结构便于定位特定测试运行、文件或用例的产物。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...其他测试产物...
```

## 持续集成

为确保集成测试始终运行，我们在 `.github/workflows/e2e.yml` 中定义了一个 GitHub Actions 工作流。该工作流会在针对 `main` 分支的拉取请求被提交时，或当拉取请求加入合并队列时自动运行集成测试。

该工作流在不同的沙箱环境中运行测试，以确保 Qwen Code 在每种环境下都经过测试：

- `sandbox:none`：不使用任何沙箱环境直接运行测试。
- `sandbox:docker`：在 Docker 容器中运行测试。
- `sandbox:podman`：在 Podman 容器中运行测试。