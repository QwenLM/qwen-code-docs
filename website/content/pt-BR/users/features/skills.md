# Agent Skills

> Crie, gerencie e compartilhe Skills para estender as capacidades do Qwen Code.

Este guia mostra como criar, usar e gerenciar Agent Skills no **Qwen Code**. Skills são capacidades modulares que estendem a eficácia do modelo por meio de pastas organizadas contendo instruções (e, opcionalmente, scripts/recursos).

## Pré-requisitos

- Qwen Code (versão recente)
- Familiaridade básica com o Qwen Code ([Início rápido](../quickstart.md))

## O que são Agent Skills?

Agent Skills empacotam expertise em capacidades descobríveis. Cada Skill consiste em um arquivo `SKILL.md` com instruções que o modelo pode carregar quando relevante, além de arquivos de suporte opcionais, como scripts e templates.

### Como as Skills são invocadas

Skills são **invocadas pelo modelo** — o modelo decide autonomamente quando usá-las com base na sua solicitação e na descrição da Skill. Isso é diferente dos slash commands, que são **invocados pelo usuário** (você digita explicitamente `/comando`).

Se quiser invocar uma Skill explicitamente, use o slash command `/skills`:

```bash
/skills <skill-name>
```

Use o autocomplete para navegar pelas Skills disponíveis e suas descrições.

### Benefícios

- Estenda o Qwen Code para seus fluxos de trabalho
- Compartilhe expertise com sua equipe via git
- Reduza a repetição de prompts
- Combine múltiplas Skills para tarefas complexas

## Criar uma Skill

Skills são armazenadas como diretórios contendo um arquivo `SKILL.md`.

### Skills Pessoais

