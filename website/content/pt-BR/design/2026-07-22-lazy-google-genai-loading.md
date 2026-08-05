# Carregamento lazy do `@google/genai`

- **Issue**: #7264 candidato 3
- **Escopo**: closure de import do cold start do ACP
- **Status**: implementado e validado

## Problema

O runtime ACP empacotado atualmente alcança a entrada Node do `@google/genai`
por nove pontos de import eager em runtime. O SDK contribui com 755.788 bytes
para um chunk compartilhado de 1.196.331 bytes contendo 77 entradas, incluindo
`google-auth-library` e `gaxios`. Como o bootstrap do ACP importa a entrada
completa do CLI antes de responder a `initialize`, esse chunk sofre parse e é
avaliado mesmo que o bootstrap deliberadamente pule a inicialização do cliente
Gemini e a descoberta de MCP.

Mudar os imports eager para `import()` não é suficiente. A criação de sessão
ACP chama `ensureAuthenticated()` e `createContentGenerator()` antes de
retornar a resposta da sessão. Os imports existentes de provider e a construção
de `LoggingContentGenerator`, portanto, carregariam o SDK durante `newSession`,
movendo trabalho para fora de `channel.initialize` sem melhorar o
processo→primeira sessão.

## Design

### Valores de compatibilidade síncronos e leves

A orquestração do core usa apenas um pequeno subconjunto síncrono do SDK fora
das implementações de provider: `FinishReason`,
`FunctionCallingConfigMode`, `createUserContent` e `createModelContent`. Um
módulo de compatibilidade local de pacote fornece esses valores mantendo os
tipos do SDK como imports apenas de tipo. Sua conversão de conteúdo espelha a
validação e o formato de saída do SDK para que chamadores existentes mantenham o
mesmo comportamento sem avaliar o SDK.

Implementações de provider continuam usando as classes oficiais do SDK. Em
particular, esta mudança não copia nem substitui `GenerateContentResponse`.

### Gerador de conteúdo lazy single-flight

`createContentGenerator()` ainda valida a configuração, pré-carrega a
implementação de fetch do runtime e realiza a aquisição de credenciais Qwen
OAuth no seu ponto atual do ciclo de vida da sessão. Ele retorna um
`ContentGenerator` lazy privado cujo carregador memoizado constrói o provider
selecionado e o envolve em `LoggingContentGenerator` na primeira operação
assíncrona de gerador de conteúdo.

Todas as quatro operações assíncronas compartilham a mesma promise do
carregador:

- `generateContent`
- `generateContentStream`
- `countTokens`
- `embedContent`

Primeiras chamadas concorrentes, portanto, importam e constroem o provider uma
única vez. `useSummarizedThinking()` permanece síncrono e é fornecido a partir
do comportamento conhecido do provider selecionado: verdadeiro para
Gemini/Vertex e falso para OpenAI, Qwen OAuth e Anthropic.

A aquisição de credenciais Qwen OAuth permanece eager dentro de
`createContentGenerator()`. Uma credencial em cache expirada ou ausente,
portanto, continua rejeitando a criação de sessão ACP em vez de produzir uma
sessão aparentemente utilizável que falha apenas no seu primeiro prompt.

Falhas de import dinâmico mantêm a mensagem existente de reinício por
atualização em segundo plano, embora falhas de chunk de provider agora surjam
no primeiro uso do gerador. Uma atualização de auth substitui o gerador lazy, o
que também fornece o limite de retry após um carregador com falha.

### Primeiro uso do MCP

`mcpToTool` é carregado dinamicamente dentro de `discoverTools()`. Isso
preserva a paginação do SDK, o tratamento de nomes duplicados, o fallback de
ferramentas chamáveis e o efeito colateral de cabeçalho de uso do MCP.
Configurações com servidores MCP podem, portanto, avaliar `@google/genai`
durante a descoberta de MCP em segundo plano antes do primeiro prompt do
modelo. Esta é uma exceção intencional de primeiro uso: substituir `mcpToTool`
duplicaria comportamento experimental do SDK e ampliaria materialmente a
superfície de regressão.

