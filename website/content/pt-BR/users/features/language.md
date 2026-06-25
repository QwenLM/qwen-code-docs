# Internacionalização (i18n) & Idiomas

O Qwen Code foi construído para fluxos de trabalho multilíngues: oferece suporte à localização da interface do usuário (i18n/l10n) no CLI, permite escolher o idioma de saída do assistente e permite pacotes de idioma personalizados para a interface.

## Visão Geral

Do ponto de vista do usuário, a “internacionalização” do Qwen Code abrange várias camadas:

| Capacidade/Configuração | O que controla                                                            | Onde é armazenado               |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| `/language ui`          | Texto da interface do terminal (menus, mensagens do sistema, avisos)      | `~/.qwen/settings.json`         |
| `/language output`      | Idioma em que a IA responde (preferência de saída, não tradução da UI)    | `~/.qwen/output-language.md`    |
| Pacotes de idioma personalizados | Sobrescreve/estende as traduções internas da interface                  | `~/.qwen/locales/*.js`          |

## Idioma da Interface

Esta é a camada de localização (i18n/l10n) do CLI: controla o idioma de menus, avisos e mensagens do sistema.

### Definindo o Idioma da Interface

Use o comando `/language ui`:

```bash
/language ui zh-CN    # Chinês
/language ui en-US    # Inglês
/language ui ru-RU    # Russo
/language ui de-DE    # Alemão
/language ui ja-JP    # Japonês
/language ui pt-BR    # Português (Brasil)
/language ui fr-FR    # Francês
/language ui ca-ES    # Catalão
```

Também são aceitos aliases:

```bash
/language ui zh       # Chinês
/language ui en       # Inglês
/language ui ru       # Russo
/language ui de       # Alemão
/language ui ja       # Japonês
/language ui pt       # Português
/language ui fr       # Francês
/language ui ca       # Catalão
```

### Detecção Automática

Na primeira inicialização, o Qwen Code detecta a localidade do sistema e define o idioma da interface automaticamente.

Prioridade de detecção:

1. Variável de ambiente `QWEN_CODE_LANG`
2. Variável de ambiente `LANG`
3. Localidade do sistema via API JavaScript Intl
4. Padrão: Inglês

## Idioma de Saída do LLM

O idioma de saída do LLM controla em qual idioma o assistente de IA responde, independentemente do idioma em que você digita suas perguntas.

### Como Funciona

O idioma de saída do LLM é controlado por um arquivo de regra em `~/.qwen/output-language.md`. Este arquivo é incluído automaticamente no contexto do LLM durante a inicialização, instruindo-o a responder no idioma especificado.

### Detecção Automática

Na primeira inicialização, se nenhum arquivo `output-language.md` existir, o Qwen Code cria automaticamente um com base na localidade do sistema. Por exemplo:

- Localidade `zh` cria uma regra para respostas em Chinês
- Localidade `en` cria uma regra para respostas em Inglês
- Localidade `ru` cria uma regra para respostas em Russo
- Localidade `de` cria uma regra para respostas em Alemão
- Localidade `ja` cria uma regra para respostas em Japonês
- Localidade `pt` cria uma regra para respostas em Português
- Localidade `fr` cria uma regra para respostas em Francês
- Localidade `ca` cria uma regra para respostas em Catalão

### Configuração Manual

Use `/language output <language>` para alterar:

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Qualquer nome de idioma funciona. O LLM será instruído a responder nesse idioma.

> [!note]
>
> Após alterar o idioma de saída, reinicie o Qwen Code para que a mudança tenha efeito.

### Localização do Arquivo

```
~/.qwen/output-language.md
```

## Configuração

### Via Diálogo de Configurações

1. Execute `/settings`
2. Encontre "Idioma" em Geral
3. Selecione o idioma de interface desejado

### Via Variável de Ambiente

```bash
export QWEN_CODE_LANG=zh
```

Isso influencia a detecção automática na primeira inicialização (se você ainda não definiu um idioma de interface e ainda não existe um arquivo `output-language.md`).

## Pacotes de Idioma Personalizados

Para traduções da interface, você pode criar pacotes de idioma personalizados em `~/.qwen/locales/`:

