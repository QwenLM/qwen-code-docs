# Habilidades (Skills) do Agente

> Crie, gerencie e compartilhe Skills para estender as capacidades do Qwen Code.

Este guia mostra como criar, usar e gerenciar Skills do Agente no **Qwen Code**. Skills são capacidades modulares que estendem a eficácia do modelo por meio de pastas organizadas contendo instruções (e opcionalmente scripts/recursos).

## Pré-requisitos

- Qwen Code (versão recente)
- Familiaridade básica com o Qwen Code ([Quickstart](../quickstart.md))

## O que são Skills do Agente?

As Skills do Agente empacotam expertise em capacidades detectáveis. Cada Skill consiste em um arquivo `SKILL.md` com instruções que o modelo pode carregar quando relevante, além de arquivos de suporte opcionais, como scripts e templates.

### Como as Skills são invocadas

As Skills são **invocadas pelo modelo** — o modelo decide autonomamente quando usá-las com base na sua solicitação e na descrição da Skill. Isso é diferente dos comandos de barra, que são **invocados pelo usuário** (você digita explicitamente `/comando`).

Se você quiser invocar uma Skill explicitamente, use o comando de barra `/skills`:

```bash
/skills <nome-da-skill>
```

Use o autocomplete para navegar pelas Skills e descrições disponíveis.

### Benefícios

- Estender o Qwen Code para seus fluxos de trabalho
- Compartilhar expertise com sua equipe via git
- Reduzir a necessidade de prompts repetitivos
- Combinar múltiplas Skills para tarefas complexas

## Criar uma Skill

Skills são armazenadas como diretórios contendo um arquivo `SKILL.md`.

### Skills Pessoais

Skills Pessoais estão disponíveis em todos os seus projetos. Armazene-as em `~/.qwen/skills/`:

```bash
mkdir -p ~/.qwen/skills/minha-skill
```

Use Skills Pessoais para:

- Seus fluxos de trabalho e preferências individuais
- Skills que você está desenvolvendo
- Auxiliares de produtividade pessoal

### Skills do Projeto

Skills do Projeto são compartilhadas com sua equipe. Armazene-as em `.qwen/skills/` dentro do seu projeto:

```bash
mkdir -p .qwen/skills/minha-skill
```

Use Skills do Projeto para:

- Fluxos de trabalho e convenções da equipe
- Expertise específica do projeto
- Scripts e utilitários compartilhados

Skills do Projeto podem ser versionadas no git e se tornam automaticamente disponíveis para os colegas de equipe.

## Escrever `SKILL.md`

Crie um arquivo `SKILL.md` com frontmatter YAML e conteúdo Markdown:

```yaml
---
name: nome-da-sua-skill
description: Breve descrição do que esta Skill faz e quando usá-la
priority: 10
---

# Nome da sua Skill

## Instruções
Forneça orientações claras e passo a passo para o Qwen Code.

## Exemplos
Mostre exemplos concretos de uso desta Skill.
```

### Requisitos dos campos

Atualmente, o Qwen Code valida que:

- `name` é uma string não vazia correspondente a `/^[\p{L}\p{N}_:.-]+$/u` — letras e dígitos Unicode (CJK / Cirílico / Latim acentuado são OK), além de `_`, `:`, `.`, `-`. Espaços em branco, barras, colchetes e outros caracteres estruturalmente inseguros são rejeitados no momento da análise.
- `description` é uma string não vazia
- `priority` é opcional. Quando presente, deve ser um número finito. Valores mais altos classificam primeiro na listagem `/skills` apenas — o autocomplete de comandos de barra (digitando `/`) e a visualização de comandos personalizados do `/help` permanecem em ordem alfabética, portanto uma Skill de alta prioridade nunca reordena comandos embutidos. Valores omitidos ou inválidos são tratados como não definidos, o que se comporta como `0`.

Convenções recomendadas:

