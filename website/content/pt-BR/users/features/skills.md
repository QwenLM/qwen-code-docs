# Habilidades do Agente

> Crie, gerencie e compartilhe Habilidades para estender as capacidades do Qwen Code.

Este guia mostra como criar, usar e gerenciar Habilidades de Agente no **Qwen Code**. Habilidades são capacidades modulares que ampliam a eficácia do modelo por meio de pastas organizadas contendo instruções (e, opcionalmente, scripts ou recursos).

## Pré-requisitos

- Qwen Code (versão recente)
- Familiaridade básica com o Qwen Code ([Início Rápido](../quickstart.md))

## O que são Habilidades de Agente?

Habilidades de Agente empacotam conhecimento especializado em capacidades descobríveis. Cada Habilidade consiste em um arquivo `SKILL.md` com instruções que o modelo pode carregar quando relevante, além de arquivos de suporte opcionais, como scripts e modelos.

### Como as Skills são invocadas

As Skills são **invocadas pelo modelo** — o modelo decide autonomamente quando usá-las com base na sua solicitação e na descrição da Skill. Isso difere dos comandos com barra (`slash commands`), que são **invocados pelo usuário** (você digita explicitamente `/comando`).

Se quiser invocar uma Skill de forma explícita, use o comando com barra `/skills`:

```bash
/skills <nome-da-skill>
```

Use a conclusão automática para navegar pelas Skills disponíveis e suas descrições.

### Benefícios

- Estenda o Qwen Code para seus fluxos de trabalho
- Compartilhe conhecimento especializado com sua equipe por meio do Git
- Reduza a necessidade de repetir instruções em prompts
- Combine múltiplas Skills para executar tarefas complexas

## Crie uma Skill

As Skills são armazenadas como diretórios contendo um arquivo `SKILL.md`.

### Skills pessoais

As Skills pessoais estão disponíveis em todos os seus projetos. Armazene-as em `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

Use Skills pessoais para:

- Seus fluxos de trabalho e preferências individuais
- Skills que você está desenvolvendo
- Ajudantes pessoais de produtividade

### Habilidades do Projeto

As habilidades do projeto são compartilhadas com sua equipe. Armazene-as no diretório `.qwen/skills/` dentro do seu projeto:

```bash
mkdir -p .qwen/skills/my-skill-name
```

Use as habilidades do projeto para:

- Fluxos de trabalho e convenções da equipe
- Conhecimento especializado específico do projeto
- Utilitários e scripts compartilhados

As habilidades do projeto podem ser versionadas no Git e ficam automaticamente disponíveis para os colegas de equipe.

## Escreva `SKILL.md`

Crie um arquivo `SKILL.md` com frontmatter YAML e conteúdo em Markdown:

```yaml
---
name: your-skill-name
description: Breve descrição do que essa habilidade faz e quando usá-la
---

# Seu Nome de Habilidade

## Instruções
Forneça orientações claras e passo a passo para o Qwen Code.

## Exemplos
Mostre exemplos concretos de uso dessa habilidade.
```

### Requisitos dos campos

Atualmente, o Qwen Code valida que:

- `name` seja uma string não vazia
- `description` seja uma string não vazia

Convenções recomendadas (ainda não aplicadas de forma estrita):

- Use letras minúsculas, números e hífens em `name`
- Torne `description` específica: inclua tanto **o que** a Skill faz quanto **quando** usá-la (palavras-chave que os usuários naturalmente mencionarão)

## Adicionar arquivos auxiliares

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

Faça referência a esses arquivos em `SKILL.md`:

````markdown
Para uso avançado, consulte [reference.md](reference.md).

Execute o script auxiliar:

```bash
python scripts/helper.py input.txt
```
````

## Visualizar as Skills disponíveis

O Qwen Code descobre Skills a partir de:

- Skills pessoais: `~/.qwen/skills/`
- Skills de projeto: `.qwen/skills/`
- Skills de extensões: Skills fornecidas por extensões instaladas

### Skills de extensões

Extensões podem fornecer skills personalizadas que ficam disponíveis quando a extensão está habilitada. Essas skills são armazenadas no diretório `skills/` da extensão e seguem o mesmo formato das skills pessoais e de projeto.

As skills de extensões são automaticamente descobertas e carregadas quando a extensão é instalada e habilitada.

Para ver quais extensões fornecem skills, verifique o arquivo `qwen-extension.json` da extensão em busca do campo `skills`.

Para visualizar as Skills disponíveis, pergunte diretamente ao Qwen Code:

```text
Quais Skills estão disponíveis?
```

Ou inspecione o sistema de arquivos:

```bash