- Exemplo: `~/.qwen/locales/es.js` para Espanhol
- Exemplo: `~/.qwen/locales/fr.js` para Francês

O diretório do usuário tem precedência sobre as traduções internas.

> [!tip]
>
> Contribuições são bem-vindas! Se você quiser melhorar as traduções internas ou adicionar novos idiomas.
> Para um exemplo concreto, veja o [PR #1238: feat(i18n): adicionar suporte ao idioma Russo](https://github.com/QwenLM/qwen-code/pull/1238).

### Manutenção do `zh-TW` (Chinês Tradicional para Taiwan)

`zh-TW` **não** é uma conversão automática OpenCC s2t do `zh.js` — é uma tradução mantida manualmente com vocabulário de Taiwan. Ao adicionar ou atualizar chaves, siga as convenções abaixo.

A coluna "Aplicado na CI?" indica se o comando `npm run check-i18n` irá reprovar a construção em caso de violação. Linhas marcadas como **Não** são diretrizes de estilo aplicadas apenas por revisão — normalmente porque a forma ofensiva tem um significado legítimo não relacionado à interface (`文件` pode significar "documento", `打開` é coloquialmente aceitável em Taiwan).

| Evitar               | Usar em vez disso    | Aplicado na CI? | Motivo                                                                                                                                                                           |
| --------------------- | --------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 (arquivo)        | 檔案                  | Não             | Termo de Taiwan para arquivos do sistema de arquivos (mas `文件` pode legitimamente significar "documento")                                                                      |
| 服務器 / 服务器       | 伺服器                | Sim             | Termo de Taiwan para "servidor"                                                                                                                                                  |
| 菜單 / 菜单           | 選單                  | Sim             | Termo de Taiwan para "menu"                                                                                                                                                      |
| 鏈接 / 链接           | 連結                  | Sim             | Termo de Taiwan para "link" (`鏈` isolado é aceitável — ex. 區塊鏈)                                                                                                                |
| 打開                  | 開啟                  | Não             | Verbo preferido em Taiwan para "abrir" (UI); `打開` é coloquialmente comum                                                                                                       |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | Sim             | Formas variantes tradicionais vindas do OpenCC s2t puro. Nota: `曆` depende do contexto e está correto em termos de calendário (日曆, 農曆, 西曆); a CI sinaliza apenas o bigrama `曆史`, não `曆` isolado. |
Se você não é um falante de Chinês Tradicional e precisa iniciar um valor, **não cole a saída bruta do OpenCC `s2t`**: o perfil padrão `s2t` emite caracteres variantes Tradicionais (ex.: 爲, 啓) que Taiwan não usa, e nunca reescreve vocabulário da China continental (服務器, 菜單). Prefira usar `s2twp.json` (Simplificado → Taiwan com mapeamento de frases) como ponto de partida e depois peça a um falante de Chinês de Taiwan para revisar.

O script `check-i18n` (executado em CI via `npm run check-i18n`) falhará a build se alguma das substrings impostas pelo CI acima aparecer em um valor `zh-TW`. Consulte `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` para a lista completa. Se uma tradução precisar legitimamente conter uma substring proibida pelo CI, adicione sua chave a `ZH_TW_ALLOWED_EXCEPTIONS` no mesmo arquivo com uma breve justificativa.

> [!note]
>
> A verificação usa correspondência simples de substring, que não entende limites de palavras em chinês. Um padrão de bigrama pode, portanto, gerar um falso positivo através de limites de palavras compostas — por exemplo, `區塊鏈接口` (= `區塊鏈` + `接口`) contém a substring `鏈接` mesmo que nenhuma palavra esteja incorreta. Se você encontrar uma falha inesperada do CI desse tipo, adicione a chave de tradução a `ZH_TW_ALLOWED_EXCEPTIONS` em vez de remover o padrão.

### Formato do Pacote de Idioma

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... more translations
};
```

## Comandos Relacionados

- `/language` - Exibir as configurações de idioma atuais
- `/language ui [lang]` - Definir o idioma da interface
- `/language output <language>` - Definir o idioma de saída do LLM
- `/settings` - Abrir a caixa de diálogo de configurações
