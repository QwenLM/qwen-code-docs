# Source da sessão em hooks de ciclo de vida

## Contexto

A criação de sessão do daemon já encaminha os valores opcionais `sourceType` e
`sourceId` para o ACP em `_meta['qwen.session.source']`. O runtime do ACP
atualmente usa o tipo de source para desabilitar o cron nativo em sessões de
canal, mas os payloads de hooks de ciclo de vida não conseguem observar nenhum
dos dois valores. Os receivers portanto não podem atribuir a origem de uma nova
sessão quando `SessionStart` dispara antes de a bridge persistir seu source.

## Design

Fazer o parse dos metadados de source existentes uma única vez na fronteira da
sessão ACP. Armazenar as duas strings opcionais no `Config` da sessão, junto do
id da sessão e de outros estados com escopo de sessão, e expor getters
somente leitura.

O handler de eventos de hook adiciona os valores de source presentes à sua
entrada comum:

- `sourceType` vira `source_type`.
- `sourceId` vira `source_id`.

Spreads condicionais de objeto omitem valores ausentes em vez de serializar
campos vazios ou undefined. Como todo evento de ciclo de vida usa o construtor
de entrada comum, `SessionStart`, `UserPromptSubmit`, `Stop` e `SessionEnd`
recebem a mesma atribuição sem cabeamento específico por evento.

## Limites

Isso é uma leitura dos metadados de criação existentes. Não altera a
requisição de criação REST, a chave de metadados da bridge ACP, a negociação
de capabilities, a persistência de sessão ou o comportamento de retomada. Uma
sessão criada sem metadados de source mantém o formato de payload de hook
anterior.

## Verificação

- Testes do handler de hook cobrem campos de source presentes e ausentes em
  payloads de `SessionStart`.
- Testes de sessão ACP cobrem a propagação dos metadados de source de canal
  para o `Config` da sessão.
- Testes existentes do worker de canal continuam cobrindo os metadados de
  criação, incluindo o nome da instância do canal como `sourceId`.
