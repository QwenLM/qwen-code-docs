# Adaptador de Web UI do Daemon

## Objetivo

Os clientes de chat web e terminal web devem consumir o `qwen serve` através das APIs HTTP/SSE do daemon e renderizar uma transcrição do lado do cliente. As integrações nativas de TUI local, canal e IDE mantêm seus caminhos padrão existentes por enquanto.

## Contrato de UI Compartilhada

Use as exportações de UI do daemon do SDK TypeScript como a fronteira comum:

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
- `DaemonSessionClient` gerencia a criação/vinculação de sessão e a reprodução SSE.
- `normalizeDaemonEvent()` converte eventos de wire do daemon em eventos de UI.
- `createDaemonTranscriptStore()` reduz eventos de UI em blocos de transcrição.

Clientes React podem usar o binding opcional `@qwen-code/webui`:

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

Forma React mínima:

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

O provider cria ou vincula uma sessão do daemon, assina o SSE, mantém o último id de evento no `DaemonSessionClient` e reconecta o stream por padrão. Os chamadores podem desabilitar isso com `autoReconnect={false}` para testes ou gerenciamento de conexão personalizado.

## Formatos de Implantação no Navegador

### POC Local de Mesma Origem

Uma página servida pelo daemon pode chamar o daemon diretamente porque a página e a API compartilham uma origem. Este é o formato de POC inicial preferido para validação de chat web e terminal web local.

### Chat Web Remoto / Terminal Web

Um aplicativo web remoto de produção normalmente deve se comunicar com um backend-for-frontend (BFF). O BFF gerencia a URL do daemon, token, roteamento de workspace e metadados de sessão, e então encaminha eventos de aplicativo seguros para o navegador. Isso mantém os tokens de portador fora do armazenamento do navegador e permite que a implantação decida qual daemon/workspace um usuário tem permissão para acessar.

### Navegador Local Contra Daemon Local

Um servidor de desenvolvimento local separado tem origem cruzada em relação ao `qwen serve`; ele deve ou fazer proxy das rotas do daemon através da mesma origem ou ser servido pelo daemon. O daemon rejeita intencionalmente requisições de `Origin` arbitrárias do navegador.

## Responsabilidades de Renderização

O modelo de transcrição compartilhado é semântico, não visual. Os clientes de UI decidem como renderizar:

- blocos de mensagens do usuário e assistente
- blocos de pensamento recolhidos
- cartões de status de ferramentas
- blocos de saída do shell
- controles de solicitação de permissão
- blocos de status/erro/depuração

O terminal web é um renderizador semântico nativo do navegador. Ele deve ter aparência e sensação de terminal, com layout monoespaçado, retrocesso (scrollback), entrada de prompt, atalhos e blocos de streaming, mas não é um proxy PTY bruto e não requer renderização Ink no lado do servidor.

## Segurança de Merge

- A TUI nativa do `qwen` permanece direta e inalterada.
- Os caminhos `--acp`, canal e IDE permanecem inalterados por padrão.
- O núcleo de UI do SDK é aditivo.
- O binding WebUI React é opcional e só é executado em clientes que o importam.
- O código spike da TUI do daemon removido não deve ser tratado como uma migração de produto.

## Acompanhamentos

- Adicionar uma POC local `/web` servida pelo daemon ou um aplicativo web equivalente de mesma origem.
- Construir renderizadores de chat e terminal de primeira classe com base nos blocos de transcrição.
- Adicionar eventos tipados mais ricos apenas onde os eventos existentes do daemon são muito baixo nível para um comportamento de UI de navegador estável.
- Considerar um pacote dedicado `@qwen-code/daemon-ui-core` se consumidores não-SDK precisarem do núcleo de UI como uma dependência independente.