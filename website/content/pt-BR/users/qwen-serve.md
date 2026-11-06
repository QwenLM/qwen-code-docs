# Modo daemon (`qwen serve`)

Execute o Qwen Code como um daemon HTTP para que múltiplos clientes (plugins de IDE, interfaces web, scripts de CI, CLIs personalizadas) possam compartilhar sessões de agentes via HTTP + Server-Sent Events em vez de cada um iniciar seu próprio subprocesso.

> **Status:** Experimental. O daemon suporta implantações locais e remotas do Web Shell/API. Antes de expô-lo além do loopback, revise [Autenticação](#authentication) e o [modelo de ameaças da implantação](#default-deployment-threat-model).

## O que ele oferece

- **UI Web Shell integrada** — `qwen serve` serve o Web Shell baseado em navegador em sua raiz (`http://127.0.0.1:4170/`) pronto para uso; execute `qwen serve --open` para abri-lo automaticamente no seu navegador. Ele é servido na mesma origem da API, então não é necessária uma segunda porta ou reverse proxy. Passe `--no-web` para um daemon apenas de API.

  A barra lateral oculta **Sessões sem workspace** assim que sua lista carrega sem sessões, assim como **Fixadas**. Use o botão principal **Nova sessão** e escolha **Sem workspace** no compositor para iniciar uma conversa quando o grupo estiver oculto.

- **Até um filho ACP primário mais um filho sob demanda por secundário confiável, muitos clientes** — a produção tenta pré-aquecer a bridge primária e tenta novamente no primeiro uso após falha; runtimes secundários confiáveis iniciam seu próprio filho sob demanda, enquanto secundários não confiáveis nunca iniciam um. Sob o padrão `sessionScope: 'single'`, clientes direcionados ao mesmo workspace compartilham uma sessão ACP e colaboram na mesma conversa, nos mesmos diffs de arquivo e nos mesmos prompts de permissão.
- **Streaming seguro para reconexão** — SSE com reconexão `Last-Event-ID` permite que um cliente caia e retome exatamente de onde parou (dentro da janela de replay do ring).
- **Transcrições paginadas persistidas** — `GET /session/:id/transcript` retorna a transcrição ativa completa em disco como páginas de replay sem anexar um cliente ou alterar a janela de replay SSE ao vivo.
- **Permissões para o primeiro a responder** — quando o agente pede permissão para executar uma ferramenta, todos os clientes conectados veem a solicitação; qualquer cliente que responder primeiro vence.
- **Um daemon, um ou mais workspaces** — repita `--workspace` para registrar runtimes de workspace isolados sob um listener. O primeiro workspace é o primário e permanece o padrão para requisições que omitem `cwd`.
- **Canais experimentais gerenciados pelo daemon** — inicie com `qwen serve --channel <name>`, ou inicie sem um canal e selecione um depois com `qwen channel set`. Os workers são processos separados pertencentes ao ciclo de vida do daemon. A seleção pode ser consultada, substituída, recarregada e parada sem reiniciar o daemon.
- **Controle remoto de runtime** — altere o modo de aprovação de uma sessão (`POST /session/:id/approval-mode`), alterne uma ferramenta (`POST /workspace/tools/:name/enable`) ou skill carregado (`POST /workspace/skills/:name/enable`) por workspace, crie um `QWEN.md` vazio (`POST /workspace/init`, apenas mecânico — NÃO chama o modelo; para preenchimento por IA, faça um follow-up com `POST /session/:id/prompt`), reinicie um único servidor MCP com uma verificação prévia de budget (`POST /workspace/mcp/:server/restart`), ou adicione/remova servidores MCP em runtime sem reiniciar o daemon (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). O listener de loopback padrão sem token pode usar todos eles; as mutações estritas de workspace adicionalmente exigem credenciais de operador em outros modos de deploy.
- **Resumo da sessão** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) follow-up) — busque um resumo de uma frase de "onde eu parei" de uma sessão ativa (`POST /session/:id/recap`). Envolve o `generateSessionRecap` do core como uma side-query contra o modelo rápido; não polui nem o histórico principal do chat nem o stream SSE. Non-strict gate (mesma postura que `/prompt`); helper do SDK `client.recapSession(sessionId)`.
  - **Limite conhecido — amplificação de custo de tokens:** a rota é um endpoint de custo puro (cada chamada é uma side-query de LLM, sem benefício de estado) e o daemon não tem rate limit por rota na v1. Em um loopback padrão sem token, um cliente local com bug ou malicioso pode fazer spam para queimar tokens. Configure `--token` (e opcionalmente `--require-auth`) em hosts de dev compartilhados antes de expor o daemon.
  - **Segurança de resumo concorrente:** duas chamadas `/recap` simultâneas na mesma sessão executam duas side-queries independentes. `generateSessionRecap` lê um snapshot do histórico do chat via `GeminiClient.getChat().getHistory()` e o alimenta para uma chamada separada de `BaseLlmClient.generateText` (via `runSideQuery`); ele nunca anexa ou muta o `GeminiChat` da sessão. Seguro para chamar de múltiplos clientes sem coordenação.

## Notas sobre implantação e segurança [#deployment-and-security-notes]

