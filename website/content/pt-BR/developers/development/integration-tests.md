# Testes de Integração

Este documento fornece informações sobre a estrutura de testes de integração usada neste projeto.

## Visão Geral

Os testes de integração foram projetados para validar a funcionalidade de ponta a ponta do Qwen Code. Eles executam o binário compilado em um ambiente controlado e verificam se ele se comporta conforme o esperado ao interagir com o sistema de arquivos.

Esses testes estão localizados no diretório `integration-tests` e são executados usando um executor de testes personalizado.

## Executando os Testes

Os testes de integração não são executados como parte do comando padrão `npm run test`. Eles devem ser executados explicitamente usando o script `npm run test:integration:all`.

Os testes de integração também podem ser executados usando o seguinte atalho:

```bash
npm run test:e2e
```

## Executando um Conjunto Específico de Testes

Para executar um subconjunto de arquivos de teste, você pode usar `npm run <comando de teste de integração> <nome_do_arquivo1> ....` onde &lt;comando de teste de integração&gt; é `test:e2e` ou `test:integration*` e `<nome_do_arquivo>` é qualquer um dos arquivos `.test.ts` no diretório `integration-tests/`. Por exemplo, o seguinte comando executa `list_directory.test.ts` e `write_file.test.ts`:

```bash
npm run test:e2e list_directory write_file
```

### Executando um Único Teste pelo Nome

Para executar um único teste pelo nome, use a flag `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Executando Todos os Testes

Para executar toda a suíte de testes de integração, use o seguinte comando:

```bash
npm run test:integration:all
```

### Matriz de Sandbox

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

O executor de testes de integração fornece várias opções de diagnóstico para ajudar a rastrear falhas nos testes.

### Manter a Saída dos Testes

Você pode preservar os arquivos temporários criados durante uma execução de teste para inspeção. Isso é útil para depurar problemas com operações do sistema de arquivos.

Para manter a saída dos testes, defina a variável de ambiente `KEEP_OUTPUT` como `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Quando a saída é mantida, o executor de testes imprimirá o caminho para o diretório exclusivo da execução do teste.

### Saída Detalhada

Para depuração mais detalhada, defina a variável de ambiente `VERBOSE` como `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Ao usar `VERBOSE=true` e `KEEP_OUTPUT=true` no mesmo comando, a saída é transmitida para o console e também salva em um arquivo de log dentro do diretório temporário do teste.

A saída detalhada é formatada para identificar claramente a origem dos logs:

```
--- TESTE: <diretório do log>:<nome do teste> ---
... saída do comando qwen ...
--- FIM DO TESTE: <diretório do log>:<nome do teste> ---
```

## Linting e Formatação

Para garantir a qualidade e consistência do código, os arquivos de teste de integração passam por lint como parte do processo de build principal. Você também pode executar o linter e o auto-fix manualmente.

### Executando o Linter

Para verificar erros de lint, execute o seguinte comando:

```bash
npm run lint
```

Você pode incluir a flag `:fix` no comando para corrigir automaticamente quaisquer erros de lint corrigíveis:

```bash
npm run lint:fix
```

## Estrutura de Diretórios

Os testes de integração criam um diretório exclusivo para cada execução de teste dentro do diretório `.integration-tests`. Dentro deste diretório, um subdiretório é criado para cada arquivo de teste e, dentro dele, um subdiretório é criado para cada caso de teste individual.

Essa estrutura facilita a localização dos artefatos para uma execução de teste, arquivo ou caso específico.

```
.integration-tests/
└── <id-da-execução>/
    └── <nome-do-arquivo-de-teste>.test.ts/
        └── <nome-do-caso-de-teste>/
            ├── output.log
            └── ...outros artefatos de teste...
```

## Integração Contínua

Para garantir que os testes de integração sejam sempre executados, um workflow do GitHub Actions está definido em `.github/workflows/e2e.yml`. Este workflow executa automaticamente os testes de integração para pull requests contra a branch `main`, ou quando um pull request é adicionado a uma fila de merge.

O workflow executa os testes em diferentes ambientes de sandbox para garantir que o Qwen Code seja testado em cada um deles:

- `sandbox:none`: Executa os testes sem nenhum sandbox.
- `sandbox:docker`: Executa os testes em um contêiner Docker.
- `sandbox:podman`: Executa os testes em um contêiner Podman.