O limite garantido é que `@google/genai` está ausente da closure estática do
bootstrap do ACP. Sem servidor MCP configurado, ele permanece descarregado até
a criação da sessão e carrega na primeira operação do `ContentGenerator`.

### Guarda de bundle

O guarda de metafile do fast path do serve adiciona `@google/genai` à lista de
pacotes proibidos do ACP. Chunks dinâmicos permanecem permitidos. Isso faz um
futuro re-import estático falhar o CI com seu caminho de import na saída.

## Auditoria de consumidores downstream

Existem três caminhos diretos de criação em produção. `Config.refreshAuth()` é
dono do gerador da sessão principal. `BaseLlmClient` é dono de geradores
cacheados por modelo para requisições laterais roteadas.
`createRuntimeContentGeneratorView()` é dono de geradores dedicados usados pelo
backend de agente em processo, pelo gerenciador de subagentes e por agentes
fork. Cada caminho armazena e consome apenas a interface `ContentGenerator`,
então o wrapper lazy privado preserva seu limite de posse e roteamento.

Os consumidores da interface chamam apenas `generateContent`,
`generateContentStream`, `countTokens`, `embedContent` e
`useSummarizedThinking`. O caminho principal de chat, hooks de prompt,
consultas de memória/objetivo/laterais, roteamento de visão, subagentes e
retomada de sessão não inspecionam o provider concreto nem desembrulham
`LoggingContentGenerator`; uma busca em todo o repositório não encontrou nenhum
chamador de produção de `instanceof` ou `getWrapped()`. A descoberta de
ferramentas MCP é separada da posse do gerador e mantém o adaptador `mcpToTool`
fornecido pelo SDK atrás do seu próprio import de primeiro uso.

## Alternativas rejeitadas

- **Apenas tornar dinâmicos os imports atuais**: melhora `channel.initialize`,
  mas carrega o mesmo SDK durante `newSession`, então não trata o
  processo→primeira sessão.
- **Adiar o próprio `GeminiClient.initialize()`**: muda a construção do chat, a
  retomada, o registro de ferramentas, a prontidão da sessão e o tempo de erros
  de autenticação.
- **Copiar `GenerateContentResponse`**: arrisca divergência de protótipo e
  getters entre atualizações do SDK e muda os objetos de runtime retornados
  pelos adaptadores OpenAI e Anthropic.
- **Substituir `mcpToTool` localmente**: duplica um adaptador experimental do
  SDK e descarta ou precisa reproduzir seu comportamento de telemetria de MCP
  global do processo.
- **Importar internos do SDK não documentados**: `@google/genai` não expõe
  subcaminho leve suportado para esses helpers e classes.

## Compatibilidade e caminhos de falha

- A validação de provider permanece em `createContentGenerator()`.
- As verificações de credenciais Qwen OAuth permanecem antes do registro da
  sessão ACP.
- O primeiro carregador é single-flight entre prompts concorrentes e consultas
  laterais.
- Uma primeira requisição já abortada ainda pode completar a avaliação do
  módulo, porque imports ESM não são canceláveis; o provider recebe o sinal
  abortado original depois disso.
- A configuração de modelo é capturada por referência como hoje, então mudanças
  de modelo no mesmo provider feitas antes do primeiro uso são observadas pelo
  construtor do provider.
- Mudanças de auth/provider reconstroem o gerador lazy pelo caminho existente
  de `refreshAuth()`.
- Um chunk dinâmico ausente após uma atualização do CLI em segundo plano produz
  a orientação existente de reinício.

## Verificação

