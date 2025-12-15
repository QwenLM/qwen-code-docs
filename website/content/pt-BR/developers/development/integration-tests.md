# Testes de Integração

Este documento fornece informações sobre o framework de testes de integração utilizado neste projeto.

## Visão Geral

Os testes de integração são projetados para validar a funcionalidade de ponta a ponta do Qwen Code. Eles executam o binário construído em um ambiente controlado e verificam se ele se comporta conforme esperado ao interagir com o sistema de arquivos.

Esses testes estão localizados no diretório `integration-tests` e são executados usando um executor de testes personalizado.

## Executando os testes

Os testes de integração não são executados como parte do comando padrão `npm run test`. Eles devem ser executados explicitamente usando o script `npm run test:integration:all`.

Os testes de integração também podem ser executados usando o seguinte atalho:

```bash
npm run test:e2e
```

## Executando um conjunto específico de testes

Para executar um subconjunto de arquivos de teste, você pode usar `npm run <integration test command> <file_name1> ....` onde &lt;integration test command&gt; é `test:e2e` ou `test:integration*` e `<file_name>` é qualquer um dos arquivos `.test.js` no diretório `integration-tests/`. Por exemplo, o seguinte comando executa `list_directory.test.js` e `write_file.test.js`:

```bash
npm run test:e2e list_directory write_file
```

### Executando um único teste por nome

Para executar um único teste pelo seu nome, use a flag `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Executando todos os testes

Para executar toda a suíte de testes de integração, use o seguinte comando:

```bash
npm run test:integration:all
```

### Matriz de sandbox

O comando `all` irá executar testes para `sem sandboxing`, `docker` e `podman`.
Cada tipo individual pode ser executado usando os seguintes comandos:

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## Diagnósticos

O executor de testes de integração oferece várias opções de diagnóstico para ajudar a rastrear falhas nos testes.

### Mantendo a saída dos testes

Você pode preservar os arquivos temporários criados durante uma execução de teste para inspeção. Isso é útil para depurar problemas com operações do sistema de arquivos.

Para manter a saída do teste, defina a variável de ambiente `KEEP_OUTPUT` como `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Quando a saída é mantida, o executor de testes imprimirá o caminho para o diretório único da execução do teste.

### Saída detalhada

Para depuração mais detalhada, defina a variável de ambiente `VERBOSE` como `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Ao usar `VERBOSE=true` e `KEEP_OUTPUT=true` no mesmo comando, a saída é transmitida para o console e também salva em um arquivo de log dentro do diretório temporário do teste.

A saída detalhada é formatada para identificar claramente a origem dos logs:

```
--- TEST: <log dir>:<test-name> ---
... output do comando qwen ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting e formatação

Para garantir qualidade e consistência do código, os arquivos de teste de integração passam pelo processo de linting como parte do build principal. Você também pode executar manualmente o linter e o corretor automático.

### Executando o linter

Para verificar erros de linting, execute o seguinte comando:

```bash
npm run lint
```

Você pode incluir a flag `:fix` no comando para corrigir automaticamente quaisquer erros de linting que possam ser corrigidos:

```bash
npm run lint:fix
```

## Estrutura de diretórios

Os testes de integração criam um diretório único para cada execução de teste dentro do diretório `.integration-tests`. Dentro deste diretório, é criado um subdiretório para cada arquivo de teste, e dentro desse, um subdiretório é criado para cada caso de teste individual.

Essa estrutura facilita a localização dos artefatos para uma execução, arquivo ou caso específico de teste.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...outros artefatos de teste...
```

## Integração contínua

Para garantir que os testes de integração sejam sempre executados, um fluxo de trabalho do GitHub Actions é definido em `.github/workflows/e2e.yml`. Este fluxo de trabalho executa automaticamente os testes de integração para pull requests contra o branch `main`, ou quando um pull request é adicionado a uma fila de merge.

O fluxo de trabalho executa os testes em diferentes ambientes de sandboxing para garantir que o Qwen Code seja testado em cada um:

- `sandbox:none`: Executa os testes sem nenhum sandboxing.
- `sandbox:docker`: Executa os testes em um container Docker.
- `sandbox:podman`: Executa os testes em um container Podman.