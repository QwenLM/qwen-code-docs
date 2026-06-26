# Modelos de inicialização local para `qwen serve` (v0.16-alpha)

Modelos de referência para executar `qwen serve` como um processo em segundo plano de longa duração em uma estação de trabalho de desenvolvedor. Acompanha os [limites conhecidos da v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) — apenas local, usuário único, traga seu próprio bearer token. Implantações em contêiner / multihost / com TLS front-end são adiadas para a v0.16.x.

> **Público‑alvo**: desenvolvedores que estão testando o produto internamente e desejam que o daemon permaneça ativo após reinicializações, com logs armazenados em algum local durável e uma estratégia limpa de `restart-on-failure`. Se você precisa apenas do daemon durante uma única sessão de shell, o `qwen serve` simples (em primeiro plano, Ctrl‑C para parar) é suficiente.

## Gerar um bearer token (uma vez)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # gerenciado pelo usuário, NÃO é um caminho embutido
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

O caminho / nome do arquivo é de sua escolha; a v0.16‑alpha não gera nem localiza automaticamente um arquivo de token (adiado para v0.16.x). Consulte a seção [Autenticação](./qwen-serve.md#authentication) do guia do usuário para a configuração BYO canônica.

> **Mantenha este `export` no escopo apenas da sessão atual do shell.** Não o adicione ao `~/.bashrc` / `~/.zshrc` — uma exportação em nível de perfil expõe o bearer token a todo processo iniciado a partir desse shell (subprocessos da IDE, depuradores de navegador, scripts `npm` de projetos não relacionados). Para configurações de longa duração, use os mecanismos `EnvironmentFile=` do systemd / `EnvironmentVariables` do launchd descritos abaixo — ambos limitam o token apenas ao processo do daemon.

O daemon lê o bearer token de `--token <valor>` na CLI ou da variável de ambiente `QWEN_SERVER_TOKEN` (espaços em branco são removidos de ambos). O construtor `DaemonClient` do SDK TypeScript usa `QWEN_SERVER_TOKEN` como fallback quando nenhuma opção `token` é passada (fallback do PR 27 — clientes com a variável de ambiente definida nunca precisam passar o valor por meio do script).

Uma única exportação no nível do shell cobre tanto a inicialização do servidor quanto a construção do cliente do SDK (apenas mantenha‑a no escopo da sessão, conforme a observação acima).

## Linux: unidade de usuário do systemd

> **Encontre seu binário `qwen` primeiro.** O `ExecStart=` do arquivo de unidade deve conter um **caminho absoluto** — os gerenciadores de serviço não leem o `PATH` do seu shell. Execute `which qwen` para descobri‑lo. Locais comuns: `/usr/local/bin/qwen` (Linuxbrew, instalações manuais), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Substitua pelo caminho real onde os modelos abaixo mostram `/PATH/TO/qwen`.

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code daemon (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Replace with your project; %h expands to $HOME under user units.
WorkingDirectory=%h/your-project
# Run `which qwen` to find the absolute path. systemd does NOT read $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Read the bearer token from a chmod 600 file rather than inlining it
# in the unit. `Environment=` would expose the token in the unit file
# (typically 644 = world-readable). EnvironmentFile keeps the token in
# the user-owned secret file you already created with `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Crie o arquivo de ambiente uma vez (o arquivo de token da etapa de configuração contém o valor bruto; este o envolve no formato `KEY=value` para que o systemd o leia como uma atribuição de ambiente):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Gerenciamento:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # mantém o gerenciador de usuário em execução após logout / reinicialização
journalctl --user -u qwen-serve -f               # exibe os logs em tempo real
systemctl --user restart qwen-serve.service     # após rotação de token
systemctl --user disable --now qwen-serve.service
```

Sem `loginctl enable-linger`, a instância do systemd em nível de usuário é encerrada quando o usuário faz logout e só reinicia no próximo login — em uma máquina de desenvolvimento headless, o daemon não sobreviveria ao término de uma sessão SSH. `enable-linger` é o que faz com que as reinicializações realmente funcionem.

**Alternativa em todo o sistema** (máquinas de desenvolvimento compartilhadas, menos comum): coloque a unidade em `/etc/systemd/system/qwen-serve@.service` com `User=%i`, gerencie via `sudo systemctl enable --now qwen-serve@<username>.service`. O corpo do `[Service]` é o mesmo, mas a exposição de `Environment=` legível por todos é ainda mais problemática nesse nível, portanto use sempre `EnvironmentFile=` apontando para o arquivo `chmod 600` do usuário. Prefira nível de usuário + linger para estações de trabalho de usuário único.

## macOS: agente de usuário do launchd

> **Encontre seu binário `qwen` primeiro.** A mesma restrição do systemd — `ProgramArguments` deve conter um **caminho absoluto**. Execute `which qwen` para descobri‑lo. Locais comuns no macOS: `/opt/homebrew/bin/qwen` (Homebrew no Apple Silicon), `/usr/local/bin/qwen` (Homebrew no Intel, instalações manuais), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Substitua abaixo onde o modelo mostra `/PATH/TO/qwen`.

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
       user‑scoped and survives. launchd truncates these on every
       `load`, so the unload→load token‑rotation cycle wipes prior
       diagnostic logs — back them up if you need post‑incident
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

Após editar o plist (por exemplo, rotacionando o token), você deve executar `unload` e depois `load` novamente — o `launchctl` não recarrega automaticamente alterações no plist como o `systemd daemon-reload` faz. Observação: cada `load` trunca os arquivos de log; salve‑os se estiver investigando um incidente antes de rotacionar.

## Sessão tmux (supervisão interativa)

Supondo que `QWEN_SERVER_TOKEN` já esteja exportado em seu shell (veja a seção de configuração acima):

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # veja logs ao vivo; Ctrl‑b d para desanexar
tmux kill-session -t qwen-serve
```

`tmux new -d` herda o ambiente do shell pai, portanto `QWEN_SERVER_TOKEN` é propagado automaticamente. Melhor quando você deseja ocasionalmente observar a saída padrão do daemon (avisos de autenticação, progresso de descoberta MCP, avisos de cliente lento) sem se comprometer com uma unidade de serviço. Sobrevive ao fechamento do terminal, mas não à reinicialização do sistema.

## One‑liner com nohup (rápido e sujo)

Supondo que `QWEN_SERVER_TOKEN` já esteja exportado em seu shell:

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # PID do daemon; capture se quiser usar `kill` de forma limpa depois
```

O `bash -c '...'` que envolve o comando garante que o daemon seja vinculado a `~/your-project` em vez de onde quer que você tenha executado o comando. Sem esse `cd`, o `qwen serve` usa como padrão `process.cwd()` e um `POST /session` de um cliente que espera o workspace do seu projeto retorna `400 workspace_mismatch` — uma armadilha silenciosa.

OK para fluxos de trabalho pontuais do tipo "deixe eu executar isso em segundo plano enquanto testo a API". **Não recomendado** para nada além de uma única sessão — sem reinicialização em caso de falha, o arquivo de log cresce sem limites, não há uma maneira limpa de encontrar o daemon se você esquecer o PID. Prefira tmux para supervisão interativa ou systemd / launchd para qualquer coisa que você queira que sobreviva a uma reinicialização.

## Verificando se o daemon está ativo

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # conjunto de recursos do daemon
```

Quando a autenticação está configurada (ou seja, o daemon foi iniciado com `--token` / `QWEN_SERVER_TOKEN` definido, OU `--require-auth=true`), toda rota exceto `/health` no loopback exige `Authorization: Bearer <token>`. Se você iniciou o daemon sem um token na configuração padrão do loopback (caminho de configuração zero do `qwen serve`), nenhuma das chamadas exige cabeçalho. Os modelos acima configuram todos um token, portanto o cabeçalho `Authorization` é necessário na prática. Se `/capabilities` retornar `401`, o token da unidade / plist não corresponde ao token exportado no ambiente que seu `curl` está usando.

## Rotação de token

1. Gere um novo token + escreva o arquivo de ambiente referenciado pela unidade:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Para os modelos launchd / nohup / tmux: edite o valor da `<string>` no plist ou re‑exporte `QWEN_SERVER_TOKEN`. Não se esqueça do `chmod 600` no plist se você o regenerar.)
2. Reinicie o daemon:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>` e execute novamente com o novo token no ambiente
3. Atualize os SDKs / scripts dos clientes. O `DaemonClient` do SDK TypeScript lê `QWEN_SERVER_TOKEN` automaticamente (fallback do PR 27) — re‑exporte o novo valor no shell do cliente e reconstrua o cliente.

## Comportamento de reinicialização e falhas

As semânticas de reinicialização dos gerenciadores de serviço diferem entre os modelos:

- **systemd `Restart=on-failure`** — reinicia apenas em saída diferente de zero / sinal. Um SIGTERM limpo (`systemctl stop`) **não** desencadeia um loop de reinicialização.
- **launchd `KeepAlive` com `SuccessfulExit=false`** (o modelo acima) — corresponde ao comportamento do systemd. Um `<true/>` simples teria reiniciado mesmo após uma saída limpa. `ThrottleInterval=10` limita a taxa de reinicializações em falhas persistentes, espelhando `RestartSec=5` do systemd.
- **tmux / nohup** — sem reinicialização automática. Uma falha do daemon deixa um PID morto até que você execute novamente.

Dentro de **um único tempo de vida do processo do daemon**, as desconexões de cliente são recuperadas via retomada SSE `Last‑Event‑ID` conforme a seção [Modelo de durabilidade](./qwen-serve.md#durability-model) do guia do usuário — o anel de replay está na memória.

Uma **reinicialização** do daemon descarta todas as sessões na memória; os clientes se reconectam e começam do zero. A durabilidade entre reinicializações do conteúdo da sessão (prompts, chamadas de ferramentas, histórico de conversas) **NÃO** está na v0.16‑alpha.

## Fora do escopo (adiado para v0.16.x ou posterior)

- **Implantação em contêiner** — Dockerfile, docker‑compose, manifestos Kubernetes, nginx + proxy reverso TLS, isolamento de token em múltiplas instâncias. Adiado para v0.16.x assim que um piloto empresarial for comprometido; a documentação, caso contrário, se deterioraria por ninguém validar.
- **Federação entre hosts / coordenação de múltiplos daemons em um único host** — `1 daemon = 1 workspace × N sessões` é aplicado. Chaveamento de token por caminho de instância + limpeza de tokens obsoletos são adiados para v0.16.x.
- **Tokens de daemon gerados automaticamente** — alfa é traga seu próprio token. A geração automática + infraestrutura de armazenamento de tokens são adiadas para v0.16.x.
- **Serviço nativo do Windows** (nssm, wrapper do Service Control Manager) — por enquanto use [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) e siga a seção systemd acima.

Consulte o aviso [limites conhecidos da v0.16‑alpha](./qwen-serve.md#v016-alpha-known-limits) no guia do usuário principal para a lista completa de recursos adiados, e [#4175](https://github.com/QwenLM/qwen-code/issues/4175) para a issue de acompanhamento do lançamento da v0.16‑alpha.