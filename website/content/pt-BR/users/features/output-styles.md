# Estilos de saída

Os estilos de saída alteram a forma como o Qwen Code escreve suas respostas — o tom, a quantidade de narração, o quanto ele explica — sem mudar o que ele pode fazer. Um estilo é um bloco nomeado de instruções sobreposto ao prompt de sistema integrado, e o modelo é lembrado do estilo ativo a cada turno para mantê-lo consistente ao longo de sessões longas.

## Estilos integrados

| Estilo            | O que faz                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **default**       | Nenhum estilo extra — o prompt padrão.                                                                                                                                                        |
| **Concise**       | Respostas diretas, sem preâmbulo, narração ou recapitulação final. O trabalho continua tão completo quanto sempre; relatórios de erro e confirmações de segurança mantêm todo o seu conteúdo. |
| **Proactive**     | Inicia o trabalho imediatamente e prefere uma suposição declarada em vez de uma pergunta para decisões de baixo risco. Não altera o que é permitido: o modo de aprovação e as regras de confirmação continuam valendo integralmente. |
| **Explanatory**   | Adiciona notas curtas de "Insight" educacionais sobre a base de código e as escolhas de implementação junto com o trabalho.                                                                   |
| **Learning**      | Aprendizado colaborativo na prática: entrega pequenas partes significativas de código para você escrever (marcadas com `TODO(human)`) e então espera. Ignorado em execuções headless, que não podem esperar por você. |

## Escolhendo um estilo

Execute `/output-style` para abrir um seletor ou defina um diretamente:

```
/output-style Concise
/output-style default   # volta para nenhum estilo
```

A alteração se aplica à sessão em execução imediatamente — o prompt de sistema é reconstruído no lugar, então o próximo turno já responde no novo estilo — e é persistido para sessões futuras. Se uma configuração confiável do projeto atualmente controla `general.outputStyle`, o comando atualiza essa configuração do projeto; caso contrário, atualiza sua configuração de usuário. Os nomes de estilo não diferenciam maiúsculas de minúsculas.

Você também pode definir o estilo sem o comando:

- **Configurações**: `"general": { "outputStyle": "Concise" }` em `settings.json` (escopo de usuário ou de projeto). O valor é um nome de estilo integrado ou [personalizado](#custom-styles). Uma edição manual entra em vigor na próxima inicialização.
- **Uma execução**: `qwen -p "..." --output-style Concise` sobrescreve a configuração para aquela execução. Consulte [Headless Mode](./headless).

## Estilos personalizados

Um estilo personalizado é um arquivo Markdown cujo corpo contém as instruções do estilo. Coloque-o em um dos dois diretórios:

| Localização                            | Escopo                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| `~/.qwen/output-styles/<name>.md`      | Seus estilos, disponíveis em todo projeto                     |
| `<project>/.qwen/output-styles/*.md`   | Estilos do projeto, lidos apenas quando o workspace é confiável |

A confiança é verificada sempre que o estilo é usado, não apenas quando o arquivo é lido, então revogar a confiança no meio da sessão impede que um estilo do projeto influencie a conversa.

```markdown
---
name: Reviewer
description: Reviews code and reports findings without editing anything
keep-coding-instructions: false
---

You are reviewing, not implementing. Read the code the user points you at, list concrete findings ordered by severity, and never edit files unless the user asks for a fix.
```

O frontmatter é opcional. Cada campo tem um padrão:

- `name` — o nome do estilo, usado com `/output-style <name>` e em `general.outputStyle`. O padrão é o nome do arquivo sem `.md`. `default` é reservado.
- `description` — o resumo de uma linha exibido no seletor. O padrão é a primeira linha do corpo.
- `keep-coding-instructions` — `true` mantém a orientação integrada de fluxo de trabalho de engenharia de software no prompt junto com seu estilo; `false` remove essa seção, para um estilo cujo trabalho não é codificação. Um arquivo que não diz nada herda o valor do estilo integrado que ele substitui, então reescrever `concise.md` muda a redação sem remover essa orientação; um arquivo sem equivalente integrado usa `false` como padrão. Todo o restante do prompt integrado — identidade, regras de segurança, orientação de ferramentas — permanece em vigor sob qualquer estilo.

Os estilos personalizados aparecem no seletor `/output-style` após os integrados, rotulados com sua origem, e são relidos cada vez que o seletor é aberto ou um nome é informado, então um novo arquivo não precisa de reinicialização. Os nomes são comparados sem diferenciar maiúsculas de minúsculas e devem ser únicos: um estilo de projeto sobrescreve um estilo de usuário com o mesmo nome, e qualquer um deles sobrescreve um estilo integrado com esse nome. Um arquivo que não pode ser carregado é ignorado e reportado no log de depuração enquanto os demais arquivos continuam carregando — um corpo vazio, um nome inválido, um arquivo maior que 25 kB (um estilo é um prompt, não um documento), um que não é texto UTF-8, ou um cujo corpo inteiro é um comentário HTML. Comentários HTML são removidos do corpo, então uma nota para seus colegas não é enviada ao modelo.

Um arquivo de estilo só pode ler a si mesmo: um arquivo de projeto que é um symlink é ignorado, um arquivo de usuário pode ser um symlink para seu próprio home (uma configuração de dotfiles) mas não para fora dele, e um hard link é recusado em qualquer nível.

Estilos personalizados são ignorados em `--bare` e `--safe-mode`, que mantêm apenas os integrados.

## Escopo e interações

- Um estilo é sobreposto ao prompt integrado. Quando `--system-prompt` ou `QWEN_SYSTEM_MD` substitui o prompt inteiramente, o estilo (e seu lembrete por turno) não é aplicado.
- Os estilos se aplicam apenas à conversa principal. Subagentes executam seus próprios prompts de sistema, e um par de arena herda o estilo da sessão apenas quando esse estilo mantém as instruções de codificação — um par é julgado pelo diff que produz, então ele nunca executa sem a orientação de engenharia de software.
- `--bare` e `--safe-mode` ignoram a configuração e não permitem alterações via `/output-style`.
- Mudar o estilo no meio da sessão invalida o prefixo de prompt em cache uma vez; depois disso, o cache funciona normalmente.

Estilos ajustam tom e fluxo de trabalho, não conhecimento ou permissões. Para convenções de projeto que o modelo deve sempre conhecer, use arquivos de contexto (`QWEN.md`); para uma adição pontual ao prompt, use `--append-system-prompt`.