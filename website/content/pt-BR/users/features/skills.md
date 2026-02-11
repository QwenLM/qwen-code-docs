# Habilidades de Agente

> Crie, gerencie e compartilhe Habilidades para estender as capacidades do Qwen Code.

Este guia mostra como criar, usar e gerenciar Habilidades de Agente no **Qwen Code**. As habilidades são capacidades modulares que estendem a eficácia do modelo por meio de pastas organizadas contendo instruções (e opcionalmente scripts/recursos).

## Pré-requisitos

- Qwen Code (versão recente)
- Familiaridade básica com o Qwen Code ([Início Rápido](../quickstart.md))

## O que são Habilidades de Agente?

As Habilidades de Agente empacotam especializações em capacidades descobríveis. Cada habilidade consiste em um arquivo `SKILL.md` com instruções que o modelo pode carregar quando relevante, além de arquivos opcionais de suporte, como scripts e modelos.

### Como as Habilidades são invocadas

As habilidades são **invocadas pelo modelo** — o modelo decide autonomamente quando usá-las com base em sua solicitação e na descrição da habilidade. Isso é diferente dos comandos de barra, que são **invocados pelo usuário** (você digita explicitamente `/comando`).

Se quiser invocar uma habilidade explicitamente, utilize o comando de barra `/skills`:

```bash
/skills <nome-da-habilidade>
```

Utilize o preenchimento automático para navegar pelas habilidades disponíveis e suas descrições.

### Benefícios

- Estenda o Qwen Code para seus fluxos de trabalho
- Compartilhe conhecimento especializado entre sua equipe via git
- Reduza prompts repetitivos
- Combine múltiplas habilidades para tarefas complexas

## Criar uma Habilidade

As habilidades são armazenadas como diretórios contendo um arquivo `SKILL.md`.

### Habilidades Pessoais

Habilidades pessoais estão disponíveis em todos os seus projetos. Armazene-as em `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/nome-da-minha-habilidade
```

Use habilidades pessoais para:

- Seus fluxos de trabalho e preferências individuais
- Habilidades que você está desenvolvendo
- Ajudantes de produtividade pessoal

### Habilidades do Projeto

As Habilidades do Projeto são compartilhadas com sua equipe. Armazene-as em `.qwen/skills/` dentro do seu projeto:

```bash
mkdir -p .qwen/skills/nome-da-minha-habilidade
```

Use Habilidades do Projeto para:

- Fluxos de trabalho e convenções da equipe
- Especialização específica do projeto
- Utilitários e scripts compartilhados

As Habilidades do Projeto podem ser adicionadas ao git e automaticamente ficar disponíveis para os colegas de equipe.

## Escreva `SKILL.md`

Crie um arquivo `SKILL.md` com frontmatter YAML e conteúdo Markdown:

```yaml
---
name: nome-da-sua-habilidade
description: Breve descrição do que esta Habilidade faz e quando usá-la
---

# Nome da Sua Habilidade

## Instruções
Forneça orientações claras, passo a passo, para o Qwen Code.

## Exemplos
Mostre exemplos concretos de uso desta Habilidade.
```

### Requisitos de campo

O Qwen Code atualmente valida que:

- `name` é uma string não vazia
- `description` é uma string não vazia

Convenções recomendadas (ainda não aplicadas rigorosamente):

- Use letras minúsculas, números e hífens em `name`
- Torne `description` específica: inclua tanto **o que** o Skill faz quanto **quando** usá-lo (palavras-chave que os usuários mencionarão naturalmente)

## Adicionar arquivos de suporte

Crie arquivos adicionais ao lado de `SKILL.md`:

```text
my-skill/
├── SKILL.md (obrigatório)
├── reference.md (documentação opcional)
├── examples.md (exemplos opcionais)
├── scripts/
│   └── helper.py (utilitário opcional)
└── templates/
    └── template.txt (modelo opcional)
```

Referencie esses arquivos a partir de `SKILL.md`:

````markdown
Para uso avançado, consulte [reference.md](reference.md).

Execute o script auxiliar:

```bash
python scripts/helper.py input.txt
```
````

## Visualizar Skills disponíveis

O Qwen Code descobre Skills a partir de:

- Skills pessoais: `~/.qwen/skills/`
- Skills de projeto: `.qwen/skills/`
- Skills de extensão: Skills fornecidas por extensões instaladas