- Prefira letras minúsculas ASCII com hífens para nomes compartilháveis (ex.: `tsx-helper`)
- Torne a `description` específica: inclua tanto **o que** a Skill faz quanto **quando** usá-la (palavras-chave que os usuários mencionarão naturalmente)
- Use `priority` com moderação para Skills que devem aparecer de forma confiável antes da ordem alfabética padrão em `/skills`. Prioridades negativas são permitidas e classificam abaixo de Skills não definidas.

### Opcional: restringir uma Skill a caminhos de arquivo (`paths:`)

Para Skills que só são relevantes para partes específicas de um código-fonte, adicione uma lista `paths:` de padrões glob. A Skill permanece fora da lista de Skills disponíveis do modelo até que uma chamada de ferramenta toque em um arquivo correspondente:

```yaml
---
name: tsx-helper
description: Auxiliar de componentes React TSX
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

Observações:

- Os globs são correspondidos em relação à raiz do projeto com [picomatch](https://github.com/micromatch/picomatch); arquivos fora da raiz do projeto nunca acionam a ativação.
- Uma Skill com restrição de caminho **permanece ativada pelo resto da sessão** uma vez que um arquivo correspondente é tocado. Uma nova sessão, ou um `refreshCache` acionado ao editar qualquer arquivo de Skill, redefine as ativações.
- `paths:` só restringe a **descoberta** pelo modelo, e apenas no nível da listagem do SkillTool. A menos que `user-invocable: false` esteja definido, você sempre pode invocar uma Skill com restrição de caminho manualmente via `/<nome-da-skill>` ou pelo seletor `/skills` — esse caminho de usuário executa o corpo da Skill independentemente do estado de ativação. No lado do modelo, no entanto, a restrição permanece até que um arquivo correspondente seja tocado: uma invocação por barra **não** desbloqueia a ativação do lado do modelo. Portanto, se você quiser que o modelo encadeie a partir de sua invocação (chame `Skill { skill: ... }` por conta própria), também acesse um arquivo correspondente aos `paths:` da Skill primeiro.
- Combinar `paths:` com `disable-model-invocation: true` é permitido, mas a restrição não tem efeito — a Skill fica oculta do modelo de qualquer forma, portanto a ativação por caminho nunca a anuncia.

### Opcional: controlar invocação pelo usuário e pelo modelo

As Skills são invocáveis pelo usuário por padrão. Para ocultar uma Skill do uso direto por comando de barra, mantendo-a disponível para invocação pelo modelo, defina `user-invocable: false`:

```yaml
---
name: helper-so-modelo
description: Auxiliar que o modelo pode chamar quando apropriado
user-invocable: false
---
```

Isso remove a Skill da invocação `/<nome-da-skill>` e dos resultados do seletor `/skills`. Isso não oculta a Skill do modelo.

Para ocultar uma Skill da invocação pelo modelo, mantendo a invocação direta pelo usuário disponível, defina `disable-model-invocation: true`:

```yaml
---
name: helper-manual
description: Auxiliar que você invoca manualmente
disable-model-invocation: true
---
```

Você pode combinar ambos os campos, mas nesse caso a Skill não será acessível pelos caminhos normais de invocação do usuário ou do modelo.

## Adicionar arquivos de suporte

Crie arquivos adicionais junto com `SKILL.md`:

```text
minha-skill/
├── SKILL.md (obrigatório)
├── reference.md (documentação opcional)
├── examples.md (exemplos opcionais)
├── scripts/
│   └── helper.py (utilitário opcional)
└── templates/
    └── template.txt (template opcional)
