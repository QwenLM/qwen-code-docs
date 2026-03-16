# Lançamento de Extensões

Há duas maneiras principais de disponibilizar extensões para os usuários:

- [Repositório Git](#lançamento-por-meio-de-um-repositório-git)
- [Lançamentos no GitHub](#lançamento-por-meio-de-lançamentos-no-github)

Os lançamentos por meio de um repositório Git costumam ser a abordagem mais simples e flexível, enquanto os lançamentos no GitHub podem ser mais eficientes na instalação inicial, pois são distribuídos como arquivos compactados únicos, em vez de exigirem um `git clone`, que baixa cada arquivo individualmente. Os lançamentos no GitHub também podem conter arquivos compactados específicos para determinadas plataformas, caso você precise distribuir binários específicos para cada plataforma.

## Lançamento por meio de um repositório Git

Essa é a opção mais flexível e simples. Tudo o que você precisa fazer é criar um repositório Git acessível publicamente (por exemplo, um repositório público no GitHub) e, em seguida, os usuários poderão instalar sua extensão usando `qwen extensions install <seu-uri-do-repo>` ou, para um repositório GitHub, usar o formato simplificado `qwen extensions install <org>/<repo>`. Opcionalmente, eles podem depender de uma referência específica (branch, tag ou commit) usando o argumento `--ref=<alguma-ref>`, cujo valor padrão é a branch padrão.

Sempre que commits forem enviados para a referência da qual um usuário depende, ele será solicitado a atualizar a extensão. Observe que isso também permite reversões fáceis: o commit HEAD é sempre tratado como a versão mais recente, independentemente da versão real especificada no arquivo `qwen-extension.json`.

### Gerenciando canais de lançamento usando um repositório Git

Os usuários podem depender de qualquer referência (ref) do seu repositório Git, como uma branch ou tag, o que permite gerenciar múltiplos canais de lançamento.

Por exemplo, você pode manter uma branch `stable`, que os usuários podem instalar assim: `qwen extensions install <seu-uri-do-repositorio> --ref=stable`. Alternativamente, você pode tornar isso o padrão ao tratar sua branch principal como a branch de lançamento estável e realizar o desenvolvimento em uma branch diferente (por exemplo, chamada `dev`). Você pode manter quantas branches ou tags desejar, oferecendo máxima flexibilidade para você e seus usuários.

Observe que esses argumentos `ref` podem ser tags, branches ou até commits específicos, o que permite que os usuários dependam de uma versão específica da sua extensão. Cabe a você decidir como deseja gerenciar suas tags e branches.

### Exemplo de fluxo de lançamento usando um repositório Git

Embora existam muitas opções para gerenciar lançamentos usando um fluxo Git, recomendamos tratar seu branch padrão como o branch de lançamento “estável”. Isso significa que o comportamento padrão de `qwen extensions install <seu-repo-uri>` será usar o branch de lançamento estável.

Suponha que você deseje manter três canais de lançamento padrão: `stable`, `preview` e `dev`. Você fará todo o desenvolvimento padrão no branch `dev`. Quando estiver pronto para fazer um lançamento de pré-visualização (*preview*), faça o *merge* desse branch no branch `preview`. Quando estiver pronto para promover o branch `preview` para estável, faça o *merge* de `preview` no branch estável (que pode ser seu branch padrão ou um branch diferente).

Você também pode selecionar alterações específicas de um branch para outro usando `git cherry-pick`, mas observe que isso fará com que os históricos dos seus branches fiquem ligeiramente divergentes entre si, a menos que você force o *push* das alterações para os branches em cada lançamento, restaurando assim um histórico limpo (o que pode não ser possível para o branch padrão, dependendo das configurações do seu repositório). Se você planeja usar *cherry picks*, talvez seja melhor evitar que o branch padrão seja o branch estável, para não precisar fazer *force push* no branch padrão — prática que, em geral, deve ser evitada.

## Lançamento por meio de versões do GitHub

As extensões do Qwen Code podem ser distribuídas por meio das [Versões do GitHub](https://docs.github.com/pt/repositories/liberando-projetos-no-github/sobre-versoes). Isso oferece uma experiência inicial de instalação mais rápida e confiável para os usuários, evitando a necessidade de clonar o repositório.

Cada versão inclui pelo menos um arquivo compactado, que contém todo o conteúdo do repositório na tag à qual foi vinculada. As versões também podem incluir [arquivos compactados pré-construídos](#arquivos-compactados-pre-construidos-personalizados), caso sua extensão exija alguma etapa de compilação ou tenha binários específicos para determinadas plataformas anexados a ela.

Ao verificar atualizações, o Qwen Code simplesmente procura a versão mais recente no GitHub (você deve marcá-la como tal ao criar a versão), exceto se o usuário tiver instalado uma versão específica passando `--ref=<alguma-tag-de-versao>`. Atualmente, não há suporte para optar por versões pré-lançamento (pre-release) ou para semver.

### Arquivos pré-construídos personalizados

Arquivos personalizados devem ser anexados diretamente à versão do GitHub como ativos e devem ser totalmente autônomos. Isso significa que eles devem incluir toda a extensão; consulte a [estrutura do arquivo](#archive-structure).

Se sua extensão for independente de plataforma, você pode fornecer um único ativo genérico. Nesse caso, deve haver apenas um ativo anexado à versão.

Arquivos personalizados também podem ser usados se você deseja desenvolver sua extensão dentro de um repositório maior; nesse caso, você pode criar um arquivo com uma estrutura diferente da do próprio repositório (por exemplo, pode ser apenas um arquivo de um subdiretório que contém a extensão).

#### Arquivos específicos da plataforma

Para garantir que o Qwen Code consiga localizar automaticamente o ativo de versão correto para cada plataforma, você deve seguir esta convenção de nomenclatura. A CLI procurará os ativos na seguinte ordem:

1.  **Específico para plataforma e arquitetura:** `{plataforma}.{arquitetura}.{nome}.{extensão}`
2.  **Específico para plataforma:** `{plataforma}.{nome}.{extensão}`
3.  **Genérico:** Se apenas um ativo for fornecido, ele será usado como alternativa genérica.

- `{nome}`: O nome da sua extensão.
- `{plataforma}`: O sistema operacional. Os valores suportados são:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arquitetura}`: A arquitetura. Os valores suportados são:
  - `x64`
  - `arm64`
- `{extensão}`: A extensão do arquivo compactado (por exemplo, `.tar.gz` ou `.zip`).

**Exemplos:**

- `darwin.arm64.minha-ferramenta.tar.gz` (específico para Macs com Apple Silicon)
- `darwin.minha-ferramenta.tar.gz` (para todos os Macs)
- `linux.x64.minha-ferramenta.tar.gz`
- `win32.minha-ferramenta.zip`

#### Estrutura do arquivo

Os arquivos devem conter extensões completas e atender a todos os requisitos padrão — especificamente, o arquivo `qwen-extension.json` deve estar na raiz do arquivo.

O restante da estrutura deve ser idêntico ao de uma extensão típica; consulte [extensions.md](extension.md).

#### Exemplo de fluxo de trabalho do GitHub Actions

Abaixo está um exemplo de um fluxo de trabalho do GitHub Actions que compila e publica uma extensão do Qwen Code para múltiplas plataformas:

```yaml
name: Publicar Extensão

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configurar Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Instalar dependências
        run: npm ci

      - name: Compilar extensão
        run: npm run build

      - name: Criar ativos da versão
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Criar versão no GitHub
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```