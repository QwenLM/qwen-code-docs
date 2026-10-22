# Executar sessões gerenciadas localmente

O modo gerenciado local utiliza um banco de dados H2 incorporado e persistente. Com o Java 21 local instalado,
o primeiro lançamento do Managed baixa automaticamente o JAR do servidor Java correspondente.
Ele reutiliza o executável Node que executa o Qwen,
seu Hosted Harness, a entrada nativa do worker e o WebShell de produção. Os usuários não precisam instalar
MySQL, Docker, Maven ou systemd. Um runtime empacotado pré-instalado opcional inclui
Java; o download padrão e a edição leve requerem o Java 21 local.

Este modo é experimental. A implementação oferece suporte nativo a macOS e Linux
em arm64 e x64. Os resultados de aceitação de plataforma são registrados separadamente; fornecer
um alvo de empacotamento não estabelece que a plataforma passou na validação E2E.
Os arquivos de runtime do Managed são construídos explicitamente conforme descrito abaixo; os pacotes comuns da CLI
não contêm o payload Java. Um arquivo standalone completo opcional do Managed
empacota todos os componentes.

## Iniciar e parar

Use uma versão do Qwen que inclua suporte ao Managed local. Versões mais antigas precisam de
uma atualização da CLI; instalar apenas o runtime não pode adicionar o launcher. Instale o Java 21
e defina `JAVA_HOME` como seu diretório base, ou coloque seu executável no PATH, e execute:

```sh
qwen serve --managed --open
```

Antes de criar dados de aplicação ou iniciar serviços, o Qwen verifica o Java 21 e
baixa `qwen-managed-agent-server-<cli-version>.jar` e seu checksum a partir do
espelho de lançamento oficial do Aliyun OSS, com o mesmo GitHub Release como fallback.
Ele verifica o checksum e instala um runtime completo de forma atômica em
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/`. Lançamentos posteriores
reutilizam esse cache sem acesso à rede. Comandos comuns do Qwen não fazem o download.
Apenas o JAR do serviço é baixado; o Qwen não instala Java nem executa Maven.
Se o lançamento correspondente estiver indisponível ou um download falhar, nenhum dado de aplicação
ou processo filho de serviço será criado. Tente novamente mais tarde ou pré-instale um runtime correspondente.

Para uso offline ou Java empacotado, obtenha um
`qwen-code-managed-runtime-<platform>-<arch>.tar.gz` correspondente e seu arquivo `.sha256` a partir do
seu distribuidor. Verifique e extraia antes de iniciar:

```sh
shasum -a 256 -c qwen-code-managed-runtime-darwin-arm64.tar.gz.sha256
mkdir -p "${QWEN_HOME:-$HOME/.qwen}"
tar -xzf qwen-code-managed-runtime-darwin-arm64.tar.gz -C "${QWEN_HOME:-$HOME/.qwen}"
qwen serve --managed --open
```

O arquivo é instalado em
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/`. O Qwen descobre
o diretório para sua versão e plataforma exatas automaticamente. O runtime
não inclui outra instalação de Node, CLI, Harness, worker ou WebShell.

Para um payload offline menor, escolha `qwen-code-managed-runtime-lite-<platform>-<arch>.tar.gz`
e verifique/extraia da mesma forma. Ele contém apenas o JAR do servidor e
o manifesto. Instale uma edição em um diretório de versão/alvo novo; não
sobreponha arquivos empacotados e leves. O launcher leve usa
`JAVA_HOME/bin/java` quando JAVA_HOME não está vazio, caso contrário o primeiro executável
`java` no PATH. Ele requer especificamente o Java 21 e verifica o executável
antes de criar o estado da aplicação. Um JAVA_HOME incorreto é um erro mesmo que
o PATH contenha outro Java funcional. Por exemplo:

```sh
JAVA_HOME=/absolute/java-21-home qwen serve --managed --open
```

No macOS, o JAVA_HOME geralmente termina em `Contents/Home`. Java ausente ou incompatível
produz um erro de instalação/configuração antes de baixar o JAR; o Qwen não baixa Java.
A edição empacotada sempre usa seu próprio Java e não faz fallback para o
Java da máquina se seu payload estiver corrompido.

O `qwen-code-managed-local-<platform>-<arch>.tar.gz` completo opcional também
funciona: extraia-o e execute `./qwen-code/bin/qwen serve --managed --open`.

A aplicação faz bind em `127.0.0.1:4170`. Use `--port 0` para uma porta
disponível, ou selecione uma porta fixa. Mantenha o terminal aberto; Ctrl+C encerra o
daemon comum, o serviço Java e o Harness. O systemd é opcional para implantações
gerenciadas pelo operador e não é usado por este comando.
Uma porta pública ocupada segue a tentativa limitada de porta próxima do daemon comum;
use o endereço do navegador impresso pelo launcher.