```

Referencie esses arquivos a partir de `SKILL.md`:

````markdown
Para uso avançado, veja [reference.md](reference.md).

Execute o script auxiliar:

```bash
python scripts/helper.py input.txt
```
````

## Visualizar Skills disponíveis

O Qwen Code descobre Skills a partir de:

- Skills Pessoais: `~/.qwen/skills/`
- Skills do Projeto: `.qwen/skills/`
- Skills de Extensões: Skills fornecidas por extensões instaladas

### Skills de Extensões

Extensões podem fornecer skills personalizadas que se tornam disponíveis quando a extensão é ativada. Essas skills são armazenadas no diretório `skills/` da extensão e seguem o mesmo formato das skills pessoais e do projeto.

As skills de extensão são descobertas e carregadas automaticamente quando a extensão está instalada e ativada.

Para ver quais extensões fornecem skills, verifique o arquivo `qwen-extension.json` da extensão em busca de um campo `skills`.

Para visualizar as Skills disponíveis, pergunte diretamente ao Qwen Code:

```text
Quais Skills estão disponíveis?
```

> **Atenção — visão do modelo vs. visão do usuário.** Perguntar ao modelo só exibe as Skills que o modelo pode ver no momento. Se uma Skill usa `paths:` (veja "Opcional: restringir uma Skill a caminhos de arquivo" acima), ela fica fora dessa listagem até que um arquivo correspondente seja tocado. O comando de barra `/skills` mostra Skills que você pode invocar diretamente; Skills com `user-invocable: false` permanecem visíveis no disco e ainda podem estar visíveis para o modelo.

Ou navegue pela lista de Skills invocáveis pelo usuário com o comando de barra (incluindo Skills com restrição de caminho que ainda não foram ativadas):

```text
/skills
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

Se o Qwen Code não usar sua Skill, verifique estes problemas comuns:

### Torne a descrição específica

Muito vaga:

```yaml
description: Ajuda com documentos
```

Específica:

```yaml
description: Extrair texto e tabelas de arquivos PDF, preencher formulários, mesclar documentos. Use ao trabalhar com PDFs, formulários ou extração de documentos.
```

### Verifique o caminho do arquivo

- Skills Pessoais: `~/.qwen/skills/<nome-da-skill>/SKILL.md`
- Skills do Projeto: `.qwen/skills/<nome-da-skill>/SKILL.md`

```bash
# Pessoal
ls ~/.qwen/skills/minha-skill/SKILL.md

# Projeto
ls .qwen/skills/minha-skill/SKILL.md
```

### Verifique a sintaxe YAML

YAML inválido impede que os metadados da Skill sejam carregados corretamente.

```bash
cat SKILL.md | head -n 15
```

Garanta:

- `---` de abertura na linha 1
- `---` de fechamento antes do conteúdo Markdown
- Sintaxe YAML válida (sem tabulações, indentação correta)

### Visualizar erros

Execute o Qwen Code com modo de depuração para ver erros de carregamento de Skill:

```bash
qwen --debug
```

## Compartilhar Skills com sua equipe

Você pode compartilhar Skills por meio de repositórios de projeto:

1. Adicione a Skill em `.qwen/skills/`
2. Faça commit e push
3. Os colegas puxam as alterações

```bash
git add .qwen/skills/
git commit -m "Adicionar Skill da equipe para processamento de PDF"
git push
```

## Atualizar uma Skill

Edite `SKILL.md` diretamente:

```bash
# Skill Pessoal
code ~/.qwen/skills/minha-skill/SKILL.md

# Skill do Projeto
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
git commit -m "Remover Skill não utilizada"
```

## Melhores práticas

### Mantenha as Skills focadas

Uma Skill deve abordar uma capacidade:

- Focado: "Preenchimento de formulário PDF", "Análise de Excel", "Mensagens de commit Git"
- Muito amplo: "Processamento de documentos" (divida em Skills menores)

### Escreva descrições claras

Ajude o modelo a descobrir quando usar as Skills incluindo gatilhos específicos:

```yaml
description: Analisar planilhas do Excel, criar tabelas dinâmicas e gerar gráficos. Use ao trabalhar com arquivos Excel, planilhas ou dados .xlsx.
```

### Teste com sua equipe

- A Skill ativa quando esperado?
- As instruções são claras?
- Faltam exemplos ou casos extremos?