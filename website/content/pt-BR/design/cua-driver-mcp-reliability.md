# Fortalecimento de confiabilidade do MCP do cua-driver

## Problema

O proxy MCP aguarda uma resposta do daemon por até 120 segundos. Vários caminhos
de ferramentas do macOS podem bloquear por mais tempo que isso em chamadas
síncronas ao sistema operacional. O proxy então emite um `-32603` JSON-RPC
genérico, enquanto a operação abandonada e o processo filho continuam em
execução. Separadamente, o escopo de captura é lido tanto da memória quanto do
disco, então uma sessão MCP pode observar valores contraditórios depois que
`set_config` reporta sucesso.

## Design

### Uma configuração efetiva por sessão

Trate `capture_scope` como o override de tamanho de imagem por escopo de sessão
existente. Chamadas MCP o resolvem a partir do `_session_id` do chamador;
chamadas CLI anônimas usam o padrão global persistido. `set_config`,
`get_config` e `get_desktop_state` devem todos resolver através do mesmo
`ToolState`. A persistência anônima acontece antes que o valor em memória seja
confirmado, e uma falha de escrita é retornada ao chamador.

### Remover subprocessos da enumeração de aplicativos

Use `NSWorkspace.runningApplications` para aplicativos ativos e metadados de
bundle do Core Foundation para aplicativos instalados. Isso remove `osascript`
e `plutil` dos caminhos de descoberta de `list_apps`, `get_accessibility_tree`
e `launch_app`, em vez de tentar adivinhar um timeout seguro para cada bundle
instalado.

### Limitar e terminar a captura de screenshot

Mantenha o backend `screencapture` existente, mas faça o spawn através de um
único auxiliar limitado. Ao atingir o deadline, mate e colete o processo antes
de retornar um erro de ferramenta. Use um nome de caminho temporário único por
captura e uma guarda de limpeza RAII para que chamadas concorrentes não possam
colidir e falhas não deixem arquivos para trás.

### Limitar o trabalho de AX e do daemon abaixo do deadline do proxy

Defina o timeout nativo de mensagens do AX antes de caminhadas pela árvore e
ações de elemento. Adicione um deadline de ferramenta no daemon mais curto que
o deadline de transporte de 120 segundos do proxy como último recurso. Os
limites internos devem normalmente vencer; o deadline do daemon garante que uma
parada imprevista de ferramenta se torne um erro no nível da ferramenta em vez
de `-32603`.

### Isolar o endpoint do daemon do fork

Use um socket Unix e um diretório de PID padrão específicos do Qwen. Um daemon
antigo do upstream pode continuar em execução no padrão do upstream, mas o
proxy do Qwen não mais o reutilizará silenciosamente, executando uma
implementação/versão diferente do binário que o usuário iniciou. Overrides
explícitos de `--socket` permanecem inalterados.

### Preservar o diagnóstico de ciclo de vida

Reter o motivo pelo qual uma sessão virou tombstone (fim explícito, expiração
por ociosidade ou fim de conexão) e incluir esse motivo no texto de rejeição.
Mantenha a reativação explícita via `start_session`. Aumente o TTL de
ociosidade padrão para que um turno longo normal de agente não perca sua sessão
após apenas cinco minutos; o override por ambiente permanece disponível para
testes e implantações.

### Fazer os testes E2E executarem o binário do fork

Resolva `qwen-cua-driver` no testkit compartilhado. Um binário ausente não deve
mais transformar uma asserção E2E pretendida em um skip de zero segundo que
passa quando o binário do fork está presente sob seu nome real.

## Não objetivos

- Alterar o protocolo JSON-RPC do MCP ou repetir ações destrutivas.
- Fazer o Tokio conseguir cancelar chamadas bloqueantes externas arbitrárias;
  subprocessos do sistema operacional são mortos diretamente e o AX recebe seu
  timeout nativo de mensagens.
- Alterar o comportamento de normalização de coordenadas.

## Verificação

Execute os mesmos casos isolados de caixa preta de proxy/daemon usados para a
reprodução pré-correção: falha de persistência de configuração, shim de
enumeração de aplicativos travado, shim de screenshot travado e TTL/reativação
curta de sessão. Os dois casos de travamento devem retornar antes do deadline
de 120 segundos do proxy, não deixar nenhum processo filho e permitir uma
chamada subsequente imediata.
