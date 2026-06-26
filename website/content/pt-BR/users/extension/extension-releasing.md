# Lançamento de Extensões

Existem três maneiras principais de disponibilizar extensões para usuários:

- [Repositório Git](#lançamento-por-meio-de-um-repositório-git)
- [GitHub Releases](#lançamento-por-meio-de-github-releases)
- [Registro npm](#lançamento-por-meio-do-registro-npm)

Lançamentos por repositório Git tendem a ser a abordagem mais simples e flexível, enquanto os GitHub Releases podem ser mais eficientes na instalação inicial, pois são enviados como arquivos únicos, em vez de exigir um clone git que baixa cada arquivo individualmente. Os GitHub Releases também podem conter arquivos específicos de plataforma, se você precisar distribuir binários específicos para determinada plataforma. Os lançamentos por registro npm são ideais para equipes que já utilizam npm para distribuição de pacotes, especialmente com registros privados.

## Lançamento por meio de um repositório Git

Esta é a opção mais flexível e simples. Tudo o que você precisa fazer é criar um repositório git publicamente acessível (como um repositório público no GitHub) e os usuários poderão instalar sua extensão usando `qwen extensions install <uri-do-seu-repo>`, ou, para um repositório GitHub, eles podem usar o formato simplificado `qwen extensions install <org>/<repo>`. Opcionalmente, eles podem depender de uma referência específica (branch/tag/commit) usando o argumento `--ref=<alguma-ref>`, que por padrão usa a branch padrão.

Sempre que commits forem enviados para a referência da qual um usuário depende, ele será notificado para atualizar a extensão. Observe que isso também permite reversões fáceis; o commit HEAD é sempre tratado como a versão mais recente, independentemente da versão real no arquivo `qwen-extension.json`.

### Gerenciando canais de lançamento usando um repositório Git

Os usuários podem depender de qualquer referência do seu repositório git, como uma branch ou tag, o que permite gerenciar vários canais de lançamento.

Por exemplo, você pode manter uma branch `stable`, que os usuários podem instalar com `qwen extensions install <uri-do-seu-repo> --ref=stable`. Ou você pode tornar isso o padrão definindo sua branch padrão como a branch de lançamento estável e desenvolvendo em uma branch diferente (por exemplo, chamada `dev`). Você pode manter quantas branches ou tags desejar, oferecendo máxima flexibilidade para você e seus usuários.

Observe que esses argumentos `ref` podem ser tags, branches ou até mesmo commits específicos, permitindo que os usuários dependam de uma versão específica da sua extensão. Cabe a você como gerenciar suas tags e branches.

### Exemplo de fluxo de lançamento usando um repositório Git

Embora existam muitas opções de como gerenciar lançamentos usando um fluxo git, recomendamos tratar sua branch padrão como sua branch de lançamento "estável". Isso significa que o comportamento padrão de `qwen extensions install <uri-do-seu-repo>` é estar na branch de lançamento estável.

Digamos que você queira manter três canais de lançamento padrão: `stable`, `preview` e `dev`. Você faria todo o desenvolvimento padrão na branch `dev`. Quando estiver pronto para fazer um lançamento de pré-visualização, você mescla essa branch na sua branch `preview`. Quando quiser promover sua branch de pré-visualização para estável, você mescla `preview` na sua branch estável (que pode ser sua branch padrão ou uma branch diferente).

Você também pode selecionar (cherry-pick) alterações de uma branch para outra usando `git cherry-pick`, mas observe que isso fará com que suas branches tenham um histórico ligeiramente divergente entre si, a menos que você force o push das alterações para suas branches em cada lançamento para restaurar o histórico a um estado limpo (o que pode não ser possível para a branch padrão dependendo das configurações do seu repositório). Se você planeja fazer cherry-picks, talvez queira evitar que sua branch padrão seja a branch estável, para evitar force-push na branch padrão, o que geralmente deve ser evitado.

## Lançamento por meio de GitHub Releases

Extensões do Qwen Code podem ser distribuídas através de [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Isso proporciona uma experiência de instalação inicial mais rápida e confiável para os usuários, pois evita a necessidade de clonar o repositório.

Cada lançamento inclui pelo menos um arquivo de arquivamento, que contém todo o conteúdo do repositório na tag à qual estava vinculado. Os lançamentos também podem incluir [arquivos pré-compilados](#arquivos-pré-compilados-personalizados) se sua extensão exigir alguma etapa de compilação ou tiver binários específicos de plataforma anexados.

Ao verificar atualizações, o qwen code buscará apenas o lançamento mais recente no github (você deve marcá-lo como tal ao criar o lançamento), a menos que o usuário tenha instalado um lançamento específico usando `--ref=<alguma-tag-de-lançamento>`. No momento, não oferecemos suporte à aceitação de lançamentos de pré-lançamento ou semver.

### Arquivos pré-compilados personalizados

Arquivos personalizados devem ser anexados diretamente ao lançamento do github como ativos e devem ser totalmente autocontidos. Isso significa que devem incluir a extensão completa; consulte [estrutura do arquivo](#estrutura-do-arquivo).

Se sua extensão for independente de plataforma, você pode fornecer um único ativo genérico. Nesse caso, deve haver apenas um ativo anexado ao lançamento.

Arquivos personalizados também podem ser usados se você quiser desenvolver sua extensão dentro de um repositório maior; você pode criar um arquivo que tenha uma estrutura diferente do próprio repositório (por exemplo, pode ser apenas um arquivo de um subdiretório contendo a extensão).
#### Arquivos específicos para cada plataforma

Para garantir que o Qwen Code encontre automaticamente o asset de release correto para cada plataforma, você deve seguir esta convenção de nomenclatura. O CLI buscará os assets na seguinte ordem:

1.  **Específico de plataforma e arquitetura:** `{platform}.{arch}.{name}.{extension}`
2.  **Específico de plataforma:** `{platform}.{name}.{extension}`
3.  **Genérico:** Se apenas um asset for fornecido, ele será usado como fallback genérico.

- `{name}`: O nome da sua extensão.
- `{platform}`: O sistema operacional. Valores suportados:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: A arquitetura. Valores suportados:
  - `x64`
  - `arm64`
- `{extension}`: A extensão do arquivo (ex.: `.tar.gz` ou `.zip`).

**Exemplos:**

- `darwin.arm64.my-tool.tar.gz` (específico para Macs com Apple Silicon)
- `darwin.my-tool.tar.gz` (para todos os Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Estrutura do arquivo

Os arquivos devem ser extensões totalmente autocontidas e atender a todos os requisitos padrão – especificamente, o arquivo `qwen-extension.json` deve estar na raiz do arquivo.

O restante da estrutura deve ser exatamente igual a uma extensão típica. Consulte [introduction.md](./introduction.md).

#### Exemplo de workflow do GitHub Actions

Aqui está um exemplo de workflow do GitHub Actions que compila e publica uma extensão Qwen Code para várias plataformas:

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
          node-version: '22'

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

## Publicação via registro npm

Você pode publicar extensões Qwen Code como pacotes npm com escopo (ex.: `@your-org/my-extension`). Isso é adequado quando:

- Sua equipe já utiliza npm para distribuição de pacotes
- Você precisa de suporte a registro privado com a infraestrutura de autenticação existente
- Você deseja que o npm gerencie resolução de versões e controle de acesso

### Requisitos do pacote

Seu pacote npm deve incluir um arquivo `qwen-extension.json` na raiz do pacote. Este é o mesmo arquivo de configuração usado por todas as extensões Qwen Code – o tarball npm é apenas mais um mecanismo de entrega.

Uma estrutura mínima de pacote se parece com:

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # arquivo de contexto opcional
├── commands/             # comandos personalizados opcionais
├── skills/               # skills personalizados opcionais
└── agents/               # subagentes personalizados opcionais
```

Certifique-se de que `qwen-extension.json` está incluído no pacote publicado (ou seja, não excluído por `.npmignore` ou pelo campo `files` em `package.json`).

### Publicação

Use ferramentas padrão de publicação npm:

```bash
# Publicar no registro padrão
npm publish

# Publicar em um registro privado/personalizado
npm publish --registry https://your-registry.com
```

### Instalação

Os usuários instalam sua extensão usando o nome do pacote com escopo:

```bash
# Instalar a versão mais recente
qwen extensions install @your-org/my-extension

# Instalar uma versão específica
qwen extensions install @your-org/my-extension@1.2.0

# Instalar a partir de um registro personalizado
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### Comportamento de atualização

- Extensões instaladas sem fixar uma versão (ex.: `@scope/pkg`) seguem a dist-tag `latest`.
- Extensões instaladas com uma dist-tag (ex.: `@scope/pkg@beta`) seguem essa tag específica.
- Extensões fixadas em uma versão exata (ex.: `@scope/pkg@1.2.0`) são sempre consideradas atualizadas e não solicitarão atualizações.

### Autenticação para registros privados

Qwen Code lê as credenciais de autenticação npm automaticamente:

1. **Variável de ambiente `NPM_TOKEN`** — maior prioridade
2. **Arquivo `.npmrc`** — suporta entradas `_authToken` tanto no nível do host quanto com escopo de caminho (ex.: `//your-registry.com/:_authToken=TOKEN` ou `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

Arquivos `.npmrc` são lidos do diretório atual e do diretório home do usuário.

### Gerenciamento de canais de release

Você pode usar dist-tags do npm para gerenciar canais de release:

```bash
# Publicar uma release beta
npm publish --tag beta

# Usuários instalam o canal beta
qwen extensions install @your-org/my-extension@beta
```

Isso funciona de forma semelhante a canais de release baseados em branches do git, mas utiliza o mecanismo nativo de dist-tags do npm.