Skills Pessoais estão disponíveis em todos os seus projetos. Armazene-as em `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Use Skills Pessoais para:

- Seus fluxos de trabalho e preferências individuais
- Skills que você está desenvolvendo
- Auxiliares de produtividade pessoal

### Skills de Projeto

Skills de Projeto são compartilhadas com sua equipe. Armazene-as em `.qwen/skills/` dentro do seu projeto:

```bash
mkdir -p .qwen/skills/my-skill-name
```

Use Skills de Projeto para:

- Fluxos de trabalho e convenções da equipe
- Expertise específica do projeto
- Utilitários e scripts compartilhados

Skills de Projeto podem ser commitadas no git e ficam automaticamente disponíveis para os colegas de equipe.

## Escrever `SKILL.md`

Crie um arquivo `SKILL.md` com frontmatter YAML e conteúdo Markdown:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Requisitos dos campos

O Qwen Code atualmente valida que:

- `name` é uma string não vazia que corresponde a `/^[\p{L}\p{N}_:.-]+$/u` — letras e dígitos Unicode (CJK / cirílico / latim acentuado são aceitos), além de `_`, `:`, `.`, `-`. Espaços em branco, barras, colchetes e outros caracteres estruturalmente inseguros são rejeitados no momento do parse.
- `description` é uma string não vazia

Convenções recomendadas:

- Prefira ASCII em minúsculas com hífens para nomes compartilháveis (ex.: `tsx-helper`)
- Torne `description` específico: inclua tanto **o que** a Skill faz quanto **quando** usá-la (palavras-chave que os usuários mencionarão naturalmente)

### Opcional: restringir uma Skill a caminhos de arquivo (`paths:`)

Para Skills que só são relevantes para partes específicas de uma base de código, adicione uma lista `paths:` com padrões glob. A Skill fica fora da lista de skills disponíveis do modelo até que uma chamada de ferramenta acesse um arquivo correspondente:

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Notas:

- Os globs são correspondidos em relação à raiz do projeto com [picomatch](https://github.com/micromatch/picomatch); arquivos fora da raiz do projeto nunca disparam a ativação.
- Uma Skill restrita por caminho **permanece ativada pelo resto da sessão** assim que um arquivo correspondente é acessado. Uma nova sessão, ou um `refreshCache` acionado pela edição de qualquer arquivo de Skill, redefine as ativações.
- `paths:` restringe apenas a descoberta pelo **modelo**, e apenas no nível de listagem do SkillTool. Você sempre pode invocar uma Skill restrita por caminho manualmente via `/<skill-name>` ou no seletor `/skills` — esse caminho do usuário executa o corpo da Skill independentemente do estado de ativação. No lado do modelo, porém, a restrição permanece até que um arquivo correspondente seja acessado: uma invocação por slash **não** desbloqueia a ativação no lado do modelo, então, se quiser que o modelo encadeie a partir da sua invocação (chame `Skill { skill: ... }` por conta própria), acesse primeiro um arquivo que corresponda ao `paths:` da skill.
- Combinar `paths:` com `disable-model-invocation: true` é permitido, mas a restrição não tem efeito — a Skill fica oculta do modelo de qualquer forma, então a ativação por caminho nunca a anuncia.

## Adicionar arquivos de suporte

Crie arquivos adicionais junto ao `SKILL.md`:

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

Referencie esses arquivos no `SKILL.md`:

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## Visualizar Skills disponíveis

O Qwen Code descobre Skills a partir de:

- Skills Pessoais: `~/.qwen/skills/`
- Skills de Projeto: `.qwen/skills/`
- Skills de Extensão: Skills fornecidas por extensões instaladas

### Skills de Extensão

Extensões podem fornecer skills personalizadas que ficam disponíveis quando a extensão é ativada. Essas skills são armazenadas no diretório `skills/` da extensão e seguem o mesmo formato das skills pessoais e de projeto.

Skills de extensão são descobertas e carregadas automaticamente quando a extensão é instalada e ativada.

Para ver quais extensões fornecem skills, verifique o campo `skills` no arquivo `qwen-extension.json` da extensão.

Para visualizar as Skills disponíveis, pergunte diretamente ao Qwen Code:

```text
What Skills are available?
```

> **Atenção — visão do modelo vs. visão do usuário.** Perguntar ao modelo só exibe as Skills que ele consegue ver no momento. Se uma Skill usar `paths:` (veja "Opcional: restringir uma Skill a caminhos de arquivo" acima), ela fica fora dessa lista até que um arquivo correspondente seja acessado. O conjunto completo está sempre visível para você via slash command `/skills` e no disco.

Ou navegue pela lista completa com o slash command (sempre mostra todas as Skills, incluindo as restritas por caminho que ainda não foram ativadas):

```text
/skills
```

Ou inspecione o sistema de arquivos:

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Testar uma Skill

Após criar uma Skill, teste-a fazendo perguntas que correspondam à sua descrição.

Exemplo: se sua descrição mencionar "PDF files":

```text
Can you help me extract text from this PDF?
```

O modelo decide autonomamente usar sua Skill se ela corresponder à solicitação — você não precisa invocá-la explicitamente.

## Depurar uma Skill

Se o Qwen Code não usar sua Skill, verifique estes problemas comuns:

### Torne a descrição específica

Muito vaga:

```yaml
description: Helps with documents
```

Específica:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Verifique o caminho do arquivo

- Skills Pessoais: `~/.qwen/skills/<skill-name>/SKILL.md`
- Skills de Projeto: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### Verifique a sintaxe YAML

YAML inválido impede que os metadados da Skill sejam carregados corretamente.

```bash
cat SKILL.md | head -n 15
```

Verifique se:

- `---` de abertura na linha 1
- `---` de fechamento antes do conteúdo Markdown
- Sintaxe YAML válida (sem tabs, indentação correta)

### Visualizar erros

Execute o Qwen Code com o modo de debug para ver erros de carregamento de Skills:

```bash
qwen --debug
```

## Compartilhar Skills com sua equipe

Você pode compartilhar Skills por meio de repositórios de projeto:

1. Adicione a Skill em `.qwen/skills/`
2. Faça commit e push
3. Colegas de equipe fazem pull das alterações

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Atualizar uma Skill

Edite `SKILL.md` diretamente:

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

As alterações entram em vigor na próxima vez que você iniciar o Qwen Code. Se o Qwen Code já estiver em execução, reinicie-o para carregar as atualizações.

## Remover uma Skill

Exclua o diretório da Skill:

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Boas práticas

### Mantenha as Skills focadas

Uma Skill deve abordar uma única capacidade:

- Focada: "PDF form filling", "Excel analysis", "Git commit messages"
- Muito ampla: "Document processing" (divida em Skills menores)

### Escreva descrições claras

Ajude o modelo a descobrir quando usar as Skills incluindo gatilhos específicos:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Teste com sua equipe

- A Skill é ativada quando esperado?
- As instruções estão claras?
- Há exemplos ou casos de borda faltando?