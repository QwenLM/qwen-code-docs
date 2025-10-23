# Publicação de Extensões

Existem duas formas principais de publicar extensões para os usuários:

- [Repositório Git](#publicando-através-de-um-repositório-git)
- [GitHub Releases](#publicando-através-do-github-releases)

As publicações através de repositórios Git tendem a ser a abordagem mais simples e flexível, enquanto as publicações no GitHub podem ser mais eficientes na instalação inicial, já que são distribuídas como arquivos únicos, em vez de exigir um git clone que baixa cada arquivo individualmente. O GitHub Releases também pode conter arquivos específicos para cada plataforma, caso você precise distribuir binários específicos para determinadas plataformas.

## Publicando através de um repositório git

Esta é a opção mais flexível e simples. Tudo que você precisa fazer é criar um repositório git publicamente acessível (como um repositório público no GitHub) e então os usuários poderão instalar sua extensão usando `qwen extensions install <your-repo-uri>`, ou para um repositório GitHub eles podem usar o formato simplificado `qwen extensions install <org>/<repo>`. Eles podem opcionalmente depender de um ref específico (branch/tag/commit) usando o argumento `--ref=<some-ref>`, que por padrão é a branch principal.

Sempre que commits forem enviados para o ref do qual um usuário depende, ele será solicitado a atualizar a extensão. Note que isso também permite rollbacks fáceis, o commit HEAD é sempre tratado como a versão mais recente, independentemente da versão real no arquivo `qwen-extension.json`.

### Gerenciando canais de release usando um repositório git

Os usuários podem depender de qualquer ref do seu repositório git, como um branch ou tag, o que permite gerenciar múltiplos canais de release.

Por exemplo, você pode manter um branch `stable`, que os usuários podem instalar desta forma: `qwen extensions install <your-repo-uri> --ref=stable`. Ou, você pode tornar isso o padrão tratando seu branch padrão como seu branch de release estável e fazendo o desenvolvimento em um branch diferente (por exemplo, chamado `dev`). Você pode manter quantos branches ou tags quiser, proporcionando máxima flexibilidade para você e seus usuários.

Note que esses argumentos `ref` podem ser tags, branches ou até commits específicos, o que permite que os usuários dependam de uma versão específica da sua extensão. Cabe a você decidir como quer gerenciar suas tags e branches.

### Exemplo de fluxo de release usando um repositório Git

Embora existam várias opções para gerenciar releases usando um git flow, recomendamos tratar sua branch padrão como sua branch de release "estável". Isso significa que o comportamento padrão para `qwen extensions install <your-repo-uri>` será usar a branch de release estável.

Vamos supor que você queira manter três canais de release padrão: `stable`, `preview` e `dev`. Você faria todo o desenvolvimento normal na branch `dev`. Quando estiver pronto para uma release de preview, você faz o merge dessa branch na branch `preview`. Quando quiser promover sua branch de preview para estável, você faz o merge de `preview` na sua branch estável (que pode ser sua branch padrão ou uma branch diferente).

Você também pode fazer cherry pick de alterações de uma branch para outra usando `git cherry-pick`, mas observe que isso fará com que suas branches tenham um histórico ligeiramente divergente umas das outras, a menos que você force push nas branches em cada release para restaurar o histórico a um estado limpo (o que pode não ser possível para a branch padrão dependendo das configurações do seu repositório). Se planeja fazer cherry picks, talvez seja melhor evitar ter sua branch padrão como a branch estável, para não precisar fazer force-push na branch padrão — algo que geralmente deve ser evitado.

## Publicando através do GitHub Releases

As extensões do Qwen Code podem ser distribuídas através do [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Isso proporciona uma experiência de instalação inicial mais rápida e confiável para os usuários, pois evita a necessidade de clonar o repositório.

Cada release inclui pelo menos um arquivo compactado, que contém todo o conteúdo do repositório na tag à qual foi vinculado. Os releases também podem incluir [arquivos pré-compilados](#custom-pre-built-archives) caso sua extensão exija algum passo de build ou possua binários específicos por plataforma.

Ao verificar atualizações, o Qwen Code irá procurar apenas pela última release no GitHub (você deve marcá-la como tal ao criar o release), a menos que o usuário tenha instalado uma release específica passando `--ref=<alguma-tag-de-release>`. Atualmente, não oferecemos suporte para optar por releases pré-lançamento ou versionamento semântico (semver).

### Arquivos pré-construídos personalizados

Arquivos personalizados devem ser anexados diretamente ao release do GitHub como assets e devem ser completamente auto-contidos. Isso significa que eles devem incluir toda a extensão, veja [estrutura do arquivo](#archive-structure).

Se sua extensão é independente de plataforma, você pode fornecer um único asset genérico. Neste caso, deve haver apenas um asset anexado ao release.

Arquivos personalizados também podem ser usados se você quiser desenvolver sua extensão dentro de um repositório maior, você pode construir um arquivo que tenha um layout diferente do próprio repositório (por exemplo, pode ser apenas um arquivo de um subdiretório contendo a extensão).

#### Arquivos específicos por plataforma

Para garantir que o Qwen Code consiga encontrar automaticamente o asset correto para cada plataforma, você deve seguir esta convenção de nomenclatura. O CLI irá procurar os assets na seguinte ordem:

1.  **Específico por Plataforma e Arquitetura:** `{platform}.{arch}.{name}.{extension}`
2.  **Específico por Plataforma:** `{platform}.{name}.{extension}`
3.  **Genérico:** Se apenas um asset for fornecido, ele será usado como fallback genérico.

- `{name}`: O nome da sua extensão.
- `{platform}`: O sistema operacional. Os valores suportados são:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: A arquitetura. Os valores suportados são:
  - `x64`
  - `arm64`
- `{extension}`: A extensão do arquivo (ex: `.tar.gz` ou `.zip`).

**Exemplos:**

- `darwin.arm64.my-tool.tar.gz` (específico para Macs com Apple Silicon)
- `darwin.my-tool.tar.gz` (para todos os Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Estrutura do arquivo

Os arquivos devem ser extensões totalmente contidas e ter todos os requisitos padrão - especificamente o arquivo `qwen-extension.json` deve estar na raiz do arquivo.

O restante do layout deve ser exatamente igual a uma extensão típica, veja [extensions.md](extension.md).

#### Exemplo de workflow do GitHub Actions

Aqui está um exemplo de um workflow do GitHub Actions que faz o build e release de uma extensão Qwen Code para múltiplas plataformas:

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