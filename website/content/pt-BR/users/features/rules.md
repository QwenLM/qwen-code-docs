# Rules

Uma rule é um arquivo Markdown que chega ao modelo no início de uma sessão ou no momento em que o trabalho toca em um arquivo ao qual ela se aplica. Rules ficam em `.qwen/rules/`, e o campo `paths:` é o que torna o segundo tipo possível: orientações sobre seus componentes React não precisam estar no prompt enquanto você edita um Makefile.

Elas são a contraparte econômica de um context file (`QWEN.md`), que é carregado em **todas** as requisições de cada sessão — veja [Resident Context Cost](./context-cost.md).

## Onde as rules ficam

| Localização                                 | Carregado                                    |
| ------------------------------------------- | -------------------------------------------- |
| `~/.qwen/rules/` (ou `$QWEN_HOME/rules/`)   | sempre                                       |
| `<project>/.qwen/rules/`                    | quando o workspace é confiável               |
| `rules/` de uma extensão ativa              | sempre, apenas rules condicionais — veja abaixo |

Cada arquivo `.md` nesses diretórios é descoberto, inclusive em subdiretórios, em uma ordem determinística.

## Rules baseline e condicionais

```markdown
---
description: How we write React components
paths:
  - 'src/**/*.tsx'
  - 'src/**/*.jsx'
---

Components are function components. Co-locate the test beside the component.
Never reach for a global store for state one screen owns.
```

- **Com `paths:`** — uma rule _condicional_. Ela não entra no prompt até que uma chamada de ferramenta leia ou edite um arquivo que corresponda a um de seus globs, e então é injetada uma vez pelo restante da sessão.
- **Sem `paths:`** — uma rule _baseline_. Faz parte do system prompt desde a primeira requisição, exatamente como um context file, e custa o mesmo a cada turno.

Ambos os campos são opcionais, e uma rule sem frontmatter algum é uma rule baseline.

Detalhes importantes:

- Globs são comparados com o caminho **relativo à raiz do projeto**, com barras inclinadas em todas as plataformas, e incluem dotfiles.
- Symlinks são resolvidos, então uma rule funciona tanto se a chamada de ferramenta usou o link quanto o caminho real.
- Uma rule condicional é injetada **uma vez por sessão** — o segundo arquivo correspondente não a repete.
- Comentários HTML são removidos do corpo de uma rule antes de ela ser enviada.

## Rules de extensões

Uma extensão pode incluir um diretório `rules/`, e **suas rules devem ser condicionais**: uma rule sem `paths:` é ignorada, com um aviso na inicialização que a nomeia. Essa restrição é todo o ponto. O context file de uma extensão (`contextFileName`) é concatenado em cada requisição de cada sessão em que a extensão está ativa, sem filtragem por relevância — em uma sessão medida, os context files de nove extensões totalizaram 9.989 tokens, 65% de todo o contexto always-on carregado naquela sessão. Uma rule baseline de extensão recriaria exatamente isso, um mecanismo a mais.

As rules de extensão são rotuladas pelo seu dono no prompt — `charts:rules/charting.md`, e não um caminho que sai do projeto — para que uma transcrição mostre de quem é a rule disparada.

Elas não dependem de confiança de workspace, ao contrário das rules de projeto: instalar uma extensão já é um ato explícito, e a mesma extensão pode contribuir com MCP servers, comandos, skills e um context file sem gate. Exigir confiança para o único mecanismo que é mais restrito e mais barato que um context file só empurraria os autores de volta para a opção cara.

**Se você desenvolve uma extensão**, esta é a migração a fazer:

| Conteúdo                                                                          | Coloque em                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------ |
| Fatos sempre verdadeiros — a identidade da extensão, seu vocabulário, uma restrição rígida | o context file                                   |
| "Ao trabalhar em X, faça Y"                                                       | uma rule com gate de `paths:`, ou um [skill](./skills.md) |
| Um procedimento que o modelo executa sob demanda                                  | um [skill](./skills.md)                            |

## Rules, skills e context files

|                             | No prompt desde o início | Carregado sob demanda              |
| --------------------------- | ------------------------ | ---------------------------------- |
| Context file (`QWEN.md`)    | sempre, por inteiro      | —                                  |
| Rule baseline               | sempre, por inteiro      | —                                  |
| Rule condicional (`paths:`) | nada                     | quando um arquivo correspondente é tocado |
| Skill                       | apenas nome + descrição  | corpo, quando o modelo o invoca    |

Um skill é o lugar certo para um procedimento que o modelo escolhe seguir; uma rule condicional é o lugar certo para uma restrição que se aplica a uma região do codebase, independentemente de o modelo ter pensado em procurá-la. Skills também podem ter [gate por `paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths), o que mantém até sua entrada de listagem fora do prompt até que seja relevante.

## Veja também

- [Resident Context Cost](./context-cost.md) — como medir o custo do seu prefixo e as outras alavancas.
- [Skills](./skills.md)
- [Memory](./memory.md)
