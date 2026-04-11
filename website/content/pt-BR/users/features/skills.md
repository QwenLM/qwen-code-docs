# Agent Skills

> Crie, gerencie e compartilhe Skills para estender as capacidades do Qwen Code.

Este guia mostra como criar, usar e gerenciar Agent Skills no **Qwen Code**. Skills são capacidades modulares que estendem a eficácia do modelo por meio de pastas organizadas contendo instruções (e, opcionalmente, scripts/recursos).

## Pré-requisitos

- Qwen Code (versão recente)
- Familiaridade básica com o Qwen Code ([Quickstart](../quickstart.md))

## O que são Agent Skills?

Agent Skills empacotam expertise em capacidades descobríveis. Cada Skill consiste em um arquivo `SKILL.md` com instruções que o modelo pode carregar quando relevante, além de arquivos de suporte opcionais, como scripts e templates.

### Como as Skills são invocadas

Skills são **invocadas pelo modelo** — o modelo decide autonomamente quando usá-las com base na sua solicitação e na descrição da Skill. Isso é diferente dos slash commands, que são **invocados pelo usuário** (você digita explicitamente `/command`).

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

Skills de Projeto podem ser commitadas no git e ficam automaticamente disponíveis para os membros da equipe.

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

- `name` é uma string não vazia
- `description` é uma string não vazia

Convenções recomendadas (ainda não aplicadas rigorosamente):

- Use letras minúsculas, números e hífens em `name`
- Torne `description` específico: inclua tanto **o que** a Skill faz quanto **quando** usá-la (palavras-chave que os usuários mencionarão naturalmente)

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

Muito vago:

```yaml
description: Helps with documents
```

Específico:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Verificar o caminho do arquivo

- Skills Pessoais: `~/.qwen/skills/<skill-name>/SKILL.md`
- Skills de Projeto: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### Verificar a sintaxe YAML

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
3. Os membros da equipe fazem pull das alterações

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Atualizar uma Skill

Edite o `SKILL.md` diretamente:

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

- Focado: "PDF form filling", "Excel analysis", "Git commit messages"
- Muito amplo: "Document processing" (divida em Skills menores)

### Escreva descrições claras

Ajude o modelo a descobrir quando usar as Skills incluindo gatilhos específicos:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Teste com sua equipe

- A Skill é ativada quando esperado?
- As instruções estão claras?
- Há exemplos ou casos de borda faltando?