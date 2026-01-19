# Habilidades de Agente (Experimental)

> Crie, gerencie e compartilhe Habilidades para estender as capacidades do Qwen Code.

Este guia mostra como criar, usar e gerenciar Habilidades de Agente no **Qwen Code**. As habilidades são capacidades modulares que estendem a eficácia do modelo por meio de pastas organizadas contendo instruções (e opcionalmente scripts/recursos).

> [!note]
>
> As habilidades estão atualmente em **fase experimental** e devem ser ativadas com `--experimental-skills`.

## Pré-requisitos

- Qwen Code (versão recente)

## Como ativar

### Via flag de CLI

```bash
qwen --experimental-skills
```

### Via settings.json

Adicione ao seu `~/.qwen/settings.json` ou ao `.qwen/settings.json` do projeto:

```json
{
  "tools": {
    "experimental": {
      "skills": true
    }
  }
}
```

- Familiaridade básica com Qwen Code ([Início Rápido](../quickstart.md))

## O que são Habilidades de Agente?

As Habilidades de Agente empacotam especializações em capacidades descobríveis. Cada Habilidade consiste em um arquivo `SKILL.md` com instruções que o modelo pode carregar quando relevante, além de arquivos opcionais de suporte, como scripts e modelos.

### Como as Habilidades são invocadas

As Habilidades são **invocadas pelo modelo** — o modelo decide autonomamente quando usá-las com base na sua solicitação e na descrição da Habilidade. Isso difere dos comandos com barra ("/"), que são **invocados pelo usuário** (você digita explicitamente `/comando`).

Se quiser invocar uma Habilidade explicitamente, utilize o comando com barra `/skills`:

```bash
/skills <nome-da-habilidade>
```

O comando `/skills` só está disponível quando você executa com `--experimental-skills`. Utilize o preenchimento automático para navegar pelas Habilidades e descrições disponíveis.

### Benefícios

- Estenda o Qwen Code para seus fluxos de trabalho
- Compartilhe especializações entre sua equipe via git
- Reduza prompts repetitivos
- Combine múltiplas Habilidades para tarefas complexas

## Criar uma Skill

As skills são armazenadas como diretórios contendo um arquivo `SKILL.md`.

### Skills Pessoais

Skills pessoais estão disponíveis em todos os seus projetos. Armazene-as em `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/nome-da-minha-skill
```

Use skills pessoais para:

- Seus fluxos de trabalho e preferências individuais
- Skills experimentais que você está desenvolvendo
- Ajudantes pessoais de produtividade

### Skills de Projeto

Skills de projeto são compartilhadas com sua equipe. Armazene-as em `.qwen/skills/` dentro do seu projeto:

```bash
mkdir -p .qwen/skills/nome-da-minha-skill
```

Use skills de projeto para:

- Fluxos de trabalho e convenções da equipe
- Especialização específica do projeto
- Utilitários e scripts compartilhados

Skills de projeto podem ser adicionadas ao git e automaticamente ficam disponíveis para colegas de equipe.

## Escrever `SKILL.md`

Crie um arquivo `SKILL.md` com frontmatter YAML e conteúdo Markdown:

```yaml
---
name: nome-da-sua-skill
description: Breve descrição do que esta Skill faz e quando usá-la
---

# Nome da Sua Skill

## Instruções
Forneça orientações claras e passo a passo para o Qwen Code.

## Exemplos
Mostre exemplos concretos de uso desta Skill.
```

### Requisitos dos campos

O Qwen Code atualmente valida que:

- `name` é uma string não vazia
- `description` é uma string não vazia

Convenções recomendadas (ainda não aplicadas rigorosamente):

- Use letras minúsculas, números e hífens em `name`
- Torne `description` específica: inclua tanto **o que** a Skill faz quanto **quando** usá-la (palavras-chave que os usuários mencionarão naturalmente)

## Adicionar arquivos de suporte

Crie arquivos adicionais ao lado de `SKILL.md`:

```text
minha-skill/
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

Quando `--experimental-skills` está habilitado, o Qwen Code descobre Skills em:

- Skills pessoais: `~/.qwen/skills/`
- Skills do projeto: `.qwen/skills/`

Para visualizar as Skills disponíveis, pergunte diretamente ao Qwen Code:

```text
Quais Skills estão disponíveis?
```

Ou inspecione o sistema de arquivos:

```bash

# Listar Skills pessoais
ls ~/.qwen/skills/

# Listar Skills do projeto (se estiver em um diretório de projeto)
ls .qwen/skills/

# Visualizar o conteúdo de uma Skill específica
cat ~/.qwen/skills/minha-skill/SKILL.md
```

## Testar uma Skill

Após criar uma Skill, teste-a fazendo perguntas que correspondam à sua descrição.

Exemplo: se sua descrição mencionar "arquivos PDF":

```text
Você pode me ajudar a extrair texto deste PDF?
```

O modelo decide autonomamente usar sua Skill se ela corresponder à solicitação — você não precisa invocá-la explicitamente.

## Depurar uma Skill

Se o Qwen Code não usar sua Skill, verifique esses problemas comuns:

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

- Habilidades Pessoais: `~/.qwen/skills/<nome-da-habilidade>/SKILL.md`
- Habilidades de Projeto: `.qwen/skills/<nome-da-habilidade>/SKILL.md`

```bash

# Pessoal
ls ~/.qwen/skills/minha-habilidade/SKILL.md

# Projeto
ls .qwen/skills/minha-habilidade/SKILL.md
```

### Verifique a sintaxe YAML

YAML inválido impede que os metadados da habilidade sejam carregados corretamente.

```bash
cat SKILL.md | head -n 15
```

Certifique-se de que:

- Abertura `---` na linha 1
- Fechamento `---` antes do conteúdo Markdown
- Sintaxe YAML válida (sem tabulações, indentação correta)

### Visualizar erros

Execute o Qwen Code em modo debug para ver os erros de carregamento da habilidade:

```bash
qwen --experimental-skills --debug
```

## Compartilhe Skills com sua equipe

Você pode compartilhar Skills através de repositórios de projeto:

1. Adicione a Skill em `.qwen/skills/`
2. Faça commit e push
3. Colegas de equipe fazem pull das alterações e executam com `--experimental-skills`

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

# Skill de projeto
code .qwen/skills/minha-skill/SKILL.md
```

As alterações entram em vigor na próxima vez que você iniciar o Qwen Code. Se o Qwen Code já estiver em execução, reinicie-o para carregar as atualizações.

## Remover uma Skill

Exclua o diretório da Skill:

```bash

# Pessoal
rm -rf ~/.qwen/skills/minha-skill

# Projeto
rm -rf .qwen/skills/minha-skill
git commit -m "Remove Skill não utilizada"
```

## Práticas recomendadas

### Mantenha as Skills focadas

Uma Skill deve abordar uma única capacidade:

- Focada: "preenchimento de formulários PDF", "análise de Excel", "mensagens de commit Git"
- Muito ampla: "processamento de documentos" (divida em Skills menores)

### Escreva descrições claras

Ajude o modelo a descobrir quando usar as Habilidades incluindo gatilhos específicos:

```yaml
description: Analisar planilhas do Excel, criar tabelas dinâmicas e gerar gráficos. Use ao trabalhar com arquivos do Excel, planilhas ou dados em formato .xlsx.
```

### Teste com sua equipe

- A Habilidade ativa quando esperado?
- As instruções estão claras?
- Existem exemplos faltando ou casos extremos?