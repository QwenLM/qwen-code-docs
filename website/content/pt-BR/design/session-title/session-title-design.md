# Design do Título da Sessão

> Um título de sessão em caixa alta de 3 a 7 palavras gerado pelo modelo rápido
> após a primeira fala do assistente. Persistido no JSONL da sessão com uma
> tag `titleSource: 'auto' | 'manual'`, exibido no seletor de sessões
> e regerável sob demanda via `/rename --auto`.

## Visão Geral

O comando `/rename` (#3093) permite que um usuário nomeie uma sessão para encontrá-la novamente no
seletor depois, mas até que ele execute o comando o seletor mostra o primeiro prompt
do usuário — muitas vezes truncado no meio da frase, ou descrevendo uma pergunta
de enquadramento em vez do que a sessão realmente se tornou. Renomear manualmente é um
atrito opcional que a maioria dos usuários nunca faz.

O objetivo é tornar os nomes das sessões _úteis por padrão_:

- **Descritivo** do que a sessão realmente realizou, não apenas da
  linha de abertura. 3-7 palavras, caixa alta, estilo de assunto de commit git.
- **Melhor esforço**: dispara em segundo plano após a primeira resposta; se
  falhar, o usuário nunca vê um erro.
- **Deferencial ao usuário**: nunca sobrescreve um título definido
  deliberadamente pelo usuário com `/rename`, mesmo entre abas CLI na mesma sessão.
- **Explicitamente regerável** via `/rename --auto` para o caso de "o título
  automático ficou desatualizado / quero um novo".

## Gatilhos

| Gatilho   | Condições                                                                                                                                                                  | Implementação                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Auto**  | Após `recordAssistantTurn` disparar. Ignorado se um título existente já foi definido, outra tentativa está em andamento, limite atingido, não interativo, env desabilitado ou sem modelo rápido. | `ChatRecordingService.maybeTriggerAutoTitle` — dispara e esquece |
| **Manual** | Usuário executa `/rename --auto`                                                                                                                                          | `renameCommand.ts` via `tryGenerateSessionTitle`               |

Ambos os caminhos convergem para uma única função — `tryGenerateSessionTitle(config,
signal)` — para garantir prompt, esquema, seleção de modelo e
sanitização idênticos. O gatilho automático é uma chamada em segundo plano de melhor esforço; o
manual `/rename --auto` é uma ação bloqueante do usuário que exibe um erro
específico do motivo em caso de falha.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        packages/core/src/services/                      │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ chatRecordingService.ts  │                                           │
│  │                          │                                           │
│  │  recordAssistantTurn()   │                                           │
│  │     │                    │                                           │
│  │     ↓                    │                                           │
│  │  maybeTriggerAutoTitle() │── 6 guards ──→ IIFE(autoTitleController)  │
│  │     │                    │                       │                   │
│  │     └── resume hydrate   │                       ↓                   │
│  │         via              │          tryGenerateSessionTitle          │
│  │         getSessionTitle- │          (sessionTitle.ts)                │
│  │         Info             │                       │                   │
│  │                          │                       ↓                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (fastModel + JSON schema)        │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + sanity checks     │
│  │                          │                         │                 │
│  │  getSessionTitleInfo()   │◀── cross-process        ↓                 │
│  │      uses                │    re-read             recordCustomTitle  │
│  │  readLastJsonString-     │    before write        (…, 'auto')        │
│  │  FieldsSync              │                                           │
│  │  (sessionStorageUtils)   │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│                          ┌─────────────────────┐                        │
│                          │ utils/terminalSafe  │                        │
│                          │ stripTerminalCtrl-  │                        │
│                          │ Sequences           │                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     packages/cli/src/ui/                                │
│                                                                         │
│  commands/renameCommand.ts     ─── /rename <name>          → manual      │
│                                ─── /rename                 → kebab       │
│                                ─── /rename --auto          → auto       │
│                                ─── /rename -- --literal    → manual     │
│                                ─── /rename --unknown-flag  → error      │
│                                                                         │
│  components/SessionPicker.tsx  ── dims rows where                       │
│                                   session.titleSource === 'auto'        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Arquivos

| Arquivo                                               | Responsabilidade                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/core/src/services/sessionTitle.ts`          | Chamada única LLM + filtro de histórico + sanitização. Exporta `tryGenerateSessionTitle`. |
| `packages/core/src/services/chatRecordingService.ts`  | Gatilho `maybeTriggerAutoTitle`, guards, releitura entre processos, abort ao finalizar. |
| `packages/core/src/services/sessionService.ts`        | Acessor público `getSessionTitleInfo`; `renameSession` aceita `titleSource`.           |
| `packages/core/src/utils/sessionStorageUtils.ts`      | `extractLastJsonStringFields` + `readLastJsonStringFieldsSync` leitor atômico de pares. |
| `packages/core/src/utils/terminalSafe.ts`             | `stripTerminalControlSequences` compartilhado pelos caminhos de caixa alta e kebab.     |
| `packages/cli/src/ui/commands/renameCommand.ts`       | `/rename --auto`, parser de sentinelas, mapa de mensagens de motivo de falha.         |
| `packages/cli/src/ui/components/SessionPicker.tsx`    | Estilo escurecido para `titleSource === 'auto'`.                                      |

## Design do Prompt

### Prompt do Sistema

Substitui o prompt do sistema do agente principal para esta única chamada, para que o modelo
apenas tente rotular a sessão, não se comporte como um assistente de codificação.

Os marcadores abaixo correspondem 1:1 com `TITLE_SYSTEM_PROMPT`:

- 3-7 palavras, caixa alta (apenas a primeira palavra e nomes próprios em maiúsculo).
- Sem pontuação final, sem markdown, sem aspas.
- Combinar com o idioma dominante da conversa; para chinês, orçar
  aproximadamente 12-20 caracteres.
- Ser específico sobre o objetivo real do usuário — nomear o recurso, bug ou
  área de assunto. Evite generalizações vagas como "Alterações de código" ou
  "Pedido de ajuda".
- Quatro bons exemplos (três em inglês + um em chinês) e quatro exemplos ruins
  (muito vago / muito longo / caixa errada / pontuação final).
- Retornar apenas um objeto JSON com uma única chave `title`.

### Saída Estruturada (esquema JSON)

Em vez de envolver a saída em tags (como o resumo de sessão), usamos
`BaseLlmClient.generateJson` com um esquema de chamada de função:

```ts
const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'Um título de sessão conciso em caixa alta, 3-7 palavras, sem pontuação final.',
    },
  },
  required: ['title'],
};
```

Por que chamada de função em vez de texto livre + extração de tags:

1. Confiabilidade entre provedores — endpoints compatíveis com OpenAI, Gemini e
   chamada de ferramenta nativa do Qwen implementam chamada de função; análise de tags
   dependeria de todos os modelos respeitarem uma convenção de texto.
2. Sem vazamento de preâmbulo de raciocínio — os argumentos da chamada de função voltam
   estruturados, então um parágrafo de "pensamento" antes da resposta não pode vazar
   para o título.
3. Pós-processamento mais simples — uma única verificação `typeof result.title === 'string'`
   mais `sanitizeTitle` cobre toda deriva realista de modelo.

O modelo ainda pode retornar algo que o esquema permite, mas a UX
rejeita (string vazia, apenas espaços em branco, 500 caracteres, cercamento de markdown, caracteres
de controle). `sanitizeTitle` lida com todos esses casos e retorna `''` →
serviço retorna `{ok: false, reason: 'empty_result'}`.

### Parâmetros da Chamada

| Parâmetro         | Valor                          | Motivo                                                                                       |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `model`           | `getFastModel()` — sem fallback | Auto-titulação com tokens do modelo principal é cara demais para ser silenciosa.              |
| `schema`          | `TITLE_SCHEMA`                 | Força `{title: string}`; filtra deriva de formato na camada de transporte.                    |
| `maxOutputTokens` | `100`                          | Mais que suficiente para 7 palavras mais overhead do esquema.                                |
| `temperature`     | `0.2`                          | Majoritariamente determinístico — títulos de sessão se beneficiam de estabilidade entre regenerações. |
| `maxAttempts`     | `1`                            | Títulos são metadados cosméticos de melhor esforço; tentativas adicionais enfileirariam atrás do tráfego principal visível ao usuário. |

Contraste com o resumo de sessão, que faz fallback para o modelo principal. A geração
de título é acionada automaticamente e com frequência; gastar silenciosamente tokens do modelo principal
sem aceitação explícita do usuário é uma surpresa real na conta. O manual
`/rename --auto` falha explicitamente com `no_fast_model` em vez de fazer
fallback — forçando o usuário a fazer a escolha consciente do modelo rápido.

## Filtragem de Histórico

`geminiClient.getChat().getHistory()` retorna `Content[]` que inclui
chamadas de ferramenta, respostas de ferramenta (frequentemente 10K+ tokens de conteúdo de arquivo) e partes
de pensamento do modelo. Alimentar isso diretamente no LLM de título enviesaria o rótulo
para ruído de implementação como "Chamou grep no módulo de autenticação".

`filterToDialog` mantém apenas entradas `user` / `model` com texto não vazio
e sem partes `thought` / `thoughtSignature`. `takeRecentDialog` fatia até
as últimas 20 mensagens e se recusa a começar em uma resposta de modelo/ferramenta
solta. `flattenToTail` converte para linhas "Role: text" e fatia os
últimos 1000 caracteres.

### A fatia de cauda de 1000 caracteres

Uma sessão que começa com `me ajuda a debugar X` mas muda para refatorar Y
deve ser intitulada sobre Y. Intitular pela cabeça trava no enquadramento
inicial; intitular pela cauda captura o que a sessão se tornou.

### Tratamento de surrogate UTF-16

`.slice(-1000)` em um limite de unidade de código UTF-16 pode órfão um surrogate
alto ou baixo se um caractere suplementar CJK ou emoji for cortado. Alguns
provedores respondem ao UTF-16 inválido resultante com um 400 — o que, sem
tratamento, queimaria uma tentativa sem motivo. `flattenToTail` descarta um
surrogate baixo órfão inicial; `sanitizeTitle` remove qualquer surrogate
órfão após o corte de comprimento máximo no caminho de saída também.

## Persistência

### Formato do Registro

`CustomTitleRecordPayload` recebe um campo opcional `titleSource: 'auto' |
'manual'`:

```jsonc
{
  "type": "system",
  "subtype": "custom_title",
  "systemPayload": {
    "customTitle": "Debugar botão de login no mobile",
    "titleSource": "auto",
  },
}
```

O campo é opcional, e registros legados ausentes são tratados como
`undefined`. `SessionPicker` escurece linhas apenas em uma correspondência estrita `=== 'auto'`
— um título de `/rename` do usuário anterior à mudança nunca é silenciosamente reclassificado
como um palpite do modelo.

### Hidratação de Retomada

Na retomada, o construtor de `ChatRecordingService` chama
`sessionService.getSessionTitleInfo(sessionId)` para ler **ambos** o
título e sua fonte. Sem hidratar a fonte, o re-apêndice de `finalize()`
(que executa em todo evento de ciclo de vida da sessão) reescreveria
auto como manual em todo ciclo de retomada — removendo silenciosamente a
sutileza de escurecimento.

### Leitura Atômica de Par

`extractLastJsonStringFields` retorna `customTitle` e `titleSource`
da **mesma linha correspondente** em uma única varredura. Duas chamadas
separadas de `readLastJsonStringFieldSync` poderiam cair em registros diferentes se
uma linha mais antiga tiver apenas o campo principal, produzindo um par
incompatível. O extrator também exige uma aspa de fechamento adequada no valor
principal, então um registro de cauda truncado por falha não pode vencer a corrida
da correspondência mais recente.

### Limite de Varredura de Arquivo Completo

A Fase 2 (quando o caminho rápido da janela de cauda falha) transmite o arquivo
inteiro em blocos de 64KB. Limitado a `MAX_FULL_SCAN_BYTES = 64 MB` para que um arquivo
JSONL corrompido com vários GB não possa congelar o seletor de sessão na thread principal
do loop de eventos. O envelope de latência do seletor sobrevive à corrupção.

### Defesa contra Symlink

As leituras de sessão abrem com `O_NOFOLLOW` (fallback para somente leitura no
Windows, onde a constante não é exposta). Defesa em profundidade para que um symlink
plantado em `~/.qwen/projects/<proj>/chats/` não possa redirecionar uma leitura
de metadados para um arquivo não relacionado.

## Concorrência e Casos de Borda

### Ordem das Guards do Gatilho

`maybeTriggerAutoTitle` verifica seis condições nesta ordem exata — cada uma
curto-circuita as demais para que as mais baratas executem primeiro:

1. `currentCustomTitle` definido → pular. Nunca sobrescrever manual / auto anterior.
2. `autoTitleController !== undefined` → pular. Uma tentativa por vez.
3. `autoTitleAttempts >= 3` → pular. Limite superior limita desperdício total.
4. `!config.isInteractive()` → pular. `qwen -p` headless / CI nunca gasta
   tokens do modelo rápido em uma sessão única.
5. `autoTitleDisabledByEnv()` → pular. `QWEN_DISABLE_AUTO_TITLE=1`
   exclusão explícita.
6. `!config.getFastModel()` → pular. Sem modelo rápido → sem operação.

### Por que o limite é 3, não 1

A primeira fala do assistente pode ser uma chamada de ferramenta pura sem texto
visível ao usuário (por exemplo, o modelo abre com um `grep`). `tryGenerateSessionTitle`
retorna `{ok: false, reason: 'empty_history'}` nesse caso. Sem uma janela
de repetição, toda a chance de uma sessão obter um título seria queimada na
fala 1 antes que o usuário dissesse algo interessante. Limite de 3 cobre o caso
comum de "primeira fala é ruído" enquanto ainda limita repetição descontrolada em
um modelo rápido com falha persistente.

### Corrida de Renomeação Manual entre Processos

Duas abas CLI no mesmo arquivo de sessão podem divergir em memória. A aba A
executa `/rename foo` e escreve `titleSource: manual`. O
`ChatRecordingService` da aba B tem seu próprio `currentCustomTitle = undefined` e
subscreveria ingenuamente com um título automático.

Após a chamada LLM resolver, a IIFE relê o JSONL via
`sessionService.getSessionTitleInfo`. Se o arquivo mostrar
`source: 'manual'`, a IIFE aborta E sincroniza seu estado em memória para que
falas subsequentes também respeitem a renomeação. Custo: uma leitura de cauda de 64KB por
geração bem-sucedida; insignificante.

### Propagação de Aborto em `finalize()`

`autoTitleController` dobra como sinalizador de em andamento. `finalize()` (executado
na troca de sessão e no desligamento do processo) chama
`autoTitleController.abort()` antes de re-apêndice do registro de título. O
socket LLM é cancelado prontamente; a troca de sessão não espera por uma chamada
lenta de modelo rápido. O bloco `finally` da IIFE limpa
`autoTitleController` apenas se ainda for o ativo, de modo que uma finalização
no meio do voo não entre em corrida com um `recordAssistantTurn` concorrente.

### `/rename` Manual Atinge Meio do Voo

Entre o `await` da IIFE completar e a chamada
`recordCustomTitle('auto')`, o usuário poderia `/rename foo`. A IIFE
reverifica `this.currentTitleSource === 'manual'` e aborta. A verificação
em processo E a releitura entre processos ambas executam; manual vence em ambas as camadas.

## Configuração

### Opções Visíveis ao Usuário

| Configuração / env var         | Padrão  | Efeito                                                                                              |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `fastModel`                   | não definido | Necessário para auto-titulação. Não definido → sem operação (sem fallback para modelo principal). |
| `QWEN_DISABLE_AUTO_TITLE=1` | não definido | Exclui-se do gatilho automático sem desdefinir `fastModel`. `/rename --auto` ainda funciona sob demanda. |

Nenhuma alternância em `settings.json` — a env var é a única chave de desligamento
visível ao usuário. Motivo: o recurso é cosmético e barato; uma alternância
de configuração adicionaria uma superfície de UI para algo que pode viver como um export de env
pontual para os poucos usuários que desejam desabilitá-lo.

### Por que o auto não faz fallback para o modelo principal

Auto-titulação é acionada incondicionalmente após toda fala do assistente.
Se um usuário sem modelo rápido for silenciosamente cobrado por tokens do modelo principal
para cada título de nova sessão, o delta de custo é invisível até que a
conta mensal chegue. Falhar silenciosamente (sem operação, sem título, sem custo) é o
padrão mais seguro. `/rename --auto` exibe `no_fast_model` como um
erro acionável para que o usuário possa definir um se quiser.

## Observabilidade

`createDebugLogger('SESSION_TITLE')` emite `debugLogger.warn` a partir do
bloco catch do gerador. Falhas são totalmente transparentes para o usuário —
auto-título é um recurso auxiliar e nunca lança exceções na UI.

Desenvolvedores podem pesquisar pela tag `[SESSION_TITLE]` no log de debug
(`~/.qwen/debug/<sessionId>.txt`; `latest.txt` faz symlink para a sessão
atual). Uma chamada ponta a ponta bem-sucedida não produz saída de log; uma
falha produz uma linha WARN com a mensagem de erro subjacente.

## Endurecimento de Segurança

O valor do título é renderizado literalmente no terminal (seletor de sessão)
E persistido em um arquivo JSONL legível pelo usuário. Ambas as superfícies são
alcançáveis por ataque se um modelo rápido comprometido ou com injeção de prompt retornar
texto hostil.

| Preocupação                                   | Guarda                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Injeção ANSI / OSC-8 / CSI                    | `stripTerminalControlSequences` antes da escrita no JSONL e da renderização no seletor.                                        |
| Contrabando de link clicável via OSC-8        | Mesmo — sequências OSC removidas como unidades inteiras, não apenas o byte ESC.                                                |
| Surrogates UTF-16 inválidos                   | Removidos em `flattenToTail` (entrada do LLM) e `sanitizeTitle` (saída do LLM após corte de comprimento máximo).               |
| Falsificação de linha de subtipo via conteúdo da mensagem do usuário | `lineContains: '"subtype":"custom_title"'` — texto do usuário que contém a frase literal não pode sombrear um registro real. |
| Redirecionamento de symlink em leituras de sessão | `O_NOFOLLOW` (sem operação no Windows onde a constante está ausente).                                                        |
| Registro JSONL de cauda truncado              | `extractLastJsonStringFields` exige uma aspa de fechamento antes que um registro vença a corrida da correspondência mais recente. |
| Tamanho de arquivo patológico congelando o seletor | Limite de `MAX_FULL_SCAN_BYTES = 64 MB` na varredura de arquivo completo da Fase 2.                                           |
| Decoradores de colchetes CJK emparelhados (`【Rascunho】`) | Removidos como unidade para que um colchete de fechamento solto não fique pendente.                                            |
## Fora do Escopo

| Item                                                                        | Por que não                                                                                                                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regeneração automática quando o título fica desatualizado                   | `/rename --auto` é o caminho explícito acionado pelo usuário. Trocar silenciosamente o título no meio da sessão confundiria usuários que voltam no histórico.                     |
| Paridade visual com WebUI / VSCode                                          | Essas superfícies já leem `customTitle` e mostrarão títulos automáticos como se fossem manuais. Uma melhoria futura pode conectar o `titleSource`.                                 |
| Alternância na caixa de configurações para geração automática              | A variável de ambiente é o único controle. Adicionar uma interface completa de configurações é fácil depois, caso haja demanda dos usuários.                                     |
| Entradas de catálogo de localização (i18n) para novas strings              | Consistente com as strings existentes do `/rename`, que usam inglês como fallback. Uma passada de i18n em todo o repositório está fora do escopo.                                 |
| Migração para reclassificar registros legados                              | Compatibilidade retroativa por design: a ausência de `titleSource` é tratada como manual. Reescrever registros antigos poderia perder a intenção do usuário.                      |
| Titulação automática não interativa                                         | `qwen -p` / scripts de CI descartam a sessão; usar tokens de um modelo rápido para um título que ninguém retomará é puro desperdício.                                             |