### Skills de extensão

Extensões podem fornecer skills personalizadas que ficam disponíveis quando a extensão é ativada. Essas skills são armazenadas no diretório `skills/` da extensão e seguem o mesmo formato das skills pessoais e de projeto.

As skills de extensão são automaticamente descobertas e carregadas quando a extensão é instalada e ativada.

Para ver quais extensões fornecem skills, verifique o arquivo `qwen-extension.json` da extensão em busca de um campo `skills`.

Para visualizar as Skills disponíveis, pergunte diretamente ao Qwen Code:

```text
Quais Skills estão disponíveis?
```

Ou inspecione o sistema de arquivos:

```bash

# Listar Skills pessoais
ls ~/.qwen/skills/

# Listar Skills de projeto (se estiver em um diretório de projeto)
ls .qwen/skills/

# Visualizar o conteúdo de uma Skill específica
cat ~/.qwen/skills/minha-skill/SKILL.md
```

## Testar uma Skill

Após criar uma Skill, teste-a fazendo perguntas que correspondam à sua descrição.

Exemplo: se sua descrição menciona "arquivos PDF":

```text
Você pode me ajudar a extrair texto deste PDF?
```

O modelo decide autonomamente usar sua Skill se ela corresponder à solicitação — você não precisa invocá-la explicitamente.

## Depurar uma Skill

Se o Qwen Code não estiver usando sua Skill, verifique esses problemas comuns:

### Torne a descrição específica

Muito vaga:

```yaml
description: Ajuda com documentos
```

Específica:

```yaml
description: Extrai texto e tabelas de arquivos PDF, preenche formulários, mescla documentos. Use ao trabalhar com PDFs, formulários ou extração de documentos.
```

### Verifique o caminho do arquivo

- Skills Pessoais: `~/.qwen/skills/<nome-da-skill>/SKILL.md`
- Skills de Projeto: `.qwen/skills/<nome-da-skill>/SKILL.md`

```bash

# Pessoal
ls ~/.qwen/skills/minha-skill/SKILL.md

# Projeto
ls .qwen/skills/minha-skill/SKILL.md
```

### Verificar sintaxe YAML

YAML inválido impede que os metadados da Skill sejam carregados corretamente.

```bash
cat SKILL.md | head -n 15
```

Certifique-se de que:

- Haja `---` na linha 1
- Haja `---` antes do conteúdo Markdown
- A sintaxe YAML seja válida (sem tabs, indentação correta)

### Visualizar erros

Execute o Qwen Code em modo debug para ver os erros de carregamento da Skill:

```bash
qwen --debug
```

## Compartilhar Skills com sua equipe

Você pode compartilhar Skills através de repositórios de projeto:

1. Adicione a Skill em `.qwen/skills/`
2. Faça commit e push
3. Os colegas de equipe fazem pull das alterações

```bash
git add .qwen/skills/
git commit -m "Adiciona Skill da equipe para processamento de PDF"
git push
```

## Atualizar uma Skill

Edite o arquivo `SKILL.md` diretamente:

```bash

# Skill pessoal
code ~/.qwen/skills/minha-skill/SKILL.md

# Skill do projeto
code .qwen/skills/minha-skill/SKILL.md
```

As alterações entram em vigor na próxima vez que você iniciar o Qwen Code. Se o Qwen Code já estiver em execução, reinicie-o para carregar as atualizações.

## Remover uma Skill

Exclua o diretório da Skill:

```bash
```

# Pessoal
rm -rf ~/.qwen/skills/my-skill

# Projeto
rm -rf .qwen/skills/my-skill
git commit -m "Remover Skill não utilizada"
```

## Melhores práticas

### Mantenha as Skills focadas

Uma Skill deve abordar uma única capacidade:

- Focada: "preenchimento de formulários PDF", "análise de Excel", "mensagens de commit Git"
- Muito ampla: "processamento de documentos" (divida em Skills menores)

### Escreva descrições claras

Ajude o modelo a descobrir quando usar as Skills incluindo gatilhos específicos:

```yaml
description: Analisa planilhas Excel, cria tabelas dinâmicas e gera gráficos. Use ao trabalhar com arquivos Excel, planilhas ou dados .xlsx.
```

### Teste com sua equipe

- A Skill ativa quando esperado?
- As instruções estão claras?
- Existem exemplos faltando ou casos extremos?