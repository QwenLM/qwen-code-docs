# Internacionalização (i18n) e Idioma

O Qwen Code é desenvolvido para fluxos de trabalho multilíngues: ele oferece suporte à localização da interface (i18n/l10n) na CLI, permite escolher o idioma de saída do assistente e possibilita pacotes de idiomas personalizados para a interface.

## Visão Geral

Do ponto de vista do usuário, a “internacionalização” do Qwen Code abrange várias camadas:

| Recurso / Configuração    | O que controla                                                         | Onde é armazenado             |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| `/language ui`            | Texto da interface do terminal (menus, mensagens do sistema, prompts)  | `~/.qwen/settings.json`       |
| `/language output`        | Idioma no qual a IA responde (uma preferência de saída, não tradução da interface) | `~/.qwen/output-language.md` |
| Pacotes de idiomas personalizados da interface | Substitui/estende as traduções internas da interface             | `~/.qwen/locales/*.js`        |

## Idioma da Interface

Esta é a camada de localização da interface da CLI (i18n/l10n): controla o idioma dos menus, prompts e mensagens do sistema.

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

Aliases também são suportados:

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

Na primeira inicialização, o Qwen Code detecta a localidade do seu sistema e define o idioma da interface automaticamente.

Prioridade de detecção:

1. Variável de ambiente `QWEN_CODE_LANG`
2. Variável de ambiente `LANG`
3. Localidade do sistema via API JavaScript Intl
4. Padrão: Inglês

## Idioma de Saída do LLM

O idioma de saída do LLM controla em qual idioma o assistente de IA responde, independentemente do idioma em que você digita suas perguntas.

### Como Funciona

O idioma de saída do LLM é controlado por um arquivo de regras em `~/.qwen/output-language.md`. Este arquivo é automaticamente incluído no contexto do LLM durante a inicialização, instruindo-o a responder no idioma especificado.

### Detecção Automática

Na primeira inicialização, se nenhum arquivo `output-language.md` existir, o Qwen Code cria automaticamente um baseado na localidade do seu sistema. Por exemplo:

- Localidade do sistema `zh` cria uma regra para respostas em Chinês
- Localidade do sistema `en` cria uma regra para respostas em Inglês
- Localidade do sistema `ru` cria uma regra para respostas em Russo
- Localidade do sistema `de` cria uma regra para respostas em Alemão
- Localidade do sistema `ja` cria uma regra para respostas em Japonês
- Localidade do sistema `pt` cria uma regra para respostas em Português
- Localidade do sistema `fr` cria uma regra para respostas em Francês
- Localidade do sistema `ca` cria uma regra para respostas em Catalão

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
> Após alterar o idioma de saída, reinicie o Qwen Code para que a alteração entre em vigor.

### Localização do Arquivo

```
~/.qwen/output-language.md
```

## Configuração

### Através da Caixa de Diálogo de Configurações

1. Execute `/settings`
2. Encontre "Idioma" em Geral
3. Selecione seu idioma de interface preferido

### Através de Variável de Ambiente

```bash
export QWEN_CODE_LANG=zh
```

Isso influencia a detecção automática na primeira inicialização (se você ainda não tiver definido um idioma de interface e nenhum arquivo `output-language.md` existir).

## Pacotes de Idiomas Personalizados

Para traduções da interface, você pode criar pacotes de idiomas personalizados em `~/.qwen/locales/`:

- Exemplo: `~/.qwen/locales/es.js` para Espanhol
- Exemplo: `~/.qwen/locales/fr.js` para Francês

O diretório do usuário tem precedência sobre as traduções internas.

> [!tip]
>
> Contribuições são bem-vindas! Se você deseja melhorar as traduções internas ou adicionar novos idiomas.
> Para um exemplo concreto, veja [PR #1238: feat(i18n): adicionar suporte ao idioma Russo](https://github.com/QwenLM/qwen-code/pull/1238).

### Mantendo `zh-TW` (Chinês Tradicional para Taiwan)

`zh-TW` **não** é uma conversão automática OpenCC s2t de `zh.js` — é uma tradução manual com vocabulário de Taiwan. Ao adicionar ou atualizar chaves, siga as convenções abaixo.

A coluna "Imposto por CI?" indica se `npm run check-i18n` falhará a build em caso de violação. Linhas marcadas com **Não** são diretrizes de estilo impostas apenas por revisão — normalmente porque a forma ofensiva tem um significado legítimo não relacionado à interface (`文件` pode significar "documento", `打開` é coloquialmente aceitável em Taiwan).

| Evitar                | Usar em vez disso    | Imposto por CI? | Motivo                                                                                                                                                                           |
| --------------------- | -------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 (file)           | 檔案                 | Não             | Termo de Taiwan para arquivos do sistema de arquivos (mas `文件` pode legitimamente significar "documento")                                                                       |
| 服務器 / 服务器       | 伺服器               | Sim             | Termo de Taiwan para "server"                                                                                                                                                    |
| 菜單 / 菜单           | 選單                 | Sim             | Termo de Taiwan para "menu"                                                                                                                                                      |
| 鏈接 / 链接           | 連結                 | Sim             | Termo de Taiwan para "link" (`鏈` isolado é aceitável — ex. 區塊鏈)                                                                                                               |
| 打開                  | 開啟                 | Não             | Verbo preferido em Taiwan para "open" (interface); `打開` é coloquialmente comum                                                                                                 |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | Sim             | Formas tradicionais variantes do OpenCC s2t bruto. Nota: `曆` depende do contexto e está correto em termos de calendário (日曆, 農曆, 西曆); o CI sinaliza apenas o bigrama `曆史`, não o `曆` isolado. |

Se você não é falante de chinês tradicional e precisa iniciar um valor, **não cole a saída bruta do OpenCC `s2t`**: o perfil padrão s2t emite caracteres tradicionais variantes (por exemplo, 爲, 啓) que Taiwan não usa, e nunca reescreve vocabulário do chinês continental (服務器, 菜單). Prefira `s2twp.json` (Simplificado → Taiwan com mapeamento de frases) como ponto de partida e depois peça a um falante de Taiwan para revisar.

O script `check-i18n` (executado no CI via `npm run check-i18n`) falhará a build se alguma das substrings impostas por CI acima aparecer em um valor `zh-TW`. Veja `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` para a lista completa. Se uma tradução precisar legitimamente conter uma substring proibida pelo CI, adicione sua chave a `ZH_TW_ALLOWED_EXCEPTIONS` no mesmo arquivo com uma breve justificativa.

> [!note]
>
> A verificação usa correspondência simples de substring, que não entende limites de palavras em chinês. Um padrão de bigrama pode, portanto, gerar falsos positivos em limites de palavras compostas — por exemplo, `區塊鏈接口` (= `區塊鏈` + `接口`) contém a substring `鏈接` mesmo que nenhuma palavra esteja incorreta. Se você encontrar uma falha surpreendente de CI desse tipo, adicione a chave de tradução a `ZH_TW_ALLOWED_EXCEPTIONS` em vez de remover o padrão.

### Formato do Pacote de Idiomas

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... more translations
};
```

## Comandos Relacionados

- `/language` - Mostra as configurações atuais de idioma
- `/language ui [lang]` - Define o idioma da interface
- `/language output <language>` - Define o idioma de saída do LLM
- `/settings` - Abre a caixa de diálogo de configurações