# Listar as Skills pessoais
ls ~/.qwen/skills/

# Listar as Skills de projeto (se estiver em um diretório de projeto)
ls .qwen/skills/

# Visualizar o conteúdo de uma Skill específica
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Testar uma Skill

Após criar uma Skill, teste-a fazendo perguntas que correspondam à sua descrição.

Exemplo: se sua descrição mencionar “arquivos PDF”:

```text
Você pode me ajudar a extrair texto deste PDF?
```

O modelo decide autonomamente usar sua Skill caso ela corresponda à solicitação — você não precisa invocá-la explicitamente.

## Depurar uma Skill

Se o Qwen Code não estiver usando sua Skill, verifique estes problemas comuns:

### Torne a descrição específica

Muito vaga:

```yaml
description: Ajuda com documentos
```

Específica:

```yaml
description: Extrai texto e tabelas de arquivos PDF, preenche formulários e mescla documentos. Use ao trabalhar com PDFs, formulários ou extração de documentos.
```

### Verifique o caminho do arquivo

- Skills pessoais: `~/.qwen/skills/<nome-da-skill>/SKILL.md`
- Skills de projeto: `.qwen/skills/<nome-da-skill>/SKILL.md`

```bash

# Pessoal
ls ~/.qwen/skills/my-skill/SKILL.md

# Projeto
ls .qwen/skills/my-skill/SKILL.md
```

### Verificar a sintaxe YAML

YAML inválido impede o carregamento correto dos metadados da Skill.

```bash
cat SKILL.md | head -n 15
```

Certifique-se de que:

- A linha 1 contenha `---` de abertura
- Haja `---` de fechamento antes do conteúdo em Markdown
- A sintaxe YAML seja válida (sem tabulações, com indentação correta)

### Visualizar erros

Execute o Qwen Code no modo de depuração para ver os erros de carregamento das Skills:

```bash
qwen --debug
```

## Compartilhar Skills com sua equipe

Você pode compartilhar Skills por meio de repositórios de projeto:

1. Adicione a Skill em `.qwen/skills/`
2. Faça commit e envie as alterações
3. Seus colegas de equipe puxam as alterações

```bash
git add .qwen/skills/
git commit -m "Adicionar Skill da equipe para processamento de PDF"
git push
```

## Atualizar uma Skill

Edite diretamente o arquivo `SKILL.md`:

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
git commit -m "Remover Skill não utilizada"
```

## Melhores práticas

### Mantenha as Skills focadas

Uma Skill deve abordar uma única capacidade:

- Focada: “Preenchimento de formulários PDF”, “Análise de Excel”, “Mensagens de commit Git”
- Excessivamente ampla: “Processamento de documentos” (divida em Skills menores)

### Escreva descrições claras

Ajude o modelo a identificar quando usar as Skills incluindo gatilhos específicos:

```yaml
description: Analisar planilhas Excel, criar tabelas dinâmicas e gerar gráficos. Use ao trabalhar com arquivos Excel, planilhas ou dados no formato .xlsx.
```

### Teste com sua equipe

- A Skill é ativada quando esperado?
- As instruções são claras?
- Há exemplos ausentes ou casos de uso específicos não contemplados?