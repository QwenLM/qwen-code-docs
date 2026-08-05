# Pipeline de Release DSW SWE-bench Verified

Este pipeline é uma implementação isolada de:

`GitHub Release -> runner DSW auto-hospedado -> submissão de execução curta -> Coordinator persistente + 10 Executors -> Publisher -> resultado do Release`

Ele não usa nem modifica o workflow, serviço, estado ou marcadores de resultado do
PR #7584.

## Comportamento de produção

- Um Release `vX.Y.0` estável inicia o workflow a partir do commit alvo da tag do
  Release. Releases de patch, pré-releases e famílias de tags não relacionadas são
  pulados.
- A tag do Release é resolvida para seu commit Git imutável.
- O manifesto completo de 500 instâncias do SWE-bench Verified é congelado antes
  do despacho.
- O runner auto-hospedado recebe o job do Actions por sua conexão GitHub de saída.
  O script de despacho de uso único congela o manifesto e chama
  `qwen-benchmark-pool submit` para criar a execução e as tarefas iniciais.
- A Action registra o `run_id` do pool e termina sem aguardar o benchmark.
- Um Coordinator persistente e dez Executors persistentes processam a execução.
  Cada Executor reivindica atomicamente uma tarefa e executa um trial Harbor/Docker
  por vez.
- Diretórios de trial ativo do Harbor permanecem em NVMe local. Artefatos de
  tentativa concluídos são copiados para o OSS sem depender de operações de
  permissão POSIX do OSS.
- Executors fazem heartbeat de seus leases e submetem resultados atomicamente.
  Erros de infraestrutura recuperáveis recebem até quatro tentativas com backoff de
  60, 120 e 240 segundos.
- O Coordinator recupera leases expirados, reconcilia contadores de execução e
  aplica os gates de conclusão e publicação do manifesto. Falhas terminais isoladas
  não cancelam as tarefas restantes.
- Um publisher DSW persistente observa execuções terminais e atualiza ativamente o
  Release acionador com o JSON de resultado público e um arquivo de trajetória por
  caso.
- Um score é escrito apenas após todas as 500 instâncias alcançarem um estado
  terminal único, nenhuma tarefa ser cancelada e
  `EXECUTION_ERROR + INFRA_FAILED < 10`. O score é
  `RESOLVED / (RESOLVED + UNRESOLVED)`, usando apenas resultados válidos do grader
  como denominador.
- Dez ou mais erros terminais, uma tarefa cancelada, um resultado ausente ou uma
  trajetória ausente para um caso pontuável tornam a execução `QUARANTINED`; status
  e contagens são escritos sem um score.

## Fronteiras de isolamento

- Label do runner: `qwen-benchmark-dsw`
- Workflow: `.github/workflows/dsw-swe-verified-release.yml`
- Suite: `dsw_release_swe_verified_v1`
- Banco de dados PostgreSQL: `qwen_benchmark_dsw_release_v1`
- Runtime: `/mnt/workspace/qwen-benchmark-dsw-release-v1`
- Credencial do modelo:
  `/mnt/workspace/qwen-benchmark-dsw-release-v1/config/model.key`
  (`root:github-runner`, modo `0640`)
- OSS: `/mnt/data/qwen-benchmark/dsw-release-v1`
- Marcadores de release: `qwen-code-dsw-swe-verified`

Camadas de imagem Docker podem usar o cache do host DSW, mas o estado e artefatos
do experimento não compartilham caminhos ou tabelas com outro pipeline de
benchmark.

## Validação de branch

Use `workflow_dispatch` a partir desta branch e direcione a um pré-release isolado.
Execuções automáticas de `release.published` são intencionalmente limitadas a
releases `vX.Y.0` estáveis.

Para um pré-release de teste despachado manualmente, uma única linha de corpo como
`Benchmark-Qwen-Ref: v0.20.0-nightly.20260722.b98306b7e` seleciona uma versão npm
do Qwen já publicada enquanto mantém o resultado no Release POC isolado. Este
override é aceito apenas para pré-releases. Um Release normal sempre avalia sua
própria tag.

`workflow_dispatch` permanece disponível para diagnósticos e reexecuções
explícitas. A validação manual usa como padrão uma instância para limitar tempo e
custo de modelo; execuções de 5 e 500 instâncias não encaminham o `instance_id` de
caso único. Ambos os gatilhos são assíncronos: o Actions registra um recibo de
despacho mas não permanece vivo pela duração do benchmark.

## Fronteira de componentes

- Runner GitHub auto-hospedado: receptor de jobs do GitHub de longa duração.
- Despacho / submissão ao pool: criador de execução e tarefas de uso único.
- PostgreSQL: armazenamento de estado persistente compartilhado, não o agendador.
- Coordinator: recuperação de lease expirado, reconciliação de execução e gate de
  conclusão.
- Executors: reivindicação de tarefa, execução de Harbor/Qwen Code/grader,
  heartbeat e submissão de resultados.
- Publisher: validação de execução terminal, geração de bundle de resultado público
  e trajetória e writeback ativo no Release do GitHub.

A implementação DSW é mantida separadamente no repositório interno
`qwen-code-benchmark-dsw`. Este PR contém apenas o gatilho do GitHub, manifesto,
adaptador de despacho e contrato de design público.

## Validação de suite completa

A validação isolada de pré-release foi concluída em 2026-07-25:

- Release de teste:
  `dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3`
- Execução do GitHub Actions: `30079405895`
- Execução do pool: `pool-31a24bc8acca49d2`
- Dataset: `swe-bench/swe-bench-verified@2`, 500 instâncias congeladas
- Execução: 10 Executors persistentes, no máximo duas tentativas por instância
- Qwen Code: `v0.20.0-nightly.20260722.b98306b7e`
- Modelo: `qwen3.7-max`
- Tempo de parede: aproximadamente 12 horas e 27 minutos
- Resultados: 332 `RESOLVED`, 107 `UNRESOLVED`, 56 `EXECUTION_ERROR`,
  5 `INFRA_FAILED`
- Cobertura válida do grader: 439/500 (87.8%)
- Taxa resolvida de diagnóstico entre resultados válidos do grader: 332/439 (75.6%)
- Status da execução: `QUARANTINED`; nenhum score oficial foi publicado
- JSON público: 500 registros e 500 IDs de instância únicos

Evidências:

- https://github.com/QwenLM/qwen-code/releases/tag/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3
- https://github.com/QwenLM/qwen-code/actions/runs/30079405895
- https://github.com/QwenLM/qwen-code/releases/download/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3/swe-bench-verified-dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3.json

A cadeia completa foi validada, incluindo despacho assíncrono, execução de
task-pool, quarentena estrita e writeback do Publisher. A execução não é um score
oficial de modelo: 61 instâncias não tinham resultados válidos do grader, e um
pool de Executors em execução reteve um classificador de erro mais antigo após uma
atualização a quente de origem. Uma reexecução completa limpa exige um
commit/digest de worker fixado e Executors reiniciados e com versão verificada.
