# Publicação de Extensões

Existem três formas principais de publicar extensões para os usuários:

- [Repositório Git](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [Registro npm](#releasing-through-npm-registry)

Publicações por repositório Git tendem a ser a abordagem mais simples e flexível, enquanto o GitHub Releases pode ser mais eficiente na instalação inicial, pois é distribuído como um único arquivo compactado, em vez de exigir um `git clone` que baixa cada arquivo individualmente. O GitHub Releases também pode conter arquivos compactados específicos para cada plataforma, caso você precise distribuir binários específicos. Publicações no registro npm são ideais para equipes que já utilizam o npm para distribuição de pacotes, especialmente com registros privados.

## Publicação por meio de um repositório Git

Esta é a opção mais flexível e simples. Tudo o que você precisa fazer é criar um repositório Git acessível publicamente (como um repositório público no GitHub) e, em seguida, os usuários poderão instalar sua extensão usando `qwen extensions install <your-repo-uri>`. Para repositórios no GitHub, eles podem usar o formato simplificado `qwen extensions install <org>/<repo>`. Opcionalmente, é possível depender de um `ref` específico (branch/tag/commit) usando o argumento `--ref=<some-ref>`, que por padrão aponta para a branch principal.

Sempre que novos commits forem enviados para o `ref` do qual o usuário depende, ele será notificado para atualizar a extensão. Observe que isso também facilita rollbacks: o commit `HEAD` é sempre tratado como a versão mais recente, independentemente da versão declarada no arquivo `qwen-extension.json`.

### Gerenciando canais de lançamento com um repositório Git

Os usuários podem depender de qualquer `ref` do seu repositório Git, como uma branch ou tag, o que permite gerenciar múltiplos canais de lançamento.

Por exemplo, você pode manter uma branch `stable`, que os usuários podem instalar assim: `qwen extensions install <your-repo-uri> --ref=stable`. Ou você pode tornar isso o padrão, tratando sua branch principal como a branch de lançamento estável e realizando o desenvolvimento em outra branch (por exemplo, chamada `dev`). Você pode manter quantas branches ou tags desejar, oferecendo máxima flexibilidade para você e seus usuários.

Observe que esses argumentos `ref` podem ser tags, branches ou até mesmo commits específicos, o que permite que os usuários dependam de uma versão exata da sua extensão. Fica a seu critério como gerenciar suas tags e branches.

### Exemplo de fluxo de lançamento usando um repositório Git

Embora existam várias opções para gerenciar lançamentos usando um fluxo Git, recomendamos tratar sua branch principal como a branch de lançamento "stable". Isso significa que o comportamento padrão de `qwen extensions install <your-repo-uri>` será instalar a partir da branch estável.

Suponha que você queira manter três canais de lançamento padrão: `stable`, `preview` e `dev`. Você faria todo o desenvolvimento padrão na branch `dev`. Quando estiver pronto para um lançamento de prévia, você faz o merge dessa branch na branch `preview`. Quando estiver pronto para promover a branch `preview` para estável, você faz o merge de `preview` na sua branch estável (que pode ser a branch principal ou outra branch).

Você também pode aplicar cherry-pick de mudanças de uma branch para outra usando `git cherry-pick`, mas observe que isso resultará em um histórico ligeiramente divergente entre as branches, a menos que você faça um force push das mudanças em cada lançamento para restaurar o histórico (o que pode não ser possível para a branch principal, dependendo das configurações do seu repositório). Se planeja fazer cherry-picks, talvez seja melhor evitar que sua branch principal seja a branch estável, para evitar force-push na branch principal, prática que geralmente deve ser evitada.

## Publicação por meio do GitHub Releases

As extensões do Qwen Code podem ser distribuídas por meio do [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Isso proporciona uma experiência de instalação inicial mais rápida e confiável para os usuários, pois evita a necessidade de clonar o repositório.

Cada lançamento inclui pelo menos um arquivo compactado, que contém todo o conteúdo do repositório no momento da tag vinculada. Os lançamentos também podem incluir [arquivos pré-compilados](#custom-pre-built-archives) se sua extensão exigir alguma etapa de build ou tiver binários específicos para cada plataforma.

Ao verificar atualizações, o Qwen Code buscará apenas o lançamento mais recente no GitHub (você deve marcá-lo como tal ao criar o lançamento), a menos que o usuário tenha instalado uma versão específica passando `--ref=<some-release-tag>`. No momento, não oferecemos suporte para optar por pré-lançamentos ou semver.

### Arquivos pré-compilados personalizados

Arquivos compactados personalizados devem ser anexados diretamente ao lançamento no GitHub como assets e precisam ser totalmente autossuficientes. Isso significa que devem incluir a extensão completa; consulte [estrutura do arquivo](#archive-structure).

Se sua extensão for independente de plataforma, você pode fornecer um único asset genérico. Nesse caso, deve haver apenas um asset anexado ao lançamento.

Arquivos compactados personalizados também podem ser usados se você quiser desenvolver sua extensão dentro de um repositório maior. É possível gerar um arquivo com uma estrutura diferente da do próprio repositório (por exemplo, pode ser apenas um compactado de um subdiretório que contém a extensão).

#### Arquivos específicos por plataforma

Para garantir que o Qwen Code encontre automaticamente o asset de lançamento correto para cada plataforma, você deve seguir esta convenção de nomenclatura. A CLI buscará os assets na seguinte ordem:

1.  **Específico por plataforma e arquitetura:** `{platform}.{arch}.{name}.{extension}`
2.  **Específico por plataforma:** `{platform}.{name}.{extension}`
3.  **Genérico:** Se apenas um asset for fornecido, ele será usado como fallback genérico.

- `{name}`: O nome da sua extensão.
- `{platform}`: O sistema operacional. Valores suportados:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: A arquitetura. Valores suportados:
  - `x64`
  - `arm64`
- `{extension}`: A extensão do arquivo compactado (por exemplo, `.tar.gz` ou `.zip`).

**Exemplos:**

- `darwin.arm64.my-tool.tar.gz` (específico para Macs com Apple Silicon)
- `darwin.my-tool.tar.gz` (para todos os Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Estrutura do arquivo

Os arquivos compactados devem conter a extensão de forma completa e atender a todos os requisitos padrão — especificamente, o arquivo `qwen-extension.json` deve estar na raiz do arquivo.

O restante da estrutura deve ser exatamente igual ao de uma extensão típica; consulte [extensions.md](extension.md).

#### Exemplo de workflow do GitHub Actions

Aqui está um exemplo de workflow do GitHub Actions que compila e publica uma extensão do Qwen Code para múltiplas plataformas:

```yaml
name: Release Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Create release assets
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```

## Publicação por meio do registro npm

Você pode publicar extensões do Qwen Code como pacotes npm com escopo (por exemplo, `@your-org/my-extension`). Essa abordagem é ideal quando:

- Sua equipe já utiliza o npm para distribuição de pacotes
- Você precisa de suporte a registro privado com infraestrutura de autenticação existente
- Você deseja que a resolução de versões e o controle de acesso sejam gerenciados pelo npm

### Requisitos do pacote

Seu pacote npm deve incluir um arquivo `qwen-extension.json` na raiz do pacote. Este é o mesmo arquivo de configuração usado por todas as extensões do Qwen Code — o tarball do npm é apenas outro mecanismo de distribuição.

Uma estrutura mínima de pacote se parece com:

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # optional context file
├── commands/             # optional custom commands
├── skills/               # optional custom skills
└── agents/               # optional custom subagents
```

Certifique-se de que o `qwen-extension.json` esteja incluído no seu pacote publicado (ou seja, não seja excluído pelo `.npmignore` ou pelo campo `files` no `package.json`).

### Publicação

Utilize as ferramentas padrão de publicação do npm:

```bash
# Publish to the default registry
npm publish

# Publish to a private/custom registry
npm publish --registry https://your-registry.com
```

### Instalação

Os usuários instalam sua extensão usando o nome do pacote com escopo:

```bash
# Install latest version
qwen extensions install @your-org/my-extension

# Install a specific version
qwen extensions install @your-org/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### Comportamento de atualização

- Extensões instaladas sem fixação de versão (por exemplo, `@scope/pkg`) acompanham a dist-tag `latest`.
- Extensões instaladas com uma dist-tag (por exemplo, `@scope/pkg@beta`) acompanham essa tag específica.
- Extensões fixadas em uma versão exata (por exemplo, `@scope/pkg@1.2.0`) são sempre consideradas atualizadas e não solicitarão atualizações.

### Autenticação para registros privados

O Qwen Code lê as credenciais de autenticação do npm automaticamente:

1. **Variável de ambiente `NPM_TOKEN`** — maior prioridade
2. **Arquivo `.npmrc`** — suporta entradas `_authToken` em nível de host e com escopo de caminho (por exemplo, `//your-registry.com/:_authToken=TOKEN` ou `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

Os arquivos `.npmrc` são lidos a partir do diretório atual e do diretório home do usuário.

### Gerenciando canais de lançamento

Você pode usar dist-tags do npm para gerenciar canais de lançamento:

```bash
# Publish a beta release
npm publish --tag beta

# Users install beta channel
qwen extensions install @your-org/my-extension@beta
```

Isso funciona de forma semelhante aos canais de lançamento baseados em branches do Git, mas utiliza o mecanismo nativo de dist-tags do npm.