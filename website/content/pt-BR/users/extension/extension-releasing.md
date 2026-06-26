# Lançamento de Extensões

Existem três formas principais de lançar extensões para usuários:

- [Repositório Git](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [Registro npm](#releasing-through-npm-registry)

Lançamentos via repositório Git tendem a ser a abordagem mais simples e flexível, enquanto lançamentos do GitHub podem ser mais eficientes na instalação inicial, pois são enviados como arquivos únicos em vez de exigir um clone do git que baixa cada arquivo individualmente. Lançamentos do GitHub também podem conter arquivos específicos de plataforma, se você precisar enviar arquivos binários específicos da plataforma. Lançamentos via registro npm são ideais para equipes que já usam npm para distribuição de pacotes, especialmente com registros privados.

## Lançamento via repositório Git

Esta é a opção mais flexível e simples. Tudo o que você precisa fazer é criar um repositório git acessível publicamente (como um repositório público no GitHub) e então os usuários podem instalar sua extensão usando `qwen extensions install <seu-repo-uri>`, ou, para um repositório GitHub, eles podem usar o formato simplificado `qwen extensions install <org>/<repo>`. Opcionalmente, eles podem depender de um ref específico (branch/tag/commit) usando o argumento `--ref=<algum-ref>`, que usa como padrão o branch padrão.

Sempre que commits são enviados para o ref do qual um usuário depende, ele será notificado para atualizar a extensão. Observe que isso também permite reversões fáceis; o commit HEAD é sempre tratado como a versão mais recente, independentemente da versão real no arquivo `qwen-extension.json`.

### Gerenciando canais de lançamento usando um repositório Git

Usuários podem depender de qualquer ref do seu repositório git, como um branch ou tag, o que permite gerenciar vários canais de lançamento.

Por exemplo, você pode manter um branch `stable`, que os usuários podem instalar desta forma: `qwen extensions install <seu-repo-uri> --ref=stable`. Ou você pode tornar isso o padrão tratando seu branch padrão como seu branch de lançamento estável e fazendo o desenvolvimento em um branch diferente (por exemplo, chamado `dev`). Você pode manter quantos branches ou tags quiser, oferecendo máxima flexibilidade para você e seus usuários.

Observe que esses argumentos `ref` podem ser tags, branches ou até commits específicos, o que permite que os usuários dependam de uma versão específica da sua extensão. Cabe a você como gerenciar suas tags e branches.

### Exemplo de fluxo de lançamento usando um repositório Git

Embora existam muitas opções de como você pode gerenciar lançamentos usando um fluxo git, recomendamos tratar seu branch padrão como seu branch de lançamento "stable". Isso significa que o comportamento padrão para `qwen extensions install <seu-repo-uri>` é estar no branch de lançamento estável.

Digamos que você queira manter três canais de lançamento padrão: `stable`, `preview` e `dev`. Você faria todo o desenvolvimento padrão no branch `dev`. Quando estiver pronto para fazer um lançamento de prévia, você mescla esse branch no seu branch `preview`. Quando estiver pronto para promover seu branch de prévia para estável, você mescla `preview` no seu branch estável (que pode ser seu branch padrão ou um branch diferente).

Você também pode selecionar cherry picks de alterações de um branch para outro usando `git cherry-pick`, mas note que isso fará com que seus branches tenham um histórico ligeiramente divergente um do outro, a menos que você force push das alterações para seus branches em cada lançamento para restaurar o histórico a um estado limpo (o que pode não ser possível para o branch padrão dependendo das configurações do seu repositório). Se você planeja fazer cherry picks, pode ser melhor evitar que seu branch padrão seja o branch estável para evitar force-push para o branch padrão, o que geralmente deve ser evitado.

## Lançamento via GitHub Releases

Extensões Qwen Code podem ser distribuídas através de [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Isso proporciona uma experiência de instalação inicial mais rápida e confiável para os usuários, pois evita a necessidade de clonar o repositório.

Cada lançamento inclui pelo menos um arquivo de arquivo, que contém o conteúdo completo do repositório na tag à qual estava vinculado. Os lançamentos também podem incluir [arquivos pré-construídos](#custom-pre-built-archives) se sua extensão exigir alguma etapa de build ou tiver binários específicos de plataforma anexados.

Ao verificar atualizações, o Qwen Code procurará apenas o lançamento mais recente no GitHub (você deve marcá-lo como tal ao criar o lançamento), a menos que o usuário tenha instalado um lançamento específico passando `--ref=<alguma-tag-de-lancamento>`. No momento, não oferecemos suporte à adesão a lançamentos de pré-lançamento ou semver.

### Arquivos pré-construídos personalizados

Arquivos personalizados devem ser anexados diretamente ao lançamento do GitHub como assets e devem ser totalmente autocontidos. Isso significa que devem incluir toda a extensão; veja [estrutura do arquivo](#archive-structure).

Se sua extensão é independente de plataforma, você pode fornecer um único asset genérico. Nesse caso, deve haver apenas um asset anexado ao lançamento.

Arquivos personalizados também podem ser usados se você quiser desenvolver sua extensão dentro de um repositório maior; você pode construir um arquivo com uma estrutura diferente do próprio repositório (por exemplo, pode ser apenas um arquivo de um subdiretório contendo a extensão).

#### Arquivos específicos para plataforma

Para garantir que o Qwen Code possa encontrar automaticamente o asset de lançamento correto para cada plataforma, você deve seguir esta convenção de nomenclatura. A CLI buscará assets na seguinte ordem:

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
- `{extension}`: A extensão do arquivo (por exemplo, `.tar.gz` ou `.zip`).

**Exemplos:**

- `darwin.arm64.my-tool.tar.gz` (específico para Macs com Apple Silicon)
- `darwin.my-tool.tar.gz` (para todos os Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Estrutura do arquivo

Os arquivos devem ser extensões totalmente contidas e ter todos os requisitos padrão – especificamente, o arquivo `qwen-extension.json` deve estar na raiz do arquivo.

O restante da estrutura deve ser exatamente igual a uma extensão típica; consulte [introduction.md](./introduction.md).

#### Exemplo de workflow do GitHub Actions

Aqui está um exemplo de um workflow do GitHub Actions que compila e lança uma extensão Qwen Code para múltiplas plataformas:

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

## Lançamento via registro npm

Você pode publicar extensões Qwen Code como pacotes npm com escopo (por exemplo, `@sua-org/minha-extensao`). Isso é uma boa opção quando:

- Sua equipe já usa npm para distribuição de pacotes
- Você precisa de suporte a registro privado com infraestrutura de autenticação existente
- Você deseja que a resolução de versões e o controle de acesso sejam gerenciados pelo npm

### Requisitos do pacote

Seu pacote npm deve incluir um arquivo `qwen-extension.json` na raiz do pacote. Este é o mesmo arquivo de configuração usado por todas as extensões Qwen Code – o tarball npm é simplesmente outro mecanismo de entrega.

Uma estrutura mínima de pacote se parece com:

```
minha-extensao/
├── package.json
├── qwen-extension.json
├── QWEN.md              # arquivo de contexto opcional
├── commands/             # comandos personalizados opcionais
├── skills/               # skills personalizadas opcionais
└── agents/               # subagentes personalizados opcionais
```

Certifique-se de que `qwen-extension.json` esteja incluído no seu pacote publicado (ou seja, não excluído por `.npmignore` ou pelo campo `files` no `package.json`).

### Publicação

Use ferramentas padrão de publicação npm:

```bash
# Publicar no registro padrão
npm publish

# Publicar em um registro privado/personalizado
npm publish --registry https://seu-registro.com
```

### Instalação

Usuários instalam sua extensão usando o nome do pacote com escopo:

```bash
# Instalar a versão mais recente
qwen extensions install @sua-org/minha-extensao

# Instalar uma versão específica
qwen extensions install @sua-org/minha-extensao@1.2.0

# Instalar a partir de um registro personalizado
qwen extensions install @sua-org/minha-extensao --registry https://seu-registro.com
```

### Comportamento de atualização

- Extensões instaladas sem fixação de versão (por exemplo, `@scope/pkg`) acompanham a dist-tag `latest`.
- Extensões instaladas com uma dist-tag (por exemplo, `@scope/pkg@beta`) acompanham essa tag específica.
- Extensões fixadas em uma versão exata (por exemplo, `@scope/pkg@1.2.0`) são sempre consideradas atualizadas e não solicitarão atualizações.

### Autenticação para registros privados

O Qwen Code lê as credenciais de autenticação npm automaticamente:

1. **Variável de ambiente `NPM_TOKEN`** — prioridade mais alta
2. **Arquivo `.npmrc`** — suporta entradas `_authToken` tanto em nível de host quanto com escopo de caminho (por exemplo, `//seu-registro.com/:_authToken=TOKEN` ou `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

Os arquivos `.npmrc` são lidos do diretório atual e do diretório home do usuário.

### Gerenciando canais de lançamento

Você pode usar dist-tags npm para gerenciar canais de lançamento:

```bash
# Publicar um lançamento beta
npm publish --tag beta

# Usuários instalam o canal beta
qwen extensions install @sua-org/minha-extensao@beta
```

Isso funciona de maneira semelhante aos canais de lançamento baseados em branch Git, mas usa o mecanismo nativo de dist-tag do npm.