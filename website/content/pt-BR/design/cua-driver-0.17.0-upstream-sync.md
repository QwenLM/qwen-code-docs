# Sincronização upstream do CUA Driver 0.17.0

## Objetivo

Mover a fonte vendored do CUA Driver do upstream `cua-driver-rs-v0.7.0` para a
tag lançada `cua-driver-rs-v0.17.0`, preservando o contrato de runtime e
distribuição específico do Qwen.

A tag de release, commit `10279552e2bbe479e367a082f78b1b98ee85a697`, é a
fonte da verdade. O checkout local `/Users/mochi/code/cua`, notas de design
antigas e artefatos gerados são apenas entradas para comparação.

## Escopo

A importação upstream é limitada a `trycua/cua:libs/cua-driver`, mapeada para
`packages/cua-driver`. Workflows do monorepo upstream, scripts raiz,
documentação e bibliotecas não relacionadas não são importados
automaticamente. Qualquer nova dependência desses arquivos deve ser tornada
local do pacote ou mapeada explicitamente para uma facilidade existente do
Qwen Code.

O workflow de release pertencente ao Qwen permanece
`.github/workflows/cd-cua-driver.yml`. Ele pode receber as mudanças mínimas
requeridas pelo novo contrato de build e release do driver, mas deve continuar
publicando artefatos pertencentes ao Qwen.

## Deltas requeridos do Qwen

A sincronização está incompleta a menos que todos estes permaneçam efetivos:

1. O executável instalado, processo, app bundle, identificador de bundle,
   caminhos, serviços agendados, documentação e ativos de release usam a
   identidade pertencente ao Qwen esperada pela linha de release atual do
   Qwen. O home do estado de release permanece `~/.cua-driver` para
   compatibilidade de upgrade; o home isolado de build local permanece
   `~/.qwen-cua-driver-local`.
2. `CUA_DRIVER_RS_COORDINATE_SPACE=1` continua a fornecer o contrato opt-in de
   coordenadas 0-1000 na fronteira compartilhada de invocação. Ele deve cobrir
   toda nova ferramenta de desktop e adjacente a navegador que carrega
   coordenadas, ou falhar fail closed.
3. `MCP_MODEL_PAYLOAD_FILTER=1` continua a filtrar branding visível ao modelo
   tanto em conteúdo de texto MCP quanto em conteúdo estruturado, sem alterar
   mídia binária.
4. O comportamento ainda não mesclado de janelas de nível superior com título
   vazio/nulo no Windows, de trycua/cua#2021, permanece presente e é adaptado
   ao modelo de janelas atual.
5. O patch de escrita de socket EAGAIN de trycua/cua#2036 é aposentado do
   inventário local de patches porque é parte da base 0.17.0.

## Mudanças de contrato upstream

A importação inclui o runtime pertencente ao SDK, SDKs UniFFI em Python e
TypeScript, automação de navegador tipada, modos de permissão de runtime,
escopo de captura por sessão, tokens de elemento vinculados a snapshot, o
contrato fechado `ActionResult`, `verify_state`, invocação de menu nativo,
ferramentas de clipboard, enquadramento de janela e temas de cursor
semânticos.

Essas são substituições arquiteturais, não funcionalidades folha
independentes. As transformações de coordenadas e payload do Qwen devem ser
reanexadas à fronteira canônica de SDK/ferramenta para que execuções de CLI,
MCP, SDK direto, worker privado e daemon não possam divergir.

## Estratégia de importação

1. Executar o script de delta upstream suportado pelo repositório a partir do
   ref atual de `.vendored-from` até `cua-driver-rs-v0.17.0`.
2. Inventariar toda rejeição, exclusão, novo arquivo gerado, caminho relativo
   à raiz, identidade de pacote, versão de release e dependência externa de
   build.
3. Resolver sobreposições upstream/local preservando a arquitetura upstream e
   reexpressando cada delta do Qwen na sua nova fronteira canônica.
4. Atualizar `.vendored-from`, `.vendored-patches.md`, referências de versão,
   instaladores do Qwen e o workflow de release do Qwen em conjunto.
5. Auditar fonte, testes, documentação, bindings gerados, instaladores,
   metadados de bundle, nomes de processo, nomes de serviço e arquivos de
   release para consistência de identidade.

## Verificação

A verificação é em camadas para que um teste unitário estreito verde não possa
esconder uma distribuição ou fronteira de confiança quebrada:

- Formatação Rust, verificações de pacote, testes unitários de
  core/contrato/SDK e consistência de contrato gerado.
- Testes focados de normalização de coordenadas, filtro de payload, enumeração
  de janelas no Windows, instalador e versão.
- Verificações de geração/pacote dos SDKs Python e TypeScript quando sua
  toolchain local de pacote está disponível.
- Verificações estáticas do workflow de release do Qwen para nomes de
  executável, layout de app bundle, identificadores de bundle, ativos e
  versões embutidas.
- `npm run build && npm run typecheck` para o repositório envolvente.
- Diff completo e auditoria de arquivos não rastreados, repetidos até que duas
  passadas consecutivas estejam limpas.

Produção de release assinado/notarizado e certificação física de GUI em
Windows/Linux/macOS estão fora da verificação local e devem permanecer gates
de release explícitos.
