# Otimização de espaçamento da TUI PR2 — Faixas de meia linha e espaçamento compacto

## Contexto

O PR1 reduziu inicialmente o espaçamento vertical da TUI ao remover linhas em branco extras dentro dos grupos de ferramentas. No entanto, na prática, ainda existem dois problemas de experiência:

1. **Falta de separação visual entre as mensagens do usuário e as respostas do assistente** — Em conversas longas, é difícil localizar rapidamente "onde minha pergunta começa"
2. **O espaçamento entre blocos ainda é muito grande** — Há uma linha inteira em branco nas alternâncias entre perguntas e respostas, desperdiçando espaço na tela

## Alterações neste PR

### 1. Faixas de meia linha nas mensagens do usuário

Adiciona uma linha clara de meia altura acima e abaixo das mensagens do usuário, e define o `backgroundColor` da área de conteúdo com a mesma cor, formando uma faixa de três camadas sem emendas:

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄   ← foreground = bandColor (coloração da metade inferior)
> Conteúdo da pergunta do usuário <- backgroundColor = bandColor (fundo da linha inteira)
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   ← foreground = bandColor (coloração da metade superior)
```

- A cor é calculada via `subtleBandColor()`: aplica um deslocamento de 6% no brilho puro em relação à cor de fundo (terminais escuros → um pouco mais claro, terminais claros → um pouco mais escuro), sem alterar o matiz
- Terminais que não suportam 24 bits de cor / leitores de tela / ambientes NO_COLOR fazem fallback automaticamente para a exibição normal (`marginTop=1`)
- Proteção de segurança para larguras negativas ou zero

### 2. Redução do espaçamento entre perguntas e respostas

| Posição | Antes da alteração | Depois da alteração |
| --------------------- | -------------- | ----------------------------------------------- |
| Acima da mensagem do usuário | 1 linha em branco | 0 (a faixa fornece a separação visual; mantém `marginTop=1` no fallback) |
| Acima da saída do modelo | 1 linha em branco | 1 linha em branco (mantida para distinguir o processo de pensamento da saída final) |
| Acima da chamada de ferramenta/mensagem de status | 1 linha em branco | 0 |
| No final do texto de pensamento | Pode haver quebras de linha extras | `trimEnd()` para evitar linhas duplas em branco |

A sequência "resposta → chamada de ferramenta → resposta" dentro da mesma rodada de conversa não tem mais linhas em branco extras, tornando a informação mais compacta e coerente.

## Comparação de resultados

**Antes da alteração:**

```
(1 linha em branco)
> Leia o package.json para mim
(1 linha em branco)
✦ Certo, vou ler o arquivo.
(1 linha em branco)
┌ Read package.json ─────────┐
│ ✓ Read  package.json       │
└────────────────────────────┘
(1 linha em branco)
✦ O conteúdo do arquivo é o seguinte:...

(1 linha em branco)
┌─ Caixa de entrada ──────────────────┐
```

**Depois da alteração:**

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
> Leia o package.json para mim
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
✦ Certo, vou ler o arquivo.
┌ Read package.json ─────────┐
│ ✓ Read  package.json       │
└────────────────────────────┘
(1 linha em branco)
✦ O conteúdo do arquivo é o seguinte:...

(1 linha em branco)
┌─ Caixa de entrada ──────────────────┐
```

## O que não foi alterado

- O estilo da borda da chamada de ferramenta permanece inalterado
- O espaçamento entre parágrafos do corpo do Markdown permanece inalterado (1 linha já é a menor unidade no terminal)
- Os valores de cor dos temas escuro e claro permanecem inalterados
- O espaçamento da área de entrada (Composer) mantém `marginTop=1` inalterado