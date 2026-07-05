# Agent Skills

> Crie, gerencie e compartilhe Skills para estender as capacidades do Qwen Code.

Este guia mostra como criar, usar e gerenciar Agent Skills no **Qwen Code**. Skills são capacidades modulares que estendem a eficácia do modelo por meio de pastas organizadas contendo instruções (e, opcionalmente, scripts/recursos).

## Pré-requisitos

- Qwen Code (versão recente)
- Familiaridade básica com o Qwen Code ([Quickstart](../quickstart.md))

## O que são Agent Skills?

Agent Skills empacotam conhecimento em capacidades descobríveis. Cada Skill consiste em um arquivo `SKILL.md` com instruções que o modelo pode carregar quando relevante, além de arquivos de suporte opcionais, como scripts e templates.

### Como as Skills são invocadas

As Skills são **invocadas pelo modelo** — o modelo decide autonomamente quando usá-las com base na sua solicitação e na descrição da Skill. Isso é diferente dos slash commands, que são **invocados pelo usuário** (você digita explicitamente `/command`).

Se você quiser invocar uma Skill explicitamente, digite-a como um slash command usando o nome da Skill:

```bash
/<skill-name>
```

Comece a digitar `/` para autocompletar e navegar pelas Skills disponíveis junto com suas descrições. O comando `/skills` abre o painel de Skills, onde você pode navegar, pesquisar, alternar e executar Skills de forma interativa.

> **Nota:** Se você executou anteriormente uma Skill com `/skills <skill-name>`, essa sintaxe agora apenas abre o painel de Skills e ignora o argumento final. Use `/<skill-name>` para executar uma Skill diretamente.

### Benefícios

- Estenda o Qwen Code para seus fluxos de trabalho
- Compartilhe conhecimento com sua equipe via git
- Reduza prompts repetitivos
- Componha múltiplas Skills para tarefas complexas

## Criar uma Skill

As Skills são armazenadas como diretórios contendo um arquivo `SKILL.md`.

### Skills Pessoais

As Skills pessoais estão disponíveis em todos os seus projetos. Armazene-as em `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Use Skills pessoais para:

- Seus fluxos de trabalho e preferências individuais
- Skills que você está desenvolvendo
- Ajudantes de produtividade pessoal

### Skills de Projeto

As Skills de projeto são compartilhadas com sua equipe. Armazene-as em `.qwen/skills/` dentro do seu projeto:

```bash
mkdir -p .qwen/skills/my-skill-name
```

Use Skills de projeto para:

- Fluxos de trabalho e convenções da equipe
- Conhecimento específico do projeto
- Utilitários e scripts compartilhados

As Skills de projeto podem ser adicionadas ao git e ficam automaticamente disponíveis para os colegas de equipe.

## Escrever o SKILL.md

Crie um arquivo `SKILL.md` com frontmatter YAML e conteúdo Markdown:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Requisitos dos campos

O Qwen Code atualmente valida que:

- `name` é uma string não vazia que corresponde a `/^[\p{L}\p{N}_:.-]+$/u` — letras e dígitos Unicode (CJK / cirílico / latim acentuado, tudo OK), além de `_`, `:`, `.`, `-`. Espaços em branco, barras, colchetes e outros caracteres estruturalmente inseguros são rejeitados no momento do parse.
- `description` é uma string não vazia
- `priority` é opcional. Quando presente, deve ser um número finito. Valores mais altos são ordenados primeiro apenas na listagem de `/skills` — o autocompletar de slash commands (digitar `/`) e a visualização de comandos personalizados `/help` permanecem em ordem alfabética, então uma Skill de alta prioridade nunca reordena comandos integrados. Valores omitidos ou inválidos são tratados como não definidos, o que se comporta como `0`.

Convenções recomendadas:

- Prefira ASCII minúsculo com hífens para nomes compartilháveis (por exemplo, `tsx-helper`)
- Torne a `description` específica: inclua tanto **o que** a Skill faz quanto **quando** usá-la (palavras-chave que os usuários mencionarão naturalmente)
- Use `priority` com moderação para Skills que devem aparecer de forma confiável antes da ordem alfabética padrão em `/skills`. Prioridades negativas são permitidas e são ordenadas abaixo de Skills não definidas.

### Opcional: restringir uma Skill a caminhos de arquivo (`paths:`)

Para Skills que são relevantes apenas para partes específicas de uma base de código, adicione uma lista `paths:` de padrões glob. A Skill permanece fora da listagem de Skills disponíveis do modelo até que uma chamada de ferramenta acesse um arquivo correspondente:

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Observações:

- Os globs são correspondidos em relação à raiz do projeto com [picomatch](https://github.com/micromatch/picomatch); arquivos fora da raiz do projeto nunca acionam a ativação.
- Uma Skill restrita por caminho **permanece ativada pelo resto da sessão** assim que um arquivo correspondente é acessado. Uma nova sessão ou um `refreshCache` acionado pela edição de qualquer arquivo de Skill redefine as ativações.
- `paths:` restringe apenas a descoberta pelo **modelo**, e apenas no nível de listagem do SkillTool. A menos que `user-invocable: false` esteja definido, você sempre pode invocar uma Skill restrita por caminho por conta própria via `/<skill-name>` ou o seletor `/skills` — esse caminho do usuário executa o corpo da Skill independentemente do estado de ativação. O lado do modelo, no entanto, permanece restrito até que um arquivo correspondente seja acessado: uma invocação por slash **não** desbloqueia a ativação do lado do modelo, então se você quiser que o modelo encadeie a partir da sua invocação (chamar `Skill { skill: ... }` por conta própria), acesse também um arquivo que corresponda ao `paths:` da Skill primeiro.
- Combinar `paths:` com `disable-model-invocation: true` é permitido, mas a restrição não tem efeito — a Skill fica oculta do modelo de qualquer forma, então a ativação por caminho nunca a divulga.

### Opcional: controlar a invocação pelo usuário e pelo modelo

As Skills são invocáveis pelo usuário por padrão. Para ocultar uma Skill do uso direto por slash command, mantendo-a disponível para invocação pelo modelo, defina `user-invocable: false`:

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

Isso remove a Skill da invocação `/<skill-name>` e dos resultados do seletor `/skills`. Não oculta a Skill do modelo.

Para ocultar uma Skill da invocação pelo modelo, mantendo a invocação direta pelo usuário disponível, defina `disable-model-invocation: true`:

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

Você pode combinar ambos os campos, mas então a Skill não será acessível através dos caminhos normais de invocação pelo usuário ou pelo modelo.

## Adicionar arquivos de suporte

Crie arquivos adicionais junto com o `SKILL.md`:

```text
my-skill/
├── SKILL.md (required)
├── reference.md (optional documentation)
├── examples.md (optional examples)
├── scripts/
│   └── helper.py (optional utility)
└── templates/
    └── template.txt (optional template)
