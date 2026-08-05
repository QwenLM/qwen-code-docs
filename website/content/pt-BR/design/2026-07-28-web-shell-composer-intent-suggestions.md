# Sugestões de Intenção no Composer do Web Shell

## Resumo

Estender a sugestão existente de novo tópico do Web Shell para que uma
classificação conservadora possa recomendar fazer uma pergunta lateral com
`/btw` ou enviar um novo tópico substancial em uma sessão nova.

O composer continua mostrando no máximo uma ação não bloqueante. Uma decisão
`none` válida não renderiza nada. Classificações inválidas, falhas ou
canceladas também não renderizam nada.

## Contrato de decisão

```ts
type SuggestionKind = 'btw' | 'new_session' | 'none';

interface SuggestionDecision {
  suggestion: SuggestionKind;
  confidence: number;
}
```

Apenas decisões `btw` e `new_session` no ou acima do threshold de confiança
existente se tornam acionáveis. O estado acionável registra exatamente o
rascunho classificado e a sessão de origem para que ambos possam ser
verificados novamente quando o usuário clicar.

## Comportamento

- `btw` é para uma pergunta lateral rápida e autocontida que não deve
  perturbar a tarefa principal.
- `new_session` é para uma tarefa ou tópico claramente diferente e
  substancial.
- `none` cobre continuações, incerteza e rascunhos que não se encaixam em
  nenhuma das ações.
- A classificação de BTW começa após uma troca prévia de usuário/assistente.
  Sugestões de nova sessão mantêm seus thresholds de contexto existentes mais
  estritos.
- Frases com aparência de acompanhamento podem ser classificadas para BTW,
  mas nunca podem usar o threshold relaxado de BTW para sugerir uma ação de
  nova sessão.
- Clicar em uma sugestão `btw` envia `/btw <draft>` pelo caminho existente do
  editor, o que preserva o histórico atual do comando e a semântica de limpar
  o composer.
- Um rascunho com imagem ou tag de composer nunca é elegível para `btw`.
- `new_session` retém a sequência existente de limpar, destacar, criar e
  autoenviar, incluindo preservação de imagem e cancelamento de corrida de
  sessão.

## Segurança

O classificador permanece conservador e fail closed:

- saída malformada, ações desconhecidas, confiança inválida, erros e
  cancelamento não produzem ação;
- uma mudança de sessão aborta a classificação pendente e invalida uma
  sugestão visível;
- uma mudança de rascunho ou anexo invalida uma sugestão visível;
- o tratamento de clique verifica o rascunho atual, a sessão de origem e o
  estado de anexo imediatamente antes de executar;
- anexos são tratados como presentes até que o ChatEditor reporte o contrário,
  então um estado transitório desconhecido não pode expor uma ação `/btw`.

## Escopo

A mudança permanece dentro do Web Shell. Ela reutiliza geração de sessão do
daemon, envio do editor e comportamento de `/btw` existentes. Não adiciona
rotas de daemon ou SDK, não muda estilo e não introduz um framework de
sugestões de propósito geral.

## Desempenho do composer

Mudanças de rascunho entram no classificador por meio de um callback estável.
Elas atualizam os refs do classificador, o estado de cancelamento e o timer
de debounce sem atualizar estado do React. O app do Web Shell só re-renderiza
quando uma sugestão acionável aparece ou uma sugestão existente é invalidada.

Isso mantém a classificação de intenção fora do caminho de renderização do
composer enquanto preserva cancelamento imediato quando o rascunho muda.

## Estratégia de testes

- Testes do hook cobrem os três valores de decisão, parsing estrito,
  confiança, gating por anexo e resultados de sessão obsoleta.
- Testes do app cobrem execução de `/btw` e limpeza do composer, rejeição de
  rascunho/sessão obsoletos, rejeição de anexo, as corridas existentes de
  nova sessão e a ausência de re-render do app enquanto a classificação está
  pendente.
- Testes do ChatEditor cobrem o reporte de presença de anexo.
