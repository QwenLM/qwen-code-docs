# Modo Batch (DashScope)

A API Batch do DashScope executa requisições de forma assíncrona pela metade do preço em tempo real, com uma janela de conclusão de pelo menos 24 horas. O Qwen Code a utiliza através do `/batch-api`: você descreve uma tarefa em lote, o agente prepara um plano e o `qwen batch` o submete, acompanha e escreve os resultados como arquivos.

## Configurar um modelo Batch

Declare o endpoint e a credencial uma vez em `settings.json` e depois selecione-o com `batch.model`. Seu modelo de conversa comum e a autenticação permanecem inalterados, inclusive quando a conversa usa Qwen OAuth ou outro provedor.

```json
{
  "env": { "DASHSCOPE_API_KEY": "your-key" },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "batch": { "authType": "openai", "model": "qwen3.7-plus" }
}
```

Mescle esses campos nas suas configurações existentes, mantendo suas outras entradas de provedor. `envKey` nomeia a chave em `settings.env` (ou uma variável de ambiente); nenhuma exportação separada no shell é necessária. O `generationConfig` do provedor controla a geração Batch. `wireApi` é o protocolo de requisição, não um interruptor Batch: omita-o ou use `"chat-completions"`; `"responses"` não é suportado por este executor.

`batch.authType` tem como padrão `openai`. O modelo deve corresponder a exatamente uma entrada de chat-completions compatível com OpenAI com um `baseUrl` e um `envKey` preenchido. Se os IDs se repetirem, defina `batch.baseUrl` como a URL configurada exata. Seleções explícitas inválidas falham antes de qualquer upload; elas nunca recorrem às credenciais de conversa. Reinicie a sessão interativa após alterar essa seleção para que seu coletor em segundo plano use as mesmas configurações dos comandos filhos.

Sem uma seleção Batch, o comportamento anterior permanece: o Batch reutiliza a configuração do modelo principal e requer autenticação por chave de API compatível com OpenAI. As credenciais Qwen OAuth não possuem uma rota Batch. Execute `qwen batch check` para verificar a prontidão sem enviar uma requisição paga.

## Quando o batch é a ferramenta certa

- **Metade do preço, sem cache.** O Batch cobra requisições bem-sucedidas a 50% do preço de tabela em tempo real, mas o cache de prefixo nunca acerta dentro de um batch (medido `cached_tokens: 0`). O tempo real cobra entrada em cache a 20% do preço de tabela, então o batch só vale a pena quando pouco de cada requisição é compartilhado: com uma taxa de acerto de cache `h`, o tempo real custa cerca de `1 − 0.8h` do preço de tabela na entrada, e o batch perde quando `h` ultrapassa 0,625.
- **Bom uso:** muitas requisições independentes de turno único, cada uma dominada por seu próprio conteúdo — traduzir ou resumir um conjunto de documentos, extrair dados por arquivo. Saídas longas favorecem ainda mais o batch.
- **Mau uso:** um manual compartilhado longo ou prefixo few-shot com itens curtos, poucos itens, qualquer coisa que precise de mais de um turno. Rotear os próprios turnos de um agente pelo Batch foi medido em 1,03× o tempo real e horas mais lento.
- **Latência:** de segundos a horas, principalmente em fila, e varia por modelo. Conte com o fato de ser barato, não rápido.

Para verificar uma tarefa antes de confirmá-la, envie uma requisição em tempo real e compare `usage.prompt_tokens_details.cached_tokens` com `usage.prompt_tokens`.

## `/batch-api`

```text
/batch-api translate the Markdown docs in docs/zh into English,
writing them to docs/en with the same file names
```

O agente executa `qwen batch check`, confirma que a tarefa se encaixa, lê uma pequena amostra, escreve um plano em `.qwen/batch/plans/` e o visualiza — nada é enviado ou cobrado:

```bash
qwen batch run .qwen/batch/plans/<slug>.json --dry-run
# preview: 42 item(s), window 24h — nothing uploaded, nothing billed
# model qwen-plus, thinking off, max output 8192 tokens (frozen from your current settings; retries reuse them)
# writes new files to: docs/en/ (42)
# ~180,000 in / ~190,000 out tokens (rough estimate); ...
# snapshot 3f9c2a7e5d10b884; submit exactly this batch with: qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
```

Em seguida, ele envia esse snapshot. O prompt de aprovação para este comando é onde você decide gastar, com a visualização acima; se o plano, um arquivo de origem ou suas configurações mudarem nesse intervalo, o envio é recusado.

```bash
qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
# task translate-docs-20260923103000: 42 item(s), window 24h
# ...
# batch job: batch_abc123
```

