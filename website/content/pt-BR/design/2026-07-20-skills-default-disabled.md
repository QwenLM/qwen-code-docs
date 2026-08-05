# Skills desabilitadas por padrão com override

## Problema

`skills.disabled` é uma união case-insensitive entre os escopos de
configuração. Isso a torna uma denylist rígida: um projeto não pode habilitar
uma skill desabilitada pelas configurações de usuário ou de sistema. Isso é
correto para política, mas não consegue representar uma skill que deve começar
desligada e permanecer disponível para opt-in do projeto.

## Configurações

Adicionar duas listas de união case-insensitive mantendo `skills.disabled`
inalterada:

| Configuração             | Significado                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `skills.disabled`        | Desabilitação rígida. Sempre vence e preserva os locks existentes.      |
| `skills.defaultDisabled` | Desabilitada a menos que explicitamente habilitada.                     |
| `skills.enabled`         | Opt-in explícito; não pode sobrescrever `skills.disabled`.              |

As desabilitações efetivas são `disabled + (defaultDisabled - enabled)`. Uma
lista `enabled` explícita é usada em vez de semântica de substituição para que
habilitar um padrão herdado não substitua padrões não relacionados.

## Runtime e persistência

Um único resolver local ao CLI calcula os nomes efetivamente desabilitados e se
cada skill desabilitada é `hard` ou `default`. Consumidores existentes do
runtime continuam lendo o conjunto efetivo por meio de
`Config.getDisabledSkillNames()`; as APIs de descoberta e execução de skills do
core não mudam.

O seletor `/skills` e o toggle do daemon aplicam as mesmas regras:

- habilitar remove uma desabilitação rígida de workspace e adiciona o nome
  canônico ao `skills.enabled` do workspace apenas quando necessário;
- desabilitar remove o opt-in do workspace e adiciona o nome canônico ao
  `skills.disabled` do workspace;
- entradas de `skills.disabled` de escopo mais alto permanecem travadas;
- entradas de skills não relacionadas e indisponíveis são preservadas.

O status de skill do workspace adiciona um motivo de desabilitação e um escopo
de lock opcional para que clientes possam distinguir um lock rígido de um
padrão sobrescrevível. Os caminhos de status local ao daemon e do ACP ambos
leem o mesmo resolver local ao CLI.

## Escopo

- Nenhuma skill é adicionada a `defaultDisabled` por esta mudança.
- `disable-model-invocation` e operações ACP de skills gerenciadas permanecem
  inalteradas.
- A configuração existente de `skills.disabled` permanece compatível.
- As mudanças são limitadas às configurações, às duas superfícies de toggle
  existentes, ao status de skill do workspace, seus tipos de wire, documentação
  e testes focados.