Este único comando inicia tanto o daemon comum quanto o Managed Agent. O mesmo
WebShell lista workspaces e sessões comuns e gerenciadas juntas em Projects, com um rótulo Managed nos workspaces gerenciados e sem abas de modo de execução. Nova tarefa segue o workspace ou a conversa selecionada. Sessões locais usam
o diretório onde você executou o comando, enquanto sessões gerenciadas usam seus
Workspaces criados pela aplicação ou projetos locais importados explicitamente. Ambos usam
a mesma origem de navegador autenticada;
você não precisa de um segundo comando daemon ou página de navegador.

Em **Add workspace**, escolha **Local (daemon)** ou **Managed (Managed Agent)**
antes de enviar. A escolha padrão é o serviço da conversa atual.
As linhas de workspace e **New task** mostram esse serviço, e novas tarefas herdam o
workspace selecionado. O suporte existente de workspace SSH do daemon permanece
disponível; o registro SSH do Managed não está integrado a este diálogo compartilhado.

O terminal imprime uma URL de navegador com um fragmento de token. Trate-o como uma senha
local. O navegador usa o token para autenticar cada requisição de API; as chaves de assinatura Java
e credenciais internas nunca chegam ao navegador. O listener é
apenas loopback. Para uma máquina headless, omita `--open` e abra a URL impressa
nessa máquina, ou use um túnel autenticado que você gerencia.

A aplicação unificada atualmente suporta a página de loopback local. A entrada
Mobile access / Local Control do shell completo não está integrada à
inicialização do Managed: um listener pareado na LAN não pode abrir esta página unificada. O compartilhamento móvel
precisa de uma integração separada; o daemon comum mantém seu comportamento existente
de Local Control.

O Harness usa a configuração normal de modelo do Qwen e credenciais de provedor.
Configure um modelo usando a configuração usual da CLI do Qwen antes de enviar seu primeiro
prompt. Files e Shell usam o modo de aprovação `default`; a UI do Managed solicita
aprovação antes de uma ação que a requeira.

Após uma reinicialização, continuar uma sessão existente pode aguardar o lease do escritor SQL
anterior expirar (60 segundos por padrão). Mantenha o diretório de dados original
e tente novamente após esse intervalo; reiniciar processos não limpa a propriedade.

## Workspaces e dados persistentes

O diretório de dados privado padrão é `<Qwen home>/managed-local`, normalmente
`~/.qwen/managed-local`. Substitua-o com:

```sh
qwen serve --managed --managed-data-dir /absolute/private/data --open
```

O diretório deve estar fora de cada worktree Git. Um launcher pode usá-lo por
vez; o Java também mantém um lock exclusivo de arquivo de banco de dados. As portas e credenciais
privadas do serviço permanecem estáveis entre reinicializações. Uma porta privada ocupada por
outra aplicação causa falha na inicialização; escolha um diretório de dados novo e diferente
ou pare o serviço conflitante em vez de editar fatos persistidos.

A inicialização cria um Workspace padrão de propriedade da aplicação e sua concessão OWNER
por meio da API idempotente existente de Workspace. Para usar um projeto local existente,
abra **Workspace → Choose existing directory**, navegue ou insira seu caminho
absoluto, e adicione a pasta. O serviço registra seu diretório pai e concede acesso
OWNER automaticamente, mantendo os arquivos existentes no lugar. Novas tarefas começam no
projeto selecionado. Você também pode criar um Workspace vazio.

O diretório de lançamento permanece disponível para sessões locais e não é importado
automaticamente. `--workspace` permanece não suportado no modo Managed local; selecione
o projeto na UI. O marcador de manutenção `.qwen-managed-storage.json` é
mantido fora de worktrees Git; não edite, exclua, faça stash ou commit dele. Arquivos de projetos
importados ficam fora do diretório de dados privado do Managed e requerem seu
próprio backup.

O histórico de sessões locais continua a usar o armazenamento comum do Qwen. Ele é separado
do diretório de dados do Managed e não está incluído em um backup apenas do Managed.

Preserve o diretório de dados completo em conjunto, incluindo `state.json`,
`database/`, `runtime/`, `worker-home/` e `workspaces/`. Encerre ou cancele
trabalhos ativos, feche suas sessões e pare a aplicação antes de fazer um
backup do sistema de arquivos. Workers originais duráveis podem sobreviver a uma saída do plano de controle;
confirme que todos os escritores de Workspace pararam. Uma execução desconhecida precisa do
procedimento de recuperação de proprietário original existente antes de um backup offline.
Credenciais, banco de dados, histórico de workers e identidade de Workspace pertencem à mesma
instalação. Restaurar apenas um subconjunto
pode fechar a admissão de recuperação. A inicialização não recria um marcador ausente ou
substitui credenciais corrompidas. Os diagnósticos de serviço estão em `logs/`.

O macOS suporta workers nativos e adoção durável na mesma inicialização. A recuperação confiável
de reinicialização do host inteiro permanece desativada no launcher local. Resultados de ferramentas
desconhecidos retêm as regras existentes de recuperação de proprietário original e nunca são repetidos cegamente.
Este modo não adiciona inicialização automática no login nem impede o sleep do laptop.