- **O loopback é confiável por padrão** — `127.0.0.1:4170` inicia sem autenticação bearer, e todo processo local que pode acessá-lo recebe autoridade total da API, incluindo execução de código como usuário do daemon. Use um `QWEN_SERVER_TOKEN` estável com `--require-auth` em hosts compartilhados ou não confiáveis.
- **Listeners não-loopback sempre carregam um token bearer** — forneça seu próprio token ou use o token efêmero impresso na inicialização. Tokens gerados rotacionam ao reiniciar, então clientes reutilizáveis precisam de um token estável. HTTP não é criptografado; configure TLS antes de cruzar redes não confiáveis.
- **O lançamento em segundo plano tem dois caminhos** — use `qwen daemon start` para gerenciamento integrado de ciclo de vida local, ou os [templates systemd / launchd / tmux / nohup](./qwen-serve-deploy-local.md) quando precisar de supervisão pelo gerenciador de serviços ou inicialização após reboot.
- **Persistência de token é opt-in** — `qwen daemon start --save-token` armazena um bearer explicitamente fornecido em um sidecar exclusivo do proprietário para `qwen daemon token`; `qwen serve` ordinários e tokens gerados não usam esse sidecar. Veja [Inspecionar e controlar um daemon local](#inspect-and-control-a-local-daemon).
- **Multi-workspace é de operador único** — workspaces registrados compartilham o token bearer, listener, cotas e limite de falha de processo do daemon. Use daemons separados e um orquestrador externo para usuários independentes ou princípios de segurança; veja [Implantação multi-sessão e multi-workspace](#multi-session--multi-workspace-deployment).

Para a enumeração mais profunda do "que não corrigiremos na Fase 1" (modelo de mutação de estado de sessão em host único + N sessões paralelas compartilhando um filho ACP dentro de cada runtime de workspace), veja [Limites de escopo da Fase 1](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) abaixo.

## Início rápido

### Web Shell remoto e acesso por celular [#remote-web-shell-and-phone-access]

Para conectar-se a um daemon local em execução a partir de outra máquina, abra seu Web Shell e vá para **Configurações → Conexões → Permitir conexões remotas**. O acesso remoto está desativado por padrão. Ative-o, escolha uma interface de rede se solicitado e copie o endereço exibido e o token bearer para o formulário de conexão do outro Web Shell. Não é necessário nenhum comando adicional no terminal ou reinicialização do daemon.

O listener remoto serve os mesmos workspaces e sessões que o listener local. Ele primeiro usa a mesma porta numérica na interface selecionada. Se esse endereço estiver ocupado, escolha uma porta diferente nas configurações avançadas; o Qwen não altera portas silenciosamente nem interrompe outro serviço. Páginas HTTP em `localhost` e `127.0.0.1` em qualquer porta são permitidas. As configurações avançadas aceitam origens de navegador exatas adicionais, incluindo páginas HTTPS.

Desativar o acesso ou redefinir o token revoga as conexões remotas existentes; clientes locais e tarefas em execução pertencentes ao daemon continuam. Reativar gera um novo token. A configuração não é persistida entre reinicializações do daemon. O token está disponível apenas para o operador local autorizado. Um listener primário já exposto por configuração explícita de inicialização/proxy é rotulado separadamente e não é fechado por esta chave.

O endereço deve ser acessível através da rede e do firewall. O HTTP não criptografa o token; use uma rede confiável ou configure HTTPS. Uma página HTTPS não pode conectar-se a um endpoint HTTP remoto. A UI distingue erros de autenticação, política e conteúdo misto; um erro genérico de rede do navegador não pode distinguir com confiabilidade falhas de CORS, certificado e conectividade.

```bash
qwen serve --hostname 0.0.0.0
```

Quando nem `--token` nem `QWEN_SERVER_TOKEN` são fornecidos, um listener não-loopback gera um bearer efêmero de 128 bits (22 caracteres URL-safe) e o imprime uma vez na inicialização. Valores explícitos de flag têm precedência sobre o ambiente; em um bind não-loopback, um valor explicitamente vazio ainda falha fechado e recusa a inicialização, enquanto no loopback ele sobrepõe `QWEN_SERVER_TOKEN` e deixa o bind no modo sem token confiável descrito em `--require-auth`. O comportamento padrão de loopback permanece inalterado.

Em binds de curinga, a inicialização lista URLs locais/de rede sem token das interfaces reais e — para o token gerado, ou para seu próprio token em um terminal interativo — um **QR code com segredo** para um endereço rotulado de LAN privada. A enumeração de curinga lista apenas a mesma população de LAN privada/link-local que o Local Control anuncia (IPv4 RFC 1918 / RFC 3927, além de ULA IPv6 fc00::/7 em binds dual-stack); o filtro de interface de software que exclui adaptadores VPN e pontes de contêiner é uma **heurística de nome** ([#9158](https://github.com/QwenLM/qwen-code/issues/9158)), não uma garantia, então nomes de overlay k8s (`cbr0`, `cali*`, `vxlan.*`) podem passar. Um bind explícito não-loopback imprime e gera QR exatamente do endereço escolhido — incluindo um roteável. Dentro de um contêiner, o endereço enumerado é a própria interface do contêiner, então acessar uma porta publicada significa substituir pelo endereço do host; um contêiner com pty alocado conta como terminal interativo, então seus logs permanecem com segredo. Escaneie o QR para abrir o Web Shell embutido com o bearer no fragmento da URL. O navegador remove a credencial da URL e a mantém em `sessionStorage` por aba. Alternativamente, abra uma URL impressa e insira o token; credenciais ausentes ou expiradas mostram um formulário de nova tentativa. Tokens gerados são rotacionados na reinicialização. `--no-web` omite o QR, e stdout canalizado/redirecionado nunca republica um token estável de operador dentro de um QR — esse caso imprime uma dica de supressão nomeando `--token-qr` mais um QR somente de endereço (o Web Shell solicita o token na chegada) em vez disso; passe `--token-qr` ou defina `serve.tokenQr` nas configurações de usuário, sistema ou padrões do sistema para imprimir o QR completo com token de qualquer maneira; `--no-token-qr` suprime o QR de token do quickstart de inicialização para essa execução em todos os caminhos de quickstart, incluindo um terminal interativo e um token gerado (que ainda é impresso como sua própria linha de texto simples); ele não governa o QR de pareamento do Local Control, que `--local-control` imprime por design. Solicitar o QR onde nenhum pode ser impresso — `--no-web`, recursos do Web Shell não resolvidos, ou um bind loopback — informa isso em stderr em vez de ficar em silêncio. Endereços não implicam acessibilidade de firewall ou NAT; nenhum IP público é descoberto automaticamente.

As requisições **HTTP** de mesma origem do Web Shell embutido funcionam sem `--allow-origin`; outras origens de navegador ainda precisam dessa allowlist, e `Origin: null` permanece rejeitado. Recursos baseados em WebSocket (terminal, voz) e navegadores acessando o daemon através de um proxy reverso que termina TLS ainda exigem uma entrada explícita `--allow-origin <origin>` — cabeçalhos encaminhados nunca são confiáveis para estabelecer mesma origem. O mesmo vale para qualquer intermediário HTTP puro que reescreve o cabeçalho `Host`: o padrão nginx `proxy_set_header Host $proxy_host` e o Ingress k8s fazem o daemon ver um `Host` que não corresponde mais ao `Origin` do navegador. Passe `--allow-origin <origin>` para a origem que seu navegador realmente vê, ou configure o proxy para encaminhar `Host` literalmente. Em um bind **não-loopback**, apenas tradução de porta (`docker -p 8080:4170`) não precisa de nada — a verificação de mesma origem compara `Origin` contra o `Host` encaminhado e nunca consulta a porta de escuta. No bind **loopback** padrão, não: a allowlist Host de rebinding DNS só aceita a própria porta do daemon, então um túnel de tradução de porta (`ssh -L 8080:localhost:4170`) é rejeitado com `403 Invalid Host header` para cada requisição, incluindo o documento do shell, e `--allow-origin` não pode sobrescrevê-lo — encaminhe a mesma porta (`ssh -L 4170:localhost:4170`) ou faça bind não-loopback. O QR de pareamento do **Acesso Mobile** é construído a partir do esquema e `Host` da requisição que o solicita — nunca de cabeçalhos encaminhados — então atrás de um proxy que termina TLS ele mantém o esquema `http` do próprio daemon, e a troca rejeita a página `https` do telefone porque o convite está vinculado à origem para a qual foi emitido. Pareie enquanto navega no endereço direto do daemon, ou insira o token no telefone. O bearer concede autoridade total da API do daemon, incluindo execução de código. Trate tokens de terminal e capturas de QR como segredos. HTTP não é criptografado; as opções existentes `--tls-cert` e `--tls-key` fornecem HTTPS com seu próprio certificado.

Para usar um daemon remoto do Web Shell em sua própria máquina, insira a origem do daemon remoto (por exemplo `https://dev-box.example:4170`) e seu token bearer na tela de conexão ou em **Status do Daemon**. O daemon remoto deve permitir a origem da sua página local. Uma aba do navegador em uma porta fixa pode listar essa origem, por exemplo `qwen serve --hostname 0.0.0.0 --allow-origin http://localhost:4170`; o WebSocket do terminal também precisa dessa entrada. O **cliente desktop** é diferente: ele carrega seu próprio shell de `http://127.0.0.1:<OS-assigned port>`, então a origem da página muda a cada lançamento e nenhuma entrada fixa pode corresponder a ela. Permita explicitamente essa classe de origem com `--allow-origin http://127.0.0.1:*`, que admite qualquer porta exatamente nesse host loopback tanto para a API REST quanto para o WebSocket de terminal/voz. Prefira-o a `*`: `*` admite toda origem de navegador e cobre apenas REST, não o gate WebSocket. O token é mantido por aba e por origem de daemon e nunca é reutilizado para outro daemon. A barra lateral lista workspaces de um daemon selecionado por vez; alternar daemons recarrega a página e não combina listas de projetos locais e remotos. Use o formulário existente **Adicionar workspace** para registrar um caminho absoluto no daemon selecionado. Um link cujo `?daemon=` nomeia uma origem à qual este navegador não se conectou antes não é contatado até que você confirme na tela de conexão. Conexões cross-origin não oferecem a ponte de arquivos local do navegador, seja no Web Shell standalone ou embutido. Uma página HTTPS não pode conectar a um daemon HTTP, então sirva ambos via HTTPS fora de redes confiáveis.

### 1. Inicie o daemon (loopback, sem auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: trusted loopback mode; local callers have full API access without bearer authentication, including code execution as the daemon user. Use --require-auth with QWEN_SERVER_TOKEN on shared or untrusted hosts.
```

O bind padrão é `127.0.0.1:4170`. A auth Bearer está **desligada** e o listener primário é confiável, então qualquer processo local que possa alcançar a porta pode usar a API completa de operador, incluindo executar código como o usuário do daemon. Verificações de confiança de workspace, propriedade de sessão, `X-Qwen-Client-Id`, permissão, recurso, validação e específicas de rota ainda se aplicam. O daemon registra o diretório de trabalho atual como seu workspace primário; use um `--workspace /path/to/dir` absoluto para sobrescrevê-lo, e repita a flag para registrar runtimes isolados adicionais.

Para um daemon somente API, desabilite o Web Shell. As rotas de sessão, prompt, workspace, permissão e SSE permanecem inalteradas; as superfícies vinculadas ao Web Shell vão junto — a habilitação do Local Control falha fechada em todas as plataformas, e as rotas `/live/*` (mais, no macOS com `QWEN_SERVE_LIVE_NATIVE_HOST=1`, o WebSocket `/live/host`) não são registradas:

```bash
qwen serve --no-web
```

**Abra a UI Web Shell.** Navegue até `http://127.0.0.1:4170/` (ou inicie o daemon com `qwen serve --open` para abri-lo automaticamente) para o terminal completo no navegador — chat, diffs, histórico de commits, chamadas de ferramenta e prompts de permissão. A UI é servida na raiz do daemon na mesma origem da API. O restante deste guia usa HTTP cru para que você possa criar scripts diretamente para a API.

Para um lançamento autenticado de usuário único sem criar manualmente um token, opte explicitamente:

```bash
qwen serve --open-with-auth
```

Este modo exclusivo de loopback gera um bearer token de 256 bits quando nem `--token` nem `QWEN_SERVER_TOKEN` fornecem um, então o entrega ao Web Shell aberto como um fragmento de URL `#token=`. O shell remove o fragmento e mantém a credencial no `sessionStorage` daquela aba; o refresh funciona, mas fechar a aba ou reiniciar o daemon perde a credencial. Em CI, SSH ou outro ambiente onde o auto-open não está disponível, o daemon inicia e imprime a URL do fragmento para abertura manual. A URL impressa contém secrets.

A flag é desativada por padrão, inclui o comportamento de abertura do navegador e requer o Web Shell, assets construídos do Web Shell e um bind de loopback. O `qwen serve --open` simples permanece sem token no loopback. No modo de abertura autenticada, rotas de API normais rejeitam outros clientes locais sem o bearer; assets estáticos do Web Shell e o `/health` de loopback mantêm seu comportamento pré-autenticação existente, a menos que `--require-auth` também esteja definido. Para múltiplos clientes ou um Web Shell reabrível, use um token compartilhado estável em vez disso:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --open
```

### 2. Faça um sanity-check

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

O campo `workspaceCwd` apresenta o workspace de compatibilidade principal para que os clientes possam omitir intencionalmente `cwd` em `POST /session`. Os clientes atuais devem selecionar uma entrada confiável de `workspaces[]` e enviar o `cwd` dessa entrada ao direcionar explicitamente para um runtime. O campo `limits.maxPendingPromptsPerSession` anuncia o limite ativo de admissão de prompts por sessão; `null` significa que o limite está desabilitado. `limits.maxTotalSessions` anuncia o limite opcional de novas sessões em todo o daemon; `null` significa ilimitado.

### Inspecionar e controlar um daemon local [#inspect-and-control-a-local-daemon]

`qwen serve` publica um registro de descoberta local para cada listener ativo, então um segundo terminal não precisa analisar stdout ou procurar em `ps`:

```bash
qwen daemon start --port 4170      # detached; waits for the discovery record
qwen daemon status                 # ports, PIDs, workspaces, and health
qwen daemon status --json          # one JSON object per daemon
qwen daemon status --detail        # version, uptime, sessions, and issues
qwen daemon logs --port 4170 -f    # follow the recorded log file
qwen daemon stop --port 4170       # SIGTERM the recorded process
qwen daemon restart --port 4170    # stop, then start with the recorded settings
```

Os registros ficam sob o diretório de runtime (`$QWEN_RUNTIME_DIR`, `$QWEN_HOME`, ou `~/.qwen`) em `daemon/daemon-<port>.json`. Eles são `0600` em POSIX e nunca contêm o token bearer. Um registro deixado por um daemon que travou é reportado como `stale`; `status --prune` ou `stop` o remove. `stop` envia `SIGTERM` somente após o listener responder `/health` ou seu PID ainda estar vivo; `--force` adiciona `SIGKILL` após o timeout gracioso. Quando mais de um daemon estiver registrado, passe `--port`; `stop` também aceita `--all`.

`status --detail` solicita ao daemon seu próprio status: versão, tempo de atividade, sessões ativas e contagem de problemas. Ele envia `QWEN_SERVER_TOKEN` somente quando o registro indica que o daemon usa um bearer e o processo registrado está vivo, endereçável e iniciado conforme indicado no registro; um registro cujo namespace de PID não pode ser endereçado por este processo nunca recebe o bearer. Sem um token, um daemon que exige um bearer relata que a autenticação é necessária.

`qwen daemon start` inicia `qwen serve` desanexado (detached), aguarda seu registro de descoberta e imprime a URL vinculada, PID, caminho do log e comando de parada. Ele remove os identificadores da sessão de lançamento e as vinculações privadas de capacidade para que o filho seja um novo daemon, mantém o ambiente de modelo/autenticação do operador e passa `--no-token-qr` para que o log de inicialização não contenha um token. Os workspaces são canonizados, os diretórios de runtime relativos são fixados no diretório de lançamento antes da criação do processo, e as raízes relativas à unidade no Windows são resolvidas em relação à unidade de lançamento. Um vínculo não-loopback requer `QWEN_SERVER_TOKEN`; use `qwen serve` diretamente se desejar um token efêmero. O log de inicialização é `0600` e é removido após uma inicialização bem-sucedida. `--wait` aguarda até que o runtime esteja servindo (sem problema `daemon_runtime_starting` e não `error`); um tempo limite mantém o log de inicialização e sai com código diferente de zero.

Para um daemon em segundo plano autenticado com credencial local reutilizável, forneça um token estável através do ambiente e opte pelo sidecar de token:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen daemon start --require-auth --save-token --wait
qwen daemon token --port 4170          # print the saved bearer; treat the output as a secret
qwen daemon token --port 4170 --remove # delete only the local sidecar
```

Prefira `QWEN_SERVER_TOKEN` em vez de `--token`, que é visível na lista de processos do shell. `--save-token` requer um token fornecido explicitamente e recusa-se a iniciar sem um. O sidecar é `daemon/daemon-<port>-<pid>.token` sob o mesmo diretório de runtime que o registro de descoberta; ele é `0600` em POSIX e nunca é incluído no registro de descoberta ou no log do daemon. `qwen daemon stop` remove-o, enquanto `qwen daemon restart` leva-o para a instância substituta. `qwen daemon token --remove` exclui a cópia local, mas não altera nem revoga a credencial do daemon em execução; pare e inicie o daemon com um novo token para rotacioná-lo. O `qwen serve` comum, incluindo `--open-with-auth`, não escreve este sidecar.

`qwen daemon restart` para um daemon registrado através de `daemon stop` e o inicia novamente através de `daemon start --wait` em sua porta e hostname registrados, com seus workspaces de inicialização registrados, raiz do diretório de trabalho das Conversations, modo Web Shell e configuração `--require-auth`; `--web`/`--no-web` e `--require-auth`/`--no-require-auth` substituem o registro. As inscrições de workspace persistidas são restauradas pelo novo daemon em si, não reproduzidas como `--workspace`. Todas as outras opções `qwen serve` (por exemplo, `--profile`, `--channel`, `--allow-origin` ou limites de taxa) são redefinidas para seus padrões, então reinicie um daemon configurado com essas opções através de `qwen serve`. Antes de parar qualquer coisa, a reinicialização recusa um daemon HTTPS, um workspace de inicialização que não existe mais, uma execução dentro de um shell hospedado pelo daemon (como seu terminal Web Shell) e um daemon bearer sem `--token` ou `QWEN_SERVER_TOKEN`; um daemon bearer em execução deve aceitar o token, portanto a reinicialização nunca rotaciona a credencial. Um token mantido apenas em um `.env` de workspace ou arquivo de configurações não é lido por `qwen daemon`. `--force` é encaminhado para `daemon stop` somente quando você o passa. Se a porta registrada estiver ocupada, o daemon inicia na próxima porta livre e a reinicialização sai com código diferente de zero.

A raiz das Conversations registrada por um daemon atual é preservada por `daemon restart`, mesmo que `QWEN_CONVERSATIONS_DIR` no shell de reinicialização tenha mudado. Registros de descoberta mais antigos sem este campo usam o ambiente de lançamento ou o padrão novamente; eles não podem garantir a seleção anterior. Para escolher uma raiz diferente, pare o daemon e inicie-o com o novo valor. Veja [Diretório de trabalho das Conversations](#conversations-working-directory) para requisitos de persistência e recuperação.

### Capacidade de registro de workspace

O limite padrão de registro é 256. Defina `QWEN_SERVE_MAX_WORKSPACES=25 qwen serve --workspace /path/to/project` para reduzi-lo; os valores aceitos são inteiros decimais de 1 a 256. Valores inválidos falham na inicialização. Esta é uma configuração de inicialização do daemon: `.env` do projeto e `settings.env` do projeto não podem alterá-la. Chamadores incorporados podem definir `ServeOptions.maxRegisteredWorkspaces`, que tem precedência sobre o ambiente de inicialização.

O limite conta o workspace primário, workspaces secundários registrados e workspaces temporários criados pelo usuário. O runtime interno de Conversas é isento. O registro dinâmico retorna `409 workspace_limit_reached` na capacidade. `GET /capabilities` e `GET /daemon/status` expõem `limits.maxRegisteredWorkspaces`.

Com a capacidade padrão de registro de 256, o daemon padrão usa um limite global fixo de sessões de 800, incluindo um daemon iniciado com apenas um workspace. O mesmo padrão de sessão se aplica a qualquer capacidade de registro configurada acima de 25. `--max-total-sessions` ainda o sobrescreve; `0` o desativa. Em capacidades de 25 ou menos, o padrão existente permanece: um workspace de inicialização ou restaurado é ilimitado, e vários derivam o total do limite por workspace e dessa contagem. Mudanças de registro não recomputam o total. Isso não altera a política de memória do filho ACP nem promete 800 sessões concorrentes seguras.

O controle de canal suporta independentemente no máximo 25 proprietários de workspace, expostos como `limits.maxChannelControlWorkspaces`. Uma transição também conta proprietários retidos para recuperação; na capacidade, pare com sucesso todos os canais selecionados em um proprietário antigo antes de adicionar um novo. Uma transição grande demais retorna `409 channel_control_workspace_limit_reached`. `--channel all` continua selecionando apenas o workspace primário. O timeout do SDK de canal permanece inalterado.

Arquivos de registro persistidos mantêm o schema versão 1 e suportam até 255 registros secundários dentro de 8 MiB. Registros brutos, incluindo aliases obsoletos, consomem slots persistentes até serem esquecidos. Se o conjunto válido completo de inicialização exceder o limite configurado, a inicialização falha e deixa o arquivo inalterado. Para reduzir a capacidade, reinicie com a capacidade anterior, esqueça registros suficientes e reduza os argumentos explícitos de `--workspace` antes de reiniciar com o limite menor. Antes de fazer downgrade para um binário mais antigo, faça backup do arquivo e use o binário mais novo para reduzi-lo a no máximo 24 registros secundários e 256 KiB. Binários mais antigos, de outra forma, rejeitam esse store e iniciam apenas com workspaces explícitos; suas mutações de store falham antes de escrever.

### Ajustar o polling de estado ao vivo da sessão

O Web Shell atualiza o estado ao vivo da sessão do workspace a cada **5 segundos** por padrão. Para usar um intervalo diferente, defina a variável de ambiente do daemon antes de iniciá-lo:

```bash
QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS=10000 qwen serve --web
```

O valor é um inteiro em milissegundos, de `1000` a `2147483647`. Valores ausentes ou inválidos fazem fallback para `5000`. O intervalo se aplica a todos os workspaces servidos por aquele daemon; reinicie o daemon e recarregue quaisquer páginas abertas do Web Shell após alterá-lo. Ações locais de sessão e retornar a uma aba visível ainda podem atualizar imediatamente. Isso altera apenas o polling de estado ao vivo, não o polling completo do catálogo de sessões.

O daemon publica o intervalo efetivo como `sessionLiveStatePollIntervalMs` em `/capabilities`. O Web Shell usa esse valor e faz fallback para cinco segundos ao conectar a um daemon mais antigo que o omite. Consumidores do SDK podem ler o valor ao escolher sua própria programação de polling.

### Execute canais a partir do daemon

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under daemon-owned workspace workers
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all

# Or start a token-protected daemon with no channel worker
QWEN_SERVER_TOKEN=secret qwen serve

# Enable or replace its runtime selection later
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# Inspect or stop daemon-managed channels
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

Este modo é experimental e gerenciado pelo daemon. Ele não substitui o comando `qwen channel start` independente: sem `--daemon-url`, o comportamento existente de `qwen channel start`, `stop` e `status` permanece independente. Com `qwen serve --channel`, a seleção explícita vence, o daemon reserva a locação do serviço de canal antes de escutar, e a inicialização falha se o worker inicial não puder ficar pronto. Em uma inicialização sem flags, o daemon restaura `serve.channels` de cada workspace registrado confiável, então um canal configurado para iniciar em um workspace não primário volta com o daemon em vez de precisar de uma chamada de API de runtime. Se nenhuma fonte selecionar canais, o runtime pesado de canais permanece descarregado e nenhuma locação do serviço de canal é reservada até o primeiro PUT de runtime, ou até que um workspace que configure seu próprio `serve.channels` se registre. Um workspace confiável registrado após o início do daemon também restaura seus próprios `serve.channels`, uma vez por execução do daemon: registrá-lo novamente mais tarde — após removê-lo ou após sua confiança ter sido reconfigurada — não repete a restauração, então um canal que você parou entrementes permanece parado. Iniciar o daemon com um `--channel` explícito pula isso completamente, assim como parar canais com `qwen channel stop` (`DELETE /workspace/channel`) até que um `qwen channel set` os habilite novamente: registrar um workspace não é uma solicitação para reativar a hospedagem. Diferente da restauração na inicialização, que pula um nome que não pode hospedar e mantém o resto, um workspace tardio cuja lista contém tal nome não tem nenhum de seus canais recuperados, e o log do daemon registra o motivo. Registrar o workspace não espera que seus canais subam. Um nome de canal listado por um workspace que não pode hospedá-lo é pulado com um log, deixando os canais dos outros workspaces em execução; `all` ainda se aplica apenas ao workspace primário. Se um worker pronto posteriormente travar, o daemon continua em execução, reinicia-o sob uma política de reinício limitada e reporta seu estado (incluindo avisos `channel_worker_exited`) em `GET /daemon/status`.

A restauração automática ignora um campo de inicialização inválido ou um erro de validação ou lease antes dos workers iniciarem, registra a fonte de `serve.channels` e mantém as configurações não relacionadas em vigor. Após a falha na inicialização de um worker, o daemon continua apenas quando a limpeza for bem-sucedida. Timeouts globais de inicialização de runtime e paradas de worker não confirmadas retêm o comportamento normal de falha de inicialização; o lease de serviço permanece mantido enquanto a terminação do worker não for confirmada. Verifique o log do daemon para restaurações ignoradas ou com falha.

Nomes de inicialização armazenados devem ser não vazios, não ter espaços em branco no início ou fim e não conter caracteres de controle ou invisíveis inseguros. Entradas inválidas são ignoradas individualmente e registradas por índice do array. A inicialização não os transforma em um nome de instância diferente nem reescreve configurações. O toggle de inicialização de canal reflete a configuração persistida, enquanto o estado de runtime reporta se o canal está rodando.

O controle de runtime é exposto como `GET`, `PUT` e `DELETE /workspace/channel`; os helpers do SDK são `getChannelWorkerControl()`, `setChannelWorkerSelection()` e `stopChannelWorker()`. PUT/DELETE/reload usam o gate de mutação estrito: chamadores primários de loopback confiável podem usá-los sem token, enquanto outros deploys exigem credenciais de operador. As seleções de runtime são deliberadamente efêmeras: PUT não edita as configurações nem as opções de boot, e um restart retorna à seleção explícita `qwen serve --channel`, caso contrário ao `serve.channels` do workspace primário confiável, ou a desativado quando nenhum existir. Seleções nomeadas explícitas de CLI e runtime são aparadas e deduplicadas na ordem de primeira ocorrência; a ordem é preservada porque o primeiro canal pode afetar a seleção compartilhada de modelo.

O `qwen channel set` e `qwen channel reload` gerenciados pelo daemon, além de `status` e `stop` com `--daemon-url`, não podem descobrir um token gerado por `--open-with-auth`. Use `QWEN_SERVER_TOKEN` e passe o mesmo valor com `--token` para esses clientes, ou omita o modo de abertura autenticada.

O daemon lê as configurações de cada canal (tokens, `proxy`, `model` por canal) quando seu worker inicia. Para reler as configurações sem alterar a seleção confirmada, chame `POST /workspace/channel/reload` (SDK `client.reloadChannelWorker()`, ou `qwen channel reload`). O reload re-resolve a propriedade do workspace e reinicia os workers selecionados através do mesmo caminho de reconcile seguro contra rollback. A capability `channel_control` está presente sempre que o controle de runtime está conectado; `channel_reload` está presente apenas enquanto o gerenciador está habilitado. Threads persistidas são restauradas do disco.

O `cwd` de cada canal selecionado deve resolver para um workspace registrado, e os canais são agrupados por esse workspace proprietário: um daemon de workspace único executa um worker (inalterado desde antes); um daemon multi-workspace (`--workspace` repetido) executa um worker por workspace que possui um canal selecionado, cada um vinculado ao cwd, `QWEN_DAEMON_WORKSPACE` e sobreposição de env desse workspace. Para hospedar um canal em um workspace não primário, defina-o no próprio `.qwen/settings.json` desse workspace (sem necessidade de `cwd`) ou defina um `cwd` explícito igual ao caminho do workspace. Um canal definido apenas no escopo usuário/sistema sem `cwd` é ambíguo entre múltiplos workspaces: uma seleção `--channel` explícita falha na inicialização, enquanto a restauração automática registra o erro de propriedade e pula essa seleção antes que os workers iniciem. `--channel all` permanece exclusivo do primário (ele hospeda os canais do workspace primário) e não pode ser combinado com canais nomeados.

Substituir uma seleção pré-verifica a configuração, a propriedade e a confiança antes de parar qualquer coisa. Ele mantém os workers do workspace cuja seleção ordenada não foi alterada. Se um worker alterado não puder iniciar, o daemon para novos workers e restaura a seleção antiga. Se o daemon não conseguir confirmar que um processo filho antigo terminou mesmo após SIGKILL, ele mantém o lease do PID e recusa criar um worker duplicado. Um worker ainda é considerado pronto quando pelo menos um adaptador solicitado se conecta; PUT então retorna `partial: true`, e `/daemon/status` reporta `channel_worker_partial_connect` para os adaptadores ausentes. Um nome `serve.channels` que o daemon não conseguiu ativar — uma seleção configurada cujo worker falhou ao iniciar, um nome que o boot não pôde atribuir, ou um que a restauração de um registro tardio deixou inativo — é reportado como `channel_restore_failed` em `/daemon/status`, e aparece como `error` com seu `lastError` na lista de canais desse workspace quando as próprias configurações desse workspace o definem. Outras maneiras pelas quais um nome pode permanecer sem host estão apenas no log do daemon.

Quando um adapter rejeita `connect()`, snapshots do worker atual podem incluir entradas `startupFailures` com o canal, `phase: "connect"`, um código opcional de adapter e uma mensagem com credenciais removidas. `qwen channel set`, `qwen channel reload` e `qwen channel status --daemon-url …` remotos imprimem essas razões. Se todo adapter falhar durante um set ou reload dinâmico, o comando recebe `502 channel_worker_start_failed`; as razões da resposta descrevem essa tentativa e seu `state` descreve o resultado após o rollback. A tentativa com falha não é retida por solicitações de status posteriores. No máximo 64 razões são retidas por inicialização de worker, e os códigos de adapter devem ser tratados como diagnósticos em vez de categorias estáveis. A inicialização inicial `qwen serve --channel …` ainda sai quando nenhum adapter conecta.

O daemon também expõe snapshots somente leitura do runtime para UIs de clientes e operadores: `GET /daemon/status`, `GET /workspace/mcp`, `GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`, `GET /workspace/preflight`, `GET /workspace/:id/session-info`, `GET /session/:id/status`, `GET /session/:id/context`, `GET /session/:id/supported-commands`, e `GET /session/:id/tasks`, `GET /session/:id/lsp`, `GET /session/:id/resources`, e `GET /session/:id/transcript`.

`GET /workspace/:id/session-info` (e o gêmeo plural `GET /workspaces/:workspace/session-info`) retorna contagens agregadas de sessões para um workspace: `active` / `archived` / `total` persistidos, além da contagem `live` atual em memória quando o estado ao vivo está disponível. Workspaces secundários não confiáveis registrados omitem `live` porque suas leituras de catálogo não consultam a ponte ao vivo. A lista paginada `GET /workspace/:id/sessions` não inclui um total, então esta é a superfície dedicada para “quantas sessões existem?” — útil quando tarefas agendadas ou recorrentes deixam um grande armazenamento local.

> ⚠️ **Varredura de disco — não faça polling.** Este endpoint percorre arquivos JSONL de sessões locais sob o diretório de chats do workspace. As respostas sempre incluem `expensive: true` e `cost: "disk_scan"`. Chame-o com pouca frequência (atualização manual, ferramentas de operador, carregamento ocasional da UI) — nunca em um timer apertado ou a cada renderização da barra lateral. Prefira `GET /workspace/:id/sessions` para navegar por páginas e `GET /daemon/status` para contagens de sessões em memória ao vivo. Uma resposta com `truncated: true` significa que a varredura atingiu seu limite de segurança ou não pôde classificar todos os arquivos candidatos, então as contagens persistidas são limites inferiores.

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` retorna o resumo da ponte ao vivo para uma única sessão: `sessionId`, `workspaceCwd`, `createdAt`, `displayName` opcional, `clientCount` e `hasActivePrompt`. Ele responde `200` com o resumo quando o daemon mantém uma sessão ao vivo com esse id, e `404` (corpo `{ "error": …, "sessionId": … }`) caso contrário. Use-o para verificar por polling se uma sessão conhecida ainda está em execução (`hasActivePrompt`) ou quantos clientes estão anexados (`clientCount`) sem buscar e escanear toda a lista paginada de sessões:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Esta é a visualização bruta da sessão ao vivo, então `clientCount` e `hasActivePrompt` correspondem à entrada correspondente em `GET /workspace/:id/sessions` — mas as duas rotas não são idênticas byte por byte. O endpoint de lista enriquece cada item com dados persistidos do armazenamento de sessões: seu `createdAt` é o tempo do primeiro prompt persistido, e adiciona `updatedAt` mais um `displayName` derivado do título armazenado ou do primeiro prompt. `/status`, em vez disso, reporta o `createdAt` da própria sessão ao vivo, omite `updatedAt` e retorna `displayName` apenas quando um está definido na sessão ao vivo.

`GET /session/:id/lsp` retorna status estruturado do LSP por sessão. Inicie o daemon com `--experimental-lsp` para habilitar o LSP em sessões de agente geradas; caso contrário, a rota retorna `enabled: false` sem servidores.

`GET /session/:id/resources` retorna os snapshots sanitizados de Skill e MCP do próprio Config daquela sessão ao vivo. Use-o quando uma sessão pode ser executada a partir de um worktree ou outro diretório efetivo cujos recursos diferem do workspace base. Detalhes de autenticação, pool, orçamento e erros de descoberta de MCP pertencentes ao workspace são omitidos desta visualização de sessão. Verifique a capacidade `session_resources` antes de chamá-la.

`GET /daemon/status` é o instantâneo consolidado de solução de problemas. O `detail=summary` padrão lê apenas o estado do daemon em memória (sessões, permissões, contagens de transporte SSE/ACP, rejeições por limite de taxa, memória do processo, limites resolvidos) e não inicia o filho ACP. Use `GET /daemon/status?detail=full` para diagnósticos por sessão, detalhes da conexão ACP, contagens do fluxo de dispositivo de autenticação e seções de status do workspace quando você estiver investigando ativamente um problema.

`GET /workspace/mcp` relata o runtime ACP ao vivo e não inicia o filho ACP quando ocioso; um daemon ocioso retorna `initialized: false` com um instantâneo vazio. Uma vez que uma sessão está ativa, ele muda para `initialized: true` e exibe o estado real.

`GET /workspace/providers` é respondido localmente pelo daemon a partir das configurações do workspace e do ambiente, portanto não depende de um filho ACP estar ativo, e `acpChannelLive` é o sinal de vivacidade. Se as configurações do workspace ou a configuração do modelo não puderem ser resolvidas, a resposta terá `initialized: false`, uma matriz `providers` vazia e uma entrada `errors`. A rota recorre ao instantâneo ACP ao vivo somente quando um daemon é construído sem um construtor de status do provedor local do daemon; a resposta local do daemon nunca inclui modelos registrados em tempo de execução.

`GET /workspace/skills` retorna imediatamente uma observação retida do daemon e a revalida em segundo plano, de modo que uma leitura quente não espera pelo filho ACP. O objeto opcional `snapshot` reporta `observedAt`, `ageMs`, `stale` e `refreshing`; verifique `ageMs` antes de tratar o catálogo como atual. Antes da primeira observação bem-sucedida, uma leitura dentro da janela de limitação de inicialização de um segundo pode retornar `initialized: false` com uma entrada `errors` em vez de esperar; isso é indisponibilidade passível de nova tentativa, não um catálogo vazio.

Para atualizar as configurações de Skill do workspace por nome, chame `POST /workspace/skills/:name/enable` com `{ "enabled": true | false }` após verificar a capability `workspace_skill_settings_toggle`. Para alterar vários nomes, verifique `workspace_skill_settings_batch_toggle` e chame `POST /workspace/skills/enable` com `{ "skillNames": ["review", "deploy"], "enabled": false }`; processa todos os nomes estruturalmente válidos juntos, persiste todas as alterações de declaração resultantes em no máximo uma escrita de configurações travada e atualiza as sessões ACP ativas uma vez quando algo mudar. Essas rotas escrevem `skills.disabled` e `skills.enabled` do workspace sem consultar o catálogo de Skills carregado, então nomes podem ser desabilitados antes da instalação ou enquanto sua Extension estiver inativa. Habilitar remove uma desabilitação correspondente do workspace e registra um opt-in explícito `skills.enabled`, mesmo antes da instalação, então essa entrada pode sobrescrever a desabilitação interna de Skill de uma Extension. Repetir a mesma declaração é um no-op (`changed: false`). Seus paths e corpos de requisição não mudaram; as capabilities específicas de configurações substituem as tags descontinuadas de toggle de Skill validadas por catálogo. O array `errors` do batch permanece para compatibilidade de wire e está vazio para nomes estruturalmente válidos. Uma entrada `skills.disabled` rígida herdada de um escopo superior permanece autoritária para disponibilidade efetiva, mas não bloqueia o workspace de registrar ou remover sua própria declaração. Células de status de Skill expõem `disabledReason` (`hard`, `default` ou `inactive_extension`) e um `lockedScope` opcional. Escritas de workspace não confiável ainda são rejeitadas. Uma resposta `deferred` significa que nenhum filho estava ativo na verificação de atividade ou uma requisição alterada perdeu seu filho/sessão durante o refresh necessário; quando `changed` é true, a declaração persistida se aplica quando um filho inicia. Se uma declaração realmente mudou é reportado por `changed` (em cada resultado para uma requisição de batch). `skills.disabled` desabilita tanto o uso manual quanto do modelo, ao contrário de `disable-model-invocation: true`, que mantém a invocação direta via `/skill-name` disponível. Para batches de V2 Extension, verifique `extension_batch_activation_v2`: `PUT /extensions/activation` altera os padrões globais, enquanto `PUT /workspaces/:workspace/extensions/activation` altera overrides exatos para o workspace selecionado e aceita `"inherit"` para limpá-los. Ambos aceitam nomes em `extensionNames`; `enabled` e `disabled` podem ser declarados antes da instalação, enquanto `inherit` para um nome desconhecido é um no-op. Cada requisição retorna uma operação para fazer poll. Quando `extension_activation_explicit_refresh` é anunciado, essa operação termina após a política de ativação ser confirmada e não atualiza diretamente as sessões ativas. Para aplicá-la imediatamente, submeta o refresh independente de Extension primário ou qualificado por workspace após a ativação ser bem-sucedida. Sem esse refresh explícito, outros workspaces podem continuar usando a ativação anterior por até a próxima passagem do reconciliador de geração de 30 segundos; reconciliação com falha é tentada novamente por passagens posteriores.

`GET /workspace/env` e `GET /workspace/preflight` sempre respondem com `initialized: true` independentemente do estado do ACP. `env` nunca consulta o ACP (apenas informações do processo do daemon); `preflight` responde células de nível de daemon a partir de `process.*` e emite placeholders `status: 'not_started'` para células de nível ACP quando o filho está ocioso.

`GET /workspace/env` reporta o runtime, plataforma, sandbox, proxy e a **presença** (nunca o valor) de variáveis de ambiente secretas na lista de permissões, como `OPENAI_API_KEY`, do processo do daemon. As URLs de proxy têm suas credenciais removidas e são reduzidas a `host:port` antes de serem transmitidas pela rede. A rota sempre responde diretamente a partir do processo do daemon e nunca gera um filho ACP.

`GET /workspace/preflight` retorna uma lista de verificações de prontidão. **Células de nível de daemon** (versão do Node, entrada da CLI, diretório do workspace, ripgrep, git, npm) sempre são renderizadas. **Células de nível ACP** (autenticação, descoberta MCP, habilidades, provedores, registro de ferramentas, saída) exigem um filho ACP ativo — quando o daemon está ocioso, elas emitem placeholders `status: 'not_started'` em vez de iniciar o ACP apenas para preenchê-las. Falhas mapeiam para um enum `errorKind` fechado (`missing_binary`, `auth_env_error`, `init_timeout`, `restore_timeout`, `protocol_error`, `missing_file`, `parse_error`, `blocked_egress`) para que as interfaces do cliente possam renderizar remediação estruturada.

O daemon também expõe helpers de arquivo de workspace:

- `GET /file` lê arquivos de texto. Respostas de instantâneo completo retornam um hash `sha256:<hex>` de bytes brutos; janelas de linhas finitas de arquivos acima de 256 KiB omitem esse hash.
- `GET /file/bytes` lê janelas de bytes crus limitados e retorna conteúdo em base64.
- `POST /file/write` cria ou substitui arquivos de texto.
- `POST /file/edit` aplica uma substituição de texto exata.

Escrita/edição são **rotas de mutação estritas**: o ouvinte primário confiável de loopback sem token concede autoridade de operador; incorporações não confiáveis sem credencial retornam `token_required`. Substituições e edições exigem o último `expectedHash` de um `GET /file` de instantâneo completo (ou uma `GET /file/bytes` de janela completa). Uma janela parcial de arquivo grande não pode ser usada como token de concorrência otimista. `create` nunca sobrescreve. Escritas explícitas em caminhos ignorados são permitidas, mas auditadas. Escritas binárias, exclusão/movimento/criação de diretório e criação recursiva de pais não fazem parte desta superfície.

### 3. Abra uma sessão

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` pode ser omitido — a rota faz fallback para o workspace primário do daemon. Postar um `cwd` que não canoniza para nenhum workspace registrado retorna `400 workspace_mismatch`.

Um segundo cliente postando em `/session` para o mesmo runtime de workspace resolvido recebe `"attached": true` sob o padrão `sessionScope: 'single'` — agora eles estão compartilhando a sessão de agente daquele runtime. Omitir `cwd` resolve para o primário; selecionar outro workspace registrado cria ou anexa à sessão padrão separada daquele runtime.

### 4. Inscreva-se no stream de eventos (em outro terminal primeiro)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

A linha `data:` é o **envelope de evento completo** — `{id?, v, type, data, originatorClientId?}` — JSON-stringified em uma única linha. O payload ACP (o bloco `sessionUpdate` neste exemplo) fica sob `data` dentro desse envelope. As linhas `id:` / `event:` de nível SSE são conveniência para clientes EventSource; os mesmos valores aparecem dentro do envelope JSON para que consumidores raw-`fetch` também os recebam.

Abra isto **antes** de enviar o prompt — o buffer de reprodução SSE mantém os últimos 8000 eventos para que um assinante tardio possa recuperar via `Last-Event-ID`, mas para o caso simples de "assistir a um único prompt", é mais fácil assinar primeiro e deixar transmitir ao vivo.

O stream emite `session_update` (chunks LLM, chamadas de ferramenta, uso), `permission_request` (ferramenta precisa de aprovação), `permission_resolved` (alguém votou), `model_switched`, `model_switch_failed` e os quadros terminais `session_died` (filho do agente travou — SSE então fecha) e `client_evicted` (sua fila transbordou — SSE então fecha).

### 5. Envie um prompt (de volta no terminal original)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

O `curl -N` do passo 4 imprimirá os frames à medida que chegarem.

### Guarda opcional de parada do Todo

Clientes de daemon de longa duração podem optar por uma continuação limitada quando a cadeia de trabalho atual escreve com sucesso uma lista Todo de nível superior e depois para com itens ainda pendentes ou em andamento. Adicione isto a `settings.json` e reinicie o daemon:

```json
{
  "experimental": {
    "todoStopGuard": true
  },
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

A proteção adiciona no máximo duas chamadas consecutivas de modelo primário sem nova entrada do usuário. Uma mensagem do usuário no meio do turno executa primeiro e inicia um novo estágio de duas tentativas; novas tentativas/continuação e resultados relacionados de segundo plano mantêm o orçamento do estágio atual. Cada chamada e o estado final de esgotamento aparecem como eventos `session_update` reproduzíveis com `_meta.source: "todo_stop_guard"`; os metadados incluem a tentativa e a contagem de não concluídos, mas nunca o texto Todo. Um prompt completo enfileirado também executa primeiro, e as regras existentes de permissão/cancelamento permanecem inalteradas.

Enquanto uma cadeia armada aguarda trabalhos de segundo plano relacionados, cron/loop não relacionados e notificações de tarefas antigas são adiados. Trabalhos recorrentes são limitados e coalescidos por tarefa até que a cadeia ceda.

A opção tem valor padrão `false`, requer reinicialização e é desativada forçadamente no modo seguro, modo bare e no modo de Aprovação `plan`. Ela existe apenas na memória: carregar o estado do Todo do disco ou reiniciar o daemon não a ativa. Defina `tools.todoWrite.enabled` em settings.json e reinicie o Qwen Code; então, um novo prompt comum deve executar com sucesso seu próprio `todo_write` de nível superior; tentativas/continuações e reconexões ao vivo do cliente mantêm a cadeia de trabalho atual na memória. Alterar com sucesso o diretório de trabalho da sessão limpa essa configuração para que um Todo antigo não possa ser retomado em um novo workspace.

## Autenticação [#authentication]

Para qualquer coisa além de loopback, cada requisição API requer um token bearer. Forneça um estável para clientes reutilizáveis, ou comece sem um e use o token efêmero que o daemon gera e imprime:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → uses QWEN_SERVER_TOKEN; generates an ephemeral token if neither token source is supplied
```

Os clientes então enviam `Authorization: Bearer <token>` nas requisições normais de API — `$QWEN_SERVER_TOKEN` quando você exportou um, ou o bearer impresso na inicialização quando o daemon o gerou (esse caminho nunca define a env var, então copie o valor da saída de inicialização). `/health` é isento **apenas em binds de loopback comuns** para que as sondas de liveness do k8s/Compose dentro do pod não precisem de credenciais. Em binds não-loopback (`--hostname 0.0.0.0` etc.) `/health` exige o token com as outras rotas normais de API — caso contrário, um atacante pode sondar endereços arbitrários para confirmar a existência do daemon. A entrada de webhook de canal é separada em todo modo e usa seu `x-qwen-webhook-secret` configurado em vez do bearer do daemon. Use `/capabilities` para verificar se seu token configurado está correto de ponta a ponta:

> **Loopback com hardening (`--require-auth`).** O comportamento padrão de loopback sem token é adequado para um laptop de usuário único, mas inseguro em hosts de dev compartilhados, runners de CI ou workstations multi-tenant onde qualquer usuário local pode dar `curl 127.0.0.1:4170`. Passe `--require-auth` para tornar o bearer token obrigatório em toda rota normal de API — incluindo `/health` e `/capabilities` — mesmo quando vinculado a `127.0.0.1`. A entrada de webhook de canal permanece autenticada independentemente por `x-qwen-webhook-secret`. As rotas de documento e assets do Web Shell permanecem pré-auth; use `--no-web` para removê-las. A inicialização falha quando nenhuma fonte de token resolve, e no loopback isso significa `--token`, `QWEN_SERVER_TOKEN` ou `--open-with-auth` — o último instala seu próprio token gerado antes da inicialização, então `--require-auth --open-with-auth` inicia. A geração depende da grafia de `--hostname`: grafias de loopback (`127.0.0.0/8`, `localhost`, `::1`, `[::1]`) nunca geram, enquanto qualquer outra grafia — incluindo um nome DNS que por acaso resolve para loopback — gera um bearer efêmero que satisfaz `--require-auth` e é impresso na inicialização (apenas token quando o socket vinculou ao loopback), rotacionando a cada restart, então fixe `--token` ou `QWEN_SERVER_TOKEN` para clientes reutilizáveis. Com a flag ativada, um cliente **não autenticado** não pode ler `/capabilities` para descobrir que a auth é exigida; a superfície de descoberta é o próprio corpo da resposta 401. Uma vez autenticado, a tag `caps.features.require_auth` é uma confirmação pós-auth de que o deploy está com hardening (útil para UIs de auditoria / compliance):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
# Paste the bearer the daemon printed at startup, or your own QWEN_SERVER_TOKEN.
TOKEN='<printed bearer>'
curl -H "Authorization: Bearer $TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

A comparação do token é constant-time (SHA-256 + `crypto.timingSafeEqual`); as respostas 401 são uniformes entre "header ausente", "scheme errado" e "token errado" para que um side-channel não possa distinguir.

`--open-with-auth` é uma conveniência do CLI, não outra fonte de token do daemon: ele seleciona `--token` quando essa opção está definida (mesmo que vazia), caso contrário `QWEN_SERVER_TOKEN`, então aparar o valor selecionado e gera apenas se o resultado estiver vazio. O daemon não persiste o valor gerado nem o exporta como `QWEN_SERVER_TOKEN`; a handoff interna existente de filho autenticado permanece inalterada. O Web Shell armazena sua cópia do navegador apenas no `sessionStorage` da aba receptora; este modo não adiciona nenhum mecanismo de descoberta de credenciais cross-tab ou de cliente externo. O token não é revogável independentemente nem vinculado a uma identidade de cliente. A posse concede a mesma autoridade do daemon que qualquer outro bearer token. Consulte o [design de lançamento autenticado do Web Shell](../design/2026-08-22-serve-open-with-auth.md) e o trabalho futuro relacionado em [#4514](https://github.com/QwenLM/qwen-code/issues/4514).

## HTTPS / TLS (para acesso móvel / cross-device) [#https--tls-for-mobile--cross-device-access]

Por padrão, o daemon serve HTTP puro. Isso é fine no `localhost`, mas um celular ou tablet atingindo um IP de LAN (`https://192.168.x.x:4170`) **não** é um [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) sobre `http://` — então os navegadores bloqueiam `getUserMedia` (entrada de voz), WebRTC e outras APIs apenas de secure context. Passe `--tls-cert` + `--tls-key` para servir o Web Shell sobre HTTPS e desbloqueá-los:

```bash
# 1. Install a local CA and trust it (one-time). The mobile device must
#    also trust this CA — mkcert prints where the root cert lives.
mkcert -install

# 2. Generate a cert for your machine's LAN IP. Add localhost / 127.0.0.1 to
#    the SANs too: with `--open`, the daemon rewrites the browser URL to
#    127.0.0.1, so a cert scoped to only the LAN IP would be rejected with
#    ERR_CERT_COMMON_NAME_INVALID. (mkcert names the output after all hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Start the daemon over HTTPS. Non-loopback binds still require a token,
#    and the browser Origin must be allowed through CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

Notas:

- **Ambas as flags ou nenhuma** — a inicialização falha se apenas uma for fornecida (um certificado sem chave não pode iniciar um listener HTTPS).
- **TLS é ortogonal à autenticação** — o HTTPS criptografa o transporte; quando um bearer token está configurado, ele controla as rotas normais de API exceto `/health` em um bind de loopback comum. Passe `--require-auth` para controlar também o `/health` do loopback. A entrada de webhook de canal sempre usa seu próprio secret compartilhado. Binds não-loopback sempre carregam um token com ou sem TLS — o que você passar, ou o efêmero que o daemon gera e imprime na inicialização.
- **O escopo é apenas a terminação TLS** — sem geração automática, sem ACME / Let's Encrypt. Esta é uma conveniência para LAN / desenvolvimento; para implantações voltadas para a internet, termine o TLS em um reverse proxy (veja o modelo de ameaças abaixo).
- **Workers de canal discam de volta para o daemon via `https://`** — então eles também precisam confiar no certificado de serviço. Um certificado autoassinado (ou uma fullchain que carrega sua própria raiz) não precisa de nada: o daemon o injeta no `NODE_EXTRA_CA_CERTS` de cada worker. O fluxo mkcert acima é **emitido por CA**, então a folha sozinha não pode ancorar a cadeia — exporte `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"` no ambiente de lançamento do daemon antes de iniciar com `--channel`. Um valor definido pelo operador é _combinado_ com o certificado do daemon, não substituído. Sem isso, o daemon inicia normalmente enquanto todo worker de canal entra em loop de restart com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; o log do daemon nomeia a lacuna no boot.
- **Um bind wildcard IPv6 é discado de volta no loopback que este host realmente atribui** — `--hostname ::` (ou `[::]`) vincula um socket IPv6. (Um `--hostname` vazio nunca alcança o listener: a inicialização o recusa como erro de operador antes de vincular, então um arquivo compose com um `HOSTNAME` não definido falha alto em vez de fazer wildcard silencioso.) Esse socket é dual-stack (o Node fixa `IPV6_V6ONLY=0` nele, então o sysctl `net.ipv6.bindv6only` não muda isso), e ambos os loopbacks geralmente o alcançam — mas um host sem IPv4 tem apenas `::1`, enquanto um host que vincula `::` mas não tem `::1` em seu loopback (por exemplo `net.ipv6.conf.lo.disable_ipv6=1`) tem apenas `127.0.0.1`. Workers são enviados para `[::1]` quando este host o atribui e para `127.0.0.1` caso contrário. Um certificado de serviço para um bind wildcard IPv6 deve carregar ambos os loopbacks em seus SANs (`mkcert localhost 127.0.0.1 ::1` cobre isso); o diagnóstico de confiança de boot inspeciona a URL exata que os workers vão discar e nomeia a lacuna. `--hostname 0.0.0.0` não muda e ainda precisa de `127.0.0.1`.
- **Rotacionar `--tls-cert` no lugar exige um restart do daemon** — o daemon serve os bytes que leu no boot, então até ele reiniciar, workers respawnados podem carregar conteúdos mais novos do que o daemon apresenta e seus handshakes falham.

## Instale o Web Shell como um aplicativo

Em um navegador compatível, abra o Web Shell do daemon e use a ação **Instalar app** ou **Adicionar à tela inicial** do navegador. O aplicativo instalado abre o mesmo servidor em uma janela independente com o nome e ícone do Qwen Code. No iOS, use o menu Compartilhar do navegador e **Adicionar à Tela de Início**. A disponibilidade depende do navegador e do dispositivo.

O daemon serve os metadados do PWA por si só: `GET /manifest.webmanifest` e `GET /sw.js` são rotas pré-autenticação (o navegador busca ambos antes de qualquer cabeçalho Authorization existir), e `sw.js` é servido com `Service-Worker-Allowed: /` para que seu escopo cubra toda a origem. O worker armazena em cache apenas assets de build do Vite com hash de conteúdo, usando estratégia cache-first. Ícones públicos sem hash e o manifesto são revalidados via HTTP. Requisições de API, streams de eventos e requisições contendo um cabeçalho de autorização permanecem na rede.

Use uma conexão HTTPS confiável para um celular ou outro dispositivo remoto; HTTP em `localhost` ou um endereço de loopback é suportado para desenvolvimento local. HTTP simples em um IP de LAN não habilita o service worker. Consulte as instruções de TLS acima; a instalação não ignora verificações de certificado ou autenticação.

A instalação sempre inicia a raiz do servidor. Um token, link de sessão ou workspace no endereço atual nunca é incluído na URL de inicialização do app. Pode ser necessário inserir o token novamente no aplicativo instalado: ele usa o fluxo de autenticação existente do Web Shell e não adiciona armazenamento persistente de credenciais.

O servidor deve permanecer em execução e acessível. Depois que o service worker foi ativado e assumiu o controle de uma página, abrir a raiz ou um link de sessão quando a conexão falhar exibe uma página de nova tentativa. Nenhuma conversa, arquivo, resposta de API ou credencial é salva em um cache de service worker. Erros HTTP existentes ainda vêm do servidor. Esta primeira etapa não fornece trabalho offline, Web Push ou notificações enquanto o app está fechado. Workers atualizados se ativam imediatamente com `skipWaiting()` e `clients.claim()`, substituindo o worker anterior para abas abertas sem forçar um recarregamento da página. A ativação remove caches antigos do shell Qwen e preserva caches não relacionados.

Os metadados de instalação usam a identidade integrada do Qwen Code; a marca personalizada em tempo de execução ainda se aplica dentro do Web Shell. Consumidores de biblioteca embutida não registram o worker. Para remover a instalação, use o gerenciamento de apps do seu navegador ou sistema operacional; para remover seu service worker e dados do site armazenados, use as configurações do site do navegador.

## Qwen Live (experimental)

O Qwen Live roda através do Web Shell em todas as plataformas: a aba do navegador é o microfone e alto-falante (WS `/live/web`), então abra o Web Shell via `https` ou `localhost` para acesso ao microfone. O app nativo `Qwen Live Host` para macOS está desativado por padrão; para testá-lo, inicie um daemon macOS com `QWEN_SERVE_LIVE_NATIVE_HOST=1`, que restaura o WebSocket `/live/host`, a capacidade `realtime_voice` e o download do Host quando o Live está ativado. Sem isso, um `Qwen Live Host.app` já instalado permanece incapaz de conectar (o daemon não registra `/live/host`); encerre-o e use o Web Shell.

## Flags da CLI

| Flag | Padrão | Propósito |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>` | `4170` | Porta TCP. `0` = porta efêmera atribuída pelo SO. |
| `--hostname <addr>` | `127.0.0.1` | Interface de vinculação. Qualquer coisa além do loopback requer um token; quando nem `--token` nem `QWEN_SERVER_TOKEN` fornecem um, um token efêmero é gerado e impresso na inicialização. |
| `--local-control` | `false` | Compartilha o Web Shell em uma interface IPv4 privada selecionada com um token de pareamento revogável pertencente ao daemon, código QR no terminal, origem exata do navegador e inibição de suspensão best-effort. Combina com `--token`, `--allow-origin` e `--port 0`; conflita com `--no-web` e `--hostname` não padrão. Use `--local-control-address` quando múltiplas candidatas de LAN estiverem disponíveis, e adicione `--tls-cert` + `--tls-key` para APIs de navegador de contexto seguro como entrada de voz. |
| `--local-control-address <ip>` | — | Qual endereço IPv4 de LAN compartilhar quando o host tem mais de uma candidata. Necessário apenas se `--local-control` reportar uma escolha ambígua. |
| `--token-qr` | — | Imprime o QR portador do token mesmo quando stdout é capturado (não é um terminal interativo) e o portador é um token fornecido pelo operador (estável), que é retido por padrão para manter credenciais estáveis fora dos logs coletados. Também pode ser definido via configuração `serve.tokenQr`, respeitada apenas nos escopos de usuário, sistema e padrões do sistema; a flag vence quando passada. Omitir a flag **não** é o mesmo que `--no-token-qr`: a omissão deixa a política padrão (QR em um terminal interativo ou para um token gerado), enquanto `--no-token-qr` suprime o QR de token do quickstart de inicialização para aquela execução em todos os caminhos do quickstart, permitindo que uma configuração persistente seja vetada por execução. Nenhum governa o QR de pareamento do Local Control. |
| `--token <str>` | — | Token portador. Recorre à variável de ambiente `QWEN_SERVER_TOKEN` (com espaços em branco à esquerda/direita removidos — útil para `$(cat token.txt)`). Uma vinculação não-loopback sem nenhuma fonte gera um token efêmero. Um valor explicitamente vazio ainda recusa iniciar em uma vinculação não-loopback; no loopback, ele oculta a variável de ambiente e seleciona o modo confiável sem token (ou recusa totalmente sob `--require-auth`). |
| `--require-auth` | `false` | Recusa iniciar sem um token portador, mesmo no loopback. Endurece o padrão de desenvolvedor `127.0.0.1` para hosts de desenvolvimento compartilhados / executores de CI / estações de trabalho multi-inquilinos onde qualquer usuário local pode acessar o listener. Essa falha rápida é exclusiva do loopback: o loopback inicia apenas com uma de suas três fontes de token — `--token`, `QWEN_SERVER_TOKEN` ou `--open-with-auth`, que instala seu próprio token gerado antes de iniciar (geração é suprimida no loopback) — enquanto em uma vinculação não-loopback o token efêmero gerado satisfaz a flag. Protege `/health` atrás do portador também. |
| `--enable-session-shell` | `false` | Habilita a execução direta do shell da sessão. Eficaz com um token portador configurado ou modo de loopback confiável; chamadas ainda exigem um `X-Qwen-Client-Id` válido vinculado à sessão. |
| `--tls-cert <path>` | — | Caminho para um arquivo de certificado PEM. Serve via **HTTPS** em vez de HTTP. Deve ser pareado com `--tls-key` (inicialização falha se apenas um for dado). Desbloqueia APIs de navegador de contexto seguro — entrada de voz (`getUserMedia`), WebRTC — sobre um IP de LAN, que navegadores de outra forma bloqueiam em `http://` simples. Terminação TLS apenas; sem auto-geração / ACME. Veja [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) abaixo. |
| `--tls-key <path>` | — | Caminho para um arquivo de chave privada PEM. Deve ser pareado com `--tls-cert`. |
| `--max-sessions <n>` | `32` | Limite de sessões simultâneas ativas. Novas solicitações `POST /session` que criariam um novo processo filho retornam `503` (com `Retry-After: 5`) quando o limite é atingido; conexões a sessões existentes NÃO são contabilizadas. Defina como `0` para desativar. Também pode ser definido via `serve.maxSessions` (apenas nos escopos user, system e system-defaults); a flag tem prioridade quando passada. Dimensionado para uso individual ou em pequenas equipes; aumente se sua implantação tiver folga de RAM/FD (~30–50 MB por sessão). |
| `--max-total-sessions <n>` | `800` ou derivado | Limite opcional não negativo, em todo o daemon, para criação de novas sessões entre todos os runtimes de workspace registrados. Aplica-se a novas sessões filhas, restauração de sessões e sessões criadas por branch/fork; conectar-se a uma sessão ativa existente não consome um slot. Defina como `0` para ilimitado. O padrão é 800 quando a capacidade de registro é superior a 25 (incluindo o padrão de 256). Para capacidades de 25 ou menos, um workspace inicializado ou restaurado é ilimitado; vários derivam o total do limite por workspace e dessa contagem. O registro dinâmico posterior não recalcula esse valor. |
| `--max-pending-prompts-per-session <n>` | `5` | Limite por sessão de prompts aceitos pelo `POST /session/:id/prompt` mas ainda não resolvidos, incluindo prompts na fila e o prompt ativo. A ponte rejeita estouro de forma síncrona com `503`, `Retry-After: 5` e `code: "prompt_queue_full"` antes de retornar um `promptId`. Defina como `0` para desativar. `branchSession` serializa na mesma FIFO, mas não conta contra este limite de prompts. |
| `--workspace <path>` | `process.cwd()` | Diretório absoluto do workspace registrado por este daemon. Repita a flag para hospedar múltiplos workspaces em um único processo; o primeiro é o principal e permanece sendo o padrão quando uma solicitação omite `cwd`. Valores relativos são rejeitados. Solicitações de sessão cujo `cwd` canônico não está registrado retornam `400 workspace_mismatch`. |
| `--conversations-dir <path>` | — | Raiz absoluta do diretório de trabalho das Conversations para sessões standalone e Live. Substitui `QWEN_CONVERSATIONS_DIR`; quando nenhum dos dois estiver definido, usa `~/Documents/Qwen Code/Conversations`. Também aceito pelo `qwen daemon start`. Consulte [Diretório de trabalho das Conversations](#conversations-working-directory). |
| `--memory-project-scope <mode>` | `workspace` | Modo de particionamento da memória do projeto. `workspace` (padrão) indexa a memória pelo diretório exato do workspace registrado, fazendo com que cada workspace do daemon tenha sua própria memória isolada; `git-root` é o modo de compatibilidade legado compartilhado por workspaces resolvidos para a mesma raiz Git. Substitui `QWEN_CODE_MEMORY_PROJECT_SCOPE` quando fornecido; um valor de env vazio é tratado como não definido, enquanto um valor não vazio não reconhecido é ignorado com um aviso único e mantém o comportamento legado `git-root`. O novo padrão não migra a memória de projeto baseada na raiz git existente — use um escopo `git-root` explícito para ler essas entradas durante a migração. |
| `--channel <name\|all>` | — | Worker de canal gerenciado pelo daemon, experimental. Repita a flag para selecionar múltiplos canais configurados, ou passe `all` para iniciar todos os canais configurados. `all` não pode ser combinado com canais nomeados. Os valores do canal selecionado `cwd` devem resolver para um workspace registrado; um daemon multi-workspace executa um worker por workspace proprietário. O worker é propriedade de `qwen serve`; pare o daemon para parar os canais gerenciados pelo serve. |
| `--max-connections <n>` | `256` | Limite de conexões TCP no nível do listener (`server.maxConnections`). Limita a contagem bruta de sockets independentemente da contagem de sessões — clientes SSE lentos / fantasma são rejeitados no momento do accept quando cheio. Aumente junto com `--max-sessions` se sua implantação espera muitos assinantes SSE por sessão. |
| `--memory-budget-mb <n>` | 50% do cgroup/host | Orçamento total de memória em MB para toda a árvore de processos do daemon. Quando não definido, derivado como 50% do limite do cgroup ou da memória do host; de qualquer forma, o valor efetivo é limitado pela memória disponível resolvida, e tanto os números configurados quanto os efetivos são reportados. Ele aciona a partição ACP fixa selecionada por `--child-heap-mode` e o crescimento adaptativo do journal ao vivo; não é um limite total de RSS: um pool de crescimento global do daemon, derivado como 5% do orçamento efetivo (limitado a `1024` MB; em hosts que reportam `insufficientMemory` o pool é 0 e o crescimento adaptativo é desativado), é compartilhado por todas as pontes de workspace — consulte `--max-journal-bytes`. Os números resolvidos aparecem sob `limits.memory` em `GET /daemon/status`, junto com contagens de filhos registrados e ativos e participações por filho consultivas sob `runtime.memory`. Um host muito pequeno para o mínimo reporta `insufficientMemory` em vez de ser ajustado para cima; como a fração derivada é de 50%, qualquer host abaixo de ~2 GB dispara isso. Passe um `--memory-budget-mb 1024` explícito em tal host para substituir o número derivado (a flag ainda requer pelo menos 1024 MB de memória disponível para limpar o aviso). Deve ser um inteiro em `[1024, 1048576]`. |
| `--memory-pressure-mode <mode>` | `observe` | Se o daemon transforma sua própria leitura de memória em um veredito. `observe` (padrão) reporta o nível de pressão sob `runtime.memory.pressure` em `GET /daemon/status` e levanta uma issue `daemon_memory_pressure` — um `warning`, então o status geral `status` deixa `ok` — sempre que o nível sair de `normal`. `off` ainda reporta todos os números, incluindo o nível, mas não levanta nenhuma issue, então o status geral `status` permanece inalterado; use-o durante a calibração, ou se você alertar sobre o status de nível superior. O nível é o pior entre duas proporções: RSS contra memória disponível (o que o matador OOM do cgroup observa) e heap V8 usado contra o teto de heap deste processo. Cobre apenas o processo raiz do daemon; compare-o com `runtime.memory.children.rssBytes` para os filhos. Nada remedia em nenhum dos modos. Um de `off`, `observe`. |
| `--child-heap-mode <mode>` | `observe` | `off` desativa a partição; `observe` reporta `limits.memory.childHeap` sem alterar a criação de processos; `admit` aplica apenas a contagem modelada de filhos simultâneos. A opção experimental `enforce` também fornece a cada filho ACP gerenciado o teto fixo de old-space `perChildCeilingMb` e reporta `limits.memory.enforced: true`. Ambos os modos de admissão podem reclamar um ACP ocioso elegível antes de recusar com `acp_child_capacity_exhausted`; sessões ativas permanecem protegidas. O registro é independente da capacidade de filhos. Configurações de admissão com zero slots falham na inicialização. Flags herdadas fixas do heap Node são normalizadas em `enforce`; flags percentuais entram em conflito e são rejeitadas. O teto limita o old space, não o RSS ou descendentes MCP. Calibre sua carga de trabalho antes de ativar; uma contagem zero de recusas não prova segurança de heap. Mudanças de modo e orçamento exigem reinício do daemon; reinicie com `admit` para reverter a aplicação do heap. |
| `--event-ring-size <n>` | `8000` | Profundidade do anel de replay SSE por sessão (meta #3803 §02). Define o backlog disponível para `GET /session/:id/events` com `Last-Event-ID: N`. Maior = mais folga para reconexão ao custo de algumas centenas de KB extras de RAM por sessão. Clientes SDK podem adicionalmente solicitar um limite maior de backlog por assinante em uma assinatura específica via `?maxQueued=N` (intervalo `[16, 2048]`, padrão 256). Daemons também emitem um quadro SSE `slow_client_warning` não terminal a 75% de preenchimento da fila para que os clientes possam drenar / reconectar antes de serem expulsos. Pré-verificação `caps.features.slow_client_warning`. |
| `--compacted-replay-max-bytes <n>` | `4194304` | Limite de bytes por sessão ao vivo para os eventos de replay retidos no snapshot limitado retornado por `POST /session/:id/load`. O limite se aplica a `compactedReplay`; o `liveJournal` atual em andamento é limitado separadamente por `--max-journal-events` e `--max-journal-bytes` (limites base que o crescimento adaptativo pode aumentar — veja `--max-journal-bytes`). Os valores devem ser inteiros seguros positivos; valores inválidos falham na inicialização, e o teto rígido é 256 MiB. Quando o replay retido mais antigo é descartado, o snapshot começa com `history_truncated`. Isso não limita a transcrição em disco. |
| `--max-journal-events <n>` | `10000` | Limite base por sessão para entradas de replay retidas no `liveJournal` em andamento para o turno atual não concluído. Fragmentos consecutivos compatíveis de texto ou pensamento compartilham uma entrada, com no máximo 256 eventos de origem por entrada; outros limites de evento são preservados. Quando excedido, o daemon primeiro tenta o crescimento adaptativo (veja `--max-journal-bytes`); se nenhum espaço adicional for concedido ou se a concessão não cobrir o excesso, as entradas mais antigas são descartadas e um marcador `history_truncated` é adicionado à frente. As contagens `truncatedEvents` e `retainedEvents` do marcador descrevem eventos de origem. Deve ser um inteiro seguro positivo. Fixar esta flag (ou `--max-journal-bytes`) desativa o crescimento adaptativo. |
| `--max-journal-bytes <n>` | `8388608` | Limite base de bytes por sessão no `liveJournal` em andamento, contabilizado a partir dos eventos de origem serializados mesmo quando fragmentos compatíveis compartilham uma entrada de replay. Quando um turno ultrapassa o limite, o crescimento adaptativo aumenta os limites da sessão em direção ao dobro (até um limite rígido por sessão de 256 MiB, limitado pelo espaço restante do pool) enquanto o crescimento concedido em todas as sessões ativas do daemon cabe em um único pool de crescimento compartilhado dimensionado em 5% do orçamento efetivo de memória do daemon — o valor `--memory-budget-mb` quando informado, limitado pela memória disponível resolvida, caso contrário 50% da memória detectada automaticamente (veja `--memory-budget-mb`) — limitado a `1024` MB; em hosts que reportam `insufficientMemory`, o pool é 0 e o crescimento adaptativo é desativado. O crescimento ocorre sob demanda, e apenas até onde o pool permitir; quando recusado, o pool está esgotado, ou uma concessão não cobre o excesso, as entradas mais antigas são descartadas inteiras (pelo menos uma entrada é sempre mantida), então a cauda retida pode ser muito menor que o limite. Fixar esta flag (ou `--max-journal-events`) desativa o crescimento adaptativo. Deve ser um inteiro seguro positivo. Padrão: 8 MiB. |
| `--mcp-client-budget <n>` | — | Limite inteiro positivo para clientes MCP ativos. Quando `mcp_workspace_pool` é anunciado, o limite e os transportes são compartilhados por runtime de workspace; quando a tag está ausente, o gerenciador legado por sessão o impõe. Combine com `--mcp-budget-mode`. Quando não definido, não há imposição baseada em contabilização (mas `GET /workspace/mcp` ainda reporta `clientCount`). Distinto do `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code, que controla a concorrência na inicialização em vez do total de clientes ativos. Pré-verificação `caps.features.mcp_guardrails` e `caps.features.mcp_workspace_pool`. |
| `--mcp-budget-mode <m>` | `warn` / `off` | Como `--mcp-client-budget` é imposto. `warn` (padrão quando o orçamento está definido): nenhuma recusa, o `budgets[0].status` do snapshot muda para `warning` em ≥75% do orçamento. `enforce`: conexões além do limite são recusadas, a célula por servidor mostra `disabledReason: 'budget'`, determinístico pela ordem de declaração `mcpServers`. `off` (padrão quando o orçamento não está definido): pura observabilidade. A inicialização rejeita `enforce` sem um orçamento. |
| `--external-tool-guard-mode <m>` | `off` | Política externa gerenciada de pré-execução ACP. `off` não faz chamadas de provedor e não anuncia nenhuma capacidade. `required` falha na inicialização a menos que um provedor compatível complete o handshake v1, depois falha em cada invocação de ferramenta de nível superior suportada de forma fechada, a menos que sua única solicitação de preparação seja permitida. |
| `--external-tool-guard-endpoint <url>` | — | URL HTTP(S) de provedor de loopback somente de origem usada no modo `required`, por exemplo `http://127.0.0.1:8787`. Caminhos, credenciais de URL, redirecionamentos, hosts não-loopback e roteamento de proxy não são aceitos. |
| `--external-tool-guard-timeout-ms <n>` | `3000` | Inteiro `100..30000`; aplica-se independentemente ao handshake de inicialização e a cada solicitação de preparação. |
| `--http-bridge` | `true` | Modo Estágio 1: a produção tenta pré-aquecer um filho `qwen --acp` primário para compatibilidade e tenta novamente no primeiro uso após falha, enquanto cada secundário confiável pode iniciar um filho sob demanda. Sessões direcionadas a um runtime multiplexam para seu filho via ACP `newSession()`; secundários não confiáveis não podem iniciar ACP. O processo nativo in-process do Estágio 2 torna-se disponível posteriormente. |
| `--initialize-timeout-ms <n>` | `10000` | Tempo limite de solicitação do filho ACP, incluindo o handshake `initialize` (ms). Deve ser um inteiro positivo até `2147483647`. Valores acima do teto do timer JS (`2^31-1`) são rejeitados na inicialização porque o Node os comprime silenciosamente para 1 ms. Implantações em contêiner frio que precisam de margem extra para a inicialização do filho podem aumentar isso; o mesmo valor governa `newSession`, pesquisas de status do workspace e outros prazos de métodos ext ACP. |
| `--session-restore-timeout-ms <n>` | `60000` | Prazo de carregamento/retomada de sessão ACP em milissegundos. Deve ser um inteiro positivo até `2147483647`; `0` é inválido. Se omitido, o padrão é 60 segundos, aumentado para um `--initialize-timeout-ms` explicitamente fornecido quando esse valor for maior; um tempo limite de inicialização mais curto nunca reduz o orçamento de restauração. O SDK e o Web Shell adicionam 10 e 15 segundos de margem do cliente. Um tempo limite retorna `504 session_restore_timeout` repetível; isso não implica que o próprio daemon tenha saído. |
| `--allow-origin <pat>` | — | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Lista de permissões de origem cruzada para clientes de navegador. Repetível. Cada valor é `*` (qualquer origem — em links locais, a inicialização recusa quando nenhum token bearer está configurado; em links não-locais, um token efêmero gerado satisfaz essas proteções, portanto as recusas são apenas para links locais; `--require-auth` em links locais é recomendado para que `/health` também seja protegido por bearer, já que ele é pré-autenticado em links locais por padrão; os ativos estáticos do Web Shell permanecem pré-autenticados em todos os modos, então passe `--no-web` para removê-los) ou uma origem URL canônica (`<scheme>://<host>[:<port>]`, sem barra final / caminho / userinfo / consulta). Uma origem **local** canônica pode usar `:*` para a porta (`<scheme>://<loopback-host>:*`, por exemplo `http://127.0.0.1:*`) para admitir esse host em qualquer porta; ela requer um token bearer, corresponde ao host exatamente (`127.0.0.1`, `localhost` e `[::1]` são entradas distintas) e é respeitada tanto pelo correspondedor CORS REST quanto pela proteção CSRF do WebSocket. Sem um token, origens HTTP(S) devem ser locais em links locais; em links não-locais, o token gerado satisfaz a mesma proteção. Origens HTTP(S) remotas autenticam com o bearer em todas as rotas da API; as exceções pré-autenticadas são apenas as rotas de documento/ativos do Web Shell, o sandbox do App MCP, a entrada webhook do canal, que autentica com seu próprio `x-qwen-webhook-secret`, e `/health` em links locais (protegidos por bearer em outros lugares). Extensões de navegador mantêm acesso sem token localmente. Coringas de host e subdomínio (`https://*.example.com`) não são intencionalmente suportados — liste cada host explicitamente, ou use `*` com um token configurado (e `--require-auth` para endurecimento completo); o coringa de porta local acima é a única forma de coringa permitida. As origens correspondidas recebem cabeçalhos de resposta CORS (`Access-Control-Allow-Origin`, `Vary: Origin`, métodos, cabeçalhos, max-age e `Retry-After` expostos); origens não correspondidas ainda recebem 403 com o mesmo envelope da barreira atual. `Origin: null` (iframes em sandbox, documentos file://) é sempre rejeitado, mesmo sob `*`. Pré-voo via `caps.features.allow_origin`. Hits de auto-origem local não são afetados. |
| `--web` / `--no-web` | `true` | Serve a SPA Web Shell compilada na raiz do daemon (navegações de documento `GET /`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` e `GET /session/<id>`). Esses pontos de entrada são registrados **antes** da proteção de autenticação bearer — um navegador não pode anexar um token a um subrecurso `<script>` ou a uma navegação na barra de endereço, e o shell não carrega segredos. As solicitações à API seguem a política de autoridade normal do daemon: tokens configurados protegem as rotas normais da API exceto `/health` local, a menos que `--require-auth` esteja definido, a entrada webhook do canal sempre usa seu próprio segredo compartilhado, e o ouvinte principal local confiável sem token tem acesso total de operador. O fallback de link profundo da SPA para todos os outros caminhos fica atrás do middleware bearer. Em links não-locais, um aviso de uma linha no stderr observa que a UI é acessível sem autenticação. Use `--no-web` para um daemon somente API. Sem efeito quando a compilação omite os ativos do Web Shell (o daemon registra uma migalha e executa somente API). |
| `--open` | `false` | Após o ouvinte estar ativo, abre o Web Shell no navegador padrão na URL do daemon (com `#token=` anexado como fragmento de URL quando um token é resolvido — configurado ou gerado — pois um fragmento nunca é enviado ao servidor, mantendo o token fora dos logs de acesso e cabeçalhos Referer). No-op com `--no-web`, ou em ambientes headless / CI / SSH onde nenhum navegador está disponível. |
| `--open-with-auth` | `false` | Abre o Web Shell com autenticação bearer em link local. Requer um Web Shell habilitado e ativos compilados. Reutiliza um token configurado ou gera um bearer de 256 bits com duração do processo e entrega-o no fragmento do Web Shell. Ambientes inelegíveis para navegador imprimem a URL manual portadora do segredo. Outros clientes precisam do mesmo token compartilhado explicitamente configurado. |

> **Avisos sobre escopo de projeto de memória.**
>
> - **Daemon vs. CLI autônomo.** A flag ou o ambiente de inicialização do daemon define um escopo congelado único para todos os runtimes pertencentes a esse daemon. Um workspace `.env` ou `settings.env` não pode substituí-lo para um workspace registrado. Uma TUI `qwen` autônoma ainda tem como padrão o escopo da raiz git; para manter ambos os pontos de entrada consistentes, exporte `QWEN_CODE_MEMORY_PROJECT_SCOPE` no ambiente do shell ou serviço que os inicia.
> - **Colisões de nomes de diretório.** A chave de armazenamento é derivada por `sanitizeCwd`, que substitui cada caractere não alfanumérico por `-`. Diretórios irmãos que diferem apenas em pontuação (por exemplo, `feature_1` e `feature-1`) mapeiam para o mesmo diretório de memória mesmo sob escopo `workspace`. Evite tal nomenclatura ao depender do isolamento de workspaces.
> - **A normalização difere entre flag e variável de ambiente.** A variável de ambiente é aparada e convertida para minúsculas (`"  Workspace  "` funciona); a flag da CLI é comparada sensível a maiúsculas/minúsculas pelo yargs `choices` (`--memory-project-scope Workspace` é rejeitado). Use valores em minúsculas ao copiar entre os dois.

### Proteção interna de realocação Git do daemon

Cada sessão ACP de daemon gerenciado aplica uma proteção interna pré-execução para comandos de shell do modelo, independente de `--external-tool-guard-mode` e sem qualquer anúncio de capacidade. O daemon possui o workspace vinculado e o diretório de trabalho efetivo atual da sessão; ambos são fornecidos a partir do estado confiável da sessão e nunca aceitos do filho ACP.

A proteção inspeciona as ferramentas que executam uma linha de comando do shell — `run_shell_command` e `monitor` — e nega um comando Git mutável antes da execução quando a localização do repositório resolve fora do diretório de trabalho efetivo da sessão. O realocamento é reconhecido para formas literais de `git -C <path>`, `git --git-dir[=]<path>`, `git --work-tree[=]<path>`, atribuições `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` à esquerda (também quando feitas através de `export`/`declare`/`readonly`, que as mantêm no ambiente de cada comando posterior na cadeia), sinalizadores de wrapper que alteram o diretório (`env -C`, `sudo -D`) e builtins `cd`, `pushd` ou `popd` mais cedo na mesma cadeia de comandos. Prefixos comuns de wrapper (`sh -c`, `bash -c`, `eval`, `sudo`, `nohup`, `timeout`, `exec`, `command`, `builtin`, `env`, binários `git` qualificados por caminho e sintaxe de shell `{ …; }` / `! …`) são desembrulhados para que a mesma política se aplique à invocação interna do Git, e os corpos de substituição `$(…)` ou backtick são analisados como comandos próprios.

Um sub-agente fixado em seu próprio worktree é contido naquele worktree, em vez do diretório da sessão; uma chamada de shell cujo diretório de execução o daemon não consegue localizar é negada.

Alvos relativos resolvem a partir do diretório inicial efetivo do comando (`arguments.directory` quando presente, caso contrário, o atual diretório de trabalho efetivo da sessão) após a resolução canônica do caminho, incluindo redirecionamentos gitfile `.git`, symlinks e diretórios administrativos por worktree. Um alvo realocado que não pode ser totalmente resolvido antes da execução — um alvo dinâmico (`$VAR`, backticks, `~`, globs), um caminho que ainda não existe ou uma indireção ilegível — é negado para subcomandos mutáveis ou não classificáveis. Um alvo realocado que não pode ser resolvido é negado independentemente do subcomando — incluindo os somente leitura. Comandos realocados cujo subcomando é um de um pequeno conjunto verificado somente leitura (`rev-parse`, `cat-file`) permanecem permitidos uma vez que o alvo resolve, a menos que o comando carregue configuração `-c` que executa comandos, ou carregue um sinalizador `--output`, `--textconv` ou `--filters`: esses escrevem um arquivo ou executam os drivers configurados do repositório alvo. Comandos sem realocamento reconhecido mantêm seu comportamento existente. As negações são finais e são reportadas ao modelo como `Daemon shell guard denied a mutating Git command…` para uma localização de repositório resolvida, dinâmica ou irresolúvel, e como `Daemon shell guard denied a shell command…` quando o comando não pôde ser analisado, sua carga útil não pôde ser resolvida ou um programa não reconhecido pode executar um comando Git realocado.

A proteção é confiável contra realocamento do Git escrito nas formas literais acima — o comando com destino errado para o qual este controle existe — e é **best-effort, não uma fronteira**, contra texto de shell escrito para derrotá-la: construções que escondem o realocamento de um leitor estático podem passar, e novas continuarão sendo encontradas. Não conceda maior confiança a um daemon com base nisso. Ela não interpreta arquivos de script, rastreia valores de variáveis de ambiente entre comandos nem analisa corpos de heredoc (texto com forma de Git dentro de um heredoc pode ser negado mesmo que o shell nunca o execute). `/fork` e memória de workspace baseada em agente remember/dream permanecem disponíveis sob a proteção integrada; eles só são restritos enquanto o modo de provedor externo abaixo estiver ativo. Uma proteção opcional de ferramenta externa permanece uma política adicional e recebe a mesma solicitação apenas depois que a política integrada a permite.

### Tool Guard Externo Obrigatório

Esta opção é para implantações ACP gerenciadas que precisam de uma decisão externa de permitir/negar na fronteira final do executor de ferramentas. Está totalmente escura a menos que `--external-tool-guard-mode=required` esteja presente:

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

O provedor deve expor `POST /v1/handshake` e `POST /v1/prepare`, exigir `Authorization: Bearer <token>`, retornar JSON, ecoar o nonce fornecido ou ID da solicitação e usar a versão do protocolo `1`. O token deve ser não vazio, ter no máximo 8192 unidades de código UTF-16 e não conter caracteres de controle. As solicitações são limitadas a 1 MiB, respostas a 64 KiB e motivos opcionais de negação a 500 unidades de código UTF-16 sem caracteres de controle. Uma resposta de preparação bem-sucedida é:

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

Uma negação usa `allowed:false` e pode adicionar um curto `reason`. Para cada invocação de ferramenta de nível superior suportada que passa pelas permissões existentes e portões `PreToolUse` e alcança a fronteira final de execução, o Qwen Code envia uma solicitação de preparação e nunca tenta novamente. Uma negação anterior de permissão/hook não envia nenhuma solicitação de preparação. Tempo limite, cancelamento, falha de transporte, respostas malformadas ou incompatíveis e negação explícita impedem que o executor seja executado. Cada canal ACP gerado também deve reconhecer que instalou o callback obrigatório; um reconhecimento ausente ou incompatível rejeita o canal antes da criação da Sessão. A solicitação do provedor carrega `sessionId`, `promptId`, `toolCallId`, `toolName` canônico e `arguments` final; `toolCallId` é um rótulo de correlação, não uma identidade de autenticação ou chave de idempotência autônoma.

Os argumentos finais podem conter dados sensíveis da aplicação. Trate-os como tal nos logs do provedor e no armazenamento de auditoria.

Hooks `PreToolUse` são executados antes desta decisão final do executor. O modo Required Guard não autoriza nem isola o comportamento do hook; implantações que precisam de uma fronteira ao redor de todos os possíveis efeitos colaterais devem desabilitar hooks ou governar suas implementações separadamente.

As ações de comandos com barra também são executadas antes do agendamento de modelo/ferramenta e não são invocações do Guard. Algumas funções integradas podem alterar diretamente arquivos ou configurações. Uma implantação gerenciada que precisa de uma fronteira para todos os efeitos deve rejeitar a entrada de comandos com barra ou desabilitar todos os comandos não aprovados por meio de `slashCommands.disabled` ou `--disabled-slash-commands`.

O escopo gerenciado v1 abrange ferramentas de nível superior invocadas por um Prompt gerenciado ativo em primeiro plano. `agent`, `workflow`, `create_sub_session`, `send_message` aninhados ou delegados, `/fork` diretos e controles de memória de workspace (lembrar/sonhar) baseados em agentes são rejeitados enquanto o modo obrigatório está ativo. O início de um shell ou monitor em segundo plano de nível superior ainda é uma invocação protegida e seus argumentos finais chegam ao provedor, mas este recurso não autoriza continuamente o processo nem adiciona um protocolo de auditoria de conclusão do processo; uma política que exige conclusão em primeiro plano deve negar esses formatos. Chamadas MCP protegidas também desabilitam a reconexão/repetição automática após um erro de transporte. Após um handshake inicial bem-sucedido, `/capabilities` anuncia `external_tool_guard`; sua ausência significa que os clientes não devem assumir a aplicação da política.

Este recurso não autoriza chamadas explícitas de gerenciamento REST/ACP do daemon; essas continuam usando a autenticação existente e os contratos de rota do daemon. Também não torna determinística uma ferramenta ou comando de shell permitido, nem isola seus internos; implantações gerenciadas devem combinar a decisão do provedor com sua política normal de ferramentas e fronteira de isolamento.

> **Dimensionando os parâmetros de carga.** `--max-sessions` é o limite de novas sessões por workspace. `--max-total-sessions` é o limite de novas sessões em todo o daemon; quando omitido, assume o padrão 800 na capacidade de registro padrão de 256. Outras três camadas também limitam a carga — ao dimensionar para uma implantação de alta concorrência, ajuste-as conjuntamente:
>
> - **nível do listener**: `--max-connections` / `server.maxConnections=256` limita conexões TCP brutas (back-pressure de clientes lentos).
> - **assinantes por sessão**: o EventBus limita assinantes SSE a 64 por sessão por padrão; o 65º cliente recebe um `stream_error` terminal e é fechado.
> - **admissões de prompt por sessão**: `--max-pending-prompts-per-session=5` limita prompts aceitos (na fila + ativos) para uma única sessão. Estouro recebe `503` com `Retry-After: 5`.
> - **novas sessões em todo o daemon**: `--max-total-sessions=N` limita a criação de novas sessões em todo o daemon. Estouro recebe o mesmo formato `session_limit_exceeded` com `scope: "total"`.
> - **fila de espera por assinante**: uma fila de 256 quadros por cliente SSE; um cliente acima da capacidade recebe um quadro `client_evicted` terminal e é fechado (um consumidor lento não pode travar o daemon).
>
> Esses limites interagem: cada runtime é limitado por `--max-sessions`, enquanto `--max-total-sessions` limita seu agregado. O teto efetivo de sessões é o menor entre qualquer limite finito em todo o daemon e o limite agregado por runtime (trate esse agregado como ilimitado se o limite por workspace for ilimitado). Se nenhum for finito — o que na capacidade de registro padrão requer `--max-total-sessions 0` — não há teto finito de sessões. Um teto finito × 64 assinantes × 256 quadros é a memória máxima em trânsito na camada do EventBus; multiplicá-lo por `--max-pending-prompts-per-session` limita o trabalho de prompts aceitos na camada de admissão. O dimensionamento padrão assume carga de usuário único/equipe pequena; aumente progressivamente (e monitore RSS) para implantações maiores.

> **Guardrails do cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Um workspace declarando 30 servidores MCP em `mcpServers` iniciará 30 clientes sem limite upstream, a menos que você defina um. `--mcp-client-budget=N` limita a contagem de clientes MCP ativos; `--mcp-budget-mode={enforce,warn,off}` escolhe o comportamento. O padrão é `warn` quando um orçamento está definido (o snapshot exibe o aviso, mas nenhum cliente é recusado — útil para medir o fanout real antes de ativar a aplicação). Servidores recusados sob modo `enforce` recebem `disabledReason: 'budget'` em sua célula por servidor, e a célula `budgets[0]` mostra `status: 'error'` + `errorKind: 'budget_exhausted'`. A reserva de slots é feita pelo nome do servidor e sobrevive a reconexões / timeouts de descoberta — um servidor recusado não pode tomar um slot de um saudável.
>
> **O escopo atual é orientado por capacidades.** Quando `mcp_workspace_pool` está presente, todas as sessões em um runtime de workspace compartilham seu pool de transporte MCP e controlador de orçamento; `GET /workspace/mcp` emite `scope: 'workspace'`. Um segundo workspace tem um pool e orçamento independentes. Quando a tag está ausente (incluindo `QWEN_SERVE_NO_MCP_POOL=1`), o daemon usa o `McpClientManager` legado por sessão e emite `scope: 'session'`; nesse fallback, N sessões podem consumir cada uma o limite configurado.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Isso **não** é o mesmo que o `MCP_SERVER_CONNECTION_BATCH_SIZE` do claude-code (que limita a concorrência de inicialização); eles são ortogonais. Os clientes devem ramificar com base em `mcp_workspace_pool`, não assumir um escopo apenas pela versão do protocolo.
>
> **Eventos push (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** Clientes SDK assinados em `GET /session/:id/events` recebem frames tipificados quando os limiares de orçamento são cruzados — `mcp_budget_warning` (sintético, dispara uma vez por cruzamento ascendente de 75% com rearm de histerese em 37,5%, anunciado via `mcp_guardrail_events`) e `mcp_child_refused_batch` (coalescido uma vez por passagem de descoberta sob modo `enforce`; comprimento-1 da recusa de spawn lazy `readResource`). O snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após reconexão; os eventos são bordas de mudança. Útil ao fazer dashboards em tempo real sem polling.

## Modelo de ameaças da implantação padrão [#default-deployment-threat-model]

- **Apenas loopback** — `127.0.0.0/8`, `localhost` ou `::1`; sem auth necessária.
- **`localhost` é resolvido uma vez, fixado e verificado após a escuta** — se seu endereço de escuta real estiver fora de `127.0.0.0/8` ou `::1`, a inicialização sem token fecha o listener e falha.
- **`--hostname 0.0.0.0` requer um token** — um é gerado quando nenhuma fonte de token é fornecida; fontes explicitamente vazias ainda falham fechado.
- **`LOOPBACK_BINDS` inclui IPv6** — `::1` e `[::1]` contam como loopback para a regra de sem-token.
- **Allowlist do cabeçalho Host** — em binds de **loopback**, o daemon verifica se `Host:` corresponde a `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` ou ao endereço e porta de loopback exatamente vinculados (case-insensitive conforme RFC 7230 §5.4) para se defender contra DNS rebinding. Ao escutar na porta 80 ou 443, as formas correspondentes sem porta também são aceitas porque os navegadores omitem as portas padrão de esquema. Isso suporta a faixa completa de loopback IPv4 (`127.0.0.0/8`) sem admitir Hosts não relacionados. **Binds fora de loopback (`--hostname 0.0.0.0`) ignoram intencionalmente a allowlist de Host** — o operador escolheu a superfície de ataque, então o portão do bearer-token é a única camada de autenticação para rotas normais de API; reverse proxies / SNI / client cert pinning são responsabilidade do operador, não do daemon. Se você precisar de isolamento baseado em Host em um bind fora de loopback, termine o TLS + verifique o Host em um proxy frontal.
- **CORS nega qualquer Origin de navegador por padrão** — retorna JSON `403`. Passe **`--allow-origin <pattern>`** (repetível, T2.4 #4514) para permitir origens específicas de navegador. Cada valor é ou o literal `*` (qualquer origem — em um bind **loopback**, a inicialização recusa se nenhum token bearer estiver configurado, enquanto um bind não-loopback inicia porque a geração de token fornece um; `--require-auth` em loopback é recomendado para endurecimento completo, já que `/health` permanece pré-autenticado em loopback por padrão — note que os assets estáticos do Web Shell (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` e navegações de documento `/settings`) são montados antes do bearer em todos os modos e permanecem pré-autenticados mesmo sob `--require-auth`, então use `--no-web` quando a superfície residual do navegador importar) ou uma origem URL canônica (`<scheme>://<host>[:<port>]`, sem barra final / caminho / userinfo). Um host loopback pode em vez disso usar um curinga de porta (`<scheme>://<loopback-host>:*`); ele requer um token bearer configurado (a inicialização recusa sem um), corresponde exatamente ao esquema e host (`127.0.0.1`, `localhost` e `[::1]` são entradas distintas), e é a única forma de curinga além do `*` exclusivo para REST. Em um bind **loopback** sem token, entradas HTTP(S) devem usar um host loopback; um bind não-loopback sempre carrega um token — fornecido ou gerado — precisamente porque origens de navegador hospedadas remotamente podem executar código através da API do operador como o usuário do daemon. Origens explícitas de extensões de navegador mantêm seu caminho de automação local sem token. Origens correspondentes recebem cabeçalhos de resposta CORS adequados (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, além de métodos / headers / max-age padrão e `Retry-After` expostos); origens não correspondentes ainda recebem um 403 com o mesmo envelope da parede padrão. `caps.features.allow_origin` é anunciado condicionalmente para que clientes SDK / webui possam prever se o daemon honra hits cross-origin antes de emiti-los. Exemplo: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Hits de auto-origem loopback (por exemplo, a UI do Web Shell) não são afetados — um shim separado de remoção de Origin lida com eles independentemente de `--allow-origin`. As requisições **HTTP** same-origin do Web Shell remoto integrado também funcionam sem `--allow-origin`: em um listener primário não-loopback, um `Origin` igual ao esquema do socket direto mais a autoridade `Host` normalizada é autenticado por bearer e então removido antes da parede CORS, enquanto suas rotas públicas estáticas existentes permanecem desautenticadas. Duas exclusões ainda precisam de `--allow-origin` — headers encaminhados nunca estabelecem confiança same-origin, então a origem do navegador `https` de um proxy reverso terminador TLS não é same-origin (nem é um intermediário HTTP simples que reescreve o header `Host`, como o `proxy_set_header Host $proxy_host` padrão do nginx ou Ingress k8s; o remédio lá é `--allow-origin <origin>` para a origem que seu navegador vê, ou um proxy que encaminha `Host` verbatim — a tradução de porta sozinha não precisa de nada, porque apenas o `Host` encaminhado é comparado, com apenas o `:80`/`:443` padrão do esquema removidos), e as rotas de upgrade WebSocket (terminal, voz) mantêm um gate CSWSH separado que admite apenas origens loopback mesma-porta, origens explicitamente permitidas (incluindo curingas de porta loopback) e a própria origem do listener Local Control; o literal `*` não se aplica lá.
- **Automação de navegador via Chrome extension é separada do framing.** `qwen serve --allow-origin chrome-extension://<id>` permite que a extensão faça framing do Web Shell e conecte ao daemon. Ferramentas de console/rede/screenshot/clique requerem um comando adaptador CDP MCP externo: `QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`. O pacote principal da CLI não inclui um adaptador de automação de navegador; clientes podem verificar `caps.features.includes('browser_automation_mcp')` antes de apresentar essas ferramentas como disponíveis.
- **O processo filho `qwen --acp` gerado recebe o ambiente efetivo do seu runtime proprietário.** O daemon congela uma base de process-env, aplica o overlay de settings/env-file daquele workspace a um snapshot local de runtime, e nunca escreve o overlay de volta em `process.env`; chaves com o mesmo nome em outro runtime não fazem crossover. `QWEN_SERVER_TOKEN` é limpo antes do spawn porque o agente não precisa do bearer do daemon. Variáveis que afetam o loader (`NODE_OPTIONS`, `npm_config_node_options` e os redirects de arquivo de config do npm, `NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`, definições de função exportadas do bash `BASH_FUNC_*`) também nunca são passadas para subprocessos de sessão — o daemon as limpa de seu próprio `process.env` e da base de ambiente congelada com a qual os filhos que hospedam sessões são gerados (a base as mantém apenas sob o harness `DEV=true`, cujas entradas `.ts` ainda precisam do loader tsx), e as fontes `.env` / `settings.json` `env` as rejeitam (veja [configurações](./configuration/settings.md)); isso se aplica a toda sessão que o daemon hospeda. Credenciais base como `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*` e `DASHSCOPE_API_KEY` são repassadas, a menos que o overlay do runtime as altere. **Isso é intencional, não é uma sandbox.** O agente é executado com o mesmo UID e tem acesso a ferramentas de shell, então qualquer coisa em `~/.bashrc`, `~/.aws/credentials` ou `~/.npmrc` é acessível por injeção de prompt de qualquer maneira. O isolamento de ambiente entre runtimes não é um limite de segurança do sistema operacional; não execute `qwen serve` sob uma identidade que possua credenciais com as quais você não confiaria no agente.
- **Leituras de texto do agente são locais ao filho e seguem as regras de permissão normais da CLI, não o limite do workspace filesystem.** `read_file` direto pode alcançar caminhos de texto do host fora de todo workspace registrado: caminhos externos usam confirmação por padrão, e regras de permissão ou modos de aprovação podem aprová-los automaticamente. Leituras aprovadas usam os limites configuráveis de saída da CLI em vez dos limites de saída retornada, snapshot completo e scan de texto grande do workspace filesystem. Isso se aplica a todo consumidor compartilhado de leitura de texto, então as pré-leituras realizadas por operações de write, edit, notebook, sed e artifact perdem esses limites junto com a auditoria de leitura, rejeição de symlink e proteções TOCTOU do lado da leitura do workspace filesystem — veja [o documento de design](../design/daemon-local-text-reads.md) para a lista exata. Como um payload de confirmação é construído lendo o arquivo, um diff fora do workspace é distribuído para **todo** assinante SSE anexado antes que alguém o aprove — na CLI interativa, esse conteúdo é visto apenas pela pessoa no terminal. Trate clientes autenticados do daemon como o mesmo principal de segurança. Rotas HTTP de filesystem permanecem com escopo de workspace e o comportamento da ferramenta de descoberta do agente não é alterado.
- **Escritas finais aprovadas de ferramentas de texto integradas têm uma rota estreita no mesmo host.** `write_file`, `edit`, `notebook_edit` e o editor sed simulado da ferramenta shell anexam proveniência interna apenas depois que a política de permissão existente permite a execução. Sua escrita final de texto ACP pode, portanto, ter como alvo um caminho absoluto fora do workspace proprietário sem uma segunda confirmação; regras de permissão, AUTO/AUTO_EDIT e YOLO se comportam como na CLI, enquanto rejeição, Plan, recusa de Hook/Guard e cancelamento pré-execução não enviam a escrita final. O cancelamento após uma ferramenta já ter entrado em uma operação de filesystem não cancelável mantém o comportamento existente dessa ferramenta. Targets do workspace ainda usam WFS. Targets externos usam um writer de host do daemon com o mesmo snapshot de confiança, limite de 5 MiB codificado, rejeição de symlink folha, lock de caminho canônico, rename atômico, preservação de modo, modo de arquivo novo `0600` por padrão (configurável — veja [Modo de arquivo novo para escritas de texto do agente](#new-file-mode-for-agent-text-writes)), guarda de geração e auditoria de filesystem. Escritas HTTP, escritas ACP genéricas ou não marcadas, integrações injetadas de bridge/registro de workspace/factory e redirecionamentos shell arbitrários não recebem esta exceção. Veja [o design de escrita externa](../design/daemon-external-tool-text-writes.md).
- **Filas SSE limitadas por assinante** — um cliente lento que transborda sua fila recebe um frame terminal `client_evicted` e é fechado; um consumidor travado não pode travar o daemon.
- **Limite de admissão de prompt por sessão** — o padrão é 5 prompts aceitos mas não resolvidos por sessão. Um cliente com bug não pode enfileirar promises de prompt ilimitadas ou esperas temporárias de SSE para uma sessão.
- **Desligamento gracioso** — SIGINT/SIGTERM drena os processos filhos do agente antes de fechar o listener (prazo de 10s por filho).

> ⚠️ **As votações de permissão agora são escopadas por sessão — além de uma ressalva permanente sobre o portador compartilhado.** Prefira `POST /session/:id/permission/:requestId` (Wave 4 / F3): ele roteia para o runtime que possui a sessão ativa nomeada e nunca recorre ao bridge primário — novas integrações multi-workspace devem sempre usar esta rota (pré-verificação `caps.features.session_permission_vote`). O legado global do processo `POST /permission/:requestId` permanece para clientes single-workspace pré-F3: ele está vinculado ao primário e `404` para uma sessão pertencente a outro runtime registrado — o mesmo corpo de uma votação perdida sob a política padrão `first-responder` — portanto, um `404` lá não significa por si só que a solicitação já foi respondida. Tabela de rotas: [referência da API REST do daemon](../developers/daemon-rest-api-reference.md#permissions). Ressalva permanente: todo cliente que detém o token de portador é o mesmo principal de segurança — não execute `qwen serve` atrás de um portador compartilhado com partes não confiáveis.
>
> ⚠️ **Lacuna conhecida do Stage 1 — corpo do `POST /session/:id/prompt` limitado a 10 MB (BUy4L).** Prompts multimodais contendo imagens / PDFs / áudio que excedam 10 MB falharão no momento do parse do corpo antes que a lógica da rota seja executada (sem streaming, sem abort no meio do upload). Solução alternativa: reduza o conteúdo no lado do cliente, ou passe uma referência de caminho e deixe o agente ler o arquivo via `readTextFile`. O Stage 1.5 aceitará `multipart/form-data` ou codificação em chunks em `/prompt` para que prompts grandes não atinjam um limite rígido.
>
> ⚠️ **Lacuna conhecida da Fase 1 — conexões SSE fantasma atrás de NAT.** O daemon detecta clientes mortos via back-pressure TCP nos heartbeats (intervalo de 15s). Um cliente que desaparece SEM um RST TCP (por exemplo, uma caixa NAT descartando silenciosamente fluxos ociosos) mantém o socket no nível do kernel "vivo" até que as sondas keepalive do Node expirem — tipicamente ~2 horas nos padrões do Linux. Em implantações `--hostname 0.0.0.0` atrás desses NATs, conexões SSE fantasmas podem se acumular e eventualmente atingir o teto de 256 `server.maxConnections`.
>
> Defina [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout) (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9) para fechar a lacuna com um prazo ocioso explícito no nível da aplicação: quando nenhuma escrita tiver sido efetuada com sucesso por `n` ms, o daemon emite um quadro `client_evicted` terminal com `reason: 'writer_idle_timeout'` e fecha o stream. A flag está desligada por padrão para preservar o contrato legado — operadores em redes que engolem RSTs devem escolher um valor bem acima do intervalo de heartbeat de 15s (por exemplo, `60000`–`300000`) para que conexões ociosas legítimas não sejam expulsas enquanto escritores realmente travados são coletados prontamente. Faça um pre-flight `caps.features.includes('writer_idle_timeout')` do seu SDK para confirmar que o daemon suporta isso.

### Prazos e timeout de ociosidade do writer [#deadlines-and-writer-idle-timeout]

A issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 traz duas flags opt-in que fecham as lacunas de execução longa / deployment remoto que o heartbeat de 15s + AbortSignal não cobrem. O timeout compartilhado de resposta de permissão está listado aqui também. Todos os três estão desativados por padrão.

| Flag                           | Env var                             | Padrão | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | não definido   | Limite de relógio no lado do servidor para um único `POST /session/:id/prompt`. Na expiração, o daemon aborta o AbortController do prompt e retorna HTTP `504` com `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`. Um campo `deadlineMs` no corpo da requisição por prompt pode ENCURTAR o prazo efetivo abaixo da flag, mas nunca estendê-lo. Tag de capacidade (condicional): `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | não definido   | Prazo de ociosidade por conexão SSE. Quando nenhuma escrita for LIBERADA COM SUCESSO por `n` ms — nem um evento real nem o heartbeat de 15s — o daemon emite um frame terminal `client_evicted` com `data.reason = 'writer_idle_timeout'` (espelhado em `data.errorKind`) e fecha o stream. **Escolha um valor confortavelmente acima do heartbeat de 15s** (ex: `30000`–`300000`) para que streams ociosos legítimos não sejam expulsos; valores `< 15000` EXPULSARÃO conexões ociosas saudáveis antes do primeiro heartbeat disparar (intencional apenas para testes / sessões de desenvolvimento de curta duração). Tag de capacidade (condicional): `writer_idle_timeout`. |
| `--permission-response-timeout-ms <n>` | —                                   | `0`     | Relógio compartilhado para respostas de permissão ordinárias e `ask_user_question` no modo daemon. `0` ou uma flag omitida aguarda indefinidamente; um inteiro positivo impõe um prazo para ambos. Cancelamento de votante, cancelamento de sessão e desligamento do daemon ainda resolvem interações pendentes quando o timer está desativado.                                                                                                                                                                                                                                                                                                            |

As flags de prompt e writer aceitam um inteiro positivo em milissegundos; `0`, `NaN`, valores não inteiros ou negativos são rejeitados na inicialização com uma mensagem de erro clara. O timeout de resposta de permissão aceita `0` ou um inteiro positivo. Para os dois deadlines com suporte de env var, campos `ServeOptions` explícitos vencem os valores de env. Consumidores de SDK devem fazer pre-flight da tag de capacidade correspondente antes de confiar nos comportamentos de prompt e writer.

### Modo de arquivo novo para escritas de texto do agente [#new-file-mode-for-agent-text-writes]

As escritas de texto do agente (`write_file`, `edit`, `notebook_edit` e o editor sed simulado da ferramenta shell) são publicadas através do writer atômico do daemon, que preserva o modo de um target existente e — para arquivos **novos** — usa como padrão o `0600` apenas para o proprietário, ignorando o umask do processo do daemon. Esse padrão fail-closed é intencional: um arquivo recém-criado pelo agente nunca é legível por grupo/outros acidentalmente, não importa quão permissivo seja o umask do supervisor.

Operadores cuja convenção de deployment é baseada em umask (ex: uma unit do systemd com `UMask=0002`, repositórios com grupo compartilhado) podem optar por novos arquivos no tratamento POSIX padrão com:

| Env var                    | Valores             | Padrão  | O que faz                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE` | `owner` \| `system` | `owner` | `system` cria arquivos NOVOS em `0o666 & ~umask`, então arquivos criados pelo agente seguem o umask do processo do daemon como qualquer outro processo na máquina. `owner` mantém o padrão `0600` independente de umask. Os valores são case-insensitive; o literal `0600` é aceito como um alias para `owner` (nenhum outro modo octal é suportado), e qualquer outro valor é rejeitado com um aviso no stderr e o padrão `0600` é mantido. |

Escopo e limites:

- Aplica-se a arquivos NOVOS criados pelas rotas de escrita de texto (targets de workspace, o host writer externo no mesmo host e escritas de texto HTTP). Arquivos existentes sempre mantêm seu modo em disco — editar um segredo `0600` o mantém `0600`, um executável mantém `+x`.
- Uploads binários (`POST /file/upload`) sempre criam com `0600` independentemente desta configuração.
- O daemon lê a variável na construção do workspace-filesystem; reinicie o daemon após alterá-la.

### Diretório de trabalho das Conversations [#conversations-working-directory]

Defina a raiz do diretório de trabalho para sessões standalone e Live independentemente do home do sistema operacional:

```bash
qwen serve --conversations-dir /persistent/qwen-conversations

# Or configure the launch environment:
QWEN_CONVERSATIONS_DIR=/persistent/qwen-conversations qwen serve

# The same option is available for a detached daemon:
qwen daemon start --conversations-dir /persistent/qwen-conversations
```

O sinalizador explícito tem precedência sobre `QWEN_CONVERSATIONS_DIR`, que pode vir do ambiente de inicialização ou de um arquivo `.env` em nível de usuário. Lançadores incorporados podem selecionar a mesma raiz com `ServeOptions.conversationsDir`, que também tem precedência sobre o ambiente. Quando nenhum estiver configurado, a raiz permanece `~/Documents/Qwen Code/Conversations`. Montar um volume persistente nesse caminho padrão ou alterar o home do processo também são escolhas válidas de implantação.

Um valor explícito deve ser um caminho absoluto totalmente qualificado, não vazio e sem caracteres NUL. Caminhos relativos, um `~` não expandido e caminhos Windows que dependem da unidade atual são rejeitados. Os valores não são aparados, e configurações inválidas falham na inicialização em vez de recorrer a padrões. Um sinalizador explícito válido ou opção de API substitui um valor de ambiente inválido. A sintaxe do caminho é verificada antes da escuta; a criação de diretórios e as verificações do sistema de arquivos permanecem preguiçosas, então uma raiz de Conversations não utilizada não é criada na inicialização. Uma falha no sistema de arquivos no primeiro uso não seleciona outra raiz.

A seleção é fixa pela vida útil do daemon. Arquivos de projeto `.env` e `.qwen/.env`, `settings.json` `env` de nível superior em todos os escopos, recargas de ambiente e solicitações de navegador/sessão não podem redirecioná-la. Não há configuração de projeto correspondente nem opção de raiz por sessão.

Standalone e Live continuam compartilhando o runtime de Conversations existente. Cada sessão usa seu filho direto `conversation-<sha256(normalized session ID)>` privado determinístico como seu diretório de trabalho de ferramentas e shell. As verificações existentes de propriedade, permissões POSIX privadas, identidade canônica, filho direto, link/reparse, locação de escritor e recuperação ainda se aplicam, incluindo seus limites específicos de plataforma. O Windows não ganha garantias de proprietário/modo POSIX ou ACL, e sistemas de arquivos sem identidade de inode verificável ainda não conseguem detectar toda substituição de mesmo caminho. A árvore de Conversations selecionada permanece reservada do registro comum de workspace; outros workspaces mantêm suas regras existentes.

A raiz de trabalho e o armazenamento de runtime têm responsabilidades separadas:

| Dados | Localização |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Arquivos de trabalho da sessão | Filhos privados da sessão sob a raiz de Conversations selecionada. |
| Configuração da raiz compartilhada | Configuração criada pelo usuário sob a raiz selecionada, compartilhada entre suas sessões. |
| Transcrições e sidecars | Armazenamento base de runtime do daemon existente, chaveado pelo cwd canônico do runtime de Conversations. |
| Diários de recuperação de exclusão | O namespace estável `<home>/.qwen/conversations/deletions`. |
| Descoberta Live | O localizador estável `<home>/.qwen/live/daemon.json` e, quando aplicável, sua cópia base de runtime do daemon. |
| Descoberta local do daemon | `daemon/daemon-<port>.json` sob a base de runtime do daemon; registra o caminho de Conversations selecionado para reinicialização. |

`QWEN_HOME` seleciona o diretório de configuração global do Qwen. `QWEN_RUNTIME_DIR` e `advanced.runtimeOutputDir` selecionam o armazenamento de saída de runtime através de suas regras de precedência existentes. Nenhum seleciona a raiz do diretório de trabalho de Conversations. Persistir apenas o armazenamento de runtime não persiste arquivos criados nos diretórios privados da sessão; configurar apenas a raiz de trabalho também não preserva o armazenamento de runtime nem o estado de recuperação e descoberta baseado em home.

Para uma reinicialização usando a mesma raiz, retenha o mesmo caminho canônico, base de runtime e estado de controle necessário. `qwen daemon restart` preserva a raiz de um registro de descoberta atual, e o relançamento automático de atualização também preserva a raiz selecionada. A aceitação normal da identidade do sistema de arquivos, permissões, locações de escritor e verificações de recuperação ainda são executadas; isso não é uma garantia de recuperação após cada reinicialização de contêiner ou host. Veja [Bloqueios de escrita e recuperação de Conversations](./conversations-recovery.md).

Para alterar raiz intencionalmente, conclua a recuperação de exclusão pendente contra a raiz original, pare todos os escritores que a usam, depois pare e inicie o daemon com a nova configuração. Uma raiz canônica diferente seleciona um namespace diferente de armazenamento/descoberta de histórico e configuração de raiz compartilhada. Nenhum arquivo de trabalho, registro de sessão, configuração, diários de recuperação ou estado de descoberta é migrado automaticamente, e o histórico antigo não é garantido permanecer visível. Não remova evidências de recuperação para forçar a aceitação: se a recuperação contra a raiz original não puder ser concluída, alterar esta opção não é um procedimento de reparo.

### Armazenamento de anexos de sessão [#session-attachment-storage]

Os anexos de sessão (arquivos e imagens enviados pelo Web Shell através de `POST /session/:id/attachments`) são armazenados por padrão no diretório temp de runtime do workspace: `<runtimeBaseDir>/tmp/<projectHash>/attachments`, chaveados por sessão como `session-<sessionId>`. Operadores que desejam que os anexos persistam fora do diretório temp de runtime (ex: em um volume dedicado) podem sobrescrever a raiz:

| Env var                               | Valores | Padrão | O que faz                                                                                                                                                                                               |
| ------------------------------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_SESSION_ATTACHMENTS_ROOT` | path    | não definido  | Armazena anexos de sessão neste diretório em vez do diretório temp de runtime padrão. Aceita um caminho absoluto, um caminho relativo ao cwd do daemon, ou `~` / `~/…` expandido em relação ao diretório home. |

Escopo e limites:

- **Migração unidirecional.** Quando a env está definida, novos anexos são escritos apenas na raiz configurada. Leituras e remoções que não encontram a raiz configurada fazem fallback para o diretório temp de runtime padrão, então anexos enviados **antes** da mudança permanecem legíveis e removíveis enquanto o diretório de fallback padrão permanecer gravável — uma remoção cuja cópia legada não pode ser desvinculada (ex: um volume de fallback somente leitura) surface o erro em vez de reportar sucesso. A direção inversa — remover a env após anexos terem sido escritos na raiz configurada — torna esses anexos inalcançáveis; mantenha a variável estável para um determinado workspace.
- **Layout por sessão.** Os arquivos ficam em `<root>/<projectHash>/attachments/session-<sessionId>/` em ambos os locais, onde `<projectHash>` é o mesmo hash de workspace usado pelo diretório temp de runtime padrão; a busca de fallback usa o mesmo layout de sessão no diretório padrão. Dois workspaces apontando para a mesma raiz configurada permanecem isolados um do outro.
- **Limpeza de exclusão.** Quando uma sessão é excluída, seu diretório de anexos é removido tanto da raiz configurada quanto do diretório de fallback padrão. Arquivar uma sessão mantém seus anexos para que sobrevivam ao desarquivamento.
- O daemon lê a variável na inicialização; reinicie o daemon após alterá-la. O diretório deve ser gravável pelo processo do daemon.

## Deploy multi-sessão e multi-workspace [#multi-session--multi-workspace-deployment]

Passe `--workspace` mais de uma vez para registrar vários workspaces não sobrepostos em um processo `qwen serve`. O primeiro caminho é o primário. Cada workspace registrado possui um limite de runtime isolado, enquanto o listener em todo o daemon, a política de autenticação e o limite de sessões totais são compartilhados. A produção tenta pré-aquecer o filho ACP primário para compatibilidade e tenta novamente no primeiro uso após falha; secundários confiáveis iniciam seu próprio filho sob demanda, e secundários não confiáveis não iniciam ACP. Requisições podem selecionar um workspace registrado por `cwd` canônico; requisições que omitem `cwd` usam o workspace primário. Use um daemon por usuário ou principal de segurança; a confiança de workspace é um gate de execução, não um ACL.

Um workspace secundário não confiável é visível no Web Shell como `untrusted` e `read-only`. Ele pode ser expandido para inspecionar o catálogo de sessões persistidas, mas ainda não pode ser selecionado ou aberto no Web Shell, retomado, usado para criar sessões ou exportado completamente. A API REST segue a política existente de leitura de sistema de arquivos limitada e também expõe seu catálogo de grupos de sessão persistidos e, quando `workspace_persisted_transcript` é anunciado, sua transcrição persistida ativa através do pager qualificado por workspace limitado. Leituras forward e de cursor não iniciam um filho ACP; uma primeira página backward para uma sessão ao vivo pode iniciar um para liberar a cauda persistida. A exportação qualificada por workspace completa requer um workspace confiável e a capability separada `workspace_session_export`. Confie no workspace e reinicie o daemon antes de usar recursos de execução, mutação ou exportação. Um primário não confiável permanece desabilitado no Web Shell.

Use processos de daemon separados quando precisar de um limite menor de falha ou segurança, bearer tokens independentes, cotas, limites de auditoria, isolamento do sistema operacional ou supervisão independente de recursos. O modo multi-workspace é destinado a um operador hospedando vários repos; não é um limite de isolamento multi-tenant. Um único token de daemon autoriza toda rota protegida por bearer que o daemon expõe, incluindo o catálogo read-only permitido para todos os workspaces registrados.

> **Assine ANTES de postar `modelServiceId` no attach.** Quando um cliente `POST /session` com um `modelServiceId` e o workspace já tem uma sessão rodando um modelo diferente, o daemon emite uma chamada interna `setSessionModel` — falhas NÃO são propagadas como erro HTTP (a sessão permanece operacional em seu modelo atual). O sinal de falha visível é um evento `model_switch_failed` no stream SSE da sessão. Se você chamar `POST /session` e só DEPOIS abrir `GET /session/:id/events`, perderá o evento de falha e continuará silenciosamente falando com o modelo errado. Abra o stream SSE primeiro, ou passe `Last-Event-ID: 0` na assinatura para fazer replay do evento mais antigo disponível do ring.

Para lidar com múltiplos **usuários ou principais de segurança** (cada um com token independente, cota, log de auditoria, sandbox ou limite de falha de processo) ou para escalar além do alcance de um processo (budget de cold-start, contagem de FD, RSS), gere um daemon por principal atrás de um orquestrador externo. Cada tal daemon ainda pode hospedar vários workspaces para aquele principal. O orquestrador (multi-tenancy / OIDC / Quota / Audit / k8s) está **fora do escopo** do projeto qwen-code — consulte a issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" para os ponteiros de design.

## Carregando e retomando uma sessão persistida [#loading-and-resuming-a-persisted-session]

O daemon expõe o fluxo `session/load` e de retomada do ACP sobre HTTP, mais um pager de transcrição read-only separado:

| Rota                                                  | Quando usar                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`                              | O cliente **não** tem histórico local útil renderizado (reconexão a frio, picker-then-open). Para uma sessão ao vivo, o daemon retorna e injeta a janela atual de snapshot de replay limitado; se replay mais antigo foi descartado, o snapshot começa com `history_truncated`. Tag de capacidade: `session_load`. |
| `POST /session/:id/resume`                            | O cliente já tem os turnos na tela e só precisa do handle do lado do daemon de volta. O contexto do modelo é restaurado no lado do agente sem repetição de UI — o stream SSE permanece limpo. Tag de capacidade: `session_resume` (`unstable_session_resume` permanece como um alias depreciado para clientes mais antigos). |
| `GET /session/:id/transcript`                         | O cliente precisa da transcrição persistida ativa completa. Retorna frames de replay sem id em páginas de cursor e não chama `/load`, não anexa um cliente, não semeia o EventBus ao vivo, não cria uma sessão ao vivo nem altera a janela de replay ao vivo. Tag de capacidade: `session_transcript`.                    |
| `GET /workspaces/:workspace/session/:id/transcript`   | O cliente precisa de uma transcrição persistida ativa de um workspace selecionado. Páginas forward e de cursor permanecem locais ao daemon; uma primeira página backward para uma sessão ao vivo pode iniciar o ACP e carregar configurações do workspace para liberar a cauda persistida. Workspaces secundários não confiáveis registrados podem usar este caminho read-only. Tag de capacidade: `workspace_persisted_transcript`. |
| `GET /workspaces/:workspace/session/:id/export`       | O cliente precisa de um anexo completo `html`, `md`, `json` ou `jsonl` de um workspace confiável selecionado. Lê o armazenamento persistido ativo sem iniciar ACP ou fazer fallback para o primário. Tag de capacidade: `workspace_session_export`.                                                         |
| `GET /workspaces/:workspace/session/:id/archive/export` | O cliente precisa dos mesmos formatos de anexo do armazenamento persistido arquivado em um workspace confiável selecionado. Não desarquiva, não inicia ACP nem faz fallback para uma sessão ativa ou primária. Tag de capacidade: `workspace_archived_session_export`.                                                |

Para carga e retomada, o SDK TypeScript expõe fábricas estáticas em `DaemonSessionClient`:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay the bounded snapshot window through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

Execute a pre-flight `caps.features.session_load`, `caps.features.session_resume` ou `caps.features.session_transcript` antes de chamar a rota correspondente — daemons mais antigos retornam `404`. `unstable_session_resume` ainda é anunciado como um alias de compatibilidade obsoleto. Solicitações concorrentes da mesma ação para o mesmo id são coalescidas; corridas entre ações (um `load` competindo com um `resume`) e spawns com id fornecido pelo chamador competindo com uma restauração recebem `409 restore_in_progress` com `Retry-After: 5`. Uma restauração que excede `limits.sessionRestoreTimeoutMs` recebe `504 session_restore_timeout` repetível com um `Retry-After` derivado do orçamento (limitado a 5-120s); a solicitação filha em execução permanece isolada até que a limpeza se resolva, e tentativas de nova execução com o mesmo id durante essa janela recebem `409 restore_in_progress` com `reason: awaiting_abandoned_cleanup` e um `Retry-After` derivado do orçamento limitado a 5-120 segundos em vez de um atraso fixo de 5 segundos. Se a limpeza for incerta, ou se a restauração abandonada ainda não tiver se resolvido após um orçamento completo de restauração depois do prazo, o trabalho de nova sessão recebe temporariamente `503 acp_channel_unavailable` com `reason: restore_cleanup_failed` ou `restore_settlement_overdue`. Uma inicialização de sessão que expira o tempo limite mas não se resolve rapidamente pode similarmente retornar `reason: new_session_cleanup_failed` quando a limpeza tardia é inconclusiva ou `new_session_settlement_overdue` quando a solicitação filha permanece pendente por outro orçamento de inicialização. Sessões já ativas permanecem utilizáveis para todas as quatro razões. Veja a [referência do protocolo](../developers/qwen-serve-protocol.md) para o envelope de erro completo.

Para replay persistido completo, pagine com `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` ou a rota REST bruta:

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

Para um workspace registrado, use `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` ou `/workspaces/:workspace/session/:id/transcript`. O método qualificado por workspace sempre usa REST nativo mesmo quando o cliente SDK tem um transporte ACP substituível. Seus cursores são apenas do tempo de vida do daemon e devem ser reiniciados da página um após um restart do daemon. Uma primeira página backward para uma sessão ao vivo pode iniciar o ACP e carregar configurações do workspace para liberar a cauda persistida antes de lê-la.

Para um anexo completo de um workspace registrado confiável, faça pre-flight de `workspace_session_export` e chame `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` ou a rota bruta `/workspaces/:workspace/session/:id/export`. Não infira suporte de `session_export` ou `workspace_qualified_rest_core`: daemons mais antigos podem anunciar ambos enquanto mantêm exportação apenas do primário. A ação de exportação atual do Web Shell permanece apenas do primário; use o SDK ou a rota REST para outro workspace.

Para um anexo arquivado, faça pre-flight de `workspace_archived_session_export` e chame `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` ou `/workspaces/:workspace/session/:id/archive/export`. Este caminho lê o armazenamento arquivado no lugar e retorna `409 session_not_archived` para um id apenas ativo; não desarquiva a sessão. O Web Shell expõe a mesma exportação para linhas arquivadas em workspaces primários e secundários confiáveis quando a capability está presente.

`limit` conta registros de chat ativos, não frames de replay emitidos; um registro pode produzir vários eventos `session_update`. Uma página backward pode expandir para no máximo `3 * limit` registros para preservar as fronteiras de turno e chamada de ferramenta/resultado. A primeira resposta congela o tamanho do snapshot JSONL e retorna `nextCursor` enquanto `hasMore` é true. Páginas posteriores ignoram acréscimos após a página 1, mas retornam `409` se o arquivo for deletado, truncado, substituído, arquivado ou de outra forma conflitar com o cursor congelado. Snapshots muito grandes retornam `413 transcript_too_large` antes da indexação para que o daemon não escaneie arquivos de transcrição ilimitados no caminho da requisição.

Para paginação repetida pela rota singular legada, defina `--channel-idle-timeout-ms` como um valor positivo. Com o padrão `0`, o filho ACP de um workspace ocioso — e o cache de índice de transcrição em processo que ele mantém — é eliminado após cada página, então cada página recria o filho e reconstrói o índice reescaneando todo o prefixo congelado (`O(snapshotSize)` por página). Um timeout positivo mantém o filho vivo durante a caminhada do cursor para que ele reutilize seu índice de transcrição em cache e configuração de replay, a menos que `--child-heap-mode admit` ou `enforce` o recuperem para satisfazer um spawn com restrição de capacidade em outro workspace. Nesse caso, a próxima página recria o filho e reconstrói o índice. Páginas diretas qualificadas por workspace e páginas de cursor permanecem locais ao daemon; apenas uma primeira página reversa para uma sessão ativa cruza a barreira de flush.

Nota: a repetição de histórico da sessão ao vivo é limitada duas vezes: pelo ring SSE para reconexões `Last-Event-ID` e por `--compacted-replay-max-bytes` para o snapshot retornado por `POST /session/:id/load`. Históricos longos com turnos verbosos podem exceder qualquer limite. O daemon expõe truncamento de snapshot com `history_truncated`; use `/transcript` quando precisar do histórico persistido ativo completo.

## Modelo de durabilidade [#durability-model]

**Sessões ativas são interrompidas por reinicializações do daemon, mas sessões persistidas permanecem no disco e podem ser recarregadas:**

- Um crash de processo filho publica `session_died` e remove a sessão ativa dos mapas do daemon. A sessão persistida em disco **pode** ser recarregada via `POST /session/:id/load` se um novo processo filho do agente puder ser gerado.
- Uma reinicialização do daemon perde todas as sessões ativas em andamento. As sessões persistidas permanecem em disco e podem ser carregadas em um novo processo daemon, sujeitas às mesmas regras de vinculação de workspace.
- Desconexões longas do cliente (>5 min em um turno verboso) podem ultrapassar o ring de repetição SSE (padrão de 8000 frames) — a reconexão `Last-Event-ID` dispara `state_resync_required`. Para clientes móveis / de rede instável, planeje reabrir o SSE em quedas longas ou chame `POST /session/:id/load` para recuperar o snapshot de replay limitado atual; não assuma que aquela rota retorna a transcrição completa.
- Operações de arquivo (`writeTextFile`) são atômicas entre crashes (write-then-rename); elas não são atômicas entre reinicializações do daemon no sentido de repetição — a escrita do arquivo ocorreu ou não.

Se sua integração precisar de durabilidade cross-restart no lado do servidor além do que `session/load` cobre (ex: filas de retry gerenciadas pelo servidor), você ainda precisará de recuperação de estado em nível de aplicação. Não mantenha estado de execução longa e sensível a reinicializações dentro da sessão do daemon.

## Garantias de runtime do Stage 1.5+

O contrato do Stage 1 é dimensionado para prototipação. Conforme a [revisão de consumidor downstream #3889 chiga0](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644), o seguinte **não** está no Stage 1 — integrações de nível de produção precisam do Stage 1.5+ antes de depender deles:

**Bloqueadores para uso sério a jusante:**

1. **`loadSession` / `unstable_resumeSession` via HTTP** — sem isso, nenhuma integração sobrevive a um crash do processo filho ou reinício do daemon, e qualquer orquestrador coordenando o daemon também não consegue recuperar o estado.
2. **Identidade persistente do cliente (pair tokens + revogação por cliente)** — o Stage 1 usa um único bearer compartilhado; um token vazado revoga todos, e `originatorClientId` é autodeclarado pelo cliente em vez de ser carimbado pelo daemon a partir da identidade autenticada.

**Linha de base de confiabilidade:**

3. ~~**Caminho de heartbeat iniciado pelo cliente**~~ — entregue via PR [#4175](https://github.com/QwenLM/qwen-code/issues/4175) 9. `POST /session/:id/heartbeat` registra timestamps de última visualização no daemon (tag de capacidade `client_heartbeat`); os helpers do SDK são `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Evento `permission_already_resolved`** quando um voto perde a corrida de first-responder — atualmente, as UIs precisam inferir o estado a partir de um `404`.
5. ~~**Ring de replay maior**~~ — aumentado para 8000. **Ring configurável por sessão** ainda em aberto — workloads de mobile / turnos com muitas mensagens podem precisar de overrides por sessão.
6. **Evento `slow_client_warning` antes de `client_evicted`** — backpressure suave para que clientes lentos e bem-comportados possam se auto-limitar (reduzir profundidade de renderização, descartar chunks) antes de serem encerrados.

**Ergonomia de integração:**

7. **`POST /session/:id/_meta` para contexto no estilo IM** — key-value por sessão anexado aos prompts subsequentes (chat id, sender, thread id) substitui a improvisação por canal.
8. **Negociação real de recursos em `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` para que os clientes possam detectar drift em vez de cair no "unknown frame, ignore".
9. **Documentação de durabilidade de primeira classe** (esta seção) — já entregue acima.

O roadmap completo de convergência é acompanhado na issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).

## Limites do escopo do Stage 1 — o que não corrigiremos no Stage 1.5 [#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15]

Duas escolhas estruturais são objetivos explícitos fora do escopo (non-goals) para o roadmap principal do Stage 1 / 1.5 / 2. Se o seu caso de uso depende de qualquer uma delas, planeje contorná-las em vez de esperar por nós.

### O estado da sessão é apenas de mutação local (conforme [revisão LaZzyMan #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

O plano do Stage 1.5 descreve a TUI como um assinante de EventBus in-process. Na prática, **a UI da TUI é estritamente maior que o protocolo de rede (wire protocol)**:

- **UI apenas local** — os ~15 componentes de diálogo do Ink (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) e os slash commands `local-jsx` (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) renderizam JSX específico do terminal. Clientes remotos via HTTP/SSE não podem renderizar Ink de forma equivalente, e esses fluxos não emitem nenhum evento de rede.
- **Mutações de estado de sessão sem eventos de rede** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (escrevendo em `CLAUDE.md`) todos alteram o comportamento do agente, mas apenas `/model` atualmente publica um evento (`model_switched`).

**Escolha do Stage 1 — opção (A) da revisão**: não promover essas mutações para eventos de rede. Os dois modos de implantação têm consequências diferentes.

#### Modo 1 — `qwen serve` headless (este PR)

Nenhum shell TUI é executado dentro do daemon. Os slash commands listados acima **não existem** neste modo — não há UI de terminal para executá-los. O estado da sessão é, portanto:

- **Congelado no boot** para `approval-mode` / `memory` / `agents` / allowlist de `tools` / `auth` — todos carregados das configurações + disco quando o processo filho `qwen --acp` do daemon inicia; imutável durante o tempo de vida da sessão. Servidores MCP definidos nas configurações também são congelados no boot, mas **servidores adicionados em runtime** (via `POST /workspace/mcp/servers`) podem ser adicionados ou removidos sem reiniciar.
- **Mutável via HTTP** através de `POST /session/:id/model` (publica `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publica `mcp_server_added` / `mcp_server_removed`) e votos de permissão (`POST /session/:id/permission/:requestId`; o `POST /permission/:requestId` global ao processo legado permanece para clientes de workspace único pré-F3).

**Consequência:** clientes remotos no modo headless veem o **estado completo da sessão**. Nenhuma TUI oculta estado adicional; nenhum drift é possível. Se você quiser alterar o `approval-mode`, reinicie o daemon com as novas configurações. Servidores MCP agora podem ser adicionados/removidos em runtime através das rotas de mutação (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — veja [Gerenciamento de servidor MCP em runtime](#runtime-mcp-server-management-issue-4514).

#### Modo 2 — TUI co-hospedada `qwen --serve` do Stage 1.5 (não está neste PR)

Quando o Stage 1.5 trouxer o `qwen --serve` (o processo TUI co-hospeda o mesmo servidor HTTP), a TUI **existirá** junto com os clientes remotos. Um operador local digitando `/approval-mode yolo` ou `/mcp add-server` muta o estado da sessão, e os clientes remotos via HTTP não têm nenhum evento para observar a mudança.

Neste modo, a TUI é um **"super-cliente"** — ela observa a mesma conversa do agente que os clientes remotos veem, E pode mutar o estado da sessão que os clientes remotos não conseguem. A assimetria é:

- ✅ Tanto a TUI quanto os clientes remotos veem as mesmas mensagens do agente, chamadas de ferramentas, diffs de arquivos e prompts de permissão.
- ❌ Apenas a TUI vê / muta approval-mode / memory / lista de servidores MCP / agents / allowlist de tools / estado de auth.

**Consequência no Modo 2:** se uma UI de cliente remoto tentar espelhar as configurações da sessão, ela pode sofrer drift após qualquer slash command da TUI. Clientes remotos devem **recarregar o estado ao anexar / reconectar** (use `Last-Event-ID: 0` para fazer replay do evento mais antigo do ring para coisas como `model_switched`); eles NÃO devem depender de eventos incrementais para mutações do lado da TUI.

#### Por que (A) e não (B) (promover mutações para a família de eventos `session_state_changed`)

(B) é a resposta mais ambiciosa, mas trava o Stage 1.5 em uma superfície de rede substancialmente maior que também deve passar limpa pela refatoração in-process planejada. Preferimos caminhar com o escopo menor de forma honesta. O trabalho de taxonomia de eventos de estado de sessão — enumerar quais fluxos da TUI são apenas locais por design vs. quais poderiam plausivelmente ser promovidos para a rede sob uma futura extensão opcional no estilo (B) — vai para a issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803), não para o código do Stage 1.5.

### N sessões paralelas compartilham um processo filho `qwen --acp` por runtime de workspace

Múltiplas sessões no mesmo workspace confiável **compartilham o processo filho `qwen --acp` desse runtime** via suporte multi-sessão nativo do agente (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). A ponte chama `connection.newSession({cwd, mcpServers})` para cada sessão — o agente os armazena em seu mapa de sessões e desmultiplexa por sessionId de chamada. A produção pode possuir até um filho primário (pré-aquecimento tentado por padrão) mais um filho sob demanda por secundário confiável; secundários não confiáveis não possuem nenhum.

Custo concreto com N=5 sessões no mesmo workspace:

| Recurso                              | Por sessão                                                  | Com N=5                                                          |
| ------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Processo Node do Daemon              | um                                                          | **30–50 MB** (um daemon)                                        |
| Processo filho `qwen --acp`          | compartilhado                                               | **60–100 MB** (um filho)                                        |
| Processos filhos de servidor MCP     | pool de workspace quando anunciado; caso contrário por sessão | compartilhados por entradas de pool correspondentes, ou até 3×N no fallback legado |
| `FileReadCache` (heap do processo filho) | compartilhado                                            | parseado uma vez                                                 |
| Parse de memória `CLAUDE.md` / hierarquia | compartilhado                                           | parseado uma vez                                                 |
| Estado de refresh-token OAuth        | compartilhado                                               | **um caminho de refresh**                                       |
| Fatos aprendidos de Auto-memory      | compartilhado                                               | uma base de conhecimento por processo filho                      |
| Cold start                           | apenas o primeiro                                           | <200 ms após a primeira sessão                                  |

Cada runtime de workspace ativo mantém **um limite de bridge**. A produção tenta pré-aquecer o canal primário e tenta novamente no primeiro uso após falha; um secundário confiável abre seu canal e filho sob demanda, enquanto um secundário não confiável nunca o faz. Um canal permanece ativo enquanto pelo menos uma sessão estiver ao vivo. Após o último `killSession`, o runtime mata seu filho imediatamente por padrão ou após a graça de idle do canal configurada; um crash no nível do canal também o derruba sem selecionar outro runtime.

**Filhos de servidor MCP** usam o pool de transporte escopado ao workspace quando `mcp_workspace_pool` é anunciado: entradas `(workspace runtime, server name, config fingerprint)` correspondentes têm contagem de referências compartilhada entre sessões. Se a capacidade estiver ausente, o gerenciador legado por sessão os cria independentemente.

**Agentes pares (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) todos fazem multi-sessão em processo único.** qwen-code corresponde a eles na camada do agente; a ponte da Fase 1 neste PR torna a mesma arquitetura visível sobre HTTP.

## Login em um daemon remoto (issue #4175 PR 21)

Quando o daemon roda em um pod remoto (sem display compartilhado com você), um cliente pode acionar um fluxo de dispositivo OAuth via HTTP. O daemon consulta o IdP por conta própria; seu trabalho é apenas abrir uma URL em qualquer dispositivo que tenha um navegador.

> [!note]
>
> A camada gratuita do Qwen OAuth foi descontinuada em 2026-04-15. Os exemplos `qwen-oauth` abaixo documentam o formato do protocolo de fluxo de dispositivo e o identificador de provedor legado; novas configurações devem usar um provedor de autenticação atualmente suportado.

```bash
# 1. Start a flow. The daemon contacts the IdP, returns a code + URL.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. Visit the URL on your phone / laptop, enter the user code.
# 3. Poll for completion (or subscribe to SSE for the auth_device_flow_authorized event):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
```

O SDK TypeScript encapsula ambas as etapas em um único helper:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**O daemon nunca abre um navegador em seu nome.** Mesmo quando executado localmente, o daemon permanece passivo — ele retorna a URL e deixa o SDK / usuário escolher onde abri-la. Isso é intencional: um daemon em um pod headless que chamasse `xdg-open` falharia silenciosamente, mascarando a superfície de auth real. Espelhe a UX de "Pressione Enter para abrir o navegador" do `gh auth login` no seu cliente.

**`--require-auth` e conveniência de desenvolvimento.** As rotas de fluxo de dispositivo usam o gate de mutação estrito. O padrão de loopback confiável sem token pode iniciar e gerenciar um fluxo diretamente; um embed não confiável sem credenciais retorna `401 token_required`. Defina um `QWEN_SERVER_TOKEN` gerenciado e passe `--require-auth` em hosts compartilhados, runners de CI, máquinas de desenvolvimento remoto ou em qualquer lugar onde os processos locais não sejam mutuamente confiáveis.

**Limitação entre daemons.** `oauth_creds.json` é compartilhado pelo daemon (`~/.qwen/oauth_creds.json`), então um login bem-sucedido no daemon A é automaticamente utilizado pelo próximo refresh de token do daemon B — mas os clientes SDK do daemon B não receberão o evento `auth_device_flow_authorized` (os eventos são por daemon).

**Take-over entre clientes.** Dois clientes SDK no mesmo daemon que ambos fazem `POST /workspace/auth/device-flow` para o mesmo provedor obtêm o singleton por provedor: a primeira chamada inicia uma nova requisição ao IdP e retorna `attached: false`; a segunda chamada retorna a entrada existente em andamento com `attached: true`. O take-over é registrado no audit trail (sob o `X-Qwen-Client-Id` do segundo cliente), mas NÃO emite um evento separado — ambos os clientes eventualmente observam o MESMO `auth_device_flow_authorized` assim que o usuário termina a página do IdP. Se a sua UI distingue "eu iniciei isso" de "fluxo de outra pessoa que eu entrei", faça o branch no campo `attached` retornado por `start()`.

## Arquivo de log do Daemon

`qwen serve` anexa registros de diagnóstico através de reinícios normais no caminho ativo estável:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

Cada registro de arquivo inclui um `runId` aleatório por inicialização e o PID do daemon. Um proprietário estável bem-sucedido também atualiza `debug/daemon/latest` para `daemon.log` em plataformas que suportam symlinks. No macOS/Linux, siga a rotação com:

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

Em outras plataformas, configure o visualizador para reabrir o caminho após ele ser substituído. Um visualizador que mantém apenas o antigo identificador de arquivo permanecerá no arquivo após a rotação.

O log captura mensagens de ciclo de vida, erros de rota (com contexto `route=` e `sessionId=`), stderr do processo filho ACP e — quando `QWEN_SERVE_DEBUG=1` está definido — breadcrumbs extras da bridge. Linhas que vão para o stderr hoje ainda vão para o stderr; o log em arquivo é **aditivo**, não um substituto.

A criação standalone falha adiciona `Standalone session creation failed.` com o alvo validado `sessionId`, `phase` falho, `reason` seguro, `dispatchState` e `cleanupOutcome`. A criação de filho retém o ID do filho e registra o pai validado separadamente como `relatedSessionId`. Correlacione linhas `source_persistence_failed` por ID de sessão para confirmação de fonte privada ou detalhes de transporte; `write_not_confirmed` não identifica uma causa de sistema de arquivos. Uma quarentena concluída é distinta do rollback, e `unknown` não estabelece sucesso na limpeza. Códigos de erro públicos e comportamento de retry permanecem inalterados. Esses diagnósticos omitem causas brutas, prompts e payloads de fonte.

O arquivo ativo gira antes de exceder 10 MiB. Cada família retém quatro arquivos arquivados sob `archive/`, e cada registro de arquivo é limitado a 256 KiB. A fila em memória aceita no máximo 4 MiB de carga útil de arquivo não resolvida. Pressão na fila, falhas de rotação ou falhas no sistema de arquivos podem, portanto, descartar cópias de arquivos; `GET /daemon/status?detail=full` expõe a saúde do logger, problemas e contadores de registros/bytes descartados.

Apenas um daemon pode possuir a família estável em um namespace de log. Um daemon concorrente escreve em `debug/daemon/runs/run-<runId>/daemon.log`; o banner de inicialização e o status completo contêm o caminho autoritativo. `runs/recent-fallback` é um localizador de melhor esforço para uma família de fallback recente e pode apontar para uma que ainda esteja ativa. Um namespace saudável converge para aproximadamente 100 MiB: cerca de 50 MiB para a família estável mais uma família de fallback inativa. As famílias de fallback ativas ou não obsoletas são retidas, portanto, daemons concorrentes ou tempestades de crash/restart podem usar temporariamente mais espaço.

Um diretório de runtime é um namespace de propriedade e retenção. Use valores distintos de `QWEN_RUNTIME_DIR` quando os daemons precisarem de histórico independente. Novos diretórios de log do daemon são privados para o usuário (`0700`) e novos arquivos usam `0600` em POSIX. Não há expiração baseada em idade.

### Desativando

Defina `QWEN_DAEMON_LOG_FILE=0` (ou `false`/`off`/`no`) para pular o log em arquivo completamente. A saída do stderr não é afetada.

### Relação com logs de debug de sessão

Logs de debug com escopo de sessão (`~/.qwen/debug/<sessionId>.txt` e o symlink `~/.qwen/debug/latest`) são independentes. O log do daemon fica em um subdiretório irmão `daemon/`; a semântica de debug por sessão não é alterada por este recurso.

### Rotação externa

Não aponte uma regra externa do logrotate para o `daemon.log` ativo. O daemon é o único escritor e rotacionador suportado; renomeação, exclusão ou truncamento externos invalidam seu modelo de tamanho. Copiar ou enviar registros sem modificar a família é seguro. Arquivos `serve-<pid>.log` e `serve-<pid>-<workspaceHash>.log` mais antigos são deixados intocados e não são contabilizados pela nova política de retenção.

## Gerenciamento de servidor MCP em runtime (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)) [#runtime-mcp-server-management-issue-4514]

Adicione ou remova servidores MCP em runtime sem reiniciar o daemon. As entradas em runtime vivem em um overlay efêmero que **sobrescreve (shadows)** servidores definidos nas configurações com o mesmo nome; a config subjacente `settings.json` / `mcpServers` nunca é alterada.

**Pré-voo:** verifique `caps.features` para `mcp_server_runtime_mutation` antes de chamar qualquer uma das rotas. Daemons mais antigos sem esta tag retornam `404`.

### `POST /workspace/mcp/servers` — adicionar um servidor MCP em runtime

Com gate estrito (loopback primário confiável ou credenciais de operador obrigatórias). Conecta o servidor imediatamente através do `McpClientManager` ativo e descobre suas ferramentas.

Requisição:

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` deve ser alfanumérico mais `_` e `-` (máximo de 256 caracteres). `config` é o mesmo objeto de configuração do servidor MCP usado nas entradas `settings.json` `mcpServers` (campos dependentes de transporte: `command`/`args` para stdio, `url` para SSE/HTTP). Campos sensíveis à segurança (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) são removidos pelo daemon e ignorados.

Resposta (200) — sucesso:

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — uma entrada em runtime com o mesmo nome já existia e o fingerprint da config difere; conexão antiga derrubada, nova estabelecida. Quando o fingerprint corresponde (re-adicionar idempotente), `replaced` é `false`.
- `shadowedSettings: true` — um servidor definido nas configurações com o mesmo nome existe; a entrada em runtime agora o sobrescreve. A entrada das configurações não é alterada e reaparece se a entrada em runtime for removida posteriormente.
- `toolCount` — número de ferramentas descobertas no servidor recém-conectado.

Resposta (200) — recusa suave (modo de aviso de orçamento):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Retornada quando `--mcp-budget-mode=warn` e adicionar o servidor excederia o `--mcp-client-budget` configurado. O servidor NÃO é conectado. Os chamadores devem expor a pressão do orçamento ao usuário.

Erros:

| Status | Código                    | Quando                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]`                      |
| `400`  | `missing_required_field`  | `config` ausente ou não é um objeto não nulo                                                          |
| `400`  | `invalid_client_id`       | Header `X-Qwen-Client-Id` presente, mas não registrado para este workspace                            |
| `400`  | `invalid_config`          | Formato da config rejeitado pelo validador de transporte MCP                                               |
| `401`  | `token_required`          | Requisição não confiável sem token negada pelo gate estrito                                           |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` e o orçamento está cheio                                                     |
| `502`  | `mcp_server_spawn_failed` | Processo do servidor saiu ou atingiu timeout durante a conexão; o body carrega `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable` | Nenhum processo filho ACP ativo (nenhuma sessão foi criada ainda)                                                |

### `DELETE /workspace/mcp/servers/:name` — remover um servidor MCP em runtime

Com gate estrito. Desconecta o servidor e o remove do overlay em runtime. Idempotente — remover um nome que nunca foi adicionado retorna uma resposta de skip (não um erro).

O parâmetro de path `:name` é o nome do servidor codificado para URL.

Resposta (200) — sucesso:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — a entrada em runtime removida estava sobrescrevendo um servidor definido nas configurações com o mesmo nome. Essa entrada das configurações agora não está mais sobrescrita e será usada na próxima descoberta/reinício.

Resposta (200) — skip idempotente:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Retornada quando o nome não estava no overlay em runtime (ele ainda pode existir nas configurações — entradas de configurações não podem ser removidas via esta rota).

Erros:

| Status | Código                    | Quando                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Nome vazio, excede 256 caracteres ou contém caracteres fora de `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`       | Header `X-Qwen-Client-Id` presente, mas não registrado para este workspace       |
| `401`  | `token_required`          | Requisição não confiável sem token negada pelo gate estrito                      |
| `503`  | `acp_channel_unavailable` | Nenhum processo filho ACP ativo                                                             |

### Semântica de shadow (sobrescrita)

As entradas em runtime formam um overlay efêmero sobre os servidores MCP definidos nas configurações:

- **Adicionar** um servidor em runtime com o mesmo nome de uma entrada das configurações o **sobrescreve (shadows)** — a config em runtime tem precedência. A entrada original das configurações não é modificada.
- **Remover** um servidor em runtime que estava sobrescrevendo uma entrada das configurações **remove a sobrescrita (un-shadows)** — a config definida nas configurações torna-se ativa novamente na próxima conexão.
- **Reiniciar o daemon** perde todas as entradas em runtime. Apenas os servidores definidos nas configurações sobrevivem aos reinícios. Servidores em runtime têm escopo de tempo de vida da sessão.
- **`GET /workspace/mcp`** reporta a visão mesclada — tanto servidores definidos nas configurações quanto em runtime aparecem no array `servers[]`. Não há distinção no nível da rede entre as duas origens no snapshot hoje.

### Eventos

Ambas as rotas emitem eventos SSE com **escopo de workspace** (todos os buses de sessão ativos os recebem):

| Evento               | Emitido quando                | Campos do payload                                                                         |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` tem sucesso (não skip)   | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` tem sucesso (não skip) | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

Respostas ignoradas (`budget_warning_only`, `not_present`) NÃO emitem eventos.

Eventos relacionados ao orçamento da superfície existente `mcp_guardrail_events` (`mcp_budget_warning`, `mcp_child_refused_batch`) também são disparados quando adições em tempo de execução excedem o limite do orçamento.

## Próximos passos

- **Configurando um daemon de longa duração?** Use os [templates de inicialização local (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) para supervisão do gerenciador de serviços e inicialização após reinicialização.
- **Criar um cliente?** Veja o [guia de início rápido do DaemonClient em TypeScript](../developers/examples/daemon-client-quickstart.md) e a [referência do protocolo HTTP](../developers/qwen-serve-protocol.md).
- **Lendo o código-fonte?** O código da bridge fica em `packages/cli/src/serve/`; o cliente do SDK em `packages/sdk-typescript/src/daemon/`.
- **Acompanhando o roadmap?** O progresso do Stage 1.5 / Stage 2 é acompanhado na issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803).
