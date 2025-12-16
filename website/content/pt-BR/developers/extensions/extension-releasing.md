# Lançamento de Extensões

Existem duas formas principais de lançar extensões para os usuários:

- [Repositório Git](#lançando-através-de-um-repositório-git)
- [Releases do GitHub](#lançando-através-do-github-releases)

Os lançamentos através de repositórios Git tendem a ser a abordagem mais simples e flexível, enquanto os lançamentos do GitHub podem ser mais eficientes na instalação inicial, pois são distribuídos como arquivos únicos em vez de exigir um clone do git, que baixa cada arquivo individualmente. Os releases do GitHub também podem conter arquivos específicos para plataformas, caso você precise distribuir binários específicos para determinadas plataformas.

## Lançando através de um repositório git

Esta é a opção mais flexível e simples. Tudo o que você precisa fazer é criar um repositório git publicamente acessível (como um repositório público no GitHub) e então os usuários podem instalar sua extensão usando `qwen extensions install <uri-do-seu-repo>`, ou para um repositório GitHub eles podem usar o formato simplificado `qwen extensions install <organização>/<repositório>`. Eles podem opcionalmente depender de uma referência específica (branch/tag/commit) usando o argumento `--ref=<alguma-ref>`, que por padrão é a branch padrão.

Sempre que commits forem enviados para a referência da qual um usuário depende, ele será solicitado a atualizar a extensão. Note que isso também permite reversões fáceis, o commit HEAD é sempre tratado como a versão mais recente, independentemente da versão real no arquivo `qwen-extension.json`.

### Gerenciando canais de lançamento usando um repositório git

Os usuários podem depender de qualquer referência do seu repositório git, como um branch ou tag, o que permite gerenciar múltiplos canais de lançamento.

Por exemplo, você pode manter um branch `stable`, que os usuários podem instalar desta forma: `qwen extensions install <your-repo-uri> --ref=stable`. Ou, você pode tornar isso o padrão tratando seu branch padrão como seu branch de lançamento estável e fazendo o desenvolvimento em um branch diferente (por exemplo, chamado `dev`). Você pode manter quantos branches ou tags desejar, proporcionando máxima flexibilidade para você e seus usuários.

Note que esses argumentos `ref` podem ser tags, branches ou até mesmo commits específicos, o que permite que os usuários dependam de uma versão específica da sua extensão. Cabe a você decidir como quer gerenciar suas tags e branches.

### Exemplo de fluxo de lançamento usando um repositório git

Embora existam muitas opções para como você deseja gerenciar lançamentos usando um fluxo git, recomendamos tratar sua branch padrão como sua branch de lançamento "estável". Isso significa que o comportamento padrão para `qwen extensions install <your-repo-uri>` é estar na branch de lançamento estável.

Digamos que você queira manter três canais de lançamento padrão: `stable`, `preview` e `dev`. Você faria todo o seu desenvolvimento padrão na branch `dev`. Quando estiver pronto para fazer um lançamento de prévia, você mescla essa branch em sua branch `preview`. Quando estiver pronto para promover sua branch de prévia para estável, você mescla `preview` em sua branch estável (que pode ser sua branch padrão ou uma branch diferente).

Você também pode selecionar alterações de uma branch para outra usando `git cherry-pick`, mas observe que isso resultará em suas branches tendo um histórico ligeiramente divergente umas das outras, a menos que você force o push das alterações para suas branches em cada lançamento para restaurar o histórico a um estado limpo (o que pode não ser possível para a branch padrão dependendo das configurações do seu repositório). Se você planeja fazer cherry picks, pode ser melhor evitar ter sua branch padrão como a branch estável para evitar force-push para a branch padrão, o que geralmente deve ser evitado.

## Lançando através de releases do GitHub

As extensões do Qwen Code podem ser distribuídas através de [Releases do GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Isso proporciona uma experiência inicial de instalação mais rápida e confiável para os usuários, pois evita a necessidade de clonar o repositório.

Cada release inclui pelo menos um arquivo de arquivamento, que contém todo o conteúdo do repositório na tag à qual foi vinculado. Os releases também podem incluir [arquivos pré-construídos](#custom-pre-built-archives) se sua extensão exigir alguma etapa de construção ou tiver binários específicos de plataforma anexados.

Ao verificar atualizações, o qwen code apenas procurará pela última release no github (você deve marcá-la como tal ao criar a release), a menos que o usuário tenha instalado uma release específica passando `--ref=<alguma-tag-de-release>`. Atualmente, não oferecemos suporte para optar por releases de pré-lançamento ou semver.

### Arquivos pré-construídos personalizados

Arquivos personalizados devem ser anexados diretamente ao release do GitHub como assets e devem ser completamente auto-contidos. Isso significa que eles devem incluir toda a extensão, veja [estrutura do arquivo](#archive-structure).

Se sua extensão é independente de plataforma, você pode fornecer um único asset genérico. Neste caso, deve haver apenas um asset anexado ao release.

Arquivos personalizados também podem ser usados se você quiser desenvolver sua extensão dentro de um repositório maior, você pode construir um arquivo que tenha um layout diferente do próprio repositório (por exemplo, pode ser apenas um arquivo de um subdiretório contendo a extensão).

#### Arquivos específicos por plataforma

Para garantir que o Qwen Code possa encontrar automaticamente o asset correto para cada plataforma, você deve seguir esta convenção de nomenclatura. A CLI irá procurar os assets na seguinte ordem:

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
- `{extension}`: A extensão do arquivo (ex.: `.tar.gz` ou `.zip`).

**Exemplos:**

- `darwin.arm64.my-tool.tar.gz` (específico para Macs com Apple Silicon)
- `darwin.my-tool.tar.gz` (para todos os Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Estrutura do arquivo

Os arquivos devem ser extensões totalmente contidas e ter todos os requisitos padrão - especificamente o arquivo `qwen-extension.json` deve estar na raiz do arquivo.

O resto do layout deve ser exatamente igual ao de uma extensão típica, veja [extensions.md](extension.md).

#### Exemplo de workflow do GitHub Actions

Aqui está um exemplo de um workflow do GitHub Actions que compila e publica uma extensão do Qwen Code para múltiplas plataformas:

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

      - name: Configurar Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Instalar dependências
        run: npm ci

      - name: Compilar extensão
        run: npm run build

      - name: Criar assets da release
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Criar Release no GitHub
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```