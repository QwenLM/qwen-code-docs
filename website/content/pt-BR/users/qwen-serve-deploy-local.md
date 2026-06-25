# Modelos de inicialização local para `qwen serve` (v0.16-alpha)

Modelos de referência para executar `qwen serve` como um processo de segundo plano de longa duração em uma estação de trabalho de desenvolvedor. Complementa as [limitações conhecidas da v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) — apenas local, usuário único, BYO bearer token. Implantações conteinerizadas / multi-host / com TLS são adiadas para v0.16.x.

> **Público-alvo**: desenvolvedores em dogfooding que desejam o daemon ativo após reinicializações, com logs indo para um local durável e uma estratégia limpa de `restart-on-failure`. Se você precisa apenas do daemon durante uma única sessão de shell, o simples `qwen serve` (primeiro plano, Ctrl-C para parar) é suficiente.

## Gerar um bearer token (uma vez)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # gerenciado pelo usuário, NÃO é um caminho embutido
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

O caminho / nome do arquivo é sua escolha; a v0.16-alpha não gera automaticamente nem localiza um arquivo de token (adiado para v0.16.x). Consulte a seção [Autenticação](./qwen-serve.md#authentication) do guia do usuário para a configuração BYO canônica.

> **Mantenha este `export` escopo apenas na sessão atual do shell.** Não o adicione ao `~/.bashrc` / `~/.zshrc` — uma exportação em nível de perfil expõe o bearer token a todo processo iniciado a partir desse shell (subprocessos da IDE, depuradores do navegador, scripts `npm` de projetos não relacionados). Para configurações de longa duração, use os mecanismos `EnvironmentFile=` do systemd / `EnvironmentVariables` do launchd abaixo — ambos limitam o token apenas ao processo do daemon.

O daemon lê o bearer token de `--token <valor>` na linha de comando ou da variável de ambiente `QWEN_SERVER_TOKEN` (espaços em branco são removidos de ambos). O construtor `DaemonClient` do SDK TypeScript recorre a `QWEN_SERVER_TOKEN` quando nenhuma opção `token` é passada (fallback do PR 27 — clientes com a variável de ambiente definida nunca precisam passar o valor em seus scripts).

Uma única `export` no nível do shell cobre tanto a inicialização do servidor quanto a construção do cliente SDK (apenas mantenha-a com escopo na sessão, conforme a observação acima).

## Linux: unit systemd de usuário

> **Encontre seu binário `qwen` primeiro.** O `ExecStart=` do arquivo unit deve conter um **caminho absoluto** — os gerenciadores de serviço não leem o `PATH` do seu shell. Execute `which qwen` para descobri-lo. Locais comuns: `/usr/local/bin/qwen` (Linuxbrew, instalações manuais), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Substitua pelo caminho real em todos os lugares onde os modelos abaixo mostram `/PATH/TO/qwen`.

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Daemon do Qwen Code (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Substitua pelo seu projeto; %h expande para $HOME em units de usuário.
WorkingDirectory=%h/seu-projeto
# Execute `which qwen` para encontrar o caminho absoluto. systemd NÃO lê $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Leia o bearer token de um arquivo chmod 600 em vez de colocá-lo inline
# na unit. `Environment=` exporia o token no arquivo da unit
# (tipicamente 644 = legível por todos). EnvironmentFile mantém o token no
# arquivo secreto de propriedade do usuário que você já criou com `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Crie o arquivo env uma vez (o arquivo de token da etapa de configuração contém o valor bruto; este o envolve na forma `KEY=value` para que o systemd o leia como uma atribuição de ambiente):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Gerenciamento:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # manter o gerenciador de usuário em execução após logout / reinicialização
journalctl --user -u qwen-serve -f               # exibir logs em tempo real
systemctl --user restart qwen-serve.service     # após rotação de token
systemctl --user disable --now qwen-serve.service
```

Sem `loginctl enable-linger`, a instância systemd em nível de usuário é desligada quando o usuário sai e só reinicia no próximo login — em uma máquina de desenvolvimento sem cabeça, o daemon não sobreviveria ao término de uma sessão SSH. `enable-linger` é o que faz com que "funcione entre reinicializações" de fato.

**Alternativa para todo o sistema** (máquinas de desenvolvimento compartilhadas, menos comum): coloque a unit em `/etc/systemd/system/qwen-serve@.service` com `User=%i`, gerencie via `sudo systemctl enable --now qwen-serve@<username>.service`. O corpo `[Service]` é o mesmo — mas a exposição de `Environment=` legível por todos é ainda mais problemática nesse nível, portanto sempre use `EnvironmentFile=` apontando para o arquivo `chmod 600` do usuário. Escolha nível de usuário + linger para estações de trabalho de um único usuário.

## macOS: agente launchd de usuário

> **Encontre seu binário `qwen` primeiro.** Mesma restrição do systemd — `ProgramArguments` deve conter um **caminho absoluto**. Execute `which qwen` para descobri-lo. Locais comuns no macOS: `/opt/homebrew/bin/qwen` (Homebrew no Apple Silicon), `/usr/local/bin/qwen` (Homebrew no Intel, instalações manuais), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Substitua abaixo onde o modelo mostra `/PATH/TO/qwen`.
`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- Run `which qwen` to find the absolute path; launchd does NOT read $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd does NOT expand `~` or `$HOME` — use absolute paths. -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- DO NOT COMMIT this file with a real token. Also chmod 600 the
         plist itself so the inlined token is not world-readable. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Restart only on non-zero exits (matches systemd Restart=on-failure).
       A bare `<true/>` would respawn even after a clean SIGTERM, making
       `kill <pid>` impossible to use as a stop signal — operator would
       have to `launchctl unload`. SuccessfulExit=false fixes that. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Throttle restart storms on persistent failures (mirrors systemd
       RestartSec=5; launchd's default would respawn every <1s). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Log into the user's Library, not /tmp. /tmp is world-writable
       (symlink-attack risk on shared workstations) and gets cleaned by
       periodic-daily after 3 days; `~/Library/Logs/qwen-serve/` is
       user-scoped and survives. launchd truncates these on every
       `load`, so the unload→load token-rotation cycle wipes prior
       diagnostic logs — back them up if you need post-incident
       inspection. -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

Gerenciamento:

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # apenas na primeira vez
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # o plist contém o token inline
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # para parar
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

Após editar o plist (por exemplo, rotacionando o token), você deve executar `unload` e depois `load` novamente — o `launchctl` não recarrega automaticamente com mudanças no plist como o `systemd daemon-reload` faz. Nota: cada `load` trunca os arquivos de log, então salve‑os se estiver investigando um incidente antes de rotacionar.

## sessão tmux (supervisão interativa)

Assume que `QWEN_SERVER_TOKEN` já está exportado no seu shell (veja a seção de configuração acima):

```bash
tmux new -d -s qwen-serve "cd ~/seu-projeto && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # veja os logs ao vivo; Ctrl-b d para desanexar
tmux kill-session -t qwen-serve
```

`tmux new -d` herda o ambiente do shell pai, então `QWEN_SERVER_TOKEN` flui automaticamente. Melhor para quando você quiser ocasionalmente observar a saída padrão do daemon (avisos de autenticação, progresso de descoberta MCP, avisos de cliente lento) sem se prender a uma unit de serviço. Sobrevive ao fechamento do terminal, mas não à reinicialização da máquina.

## nohup one‑liner (rápido e sujo)

Assume que `QWEN_SERVER_TOKEN` já está exportado no seu shell:

```bash
nohup bash -c 'cd ~/seu-projeto && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # PID do daemon; capture se quiser dar `kill` depois
```

O encapsulamento `bash -c '...'` garante que o daemon se vincule a `~/seu-projeto` em vez de qualquer lugar onde você executou o comando. Sem esse `cd`, o `qwen serve` usa `process.cwd()` por padrão e um `POST /session` de um cliente que espera seu diretório de projeto retorna `400 workspace_mismatch` — uma armadilha silenciosa.

OK para usos pontuais do tipo "deixe isso rodando em segundo plano enquanto testo a API". **Não recomendado** para algo além de uma única sessão — sem reinicialização em caso de falha, o arquivo de log cresce sem limites, nenhuma maneira limpa de encontrar o daemon se você esquecer o PID. Prefira tmux para supervisão interativa ou systemd / launchd para qualquer coisa que deva sobreviver a uma reinicialização.

## Verificando se o daemon está rodando

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # conjunto de recursos do daemon
```

Quando a autenticação está configurada (ou seja, o daemon foi iniciado com `--token` / `QWEN_SERVER_TOKEN` definido, OU `--require-auth=true`), toda rota exceto `/health` no loopback exige `Authorization: Bearer <token>`. Se você iniciou o daemon sem token no padrão loopback (o caminho zero‑config do `qwen serve`), nenhuma chamada precisa de cabeçalho. Os templates acima configuram um token, portanto o cabeçalho `Authorization` é necessário na prática. Se `/capabilities` retornar `401`, o token da unit / plist não corresponde ao token exportado no ambiente que seu `curl` está usando.
## Rotação de token

1. Gere um novo token + escreva o arquivo env que a unit referencia:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Para os templates launchd / nohup / tmux: edite o valor `<string>` no plist ou re-`export QWEN_SERVER_TOKEN`. Não esqueça o `chmod 600` no plist se o regenerar.)
2. Reinicie o daemon:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>` e então reexecute com o novo token na env
3. Atualize quaisquer SDKs / scripts dos clientes. O `DaemonClient` do SDK TypeScript lê `QWEN_SERVER_TOKEN` automaticamente (fallback do PR 27) — re-`export` o novo valor em qualquer shell de cliente e reconstrua o cliente.

## Comportamento de reinicialização e falha

As semânticas de reinicialização do gerenciador de serviço diferem entre os templates:

- **systemd `Restart=on-failure`** — reinicia apenas em saída não-zero / sinal. Um SIGTERM limpo (`systemctl stop`) **não** dispara um loop de reinicialização.
- **launchd `KeepAlive` com `SuccessfulExit=false`** (o template acima) — corresponde ao comportamento do systemd. Um `<true/>` simples teria reincidido mesmo após uma saída limpa. `ThrottleInterval=10` limita a taxa de reinicializações em rajadas para falhas persistentes, espelhando o `RestartSec=5` do systemd.
- **tmux / nohup** — sem reinicialização automática. Uma falha do daemon deixa você com um PID morto até reexecutar.

Dentro de **um único tempo de vida do processo do daemon**, desconexões de cliente se recuperam via retomada SSE `Last-Event-ID` conforme a seção [Modelo de durabilidade](./qwen-serve.md#modelo-de-durabilidade) do guia do usuário — o anel de replay está na memória.

Uma **reinicialização** do daemon descarta todas as sessões na memória; clientes reconectam e começam do zero. A durabilidade entre reinicializações do conteúdo da sessão (prompts, chamadas de ferramenta, histórico de conversa) **NÃO** está na v0.16-alpha.

## Fora do escopo (adiado para v0.16.x ou posterior)

- **Implantação conteinerizada** — Dockerfile, docker-compose, manifestos Kubernetes, nginx + proxy reverso TLS, isolamento de token multi-instância. Adiado para v0.16.x assim que um piloto empresarial for confirmado; o documento apodreceria sem ninguém validando.
- **Federação entre hosts / coordenação multi-daemon em um host** — `1 daemon = 1 workspace × N sessões` é aplicado. Atribuição de token por caminho de instância + limpeza de tokens obsoletos adiados para v0.16.x.
- **Tokens de daemon gerados automaticamente** — alfa é BYO-token. Auto-geração + infraestrutura de armazenamento de tokens adiadas para v0.16.x.
- **Serviço nativo do Windows** (`nssm`, wrapper do Service Control Manager) — por enquanto use [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) e siga a seção systemd acima.

Veja o aviso [Limitações conhecidas da v0.16-alpha](./qwen-serve.md#limita%C3%A7%C3%B5es-conhecidas-da-v016-alpha) no guia do usuário principal para a lista completa de funcionalidades adiadas, e [#4175](https://github.com/QwenLM/qwen-code/issues/4175) para a issue de acompanhamento do lançamento da v0.16-alpha.
