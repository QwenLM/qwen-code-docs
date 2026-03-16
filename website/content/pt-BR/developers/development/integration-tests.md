# Testes de Integração

Este documento fornece informações sobre o framework de testes de integração utilizado neste projeto.

## Visão Geral

Os testes de integração são projetados para validar a funcionalidade ponta a ponta do Qwen Code. Eles executam o binário compilado em um ambiente controlado e verificam se ele se comporta conforme o esperado ao interagir com o sistema de arquivos.

Esses testes estão localizados no diretório `integration-tests` e são executados usando um executor de testes personalizado.

## Executando os testes

Os testes de integração não são executados como parte do comando padrão `npm run test`. Eles devem ser executados explicitamente usando o script `npm run test:integration:all`.

Os testes de integração também podem ser executados usando o seguinte atalho:

```bash
npm run test:e2e
```

## Executando um conjunto específico de testes

Para executar um subconjunto de arquivos de teste, você pode usar `npm run <comando de teste de integração> <nome_do_arquivo1> ...`, em que `<comando de teste de integração>` é `test:e2e` ou `test:integration*` e `<nome_do_arquivo>` é qualquer um dos arquivos `.test.js` no diretório `integration-tests/`. Por exemplo, o comando a seguir executa `list_directory.test.js` e `write_file.test.js`:

```bash
npm run test:e2e list_directory write_file
```

### Executando um único teste pelo nome

Para executar um único teste pelo seu nome, use a flag `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "lê um arquivo"
```

### Executando todos os testes

Para executar toda a suíte de testes de integração, use o seguinte comando:

```bash
npm run test:integration:all
```

### Matriz de sandbox

O comando `all` executará testes para `sem sandbox`, `docker` e `podman`.  
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

O executor de testes de integração fornece diversas opções de diagnóstico para ajudar na identificação de falhas nos testes.

### Manter a saída dos testes

Você pode preservar os arquivos temporários criados durante a execução de um teste para inspeção. Isso é útil ao depurar problemas relacionados a operações no sistema de arquivos.

Para manter a saída dos testes, defina a variável de ambiente `KEEP_OUTPUT` como `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Quando a saída for mantida, o executor de testes exibirá o caminho até o diretório exclusivo correspondente à execução do teste.

### Saída detalhada

Para depuração mais detalhada, defina a variável de ambiente `VERBOSE` como `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Ao usar `VERBOSE=true` e `KEEP_OUTPUT=true` no mesmo comando, a saída é transmitida para o console e também salva em um arquivo de log dentro do diretório temporário do teste.

A saída detalhada é formatada para identificar claramente a origem dos logs:

```
--- TESTE: <diretório-de-logs>:<nome-do-teste> ---
... saída do comando qwen ...
--- FIM DO TESTE: <diretório-de-logs>:<nome-do-teste> ---
```

## Verificação e formatação de código

Para garantir qualidade e consistência do código, os arquivos de testes de integração são verificados por um linter como parte do processo principal de compilação. Você também pode executar manualmente o linter e o corretor automático.

### Executando o linter

Para verificar erros de linting, execute o seguinte comando:

```bash
npm run lint
```

Você pode incluir a flag `:fix` no comando para corrigir automaticamente quaisquer erros de linting passíveis de correção:

```bash
npm run lint:fix
```

## Estrutura de diretórios

Os testes de integração criam um diretório exclusivo para cada execução de teste dentro do diretório `.integration-tests`. Nesse diretório, é criado um subdiretório para cada arquivo de teste e, dentro dele, um subdiretório para cada caso de teste individual.

Essa estrutura facilita a localização dos artefatos de uma execução específica de teste, arquivo ou caso.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...outros artefatos do teste...
```

## Integração contínua

Para garantir que os testes de integração sejam sempre executados, um fluxo de trabalho do GitHub Actions é definido em `.github/workflows/e2e.yml`. Esse fluxo de trabalho executa automaticamente os testes de integração para pull requests direcionadas à branch `main` ou quando uma pull request é adicionada a uma fila de merge.

O fluxo de trabalho executa os testes em diferentes ambientes de isolamento (sandboxing) para garantir que o Qwen Code seja testado em cada um deles:

- `sandbox:none`: Executa os testes sem nenhum isolamento.
- `sandbox:docker`: Executa os testes em um contêiner Docker.
- `sandbox:podman`: Executa os testes em um contêiner Podman.