`run` retorna imediatamente e **você não precisa coletar manualmente**. O agente inicia `qwen batch collect <task-id> --wait` como uma tarefa em segundo plano (visível em `/tasks`) e encerra seu turno, para que você possa continuar trabalhando. Esse processo consulta o provedor via HTTP — nenhuma chamada de modelo enquanto você espera — e quando o batch termina, ele escreve os resultados e sai. O agente então é despertado uma vez: ele informa o que foi entregue, retido ou falhou, e faz qualquer acompanhamento que você tenha solicitado na requisição original. Itens com falha nunca são repetidos automaticamente, pois uma repetição cobra novamente.

Se a sessão fechar primeiro, nada é perdido: uma sessão interativa coleta as tarefas finalizadas do projeto na inicialização e enquanto estiver aberta, e exibe um aviso. Defina `general.batchAutoCollect` como `false` para desativar isso. Execuções headless (`qwen -p`), `qwen serve` e clientes IDE/ACP não fazem coleta automática.

Os comandos funcionam de qualquer diretório e dentro de uma sessão com o prefixo `!` (por exemplo, `!qwen batch collect <task-id>`), para que nenhum turno de modelo seja gasto:

```bash
qwen batch check                         # verify setup; nothing is billed
qwen batch collect <task-id> [--wait [--timeout <s>]]   # validate + write target files
qwen batch retry <task-id>               # resubmit only the failed items
qwen batch retry <task-id> --max-output-tokens 8192  # include truncated ones
qwen batch list                          # every recorded task, with its project
qwen batch cancel <task-id>              # partial results are still billed
qwen batch clean <task-id>               # delete the local record (cancels nothing)
```

`collect` relata cada item como:

- **delivered** — escrito em seu destino;
- **held** — a origem mudou após o envio (`retry` o reenvia contra a nova origem), ou o destino já existe com conteúdo diferente (resolva e execute `collect` novamente; nenhuma nova requisição é feita);
- **failed** — truncado, vazio, uma chamada de ferramenta ou um erro do provedor; `retry` reenvia estes, itens truncados apenas com um `--max-output-tokens` maior.

Reexecutar `collect` é sempre seguro: itens entregues nunca são refeitos e o uso nunca é contado em duplicidade. Quando os resultados estão no disco, os arquivos remotos de entrada e saída são excluídos.

## Registros, segurança e custo

- Os registros de tarefas ficam em `~/.qwen/batch/tasks/<task-id>/` (`QWEN_BATCH_HOME` sobrescreve) com permissões apenas para o proprietário, pois contêm cópias completas das suas origens e saídas. Arquivos de plano no `.qwen/batch/` do projeto recebem um `.gitignore`.
- Uma tarefa está vinculada ao endpoint e à chave de API com os quais foi enviada (apenas um hash curto da chave é armazenado); após trocar de conta ou região, os comandos recusam até que você volte.
- Se a resposta da chamada de criação for perdida, `run` falha, a tarefa é marcada como `submit-unknown` e `collect` reconcilia com a lista de batch do provedor em vez de reenviar — um duplicado cobraria duas vezes.
- Apenas um comando `qwen batch` trabalha em uma tarefa por vez.
- Uma execução congela seus parâmetros de amostragem atuais, limite de saída e modo de pensamento; as repetições os reutilizam.
- As estimativas são baseadas em tokens, a menos que você defina `QWEN_BATCH_INPUT_PRICE_PER_1M_USD` e `QWEN_BATCH_OUTPUT_PRICE_PER_1M_USD`. A estimativa aproximada exclui os tokens de pensamento, que podem ser várias vezes a saída. O `maxCostUsd` de um plano é aplicado ao pior caso nos limites da requisição: ele precisa desses preços, um `maxOutputTokens` e pensamento desligado ou um `thinking_budget`, ou a execução é recusada. Nenhum dos valores inclui o que sua sessão gastou preparando o plano.
- Uma limpeza remota que falha nunca bloqueia `retry`, `cancel` ou `clean`; um `collect` posterior a tenta novamente. Um arquivo de resultado que o provedor não pode servir completamente (após um download novo) ou não possui mais falha nos itens afetados em vez de deixar a tarefa presa.
- `clean` recusa enquanto um batch pode ainda estar em execução ou possui resultados não coletados, a menos que você passe `--force`.
- Os destinos devem permanecer dentro do projeto e fora de qualquer caminho oculto (`.git/`, `.github/`, `.qwen/`, … em qualquer profundidade): os resultados são escritos horas após você aprovar o plano. A visualização lista os diretórios de destino.

Design: [`docs/design/2026-09-23-batch-api-design.md`](../../design/2026-09-23-batch-api-design.md).
Uma verificação offline ponta a ponta (Batch API falsa, CLI real compilado) está em [`docs/verification/batch-api/`](../../verification/batch-api/README.md).