## Construir uma distribuição

Estes comandos são para construtores de lançamentos, não para usuários finais. Construa a CLI e o servidor Java
a partir do mesmo checkout com Node 22+, Java 21 e Maven 3.8.9+:

```sh
corepack pnpm install --frozen-lockfile
npm run build
npm run typecheck
npm run bundle
npm run prepare:package
mvn -f packages/sdk-java/qwencode/pom.xml -DskipTests -Dgpg.skip=true install
mvn -f packages/managed-agent-server/pom.xml verify
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --jre-home /verified/java-21-home \
  --out-dir /output/managed-runtime
```

O construtor de runtime precisa apenas do JAR do servidor correspondente, do runtime Java e da versão da CLI
deste checkout. Ele não requer assets da CLI construídos nem um arquivo
Node. Por padrão, ele escreve em
`packages/managed-agent-server/target/managed-runtime`, fora dos
assets `dist/` da CLI. Ele emite o arquivo de runtime e um arquivo `.sha256` por arquivo. A
CLI normal é construída/lançada separadamente.

Construa o runtime leve usando o mesmo JAR do servidor com `--without-jre`
em vez de `--jre-home`:

```sh
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --without-jre \
  --out-dir /output/managed-runtime
```

Isso emite `qwen-code-managed-runtime-lite-darwin-arm64.tar.gz` e seu checksum. O construtor leve não precisa de entrada Java. Para uma distribuição completa opcional:

```sh
npm run package:standalone -- \
  --target darwin-arm64 \
  --node-archive /verified/node-v22-darwin-arm64.tar.gz \
  --managed-server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --managed-jre-home /verified/java-21-home \
  --out-dir /output/managed-local
```

Use o diretório base completo do runtime extraído contendo `bin/java`, `lib/modules`,
`release` e `legal/`. Um JRE do macOS pode colocar isso em `Contents/Home`.
O construtor verifica a versão major do Java, SO e arquitetura, inclui suas
licenças e registra o SHA-256 do servidor e a versão da CLI correspondente no
manifesto do payload. O standalone completo usa `lib/managed-runtime/` e
emite `SHA256SUMS`. Verifique os checksums do publicador das entradas de runtime antes de construir.
A execução gerenciada no Windows e Bun é recusada; o launcher requer Node 22+.

Para um local de runtime explícito,
`QWEN_MANAGED_LOCAL_RUNTIME_DIR=/absolute/managed-runtime` aponta a CLI
local diretamente para um diretório contendo `manifest.json` e `server.jar`
(mais `jre/` para a edição empacotada).
Ele tem precedência sobre o payload co-localizado e a instalação versionada no Qwen home.
Um payload co-localizado existente tem precedência sobre a instalação no Qwen home.
Um payload selecionado inválido ou incompleto nunca é substituído por outro diferente.
Um payload selecionado explicitamente ausente, versão da CLI errada, alvo,
versão major do Java ou checksum do servidor falha antes dos processos filhos iniciarem. Apenas um cache
padrão ausente dispara a instalação do JAR; payloads danificados existentes não são substituídos.
O Maven nunca é executado durante a inicialização da aplicação.

## Publicar o JAR de primeiro uso

O workflow `Release Managed server runtime` constrói a partir de uma tag de lançamento da CLI
já publicada, usando o SDK e o servidor a partir dessa revisão de fonte exata. Uma
execução manual deve ser disparada a partir de `main` e usa dry run por padrão. Ela verifica
a CLI e o módulo Java, constrói o perfil `central-release` e retém o
JAR e o checksum como artifacts do workflow sem alterar repositórios públicos.

Após verificar o dry run, operadores de lançamento podem executar a mesma tag com
`dry_run=false` através do ambiente protegido `production-release`. O
workflow define a versão do artifact do servidor como a versão da CLI, publica
`com.alibaba:qwen-managed-agent-server:<cli-version>` no Maven Central com
fontes, Javadoc e assinaturas, e distribui o mesmo JAR primário mais seu
`.sha256` através daquele GitHub Release e do espelho OSS versionado existente.
JARs auxiliares do operador não são anexados à publicação no Central. Assets
existentes são comparados byte a byte e nunca substituídos por conteúdo diferente.
Eventos de lançamento da CLI publicados também executam este workflow automaticamente.

A CLI faz download do OSS/GitHub, não do Maven Central. Ela não resolve o
SDK como uma dependência separada do usuário: o JAR executável do servidor inclui suas dependências
Java. Os assets de runtime devem existir para o lançamento exato da CLI antes que o
download de primeiro uso seja bem-sucedido. A validação local deste PR não publica esses
assets nem contorna o ambiente de lançamento de produção.

Consulte o [design](../design/2026-10-20-managed-local-serve.md) bilíngue para
limites de propriedade e critérios de validação, e a
[referência do servidor Java](../../packages/managed-agent-server/README.md) para
implantações MySQL orientadas a operadores.