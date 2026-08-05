# Contrato de pré-aquecimento do ACP e compatibilidade

## Contexto

O daemon expõe `POST /workspace/acp/preheat` e
`GET /workspace/acp/status`, mas clientes em produção não conseguem descobrir
essas rotas através de `/capabilities`. O SDK TypeScript também envia ambas as
chamadas pelo seu transporte ACP ativo por padrão, mesmo elas sendo rotas de
plano de controle REST do daemon. Por fim, um waiter HTTP que atinge o timeout
atualmente limpa a promessa compartilhada de pré-aquecimento do serviço de
workspace enquanto a inicialização do canal subjacente continua.

Esta mudança torna as rotas existentes do workspace primário descobertas e
confiáveis. Ela não introduz um estado de prontidão durável nem move a
barreira da primeira Session. Uma Session permanece a operação autoritativa:
pré-aquecimento e criação de Session coalescem através da inicialização de
canal compartilhada da bridge, e a criação de Session revalida o canal após
qualquer resposta de status ou de pré-aquecimento em um ponto no tempo.

## Capabilities e escopo

O daemon anuncia duas tags de capability v1 sempre ativas:

- `workspace_acp_preheat` para `POST /workspace/acp/preheat`
- `workspace_acp_status` para `GET /workspace/acp/status`

Cada tag significa que o contrato da rota nomeada existe. Nenhuma das tags diz
que o canal ACP está ativo no momento. As rotas permanecem singulares e
exclusivas do workspace primário. Os clientes não devem usá-las para um
workspace secundário nem fazer fallback de um workspace secundário para o
runtime primário.

O warmup qualificado por workspace requer semânticas separadas de propriedade,
confiança, drenagem e limite de recursos, e está fora desta mudança.

## Semântica de resposta

`GET /workspace/acp/status` retorna um snapshot em um ponto no tempo:

```ts
{
  channelLive: boolean;
}
```

`POST /workspace/acp/preheat` preserva sua forma de resposta existente:

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

As seguintes invariantes se aplicam:

- `ready` sempre é igual a `channelLive`.
- Um snapshot ativo retorna `ready: true` sem `reason` ou `error`.
- Um timeout do waiter retorna `reason: 'timeout'` apenas se o canal ainda não
  estiver ativo quando a resposta é construída.
- Uma inicialização que falhou, ou um pré-aquecimento resolvido que não
  produziu um canal ativo, retorna `reason: 'error'`.
- `durationMs` é um inteiro finito e não negativo medido com um relógio
  monotônico. É o tempo decorrido da chamada HTTP atual, não o tempo de vida
  de uma inicialização compartilhada à qual a chamada pode ter se juntado.
- O texto de erro visível ao cliente é estável e sanitizado. Erros detalhados
  do processo filho permanecem nos logs do daemon.

Timeout operacional e falha de inicialização continuam usando HTTP 200 para
que clientes existentes possam inspecionar o resultado. Entrada inválida,
autenticação, limite de requisições e falhas de inicialização de runtime
adiado mantêm seus contratos de erro HTTP existentes.

## Concorrência e comportamento de falha

O serviço de workspace mantém uma promessa compartilhada de pré-aquecimento
até que essa promessa se liquide. Toda requisição compete a mesma promessa
contra o seu próprio timeout. Um timeout do waiter encerra apenas aquela
requisição; ele não cancela a operação da bridge nem limpa a promessa
compartilhada. A liquidação limpa a promessa apenas quando sua identidade
ainda corresponde à operação compartilhada atual, para que uma conclusão mais
antiga não possa apagar uma tentativa mais nova.

Depois que a operação compartilhada se liquida, uma requisição posterior pode
tentar novamente se o canal não estiver ativo. Um canal que sai após uma
resposta bem-sucedida não é coberto por um lease: o status reporta o novo
snapshot e a próxima Session ou pré-aquecimento inicia um novo canal.

## Compatibilidade de clientes

O SDK TypeScript envia ambas as rotas pelo seu caminho de fetch REST,
independentemente do transporte ACP configurado. Ele não busca capabilities
automaticamente; os chamadores decidem quando fazer o preflight.

A Web UI usa as rotas apenas no seu fluxo de bootstrap adiado, sem sessão. Ela
requer `workspace_acp_preheat`, condiciona por gate a otimização opcional de
status a `workspace_acp_status` e requer que o workspace efetivo corresponda
exatamente a `capabilities.workspaceCwd`. Uma comparação exata pode
conservadoramente pular um pré-aquecimento para uma grafia alternativa do
caminho primário, mas não pode aquecer o runtime errado.

Se um daemon mais antigo omitir as capabilities, a Web UI não faz nenhuma
requisição de status ou pré-aquecimento do ACP e a primeira Session segue o
caminho existente de inicialização preguiçosa. A falha de pré-aquecimento
permanece best-effort e não pode falhar a conexão ou a criação de Session.

## Não objetivos

- Aguardar o pré-aquecimento antes da primeira Session
- Mover o pré-aquecimento para mais cedo na inicialização do daemon ou da Web
  UI
- Um lease de prontidão, geração, token ou incremento de versão de protocolo
- Cancelar a inicialização de canal compartilhada quando um waiter HTTP atinge
  o timeout
- Rotas de pré-aquecimento ou status do ACP qualificadas por workspace
- Alegar melhoria de latência a partir desta mudança apenas de contrato
