# Adaptador da Web UI do Daemon

## Objetivo

Os clientes de chat web e terminal web devem consumir `qwen serve` através das
APIs HTTP/SSE do daemon e renderizar um transcript do lado do cliente. As
integrações nativas de TUI local, canal e IDE mantêm seus caminhos padrão
existentes por enquanto.

## Contrato de UI Compartilhado

Use as exportações da UI do daemon do SDK TypeScript como fronteira comum:

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

A divisão é:

- `DaemonClient` lida com as rotas HTTP do daemon.
- `DaemonSessionClient` gerencia a criação/vinculação de sessão e replay SSE.
- `normalizeDaemonEvent()` converte eventos wire do daemon em eventos de UI.
- `createDaemonTranscriptStore()` reduz eventos de UI em blocos de transcript.

Clientes React podem usar a vinculação opcional `@qwen-code/webui`:

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

Forma mínima do React:

```tsx
function App() {
  return (
    <DaemonSessionProvider baseUrl="http://127.0.0.1:4170">
      <Transcript />
      <PromptBox />
    </DaemonSessionProvider>
  );
}

function Transcript() {
  const blocks = useDaemonTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

O provider cria ou vincula uma sessão do daemon, assina o SSE, mantém o
último id de evento no `DaemonSessionClient` e reconecta o stream por padrão.
Os chamadores podem desabilitar isso com `autoReconnect={false}` para testes ou
gerenciamento de conexão personalizado.

## Formatos de Implantação no Navegador

### Prova de Conceito Local na Mesma Origem

Uma página servida pelo daemon pode chamar o daemon diretamente porque a
página e a API compartilham uma origem. Este é o formato preferido para a
prova de conceito inicial de chat web e terminal web locais.

### Chat Web / Terminal Web Remoto

Um aplicativo web remoto de produção normalmente deve falar com um
backend-para-frontend. O BFF gerencia a URL do daemon, token, roteamento de
workspace e metadados de sessão, e então encaminha eventos de aplicativo
seguros para o navegador. Isso mantém tokens de portador fora do
armazenamento do navegador e permite que a implantação decida qual
daemon/workspace um usuário pode acessar.

### Navegador Local Contra Daemon Local

Um servidor de desenvolvimento local separado tem origem cruzada com
`qwen serve`; ele deve ou fazer proxy das rotas do daemon através da mesma
origem ou ser servido pelo daemon. O daemon rejeita intencionalmente
requisições com `Origin` arbitrária do navegador.

## Responsabilidades de Renderização

O modelo de transcript compartilhado é semântico, não visual. Os clientes de UI
decidem como renderizar:

- blocos de mensagens do usuário e do assistente
- blocos de pensamento recolhidos
- cartões de status de ferramenta
- blocos de saída do shell
- controles de solicitação de permissão
- blocos de status/erro/depuração

O terminal web é um renderizador semântico nativo do navegador. Ele deve
parecer e se sentir como um terminal, com layout monoespaçado, scrollback,
entrada de prompt, atalhos e blocos de streaming, mas não é um proxy PTY bruto
e não requer renderização Ink no lado do servidor.

## Segurança da Mesclagem

- A TUI nativa do `qwen` permanece direta e inalterada.
- Os caminhos `--acp`, canal e IDE permanecem inalterados por padrão.
- O núcleo da UI do SDK é aditivo.
- A vinculação React do WebUI é opcional e só é executada em clientes que a
  importam.
- O código removido do spike da TUI do daemon não deve ser tratado como uma
  migração de produto.

## Acompanhamentos

- Adicionar uma prova de conceito local `/web` servida pelo daemon ou
  aplicativo web equivalente na mesma origem.
- Construir renderizadores de chat e terminal de primeira classe sobre os
  blocos de transcript.
- Adicionar eventos tipados mais ricos apenas onde os eventos existentes do
  daemon são muito baixo nível para o comportamento estável da UI no navegador.
- Considerar um pacote dedicado `@qwen-code/daemon-ui-core` se consumidores
  que não são do SDK precisarem do núcleo da UI como uma dependência independente.
