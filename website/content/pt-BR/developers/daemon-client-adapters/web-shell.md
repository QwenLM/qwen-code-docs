# Adaptador do Daemon Web Shell

## Objetivo

Clientes de chat web e terminal web devem consumir o `qwen serve` por meio
das APIs HTTP/SSE do daemon e renderizar uma transcrição no lado do cliente.
Integrações nativas de TUI local, canal e IDE mantêm seus caminhos padrão
existentes por enquanto.

## Contrato de UI Compartilhado

Use as exportações de UI do daemon do SDK TypeScript como limite comum:

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from ' @qwen-code/sdk/daemon';
```

A divisão é:

- `DaemonClient` lida com as rotas HTTP do daemon.
- `DaemonSessionClient` é responsável pela criação/anexação de sessão e replay de SSE.
- `normalizeDaemonEvent()` converte eventos de rede do daemon em eventos de UI.
- `createDaemonTranscriptStore()` reduz eventos de UI em blocos de transcrição.

Clientes React podem usar o binding exportado pelo Web Shell:

```tsx
import {
  DaemonSessionProvider,
  useActions,
  useConnection,
  usePendingPermissions,
  useTranscriptBlocks,
} from ' @qwen-code/web-shell/daemon-react-sdk';
```

Formato mínimo React:

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
  const blocks = useTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

O provider cria ou anexa uma sessão do daemon, assina o SSE, mantém o último
id de evento no `DaemonSessionClient` e reconecta o stream por padrão.
Chamadores podem desativar isso com `autoReconnect={false}` para testes ou
gerenciamento personalizado de conexão.

## Formas de Implantação no Navegador

### POC Local de Mesma Origem

Uma página servida pelo daemon pode chamar o daemon diretamente porque a página
e a API compartilham a mesma origem. Esta é a forma preferida de POC inicial
para validação de chat web e terminal web locais.

### Chat Web / Terminal Web Remoto

Um app web remoto de produção deve normalmente falar com um backend-for-frontend.
O BFF é dono da URL do daemon, token, roteamento de workspace e metadados de
sessão, e encaminha eventos de app seguros para o navegador. Isso mantém os
tokens bearer fora do armazenamento do navegador e permite que a implantação
decida qual daemon/workspace um usuário tem permissão de acessar.

### Navegador Local Contra Daemon Local

Um servidor de desenvolvimento local separado está em origem cruzada com
`qwen serve`; ele deve fazer proxy das rotas do daemon pela mesma origem ou
ser servido pelo daemon. O daemon rejeita intencionalmente requisições de
`Origin` arbitrárias do navegador.

## Responsabilidades de Renderização

O modelo de transcrição compartilhado é semântico, não visual. Clientes de UI
decidem como renderizar:

- blocos de mensagens de usuário e assistente
- blocos de pensamento recolhidos
- cartões de status de ferramenta
- blocos de saída do shell
- controles de requisição de permissão
- blocos de status/erro/debug

O terminal web é um renderizador semântico nativo do navegador. Deve parecer
e ter a sensação de um terminal com layout monoespaçado, histórico de scroll,
entrada de prompt, atalhos e blocos de streaming, mas não é um proxy PTY bruto
e não requer renderização Ink no lado do servidor.

## Segurança de Merge

- O TUI nativo do `qwen` permanece direto e inalterado.
- Caminhos `--acp`, de canal e de IDE permanecem inalterados por padrão.
- O núcleo de UI do SDK é aditivo.
- O binding React do Web Shell é opcional e só executa em clientes que o
  importam.
- Código removido do spike de TUI do daemon não deve ser tratado como uma
  migração de produto.

## Próximos Passos

- Manter o Web Shell servido pelo daemon e o comportamento do host de IDE
  incorporado alinhados.
- Continuar construindo renderizadores de chat e terminal de primeira classe
  sobre blocos de transcrição.
- Adicionar eventos tipados mais ricos apenas onde os eventos existentes do
  daemon são de nível baixo demais para comportamento estável de UI no
  navegador.
- Considerar um pacote dedicado ` @qwen-code/daemon-ui-core` se consumidores
  fora do SDK precisarem do núcleo de UI como dependência independente.
