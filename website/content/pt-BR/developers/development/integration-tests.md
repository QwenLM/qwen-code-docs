# Testes de integração

Este documento fornece informações sobre o framework de testes de integração utilizado neste projeto.

## Visão geral

Os testes de integração são projetados para validar a funcionalidade end-to-end do Qwen Code. Eles executam o binário compilado em um ambiente controlado e verificam se ele se comporta conforme o esperado ao interagir com o sistema de arquivos.

Esses testes estão localizados no diretório `integration-tests` e são executados usando um test runner personalizado.

## Executando os testes

Os testes de integração não são executados como parte do comando padrão `npm run test`. Eles devem ser executados explicitamente usando o script `npm run test:integration:all`.

Os testes de integração também podem ser executados usando o seguinte atalho:

```bash
npm run test:e2e
```

## Executando um conjunto específico de testes

Para executar um subconjunto de arquivos de teste, você pode usar `npm run <comando de teste de integração> <nome_arquivo1> ....`, onde &lt;comando de teste de integração&gt; é `test:e2e` ou `test:integration*` e `<nome_arquivo>` é qualquer um dos arquivos `.test.js` no diretório `integration-tests/`. Por exemplo, o comando a seguir executa `list_directory.test.js` e `write_file.test.js`:

```bash
npm run test:e2e list_directory write_file
```

### Executando um único teste pelo nome

Para executar um único teste pelo nome, use a flag `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Executando todos os testes

Para executar toda a suíte de testes de integração, use o seguinte comando:

```bash
npm run test:integration:all
```

### Matriz de sandbox

O comando `all` executará testes para `no sandboxing`, `docker` e `podman`.
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

## Diagnóstico

O test runner de integração fornece várias opções de diagnóstico para ajudar a rastrear falhas nos testes.

### Mantendo a saída dos testes

Você pode preservar os arquivos temporários criados durante uma execução de teste para inspeção. Isso é útil para depurar problemas com operações no sistema de arquivos.

Para manter a saída do teste, defina a variável de ambiente `KEEP_OUTPUT` como `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Quando a saída é mantida, o test runner imprimirá o caminho para o diretório exclusivo da execução do teste.

### Saída detalhada

Para uma depuração mais detalhada, defina a variável de ambiente `VERBOSE` como `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Ao usar `VERBOSE=true` e `KEEP_OUTPUT=true` no mesmo comando, a saída é transmitida para o console e também salva em um arquivo de log dentro do diretório temporário do teste.

A saída detalhada é formatada para identificar claramente a origem dos logs:

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting e formatação

Para garantir a qualidade e a consistência do código, os arquivos de teste de integração passam por linting como parte do processo principal de build. Você também pode executar manualmente o linter e o auto-fixer.

### Executando o linter

Para verificar erros de linting, execute o seguinte comando:

```bash
npm run lint
```

Você pode incluir a flag `:fix` no comando para corrigir automaticamente quaisquer erros de linting corrigíveis:

```bash
npm run lint:fix
```

## Estrutura de diretórios

Os testes de integração criam um diretório exclusivo para cada execução de teste dentro do diretório `.integration-tests`. Dentro desse diretório, um subdiretório é criado para cada arquivo de teste e, dentro dele, um subdiretório é criado para cada caso de teste individual.

Essa estrutura facilita a localização dos artefatos de uma execução, arquivo ou caso de teste específico.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## Integração contínua

Para garantir que os testes de integração sejam sempre executados, um workflow do GitHub Actions é definido em `.github/workflows/e2e.yml`. Esse workflow executa automaticamente os testes de integração para pull requests direcionados à branch `main` ou quando um pull request é adicionado a uma fila de merge.

O workflow executa os testes em diferentes ambientes de sandbox para garantir que o Qwen Code seja testado em cada um deles:

- `sandbox:none`: Executa os testes sem nenhum sandboxing.
- `sandbox:docker`: Executa os testes em um container Docker.
- `sandbox:podman`: Executa os testes em um container Podman.