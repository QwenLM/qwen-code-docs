# Publicação de Extensões

Existem duas maneiras principais de publicar extensões para os usuários:

- [Repositório Git](#publicando-através-de-um-repositório-git)
- [Github Releases](#publicando-através-do-github-releases)

As publicações por repositório Git tendem a ser a abordagem mais simples e flexível, enquanto as publicações no GitHub podem ser mais eficientes na instalação inicial, pois são distribuídas como arquivos únicos em vez de exigir um clone git que baixa cada arquivo individualmente. As publicações no Github também podem conter arquivos específicos da plataforma caso você precise distribuir arquivos binários específicos da plataforma.

## Publicação através de um repositório git

Esta é a opção mais flexível e simples. Tudo que você precisa fazer é criar um repositório git acessível publicamente (como um repositório público no GitHub) e então os usuários poderão instalar sua extensão usando `qwen extensions install <uri-do-seu-repo>`, ou para um repositório GitHub eles podem usar o formato simplificado `qwen extensions install <organização>/<repositório>`. Eles podem opcionalmente depender de uma referência específica (branch/tag/commit) usando o argumento `--ref=<alguma-ref>`, cujo padrão é o branch principal.

Sempre que commits forem enviados para a referência na qual um usuário depende, ele será solicitado a atualizar a extensão. Observe que isso também permite reversões fáceis, pois o commit HEAD é sempre tratado como a versão mais recente, independentemente da versão real no arquivo `qwen-extension.json`.

### Gerenciando canais de lançamento usando um repositório git

Os usuários podem depender de qualquer referência (ref) do seu repositório git, como uma branch ou tag, o que permite gerenciar múltiplos canais de lançamento.

Por exemplo, você pode manter uma branch `stable`, na qual os usuários podem instalar desta forma: `qwen extensions install <uri-do-seu-repo> --ref=stable`. Ou, você poderia tornar isso padrão tratando sua branch principal como a branch de lançamento estável e fazendo o desenvolvimento em outra branch (por exemplo, chamada `dev`). Você pode manter quantas branches ou tags desejar, proporcionando máxima flexibilidade para você e seus usuários.

Observe que esses argumentos `ref` podem ser tags, branches ou até commits específicos, permitindo que os usuários dependam de uma versão específica da sua extensão. Cabe a você decidir como deseja gerenciar suas tags e branches.

### Exemplo de fluxo de lançamento usando um repositório git

Embora existam muitas opções para como você deseja gerenciar lançamentos usando um fluxo git, recomendamos tratar seu branch padrão como seu branch de lançamento "estável". Isso significa que o comportamento padrão para `qwen extensions install <seu-repositorio-uri>` será estar no branch de lançamento estável.

Digamos que você queira manter três canais de lançamento padrão: `stable`, `preview` e `dev`. Você faria todo o desenvolvimento padrão no branch `dev`. Quando estiver pronto para fazer um lançamento de visualização, você mescla esse branch no seu branch `preview`. Quando estiver pronto para promover seu branch de visualização para estável, você mescla `preview` no seu branch estável (que pode ser seu branch padrão ou um branch diferente).

Você também pode selecionar alterações de um branch para outro usando `git cherry-pick`, mas observe que isso resultará em seus branches tendo uma história ligeiramente divergente entre si, a menos que você force o envio de alterações para seus branches a cada lançamento para restaurar o histórico a um estado limpo (o que pode não ser possível para o branch padrão dependendo das configurações do seu repositório). Se você planeja fazer cherry picks, talvez queira evitar ter seu branch padrão como o branch estável para evitar fazer force-push no branch padrão, o que geralmente deve ser evitado.

## Distribuição através de lançamentos no GitHub

As extensões Qwen Code podem ser distribuídas por meio de [Lançamentos no GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Isso proporciona uma experiência inicial de instalação mais rápida e confiável para os usuários, evitando a necessidade de clonar o repositório.

Cada lançamento inclui pelo menos um arquivo de arquivamento que contém todos os conteúdos do repositório na tag à qual foi vinculado. Os lançamentos também podem incluir [arquivos pré-construídos](#custom-pre-built-archives), caso sua extensão exija algum passo de construção ou tenha binários específicos da plataforma anexados a ela.

Ao verificar se há atualizações, o qwen code procurará apenas o lançamento mais recente no GitHub (você deve marcá-lo como tal ao criar o lançamento), a menos que o usuário tenha instalado um lançamento específico passando `--ref=<alguma-tag-de-lançamento>`. Atualmente, não oferecemos suporte para optar por versões de pré-lançamento ou semver.

### Arquivos pré-construídos personalizados

Arquivos personalizados devem ser anexados diretamente ao lançamento no GitHub como ativos e devem ser totalmente autossuficientes. Isso significa que eles devem incluir toda a extensão, veja [estrutura do arquivo](#archive-structure).

Se sua extensão for independente de plataforma, você pode fornecer um único ativo genérico. Nesse caso, deve haver apenas um ativo anexado ao lançamento.

Arquivos personalizados também podem ser usados se você desejar desenvolver sua extensão dentro de um repositório maior; você pode construir um arquivo que tenha uma estrutura diferente do próprio repositório (por exemplo, poderia ser apenas um arquivo de um subdiretório contendo a extensão).

#### Arquivos específicos por plataforma

Para garantir que o Qwen Code possa encontrar automaticamente o ativo de lançamento correto para cada plataforma, você deve seguir esta convenção de nomenclatura. A CLI buscará os ativos na seguinte ordem:

1.  **Específico por plataforma e arquitetura:** `{plataforma}.{arquitetura}.{nome}.{extensão}`
2.  **Específico por plataforma:** `{plataforma}.{nome}.{extensão}`
3.  **Genérico:** Se apenas um ativo for fornecido, ele será usado como alternativa genérica.

- `{nome}`: O nome da sua extensão.
- `{plataforma}`: O sistema operacional. Os valores suportados são:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arquitetura}`: A arquitetura. Os valores suportados são:
  - `x64`
  - `arm64`
- `{extensão}`: A extensão do arquivo do arquivo (por exemplo, `.tar.gz` ou `.zip`).

**Exemplos:**

- `darwin.arm64.minha-ferramenta.tar.gz` (específico para Macs com Apple Silicon)
- `darwin.minha-ferramenta.tar.gz` (para todos os Macs)
- `linux.x64.minha-ferramenta.tar.gz`
- `win32.minha-ferramenta.zip`

#### Estrutura do arquivo

Os arquivos devem ser extensões completamente contidas e possuir todos os requisitos padrão - especificamente, o arquivo `qwen-extension.json` deve estar na raiz do arquivo.

O resto da estrutura deve ser exatamente igual ao de uma extensão típica, veja [extensions.md](extension.md).

#### Exemplo de fluxo de trabalho do GitHub Actions

Aqui está um exemplo de um fluxo de trabalho do GitHub Actions que compila e publica uma extensão Qwen Code para múltiplas plataformas:

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