```

Referencie esses arquivos a partir do `SKILL.md`:

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## Visualizar Skills disponíveis

O Qwen Code descobre Skills a partir de:

- Skills pessoais: `~/.qwen/skills/`
- Skills de projeto: `.qwen/skills/`
- Skills de extensão: Skills fornecidas por extensões instaladas

### Skills de Extensão

As extensões podem fornecer Skills personalizadas que ficam disponíveis quando a extensão é habilitada. Essas Skills são armazenadas no diretório `skills/` da extensão e seguem o mesmo formato das Skills pessoais e de projeto.

As Skills de extensão são descobertas e carregadas automaticamente quando a extensão é instalada e habilitada.

Para ver quais extensões fornecem Skills, verifique o arquivo `qwen-extension.json` da extensão para um campo `skills`.

Para visualizar as Skills disponíveis, pergunte diretamente ao Qwen Code:

```text
What Skills are available?
```

> **Atenção — visualização do modelo vs. usuário.** Perguntar ao modelo exibe apenas as Skills que o modelo pode ver atualmente. Se uma Skill usar `paths:` (consulte "Opcional: restringir uma Skill a caminhos de arquivo" acima), ela permanece fora dessa listagem até que um arquivo correspondente seja acessado. O slash command `/skills` mostra as Skills que você pode invocar diretamente; Skills com `user-invocable: false` permanecem visíveis no disco e ainda podem estar visíveis para o modelo.

Ou navegue pela lista invocável pelo usuário com o slash command (incluindo Skills restritas por caminho que ainda não foram ativadas):

```text
/skills
```

Ou inspecione o sistema de arquivos:

```bash
# Listar Skills pessoais
ls ~/.qwen/skills/

# Listar Skills de projeto (se estiver em um diretório de projeto)
ls .qwen/skills/

# Visualizar o conteúdo de uma Skill específica
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Testar uma Skill

Após criar uma Skill, teste-a fazendo perguntas que correspondam à sua descrição.

Exemplo: se a sua descrição mencionar "arquivos PDF":

```text
Can you help me extract text from this PDF?
```

O modelo decide autonomamente usar a sua Skill se ela corresponder à solicitação — você não precisa invocá-la explicitamente.

## Depurar uma Skill

Se o Qwen Code não usar a sua Skill, verifique estes problemas comuns:

### Torne a descrição específica

Muito vaga:

```yaml
description: Helps with documents
```

Específica:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Verificar o caminho do arquivo

- Skills pessoais: `~/.qwen/skills/<skill-name>/SKILL.md`
- Skills de projeto: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Pessoal
ls ~/.qwen/skills/my-skill/SKILL.md

# Projeto
ls .qwen/skills/my-skill/SKILL.md
```

### Verificar a sintaxe YAML

Um YAML inválido impede que os metadados da Skill sejam carregados corretamente.

```bash
cat SKILL.md | head -n 15
```

Certifique-se de que:

- O `---` de abertura esteja na linha 1
- O `---` de fechamento esteja antes do conteúdo Markdown
- A sintaxe YAML seja válida (sem tabs, indentação correta)

### Visualizar erros

Execute o Qwen Code com o modo de depuração para ver erros de carregamento de Skills:

```bash
qwen --debug
```

## Compartilhar Skills com sua equipe

Você pode compartilhar Skills por meio de repositórios de projeto:

1. Adicione a Skill em `.qwen/skills/`
2. Faça commit e push
3. Os colegas de equipe fazem pull das alterações

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Atualizar uma Skill

Edite o `SKILL.md` diretamente:

```bash
# Skill pessoal
code ~/.qwen/skills/my-skill/SKILL.md

# Skill de projeto
code .qwen/skills/my-skill/SKILL.md
```

As alterações entram em vigor na próxima vez que você iniciar o Qwen Code. Se o Qwen Code já estiver em execução, reinicie-o para carregar as atualizações.

## Remover uma Skill

Exclua o diretório da Skill:

```bash
# Pessoal
rm -rf ~/.qwen/skills/my-skill

# Projeto
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Boas práticas

### Mantenha as Skills focadas

Uma Skill deve abordar uma capacidade:

- Focado: "preenchimento de formulários PDF", "análise de Excel", "mensagens de commit do Git"
- Amplo demais: "processamento de documentos" (divida em Skills menores)

### Escreva descrições claras

Ajude o modelo a descobrir quando usar as Skills incluindo gatilhos específicos:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Teste com sua equipe

- A Skill é ativada quando esperado?
- As instruções estão claras?
- Faltam exemplos ou casos limite?