Testes unitários cobrem paridade dos helpers, construção adiada, tempo das
credenciais Qwen, comportamento single-flight, valores de summarized-thinking
específicos de provider, falhas de módulo adiadas e comportamento de
descoberta de MCP. O metafile empacotado deve mostrar `@google/genai` ausente
da closure estática do ACP, mantendo-o nos chunks dinâmicos de provider/MCP.

A execução de aceitação 2C4G segue o #7264: 30 cold starts seriais pareados,
`channel.initialize` P50/P95, processo→primeira sessão, comportamento
pré-aquecido/quente, primeiras sessões concorrentes, telemetria
ligada/desligada e RSS de pico. Como esta mudança move trabalho para depois,
ela adicionalmente registra sessão-resposta→primeiro token e
processo→primeiro token para um primeiro prompt imediato. Uma vitória de
startup que é totalmente paga de volta como regressão de primeiro token é
reportada em vez de tratada como otimização bem-sucedida.

## Resultados

O controle era o então atual `origin/main` em
`dd2552018a72a2b5795977211f06435711e5f99a`, que já inclui o trabalho de
telemetria/protocolo lazy e a mudança de undici lazy. O candidato era o bundle
exato final da árvore de trabalho. Ambos foram construídos do mesmo lockfile e
testados no host fornecido da Alibaba Cloud com 2 vCPUs, aproximadamente 3,5
GiB de RAM, sem swap e Node.js embutido 22.23.1.

A closure estática do ACP caiu de 14.279.497 bytes para 13.280.177 bytes
(999.320 bytes). A closure do controle continha 755.788 bytes atribuídos
diretamente ao `@google/genai`; o candidato continha zero. O SDK permanece
presente nos chunks dinâmicos para primeiro uso de provider e MCP.

Com telemetria habilitada para um outfile, 30 cold starts pareados alternados
produziram:

| Métrica                   | Controle P50 / P95   | Candidato P50 / P95  | Delta P50  |
| ------------------------- | -------------------- | -------------------- | ---------- |
| `channel.initialize`      | 984,9 / 1010,6 ms    | 954,8 / 972,5 ms     | -30,1 ms   |
| `POST /session` frio      | 1293,1 / 1316,0 ms   | 1252,4 / 1291,3 ms   | -40,7 ms   |
| processo até primeira sessão | 1924,6 / 1951,1 ms | 1858,7 / 1901,0 ms   | -65,9 ms   |
| `phase.gemini_import`     | 536,3 / 550,2 ms     | 517,2 / 526,5 ms     | -19,1 ms   |
| RSS de pico               | 414,6 / 427,1 MiB    | 406,5 / 420,5 MiB    | -8,0 MiB   |

Após um pré-aquecimento de três segundos, `channel.initialize` permaneceu 32,7
ms mais rápido em P50, enquanto `POST /session` melhorou em 4,8 ms. Primeiras
sessões concorrentes, telemetria desabilitada e modo legado de sessão única
todos tiveram sucesso; toda árvore de processos foi limpa e o modo com
telemetria desabilitada emitiu zero registros.

Uma execução adicional com telemetria desligada emitiu um prompt real imediato
compatível com OpenAI em 30 pares alternados. Todos os 60 prompts foram
concluídos. Processo→sessão melhorou 53,4 ms em P50 e o candidato foi mais
rápido em 28 de 30 pares. Prompt→primeiro token foi efetivamente neutro sob a
variância de rede do modelo: o P50 do candidato foi 24,2 ms mais rápido e o
candidato foi mais rápido em 16 de 30 pares; o P95 foi 297,6 ms mais lento
porque ambas as variantes tiveram outliers de rede multi-segundo não
relacionados. O P50 ponta a ponta de processo→primeiro token melhorou 57,6 ms,
com o candidato mais rápido em 19 de 30 pares. Isso descarta uma mudança de
custo mediano demonstrada, mas a cauda de primeiro token não é atribuível o
suficiente para alegar uma vitória adicional de desempenho de chamada de
modelo.
